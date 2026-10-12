/* ═══════════════════════════════════════════════
   roma-aeterna/acceso.js — puerta con la contraseña del área privada
   ─────────────────────────────────────────────────
   · Comprueba la contraseña contra Supabase Auth (el mismo usuario que area-privada.html).
   · Si es correcta, cierra al momento esa sesión (scope=local: solo esta, no las de otros
     dispositivos) y guarda en este dispositivo un aviso de «desbloqueado» durante 90 días.
     Así no queda ningún token en el móvil y el juego funciona sin conexión.
   · Es una puerta de conveniencia: los archivos del motor son código abierto y GitHub Pages
     los sirve igual a quien sepa la ruta. Los archivos del juego y las partidas nunca salen
     del dispositivo.
   ═══════════════════════════════════════════════ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://rvizmzjkxunkbqomsvcv.supabase.co';   // como en area-privada.js
  var SUPABASE_KEY = 'sb_publishable_rozvXk1dBTGMHmd1h7j6Zw_AW2mIWJv'; // clave PÚBLICA
  var OWNER_EMAIL = 'borja.mora.mendez@gmail.com';
  var KEY = 'ra.unlockedUntil';
  var DAYS = 90;

  function until() { try { return Number(localStorage.getItem(KEY)) || 0; } catch (e) { return 0; } }
  function unlocked() { return until() > Date.now(); }

  window.RA_ACCESS = {
    unlocked: unlocked,
    lock: function () { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); }
  };

  var lock = document.getElementById('lock');
  var launcher = document.getElementById('launcher');
  var form = document.getElementById('lockForm');
  var pass = document.getElementById('lockPass');
  var msg = document.getElementById('lockMsg');
  var btn = document.getElementById('lockBtn');

  function open() {
    lock.hidden = true;
    launcher.hidden = false;
    document.dispatchEvent(new Event('ra:unlocked'));
  }

  if (unlocked()) { lock.hidden = true; launcher.hidden = false; return; }
  lock.hidden = false;
  launcher.hidden = true;
  setTimeout(function () { pass.focus(); }, 50);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!pass.value) { msg.textContent = 'Escribe la contraseña.'; pass.focus(); return; }
    btn.disabled = true; btn.textContent = 'Comprobando…'; msg.textContent = '';
    fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: OWNER_EMAIL, password: pass.value })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var err = new Error(d.msg || d.error_description || 'HTTP ' + r.status); err.status = r.status; throw err; }
        return d;
      });
    }).then(function (d) {
      // no se guarda la sesión: se cierra en el acto, solo la de este acceso
      fetch(SUPABASE_URL + '/auth/v1/logout?scope=local', {
        method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + d.access_token }
      }).catch(function () {});
      try { localStorage.setItem(KEY, String(Date.now() + DAYS * 864e5)); } catch (e2) {}
      pass.value = '';
      open();
    }).catch(function (err) {
      if (err.status === 400 || err.status === 401) msg.textContent = 'Contraseña incorrecta.';
      else if (err.status === 429) msg.textContent = 'Demasiados intentos. Espera un minuto y vuelve a probar.';
      else msg.textContent = 'No se pudo comprobar: necesitas conexión a internet para entrar la primera vez.';
      pass.select();
    }).finally(function () { btn.disabled = false; btn.textContent = 'Entrar'; });
  });
})();
