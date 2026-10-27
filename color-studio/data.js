/* ═══════════════════════════════════════════════
   color-studio/data.js: validación, importación, exportación y datos de ejemplo
   ─────────────────────────────────────────────────
   Módulo ES puro (sin red ni DOM). La web valida aquí ANTES de escribir en Supabase;
   la base vuelve a exigir lo esencial con checks (supabase/color-studio.sql).
   ═══════════════════════════════════════════════ */
import { normalizeHex, normalizePaletteColors, findDuplicates, CATEGORY_LABEL, SLOT, sanitizeWeight, normalizeDistribution } from './engine.js?v=554dcefb20';

export const SOURCE_TYPES = [
  ['own', 'Creada por mí'], ['book', 'Libro'], ['web', 'Página web'], ['photo', 'Fotografía'], ['other', 'Otra referencia']
];
export const SOURCE_LABEL = Object.fromEntries(SOURCE_TYPES);
export const PATTERNS = [['liso', 'Liso'], ['rayas', 'Rayas'], ['cuadros', 'Cuadros'], ['estampado', 'Estampado'], ['otro', 'Otro']];
export const EXPORT_FORMAT = 'color-studio';
export const EXPORT_VERSION = 1;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 500;

/** Solo enlaces http(s); cualquier otra cosa (javascript:, data:…) → null. */
export function safeUrl(u) {
  if (typeof u !== 'string' || !u.trim()) return null;
  try {
    const url = new URL(u.trim());
    return /^https?:$/.test(url.protocol) && u.trim().length <= 600 ? url.href : null;
  } catch (e) { return null; }
}
const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
export function parseTags(v) {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;|]/) : [];
  return [...new Set(list.map((t) => String(t).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 20);
}

/** Paleta lista para guardar o un error por campo. Nunca lanza. */
export function validatePalette(input) {
  const errors = [];
  const i = input && typeof input === 'object' ? input : {};
  const { colors, errors: cErr } = normalizePaletteColors(i.colors);
  errors.push(...cErr);
  if (!colors.length) errors.push('La paleta necesita al menos un color');
  const source_type = SOURCE_LABEL[i.source_type] ? i.source_type : 'own';
  if (i.source_type != null && i.source_type !== '' && !SOURCE_LABEL[i.source_type]) errors.push('Origen desconocido: «' + String(i.source_type).slice(0, 20) + '»');
  let source_url = null;
  if (i.source_url != null && String(i.source_url).trim()) {
    source_url = safeUrl(String(i.source_url));
    if (!source_url) errors.push('El enlace de referencia tiene que empezar por http:// o https://');
  }
  const value = {
    name: str(i.name, 120), colors, tags: parseTags(i.tags), source_type,
    source_title: str(i.source_title, 200), source_url, source_notes: str(i.source_notes, 2000), notes: str(i.notes, 2000),
    is_favorite: i.is_favorite === true
  };
  return { ok: !errors.length, value, errors };
}

/** Prenda lista para guardar. */
export function validateGarment(input) {
  const errors = [];
  const i = input && typeof input === 'object' ? input : {};
  if (!CATEGORY_LABEL[i.category]) errors.push('Elige una categoría');
  const primary = normalizeHex(i.primary_color || '');
  if (!primary) errors.push('El color principal tiene que ser un HEX válido');
  const rawSec = Array.isArray(i.secondary_colors) ? i.secondary_colors : [];
  const secondary = [];
  rawSec.forEach((c) => { const h = normalizeHex(c || ''); if (!h) errors.push('Color secundario no válido: «' + String(c).slice(0, 20) + '»'); else if (h !== primary && !secondary.includes(h)) secondary.push(h); });
  if (secondary.length > 6) errors.push('Como máximo 6 colores secundarios');
  let shares = null;
  if (Array.isArray(i.color_shares) && i.color_shares.length) {
    const s = i.color_shares.map(sanitizeWeight);
    if (s.some((x) => !x.valid)) errors.push('El reparto de colores tiene que ser de números positivos');
    else if (s.length !== secondary.length + 1) errors.push('El reparto tiene que tener un valor por color');
    else if (!s.reduce((a, b) => a + b.value, 0)) errors.push('El reparto de colores no puede sumar 0');
    else shares = s.map((x) => x.value);
  }
  const pattern = PATTERNS.some((p) => p[0] === i.pattern) ? i.pattern : 'liso';
  return {
    ok: !errors.length, errors,
    value: { name: str(i.name, 120), category: i.category, subcategory: str(i.subcategory, 80), primary_color: primary, secondary_colors: secondary.slice(0, 6),
      color_shares: shares, pattern, material: str(i.material, 80), notes: str(i.notes, 2000) }
  };
}

/** Outfit listo para guardar. items: [{ slot, garment_id | hex, weight, hypothetical? }] (hypothetical solo con hex: color propuesto, no una prenda tuya) */
export function validateOutfit(input) {
  const errors = [];
  const i = input && typeof input === 'object' ? input : {};
  const name = str(i.name, 120);
  if (!name) errors.push('Ponle un nombre al outfit');
  const items = (Array.isArray(i.items) ? i.items : []).map((it) => {
    const slot = SLOT[it && it.slot] ? it.slot : null;
    const w = sanitizeWeight(it && it.weight);
    if (!slot) errors.push('Hueco desconocido en el outfit');
    if (!w.valid) errors.push('Peso no válido en ' + (slot ? SLOT[slot].label.toLowerCase() : 'una prenda'));
    const hex = normalizeHex((it && it.hex) || '');
    if (!(it && it.garment_id) && !hex) errors.push('Cada hueco necesita una prenda o un color');
    const item = { slot, weight: w.value, garment_id: (it && it.garment_id) || null, hex: it && it.garment_id ? null : hex };
    if (!item.garment_id && it && it.hypothetical === true) item.hypothetical = true;   // color propuesto que no tienes (CS-13)
    return item;
  });
  if (!items.length) errors.push('El outfit no tiene prendas');
  if (items.length > 12) errors.push('Como máximo 12 prendas');
  const override = i.distribution_override ? normalizeDistribution(i.distribution_override) : null;
  return {
    ok: !errors.length, errors,
    value: { name, items, palette_id: i.palette_id || null, distribution_override: override && override.length ? override : null,
      occasion: str(i.occasion, 120), formality: ['formal', 'smart', 'casual'].includes(i.formality) ? i.formality : null,
      notes: str(i.notes, 2000), is_favorite: i.is_favorite === true }
  };
}

/* ═══════════ IMPORTACIÓN ═══════════ */
/**
 * JSON admitido:
 *   · exportación de Color Studio: { format: 'color-studio', version: 1, palettes: [...] }
 *   · una lista de paletas: [{ name, colors: ['#…', …] | [{ hex, name }], tags, source_type, source_url, … }]
 *   · una lista de listas de HEX: [['#…', '#…'], …]
 * Solo se importan paletas (las prendas necesitan su foto y se registran desde el armario).
 */
export function parseImportJSON(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'El archivo está vacío.', rows: [] };
  if (text.length > IMPORT_MAX_BYTES) return { ok: false, error: 'El archivo supera 2 MB.', rows: [] };
  let data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'No es un JSON válido: ' + e.message, rows: [] }; }
  let list = null;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object') {
    if (data.format && data.format !== EXPORT_FORMAT) return { ok: false, error: 'Formato desconocido: «' + String(data.format).slice(0, 40) + '».', rows: [] };
    if (data.version != null && data.version > EXPORT_VERSION) return { ok: false, error: 'El archivo es de una versión más nueva (' + data.version + ').', rows: [] };
    list = Array.isArray(data.palettes) ? data.palettes : null;
  }
  if (!list) return { ok: false, error: 'No encuentro una lista de paletas.', rows: [] };
  if (list.length > IMPORT_MAX_ROWS) return { ok: false, error: 'Como máximo ' + IMPORT_MAX_ROWS + ' paletas por importación.', rows: [] };
  const rows = list.map((p, n) => {
    const v = validatePalette(Array.isArray(p) ? { colors: p } : p);
    return { row: n + 1, value: v.value, errors: v.errors };
  });
  return { ok: true, error: null, rows };
}

