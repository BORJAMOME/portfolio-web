/* ═══════════════════════════════════════════════
   color-studio/engine.js: motor cromático de Color Studio
   ─────────────────────────────────────────────────
   Módulo ES sin dependencias ni APIs del navegador: lo usan la pestaña (area-privada-color.js)
   y las pruebas (tools/test-color.mjs) con el mismo código.

   Decisiones
   · Los colores se guardan como HEX normalizado (#RRGGBB) y se comparan en CIELAB (D65)
     con la diferencia CIEDE2000 (ΔE00), más fiel a la percepción que la distancia RGB.
   · ΔE00 es una señal de PROXIMIDAD, no un juicio estético: dos colores próximos no
     «combinan» por serlo. Por eso las coincidencias se describen por tipo (idéntica,
     muy próxima, próxima) y nunca como un porcentaje de confianza.
   · Las proporciones son ESTIMACIONES de superficie a partir de pesos editables;
     no son mediciones.
   ═══════════════════════════════════════════════ */

/* ═══════════ HEX ═══════════ */
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** «#abc», «abc», « #AABBCC » → «#AABBCC»; cualquier otra cosa → null. */
export function normalizeHex(input) {
  if (typeof input !== 'string') return null;
  const m = HEX.exec(input.trim());
  if (!m) return null;
  let h = m[1].toUpperCase();
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return '#' + h;
}
export const isValidHex = (v) => normalizeHex(v) !== null;

