import { madridDate } from './incidencias-ledger.mjs';

export const RENFE_ALERTS = { id: 'renfe-avisos', name: 'Renfe · avisos de Cercanías', url: 'https://gtfsrt.renfe.com/alerts.json', catalog: 'https://data.renfe.com/es/dataset/incidencias-avisos', license: 'https://data.renfe.com/es/legal', serviceTypes: ['cercanias'], coverage: 'Avisos de Cercanías y Rodalies publicados en GTFS-RT.' };
export const RENFE_DELAYS = { id: 'renfe-avldmd', name: 'Renfe · observaciones AV/LD/MD', url: 'https://gtfsrt.renfe.com/trip_updates_LD.json', catalog: 'https://data.renfe.com/es/dataset/horarios-viaje-alta-velocidad-larga-media-distancia', license: 'https://data.renfe.com/es/legal', serviceTypes: ['alta_velocidad', 'larga_distancia', 'regional'], coverage: 'Retrasos y cancelaciones por viaje GTFS observados en la consulta; no son avisos de incidencias ni un histórico de puntualidad.' };

export function validateTimestamp(feed, now) {
  const ts = Number(feed?.header?.timestamp), age = Date.parse(now) / 1000 - ts;
  if (!Number.isFinite(ts) || ts <= 0 || age > 86400 || age < -300 || !Array.isArray(feed.entity)) throw new Error('Fuente GTFS-RT no válida o desactualizada');
  return new Date(ts * 1000).toISOString();
}
const translated = x => (x?.translation?.find(t => t.language === 'es') || x?.translation?.[0])?.text || '';
export function normalizeRenfeAlerts(feed, now) {
  const sourceTimestamp = validateTimestamp(feed, now), grouped = new Map();
  for (const e of feed.entity) {
    if (!e.id || !e.alert) throw new Error('Aviso de Renfe no válido');
    const a = e.alert, text = translated(a.descriptionText) || translated(a.headerText);
    if (!text.trim()) throw new Error('Aviso sin descripción');
    const old = grouped.get(e.id), parts = new Set([...(old?.texts || []), text]);
    grouped.set(e.id, { externalId: e.id, texts: [...parts], title: translated(a.headerText) || '', text: [...parts].join('\n\n'), url: RENFE_ALERTS.catalog, serviceTypes: ['cercanias'], routes: [...new Set([...(old?.routes || []), ...(a.informedEntity || []).map(x => x.routeId).filter(Boolean)])], stops: [...new Set([...(old?.stops || []), ...(a.informedEntity || []).map(x => x.stopId).filter(Boolean)])], places: [], kind: 'aviso', cause: a.cause || null, effect: a.effect || null, activePeriod: a.activePeriod || [], derived: false });
  }
  return { source: RENFE_ALERTS, sourceTimestamp, records: [...grouped.values()].map(({ texts, ...r }) => r) };
}

export function normalizeRenfeDelays(feed, now) {
  const sourceTimestamp = validateTimestamp(feed, now), records = [], seen = new Set();
  for (const e of feed.entity) {
    const u = e.tripUpdate, trip = u?.trip;
    if (!u || !trip?.tripId || seen.has(trip.tripId)) continue;
    const cancelled = trip.scheduleRelationship === 'CANCELED' || trip.scheduleRelationship === 3;
    // Cada parada conserva su demora: no propagar la mayor demora a todo el trayecto.
    const observations = (u.stopTimeUpdate || []).flatMap(s => {
      const delay = s.arrival?.delay ?? s.departure?.delay;
      return Number.isFinite(delay) && delay > 0 ? [{ stopId: s.stopId || null, delaySeconds: delay, time: s.arrival?.time || s.departure?.time || null }] : [];
    });
    const delaySeconds = Number.isFinite(u.delay) ? u.delay : observations.length ? Math.max(...observations.map(s => s.delaySeconds)) : null;
    if (!cancelled && !(delaySeconds > 0)) continue;
    seen.add(trip.tripId);
    records.push({ externalId: trip.tripId, tripId: trip.tripId, title: cancelled ? 'Viaje marcado como cancelado' : 'Retraso observado en un viaje', text: cancelled ? 'Renfe marca este viaje GTFS como cancelado en la consulta guardada.' : `Demora publicada: ${Math.round(delaySeconds / 60)} min${observations.length > 1 ? ' (máxima de las paradas informadas; puede variar por parada)' : ''}.`, url: RENFE_DELAYS.catalog, serviceTypes: ['ferroviario_sin_detallar'], routes: trip.routeId ? [trip.routeId] : [], stops: [...new Set((u.stopTimeUpdate || []).map(s => s.stopId).filter(Boolean))], places: [], kind: cancelled ? 'cancelacion' : 'retraso', cause: null, effect: cancelled ? 'NO_SERVICE' : 'SIGNIFICANT_DELAYS', delaySeconds, observations, derived: true, startedAt: null, endsAt: null });
  }
  return { source: RENFE_DELAYS, sourceTimestamp, records };
}

