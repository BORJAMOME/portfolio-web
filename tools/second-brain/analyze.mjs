#!/usr/bin/env node
/* ═══════════════════════════════════════════════
   tools/second-brain/analyze.mjs: motor de análisis de Second Brain
   ─────────────────────────────────────────────────
     node tools/second-brain/analyze.mjs                    → analiza las fuentes de .second-brain/config.json
     node tools/second-brain/analyze.mjs --publish          → además lo sube a Supabase (ver publish.mjs)
     node tools/second-brain/analyze.mjs --full             → ignora la caché y relee todo
     node tools/second-brain/analyze.mjs --demo             → regenera second-brain/demo-snapshot.json (datos FICTICIOS)
     node tools/second-brain/analyze.mjs --config ruta.json --out ruta.json

   Corre en TU equipo, nunca en el navegador. Solo lee las carpetas que declares en la
   configuración. No usa red salvo con --publish, y entonces solo habla con tu Supabase.
   Si el análisis falla o el resultado no valida, el último snapshot válido no se toca.
   Sin dependencias: solo Node.
   ═══════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileLexicon } from './lexicon.mjs';
import { scanSources } from './scan.mjs';
import { buildSnapshot, ENGINE_VERSION } from './model.mjs';
import { mergeIdentities } from './identity.mjs';
import { validateSnapshot } from '../../second-brain/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

export function loadFramework(path = join(HERE, 'framework.json')) {
  const raw = readFileSync(path, 'utf8');
  // el digest incluye la versión del motor: si cambia la extracción, la caché se descarta
  return { framework: JSON.parse(raw), digest: createHash('sha256').update(raw + ENGINE_VERSION).digest('hex').slice(0, 16) };
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
function writeJsonAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data));
  renameSync(tmp, path);
}

/**
 * Ejecuta un análisis completo y devuelve { ok, snapshot?, errors?, run }.
 * No escribe snapshots inválidos y nunca borra el último válido.
 */
export function runAnalysis({ configPath, full = false, now = new Date(), mode = 'real', stateDir }) {
  const startedAt = new Date();
  const run = { startedAt: startedAt.toISOString(), finishedAt: null, status: 'error', message: null, mode };
  try {
    const config = readJson(configPath, null);
    if (!config || !Array.isArray(config.sources) || !config.sources.length) throw new Error(`Configuración no válida o sin fuentes: ${configPath}`);
    const base = dirname(configPath);
    config.sources = config.sources.map((s) => ({ ...s, path: isAbsolute(s.path) ? s.path : resolve(base, s.path) }));
    const { framework, digest } = loadFramework();
    const lexicon = compileLexicon(framework);
    const cachePath = join(stateDir, 'cache.json');
    const cache = full ? null : readJson(cachePath, null);
    const scan = scanSources(config, lexicon, cache, digest);
    scan.identity = mergeIdentities(scan);       // un proyecto, una entidad, con todas sus fuentes
    const snapshot = buildSnapshot({ framework, scan, config, now, mode });
    const v = validateSnapshot(snapshot);
    if (!v.ok) {
      run.message = `El snapshot no valida (${v.errors.length} error/es): ${v.errors.slice(0, 3).join(' · ')}`;
      return { ok: false, errors: v.errors, run: finish(run) };
    }
    run.status = 'ok';
    run.stats = { ...snapshot.stats, files: scan.coverage.processed, reused: scan.coverage.reused, changed: scan.coverage.changed };
    return { ok: true, snapshot, cache: scan.cache, warnings: v.warnings, run: finish(run) };
  } catch (e) {
    run.message = String(e && e.message ? e.message : e).slice(0, 400);   // sin contenido de archivos
    return { ok: false, errors: [run.message], run: finish(run) };
  }
}
const finish = (run) => { run.finishedAt = new Date().toISOString(); return run; };

/* ── CLI ── */
async function main() {
  const argv = process.argv.slice(2);
  const flag = (n) => argv.includes(n);
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const demo = flag('--demo');
  const stateDir = join(ROOT, '.second-brain');
  const configPath = resolve(opt('--config') || (demo ? join(HERE, 'fixtures', 'demo', 'config.json') : join(stateDir, 'config.json')));

  if (!existsSync(configPath)) {
    console.error(`No encuentro la configuración: ${configPath}\nCopia tools/second-brain/config.example.json a .second-brain/config.json y declara tus carpetas.`);
    process.exit(2);
  }
  const demoCfg = demo ? readJson(configPath, {}) : {};
  const now = demo && demoCfg.fixedNow ? new Date(demoCfg.fixedNow) : new Date();
  const res = runAnalysis({
    configPath, full: flag('--full') || demo, now, mode: demo ? 'demo' : 'real',
    stateDir: demo ? join(HERE, 'fixtures', 'demo', '.state') : stateDir,
  });

  if (!res.ok) {
    console.error(`✗ Análisis fallido: ${res.run.message}`);
    console.error('  El último snapshot válido se conserva sin cambios.');
    if (!demo) writeJsonAtomic(join(stateDir, 'last-run.json'), res.run);
    if (flag('--publish')) await publishRun(res.run, null);
    process.exit(1);
  }

  const out = resolve(opt('--out') || (demo ? join(ROOT, 'second-brain', 'demo-snapshot.json') : join(stateDir, 'last-valid-snapshot.json')));
  if (!flag('--dry')) {
    // los datos de demostración van pretty-printed para que el diff del repositorio sea legible
    if (demo) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(res.snapshot, null, 1) + '\n'); }
    else { writeJsonAtomic(out, res.snapshot); writeJsonAtomic(join(stateDir, 'cache.json'), res.cache); writeJsonAtomic(join(stateDir, 'last-run.json'), res.run); }
  }
  const s = res.snapshot.stats, c = res.snapshot.coverage;
  console.log(`✓ ${demo ? 'Demo' : 'Análisis'} (motor ${ENGINE_VERSION}): ${s.nodes} nodos · ${s.edges} relaciones · ${s.recommendations} recomendaciones (${s.priorities} prioritarias)`);
  console.log(`  ${c.incremental.changed} archivo(s) procesados · ${c.incremental.reused} reutilizados de la caché`);
  console.log(`  → ${flag('--dry') ? '(--dry: no se ha escrito nada)' : out}`);
  if (flag('--publish') && !demo) await publishRun(res.run, res.snapshot);
}

async function publishRun(run, snapshot) {
  const { publish } = await import('./publish.mjs');
  try {
    const r = await publish({ snapshot, run });
    console.log(`✓ Publicado en Supabase${r.snapshotId ? ` (snapshot ${r.snapshotId})` : ' (solo el registro del intento fallido)'}.`);
  } catch (e) {
    console.error(`✗ No se ha podido publicar: ${e.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
