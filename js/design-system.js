/**
 * Simpatico HR — Design System helpers (v1)
 * Scroll-reveal animations via IntersectionObserver.
 * Additive: safe to include on any page.
 */
(function () {
  'use strict';

  function initReveal() {
    var els = document.querySelectorAll('.ds-reveal');
    if (!els.length) return;

    if (
      !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      els.forEach(function (el) {
        el.classList.add('ds-revealed');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('ds-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    els.forEach(function (el) {
      observer.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReveal);
  } else {
    initReveal();
  }
})();