export function migrateLedger(previous) {
  if (previous.schema === 2) return structuredClone(previous);
  if (previous.schema !== 1 || !Array.isArray(previous.records) || !Array.isArray(previous.snapshots)) throw new Error('Histórico no válido');
  return { schema: 2, updatedAt: previous.updatedAt, sources: [{ ...RENFE_ALERTS, status: previous.updatedAt ? 'ok' : 'pending', lastSuccess: previous.updatedAt, lastAttempt: previous.updatedAt, lastError: null }], records: previous.records.map(r => ({ ...r, id: RENFE_ALERTS.id + ':' + r.id, externalId: r.id, sourceId: RENFE_ALERTS.id, serviceTypes: ['cercanias'], places: [], kind: 'aviso', derived: false, url: RENFE_ALERTS.catalog })), snapshots: previous.snapshots.map(s => ({ ...s, sourceId: RENFE_ALERTS.id, ids: s.ids.map(id => RENFE_ALERTS.id + ':' + id) })) };
}

export function applySourceResults(previous, results, now) {
  const next = migrateLedger(previous), date = madridDate(now), sources = new Map(next.sources.map(s => [s.id, s])), records = new Map(next.records.map(r => [r.id, r]));
  let successes = 0;
  for (const result of results) {
    const source = result.source;
    if (!source?.id) throw new Error('Fuente sin identificador');
    const old = sources.get(source.id);
    if (result.error || !Array.isArray(result.records)) {
      sources.set(source.id, { ...old, ...source, status: result.status || 'error', lastAttempt: now, lastSuccess: old?.lastSuccess || null, lastError: result.error || 'Sin conector de avisos verificado' });
      continue;
    }
    const current = new Map();
    // Validar toda la fuente antes de tocar su histórico.
    for (const r of result.records) {
      if (!r.externalId || !r.text?.trim()) throw new Error('Registro normalizado sin ID o descripción: ' + source.id);
      const id = source.id + ':' + r.externalId;
      if (current.has(id)) throw new Error('Registro normalizado duplicado: ' + id);
      current.set(id, { ...r, id, sourceId: source.id });
    }
    for (const [id, r] of current) {
      const oldRecord = records.get(id);
      records.set(id, { ...oldRecord, ...r, firstSeen: oldRecord?.firstSeen || date, lastSeen: date });
    }
    next.snapshots = next.snapshots.filter(s => !(s.sourceId === source.id && s.date === date));
    next.snapshots.push({ sourceId: source.id, date, collectedAt: now, sourceTimestamp: result.sourceTimestamp || null, ids: [...current.keys()].sort() });
    sources.set(source.id, { ...old, ...source, status: 'ok', lastAttempt: now, lastSuccess: now, sourceTimestamp: result.sourceTimestamp || null, lastError: null });
    successes++;
  }
  next.updatedAt = now;
  next.lastRun = { attemptedAt: now, successfulSources: successes, failedSources: results.filter(r => r.error && r.status !== 'not_integrated').map(r => r.source.id) };
  next.sources = [...sources.values()].sort((a, b) => a.id.localeCompare(b.id));
  next.records = [...records.values()].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || a.id.localeCompare(b.id));
  next.snapshots.sort((a, b) => a.date.localeCompare(b.date) || a.sourceId.localeCompare(b.sourceId));
  return next;
}
