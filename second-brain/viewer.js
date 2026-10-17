/* ═══════════════════════════════════════════════
   second-brain/viewer.js: escena 3D de Second Brain (Three.js)
   ─────────────────────────────────────────────────
   Módulo ES. Solo DIBUJA un snapshot ya calculado: no lee documentos, no llama a ningún
   modelo y no conoce credenciales. Recibe el espacio de nombres de Three.js por parámetro
   (vendor/three-…-sb.js, un paquete recortado con solo lo que se usa).

   Rendimiento
   · Dibujo bajo demanda: no hay bucle de animación permanente; solo se pinta al interactuar,
     durante una transición de cámara o la inercia. En reposo, 0 fotogramas.
   · Un InstancedMesh por forma (7 llamadas de dibujo para todos los nodos) y un único
     LineSegments para las relaciones.
   · Etiquetas en HTML y solo las necesarias (máx. 24), sin solaparse.
   · Resolución limitada a 2× y recursos liberados en dispose().
   ═══════════════════════════════════════════════ */

const BG = '#121a2a';
export const STATE_COLOR = {
  respaldado: '#5b9bff',        // azul: conocimiento respaldado por evidencias
  mencionado: '#aab3c5',        // gris claro: mencionado, sin práctica detectable
  pendiente: '#778197',         // gris: pendiente de validar
  brecha_probable: '#778197',   // gris + anillo
  brecha_confirmada: '#778197', // gris + doble anillo
  oportunidad: '#e3a83b',       // ámbar: recomendaciones y oportunidades
  neutral: '#e9e4d8',           // objetivos y referencias (no es un estado de conocimiento)
};
const EDGE_COLOR = {
  usa: '#6f86b3', 'parte-de': '#6f86b3', requiere: '#7d93bf', mejora: '#6fa08f', habilita: '#6fa08f',
  demuestra: '#4f7fd1', agrupa: '#566178', necesita: '#566178', recomienda: '#b98a2e',
};
const CAP_LABELS = 24;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createViewer(container, T, options = {}) {
  const reduced = () => !!(options.reducedMotion ? options.reducedMotion() : (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches));
  const ac = new AbortController();
  const { signal } = ac;
  const cb = { select: options.onSelect || (() => {}), hover: options.onHover || (() => {}), lost: options.onContextLost || (() => {}) };

  /* ── Renderer, escena y cámara ── */
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new T.Color(BG));
  const canvas = renderer.domElement;
  canvas.className = 'sb-canvas';
  container.appendChild(canvas);
  const scene = new T.Scene();
  scene.fog = new T.Fog(new T.Color(BG), 100, 600);   // se ajusta a la distancia de la cámara en cada fotograma
  const camera = new T.PerspectiveCamera(45, 1, 1, 2000);
  scene.add(new T.HemisphereLight(0xffffff, 0x8792b0, 2.1));
  const sun = new T.DirectionalLight(0xffffff, 1.2);
  sun.position.set(60, 90, 80);
  scene.add(sun);

  const labelsEl = document.createElement('div');
  labelsEl.className = 'sb-labels';
  labelsEl.setAttribute('aria-hidden', 'true');
  container.appendChild(labelsEl);

  /* ── Estado de la vista ── */
  const view = { theta: 0.6, phi: 1.15, radius: 260, target: new T.Vector3() };
  let fitRadius = 260;
  let data = null;               // { nodes, edges, regions, index, adj, rec }
  let visible = null;            // Set de ids visibles (null = todos)
  let edgeTypes = null;          // Set de tipos de relación visibles (null = todos)
  let selected = null, hovered = null;
  let showRegions = true;
  let tween = null;
  const vel = { theta: 0, phi: 0 };
  let raf = 0, disposed = false, needsHalo = true, frames = 0;
  let size = { w: 1, h: 1 };

  /* ── Geometrías por forma (compartidas) ── */
  const GEOS = {
    tecnologia: new T.SphereGeometry(1, 20, 14),
    concepto: new T.IcosahedronGeometry(1.15, 1),
    tecnica: new T.OctahedronGeometry(1.3, 0),
    competencia: new T.DodecahedronGeometry(1.25, 0),
    proyecto: new T.BoxGeometry(1.7, 1.7, 1.7),
    objetivo: new T.TorusGeometry(1, 0.38, 10, 28),
    recomendacion: new T.ConeGeometry(1.2, 2.1, 4),
  };
  const matNode = new T.MeshLambertMaterial({ color: 0xffffff });
  const haloGeo = new T.RingGeometry(1.45, 1.8, 40);
  const matHalo = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, fog: false, transparent: true, opacity: 0.9 });
  const selGeo = new T.RingGeometry(1.9, 2.15, 48);
  const matSel = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, fog: false, depthTest: false, transparent: true, opacity: 0.95 });
  const selRing = new T.Mesh(selGeo, matSel);
  selRing.visible = false; selRing.renderOrder = 10;
  scene.add(selRing);

  let meshes = {};               // tipo → { mesh, ids[] }
  let haloMesh = null, haloItems = [];
  let lines = null, hiLines = null;
  const tmpM = new T.Matrix4(), tmpV = new T.Vector3(), tmpQ = new T.Quaternion(), tmpS = new T.Vector3(), tmpC = new T.Color();
  const bgColor = new T.Color(BG);

  const radiusOf = (n) => 1.9 + n.size * 3.2;

  /* ── Construcción de la escena a partir del snapshot ── */
  function clearScene() {
    for (const k of Object.keys(meshes)) { scene.remove(meshes[k].mesh); meshes[k].mesh.dispose(); }
    meshes = {};
    if (haloMesh) { scene.remove(haloMesh); haloMesh.dispose(); haloMesh = null; }
    for (const l of [lines, hiLines]) if (l) { scene.remove(l); l.geometry.dispose(); l.material.dispose(); }
    lines = hiLines = null;
  }

  function setData(snapshot) {
    clearScene();
    const nodes = snapshot.nodes;
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const adj = new Map(nodes.map((n) => [n.id, []]));
    snapshot.edges.forEach((e, i) => { adj.get(e.source).push([e.target, i]); adj.get(e.target).push([e.source, i]); });
    const bucket = new Map();     // nodeId → bucket de su recomendación (para el anillo ámbar)
    for (const r of snapshot.recommendations) { bucket.set(r.targetId, r.priority.bucket); bucket.set(r.nodeId, r.priority.bucket); }
    data = { nodes, edges: snapshot.edges, regions: snapshot.regions, index, adj, bucket };

    const byType = {};
    nodes.forEach((n) => { (byType[n.type] ||= []).push(n); });
    for (const [type, list] of Object.entries(byType)) {
      const geo = GEOS[type] || GEOS.concepto;
      const mesh = new T.InstancedMesh(geo, matNode, list.length);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
      meshes[type] = { mesh, ids: list.map((n) => n.id) };
    }
    haloItems = nodes.filter((n) => n.state === 'brecha_probable' || n.state === 'brecha_confirmada' || bucket.get(n.id) === 'ahora');
    if (haloItems.length) {
      haloMesh = new T.InstancedMesh(haloGeo, matHalo, haloItems.length * 2);
      haloMesh.frustumCulled = false; haloMesh.renderOrder = 5;
      haloMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      scene.add(haloMesh);
    }
    visible = null; edgeTypes = null; selected = null; hovered = null;
    applyNodes(); applyEdges(); fitView(true); requestRender();
  }

  const isVisible = (id) => !visible || visible.has(id);

  /* Posición, tamaño y color de cada instancia. Los ocultos se colapsan a escala 0. */
  function applyNodes() {
    if (!data) return;
    const focusSet = selected ? new Set([selected, ...data.adj.get(selected).map((a) => a[0])]) : null;
    for (const { mesh, ids } of Object.values(meshes)) {
      ids.forEach((id, k) => {
        const n = data.nodes[data.index.get(id)];
        const vis = isVisible(id);
        const s = vis ? radiusOf(n) * (id === selected ? 1.25 : 1) : 0.0001;
        tmpM.makeScale(s, s, s).setPosition(n.pos[0], n.pos[1], n.pos[2]);
        mesh.setMatrixAt(k, tmpM);
        tmpC.set(STATE_COLOR[n.state] || STATE_COLOR.neutral);
        if (focusSet && !focusSet.has(id)) tmpC.lerp(bgColor, 0.72);
        mesh.setColorAt(k, tmpC);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    needsHalo = true;
  }

  function applyEdges() {
    if (!data) return;
    for (const l of [lines, hiLines]) if (l) { scene.remove(l); l.geometry.dispose(); l.material.dispose(); }
    const pos = [], col = [], hpos = [], hcol = [];
    const focusSet = selected ? new Set(data.adj.get(selected).map((a) => a[1])) : null;
    data.edges.forEach((e, i) => {
      const a = data.nodes[data.index.get(e.source)], b = data.nodes[data.index.get(e.target)];
      if (!isVisible(a.id) || !isVisible(b.id)) return;
      const inFocus = focusSet && focusSet.has(i);
      if (!inFocus && edgeTypes && !edgeTypes.has(e.type)) return;
      tmpC.set(EDGE_COLOR[e.type] || '#6f86b3');
      if (inFocus) { hpos.push(...a.pos, ...b.pos); hcol.push(tmpC.r, tmpC.g, tmpC.b, tmpC.r, tmpC.g, tmpC.b); return; }
      tmpC.lerp(bgColor, focusSet ? 0.8 : 0.55);
      pos.push(...a.pos, ...b.pos); col.push(tmpC.r, tmpC.g, tmpC.b, tmpC.r, tmpC.g, tmpC.b);
    });
    const mk = (p, c) => {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(p), 3));
      g.setAttribute('color', new T.BufferAttribute(new Float32Array(c), 3));
      const l = new T.LineSegments(g, new T.LineBasicMaterial({ vertexColors: true }));
      l.frustumCulled = false;
      scene.add(l);
      return l;
    };
    lines = mk(pos, col);
    hiLines = hpos.length ? mk(hpos, hcol) : null;
  }

  /* Anillos que miran a la cámara: brechas (gris) y recomendaciones prioritarias (ámbar). */
  function updateHalos() {
    if (!haloMesh || !data) return;
    camera.getWorldQuaternion(tmpQ);
    let k = 0;
    haloItems.forEach((n) => {
      const vis = isVisible(n.id);
      const s = vis ? radiusOf(n) : 0.0001;
      const amber = data.bucket.get(n.id) === 'ahora';
      tmpC.set(amber ? '#e3a83b' : '#c4cbd8');
      const rings = n.state === 'brecha_confirmada' ? 2 : 1;
      for (let r = 0; r < 2; r++) {
        const sc = r < rings || (r === 0) ? s * (1 + r * 0.28) : 0.0001;
        tmpS.set(sc, sc, sc);
        tmpM.compose(tmpV.set(n.pos[0], n.pos[1], n.pos[2]), tmpQ, tmpS);
        haloMesh.setMatrixAt(k, tmpM);
        haloMesh.setColorAt(k, tmpC);
        k++;
      }
    });
    haloMesh.instanceMatrix.needsUpdate = true;
    if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
  }

  /* ── Cámara ── */
  function placeCamera() {
    const sp = Math.sin(view.phi);
    camera.position.set(
      view.target.x + view.radius * sp * Math.sin(view.theta),
      view.target.y + view.radius * Math.cos(view.phi),
      view.target.z + view.radius * sp * Math.cos(view.theta),
    );
    camera.lookAt(view.target);
    camera.updateMatrixWorld();
  }

  function boundsOf(ids, robust) {
    const pts = (ids || data.nodes.map((n) => n.id)).filter(isVisible).map((id) => data.nodes[data.index.get(id)]);
    if (!pts.length) return { c: new T.Vector3(), r: 60 };
    const c = new T.Vector3();
    pts.forEach((n) => c.add(tmpV.set(...n.pos)));
    c.multiplyScalar(1 / pts.length);
    const ds = pts.map((n) => c.distanceTo(tmpV.set(...n.pos)) + radiusOf(n)).sort((a, b) => a - b);
    // vista general: ignora el 8 % de nodos más alejados para que el grueso del grafo llene la pantalla
    const r = robust && ds.length > 20 ? ds[Math.floor(ds.length * 0.92)] : ds[ds.length - 1];
    return { c, r: Math.max(r, 12) };
  }
  const distanceFor = (r) => (r / Math.sin((camera.fov * Math.PI) / 360)) * (size.w / size.h < 1 ? 1.25 / Math.max(0.55, size.w / size.h) * 0.7 : 1.08);

  function goTo(to, instant) {
    const from = { theta: view.theta, phi: view.phi, radius: view.radius, target: view.target.clone() };
    // camino más corto en el giro horizontal
    let dt = to.theta - from.theta;
    dt -= Math.round(dt / (2 * Math.PI)) * 2 * Math.PI;
    to = { theta: from.theta + dt, phi: clamp(to.phi, 0.08, Math.PI - 0.08), radius: clamp(to.radius, 20, 900), target: to.target };
    vel.theta = vel.phi = 0;
    if (instant || reduced()) { Object.assign(view, { theta: to.theta, phi: to.phi, radius: to.radius }); view.target.copy(to.target); tween = null; }
    else tween = { t0: performance.now(), dur: 650, from, to };
    requestRender();
  }

  function fitView(instant) {
    if (!data) return;
    const b = boundsOf(null, true);
    fitRadius = distanceFor(b.r);
    goTo({ theta: 0.62, phi: 1.12, radius: fitRadius, target: b.c }, instant);
  }

  /* ── Bucle bajo demanda ── */
  function requestRender() { if (!raf && !disposed) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    if (disposed) return;
    frames++;
    let moving = false;
    if (tween) {
      const t = clamp((now - tween.t0) / tween.dur, 0, 1), k = ease(t);
      view.theta = tween.from.theta + (tween.to.theta - tween.from.theta) * k;
      view.phi = tween.from.phi + (tween.to.phi - tween.from.phi) * k;
      view.radius = tween.from.radius + (tween.to.radius - tween.from.radius) * k;
      view.target.lerpVectors(tween.from.target, tween.to.target, k);
      if (t >= 1) tween = null; else moving = true;
    }
    if (Math.abs(vel.theta) > 0.0004 || Math.abs(vel.phi) > 0.0004) {
      view.theta += vel.theta; view.phi = clamp(view.phi + vel.phi, 0.08, Math.PI - 0.08);
      vel.theta *= 0.9; vel.phi *= 0.9; moving = true;
    }
    placeCamera();
    scene.fog.near = view.radius * 0.75; scene.fog.far = view.radius * 2.6 + 80;
    updateHalos();
    needsHalo = false;
    if (selected && data) {
      const n = data.nodes[data.index.get(selected)];
      selRing.visible = isVisible(selected);
      selRing.position.set(...n.pos);
      selRing.quaternion.copy(camera.quaternion);
      selRing.scale.setScalar(radiusOf(n) * 1.25);
    } else selRing.visible = false;
    renderer.render(scene, camera);
    updateLabels();
    if (moving) requestRender();
  }

  /* ── Etiquetas HTML, sin solaparse ── */
  const pool = [];
  function labelEl(i) {
    if (!pool[i]) { const d = document.createElement('div'); d.className = 'sb-label'; labelsEl.appendChild(d); pool[i] = d; }
    return pool[i];
  }
  function updateLabels() {
    if (!data) return;
    const w = size.w, h = size.h;
    const placed = [];
    let used = 0;
    const project = (p) => { tmpV.set(p[0], p[1], p[2]).project(camera); return tmpV.z > 1 ? null : [(tmpV.x * 0.5 + 0.5) * w, (-tmpV.y * 0.5 + 0.5) * h]; };
    const place = (text, p, cls, off) => {
      const s = project(p);
      if (!s || s[0] < -20 || s[0] > w + 20 || s[1] < -10 || s[1] > h + 10) return false;
      const bw = text.length * 6.6 + 14, bh = 22;
      const x = s[0] - bw / 2, y = s[1] + off;
      if (cls !== 'is-sel' && placed.some((r) => x < r[0] + r[2] && x + bw > r[0] && y < r[1] + r[3] && y + bh > r[1])) return false;
      placed.push([x, y, bw, bh]);
      if (used >= CAP_LABELS + data.regions.length) return false;
      const el = labelEl(used++);
      el.textContent = text; el.className = `sb-label ${cls}`; el.style.display = '';
      el.style.transform = `translate(${Math.round(s[0])}px, ${Math.round(s[1] + off)}px) translate(-50%, 0)`;
      return true;
    };
    const near = selected ? new Set(data.adj.get(selected).map((a) => a[0])) : null;
    if (selected && isVisible(selected)) { const n = data.nodes[data.index.get(selected)]; place(n.label, n.pos, 'is-sel', radiusOf(n) * (h / (view.radius * 0.9)) * 0.55 + 12); }
    if (hovered && hovered !== selected && isVisible(hovered)) { const n = data.nodes[data.index.get(hovered)]; place(n.label, n.pos, 'is-hover', 14); }
    if (showRegions) {
      for (const r of data.regions) {
        if (r.count === 0) continue;
        const own = data.nodes.some((n) => n.region === r.id && isVisible(n.id));
        if (own) place(r.label.toUpperCase(), r.center, 'is-region', -52);
      }
    }
    // el resto, por orden de importancia y con menos detalle cuanto más lejos esté la cámara
    const zoom = fitRadius / view.radius;
    const minSize = zoom > 2.2 ? 0.3 : zoom > 1.3 ? 0.55 : 0.8;
    const cand = data.nodes.filter((n) => isVisible(n.id) && n.id !== selected && n.id !== hovered && (near ? near.has(n.id) : n.size >= minSize))
      .sort((a, b) => b.size - a.size);
    let count = 0;
    for (const n of cand) { if (count >= CAP_LABELS - 4) break; if (place(n.label, n.pos, n.type === 'recomendacion' ? 'is-rec' : '', 12)) count++; }
    for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
  }

  /* ── Selección ── */
  const pickers = () => Object.values(meshes).map((m) => m.mesh);
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  function pick(clientX, clientY) {
    if (!data) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickers(), false);
    for (const h of hits) {
      const entry = Object.values(meshes).find((m) => m.mesh === h.object);
      if (entry && h.instanceId != null) { const id = entry.ids[h.instanceId]; if (isVisible(id)) return id; }
    }
    return null;
  }

  function select(id, opts = {}) {
    if (id && (!data || !data.index.has(id))) id = null;
    if (id === selected && !opts.force) return;
    selected = id;
    applyNodes(); applyEdges();
    if (id && opts.focus !== false) focus(id);
    requestRender();
    if (!opts.silent) cb.select(id);
  }

  function focus(id) {
    if (!data || !data.index.has(id)) return;
    const n = data.nodes[data.index.get(id)];
    const nb = [id, ...data.adj.get(id).map((a) => a[0])];
    const b = boundsOf(nb);
    goTo({ theta: view.theta, phi: view.phi, radius: clamp(distanceFor(Math.max(b.r, 22)) * 0.85, 40, fitRadius * 1.1), target: new T.Vector3(...n.pos).lerp(b.c, 0.35) });
  }

  function focusRegion(rid) {
    if (!data) return;
    const ids = data.nodes.filter((n) => n.region === rid).map((n) => n.id);
    if (!ids.length) return;
    const b = boundsOf(ids);
    goTo({ theta: view.theta, phi: view.phi, radius: distanceFor(b.r) * 0.95, target: b.c });
  }

  /* ── Entrada: ratón, táctil y teclado ── */
  const pointers = new Map();
  let drag = null, pinch = 0;
  const onDown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tween = null; vel.theta = vel.phi = 0;
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, moved: 0, pan: e.button === 2 || e.shiftKey || e.button === 1 };
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); drag = null; }
  };
  const onMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      const id = pick(e.clientX, e.clientY);
      if (id !== hovered) { hovered = id; canvas.style.cursor = id ? 'pointer' : ''; cb.hover(id); requestRender(); }
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomBy(pinch / d);
      pinch = d;
      return;
    }
    if (!drag) return;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.pan) panBy(dx, dy);
    else {
      view.theta -= dx * 0.0075; view.phi = clamp(view.phi - dy * 0.0075, 0.08, Math.PI - 0.08);
      vel.theta = -dx * 0.0075 * 0.6; vel.phi = -dy * 0.0075 * 0.6;
      if (reduced()) vel.theta = vel.phi = 0;
    }
    requestRender();
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (drag && drag.moved < 5 && pointers.size === 0) select(pick(e.clientX, e.clientY));
    if (pointers.size === 0) drag = null;
  };
  const onWheel = (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0012)); };
  const onLeave = () => { if (hovered) { hovered = null; canvas.style.cursor = ''; cb.hover(null); requestRender(); } };
  const onKey = (e) => {
    const k = e.key;
    const rot = 0.12, step = 0.12;
    if (k === 'ArrowLeft') e.shiftKey ? panBy(40, 0) : nudge(-rot, 0);
    else if (k === 'ArrowRight') e.shiftKey ? panBy(-40, 0) : nudge(rot, 0);
    else if (k === 'ArrowUp') e.shiftKey ? panBy(0, 40) : nudge(0, -step);
    else if (k === 'ArrowDown') e.shiftKey ? panBy(0, -40) : nudge(0, step);
    else if (k === '+' || k === '=') zoomBy(0.8);
    else if (k === '-' || k === '_') zoomBy(1.25);
    else if (k === '0' || k === 'Home') fitView();
    else if (k === 'Escape') select(null);
    else return;
    e.preventDefault();
  };
  canvas.addEventListener('pointerdown', onDown, { signal });
  canvas.addEventListener('pointermove', onMove, { signal });
  canvas.addEventListener('pointerup', onUp, { signal });
  canvas.addEventListener('pointercancel', onUp, { signal });
  canvas.addEventListener('pointerleave', onLeave, { signal });
  canvas.addEventListener('wheel', onWheel, { passive: false, signal });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
  container.addEventListener('keydown', onKey, { signal });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cb.lost(); }, { signal });

  function nudge(dTheta, dPhi) {
    if (reduced()) { view.theta += dTheta; view.phi = clamp(view.phi + dPhi, 0.08, Math.PI - 0.08); }
    else goTo({ theta: view.theta + dTheta, phi: view.phi + dPhi, radius: view.radius, target: view.target.clone() });
    requestRender();
  }
  function zoomBy(f) { view.radius = clamp(view.radius * f, 25, fitRadius * 2.2); tween = null; requestRender(); }
  function panBy(dx, dy) {
    const scale = (2 * view.radius * Math.tan((camera.fov * Math.PI) / 360)) / size.h;
    const right = tmpV.set(1, 0, 0).applyQuaternion(camera.quaternion).clone();
    const up = new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    view.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    tween = null; requestRender();
  }

  /* ── Tamaño ── */
  function resize() {
    // la sección se cerró (otra pestaña, cierre de sesión…): quien creó el visor lo libera
    if (!container.isConnected) { if (options.onDetached) options.onDetached(); return; }
    const r = container.getBoundingClientRect();
    size = { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
    renderer.setSize(size.w, size.h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = size.w / size.h; camera.updateProjectionMatrix();
    requestRender();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /* ── API pública ── */
  const api = {
    setData,
    select, focus, focusRegion,
    reset: () => fitView(),
    refit: (instant) => fitView(!!instant),
    setFilter(f) {
      visible = f.visible || null; edgeTypes = f.edgeTypes || null;
      if (f.showRegions !== undefined) showRegions = f.showRegions;
      if (selected && !isVisible(selected)) { selected = null; cb.select(null); }
      applyNodes(); applyEdges(); requestRender();
    },
    rotate: (dx, dy) => nudge(dx, dy),
    zoom: zoomBy,
    pan: panBy,
    /* para pruebas y diagnóstico */
    info: () => ({
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      labels: pool.filter((p) => p.style.display !== 'none').length, selected, hovered, frameCount: frames,
      visible: data ? data.nodes.filter((n) => isVisible(n.id)).length : 0, frames: raf !== 0,
    }),
    screenPos(id) {
      if (!data || !data.index.has(id)) return null;
      camera.updateMatrixWorld();
      const n = data.nodes[data.index.get(id)];
      tmpV.set(...n.pos).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (tmpV.x * 0.5 + 0.5) * r.width, y: r.top + (-tmpV.y * 0.5 + 0.5) * r.height };
    },
    renderNow() { cancelAnimationFrame(raf); raf = 0; frame(performance.now()); },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ac.abort(); ro.disconnect();
      clearScene();
      selRing.geometry.dispose(); matSel.dispose(); haloGeo.dispose(); matHalo.dispose(); matNode.dispose();
      Object.values(GEOS).forEach((g) => g.dispose());
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* ya perdido */ }
      canvas.remove(); labelsEl.remove();
    },
  };
  return api;
}
