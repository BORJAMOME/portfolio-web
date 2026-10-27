/* ═══════════════════════════════════════════════
   color-studio/inspiration.js: Inspiración (outfits guardados de internet)
   ─────────────────────────────────────────────────
   Módulo ES puro (sin red ni DOM), probado con tools/test-color.mjs. La interfaz está en area-privada-color.js
   y los datos en cs_inspirations (supabase/color-studio-inspiracion.sql).
   · Paleta de una foto: reutiliza engine.extractDominantColors (k-means local, fondo rebajado, sombras fundidas).
     El peso es la presencia ESTIMADA de cada color en los píxeles analizados (incluye piel, fondo o accesorios),
     no la superficie de cada prenda.
   · Lo derivable no se guarda: RGB, Lab, nombre y familia salen del HEX.
   · Duplicados: mismo enlace normalizado o imagen casi igual (dHash de 64 bits a distancia ≤ 6). Solo avisan.
   ═══════════════════════════════════════════════ */
import { normalizeHex, hexToRgb, hexToLab, labToLch, describeColor, extractDominantColors, roundPercentages, rankPalettes } from './engine.js?v=ad34183687';

export const SEASONS = [['primavera', 'Primavera'], ['verano', 'Verano'], ['otono', 'Otoño'], ['invierno', 'Invierno'], ['entretiempo', 'Entretiempo']];
export const SEASON_LABEL = Object.fromEntries(SEASONS);
export const STATUS_LABEL = { none: 'Sin paleta', auto: 'Paleta por revisar', reviewed: 'Paleta revisada', failed: 'No se pudo extraer la paleta' };
export const SORTS = [['saved', 'Guardadas recientes'], ['saved-asc', 'Guardadas antiguas'], ['published', 'Fecha de publicación'], ['favorites', 'Favoritas primero'], ['rating', 'Mejor valoradas']];
export const PALETTE_LIMIT = 10;
export const DEFAULT_STYLES = ['Casual', 'Smart casual', 'Formal', 'Minimalista', 'Streetwear', 'Workwear', 'Deportivo'];
export const SECONDARY_MIN = 15;     // % a partir del cual un color, sin ser el mayor, se lee como secundario
export const HASH_NEAR = 6;          // bits distintos (de 64) para considerar dos imágenes casi iguales

const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : null);
const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const round1 = (x) => Math.round(x * 10) / 10;

/* ═══════════ PALETA ═══════════ */
/**
 * Paleta de una foto de outfit: entre 1 y 8 colores según lo que justifique la imagen (los grupos < 3 % se descartan).
 * sample: { data, width, height } (copia pequeña de image.prepareImage). → [{ hex, weight, source: 'auto' }] con pesos que suman 100.
 */
export function extractOutfitPalette(sample, opts = {}) {
  if (!sample || !sample.data || !sample.width || !sample.height) return [];
  const found = extractDominantColors(sample.data, sample.width, sample.height, { k: opts.k || 8, minShare: opts.minShare || 0.03 });
  const colors = found.slice(0, 8);
  const pct = roundPercentages(colors.map((c) => c.share));
  return colors.map((c, i) => ({ hex: c.hex, weight: pct[i], source: 'auto' }));
}

/** Limpia una paleta: HEX válidos, sin repetidos (se suman), pesos ≥ 0 y normalizados a 100 con un decimal. */
export function normalizePalette(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((c) => {
    const hex = normalizeHex(c && (c.hex || c));
    if (!hex) return;
    const w = Number(c && c.weight);
    const weight = Number.isFinite(w) && w > 0 ? w : 0;
    const prev = out.find((x) => x.hex === hex);
    if (prev) { prev.weight += weight; if (c.source === 'manual') prev.source = 'manual'; return; }
    out.push({ hex, weight, source: c && c.source === 'manual' ? 'manual' : 'auto' });
  });
  const list2 = out.slice(0, PALETTE_LIMIT);
  const sum = list2.reduce((s, x) => s + x.weight, 0);
  list2.forEach((x) => { x.weight = sum ? round1(x.weight / sum * 100) : round1(100 / list2.length); });
  return list2;
}

