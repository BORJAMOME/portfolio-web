import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateLedger, applySourceResults, normalizeRenfeAlerts, normalizeRenfeDelays, RENFE_ALERTS } from './incidencias-multifuente.mjs';

const NOW = '2026-11-20T10:00:00Z';
const stamp = time => String(Date.parse(time) / 1000);
const source = id => ({ id, name: id, serviceTypes: ['metro'], coverage: 'Prueba' });
const record = (id, text = 'Aviso oficial') => ({ externalId: id, title: '', text, serviceTypes: ['metro'], routes: [], stops: [], places: [], kind: 'aviso', derived: false });
const result = (id, records = []) => ({ source: source(id), records, sourceTimestamp: null });
const legacy = () => ({
  schema: 1, updatedAt: NOW,
  records: Array.from({ length: 69 }, (_, i) => ({ id: 'AVISO_' + i, text: 'Aviso ' + i, firstSeen: '2026-11-20', lastSeen: '2026-11-20', routes: ['C1'], stops: [], activePeriod: [] })),
  snapshots: [{ date: '2026-11-20', collectedAt: NOW, sourceTimestamp: NOW, ids: Array.from({ length: 69 }, (_, i) => 'AVISO_' + i) }]
});
const blank = () => ({ schema: 1, updatedAt: null, records: [], snapshots: [] });
const bySource = (data, id) => data.sources.find(s => s.id === id);
const latest = (data, id) => data.snapshots.filter(s => s.sourceId === id).at(-1);
const additions = (data, month) => data.records.filter(r => !r.derived && r.firstSeen.startsWith(month)).length;

test('migrar 69 avisos schema1 conserva identidades, primeras detecciones y muestras, sin mutar el original', () => {
  const old = legacy(), before = structuredClone(old), next = migrateLedger(old);
  assert.deepEqual(old, before);
  assert.equal(next.schema, 2);
  assert.equal(next.records.length, 69);
  assert.equal(next.snapshots[0].ids.length, 69);
  for (let i = 0; i < 69; i++) {
    assert.equal(next.records[i].externalId, old.records[i].id);
    assert.equal(next.records[i].id, RENFE_ALERTS.id + ':' + old.records[i].id);
    assert.equal(next.records[i].firstSeen, old.records[i].firstSeen);
    assert.equal(next.records[i].lastSeen, old.records[i].lastSeen);
    assert.equal(next.records[i].derived, false);
    assert.equal(next.snapshots[0].ids[i], RENFE_ALERTS.id + ':' + old.snapshots[0].ids[i]);
  }
  assert.deepEqual(migrateLedger(next), next, 'La migración schema2 es idempotente');
});

test('consultar los mismos 69 avisos tras migrar no vuelve a contarlos ni duplica la muestra del día', () => {
  const old = legacy();
  const feed = { header: { timestamp: stamp(NOW) }, entity: old.records.map(r => ({ id: r.id, alert: { descriptionText: { translation: [{ language: 'es', text: r.text + ' actualizado' }] } } })) };
  const updated = applySourceResults(old, [normalizeRenfeAlerts(feed, NOW)], NOW);
  assert.equal(updated.records.length, 69);
  assert.equal(updated.snapshots.length, 1);
  assert.equal(additions(updated, '2026-11'), 69);
  assert.equal(new Set(updated.records.map(r => r.id)).size, 69);
  assert.ok(updated.records.every(r => r.firstSeen === '2026-11-20' && r.text.endsWith(' actualizado')));
});

test('IDs externos iguales de operadores distintos tienen identidades independientes', () => {
  const data = applySourceResults(blank(), [result('metro', [record('12')]), result('tren', [record('12')])], NOW);
  assert.deepEqual(data.records.map(r => r.id).sort(), ['metro:12', 'tren:12']);
  assert.deepEqual(latest(data, 'metro').ids, ['metro:12']);
  assert.deepEqual(latest(data, 'tren').ids, ['tren:12']);
});

test('fallo de una fuente conserva su última muestra correcta y no impide actualizar otra', () => {
  const first = applySourceResults(blank(), [result('metro', [record('A')]), result('tren', [record('B')])], NOW);
  const before = structuredClone(first), later = '2026-11-27T10:00:00Z';
  const next = applySourceResults(first, [{ source: source('metro'), error: 'HTTP 503', records: [] }, result('tren', [record('C')])], later);
  assert.deepEqual(first, before, 'La función no modifica el histórico recibido');
  assert.deepEqual(latest(next, 'metro'), latest(first, 'metro'));
  assert.equal(bySource(next, 'metro').lastSuccess, NOW);
  assert.equal(bySource(next, 'metro').lastAttempt, later);
  assert.equal(bySource(next, 'metro').status, 'error');
  assert.equal(next.records.find(r => r.id === 'metro:A').lastSeen, '2026-11-20');
  assert.deepEqual(latest(next, 'tren').ids, ['tren:C']);
  assert.equal(next.lastRun.successfulSources, 1);
  assert.deepEqual(next.lastRun.failedSources, ['metro']);
});

