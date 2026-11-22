import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchMetroSources } from './incidencias-metro.mjs';

test('Metro Bilbao admite una consulta vacía correcta sin inventar incidencias ni fecha de fuente', async () => {
  let called;
  const [result] = await fetchMetroSources({ fetchJson: async url => { called = url; return { data: [], meta: { count: 0 } }; } });
  assert.match(called, /^https:\/\/cms\.metrobilbao\.eus\/get\/open_data\/json\/avisos\/es\?/);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.records, []);
  assert.equal(result.sourceTimestamp, null);
  assert.equal(result.source.license, null);
});

test('normaliza aviso, ámbito metropolitano y estación sin atribuirlo a Bilbao capital', async () => {
  const [result] = await fetchMetroSources({ fetchJson: async () => ({ data: [{ id: 12, title_es: '<p>Ascensor &amp; acceso</p>', type: 'incidencia', station_id: 5, is_published: 1, publish_start_date: '2026-11-20', publish_end_date: '2026-11-30' }], meta: { count: 1 } }) });
  assert.equal(result.records.length, 1);
  const r = result.records[0];
  assert.equal(r.title, 'Ascensor & acceso');
  assert.equal(r.externalId, '12');
  assert.deepEqual(r.serviceTypes, ['metro']);
  assert.deepEqual(r.stops, ['5']);
  assert.deepEqual(r.places, [{ community: 'País Vasco', province: 'Bizkaia', city: null, basis: 'operator' }]);
  assert.equal(r.startedAt, null);
  assert.equal(r.endsAt, null);
  assert.equal(r.publishedAt, '2026-11-20');
});

test('pagina y agrupa estaciones del mismo aviso; no publica avisos explícitamente ocultos', async () => {
  const urls = [];
  const [result] = await fetchMetroSources({ fetchJson: async url => {
    urls.push(url); const offset = new URL(url).searchParams.get('offset');
    return offset === '0' ? { data: [{ id: 1, title_es: 'Obras', station_id: 4 }], meta: { count: 3 } } : { data: [{ id: 1, title_es: 'Obras', station_id: 7 }, { id: 2, title_es: 'Oculto', is_published: '0' }], meta: { count: 3 } };
  } });
  assert.equal(result.error, undefined);
  assert.equal(urls.length, 2);
  assert.deepEqual(result.records[0].stops, ['4', '7']);
  assert.equal(result.records.length, 1);
});

test('clasifica servicio especial como aviso informativo', async () => {
  const [result] = await fetchMetroSources({ fetchJson: async () => ({ data: [{ id: 'special_service', title_es: 'Servicio reforzado' }], meta: { count: 1 } }) });
  assert.equal(result.records[0].kind, 'servicio-especial');
});

test('distingue fallo de fuente, respuesta malformada y paginación truncada de cero avisos', async () => {
  for (const fetchJson of [async () => { throw new Error('HTTP 503'); }, async () => ({ wrong: [] }), async () => ({ data: [], meta: { count: 5 } }), async () => ({ data: [{ id: 1 }], meta: { count: 1 } })]) {
    const [result] = await fetchMetroSources({ fetchJson });
    assert.ok(result.error);
    assert.deepEqual(result.records, []);
    assert.equal(result.source.id, 'metro-bilbao');
  }
});
