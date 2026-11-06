/*
  ============================================================
  product.js — galeria e seleção de variante da página de produto
  ============================================================

  O QUE FAZ:
  1. Galeria: a lista .product__slides rola com scroll-snap; as setas
     ([data-gallery-prev]/[data-gallery-next]) e as miniaturas
     ([data-gallery-thumb]) levam ao slide; a miniatura ativa ganha
     aria-current conforme a rolagem.
  2. Variantes: ao trocar uma opção, atualiza o input hidden da
     variante, o preço (HTML pré-renderizado em [data-variant-json]),
     o código (SKU), o estado dos botões, a mídia em destaque e o
     ?variant da URL.
  3. Quantidade: botões +/- do bloco opcional de quantidade.

  OBSERVACOES:
  Textos vêm de data-add-text / data-sold-out-text /
  data-unavailable-text no <form> (sections/main-product.liquid).
  Sem JS a página continua funcionando: a galeria rola com o dedo/
  trackpad e o formulário envia a variante inicial.
*/
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initGallery(gallery) {
    var track = gallery.querySelector('.product__slides');
    if (!track) return null;
    var slides = Array.prototype.slice.call(track.children);
    var thumbs = Array.prototype.slice.call(gallery.querySelectorAll('[data-gallery-thumb]'));
    var prev = gallery.querySelector('[data-gallery-prev]');
    var next = gallery.querySelector('[data-gallery-next]');
    var current = 0;

    function goTo(index) {
      var target = slides[Math.max(0, Math.min(index, slides.length - 1))];
      if (!target) return;
      track.scrollTo({ left: target.offsetLeft, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }

    function sync() {
      var index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
      if (index === current) return;
      current = index;
      thumbs.forEach(function (thumb, i) {
        if (i === index) {
          thumb.setAttribute('aria-current', 'true');
          thumb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } else {
          thumb.removeAttribute('aria-current');
        }
      });
      if (prev) prev.disabled = index <= 0;
      if (next) next.disabled = index >= slides.length - 1;
    }

    var ticking = false;
    track.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        ticking = false;
        sync();
      });
    }, { passive: true });

    if (prev) prev.addEventListener('click', function () { goTo(current - 1); });
    if (next) next.addEventListener('click', function () { goTo(current + 1); });
    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () { goTo(Number(thumb.getAttribute('data-gallery-thumb'))); });
    });

    return {
      showMedia: function (mediaId) {
        var index = slides.findIndex(function (slide) { return slide.getAttribute('data-media-id') === String(mediaId); });
        if (index >= 0) goTo(index);
      }
    };
  }

  function initVariants(section, gallery) {
    var form = section.querySelector('.product__form');
    var jsonEl = section.querySelector('[data-variant-json]');
    if (!form || !jsonEl) return;

    var variants;
    try { variants = JSON.parse(jsonEl.textContent); } catch (e) { return; }

    var idInput = form.querySelector('.product-variant-id');
    var addButton = form.querySelector('.product__add-to-cart');
    var addLabel = addButton ? addButton.querySelector('span') : null;
    var buyNow = form.querySelector('.product__buy-now');
    var priceContainer = section.querySelector('.product__price');
    var skuEl = section.querySelector('[data-product-sku]');
    var text = {
      add: form.getAttribute('data-add-text') || '',
      soldOut: form.getAttribute('data-sold-out-text') || '',
      unavailable: form.getAttribute('data-unavailable-text') || ''
    };

    function selectedOptions() {
      return Array.prototype.map.call(section.querySelectorAll('.product__option'), function (fieldset) {
        var checked = fieldset.querySelector('input[type="radio"]:checked');
        return checked ? checked.value : null;
      });
    }

    function findVariant(options) {
      return variants.find(function (variant) {
        return variant.options.length === options.length && variant.options.every(function (o, i) { return o === options[i]; });
      });
    }

    function setButtons(disabled, label) {
      [addButton, buyNow].forEach(function (button) {
        if (!button) return;
        if (disabled) button.setAttribute('disabled', 'disabled');
        else button.removeAttribute('disabled');
      });
      if (addLabel && label) addLabel.textContent = label;
    }

    function update() {
      var variant = findVariant(selectedOptions());
      if (!variant) {
        setButtons(true, text.unavailable);
        if (idInput) idInput.setAttribute('disabled', 'disabled');
        return;
      }

      if (idInput) {
        idInput.value = variant.id;
        idInput.removeAttribute('disabled');
      }
      setButtons(!variant.available, variant.available ? text.add : text.soldOut);

      if (priceContainer && variant.price_html) {
        var existing = priceContainer.querySelector('.card-price');
        var holder = document.createElement('div');
        holder.innerHTML = variant.price_html;
        var fresh = holder.querySelector('.card-price');
        if (existing && fresh) existing.replaceWith(fresh);
      }

      if (skuEl) {
        skuEl.textContent = variant.sku_text || '';
        skuEl.hidden = !variant.sku_text;
      }

      if (gallery && variant.featured_media_id) gallery.showMedia(variant.featured_media_id);

      if (window.history && history.replaceState) {
        var url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        history.replaceState({}, '', url.toString());
      }
    }

    section.querySelectorAll('.product__option input[type="radio"]').forEach(function (input) {
      input.addEventListener('change', function () {
        var option = input.closest('.product__option');
        option.querySelectorAll('.product__swatch').forEach(function (label) { label.classList.remove('is-selected'); });
        var label = input.closest('.product__swatch');
        if (label) label.classList.add('is-selected');
        update();
      });
    });
  }

  function initQuantity(section) {
    section.querySelectorAll('.quantity-selector').forEach(function (selector) {
      var input = selector.querySelector('.quantity__input');
      var plus = selector.querySelector('[name="plus"]');
      var minus = selector.querySelector('[name="minus"]');
      if (!input) return;
      if (plus) plus.addEventListener('click', function () { input.value = parseInt(input.value || '1', 10) + 1; });
      if (minus) minus.addEventListener('click', function () { input.value = Math.max(1, parseInt(input.value || '1', 10) - 1); });
    });
  }

  function init() {
    document.querySelectorAll('[data-product-section]').forEach(function (section) {
      var galleryEl = section.querySelector('[data-product-gallery]');
      var gallery = galleryEl ? initGallery(galleryEl) : null;
      initVariants(section, gallery);
      initQuantity(section);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
