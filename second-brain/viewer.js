/* ═══════════════════════════════════════════════
   second-brain/viewer.js: escena 3D de Second Brain (Three.js)
   ─────────────────────────────────────────────────
   Módulo ES. Solo DIBUJA un snapshot ya calculado: no lee documentos, no llama a ningún
   modelo y no conoce credenciales. Recibe Three.js por parámetro (vendor/three-…-sb2.js).

   Lenguaje visual (se lee sin leyenda, la leyenda lo confirma):
     · COLOR       = área de conocimiento (un color por área, el mismo en suelo, nodos y etiquetas)
     · ICONO       = qué es (Power BI, SQL, Python, proyecto, competencia…)
     · RELLENO     = evidencia: sólido = respaldado · claro = mencionado · contorno discontinuo = por validar
     · ANILLO      = rojo: brecha · ámbar: prioridad ahora · tinta: seleccionado
     · FORMA       = círculo: conocimiento · hexágono: competencia · cuadrado: proyecto
     · LÍNEA       = tipo de relación (continua, verde, discontinua, punteada, ámbar)
   Distribución «Mapa»: sector = área, del centro al borde = de respaldado a por validar
   (anillos proporcionales), altura = tipo, cinturón exterior = proyectos. «Red» = fuerzas del motor.

   Rendimiento: dibujo bajo demanda (0 fotogramas en reposo); TODOS los nodos en una sola
   llamada de dibujo (shader instanciado con atlas de iconos); selección en espacio de pantalla
   (sin raycasting); etiquetas HTML limitadas; recursos liberados en dispose().
   ═══════════════════════════════════════════════ */
// el atlas de iconos llega por options.icons (second-brain/icons.js, cargado con su ?v= por la pestaña)

/* Escala de tamaños (unidades del mundo): una jerarquía y no valores sueltos.
   objetivo > competencia > concepto (crece con la raíz de sus proyectos) > proyecto. */
export const SIZE = { objetivo: 5.4, objetivoSec: 4.6, competencia: 3.5, competenciaRespaldada: 4.2, conceptoMin: 2.3, conceptoMax: 3.3, proyecto: 1.9, recomendacion: 2.0 };
export function nodeRadius(n) {
  const ev = Math.min(1, Math.sqrt(((n.evidence && n.evidence.projects) || 0) / 10));
  if (n.type === 'objetivo') return n.size >= 1 ? SIZE.objetivo : SIZE.objetivoSec;
  if (n.type === 'competencia') return n.state === 'respaldado' ? SIZE.competenciaRespaldada : SIZE.competencia;
  if (n.type === 'proyecto') return SIZE.proyecto;
  if (n.type === 'recomendacion') return SIZE.recomendacion;
  return SIZE.conceptoMin + (SIZE.conceptoMax - SIZE.conceptoMin) * ev;
}
export const PALETTE = {
  bg: '#ffffff', ink: '#1d2638', navy: '#273a5f', steel: '#8c9ab3', mist: '#c6cfdd', unclassified: '#9aa5b5', unclassifiedInk: '#5b6678',
  line: '#dce2eb', lineSoft: '#e9edf3', amber: '#d9952c', amberInk: '#8a5a12', green: '#2f7d5b', red: '#b3263f',
};
const AREA_FALLBACK = ['#2f6db5', '#14897c', '#7a52b3', '#d0613f', '#b8478f', '#5e7d2f', '#8a6a3c', '#273a5f', '#1d2638'];
/* Familias de relación: cuatro estilos que se distinguen de verdad (el tipo exacto va en el panel).
   «demuestra» es la prueba y lleva el grosor máximo; «recomienda» es lo único discontinuo porque
   todavía no existe; lo estructural es fino y tenue. */
export const EDGE_STYLE = {
  tecnica: { types: ['usa', 'parte-de', 'requiere'], color: '#3a4f78', dash: null, label: 'Dependencia técnica' },
  mejora: { types: ['mejora', 'habilita'], color: '#2f7d5b', dash: null, label: 'Mejora o habilita' },
  demuestra: { types: ['demuestra'], color: null, dash: null, strong: true, label: 'Proyecto que lo demuestra (color del área)' },
  estructura: { types: ['agrupa', 'necesita'], color: '#8c9ab3', dash: null, thin: true, label: 'Pertenece a / requerido por' },
  recomienda: { types: ['recomienda'], color: '#d9952c', dash: [2.1, 1.3], label: 'Recomendación (aún por hacer)' },
};
const STYLE_OF = {};
for (const [k, v] of Object.entries(EDGE_STYLE)) for (const t of v.types) STYLE_OF[t] = k;

const KNOWLEDGE = new Set(['tecnologia', 'concepto', 'tecnica']);
const HUB = 30;      // disco central libre: ahí se apilan los objetivos (también su posición aparente en perspectiva)
const RIM = 96;
const Y = { concepto: 0, competencia: 30, rec: 12, proyecto: 0, objetivo: 8 };
// desplazamiento sobre el suelo, por unidad de altura, con el que se ve un nodo elevado en la perspectiva por defecto (theta -0,42; phi 0,8)
const PARALLAX = { x: -Math.sin(-0.42) * Math.tan(0.8), z: -Math.cos(-0.42) * Math.tan(0.8) };
const BELT = [110, 121, 132];        // cinturón de proyectos: hasta tres anillos
const LABEL_CAP = 35;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ═══════════ DISTRIBUCIÓN «MAPA» ═══════════ */
export /** Separa los nodos de un mismo sector y anillo. La z se comprime (la perspectiva por defecto acorta esa dirección). */
function relax(items, fixed, iters = 110) {
  const Z = 0.74, TAU = Math.PI * 2;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      for (let j = 0; j < items.length + fixed.length; j++) {
        if (j === i) continue;
        const b = j < items.length ? items[j] : fixed[j - items.length];
        const dx = a.x - b.x, dz = (a.z - b.z) / Z;
        const d = Math.hypot(dx, dz) || 0.001;
        const min = (a.r + b.r) * 1.4 + 2.5;
        if (d >= min) continue;
        const k = ((min - d) * (j < items.length ? 0.5 : 1)) / d;
        a.x += dx * k; a.z += dz * k * Z;
      }
      const rad = Math.max(0.001, Math.hypot(a.x, a.z));
      const rr = Math.min(Math.max(rad, a.r0 + a.r), a.r1 - a.r);
      let da = Math.atan2(a.z, a.x) - a.a0;
      da -= Math.round(da / TAU) * TAU;
      if (da < -Math.PI / 2) da += TAU;
      const pad = Math.min((a.a1 - a.a0) / 2.2, (a.r * 1.05) / Math.max(rr, 1));
      const ang = a.a0 + Math.min(Math.max(da, pad), a.a1 - a.a0 - pad);
      a.x = Math.cos(ang) * rr; a.z = Math.sin(ang) * rr;
    }
  }
}

