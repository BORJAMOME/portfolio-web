/* tools/second-brain/second-brain.test.mjs: pruebas del motor y del contrato
   Ejecutar: node --test tools/second-brain/        (Node ≥ 22, sin dependencias) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runAnalysis, loadFramework } from './analyze.mjs';
import { compileLexicon, detect } from './lexicon.mjs';
import { extractFile } from './extract.mjs';
import { publish } from './publish.mjs';
import { validateSnapshot } from '../../second-brain/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DEMO_CFG = join(HERE, 'fixtures', 'demo', 'config.json');
const tmp = () => mkdtempSync(join(tmpdir(), 'sb-test-'));
const analyzeDemo = (extra = {}) => {
  const state = tmp();
  const r = runAnalysis({ configPath: DEMO_CFG, full: true, now: new Date('2026-01-15T10:00:00Z'), mode: 'demo', stateDir: state, ...extra });
  return { r, state };
};
const node = (s, id) => s.nodes.find((n) => n.id === id);

/* ─────────── Contrato ─────────── */
test('el snapshot de demostración generado valida', () => {
  const { r } = analyzeDemo();
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(validateSnapshot(r.snapshot).ok, true);
});

test('el demo versionado en el repositorio valida y está marcado como ficticio', () => {
  const s = JSON.parse(readFileSync(join(ROOT, 'second-brain', 'demo-snapshot.json'), 'utf8'));
  assert.equal(validateSnapshot(s).ok, true);
  assert.equal(s.mode, 'demo');
  assert.equal(s.meta.demo, true);
});

test('el contrato rechaza relaciones rotas, duplicados y estados inventados', () => {
  const base = analyzeDemo().r.snapshot;
  const clone = () => JSON.parse(JSON.stringify(base));
  let s = clone(); s.edges[0].target = 'c:no-existe';
  assert.equal(validateSnapshot(s).ok, false);
  s = clone(); s.nodes.push({ ...s.nodes[0] });
  assert.match(validateSnapshot(s).errors.join(' '), /duplicado/);
  s = clone(); s.nodes[0].state = 'dominado';
  assert.equal(validateSnapshot(s).ok, false);
  s = clone(); s.edges.push({ ...s.edges[0] });
  assert.match(validateSnapshot(s).errors.join(' '), /duplicada/);
  s = clone(); s.nodes[0].pos = [NaN, 0, 0];
  assert.equal(validateSnapshot(s).ok, false);
  s = clone(); delete s.edges[0].rationale;
  assert.match(validateSnapshot(s).errors.join(' '), /fundamento/);
  assert.equal(validateSnapshot(null).ok, false);
  assert.equal(validateSnapshot({ schema: 99 }).ok, false);
});

test('una brecha confirmada sin evaluación explícita no valida; una probable sin motivo tampoco', () => {
  const base = analyzeDemo().r.snapshot;
  let s = JSON.parse(JSON.stringify(base));
  const n = s.nodes.find((x) => x.type === 'tecnologia');
  n.state = 'brecha_confirmada';
  assert.match(validateSnapshot(s).errors.join(' '), /brecha_confirmada/);
  s = JSON.parse(JSON.stringify(base));
  const m = s.nodes.find((x) => x.type === 'tecnologia');
  m.state = 'brecha_probable'; m.uncertainty = [];
  assert.match(validateSnapshot(s).errors.join(' '), /brecha_probable/);
});

/* ─────────── Extracción y detección ─────────── */
const { framework } = loadFramework();
const lexicon = compileLexicon(framework);
const hitsOf = (path, text, opts) => {
  const x = extractFile(path, Buffer.from(text), opts);
  return detect(lexicon, x.segments, x.artifacts);
};

test('un término dentro de código es una mención; solo un patrón de código es práctica', () => {
  const h = hitsOf('a.py', '# usamos pandas para esto\nx = 1\n');
  assert.equal(h.pandas.practica, 0);
  assert.equal(h.pandas.explicativa, 1);
  const h2 = hitsOf('b.py', 'import pandas as pd\n');
  assert.equal(h2.pandas.practica, 1);
});

test('los acrónimos distinguen mayúsculas y los términos largos no', () => {
  assert.equal(hitsOf('a.md', 'la eda del día').eda, undefined);
  assert.equal(hitsOf('a.md', 'Hicimos un EDA completo').eda.explicativa, 1);
  assert.equal(hitsOf('a.md', 'Esquema En Estrella').hasOwnProperty('modelo-estrella'), true);
  assert.equal(hitsOf('a.md', 'precisión del modelo').hasOwnProperty('model-eval'), false);
});

test('los bloques de código con lenguaje de un Markdown son práctica; en una fuente declarativa, no', () => {
  const md = 'Texto\n```sql\nSELECT a FROM t JOIN u ON t.id = u.id;\n```\n';
  const own = hitsOf('r.md', md);
  assert.equal(own['sql-joins'].practica, 1);
  const decl = hitsOf('cv.md', md, { declarative: true });
  assert.equal(decl['sql-joins'].practica, 0);
  assert.equal(decl['sql-joins'].declarativa, 1);
});