export function hexToRgb(hex) {
  const n = normalizeHex(hex);
  if (!n) return null;
  const v = parseInt(n.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
export function rgbToHex(r, g, b) {
  const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return ('#' + c(r) + c(g) + c(b)).toUpperCase();
}

/* ═══════════ CIELAB ═══════════ */
const WHITE = { x: 0.95047, y: 1, z: 1.08883 };          // D65
const toLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const toGamma = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const EPS = 216 / 24389, KAPPA = 24389 / 27;

export function rgbToLab({ r, g, b }) {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / WHITE.x;
  const y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / WHITE.y;
  const z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / WHITE.z;
  const f = (t) => (t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
export function labToRgb({ L, a, b }) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (f) => (f ** 3 > EPS ? f ** 3 : (116 * f - 16) / KAPPA);
  const x = inv(fx) * WHITE.x, y = (L > KAPPA * EPS ? fy ** 3 : L / KAPPA) * WHITE.y, z = inv(fz) * WHITE.z;
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const G = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  const clip = (v) => Math.max(0, Math.min(1, v));
  return { r: toGamma(clip(R)), g: toGamma(clip(G)), b: toGamma(clip(B)) };
}
export const hexToLab = (hex) => { const rgb = hexToRgb(hex); return rgb ? rgbToLab(rgb) : null; };
/* Lab → HEX dentro de la gama sRGB. Fuera de gama, recortar cada canal cambia el tono (auditoría CS-16):
   se reduce el croma conservando L y h (búsqueda binaria) hasta que el color cabe. */
function linearRgb({ L, a, b }) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (f) => (f ** 3 > EPS ? f ** 3 : (116 * f - 16) / KAPPA);
  const x = inv(fx) * WHITE.x, y = (L > KAPPA * EPS ? fy ** 3 : L / KAPPA) * WHITE.y, z = inv(fz) * WHITE.z;
  return [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.9692660 * x + 1.8760108 * y + 0.0415560 * z, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z];
}
const inGamut = (lab) => linearRgb(lab).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
export const labToHex = (lab) => {
  let target = lab;
  if (!inGamut(lab) && lab.L > 0 && lab.L < 100) {
    const C = Math.hypot(lab.a, lab.b), h = Math.atan2(lab.b, lab.a);
    let lo = 0, hi = C;
    for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (inGamut({ L: lab.L, a: m * Math.cos(h), b: m * Math.sin(h) })) lo = m; else hi = m; }
    target = { L: lab.L, a: lo * Math.cos(h), b: lo * Math.sin(h) };
  }
  const c = labToRgb(target);
  return rgbToHex(c.r, c.g, c.b);
};
export function labToLch({ L, a, b }) {
  let h = Math.atan2(b, a) * 180 / Math.PI;
  if (h < 0) h += 360;
  return { L, C: Math.hypot(a, b), h };
}
export function lchToLab({ L, C, h }) {
  const r = h * Math.PI / 180;
  return { L, a: C * Math.cos(r), b: C * Math.sin(r) };
}

/** Diferencia de color CIEDE2000 entre dos Lab. */
export function deltaE2000(l1, l2) {
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(l1.a, l1.b), C2 = Math.hypot(l2.a, l2.b);
  const Cm = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1 = l1.a * (1 + G), a2 = l2.a * (1 + G);
  const c1 = Math.hypot(a1, l1.b), c2 = Math.hypot(a2, l2.b);
  const hue = (b, a) => { if (!a && !b) return 0; const h = Math.atan2(b, a) * deg; return h < 0 ? h + 360 : h; };
  const h1 = hue(l1.b, a1), h2 = hue(l2.b, a2);
  const dL = l2.L - l1.L, dC = c2 - c1;
  let dh = 0;
  if (c1 * c2) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin(dh * rad / 2);
  const Lm = (l1.L + l2.L) / 2, cm = (c1 + c2) / 2;
  let hm = h1 + h2;
  if (c1 * c2) { hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.20 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * cm, SH = 1 + 0.015 * cm * T;
  const RT = -2 * Math.sqrt(cm ** 7 / (cm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const labCache = new Map();
function labOf(hex) {
  let v = labCache.get(hex);
  if (!v) { v = hexToLab(hex); if (labCache.size > 4000) labCache.clear(); labCache.set(hex, v); }
  return v;
}
/** ΔE00 entre dos HEX (Infinity si alguno no es válido). */
const dECache = new Map();              // los mismos pares (tus prendas × colores de la Biblioteca) se repiten en cada repintado
export function colorDistance(a, b) {
  const x = normalizeHex(a), y = normalizeHex(b);
  if (!x || !y) return Infinity;
  if (x === y) return 0;
  const key = x < y ? x + y : y + x;
  let d = dECache.get(key);
  if (d === undefined) { d = deltaE2000(labOf(x), labOf(y)); if (dECache.size > 200000) dECache.clear(); dECache.set(key, d); }
  return d;
}

/* ═══════════ COINCIDENCIAS ═══════════
   Umbrales de ΔE00 (orientativos, documentados en color-studio/README.md):
   ≤ 5 suele leerse como «el mismo tono con otra luz»; ≤ 10, como «de la misma familia cercana». */
export const MATCH = { CLOSE: 5, NEAR: 10 };
export const MATCH_LABEL = { exact: 'Idéntica', close: 'Muy próxima', near: 'Próxima', none: 'Sin relación' };
export function matchKind(dE) {
  if (dE === 0) return 'exact';
  if (dE <= MATCH.CLOSE) return 'close';
  if (dE <= MATCH.NEAR) return 'near';
  return 'none';
}

/* ═══════════ FAMILIAS Y NOMBRES ═══════════
   Clasificación aproximada en LCh(ab), calibrada con colores de referencia (tools/test-color.mjs).
   «neutral» sigue la convención del vestuario: marino, marrón y beige se tratan como neutros. */
export const FAMILIES = [
  { id: 'negro', label: 'Negro', neutral: true }, { id: 'blanco', label: 'Blanco', neutral: true },
  { id: 'gris', label: 'Gris', neutral: true }, { id: 'beige', label: 'Beige', neutral: true },
  { id: 'marron', label: 'Marrón', neutral: true }, { id: 'marino', label: 'Azul marino', neutral: true },
  { id: 'azul', label: 'Azul', neutral: false }, { id: 'verde', label: 'Verde', neutral: false },
  { id: 'amarillo', label: 'Amarillo', neutral: false }, { id: 'naranja', label: 'Naranja', neutral: false },
  { id: 'rojo', label: 'Rojo', neutral: false }, { id: 'rosa', label: 'Rosa', neutral: false },
  { id: 'morado', label: 'Morado', neutral: false }
];
const FAMILY = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));
const inH = (h, a, b) => (a <= b ? h >= a && h < b : h >= a || h < b);

/** Familia y nombre descriptivo de un HEX: { family, label, neutral, name }. null si no es válido. */
export function describeColor(hex) {
  const lab = hexToLab(hex);
  if (!lab) return null;
  const { L, C, h } = labToLch(lab);
  const out = (family, name) => ({ family, label: FAMILY[family].label, neutral: FAMILY[family].neutral, name });
  // «claro/oscuro» solo en tonos poco saturados: un azul eléctrico tiene L baja y no se lee como oscuro
  const tone = (base) => (L > 75 && C < 50 ? base + ' claro' : L < 35 && C < 60 ? base + ' oscuro' : base);
  if (C < 5) {
    if (L < 18) return out('negro', 'negro');
    if (L > 90) return out('blanco', 'blanco');
    return out('gris', L < 35 ? 'gris antracita' : L > 75 ? 'gris claro' : 'gris');
  }
  if (inH(h, 30, 110) && C < 22) {
    if (L >= 85) return out('beige', 'crudo');
    if (L >= 62) return out('beige', h > 88 ? 'piedra' : 'beige');
    if (L >= 40) return out('marron', 'topo');
    return out('marron', 'marrón oscuro');
  }
  if (inH(h, 85, 125) && C < 45 && L < 65) return out('verde', L < 45 ? 'verde oliva oscuro' : C < 30 ? 'caqui' : 'verde oliva');
  // auditoría CS-08: oliva intenso, caqui claro, mostaza y ocre (calibrados con colores de ropa en tools/test-color.mjs)
  if (inH(h, 95, 130) && C >= 12 && C < 70 && L < 60) return out('verde', L < 45 ? 'verde oliva oscuro' : 'verde oliva');
  if (inH(h, 88, 110) && C >= 22 && C < 45 && L >= 60 && L < 82) return out('beige', 'caqui claro');   // chino caqui: neutro de vestuario
  if (inH(h, 78, 100) && C >= 45 && L >= 50 && L < 84) return out('amarillo', 'mostaza');
  if (inH(h, 60, 78) && C >= 45 && L >= 50 && L < 70) return out('naranja', 'ocre');
  if (C < 12 && !inH(h, 30, 110)) return out('gris', inH(h, 200, 300) ? 'gris azulado' : 'gris');
  if (inH(h, 240, 320) && L < 30) return C < 45 ? out('marino', 'azul marino') : out('azul', 'azul marino intenso');   // muy saturado ya no es un neutro
  if (inH(h, 180, 215) && L < 55 && C >= 15) return out('azul', 'azul petróleo');
  if (inH(h, 28, 50) && C >= 45 && C < 75 && L >= 35 && L < 55) return out('naranja', 'teja');      // terracota intenso, no marrón (CS-08)
  if (inH(h, 30, 75) && L < 45) return out('marron', L < 25 ? 'marrón oscuro' : 'marrón');
  if (inH(h, 50, 85) && C < 45 && L < 75) return out('marron', 'camel');
  if (inH(h, 350, 20)) return L >= 45 ? out('rosa', L > 75 ? 'rosa claro' : 'rosa') : out('rojo', 'granate');
  if (inH(h, 20, 45)) return L > 70 ? out('rosa', 'salmón') : out('rojo', L < 35 ? 'burdeos' : 'rojo');
  if (inH(h, 45, 85)) return out('naranja', L < 55 ? 'teja' : tone('naranja'));
  if (inH(h, 85, 108)) return out('amarillo', L < 75 ? 'mostaza' : tone('amarillo'));
  if (inH(h, 108, 180)) return out('verde', L < 35 ? 'verde botella' : L > 75 ? 'verde menta' : 'verde');
  if (inH(h, 180, 312)) return out('azul', inH(h, 180, 215) && L > 60 && C > 30 ? 'turquesa' : tone('azul'));
  return out('morado', L > 60 ? 'lavanda' : tone('morado'));
}
export const familyOf = (hex) => { const d = describeColor(hex); return d ? d.family : null; };
export const isNeutral = (hex) => { const d = describeColor(hex); return !!(d && d.neutral); };

/* ═══════════ PALETAS ═══════════
   Cada color conserva lo que se registró (original) y su HEX normalizado. El orden se respeta. */
export const PALETTE_MAX = 12;
export function normalizePaletteColors(list) {
  const colors = [], errors = [];
  (Array.isArray(list) ? list : []).forEach((c, i) => {
    const raw = typeof c === 'string' ? c : c && (c.hex != null ? c.hex : c.original);
    const hex = normalizeHex(typeof raw === 'string' ? raw : '');
    if (!hex) { errors.push('Color ' + (i + 1) + ': «' + String(raw == null ? '' : raw).slice(0, 20) + '» no es un HEX válido'); return; }
    const obj = typeof c === 'object' && c ? c : {};
    const original = typeof obj.original === 'string' && obj.original.trim() ? obj.original.trim().slice(0, 40) : String(raw).trim().slice(0, 40);
    colors.push({
      original, hex,
      name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 60) : null,
      role: typeof obj.role === 'string' && obj.role.trim() ? obj.role.trim().slice(0, 40) : null,
      note: typeof obj.note === 'string' && obj.note.trim() ? obj.note.trim().slice(0, 200) : null
    });
  });
  if (colors.length > PALETTE_MAX) errors.push('Una paleta admite como máximo ' + PALETTE_MAX + ' colores');
  return { colors: colors.slice(0, PALETTE_MAX), errors };
}
const hexesOf = (p) => (p.colors || []).map((c) => normalizeHex(c.hex || c)).filter(Boolean);

/**
 * Paletas de `existing` que repiten a `palette`:
 *  identical  → mismos colores en el mismo orden
 *  reordered  → mismos colores en otro orden
 *  near       → mismo número de colores y cada uno muy próximo (ΔE00 ≤ tolerance) en el mismo orden
 */
export function findDuplicates(palette, existing, tolerance = 2) {
  const a = hexesOf(palette);
  const key = a.join(','), sorted = [...a].sort().join(',');
  const out = [];
  (existing || []).forEach((p) => {
    if (p === palette || (palette.id && p.id === palette.id)) return;
    const b = hexesOf(p);
    if (b.length !== a.length || !a.length) return;
    if (b.join(',') === key) out.push({ palette: p, kind: 'identical' });
    else if ([...b].sort().join(',') === sorted) out.push({ palette: p, kind: 'reordered' });
    else if (a.every((h, i) => colorDistance(h, b[i]) <= tolerance)) out.push({ palette: p, kind: 'near' });
  });
  return out;
}

/** Compara dos paletas: para cada color de A, el más próximo de B. */
export function comparePalettes(a, b) {
  const A = hexesOf(a), B = hexesOf(b);
  const pairs = A.map((hex, i) => {
    let best = -1, dE = Infinity;
    B.forEach((h, j) => { const d = colorDistance(hex, h); if (d < dE) { dE = d; best = j; } });
    return { index: i, hex, match: best, matchHex: B[best] || null, dE, kind: best < 0 ? 'none' : matchKind(dE) };
  });
  return { pairs, shared: pairs.filter((p) => p.kind !== 'none').length };
}

/**
 * Relaciona colores (de prendas o de un outfit) con una paleta.
 * colors: [{ hex, label?, share? }] · share = peso relativo (p. ej. % de superficie estimada).
 * Devuelve cada conexión y un resumen ordinal (sin puntuaciones inventadas).
 */
export function matchColorsToPalette(colors, palette) {
  const P = hexesOf(palette);
  const links = (colors || []).map((c) => {
    const hex = normalizeHex(c.hex);
    let best = -1, dE = Infinity;
    if (hex) P.forEach((h, j) => { const d = colorDistance(hex, h); if (d < dE) { dE = d; best = j; } });
    const kind = best < 0 ? 'none' : matchKind(dE);
    return { hex, label: c.label || null, share: Number(c.share) || 0, paletteIndex: best, paletteHex: P[best] || null, dE, kind };
  });
  const hit = links.filter((l) => l.kind !== 'none');
  const totalShare = links.reduce((s, l) => s + l.share, 0);
  return {
    links,
    connected: hit.length,
    exact: hit.filter((l) => l.kind === 'exact').length,
    coveredShare: totalShare ? hit.reduce((s, l) => s + l.share, 0) / totalShare : 0,
    meanDE: hit.length ? hit.reduce((s, l) => s + l.dE, 0) / hit.length : Infinity,
    paletteIndexes: [...new Set(hit.map((l) => l.paletteIndex))].sort((x, y) => x - y),
    // exacta solo si TODO lo que conecta es idéntico; si algo es solo próximo, la relación es aproximada
    overall: !hit.length ? 'none' : hit.every((l) => l.kind === 'exact') ? 'exact' : 'approx'
  };
}

/**
 * Ordena las paletas por relación con unos colores. Criterios, en este orden:
 * más colores conectados → más idénticos → más superficie conectada → menor ΔE medio.
 * Solo devuelve paletas con al menos una conexión (o `minConnected`).
 */
export function rankPalettes(colors, palettes, opts = {}) {
  const min = opts.minConnected || 1;
  return (palettes || [])
    .map((p) => ({ palette: p, match: matchColorsToPalette(colors, p) }))
    .filter((r) => r.match.connected >= min)
    .sort((x, y) => (y.match.connected - x.match.connected) || (y.match.exact - x.match.exact) ||
      (y.match.coveredShare - x.match.coveredShare) || (x.match.meanDE - y.match.meanDE))
    .slice(0, opts.limit || 50);
}

/* ═══════════ SIMILITUD CON UNA PALETA (referencia común) ═══════════
   La misma medida para todo lo que compara colores reales con la Biblioteca: sugerencias de outfits, inspiraciones
   relacionadas, dirección cromática y calcetines. Tus colores nunca coinciden exactamente con los del libro, así que
   se compara por PROXIMIDAD (ΔE00 en CIELAB) con umbrales configurables aquí:
     ≤ 3 prácticamente idéntico · ≤ 6 muy similar · ≤ 12 relacionado (diferencia perceptible) · > 12 sin similitud.
   Son niveles de proximidad, no una nota de estilo ni un porcentaje de acierto. */
export const SIMILARITY = { IDENTICAL: 3, CLOSE: 6, RELATED: 12 };
export const SIMILARITY_LABEL = { identical: 'Prácticamente idéntico', close: 'Muy similar', related: 'Relacionado', none: 'Sin similitud suficiente' };
export function similarityLevel(dE) {
  return dE <= SIMILARITY.IDENTICAL ? 'identical' : dE <= SIMILARITY.CLOSE ? 'close' : dE <= SIMILARITY.RELATED ? 'related' : 'none';
}
/**
 * Cómo de bien representa un conjunto de colores (prendas, una foto) a una paleta.
 * colors: [{ hex, share?, label? }] (share = superficie o presencia; sin él, todos pesan igual).
 * → { paletteLinks: por cada color de la paleta, el color tuyo más próximo; links: por cada color tuyo, el de la paleta más próximo;
 *     covered (colores de la paleta representados), coverage (0–1), offShare (parte de tus colores sin equivalente),
 *     meanDE (ΔE00 medio ponderado de tus colores que sí tienen equivalente), level, valid }
 * valid: la paleta está representada en conjunto, no por un solo color: al menos 2 colores (o todos si tiene menos) y como mucho
 * opts.maxOff (0,15) de tu superficie fuera de la paleta. level resume la proximidad de lo que conecta.
 */
export function paletteAffinity(palette, colors, opts = {}) {
  const P = hexesOf(palette), tol = opts.tolerance || SIMILARITY.RELATED;
  const C = (colors || []).map((c) => ({ hex: normalizeHex(c.hex), share: c.share == null ? 1 : Math.max(0, Number(c.share) || 0), label: c.label || null })).filter((c) => c.hex);
  const total = C.reduce((t, c) => t + c.share, 0) || 1;
  const links = C.map((c) => {
    let best = -1, dE = Infinity;
    P.forEach((h, j) => { const d = colorDistance(c.hex, h); if (d < dE) { dE = d; best = j; } });
    return { hex: c.hex, label: c.label, share: c.share / total, paletteIndex: best, paletteHex: P[best] || null, dE, level: dE <= tol ? similarityLevel(dE) : 'none' };
  });
  const paletteLinks = P.map((h, j) => {
    let best = null;
    links.forEach((l) => { const d = colorDistance(h, l.hex); if (d <= tol && (!best || d < best.dE)) best = { hex: l.hex, label: l.label, dE: d }; });
    return { index: j, hex: h, nearest: best ? best.hex : null, label: best ? best.label : null, dE: best ? best.dE : Infinity, level: best ? similarityLevel(best.dE) : 'none' };
  });
  const hit = links.filter((l) => l.level !== 'none');
  const hitShare = hit.reduce((t, l) => t + l.share, 0);
  const covered = paletteLinks.filter((l) => l.level !== 'none').length;
  const meanDE = hitShare ? hit.reduce((t, l) => t + l.dE * l.share, 0) / hitShare : Infinity;
  const offShare = 1 - hitShare;
  const valid = covered >= Math.min(opts.minCovered || 2, P.length) && offShare <= (opts.maxOff == null ? 0.15 : opts.maxOff);
  return { paletteLinks, links, covered, coverage: P.length ? covered / P.length : 0, offShare, meanDE, level: hit.length ? similarityLevel(meanDE) : 'none', valid };
}
/** Orden de afinidades: más colores de la paleta representados, menos superficie fuera y menor ΔE00 medio. */
export const byAffinity = (x, y) => (y.covered - x.covered) || (x.offShare - y.offShare) || (x.meanDE - y.meanDE);

const fmtDE = (d) => d.toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
/** Frases que explican por qué una paleta se relaciona con los colores. */
export function explainMatch(match, palette) {
  const lines = match.links.filter((l) => l.kind !== 'none').map((l) => {
    const pname = (palette && palette.colors && palette.colors[l.paletteIndex] && palette.colors[l.paletteIndex].name) || ('color ' + (l.paletteIndex + 1));
    const who = l.label ? l.label + ' (' + l.hex + ')' : l.hex;
    return l.kind === 'exact'
      ? who + ' es idéntico al ' + pname + ' de la paleta.'
      : who + ' se parece al ' + pname + ' (' + l.paletteHex + '): ' + MATCH_LABEL[l.kind].toLowerCase() + ', ΔE00 ' + fmtDE(l.dE) + '.';
  });
  const free = match.links.filter((l) => l.kind === 'none').length;
  if (free) lines.push(free === 1 ? 'Un color del conjunto no tiene equivalente en la paleta.' : free + ' colores del conjunto no tienen equivalente en la paleta.');
  return lines;
}

/* ═══════════ PROPORCIONES ═══════════
   Superficie estimada de cada prenda = peso / suma de pesos × 100.
   Los pesos por defecto son una hipótesis inicial (editable), no una regla. */
export const SLOTS = [
  { id: 'outer', label: 'Prenda exterior', categories: ['chaquetas'], weight: 25 },
  { id: 'top', label: 'Parte superior', categories: ['camisetas', 'camisas', 'jerseis'], weight: 30 },
  // lo que se lleva debajo y asoma (camiseta interior, camisa bajo un jersey): poca superficie visible
  { id: 'inner', label: 'Prenda interior', categories: ['camisetas', 'camisas'], weight: 10 },
  { id: 'bottom', label: 'Pantalón', categories: ['pantalones', 'vaqueros'], weight: 35 },
  { id: 'socks', label: 'Calcetines', categories: ['calcetines'], weight: 2 },
  { id: 'shoes', label: 'Calzado', categories: ['calzado'], weight: 10 },
  { id: 'accessory', label: 'Accesorio', categories: ['accesorios'], weight: 3 }
];
export const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));
export const CATEGORIES = [
  ['camisetas', 'Camisetas'], ['camisas', 'Camisas'], ['jerseis', 'Jerséis'], ['chaquetas', 'Chaquetas y abrigos'],
  ['pantalones', 'Pantalones'], ['vaqueros', 'Vaqueros'], ['calzado', 'Calzado'], ['calcetines', 'Calcetines'], ['accesorios', 'Accesorios']
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);
/* ═══════════ TIPOS DE PRENDA (lista fija, compartida) ═══════════
   La misma lista para la prenda de cada color de una inspiración y para cada prenda del armario: así el cruce entre
   las dos es exacto (un color «Deportiva» busca tus deportivas). Cada tipo lleva su categoría de la base (cs_garments.category)
   y su hueco del Studio. En el armario el tipo se guarda al principio de la subcategoría («Deportiva» o «Deportiva · running»):
   sin columnas nuevas, y la guía de calcetines sigue leyendo de ahí el tipo de calzado. */