function mapLayout(snapshot) {
  const nodes = snapshot.nodes;
  const pos = new Map();
  const knowRegions = snapshot.regions.filter((r) => nodes.some((n) => n.region === r.id && (KNOWLEDGE.has(n.type) || n.type === 'competencia')));
  const weight = (r) => Math.max(2.5, nodes.filter((n) => n.region === r.id && KNOWLEDGE.has(n.type)).length + 0.6 * nodes.filter((n) => n.region === r.id && n.type === 'competencia').length);
  const total = knowRegions.reduce((s, r) => s + weight(r), 0) || 1;
  const GAP = 0.09;
  const usable = Math.PI * 2 - GAP * knowRegions.length;
  let a = Math.PI / 2 + GAP / 2;     // el primer hueco queda delante de la cámara inicial (+z)
  const sectors = knowRegions.map((r) => {
    const span = (usable * weight(r)) / total;
    const s = { id: r.id, label: r.label, color: r.color, icon: r.icon, a0: a, a1: a + span, ac: a + span / 2 };
    a += span + GAP;
    return s;
  });
  const at = (ang, r, y) => [Math.cos(ang) * r, y, Math.sin(ang) * r];

  const keyOf = (n) => (n.state === 'respaldado' || n.state === 'mencionado' ? n.state : 'otros');
  const w = { respaldado: 3, mencionado: 3, otros: 3 };
  nodes.filter((n) => KNOWLEDGE.has(n.type)).forEach((n) => { w[keyOf(n)] += 1; });
  const W = w.respaldado + w.mencionado + w.otros;
  const BAND = {};
  let acc = 0;
  for (const k of ['respaldado', 'mencionado', 'otros']) {
    const rA = Math.sqrt(HUB * HUB + (RIM * RIM - HUB * HUB) * (acc / W));
    acc += w[k];
    const rB = Math.sqrt(HUB * HUB + (RIM * RIM - HUB * HUB) * (acc / W));
    BAND[k] = [rA + 2.5, rB - 2.5];
  }
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
      fill(comps.filter(inBand(key)), s.a0 + pad, s.a1 - pad, (r0 + r1) / 2 - 5, (r0 + r1) / 2 + 5, Y.competencia, 15);
    }
  }
  // el reparto áureo no conoce el tamaño de los nodos: se relajan hasta que no se pisen, dentro de su cuña y su anillo
  for (const s of sectors) {
    const comps = nodes.filter((n) => n.region === s.id && n.type === 'competencia').map((n) => { const p = pos.get(n.id); const [r0, r1] = BAND[keyOf(n)]; return { id: n.id, x: p[0], z: p[2], r: nodeRadius(n) * 1.1, a0: s.a0, a1: s.a1, r0, r1 }; });
    relax(comps, [], 90);
    for (const it of comps) pos.set(it.id, [it.x, pos.get(it.id)[1], it.z]);
  }
  for (const s of sectors) {
    const items = [], fixed = [];
    for (const n of nodes) {
      if (n.region !== s.id) continue;
      const p = pos.get(n.id);
      if (!p) continue;
      if (n.type === 'competencia') {
        fixed.push({ x: p[0], z: p[2], r: nodeRadius(n) });
        fixed.push({ x: p[0] + Y.competencia * PARALLAX.x, z: p[2] + Y.competencia * PARALLAX.z, r: nodeRadius(n) * 0.9 });
      }
      else if (KNOWLEDGE.has(n.type)) { const [r0, r1] = BAND[keyOf(n)]; items.push({ id: n.id, x: p[0], z: p[2], r: nodeRadius(n), a0: s.a0, a1: s.a1, r0, r1 }); }
    }
    relax(items, fixed);
    for (const it of items) pos.set(it.id, [it.x, pos.get(it.id)[1], it.z]);
  }
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
  const lastOnRing = BELT.map(() => -Infinity);
  for (const p of pAng) {
    let k = BELT.findIndex((r, i) => (p.ang - lastOnRing[i]) * r >= 10);
    if (k < 0) k = BELT.length - 1;
    const ang = Math.max(p.ang, lastOnRing[k] + 10 / BELT[k]);
    lastOnRing[k] = ang;
    pos.set(p.n.id, at(ang, BELT[k], Y.proyecto));
  }
  const order = ((snapshot.meta && snapshot.meta.levels) || []).map((l) => 'o:' + l.id);
  // los objetivos suben por el eje, pero algo desplazados para que no se tapen entre sí vistos desde arriba
  nodes.filter((n) => n.type === 'objetivo').forEach((n) => { const k = Math.max(0, order.indexOf(n.id)); pos.set(n.id, [Math.cos(k * 2.4) * 6, Y.objetivo + k * 9.5, Math.sin(k * 2.4) * 6]); });
  const recTarget = new Map(snapshot.recommendations.map((r) => [r.nodeId, r.targetId]));
  const stack = new Map();
  nodes.filter((n) => n.type === 'recomendacion').forEach((n) => {
    const tid = recTarget.get(n.id), t = pos.get(tid), k = stack.get(tid) || 0;
    stack.set(tid, k + 1);
    const hyp = t ? Math.max(1, Math.hypot(t[0], t[2])) : 1;
    pos.set(n.id, t ? [t[0] + (t[0] / hyp) * 9.5, Math.max(t[1], 0) + Y.rec + k * 9, t[2] + (t[2] / hyp) * 9.5] : [0, Y.competencia + 20, 0]);
  });
  nodes.forEach((n, i) => { if (!pos.has(n.id)) pos.set(n.id, at((i / nodes.length) * Math.PI * 2, RIM - 2, 0)); });
  return { pos, sectors, bands: BAND };
}

/* ═══════════ SHADER DE NODOS ═══════════
   Un cuadrado orientado a la cámara por nodo. El fragmento dibuja la forma (función de
   distancia), el relleno según la evidencia, el borde (discontinuo si está por validar),
   los anillos de estado y el icono leído del atlas. */
const VERT = `
attribute vec3 aPos; attribute float aSize; attribute vec3 aFill; attribute vec3 aEdge; attribute vec3 aIconCol;
attribute float aIcon; attribute float aShape; attribute float aStyle; attribute vec4 aRing; attribute float aDim; attribute float aSel; attribute float aBrand;
varying vec2 vP; varying vec3 vFill; varying vec3 vEdge; varying vec3 vIconCol; varying float vIcon; varying float vShape; varying float vStyle;
varying vec4 vRing; varying float vDim; varying float vSel; varying float vDepth; varying float vBrand; varying float vPx;
uniform float uResY;
void main() {
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  float ext = 1.62;
  mv.xy += position.xy * aSize * ext;
  vP = position.xy * ext;
  vFill = aFill; vEdge = aEdge; vIconCol = aIconCol; vIcon = aIcon; vShape = aShape; vStyle = aStyle; vRing = aRing; vDim = aDim; vSel = aSel; vBrand = aBrand;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
  vPx = aSize * projectionMatrix[1][1] * uResY * 0.5 / gl_Position.w;   // radio del nodo en píxeles
}`;
const FRAG = `
uniform sampler2D uAtlas; uniform float uCols; uniform float uFogNear; uniform float uFogFar;
varying vec2 vP; varying vec3 vFill; varying vec3 vEdge; varying vec3 vIconCol; varying float vIcon; varying float vShape; varying float vStyle;
varying vec4 vRing; varying float vDim; varying float vSel; varying float vDepth; varying float vBrand; varying float vPx;
float sdHex(vec2 p, float r) { const vec3 k = vec3(-0.866025404, 0.5, 0.577350269); p = abs(p.yx); p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy; p -= vec2(clamp(p.x, -k.z * r, k.z * r), r); return length(p) * sign(p.y); }
float sdBox(vec2 p, float b, float rr) { vec2 q = abs(p) - vec2(b - rr); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr; }
float band(float r, float a, float b, float aa) { return smoothstep(a - aa, a + aa, r) * (1.0 - smoothstep(b - aa, b + aa, r)); }
void main() {
  float d;
  if (vShape < 0.5) d = length(vP) - 1.0;                                   // conocimiento / recomendación
  else if (vShape < 1.5) d = sdBox(vP, 0.9, 0.22);                          // proyecto
  else if (vShape < 2.5) d = sdHex(vP, 0.86) - 0.08;                        // competencia (hexágono redondeado)
  else d = sdBox(vec2(vP.x + vP.y, vP.y - vP.x) * 0.7071, 0.8, 0.12);       // objetivo (rombo)
  float aa = max(fwidth(d), 0.0001) * 1.1;
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float rimW = vStyle > 0.5 ? 0.10 : 0.12;
  float rim = band(-d, 0.0, rimW, aa) * inside;
  float dashOn = 1.0;
  if (vStyle > 0.5) { float ang = atan(vP.y, vP.x); dashOn = step(0.42, fract(ang / 6.2831853 * 8.0)); }
  vec3 col = vFill;
  col = mix(col, vEdge, rim * dashOn);
  // el atlas ya viene normalizado (glifo = 60 % de la celda): el glifo ocupa ~55 % del diámetro del nodo, menos en formas con menos espacio útil
  float isc = vShape > 2.5 ? 0.66 : vShape > 1.5 ? 0.6 : 0.54;
  vec2 iuv = vP * isc + 0.5;
  float iconFade = smoothstep(5.5, 8.5, vPx);                             // con el nodo pequeño el glifo no se lee: se omite y queda una forma limpia
  float ia = 0.0;
  vec4 tx = vec4(0.0);
  if (vDim < 0.5 && iuv.x > 0.0 && iuv.x < 1.0 && iuv.y > 0.0 && iuv.y < 1.0) {
    float cx = mod(vIcon, uCols), cy = floor(vIcon / uCols);
    vec2 auv = (vec2(cx, cy) + vec2(iuv.x, 1.0 - iuv.y)) / uCols;
    auv.y = 1.0 - auv.y;
    tx = texture2D(uAtlas, auv);
    ia = tx.a * iconFade;
  }
  if (vBrand > 0.0) {
    vec3 lc = tx.rgb;
    if (vStyle > 0.5) lc = mix(vec3(dot(lc, vec3(0.299, 0.587, 0.114))), vec3(1.0), 0.35);
    col = mix(col, lc, ia * inside * vBrand);
  } else col = mix(col, vIconCol, ia * inside);
  float alpha = inside;
  float r = length(vP);
  if (vRing.a > 0.5 && vDim < 0.5) {
    float r1 = band(r, 1.16, 1.30, aa * 1.2);
    float r2 = vRing.a > 1.5 ? band(r, 1.40, 1.52, aa * 1.2) : 0.0;
    float m = max(r1, r2) * (1.0 - inside);
    col = mix(col, vRing.rgb, m); alpha = max(alpha, m);
  }
  if (vSel > 0.75) {
    // seleccionado: hueco blanco + anillo tinta de 2 px
    float gap = band(r, 1.0, 1.14, aa) * (1.0 - inside);
    float ring = band(r, 1.14, 1.32, aa * 1.2) * (1.0 - inside);
    col = mix(col, vec3(1.0), gap); col = mix(col, vec3(0.114, 0.149, 0.22), ring); alpha = max(alpha, max(gap, ring));
  } else if (vSel > 0.25) {
    float ring = band(r, 1.10, 1.20, aa * 1.2) * (1.0 - inside);
    col = mix(col, vec3(0.114, 0.149, 0.22), ring); alpha = max(alpha, ring);
  }
  if (alpha < 0.02) discard;
  if (vDim > 0.5) { col = mix(col, vec3(0.796, 0.824, 0.863), 0.85); alpha *= 0.3; }
  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  col = mix(col, vec3(1.0), fog * 0.75);
  gl_FragColor = vec4(col, alpha);
}`;

