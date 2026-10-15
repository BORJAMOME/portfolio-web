/* ═══════════════════════════════════════════════
   roma-aeterna/touch.js: capa táctil para jugar en el móvil
   ─────────────────────────────────────────────────
   Caesar III se diseñó para ratón: la barra superior mide 24 px y los botones del
   panel derecho, poco más. Con el dedo (unos 40 pt de contacto) es casi imposible
   acertar. Esta capa reparte los toques:

   · Mapa de la ciudad → pasan tal cual al motor (arrastrar, construir, pellizcar).
   · Interfaz (barra superior, panel derecho, cualquier ventana o diálogo) → toque de
     precisión: el toque se convierte en ratón; si mantienes o deslizas, aparece una
     lupa que amplía lo que hay bajo el dedo y el clic se hace al soltar.
   · Imán superior: un toque cerca del borde de arriba se coloca sobre la barra.
   · Centro de mando: botones grandes para consejeros, capas, guardar, cargar…

   El motor dice qué es mapa y qué es interfaz con las funciones ra_* (augustus.c).
   ═══════════════════════════════════════════════ */
(function () {
  "use strict";

  const canvas = document.getElementById("canvas");
  const stage = document.getElementById("stage");
  const TOP_BAR = 24;          // alto de la barra superior (px lógicos)
  const TOP_MAGNET = 40;       // toques por encima de esta línea van a la barra
  const HOLD_MS = 140;         // a partir de aquí aparece la lupa
  const LOUPE_ZOOM = 2.4;

  /* La lupa copia píxeles del lienzo WebGL: hay que conservar el último fotograma */
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (this === canvas && /webgl/.test(type)) attrs = Object.assign({}, attrs, { preserveDrawingBuffer: true });
    return getContext.call(this, type, attrs);
  };

  const enabled = () => { try { return localStorage.getItem("ra.precision") !== "false"; } catch (e) { return true; } };
  const engine = () => {
    const M = window.Module;
    return M && typeof M._ra_is_city === "function" && M._ra_screen_w() > 0 ? M : null;
  };

  function toLogical(cx, cy) {
    const r = canvas.getBoundingClientRect(), M = engine();
    return { x: (cx - r.left) * M._ra_screen_w() / r.width, y: (cy - r.top) * M._ra_screen_h() / r.height, r };
  }
  function toClient(lx, ly) {
    const r = canvas.getBoundingClientRect(), M = engine();
    return { x: r.left + lx * r.width / M._ra_screen_w(), y: r.top + ly * r.height / M._ra_screen_h() };
  }

  // ¿Este punto es interfaz (precisión) o mapa (táctil normal)?
  function classify(lx, ly) {
    const M = engine();
    if (!M._ra_is_city()) return "ui";                    // menús, consejeros, diálogos…
    if (ly < TOP_MAGNET) return "top";
    const vx = M._ra_view(0), vy = M._ra_view(1), vw = M._ra_view(2), vh = M._ra_view(3);
    const inMap = lx >= vx && lx < vx + vw && ly >= vy && ly < vy + vh;
    return inMap ? "map" : "ui";
  }

  /* ---------- Ratón sintético ---------- */
  function mouse(type, cx, cy, buttons) {
    canvas.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: cx, clientY: cy, screenX: cx, screenY: cy,
      button: 0, buttons: buttons || 0, view: window
    }));
  }

  /* ---------- Lupa ---------- */
  const loupe = document.createElement("div");
  loupe.className = "loupe"; loupe.hidden = true; loupe.setAttribute("aria-hidden", "true");
  const lc = document.createElement("canvas");
  loupe.appendChild(lc);
  document.body.appendChild(loupe);
  const aim = document.createElement("div");
  aim.className = "aim"; aim.hidden = true; aim.setAttribute("aria-hidden", "true");
  document.body.appendChild(aim);

  function drawLoupe(cx, cy) {
    const size = 128, dpr = Math.min(3, window.devicePixelRatio || 1);
    if (lc.width !== size * dpr) { lc.width = size * dpr; lc.height = size * dpr; }
    const r = canvas.getBoundingClientRect();
    const kx = canvas.width / r.width, ky = canvas.height / r.height;   // CSS → búfer
    const span = size / LOUPE_ZOOM;                                      // zona CSS que se amplía
    const sx = (cx - r.left - span / 2) * kx, sy = (cy - r.top - span / 2) * ky;
    const g = lc.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#000"; g.fillRect(0, 0, lc.width, lc.height);
    try { g.drawImage(canvas, sx, sy, span * kx, span * ky, 0, 0, lc.width, lc.height); } catch (e) {}
    // la lupa va por encima del dedo; si no cabe, debajo
    let top = cy - size - 56;
    if (top < 6) top = cy + 56;
    let left = Math.min(Math.max(cx - size / 2, 6), innerWidth - size - 6);
    loupe.style.transform = "translate(" + left + "px," + top + "px)";
    aim.style.transform = "translate(" + (cx - 9) + "px," + (cy - 9) + "px)";
  }

  /* ---------- Gesto de precisión ---------- */
  let g = null;   // gesto en curso: { id, kind, start, x, y, held, timer }

  function point(t, kind) {
    let cx = t.clientX, cy = t.clientY;
    if (kind === "top") {                                  // imán: a la mitad de la barra
      const p = toClient(0, TOP_BAR / 2);
      cy = p.y;
    }
    return { cx, cy };
  }
  function showLoupe() {
    if (!g) return;
    g.held = true;
    loupe.hidden = false; aim.hidden = false;
    drawLoupe(g.cx, g.cy);
  }
  function end(cancel) {
    if (!g) return;
    clearTimeout(g.timer);
    if (!cancel) {
      mouse("mousemove", g.cx, g.cy, 0);
      mouse("mousedown", g.cx, g.cy, 1);
      const { cx, cy } = g;
      setTimeout(() => mouse("mouseup", cx, cy, 0), 45);
    }
    loupe.hidden = true; aim.hidden = true;
    g = null;
  }

  stage.addEventListener("touchstart", (e) => {
    if (!enabled() || !engine()) return;
    if (g) { if (e.touches.length > 1) end(true); return; }  // segundo dedo: cancela la precisión
    if (e.touches.length !== 1) return;
    const t = e.changedTouches[0];
    const L = toLogical(t.clientX, t.clientY);
    if (L.x < 0 || L.y < 0) return;
    const kind = classify(L.x, L.y);
    if (kind === "map") return;                              // el mapa lo gestiona el motor
    e.preventDefault(); e.stopPropagation();
    const p = point(t, kind);
    g = { id: t.identifier, kind, start: performance.now(), cx: p.cx, cy: p.cy, held: false };
    mouse("mousemove", g.cx, g.cy, 0);
    g.timer = setTimeout(showLoupe, HOLD_MS);
  }, { capture: true, passive: false });

  stage.addEventListener("touchmove", (e) => {
    if (!g) return;
    const t = [...e.changedTouches].find((x) => x.identifier === g.id);
    if (!t) return;
    e.preventDefault(); e.stopPropagation();
    // al deslizar se apunta con libertad (sin imán), para recorrer los menús desplegados
    g.cx = t.clientX; g.cy = t.clientY;
    if (g.kind === "top" && engine()) {
      const L = toLogical(t.clientX, t.clientY);
      if (L.y < TOP_BAR) g.cy = toClient(0, TOP_BAR / 2).y;
    }
    if (!g.held) showLoupe();
    mouse("mousemove", g.cx, g.cy, 0);
    drawLoupe(g.cx, g.cy);
  }, { capture: true, passive: false });

  stage.addEventListener("touchend", (e) => {
    if (!g) return;
    if (![...e.changedTouches].some((x) => x.identifier === g.id)) return;
    e.preventDefault(); e.stopPropagation();
    end(false);
  }, { capture: true, passive: false });

  stage.addEventListener("touchcancel", (e) => {
    if (!g) return;
    e.stopPropagation();
    end(true);
  }, { capture: true });

  /* La lupa sigue viva mientras el dedo está quieto (el juego anima) */
  (function tick() {
    if (g && g.held) drawLoupe(g.cx, g.cy);
    requestAnimationFrame(tick);
  })();

  window.RA_TOUCH = { classify, engine };
})();
