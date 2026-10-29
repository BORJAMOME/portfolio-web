/* ═══════════════════════════════════════════════
   tools/claude-academy/load.mjs: reúne el contenido del Manual de Claude
   ─────────────────────────────────────────────────
   · Contenido real, SOLO en tu equipo: .claude-academy/ (ignorada por git):
       content.js        opcional; exporta BLOCKS, COURSES, GLOSS y/o LOG
       temas/*.js        export default [ …fichas… ]   (se cargan por orden alfabético)
     Es lo que publica publish.mjs. El repositorio público no lleva ningún tema real.
   · Ficha de prueba, solo para las comprobaciones: tools/claude-academy/fixtures/guia/ (con { fixtures: true }).
     Documenta además el formato completo de una ficha. NUNCA se publica en la base.
   El orden de las fichas es el de lectura y el de «Siguiente / Anterior».
   ═══════════════════════════════════════════════ */
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURES = join(ROOT, 'tools', 'claude-academy', 'fixtures', 'guia');
export const LOCAL = join(ROOT, '.claude-academy');
const imp = (f) => import(pathToFileURL(f).href);

/* { local = true, fixtures = false }: qué carpetas se leen. Por defecto, solo el contenido real. */
export async function loadContent({ local = true, fixtures = false } = {}) {
  const data = { BLOCKS: [], COURSES: [], GLOSS: [], LOG: [], TOPICS: [] };
  const files = [];
  const dirs = [];
  if (fixtures) dirs.push([FIXTURES, 'prueba']);
  if (local && existsSync(LOCAL)) dirs.push([LOCAL, 'local']);
  for (const [dir, origin] of dirs) {
    if (existsSync(join(dir, 'content.js'))) {
      const m = await imp(join(dir, 'content.js'));
      for (const k of ['BLOCKS', 'COURSES', 'GLOSS', 'LOG']) if (Array.isArray(m[k])) data[k].push(...m[k]);
      files.push(`${origin}: content.js`);
    }
    const td = join(dir, 'temas');
    if (!existsSync(td)) continue;
    for (const f of readdirSync(td).filter((x) => x.endsWith('.js')).sort()) {
      const m = await imp(join(td, f));
      if (!Array.isArray(m.default)) throw new Error(`${origin}: temas/${f} debe hacer «export default [ … ]»`);
      data.TOPICS.push(...m.default);
      files.push(`${origin}: temas/${f} (${m.default.length} fichas)`);
    }
  }
  return { data, files, hasLocal: local && existsSync(LOCAL) };
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
export const glossId = (k) => 'gloss:' + norm(k).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);

/* Documentos de cm_docs (supabase/claude-manual.sql): una fila por bloque, ficha, curso, término y entrada del registro */
export function toRows(data) {
  const rows = [];
  data.BLOCKS.forEach((b, i) => rows.push({ id: 'block:' + b.id, kind: 'block', pos: i, data: b }));
  data.TOPICS.forEach((t, i) => rows.push({ id: 'topic:' + t.id, kind: 'topic', pos: i, data: t }));
  data.COURSES.forEach((c, i) => rows.push({ id: 'course:' + c.id, kind: 'course', pos: i, data: c }));
  data.GLOSS.forEach((g, i) => rows.push({ id: glossId(g.k), kind: 'gloss', pos: i, data: g }));
  data.LOG.forEach((l, i) => rows.push({ id: 'log:' + String(l.d).replace(/[^0-9-]/g, '') + '-' + i, kind: 'log', pos: i, data: l }));
  return rows;
}