/** Separa una línea CSV respetando comillas. */
function splitCsvLine(line, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
const CSV_COLUMNS = { name: ['name', 'nombre'], colors: ['colors', 'colores', 'hex'], tags: ['tags', 'etiquetas'], source_type: ['source_type', 'origen'],
  source_title: ['source_title', 'fuente'], source_url: ['source_url', 'url', 'enlace'], notes: ['notes', 'notas'] };
/**
 * CSV con cabecera. Columnas: name/nombre, colors/colores (HEX separados por espacio, «|» o «;» dentro de la celda),
 * tags/etiquetas, source_type/origen, source_title/fuente, source_url/url, notes/notas. Separador «,» o «;».
 */
export function parseImportCSV(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'El archivo está vacío.', rows: [] };
  if (text.length > IMPORT_MAX_BYTES) return { ok: false, error: 'El archivo supera 2 MB.', rows: [] };
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = splitCsvLine(lines[0], sep).map((h) => h.toLowerCase());
  const col = {};
  Object.keys(CSV_COLUMNS).forEach((k) => { const i = head.findIndex((h) => CSV_COLUMNS[k].includes(h)); if (i >= 0) col[k] = i; });
  if (col.colors == null) return { ok: false, error: 'Falta la columna «colors» (o «colores»).', rows: [] };
  if (lines.length - 1 > IMPORT_MAX_ROWS) return { ok: false, error: 'Como máximo ' + IMPORT_MAX_ROWS + ' paletas por importación.', rows: [] };
  const rows = lines.slice(1).map((l, n) => {
    const cells = splitCsvLine(l, sep), get = (k) => (col[k] == null ? null : cells[col[k]] || null);
    const v = validatePalette({ name: get('name'), colors: (get('colors') || '').split(/[\s|;,]+/).filter(Boolean), tags: get('tags'),
      source_type: get('source_type') || undefined, source_title: get('source_title'), source_url: get('source_url'), notes: get('notes') });
    return { row: n + 2, value: v.value, errors: v.errors };
  });
  return { ok: true, error: null, rows };
}

