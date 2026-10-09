/* ═══════════════════════════════════════════════
   split-name.js — nombre letra a letra (logo de la cabecera)
   ─────────────────────────────────────────────────
   Cualquier elemento con [data-split-name] se trocea en letras con tres capas:
     .sn-mask (recorta) > .sn-lift (sube con el cursor) > .sn-enter (entra desde abajo)
   · Entrada: cada letra sube desde la máscara con un desfase de 32 ms. Solo la
     primera vez de cada sesión, para no repetirla en cada cambio de página.
   · Hover: la letra bajo el cursor sube entera y sus vecinas al 38 %; al salir
     vuelve con un leve rebote (las transiciones están en shared.css).
   · Opciones por atributo: data-sn-amp (subida en em, 0.32 por defecto),
     data-sn-offset (índice de arranque del desfase).
   · Sin efecto con prefers-reduced-motion ni en pantallas sin cursor fino.
   Se carga en <head> sin defer: así puede ocultar el nombre antes del primer
   pintado y evitar el parpadeo del texto sin trocear.
   ═══════════════════════════════════════════════ */
(function () {
  var KEY = 'bm_sn_played';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var played = false;
  try { played = sessionStorage.getItem(KEY) === '1'; } catch (e) { /* sin almacenamiento: se anima siempre */ }
  var animateEntry = !reduce && !played;
  var root = document.documentElement;
  if (animateEntry) root.classList.add('sn-pending');

  function split(el) {
    var text = el.textContent.replace(/\s+/g, ' ').trim();
    var amp = parseFloat(el.getAttribute('data-sn-amp')) || 0.32;
    var offset = parseInt(el.getAttribute('data-sn-offset'), 10) || 0;
    var lifts = [];
    var active = {};

    if (!el.hasAttribute('aria-label') && !el.closest('[aria-label]')) el.setAttribute('aria-label', text);
    el.textContent = '';
    el.classList.add('sn');

    Array.prototype.forEach.call(text, function (ch, i) {
      var mask = document.createElement('span');
      var lift = document.createElement('span');
      var enter = document.createElement('span');
      mask.className = 'sn-mask';
      lift.className = 'sn-lift';
      enter.className = 'sn-enter';
      mask.setAttribute('aria-hidden', 'true');
      enter.textContent = ch === ' ' ? ' ' : ch;
      enter.style.transitionDelay = ((offset + i) * 32) + 'ms';
      lift.appendChild(enter);
      mask.appendChild(lift);
      el.appendChild(mask);
      lifts.push(lift);
    });

    function paint() {
      lifts.forEach(function (lift, i) {
        var level = active[i] ? 1 : (active[i - 1] || active[i + 1]) ? 0.38 : 0;
        lift.classList.toggle('is-up', level > 0);
        lift.style.transform = level ? 'translateY(' + (-amp * level) + 'em)' : '';
      });
    }

    if (!reduce && finePointer) {
      lifts.forEach(function (lift, i) {
        lift.addEventListener('mouseenter', function () { active[i] = true; paint(); });
        lift.addEventListener('mouseleave', function () { active[i] = false; paint(); });
      });
    }
    return el;
  }

  function init() {
    var els = Array.prototype.map.call(document.querySelectorAll('[data-split-name]'), split);
    if (!animateEntry) { els.forEach(function (el) { el.classList.add('sn-in', 'sn-static'); }); return; }
    // las letras ya están bajo la máscara: se puede mostrar el contenedor
    root.classList.remove('sn-pending');
    try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* nada */ }
    setTimeout(function () {
      els.forEach(function (el) { el.classList.add('sn-in'); });
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
