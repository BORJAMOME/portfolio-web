import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvRows, classifyProduct, geometryContains, makeLocator, addGtfs, enrichNotice } from './incidencias-territorio.mjs';

const square = (x, y) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] });
const units = [{ geometry: square(0, 0), properties: { id: '00001', name: 'Villa A', province: 'Provincia A', community: 'Comunidad A' } }, { geometry: square(2, 0), properties: { id: '00002', name: 'Villa B', province: 'Provincia B', community: 'Comunidad B' } }];
const locate = makeLocator(units);
const gtfs = {
  'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\n001,A,0.5,0.5\n002,B,0.5,2.5\n',
  'routes.txt': 'route_id,route_short_name,route_long_name\n R1 ,Avant,\n',
  'trips.txt': 'route_id,trip_id,trip_short_name\nR1,TRIP1,12345\n',
  // Desorden intencionado: el origen/destino depende de stop_sequence, no del CSV.
  'stop_times.txt': 'trip_id,stop_id,stop_sequence\nTRIP1,002,2\nTRIP1,001,1\n'
};
const makeCatalog = () => { const c = { stops: {}, routes: {}, trips: {} }; addGtfs(c, gtfs, false, locate); return c; };

test('CSV conserva comillas, separadores y saltos y recorta IDs acolchados de Renfe', () => {
  assert.deepEqual([...csvRows('\uFEFFid,name\r\n 001 ,"Estación, \\"no\\""\r\n')][0]?.id, '001');
  assert.deepEqual([...csvRows('id,name\n  R1 ,"Línea, uno"\n')], [{ id: 'R1', name: 'Línea, uno' }]);
  assert.equal([...csvRows('id,name\n1,"dos\nlíneas"\n')][0].name, 'dos\nlíneas');
});
test('clasifica producto explícito y conserva la doble naturaleza de Avant', () => {
  assert.deepEqual(classifyProduct('Avant'), ['alta_velocidad', 'regional']);
  assert.deepEqual(classifyProduct('Regional Exprés'), ['regional']);
  assert.deepEqual(classifyProduct('Intercity'), ['larga_distancia']);
  assert.deepEqual(classifyProduct('Inventado'), ['ferroviario_sin_detallar']);
});
test('municipio por contención geométrica sin asignar ciudad más próxima y con agujeros', () => {
  assert.equal(locate([0.5, 0.5]).city, 'Villa A');
  assert.equal(locate([1.2, 0.5]), null);
  const geometry = square(0, 0); geometry.coordinates.push([[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]]);
  assert.equal(geometryContains([0.5, 0.5], geometry), false);
  assert.equal(locate(null, { city: 'Villa A', province: 'Provincia A' }).municipalityId, '00001');
});
test('los metadatos reales de un viaje enriquecen tipo, producto y extremos por secuencia', () => {
  const c = makeCatalog(), n = enrichNotice({ sourceId: 'renfe-avldmd', tripId: 'TRIP1', serviceTypes: ['ferroviario_sin_detallar'], stops: [], routes: [] }, c);
  assert.deepEqual(n.serviceTypes, ['alta_velocidad', 'regional']);
  assert.equal(n.product, 'Avant'); assert.equal(n.origin, 'A'); assert.equal(n.destination, 'B');
  assert.equal(n.geographyStatus, 'ambito_ruta');
  assert.deepEqual(n.routeNames, ['Avant · A – B']);
  assert.equal(n.places.length, 2); assert.equal(n.places[0].basis, 'recorrido_de_ruta');
});
test('la estación afectada prevalece sobre todo el recorrido para territorio', () => {
  const n = enrichNotice({ sourceId: 'renfe-avisos', stops: ['001'], routes: ['R1'], serviceTypes: ['cercanias'] }, makeCatalog());
  assert.equal(n.geographyStatus, 'localizacion_estacion');
  assert.deepEqual(n.places.map(p => p.city), ['Villa A']); assert.deepEqual(n.stopNames, ['A']);
});
test('no asigna territorios ni tipos inventados; respeta lugares declarados por la fuente', () => {
  const n = enrichNotice({ sourceId: 'renfe-avldmd', stops: ['unknown'], routes: [], serviceTypes: [] }, makeCatalog());
  assert.equal(n.geographyStatus, 'sin_localizar'); assert.deepEqual(n.places, []); assert.deepEqual(n.serviceTypes, ['ferroviario_sin_detallar']);
  const place = { community: 'Otra', city: 'Lugar de la fuente', basis: 'fuente' };
  const other = enrichNotice({ sourceId: 'metro-test', places: [place] }, makeCatalog());
  assert.deepEqual(other.places, [place]); assert.equal(other.geographyStatus, 'fuente');
});