/** Marca duplicados de cada fila frente a la biblioteca y frente a filas anteriores del mismo archivo. */
export function reviewImport(rows, existing) {
  const accepted = [];
  return (rows || []).map((r) => {
    if (r.errors.length) return Object.assign({}, r, { duplicates: [], selected: false });
    const dups = findDuplicates(r.value, existing || []).map((d) => ({ kind: d.kind, name: d.palette.name || 'sin nombre', where: 'biblioteca' }))
      .concat(findDuplicates(r.value, accepted).map((d) => ({ kind: d.kind, name: d.palette.name || 'fila anterior', where: 'archivo' })));
    accepted.push(r.value);
    return Object.assign({}, r, { duplicates: dups, selected: !dups.some((d) => d.kind === 'identical') });
  });
}

/* ═══════════ EXPORTACIÓN ═══════════ */
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
/** Copia portable de los datos propios. Las fotos no viajan: solo su ruta en el bucket privado. */
export function buildExport({ garments, palettes, outfits, inspirations }, now = new Date()) {
  return {
    format: EXPORT_FORMAT, version: EXPORT_VERSION, exported_at: now.toISOString(),
    note: 'Las fotos de las prendas y de las inspiraciones no se incluyen; image_path es su ruta en el bucket privado «armario».',
    palettes: (palettes || []).map((p) => pick(p, ['id', 'name', 'colors', 'tags', 'source_type', 'source_title', 'source_url', 'source_notes', 'notes', 'is_favorite', 'created_at', 'updated_at'])),
    garments: (garments || []).map((g) => pick(g, ['id', 'name', 'category', 'subcategory', 'image_path', 'primary_color', 'secondary_colors', 'color_shares', 'pattern', 'material', 'notes', 'created_at', 'updated_at'])),
    outfits: (outfits || []).map((o) => pick(o, ['id', 'name', 'items', 'palette_id', 'distribution_override', 'occasion', 'formality', 'notes', 'is_favorite', 'created_at', 'updated_at'])),
    inspirations: (inspirations || []).map((x) => pick(x, ['id', 'title', 'source_url', 'source_name', 'published_on', 'image_path', 'description', 'notes', 'styles', 'collections', 'seasons', 'rating', 'is_favorite', 'palette', 'suggestions', 'palette_status', 'palette_id', 'created_at', 'updated_at']))
  };
}

/* ═══════════ DATOS DE EJEMPLO ═══════════
   Solo para ver la herramienta sin datos propios. Se marcan con demo: true, la interfaz lo dice
   en todo momento y nunca se guardan. Las paletas son inventadas para la demo: NO proceden de
   ningún libro ni de ninguna fuente publicada. */
