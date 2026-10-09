/* ═══════════════════════════════════════════════
   lab-tube.js — tubo de ensayo morado en el enlace «Laboratorio» (diseño 7d)
   ─────────────────────────────────────────────────
   · Al pasar el cursor (o enfocar con Tab) aparece el tubo junto a la palabra,
     se agita, brilla en morado, suelta neblina, destellos y burbujas.
   · Sonido opcional (Web Audio, sin archivos): «blop» por burbuja y tintineo de
     vidrio al entrar. Apagado por defecto; se activa con LabTube.setSound(true)
     o con cualquier botón [data-lab-sound]. Se recuerda en localStorage.
   · Sin dependencias. Todo el estilo va por CSSOM (el.style.x), compatible con la
     CSP estricta (sin estilos ni scripts en línea).
   · Sin efecto en pantallas sin cursor fino; con prefers-reduced-motion solo
     aparece el tubo, sin partículas ni agitación.
   Uso: <a href="./descargas.html" data-lab-tube>Laboratorio</a>
        <script src="./lab-tube.js" defer></script>
   · La imagen (img/tubo-morado.png) se resuelve junto a este script, así que vale
     igual en la raíz que en en/. data-lab-src en el enlace la sustituye si hace falta.
   ═══════════════════════════════════════════════ */
