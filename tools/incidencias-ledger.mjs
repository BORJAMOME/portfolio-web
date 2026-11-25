// Un aviso oficial = una unidad; cambios de texto y consultas repetidas no suman.
export function madridDate(instant) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
}

export function collect(previous, feed, instant = new Date().toISOString()) {
  if (previous.schema !== 1 || !Array.isArray(previous.records) || !Array.isArray(previous.snapshots)) throw new Error('Histórico no válido');
  const timestamp = Number(feed?.header?.timestamp);
  if (!Number.isFinite(timestamp) || !Array.isArray(feed.entity)) throw new Error('Respuesta GTFS-RT no válida');
  const age = new Date(instant).getTime() / 1000 - timestamp;
  if (age > 86400 || age < -300) throw new Error('La fuente tiene una fecha obsoleta o futura');
  const date = madridDate(instant), records = structuredClone(previous.records), byId = new Map(records.map(r => [r.id, r]));
  const ids = new Set(), texts = new Map();
  for (const entity of feed.entity) {
    if (!entity.alert || typeof entity.id !== 'string' || !entity.id) throw new Error('Aviso sin identificador o contenido');
    const repeated = ids.has(entity.id);
    ids.add(entity.id);
    const a = entity.alert;
    const translated = value => (value?.translation?.find(t => t.language === 'es') || value?.translation?.[0])?.text || '';
    const text = translated(a.descriptionText) || translated(a.headerText);
    if (!text.trim()) throw new Error('Aviso sin texto');
    const record = byId.get(entity.id) || { id: entity.id, firstSeen: date };
    const parts = texts.get(entity.id) || new Set(); parts.add(text); texts.set(entity.id, parts);
    Object.assign(record, { lastSeen: date, text: [...parts].join('\n\n'), routes: [...new Set([...(repeated ? record.routes : []), ...(a.informedEntity || []).map(e => e.routeId).filter(Boolean)])], stops: [...new Set([...(repeated ? record.stops : []), ...(a.informedEntity || []).map(e => e.stopId).filter(Boolean)])], activePeriod: [...new Map([...(repeated ? record.activePeriod : []), ...(a.activePeriod || [])].map(p => [JSON.stringify(p), p])).values()] });
    if (!byId.has(entity.id)) { records.push(record); byId.set(entity.id, record); }
  }
  // Conserva consultas anteriores; repetir el mismo día sustituye solo esa muestra.
  const snapshot = { date, collectedAt: instant, sourceTimestamp: new Date(timestamp * 1000).toISOString(), ids: [...ids].sort() };
  return { ...previous, updatedAt: instant, records: records.sort((a, b) => a.firstSeen.localeCompare(b.firstSeen) || a.id.localeCompare(b.id)), snapshots: [...previous.snapshots.filter(s => s.date !== date), snapshot].sort((a, b) => a.date.localeCompare(b.date)) };
}

export function monthlySummary(data, year) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const samples = data.snapshots.filter(s => s.date.startsWith(month)).length;
    return { month, samples, count: data.records.filter(r => r.firstSeen.startsWith(month)).length };
  });
}