export const GARMENT_TYPES = [
  ['Prenda exterior', 'chaquetas', 'outer'], ['Abrigo', 'chaquetas', 'outer'], ['Chaqueta', 'chaquetas', 'outer'], ['Americana', 'chaquetas', 'outer'],
  ['Jersey', 'jerseis', 'top'], ['Sudadera', 'jerseis', 'top'], ['Camisa', 'camisas', 'top'], ['Polo', 'camisetas', 'top'], ['Camiseta', 'camisetas', 'top'],
  ['Camiseta interior', 'camisetas', 'inner'],
  ['Pantalón', 'pantalones', 'bottom'], ['Vaquero', 'vaqueros', 'bottom'],
  ['Zapato', 'calzado', 'shoes'], ['Mocasín', 'calzado', 'shoes'], ['Bota', 'calzado', 'shoes'], ['Deportiva', 'calzado', 'shoes'],
  ['Calcetín', 'calcetines', 'socks'], ['Cinturón', 'accesorios', 'accessory'], ['Accesorio', 'accesorios', 'accessory']
].map(([label, category, slot]) => ({ label, category, slot }));
const TYPE_BY_KEY = Object.fromEntries(GARMENT_TYPES.map((t) => [t.label.toLowerCase(), t]));
/** Tipo de la lista a partir de su nombre (sin distinguir mayúsculas). null si no es uno de la lista. */
export const garmentTypeInfo = (label) => TYPE_BY_KEY[String(label || '').trim().toLowerCase()] || null;
const SUB_SEP = ' · ';
/** «Deportiva · running» → { type: 'Deportiva', detail: 'running' }; una subcategoría antigua sin tipo → { type: null, detail } */
export function splitSubcategory(sub) {
  const t = String(sub || '').trim();
  const i = t.indexOf(SUB_SEP), head = i >= 0 ? t.slice(0, i) : t;
  const info = garmentTypeInfo(head);
  return info ? { type: info.label, detail: i >= 0 ? t.slice(i + SUB_SEP.length).trim() || null : null } : { type: null, detail: t || null };
}
export function joinSubcategory(type, detail) {
  const d = String(detail || '').trim();
  return type ? (d ? type + SUB_SEP + d : type) : d || null;
}
const FALLBACK_TYPE = { chaquetas: 'Chaqueta', jerseis: 'Jersey', camisas: 'Camisa', camisetas: 'Camiseta', pantalones: 'Pantalón', vaqueros: 'Vaquero', calzado: 'Zapato', calcetines: 'Calcetín', accesorios: 'Accesorio' };
/** Tipo de una prenda: el guardado en la subcategoría o, en prendas anteriores, el que se deduce de la categoría y el texto. */
export function garmentType(g) {
  if (!g) return null;
  const sp = splitSubcategory(g.subcategory);
  if (sp.type) return sp.type;
  const text = [g.subcategory, g.name].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (g.category === 'calzado') {
    if (/deportiv|zapatill|sneaker|trainer|tenis|bamba|running/.test(text)) return 'Deportiva';
    if (/mocas|loafer/.test(text)) return 'Mocasín';
    if (/bota|botin|boot|chelsea|chukka/.test(text)) return 'Bota';
  }
  if (g.category === 'chaquetas') { if (/abrigo|gabardin|parka|plumifero/.test(text)) return 'Abrigo'; if (/americana|blazer/.test(text)) return 'Americana'; }
  if (g.category === 'jerseis' && /sudadera/.test(text)) return 'Sudadera';
  if (g.category === 'camisetas') { if (/interior/.test(text)) return 'Camiseta interior'; if (/polo/.test(text)) return 'Polo'; }
  if (g.category === 'accesorios' && /cinturon/.test(text)) return 'Cinturón';
  return FALLBACK_TYPE[g.category] || null;
}
export const slotForCategory = (cat) => (SLOTS.find((s) => s.categories.includes(cat)) || {}).id || null;

