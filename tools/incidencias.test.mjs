import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect, madridDate, monthlySummary } from './incidencias-ledger.mjs';

const empty = () => ({ schema: 1, records: [], snapshots: [], updatedAt: null });
const feed = (time, ids = ['A'], text = 'Incidencia') => ({ header: { timestamp: String(Date.parse(time) / 1000) }, entity: ids.map(id => ({ id, alert: { descriptionText: { translation: [{ language: 'es', text }] }, informedEntity: [{ routeId: 'C1' }] } })) });
const update = (data, time, ids, text) => collect(data, feed(time, ids, text), time);

test('repetir consultas o cambiar el texto no duplica avisos ni altera el mes de alta', () => {
  const first = update(empty(), '2026-11-20T09:00:00Z');
  const second = update(first, '2026-12-07T09:00:00Z', ['A', 'B'], 'Texto actualizado');
  assert.equal(first.records[0].text, 'Incidencia');
  assert.equal(second.records.length, 2);
  assert.equal(second.records[0].firstSeen, '2026-11-20');
  assert.equal(second.records[0].text, 'Texto actualizado');
  assert.equal(monthlySummary(second, 2026)[10].count, 1);
  assert.equal(monthlySummary(second, 2026)[11].count, 1);
});
test('enero empieza a cero sin borrar el histórico ni volver a contar avisos arrastrados', () => {
  const old = update(empty(), '2026-12-31T09:00:00Z');
  const next = update(old, '2027-01-04T09:00:00Z');
  assert.equal(monthlySummary(next, 2027)[0].count, 0);
  assert.equal(monthlySummary(next, 2026)[11].count, 1);
  assert.equal(next.snapshots.length, 2);
  assert.equal(next.records[0].lastSeen, '2027-01-04');
});
test('ausencia y reaparición no borran ni duplican; una consulta vacía no es un mes sin consulta', () => {
  let data = update(empty(), '2026-11-20T09:00:00Z');
  data = update(data, '2026-12-07T09:00:00Z', []);
  assert.equal(data.records.length, 1);
  assert.deepEqual(data.snapshots.at(-1).ids, []);
  assert.equal(monthlySummary(data, 2026)[11].samples, 1);
  assert.equal(monthlySummary(data, 2026)[9].samples, 0);
  data = update(data, '2026-12-14T09:00:00Z');
  assert.equal(data.records.length, 1);
});
test('el año y el mes se atribuyen a Europe/Madrid, incluso cerca de medianoche', () => {
  assert.equal(madridDate('2026-12-31T23:30:00Z'), '2027-01-01');
  assert.equal(madridDate('2026-06-30T22:30:00Z'), '2026-07-01');
  const data = update(empty(), '2026-12-31T23:30:00Z');
  assert.equal(monthlySummary(data, 2027)[0].count, 1);
});
test('repetir una consulta el mismo día sustituye la muestra, conservando primeras detecciones', () => {
  const first = update(empty(), '2026-11-20T09:00:00Z');
  const next = update(first, '2026-11-20T10:00:00Z', ['B']);
  assert.equal(next.snapshots.length, 1);
  assert.equal(next.records.length, 2);
  assert.deepEqual(next.snapshots[0].ids, ['B']);
});
test('agrupa identificadores repetidos en la fuente sin perder textos ni ámbitos', () => {
  const time = '2026-11-20T09:00:00Z', input = feed(time, ['A', 'A']);
  input.entity[1].alert.descriptionText.translation[0].text = 'Ampliación';
  input.entity[1].alert.informedEntity = [{ routeId: 'C2' }];
  const data = collect(empty(), input, time);
  assert.equal(data.records.length, 1);
  assert.deepEqual(data.snapshots[0].ids, ['A']);
  assert.equal(data.records[0].text, 'Incidencia\n\nAmpliación');
  assert.deepEqual(data.records[0].routes, ['C1', 'C2']);
});
test('rechaza fuentes malformadas, antiguas, futuras y avisos sin texto', () => {
  const time = '2026-11-20T09:00:00Z';
  assert.throws(() => collect(empty(), {}, time));
  assert.throws(() => collect(empty(), feed('2026-11-18T09:00:00Z'), time));
  assert.throws(() => collect(empty(), feed('2026-11-21T09:00:00Z'), time));
  assert.throws(() => collect(empty(), feed(time, ['A'], ''), time));
});
