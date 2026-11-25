import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFgcAlerts, fetchRailSources } from './incidencias-rail.mjs';

const vi = n => { let value = BigInt(n); const out = []; do { let b = Number(value & 127n); value >>= 7n; if (value) b |= 128; out.push(b); } while (value); return out; };
const numeric = (field, value) => [...vi(field * 8), ...vi(value)];
const bytes = (field, value) => [...vi(field * 8 + 2), ...vi(value.length), ...value];
const text = (field, value) => bytes(field, [...new TextEncoder().encode(value)]);
const translation = (value, language = 'es') => bytes(1, [...text(1, value), ...text(2, language)]);
const translated = (field, value) => bytes(field, translation(value));
const entity = ({ id = 'alert-1', route = 'L6', effect = 1, cause = 3, title = 'Sin servicio', description = 'Tramo interrumpido' } = {}) => bytes(2, [...text(1, id), ...bytes(5, [...bytes(5, [...text(2, route), ...text(5, 'PC2')]), ...numeric(6, cause), ...numeric(7, effect), ...translated(10, title), ...translated(11, description)])]);
const feed = (entities = entity()) => new Uint8Array([...bytes(1, [...text(1, '2.0'), ...numeric(3, Date.parse('2026-11-20T09:00:00Z') / 1000)]), ...entities]);
const routes = [{ route_id: 'L6', route_short_name: 'L6', route_type: 'Subway' }, { route_id: 'S2', route_short_name: 'S2', route_type: 'Rail' }];

test('decodifica alertas oficiales y clasifica por catálogo sin inventar municipio ni provincia', () => {
  const { records, sourceTimestamp } = decodeFgcAlerts(feed(), routes);
  assert.equal(sourceTimestamp, '2026-11-20T09:00:00.000Z');
  assert.equal(records[0].externalId, 'alert-1');
  assert.deepEqual(records[0].serviceTypes, ['metro']);
  assert.deepEqual(records[0].routes, ['L6']);
  assert.deepEqual(records[0].stops, ['PC2']);
  assert.equal(records[0].kind, 'interrupcion');
  assert.deepEqual(records[0].places, [{ community: 'Cataluña', province: null, city: null, basis: 'source' }]);
});
test('S suburbano es cercanías, pero Rail desconocido conserva tipo sin detallar', () => {
  assert.deepEqual(decodeFgcAlerts(feed(entity({ route: 'S2' })), routes).records[0].serviceTypes, ['cercanias']);
  assert.deepEqual(decodeFgcAlerts(feed(entity({ route: 'R99' })), routes).records[0].serviceTypes, ['ferroviario_sin_detallar']);
});
test('un feed vacío válido se distingue de un cuerpo truncado o malformado', () => {
  assert.deepEqual(decodeFgcAlerts(feed([])).records, []);
  for (const value of [[], [0], [10, 50, 1], [128], [15], [10, 0]]) assert.throws(() => decodeFgcAlerts(new Uint8Array(value)));
});
test('no confunde avisos de accesibilidad o retrasos con interrupciones', () => {
  assert.equal(decodeFgcAlerts(feed(entity({ effect: 11 }))).records[0].kind, 'accesibilidad');
  assert.equal(decodeFgcAlerts(feed(entity({ effect: 3 }))).records[0].kind, 'retraso');
  assert.equal(decodeFgcAlerts(feed(entity({ effect: 8, cause: 10 }))).records[0].kind, 'obras');
});
const args = (overrides = {}) => ({ now: '2026-11-20T10:00:00Z', fetchJson: async url => url.includes('gtfs_routes') ? { total_count: 2, results: routes } : { total_count: 1, results: [{ file: { format: 'pb', url: 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/alerts-gtfs_realtime/files/example' } }] }, fetchBinary: async () => feed(), ...overrides });
test('aisla Adif como no integrada y obtiene FGC desde la URL oficial dinámica', async () => {
  const result = await fetchRailSources(args());
  assert.equal(result.length, 3);
  assert.equal(result[0].source.status, 'not_integrated');
  assert.equal(result[0].records, null);
  assert.match(result[0].error, /autorización/);
  assert.equal(result[2].error, null);
  assert.equal(result[2].records.length, 1);
});
test('una caída de FGC no se transforma en cero avisos y el catálogo de tipos es opcional', async () => {
  const failed = await fetchRailSources(args({ fetchBinary: async () => { throw new Error('HTTP 503'); } }));
  assert.equal(failed[2].records, null);
  assert.match(failed[2].error, /503/);
  const base = args();
  const result = await fetchRailSources(args({ fetchJson: async url => { if (url.includes('gtfs_routes')) throw new Error('HTTP 500'); return base.fetchJson(url); } }));
  assert.equal(result[2].error, null);
  assert.deepEqual(result[2].records[0].serviceTypes, ['ferroviario_sin_detallar']);
});
test('rechaza redirección de catálogo a otro origen y fechas futuras', async () => {
  const redirected = await fetchRailSources(args({ fetchJson: async () => ({ total_count: 1, results: [{ file: { format: 'pb', url: 'https://example.org/payload' } }] }) }));
  assert.equal(redirected[2].records, null);
  assert.match(redirected[2].error, /origen oficial/);
  const future = await fetchRailSources(args({ now: '2026-11-19T10:00:00Z' }));
  assert.match(future[2].error, /futura/);
});