/** Fija el peso de un color (0–100) y reparte el resto entre los demás en proporción. Siempre suma 100. */
export function setPaletteWeight(list, index, pct) {
  const base = normalizePalette(list);
  if (!base[index]) return base;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const others = base.filter((_, j) => j !== index);
  if (!others.length) return [Object.assign({}, base[0], { weight: 100 })];
  const osum = others.reduce((s, x) => s + x.weight, 0), rest = 100 - p;
  return base.map((x, j) => Object.assign({}, x, { weight: round1(j === index ? p : osum ? x.weight / osum * rest : rest / others.length) }));
}

/** Información derivada de un color: nombre, familia, RGB y Lab/LCh (redondeados para mostrarlos). */
export function colorInfo(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const d = describeColor(h), rgb = hexToRgb(h), lab = hexToLab(h), lch = labToLch(lab);
  return {
    hex: h, name: d.name, family: d.family, familyLabel: d.label, neutral: d.neutral, rgb,
    lab: { L: Math.round(lab.L), a: Math.round(lab.a), b: Math.round(lab.b) }, lch: { L: Math.round(lch.L), C: Math.round(lch.C), h: Math.round(lch.h) }
  };
}

/** Papel de cada color por su peso: el mayor es dominante; los de ≥ 15 %, secundarios; el resto, detalles. */
export function paletteRoles(list) {
  const p = normalizePalette(list);
  const max = Math.max(0, ...p.map((x) => x.weight));
  let dominantGiven = false;
  return p.map((x) => {
    let role = 'detalle';
    if (!dominantGiven && x.weight === max) { role = 'dominante'; dominantGiven = true; } else if (x.weight >= SECONDARY_MIN) role = 'secundario';
    return Object.assign({}, x, { role });
  });
}
export const ROLE_LABEL = { dominante: 'Dominante', secundario: 'Secundario', detalle: 'Detalle' };

/* ═══════════ HUELLA DE IMAGEN (duplicados) ═══════════
   dHash: la imagen en gris a 9 × 8 y, por fila, si cada píxel es más claro que el siguiente. Resiste
   cambios de tamaño y de compresión; no resiste recortes. 16 caracteres hex. */
