import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const ROOT = new URL('../visor-ferroviario/', import.meta.url);
const CER = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';
const LD = 'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip';
const normal = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const unique = values => [...new Set(values.filter(Boolean))];

// CSV GTFS: campos entrecomillados, comas y saltos de línea, sin dependencias externas.
export function* csvRows(text) {
  let quoted = false, field = '', row = [], header;
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i] ?? '\n';
    if (ch === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (ch === ',' || ch === '\n')) {
      row.push(field.replace(/^\uFEFF/, '').trim()); field = '';
      if (ch === '\n') {
        if (row.some(Boolean)) { if (!header) header = row; else yield Object.fromEntries(header.map((key, j) => [key, row[j] || ''])); }
        row = [];
      }
    } else if (ch !== '\r' || quoted) field += ch;
  }
}

// Lee solo los ficheros de catálogo del ZIP; no extrae rutas al sistema de archivos.
export function readGtfsZip(buffer) {
  let end = buffer.length - 22;
  for (; end >= Math.max(0, buffer.length - 65557) && buffer.readUInt32LE(end) !== 0x06054b50; end--);
  if (end < 0 || buffer.readUInt32LE(end) !== 0x06054b50) throw new Error('ZIP sin directorio central');
  const count = buffer.readUInt16LE(end + 10), wanted = new Set(['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']);
  let offset = buffer.readUInt32LE(end + 16); const files = {};
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Directorio ZIP no válido');
    const method = buffer.readUInt16LE(offset + 10), size = buffer.readUInt32LE(offset + 20), expanded = buffer.readUInt32LE(offset + 24);
    const namesize = buffer.readUInt16LE(offset + 28), extra = buffer.readUInt16LE(offset + 30), comment = buffer.readUInt16LE(offset + 32), local = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + namesize).split('/').at(-1);
    offset += 46 + namesize + extra + comment;
    if (!wanted.has(name)) continue;
    if (expanded > 200_000_000 || size > 100_000_000) throw new Error('Catálogo GTFS demasiado grande');
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('Entrada ZIP no válida');
    const begin = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28), compressed = buffer.subarray(begin, begin + size);
    const body = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 200_000_000 }) : null;
    if (!body || body.length !== expanded) throw new Error('Compresión GTFS no admitida o longitud incorrecta');
    files[name] = body.toString('utf8');
  }
  if (![...wanted].every(name => files[name])) throw new Error('GTFS incompleto');
  return files;
}

export function classifyProduct(product, commuter = false) {
  if (commuter) return ['cercanias'];
  const p = normal(product);
  if (/^(ave|avlo|ave euromed|euromed)$/.test(p)) return ['alta_velocidad'];
  if (p === 'avant') return ['alta_velocidad', 'regional'];
  if (/^(regional|regional expres|media distancia|md|regional express)$/.test(p)) return ['regional'];
  if (/^(intercity|alvia|talgo|trenhotel|estrella)$/.test(p)) return ['larga_distancia'];
  return ['ferroviario_sin_detallar'];
}

function ringContains(point, ring) {
  let inside = false; const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function geometryContains(point, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(rings => ringContains(point, rings[0]) && !rings.slice(1).some(ring => ringContains(point, ring)));
}

function bounds(geometry) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = value => { if (typeof value[0] === 'number') { bbox[0] = Math.min(bbox[0], value[0]); bbox[1] = Math.min(bbox[1], value[1]); bbox[2] = Math.max(bbox[2], value[0]); bbox[3] = Math.max(bbox[3], value[1]); } else value.forEach(visit); };
  visit(geometry.coordinates); return bbox;
}

export function makeLocator(municipalities) {
  const units = municipalities.map(feature => ({ ...feature, bbox: bounds(feature.geometry) })), cache = new Map();
  return (point, fallback = {}) => {
    if (point?.every(Number.isFinite)) {
      const key = point.join(',');
      if (!cache.has(key)) {
        const matches = units.filter(u => point[0] >= u.bbox[0] && point[0] <= u.bbox[2] && point[1] >= u.bbox[1] && point[1] <= u.bbox[3] && geometryContains(point, u.geometry));
        cache.set(key, matches.length === 1 ? { community: matches[0].properties.community, province: matches[0].properties.province, city: matches[0].properties.name, municipalityId: matches[0].properties.id, basis: 'municipio_por_coordenadas' } : null);
      }
      if (cache.get(key)) return cache.get(key);
    }
    if (fallback.city && fallback.province) {
      const matches = units.filter(u => normal(u.properties.name) === normal(fallback.city) && normal(u.properties.province) === normal(fallback.province));
      if (matches.length === 1) return { community: matches[0].properties.community, province: matches[0].properties.province, city: matches[0].properties.name, municipalityId: matches[0].properties.id, basis: 'municipio_nombre_exacto' };
    }
    return null;
  };
}

