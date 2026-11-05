/*
  ============================================================
  banner-carousel.js — comportamento do carrossel de banners
  ============================================================

  O QUE FAZ:
  Liga setas, pontos e troca automática ao trilho de slides
  (scroll-snap) de cada [data-banner-carousel] da página.
  - Atualiza o ponto ativo conforme o slide visível.
  - Autoplay em loop; pausa no hover, no foco e quando a aba está
    oculta; não inicia com prefers-reduced-motion.

  OBSERVACOES:
  Sem dependências. Seguro para carregar mais de uma vez (cada
  carrossel só é inicializado uma vez, via data-initialized).
*/
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function init(root) {
    if (root.dataset.initialized) return;
    root.dataset.initialized = 'true';

    var track = root.querySelector('[data-track]');
    var slides = root.querySelectorAll('[data-slide]');
    var dots = root.querySelectorAll('[data-dot]');
    if (!track || slides.length < 2) return;

    var current = 0;
    var timer = null;
    var interval = parseInt(root.dataset.interval, 10) || 6000;
    var autoplay = root.dataset.autoplay === 'true' && !reducedMotion;

    function goTo(index) {
      current = (index + slides.length) % slides.length;
      track.scrollTo({ left: slides[current].offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
    }

    function setActiveDot(index) {
      dots.forEach(function (dot, i) {
        if (i === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    }

    function stop() {
      if (timer) window.clearInterval(timer);
      timer = null;
    }

    function start() {
      stop();
      if (autoplay) timer = window.setInterval(function () { goTo(current + 1); }, interval);
    }

    var prev = root.querySelector('[data-prev]');
    var next = root.querySelector('[data-next]');
    if (prev) prev.addEventListener('click', function () { goTo(current - 1); start(); });
    if (next) next.addEventListener('click', function () { goTo(current + 1); start(); });
    dots.forEach(function (dot) {
      dot.addEventListener('click', function () { goTo(parseInt(dot.dataset.dot, 10)); start(); });
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        current = Array.prototype.indexOf.call(slides, entry.target);
        setActiveDot(current);
      });
    }, { root: track, threshold: 0.6 });
    slides.forEach(function (slide) { observer.observe(slide); });

    track.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowRight') { event.preventDefault(); goTo(current + 1); start(); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(current - 1); start(); }
    });

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    start();
  }

  function initAll() {
    document.querySelectorAll('[data-banner-carousel]').forEach(init);
  }

  initAll();
  document.addEventListener('shopify:section:load', initAll);
})();
