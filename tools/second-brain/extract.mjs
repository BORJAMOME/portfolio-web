/* ═══════════════════════════════════════════════
   tools/second-brain/extract.mjs: lectura de formatos
   ─────────────────────────────────────────────────
   Convierte un archivo en SEGMENTOS de texto con su clase de evidencia:
     practica     código o artefactos hechos con la herramienta (py, sql, celdas de código, DAX…)
     explicativa  prosa propia: README, manuales, celdas Markdown, documentos
     declarativa  listas de habilidades y CV (lo que se afirma, no lo que se demuestra)
   y en ARTEFACTOS (señales de presencia: pbix, ipynb, gitignore…).

   Todo el contenido se trata como DATOS: nada se ejecuta, se importa ni se interpreta
   como una instrucción para el motor. Los notebooks se leen como JSON (sin ejecutar
   celdas y sin leer sus salidas).
   ═══════════════════════════════════════════════ */
import { extname, basename } from 'node:path';
import { openZip } from './zip.mjs';

const CODE_LANG = {
  py: 'python', sql: 'sql', dax: 'dax', tmdl: 'dax', m: 'm', pq: 'm',
  yml: 'yaml', yaml: 'yaml', r: 'r', js: 'javascript', mjs: 'javascript', ts: 'typescript', toml: 'toml',
};
const FENCE_LANG = { python: 'python', py: 'python', sql: 'sql', dax: 'dax', m: 'm', powerquery: 'm', pq: 'm', yaml: 'yaml', yml: 'yaml' };

export const SUPPORTED = new Set([
  'md', 'markdown', 'txt', 'rst', 'py', 'sql', 'dax', 'tmdl', 'm', 'pq', 'yml', 'yaml', 'ipynb', 'html', 'htm',
  'docx', 'pbix', 'csv', 'tsv', 'xlsx', 'pbip', 'gitignore',
]);
/** Formatos que reconocemos pero que esta versión no sabe leer (se cuentan en la cobertura). */
export const KNOWN_UNSUPPORTED = new Set(['pdf', 'doc', 'xls', 'pptx', 'ppt', 'pbit']);

const wrap = (cls, lang, text) => (text && text.trim() ? [{ cls, lang, text }] : []);

