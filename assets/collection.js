/*
  ============================================================
  collection.js — filtros e ordenação da página de coleção
  ============================================================

  O QUE FAZ:
  - Aplica o filtro ao marcar/desmarcar (envia o formulário GET).
  - Faixa de preço: dois controles deslizantes; ao soltar, preenche
    os campos de preço (em reais) e aplica.
  - Ordenação: aplica ao trocar a opção.
  - Mobile: abre/fecha a gaveta de filtros (botão, fundo e Esc).

  OBSERVACOES:
  Carregado por sections/main-collection.liquid. Sem dependências.
  Sem JavaScript tudo continua funcionando pelo botão "Aplicar".
*/
(function () {
  'use strict';

  function submitForm(form) {
    if (form.requestSubmit) form.requestSubmit();
    else form.submit();
  }

  function formatMoney(value, box) {
    try {
      return new Intl.NumberFormat(box.dataset.locale || 'pt-BR', {
        style: 'currency',
        currency: box.dataset.currency || 'BRL'
      }).format(Number(value));
    } catch (error) {
      return value;
    }
  }

  function initDrawer(root) {
    var facets = root.querySelector('[data-facets]');
    var openButton = root.querySelector('[data-facets-open]');
    var overlay = root.querySelector('.facets-overlay');
    if (!facets || !openButton) return;

    function setOpen(isOpen) {
      facets.classList.toggle('is-open', isOpen);
      if (overlay) overlay.hidden = !isOpen;
      openButton.setAttribute('aria-expanded', String(isOpen));
      document.documentElement.classList.toggle('facets-open', isOpen);
      if (isOpen) {
        var closeButton = facets.querySelector('.facets__close');
        if (closeButton) closeButton.focus();
      } else {
        openButton.focus();
      }
    }

    openButton.addEventListener('click', function () { setOpen(true); });
    root.querySelectorAll('[data-facets-close]').forEach(function (element) {
      element.addEventListener('click', function () { setOpen(false); });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && facets.classList.contains('is-open')) setOpen(false);
    });
  }

  function initPriceRange(form) {
    form.querySelectorAll('[data-price-range]').forEach(function (box) {
      var rangeMin = box.querySelector('[data-range-min]');
      var rangeMax = box.querySelector('[data-range-max]');
      var inputMin = box.querySelector('[data-input-min]');
      var inputMax = box.querySelector('[data-input-max]');
      var labelMin = box.querySelector('[data-label-min]');
      var labelMax = box.querySelector('[data-label-max]');
      var fill = box.querySelector('[data-range-fill]');
      var max = Number(rangeMax.max) || 1;

      function paint() {
        labelMin.textContent = formatMoney(rangeMin.value, box);
        labelMax.textContent = formatMoney(rangeMax.value, box);
        fill.style.left = (Number(rangeMin.value) / max) * 100 + '%';
        fill.style.right = 100 - (Number(rangeMax.value) / max) * 100 + '%';
      }

      function applyRange() {
        inputMin.value = Number(rangeMin.value) > 0 ? rangeMin.value : '';
        inputMax.value = Number(rangeMax.value) < max ? rangeMax.value : '';
        submitForm(form);
      }

      rangeMin.addEventListener('input', function () {
        if (Number(rangeMin.value) > Number(rangeMax.value)) rangeMin.value = rangeMax.value;
        paint();
      });
      rangeMax.addEventListener('input', function () {
        if (Number(rangeMax.value) < Number(rangeMin.value)) rangeMax.value = rangeMin.value;
        paint();
      });
      rangeMin.addEventListener('change', applyRange);
      rangeMax.addEventListener('change', applyRange);
      paint();
    });
  }

  function initForm(form) {
    form.addEventListener('change', function (event) {
      if (event.target.matches('input[type="checkbox"]')) submitForm(form);
    });
    // Campos de preço vazios não entram na URL (evita filtro "de 0 a 0").
    form.addEventListener('submit', function () {
      form.querySelectorAll('input[type="number"]').forEach(function (input) {
        if (input.value === '') input.disabled = true;
      });
    });
    initPriceRange(form);
  }

  function initSort(root) {
    var select = root.querySelector('[data-sort-select]');
    if (!select) return;
    select.addEventListener('change', function () { submitForm(select.form); });
  }

  function init() {
    document.querySelectorAll('[data-collection]').forEach(function (root) {
      if (root.dataset.initialized) return;
      root.dataset.initialized = 'true';
      initDrawer(root);
      var form = root.querySelector('[data-facets-form]');
      if (form) initForm(form);
      initSort(root);
    });
  }

  init();
  document.addEventListener('shopify:section:load', init);
})();