export function demoData() {
  const g = (id, name, category, primary, secondary, extra) => Object.assign({ id: 'demo-' + id, demo: true, name, category, subcategory: null, image_path: null,
    primary_color: primary, secondary_colors: secondary || [], color_shares: null, pattern: 'liso', material: null, notes: null }, extra || {});
  const p = (id, name, colors, tags) => ({ id: 'demo-p' + id, demo: true, name, tags, source_type: 'own', source_title: 'Ejemplo de Color Studio (inventado, sin fuente)',
    source_url: null, source_notes: null, notes: null, is_favorite: false,
    colors: colors.map((c) => ({ original: c[0], hex: c[0], name: c[1], role: null, note: null })) });
  const i = (id, title, styles, seasons, colors, fav, days) => ({ id: 'demo-i' + id, demo: true, title, source_url: null, source_name: 'Ejemplo de Color Studio', published_on: null,
    image_path: null, thumb_path: null, image_hash: null, description: null, notes: null, styles, collections: [], seasons, rating: null, is_favorite: fav,
    palette: colors.map((c, k) => ({ id: 'demo-c' + id + k, hex: c[0], weight: c[1], source: 'auto' })), suggestions: [], palette_status: 'reviewed', palette_id: null,
    created_at: new Date(Date.UTC(2026, 0, 10 + days)).toISOString() });
  return {
    garments: [
      g('pan-marino', 'Chino marino', 'pantalones', '#1F2A44'), g('pan-piedra', 'Chino piedra', 'pantalones', '#B9AE96'),
      g('vaq-indigo', 'Vaquero índigo', 'vaqueros', '#2E3F5C'),
      g('cam-blanca', 'Camisa blanca', 'camisas', '#F4F2EC'), g('cam-oxford', 'Oxford azul', 'camisas', '#A9C1DC'),
      g('jer-burdeos', 'Jersey burdeos', 'jerseis', '#6B1F2A'), g('tee-gris', 'Camiseta gris', 'camisetas', '#9A9A97'),
      g('cha-camel', 'Abrigo camel', 'chaquetas', '#B48A5A'), g('cha-oliva', 'Sobrecamisa oliva', 'chaquetas', '#5E6B3A'),
      g('zap-marron', 'Bota marrón', 'calzado', '#4A2E1F'), g('zap-blanca', 'Zapatilla blanca', 'calzado', '#F2F1EE'),
      g('cal-marino', 'Calcetín marino', 'calcetines', '#1E2740'), g('cal-burdeos', 'Calcetín burdeos', 'calcetines', '#6E2230'),
      g('acc-panuelo', 'Pañuelo mostaza', 'accesorios', '#C9A23A')
    ],
    palettes: [
      p(1, 'Otoño urbano', [['#1F2A44', 'marino'], ['#B48A5A', 'camel'], ['#F4F2EC', 'crudo']], ['otoño', 'neutros']),
      p(2, 'Bosque', [['#5E6B3A', 'oliva'], ['#B9AE96', 'piedra'], ['#4A2E1F', 'marrón'], ['#C9A23A', 'mostaza']], ['verde', 'tierra']),
      p(3, 'Vino y niebla', [['#6B1F2A', 'burdeos'], ['#9A9A97', 'gris'], ['#2E3F5C', 'índigo']], ['contraste']),
      p(4, 'Mar de invierno', [['#A9C1DC', 'azul claro'], ['#1F2A44', 'marino'], ['#F2F1EE', 'blanco'], ['#B8B09B', 'arena'], ['#6E2230', 'granate']], ['azul'])
    ],
    outfits: [],
    // referencias de Inspiración sin foto (la tarjeta enseña su paleta); inventadas, sin enlace ni fuente real
    inspirations: [
      i(1, 'Ejemplo · Camel y marino', ['Smart casual'], ['otono', 'invierno'], [['#B48A5A', 38], ['#1F2A44', 34], ['#F4F2EC', 18], ['#4A2E1F', 10]], true, 3),
      i(2, 'Ejemplo · Lino y arena', ['Casual', 'Minimalista'], ['verano'], [['#F2F1EE', 46], ['#B8B09B', 32], ['#A9C1DC', 22]], false, 2),
      i(3, 'Ejemplo · Oliva y burdeos', ['Workwear'], ['entretiempo'], [['#5E6B3A', 44], ['#2E3F5C', 30], ['#6B1F2A', 16], ['#C9A23A', 10]], false, 1)
    ]
  };
}
