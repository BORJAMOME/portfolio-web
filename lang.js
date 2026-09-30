/* ═══════════════════════════════════════════════
   lang.js — recuerda el idioma elegido (ES | EN)
   ─────────────────────────────────────────────────
   · Al pulsar el selector (.ds-lang, [data-lang-to]) se guarda la elección.
   · Al abrir una página que tiene versión en el otro idioma (<link rel="alternate"
     hreflang>), si la elección guardada es ese idioma, se va directamente a ella.
     Así, quien elige inglés sigue en inglés aunque llegue por un enlace español.
   · Solo actúa tras una elección explícita: la primera visita (y los buscadores)
     ven siempre la página que han pedido. ?lang en la URL desactiva el salto.
   Se carga en <head>, sin defer, justo después de los enlaces hreflang.
   ═══════════════════════════════════════════════ */
(function () {
  var KEY = 'bm_lang', here = (document.documentElement.lang || 'es').slice(0, 2);
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* sin almacenamiento: no se recuerda */ } }

  var want = get();
  if (want && want !== here && !/[?&]lang=/.test(location.search)) {
    var alt = document.querySelector('link[rel="alternate"][hreflang="' + want + '"]');
    if (alt) {
      // en local (o en otra copia del sitio) se usa la misma ruta sobre el origen actual
      var path = new URL(alt.getAttribute('href'), location.href).pathname;
      if (path !== location.pathname) { location.replace(path + location.hash); return; }
    }
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-lang-to]');
    if (a) set(a.getAttribute('data-lang-to'));
  }, true);
})();
