/*
  ============================================================
  quote-builder-doc.js — documento impresso do orçamento DMR
  ============================================================

  O QUE FAZ:
  Monta o orçamento em formato de proposta (A4) dentro de
  [data-qb-doc]: cabeçalho com logo e dados da empresa, número,
  datas, cliente, tabela de itens, totais, condições, observações
  e campos de assinatura. O CSS de impressão (quote-builder.css)
  esconde o resto da página e mostra só este documento.

  ONDE É USADO:
  window.DMRQuoteDoc.render(container, quote, config, core),
  chamado por assets/quote-builder.js no botão "Imprimir / PDF".

  OBSERVACOES:
  Tudo por textContent (sem innerHTML com dados digitados).
*/
(function () {
  'use strict';

  function el(tag, className, text, children) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== '') node.textContent = text;
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }

  function row(label, value) {
    if (!value) return null;
    return el('p', 'qb-doc__line', null, [el('span', 'qb-doc__label', label + ': '), document.createTextNode(value)]);
  }

  function header(quote, config, core) {
    var c = config.company || {};
    var logo = null;
    if (c.logo) {
      logo = document.createElement('img');
      logo.className = 'qb-doc__logo';
      logo.src = c.logo;
      logo.alt = c.name || 'Logo';
    }
    var contact = [c.phone, c.email, (c.site || '').replace(/^https?:\/\//, '')].filter(Boolean).join(' · ');
    var company = el('div', 'qb-doc__company', null, [
      el('strong', null, c.name || ''),
      c.doc ? el('span', null, 'CNPJ ' + c.doc) : null,
      c.address ? el('span', null, c.address) : null,
      contact ? el('span', null, contact) : null
    ]);
    var meta = el('div', 'qb-doc__meta', null, [
      el('span', 'qb-doc__kicker', 'Orçamento'),
      el('strong', 'qb-doc__number', quote.number),
      el('span', null, 'Emissão: ' + core.formatDate(quote.createdAt)),
      el('span', null, 'Válido até: ' + core.formatDate(core.addDays(quote.createdAt, quote.validDays)))
    ]);
    return el('header', 'qb-doc__header', null, [el('div', 'qb-doc__brand', null, [logo, company]), meta]);
  }

  function clientBlock(quote) {
    var cl = quote.client || {};
    return el('section', 'qb-doc__block', null, [
      el('h2', 'qb-doc__h2', 'Cliente'),
      el('p', 'qb-doc__client', cl.name || '—'),
      row('CPF/CNPJ', cl.doc),
      row('WhatsApp', cl.phone),
      row('E-mail', cl.email),
      row('Endereço', cl.address)
    ]);
  }

  function itemsTable(quote, core) {
    var head = el('thead', null, null, [el('tr', null, null, [
      el('th', null, '#'), el('th', null, 'Descrição'), el('th', 'qb-doc__num', 'Qtd.'),
      el('th', 'qb-doc__num', 'Unitário'), el('th', 'qb-doc__num', 'Total')
    ])]);
    var body = el('tbody');
    (quote.items || []).forEach(function (item, index) {
      var desc = el('td', null, null, [
        el('span', 'qb-doc__item', item.title || 'Item'),
        item.type === 'service' ? el('span', 'qb-doc__tag', 'Serviço') : null,
        item.sku ? el('span', 'qb-doc__sku', 'SKU ' + item.sku) : null
      ]);
      body.appendChild(el('tr', null, null, [
        el('td', 'qb-doc__idx', String(index + 1)),
        desc,
        el('td', 'qb-doc__num', String(item.qty)),
        el('td', 'qb-doc__num', core.formatMoney(item.unitCents)),
        el('td', 'qb-doc__num', core.formatMoney(core.lineTotal(item)))
      ]));
    });
    return el('table', 'qb-doc__table', null, [head, body]);
  }

  function totalsBlock(quote, core) {
    var t = core.computeTotals(quote);
    function line(label, value, cls) { return el('div', cls || null, null, [el('dt', null, label), el('dd', null, value)]); }
    return el('dl', 'qb-doc__totals', null, [
      line('Subtotal', core.formatMoney(t.subtotal)),
      t.discount ? line('Desconto', '- ' + core.formatMoney(t.discount)) : null,
      t.shipping ? line('Frete / deslocamento', core.formatMoney(t.shipping)) : null,
      line('Total', core.formatMoney(t.total), 'qb-doc__grand')
    ]);
  }

  function conditions(quote) {
    return el('section', 'qb-doc__block qb-doc__conditions', null, [
      el('h2', 'qb-doc__h2', 'Condições'),
      row('Pagamento', quote.payment),
      row('Prazo', quote.deadline),
      row('Responsável', quote.seller),
      quote.notes ? el('p', 'qb-doc__notes', quote.notes) : null
    ]);
  }

  function signatures(config) {
    var name = (config.company && config.company.name) || 'Empresa';
    return el('section', 'qb-doc__signs', null, [
      el('div', null, null, [el('span', 'qb-doc__sign-line'), el('span', null, name)]),
      el('div', null, null, [el('span', 'qb-doc__sign-line'), el('span', null, 'Cliente — de acordo')])
    ]);
  }

  function render(container, quote, config, core) {
    if (!container) return;
    container.textContent = '';
    container.appendChild(el('article', 'qb-doc__page', null, [
      header(quote, config, core),
      clientBlock(quote),
      itemsTable(quote, core),
      totalsBlock(quote, core),
      conditions(quote),
      signatures(config)
    ]));
  }

  window.DMRQuoteDoc = { render: render };
})();
