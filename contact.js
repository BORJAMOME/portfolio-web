/* ═══════════════════════════════════════════════
   contact.js — «Copiar email»
   ─────────────────────────────────────────────────
   Cualquier botón con [data-copy-email] copia la dirección al portapapeles y lo
   confirma durante 2 s. Complementa a los enlaces mailto:, para quien no tiene
   configurado un programa de correo en el ordenador.
   · data-ga-location="…" → se envía con el evento copiar_email.
   ═══════════════════════════════════════════════ */
(function () {
  var EMAIL = 'borja.mora.mendez@gmail.com';
  var EN = (document.documentElement.lang || '').slice(0, 2) === 'en';
  var DONE = EN ? 'Copied' : 'Copiado';

  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return ok ? Promise.resolve() : Promise.reject();
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(function () { return fallback(text); });
    return fallback(text);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy-email]');
    if (!btn) return;
    var label = btn.querySelector('[data-copy-label]') || btn;
    if (!btn._label) btn._label = label.textContent;
    copy(EMAIL).then(function () {
      label.textContent = DONE;
      btn.classList.add('is-copied');
      clearTimeout(btn._t);
      btn._t = setTimeout(function () { label.textContent = btn._label; btn.classList.remove('is-copied'); }, 2000);
      if (typeof gtag === 'function') gtag('event', 'copiar_email', { location: btn.getAttribute('data-ga-location') || 'web' });
    }, function () {
      // sin portapapeles: se abre el correo como alternativa
      location.href = 'mailto:' + EMAIL;
    });
  });
})();