/** Peso válido (número finito ≥ 0). Lo demás cuenta como 0 y se explica. */
export function sanitizeWeight(v) {
  if (v === '' || v == null) return { value: 0, valid: false, reason: 'sin peso' };
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return { value: 0, valid: false, reason: 'no es un número' };
  if (n < 0) return { value: 0, valid: false, reason: 'negativo' };
  return { value: n, valid: true, reason: null };
}

/** Colores de una prenda con su parte (suman 1). Sin reparto válido, domina el color principal. */
export function garmentColorParts(g) {
  const hexes = [normalizeHex(g.primary_color), ...((g.secondary_colors || []).map(normalizeHex))].filter(Boolean);
  if (!hexes.length) return [];
  const shares = Array.isArray(g.color_shares) ? g.color_shares.slice(0, hexes.length).map((s) => sanitizeWeight(s).value) : null;
  const sum = shares ? shares.reduce((a, b) => a + b, 0) : 0;
  if (!shares || !sum) return [{ hex: hexes[0], share: 1 }];
  return hexes.map((hex, i) => ({ hex, share: (shares[i] || 0) / sum })).filter((p) => p.share > 0);
}

/**
 * Distribución estimada de un outfit.
 * items: [{ slot, label, weight, colors: [{ hex, share }] }]
 * opts.mergeTolerance: ΔE00 por debajo del cual dos colores se agrupan (por defecto 3: casi indistinguibles).
 * Devuelve { valid, total, garments: [{ slot, label, weight, pct }], colors: [{ hex, pct, sources }], warnings }.
 * Los pct son números reales; para enseñarlos redondeados y que sumen 100 usa roundPercentages.
 */
