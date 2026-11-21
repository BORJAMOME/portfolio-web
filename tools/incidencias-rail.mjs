// Fuentes ferroviarias abiertas. No se republica HTML de Adif sin autorización.
const FGC_BASE = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/';
const FGC = {
  id: 'fgc-alerts', name: 'FGC · avisos oficiales',
  url: FGC_BASE + 'alerts-gtfs_realtime/records/?limit=1',
  catalog: 'https://dadesobertes.fgc.cat/explore/assets/alerts-gtfs_realtime/',
  license: 'https://creativecommons.org/licenses/by/4.0/',
  serviceTypes: ['metro', 'cercanias', 'ferroviario_sin_detallar'],
  coverage: 'Avisos GTFS-RT publicados por FGC; Cataluña. Tipos de línea según su catálogo GTFS.'
};
const ADIF = [
  { id: 'adif-estado-red', name: 'Adif · estado de la red', url: 'https://www.adif.es/viajeros/estado-de-la-red' },
  { id: 'adif-avisos', name: 'Adif · avisos y obras', url: 'https://www.adif.es/viajeros/avisos' }
].map(source => ({ ...source, catalog: source.url, license: 'https://www.adif.es/aviso-legal', serviceTypes: ['ferroviario_sin_detallar'], coverage: 'Información pública de infraestructura. Consulta en el sitio oficial; republicación no integrada.' }));

// Lector acotado de los tipos wire utilizados por GTFS-RT; conserva campos desconocidos.
// Se rechazan longitudes fuera del buffer, varints truncados y enteros inseguros.
function protobuf(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > 16 * 1024 * 1024) throw new Error('Feed demasiado grande');
  const fields = new Map(); let offset = 0;
  const varint = () => {
    let value = 0n, shift = 0n;
    for (let i = 0; i < 10; i++) {
      if (offset >= bytes.length) throw new Error('Varint truncado');
      const b = bytes[offset++]; value |= BigInt(b & 127) << shift;
      if (!(b & 128)) { if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Entero protobuf fuera de rango'); return Number(value); }
      shift += 7n;
    }
    throw new Error('Varint inválido');
  };
  while (offset < bytes.length) {
    const tag = varint(), field = Math.floor(tag / 8), wire = tag & 7;
    if (!field) throw new Error('Campo protobuf cero');
    let value;
    if (wire === 0) value = varint();
    else if (wire === 1 || wire === 5 || wire === 2) {
      const length = wire === 2 ? varint() : wire === 1 ? 8 : 4;
      if (length > bytes.length - offset) throw new Error('Campo protobuf truncado');
      value = bytes.subarray(offset, offset + length); offset += length;
    } else throw new Error('Wire protobuf no admitido');
    if (!fields.has(field)) fields.set(field, []);
    fields.get(field).push({ wire, value });
  }
  return fields;
}
const values = (fields, key, wire) => (fields.get(key) || []).filter(v => v.wire === wire).map(v => v.value);
const first = (fields, key, wire) => values(fields, key, wire)[0];
const string = bytes => bytes ? new TextDecoder('utf-8', { fatal: true }).decode(bytes) : '';
const translated = bytes => {
  if (!bytes) return '';
  const entries = values(protobuf(bytes), 1, 2).map(b => { const f = protobuf(b); return { text: string(first(f, 1, 2)), language: string(first(f, 2, 2)) }; });
  return (entries.find(t => /^es(?:-|$)/.test(t.language)) || entries.find(t => /^ca(?:-|$)/.test(t.language)) || entries[0])?.text || '';
};
const iso = seconds => seconds === undefined ? null : new Date(seconds * 1000).toISOString();
const unique = list => [...new Set(list.filter(Boolean))];

