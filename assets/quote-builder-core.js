/*
  ============================================================
  quote-builder-core.js — regras do gerador de orçamentos DMR
  ============================================================

  O QUE FAZ:
  Funções puras (sem DOM) usadas por assets/quote-builder.js:
  dinheiro em centavos, totais com desconto e frete, número do
  orçamento, validade, link de carrinho do Shopify e texto do
  WhatsApp. Nada aqui altera o objeto recebido.

  ONDE É USADO:
  Navegador: window.DMRQuoteCore (carregado por
  sections/quote-builder.liquid antes de quote-builder.js).
  Node: module.exports (testes em tests/quote-builder-core.test.js,
  fora do tema).

  OBSERVACOES:
  Valores sempre em centavos (inteiros) para evitar erro de
  arredondamento com ponto flutuante.
*/
(function (root) {
  'use strict';

  var MAX_QTY = 9999;
  var MAX_CENTS = 99999999900; // R$ 999.999.999,00

  function clampInt(value, min, max) {
    var n = Math.round(Number(value));
    if (!isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  /* "1.234,56" | "1234.56" | 1234.56 -> 123456 (centavos) */
  function parseMoney(input) {
    if (typeof input === 'number') return clampInt(input * 100, 0, MAX_CENTS);
    var text = String(input || '').replace(/[^\d,.]/g, '');
    if (!text) return 0;
    var lastComma = text.lastIndexOf(',');
    var lastDot = text.lastIndexOf('.');
    var normalized = lastComma > lastDot
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(/,/g, '');
    var value = parseFloat(normalized);
    return isFinite(value) ? clampInt(value * 100, 0, MAX_CENTS) : 0;
  }

  var brl = typeof Intl !== 'undefined'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    : null;

  function formatMoney(cents) {
    var value = (Number(cents) || 0) / 100;
    return brl ? brl.format(value).replace(/ /g, ' ') : 'R$ ' + value.toFixed(2).replace('.', ',');
  }

  /* Centavos -> "1234,56" para preencher input */
  function moneyInputValue(cents) {
    return ((Number(cents) || 0) / 100).toFixed(2).replace('.', ',');
  }

  function normalizeItem(item) {
    return Object.assign({}, item, {
      qty: clampInt(item.qty, 1, MAX_QTY),
      unitCents: clampInt(item.unitCents, 0, MAX_CENTS)
    });
  }

  function lineTotal(item) {
    var safe = normalizeItem(item);
    return safe.qty * safe.unitCents;
  }

  /* discount.value: percentual (0-100, aceita decimais) ou centavos */
  function computeTotals(quote) {
    var items = (quote.items || []).map(normalizeItem);
    var products = 0;
    var services = 0;
    items.forEach(function (item) {
      if (item.type === 'service') services += lineTotal(item);
      else products += lineTotal(item);
    });
    var subtotal = products + services;
    var discount = quote.discount || { mode: 'percent', value: 0 };
    var discountCents = discount.mode === 'amount'
      ? clampInt(discount.value, 0, subtotal)
      : Math.round(subtotal * clampInt(Number(discount.value) * 100, 0, 10000) / 10000);
    var shippingCents = clampInt(quote.shippingCents, 0, MAX_CENTS);
    return {
      products: products,
      services: services,
      subtotal: subtotal,
      discount: discountCents,
      shipping: shippingCents,
      total: subtotal - discountCents + shippingCents,
      itemCount: items.reduce(function (sum, item) { return sum + item.qty; }, 0)
    };
  }

  function pad(n, size) {
    var s = String(n);
    while (s.length < size) s = '0' + s;
    return s;
  }

  /* DMR-AAMMDD-NNN */
  function quoteNumber(date, sequence) {
    var d = date instanceof Date ? date : new Date(date);
    var stamp = pad(d.getFullYear() % 100, 2) + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2);
    return 'DMR-' + stamp + '-' + pad(clampInt(sequence, 1, 999), 3);
  }

  function addDays(isoDate, days) {
    var d = new Date(isoDate);
    d.setDate(d.getDate() + clampInt(days, 0, 365));
    return d;
  }

  function formatDate(date) {
    var d = date instanceof Date ? date : new Date(date);
    return pad(d.getDate(), 2) + '/' + pad(d.getMonth() + 1, 2) + '/' + d.getFullYear();
  }

  /* Só itens de produto com variante entram no link /cart/ID:QTD */
  function cartPermalink(origin, rootPath, items) {
    var parts = (items || [])
      .filter(function (item) { return item.type !== 'service' && /^\d+$/.test(String(item.variantId || '')); })
      .map(function (item) { return item.variantId + ':' + clampInt(item.qty, 1, MAX_QTY); });
    if (!parts.length) return '';
    var base = String(origin || '').replace(/\/+$/, '') + '/' + String(rootPath || '/').replace(/^\/+|\/+$/g, '');
    return base.replace(/\/+$/, '') + '/cart/' + parts.join(',');
  }

  /* Telefone BR -> 55DDDNUMERO (ou '' se inválido) */
  function whatsappNumber(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10 || digits.length === 11) return '55' + digits;
    if ((digits.length === 12 || digits.length === 13) && digits.indexOf('55') === 0) return digits;
    return '';
  }

  function whatsappText(quote, company) {
    var totals = computeTotals(quote);
    var lines = [];
    var clientName = (quote.client && quote.client.name) || '';
    lines.push('*Orçamento ' + quote.number + '* — ' + ((company && company.name) || 'DMR Info'));
    if (clientName) lines.push('Cliente: ' + clientName);
    lines.push('');
    (quote.items || []).map(normalizeItem).forEach(function (item) {
      lines.push('• ' + item.qty + 'x ' + item.title + ' — ' + formatMoney(lineTotal(item)));
    });
    lines.push('');
    lines.push('Subtotal: ' + formatMoney(totals.subtotal));
    if (totals.discount) lines.push('Desconto: -' + formatMoney(totals.discount));
    if (totals.shipping) lines.push('Frete/deslocamento: ' + formatMoney(totals.shipping));
    lines.push('*Total: ' + formatMoney(totals.total) + '*');
    if (quote.payment) lines.push('Pagamento: ' + quote.payment);
    if (quote.deadline) lines.push('Prazo: ' + quote.deadline);
    lines.push('Válido até: ' + formatDate(addDays(quote.createdAt, quote.validDays)));
    return lines.join('\n');
  }

  var api = {
    parseMoney: parseMoney,
    formatMoney: formatMoney,
    moneyInputValue: moneyInputValue,
    lineTotal: lineTotal,
    computeTotals: computeTotals,
    quoteNumber: quoteNumber,
    addDays: addDays,
    formatDate: formatDate,
    cartPermalink: cartPermalink,
    whatsappNumber: whatsappNumber,
    whatsappText: whatsappText
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DMRQuoteCore = api;
})(typeof window !== 'undefined' ? window : this);