/* ═══════════ SHADER DE ARISTAS: cintas con anchura en píxeles ═══════════
   Cada segmento es un quad que el vértice ensancha perpendicular a la tangente en pantalla.
   Se estrecha del origen al destino (dirección) y su alfa crece de 0,35 a 1. Al seleccionar,
   cada arista se traza del origen al destino (260 ms, escalonada) salvo con movimiento reducido. */
const EDGE_VERT = `
attribute vec3 aA; attribute vec3 aB; attribute float aEnd; attribute float aSide; attribute float aT; attribute float aW;
attribute vec3 aCol; attribute float aAlpha; attribute float aDist; attribute float aDash; attribute float aTail; attribute float aDelay;
uniform vec2 uRes;
varying float vT; varying vec3 vCol; varying float vAlpha; varying float vDist; varying float vDash; varying float vTail; varying float vDelay;
void main() {
  vec4 ca = projectionMatrix * modelViewMatrix * vec4(aA, 1.0);
  vec4 cb = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
  vec4 c = aEnd > 0.5 ? cb : ca;
  vec2 sa = ca.xy / ca.w * uRes * 0.5, sb = cb.xy / cb.w * uRes * 0.5;
  vec2 d = sb - sa; float l = length(d);
  vec2 dir = l > 0.0001 ? d / l : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float w = aW * mix(0.6, 1.0, aT);
  c.xy += nrm * aSide * w / uRes * c.w;
  vT = aT; vCol = aCol; vAlpha = aAlpha; vDist = aDist; vDash = aDash; vTail = aTail; vDelay = aDelay;
  gl_Position = c;
}`;
const EDGE_FRAG = `
uniform float uTime; uniform float uAnim; uniform float uOpacity;
varying float vT; varying vec3 vCol; varying float vAlpha; varying float vDist; varying float vDash; varying float vTail; varying float vDelay;
void main() {
  float p = 1.0;
  if (uAnim > 0.5) { p = clamp((uTime - vDelay) / 260.0, 0.0, 1.0); p = 1.0 - pow(1.0 - p, 3.0); }
  if (vT > p) discard;
  if (vDash > 0.5 && mod(vDist, 3.4) > 2.1) discard;
  vec3 col = (vTail > 0.5 && vT > 0.8) ? vec3(0.702, 0.149, 0.247) : vCol;
  gl_FragColor = vec4(col, vAlpha * uOpacity * mix(0.35, 1.0, vT));
}`;

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
  const camera = new T.PerspectiveCamera(40, 1, 1, 3000);

  const labelsEl = document.createElement('div');
  labelsEl.className = 'sb-labels';
  labelsEl.setAttribute('aria-hidden', 'true');
  container.appendChild(labelsEl);

  const view = { theta: -0.42, phi: 0.8, radius: 300, target: new T.Vector3() };
  let fitRadius = 300;
  let data = null, mode = 'mapa';
  let visible = null, edgeTypes = null, edgeMode = 'foco', highlight = null;
  let selected = null, hovered = null;
  let tween = null, morph = null;
  const vel = { theta: 0, phi: 0 };
  let raf = 0, disposed = false, frames = 0;
  let size = { w: 1, h: 1 };
  let P = null;
  const L = {};
  let sectors = [], bands = { respaldado: [20, 50], mencionado: [52, 70], otros: [72, 94] };

  /* ── Recursos compartidos ── */
  const atlas = options.icons.buildAtlas(128, options.logos || null);
  const atlasTex = new T.CanvasTexture(atlas.canvas);
  atlasTex.colorSpace = T.NoColorSpace;
  atlasTex.minFilter = T.LinearMipmapLinearFilter;
  atlasTex.magFilter = T.LinearFilter;
  atlas.ready.then(() => { if (!disposed) { atlasTex.needsUpdate = true; requestRender(); } });
  const nodeMat = new T.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: true,
    uniforms: { uAtlas: { value: atlasTex }, uCols: { value: atlas.cols }, uFogNear: { value: 200 }, uFogFar: { value: 700 }, uResY: { value: 800 } },
  });
  const circleGeo = (r, seg) => {
    const v = [0, 0, 0], ix = [];
    for (let i = 0; i <= seg; i++) { const ang = (i / seg) * Math.PI * 2; v.push(Math.cos(ang) * r, 0, Math.sin(ang) * r); }
    for (let i = 1; i <= seg; i++) ix.push(0, i + 1, i);
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(v), 3));
    g.setIndex(ix);
    return g;
  };
  const shadowGeo = circleGeo(1, 28);
  const matShadow = new T.MeshBasicMaterial({ color: new T.Color(PALETTE.ink), transparent: true, opacity: 0.08, depthWrite: false });

  let nodesMesh = null, nodeGeo = null, attrs = null, shadows = null;
  let floorMesh = null, guides = null, stems = null, lineObjs = [];
  const tmpM = new T.Matrix4(), tmpV = new T.Vector3(), tmpC = new T.Color(), tmpC2 = new T.Color();
  const WHITE = new T.Color('#ffffff');
  /* Los shaders propios (nodos y cintas) escriben el color tal cual, sin la conversión a sRGB que three aplica a sus
     materiales. Por eso estos colores se guardan «crudos» (los mismos números que el hex): así el mapa coincide con la leyenda. */
  const RAW = (hex) => { const n = parseInt(hex.slice(1), 16); return new T.Color().setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

  const radiusOf = (n) => {
    const rr = nodeRadius(n);
    return mode === 'mapa' ? rr : rr * 1.15;
  };
  const isVisible = (id) => !visible || visible.has(id);
  const idx = (id) => data.index.get(id);
  const pAt = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
  const onFloor = (n) => KNOWLEDGE.has(n.type) || n.type === 'proyecto';
  const liftOf = (n) => (mode === 'mapa' && onFloor(n) ? radiusOf(n) * 0.95 : 0);
  const centerOf = (i) => { const p = pAt(i); p[1] += liftOf(data.nodes[i]); return p; };
  const areaColor = (id) => data.areaColor.get(id) || PALETTE.navy;
  /* Color de un nodo: su familia tecnológica (snapshot.families). Sin familia, gris neutro; un snapshot
     antiguo sin familias se sigue dibujando por áreas. Los colores claros (amarillo) usan su «tinta»
     más oscura en bordes, líneas y glifos para mantener el contraste sobre blanco. */
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  function famOf(n) {
    if (!data.families.length) { const a = RAW(areaColor(n.area || n.region)); return { base: a, ink: a, light: false }; }
    const f = n.family && data.famMap.get(n.family);
    const base = RAW(f ? f.color : PALETTE.unclassified), ink = RAW(f ? f.ink || f.color : PALETTE.unclassifiedInk);
    return { base, ink, light: lum(base) > 0.42 };
  }
  const edgeOf = (fm) => (fm.light ? fm.base.clone().lerp(fm.ink, 0.6) : fm.base.clone());

  function disposeObj(o) {
    if (!o) return;
    scene.remove(o);
    if (o.geometry && o.geometry !== shadowGeo) o.geometry.dispose();
    if (o.material && o.material !== nodeMat && o.material !== matShadow) o.material.dispose();
    if (o.isInstancedMesh) o.dispose();
  }
  function clearScene() {
    [nodesMesh, shadows, floorMesh, guides, stems, ctxRibbon, focusRibbon, ...lineObjs].forEach(disposeObj);
    nodesMesh = shadows = floorMesh = guides = stems = ctxRibbon = focusRibbon = null; lineObjs = []; nodeGeo = null; attrs = null;
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
    const areaColorMap = new Map(snapshot.regions.map((r, i) => [r.id, r.color || AREA_FALLBACK[i % AREA_FALLBACK.length]]));
    const famMap = new Map((snapshot.families || []).map((f) => [f.id, f]));
    data = { nodes, edges: snapshot.edges, regions: snapshot.regions, families: snapshot.families || [], famMap, index, adj, bucket, areaColor: areaColorMap };

    const m = mapLayout(snapshot);
    sectors = m.sectors; bands = m.bands;
    L.mapa = new Float32Array(nodes.length * 3);
    L.red = new Float32Array(nodes.length * 3);
    nodes.forEach((n, i) => { L.mapa.set(m.pos.get(n.id), i * 3); L.red.set(n.pos, i * 3); });
    P = new Float32Array(L[mode]);

    // nodos: una geometría instanciada con atributos por nodo
    const N = nodes.length;
    const base = new T.PlaneGeometry(2, 2);
    nodeGeo = new T.InstancedBufferGeometry();
    nodeGeo.index = base.index;
    nodeGeo.setAttribute('position', base.getAttribute('position'));
    nodeGeo.instanceCount = N;
    const mk = (name, n) => { const a = new T.InstancedBufferAttribute(new Float32Array(N * n), n); a.setUsage(T.DynamicDrawUsage); nodeGeo.setAttribute(name, a); return a; };
    attrs = { aPos: mk('aPos', 3), aSize: mk('aSize', 1), aFill: mk('aFill', 3), aEdge: mk('aEdge', 3), aIconCol: mk('aIconCol', 3), aIcon: mk('aIcon', 1), aShape: mk('aShape', 1), aStyle: mk('aStyle', 1), aRing: mk('aRing', 4), aDim: mk('aDim', 1), aSel: mk('aSel', 1), aBrand: mk('aBrand', 1) };
    // aspecto fijo de cada nodo (color, icono, forma, estilo, anillos): se calcula una vez
    nodes.forEach((n, i) => {
      const fm = famOf(n), area = edgeOf(fm);
      const NAVY = RAW(PALETTE.navy);
      let fill, edge, icon;
      const open = n.state === 'pendiente' || n.state === 'brecha_probable' || n.state === 'brecha_confirmada';
      if (n.type === 'recomendacion') { fill = RAW(PALETTE.amber); edge = RAW(PALETTE.amberInk); icon = WHITE; }
      else if (n.type === 'objetivo') { fill = RAW('#273a5f'); edge = fill; icon = WHITE; }
      else if (n.type === 'proyecto') { fill = fm.base.clone().lerp(WHITE, 0.9); edge = area; icon = fm.ink; }
      else if (n.state === 'respaldado') { fill = fm.base.clone(); edge = fm.base.clone().multiplyScalar(fm.light ? 0.8 : 0.72); icon = fm.light ? NAVY : WHITE; }
      else if (n.state === 'mencionado') { fill = fm.base.clone().lerp(WHITE, 0.84); edge = area; icon = fm.ink; }
      else { fill = WHITE.clone(); edge = area.clone().lerp(WHITE, 0.3); icon = fm.ink.clone().lerp(WHITE, 0.35); }
      // tecnologías con logotipo: ficha blanca, logotipo a color y borde del color del área
      const logoCell = n.id.startsWith('c:') ? atlas.logo(n.id.slice(2)) : -1;
      if (logoCell >= 0) { fill = WHITE.clone(); edge = open ? area.clone().lerp(WHITE, 0.3) : area; }
      attrs.aFill.setXYZ(i, fill.r, fill.g, fill.b);
      attrs.aEdge.setXYZ(i, edge.r, edge.g, edge.b);
      attrs.aIconCol.setXYZ(i, icon.r, icon.g, icon.b);
      attrs.aBrand.setX(i, logoCell >= 0 ? (n.state === 'mencionado' ? 0.55 : 1) : 0);
      attrs.aIcon.setX(i, logoCell >= 0 ? logoCell : atlas.index(n.icon || ({ proyecto: 'folder', competencia: 'hexagon', objetivo: 'flag', recomendacion: 'bulb' }[n.type] || 'dot')));
      attrs.aShape.setX(i, n.type === 'proyecto' ? 1 : n.type === 'competencia' ? 2 : n.type === 'objetivo' ? 3 : 0);
      attrs.aStyle.setX(i, open && n.type !== 'proyecto' ? 1 : 0);
      const gap = n.state === 'brecha_probable' || n.state === 'brecha_confirmada';
      const now = bucket.get(n.id) === 'ahora' && n.type !== 'recomendacion';
      const rc = RAW(gap ? PALETTE.red : PALETTE.amber);
      attrs.aRing.setXYZW(i, rc.r, rc.g, rc.b, gap ? (n.state === 'brecha_confirmada' ? 2 : 1) : now ? 1 : 0);
    });
    nodesMesh = new T.Mesh(nodeGeo, nodeMat);
    nodesMesh.frustumCulled = false; nodesMesh.renderOrder = 10;
    scene.add(nodesMesh);

    shadows = new T.InstancedMesh(shadowGeo, matShadow, N);
    shadows.frustumCulled = false; shadows.renderOrder = 1;
    scene.add(shadows);
    buildFloor();
    visible = null; selected = null; hovered = null; highlight = null;
    applyNodes(); applyLines();
    fit(true);
    requestRender();
  }

  /* ── Suelo del mapa: cada área con su gama de color, más intensa en el anillo de lo respaldado ── */
  function buildFloor() {
    const pos = [], col = [];
    const TINT = { respaldado: 0.8, mencionado: 0.88, otros: 0.94 };
    const tri = (p, q, r, c) => { pos.push(...p, ...q, ...r); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b); };
    const ring = (a0, a1, r0, r1, c) => {
      const seg = Math.max(2, Math.ceil((a1 - a0) / 0.04));
      for (let s = 0; s < seg; s++) {
        const x0 = a0 + ((a1 - a0) * s) / seg, x1 = a0 + ((a1 - a0) * (s + 1)) / seg;
        const p00 = [Math.cos(x0) * r0, 0, Math.sin(x0) * r0], p01 = [Math.cos(x0) * r1, 0, Math.sin(x0) * r1];
        const p10 = [Math.cos(x1) * r0, 0, Math.sin(x1) * r0], p11 = [Math.cos(x1) * r1, 0, Math.sin(x1) * r1];
        tri(p00, p11, p01, c); tri(p00, p10, p11, c);
      }
    };
    for (const s of sectors) {
      const base = new T.Color(s.color || areaColor(s.id));
      ring(s.a0, s.a1, HUB, bands.respaldado[1] + 2.5, base.clone().lerp(WHITE, TINT.respaldado));
      ring(s.a0, s.a1, bands.respaldado[1] + 2.5, bands.mencionado[1] + 2.5, base.clone().lerp(WHITE, TINT.mencionado));
      ring(s.a0, s.a1, bands.mencionado[1] + 2.5, RIM, base.clone().lerp(WHITE, TINT.otros));
      // franja del cinturón de proyectos con el color del área, muy suave
      ring(s.a0, s.a1, BELT[0] - 6, BELT[BELT.length - 1] + 7, base.clone().lerp(WHITE, 0.95));
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(col), 3));
    floorMesh = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, depthWrite: false }));
    floorMesh.position.y = -0.06; floorMesh.renderOrder = 0;
    scene.add(floorMesh);
    // líneas guía: límites de anillos (más marcados) y de sectores
    const gp = [], gc = [];
    const seg = (p, q, c) => { gp.push(...p, ...q); tmpC.set(c); gc.push(tmpC.r, tmpC.g, tmpC.b, tmpC.r, tmpC.g, tmpC.b); };
    const circle = (r, c, n = 200) => { for (let i = 0; i < n; i++) { const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2; seg([Math.cos(a0) * r, 0, Math.sin(a0) * r], [Math.cos(a1) * r, 0, Math.sin(a1) * r], c); } };
    circle(HUB, '#cfd6e2'); circle(bands.respaldado[1] + 2.5, '#b9c3d3'); circle(bands.mencionado[1] + 2.5, '#cfd6e2'); circle(RIM, '#b9c3d3');
    circle(BELT[0] - 6, '#dce2eb'); circle(BELT[BELT.length - 1] + 7, '#e9edf3');
    for (const s of sectors) for (const ang of [s.a0, s.a1]) seg([Math.cos(ang) * HUB, 0, Math.sin(ang) * HUB], [Math.cos(ang) * RIM, 0, Math.sin(ang) * RIM], '#ffffff');
    const gg = new T.BufferGeometry();
    gg.setAttribute('position', new T.BufferAttribute(new Float32Array(gp), 3));
    gg.setAttribute('color', new T.BufferAttribute(new Float32Array(gc), 3));
    guides = new T.LineSegments(gg, new T.LineBasicMaterial({ vertexColors: true }));
    guides.frustumCulled = false; guides.renderOrder = 0.5;
    scene.add(guides);
  }

  /* ── Estado dinámico de los nodos: posición, tamaño, foco y selección ── */
  function focusSet() {
    if (selected) return new Set([selected, ...data.adj.get(selected).map((x) => x[0])]);
    if (highlight) return highlight;
    return null;
  }
  function applyNodes() {
    if (!data) return;
    const fs = focusSet();
    data.nodes.forEach((n, i) => {
      const vis = isVisible(n.id);
      const c = centerOf(i);
      attrs.aPos.setXYZ(i, c[0], c[1], c[2]);
      attrs.aSize.setX(i, vis ? radiusOf(n) * (n.id === selected ? 1.18 : n.id === hovered ? 1.08 : 1) : 0);
      attrs.aDim.setX(i, fs && !fs.has(n.id) ? 1 : 0);
      attrs.aSel.setX(i, n.id === selected ? 1 : n.id === hovered ? 0.5 : 0);
      const on = vis && mode === 'mapa' && !(fs && !fs.has(n.id));   // los atenuados no proyectan sombra
      const r = on ? radiusOf(n) * 1.2 : 0.0001;
      tmpM.makeScale(r, 1, r).setPosition(P[i * 3], 0.03, P[i * 3 + 2]);
      shadows.setMatrixAt(i, tmpM);
    });
    for (const k of ['aPos', 'aSize', 'aDim', 'aSel']) attrs[k].needsUpdate = true;
    shadows.instanceMatrix.needsUpdate = true;
    if (floorMesh) floorMesh.visible = mode === 'mapa';
    if (guides) guides.visible = mode === 'mapa';
  }

  /* ── Aristas: cintas instanciadas por segmento (ver EDGE_VERT) ── */
  let ctxRibbon = null, focusRibbon = null, selStart = 0;
  const CONF_W = { alta: 1, media: 0.6, baja: 0.3 };
  function edgePoints(i, j, curved) {
    const p = centerOf(i), q = centerOf(j);
    const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    const same = (data.nodes[i].area || data.nodes[i].region) === (data.nodes[j].area || data.nodes[j].region);
    const N = 24, pts = [];
    if (curved) {
      const hgt = Math.min(0.12 * d, 8) * (same ? 0.5 : 1) + 0.6;
      const c = [(p[0] + q[0]) / 2, Math.max(p[1], q[1]) + hgt, (p[2] + q[2]) / 2];
      for (let k = 0; k <= N; k++) { const t = k / N, u = 1 - t; pts.push([u * u * p[0] + 2 * u * t * c[0] + t * t * q[0], u * u * p[1] + 2 * u * t * c[1] + t * t * q[1], u * u * p[2] + 2 * u * t * c[2] + t * t * q[2]]); }
    } else for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]); }
    // la cinta empieza y termina fuera de los nodos: nunca pasa por debajo de un icono
    const ra = radiusOf(data.nodes[i]) * 1.3 + 0.4, rb = radiusOf(data.nodes[j]) * 1.3 + 0.4;
    const dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    let a0 = 0, a1 = pts.length - 1;
    while (a0 < a1 && dd(pts[a0], p) < ra) a0++;
    while (a1 > a0 && dd(pts[a1], q) < rb) a1--;
    return a1 - a0 >= 1 ? pts.slice(a0, a1 + 1) : null;
  }
  function ribbon(list, opacity, anim) {
    let segs = 0;
    for (const e of list) segs += e.pts.length - 1;
    if (!segs) return null;
    const V = segs * 4;
    const A = new Float32Array(V * 3), B = new Float32Array(V * 3), END = new Float32Array(V), SIDE = new Float32Array(V), TT = new Float32Array(V);
    const W = new Float32Array(V), COL = new Float32Array(V * 3), AL = new Float32Array(V), DIST = new Float32Array(V), DASH = new Float32Array(V), TAIL = new Float32Array(V), DEL = new Float32Array(V);
    const idxArr = new Uint32Array(segs * 6);
    let v = 0, q = 0;
    for (const e of list) {
      const n = e.pts.length - 1;
      let dist = 0;
      for (let k = 0; k < n; k++) {
        const a = e.pts[k], b = e.pts[k + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        for (let c = 0; c < 4; c++) {
          const end = c >= 2 ? 1 : 0;
          A.set(a, v * 3); B.set(b, v * 3); END[v] = end; SIDE[v] = c % 2 ? 1 : -1;
          TT[v] = (k + end) / n; W[v] = e.w; COL[v * 3] = e.col.r; COL[v * 3 + 1] = e.col.g; COL[v * 3 + 2] = e.col.b;
          AL[v] = e.alpha; DIST[v] = dist + (end ? len : 0); DASH[v] = e.dash ? 1 : 0; TAIL[v] = e.tail ? 1 : 0; DEL[v] = e.delay;
          v++;
        }
        const o = v - 4;
        idxArr.set([o, o + 1, o + 2, o + 2, o + 1, o + 3], q); q += 6;
        dist += len;
      }
    }
    const g = new T.BufferGeometry();
    const at = (name, arr, n) => g.setAttribute(name, new T.BufferAttribute(arr, n));
    at('position', A, 3); at('aA', A, 3); at('aB', B, 3); at('aEnd', END, 1); at('aSide', SIDE, 1); at('aT', TT, 1); at('aW', W, 1);
    at('aCol', COL, 3); at('aAlpha', AL, 1); at('aDist', DIST, 1); at('aDash', DASH, 1); at('aTail', TAIL, 1); at('aDelay', DEL, 1);
    g.setIndex(new T.BufferAttribute(idxArr, 1));
    const mat = new T.ShaderMaterial({
      vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG, transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { uRes: { value: new T.Vector2(size.w, size.h) }, uTime: { value: 0 }, uAnim: { value: anim ? 1 : 0 }, uOpacity: { value: opacity } },
    });
    const mesh = new T.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.renderOrder = anim || opacity > 0.5 ? 5 : 3;
    scene.add(mesh);
    return mesh;
  }
  function lineObj(buf) {
    if (!buf.p.length) return null;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(buf.p), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(buf.c), 3));
    const l = new T.LineSegments(g, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
    l.frustumCulled = false; l.renderOrder = 2;
    scene.add(l);
    return l;
  }
  function applyLines() {
    if (!data) return;
    [stems, ctxRibbon, focusRibbon, ...lineObjs].forEach(disposeObj);
    stems = ctxRibbon = focusRibbon = null; lineObjs = [];
    if (morph) return;
    const curved = mode === 'mapa';
    if (mode === 'mapa') {
      // tallos: todos en la vista lateral; en el resto, solo el del nodo seleccionado (y el eje de objetivos)
      const st = { p: [], c: [] };
      tmpC.set('#e3e7ee');
      const push = (p, q) => { st.p.push(...p, ...q); st.c.push(tmpC.r, tmpC.g, tmpC.b, tmpC.r, tmpC.g, tmpC.b); };
      data.nodes.forEach((n, i) => {
        if (!isVisible(n.id) || onFloor(n) || n.type === 'objetivo') return;
        if (preset !== 'lateral' && n.id !== selected) return;
        const p = pAt(i); push(p, [p[0], 0, p[2]]);
      });
      const top = data.nodes.filter((n) => n.type === 'objetivo' && isVisible(n.id)).reduce((mx, n) => Math.max(mx, P[idx(n.id) * 3 + 1]), 0);
      if (top) push([0, 0, 0], [0, top, 0]);
      stems = lineObj(st);
    }
    const focusId = selected || hovered;
    const inFocus = focusId ? new Set(data.adj.get(focusId).map((x) => x[1])) : new Set();
    const focusList = [], ctxList = [];
    let order = 0;
    data.edges.forEach((e, i) => {
      if (!isVisible(e.source) || !isVisible(e.target)) return;
      const focus = inFocus.has(i);
      if (!focus && (edgeMode !== 'todas' || (edgeTypes && !edgeTypes.has(e.type)))) return;
      const si = idx(e.source), ti = idx(e.target);
      const pts = edgePoints(si, ti, curved);
      if (!pts) return;
      const key = STYLE_OF[e.type] || 'tecnica';
      const stl = EDGE_STYLE[key];
      const tgt = data.nodes[ti];
      const col = stl.color ? RAW(stl.color) : edgeOf(famOf(tgt));
      const w8 = CONF_W[e.confidence] || 0.6;
      if (focus) {
        const sel = !!selected;
        focusList.push({
          pts, col, dash: !!stl.dash, tail: tgt.state === 'brecha_probable' || tgt.state === 'brecha_confirmada',
          w: stl.thin ? 1.4 : stl.strong ? 3 : 1.5 + 2 * w8,
          alpha: stl.thin ? (sel ? 0.8 : 0.5) : sel ? 1 : 0.7,
          delay: sel ? Math.min(order++ * 20, 200) : 0,
        });
      } else ctxList.push({ pts, col, dash: !!stl.dash, tail: false, w: 1, alpha: stl.thin ? 0.08 : 0.15, delay: 0 });
    });
    // un nodo con muchas relaciones (p. ej. Power BI con 40+ proyectos) haría un abanico opaco:
    // se adelgazan y aclaran las cintas en proporción
    if (focusList.length > 20) {
      const k = Math.max(0.5, Math.sqrt(20 / focusList.length));
      for (const f of focusList) { f.w = Math.max(1, f.w * k); f.alpha *= 0.55 + 0.45 * k; }
    }
    ctxRibbon = ribbon(ctxList, 1, false);
    focusRibbon = ribbon(focusList, 1, !!selected && !reduced());
  }

  /* ── Cámara ── */
  function placeCamera() {
    const sp = Math.sin(view.phi);
    camera.position.set(view.target.x + view.radius * sp * Math.sin(view.theta), view.target.y + view.radius * Math.cos(view.phi), view.target.z + view.radius * sp * Math.cos(view.theta));
    camera.lookAt(view.target);
    camera.updateMatrixWorld();
  }
  function boundsOf(ids) {
    const list = (ids || data.nodes.map((n) => n.id)).filter(isVisible).map(idx);
    if (!list.length) return { c: new T.Vector3(), r: 60 };
    const c = new T.Vector3();
    list.forEach((i) => c.add(tmpV.set(...pAt(i))));
    c.multiplyScalar(1 / list.length);
    let r = 14;
    list.forEach((i) => { r = Math.max(r, c.distanceTo(tmpV.set(...pAt(i))) + 4); });
    return { c, r };
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
    to = { theta: from.theta + dt, phi: clamp(to.phi, 0.01, Math.PI - 0.08), radius: clamp(to.radius, 18, 2400), target: to.target };
    vel.theta = vel.phi = 0;
    if (instant || reduced()) { view.theta = to.theta; view.phi = to.phi; view.radius = to.radius; view.target.copy(to.target); tween = null; }
    else tween = { t0: performance.now(), dur: 700, from, to };
    requestRender();
  }
  const PRESET = { '3d': { theta: -0.42, phi: 0.8 }, cenital: { theta: 0, phi: 0.012 }, lateral: { theta: -0.42, phi: 1.5 } };
  let preset = '3d';
  function fitPoints() {
    const D = L[mode];
    if (mode === 'mapa' && !visible) {
      const pts = [];
      const lab = size.w < 700 ? 0 : 0.12;
      for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; pts.push([Math.cos(a) * (BELT[BELT.length - 1] + 15) * (1 + lab * Math.abs(Math.cos(a))), 0, Math.sin(a) * (BELT[BELT.length - 1] + 15)]); }
      let top = Y.competencia + 8;
      data.nodes.forEach((n, i) => { top = Math.max(top, D[i * 3 + 1] + 6); });
      pts.push([0, top, 0]);
      return pts;
    }
    return data.nodes.filter((n) => isVisible(n.id)).map((n) => { const i = idx(n.id); return [D[i * 3], D[i * 3 + 1], D[i * 3 + 2]]; });
  }
  let uiRects = [];                                          // rectángulos de los controles superpuestos (leyenda, barra, mandos), en px del lienzo
  let insets = { top: 92, bottom: 0, left: 0, right: 0 };   // zonas ocupadas por los controles superpuestos (px)
  function fitDistance(pts, target, theta, phi) {
    const saved = { theta: view.theta, phi: view.phi, radius: view.radius, target: view.target.clone() };
    view.theta = theta; view.phi = phi; view.target.copy(target); view.radius = 300;
    const xl = -0.96 + (2 * insets.left) / Math.max(200, size.w), xr = 0.96 - (2 * insets.right) / Math.max(200, size.w);
    const yt = 0.96 - (2 * insets.top) / Math.max(200, size.h), yb = -0.96 + (2 * insets.bottom) / Math.max(200, size.h);
    const right = new T.Vector3(), up = new T.Vector3();
    for (let k = 0; k < 8; k++) {
      placeCamera();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { tmpV.set(p[0], p[1], p[2]).project(camera); x0 = Math.min(x0, tmpV.x); x1 = Math.max(x1, tmpV.x); y0 = Math.min(y0, tmpV.y); y1 = Math.max(y1, tmpV.y); }
      const halfH = view.radius * Math.tan((camera.fov * Math.PI) / 360), halfW = halfH * camera.aspect;
      right.set(1, 0, 0).applyQuaternion(camera.quaternion); up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      view.target.addScaledVector(right, ((x0 + x1) / 2 - (xl + xr) / 2) * halfW * 0.9).addScaledVector(up, ((y0 + y1) / 2 - (yt + yb) / 2) * halfH * 0.9);
      view.radius = clamp(view.radius * Math.max((x1 - x0) / (xr - xl), (y1 - y0) / (yt - yb), 0.05), 20, 2400);
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
    nodeMat.uniforms.uFogNear.value = view.radius * 0.85;
    nodeMat.uniforms.uFogFar.value = view.radius * 2.8 + 120;
    for (const rb of [ctxRibbon, focusRibbon]) if (rb) rb.material.uniforms.uRes.value.set(size.w, size.h);
    if (focusRibbon && focusRibbon.material.uniforms.uAnim.value > 0.5) {
      const tt = now - selStart;
      focusRibbon.material.uniforms.uTime.value = tt;
      if (tt < 480) moving = true;
    }
    renderer.render(scene, camera);
    updateLabels();
    if (moving) requestRender();
  }

  /* ── Proyección a pantalla (etiquetas y selección) ── */
  const toScreen = (p) => { tmpV.set(p[0], p[1], p[2]).project(camera); return tmpV.z > 1 ? null : [(tmpV.x * 0.5 + 0.5) * size.w, (-tmpV.y * 0.5 + 0.5) * size.h, tmpV.z]; };
  const pxRadius = (i) => {
    const n = data.nodes[i];
    const c = centerOf(i);
    const depth = tmpV.set(c[0], c[1], c[2]).applyMatrix4(camera.matrixWorldInverse).z * -1;
    return depth > 0 ? (radiusOf(n) * size.h) / (2 * depth * Math.tan((camera.fov * Math.PI) / 360)) : 0;
  };

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
    const CW = { 'is-region': 7.6, 'is-guide': 7.2, 'is-n2': 7.4, 'is-sel': 7.6, 'is-hover': 7.2, 'is-n3': 6.6, 'is-proj': 6.4 };
    const hit = (b) => placed.some((q) => b[0] < q[0] + q[2] + 4 && b[0] + b[2] + 4 > q[0] && b[1] < q[1] + q[3] + 4 && b[1] + b[3] + 4 > q[1]);
    // anchor: r = a la derecha, l = a la izquierda, b = debajo, c = centrado
    // círculos de pantalla de los nodos visibles: una etiqueta no puede tapar a otro nodo
    const discs = [];
    data.nodes.forEach((n, i) => { if (!isVisible(n.id)) return; const s = toScreen(centerOf(i)); if (s && s[0] > -40 && s[0] < w + 40 && s[1] > -40 && s[1] < h + 40) discs.push({ id: n.id, x: s[0], y: s[1], r: pxRadius(i) * 1.05 + 1.5 }); });
    const hitsUi = (b) => uiRects.some((u) => b[0] < u.x + u.w + 4 && b[0] + b[2] > u.x - 4 && b[1] < u.y + u.h + 4 && b[1] + b[3] > u.y - 4);
    const hitsNode = (b, selfId) => discs.some((d) => {
      if (d.id === selfId) return false;
      const cx = Math.max(b[0], Math.min(d.x, b[0] + b[2])), cy = Math.max(b[1], Math.min(d.y, b[1] + b[3]));
      return (d.x - cx) ** 2 + (d.y - cy) ** 2 < d.r * d.r;
    });
    const MAXLEN = { 'is-n2': 66, 'is-sel': 60, 'is-hover': 60, 'is-region': 40, 'is-guide': 20 };
    const short = (t, cls) => { const m = MAXLEN[cls] || 30; return t.length > m ? t.slice(0, m - 1) + '…' : t; };
    // los nombres largos se parten en dos líneas por palabras (hasta ~22 caracteres cada una)
    const wrap = (t, cls) => {
      if (!/is-n2|is-sel|is-hover/.test(cls) || t.length <= 24) return t;
      const out = [''];
      for (const wd of t.split(' ')) {
        const cur = out[out.length - 1];
        if (!cur || (cur + ' ' + wd).length <= 24) out[out.length - 1] = (cur ? cur + ' ' : '') + wd;
        else out.push(wd);
      }
      return out.slice(0, 3).join('\n');
    };    const put = (text, cls, x, y, anchor, force, selfId) => {
      if (used >= LABEL_CAP + 12 || x < -60 || x > w + 60 || y < -20 || y > h + 20) return false;
      text = wrap(short(text, cls), cls);
      const lines = text.split('\n');
      const bw = Math.max(...lines.map((l) => l.length)) * (CW[cls] || 6.8) + 4, bh = (/is-n2|is-sel/.test(cls) ? 17 : 15) * (1 + (lines.length - 1) * 0.82);
      if (anchor === 'c') {                                                         // sin recortes en los bordes ni bajo la barra superior
        x = Math.min(Math.max(x, bw / 2 + 6), w - bw / 2 - 6);
        if (cls === 'is-region' || cls === 'is-guide') y = Math.min(Math.max(y, insets.top + bh / 2 + 4), h - bh / 2 - 6);
      }
      const bx = anchor === 'r' ? x : anchor === 'l' ? x - bw : x - bw / 2;
      const by = anchor === 'b' ? y : anchor === 't' ? y - bh : y - bh / 2;
      const box = [bx, by, bw, bh];
      if (!force && (hit(box) || hitsNode(box, selfId) || hitsUi(box) || by < 2 || by + bh > h - 2 || bx < 2 || bx + bw > w - 2)) return false;
      placed.push(box);
      const el = labelEl(used++);
      el.textContent = text; el.className = 'sb-label ' + cls; el.style.display = ''; el.style.color = '';
      const tx = anchor === 'r' ? '0' : anchor === 'l' ? '-100%' : '-50%';
      const ty = anchor === 'b' ? '0' : anchor === 't' ? '-100%' : '-50%';
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(${tx}, ${ty})`;
      return true;
    };
    const nodeLabel = (n, cls, force) => {
      const i = idx(n.id);
      const sc = toScreen(centerOf(i));
      if (!sc) return false;
      const rp = pxRadius(i);
      // a la derecha, a la izquierda, debajo o encima: la primera posición libre; si no hay ninguna, solo las importantes se colocan igualmente
      const id = n.id;
      const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.75, -0.66], [0.75, 0.66], [-0.75, -0.66], [-0.75, 0.66]];
      for (const extra of [0, 14, 30]) {
        for (const [ux, uy] of DIRS) {
          const d = rp + 7 + extra;
          const ax = ux > 0.3 ? 'r' : ux < -0.3 ? 'l' : uy > 0 ? 'b' : 't';
          if (put(n.label, cls, sc[0] + ux * d, sc[1] + uy * (ax === 'b' || ax === 't' ? d - 2 : d * 0.55), ax, force, id)) return true;
        }
      }
      return false;
    };
    const tier = (n) => (n.type === 'competencia' || n.type === 'objetivo' || n.type === 'recomendacion' ? 'is-n2' : n.type === 'proyecto' ? 'is-proj' : 'is-n3');
    if (selected && isVisible(selected)) nodeLabel(data.nodes[idx(selected)], 'is-sel', true);
    if (hovered && hovered !== selected && isVisible(hovered)) nodeLabel(data.nodes[idx(hovered)], 'is-hover', true);
    if (selected) {
      // con selección: solo el nodo y sus vecinos
      const near = data.adj.get(selected).map((x) => data.nodes[idx(x[0])]).filter((n) => isVisible(n.id))
        .sort((a, b) => (tier(a) === 'is-n2' ? 0 : 1) - (tier(b) === 'is-n2' ? 0 : 1) || b.size - a.size);
      for (const n of near) nodeLabel(n, tier(n));
    } else {
      if (!morph && mode === 'mapa') {
        for (const sct of sectors) {
          if (!data.nodes.some((n) => n.region === sct.id && isVisible(n.id))) continue;
          const sc = toScreen([Math.cos(sct.ac) * (BELT[BELT.length - 1] + 20), 0, Math.sin(sct.ac) * (BELT[BELT.length - 1] + 20)]);
          if (!sc) continue;
          let ok = false;
          for (const [dx, dy] of [[0, 0], [0, -18], [0, 18], [90, 0], [-90, 0], [150, -14], [-150, -14], [150, 14], [-150, 14]]) { if (put(sct.label, 'is-region', sc[0] + dx, sc[1] + dy, 'c')) { ok = true; break; } }
          if (!ok && w >= 700) put(sct.label, 'is-region', sc[0], sc[1], 'c', true);   // en pantallas estrechas no se fuerzan: taparían el mapa
        }
        if (view.phi > 0.25) {
          const mid = (b) => (b[0] + b[1]) / 2;
          for (const [t, rr] of [['Respaldado', mid(bands.respaldado)], ['Mencionado', mid(bands.mencionado)], ['Por validar', mid(bands.otros)], ['Proyectos', BELT[1]]]) {
            const sc = toScreen([0, 0, rr]); if (sc) put(t, 'is-guide', sc[0], sc[1], 'c');
          }
        }
      } else if (!morph) {
        for (const rg of data.regions) if (rg.count && data.nodes.some((n) => n.region === rg.id && isVisible(n.id))) { const sc = toScreen(rg.center); if (sc) put(rg.label, 'is-region', sc[0], sc[1] - 40, 'c'); }
      }
      const zoom = fitRadius / view.radius;
      const hl = highlight;
      const cand = data.nodes.filter((n) => isVisible(n.id) && n.id !== hovered).filter((n) => {
        if (hl) return hl.has(n.id);
        if (tier(n) === 'is-n2') return true;
        if (n.type === 'proyecto') return zoom > 1.6;
        return pxRadius(idx(n.id)) >= 7;
      }).sort((a, b) => (tier(a) === 'is-n2' ? 0 : 1) - (tier(b) === 'is-n2' ? 0 : 1) || ((b.evidence && b.evidence.projects) || 0) - ((a.evidence && a.evidence.projects) || 0));
      for (const n of cand) { if (used >= LABEL_CAP + 12) break; nodeLabel(n, tier(n)); }
    }
    for (let i = used; i < pool.length; i++) pool[i].style.display = 'none';
  }

  /* ── Selección en espacio de pantalla: el nodo más cercano a la cámara bajo el puntero ── */
  function pick(x, y) {
    if (!data) return null;
    const r = canvas.getBoundingClientRect();
    const px = x - r.left, py = y - r.top;
    let best = null, bestZ = Infinity;
    data.nodes.forEach((n, i) => {
      if (!isVisible(n.id)) return;
      const s = toScreen(centerOf(i));
      if (!s) return;
      const rad = pxRadius(i) * 1.08 + 2;
      if ((s[0] - px) ** 2 + (s[1] - py) ** 2 <= rad * rad && s[2] < bestZ) { best = n.id; bestZ = s[2]; }
    });
    return best;
  }
  function select(id, opts = {}) {
    if (id && (!data || !data.index.has(id))) id = null;
    if (id === selected && !opts.force) return;
    selected = id;
    selStart = performance.now();
    applyNodes(); applyLines();
    if (id && opts.focus !== false) focus(id);
    requestRender();
    if (!opts.silent) cb.select(id);
  }
  function focus(id) {
    if (!data || !data.index.has(id)) return;
    const b = boundsOf([id, ...data.adj.get(id).map((x) => x[0])]);
    const p = new T.Vector3(...pAt(idx(id)));
    // encuadra el nodo y TODOS sus vecinos (antes se centraba a medias y un vecino lejano quedaba fuera)
    goTo({ theta: view.theta, phi: view.phi, radius: clamp(distanceFor(Math.max(b.r * 1.05, 45)), fitRadius * 0.55, fitRadius * 1.02), target: p.lerp(b.c, 0.8) });
  }
  function focusIds(ids) {
    if (!data || !ids.length) return;
    const b = boundsOf(ids);
    goTo({ theta: view.theta, phi: view.phi, radius: clamp(distanceFor(Math.max(b.r, 30)) * 0.95, fitRadius * 0.45, fitRadius * 1.02), target: b.c });
  }

  /* ── Entrada ── */
  const pointers = new Map();
  let drag = null, pinch = 0, hoverRaf = 0, lastMove = null;
  const doHover = () => {
    hoverRaf = 0;
    if (!lastMove || pointers.size) return;
    const id = pick(lastMove.x, lastMove.y);
    if (id !== hovered) {
      hovered = id; canvas.style.cursor = id ? 'pointer' : '';
      applyNodes();
      if (!selected) applyLines();
      requestRender();
    }
    cb.hover(id, lastMove.x, lastMove.y);
  };
  const onDown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tween = null; vel.theta = vel.phi = 0;
    if (pointers.size === 1) drag = { moved: 0, pan: e.button === 2 || e.button === 1 || e.shiftKey || preset === 'cenital' };
    if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch = Math.hypot(p.x - q.x, p.y - q.y); drag = null; }
    cb.hover(null);
  };
  const onMove = (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) { lastMove = { x: e.clientX, y: e.clientY }; if (!hoverRaf) hoverRaf = requestAnimationFrame(doHover); return; }
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
  const onLeave = () => { lastMove = null; if (hovered) { hovered = null; canvas.style.cursor = ''; applyNodes(); if (!selected) applyLines(); requestRender(); } cb.hover(null); };
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

  function resize() {
    if (!container.isConnected) { if (options.onDetached) options.onDetached(); return; }
    const r = container.getBoundingClientRect();
    const was = size.w;
    size = { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
    renderer.setSize(size.w, size.h, false);
    nodeMat.uniforms.uResY.value = size.h;
    canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = size.w / size.h; camera.updateProjectionMatrix();
    if (data && was > 1 && Math.abs(was - size.w) > 40 && !selected) fit(true);
    requestRender();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  return {
    setData, select, focus, focusIds,
    focusRegion(rid) { if (data) focusIds(data.nodes.filter((n) => n.region === rid).map((n) => n.id)); },
    reset: () => { highlight = null; applyNodes(); applyLines(); fit(); },
    refit: (instant) => fit(!!instant),
    /* zonas que tapan los controles superpuestos: el encuadre deja los nodos fuera de ellas */
    setInsets(i, refit) { uiRects = Array.isArray(i.rects) ? i.rects.slice(0, 12) : []; insets = { top: Math.max(0, i.top || 0), bottom: Math.max(0, i.bottom || 0), left: Math.max(0, i.left || 0), right: Math.max(0, i.right || 0) }; if (refit && data && !selected) fit(true); },
    setFilter(f) {
      visible = f.visible || null;
      if (f.edgeTypes) edgeTypes = f.edgeTypes;
      if (f.edgeMode) edgeMode = f.edgeMode;
      if (selected && !isVisible(selected)) { selected = null; cb.select(null); }
      applyNodes(); applyLines(); requestRender();
    },
    /* resalta un conjunto (respuesta a una pregunta): el resto se atenúa sin ocultarse */
    setHighlight(ids) { highlight = ids && ids.size ? ids : null; applyNodes(); requestRender(); },
    setLayout(m) {
      if (!data || !L[m] || m === mode) return;
      mode = m;
      if (reduced()) { P.set(L[m]); applyNodes(); applyLines(); fit(true); return; }
      morph = { t0: performance.now(), dur: 900, from: new Float32Array(P), to: L[m] };
      applyLines(); fit(); requestRender();
    },
    setCamera(p, instant) { if (!PRESET[p]) return; preset = p; applyLines(); fit(!!instant); },
    rotate: (dx, dy) => nudge(dx, dy),
    zoom: zoomBy,
    pan: panBy,
    info: () => ({
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      labels: pool.filter((p) => p.style.display !== 'none').length, selected, hovered, layout: mode, preset,
      visible: data ? data.nodes.filter((n) => isVisible(n.id)).length : 0, frames: raf !== 0, frameCount: frames,
      highlighted: highlight ? highlight.size : 0,
      edgesDrawn: { focus: focusRibbon ? focusRibbon.geometry.index.count / 6 : 0, context: ctxRibbon ? ctxRibbon.geometry.index.count / 6 : 0 },
    }),
        screenPos(id) {
      if (!data || !data.index.has(id)) return null;
      camera.updateMatrixWorld();
      const s = toScreen(centerOf(idx(id)));
      const r = canvas.getBoundingClientRect();
      return s ? { x: r.left + s[0], y: r.top + s[1] } : null;
    },
    /* Diagnóstico (solo lectura): posición y radio en píxeles de cada nodo visible y rectángulo de cada etiqueta.
       Sirve a las pruebas de geometría (solapes de nodos y etiquetas, nodos bajo los controles). */
    debugMetrics() {
      const out = { size: { w: size.w, h: size.h }, nodes: [], labels: [] };
      if (!data) return out;
      data.nodes.forEach((n, i) => {
        if (!isVisible(n.id)) return;
        const s = toScreen(centerOf(i));
        if (s) out.nodes.push({ id: n.id, type: n.type, x: s[0], y: s[1], r: pxRadius(i), z: s[2] });
      });
      const cr = canvas.getBoundingClientRect();
      pool.forEach((p) => {
        if (p.style.display === 'none') return;
        const r = p.getBoundingClientRect();
        out.labels.push({ t: p.textContent, cls: p.className.replace('sb-label ', ''), x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height });
      });
      return out;
    },
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
        return norm(a - norm(s.a0)) <= s.a1 - s.a0 + 1e-6;
      });
    },
    renderNow() { cancelAnimationFrame(raf); raf = 0; frame(performance.now()); },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf); cancelAnimationFrame(hoverRaf);
      ac.abort(); ro.disconnect();
      clearScene();
      shadowGeo.dispose(); matShadow.dispose(); nodeMat.dispose(); atlasTex.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* ya perdido */ }
      canvas.remove(); labelsEl.remove();
    },
  };
}