test('consulta vacía correcta registra ausencia observada; fallo no sustituye la muestra por cero', () => {
  const first = applySourceResults(blank(), [result('metro', [record('A')])], NOW);
  const empty = applySourceResults(first, [result('metro')], '2026-11-27T10:00:00Z');
  assert.equal(bySource(empty, 'metro').status, 'ok');
  assert.deepEqual(latest(empty, 'metro').ids, []);
  assert.equal(empty.records.length, 1, 'El registro histórico no se elimina');
  assert.equal(empty.records[0].lastSeen, '2026-11-20');
  const failed = applySourceResults(empty, [{ source: source('metro'), error: 'Timeout' }], '2026-12-04T10:00:00Z');
  assert.deepEqual(latest(failed, 'metro'), latest(empty, 'metro'));
  assert.equal(failed.snapshots.length, 2);
});

test('fuente no integrada no se presenta como consulta correcta ni como fallo de servicio', () => {
  const data = applySourceResults(blank(), [{ source: source('pendiente'), status: 'not_integrated', error: 'Sin endpoint verificado' }], NOW);
  assert.equal(bySource(data, 'pendiente').status, 'not_integrated');
  assert.equal(bySource(data, 'pendiente').lastSuccess, null);
  assert.equal(data.snapshots.length, 0);
  assert.equal(data.lastRun.successfulSources, 0);
  assert.deepEqual(data.lastRun.failedSources, []);
});

test('cambio de mes/año conserva primeras detecciones; un aviso persistente no suma en 2027', () => {
  let data = applySourceResults(blank(), [result('metro', [record('A')])], '2026-11-30T10:00:00Z');
  data = applySourceResults(data, [result('metro', [record('A'), record('B')])], '2026-12-07T10:00:00Z');
  assert.equal(additions(data, '2026-11'), 1);
  assert.equal(additions(data, '2026-12'), 1);
  data = applySourceResults(data, [result('metro', [record('A'), record('B')])], '2027-01-04T10:00:00Z');
  assert.equal(additions(data, '2027'), 0);
  data = applySourceResults(data, [result('metro', [record('B'), record('C')])], '2027-01-11T10:00:00Z');
  assert.equal(additions(data, '2027-01'), 1);
  assert.equal(additions(data, '2026'), 2);
  assert.equal(data.records.find(r => r.externalId === 'A').firstSeen, '2026-11-30');
  assert.equal(data.snapshots.length, 4);
});

test('primera detección usa el calendario de Madrid junto al límite de año UTC', () => {
  const data = applySourceResults(blank(), [result('metro', [record('A')])], '2026-12-31T23:30:00Z');
  assert.equal(data.records[0].firstSeen, '2027-01-01');
  assert.equal(latest(data, 'metro').date, '2027-01-01');
});

test('retrasos y cancelaciones son observaciones derivadas, no se suman como avisos oficiales', () => {
  const feed = { header: { timestamp: stamp(NOW) }, entity: [
    { id: 'delay', tripUpdate: { trip: { tripId: 'A', routeId: 'R' }, delay: 600, stopTimeUpdate: [{ stopId: '1', arrival: { delay: 120 } }, { stopId: '2', arrival: { delay: 600 } }] } },
    { id: 'cancelled', tripUpdate: { trip: { tripId: 'B', scheduleRelationship: 'CANCELED' } } },
    { id: 'numeric-cancelled', tripUpdate: { trip: { tripId: 'C', scheduleRelationship: 3 } } },
    { id: 'ontime', tripUpdate: { trip: { tripId: 'D' }, delay: 0 } }
  ] };
  const observations = normalizeRenfeDelays(feed, NOW);
  assert.equal(observations.records.length, 3);
  assert.ok(observations.records.every(r => r.derived && r.cause === null));
  assert.equal(observations.records.filter(r => r.kind === 'retraso').length, 1);
  assert.equal(observations.records.filter(r => r.kind === 'cancelacion').length, 2);
  assert.deepEqual(observations.records[0].observations.map(o => o.delaySeconds), [120, 600], 'La demora de cada parada no se sustituye por la máxima del viaje');
  const data = applySourceResults(blank(), [result('avisos', [record('A')]), observations], NOW);
  assert.equal(data.records.length, 4);
  assert.equal(additions(data, '2026-11'), 1);
  assert.equal(new Set(data.records.map(r => r.id)).size, 4, 'Un tripId igual a un ID de aviso sigue siendo otra unidad');
});

test('el idioma español y los ámbitos de alertas repetidas se conservan sin duplicar el aviso', () => {
  const feed = { header: { timestamp: stamp(NOW) }, entity: [
    { id: 'A', alert: { descriptionText: { translation: [{ language: 'ca', text: 'Avís' }, { language: 'es', text: 'Aviso' }] }, informedEntity: [{ routeId: 'R1', stopId: 'S1' }] } },
    { id: 'A', alert: { descriptionText: { translation: [{ language: 'es', text: 'Ampliación' }] }, informedEntity: [{ routeId: 'R2', stopId: 'S2' }] } }
  ] };
  const normalized = normalizeRenfeAlerts(feed, NOW);
  assert.equal(normalized.records.length, 1);
  assert.equal(normalized.records[0].text, 'Aviso\n\nAmpliación');
  assert.deepEqual(normalized.records[0].routes, ['R1', 'R2']);
  assert.deepEqual(normalized.records[0].stops, ['S1', 'S2']);
});
