/* ═══════════════════════════════════════════════
   footer-lamp.js: luz de la azotea del pie
   ─────────────────────────────────────────────────
   Hace parpadear la luz de la puerta en cada [data-lamp-root] (el <footer>).
   Solo cambia la opacidad de los parches [data-lamp-dark] y de las capas
   [data-lamp-halo|glow|core]. Corre solo con el pie a la vista y no arranca
   con prefers-reduced-motion: la luz se queda encendida y quieta.
   La luz espera a que cargue la imagen (lazy) para no verse sola sobre el negro.
   ═══════════════════════════════════════════════ */
(function () {
  [].forEach.call(document.querySelectorAll('[data-lamp-root] .foot-art'), function (art) {
    var img = art.querySelector('.foot-art-img');
    if (!img || img.complete) return;
    art.classList.add('is-loading');
    var ready = function () { art.classList.remove('is-loading'); };
    img.addEventListener('load', ready, { once: true });
    img.addEventListener('error', ready, { once: true });
  });

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var roots = [].slice.call(document.querySelectorAll('[data-lamp-root]'));
  if (!roots.length) return;

  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };

  function cycle() {
    var q = [{ d: rnd(3500, 8500), a: 1, b: 1 }], i, n;
    if (Math.random() < .62) {
      for (i = 0, n = Math.floor(rnd(3, 6)); i < n; i++) {
        q.push({ d: rnd(25, 110), a: rnd(0, .4), b: rnd(0, .4) });
        q.push({ d: rnd(45, 190), a: rnd(.75, 1), b: 1 });
      }
      q.push({ d: 130, a: .35, b: 0, e: 1 });
      q.push({ d: rnd(900, 2000), a: 0, b: 0 });
      for (i = 0, n = Math.floor(rnd(2, 4)); i < n; i++) {
        q.push({ d: rnd(50, 130), a: rnd(.25, .7), b: rnd(.25, .7) });
        q.push({ d: rnd(90, 220), a: 0, b: 0 });
      }
      q.push({ d: 520, a: 0, b: 1, e: 1 });
    } else {
      q.push({ d: rnd(60, 120), a: .9, b: rnd(.3, .5) });
      q.push({ d: rnd(120, 260), a: rnd(.3, .5), b: rnd(.3, .5) });
      q.push({ d: 220, a: .5, b: 1, e: 1 });
    }
    return q;
  }

  var lamps = roots.map(function (root) {
    var L = {
      dark: [].slice.call(root.querySelectorAll('[data-lamp-dark]')),
      glow: root.querySelector('[data-lamp-glow]'),
      halo: root.querySelector('[data-lamp-halo]'),
      core: root.querySelector('[data-lamp-core]'),
      vis: false, q: cycle(), i: 0, t0: performance.now()
    };
    if (!L.glow || !L.halo || !L.core) return null;
    L.apply = function (I, t) {
      var hum = I > .9 ? 1 + Math.sin(t * .047) * .012 + Math.sin(t * .131) * .008 : 1;
      var v = Math.max(0, Math.min(1, I * hum));
      L.dark.forEach(function (d) { d.style.opacity = ((1 - v) * .94).toFixed(3); });
      L.glow.style.opacity = Math.pow(v, 1.5).toFixed(3);
      L.halo.style.opacity = Math.pow(v, 2.2).toFixed(3);
      L.core.style.opacity = Math.pow(v, 3).toFixed(3);
    };
    new IntersectionObserver(function (e) {
      L.vis = e[0].isIntersecting;
      if (!L.vis) L.apply(1, 0); else L.t0 = performance.now();
    }, { threshold: .25 }).observe(root);
    return L;
  }).filter(Boolean);

  function tick(now) {
    requestAnimationFrame(tick);
    lamps.forEach(function (L) {
      if (!L.vis) return;
      var s = L.q[L.i], el = now - L.t0;
      while (el >= s.d) {
        el -= s.d; L.t0 += s.d; L.i++;
        if (L.i >= L.q.length) { L.q = cycle(); L.i = 0; }
        s = L.q[L.i];
      }
      var p = el / s.d, k = s.e ? ease(p) : p;
      L.apply(s.a + (s.b - s.a) * k, now);
    });
  }
  requestAnimationFrame(tick);
})();