export function imageHash(sample) {
  if (!sample || !sample.data || !sample.width || !sample.height) return null;
  const { data, width, height } = sample, W = 9, H = 8, g = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * width / W), x1 = Math.max(x0 + 1, Math.floor((x + 1) * width / W));
      const y0 = Math.floor(y * height / H), y1 = Math.max(y0 + 1, Math.floor((y + 1) * height / H));
      let s = 0, n = 0;
      for (let j = y0; j < Math.min(y1, height); j++) {
        for (let i = x0; i < Math.min(x1, width); i++) {
          const o = (j * width + i) * 4;
          s += 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]; n++;
        }
      }
      g.push(n ? s / n : 0);
    }
  }
  let bits = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) bits += g[y * W + x] > g[y * W + x + 1] ? '1' : '0';
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}
export function hashDistance(a, b) {
  if (!/^[0-9a-f]{16}$/.test(a || '') || !/^[0-9a-f]{16}$/.test(b || '')) return Infinity;
  let d = 0;
  for (let i = 0; i < 16; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}

/* ═══════════ ENLACES ═══════════ */
/** Enlace http(s) de hasta 1000 caracteres (los de tiendas y redes son largos); cualquier otra cosa → null. */
export function httpUrl(u) {
  if (typeof u !== 'string' || !u.trim() || u.trim().length > 1000) return null;
  try { const url = new URL(u.trim()); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null; } catch (e) { return null; }
}
const TRACKING = /^(utm_|fbclid$|gclid$|igshid$|igsh$|mc_|ref$|ref_src$|si$|_ga$|spm$)/i;
/** Enlace comparable: sin seguimiento (utm_*, fbclid…), sin ancla, host en minúsculas y sin www ni barra final. */
export function normalizeSourceUrl(u) {
  const s = httpUrl(u);
  if (!s) return null;
  const url = new URL(s);
  url.hash = '';
  [...url.searchParams.keys()].forEach((k) => { if (TRACKING.test(k)) url.searchParams.delete(k); });
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');
  const q = url.searchParams.toString();
  return host + path + (q ? '?' + q : '');
}
/** Nombre de la fuente a partir del enlace: el dominio sin www (p. ej. «pinterest.com»). */
export function sourceNameFromUrl(u) {
  const s = httpUrl(u);
  return s ? new URL(s).hostname.toLowerCase().replace(/^www\./, '') : null;
}

/* ═══════════ VALIDACIÓN ═══════════ */
const SEASON_IDS = SEASONS.map((s) => s[0]);
function labels(v, maxItems) {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const out = [];
  list.forEach((t) => {
    const x = str(String(t == null ? '' : t), 60);
    if (x && !out.some((o) => o.toLocaleLowerCase('es') === x.toLocaleLowerCase('es'))) out.push(x);
  });
  return out.slice(0, maxItems);
}
/**
 * Referencia lista para guardar o errores. Nunca lanza. Basta con UNO de: imagen, enlace o título
 * (se puede guardar primero y completar después).
 */
export function validateInspiration(input) {
  const i = input && typeof input === 'object' ? input : {};
  const errors = [];
  let source_url = null;
  if (i.source_url != null && String(i.source_url).trim()) {
    source_url = httpUrl(String(i.source_url));
    if (!source_url) errors.push('El enlace tiene que empezar por http:// o https:// (y tener como mucho 1000 caracteres)');
  }
  let published_on = null;
  if (i.published_on) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(i.published_on));
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    if (d && d.getUTCMonth() === +m[2] - 1 && +m[1] >= 1900 && +m[1] <= 2100) published_on = m[1] + '-' + m[2] + '-' + m[3];
    else errors.push('La fecha de publicación no es válida');
  }
  let rating = null;
  if (i.rating != null && i.rating !== '' && i.rating !== 0) {
    const r = Number(i.rating);
    if (Number.isInteger(r) && r >= 1 && r <= 5) rating = r; else errors.push('La valoración va de 1 a 5');
  }
  const seasons = labels(i.seasons, 5).map((s) => s.toLowerCase()).filter((s) => SEASON_IDS.includes(s));
  const palette = normalizePalette(i.palette);
  // con colores: revisada si se dice, si no por revisar; sin colores: fallida si se dice, si no sin paleta
  const status = palette.length ? (i.palette_status === 'reviewed' ? 'reviewed' : 'auto') : (i.palette_status === 'failed' ? 'failed' : 'none');
  const value = {
    title: str(i.title, 160), source_url, source_name: str(i.source_name, 120) || (source_url ? sourceNameFromUrl(source_url) : null),
    published_on, description: text(i.description, 2000), notes: text(i.notes, 4000),
    styles: labels(i.styles, 12), collections: labels(i.collections, 20), seasons, rating,
    is_favorite: i.is_favorite === true, palette, palette_status: status
  };
  if (!value.title && !value.source_url && !i.has_image) errors.push('Añade una imagen, un enlace o al menos un título');
  return { ok: !errors.length, value, errors };
}

/** Título para enseñar: el propio, o la fuente y la fecha de guardado. */
export function displayTitle(x) {
  if (x.title) return x.title;
  const d = x.created_at ? new Date(x.created_at) : null;
  const when = d && !isNaN(d) ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  if (x.source_name) return x.source_name + (when ? ' · ' + when : '');
  return 'Referencia' + (when ? ' del ' + when : '');
}

/* ═══════════ DUPLICADOS ═══════════ */
/** Referencias existentes que parecen la misma: { item, reason: 'url' | 'image' }. */
export function findDuplicateInspirations(cand, existing) {
  const url = normalizeSourceUrl(cand.source_url);
  const out = [];
  (existing || []).forEach((x) => {
    if (cand.id && x.id === cand.id) return;
    if (url && normalizeSourceUrl(x.source_url) === url) out.push({ item: x, reason: 'url' });
    else if (cand.image_hash && hashDistance(cand.image_hash, x.image_hash) <= HASH_NEAR) out.push({ item: x, reason: 'image' });
  });
  return out;
}