export function estimateDistribution(items, opts = {}) {
  const tol = opts.mergeTolerance == null ? 3 : opts.mergeTolerance;
  const warnings = [];
  const rows = (items || []).map((it) => {
    const w = sanitizeWeight(it.weight);
    if (!w.valid && it.weight !== 0) warnings.push((it.label || it.slot) + ': peso ' + w.reason + ', cuenta como 0.');
    const colors = (it.colors || []).map((c) => ({ hex: normalizeHex(c.hex), share: sanitizeWeight(c.share).value })).filter((c) => c.hex && c.share > 0);
    if (!colors.length) warnings.push((it.label || it.slot) + ': sin color, no suma a la distribución.');
    return { slot: it.slot, label: it.label || it.slot, weight: colors.length ? w.value : 0, colors };
  });
  const total = rows.reduce((s, r) => s + r.weight, 0);
  if (!total) return { valid: false, total: 0, garments: rows.map((r) => ({ slot: r.slot, label: r.label, weight: r.weight, pct: 0 })), colors: [], warnings };
  const garments = rows.map((r) => ({ slot: r.slot, label: r.label, weight: r.weight, pct: r.weight / total * 100 }));
  const groups = [];
  rows.forEach((r) => {
    const sum = r.colors.reduce((s, c) => s + c.share, 0);
    r.colors.forEach((c) => {
      const pct = r.weight / total * (c.share / sum) * 100;
      if (!pct) return;
      let g = groups.find((x) => x.hex === c.hex) || (tol > 0 ? groups.find((x) => colorDistance(x.hex, c.hex) < tol) : null);
      if (!g) { g = { hex: c.hex, pct: 0, sources: [], tops: {} }; groups.push(g); }
      g.pct += pct;
      g.tops[c.hex] = (g.tops[c.hex] || 0) + pct;
      g.sources.push({ slot: r.slot, label: r.label, hex: c.hex, pct });
    });
  });
  groups.forEach((g) => {        // el grupo toma el HEX que más superficie aporta
    const best = Object.keys(g.tops).sort((a, b) => g.tops[b] - g.tops[a])[0];
    if (best !== g.hex) g.hex = best;
    if (Object.keys(g.tops).length > 1) warnings.push('Se agrupan ' + Object.keys(g.tops).join(', ') + ' por ser casi indistinguibles (ΔE00 < ' + tol + ').');
    delete g.tops;
  });
  groups.sort((a, b) => b.pct - a.pct);
  return { valid: true, total, garments, colors: groups, warnings };
}

/** Redondea a enteros que suman exactamente 100 (método del mayor resto). Lista vacía o suma 0 → ceros. */
export function roundPercentages(values) {
  const v = (values || []).map((x) => sanitizeWeight(x).value);
  const sum = v.reduce((a, b) => a + b, 0);
  if (!sum) return v.map(() => 0);
  const raw = v.map((x) => x / sum * 100), floor = raw.map(Math.floor);
  let left = 100 - floor.reduce((a, b) => a + b, 0);
  raw.map((x, i) => ({ i, r: x - floor[i] })).sort((a, b) => b.r - a.r || a.i - b.i).forEach((o) => { if (left > 0) { floor[o.i]++; left--; } });
  return floor;
}

/** Normaliza una lista [{ hex, pct }] a 100. Quita entradas no válidas. Suma 0 → lista vacía. */
export function normalizeDistribution(list) {
  const clean = (Array.isArray(list) ? list : []).map((x) => ({ hex: normalizeHex(x && x.hex), pct: sanitizeWeight(x && x.pct).value })).filter((x) => x.hex);
  const sum = clean.reduce((s, x) => s + x.pct, 0);
  if (!sum) return [];
  return clean.map((x) => ({ hex: x.hex, pct: x.pct / sum * 100 }));
}

/**
 * Ajuste manual: fija el % de un color (0–100) y reparte el resto entre los demás
 * en proporción a lo que ya tenían (a partes iguales si todos estaban a 0). Siempre suma 100.
 */
export function setColorShare(list, hex, pct) {
  const base = normalizeDistribution(list);
  const target = normalizeHex(hex);
  const i = base.findIndex((x) => x.hex === target);
  if (i < 0) return base;
  const p = Math.max(0, Math.min(100, sanitizeWeight(pct).value));
  const others = base.filter((_, j) => j !== i);
  if (!others.length) return [{ hex: target, pct: 100 }];
  const rest = 100 - p, osum = others.reduce((s, x) => s + x.pct, 0);
  return base.map((x, j) => (j === i ? { hex: x.hex, pct: p } : { hex: x.hex, pct: osum ? x.pct / osum * rest : rest / others.length }));
}

/* ═══════════ CUENTAGOTAS (auditoría CS-17) ═══════════
   Color de un punto de la foto elegido a mano: media de los píxeles opacos de un cuadrado de lado 2r+1
   alrededor de (x, y), en coordenadas relativas 0–1. La media se hace en luz lineal (no en sRGB), así un
   tejido con trama clara y oscura da el color que se percibe a distancia. No corrige el balance de blancos:
   por eso se elige a mano la zona bien iluminada de la prenda. */
export function sampleColor(data, width, height, x, y, r = 3) {
  if (!data || !width || !height || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const cx = Math.round(Math.max(0, Math.min(1, x)) * (width - 1)), cy = Math.round(Math.max(0, Math.min(1, y)) * (height - 1));
  let R = 0, G = 0, B = 0, n = 0;
  for (let j = Math.max(0, cy - r); j <= Math.min(height - 1, cy + r); j++) {
    for (let i = Math.max(0, cx - r); i <= Math.min(width - 1, cx + r); i++) {
      const o = (j * width + i) * 4;
      if (data[o + 3] < 128) continue;
      R += toLinear(data[o]); G += toLinear(data[o + 1]); B += toLinear(data[o + 2]); n++;
    }
  }
  if (!n) return null;
  return rgbToHex(toGamma(R / n), toGamma(G / n), toGamma(B / n));
}

/**
 * Cuentagotas de Inspiración: color representativo de una zona por MEDIANA de cada canal RGB de los píxeles opacos
 * de un cuadrado de lado 2r+1 alrededor del píxel (px, py) en coordenadas de la imagen (enteras, no relativas).
 * La mediana ignora uno o dos píxeles extremos (un reflejo, una costura, un artefacto JPEG); r = 0 es el píxel exacto.
 * → { hex, n, mixed } · n = píxeles válidos · mixed = proporción de píxeles a ΔE00 > 10 de la mediana (zona mezclada).
 * null si el punto cae fuera de la imagen o todos los píxeles son transparentes.
 */
export function sampleMedian(data, width, height, px, py, r = 2) {
  if (!data || !width || !height || !Number.isFinite(px) || !Number.isFinite(py)) return null;
  const cx = Math.floor(px), cy = Math.floor(py);
  if (cx < 0 || cy < 0 || cx >= width || cy >= height) return null;
  const R = [], G = [], B = [];
  for (let j = Math.max(0, cy - r); j <= Math.min(height - 1, cy + r); j++) {
    for (let i = Math.max(0, cx - r); i <= Math.min(width - 1, cx + r); i++) {
      const o = (j * width + i) * 4;
      if (data[o + 3] < 128) continue;
      R.push(data[o]); G.push(data[o + 1]); B.push(data[o + 2]);
    }
  }
  if (!R.length) return null;
  const med = (a) => { a.sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };
  const lab0 = { r: med(R.slice()), g: med(G.slice()), b: med(B.slice()) };
  const hex = rgbToHex(lab0.r, lab0.g, lab0.b), ref = rgbToLab(lab0);
  let far = 0;
  for (let k = 0; k < R.length; k++) if (deltaE2000(ref, rgbToLab({ r: R[k], g: G[k], b: B[k] })) > 10) far++;
  return { hex, n: R.length, mixed: far / R.length };
}

/* ═══════════ CORRECCIÓN DE LA LUZ (balance de blancos) ═══════════
   Una foto con luz cálida o fría desplaza todos los colores (una camisa blanca sale crema). Se corrige con un punto que la
   persona sabe que es neutro (blanco, gris, una hoja de papel): las ganancias de cada canal en luz LINEAL que lo vuelven gris
   con la misma luminancia (adaptación de von Kries en RGB lineal). Se aplica a las copias de análisis y al color tomado; la
   foto que se guarda no cambia. Un punto con color (croma > 22: un azul marino ya lo supera) no es un neutro fiable y se rechaza. */
export function neutralGains(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const lab = rgbToLab(rgb);
  if (Math.hypot(lab.a, lab.b) > 22 || lab.L < 15) return null;              // ni con color (un blanco con luz cálida queda en 13–19) ni casi negro
  const lin = [toLinear(rgb.r), toLinear(rgb.g), toLinear(rgb.b)];
  const Y = 0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.0721750 * lin[2];
  if (lin.some((v) => v <= 0.0005)) return null;
  return lin.map((v) => Y / v);
}
/** Color corregido con unas ganancias (null = sin corrección). */
export function applyGainsHex(hex, gains) {
  const rgb = hexToRgb(hex);
  if (!rgb || !gains) return normalizeHex(hex);
  const c = [rgb.r, rgb.g, rgb.b].map((v, i) => toGamma(Math.min(1, toLinear(v) * gains[i])));
  return rgbToHex(c[0], c[1], c[2]);
}
/** Copia corregida de unos píxeles { data, width, height }. */
export function applyGains(px, gains) {
  if (!px || !gains) return px;
  const lut = gains.map((g) => { const t = new Uint8ClampedArray(256); for (let v = 0; v < 256; v++) t[v] = Math.round(toGamma(Math.min(1, toLinear(v) * g))); return t; });
  const out = new Uint8ClampedArray(px.data.length);
  for (let i = 0; i < out.length; i += 4) { out[i] = lut[0][px.data[i]]; out[i + 1] = lut[1][px.data[i + 1]]; out[i + 2] = lut[2][px.data[i + 2]]; out[i + 3] = px.data[i + 3]; }
  return { data: out, width: px.width, height: px.height };
}

/* ═══════════ EXTRACCIÓN DE COLOR (sin red) ═══════════
   Un solo sistema para todas las fotos (prendas del Armario, outfits de Inspiración, «Extraer de una imagen»):
     1. Primer plano: superpíxeles (SLIC simplificado; Achanta et al., 2012) y conectividad con el borde GEODÉSICA
        (Zhu, Liang, Wei y Sun, CVPR 2014). El fondo es lo que se une al borde por caminos de color parecido: así se
        reconoce un fondo con textura, reflejos o degradado (cristal, ladrillo, cielo, rayas), que antes se colaba
        porque solo se buscaban colores del borde casi uniformes. Como el encuadre de una foto de ropa corta el cuerpo
        por abajo y por los lados, esos bordes cuentan menos que el de arriba, y la franja central se protege.
     2. Colores: k-means en Lab sobre los píxeles pesados por primer plano, con inicio determinista por histograma (los
        colores más frecuentes, no los extremos: un brillo o una costura no gastan un grupo).
     3. Fusión de lo que es la misma prenda: tonos casi iguales (ΔE00 < 10), sombras (mismo tono, más oscuro y algo
        menos intenso, o un color poco intenso que la sombra vuelve gris) y neutros de luz parecida. Queda el color
        de la zona iluminada. El representante de cada grupo es la mediana ponderada, no la media (no se embarra).
     4. Piel (opcional, fotos con personas): un grupo con color de piel (YCbCr de Chai y Ngan, 1999, y LCh) pesa ×0,3.
        Se rebaja, no se quita: un abrigo camel grande sigue saliendo.
   Si casi nada parece primer plano (una tela que llena la foto), se analiza la imagen entera.
   Es una PROPUESTA: no segmenta prendas una a una ni corrige el balance de blancos; la web siempre deja corregirla. */
const SLIC_M = 10, GEO_SIGMA = 10, GEO_CLIP = 5, BND_SIGMA = 0.6, EDGE_BOTTOM = 0.2, EDGE_SIDE = 0.6, CENTER_POW = 2;
function imageLab(data, n) {
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), ok = new Uint8Array(n), lut = new Map();
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (data[o + 3] < 128) continue;                          // transparente
    const key = (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
    let lab = lut.get(key);
    if (!lab) { lab = rgbToLab({ r: data[o], g: data[o + 1], b: data[o + 2] }); lut.set(key, lab); }
    L[i] = lab.L; A[i] = lab.a; B[i] = lab.b; ok[i] = 1;
  }
  return { L, A, B, ok };
}
/** Montículo binario mínimo de pares [distancia, nodo] (Dijkstra). */
function heapPush(h, item) { h.push(item); let i = h.length - 1; while (i) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function heapPop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last; let i = 0;
    for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; }
  }
  return top;
}
/**
 * Probabilidad de primer plano de cada píxel (0–1), Float32Array de width × height. Ver el bloque de arriba.
 * opts.superpixels (300): número aproximado de superpíxeles.
 */
