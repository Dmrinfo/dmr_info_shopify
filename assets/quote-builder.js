/*
  ============================================================
  quote-builder.js — interface do gerador de orçamentos DMR
  ============================================================

  O QUE FAZ:
  Liga a seção sections/quote-builder.liquid: busca produtos
  (/search/suggest.json + /products/<handle>.js), monta a tabela
  de itens, recalcula totais (window.DMRQuoteCore), salva rascunho
  e orçamentos no localStorage, imprime/gera PDF, envia texto ao
  WhatsApp e copia o link de carrinho do Shopify.

  OBSERVACOES:
  - Todo texto digitado entra no DOM por textContent/value (sem
    innerHTML), para não executar HTML vindo de campos.
  - O estado nunca é mutado: cada mudança gera um objeto novo.
  - localStorage pode falhar (aba anônima, bloqueio); a ferramenta
    continua funcionando e avisa que não salvou.
*/
(function () {
  'use strict';

  var core = window.DMRQuoteCore;
  var host = document.querySelector('[data-quote-builder]');
  if (!core || !host) return;

  var STORE_KEY = 'dmr-quotes-v1';
  var DRAFT_KEY = 'dmr-quote-draft-v1';
  var SEQ_KEY = 'dmr-quote-seq-v1';
  var MAX_SAVED = 300;
  var SEARCH_DELAY = 250;
  var DRAFT_DELAY = 600;

  var rootPath = host.getAttribute('data-root') || '/';
  var config = readConfig();
  var state = readStore(DRAFT_KEY, null) || createQuote();
  var draftTimer = null;
  var statusTimer = null;

  var $ = function (selector, scope) { return (scope || host).querySelector(selector); };
  var $$ = function (selector, scope) { return Array.prototype.slice.call((scope || host).querySelectorAll(selector)); };

  /* ---------- Utilitários ---------- */
  function readConfig() {
    var fallback = { company: {}, defaults: {}, seller: '' };
    var node = document.getElementById(host.getAttribute('data-config'));
    try { return node ? JSON.parse(node.textContent) : fallback; } catch (error) { return fallback; }
  }

  function readStore(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) { return fallback; }
  }

  function writeStore(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { return false; }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (name) {
      var value = attrs[name];
      if (value === false || value == null) return;
      if (name === 'text') node.textContent = value;
      else if (name === 'value') node.value = value;
      else node.setAttribute(name, value === true ? '' : value);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(child); });
    return node;
  }

  function setStatus(message, tone) {
    var node = $('[data-qb-status]');
    node.textContent = message;
    node.setAttribute('data-tone', tone || 'ok');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { node.textContent = ''; }, 4000);
  }

  function nextSequence(date) {
    var day = core.quoteNumber(date, 1).slice(0, 10);
    var saved = readStore(SEQ_KEY, { day: '', n: 0 });
    var n = saved.day === day ? saved.n + 1 : 1;
    writeStore(SEQ_KEY, { day: day, n: n });
    return n;
  }

  function createQuote() {
    var now = new Date();
    var d = config.defaults || {};
    return {
      id: uid(),
      number: core.quoteNumber(now, nextSequence(now)),
      createdAt: now.toISOString(),
      validDays: Number(d.validDays) || 7,
      client: { name: '', doc: '', phone: '', email: '', address: '' },
      items: [],
      discount: { mode: 'percent', value: 0 },
      shippingCents: 0,
      payment: d.payment || '',
      deadline: d.deadline || '',
      notes: d.notes || '',
      seller: config.seller || ''
    };
  }

  /* ---------- Estado ---------- */
  function setState(patch, options) {
    state = Object.assign({}, state, patch);
    if (options && options.items) renderItems();
    renderTotals();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () { writeStore(DRAFT_KEY, state); }, DRAFT_DELAY);
  }

  function updateItem(key, patch, options) {
    setState({
      items: state.items.map(function (item) { return item.key === key ? Object.assign({}, item, patch) : item; })
    }, options);
  }

  function addItem(item) {
    var existing = item.variantId && state.items.filter(function (i) { return i.variantId === item.variantId; })[0];
    if (existing) {
      updateItem(existing.key, { qty: existing.qty + 1 }, { items: true });
      setStatus('Quantidade de "' + existing.title + '" aumentada.');
      return;
    }
    setState({ items: state.items.concat([Object.assign({ key: uid(), qty: 1 }, item)]) }, { items: true });
  }

  /* ---------- Render ---------- */
  function renderFields() {
    $('[data-qb-number]').textContent = state.number;
    $$('[data-qb-client]').forEach(function (input) {
      input.value = state.client[input.getAttribute('data-qb-client')] || '';
    });
    $$('[data-qb-field]').forEach(function (input) {
      var value = state[input.getAttribute('data-qb-field')];
      input.value = value == null ? '' : value;
    });
    $('[data-qb-discount-mode]').value = state.discount.mode;
    $('[data-qb-discount-value]').value = state.discount.value
      ? (state.discount.mode === 'amount' ? core.moneyInputValue(state.discount.value) : String(state.discount.value).replace('.', ','))
      : '';
    $('[data-qb-shipping]').value = state.shippingCents ? core.moneyInputValue(state.shippingCents) : '';
    renderItems();
    renderTotals();
  }

  function itemTitleCell(item) {
    var info = el('div', { class: 'qb-item__info' });
    if (item.type === 'product') {
      info.appendChild(el('a', { class: 'qb-item__title', href: rootPath.replace(/\/$/, '') + '/products/' + item.handle, target: '_blank', rel: 'noopener', text: item.title }));
      if (item.variants && item.variants.length > 1) {
        var select = el('select', { class: 'field__input qb-item__variant', 'aria-label': 'Variação de ' + item.title, 'data-qb-variant': item.key });
        item.variants.forEach(function (v) {
          var option = el('option', { value: String(v.id), text: v.title });
          if (String(v.id) === String(item.variantId)) option.selected = true;
          select.appendChild(option);
        });
        info.appendChild(select);
      }
      if (item.sku) info.appendChild(el('span', { class: 'qb-item__sku', text: 'SKU ' + item.sku }));
    } else {
      info.appendChild(el('span', { class: 'qb-item__badge', text: item.type === 'service' ? 'Serviço' : 'Avulso' }));
      info.appendChild(el('input', { class: 'field__input qb-item__title-input', value: item.title, maxlength: '160', 'aria-label': 'Descrição do item', placeholder: 'Descrição', 'data-qb-title': item.key }));
    }
    var cell = el('td', { class: 'qb-item' }, [
      item.image ? el('img', { class: 'qb-item__thumb', src: item.image, alt: '', width: '48', height: '48', loading: 'lazy' }) : el('span', { class: 'qb-item__thumb qb-item__thumb--empty', 'aria-hidden': 'true' }),
      info
    ]);
    return cell;
  }

  function renderItems() {
    var body = $('[data-qb-items]');
    body.textContent = '';
    state.items.forEach(function (item) {
      body.appendChild(el('tr', { 'data-key': item.key }, [
        itemTitleCell(item),
        el('td', { class: 'qb-table__num' }, [el('input', { class: 'field__input qb-num', type: 'number', min: '1', max: '9999', inputmode: 'numeric', value: String(item.qty), 'aria-label': 'Quantidade', 'data-qb-qty': item.key })]),
        el('td', { class: 'qb-table__num' }, [el('input', { class: 'field__input qb-num qb-num--money', inputmode: 'decimal', value: core.moneyInputValue(item.unitCents), 'aria-label': 'Valor unitário', 'data-qb-price': item.key })]),
        el('td', { class: 'qb-table__num qb-line-total', 'data-qb-line': item.key, text: core.formatMoney(core.lineTotal(item)) }),
        el('td', {}, [el('button', { type: 'button', class: 'qb-remove', 'aria-label': 'Remover ' + (item.title || 'item'), 'data-qb-remove': item.key, text: '×' })])
      ]));
    });
    $('[data-qb-empty]').hidden = state.items.length > 0;
  }

  function renderTotals() {
    var totals = core.computeTotals(state);
    Object.keys(totals).forEach(function (name) {
      var node = $('[data-qb-total="' + name + '"]');
      if (node) node.textContent = (name === 'discount' ? '- ' : '') + core.formatMoney(totals[name]);
    });
    state.items.forEach(function (item) {
      var cell = $('[data-qb-line="' + item.key + '"]');
      if (cell) cell.textContent = core.formatMoney(core.lineTotal(item));
    });
  }

  /* ---------- Busca de produtos ---------- */
  var search = { timer: null, controller: null, results: [], active: -1 };

  function closeResults() {
    var list = $('[data-qb-results]');
    list.hidden = true;
    list.textContent = '';
    $('[data-qb-search-input]').setAttribute('aria-expanded', 'false');
    search.results = [];
    search.active = -1;
  }

  function showResults(products, message) {
    var list = $('[data-qb-results]');
    list.textContent = '';
    search.results = products;
    search.active = -1;
    if (message) list.appendChild(el('li', { class: 'qb-search__message', text: message }));
    products.forEach(function (product, index) {
      list.appendChild(el('li', { role: 'option', id: 'qb-opt-' + index, class: 'qb-search__option', 'data-index': String(index) }, [
        product.image ? el('img', { src: product.image, alt: '', width: '40', height: '40', loading: 'lazy' }) : null,
        el('span', { class: 'qb-search__name', text: product.title }),
        el('span', { class: 'qb-search__price', text: core.formatMoney(core.parseMoney(product.price)) })
      ]));
    });
    list.hidden = false;
    $('[data-qb-search-input]').setAttribute('aria-expanded', 'true');
  }

  function runSearch(term) {
    if (search.controller) search.controller.abort();
    if (term.length < 2) { closeResults(); return; }
    search.controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var url = rootPath + 'search/suggest.json?q=' + encodeURIComponent(term) +
      '&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=last';
    fetch(url, { signal: search.controller ? search.controller.signal : undefined, headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        var products = (data.resources && data.resources.results && data.resources.results.products) || [];
        showResults(products, products.length ? '' : 'Nenhum produto encontrado para "' + term + '".');
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') return;
        showResults([], 'Não foi possível buscar agora. Verifique a conexão e tente de novo.');
      });
  }

  function pickResult(index) {
    var product = search.results[index];
    if (!product) return;
    closeResults();
    $('[data-qb-search-input]').value = '';
    setStatus('Carregando "' + product.title + '"…');
    fetch(rootPath + 'products/' + encodeURIComponent(product.handle) + '.js', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (full) {
        var variants = (full.variants || []).map(function (v) {
          return { id: v.id, title: v.title, priceCents: v.price, sku: v.sku || '' };
        });
        var first = variants.filter(function (v) { return v; })[0] || { id: '', priceCents: 0, sku: '' };
        var image = full.featured_image ? String(full.featured_image).replace(/^\/\//, 'https://') : '';
        addItem({
          type: 'product',
          title: full.title,
          handle: full.handle,
          image: image ? image + (image.indexOf('?') > -1 ? '&' : '?') + 'width=120' : '',
          variantId: String(first.id),
          sku: first.sku,
          unitCents: first.priceCents,
          variants: variants.length > 1 ? variants : null
        });
        setStatus('"' + full.title + '" adicionado.');
      })
      .catch(function () { setStatus('Não foi possível carregar o produto. Tente de novo.', 'error'); });
  }

  function moveActive(step) {
    var options = $$('.qb-search__option');
    if (!options.length) return;
    search.active = (search.active + step + options.length) % options.length;
    options.forEach(function (option, i) { option.setAttribute('aria-selected', i === search.active ? 'true' : 'false'); });
    $('[data-qb-search-input]').setAttribute('aria-activedescendant', options[search.active].id);
    options[search.active].scrollIntoView({ block: 'nearest' });
  }

  /* ---------- Salvos ---------- */
  function savedQuotes() { return readStore(STORE_KEY, []); }

  function renderSaved(filter) {
    var term = (filter || '').toLowerCase();
    var list = $('[data-qb-saved-list]');
    var quotes = savedQuotes();
    $('[data-qb-saved-count]').textContent = String(quotes.length);
    list.textContent = '';
    var visible = quotes.filter(function (q) {
      return !term || (q.number + ' ' + (q.client.name || '')).toLowerCase().indexOf(term) > -1;
    });
    if (!visible.length) list.appendChild(el('li', { class: 'qb-saved__empty', text: quotes.length ? 'Nada encontrado.' : 'Nenhum orçamento salvo ainda.' }));
    visible.forEach(function (q) {
      list.appendChild(el('li', { class: 'qb-saved__item' }, [
        el('button', { type: 'button', class: 'qb-saved__open', 'data-qb-open': q.id }, [
          el('strong', { text: q.client.name || 'Sem cliente' }),
          el('span', { text: q.number + ' · ' + core.formatDate(q.createdAt) + ' · ' + core.formatMoney(core.computeTotals(q).total) })
        ]),
        el('button', { type: 'button', class: 'qb-saved__delete', 'aria-label': 'Excluir ' + q.number, 'data-qb-delete': q.id, text: 'Excluir' })
      ]));
    });
  }

  function saveQuote() {
    if (!String(state.client.name || '').trim()) { setStatus('Informe o nome do cliente para salvar.', 'error'); $('[data-qb-client="name"]').focus(); return false; }
    var quotes = savedQuotes().filter(function (q) { return q.id !== state.id; });
    var next = [Object.assign({}, state, { updatedAt: new Date().toISOString() })].concat(quotes).slice(0, MAX_SAVED);
    if (!writeStore(STORE_KEY, next)) { setStatus('Não foi possível salvar neste navegador (armazenamento bloqueado ou cheio).', 'error'); return false; }
    renderSaved();
    setStatus('Orçamento ' + state.number + ' salvo.');
    return true;
  }

  function loadQuote(quote) {
    state = quote;
    writeStore(DRAFT_KEY, state);
    renderFields();
    $('[data-qb-saved]').open = false;
    setStatus('Orçamento ' + quote.number + ' aberto.');
  }

  /* ---------- Saídas: PDF, WhatsApp, link ---------- */
  function hasContent() {
    if (!state.items.length) { setStatus('Adicione pelo menos um item.', 'error'); return false; }
    return true;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var area = el('textarea', { value: text, readonly: true, class: 'visually-hidden' });
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      area.remove();
      if (ok) resolve(); else reject(new Error('copy failed'));
    });
  }

  function sendWhatsapp() {
    if (!hasContent()) return;
    var number = core.whatsappNumber(state.client.phone);
    var url = 'https://wa.me/' + number + '?text=' + encodeURIComponent(core.whatsappText(state, config.company));
    window.open(url, '_blank', 'noopener');
    if (!number) setStatus('WhatsApp do cliente vazio ou inválido: escolha o contato no WhatsApp.', 'warn');
  }

  function copyCartLink() {
    var link = core.cartPermalink(window.location.origin, rootPath, state.items);
    if (!link) { setStatus('Nenhum produto da loja no orçamento para gerar link.', 'error'); return; }
    copyText(link)
      .then(function () { setStatus('Link de compra copiado.'); })
      .catch(function () { setStatus('Não foi possível copiar. Link: ' + link, 'warn'); });
  }

  function printQuote() {
    if (!hasContent()) return;
    var doc = document.querySelector('[data-qb-doc]');
    if (!window.DMRQuoteDoc || !doc) { setStatus('Não foi possível montar o PDF. Recarregue a página.', 'error'); return; }
    // Filho direto do body: o CSS de impressão esconde todo o resto.
    if (doc.parentNode !== document.body) document.body.appendChild(doc);
    window.DMRQuoteDoc.render(doc, state, config, core);
    window.print();
  }

  /* ---------- Eventos ---------- */
  host.addEventListener('input', function (event) {
    var t = event.target;
    var key;
    if (t.hasAttribute('data-qb-client')) {
      var client = Object.assign({}, state.client);
      client[t.getAttribute('data-qb-client')] = t.value;
      setState({ client: client });
    } else if (t.hasAttribute('data-qb-field')) {
      var patch = {};
      var field = t.getAttribute('data-qb-field');
      patch[field] = field === 'validDays' ? Math.max(1, Math.min(365, parseInt(t.value, 10) || 1)) : t.value;
      setState(patch);
    } else if ((key = t.getAttribute('data-qb-qty'))) {
      updateItem(key, { qty: Math.max(1, Math.min(9999, parseInt(t.value, 10) || 1)) });
    } else if ((key = t.getAttribute('data-qb-price'))) {
      updateItem(key, { unitCents: core.parseMoney(t.value) });
    } else if ((key = t.getAttribute('data-qb-title'))) {
      updateItem(key, { title: t.value });
    } else if (t.hasAttribute('data-qb-discount-value') || t.hasAttribute('data-qb-discount-mode')) {
      var mode = $('[data-qb-discount-mode]').value;
      var raw = $('[data-qb-discount-value]').value;
      var value = mode === 'amount' ? core.parseMoney(raw) : Math.min(100, core.parseMoney(raw) / 100);
      setState({ discount: { mode: mode, value: value } });
    } else if (t.hasAttribute('data-qb-shipping')) {
      setState({ shippingCents: core.parseMoney(t.value) });
    } else if (t.hasAttribute('data-qb-search-input')) {
      clearTimeout(search.timer);
      var term = t.value.trim();
      search.timer = setTimeout(function () { runSearch(term); }, SEARCH_DELAY);
    } else if (t.hasAttribute('data-qb-saved-search')) {
      renderSaved(t.value);
    }
  });

  host.addEventListener('change', function (event) {
    var t = event.target;
    var key = t.getAttribute('data-qb-variant');
    if (t.hasAttribute('data-qb-discount-mode')) {
      t.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (!key) return;
    var item = state.items.filter(function (i) { return i.key === key; })[0];
    var variant = item && item.variants.filter(function (v) { return String(v.id) === t.value; })[0];
    if (variant) updateItem(key, { variantId: String(variant.id), sku: variant.sku, unitCents: variant.priceCents }, { items: true });
  });

  host.addEventListener('keydown', function (event) {
    if (!event.target.hasAttribute('data-qb-search-input')) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); moveActive(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveActive(-1); }
    else if (event.key === 'Enter' && search.active > -1) { event.preventDefault(); pickResult(search.active); }
    else if (event.key === 'Escape') closeResults();
  });

  var pendingDelete = null;
  host.addEventListener('click', function (event) {
    var option = event.target.closest('.qb-search__option');
    if (option) { pickResult(Number(option.getAttribute('data-index'))); return; }

    var remove = event.target.closest('[data-qb-remove]');
    if (remove) {
      var removeKey = remove.getAttribute('data-qb-remove');
      setState({ items: state.items.filter(function (i) { return i.key !== removeKey; }) }, { items: true });
      return;
    }

    var open = event.target.closest('[data-qb-open]');
    if (open) {
      var found = savedQuotes().filter(function (q) { return q.id === open.getAttribute('data-qb-open'); })[0];
      if (found) loadQuote(found);
      return;
    }

    var del = event.target.closest('[data-qb-delete]');
    if (del) {
      var id = del.getAttribute('data-qb-delete');
      if (pendingDelete !== id) {
        pendingDelete = id;
        del.textContent = 'Confirmar?';
        setTimeout(function () { if (pendingDelete === id) { pendingDelete = null; renderSaved(); } }, 3000);
        return;
      }
      pendingDelete = null;
      writeStore(STORE_KEY, savedQuotes().filter(function (q) { return q.id !== id; }));
      renderSaved($('[data-qb-saved-search]').value);
      setStatus('Orçamento excluído.');
      return;
    }

    var action = event.target.closest('[data-qb-action]');
    if (!action) {
      if (!event.target.closest('[data-qb-search]')) closeResults();
      return;
    }
    switch (action.getAttribute('data-qb-action')) {
      case 'new': loadQuote(createQuote()); setStatus('Novo orçamento iniciado.'); break;
      case 'duplicate': {
        var now = new Date();
        loadQuote(Object.assign({}, state, { id: uid(), number: core.quoteNumber(now, nextSequence(now)), createdAt: now.toISOString() }));
        setStatus('Cópia criada. Lembre de salvar.');
        break;
      }
      case 'add-service': addItem({ type: 'service', title: 'Instalação e configuração', unitCents: 0 }); break;
      case 'add-custom': addItem({ type: 'custom', title: '', unitCents: 0 }); break;
      case 'save': saveQuote(); break;
      case 'print': printQuote(); break;
      case 'whatsapp': sendWhatsapp(); break;
      case 'cart-link': copyCartLink(); break;
    }
  });

  renderFields();
  renderSaved();
})();