/* ═══════════ BÚSQUEDA, FILTROS Y ORDEN ═══════════ */
const fold = (s) => String(s || '').toLocaleLowerCase('es').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** f: { q, style, collection, season, family, fav, review } */
export function matchesFilters(x, f) {
  f = f || {};
  if (f.style && !(x.styles || []).includes(f.style)) return false;
  if (f.collection && !(x.collections || []).includes(f.collection)) return false;
  if (f.season && !(x.seasons || []).includes(f.season)) return false;
  if (f.fav && !x.is_favorite) return false;
  if (f.review && !(x.palette_status === 'auto' || x.palette_status === 'failed' || (x.palette_status === 'none' && (x.image_path || x.demo)))) return false;
  if (f.family && !(x.palette || []).some((c) => c.weight >= 5 && (describeColor(c.hex) || {}).family === f.family)) return false;
  if (f.q) {
    const hay = fold([x.title, x.source_name, x.source_url, x.description, x.notes].concat(x.styles || [], x.collections || [], (x.seasons || []).map((s) => SEASON_LABEL[s]))
      .concat((x.palette || []).map((c) => c.hex + ' ' + ((describeColor(c.hex) || {}).name || ''))).join(' '));
    if (!fold(f.q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}
const time = (v) => { const t = v ? Date.parse(v) : NaN; return isNaN(t) ? null : t; };
export function sortInspirations(list, sort) {
  const by = {
    saved: (a, b) => (time(b.created_at) || 0) - (time(a.created_at) || 0),
    'saved-asc': (a, b) => (time(a.created_at) || 0) - (time(b.created_at) || 0),
    // sin fecha conocida, al final (y entre ellas, por guardado)
    published: (a, b) => ((time(b.published_on) ?? -Infinity) - (time(a.published_on) ?? -Infinity)) || by.saved(a, b),
    favorites: (a, b) => (b.is_favorite - a.is_favorite) || by.saved(a, b),
    rating: (a, b) => ((b.rating || 0) - (a.rating || 0)) || by.saved(a, b)
  };
  const fn = by[sort] || by.saved;
  return (list || []).slice().sort((a, b) => { const r = fn(a, b); return Number.isNaN(r) ? 0 : r; });
}
/** Valores usados en las referencias más los de la lista configurada, sin repetir y en ese orden. */
export function optionValues(configured, items, key) {
  const out = [];
  const add = (v) => { if (v && !out.some((o) => o.toLocaleLowerCase('es') === v.toLocaleLowerCase('es'))) out.push(v); };
  (configured || []).forEach(add);
  const used = [];
  (items || []).forEach((x) => (x[key] || []).forEach((v) => { if (!used.includes(v)) used.push(v); }));
  used.sort((a, b) => a.localeCompare(b, 'es')).forEach(add);
  return out;
}

/* ═══════════ RELACIÓN CON EL RESTO DE COLOR STUDIO ═══════════ */
const asPalette = (x) => ({ id: x.id, name: displayTitle(x), colors: (x.palette || []).map((c) => ({ hex: c.hex })), ref: x });
/** Referencias con paleta parecida (mismo criterio que la Biblioteca: colores conectados por ΔE00 ≤ 10, ponderados por peso). */
export function similarInspirations(target, list, limit = 4) {
  if (!target || !(target.palette || []).length) return [];
  const colors = target.palette.map((c) => ({ hex: c.hex, share: c.weight }));
  const others = (list || []).filter((x) => x.id !== target.id && (x.palette || []).length).map(asPalette);
  return rankPalettes(colors, others, { minConnected: Math.min(2, colors.length), limit }).map((r) => ({ item: r.palette.ref, match: r.match }));
}
/** Paleta para la Biblioteca (cs_palettes) a partir de una referencia: mismos colores en orden, con su procedencia. */
export function paletteForLibrary(x) {
  return {
    name: (x.title || x.source_name || 'Inspiración').slice(0, 120),
    colors: (x.palette || []).slice(0, 12).map((c) => ({ hex: c.hex, original: c.hex })),
    tags: ['inspiración'].concat((x.styles || []).map((s) => s.toLowerCase())),
    source_type: x.source_url ? 'web' : 'photo',
    source_title: x.source_name || null,
    source_url: x.source_url && x.source_url.length <= 600 ? x.source_url : null,
    source_notes: 'Colores extraídos de una foto de outfit guardada en Inspiración: una estimación de la imagen (incluye fondo y piel si se ven), no de las prendas.'
  };
}