function splitMarkdown(text, declarative) {
  const segs = [];
  const prose = [];
  const re = /^```+\s*([A-Za-z0-9_+-]*)[^\n]*\n([\s\S]*?)^```+\s*$/gm;
  let last = 0, m;
  while ((m = re.exec(text))) {
    prose.push(text.slice(last, m.index));
    last = m.index + m[0].length;
    const lang = FENCE_LANG[m[1].toLowerCase()] || null;
    // un bloque de código con lenguaje conocido es código escrito por el autor; sin lenguaje cuenta como prosa
    if (declarative) prose.push(m[2]);
    else if (lang) segs.push({ cls: 'practica', lang, text: m[2] });
    else prose.push(m[2]);
  }
  prose.push(text.slice(last));
  const body = prose.join('\n');
  return wrap(declarative ? 'declarativa' : 'explicativa', 'markdown', body).concat(segs);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

function notebook(buf, declarative) {
  let nb;
  try { nb = JSON.parse(buf.toString('utf8')); } catch { return { segments: [], artifacts: ['ipynb'], note: 'ipynb ilegible' }; }
  const lang = String((nb.metadata && nb.metadata.language_info && nb.metadata.language_info.name) || 'python').toLowerCase();
  const code = [], md = [];
  for (const c of Array.isArray(nb.cells) ? nb.cells : []) {
    const src = Array.isArray(c.source) ? c.source.join('') : String(c.source || '');
    if (c.cell_type === 'code') code.push(src);
    else if (c.cell_type === 'markdown') md.push(src);
  }
  const segments = [
    ...wrap(declarative ? 'declarativa' : 'practica', CODE_LANG[lang] || lang, code.join('\n\n')),
    ...splitMarkdown(md.join('\n\n'), declarative),
  ];
  return { segments, artifacts: ['ipynb'] };
}

function docx(buf, declarative) {
  const zip = openZip(buf);
  const xml = zip && zip.read('word/document.xml');
  if (!xml) return { segments: [], artifacts: [], note: 'docx ilegible' };
  const text = xml.toString('utf8').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return { segments: wrap(declarative ? 'declarativa' : 'explicativa', 'markdown', text), artifacts: [] };
}

/* PBIX: el modelo (DataModel) va comprimido con XPress9 y no se puede leer sin Microsoft; sí se lee
   Report/Layout (JSON UTF-16): páginas, visuales y las medidas a las que hacen referencia. */
function pbix(buf) {
  const zip = openZip(buf);
  if (!zip) return { segments: [], artifacts: ['pbix'], note: 'pbix ilegible' };
  const art = ['pbix'];
  let note = 'DataModel no legible (compresión XPress9): se usa solo el diseño del informe';
  const layoutBuf = zip.read('Report/Layout');
  if (layoutBuf) {
    let layout = null;
    try {
      const utf16 = layoutBuf.length > 1 && layoutBuf[1] === 0 || (layoutBuf[0] === 0xff && layoutBuf[1] === 0xfe);
      layout = JSON.parse(layoutBuf.toString(utf16 ? 'utf16le' : 'utf8').replace(/^﻿/, ''));
    } catch { /* layout ilegible */ }
    if (layout) {
      let measures = 0;
      for (const sec of layout.sections || []) {
        for (const vc of sec.visualContainers || []) {
          try { if (/"Measure"\s*:/.test(vc.config || '') || /"Aggregation"/.test(vc.config || '')) measures++; } catch { /* sin config */ }
        }
      }
      if (measures > 0) art.push('pbix-measures');
      note = `${(layout.sections || []).length} página(s) leídas; el modelo DAX no es legible en PBIX`;
    }
  }
  return { segments: [], artifacts: art, note };
}

/**
 * @param {string} path      ruta absoluta (solo se usa para decidir el formato)
 * @param {Buffer} buf       contenido ya leído, dentro del límite de tamaño
 * @param {{declarative?: boolean}} opts
 * @returns {{supported:boolean, segments:{cls:string,lang:string,text:string}[], artifacts:string[], note?:string}}
 */
export function extractFile(path, buf, opts = {}) {
  const declarative = !!opts.declarative;
  const name = basename(path).toLowerCase();
  const ext = name === '.gitignore' ? 'gitignore' : extname(name).slice(1);
  if (!SUPPORTED.has(ext)) return { supported: false, segments: [], artifacts: [], ext };
  let r;
  if (ext === 'gitignore') r = { segments: [], artifacts: ['gitignore'] };
  else if (ext === 'md' || ext === 'markdown' || ext === 'rst') r = { segments: splitMarkdown(buf.toString('utf8'), declarative), artifacts: [] };
  else if (ext === 'txt') r = { segments: wrap(declarative ? 'declarativa' : 'explicativa', 'markdown', buf.toString('utf8')), artifacts: [] };
  else if (ext === 'html' || ext === 'htm') r = { segments: wrap(declarative ? 'declarativa' : 'explicativa', 'markdown', stripHtml(buf.toString('utf8'))), artifacts: [] };
  else if (ext === 'ipynb') r = notebook(buf, declarative);
  else if (ext === 'docx') r = docx(buf, declarative);
  else if (ext === 'pbix') r = pbix(buf);
  else if (ext === 'pbip') r = { segments: [], artifacts: ['pbip'] };
  else if (ext === 'csv' || ext === 'tsv') r = { segments: [], artifacts: [] };           // datos: no se interpretan
  else if (ext === 'xlsx') r = { segments: [], artifacts: ['xlsx'] };                     // solo presencia
  else {
    const lang = CODE_LANG[ext];
    r = { segments: wrap(declarative ? 'declarativa' : 'practica', lang, buf.toString('utf8')), artifacts: ext === 'tmdl' ? ['tmdl'] : [] };
    if (ext === 'yml' || ext === 'yaml') r.segments.forEach((s) => { s.lang = 'yaml'; });
  }
  return { supported: true, ext, ...r };
}
