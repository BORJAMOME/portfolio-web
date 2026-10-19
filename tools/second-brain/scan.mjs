/* ═══════════════════════════════════════════════
   tools/second-brain/scan.mjs: recorrido de fuentes autorizadas + caché incremental
   ─────────────────────────────────────────────────
   · Solo recorre las rutas declaradas en la configuración (nunca el equipo entero).
   · No sigue enlaces simbólicos; no sale nunca de la raíz de cada fuente.
   · Solo lee: no ejecuta, no importa, no escribe en las fuentes.
   · Incremental: si el tamaño y la fecha del archivo no cambian, reutiliza lo ya detectado;
     si cambian, compara el hash del contenido antes de volver a extraer.
   ═══════════════════════════════════════════════ */
import { readdirSync, statSync, readFileSync, realpathSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep, parse, basename, extname } from 'node:path';
import { extractFile, SUPPORTED, KNOWN_UNSUPPORTED } from './extract.mjs';
import { detect } from './lexicon.mjs';

/** Título (primer encabezado) y descripción (primer párrafo de prosa) de un README, como texto plano y acotado. */
export function readmeMeta(md) {
  const clean = (s) => s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`>#|]/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const lines = md.replace(/\r/g, '').split('\n');
  let title = null, desc = null, inCode = false;
  for (const l of lines) {
    if (/^```/.test(l)) { inCode = !inCode; continue; }
    if (inCode) continue;
    if (!title && /^#{1,2}\s+\S/.test(l)) { title = clean(l); continue; }
    if (title && !desc && l.trim() && !/^(#|\||-{3,}|!\[|<|\[!\[)/.test(l.trim())) { const c = clean(l); if (c.length > 40) desc = c; }
    if (title && desc) break;
  }
  return title ? { title: title.slice(0, 90), desc: desc ? desc.slice(0, 260) : null } : null;
}

export const DEFAULT_EXCLUDE = [
  'node_modules', '.git', '.venv', 'venv', 'env', '__pycache__', '.ipynb_checkpoints', '.idea', '.vscode', '.mypy_cache',
  '.pytest_cache', 'dist', 'build', '.next', '.cache', '.stubs', 'site-packages', '.second-brain',
];

const posix = (p) => p.split(sep).join('/');
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

export function assertSafeSource(src) {
  if (!src || typeof src.path !== 'string' || !src.id) throw new Error('Cada fuente necesita «id» y «path».');
  if (!existsSync(src.path)) throw new Error(`La fuente «${src.id}» no existe: ${src.path}`);
  const real = realpathSync(src.path);
  if (parse(real).root === real) throw new Error(`La fuente «${src.id}» es la raíz de un disco: indica una carpeta concreta.`);
  if (!statSync(real).isDirectory()) throw new Error(`La fuente «${src.id}» no es una carpeta.`);
  return real;
}

function projectOf(src, relParts) {
  const depth = Number.isInteger(src.projectDepth) ? src.projectDepth : 0;
  if (depth === 0) return { key: src.id, label: src.label || src.id, root: false };
  // relParts incluye el nombre del archivo: solo es proyecto si hay al menos `depth` carpetas por encima
  if (relParts.length - 1 >= depth) {
    const dirs = relParts.slice(0, depth);
    return { key: `${src.id}/${posix(join(...dirs))}`, label: dirs[dirs.length - 1], root: false };
  }
  return { key: `${src.id}/.`, label: src.label || src.id, root: true };
}

/**
 * @param {object} config   { sources, maxFileBytes, maxFilesPerSource }
 * @param {object[]} lexicon
 * @param {object} cache    { lexiconDigest, files: {key → entry} } (se devuelve uno nuevo)
 * @param {string} lexiconDigest
 */
export function scanSources(config, lexicon, cache, lexiconDigest) {
  const maxBytes = config.maxFileBytes || 2 * 1024 * 1024;
  const maxFiles = config.maxFilesPerSource || 8000;
  const reuse = cache && cache.lexiconDigest === lexiconDigest ? cache.files : {};
  const nextCache = { lexiconDigest, files: {} };
  const files = [];
  const projects = new Map();
  const coverage = { sources: [], byExt: {}, unsupported: {}, tooLarge: 0, unreadable: 0, processed: 0, reused: 0, changed: 0 };

  for (const src of config.sources) {
    const root = assertSafeSource(src);
    const exclude = new Set([...(src.exclude || []), ...DEFAULT_EXCLUDE]);
    const kind = src.kind || 'proyectos';
    const cov = { id: src.id, label: src.label || src.id, kind, files: 0, supported: 0, ignored: 0 };
    coverage.sources.push(cov);
    let count = 0;

    const touchProject = (pj) => {
      if (!projects.has(pj.key)) projects.set(pj.key, { key: pj.key, label: pj.label, source: src.id, root: pj.root, artifacts: new Set(), readme: null });
      return projects.get(pj.key);
    };

    const walk = (dir) => {
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { coverage.unreadable++; return; }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const e of entries) {
        if (e.isSymbolicLink()) continue;
        const abs = join(dir, e.name);
        const rel = relative(root, abs);
        const parts = rel.split(sep);
        if (e.isDirectory()) {
          if (e.name === '.git') { touchProject(projectOf(src, parts.slice(0, -1).concat('x'))).artifacts.add('git-repo'); continue; }
          if (exclude.has(e.name)) continue;
          if (e.name.startsWith('.') && e.name !== '.github') continue;
          walk(abs);
          continue;
        }
        if (!e.isFile()) continue;
        if (++count > maxFiles) { coverage.tooLarge++; continue; }
        cov.files++;
        const ext = (basename(e.name).toLowerCase() === '.gitignore') ? 'gitignore' : extname(e.name).slice(1).toLowerCase();
        const isWorkflow = parts[0] === '.github' && parts[1] === 'workflows' && (ext === 'yml' || ext === 'yaml');
        if (!SUPPORTED.has(ext)) {
          cov.ignored++;
          if (KNOWN_UNSUPPORTED.has(ext)) coverage.unsupported[ext] = (coverage.unsupported[ext] || 0) + 1;
          continue;
        }
        cov.supported++;
        coverage.byExt[ext] = (coverage.byExt[ext] || 0) + 1;
        let st;
        try { st = statSync(abs); } catch { coverage.unreadable++; continue; }
        if (st.size > maxBytes && ext !== 'pbix' && ext !== 'docx') { coverage.tooLarge++; continue; }
        if (st.size > 200 * 1024 * 1024) { coverage.tooLarge++; continue; }

        const key = `${src.id}::${posix(rel)}`;
        const prev = reuse[key];
        let entry;
        if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) {
          entry = prev; coverage.reused++;
        } else {
          let buf;
          try { buf = readFileSync(abs); } catch { coverage.unreadable++; continue; }
          const digest = sha(buf);
          if (prev && prev.sha === digest) {
            entry = { ...prev, mtimeMs: st.mtimeMs }; coverage.reused++;
          } else {
            const r = extractFile(abs, buf, { declarative: kind === 'declarativo' });
            let segments = r.segments, artifacts = r.artifacts;
            if (kind === 'manual') segments = segments.map((s) => ({ ...s, cls: s.cls === 'practica' ? 'explicativa' : s.cls }));
            if (isWorkflow) artifacts = artifacts.concat('workflow');
            if (/^readme(\.|$)/i.test(basename(e.name))) artifacts = artifacts.concat('readme');
            let hits = detect(lexicon, segments, kind === 'manual' ? [] : artifacts);
            if (kind === 'manual') {
              // los artefactos de un manual (p. ej. un pbix de ejemplo) son material de estudio, no práctica propia
              const weak = detect(lexicon, [], artifacts);
              for (const [id, h] of Object.entries(weak)) { const o = (hits[id] ||= { practica: 0, explicativa: 0, declarativa: 0 }); if (h.practica || h.explicativa) o.explicativa = 1; }
            }
            entry = { size: st.size, mtimeMs: st.mtimeMs, sha: digest, ext, hits, artifacts, note: r.note || null, readme: /^readme\.md$/i.test(basename(e.name)) ? readmeMeta(buf.toString('utf8')) : null };
            coverage.changed++;
          }
        }
        nextCache.files[key] = entry;
        coverage.processed++;
        const pj = touchProject(projectOf(src, parts));
        for (const a of entry.artifacts) pj.artifacts.add(a);
        files.push({ source: src.id, kind, rel: posix(rel), project: pj.key, ext, hits: entry.hits, artifacts: entry.artifacts, note: entry.note });
        // el README más cercano a la raíz del proyecto le da título y descripción
        if (entry.readme && (!pj.readme || rel.split(sep).length < pj.readme.depth)) { const p = projects.get(pj.key); if (p) p.readme = { ...entry.readme, depth: rel.split(sep).length }; }
      }
    };
    walk(root);
  }
  // un repositorio Git (carpeta .git) es un artefacto del proyecto, no de un archivo concreto
  for (const pj of projects.values()) {
    if (!pj.artifacts.has('git-repo')) continue;
    files.push({ source: pj.source, kind: 'proyectos', rel: '.git', project: pj.key, ext: 'git', hits: detect(lexicon, [], ['git-repo']), artifacts: ['git-repo'], note: null });
  }
  return { files, projects, coverage, cache: nextCache };
}
