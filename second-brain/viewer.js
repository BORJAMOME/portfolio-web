/* ═══════════════════════════════════════════════
   second-brain/viewer.js: escena 3D de Second Brain (Three.js)
   ─────────────────────────────────────────────────
   Módulo ES. Solo DIBUJA un snapshot ya calculado: no lee documentos, no llama a ningún
   modelo y no conoce credenciales. Recibe Three.js por parámetro (vendor/three-…-sb.js).

   Dos maneras de mirar el mismo snapshot:

   · MAPA (por defecto). El espacio tiene significado y se lee sin leyenda:
       ángulo   → área de conocimiento (un sector por región)
       radio    → solidez de la evidencia (centro = respaldado, borde = por validar)
       altura   → tipo (competencias arriba, conceptos en el plano, proyectos debajo,
                  objetivos en el eje central, recomendaciones como pines sobre su destino)
     Las posiciones se calculan aquí a partir de campos semánticos del snapshot
     (región, estado, tipo): es representación, no análisis.
   · RED. Las posiciones de fuerzas que calculó el motor, para seguir conexiones.

   Rendimiento: dibujo bajo demanda (0 fotogramas en reposo), un InstancedMesh por forma,
   un LineSegments por capa de líneas, etiquetas HTML limitadas y sin solaparse,
   resolución ≤ 2× y todos los recursos liberados en dispose().
   ═══════════════════════════════════════════════ */

/* Paleta del área privada (css/area-privada.css): navy, acero, beige, ámbar, verde y rojo IBCS */
export const PALETTE = {
  bg: '#ffffff', ink: '#1d2638', navy: '#273a5f', navyMid: '#4a628e', steel: '#8c9ab3', mist: '#c6cfdd',
  line: '#dce2eb', lineSoft: '#e9edf3', floor: '#f6f4ef', amber: '#c98a2b', amberInk: '#9a6414', green: '#2f7d5b', red: '#a3223e',
};
export const STATE_COLOR = {
  respaldado: PALETTE.navy,          // conocimiento respaldado por evidencias
  mencionado: PALETTE.steel,         // mencionado, sin práctica detectable
  pendiente: PALETTE.mist,           // pendiente de validar
  brecha_probable: PALETTE.mist,     // + anillo rojo
  brecha_confirmada: PALETTE.mist,   // + doble anillo rojo
  oportunidad: PALETTE.amber,        // recomendaciones y oportunidades
  neutral: PALETTE.ink,              // objetivos (referencias, no conocimiento)
};
const EDGE_COLOR = {
  usa: PALETTE.navyMid, 'parte-de': PALETTE.navyMid, requiere: PALETTE.navy, mejora: PALETTE.green, habilita: PALETTE.green,
  demuestra: '#5d7bb0', agrupa: PALETTE.steel, necesita: PALETTE.steel, recomienda: PALETTE.amber,
};

