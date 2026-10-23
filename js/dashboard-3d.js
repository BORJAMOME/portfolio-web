/* ═══════════════════════════════════════════════
   dashboard-3d.js: marco 3D del dashboard del hero
   ─────────────────────────────────────────────────
   Solo cambia el comportamiento visual de .dashboard-frame (dentro de .hero-right).
   El contenido (KPIs, gráficos, tabla) no se toca y sigue plano: lo que crea el script
   son capas nuevas, todas aria-hidden y sin pointer-events:
     · grosor de aluminio (20 px): 17 láminas para las esquinas + 4 caras laterales
     · sombra proyectada (hermana del marco)
     · brillo que sigue al cursor
   El estilo está en css/home.css, bajo .hero-right.df3d-on.
   Solo se activa con ratón real, escritorio y sin prefers-reduced-motion; si cambia
   alguna de esas condiciones, se desmonta y el marco vuelve a ser el de siempre.
   El bucle se para cuando el dashboard no está en pantalla.
   ═══════════════════════════════════════════════ */
(function () {
  var right = document.querySelector('.hero-right');
  var frame = right && right.querySelector('.dashboard-frame');
  var hero = document.getElementById('hero');
  if (!right || !frame || !hero) return;

  var mqDesk = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)');
  var mqReduce = matchMedia('(prefers-reduced-motion: reduce)');

  var DEPTH = 20;          /* grosor del marco, px */
  var LAYERS = 17;         /* láminas de las esquinas */
  var REST_RX = 5, REST_RY = -12;   /* pose en reposo: se ve el canto */
  var LIFT = 18;           /* translateZ con el ratón encima */
  var TILT = 14;           /* grados de giro máximo hacia el cursor */
  var K_CURSOR = .08, K_HOVER = .07;   /* suavizado por fotograma */

  var edge, shadow, glare;          /* capas creadas */
  var active = false, visible = false, raf = 0, io = null;
  var px = 0, py = 0, hasPointer = false;
  var cx = 0, cy = 0;               /* cursor suavizado, -1..1 respecto al centro del marco */
  var h = 1;                        /* 0 = reposo, 1 = de frente: arranca de frente y se asienta en el canto */
  var glareOn = false;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function el(cls) { var d = document.createElement('div'); d.className = cls; return d; }

  function build() {
    var r = parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 10;
    var i, t, c, lay;

    edge = el('df3d-edge');
    edge.setAttribute('aria-hidden', 'true');
    edge.style.setProperty('--r', r + 'px');

    /* láminas: del frente (claras) al fondo (oscuras). Ninguna en z = 0, para no pisar el plano del marco */
    for (i = 0; i < LAYERS; i++) {
      t = i / (LAYERS - 1);
      c = Math.round(200 - 70 * t) + ',' + Math.round(200 - 70 * t) + ',' + Math.round(208 - 68 * t);
      lay = el('df3d-layer');
      lay.style.background = 'rgb(' + c + ')';
      lay.style.transform = 'translateZ(' + (-(1 + t * (DEPTH - 1))).toFixed(2) + 'px)';
      edge.appendChild(lay);
    }
    ['r', 'l', 't', 'b'].forEach(function (s) { edge.appendChild(el('df3d-face df3d-face--' + s)); });
    frame.insertBefore(edge, frame.firstChild);

    glare = el('df3d-glare');
    glare.setAttribute('aria-hidden', 'true');
    frame.appendChild(glare);

    shadow = el('df3d-shadow');
    shadow.setAttribute('aria-hidden', 'true');
    right.insertBefore(shadow, right.firstChild);
  }

  function onMove(e) {
    if (e.pointerType === 'touch') return;
    px = e.clientX; py = e.clientY; hasPointer = true;
  }
  function onLeave() { hasPointer = false; }

  function tick(now) {
    raf = visible ? requestAnimationFrame(tick) : 0;

    /* caja del marco SIN transformar (la que dejan offset*), en pantalla; k recoge el scale(.92) de .hero-right a ≤1050 px */
    var rr = right.getBoundingClientRect();
    var k = right.offsetWidth ? rr.width / right.offsetWidth : 1;
    var w = frame.offsetWidth * k, ht = frame.offsetHeight * k;
    var left = rr.left + frame.offsetLeft * k, top = rr.top + frame.offsetTop * k;
    var hr = hero.getBoundingClientRect();

    var inHero = hasPointer && px >= hr.left && px <= hr.right && py >= hr.top && py <= hr.bottom;
    var over = inHero && px >= left && px <= left + w && py >= top && py <= top + ht;

    var tx = inHero ? clamp((px - (left + w / 2)) / (w / 2), -1, 1) : 0;
    var ty = inHero ? clamp((py - (top + ht / 2)) / (ht / 2), -1, 1) : 0;
    cx += (tx - cx) * K_CURSOR;
    cy += (ty - cy) * K_CURSOR;
    h += ((over ? 1 : 0) - h) * K_HOVER;

    var rest = 1 - h;
    var ry = REST_RY * rest + cx * TILT + Math.sin(now / 1800) * .5 * rest;
    var rx = REST_RX * rest - cy * TILT * .75 + Math.cos(now / 2300) * .4 * rest;
    var z = LIFT * h;

    frame.style.transform = 'translateZ(' + z.toFixed(2) + 'px) rotateX(' + rx.toFixed(3) + 'deg) rotateY(' + ry.toFixed(3) + 'deg)';
    shadow.style.transform = 'translate(' + (-ry * 2.6).toFixed(2) + 'px,' + (40 + rx * 2 + z * .5).toFixed(2) + 'px) scale(' + (1 - z / 400).toFixed(4) + ')';
    shadow.style.opacity = (.42 - z / 300).toFixed(3);

    if (over) {
      glare.style.setProperty('--gx', clamp((px - left) / w * 100, 0, 100).toFixed(1) + '%');
      glare.style.setProperty('--gy', clamp((py - top) / ht * 100, 0, 100).toFixed(1) + '%');
    }
    if (over !== glareOn) { glareOn = over; glare.classList.toggle('is-on', over); }
  }

  function start() { if (!raf) raf = requestAnimationFrame(tick); }

  function on() {
    if (active) return;
    active = true;
    build();
    right.classList.add('df3d-on');
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    io = new IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      if (visible) start();
    }, { threshold: 0 });
    io.observe(frame);
  }

  function off() {
    if (!active) return;
    active = false; visible = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (io) io.disconnect();
    io = null;
    window.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    [edge, glare, shadow].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
    frame.style.transform = '';
    right.classList.remove('df3d-on');
    cx = cy = 0; h = 1; glareOn = false; hasPointer = false;
  }

  function sync() { (mqDesk.matches && !mqReduce.matches) ? on() : off(); }
  sync();
  mqDesk.addEventListener('change', sync);
  mqReduce.addEventListener('change', sync);
})();
