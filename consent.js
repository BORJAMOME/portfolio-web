/* ═══════════════════════════════════════════════
   consent.js — aviso de cookies y preferencias (RGPD / LOPDGDD)
   ─────────────────────────────────────────────────
   Un solo archivo para todas las páginas (antes, un script en línea repetido en cada una).
   · Muestra #bm-cookie-banner si todavía no hay decisión guardada.
   · Aceptar  → guarda "accepted" y activa analytics_storage (Consent Mode v2).
   · Rechazar → guarda "rejected"; si antes se había aceptado, revoca el consentimiento
                y borra las cookies de Google Analytics (_ga, _ga_*).
   · Cualquier elemento con [data-cookie-prefs] vuelve a abrir el aviso: la decisión
     se puede cambiar en cualquier momento, igual de fácil que se dio.
   El consentimiento guardado se aplica en el <head>, antes de gtag("config"): este
   archivo no vuelve a concederlo al cargar.
   ═══════════════════════════════════════════════ */
(function () {
  var KEY = 'bm_cookie_consent';
  var banner = document.getElementById('bm-cookie-banner');
  if (!banner) return;
  var accept = document.getElementById('bm-cb-accept');
  var reject = document.getElementById('bm-cb-reject');
  var lastFocus = null, hideTimer = null;

  // localStorage puede no existir o lanzar (modo privado, cookies bloqueadas)
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
    // aviso para quien muestre el estado (p. ej., la página de privacidad)
    try { document.dispatchEvent(new CustomEvent('bm:consent', { detail: v })); } catch (e) {}
  }
  function consent(state) {
    if (typeof gtag === 'function') gtag('consent', 'update', { analytics_storage: state });
  }

  // Borra _ga y _ga_<id> en el dominio actual y en el dominio padre (GA4 usa .borjamora.es)
  function clearAnalyticsCookies() {
    var host = location.hostname, domains = ['', host, '.' + host];
    var parts = host.split('.');
    if (parts.length > 2) domains.push('.' + parts.slice(-2).join('.'));
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!/^_ga(_|$)/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  // El botón de la decisión vigente queda marcado al volver a abrir el aviso
  function mark(choice) {
    accept.setAttribute('aria-pressed', String(choice === 'accepted'));
    reject.setAttribute('aria-pressed', String(choice === 'rejected'));
  }

  function show(focus) {
    clearTimeout(hideTimer);
    mark(read());
    banner.style.display = '';
    banner.classList.remove('bm-hiding');
    // doble rAF: el navegador pinta el estado inicial y la transición se ve
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner.classList.add('bm-visible');
        if (focus) accept.focus({ preventScroll: true });
      });
    });
  }

  function hide() {
    banner.classList.remove('bm-visible');
    banner.classList.add('bm-hiding');
    hideTimer = setTimeout(function () { banner.style.display = 'none'; }, 380);
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  accept.addEventListener('click', function () {
    save('accepted');
    consent('granted');
    hide();
  });

  reject.addEventListener('click', function () {
    var before = read();
    save('rejected');
    if (before === 'accepted') { consent('denied'); clearAnalyticsCookies(); }
    hide();
  });

  // Escape cierra el aviso reabierto sin cambiar la decisión (en la primera visita hay que elegir)
  banner.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && read()) hide();
  });

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-cookie-prefs]');
    if (!t) return;
    e.preventDefault();
    lastFocus = t;
    show(true);
  });

  if (!read()) setTimeout(function () { show(false); }, 600);
  else banner.style.display = 'none';
})();
