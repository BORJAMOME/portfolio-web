/* Histórico semanal independiente de la carga de oferta y del resto de Cabina. */
(function () {
  'use strict';
  const host = document.getElementById('c-incidencias');
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
  const date = value => new Date(value.length === 10 ? value + 'T12:00:00Z' : value).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', ...(value.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}) });
  const currentYear = () => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date()));
  function table(headers, rows, caption) {
    const wrap = el('div', undefined, 'tbl-wrap'), t = el('table'), head = el('thead'), tr = el('tr'), body = el('tbody');
    t.append(el('caption', caption));
    for (const title of headers) { const th = el('th', title); th.scope = 'col'; tr.append(th); }
    head.append(tr); t.append(head);
    for (const row of rows) { const r = el('tr'); for (const text of row) r.append(el('td', text)); body.append(r); }
    t.append(body); wrap.append(t); return wrap;
  }
  async function start() {
    host.replaceChildren(el('p', 'Cargando el histórico de incidencias…', 'cb-note'));
    try {
      const response = await fetch('capas/incidencias.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.schema !== 1 || !Array.isArray(data.records) || !Array.isArray(data.snapshots)) throw new Error('Histórico no válido');
      const latest = data.snapshots.at(-1), latestIds = new Set(latest?.ids || []);
      host.replaceChildren(el('h3', 'Avisos e incidencias de Cercanías'));
      const status = el('p', latest ? 'Última consulta: ' + date(latest.collectedAt) + ' · Fuente actualizada: ' + date(latest.sourceTimestamp) : 'Pendiente de la primera consulta oficial. Todavía no hay observaciones registradas.', 'cb-note');
      status.setAttribute('role', 'status'); host.append(status);
      if (latest && Date.now() - new Date(latest.collectedAt).getTime() > 8 * 86400000) host.append(el('p', 'Consulta desactualizada: han pasado más de ocho días. Los avisos de la tabla pueden haber cambiado.', 'cb-empty'));
      host.append(el('p', 'Consulta semanal, los lunes. Incluye avisos de circulación, obras y accesibilidad publicados por Renfe para Cercanías. No representa todas las incidencias de España ni ofrece retrasos en directo.', 'cb-note'));
      const controls = el('div', undefined, 'ci-controls'), label = el('label', 'Año '), yearSelect = el('select');
      yearSelect.id = 'ci-year'; label.htmlFor = yearSelect.id;
      const years = [...new Set([currentYear(), ...data.records.map(r => Number(r.firstSeen.slice(0, 4))), ...data.snapshots.map(s => Number(s.date.slice(0, 4)))])].sort((a, b) => b - a);
      for (const year of years) { const option = el('option', String(year)); option.value = String(year); yearSelect.append(option); }
      yearSelect.value = String(currentYear());
      const searchLabel = el('label', 'Buscar aviso '), search = el('input'); search.id = 'ci-search'; search.type = 'search'; searchLabel.htmlFor = search.id;
      controls.append(label, yearSelect, searchLabel, search); host.append(controls);
      const summary = el('div', undefined, 'ci-summary'), listing = el('div'); host.append(summary, listing);
      let pageIndex = 0;
      function paint() {
        const year = yearSelect.value, annual = data.records.filter(r => r.firstSeen.startsWith(year + '-'));
        summary.replaceChildren(el('p', `${annual.length} avisos únicos incorporados en ${year}`, 'ci-total'));
        let accumulated = 0;
        const months = Array.from({ length: 12 }, (_, i) => {
          const month = year + '-' + String(i + 1).padStart(2, '0');
          const samples = data.snapshots.filter(s => s.date.startsWith(month)).length;
          const count = annual.filter(r => r.firstSeen.startsWith(month)).length;
          accumulated += count;
          return [new Date(Number(year), i, 1).toLocaleDateString('es-ES', { month: 'long' }), samples ? String(count) : '—', String(accumulated), String(samples)];
        });
        summary.append(table(['Mes', 'Nuevos avisos', 'Acumulado registrado', 'Consultas'], months, 'Recuento por primera detección · ' + year));
        summary.append(el('p', 'Cada identificador oficial cuenta una vez, en el mes de su primera detección. El acumulado anual empieza en cero cada enero y conserva los años anteriores. «—» indica que no hubo consultas ese mes; el acumulado solo suma lo registrado.', 'cb-note'));
        const query = search.value.trim().toLocaleLowerCase('es');
        const rows = data.records.filter(r => (r.firstSeen.startsWith(year + '-') || (latest?.date.startsWith(year + '-') && latestIds.has(r.id))) && [r.id, r.text, ...r.routes, ...r.stops].join(' ').toLocaleLowerCase('es').includes(query)).sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || a.id.localeCompare(b.id));
        listing.replaceChildren(el('h4', `Avisos registrados · ${rows.length} resultados`));
        const pageCount = Math.max(1, Math.ceil(rows.length / 10)); pageIndex = Math.min(pageIndex, pageCount - 1);
        if (rows.length) listing.append(table(['Aviso oficial', 'Descripción', 'Ámbito (códigos oficiales)', 'Primera detección', 'Última detección', 'Última consulta'], rows.slice(pageIndex * 10, (pageIndex + 1) * 10).map(r => [r.id, r.text, [...r.routes.map(x => 'Línea ' + x), ...r.stops.map(x => 'Estación ' + x)].join(' · ') || 'Sin ámbito especificado', date(r.firstSeen), date(r.lastSeen), latestIds.has(r.id) ? 'Presente' : 'No observado']), 'Avisos detectados en el año y avisos anteriores presentes en su última consulta'));
        else listing.append(el('p', latest ? 'No hay avisos registrados para esta selección.' : 'El recuento comenzará con la primera consulta correcta; no se han reconstruido meses anteriores.', 'cb-empty'));
        if (rows.length) {
          const pages = el('div', undefined, 'ci-controls'), previous = el('button', 'Anterior'), next = el('button', 'Siguiente'), count = el('span', `Página ${pageIndex + 1} de ${pageCount}`);
          count.setAttribute('role', 'status'); previous.type = next.type = 'button'; previous.disabled = pageIndex === 0; next.disabled = pageIndex === pageCount - 1;
          previous.addEventListener('click', () => { pageIndex--; paint(); listing.querySelector('h4').focus(); });
          next.addEventListener('click', () => { pageIndex++; paint(); listing.querySelector('h4').focus(); });
          listing.querySelector('h4').tabIndex = -1; pages.append(previous, count, next); listing.append(pages);
        }
        listing.append(el('p', '«Presente» se refiere a la última consulta guardada, no al estado actual. «No observado» no confirma su resolución. Las incidencias que aparezcan y desaparezcan entre consultas semanales pueden no registrarse.', 'cb-note'));
      }
      yearSelect.addEventListener('change', () => { pageIndex = 0; paint(); }); search.addEventListener('input', () => { pageIndex = 0; paint(); }); paint();
      const source = el('p', undefined, 'cb-note'), link = el('a', 'Origen de los datos: Renfe Operadora'); link.href = data.source.catalog;
      const license = el('a', 'Condiciones de reutilización'); license.href = data.source.license;
      source.append(link, ' · ', license); host.append(source);
    } catch (error) {
      console.error('Incidencias:', error);
      host.replaceChildren(el('h3', 'Avisos e incidencias de Cercanías'), el('p', 'No se ha podido cargar el histórico. Esto no significa que no haya incidencias.', 'cb-empty'));
      const retry = el('button', 'Reintentar'); retry.type = 'button'; retry.addEventListener('click', start); host.append(retry);
    }
  }
  start();
})();