const KNOWLEDGE = new Set(['tecnologia', 'concepto', 'tecnica']);
const HUB = 18;                   // hueco central (eje de objetivos)
const RIM = 96;
export const KNOWLEDGE_TYPES = KNOWLEDGE;
const Y = { concepto: 0, competencia: 30, rec: 14, proyecto: 0, objetivo: 22 };
const BELT = [110, 121];          // cinturón de proyectos, fuera del disco de conocimiento
const LABEL_CAP = 46;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ═══════════ DISTRIBUCIÓN «MAPA» ═══════════ */
export function mapLayout(snapshot) {
  const nodes = snapshot.nodes;
  const pos = new Map();
  const knowRegions = snapshot.regions.filter((r) => nodes.some((n) => n.region === r.id && (KNOWLEDGE.has(n.type) || n.type === 'competencia')));
  const weight = (r) => Math.max(2.5, nodes.filter((n) => n.region === r.id && KNOWLEDGE.has(n.type)).length + 0.6 * nodes.filter((n) => n.region === r.id && n.type === 'competencia').length);
  const total = knowRegions.reduce((s, r) => s + weight(r), 0) || 1;
  const GAP = 0.09;
  const usable = Math.PI * 2 - GAP * knowRegions.length;
  // el primer hueco queda delante de la cámara inicial (+z), donde van las etiquetas de los anillos
  let a = Math.PI / 2 + GAP / 2;
  const sectors = knowRegions.map((r) => {
    const span = (usable * weight(r)) / total;
    const s = { id: r.id, label: r.label, a0: a, a1: a + span, ac: a + span / 2 };
    a += span + GAP;
    return s;
  });
  const at = (ang, r, y) => [Math.cos(ang) * r, y, Math.sin(ang) * r];

  const keyOf = (n) => (n.state === 'respaldado' || n.state === 'mencionado' ? n.state : 'otros');
  const know = nodes.filter((n) => KNOWLEDGE.has(n.type));
  const w = { respaldado: 0, mencionado: 0, otros: 0 };
  know.forEach((n) => { w[keyOf(n)] += 1; });
  Object.keys(w).forEach((k) => { w[k] += 3; });
  const W = w.respaldado + w.mencionado + w.otros;
  const BAND = {};
  let acc = 0;
  for (const k of ['respaldado', 'mencionado', 'otros']) {
    const rA = Math.sqrt(HUB * HUB + (RIM * RIM - HUB * HUB) * (acc / W));
    acc += w[k];
    const rB = Math.sqrt(HUB * HUB + (RIM * RIM - HUB * HUB) * (acc / W));
    BAND[k] = [rA + 2.5, rB - 2.5];
  }

  /* coloca una lista en un trozo de corona, por filas concéntricas y sin solaparse */
  function fill(list, a0, a1, rMin, rMax, y, gap) {
    if (!list.length) return;
    let spacing = gap;
    const capacity = (sp) => { let c = 0; for (let r = rMin + sp / 2; r <= rMax; r += sp * 0.92) c += Math.max(1, Math.floor(((a1 - a0) * r) / sp)); return c; };
    while (spacing > 5 && capacity(spacing) < list.length) spacing -= 0.5;
    let i = 0, r = rMin + spacing / 2, row = 0;
    while (i < list.length) {
      const k = Math.max(1, Math.floor(((a1 - a0) * r) / spacing));
      const m = Math.min(k, list.length - i);
      const step = (a1 - a0) / m;
      for (let j = 0; j < m; j++) pos.set(list[i + j].id, at(a0 + step * (j + 0.5) + (row % 2 ? step * 0.18 : 0), r, y));
      i += m; r += spacing * 0.92; row++;
    }
  }
  const GOLDEN = (Math.sqrt(5) - 1) / 2;
  function spread(list, a0, a1, rMin, rMax, y) {
    const n = list.length;
    list.forEach((node, i) => {
      const u = n === 1 ? 0.5 : (i + 0.5) / n;
      const rr = Math.sqrt(rMin * rMin + u * (rMax * rMax - rMin * rMin));
      const f = n === 1 ? 0.5 : ((i * GOLDEN) % 1) * 0.86 + 0.07;
      pos.set(node.id, at(a0 + f * (a1 - a0), rr, y));
    });
  }
  const byEvidence = (x, y) => (y.evidence.projects - x.evidence.projects) || (y.evidence.practica - x.evidence.practica) || x.label.localeCompare(y.label, 'es');
  const inBand = (key) => (n) => keyOf(n) === key;
  for (const s of sectors) {
    const pad = 0.035;
    const own = nodes.filter((n) => n.region === s.id && KNOWLEDGE.has(n.type));
    const comps = nodes.filter((n) => n.region === s.id && n.type === 'competencia').sort(byEvidence);
    for (const key of ['respaldado', 'mencionado', 'otros']) {
      const [r0, r1] = BAND[key];
      spread(own.filter(inBand(key)).sort(byEvidence), s.a0 + pad, s.a1 - pad, r0 + 2, r1 - 2, Y.concepto);
      fill(comps.filter(inBand(key)), s.a0 + pad, s.a1 - pad, (r0 + r1) / 2 - 5, (r0 + r1) / 2 + 5, Y.competencia, 13);
    }
  }
  // proyectos: en el cinturón exterior, en el ángulo medio de lo que demuestran
  const angleOf = (p) => Math.atan2(p[2], p[0]);
  const projects = nodes.filter((n) => n.type === 'proyecto');
  const pAng = projects.map((p, i) => {
    let sx = 0, sz = 0;
    for (const e of snapshot.edges) {
      if (e.source !== p.id || e.type !== 'demuestra') continue;
      const q = pos.get(e.target); if (!q) continue;
      sx += Math.cos(angleOf(q)); sz += Math.sin(angleOf(q));
    }
    return { n: p, ang: sx || sz ? Math.atan2(sz, sx) : (i / Math.max(1, projects.length)) * Math.PI * 2 };
  }).sort((x, y) => x.ang - y.ang);
  const rings = BELT;
  const lastOnRing = rings.map(() => -Infinity);
  for (const p of pAng) {
    let k = rings.findIndex((r, i) => (p.ang - lastOnRing[i]) * r >= 10);
    if (k < 0) k = rings.length - 1;
    const ang = Math.max(p.ang, lastOnRing[k] + 10 / rings[k]);
    lastOnRing[k] = ang;
    pos.set(p.n.id, at(ang, rings[k], Y.proyecto));
  }
  // objetivos: el eje central, de Junior (abajo) a Mid-Level (arriba)
  const order = ((snapshot.meta && snapshot.meta.levels) || []).map((l) => 'o:' + l.id);
  nodes.filter((n) => n.type === 'objetivo').forEach((n) => {
    const i = Math.max(0, order.indexOf(n.id));
    pos.set(n.id, [0, Y.objetivo + i * 14, 0]);
  });
  // recomendaciones: un pin sobre lo que recomiendan
  const recTarget = new Map(snapshot.recommendations.map((r) => [r.nodeId, r.targetId]));
  const stack = new Map();
  nodes.filter((n) => n.type === 'recomendacion').forEach((n) => {
    const tid = recTarget.get(n.id);
    const t = pos.get(tid);
    const k = stack.get(tid) || 0;
    stack.set(tid, k + 1);
    pos.set(n.id, t ? [t[0], Math.max(t[1], 0) + Y.rec + k * 9, t[2]] : [0, Y.competencia + 20, 0]);
  });
  // cualquier nodo sin sitio (tipos futuros): en el borde exterior
  nodes.forEach((n, i) => { if (!pos.has(n.id)) pos.set(n.id, at((i / nodes.length) * Math.PI * 2, RIM - 2, 0)); });
  return { pos, sectors, bands: BAND };
}

