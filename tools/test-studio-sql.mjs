/* ═══════════════════════════════════════════════
   tools/test-studio-sql.mjs: ejecuta supabase/studio*.sql contra un Postgres real (PGlite, WASM)
     npm i --no-save --no-package-lock @electric-sql/pglite@0.5.11
     node tools/test-studio-sql.mjs
   Comprueba que los SQL se aplican (también dos veces), que los triggers, restricciones, el RPC y los borrados en cascada
   se comportan como dice el código, que anon no puede leer y que los rollbacks dejan la base limpia.
   Sustituye is_member() y touch_updated_at() (de otros SQL del proyecto) por versiones mínimas. NO toca Supabase.
   ═══════════════════════════════════════════════ */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const sql = (f) => readFileSync(join(REPO, 'supabase', f), 'utf8');
const db = new PGlite();
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('✔ ' + name); } catch (e) { fail++; console.log('✖ ' + name + ' → ' + String(e.message).split('\n')[0]); } };
const q = async (text, params) => (await db.query(text, params)).rows;
const rejects = async (text, params, expect) => {
  try { await db.query(text, params); } catch (e) { if (expect && !new RegExp(expect, 'i').test(e.message)) throw new Error('error distinto: ' + e.message); return; }
  throw new Error('debía fallar: ' + text.slice(0, 70));
};
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || 'distinto') + ': esperado ' + JSON.stringify(b) + ', recibido ' + JSON.stringify(a)); };

// stubs de lo que ya existe en el proyecto real
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create or replace function public.is_member() returns boolean language sql stable as $$ select true $$;
  create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