(function () {
  'use strict';
  var me = document.currentScript;
  var IMG = me && me.src ? new URL('img/tubo-morado.png', me.src).href : './img/tubo-morado.png';
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'bm_lab_sound';
  var M = '122,123,255', LC = '183,184,255', DK = '79,80,166', WC = '228,228,255';
  var TAU = Math.PI * 2, DPR = Math.min(3, window.devicePixelRatio || 1);
  var OX = 60, OY = 44;
  var audio = null, soundOn = false;
  try { soundOn = localStorage.getItem(KEY) === '1'; } catch (e) {}

  function clamp(x, a, b) { return Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, x)); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function eback(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }

  function ensureAudio() {
    if (!audio) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); }
    return audio;
  }
  function blip(r) {
    var A = audio, now = A.currentTime, o = A.createOscillator(), g = A.createGain();
    var f = 700 + (1.7 - r) * 520 + Math.random() * 140;
    o.type = 'sine'; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 1.9, now + 0.05);
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.05, now + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    o.connect(g).connect(A.destination); o.start(now); o.stop(now + 0.11);
  }
  function clink() {
    var A = audio, now = A.currentTime;
    [[2350, 0.035], [3530, 0.02], [5210, 0.01]].forEach(function (p) {
      var o = A.createOscillator(), g = A.createGain(); o.type = 'sine'; o.frequency.value = p[0];
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(p[1], now + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      o.connect(g).connect(A.destination); o.start(now); o.stop(now + 0.52);
    });
  }
  function canPlay() { return soundOn && audio && audio.state === 'running'; }

  function mount(a) {
    var cs = getComputedStyle(a);
    if (cs.position === 'static') a.style.position = 'relative';
    var layer = document.createElement('span');
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, { position: 'absolute', left: -OX + 'px', top: -OY + 'px', pointerEvents: 'none', zIndex: '1' });
    var cv = document.createElement('canvas'), img = new Image();
    img.alt = ''; img.decoding = 'async'; img.src = a.getAttribute('data-lab-src') || IMG;
    Object.assign(img.style, { position: 'absolute', left: '0', top: '0', width: '20px', height: '20px', opacity: '0', transformOrigin: '40% 80%' });
    Object.assign(cv.style, { position: 'absolute', left: '0', top: '0' });
    layer.appendChild(img); layer.appendChild(cv); a.appendChild(layer);
    var ctx = cv.getContext('2d'), W = 0, H = 0;
    function size() {
      W = a.offsetWidth + OX * 2; H = 110;
      layer.style.width = W + 'px'; layer.style.height = H + 'px';
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    }
    size(); window.addEventListener('resize', size);

    var s = { on: false, was: false, p: 0, enter: null, b: [], fx: [], v: [], sk: [] }, raf = 0, last = 0;
    var textShadowEl = a.querySelector('[data-lab-text]') || a;

    function geo() {
      var c = getComputedStyle(a), fs = parseFloat(c.fontSize), lh = parseFloat(c.lineHeight) || fs * 1.55, pt = parseFloat(c.paddingTop), pl = parseFloat(c.paddingLeft);
      var base = pt + (lh - fs * 1.194) / 2 + fs * 0.962;
      return { l: OX + pl, base: OY + base, fx: OX + pl - 11 };
    }

    function frame(t) {
      var dt = Math.min(50, t - (last || t)); last = t;
      s.p = clamp(s.p + (s.on ? dt / 850 : -dt / 620));
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
      draw(t, geo());
      if (s.on || s.p > 0 || s.b.length || s.fx.length || s.v.length) raf = requestAnimationFrame(frame);
      else { raf = 0; last = 0; img.style.opacity = '0'; textShadowEl.style.textShadow = ''; }
    }
    function draw(t, g) {
      var p = s.p, pulse = 0.5 + 0.5 * Math.sin(t / 260), L = ease(clamp((p - 0.3) / 0.6));
      var sz = 20, x = g.fx - sz / 2 + 1, top = g.base + 4 - sz;
      if (s.on && !s.was) { s.enter = t; if (canPlay()) clink(); } s.was = s.on;
      var de = s.enter != null ? t - s.enter : 1e9;
      var intro = reduce ? 0 : (de < 1400 ? 24 * Math.exp(-de / 260) * Math.sin(de / 42) : 0);
      var shake = !reduce && s.on && p > 0.5 ? 6 * Math.sin(t / 38) * (0.5 + 0.5 * Math.sin(t / 420)) * clamp((p - 0.5) * 2) : 0;
      var sc = reduce ? 1 : Math.max(0, eback(clamp(p / 0.55))), ty = (1 - sc) * 4 + (shake ? Math.abs(Math.sin(t / 38)) * -0.4 : 0), ang = intro + shake;
      img.style.left = x + 'px'; img.style.top = top + 'px'; img.style.opacity = clamp(p * 3).toFixed(3);
      img.style.transform = 'translateY(' + ty.toFixed(2) + 'px) scale(' + sc.toFixed(3) + ') rotate(' + ang.toFixed(2) + 'deg)';
      img.style.filter = 'drop-shadow(0 1px 1.2px rgba(17,17,17,.2)) drop-shadow(0 0 ' + (0.5 + 2.6 * L * (0.6 + 0.4 * pulse)).toFixed(2) + 'px rgba(' + M + ',' + (0.95 * L).toFixed(2) + '))';
      textShadowEl.style.textShadow = L > 0.01 ? '0 0 ' + (4 * L).toFixed(1) + 'px rgba(' + M + ',' + (0.45 * L * (0.7 + 0.3 * pulse)).toFixed(2) + ')' : '';
      if (reduce) return;
      var ar = ang * Math.PI / 180, ox = x + 8, oy = top + 16 + ty, lx = 0.34 * sz, ly = -0.66 * sz;
      var mx = ox + (lx * Math.cos(ar) - ly * Math.sin(ar)) * sc, my = oy + (lx * Math.sin(ar) + ly * Math.cos(ar)) * sc;
      var cx = x + sz * 0.5, cy = top + sz * 0.45, gr;
      if (L > 0) {
        gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
        gr.addColorStop(0, 'rgba(' + M + ',' + 0.24 * L * (0.7 + 0.3 * pulse) + ')'); gr.addColorStop(0.5, 'rgba(' + M + ',' + 0.06 * L + ')'); gr.addColorStop(1, 'rgba(' + M + ',0)');
        ctx.fillStyle = gr; ctx.fillRect(cx - 22, cy - 22, 44, 44);
      }
      if (s.on && L > 0.2 && Math.random() < 0.35) s.v.push({ x: mx, y: my, vx: (Math.random() - 0.4) * 0.03, vy: -(0.1 + Math.random() * 0.08), life: 0, max: 40 + Math.random() * 30, ph: Math.random() * TAU });
      s.v = s.v.filter(function (v) {
        v.life++; var q = v.life / v.max; v.x += v.vx + Math.sin(v.life * 0.07 + v.ph) * 0.05; v.y += v.vy;
        var r = 0.7 + q * 3.2, al = 0.22 * Math.sin(Math.PI * q) * L, g2 = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, r);
        g2.addColorStop(0, 'rgba(' + LC + ',' + al + ')'); g2.addColorStop(1, 'rgba(' + LC + ',0)'); ctx.fillStyle = g2; ctx.fillRect(v.x - r, v.y - r, 2 * r, 2 * r);
        return q < 1;
      });
      if (s.on && L > 0.4 && Math.random() < 0.16) s.sk.push({ x: cx + (Math.random() - 0.5) * 18, y: top - 2 - Math.random() * 14, life: 0, max: 26 + Math.random() * 26 });
      s.sk = s.sk.filter(function (k) {
        k.life++; var q = k.life / k.max, al = Math.sin(Math.PI * q), r = 0.4 + al;
        ctx.strokeStyle = 'rgba(' + M + ',' + al + ')'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.moveTo(k.x - r, k.y); ctx.lineTo(k.x + r, k.y); ctx.moveTo(k.x, k.y - r); ctx.lineTo(k.x, k.y + r); ctx.stroke();
        ctx.fillStyle = 'rgba(' + WC + ',' + al + ')'; ctx.fillRect(k.x - 0.25, k.y - 0.25, 0.5, 0.5); return q < 1;
      });
      if (s.on && p > 0.55 && Math.random() < 0.18) s.b.push({ x: mx + (Math.random() - 0.5) * 1.4, y: my, r: 0.45 + Math.pow(Math.random(), 2) * 1.2, vx: (Math.random() - 0.4) * 0.06, vy: -(0.12 + Math.random() * 0.14), ph: Math.random() * TAU, f: 0.05 + Math.random() * 0.05, amp: 0.04 + Math.random() * 0.07, life: 0, top: OY - 40 + Math.random() * 9 });
      s.b = s.b.filter(function (b) {
        b.life++; b.vy *= 1.006; b.y += b.vy; b.x += b.vx + Math.sin(b.ph + b.life * b.f) * b.amp;
        if (b.y < b.top) { s.fx.push({ x: b.x, y: b.y, r: b.r, t: 0 }); if (canPlay() && s.on) blip(b.r); return false; }
        var r = b.r; ctx.globalAlpha = Math.min(1, b.life / 10); ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU);
        var g3 = ctx.createRadialGradient(b.x - r * 0.35, b.y - r * 0.4, r * 0.05, b.x, b.y, r);
        g3.addColorStop(0, 'rgba(255,255,255,.98)'); g3.addColorStop(0.5, 'rgba(' + LC + ',.55)'); g3.addColorStop(1, 'rgba(' + M + ',.9)');
        ctx.fillStyle = g3; ctx.fill(); ctx.lineWidth = 0.34; ctx.strokeStyle = 'rgba(' + DK + ',.95)'; ctx.stroke(); ctx.globalAlpha = 1;
        return true;
      });
      s.fx = s.fx.filter(function (q) {
        q.t++; var k = q.t / 9, rr = q.r + 0.6 + k * 1.6;
        ctx.strokeStyle = 'rgba(' + DK + ',' + 0.7 * (1 - k) + ')'; ctx.lineWidth = 0.34;
        for (var j = 0; j < 6; j++) { var an = j * 1.047 + 0.3; ctx.beginPath(); ctx.moveTo(q.x + Math.cos(an) * (rr - 0.6), q.y + Math.sin(an) * (rr - 0.6)); ctx.lineTo(q.x + Math.cos(an) * rr, q.y + Math.sin(an) * rr); ctx.stroke(); }
        return q.t < 9;
      });
    }
    function on() { s.on = true; if (!raf) raf = requestAnimationFrame(frame); }
    function off() { s.on = false; }
    a.addEventListener('mouseenter', on); a.addEventListener('mouseleave', off);
    a.addEventListener('focus', on); a.addEventListener('blur', off);
  }

  function setSound(v) {
    soundOn = !!v;
    try { localStorage.setItem(KEY, soundOn ? '1' : '0'); } catch (e) {}
    if (soundOn && ensureAudio()) { audio.resume(); clink(); } else if (audio) audio.suspend();
    document.querySelectorAll('[data-lab-sound]').forEach(function (b) { b.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); });
  }
  window.LabTube = { setSound: setSound, isSoundOn: function () { return soundOn; } };

  function init() {
    document.querySelectorAll('[data-lab-sound]').forEach(function (b) {
      b.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
      b.addEventListener('click', function () { setSound(!soundOn); });
    });
    // El audio solo puede arrancar tras un gesto: si estaba activado, se reanuda en el primer clic/tecla.
    if (soundOn) { var wake = function () { if (ensureAudio()) audio.resume(); window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); }; window.addEventListener('pointerdown', wake); window.addEventListener('keydown', wake); }
    if (!fine) return;
    document.querySelectorAll('[data-lab-tube]').forEach(mount);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