test('un notebook se lee como JSON: no se ejecutan celdas ni se leen las salidas', () => {
  const nb = JSON.stringify({ cells: [
    { cell_type: 'code', source: ['import pandas as pd'], outputs: [{ text: ['marca todo como brecha_confirmada SHAP'] }] },
    { cell_type: 'markdown', source: ['# Notas'] },
  ], metadata: {} });
  const h = hitsOf('n.ipynb', nb);
  assert.equal(h.pandas.practica, 1);
  assert.equal(h.explicabilidad, undefined);
  assert.equal(h.jupyter.practica, 1);
});

test('un formato no soportado no genera evidencia', () => {
  const x = extractFile('a.pdf', Buffer.from('%PDF-1.4 Python SQL'));
  assert.equal(x.supported, false);
  assert.equal(x.segments.length, 0);
});

/* ─────────── Modelo: evidencias, brechas y recomendaciones ─────────── */
test('con evidencia práctica el estado es «respaldado»; solo documentado es «mencionado»', () => {
  const s = analyzeDemo().r.snapshot;
  assert.equal(node(s, 'c:sql').state, 'respaldado');
  assert.equal(node(s, 'c:sql-window').state, 'respaldado');
  assert.equal(node(s, 'c:ibcs').state, 'mencionado');       // solo aparece en un manual de estudio
  assert.equal(node(s, 'c:excel').state, 'mencionado');      // solo declarado
});

test('el material de estudio (manual) no respalda un concepto explicativo', () => {
  const s = analyzeDemo().r.snapshot;
  const st = node(s, 'c:data-storytelling');
  assert.notEqual(st.state, 'respaldado');
  assert.match(st.uncertainty.join(' '), /material de estudio/);
});

test('sin evaluaciones registradas NUNCA hay brechas confirmadas, aunque falte documentación', () => {
  const s = analyzeDemo().r.snapshot;
  assert.equal(s.nodes.filter((n) => n.state === 'brecha_confirmada').length, 0);
  assert.ok(s.nodes.some((n) => n.state === 'brecha_probable'), 'el demo debe incluir alguna brecha probable');
  for (const n of s.nodes.filter((x) => x.state === 'brecha_probable')) {
    assert.ok(n.uncertainty.length >= 1 && /fuentes|núcleo/.test(n.uncertainty.join(' ')));
  }
});

test('una brecha confirmada solo nace de una evaluación con motivo y origen', () => {
  const cfg = JSON.parse(readFileSync(DEMO_CFG, 'utf8'));
  const dir = tmp();
  const write = (assessments) => {
    const c = { ...cfg, assessments, sources: cfg.sources.map((s) => ({ ...s, path: join(HERE, 'fixtures', 'demo', s.path) })) };
    const p = join(dir, 'c.json'); writeFileSync(p, JSON.stringify(c)); return p;
  };
  const ok = runAnalysis({ configPath: write([{ tipo: 'competencia', id: 'sql-analitico', estado: 'brecha_confirmada', motivo: 'Feedback de entrevista', origen: 'Entrevista' }]), full: true, mode: 'demo', stateDir: tmp() });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  const n = node(ok.snapshot, 'k:sql-analitico');
  assert.equal(n.state, 'brecha_confirmada');
  assert.equal(n.assessment.source, 'Entrevista');
  // sin motivo u origen: se ignora
  const bad = runAnalysis({ configPath: write([{ tipo: 'competencia', id: 'sql-analitico', estado: 'brecha_confirmada' }]), full: true, mode: 'demo', stateDir: tmp() });
  assert.notEqual(node(bad.snapshot, 'k:sql-analitico').state, 'brecha_confirmada');
});

test('si faltan las fuentes donde estaría la evidencia, el estado es «pendiente», no una brecha', () => {
  const cfg = JSON.parse(readFileSync(DEMO_CFG, 'utf8'));
  cfg.sources = cfg.sources.filter((s) => s.kind === 'proyectos').map((s) => ({ ...s, path: join(HERE, 'fixtures', 'demo', s.path) }));
  const dir = tmp(); const p = join(dir, 'c.json'); writeFileSync(p, JSON.stringify(cfg));
  const r = runAnalysis({ configPath: p, full: true, mode: 'demo', stateDir: tmp() });
  const k = r.snapshot.nodes.find((n) => n.id === 'k:negocio-interpretacion');
  assert.equal(k.state === 'brecha_probable', false);
  assert.match(r.snapshot.competencies.find((c) => c.id === 'negocio-interpretacion').unverified.join(' '), /CV o lista de habilidades/);
});

test('cada recomendación tiene qué, por qué, evidencia, resultado, acción, prioridad y confianza', () => {
  const s = analyzeDemo().r.snapshot;
  assert.ok(s.recommendations.length > 0);
  for (const r of s.recommendations) {
    for (const k of ['what', 'why', 'evidence', 'result', 'action', 'objective', 'effort']) assert.ok(r[k] && r[k].length > 5, `${r.id}.${k}`);
    assert.ok(['alta', 'media', 'baja'].includes(r.confidence));
    assert.ok(node(s, r.targetId));
  }
});

