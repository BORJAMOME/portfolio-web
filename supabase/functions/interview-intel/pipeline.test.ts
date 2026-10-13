// deno test supabase/functions/interview-intel/
// Detección, estados, idempotencia, reintentos y conservación de informes. Todo simulado:
// sin red, sin Google, sin IA de pago (MockProvider) y sin datos reales.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { MockProvider } from "./ai.ts";
import { classify, fingerprints } from "./classify.ts";
import { advance, type Config, type Deps, detect, type EmailSource } from "./pipeline.ts";
import { ev, ME, MemoryStore, NOW } from "./test_helpers.ts";

const CONFIG: Config = { ownEmails: [ME], scanDays: 30, leadDays: 14, maxAttempts: 3, maxAiCallsPerDay: 50, paused: false, leaseSec: 300 };
function setup(opts: { fail?: { research?: number; report?: number }; email?: EmailSource | null; config?: Partial<Config> } = {}) {
  let now = NOW;
  const clock = { set: (d: Date) => { now = d; }, advance: (min: number) => { now = new Date(now.getTime() + min * 60e3); } };
  const store = new MemoryStore(() => now);
  const ai = new MockProvider(() => now, opts.fail);
  const d: Deps = { store, ai, email: opts.email ?? null, now: () => now, config: { ...CONFIG, ...opts.config } };
  return { store, ai, d, clock };
}
async function runUntilIdle(d: Deps, clock: { advance: (m: number) => void }, max = 10) {
  const out = [];
  for (let i = 0; i < max; i++) {
    const r = await advance(d);
    out.push(r);
    if (r.action === "idle") break;
    clock.advance(1);
  }
  return out;
}

/* ─── 15.1 Detección ─── */
Deno.test("1 · entrevista confirmada con invitación completa → en cola y luego informe listo", async () => {
  const { store, d, clock } = setup();
  store.events.push(ev({ description: "Proceso de selección Data Analyst. Oferta: https://www.linkedin.com/jobs/view/123456/" }));
  await detect(d);
  assertEquals(store.rows.length, 1);
  const r = store.rows[0];
  assertEquals(r.classification, "interview");
  assertEquals(r.status, "queued");
  assertEquals(r.my_response, "ACCEPTED");
  assertEquals(r.company, "Acme");
  assertEquals(r.role_title, "Data Analyst");
  assertEquals(r.job_url, "https://www.linkedin.com/jobs/view/123456/");
  assertEquals(r.attendees.map((a) => a.email), ["laura.gomez@acme.com"]);   // yo no cuento como participante
  await runUntilIdle(d, clock);
  assertEquals(store.rows[0].status, "ready");
  assertEquals(store.reports.length, 1);
  assertEquals(store.rows[0].current_report_id, store.reports[0].id);
});

Deno.test("2 · entrevista sin oferta adjunta → se prepara igual, sin enlace a la oferta", async () => {
  const { store, d, clock } = setup();
  store.events.push(ev({ title: "Entrevista con Acme" }));
  await detect(d);
  assertEquals(store.rows[0].job_url, null);
  await runUntilIdle(d, clock);
  assertEquals(store.rows[0].status, "ready");
});

Deno.test("3 · varios entrevistadores → todos los externos, sin salas ni el propio usuario", async () => {
  const { store, d } = setup();
  store.events.push(ev({
    attendees: [
      { name: "Laura Gómez", email: "laura.gomez@acme.com", partstat: "ACCEPTED" },
      { name: "Pedro Ruiz", email: "pedro.ruiz@acme.com", partstat: "ACCEPTED" },
      { name: "Ana Martín", email: "ana.martin@acme.com", partstat: "TENTATIVE" },
      { name: "Sala 3", email: "c_123@resource.calendar.google.com", partstat: "ACCEPTED" },
      { name: null, email: ME, partstat: "ACCEPTED" },
    ],
  }));
  await detect(d);
  assertEquals(store.rows[0].attendees.map((a) => a.name), ["Laura Gómez", "Pedro Ruiz", "Ana Martín"]);
});

Deno.test("4 · evento con información incompleta → posible entrevista, pendiente de revisión", async () => {
  const { store, d, clock } = setup();
  store.events.push(ev({ title: "Llamada", description: null, organizer: { name: "Marta", email: "marta@nuevaempresa.es" },
    attendees: [{ name: "Marta", email: "marta@nuevaempresa.es", partstat: "ACCEPTED" }, { name: null, email: ME, partstat: "ACCEPTED" }] }));
  // sin palabras de selección no llega al umbral: no se registra
  await detect(d);
  assertEquals(store.rows.length, 0);
  store.events[0].description = "Hola Borja, te escribo por tu candidatura.";
  await detect(d);
  assertEquals(store.rows[0].classification, "candidate");
  assertEquals(store.rows[0].status, "pending_review");
  // no se investiga nada hasta que la confirmes
  assertEquals((await runUntilIdle(d, clock))[0].action, "idle");
});

