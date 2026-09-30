/* ═══════════════════════════════════════════════
   case.js — comportamiento de los casos de estudio (Power BI y Casa Origen)
   ─────────────────────────────────────────────────
   Sustituye al runtime anterior (support.js + React desde unpkg): el contenido de
   los casos es HTML estático y se ve aunque este archivo no llegue a cargarse.
   · .reveal        → añade .visible al entrar en pantalla (y .pbi-card, un poco después).
   · [data-count]   → contador animado hasta su valor, con el formato del idioma de la
                      página (es-ES / en-GB). data-decimals="1" · data-format="thousands".
   · #heroStat      → cifra de portada de Casa Origen que da paso al titular.
   Opcional: <script src="./case.js" data-duration="1800" defer> (por defecto, 1400 ms).
   ═══════════════════════════════════════════════ */
(function () {
  var script = document.currentScript;
  var DURATION = parseInt(script && script.dataset.duration, 10) || 1400;
  var EN = (document.documentElement.lang || '').slice(0, 2) === 'en';
  var LOCALE = EN ? 'en-GB' : 'es-ES';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  /* ── Apariciones ── */
  function initReveal() {
    var els = document.querySelectorAll('.reveal:not(.visible)');
    if (!hasIO) { els.forEach(function (el) { el.classList.add('visible'); }); }
    else {
      var io = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
      }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
      els.forEach(function (el) { io.observe(el); });
    }
    document.querySelectorAll('.pbi-card:not(.visible)').forEach(function (el) {
      setTimeout(function () { el.classList.add('visible'); }, 300);
    });
  }

  /* ── Contadores ── */
  function fmt(el, v) {
    var decimals = parseInt(el.dataset.decimals, 10) || 0;
    if (el.dataset.format === 'thousands') return Math.round(v).toLocaleString(LOCALE, { useGrouping: true });
    if (decimals > 0) { var s = v.toFixed(decimals); return EN ? s : s.replace('.', ','); }
    return String(Math.round(v));
  }
  function animate(el) {
    var target = parseFloat(el.dataset.count);
    if (reduced) { el.textContent = fmt(el, target); return; }
    var start = performance.now();
    el._animating = true;
    (function step(now) {
      var p = Math.min((now - start) / DURATION, 1), ease = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(el, target * ease);
      if (p < 1) requestAnimationFrame(step); else el._animating = false;
    })(start);
  }
  function initCounters() {
    var els = document.querySelectorAll('[data-count]');
    if (!els.length) return;
    if (!hasIO) { els.forEach(animate); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting && !e.target._animating) animate(e.target); });
    }, { threshold: 0.5 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ── Portada de Casa Origen: la cifra cuenta hasta 40 % y deja paso al titular ── */
  function initHeroStat() {
    var stat = document.getElementById('heroStat'), num = document.getElementById('heroStatNumber'), main = document.getElementById('heroMain');
    if (!stat || !num || !main) return;
    var done = false;
    function finish() { if (done) return; done = true; stat.classList.add('hero-out'); main.classList.add('hero-in'); }
    if (reduced) { done = true; main.classList.add('hero-in'); return; }
    var failsafe = setTimeout(finish, 4000);
    setTimeout(function () {
      if (done) return;
      var t0 = Date.now(), target = 40, dur = 1300;
      var iv = setInterval(function () {
        if (done) return clearInterval(iv);
        var p = Math.min((Date.now() - t0) / dur, 1);
        num.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + '%';
        if (p >= 1) { clearInterval(iv); setTimeout(function () { clearTimeout(failsafe); finish(); }, 500); }
      }, 16);
    }, 350);
  }

  function init() { initHeroStat(); initReveal(); initCounters(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