export function addGtfs(catalog, files, commuter, locate) {
  const stops = {}, routes = {}, trips = {};
  for (const row of csvRows(files['stops.txt'])) {
    const coords = [Number(row.stop_lon), Number(row.stop_lat)];
    stops[row.stop_id] = { id: row.stop_id, name: row.stop_name, coordinates: coords, place: locate(coords) };
    catalog.stops[row.stop_id] = { ...catalog.stops[row.stop_id], ...stops[row.stop_id] };
  }
  for (const row of csvRows(files['routes.txt'])) {
    const product = row.route_short_name;
    routes[row.route_id] = { id: row.route_id, name: [product, row.route_long_name?.replace(/\s*-\s*/g, ' – ')].filter(Boolean).join(' · '), product, serviceTypes: classifyProduct(product, commuter), stopIds: new Set() };
  }
  for (const row of csvRows(files['trips.txt'])) {
    trips[row.trip_id] = { tripId: row.trip_id, routeId: row.route_id, product: routes[row.route_id]?.product || '', trainNumber: row.trip_short_name || '', serviceTypes: routes[row.route_id]?.serviceTypes || ['ferroviario_sin_detallar'] };
  }
  for (const row of csvRows(files['stop_times.txt'])) {
    const trip = trips[row.trip_id]; if (!trip) continue;
    routes[trip.routeId]?.stopIds.add(row.stop_id);
    const seq = Number(row.stop_sequence);
    if (Number.isFinite(seq)) {
      if (!trip._first || seq < trip._first.seq) trip._first = { seq, id: row.stop_id };
      if (!trip._last || seq > trip._last.seq) trip._last = { seq, id: row.stop_id };
    }
  }
  for (const route of Object.values(routes)) {
    route.stopIds = [...route.stopIds];
    route.places = dedupPlaces(route.stopIds.map(id => stops[id]?.place).filter(Boolean).map(place => ({ ...place, basis: 'recorrido_de_ruta' })));
    catalog.routes[route.id] = route;
  }
  for (const trip of Object.values(trips)) {
    trip.origin = stops[trip._first?.id]?.name || null; trip.destination = stops[trip._last?.id]?.name || null;
    delete trip._first; delete trip._last;
    catalog.trips[trip.tripId] = trip;
  }
}

function dedupPlaces(places) {
  return [...new Map(places.map(p => [[p.community || '', p.province || '', p.city || ''].join('|'), p])).values()];
}

export async function buildTerritoryCatalog() {
  const read = async file => JSON.parse(await readFile(new URL(file, ROOT), 'utf8'));
  const [data, services, demographics] = await Promise.all([read('datos.json'), read('capas/servicios.json'), read('capas/demografia.json').catch(() => null)]);
  const catalog = { stops: {}, routes: {}, trips: {}, sources: [], warnings: [] };
  const locate = makeLocator(demographics?.municipalities?.features || []);
  for (const f of data.stations.features) {
    const p = f.properties;
    catalog.stops[p.CODIGO] = { id: p.CODIGO, name: p.DESCRIPCION, coordinates: f.geometry.coordinates, place: locate(f.geometry.coordinates, { city: p.POBLACION, province: p.PROVINCIA }) };
  }
  for (const s of Object.values(services.stations)) if (!catalog.stops[s.official_id]) catalog.stops[s.official_id] = { id: s.official_id, name: s.name, coordinates: s.coordinates, place: locate(s.coordinates) };
  // Catálogos oficiales actuales, descargados al actualizar, no en el navegador.
  const downloads = await Promise.allSettled([CER, LD].map(async url => {
    const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return readGtfsZip(Buffer.from(await r.arrayBuffer()));
  }));
  downloads.forEach((result, i) => {
    const url = [CER, LD][i];
    if (result.status === 'fulfilled') { addGtfs(catalog, result.value, i === 0, locate); catalog.sources.push({ url, status: 'ok' }); }
    else { catalog.sources.push({ url, status: 'error' }); catalog.warnings.push('No se pudo enriquecer con ' + url + ': ' + result.reason.message); }
  });
  return catalog;
}

export function enrichNotice(record, catalog) {
  if (!String(record.sourceId || '').startsWith('renfe')) return { ...record, routeNames: record.routeNames || [], stopNames: record.stopNames || [], places: record.places || [], geographyStatus: record.places?.length ? 'fuente' : 'sin_localizar' };
  const tripId = record.tripId || record.trip?.tripId, trip = tripId ? catalog.trips[tripId] : null;
  const routeIds = unique([...(record.routes || []), trip?.routeId]), routes = routeIds.map(id => catalog.routes[id]).filter(Boolean);
  const stops = (record.stops || []).map(id => catalog.stops[id]).filter(Boolean);
  const sourcePlaces = record.places || [], stationPlaces = stops.map(s => s.place).filter(Boolean), routePlaces = stationPlaces.length ? [] : routes.flatMap(r => r.places || []);
  const places = dedupPlaces([...routePlaces, ...stationPlaces, ...sourcePlaces]);
  const types = unique([...(record.serviceTypes || []), ...routes.flatMap(r => r.serviceTypes || []), ...(trip?.serviceTypes || [])]).filter(t => t !== 'ferroviario_sin_detallar');
  const tripRouteName = trip?.origin && trip?.destination ? `${trip.product} · ${trip.origin} – ${trip.destination}` : null;
  return { ...record, serviceTypes: types.length ? types : ['ferroviario_sin_detallar'], routeNames: unique([...(record.routeNames || []), ...routes.map(r => r.id === trip?.routeId && tripRouteName ? tripRouteName : r.name)]), stopNames: unique([...(record.stopNames || []), ...stops.map(s => s.name)]), places, geographyStatus: sourcePlaces.length ? 'fuente' : stationPlaces.length ? 'localizacion_estacion' : routePlaces.length ? 'ambito_ruta' : 'sin_localizar', ...(trip ? { product: trip.product, origin: trip.origin, destination: trip.destination, trainNumber: trip.trainNumber } : {}) };
}