Deno.test("5 · reunión que no es una entrevista → no se registra", async () => {
  const { store, d } = setup();
  store.events.push(ev({ title: "Daily standup equipo", description: null }));
  store.events.push(ev({ title: "Clase Máster UX/UI", organizer: null, attendees: [], conference_url: null }));
  store.events.push(ev({ title: "Festivo", all_day: true }));
  await detect(d);
  assertEquals(store.rows.length, 0);
});

Deno.test("6 · invitación pendiente de aceptar → se prepara y se marca como NEEDS-ACTION (sin afirmar que está aceptada)", async () => {
  const { store, d } = setup();
  store.events.push(ev({ attendees: [{ name: "Laura", email: "laura.gomez@acme.com", partstat: "ACCEPTED" }, { name: null, email: ME, partstat: "NEEDS-ACTION" }] }));
  await detect(d);
  assertEquals(store.rows[0].my_response, "NEEDS-ACTION");
  assertEquals(store.rows[0].status, "queued");
});

Deno.test("7 · entrevista cancelada (rechazada o desaparecida) → cancelled, sin borrar el informe", async () => {
  const { store, d, clock } = setup();
  store.events.push(ev());
  await detect(d);
  await runUntilIdle(d, clock);
  const reportId = store.rows[0].current_report_id;
  // desaparece del feed tras una sincronización posterior
  store.events = [];
  store.syncs[0].ran_at = new Date(NOW.getTime() + 60 * 60e3).toISOString();
  clock.advance(60);
  await detect(d);
  assertEquals(store.rows[0].status, "cancelled");
  assertEquals(store.rows[0].current_report_id, reportId);
  assertEquals(store.reports.length, 1);
  // si la sincronización falló, no se da por cancelada
  const s2 = setup();
  s2.store.events.push(ev());
  await detect(s2.d);
  s2.store.events = [];
  s2.store.syncs[0] = { calendar: "principal", ran_at: new Date(NOW.getTime() + 36e5).toISOString(), ok: false };
  await detect(s2.d);
  assertEquals(s2.store.rows[0].status, "queued");
  // rechazar la invitación también la cancela
  const s3 = setup();
  s3.store.events.push(ev({ attendees: [{ name: "L", email: "laura.gomez@acme.com", partstat: "ACCEPTED" }, { name: null, email: ME, partstat: "DECLINED" }] }));
  await detect(s3.d);
  assertEquals(s3.store.rows[0].status, "cancelled");
});

Deno.test("8 · entrevista reprogramada → misma fila, nueva hora, sin nueva investigación", async () => {
  const { store, d, clock, ai } = setup();
  const e = ev();
  store.events.push(e);
  await detect(d);
  await runUntilIdle(d, clock);
  const calls = ai.calls.research;
  e.starts_at = "2026-10-22T10:00:00.000Z"; e.ends_at = "2026-10-22T11:00:00.000Z"; e.sequence = 1;
  await detect(d);
  assertEquals(store.rows.length, 1);
  assertEquals(store.rows[0].starts_at, "2026-10-22T10:00:00.000Z");
  assertEquals(store.rows[0].status, "ready");          // cambio menor: no hace falta regenerar
  await runUntilIdle(d, clock);
  assertEquals(ai.calls.research, calls);
});

Deno.test("9 · el mismo evento detectado varias veces → una sola fila y un solo informe", async () => {
  const { store, d, clock } = setup();
  const e = ev();
  store.events.push(e, { ...e });          // ocurrencia duplicada en la caché
  await detect(d);
  await detect(d);
  await Promise.all([detect(d), detect(d)]);
  assertEquals(store.rows.length, 1);
  // dos ejecuciones simultáneas no procesan la misma entrevista
  const [a, b] = await Promise.all([advance(d), advance(d)]);
  assertEquals([a.action, b.action].sort(), ["idle", "research"]);
  await runUntilIdle(d, clock);
  await runUntilIdle(d, clock);
  assertEquals(store.reports.length, 1);
});

Deno.test("10 · dos entrevistas distintas de la misma empresa → dos filas y dos informes", async () => {
  const { store, d, clock } = setup();
  store.events.push(ev({ title: "Entrevista RRHH - Acme" }), ev({ title: "Entrevista técnica - Acme", starts_at: "2026-10-23T08:00:00.000Z", ends_at: "2026-10-23T09:00:00.000Z" }));
  await detect(d);
  assertEquals(store.rows.length, 2);
  assertEquals(store.rows.map((r) => r.interview_kind).sort(), ["rrhh", "tecnica"]);
  await runUntilIdle(d, clock);
  assertEquals(store.reports.length, 2);
  assertEquals(new Set(store.reports.map((r) => r.interview_id)).size, 2);
});

