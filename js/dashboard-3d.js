/* ═══════════════════════════════════════════════
   dashboard-3d.js: marco de cristal del dashboard del hero
   ─────────────────────────────────────────────────
   Solo cambia el comportamiento visual de .dashboard-frame (dentro de .hero-right).
   El contenido (KPIs, gráficos, tabla) no se toca y sigue plano: lo que crea el script
   son capas nuevas, todas aria-hidden y sin pointer-events:
     · grosor de cristal: una pila de láminas translúcidas desplazadas hacia abajo y a la
       derecha, que se ve aunque el marco casi no gire
     · lámina de cristal sobre el frente (reflejo, borde y viñeta)
     · sombra de profundidad (hermana del marco) y brillo que sigue al cursor
   El movimiento es un detalle: unos pocos grados y unos pocos píxeles.
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

  var LAYERS = 18;                  /* láminas del grosor */
  var EX = 10, EY = 12;             /* desplazamiento del fondo del grosor en reposo, px */
  var REST_RX = 1.2, REST_RY = -3;  /* pose en reposo, grados */
  var LIFT = 5;                     /* translateZ con el ratón encima, px */
  var TILT = 3.5;                   /* giro máximo hacia el cursor, grados */
  var FLOAT = .15;                  /* flotación en reposo, grados */
  var K_CURSOR = .06, K_HOVER = .05;   /* suavizado por fotograma */
  var EPS = .02;                    /* giro mínimo: con el marco exactamente de frente Chrome lo trata como plano y las láminas se pintan encima */

  var edge, shadow, glass, glare;   /* capas creadas */
  var active = false, visible = false, raf = 0, io = null;
  var px = 0, py = 0, hasPointer = false;
  var cx = 0, cy = 0;               /* cursor suavizado, -1..1 respecto al centro del marco */
  var h = 1;                        /* 0 = reposo, 1 = de frente: arranca de frente y se asienta */
  var glareOn = false;
  var ready = false;                /* el grosor se muestra tras el primer fotograma: antes de eso Chrome puede pintar las láminas planas, sobre el fondo del marco */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function el(cls) { var d = document.createElement('div'); d.className = cls; return d; }

  function build() {
    var r = parseFloat(getComputedStyle(frame).borderTopLeftRadius) || 10;
    var i, t, g, lay;

    edge = el('df3d-edge');
    edge.setAttribute('aria-hidden', 'true');
    edge.style.setProperty('--r', r + 'px');
    edge.style.setProperty('--ex', EX + 'px');
    edge.style.setProperty('--ey', EY + 'px');

    /* láminas: de la pegada al frente (i = 0) a la más lejana (i = LAYERS - 1). Ninguna en z = 0, para no pisar el plano del marco.
       Al apilarse, cerca del frente se acumula más opacidad y hacia fuera se aclara: el borde se desvanece como un cristal */
    for (i = 0; i < LAYERS; i++) {
      t = (i + 1) / LAYERS;
      lay = el('df3d-layer');
      lay.style.setProperty('--t', t.toFixed(3));
      g = Math.round(lerp(150, 236, t));   /* gris neutro: el canto no lleva tinte */
      lay.style.background = 'rgba(' + g + ',' + g + ',' + g + ',' + lerp(.22, .17, t).toFixed(3) + ')';
      edge.appendChild(lay);
    }
    frame.insertBefore(edge, frame.firstChild);
    /* sin transform el marco no abre el contexto 3D y las láminas se verían planas sobre el fondo hasta el primer fotograma */
    frame.style.transform = 'translateZ(' + LIFT + 'px) rotateX(' + EPS + 'deg) rotateY(' + EPS + 'deg)';

    glass = el('df3d-glass');
    glass.setAttribute('aria-hidden', 'true');
    frame.appendChild(glass);

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
    var ry = REST_RY * rest + cx * TILT + Math.sin(now / 1800) * FLOAT * rest + EPS;
    var rx = REST_RX * rest - cy * TILT * .75 + Math.cos(now / 2300) * FLOAT * rest + EPS;
    var z = LIFT * h;

    frame.style.transform = 'translateZ(' + z.toFixed(2) + 'px) rotateX(' + rx.toFixed(3) + 'deg) rotateY(' + ry.toFixed(3) + 'deg)';
    /* el grosor se asoma más por el lado que el marco se aleja del cursor */
    edge.style.setProperty('--ex', (EX - ry * 1.2).toFixed(2) + 'px');
    edge.style.setProperty('--ey', (EY + rx * 1.2).toFixed(2) + 'px');
    /* el reflejo se desliza al revés que el giro */
    glass.style.setProperty('--sx', (-ry * 5).toFixed(1) + '%');
    shadow.style.transform = 'translate(' + (-ry * 8).toFixed(2) + 'px,' + (30 + rx * 6 + z * .8).toFixed(2) + 'px) scale(' + (1 - z / 500).toFixed(4) + ')';
    shadow.style.opacity = (.42 - z / 300).toFixed(3);

    if (over) {
      glare.style.setProperty('--gx', clamp((px - left) / w * 100, 0, 100).toFixed(1) + '%');
      glare.style.setProperty('--gy', clamp((py - top) / ht * 100, 0, 100).toFixed(1) + '%');
    }
    if (over !== glareOn) { glareOn = over; glare.classList.toggle('is-on', over); }
    if (!ready) { ready = true; right.classList.add('df3d-ready'); }
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
    [edge, glass, glare, shadow].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
    frame.style.transform = '';
    right.classList.remove('df3d-on', 'df3d-ready');
    cx = cy = 0; h = 1; glareOn = false; hasPointer = false; ready = false;
  }

  function sync() { (mqDesk.matches && !mqReduce.matches) ? on() : off(); }
  sync();
  mqDesk.addEventListener('change', sync);
  mqReduce.addEventListener('change', sync);
})();
