/*
  ============================================================
  header.js — comportamento do cabeçalho (sections/nav.liquid)
  ============================================================

  O QUE FAZ:
  - Abre/fecha o menu mobile (botão hambúrguer).
  - Popovers (<details data-popover>): fecha ao clicar fora, com Esc
    e quando outro abre. Vale para CEP, acessibilidade e
    "Todas categorias".
  - CEP: máscara 00000-000, valida 8 dígitos, salva no navegador e
    mostra no header. Não calcula frete.
  - Acessibilidade: tamanho da fonte (-1 a +3 passos de 10%) e alto
    contraste (classe .dmr-contrast no <html>), salvos no navegador.

  OBSERVACOES:
  Sem dependências. localStorage pode falhar (modo privado); nesse
  caso tudo funciona, só não fica salvo.
*/
(function () {
  'use strict';

  var CEP_KEY = 'dmr:cep';
  var FONT_KEY = 'dmr:font-step';
  var CONTRAST_KEY = 'dmr:contrast';
  var FONT_MIN = -1;
  var FONT_MAX = 3;
  var FONT_STEP_PERCENT = 10;
  var CEP_PATTERN = /^\d{8}$/;

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* sem persistência */ }
  }

  function formatCep(digits) {
    return digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5, 8) : digits;
  }

  function initMobileToggle(root) {
    var toggle = root.querySelector('.header__menu-toggle');
    if (!toggle) return;
    var nav = document.getElementById(toggle.getAttribute('aria-controls'));
    if (!nav) return;
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.hidden = open;
    });
  }

  function initCep(root) {
    var details = root.querySelector('[data-cep]');
    if (!details) return;
    var label = details.querySelector('[data-cep-label]');
    var form = details.querySelector('[data-cep-form]');
    var input = details.querySelector('[data-cep-input]');
    var error = details.querySelector('[data-cep-error]');
    var template = details.getAttribute('data-cep-template') || 'CEP __CEP__';

    function show(digits) {
      label.textContent = template.replace('__CEP__', formatCep(digits));
    }

    var saved = storageGet(CEP_KEY);
    if (saved && CEP_PATTERN.test(saved)) {
      show(saved);
      input.value = formatCep(saved);
    }

    input.addEventListener('input', function () {
      input.value = formatCep(input.value.replace(/\D/g, '').slice(0, 8));
      error.hidden = true;
      input.removeAttribute('aria-invalid');
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var digits = input.value.replace(/\D/g, '');
      if (!CEP_PATTERN.test(digits)) {
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      storageSet(CEP_KEY, digits);
      show(digits);
      details.open = false;
      details.querySelector('summary').focus();
    });
  }

  function clampFont(step) {
    return Math.min(FONT_MAX, Math.max(FONT_MIN, step));
  }

  function applyFont(step) {
    document.documentElement.style.fontSize = step === 0 ? '' : (100 + step * FONT_STEP_PERCENT) + '%';
  }

  function applyContrast(isOn) {
    document.documentElement.classList.toggle('dmr-contrast', isOn);
  }

  function initA11y(root) {
    var fontStep = clampFont(parseInt(storageGet(FONT_KEY), 10) || 0);
    var hasContrast = storageGet(CONTRAST_KEY) === '1';
    applyFont(fontStep);
    applyContrast(hasContrast);

    var panel = root.querySelector('[data-a11y]');
    if (!panel) return;

    var contrastButton = panel.querySelector('[data-a11y-contrast]');
    contrastButton.setAttribute('aria-pressed', String(hasContrast));

    panel.querySelectorAll('[data-a11y-font]').forEach(function (button) {
      button.addEventListener('click', function () {
        var action = button.getAttribute('data-a11y-font');
        fontStep = action === 'reset' ? 0 : clampFont(fontStep + (action === 'up' ? 1 : -1));
        applyFont(fontStep);
        storageSet(FONT_KEY, String(fontStep));
      });
    });

    contrastButton.addEventListener('click', function () {
      hasContrast = !hasContrast;
      applyContrast(hasContrast);
      contrastButton.setAttribute('aria-pressed', String(hasContrast));
      storageSet(CONTRAST_KEY, hasContrast ? '1' : '0');
    });
  }

  var popoversBound = false;

  function initPopovers() {
    if (popoversBound) return;
    popoversBound = true;

    document.addEventListener('click', function (event) {
      document.querySelectorAll('details[data-popover][open]').forEach(function (details) {
        if (!details.contains(event.target)) details.open = false;
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('details[data-popover][open]').forEach(function (details) {
        details.open = false;
        details.querySelector('summary').focus();
      });
    });

    document.addEventListener('toggle', function (event) {
      var current = event.target;
      if (!current.matches || !current.matches('details[data-popover]') || !current.open) return;
      document.querySelectorAll('details[data-popover][open]').forEach(function (details) {
        if (details !== current) details.open = false;
      });
    }, true);
  }

  function init() {
    document.querySelectorAll('[data-header]').forEach(function (root) {
      if (root.dataset.initialized) return;
      root.dataset.initialized = 'true';
      initMobileToggle(root);
      initCep(root);
      initA11y(root);
    });
    initPopovers();
  }

  init();
  document.addEventListener('shopify:section:load', init);
})();