Deno.test("entrevista enlazada a mano en Entrevistas → manda lo registrado (empresa, puesto, oferta)", async () => {
  const { store, d } = setup();
  const e = ev({ title: "Reunión" });
  store.events.push(e);
  store.linksList.push({ entrevista_id: "11111111-1111-1111-1111-111111111111", calendar_uid: e.uid + "|" + e.starts_at, fase: "tecnica", entrevistadores: "Laura (BI Lead)",
    empresa: "Acme Analytics S.L.", puesto: "Power BI Developer", url: "https://acme.example/empleo/pbi", ubicacion: "Madrid", modalidad: "hibrido" });
  await detect(d);
  const r = store.rows[0];
  assertEquals([r.classification, r.company, r.role_title, r.job_url, r.interview_kind], ["interview", "Acme Analytics S.L.", "Power BI Developer", "https://acme.example/empleo/pbi", "tecnica"]);
});

Deno.test("fuera de la ventana de preparación → detectada; entra en cola al acercarse", async () => {
  const { store, d, clock } = setup();
  store.events.push(ev({ starts_at: "2026-11-05T08:00:00.000Z", ends_at: "2026-11-05T09:00:00.000Z" }));
  await detect(d);
  assertEquals(store.rows[0].status, "detected");
  clock.set(new Date("2026-10-25T08:00:00Z"));
  store.syncs[0].ran_at = "2026-10-25T08:00:00Z";
  await detect(d);
  assertEquals(store.rows[0].status, "queued");
});

/* ─── Cambios relevantes y reintentos ─── */
Deno.test("cambio relevante (nuevo entrevistador) → needs_update; se regenera y el anterior se conserva", async () => {
  const { store, d, clock, ai } = setup();
  const e = ev();
  store.events.push(e);
  await detect(d);
  await runUntilIdle(d, clock);
  e.attendees = [...(e.attendees ?? []), { name: "Pedro Ruiz", email: "pedro.ruiz@acme.com", partstat: "NEEDS-ACTION" }];
  await detect(d);
  assertEquals(store.rows[0].status, "needs_update");
  await runUntilIdle(d, clock);
  assertEquals(store.rows[0].status, "ready");
  assertEquals(store.reports.map((r) => r.version), [1, 2]);
  assertEquals(store.rows[0].current_report_id, store.reports[1].id);
  assertEquals(ai.calls.research, 2);
});

Deno.test("proveedor de búsqueda caído → reintento con espera y después éxito, sin duplicados", async () => {
  const { store, d, clock } = setup({ fail: { research: 2 } });
  store.events.push(ev());
  await detect(d);
  const r1 = await advance(d);
  assert(r1.error);
  assertEquals(store.rows[0].status, "queued");
  assertEquals(store.rows[0].attempts, 1);
  assertEquals((await advance(d)).action, "idle");        // espera progresiva: aún no toca
  clock.advance(6);
  assert((await advance(d)).error);
  assertEquals(store.rows[0].attempts, 2);
  clock.advance(16);
  await runUntilIdle(d, clock);
  assertEquals(store.rows[0].status, "ready");
  assertEquals(store.reports.length, 1);
});

Deno.test("fallo repetido → failed tras 3 intentos; el informe anterior sigue vigente", async () => {
  const { store, d, clock } = setup();
  const e = ev();
  store.events.push(e);
  await detect(d);
  await runUntilIdle(d, clock);
  const good = store.rows[0].current_report_id;
  // a partir de ahora la IA falla siempre al redactar
  d.ai = new MockProvider(() => NOW, { report: 99 });
  e.title = "Entrevista técnica Data Analyst - Acme";
  await detect(d);
  for (let i = 0; i < 6; i++) { await advance(d); clock.advance(60); }
  assertEquals(store.rows[0].status, "failed");
  assertEquals(store.rows[0].current_report_id, good);
  assertEquals(store.reports.length, 1);
  assert(store.rows[0].last_error);
});

Deno.test("límite diario de llamadas y pausa → no se llama a la IA", async () => {
  const a = setup({ config: { maxAiCallsPerDay: 0 } });
  a.store.events.push(ev());
  await detect(a.d);
  assertEquals((await advance(a.d)).action, "daily_limit");
  const b = setup({ config: { paused: true } });
  assertEquals((await advance(b.d)).action, "paused");
});

Deno.test("Gmail falla → la investigación sigue y el hueco queda anotado", async () => {
  const email: EmailSource = { find: () => Promise.reject(new Error("Gmail 503")) };
  const { store, d, clock } = setup({ email });
  store.events.push(ev());
  await detect(d);
  await runUntilIdle(d, clock);
  assertEquals(store.rows[0].status, "ready");
  const research = store.runs.find((r) => r.kind === "research")!.output!;
  assert(research.gaps[0].startsWith("No se pudieron leer los correos"));
});

Deno.test("huellas: la hora es cambio menor; el título y las personas, mayor", () => {
  const e = ev();
  const c = classify(e, [ME]);
  const a = fingerprints(e, c.external);
  const moved = fingerprints({ ...e, starts_at: "2026-10-21T08:00:00.000Z" }, c.external);
  assertEquals(a.major, moved.major);
  assert(a.minor !== moved.minor);
  assert(a.major !== fingerprints({ ...e, title: "Entrevista final - Acme" }, c.external).major);
});
