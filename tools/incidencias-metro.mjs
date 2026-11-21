// API oficial documentada: https://www.metrobilbao.eus/es/open-data/dataset/api-guide
// Solo Metro Bilbao L1/L2. No representa Metro Bilbao L3 (Euskotren).
const BILBAO = Object.freeze({
  id: 'metro-bilbao',
  name: 'Metro Bilbao · avisos',
  url: 'https://cms.metrobilbao.eus/get/open_data/json/avisos/es',
  catalog: 'https://www.metrobilbao.eus/es/open-data/dataset/avisos',
  license: null,
  licenseNote: 'Portal oficial de datos abiertos; no se ha localizado una licencia específica en la ficha.',
  serviceTypes: ['metro'],
  coverage: 'Avisos publicados por Metro Bilbao (L1/L2), incluidos servicios especiales y accesibilidad. No incluye la L3 de Euskotren.'
});

const plain = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#0*39;/gi, "'").replace(/\s+/g, ' ').trim();
const published = value => value !== false && value !== 0 && value !== '0';

function normalizeBilbao(row) {
  if (!row || (typeof row.id !== 'string' && typeof row.id !== 'number') || String(row.id).trim() === '') throw new Error('Aviso de Metro Bilbao sin identificador');
  const title = plain(row.title_es || row.title);
  if (!title) throw new Error('Aviso de Metro Bilbao sin título');
  const text = plain(row.description_es || row.description || row.body_es || row.body || title);
  return {
    externalId: String(row.id), title, text,
    url: 'https://www.metrobilbao.eus/es/avisos',
    serviceTypes: ['metro'], routes: [],
    stops: row.station_id !== null && row.station_id !== undefined && String(row.station_id) !== '' ? [String(row.station_id)] : [],
    // La red abarca varios municipios: no se atribuyen todos los avisos a Bilbao capital.
    places: [{ community: 'País Vasco', province: 'Bizkaia', city: null, basis: 'operator' }],
    kind: row.type === 'Aviso_servicio_especial' || String(row.id) === 'special_service' ? 'servicio-especial' : 'aviso',
    cause: null, effect: null, startedAt: null, endsAt: null,
    // Son fechas de publicación, no fechas confirmadas de inicio o resolución de la incidencia.
    publishedAt: row.publish_start_date || row.created_at || null,
    publicationEndsAt: row.publish_end_date || null,
    sourceType: plain(row.type) || null
  };
}

async function fetchBilbao(fetchJson) {
  const records = [], seen = new Map();
  let offset = 0;
  for (let page = 0; page < 100; page++) {
    const url = new URL(BILBAO.url);
    url.searchParams.set('limit', '500'); url.searchParams.set('offset', String(offset));
    const body = await fetchJson(url.href);
    if (!body || !Array.isArray(body.data)) throw new Error('Respuesta de avisos de Metro Bilbao no válida');
    const count = body.meta?.count === undefined ? null : Number(body.meta.count);
    if (count !== null && (!Number.isInteger(count) || count < 0)) throw new Error('Recuento de Metro Bilbao no válido');
    if (!body.data.length) {
      if (count !== null && offset < count) throw new Error('Respuesta de Metro Bilbao incompleta');
      return records;
    }
    for (const row of body.data) {
      if (!published(row.is_published)) continue;
      const record = normalizeBilbao(row);
      // El identificador es estable, pero no se descarta una estación adicional si se repite.
      if (seen.has(record.externalId)) {
        const previous = seen.get(record.externalId);
        previous.stops = [...new Set([...previous.stops, ...record.stops])];
        if (previous.title !== record.title || previous.text !== record.text) throw new Error('Identificador de Metro Bilbao con textos incompatibles');
      } else { records.push(record); seen.set(record.externalId, record); }
    }
    offset += body.data.length;
    if (count !== null && offset >= count) return records;
    if (count === null && body.data.length < 500) return records;
  }
  throw new Error('Metro Bilbao supera el límite de paginación; no se guarda una consulta parcial');
}

export async function fetchMetroSources({ fetchJson }) {
  if (typeof fetchJson !== 'function') throw new TypeError('Se necesita fetchJson');
  try {
    return [{ source: { ...BILBAO }, records: await fetchBilbao(fetchJson), sourceTimestamp: null }];
  } catch (error) {
    // El colector debe conservar la última consulta correcta cuando existe error.
    return [{ source: { ...BILBAO }, records: [], sourceTimestamp: null, error: error.message }];
  }
}