/* ═══════════ VISOR ═══════════ */
export function createViewer(container, T, options = {}) {
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ac = new AbortController();
  const { signal } = ac;
  const cb = { select: options.onSelect || (() => {}), hover: options.onHover || (() => {}), lost: options.onContextLost || (() => {}) };

  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new T.Color(PALETTE.bg));
  const canvas = renderer.domElement;
  canvas.className = 'sb-canvas';
  container.appendChild(canvas);
  const scene = new T.Scene();
  scene.fog = new T.Fog(new T.Color(PALETTE.bg), 200, 700);   // perspectiva aérea: lo lejano se aclara
  const camera = new T.PerspectiveCamera(40, 1, 1, 3000);
  scene.add(new T.HemisphereLight(0xffffff, 0xc9d1de, 2.3));
  const sun = new T.DirectionalLight(0xffffff, 1.15);
  sun.position.set(-60, 140, 90);
  scene.add(sun);

  const labelsEl = document.createElement('div');
  labelsEl.className = 'sb-labels';
  labelsEl.setAttribute('aria-hidden', 'true');
  container.appendChild(labelsEl);

  const view = { theta: -0.42, phi: 0.8, radius: 300, target: new T.Vector3() };
  let fitRadius = 300;
  let data = null, mode = 'mapa';
  let visible = null, edgeTypes = null, edgeMode = 'foco';
  let selected = null, hovered = null;
  let tween = null, morph = null;
  const vel = { theta: 0, phi: 0 };
  let raf = 0, disposed = false, frames = 0;
  let size = { w: 1, h: 1 };
  let P = null;                 // posiciones actuales (Float32Array n×3)
  const L = {};                 // posiciones destino por distribución
  let sectors = [], bands = { respaldado: [20, 50], mencionado: [52, 70], otros: [72, 94] };

  /* ── Geometrías y materiales (compartidos) ── */
  const circleGeo = (r, seg) => {
    const v = [0, 0, 0], ix = [];
    for (let i = 0; i <= seg; i++) { const ang = (i / seg) * Math.PI * 2; v.push(Math.cos(ang) * r, 0, Math.sin(ang) * r); }
    for (let i = 1; i <= seg; i++) ix.push(0, i + 1, i);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(v), 3));
    g.setIndex(ix);
    return g;
  };
  const GEOS = {
    tecnologia: new T.SphereGeometry(1, 24, 16),
    concepto: new T.IcosahedronGeometry(1.12, 1),
    tecnica: new T.OctahedronGeometry(1.25, 0),
    competencia: new T.DodecahedronGeometry(1.2, 0),
    proyecto: new T.BoxGeometry(1.6, 1.6, 1.6),
    objetivo: new T.TorusGeometry(1, 0.22, 12, 48),
    recomendacion: new T.ConeGeometry(0.95, 2.2, 4),
  };
  GEOS.recomendacion.rotateX(Math.PI);                 // los pines apuntan hacia abajo, a lo que señalan
  GEOS.objetivo.rotateX(Math.PI / 2);                  // anillos horizontales en el eje
  const SHARED_GEOS = new Set(Object.values(GEOS));
  const matNode = new T.MeshLambertMaterial({ color: 0xffffff });
  const shadowGeo = circleGeo(1, 28);
  const matShadow = new T.MeshBasicMaterial({ color: new T.Color(PALETTE.ink), transparent: true, opacity: 0.07, depthWrite: false, fog: false });
  const haloGeo = new T.RingGeometry(1.5, 1.72, 48);
  const matHalo = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide, fog: false, transparent: true, depthWrite: false });
  SHARED_GEOS.add(shadowGeo); SHARED_GEOS.add(haloGeo);
  const SHARED_MATS = new Set([matNode, matShadow, matHalo]);
  const selRing = new T.Mesh(new T.RingGeometry(1.95, 2.2, 56), new T.MeshBasicMaterial({ color: new T.Color(PALETTE.amberInk), side: T.DoubleSide, fog: false, depthTest: false, transparent: true }));
  selRing.visible = false; selRing.renderOrder = 20;
  scene.add(selRing);

  let meshes = {}, shadows = null, haloMesh = null, haloItems = [];
  let guides = null, floor = null, stems = null, ctxLines = null, focusLines = null;
  const tmpM = new T.Matrix4(), tmpV = new T.Vector3(), tmpQ = new T.Quaternion(), tmpS = new T.Vector3(), tmpC = new T.Color();
  const white = new T.Color('#ffffff');

  const radiusOf = (n) => (mode === 'mapa' ? 1.55 + n.size * 2.1 : 1.9 + n.size * 3.0);
  const isVisible = (id) => !visible || visible.has(id);
  const idx = (id) => data.index.get(id);
  const pAt = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const onFloor = (n) => KNOWLEDGE.has(n.type) || n.type === 'proyecto';
  const liftOf = (n) => (mode === 'mapa' && onFloor(n) ? radiusOf(n) : 0);   // en el mapa conceptos y proyectos se apoyan en el plano

  function disposeObj(o) {
    if (!o) return;
    scene.remove(o);
    if (o.geometry && !SHARED_GEOS.has(o.geometry)) o.geometry.dispose();
    if (o.material && !SHARED_MATS.has(o.material)) o.material.dispose();
    if (o.isInstancedMesh) o.dispose();
  }
  function clearScene() {
    Object.values(meshes).forEach((m) => disposeObj(m.mesh));
    meshes = {};
    [shadows, haloMesh, guides, floor, stems, ctxLines, focusLines].forEach(disposeObj);
    shadows = haloMesh = guides = floor = stems = ctxLines = focusLines = null;
  }

  /* ── Carga del snapshot ── */
  function setData(snapshot) {
    clearScene();
    const nodes = snapshot.nodes;
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const adj = new Map(nodes.map((n) => [n.id, []]));
    snapshot.edges.forEach((e, i) => { adj.get(e.source).push([e.target, i]); adj.get(e.target).push([e.source, i]); });
    const bucket = new Map();
    for (const r of snapshot.recommendations) { bucket.set(r.targetId, r.priority.bucket); bucket.set(r.nodeId, r.priority.bucket); }
    data = { nodes, edges: snapshot.edges, regions: snapshot.regions, index, adj, bucket };

    const m = mapLayout(snapshot);
    sectors = m.sectors; bands = m.bands;
    L.mapa = new Float32Array(nodes.length * 3);
    L.red = new Float32Array(nodes.length * 3);
    nodes.forEach((n, i) => { L.mapa.set(m.pos.get(n.id), i * 3); L.red.set(n.pos, i * 3); });
    P = new Float32Array(L[mode]);

    const byType = {};
    nodes.forEach((n) => { (byType[n.type] ||= []).push(n.id); });
    for (const [type, ids] of Object.entries(byType)) {
      const mesh = new T.InstancedMesh(GEOS[type] || GEOS.concepto, matNode, ids.length);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
      meshes[type] = { mesh, ids };
    }
    shadows = new T.InstancedMesh(shadowGeo, matShadow, nodes.length);
    shadows.frustumCulled = false; shadows.renderOrder = 1;
    scene.add(shadows);
    haloItems = nodes.filter((n) => n.state === 'brecha_probable' || n.state === 'brecha_confirmada' || (bucket.get(n.id) === 'ahora' && n.type !== 'recomendacion'));
    if (haloItems.length) {
      haloMesh = new T.InstancedMesh(haloGeo, matHalo, haloItems.length * 2);
      haloMesh.frustumCulled = false; haloMesh.renderOrder = 6;
      scene.add(haloMesh);
    }
    buildGuides();
    visible = null; selected = null; hovered = null;
    applyNodes(); applyLines();
    fit(true);
    requestRender();
  }

  /* ── Guías del mapa: plano, anillos de evidencia y sectores ── */
  function buildGuides() {
    const pts = [], cols = [];
    const push = (p, q, c) => { pts.push(...p, ...q); tmpC.set(c); cols.push(tmpC.r, tmpC.g, tmpC.b, tmpC.r, tmpC.g, tmpC.b); };
    const ring = (r, y, c, seg = 160) => { for (let i = 0; i < seg; i++) { const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2; push([Math.cos(a0) * r, y, Math.sin(a0) * r], [Math.cos(a1) * r, y, Math.sin(a1) * r], c); } };
    ring(bands.respaldado[1] + 2.5, 0, PALETTE.line); ring(bands.mencionado[1] + 2.5, 0, PALETTE.line); ring(RIM, 0, '#cfd6e2');
    ring(HUB, 0, PALETTE.lineSoft);
    for (const s of sectors) for (const ang of [s.a0, s.a1]) push([Math.cos(ang) * HUB, 0, Math.sin(ang) * HUB], [Math.cos(ang) * RIM, 0, Math.sin(ang) * RIM], PALETTE.lineSoft);
    ring(BELT[0] - 6, 0, PALETTE.line, 200); ring(BELT[1] + 7, 0, PALETTE.lineSoft, 200);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pts), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(cols), 3));
    guides = new T.LineSegments(g, new T.LineBasicMaterial({ vertexColors: true, fog: false }));
    guides.frustumCulled = false;
    scene.add(guides);
    floor = new T.Mesh(circleGeo(RIM, 128), new T.MeshBasicMaterial({ color: new T.Color(PALETTE.floor), transparent: true, opacity: 0.62, depthWrite: false, side: T.DoubleSide, fog: false }));
    floor.position.y = -0.05; floor.renderOrder = 0;
    scene.add(floor);
  }

  /* ── Nodos: posición, escala y color de cada instancia ── */
  function applyNodes() {
    if (!data) return;
    const fs = selected ? new Set([selected, ...data.adj.get(selected).map((x) => x[0])]) : null;
    for (const { mesh, ids } of Object.values(meshes)) {
      ids.forEach((id, k) => {
        const i = idx(id), n = data.nodes[i];
        const r = radiusOf(n);
        const s = isVisible(id) ? r * (id === selected ? 1.22 : 1) : 0.0001;
        tmpM.makeScale(s, s, s).setPosition(P[i * 3], P[i * 3 + 1] + liftOf(n), P[i * 3 + 2]);
        mesh.setMatrixAt(k, tmpM);
        tmpC.set(STATE_COLOR[n.state] || STATE_COLOR.neutral);
        if (fs && !fs.has(id)) tmpC.lerp(white, 0.8);
        mesh.setColorAt(k, tmpC);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    // sombras de contacto: anclan cada nodo a su plano y hacen legible la altura
    data.nodes.forEach((n, i) => {
      const on = isVisible(n.id) && mode === 'mapa';
      const r = on ? radiusOf(n) * (onFloor(n) ? 1.05 : 1.15) : 0.0001;
      tmpM.makeScale(r, 1, r).setPosition(P[i * 3], 0.02, P[i * 3 + 2]);
      shadows.setMatrixAt(i, tmpM);
    });
    shadows.instanceMatrix.needsUpdate = true;
    if (guides) guides.visible = mode === 'mapa';
    if (floor) floor.visible = mode === 'mapa';
  }

  /* ── Líneas: tallos verticales, relaciones de contexto y relaciones en foco ── */
  function arc(p, q, out, color, curved) {
    if (!curved) { out.p.push(...p, ...q); out.c.push(color.r, color.g, color.b, color.r, color.g, color.b); return; }
    const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    const c = [(p[0] + q[0]) / 2, Math.max(p[1], q[1]) + 4 + d * 0.22, (p[2] + q[2]) / 2];
    const SEG = 14;
    let prev = p;
    for (let s = 1; s <= SEG; s++) {
      const t = s / SEG, u = 1 - t;
      const pt = [u * u * p[0] + 2 * u * t * c[0] + t * t * q[0], u * u * p[1] + 2 * u * t * c[1] + t * t * q[1], u * u * p[2] + 2 * u * t * c[2] + t * t * q[2]];
      out.p.push(...prev, ...pt); out.c.push(color.r, color.g, color.b, color.r, color.g, color.b);
      prev = pt;
    }
  }
  const endPoint = (i) => { const p = pAt(i); p[1] += liftOf(data.nodes[i]); return p; };
  function lineObj(buf, opacity, order) {
    if (!buf.p.length) return null;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(buf.p), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(buf.c), 3));
    const l = new T.LineSegments(g, new T.LineBasicMaterial({ vertexColors: true, transparent: opacity < 1, opacity, depthWrite: false }));
    l.frustumCulled = false; l.renderOrder = order;
    scene.add(l);
    return l;
  }
  function applyLines() {
    if (!data) return;
    [stems, ctxLines, focusLines].forEach(disposeObj);
    stems = ctxLines = focusLines = null;
    if (morph) return;                                   // durante la transición solo se mueven los nodos
    const curved = mode === 'mapa';
    if (mode === 'mapa') {
      // tallos: de lo que flota (competencias, pines, proyectos) a su punto en el plano, y el eje de objetivos
      const s = { p: [], c: [] };
      tmpC.set('#c9d1de');
      data.nodes.forEach((n, i) => {
        if (!isVisible(n.id) || onFloor(n) || n.type === 'objetivo') return;
        const p = pAt(i);
        arc(p, [p[0], 0, p[2]], s, tmpC, false);
      });
      const top = data.nodes.filter((n) => n.type === 'objetivo' && isVisible(n.id)).reduce((mx, n) => Math.max(mx, P[idx(n.id) * 3 + 1]), 0);
      if (top) arc([0, 0, 0], [0, top, 0], s, tmpC, false);
      stems = lineObj(s, 1, 2);
    }
    const id = selected || hovered;
    const inFocus = id ? new Set(data.adj.get(id).map((x) => x[1])) : new Set();
    const ctx = { p: [], c: [] }, foc = { p: [], c: [] };
    data.edges.forEach((e, i) => {
      if (!isVisible(e.source) || !isVisible(e.target)) return;
      tmpC.set(EDGE_COLOR[e.type] || PALETTE.steel);
      if (inFocus.has(i)) return arc(endPoint(idx(e.source)), endPoint(idx(e.target)), foc, tmpC, curved);
      if (edgeMode !== 'todas' || (edgeTypes && !edgeTypes.has(e.type))) return;
      arc(endPoint(idx(e.source)), endPoint(idx(e.target)), ctx, tmpC, curved);
    });
    ctxLines = lineObj(ctx, id ? 0.12 : 0.34, 3);
    focusLines = lineObj(foc, 0.95, 4);
  }

  /* Anillos que miran a la cámara: brechas (rojo, como las desviaciones negativas en IBCS)
     y competencias con recomendación prioritaria (ámbar). */
  function updateHalos() {
    if (!haloMesh || !data) return;
    camera.getWorldQuaternion(tmpQ);
    let k = 0;
    for (const n of haloItems) {
      const i = idx(n.id);
      const r = radiusOf(n);
      const gap = n.state === 'brecha_probable' || n.state === 'brecha_confirmada';
      tmpC.set(gap ? PALETTE.red : PALETTE.amber);
      for (let ring = 0; ring < 2; ring++) {
        const on = isVisible(n.id) && (ring === 0 || n.state === 'brecha_confirmada');
        const sc = on ? r * (1 + ring * 0.3) : 0.0001;
        tmpS.set(sc, sc, sc);
        tmpM.compose(tmpV.set(P[i * 3], P[i * 3 + 1] + liftOf(n), P[i * 3 + 2]), tmpQ, tmpS);
        haloMesh.setMatrixAt(k, tmpM); haloMesh.setColorAt(k, tmpC);
        k++;
      }
    }
    haloMesh.instanceMatrix.needsUpdate = true;
    if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
  }

  /* ── Cámara ── */
  function placeCamera() {
    const sp = Math.sin(view.phi);
    camera.position.set(view.target.x + view.radius * sp * Math.sin(view.theta), view.target.y + view.radius * Math.cos(view.phi), view.target.z + view.radius * sp * Math.cos(view.theta));
    camera.lookAt(view.target);
    camera.updateMatrixWorld();
  }
  function boundsOf(ids, robust) {
    const list = (ids || data.nodes.map((n) => n.id)).filter(isVisible).map(idx);
    if (!list.length) return { c: new T.Vector3(), r: 60 };
    const c = new T.Vector3();
    list.forEach((i) => c.add(tmpV.set(...pAt(i))));
    c.multiplyScalar(1 / list.length);
    const ds = list.map((i) => c.distanceTo(tmpV.set(...pAt(i))) + 4).sort((x, y) => x - y);
    const r = robust && ds.length > 20 ? ds[Math.floor(ds.length * 0.94)] : ds[ds.length - 1];
    return { c, r: Math.max(r, 14) };
  }
  const distanceFor = (r) => {
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    return (r / Math.sin(Math.min(vFov, hFov) / 2)) * 1.02;
  };
  function goTo(to, instant) {
    const from = { theta: view.theta, phi: view.phi, radius: view.radius, target: view.target.clone() };
    let dt = to.theta - from.theta;
    dt -= Math.round(dt / (2 * Math.PI)) * 2 * Math.PI;
    to = { theta: from.theta + dt, phi: clamp(to.phi, 0.01, Math.PI - 0.08), radius: clamp(to.radius, 18, 1400), target: to.target };
    vel.theta = vel.phi = 0;
    if (instant || reduced()) { view.theta = to.theta; view.phi = to.phi; view.radius = to.radius; view.target.copy(to.target); tween = null; }
    else tween = { t0: performance.now(), dur: 700, from, to };
    requestRender();
  }
  const PRESET = { '3d': { theta: -0.42, phi: 0.8 }, cenital: { theta: 0, phi: 0.012 }, lateral: { theta: -0.42, phi: 1.5 } };
  let preset = '3d';
  function fitPoints() {
    if (mode === 'mapa' && !visible) {
      // el mapa completo tiene una forma conocida: el borde del cinturón y lo alto del eje de objetivos
      const pts = [];
      for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; pts.push([Math.cos(a) * (BELT[1] + 20) * (1 + (size.w < 700 ? 0 : 0.22) * Math.abs(Math.cos(a))), 0, Math.sin(a) * (BELT[1] + 20)]); }
      let top = Y.competencia + 8;
      data.nodes.forEach((n, i) => { top = Math.max(top, L[mode][i * 3 + 1] + 6); });
      pts.push([0, top, 0]);
      return pts;
    }
    const D = L[mode];
    return data.nodes.filter((n) => isVisible(n.id)).map((n) => { const i = idx(n.id); return [D[i * 3], D[i * 3 + 1], D[i * 3 + 2]]; });
  }
  /* distancia a la que todos los puntos caben en el lienzo, con margen para la barra superior */
  function fitDistance(pts, target, theta, phi) {
    const saved = { theta: view.theta, phi: view.phi, radius: view.radius, target: view.target.clone() };
    view.theta = theta; view.phi = phi; view.target.copy(target); view.radius = 300;
    const topRoom = 1 - Math.min(0.32, 92 / Math.max(200, size.h));        // la barra flotante ocupa ~70 px arriba
    const right = new T.Vector3(), up = new T.Vector3();
    for (let k = 0; k < 8; k++) {
      placeCamera();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) {
        tmpV.set(p[0], p[1], p[2]).project(camera);
        x0 = Math.min(x0, tmpV.x); x1 = Math.max(x1, tmpV.x); y0 = Math.min(y0, tmpV.y); y1 = Math.max(y1, tmpV.y);
      }
      // desplaza el objetivo para centrar el contenido en [-0.95, topRoom] y ajusta la distancia
      const halfH = view.radius * Math.tan((camera.fov * Math.PI) / 360), halfW = halfH * camera.aspect;
      right.set(1, 0, 0).applyQuaternion(camera.quaternion); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      view.target.addScaledVector(right, ((x0 + x1) / 2) * halfW * 0.9).addScaledVector(up, ((y0 + y1) / 2 - (topRoom - 0.95) / 2) * halfH * 0.9);
      const m = Math.max((x1 - x0) / 1.9, (y1 - y0) / (topRoom + 0.95), 0.05);
      view.radius = clamp(view.radius * m, 20, 2400);
    }
    const out = { d: view.radius, target: view.target.clone() };
    Object.assign(view, { theta: saved.theta, phi: saved.phi, radius: saved.radius }); view.target.copy(saved.target);
    placeCamera();
    return out;
  }
  function fit(instant) {
    if (!data) return;
    const p = PRESET[preset];
    const pts = fitPoints();
    const c = new T.Vector3();
    if (mode === 'mapa' && !visible) c.set(0, preset === 'lateral' ? 14 : 4, 0);
    else { pts.forEach((q) => c.add(tmpV.set(q[0], q[1], q[2]))); c.multiplyScalar(1 / Math.max(1, pts.length)); }
    const f = fitDistance(pts, c, p.theta, p.phi);
    fitRadius = f.d;
    goTo({ theta: p.theta, phi: p.phi, radius: fitRadius, target: f.target }, instant);
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
    if (morph) {
      const t = clamp((now - morph.t0) / morph.dur, 0, 1), k = ease(t);
      for (let j = 0; j < P.length; j++) P[j] = morph.from[j] + (morph.to[j] - morph.from[j]) * k;
      if (t >= 1) { morph = null; applyNodes(); applyLines(); } else { applyNodes(); moving = true; }
    }
    if (Math.abs(vel.theta) > 0.0004 || Math.abs(vel.phi) > 0.0004) {
      view.theta += vel.theta; view.phi = clamp(view.phi + vel.phi, 0.01, Math.PI - 0.08);
      vel.theta *= 0.9; vel.phi *= 0.9; moving = true;
    }
    placeCamera();
    scene.fog.near = view.radius * 0.8; scene.fog.far = view.radius * 2.8 + 120;
    updateHalos();
    if (selected && data) {
      const i = idx(selected), n = data.nodes[i];
      selRing.visible = isVisible(selected);
      selRing.position.set(P[i * 3], P[i * 3 + 1] + liftOf(n), P[i * 3 + 2]);
      selRing.quaternion.copy(camera.quaternion);
      selRing.scale.setScalar(radiusOf(n) * 1.2);
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
    const w = size.w, h = size.h, placed = [];
    let used = 0;
    const project = (p) => { tmpV.set(p[0], p[1], p[2]).project(camera); return tmpV.z > 1 ? null : [(tmpV.x * 0.5 + 0.5) * w, (-tmpV.y * 0.5 + 0.5) * h]; };
    const place = (text, p, cls, off, force) => {
      if (used >= LABEL_CAP + 16) return false;
      const s = project(p);
      if (!s || s[0] < -40 || s[0] > w + 40 || s[1] < -20 || s[1] > h + 20) return false;
      const big = /is-region|is-guide/.test(cls);
      const bw = text.length * (big ? 7.4 : 6.7) + 12, bh = big ? 16 : 20;
      const x = s[0] - bw / 2, y = s[1] + off;
      if (!force && placed.some((r) => x < r[0] + r[2] && x + bw > r[0] && y < r[1] + r[3] && y + bh > r[1])) return false;
      placed.push([x, y, bw, bh]);
      const el = labelEl(used++);
      el.textContent = text; el.className = 'sb-label ' + cls; el.style.display = '';
      el.style.transform = `translate(${Math.round(s[0])}px, ${Math.round(s[1] + off)}px) translate(-50%, 0)`;
      return true;
    };
    const nodeP = (n) => { const p = pAt(idx(n.id)); p[1] += liftOf(n) * 2; return p; };
    const below = (n) => 8 + radiusOf(n) * (h / Math.max(60, view.radius)) * 0.9;
    if (selected && isVisible(selected)) { const n = data.nodes[idx(selected)]; place(n.label, nodeP(n), 'is-sel', below(n), true); }
    if (hovered && hovered !== selected && isVisible(hovered)) { const n = data.nodes[idx(hovered)]; place(n.label, nodeP(n), 'is-hover', below(n), true); }
    if (!morph && mode === 'mapa') {
      for (const s of sectors) {
        if (!data.nodes.some((n) => n.region === s.id && isVisible(n.id))) continue;
        place(s.label, [Math.cos(s.ac) * (BELT[1] + 18), 0, Math.sin(s.ac) * (BELT[1] + 18)], 'is-region', -8);
      }
      if (view.phi > 0.25) {
        const ang = Math.PI / 2;
        const mid = (b) => (b[0] + b[1]) / 2;
        place('Respaldado', [0, 0, mid(bands.respaldado)], 'is-guide', -8);
        place('Mencionado', [0, 0, mid(bands.mencionado)], 'is-guide', -8);
        place('Por validar', [0, 0, mid(bands.otros)], 'is-guide', -8);
        place('Proyectos', [Math.cos(ang) * (BELT[0] + 5), 0, Math.sin(ang) * (BELT[0] + 5)], 'is-guide', -8);
      }
    } else if (!morph) {
      for (const r of data.regions) if (r.count && data.nodes.some((n) => n.region === r.id && isVisible(n.id))) place(r.label, r.center, 'is-region', -46);
    }
    const focusId = selected || hovered;
    const near = focusId ? new Set(data.adj.get(focusId).map((x) => x[0])) : null;
    const zoom = fitRadius / view.radius;
    const minSize = zoom > 1.9 ? 0 : zoom > 1.25 ? 0.4 : 0.55;
    const rank = (n) => (n.type === 'competencia' ? 3 : n.type === 'recomendacion' ? 2.5 : n.type === 'objetivo' ? 2.2 : 0) + n.size;
    const cand = data.nodes.filter((n) => isVisible(n.id) && n.id !== selected && n.id !== hovered && (near ? near.has(n.id) : (n.size >= minSize || n.type === 'competencia')))
      .sort((x, y) => rank(y) - rank(x));
    for (const n of cand) {
      if (used >= LABEL_CAP + 16) break;
      place(n.label, nodeP(n), n.type === 'recomendacion' ? 'is-rec' : n.type === 'competencia' ? 'is-comp' : n.type === 'proyecto' ? 'is-proj' : '', 6);
    }
    for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
  }

  /* ── Selección ── */
  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  function pick(x, y) {
    if (!data) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(Object.values(meshes).map((m) => m.mesh), false);
    for (const hit of hits) {
      const entry = Object.values(meshes).find((m) => m.mesh === hit.object);
      if (entry && hit.instanceId != null) { const id = entry.ids[hit.instanceId]; if (isVisible(id)) return id; }
    }
    return null;
  }
  function select(id, opts = {}) {
    if (id && (!data || !data.index.has(id))) id = null;
    if (id === selected && !opts.force) return;
    selected = id;
    applyNodes(); applyLines();
    if (id && opts.focus !== false) focus(id);
    requestRender();
    if (!opts.silent) cb.select(id);
  }
  function focus(id) {
    if (!data || !data.index.has(id)) return;
    const ids = [id, ...data.adj.get(id).map((x) => x[0])];
    const b = boundsOf(ids);
    const p = new T.Vector3(...pAt(idx(id)));
    goTo({ theta: view.theta, phi: view.phi, radius: clamp(distanceFor(Math.max(b.r * 0.85, 30)), fitRadius * 0.5, fitRadius * 1.02), target: p.lerp(b.c, 0.45) });
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
    // en la vista cenital, arrastrar desplaza (como un mapa); en el resto, gira
    if (pointers.size === 1) drag = { moved: 0, pan: e.button === 2 || e.button === 1 || e.shiftKey || preset === 'cenital' };
    if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch = Math.hypot(p.x - q.x, p.y - q.y); drag = null; }
  };
  const onMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      const id = pick(e.clientX, e.clientY);
      if (id !== hovered) {
        hovered = id; canvas.style.cursor = id ? 'pointer' : '';
        cb.hover(id);
        if (!selected) applyLines();      // vista previa del vecindario al pasar por encima
        requestRender();
      }
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
      view.theta -= dx * 0.006; view.phi = clamp(view.phi - dy * 0.006, 0.01, Math.PI - 0.08);
      if (!reduced()) { vel.theta = -dx * 0.0036; vel.phi = -dy * 0.0036; }
    }
    requestRender();
  };
  const onUp = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (drag && drag.moved < 5 && pointers.size === 0) select(pick(e.clientX, e.clientY));
    if (pointers.size === 0) drag = null;
  };
  const onWheel = (e) => { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0011)); };
  const onLeave = () => { if (hovered) { hovered = null; canvas.style.cursor = ''; cb.hover(null); if (!selected) applyLines(); requestRender(); } };
  const onKey = (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') e.shiftKey ? panBy(40, 0) : nudge(-0.14, 0);
    else if (k === 'ArrowRight') e.shiftKey ? panBy(-40, 0) : nudge(0.14, 0);
    else if (k === 'ArrowUp') e.shiftKey ? panBy(0, 40) : nudge(0, -0.12);
    else if (k === 'ArrowDown') e.shiftKey ? panBy(0, -40) : nudge(0, 0.12);
    else if (k === '+' || k === '=') zoomBy(0.8);
    else if (k === '-' || k === '_') zoomBy(1.25);
    else if (k === '0' || k === 'Home') fit();
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

  function nudge(dT, dP) {
    if (reduced()) { view.theta += dT; view.phi = clamp(view.phi + dP, 0.01, Math.PI - 0.08); requestRender(); }
    else goTo({ theta: view.theta + dT, phi: view.phi + dP, radius: view.radius, target: view.target.clone() });
  }
  function zoomBy(f) { view.radius = clamp(view.radius * f, 30, fitRadius * 2.4); tween = null; requestRender(); }
  function panBy(dx, dy) {
    const scale = (2 * view.radius * Math.tan((camera.fov * Math.PI) / 360)) / size.h;
    const right = new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new T.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    view.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    tween = null; requestRender();
  }

  /* ── Tamaño ── */
  function resize() {
    // la sección se cerró (otra pestaña, cierre de sesión…): quien creó el visor lo libera
    if (!container.isConnected) { if (options.onDetached) options.onDetached(); return; }
    const r = container.getBoundingClientRect();
    const was = size.w;
    size = { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
    renderer.setSize(size.w, size.h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = size.w / size.h; camera.updateProjectionMatrix();
    if (data && was > 1 && Math.abs(was - size.w) > 40 && !selected) fit(true);
    requestRender();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /* ── API pública ── */
  return {
    setData, select, focus, focusRegion,
    reset: () => fit(),
    refit: (instant) => fit(!!instant),
    setFilter(f) {
      visible = f.visible || null;
      if (f.edgeTypes) edgeTypes = f.edgeTypes;
      if (f.edgeMode) edgeMode = f.edgeMode;
      if (selected && !isVisible(selected)) { selected = null; cb.select(null); }
      applyNodes(); applyLines(); requestRender();
    },
    setLayout(m) {
      if (!data || !L[m] || m === mode) return;
      mode = m;
      if (reduced()) { P.set(L[m]); applyNodes(); applyLines(); fit(true); return; }
      morph = { t0: performance.now(), dur: 900, from: new Float32Array(P), to: L[m] };
      applyLines();
      fit();
      requestRender();
    },
    setCamera(p, instant) { if (!PRESET[p]) return; preset = p; fit(!!instant); },
    rotate: (dx, dy) => nudge(dx, dy),
    zoom: zoomBy,
    pan: panBy,
    /* para pruebas y diagnóstico */
    info: () => ({
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      labels: pool.filter((p) => p.style.display !== 'none').length, selected, hovered, layout: mode, preset,
      visible: data ? data.nodes.filter((n) => isVisible(n.id)).length : 0, frames: raf !== 0, frameCount: frames,
    }),
    screenPos(id) {
      if (!data || !data.index.has(id)) return null;
      camera.updateMatrixWorld();
      const p = endPoint(idx(id));
      tmpV.set(...p).project(camera);
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (tmpV.x * 0.5 + 0.5) * r.width, y: r.top + (-tmpV.y * 0.5 + 0.5) * r.height };
    },
    /* posiciones destino de la distribución actual y comprobación de sectores (para pruebas) */
    debugPositions() {
      const out = {};
      data.nodes.forEach((n, i) => { out[n.id] = [L[mode][i * 3], L[mode][i * 3 + 1], L[mode][i * 3 + 2]]; });
      return out;
    },
    debugSectorsOk() {
      const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return data.nodes.filter((n) => KNOWLEDGE.has(n.type)).every((n) => {
        const s = sectors.find((x) => x.id === n.region);
        const i = idx(n.id);
        const a = norm(Math.atan2(L.mapa[i * 3 + 2], L.mapa[i * 3]));
        const a0 = norm(s.a0), span = s.a1 - s.a0;
        return norm(a - a0) <= span + 1e-6;
      });
    },
    renderNow() { cancelAnimationFrame(raf); raf = 0; frame(performance.now()); },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      ac.abort(); ro.disconnect();
      clearScene();
      disposeObj(selRing);
      SHARED_GEOS.forEach((g) => g.dispose());
      SHARED_MATS.forEach((m) => m.dispose());
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* ya perdido */ }
      canvas.remove(); labelsEl.remove();
    },
  };
}
