/* ═══════════════════════════════════════════════
   color-studio/image.js: fotos de prendas en el navegador
   ─────────────────────────────────────────────────
   · Valida tipo y tamaño ANTES de leer la imagen.
   · La reduce (máx. 1600 px) y la vuelve a codificar con canvas: el archivo que se sube
     no lleva EXIF (ni fecha ni ubicación GPS) y pesa poco.
   · Propone colores con un análisis LOCAL (engine.extractDominantColors): nada sale del dispositivo.
   · Guarda una copia mediana (pick) para el cuentagotas: el color se toma a mano sobre la foto (engine.sampleColor).
   · Proveedor de visión desacoplado: hoy solo existe «local». Uno externo (p. ej. una Edge Function
     con la clave en el servidor) tendría que implementar la misma interfaz `analyze(sample)` y
     declararse aquí; la web nunca llevará claves de API.
   ═══════════════════════════════════════════════ */
import { extractDominantColors } from './engine.js?v=ad34183687';

export const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_INPUT_BYTES = 15 * 1024 * 1024;
export const MAX_SIDE = 1600;

/** Error legible si el archivo no se puede usar; null si vale. */
export function checkFile(file) {
  if (!file) return 'No se ha seleccionado ninguna imagen.';
  if (/heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '')) return 'Las fotos HEIC no se pueden leer en este navegador. En el iPhone, elige «Más compatible» en Ajustes → Cámara → Formatos, o comparte la foto como JPEG.';
  if (!ACCEPTED.includes(file.type)) return 'Formato no admitido (' + (file.type || 'desconocido') + '). Usa JPEG, PNG o WebP.';
  if (file.size > MAX_INPUT_BYTES) return 'La imagen pesa más de 15 MB.';
  return null;
}

function decode(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se ha podido leer la imagen.')); };
    img.src = url;
  });
}
const PICK_SIDE = 480;
function copyAt(canvas, side) {
  const s = Math.min(1, side / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * s)), h = Math.max(1, Math.round(canvas.height * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const c2d = c.getContext('2d');
  c2d.drawImage(canvas, 0, 0, w, h);
  return { data: c2d.getImageData(0, 0, w, h).data, width: w, height: h };
}
function toBlob(canvas, type, q) { return new Promise((r) => canvas.toBlob(r, type, q)); }

/**
 * Prepara una foto para subirla. → { blob, type, width, height, sample, pick, thumb }  (sample y pick: { data, width, height })
 * sample es una copia pequeña (≤ 96 px) para el análisis de color; pick, una mayor (≤ 480 px) para el cuentagotas.
 * Con opts.thumb (lado en px), thumb = { blob, type } es una miniatura para las tarjetas (Inspiración); null si no se pide
 * o si la imagen no es mayor que ese lado.
 */
export async function prepareImage(file, opts = {}) {
  const problem = checkFile(file);
  if (problem) throw new Error(problem);
  let bmp;
  try { bmp = await decode(file); } catch (e) { throw new Error('No se ha podido leer la imagen. ¿Está dañada?'); }
  const w0 = bmp.width, h0 = bmp.height;
  if (!w0 || !h0) throw new Error('La imagen no tiene dimensiones válidas.');
  const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const c2d = canvas.getContext('2d');
  c2d.drawImage(bmp, 0, 0, w, h);
  let type = 'image/webp', blob = await toBlob(canvas, type, 0.85);
  if (!blob || blob.type !== 'image/webp') { type = 'image/jpeg'; blob = await toBlob(canvas, type, 0.86); }
  if (!blob) throw new Error('No se ha podido preparar la imagen.');
  const s = Math.min(1, 96 / Math.max(w, h)), sw = Math.max(1, Math.round(w * s)), sh = Math.max(1, Math.round(h * s));
  const small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  const s2d = small.getContext('2d');
  s2d.drawImage(canvas, 0, 0, sw, sh);
  const sample = { data: s2d.getImageData(0, 0, sw, sh).data, width: sw, height: sh };
  const pick = copyAt(canvas, PICK_SIDE);
  let thumb = null;
  if (opts.thumb && Math.max(w, h) > opts.thumb) {       // si la imagen ya es pequeña, la miniatura sería la misma
    const t = Math.min(1, opts.thumb / Math.max(w, h)), tc = document.createElement('canvas');
    tc.width = Math.max(1, Math.round(w * t)); tc.height = Math.max(1, Math.round(h * t));
    tc.getContext('2d').drawImage(canvas, 0, 0, tc.width, tc.height);
    const tb = await toBlob(tc, type, 0.8);
    if (tb) thumb = { blob: tb, type };
  }
  if (bmp.close) bmp.close();
  return { blob, type, width: w, height: h, sample, pick, thumb };
}

/* ── Proveedores de visión ── */
const PROVIDERS = {
  local: {
    id: 'local',
    label: 'Análisis en el dispositivo',
    /** → { colors: [{ hex, share }], category: null } (la categoría la elige la persona) */
    analyze(sample) { return Promise.resolve({ colors: extractDominantColors(sample.data, sample.width, sample.height, { k: 5 }), category: null }); }
  }
};
export const visionProvider = (id) => PROVIDERS[id] || PROVIDERS.local;