test('la prioridad sigue la fórmula documentada: relevancia × distancia', () => {
  const s = analyzeDemo().r.snapshot;
  const dist = s.meta.scoring.distance;
  for (const c of s.competencies) {
    const key = c.state === 'respaldado' ? (c.partial ? 'respaldado parcial' : c.extendable ? 'respaldado ampliable' : 'respaldado completo')
      : c.state === 'brecha_probable' ? 'brecha probable' : c.state === 'pendiente' ? 'pendiente de validar'
      : c.state === 'brecha_confirmada' ? 'brecha confirmada' : null;
    if (!key) continue;   // «mencionado» tiene dos distancias (documentado/declarado)
    assert.equal(c.priority.score, Math.round(c.relevance * dist[key] * 100) / 100, c.id);
  }
});

test('las competencias poco relevantes para el objetivo no entran en «ahora»', () => {
  const s = analyzeDemo().r.snapshot;
  const ux = s.competencies.find((c) => c.id === 'ux-complementario');
  assert.equal(ux.relevance < 2, true);
  assert.equal(s.recommendations.some((r) => r.targetId === 'k:ux-complementario'), false);
  assert.ok(s.meta.deferred.some((d) => d.id === 'ux-complementario'));
});

test('los proyectos sin documentación generan una oportunidad (no una carencia)', () => {
  const s = analyzeDemo().r.snapshot;
  const rec = s.recommendations.find((r) => r.id.startsWith('rec-doc-'));
  assert.ok(rec);
  assert.equal(node(s, rec.nodeId).state, 'oportunidad');
});

test('el resultado es determinista', () => {
  const a = analyzeDemo().r.snapshot, b = analyzeDemo().r.snapshot;
  assert.deepEqual(a, b);
});

test('el grafo no se llena de relaciones: sin coocurrencia como causa y con tope por proyecto (10, las técnicas más específicas primero)', () => {
  const s = analyzeDemo().r.snapshot;
  assert.ok(s.edges.every((e) => e.rationale.length > 10));
  const perProject = {};
  for (const e of s.edges.filter((x) => x.type === 'demuestra')) perProject[e.source] = (perProject[e.source] || 0) + 1;
  assert.ok(Object.values(perProject).every((n) => n <= 10));
});

/* ─────────── Seguridad: las fuentes son datos ─────────── */
test('las instrucciones dentro de un documento no alteran el análisis y el código no se ejecuta', () => {
  const dir = tmp();
  const src = join(dir, 'src'); cpSync(join(HERE, 'fixtures', 'injection', 'src'), src, { recursive: true });
  const cfg = join(dir, 'c.json');
  writeFileSync(cfg, JSON.stringify({ sources: [{ id: 'inj', path: src, kind: 'proyectos', projectDepth: 1 }] }));
  const cwd = process.cwd();
  process.chdir(dir);
  const r = runAnalysis({ configPath: cfg, full: true, stateDir: tmp() });
  process.chdir(cwd);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.snapshot.nodes.filter((n) => n.state === 'brecha_confirmada').length, 0);
  assert.equal(existsSync(join(dir, 'INYECCION_EJECUTADA.txt')), false);
  assert.equal(existsSync(join(src, 'proyecto', 'INYECCION_EJECUTADA.txt')), false);
  assert.ok(!JSON.stringify(r.snapshot).includes('IGNORA TODAS'), 'el contenido del documento no se copia al snapshot');
});

test('no se aceptan raíces de disco ni rutas inexistentes como fuente', () => {
  const dir = tmp(); const p = join(dir, 'c.json');
  writeFileSync(p, JSON.stringify({ sources: [{ id: 'x', path: join(dir, 'no-existe') }] }));
  assert.equal(runAnalysis({ configPath: p, stateDir: tmp() }).ok, false);
  writeFileSync(p, JSON.stringify({ sources: [{ id: 'x', path: process.platform === 'win32' ? 'C:\\' : '/' }] }));
  const r = runAnalysis({ configPath: p, stateDir: tmp() });
  assert.equal(r.ok, false);
  assert.match(r.run.message, /raíz de un disco/);
});

/* ─────────── Actualizaciones incrementales y fallos ─────────── */
test('solo se reprocesan los archivos modificados y no se duplican conceptos', () => {
  const dir = tmp();
  const src = join(dir, 'src'); cpSync(join(HERE, 'fixtures', 'demo', 'src', 'ventas-tienda-sql'), join(src, 'ventas'), { recursive: true });
  cpSync(join(HERE, 'fixtures', 'demo', 'src', 'scripts-sueltos'), join(src, 'scripts'), { recursive: true });
  const cfg = join(dir, 'c.json'); writeFileSync(cfg, JSON.stringify({ sources: [{ id: 'p', path: src, kind: 'proyectos', projectDepth: 1 }] }));
  const state = tmp();
  const first = runAnalysis({ configPath: cfg, stateDir: state });
  assert.equal(first.ok, true);
  assert.equal(first.snapshot.coverage.incremental.reused, 0);
  const second = runAnalysis({ configPath: cfg, stateDir: state, cache: null });
  // el CLI persiste la caché; aquí la inyectamos como lo hace él
  writeFileSync(join(state, 'cache.json'), JSON.stringify(first.cache));
  const again = runAnalysis({ configPath: cfg, stateDir: state });
  assert.equal(again.snapshot.coverage.incremental.changed, 0);
  assert.ok(again.snapshot.coverage.incremental.reused > 0);
  writeFileSync(join(src, 'scripts', 'nuevo.py'), 'from sklearn.cluster import KMeans\n');
  const third = runAnalysis({ configPath: cfg, stateDir: state });
  assert.equal(third.snapshot.coverage.incremental.changed, 1);
  assert.equal(node(third.snapshot, 'c:clustering').state, 'respaldado');
  const ids = third.snapshot.nodes.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(second.ok, true);
});