export function foregroundMap(data, width, height, opts = {}, lab) {
  const W = width, H = height, n = W * H;
  const { L, A, B, ok } = lab || imageLab(data, n);
  const fg = new Float32Array(n);
  const S = Math.max(3, Math.round(Math.sqrt(n / (opts.superpixels || 300))));
  const seeds = [];
  for (let y = Math.floor(S / 2); y < H; y += S) for (let x = Math.floor(S / 2); x < W; x += S) {
    const i = y * W + x; if (ok[i]) seeds.push({ x, y, L: L[i], a: A[i], b: B[i] });
  }
  if (!seeds.length) return fg;
  const sp = new Int32Array(n).fill(-1), dmin = new Float32Array(n), M2 = SLIC_M * SLIC_M / (S * S);
  for (let it = 0; it < 5; it++) {
    dmin.fill(Infinity);
    for (let k = 0; k < seeds.length; k++) {
      const c = seeds[k];
      const x0 = Math.max(0, Math.floor(c.x - S)), x1 = Math.min(W - 1, Math.ceil(c.x + S)), y0 = Math.max(0, Math.floor(c.y - S)), y1 = Math.min(H - 1, Math.ceil(c.y + S));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x; if (!ok[i]) continue;
        const d = (c.L - L[i]) ** 2 + (c.a - A[i]) ** 2 + (c.b - B[i]) ** 2 + ((c.x - x) ** 2 + (c.y - y) ** 2) * M2;
        if (d < dmin[i]) { dmin[i] = d; sp[i] = k; }
      }
    }
    const acc = new Float64Array(seeds.length * 6);
    for (let i = 0; i < n; i++) { const k = sp[i]; if (k < 0) continue; const x = i % W, o = k * 6; acc[o]++; acc[o + 1] += x; acc[o + 2] += (i - x) / W; acc[o + 3] += L[i]; acc[o + 4] += A[i]; acc[o + 5] += B[i]; }
    seeds.forEach((c, k) => { const o = k * 6, m = acc[o]; if (m) { c.x = acc[o + 1] / m; c.y = acc[o + 2] / m; c.L = acc[o + 3] / m; c.a = acc[o + 4] / m; c.b = acc[o + 5] / m; } });
  }
  // superpíxeles: área, borde ponderado (abajo y lados cuentan menos), franja central y vecinos
  const K = seeds.length, area = new Float64Array(K), border = new Float64Array(K), center = new Float64Array(K), nb = seeds.map(() => new Set());
  for (let i = 0; i < n; i++) {
    const k = sp[i]; if (k < 0) continue;
    const x = i % W, y = (i - x) / W;
    area[k]++;
    if (y === 0) border[k] += 1; else if (y === H - 1) border[k] += EDGE_BOTTOM; else if (x === 0 || x === W - 1) border[k] += EDGE_SIDE;
    if (x >= W * 0.4 && x < W * 0.6 && y >= H * 0.25 && y < H * 0.85) center[k]++;
    if (x < W - 1) { const q = sp[i + 1]; if (q >= 0 && q !== k) { nb[k].add(q); nb[q].add(k); } }
    if (y < H - 1) { const q = sp[i + W]; if (q >= 0 && q !== k) { nb[k].add(q); nb[q].add(k); } }
  }
  // colores de telón: los que ocupan el borde de ARRIBA y otro lado (≥ 15 % de cada uno). Cubre lo que la conectividad no
  // ve: un fondo de rayas muy contrastadas (cada raya es estrecha y por sí sola apenas toca el borde). Exigir el borde de
  // arriba evita confundir una chaqueta que en un plano corto toca los dos lados y el de abajo.
  const sideCount = [new Map(), new Map(), new Map(), new Map()], sideTot = [0, 0, 0, 0];   // arriba, abajo, izquierda, derecha
  for (let x = 0; x < W; x++) { [[0, x], [1, (H - 1) * W + x]].forEach(([s, i]) => { const k = sp[i]; if (k >= 0) { sideTot[s]++; sideCount[s].set(k, (sideCount[s].get(k) || 0) + 1); } }); }
  for (let y = 1; y < H - 1; y++) { [[2, y * W], [3, y * W + W - 1]].forEach(([s, i]) => { const k = sp[i]; if (k >= 0) { sideTot[s]++; sideCount[s].set(k, (sideCount[s].get(k) || 0) + 1); } }); }
  const classes = [];
  sideCount.forEach((m, s) => m.forEach((cnt, k) => {
    const c = seeds[k];
    let g = classes.find((x) => deltaE2000(x, c) < 6);
    if (!g) { g = { L: c.L, a: c.a, b: c.b, side: [0, 0, 0, 0] }; classes.push(g); }
    g.side[s] += cnt;
  }));
  const backdrop = classes.filter((g) => sideTot[0] && g.side[0] / sideTot[0] >= 0.15 && [1, 2, 3].some((s) => sideTot[s] && g.side[s] / sideTot[s] >= 0.15));
  const pfg = new Float32Array(K), raw = new Float32Array(K), cut = 3 * GEO_SIGMA, dist = new Float64Array(K), seen = new Int32Array(K).fill(-1), done = new Int32Array(K).fill(-1);
  for (let s = 0; s < K; s++) {
    if (!area[s]) continue;
    let a = 0, len = 0;
    const heap = [[0, s]]; dist[s] = 0; seen[s] = s;
    while (heap.length) {
      const [d, u] = heapPop(heap);
      if (done[u] === s) continue; done[u] = s;
      const w = Math.exp(-(d * d) / (2 * GEO_SIGMA * GEO_SIGMA));
      a += area[u] * w; len += border[u] * w;
      nb[u].forEach((v) => {
        if (done[v] === s || !area[v]) return;
        const cu = seeds[u], cv = seeds[v];
        // recorte de pesos pequeños (Wei et al., 2012): atravesar una textura o un degradado no acumula distancia
        const nd = d + Math.max(0, Math.sqrt((cu.L - cv.L) ** 2 + (cu.a - cv.a) ** 2 + (cu.b - cv.b) ** 2) - GEO_CLIP);
        if (nd <= cut && (seen[v] !== s || nd < dist[v])) { seen[v] = s; dist[v] = nd; heapPush(heap, [nd, v]); }
      });
    }
    const bnd = len / Math.sqrt(a);
    let pb = 1 - Math.exp(-(bnd * bnd) / (2 * BND_SIGMA * BND_SIGMA));
    if (backdrop.some((g) => deltaE2000(g, seeds[s]) < 4)) pb = Math.max(pb, 0.9);
    raw[s] = 1 - pb;
    if (center[s] / area[s] > 0.5) pb = pb ** CENTER_POW;          // franja central: casi siempre la persona (un fondo claro sigue siendo fondo)
    pfg[s] = 1 - pb;
  }
  // modelo de color del fondo (como el paso de color de GrabCut, simplificado): un píxel de primer plano cuyo color se
  // explica mucho mejor por el fondo que por la figura (cielo entre las piernas, pared junto a la cabeza) deja de contar
  // solo superpíxeles homogéneos: uno que mezcla la figura y el fondo (en el contorno) no describe ninguno de los dos
  const spread = new Float64Array(K);
  for (let i = 0; i < n; i++) { const k = sp[i]; if (k >= 0) { const c = seeds[k]; spread[k] += (c.L - L[i]) ** 2 + (c.a - A[i]) ** 2 + (c.b - B[i]) ** 2; } }
  const bgCols = [], fgCols = [];
  seeds.forEach((c, k) => { if (!area[k] || spread[k] / area[k] > 200) return; if (raw[k] < 0.15) bgCols.push(c); else if (raw[k] > 0.5) fgCols.push(c); });   // sin la protección central: el modelo usa la señal pura
  // huecos: zonas pequeñas (< 3 % de la foto) con el color del fondo encerradas por la figura (entre las piernas, bajo el
  // brazo). La conectividad no las ve porque no llegan al borde. Una prenda grande del mismo color (camiseta blanca ante
  // una pared blanca) supera ese tamaño y se conserva.
  if (bgCols.length) {
    const like = (k) => { const c = seeds[k]; return bgCols.some((b) => (b.L - c.L) ** 2 + (b.a - c.a) ** 2 + (b.b - c.b) ** 2 < 100); };
    const cand = new Uint8Array(K), comp = new Int32Array(K).fill(-1);
    for (let k = 0; k < K; k++) if (area[k] && raw[k] >= 0.15 && like(k)) cand[k] = 1;
    for (let k = 0; k < K; k++) {
      if (!cand[k] || comp[k] >= 0) continue;
      const members = [k]; comp[k] = k; let sum = 0;
      const around = new Set();
      for (let m = 0; m < members.length; m++) { const u = members[m]; sum += area[u]; nb[u].forEach((v) => { if (cand[v]) { if (comp[v] < 0) { comp[v] = k; members.push(v); } } else around.add(v); }); }
      // encerrado: casi todo lo que lo rodea es figura (un pantalón claro ante una pared clara tiene pared alrededor)
      let fig = 0; around.forEach((v) => { if (raw[v] > 0.5) fig++; });
      if (sum < n * 0.03 && around.size && fig / around.size >= 0.6) members.forEach((u) => { pfg[u] = Math.min(pfg[u], 0.15); raw[u] = Math.min(raw[u], 0.15); });
    }
  }
  for (let j = fgCols.length - 1; j >= 0; j--) if (raw[seeds.indexOf(fgCols[j])] <= 0.15) fgCols.splice(j, 1);   // los huecos ya no son figura
  // a nivel de píxel: un píxel que no se parece a su superpíxel (el hueco estrecho entre las piernas, un borde) toma el
  // valor del superpíxel vecino cuyo color se le parece más
  for (let i = 0; i < n; i++) {
    const k = sp[i]; if (k < 0) continue;
    const c = seeds[k], d0 = (c.L - L[i]) ** 2 + (c.a - A[i]) ** 2 + (c.b - B[i]) ** 2;
    let best = k, bd = d0;
    if (d0 > 100) nb[k].forEach((q) => { const e = seeds[q], d = (e.L - L[i]) ** 2 + (e.a - A[i]) ** 2 + (e.b - B[i]) ** 2; if (d < bd) { bd = d; best = q; } });
    fg[i] = pfg[best];
  }
  if (bgCols.length && fgCols.length) {
    const near = (list, l, a, b) => { let m = Infinity; for (const c of list) { const d = (c.L - l) ** 2 + (c.a - a) ** 2 + (c.b - b) ** 2; if (d < m) m = d; } return m; };
    const memo = new Map();
    for (let i = 0; i < n; i++) {
      // solo el contorno (superpíxeles mezclados o de figura dudosa): una prenda entera del color del fondo se conserva
      if (fg[i] < 0.3 || (spread[sp[i]] / area[sp[i]] <= 200 && raw[sp[i]] > 0.6)) continue;
      const key = Math.round(L[i]) * 65536 + Math.round(A[i] + 128) * 256 + Math.round(B[i] + 128);
      let explained = memo.get(key);
      if (explained === undefined) { const dB = near(bgCols, L[i], A[i], B[i]), dF = near(fgCols, L[i], A[i], B[i]); explained = dB < 225 && dB * 4 < dF; memo.set(key, explained); }
      if (explained) fg[i] = Math.min(fg[i], 0.2);
    }
  }
  return fg;
}
/** ¿Parece piel? YCbCr (Chai y Ngan, 1999) y tono anaranjado de croma moderado en LCh. */
export function isSkinTone(lab) {
  const c = labToRgb(lab), cb = 128 - 0.168736 * c.r - 0.331264 * c.g + 0.5 * c.b, cr = 128 + 0.5 * c.r - 0.418688 * c.g - 0.081312 * c.b;
  const p = labToLch(lab);
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && p.h >= 20 && p.h <= 80 && p.C >= 10 && p.C <= 45 && p.L >= 25 && p.L <= 88;
}
/** ¿b y a son la misma prenda con otra luz o casi el mismo color? (fusión de la extracción) */
export function sameGarmentColor(a, b) {
  if (deltaE2000(a, b) < 10) return true;
  const P = labToLch(a), Q = labToLch(b), dL = Math.abs(P.L - Q.L);
  const dh = Math.abs(P.h - Q.h) % 360, gap = dh > 180 ? 360 - dh : dh;
  const lo = P.L < Q.L ? P : Q, hi = P.L < Q.L ? Q : P;
  if (P.C >= 8 && Q.C >= 8 && gap <= 25 && dL <= 35) { const r = lo.C / hi.C; if (r >= 0.35 && r <= 1.35) return true; }   // sombra
  if (lo.C < 6 && hi.C < 16 && dL <= 20) return true;          // sombra que desatura un color poco intenso (cuero en sombra)
  if (P.C < 8 && Q.C < 8 && dL <= 12) return true;             // neutros de luz parecida
  return false;
}
/**
 * Colores de una foto. → [{ hex, share, skin }] ordenados por presencia (share suma 1 entre los devueltos).
 * opts: k (grupos iniciales, 14) · max (6) · minShare (0,04) · foreground (true: quitar el fondo) · skin (false: rebajar la piel)
 *       mask (Uint8Array opcional, 0 = ignorar el píxel: si la hay, no se calcula fondo).
 */
