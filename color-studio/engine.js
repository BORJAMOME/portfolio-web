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
export function colorDistance(a, b) {
  const x = normalizeHex(a), y = normalizeHex(b);
  if (!x || !y) return Infinity;
  return x === y ? 0 : deltaE2000(labOf(x), labOf(y));
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

/* ═══════════ EXTRACCIÓN DE COLOR (sin red) ═══════════
   K-means en Lab sobre los píxeles de una imagen ya reducida. Se pondera el centro (la prenda suele
   estar ahí) y se rebaja lo que se parece al borde (probablemente el fondo). Es una PROPUESTA:
   la luz y el balance de blancos cambian el color, por eso la web siempre deja corregirlo.
   · Fondo: los píxeles del borde se agrupan (hasta 3 colores) y se rebaja cada grupo con peso; con la media
     del borde, un fondo de rayas no se parecía a ninguno de sus colores (auditoría CS-04).
   · Sombras: dos grupos del mismo tono e intensidad proporcional que solo difieren en luz (≤ 30 de L) se
     funden y se queda el más claro, que es la zona iluminada (CS-03). Dos colores distintos de la misma
     familia (marino y azul claro, camel y marrón) difieren más y no se funden. Los neutros no se funden. */
export function extractDominantColors(data, width, height, opts = {}) {
  const k = opts.k || 5, step = Math.max(1, opts.step || 1);
  const px = [], border = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) * 4;
      if (data[o + 3] < 128) continue;                         // transparente
      const lab = rgbToLab({ r: data[o], g: data[o + 1], b: data[o + 2] });
      const dx = (x / (width - 1 || 1)) - 0.5, dy = (y / (height - 1 || 1)) - 0.5;
      const edge = x < width * 0.06 || x >= width * 0.94 || y < height * 0.06 || y >= height * 0.94;
      if (edge) border.push(lab);
      px.push({ lab, w: opts.centerWeight === false ? 1 : 1.5 - Math.min(1, Math.hypot(dx, dy) * 1.6) });
    }
  }
  if (!px.length) return [];
  if (border.length && opts.ignoreBackground !== false) {
    const bgs = borderColors(border);
    px.forEach((p) => { if (bgs.some((bg) => deltaE2000(p.lab, bg) < 8)) p.w *= 0.15; });
  }
  // centros iniciales deterministas: el más pesado y, después, el más lejano a los elegidos
  const centers = [px.reduce((a, b) => (b.w > a.w ? b : a)).lab];
  while (centers.length < Math.min(k, px.length)) {
    let far = null, fd = -1;
    px.forEach((p) => { const d = Math.min(...centers.map((c) => deltaE2000(c, p.lab))) * p.w; if (d > fd) { fd = d; far = p; } });
    if (!far || fd <= 0) break;
    centers.push(far.lab);
  }
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < 8; it++) {
    assign = px.map((p) => { let best = 0, bd = Infinity; centers.forEach((c, j) => { const d = (c.L - p.lab.L) ** 2 + (c.a - p.lab.a) ** 2 + (c.b - p.lab.b) ** 2; if (d < bd) { bd = d; best = j; } }); return best; });
    centers.forEach((c, j) => {
      let L = 0, a = 0, b = 0, w = 0;
      px.forEach((p, i) => { if (assign[i] === j) { L += p.lab.L * p.w; a += p.lab.a * p.w; b += p.lab.b * p.w; w += p.w; } });
      if (w) centers[j] = { L: L / w, a: a / w, b: b / w };
    });
  }
  const weights = centers.map(() => 0);
  px.forEach((p, i) => { weights[assign[i]] += p.w; });
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  const found = [];
  centers.map((c, j) => ({ lab: c, share: weights[j] / total })).sort((a, b) => b.share - a.share).forEach((c) => {
    const twin = found.find((f) => deltaE2000(f.lab, c.lab) < 6);
    if (twin) twin.share += c.share; else found.push(c);
  });
  if (opts.mergeShadows !== false) {
    for (let i = 0; i < found.length; i++) {
      for (let j = i + 1; j < found.length; j++) {
        if (!isShadowPair(found[i].lab, found[j].lab)) continue;
        if (found[j].lab.L > found[i].lab.L) found[i].lab = found[j].lab;   // se queda la zona iluminada
        found[i].share += found[j].share;
        found.splice(j, 1); j--;
      }
    }
    found.sort((a, b) => b.share - a.share);
  }
  return found.filter((c) => c.share >= (opts.minShare || 0.04)).map((c) => ({ hex: labToHex(c.lab), share: c.share }));
}
/** ¿b es a con más o menos luz? Mismo tono (≤ 15°), croma proporcional y diferencia de luminosidad moderada. */
function isShadowPair(a, b) {
  const A = labToLch(a), B = labToLch(b);
  if (A.C < 10 || B.C < 10) return false;
  const dh = Math.abs(A.h - B.h) % 360, gap = dh > 180 ? 360 - dh : dh;
  const dL = Math.abs(A.L - B.L);
  const lo = A.L < B.L ? A : B, hi = A.L < B.L ? B : A;
  const ratio = lo.C / hi.C;
  return gap <= 15 && dL >= 6 && dL <= 30 && ratio >= 0.5 && ratio <= 1.2;
}
/** Colores del fondo: k-means pequeño (k ≤ 3, inicio determinista) sobre los píxeles del borde; grupos con ≥ 15 %. */
function borderColors(list) {
  const centers = [list[0]];
  while (centers.length < Math.min(3, list.length)) {
    let far = null, fd = -1;
    list.forEach((p) => { const d = Math.min(...centers.map((c) => deltaE2000(c, p))); if (d > fd) { fd = d; far = p; } });
    if (!far || fd < 8) break;
    centers.push(far);
  }
  let assign = [];
  for (let it = 0; it < 6; it++) {
    assign = list.map((p) => { let best = 0, bd = Infinity; centers.forEach((c, j) => { const d = (c.L - p.L) ** 2 + (c.a - p.a) ** 2 + (c.b - p.b) ** 2; if (d < bd) { bd = d; best = j; } }); return best; });
    centers.forEach((c, j) => {
      let L = 0, a = 0, b = 0, n = 0;
      list.forEach((p, i) => { if (assign[i] === j) { L += p.L; a += p.a; b += p.b; n++; } });
      if (n) centers[j] = { L: L / n, a: a / n, b: b / n };
    });
  }
  const counts = centers.map((_, j) => assign.filter((x) => x === j).length);
  return centers.filter((_, j) => counts[j] / list.length >= 0.15);
}