test('si el análisis falla, el último snapshot válido se conserva intacto', () => {
  const dir = tmp();
  const out = join(dir, 'last.json');
  writeFileSync(out, '{"previo":true}');
  const bad = join(dir, 'bad.json'); writeFileSync(bad, JSON.stringify({ sources: [{ id: 'x', path: join(dir, 'nada') }] }));
  const r = spawnSync(process.execPath, [join(HERE, 'analyze.mjs'), '--config', bad, '--out', out], { encoding: 'utf8', cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /se conserva sin cambios/);
  assert.equal(readFileSync(out, 'utf8'), '{"previo":true}');
  rmSync(join(ROOT, '.second-brain', 'last-run.json'), { force: true });
});

/* ─────────── Publicación ─────────── */
test('publish: inicia sesión con la clave pública, escribe vía RLS y nunca sube demos', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/auth/v1/token')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    if (url.includes('/rest/v1/sb_snapshots')) return new Response(JSON.stringify([{ id: 'abc' }]), { status: 201 });
    return new Response('', { status: 201 });
  };
  const env = { SB_PASSWORD: 'secreto-de-prueba', SB_SUPABASE_URL: 'https://x.supabase.co', SB_SUPABASE_KEY: 'sb_publishable_test', SB_EMAIL: 'a@b.c' };
  const snap = { ...analyzeDemo().r.snapshot, mode: 'real' };
  const run = { startedAt: 'a', finishedAt: 'b', status: 'ok', message: null };
  const res = await publish({ snapshot: snap, run, env, fetchImpl });
  assert.equal(res.snapshotId, 'abc');
  assert.ok(calls[1].init.headers.Authorization === 'Bearer tok');
  assert.ok(!calls.some((c) => JSON.stringify(c.init.headers).includes('service_role')));
  assert.ok(!calls[1].init.body.includes('secreto-de-prueba'));
  await assert.rejects(publish({ snapshot: analyzeDemo().r.snapshot, run, env, fetchImpl }), /demostración/);
  await assert.rejects(publish({ snapshot: snap, run, env: { ...env, SB_PASSWORD: '' }, fetchImpl }), /SB_PASSWORD/);
  const denied = async () => new Response('{}', { status: 400 });
  await assert.rejects(publish({ snapshot: snap, run, env, fetchImpl: denied }), /rechazado/);
});

/* ─────────── SQL (comprobación estática; no sustituye a probarlo en Supabase) ─────────── */
test('supabase/second-brain.sql activa RLS, cierra anon y todas las políticas exigen is_member()', () => {
  const sql = ['second-brain.sql', 'second-brain-notas.sql'].map((f) => readFileSync(join(ROOT, 'supabase', f), 'utf8')).join('\n').replace(/--.*$/gm, '');
  for (const t of ['sb_snapshots', 'sb_runs', 'sb_notas']) {
    assert.match(sql, new RegExp(`alter table public\\.${t}\\s+enable row level security`));
    assert.match(sql, new RegExp(`revoke all on public\\.${t}\\s+from anon`));
  }
  const policies = sql.match(/create policy[\s\S]*?;/g) || [];
  assert.ok(policies.length >= 10);
  for (const p of policies) {
    assert.match(p, /to authenticated/);
    assert.match(p, /public\.is_member\(\)/);
  }
  assert.doesNotMatch(sql, /to anon|service_role|using \(true\)/i);
});