export function extractColors(data, width, height, opts = {}) {
  const W = width, H = height, n = W * H;
  if (!data || !W || !H) return [];
  const lab = imageLab(data, n), { L, A, B, ok } = lab;
  if (opts.mask) for (let i = 0; i < n; i++) if (!opts.mask[i]) ok[i] = 0;
  let valid = 0; for (let i = 0; i < n; i++) valid += ok[i];
  if (!valid) return [];
  // peso de cada píxel: primer plano (con un umbral: lo que parece fondo no suma) × un ligero favor al centro
  const w = new Float32Array(n);
  const fg = opts.mask || opts.foreground === false ? null : foregroundMap(data, W, H, opts, lab);
  let wsum = 0;
  for (let i = 0; i < n; i++) {
    if (!ok[i]) continue;
    const x = i % W, y = (i - x) / W, dx = x / (W - 1 || 1) - 0.5, dy = y / (H - 1 || 1) - 0.5;
    const prior = 1.2 - Math.min(0.6, Math.hypot(dx * 1.2, dy) * 0.9);
    w[i] = (fg ? Math.max(0, (fg[i] - 0.3) / 0.7) ** 1.5 : 1) * prior;
    wsum += w[i];
  }
  if (fg && wsum < valid * 0.08) {                              // casi nada destaca del fondo: la tela llena la foto
    wsum = 0;
    for (let i = 0; i < n; i++) if (ok[i]) { const x = i % W, y = (i - x) / W; w[i] = 1.2 - Math.min(0.6, Math.hypot((x / (W - 1 || 1) - 0.5) * 1.2, y / (H - 1 || 1) - 0.5) * 0.9); wsum += w[i]; }
  }
  // k-means con inicio por histograma: los colores más frecuentes (pesados) y separados entre sí
  const bins = new Map();
  for (let i = 0; i < n; i++) {
    if (!w[i]) continue;
    const key = Math.floor(L[i] / 8) * 10000 + Math.floor((A[i] + 128) / 10) * 100 + Math.floor((B[i] + 128) / 10);
    const e = bins.get(key);
    if (e) { e.w += w[i]; e.L += L[i] * w[i]; e.a += A[i] * w[i]; e.b += B[i] * w[i]; } else bins.set(key, { w: w[i], L: L[i] * w[i], a: A[i] * w[i], b: B[i] * w[i] });
  }
  const centers = [];
  [...bins.values()].sort((x, y) => y.w - x.w).forEach((e) => {
    if (centers.length >= (opts.k || 14)) return;
    const c = { L: e.L / e.w, a: e.a / e.w, b: e.b / e.w };
    if (centers.every((d) => (d.L - c.L) ** 2 + (d.a - c.a) ** 2 + (d.b - c.b) ** 2 > 100)) centers.push(c);
  });
  if (!centers.length) return [];
  const label = new Int16Array(n).fill(-1), K = centers.length, acc = new Float64Array(K * 4);
  for (let it = 0; it < 10; it++) {
    acc.fill(0);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      if (!w[i]) continue;
      let best = 0, bd = Infinity;
      for (let j = 0; j < K; j++) { const c = centers[j]; const d = (c.L - L[i]) ** 2 + (c.a - A[i]) ** 2 + (c.b - B[i]) ** 2; if (d < bd) { bd = d; best = j; } }
      if (label[i] !== best) { moved++; label[i] = best; }
      const o = best * 4; acc[o] += w[i]; acc[o + 1] += L[i] * w[i]; acc[o + 2] += A[i] * w[i]; acc[o + 3] += B[i] * w[i];
    }
    centers.forEach((c, j) => { const o = j * 4; if (acc[o]) { c.L = acc[o + 1] / acc[o]; c.a = acc[o + 2] / acc[o]; c.b = acc[o + 3] / acc[o]; } });
    if (moved < n * 0.002) break;
  }
  // representante = mediana ponderada de cada canal (no la media: una sombra no embarra el color)
  const groups = centers.map(() => ({ w: 0, idx: [] }));
  for (let i = 0; i < n; i++) if (w[i] && label[i] >= 0) { const g = groups[label[i]]; g.w += w[i]; g.idx.push(i); }
  const wmed = (idx, ch) => {
    const s = idx.slice().sort((p, q) => ch[p] - ch[q]), half = s.reduce((t, i) => t + w[i], 0) / 2;
    let a = 0; for (const i of s) { a += w[i]; if (a >= half) return ch[i]; } return ch[s[s.length - 1]];
  };
  let list = groups.filter((g) => g.w > 0).map((g) => ({ lab: { L: wmed(g.idx, L), a: wmed(g.idx, A), b: wmed(g.idx, B) }, w: g.w }));
  list.forEach((c) => { c.skin = isSkinTone(c.lab); if (c.skin && opts.skin) c.w *= 0.3; });
  // fusión: la pareja más parecida primero, hasta que no quede ninguna que sea la misma prenda
  for (;;) {
    let best = null;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (!sameGarmentColor(list[i].lab, list[j].lab)) continue;
      const d = deltaE2000(list[i].lab, list[j].lab);
      if (!best || d < best.d) best = { i, j, d };
    }
    if (!best) break;
    const p = list[best.i], q = list[best.j];
    const lit = p.lab.L >= q.lab.L ? p : q, dark = lit === p ? q : p;
    const rep = lit.w >= dark.w / 3 ? lit : dark;                // la zona iluminada, salvo que sea un brillo residual
    p.lab = rep.lab; p.skin = rep.skin; p.w += q.w;
    list.splice(best.j, 1);
  }
  const total = list.reduce((s, c) => s + c.w, 0) || 1;
  const out = list.map((c) => ({ hex: labToHex(c.lab), share: c.w / total, skin: c.skin })).sort((a, b) => b.share - a.share)
    .filter((c) => c.share >= (opts.minShare == null ? 0.04 : opts.minShare)).slice(0, opts.max || 6);
  const kept = out.reduce((s, c) => s + c.share, 0) || 1;
  return out.map((c) => ({ hex: c.hex, share: c.share / kept, skin: c.skin }));
}
/**
 * Colores de la foto de una PRENDA (Armario, «Extraer de una imagen»). Mismo sistema que Inspiración, sin rebajar la piel.
 * Se mantiene la firma de siempre: → [{ hex, share }]. opts.k = número máximo de colores.
 */
export function extractDominantColors(data, width, height, opts = {}) {
  return extractColors(data, width, height, { max: opts.k || 5, minShare: opts.minShare, superpixels: opts.superpixels })
    .map((c) => ({ hex: c.hex, share: c.share }));
}