export function decodeFgcAlerts(input, routeRows = []) {
  const feed = protobuf(input), headerBytes = first(feed, 1, 2);
  if (!headerBytes) throw new Error('GTFS-RT sin cabecera');
  const header = protobuf(headerBytes), version = string(first(header, 1, 2));
  if (!['1.0', '2.0'].includes(version)) throw new Error('Versión GTFS-RT no válida');
  const timestamp = first(header, 3, 0);
  const routes = new Map(routeRows.map(r => [r.route_id, r]));
  const records = [];
  for (const raw of values(feed, 2, 2)) {
    const entity = protobuf(raw), alertBytes = first(entity, 5, 2);
    if (first(entity, 2, 0) === 1 || !alertBytes) continue;
    const externalId = string(first(entity, 1, 2));
    if (!externalId) throw new Error('Aviso GTFS-RT sin identificador');
    const alert = protobuf(alertBytes), selectors = values(alert, 5, 2).map(protobuf);
    const routeIds = unique(selectors.map(s => string(first(s, 2, 2))));
    const stopIds = unique(selectors.map(s => string(first(s, 5, 2))));
    const serviceTypes = unique(routeIds.map(id => {
      const route = routes.get(id);
      if (['Subway', '1', 1].includes(route?.route_type)) return 'metro';
      // S = suburbano en el catálogo FGC; el resto de Rail no se convierte en regional por conjetura.
      if (['Rail', '2', 2].includes(route?.route_type) && /^S\d+$/.test(route?.route_short_name || '')) return 'cercanias';
      if (['Tram', '0', 0].includes(route?.route_type)) return 'tranvia';
      return 'ferroviario_sin_detallar';
    }));
    const title = translated(first(alert, 10, 2)), description = translated(first(alert, 11, 2));
    if (!(title || description).trim()) throw new Error('Aviso GTFS-RT sin texto');
    const effect = first(alert, 7, 0), cause = first(alert, 6, 0);
    const periods = values(alert, 1, 2).map(protobuf);
    const starts = periods.map(p => first(p, 1, 0)).filter(v => v !== undefined);
    const ends = periods.map(p => first(p, 2, 0));
    records.push({ externalId, title: title || description, text: description || title,
      url: translated(first(alert, 8, 2)) || FGC.catalog,
      serviceTypes: serviceTypes.length ? serviceTypes : ['ferroviario_sin_detallar'],
      routes: routeIds, stops: stopIds,
      places: [{ community: 'Cataluña', province: null, city: null, basis: 'source' }],
      kind: effect === 11 ? 'accesibilidad' : effect === 1 ? 'interrupcion' : effect === 3 ? 'retraso' : cause === 10 || cause === 9 ? 'obras' : 'aviso',
      cause: cause === undefined ? null : String(cause), effect: effect === undefined ? null : String(effect),
      startedAt: starts.length ? iso(Math.min(...starts)) : null,
      endsAt: ends.length && ends.every(v => v !== undefined) ? iso(Math.max(...ends)) : null
    });
  }
  return { records, sourceTimestamp: iso(timestamp) };
}

export async function fetchRailSources({ fetchJson, fetchBinary, now = new Date().toISOString() }) {
  const results = ADIF.map(source => ({ source: { ...source, status: 'not_integrated' }, records: null, sourceTimestamp: null,
    error: 'No integrada: el aviso legal de Adif exige autorización para reproducir sus contenidos. No se ha verificado un feed abierto reutilizable; consulta la web oficial.' }));
  try {
    const listing = await fetchJson(FGC.url), file = listing?.results?.[0]?.file;
    if (listing.total_count !== 1 || !file?.url || file.format !== 'pb') throw new Error('Catálogo FGC de descargas no válido');
    const fileUrl = new URL(file.url);
    if (fileUrl.protocol !== 'https:' || fileUrl.hostname !== 'dadesobertes.fgc.cat' || !fileUrl.pathname.startsWith('/api/explore/v2.1/catalog/datasets/alerts-gtfs_realtime/files/')) throw new Error('Descarga FGC fuera del origen oficial');
    let routeRows = [];
    try {
      const catalog = await fetchJson(FGC_BASE + 'gtfs_routes/records/?select=route_id,route_short_name,route_long_name,route_type&limit=100');
      if (Array.isArray(catalog.results) && catalog.total_count <= catalog.results.length) routeRows = catalog.results;
    } catch { /* Fallar el catálogo no hace desaparecer avisos: se conserva tipo sin detallar. */ }
    const binary = fetchBinary ? await fetchBinary(file.url) : await (async () => { const response = await fetch(file.url, { signal: AbortSignal.timeout(30000) }); if (!response.ok) throw new Error('FGC: HTTP ' + response.status); return new Uint8Array(await response.arrayBuffer()); })();
    const decoded = decodeFgcAlerts(binary, routeRows);
    if (decoded.sourceTimestamp && Date.parse(decoded.sourceTimestamp) > Date.parse(now) + 300000) throw new Error('FGC tiene una fecha futura');
    results.push({ source: FGC, ...decoded, error: null });
  } catch (error) {
    results.push({ source: FGC, records: null, sourceTimestamp: null, error: String(error.message || error) });
  }
  return results;
}