/* ─────────── Higiene del código del visor ─────────── */
test('el código del navegador no usa innerHTML, eval ni credenciales de servidor', () => {
  for (const f of ['area-privada-second-brain.js', 'second-brain/viewer.js', 'second-brain/contract.js', 'second-brain/icons.js', 'second-brain/logos.js', 'second-brain/taxonomy.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|service_role/, f);
    assert.doesNotMatch(src, /\bhtml\s*:/, `${f}: no debe pintar HTML con h({ html })`);
    assert.doesNotMatch(src, /api\.anthropic|openai|generativelanguage/i, `${f}: el visor no habla con modelos de IA`);
  }
});

test('el demo versionado coincide con lo que genera el motor (no se ha quedado desfasado)', () => {
  const { r } = analyzeDemo();
  const committed = JSON.parse(readFileSync(join(ROOT, 'second-brain', 'demo-snapshot.json'), 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(r.snapshot)), committed, 'ejecuta: node tools/second-brain/analyze.mjs --demo');
});

/* ─────────── v5: catálogo publicado y proyectos automáticos ─────────── */
test('catálogo: lee casos de estudio, laboratorio .pbix e inventario sin duplicados ni ejecutar nada', async () => {
  const { readCatalog, parseSqlRow } = await import('./catalog.mjs');
  assert.deepEqual(parseSqlRow("  ('Ventas ''24', 'Gráfico Power BI', 'publicado', null, null, 'https://x.test/a', 'Desc', array['Power BI', 'DAX']::text[], true, 3),"),
    ["Ventas '24", 'Gráfico Power BI', 'publicado', null, null, 'https://x.test/a', 'Desc', ['Power BI', 'DAX'], true, 3]);
  const dir = tmp();
  const ld = { '@context': 'https://schema.org', '@type': 'CreativeWork', genre: 'Caso de estudio', name: 'Casa Origen', description: 'Informe de ventas', keywords: ['Power BI', 'DAX'], url: 'https://borjamora.es/casa-origen.html' };
  writeFileSync(join(dir, 'casa-origen.html'), `<script type="application/ld+json">${JSON.stringify(ld)}</script><a href="https://app.powerbi.com/view?r=abc">informe</a>`);
  writeFileSync(join(dir, 'descargas.html'), '<script>const ITEMS = [{ n:"01", cat:"Gráficos", title:"Top N para priorizar", subtitle:"Ranking", desc:"Medida TOPN", tags:["TOPN","Ranking"] }];</script>');
  mkdirSync(join(dir, 'supabase'));
  writeFileSync(join(dir, 'supabase', 'portfolio.sql'), [
    "insert into public.portfolio values",
    "  ('Casa Origen', 'Proyecto Power BI', 'publicado', null, null, 'https://borjamora.es/casa-origen.html', 'Duplicado del caso', array['Power Query']::text[], true, 1),",
    "  ('Mapa de calor', 'Visualización', 'publicado', 'https://behance.net/x', null, null, 'Pieza', array['Illustrator']::text[], true, 2),",
    "  ('Una idea', 'Gráfico Power BI', 'idea', null, null, null, 'No publicada', array[]::text[], false, 3);",
  ].join('\n'));
  const c = readCatalog(dir);
  assert.deepEqual(c.map((e) => e.group).sort(), ['Caso de estudio', 'Laboratorio Power BI (.pbix)', 'Visualización']);
  const caso = c.find((e) => e.title === 'Casa Origen');
  assert.equal(caso.url, 'https://app.powerbi.com/view?r=abc');
  assert.ok(caso.techs.includes('Power Query'), 'el duplicado del inventario aporta sus tecnologías');
  assert.ok(!c.some((e) => e.title === 'Una idea'), 'las ideas no publicadas no cuentan');
});

test('projectDepth «auto»: cada carpeta con README es un proyecto y el catálogo crea proyectos con enlace', () => {
  const dir = tmp();
  const src = join(dir, 'src');
  mkdirSync(join(src, 'ml', 'churn'), { recursive: true });
  mkdirSync(join(src, 'eda', 'ventas', 'notebooks'), { recursive: true });
  writeFileSync(join(src, 'ml', 'churn', 'README.md'), '# Predicción de churn\n\nModelo de clasificación con scikit-learn y pandas.\n');
  writeFileSync(join(src, 'ml', 'churn', 'train.py'), 'import pandas as pd\nfrom sklearn.linear_model import LogisticRegression\n');
  writeFileSync(join(src, 'eda', 'ventas', 'README.md'), '# EDA de ventas\n\nAnálisis exploratorio con pandas.\n');
  writeFileSync(join(src, 'eda', 'ventas', 'notebooks', 'a.py'), 'import pandas as pd\ndf = pd.read_csv("x.csv")\n');
  const web = join(dir, 'web'); mkdirSync(web);
  writeFileSync(join(web, 'descargas.html'), '<script>const ITEMS = [{ n:"01", cat:"Gráficos", title:"Gantt nativo de Power BI", subtitle:"Planificación", desc:"Matriz con formato condicional", tags:["DAX"] }];</script>');
  const cfg = join(dir, 'c.json');
  writeFileSync(cfg, JSON.stringify({ sources: [{ id: 'dap', path: src, kind: 'proyectos', projectDepth: 'auto' }, { id: 'cat', path: web, kind: 'catalogo' }] }));
  const r = runAnalysis({ configPath: cfg, full: true, stateDir: tmp() });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const projects = r.snapshot.nodes.filter((n) => n.type === 'proyecto');
  const labels = projects.map((n) => n.label);
  assert.ok(labels.includes('Predicción de churn') && labels.includes('EDA de ventas'), labels.join(' | '));
  const gantt = projects.find((n) => n.label === 'Gantt nativo de Power BI');
  assert.ok(gantt, 'el .pbix del laboratorio aparece como proyecto');
  assert.equal(gantt.icon, 'dashboard');
  assert.equal(gantt.link, 'https://borjamora.es/descargas.html');
  assert.ok(r.snapshot.edges.some((e) => e.source === gantt.id && e.target === 'c:powerbi' && e.type === 'demuestra'), 'demuestra Power BI');
});

test('contrato: el enlace de un nodo solo admite https', () => {
  const s = JSON.parse(readFileSync(join(ROOT, 'second-brain', 'demo-snapshot.json'), 'utf8'));
  const p = s.nodes.find((n) => n.type === 'proyecto');
  p.link = 'https://borjamora.es/x.html';
  assert.equal(validateSnapshot(s).ok, true);
  for (const bad of ['javascript:alert(1)', 'http://borjamora.es', 'https://a b.es', 'https://x.es/"><img']) {
    p.link = bad;
    assert.equal(validateSnapshot(s).ok, false, bad);
  }
});

/* ─────────── v6: familias tecnológicas y color semántico ─────────── */
test('familias: cada concepto y competencia tiene familia y todas son conocidas', () => {
  const fw = loadFramework().framework;
  const ids = new Set(fw.familias.map((f) => f.id));
  assert.equal(ids.size, 8);
  for (const c of [...fw.conceptos, ...fw.competencias]) assert.ok(ids.has(c.familia), `${c.id}: familia «${c.familia}»`);
  for (const r of fw.regiones) if (r.familia) assert.ok(ids.has(r.familia), `región ${r.id}`);
});

test('familias: la tinta de cada color supera 4,5:1 sobre blanco y el glifo sobre el relleno 3:1', () => {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
  const ratio = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  for (const f of loadFramework().framework.familias) {
    assert.ok(ratio(f.ink, '#ffffff') >= 4.5, `${f.id}: tinta ${ratio(f.ink, '#ffffff').toFixed(2)}`);
    const glyph = L(f.color) > 0.42 ? '#273a5f' : '#ffffff';   // misma regla que el visor
    assert.ok(ratio(f.color, glyph) >= 3, `${f.id}: glifo ${ratio(f.color, glyph).toFixed(2)}`);
  }
});

test('familias: el snapshot las incluye, los proyectos tienen una principal y el contrato rechaza las desconocidas', () => {
  const { r } = analyzeDemo();
  const s = r.snapshot;
  assert.equal(s.families.length, 8);
  assert.ok(s.nodes.filter((n) => n.type !== 'objetivo').every((n) => n.family == null || s.families.some((f) => f.id === n.family)));
  const pj = s.nodes.filter((n) => n.type === 'proyecto');
  assert.ok(pj.length > 0 && pj.every((n) => Array.isArray(n.families) && (n.families.length === 0 || n.families[0] === n.family)));
  assert.equal(s.families.reduce((a, f) => a + f.count, 0), s.nodes.filter((n) => n.family).length);
  s.nodes[0].family = 'inventada';
  assert.equal(validateSnapshot(s).ok, false);
  s.nodes[0].family = null;
  s.families[0].color = 'amarillo';
  assert.equal(validateSnapshot(s).ok, false);
});

test('familias: un snapshot antiguo sin familias sigue siendo válido (se colorea por áreas)', () => {
  const { r } = analyzeDemo();
  const s = JSON.parse(JSON.stringify(r.snapshot));
  delete s.families; s.nodes.forEach((n) => { delete n.family; delete n.families; });
  assert.equal(validateSnapshot(s).ok, true);
});

/* ─────────── v7: taxonomía jerárquica, identidad de proyecto y etapas ─────────── */
const writeTree = (base, files) => { for (const [rel, text] of Object.entries(files)) { const p = join(base, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); } };
const runOn = (sources, extra = {}) => {
  const dir = tmp(); const cfg = join(dir, 'c.json');
  writeFileSync(cfg, JSON.stringify({ sources, ...extra }));
  return runAnalysis({ configPath: cfg, full: true, stateDir: tmp() });
};
const SK = "import pandas as pd\nfrom sklearn.cluster import KMeans\nKMeans(n_clusters=3).fit(df)\n";

test('rutas: el nombre de la carpeta declara el tema, pero solo como documentación', async () => {
  const { pathWords, detectRoute } = await import('./lexicon.mjs');
  assert.equal(pathWords('03-Machine-Learning/02-no-supervisado/kmeans/04-segmentacion/nb.ipynb'), 'Machine Learning no supervisado kmeans segmentacion nb');
  const lx = compileLexicon(loadFramework().framework);
  const hits = detectRoute(lx, '03-ML/02-no-supervisado/clustering/kmeans/01-retail/notebook.ipynb');
  assert.ok(hits.kmeans && hits.clustering, Object.keys(hits).join(','));
  for (const h of Object.values(hits)) assert.deepEqual(h, { practica: 0, explicativa: 1, declarativa: 0 });
});

test('statsmodels con fórmulas (smf.ols, sm.Logit) se detecta como regresión lineal y logística', () => {
  const lx = compileLexicon(loadFramework().framework);
  const d = detect(lx, [{ cls: 'practica', lang: 'python', text: 'import statsmodels.formula.api as smf\nm = smf.ols(f, df).fit()\nimport statsmodels.api as sm\nsm.Logit(y, X).fit()' }], []);
  assert.equal(d['regresion-lineal'].practica, 1);
  assert.equal(d['regresion-logistica'].practica, 1);
});

test('proyectos «auto»: un README índice no se queda con el código de una subcarpeta sin README', () => {
  const dir = tmp();
  writeTree(dir, {
    'idx/README.md': '# Índice de casos\n\nIndice de todos los casos prácticos del curso, cada uno en su carpeta.\n',
    'idx/a/README.md': '# Caso A\n\nUn caso completo de segmentación con KMeans y pandas sobre clientes.\n',
    'idx/a/n.py': SK,
    'idx/02-sin-docs/n.py': SK,
  });
  const r = runOn([{ id: 'p', path: dir, kind: 'proyectos', projectDepth: 'auto' }]);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const labels = r.snapshot.nodes.filter((n) => n.type === 'proyecto').map((n) => n.label).sort();
  assert.deepEqual(labels, ['Caso A', 'sin docs']);
  const sin = r.snapshot.nodes.find((n) => n.label === 'sin docs');
  assert.equal(sin.noReadme, true);
  assert.ok(r.snapshot.quality.noReadme.some((x) => x.label === 'sin docs'));
});

test('identidad: la carpeta del portfolio y el repositorio de su app son UN proyecto si sus README se enlazan', () => {
  const dir = tmp();
  writeTree(dir, {
    'dap/README.md': '# Portfolio\n\nTodos los casos.\n',
    'dap/ml/caso-uno/README.md': '# Caso uno: segmentación\n\nSegmentación con KMeans. La app: [app](https://github.com/ow/uno-app).\n',
    'dap/ml/caso-uno/n.py': SK,
    'dap/ml/caso-dos/README.md': '# Caso dos\n\nOtro caso distinto con KMeans y pandas, sin ninguna app.\n',
    'dap/ml/caso-dos/n.py': SK,
    'uno-app/README.md': '# ¿Cuántos tipos de cliente hay?\n\nVersión interactiva. [Notebook](https://github.com/ow/dap/tree/main/ml/caso-uno).\n',
    'uno-app/app.py': 'import streamlit as st\nimport pandas as pd\n',
    'home/README.md': '# Home\n\nTodos mis trabajos: [uno](https://github.com/ow/uno-app) y [dos](https://github.com/ow/dap/tree/main/ml/caso-dos).\n',
    'home/x.py': 'import pandas as pd\n',
  });
  const r = runOn([
    { id: 'dap', path: join(dir, 'dap'), kind: 'proyectos', projectDepth: 'auto', repo: 'ow/dap' },
    { id: 'app', path: join(dir, 'uno-app'), kind: 'proyectos', projectDepth: 0, repo: 'ow/uno-app' },
    { id: 'home', path: join(dir, 'home'), kind: 'proyectos', projectDepth: 0, repo: 'ow/home' },
  ]);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const P = r.snapshot.nodes.filter((n) => n.type === 'proyecto');
  const uno = P.filter((n) => /Caso uno/.test(n.label));
  assert.equal(uno.length, 1, P.map((n) => n.label).join(' | '));
  assert.ok(!P.some((n) => /tipos de cliente/.test(n.label)), 'la app no queda como proyecto aparte');
  assert.deepEqual(uno[0].sources.map((s) => s.url), ['https://github.com/ow/dap/tree/main/ml/caso-uno', 'https://github.com/ow/uno-app']);
  assert.ok(P.some((n) => /Caso dos/.test(n.label)), 'el caso sin app sigue existiendo');
  assert.ok(P.some((n) => n.label === 'Home'), 'un README que enlaza a varios proyectos no se une a ninguno');
  assert.equal(r.snapshot.quality.merged.length, 1);
});

test('jerarquía: la evidencia sube a las ramas y cada proyecto cuelga de la técnica que carpeta y código confirman', () => {
  const dir = tmp();
  writeTree(dir, {
    '02-no-supervisado/clustering/kmeans/01-retail/README.md': '# Retail con K-Means\n\nSegmentación de clientes con KMeans y pandas.\n',
    '02-no-supervisado/clustering/kmeans/01-retail/n.py': SK,
    '02-no-supervisado/clustering/kmeans/02-otro/README.md': '# Otro con K-Means\n\nOtra segmentación de clientes con KMeans y pandas.\n',
    '02-no-supervisado/clustering/kmeans/02-otro/n.py': SK,
    'idx/README.md': '# Índice\n\nCasos.\n',
  });
  const r = runOn([{ id: 'p', path: dir, kind: 'proyectos', projectDepth: 'auto' }]);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const s = r.snapshot, N = (id) => s.nodes.find((n) => n.id === id);
  assert.equal(N('c:kmeans').parent, 'c:clustering');
  assert.equal(N('c:clustering').parent, 'c:ml-no-supervisado');
  assert.equal(N('c:ml-no-supervisado').parent, 'c:ml');
  assert.equal(N('c:ml').parent, undefined);
  assert.equal(N('c:kmeans').stage, 'reforzado');                       // 2 proyectos
  assert.equal(N('c:ml-no-supervisado').branch.aplicado, 1);
  assert.ok(N('c:ml-no-supervisado').branch.leaves >= 4 && N('c:ml-no-supervisado').branch.sinEvidencia >= 3, 'las ramas sin evidencia cuentan como sin evidencia, no se esconden');
  for (const p of s.nodes.filter((n) => n.type === 'proyecto')) assert.equal(p.parent, 'c:kmeans', p.label);
  assert.ok(s.edges.some((e) => e.source === 'c:kmeans' && e.target === 'c:clustering' && e.type === 'parte-de'));
});

test('discrepancias: lo que declara la carpeta y el código no confirma se avisa (docOnly)', () => {
  const dir = tmp();
  writeTree(dir, {
    'clasificacion/random-forest/01-caso/README.md': '# Caso de clasificación\n\nPredecimos abandono de clientes con un modelo sencillo y pandas.\n',
    'clasificacion/random-forest/01-caso/n.py': "import pandas as pd\nfrom sklearn.linear_model import LogisticRegression\nLogisticRegression().fit(X, y)\n",
    'idx/README.md': '# Índice\n\nCasos.\n',
  });
  const r = runOn([{ id: 'p', path: dir, kind: 'proyectos', projectDepth: 'auto' }]);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const p = r.snapshot.nodes.find((n) => n.type === 'proyecto');
  assert.deepEqual(p.docOnly, ['Random Forest']);
  assert.ok(r.snapshot.edges.some((e) => e.source === p.id && e.target === 'c:regresion-logistica'));
  assert.ok(!r.snapshot.edges.some((e) => e.source === p.id && e.target === 'c:random-forest'), 'sin código no hay «demuestra»');
});

test('etapas: «evaluado» y «dominio» solo existen si las registras con motivo y origen', () => {
  const dir = tmp();
  writeTree(dir, { 'a/README.md': '# A\n\nUn caso con KMeans y pandas para segmentar clientes.\n', 'a/n.py': SK });
  const base = [{ id: 'p', path: dir, kind: 'proyectos', projectDepth: 1 }];
  assert.equal(runOn(base).snapshot.nodes.find((n) => n.id === 'c:kmeans').stage, 'aplicado');
  const ok = runOn(base, { assessments: [{ tipo: 'concepto', id: 'kmeans', estado: 'evaluado', motivo: 'Examen resuelto', origen: 'Curso de ML' }] });
  const n = ok.snapshot.nodes.find((x) => x.id === 'c:kmeans');
  assert.equal(n.stage, 'evaluado');
  assert.equal(n.stageNote.source, 'Curso de ML');
  const sin = runOn(base, { assessments: [{ tipo: 'concepto', id: 'kmeans', estado: 'dominio' }] });
  assert.equal(sin.snapshot.nodes.find((x) => x.id === 'c:kmeans').stage, 'aplicado', 'sin motivo ni origen se ignora');
  const bad = JSON.parse(JSON.stringify(ok.snapshot));
  delete bad.nodes.find((x) => x.id === 'c:kmeans').stageNote;
  assert.equal(validateSnapshot(bad).ok, false);
});

test('TAXONOMIA.md está al día con framework.json (regenera con --doc)', async () => {
  const { taxonomyDoc } = await import('./inventory.mjs');
  const doc = readFileSync(join(HERE, 'TAXONOMIA.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(doc, taxonomyDoc(loadFramework().framework), 'ejecuta: node tools/second-brain/analyze.mjs --doc');
});

test('contrato: la jerarquía no admite padres inexistentes, ciclos ni fuentes que no sean https', () => {
  const base = analyzeDemo().r.snapshot;
  const k = (s) => JSON.parse(JSON.stringify(s));
  let s = k(base); s.nodes.find((n) => n.parent).parent = 'c:no-existe';
  assert.equal(validateSnapshot(s).ok, false);
  s = k(base);
  const child = s.nodes.find((n) => n.parent && n.type !== 'proyecto');
  const parent = s.nodes.find((n) => n.id === child.parent);
  parent.parent = child.id;
  assert.ok(validateSnapshot(s).errors.some((e) => /ciclo/.test(e)));
  s = k(base);
  const pj = s.nodes.find((n) => n.type === 'proyecto');
  pj.sources = [{ kind: 'repositorio', label: 'x', url: 'javascript:alert(1)' }];
  assert.equal(validateSnapshot(s).ok, false);
  pj.sources = [{ kind: 'repositorio', label: 'x', url: 'https://github.com/ow/x' }];
  assert.equal(validateSnapshot(s).ok, true);
});

test('taxonomy.js: caminos, ramas, proyectos por rama y vistas rápidas salen de los datos (sin inventar)', async () => {
  const tax = await import('../../second-brain/taxonomy.js');
  const s = analyzeDemo().r.snapshot;
  const t = tax.buildTaxonomy(s);
  assert.ok(t.roots.length > 0 && t.roots.every((r) => !r.parent));
  for (const n of t.tree) { const path = t.pathOf(n.id); assert.equal(path[path.length - 1].id, n.id); assert.ok(path.length <= 12); }
  const ml = t.byId.get('c:ml');
  const set = t.branchSet(ml.id);
  assert.ok(set.has(ml.id) && [...t.descendants(ml.id)].every((d) => set.has(d)));
  for (const p of t.projectsOf(ml.id)) assert.ok(set.has(p.id) && p.type === 'proyecto');
  const views = tax.quickViews(s, t);
  assert.ok(views.every((v) => v.count > 0), 'solo se ofrecen vistas con elementos');
  const sm = tax.summary(s, t);
  for (const a of sm.areas) assert.equal(a.aplicado + a.documentado + a.sinEvidencia, a.leaves);
  assert.equal(tax.STAGES.length, 7);
  assert.match(tax.stageNext({ stage: 'estudiado' }), /aplicarlo/);
});