`);
const apply = async (...files) => { for (const f of files) await db.exec(sql(f)); };
const ALL = ['studio.sql', 'studio-ideas.sql', 'studio-roadmap.sql'];

await t('Los tres SQL se ejecutan y son idempotentes (dos veces seguidas)', async () => { await apply(...ALL); await apply(...ALL); });

await t('anon no puede leer nada; authenticated sí (RLS + revoke)', async () => {
  await db.exec('set role anon');
  await rejects('select * from public.ps_projects', [], 'permission denied');
  await rejects('select * from public.ps_links', [], 'permission denied');
  await db.exec('reset role');
  await db.exec('grant select, insert, update, delete on all tables in schema public to authenticated; set role authenticated');
  await q('select * from public.ps_projects'); await q('select * from public.ps_links');
  await db.exec('reset role');
});

let p1, p2, p3;
await t('Proyectos: valores por defecto, actividad y comprobaciones', async () => {
  [{ id: p1 }] = await q(`insert into ps_projects (title) values ('Alfa') returning id`);
  [{ id: p2 }] = await q(`insert into ps_projects (title, kind) values ('Beta', 'powerbi') returning id`);
  [{ id: p3 }] = await q(`insert into ps_projects (title) values ('Gamma') returning id`);
  eq((await q('select stage, status, priority from ps_projects where id = $1', [p1]))[0], { stage: 'capture', status: 'active', priority: 2 });
  await rejects(`insert into ps_projects (title, stage) values ('x', 'otra')`, [], 'check');
  await rejects(`insert into ps_projects (title) values ('')`, [], 'check');
  await db.query(`update ps_projects set stage = 'build' where id = $1`, [p1]);
  await db.query(`update ps_projects set status = 'paused' where id = $1`, [p1]);
  eq((await q(`select kind, from_value, to_value from ps_activity where project_id = $1 and kind <> 'project_created' order by id`, [p1])), [
    { kind: 'project_stage', from_value: 'capture', to_value: 'build' }, { kind: 'project_status', from_value: 'active', to_value: 'paused' }]);
  await db.query(`update ps_projects set status = 'active' where id = $1`, [p1]);
});

let tk, sub;
await t('Tareas: completed_at, actividad, subtareas de un solo nivel y herencia de proyecto', async () => {
  [{ id: tk }] = await q(`insert into ps_tasks (title, project_id) values ('Tarea', $1) returning id`, [p1]);
  await db.query(`update ps_tasks set board_status = 'done' where id = $1`, [tk]);
  eq((await q('select completed_at is not null as c from ps_tasks where id = $1', [tk]))[0].c, true);
  await db.query(`update ps_tasks set board_status = 'review' where id = $1`, [tk]);
  eq((await q('select completed_at from ps_tasks where id = $1', [tk]))[0].completed_at, null);
  [{ id: sub }] = await q(`insert into ps_tasks (title, parent_id, project_id) values ('Paso', $1, null) returning id`, [tk]);
  eq((await q('select project_id = $1 as ok from ps_tasks where id = $2', [p1, sub]))[0].ok, true, 'el paso hereda el proyecto');
  await rejects(`insert into ps_tasks (title, parent_id) values ('Nieto', $1)`, [sub], 'un nivel');
  await rejects(`insert into ps_tasks (title, parent_id) values ('Huérfano', gen_random_uuid())`, [], 'no existe');
  await rejects(`insert into ps_tasks (title, board_status) values ('x', 'otro')`, [], 'check');
  await db.query(`update ps_tasks set archived_at = now() where id = $1`, [tk]);
  const kinds = (await q(`select kind from ps_activity where task_id = $1 order by id`, [tk])).map((r) => r.kind);
  eq(kinds, ['task_created', 'task_status', 'task_status', 'task_archived']);
  eq((await q(`select count(*)::int as n from ps_activity where task_id = $1`, [sub]))[0].n, 0, 'los pasos no generan actividad');
  await db.query(`update ps_tasks set archived_at = null where id = $1`, [tk]);
});

let idea;
await t('Ideas: conversión atómica, actividad y comprobación de enlaces http(s)', async () => {
  [{ id: idea }] = await q(`insert into ps_ideas (title, body, kind) values ('Mapa', 'Descripción', 'powerbi') returning id`);
  const [proj] = await q('select * from ps_convert_idea($1)', [idea]);
  eq([proj.title, proj.goal, proj.kind], ['Mapa', 'Descripción', 'powerbi']);
  eq((await q('select status, project_id = $1 as linked from ps_ideas where id = $2', [proj.id, idea]))[0], { status: 'converted', linked: true });
  await rejects('select * from ps_convert_idea($1)', [idea], 'ya se convirtió');
  await rejects('select * from ps_convert_idea(gen_random_uuid())', [], 'no existe');
  eq((await q(`select kind from ps_activity where kind like 'idea%' order by id`)).map((r) => r.kind), ['idea_created', 'idea_converted']);
  await rejects(`insert into ps_notes (project_id, title, url) values ($1, 'x', 'javascript:alert(1)')`, [p1], 'check');
  await rejects(`insert into ps_deliverables (project_id, title, url) values ($1, 'x', 'ftp://x')`, [p1], 'check');
  await db.query(`insert into ps_notes (project_id, title, url) values ($1, 'ok', 'https://x.es/a')`, [p1]);
  await rejects(`insert into ps_notes (project_id, title, kind) values ($1, 'x', 'otra')`, [p1], 'check');
});

let m1, m2, m3;
await t('Hitos: done_at lo pone el trigger y cuelgan del proyecto', async () => {
  [{ id: m1 }] = await q(`insert into ps_milestones (project_id, title, target_date) values ($1, 'H1', '2026-11-01') returning id`, [p1]);
  [{ id: m2 }] = await q(`insert into ps_milestones (project_id, title, target_date) values ($1, 'H2', '2026-12-01') returning id`, [p2]);
  [{ id: m3 }] = await q(`insert into ps_milestones (project_id, title) values ($1, 'H3') returning id`, [p2]);
  await db.query(`update ps_milestones set status = 'done' where id = $1`, [m1]);
  eq((await q('select done_at is not null as d from ps_milestones where id = $1', [m1]))[0].d, true);
  await db.query(`update ps_milestones set status = 'pending' where id = $1`, [m1]);
  eq((await q('select done_at from ps_milestones where id = $1', [m1]))[0].done_at, null);
  await rejects(`insert into ps_milestones (project_id, title) values (gen_random_uuid(), 'x')`, [], 'foreign key');
});

await t('Enlaces: dependencias válidas, duplicados, autoenlaces y extremos inexistentes', async () => {
  await db.query(`insert into ps_links (kind, from_id, to_id, rel) values ('milestone', $1, $2, 'depends_on')`, [m2, m1]);
  await rejects(`insert into ps_links (kind, from_id, to_id, rel) values ('milestone', $1, $2, 'depends_on')`, [m2, m1], 'duplicate|unique');
  await rejects(`insert into ps_links (kind, from_id, to_id, rel) values ('milestone', $1, $1, 'depends_on')`, [m1], 'ciclo|check');
  await rejects(`insert into ps_links (kind, from_id, to_id, rel) values ('milestone', $1, gen_random_uuid(), 'depends_on')`, [m1], 'no existe');
  await rejects(`insert into ps_links (kind, from_id, to_id, rel) values ('milestone', $1, $2, 'depends_on')`, [m1, p1], 'no existe');   // tipos mezclados
  const [{ id: iX }] = await q(`insert into ps_ideas (title) values ('Auxiliar') returning id`);
  await rejects(`insert into ps_links (kind, from_id, to_id, rel) values ('idea', $1, $2, 'depends_on')`, [idea, iX], 'check');       // las ideas no tienen dependencias
  await rejects(`insert into ps_links (kind, from_id, to_id, rel) values ('otro', $1, $2, 'depends_on')`, [m1, m2], 'no existe|check');
});
await t('Enlaces: los ciclos se rechazan (directos e indirectos)', async () => {
  await rejects(`insert into ps_links (kind, from_id, to_id, rel) values ('milestone', $1, $2, 'depends_on')`, [m1, m2], 'ciclo');        // m2→m1 ya existe
  await db.query(`insert into ps_links (kind, from_id, to_id, rel) values ('milestone', $1, $2, 'depends_on')`, [m3, m2]);               // m3→m2→m1
  await rejects(`insert into ps_links (kind, from_id, to_id, rel) values ('milestone', $1, $2, 'depends_on')`, [m1, m3], 'ciclo');        // m1→m3 cerraría el ciclo
  // proyectos: independientes de los hitos
  await db.query(`insert into ps_links (kind, from_id, to_id, rel) values ('project', $1, $2, 'depends_on')`, [p2, p1]);
  await rejects(`insert into ps_links (kind, from_id, to_id, rel) values ('project', $1, $2, 'depends_on')`, [p1, p2], 'ciclo');
});
await t('Enlaces: relates_to es simétrico (no se puede repetir al revés) y admite ideas', async () => {
  const [{ id: i2 }] = await q(`insert into ps_ideas (title) values ('Otra') returning id`);
  await db.query(`insert into ps_links (kind, from_id, to_id, rel) values ('idea', $1, $2, 'relates_to')`, [idea, i2]);
  await rejects(`insert into ps_links (kind, from_id, to_id, rel) values ('idea', $1, $2, 'relates_to')`, [i2, idea], 'duplicate|unique');
  // una relación y una dependencia entre los mismos extremos pueden convivir
  await db.query(`insert into ps_links (kind, from_id, to_id, rel) values ('project', $1, $2, 'relates_to')`, [p2, p1]);
});
await t('Borrados: al quitar un extremo desaparecen sus enlaces (incluso en cascada desde el proyecto)', async () => {
  const n = async () => (await q('select count(*)::int as n from ps_links'))[0].n;
  const before = await n();
  await db.query('delete from ps_milestones where id = $1', [m3]);          // m3→m2
  eq(await n(), before - 1, 'borrar un hito');
  await db.query('delete from ps_projects where id = $1', [p2]);            // p2: H2, H3 (ya borrado) y enlaces de proyecto
  const left = await q('select kind, from_id, to_id from ps_links');
  eq(left.filter((l) => [p2, m2, m3].includes(l.from_id) || [p2, m2, m3].includes(l.to_id)).length, 0, 'enlaces huérfanos tras borrar el proyecto');
  eq((await q('select count(*)::int as n from ps_milestones where project_id = $1', [p2]))[0].n, 0, 'hitos en cascada');
});
await t('Borrar un proyecto borra sus tareas, notas y entregables; las ideas sobreviven sin proyecto', async () => {
  const [{ id: i3 }] = await q(`insert into ps_ideas (title, project_id) values ('Conectada', $1) returning id`, [p1]);
  await db.query(`insert into ps_deliverables (project_id, title) values ($1, 'Repo')`, [p1]);
  await db.query('delete from ps_projects where id = $1', [p1]);
  eq((await q('select count(*)::int as n from ps_tasks where project_id = $1', [p1]))[0].n, 0);
  eq((await q('select count(*)::int as n from ps_notes where project_id = $1', [p1]))[0].n, 0);
  eq((await q('select project_id from ps_ideas where id = $1', [i3]))[0].project_id, null);
});

await t('Los rollbacks se ejecutan en orden inverso y se puede volver a aplicar todo', async () => {
  await apply('studio-roadmap-rollback.sql', 'studio-ideas-rollback.sql', 'studio-rollback.sql');
  eq((await q(`select count(*)::int as n from pg_tables where tablename like 'ps\\_%'`))[0].n, 0, 'tablas ps_ restantes');
  eq((await q(`select count(*)::int as n from pg_proc where proname like 'ps\\_%'`))[0].n, 0, 'funciones ps_ restantes');
  await apply(...ALL);
});

console.log(`\n${pass} correctas, ${fail} con fallo`);
process.exit(fail ? 1 : 0);
