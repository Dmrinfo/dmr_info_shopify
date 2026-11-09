/*
  ============================================================
  product-carousel.js — abas e carrossel da vitrine de produtos
  ============================================================

  O QUE FAZ:
  1. Abas ([role=tab]): clique ou setas do teclado trocam o painel
     visível ([data-carousel-panel]).
  2. Carrossel: em cada painel, as setas rolam uma "página" (a largura
     visível da faixa); as bolinhas são criadas conforme o número de
     páginas e marcam a atual com aria-current. Com uma página só, os
     controles somem.

  OBSERVACOES:
  Marcação em sections/product-carousel.liquid e
  snippets/product-carousel-track.liquid. O texto das bolinhas vem de
  data-dot-label ("Página") + número. Recalcula ao redimensionar.
*/
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initPanel(panel) {
    var track = panel.querySelector('[data-carousel-track]');
    var controls = panel.querySelector('[data-carousel-controls]');
    if (!track || !controls || panel.dataset.carouselReady) return;
    panel.dataset.carouselReady = 'true';

    var prev = controls.querySelector('[data-carousel-prev]');
    var next = controls.querySelector('[data-carousel-next]');
    var dotsWrap = controls.querySelector('[data-carousel-dots]');
    var dotLabel = dotsWrap.getAttribute('data-dot-label') || '';
    var pages = 0;

    function pageWidth() { return Math.max(track.clientWidth, 1); }
    function maxScroll() { return track.scrollWidth - track.clientWidth; }

    function goTo(page) {
      var left = Math.min(page * pageWidth(), maxScroll());
      track.scrollTo({ left: Math.max(left, 0), behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    function currentPage() {
      if (track.scrollLeft >= maxScroll() - 2) return pages - 1;
      return Math.round(track.scrollLeft / pageWidth());
    }

    function syncState() {
      var page = currentPage();
      Array.prototype.forEach.call(dotsWrap.children, function (dot, i) {
        if (i === page) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= maxScroll() - 2;
    }

    function buildDots() {
      var count = maxScroll() > 2 ? Math.ceil(track.scrollWidth / pageWidth() - 0.05) : 1;
      controls.hidden = count <= 1;
      if (count === pages) { syncState(); return; }
      pages = count;
      dotsWrap.textContent = '';
      for (var i = 0; i < count; i++) {
        var dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'product-carousel__dot';
        dot.setAttribute('aria-label', (dotLabel + ' ' + (i + 1)).trim());
        dot.addEventListener('click', goTo.bind(null, i));
        dotsWrap.appendChild(dot);
      }
      syncState();
    }

    prev.addEventListener('click', function () { goTo(currentPage() - 1); });
    next.addEventListener('click', function () { goTo(currentPage() + 1); });

    var ticking = false;
    track.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () { ticking = false; syncState(); });
    }, { passive: true });

    if ('ResizeObserver' in window) new ResizeObserver(buildDots).observe(track);
    else window.addEventListener('resize', buildDots);
    buildDots();
  }

  function initTabs(root) {
    if (root.dataset.tabsReady) return;
    root.dataset.tabsReady = 'true';
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));

    function select(tab) {
      tabs.forEach(function (t) {
        var active = t === tab;
        t.setAttribute('aria-selected', active ? 'true' : 'false');
        if (active) t.removeAttribute('tabindex');
        else t.setAttribute('tabindex', '-1');
        var panel = document.getElementById(t.getAttribute('aria-controls'));
        if (!panel) return;
        panel.hidden = !active;
        if (active) initPanel(panel);
      });
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (event) {
        var step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        var target = tabs[(i + step + tabs.length) % tabs.length];
        target.focus();
        select(target);
      });
    });
  }

  function init() {
    document.querySelectorAll('[data-product-carousel]').forEach(function (root) {
      initTabs(root);
      root.querySelectorAll('[data-carousel-panel]:not([hidden])').forEach(initPanel);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Editor de temas: seção recarregada
  document.addEventListener('shopify:section:load', init);
})();
