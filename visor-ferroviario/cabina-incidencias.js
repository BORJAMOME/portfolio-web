/* Histórico semanal independiente de la carga de oferta y del resto de Cabina. */
(function () {
  'use strict';
  // El histórico y el listado van plegados (#c-incidencias es un <details>); se pintan en su cuerpo.
  const box = document.getElementById('c-incidencias'), host = box.querySelector('.cb-more-body') || box;
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
  const date = value => new Date(value.length === 10 ? value + 'T12:00:00Z' : value).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', year: 'numeric', ...(value.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}) });
  const currentYear = () => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date()));
  /* Tipo de aviso por palabras clave (castellano y euskera; el orden importa: el primero que encaja). */
  const TIPOS = [
    ['acc', 'Accesibilidad', /ascensor|escalera|igogailu|eskailera|accesib|inaccesib|plataforma|acceso principal|sarbide/i],
    ['hue', 'Huelgas', /huelga|greba/i],
    ['inc', 'Incidencias técnicas', /incidencia|aver[ií]a|matxura|\btemporal\b|restablec|subsanad/i],
    ['obr', 'Obras y autobús', /obra|autob[uú]s|plan alternativo|servicio alternativo|lanak|trabajos|sin servicio|suspend|cerrad|itxita|tramo|circulaci[oó]n ferroviaria|servicio ferroviario/i]
  ];
  const OTROS = ['otr', 'Información y otros'];
  const tipoDe = text => TIPOS.find(([, , re]) => re.test(text)) || OTROS;
  // Núcleo: prefijo del código de línea del GTFS (10 = Madrid…) o código de estación (capas/analisis.json · nucleos).
  const nucleosDe = (r, N) => N ? [...new Set([...r.routes.map(x => N.prefijos[String(x).slice(0, 2)]), ...r.stops.map(x => N.estaciones[x])].filter(Boolean))] : [];
  function bars(items, max) {
    const ul = el('ul', undefined, 'hb'), M = max || Math.max(1, ...items.map(i => i.value));
    for (const it of items) {
      const li = el('li', undefined, it.hi ? 'hi' : undefined), lab = el('span', it.label, 'lab'); lab.title = it.label;
      const track = el('span', undefined, 'track'); track.setAttribute('aria-hidden', 'true');
      if (it.value) { const s = el('span', undefined, 'seg s0'); s.style.width = (100 * it.value / M) + '%'; track.append(s); }
      const val = el('span', String(it.value), 'val'); if (it.extra) val.append(el('small', it.extra));
      li.append(lab, track, val); ul.append(li);
    }
    return ul;
  }
  /* Resumen de los avisos activos en la última consulta: titular y dos gráficos (por tipo y por núcleo). */
  function resumen(data, latest, N) {
    const h2 = document.getElementById('incidencias-t'), byType = document.getElementById('c-inc-tipo'), byNuc = document.getElementById('c-inc-nucleo');
    if (!byType || !byNuc) return;
    if (!latest) { byType.replaceChildren(el('h3', 'Avisos activos por tipo'), el('p', 'Pendiente de la primera consulta oficial.', 'cb-empty')); byNuc.replaceChildren(); return; }
    const ids = new Set(latest.ids), act = data.records.filter(r => ids.has(r.id)).map(r => ({...r, tipo: tipoDe(r.text), nucs: nucleosDe(r, N)}));
    const cuenta = [...TIPOS, OTROS].map(([k, label]) => ({k, label, value: act.filter(r => r.tipo[0] === k).length})).filter(x => x.value).sort((a, b) => b.value - a.value);
    if (cuenta[0]) cuenta[0].hi = true;
    byType.replaceChildren(el('h3', 'Avisos activos por tipo'), el('p', act.length + ' avisos presentes en la consulta del ' + date(latest.collectedAt).replace(/,.*/, '') + ' · clasificados por palabras clave del texto', 'sub'),
      bars(cuenta.map(x => ({...x, extra: Math.round(100 * x.value / act.length) + ' %'}))),
      el('p', 'Accesibilidad: ascensores, escaleras o accesos fuera de servicio y estaciones no accesibles. Obras y autobús: obras, cortes de vía, estaciones cerradas y servicio alternativo por carretera. Huelgas: también los avisos de que se ha desconvocado. Un aviso por identificador oficial de Renfe: varios pueden referirse al mismo suceso (en Alfafar hay cuatro, uno por ascensor) y un aviso no equivale a trenes afectados.', 'cb-note'));
    const nucs = new Map();
    for (const r of act) for (const n of (r.nucs.length ? r.nucs : ['Sin núcleo'])) { const x = nucs.get(n) || {total: 0, acc: 0, obr: 0}; x.total++; if (r.tipo[0] === 'acc') x.acc++; if (r.tipo[0] === 'obr') x.obr++; nucs.set(n, x); }
    const rows = [...nucs].sort((a, b) => b[1].total - a[1].total);
    byNuc.replaceChildren(el('h3', 'Avisos activos por núcleo'), el('p', 'Núcleo por el código de línea o de estación del aviso', 'sub'),
      bars(rows.map(([n, x], i) => ({label: n, value: x.total, hi: i === 0, extra: [x.acc ? x.acc + ' de accesibilidad' : '', x.obr ? x.obr + ' de obras' : ''].filter(Boolean).join(' · ')}))));
    if (h2) {
      const acc = act.filter(r => r.tipo[0] === 'acc').length, obr = act.filter(r => r.tipo[0] === 'obr').length, [n1, x1] = rows[0] || [];
      h2.textContent = `${act.length} avisos activos en Cercanías: ${acc} son de accesibilidad (sobre todo ascensores fuera de servicio) y ${obr} de obras o servicio por autobús` + (n1 && n1 !== 'Sin núcleo' ? `; ${n1} acumula ${x1.total}` : '');
    }
  }
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
      const [response, N] = await Promise.all([fetch('capas/incidencias.json', { cache: 'no-store' }),
        fetch('capas/analisis.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(a => a?.nucleos || null).catch(() => null)]);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (data.schema !== 1 || !Array.isArray(data.records) || !Array.isArray(data.snapshots)) throw new Error('Histórico no válido');
      const latest = data.snapshots.at(-1), latestIds = new Set(latest?.ids || []);
      try { resumen(data, latest, N); } catch (e) { console.error('Incidencias · resumen:', e); }
      const sum = box.querySelector('summary'); if (sum) sum.textContent = 'Histórico mensual y listado de los ' + data.records.length + ' avisos registrados';
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
        // Solo los meses con seguimiento posible: desde la primera consulta guardada hasta el mes en curso (sin filas vacías
        // de antes de empezar ni de meses que aún no han llegado).
        const first = data.snapshots[0]?.date.slice(0, 7), now = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Europe/Madrid' }).format(new Date()).slice(0, 7);
        const months = Array.from({ length: 12 }, (_, i) => {
          const month = year + '-' + String(i + 1).padStart(2, '0');
          const samples = data.snapshots.filter(s => s.date.startsWith(month)).length;
          const count = annual.filter(r => r.firstSeen.startsWith(month)).length;
          accumulated += count;
          return [month, new Date(Number(year), i, 1).toLocaleDateString('es-ES', { month: 'long' }), samples ? String(count) : '—', String(accumulated), String(samples)];
        }).filter(([month]) => first && month >= first && month <= now).map(([, ...row]) => row);
        if (months.length) summary.append(table(['Mes', 'Nuevos avisos', 'Acumulado registrado', 'Consultas'], months, 'Recuento por primera detección · ' + year));
        else summary.append(el('p', first ? 'Sin consultas guardadas en ' + year + '.' : 'El recuento empezará con la primera consulta.', 'cb-empty'));
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
      document.getElementById('c-inc-tipo')?.replaceChildren(el('h3', 'Avisos activos por tipo'), el('p', 'No se ha podido cargar el histórico. Esto no significa que no haya incidencias.', 'cb-empty'));
      const retry = el('button', 'Reintentar'); retry.type = 'button'; retry.addEventListener('click', start); host.append(retry);
    }
  }
  start();
})();
