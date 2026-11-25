/* Agregados por ruta y día. Conserva cada patrón de paradas: no supone que todos
   los trenes de una línea de Cercanías recorren la línea completa. */
export function routeActivity(trains, stationIndex, week) {
  const calls = new Map(), links = new Map();
  for (const train of trains) {
    const days = week.map((day, i) => train.days.has(day) ? i : -1).filter(i => i >= 0);
    if (!days.length) continue;
    const stops = train.stops.map(code => stationIndex.get(code));
    for (const station of new Set(stops.filter(Number.isInteger))) {
      if (!calls.has(station)) calls.set(station, Array(7).fill(0));
      for (const day of days) calls.get(station)[day]++;
    }
    const mask = days.reduce((value, day) => value | (1 << day), 0);
    for (let i = 0; i < stops.length; i++) for (let j = i + 1; j < stops.length; j++) {
      const a = stops[i], b = stops[j];
      if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) continue;
      const key = a + ':' + b;
      links.set(key, (links.get(key) || 0) | mask);
    }
  }
  return {calls: [...calls].sort((a,b) => a[0]-b[0]),
    links: [...links].map(([key, mask]) => [...key.split(':').map(Number), mask]).sort((a,b) => a[0]-b[0] || a[1]-b[1])};
}
