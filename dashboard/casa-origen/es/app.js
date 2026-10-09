(() => {
  const root = document.getElementById('co');
  const C = { acc: 'var(--co-acc)', deep: 'var(--co-deep)', pale: 'var(--co-pale)', neg: 'var(--co-neg)', pos: 'var(--co-pos)', ink: 'var(--co-ink)' };
  const LOC_COLOR = { 'Lavapiés': C.pale, 'Malasaña': C.deep };
  const UMBRAL = 2.5;
  const PAGES = ['resumen', 'carta', 'operacion', 'clientes', 'plan'];
  const FRANJAS = ['Apertura', 'Mañana', 'Mediodía', 'Tarde'];
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => [...el.querySelectorAll(s)];
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const rawLocal = () => dash.params().local ?? 'Ambos';
  const isCmp = () => rawLocal() === 'Comparar';
  const L = () => (isCmp() ? 'Ambos' : rawLocal());
  const FR = () => dash.params().franja ?? null;
  const scope = () => (isCmp() ? 'Lavapiés frente a Malasaña' : L() === 'Ambos' ? 'Ambos locales' : L());
  const who = () => (L() === 'Ambos' ? 'Casa Origen' : L());

  // ── Formats (es-ES) ──
  const nf = (o) => new Intl.NumberFormat('es-ES', o);
  const fInt = nf({ useGrouping: 'always', maximumFractionDigits: 0 });
  const fEur0 = nf({ style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
  const fEurK = nf({ style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
  const fEur2 = nf({ style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fPct1 = nf({ style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fPct0 = nf({ style: 'percent', maximumFractionDigits: 0 });
  const fD1 = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fD2 = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (v, s) => (v > 0 ? '+' : v < 0 ? '−' : '') + s;
  const fK = (v) => (Math.abs(v) < 10000 ? fEur0.format(v) : fEurK.format(v));
  const FMT = {
    int: (v) => fInt.format(v), year: (v) => String(v), eurk: fK, eur0: (v) => fEur0.format(v), eur2: (v) => fEur2.format(v),
    pct1: (v) => fPct1.format(v), pct0: (v) => fPct0.format(v), rp: (v) => fEur2.format(v), pctabs: (v) => fPct1.format(Math.abs(v)),
    delta: (v) => signed(v, fPct1.format(Math.abs(v))), pp: (v) => (Math.abs(v) < 0.05 ? 'igual' : signed(v, fD1.format(Math.abs(v)) + ' pp')),
    ppabs: (v) => fD1.format(Math.abs(v)) + ' pp', eurdiff: (v) => signed(v, fEur2.format(Math.abs(v))),
    text: (v) => String(v), lower: (v) => String(v).toLowerCase(), cap: (v) => String(v).charAt(0).toUpperCase() + String(v).slice(1),
    x2: (v) => '×' + fD2.format(v), x1: (v) => fD1.format(v) + '×', times: (v) => fD2.format(v) + ' veces',
    cent: (v) => fInt.format(Math.round(v)) + ' céntimos', ptsabs: (v) => fD1.format(Math.abs(v)) + ' puntos',
  };
  const NUMF = new Set(['int', 'eurk', 'eur0', 'eur2', 'pct1', 'pct0', 'rp', 'x1', 'x2', 'times', 'cent', 'ptsabs', 'pctabs', 'delta', 'pp']);
  const mesLabel = (m) => MES[Number(m.slice(5)) - 1] + ' ' + m.slice(0, 4);
  const enc = (s) => encodeURIComponent(s);

  // ── Helpers ──
  const drawn = new Set();
  const first = (key) => (drawn.has(key) ? false : (drawn.add(key), true));
  const sizes = new Map();
  function morph(e, prop, key, val, unit = '%') {
    const prev = sizes.get(key); sizes.set(key, val);
    if (RM || prev == null || Math.abs(prev - val) < 1e-6) { e.style[prop] = val + unit; return; }
    e.style[prop] = prev + unit;
    requestAnimationFrame(() => requestAnimationFrame(() => { e.style[prop] = val + unit; }));
  }
  function countTo(e, a, b, f) {
    const t0 = performance.now(), dur = 650, id = (e._anim = (e._anim || 0) + 1);
    const step = (t) => { if (e._anim !== id) return; const k = Math.min(1, (t - t0) / dur), q = 1 - Math.pow(1 - k, 3); e.textContent = f(a + (b - a) * q); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function failed(box) { const d = el('div', 'co-failed'); d.append(el('span', 'co-dot'), el('span', null, 'No se pudo cargar')); box.replaceChildren(d); }
  function ready(box, ...ds) {
    if (ds.every((d) => d.status === 'ok')) { box.classList.remove('dash-skeleton'); return true; }
    if (ds.some((d) => d.status === 'loading')) { box.replaceChildren(); box.classList.add('dash-skeleton'); return false; }
    box.classList.remove('dash-skeleton'); failed(box); return false;
  }
  function tip(card, evt, title, lines) {
    const t = card && $('.co-tip', card);
    if (!t) return;
    t.replaceChildren(el('div', 't', title), ...lines.map((l) => el('div', null, l)));
    t.hidden = false;
    const cr = card.getBoundingClientRect();
    let x = evt.clientX - cr.left + 14, y = evt.clientY - cr.top + 14;
    if (x + t.offsetWidth > cr.width - 4) x = evt.clientX - cr.left - t.offsetWidth - 14;
    if (y + t.offsetHeight > cr.height - 4) y = evt.clientY - cr.top - t.offsetHeight - 10;
    t.style.left = Math.max(4, x) + 'px'; t.style.top = Math.max(4, y) + 'px';
  }
  const untip = (card) => { const t = card && $('.co-tip', card); if (t) t.hidden = true; };
  const hover = (node, card, title, lines) => {
    node.addEventListener('mousemove', (e) => tip(card, e, title, typeof lines === 'function' ? lines() : lines));
    node.addEventListener('mouseleave', () => untip(card));
  };
  function findRow(rows, where, idx) {
    if (idx != null && idx !== '') return rows[Number(idx)];
    if (!where) return rows[0];
    const pairs = where.split('&').map((p) => p.split('=').map(decodeURIComponent));
    return rows.find((r) => pairs.every(([k, v]) => String(r[k]) === v));
  }
  const row = (src, where) => { const d = dash.data(src); return d.status === 'ok' ? findRow(d.data, where) : null; };
  const rows = (src) => { const d = dash.data(src); return d.status === 'ok' ? d.data : []; };
  function tone(e, v, fmt) {
    e.classList.remove('is-pos', 'is-neg', 'is-flat');
    if (v == null) return;
    const thr = fmt === 'pp' ? 0.5 : 0.01;
    e.classList.add(Math.abs(v) < thr ? 'is-flat' : (v > 0) === (e.dataset.good === 'up') ? 'is-pos' : 'is-neg');
  }
  function detectDark() {
    const p = el('span'); p.style.cssText = 'position:absolute;visibility:hidden;color:var(--color-fg)';
    root.append(p);
    const m = (getComputedStyle(p).color.match(/[\d.]+/g) || []).map(Number);
    p.remove();
    if (m.length >= 3) root.classList.toggle('is-dark', (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 > 0.55);
  }
  const dark = () => root.classList.contains('is-dark');

  // ── Marked values (with count-up) ──
  let fichaProd = null;
  function fill() {
    const local = L(), franja = selFranja();
    $$('[data-fmt]').forEach((e) => {
      if (e.dataset.wt) e.setAttribute('data-where', e.dataset.wt.replaceAll('{local}', local).replaceAll('{franja}', franja));
      const d = dash.data(e.dataset.source);
      if (d.status !== 'ok') { e.textContent = '—'; e._v = null; if (d.status !== 'loading') e.classList.remove('dash-skeleton'); return; }
      const r = findRow(d.data, e.getAttribute('data-where'), e.dataset.row);
      const v = r ? r[e.dataset.field] : null;
      e.classList.remove('dash-skeleton');
      const f = FMT[e.dataset.fmt];
      const prev = e._v; e._v = v;
      if (v == null) { e.textContent = '—'; }
      else if (!RM && typeof v === 'number' && typeof prev === 'number' && prev !== v && NUMF.has(e.dataset.fmt)) countTo(e, prev, v, f);
      else if (e._anim == null || prev !== v) { e._anim = (e._anim || 0) + 1; e.textContent = f(v); }
      if (e.dataset.good) tone(e, v, e.dataset.fmt);
    });
  }

  // ── Mark builder ──
  const M = (s, f, fmt, w, cls) => ({ s, f, fmt, w, cls });
  function node(p) {
    if (p == null) return document.createTextNode('');
    if (typeof p === 'string') return document.createTextNode(p);
    if (p instanceof Node) return p;
    const e = el('span', p.cls || null, '—');
    e.dataset.source = p.s; e.dataset.field = p.f; e.dataset.fmt = p.fmt;
    if (p.w != null) { if (p.w.startsWith('#')) e.dataset.row = p.w.slice(1); else e.dataset.wt = p.w; }
    return e;
  }
  const W_LOC = 'local={local}', W_DEL = 'local={local}&tipo_canal=Delivery', W_PRE = 'local={local}&tipo_canal=Presencial';

  // ── Hooks: change with tab and local ──
  const HOOKS = {
    resumen: () => {
      if (isCmp()) return { eyebrow: 'Resumen · ' + scope(),
        title: ['Lavapiés se ha quedado quieto (', M('kpis', 'var_revenue', 'delta', 'local=Lavapiés', 'bad'), ') mientras Malasaña vende un ', M('kpis', 'var_revenue', 'pct1', 'local=Malasaña', 'hl'), ' más.'],
        lede: ['Pero Malasaña abrió en julio de 2024. Comparando los mismos meses, de julio a diciembre vendió un ', M('comparable', 'var_comparable', 'pctabs', 'local=Malasaña', 'bad'), ' menos. Ninguno de los dos crece de verdad.'] };
      const k = row('kpis', 'local=' + L());
      const other = L() === 'Lavapiés' ? 'Malasaña' : L() === 'Malasaña' ? 'Lavapiés' : null;
      const ko = other && row('kpis', 'local=' + other);
      const comp = row('comparable', 'local=' + L());
      const title = !k || k.var_revenue >= 0.03
        ? [who() + ' ha vendido un ', M('kpis', 'var_revenue', 'pct1', W_LOC, 'hl'), ' más que el año pasado, pero cada cliente sigue gastando lo mismo: ', M('kpis', 'ticket_medio', 'eur2', W_LOC, 'ink'), ' por visita.']
        : [who() + ' se ha quedado quieto este año (', M('kpis', 'var_revenue', 'delta', W_LOC, 'bad'), ').',
          ...(ko && ko.var_revenue >= 0.03 ? [' Todo el crecimiento lo está poniendo ' + other + ', que vende un ', M('kpis', 'var_revenue', 'pct1', 'local=' + other, 'hl'), ' más.'] : [' Y el gasto por visita tampoco sube.'])];
      const tail = [' El margen que falta está en el mediodía, en los ', M('rfm_resumen', 'clientes_top', 'int', '#0', 'ink'), ' clientes fieles y en lo que se quedan las plataformas de delivery, un ', M('canal', 'comision_pct', 'pct0', W_DEL, 'bad'), ' de cada pedido.'];
      const lede = L() !== 'Lavapiés' && comp && comp.var_comparable < 0
        ? ['Ojo: casi todo ese salto es ' + (L() === 'Malasaña' ? 'su apertura en julio de 2024' : 'la apertura de Malasaña') + '. Comparando los mismos meses, de julio a diciembre se vendió un ', M('comparable', 'var_comparable', 'pctabs', W_LOC, 'bad'), ' menos que el año anterior.', ...tail]
        : ['Llenar más el local ya no basta.', ...tail];
      return { eyebrow: 'Resumen · ' + scope(), title, lede };
    },
    carta: () => ({
      eyebrow: 'Carta y cesta · ' + scope(),
      title: [(L() === 'Ambos' ? 'Con ' : 'En ' + L() + ', con '), M('abc_resumen', 'n_a', 'int', W_LOC, 'hl'), ' de los ', M('abc_resumen', 'productos', 'int', W_LOC), ' productos se hace el 70 % de la caja. Los ',
        M('abc_resumen', 'n_c', 'int', W_LOC, 'bad'), ' últimos apenas suman el ', M('abc_resumen', 'revenue_pct_c', 'pct1', W_LOC, 'bad'), '.'],
      lede: ['Una carta más corta es una cocina más rápida y menos producto a la basura. Y los tickets ya nos dicen qué juntar: ', M('combos_top', 'combo', 'text', 'puesto=1', 'ink'),
        ' salen juntos ', M('combos_top', 'lift', 'times', 'puesto=1', 'hl'), ' más de lo normal.'],
    }),
    operacion: () => {
      const o = row('ops_resumen', 'local=' + L());
      const title = !o || o.franjas_bajo_umbral > 0
        ? [(L() === 'Ambos' ? 'La ' : 'En ' + L() + ', la '), M('ops_resumen', 'franja_peor', 'lower', W_LOC, 'bad'), ' no se paga sola: cada silla factura ',
          M('ops_resumen', 'revpash_peor', 'rp', W_LOC, 'bad'), ' por hora y tenerla abierta cuesta 2,50 €.']
        : [(L() === 'Ambos' ? 'Todas' : 'En ' + L() + ', todas') + ' las franjas cubren lo que cuesta abrir. La más floja es la ', M('ops_resumen', 'franja_peor', 'lower', W_LOC, 'ink'), ', con ', M('ops_resumen', 'revpash_peor', 'rp', W_LOC, 'ink'), ' por silla y hora.'];
      return { eyebrow: 'Horarios · ' + scope(), title,
        lede: ['El fin de semana cada silla rinde ', M('ops_resumen', 'ratio_finde', 'x1', W_LOC, 'hl'), ' más que entre semana. Y lo que gasta un cliente depende de la hora a la que entra (hasta ',
          M('ops_resumen', 'rango_ticket_franja', 'eur2', W_LOC, 'ink'), ' de diferencia), mucho más que del día de la semana (', M('ops_resumen', 'rango_ticket_dia', 'eur2', W_LOC, 'ink'), ').'] };
    },
    clientes: () => ({
      eyebrow: 'Clientes y delivery · ' + scope(),
      title: [M('rfm_resumen', 'clientes_top', 'int', '#0', 'hl'), ' clientes fieles traen el ', M('rfm_resumen', 'pct_revenue_top', 'pct1', '#0', 'hl'), ' de las ventas. Otros ',
        M('rfm_resumen', 'at_risk_clientes', 'int', '#0', 'bad'), ' se están yendo, y con ellos ', M('rfm_resumen', 'at_risk_revenue', 'eurk', '#0', 'bad'), ' de historial.'],
      lede: [(L() === 'Ambos' ? 'Y en el delivery hay otra fuga silenciosa: ya es el ' : 'En ' + L() + ', el delivery ya es el '), M('canal', 'pct_revenue', 'pct1', W_DEL, 'ink'),
        ' de las ventas, pero después de la comisión solo deja un ', M('canal', 'margen_neto_pct', 'pct1', W_DEL, 'bad'), ' de margen. En la barra, lo mismo deja un ', M('canal', 'margen_neto_pct', 'pct1', W_PRE, 'hl'), '.'],
    }),
    plan: () => ({
      eyebrow: 'Plan de acción · ' + scope(),
      title: ['Cinco decisiones para el próximo trimestre' + (L() === 'Ambos' ? '' : ' en ' + L()) + '. Recuperar a los clientes que se van vale ',
        M('plan', 'impacto', 'eurk', 'local={local}&id=reactivar', 'hl'), ' de margen al año, y arreglar la ', M('ops_resumen', 'franja_peor', 'lower', W_LOC), ', ',
        M('plan', 'impacto', 'eurk', 'local={local}&id=franja', 'bad'), ' al año.'],
      lede: ['Empieza por el simulador: mueve los reguladores y mira cuánto margen gana la casa. Debajo, cada decisión con su responsable. Los importes son estimaciones con supuestos sencillos, para decidir por dónde empezar.'],
    }),
  };
  let hookKey = '';
  function buildHook() {
    const h = HOOKS[current]();
    const t = $('#hook-title'), l = $('#hook-lede');
    $('#hook-eyebrow-text').textContent = h.eyebrow;
    t.replaceChildren(...h.title.map(node));
    l.replaceChildren(...h.lede.map(node));
    const key = current + '|' + rawLocal();
    if (key !== hookKey) {
      hookKey = key;
      [t, l, $('#signals')].forEach((e) => { e.classList.remove('co-swap'); void e.offsetWidth; e.classList.add('co-swap'); });
    }
  }

  // ── "Lo que ha cambiado" ──
  function buildSignals() {
    const box = $('#signals');
    const s = rows('senales').filter((r) => r.local === L() && r.tab === current).sort((a, b) => a.orden - b.orden);
    box.hidden = !s.length;
    if (!s.length) { box.replaceChildren(); return; }
    box.replaceChildren(el('span', 'lb', 'Lo que ha cambiado'), ...s.map((r) => {
      const c = el('span', 'co-signal ' + r.tono); c.append(el('i'));
      c.append(node(M('senales', 'texto', 'text', 'local={local}&tab=' + current + '&orden=' + r.orden)));
      return c;
    }));
  }

  // ── Column chart that fills its card ──
  function cols(box, card, items, { max, ref, refLabel, refNeg, key }) {
    const anim = first(key);
    const plot = el('div', 'plot'), labs = el('div', 'labs');
    const tpl = `repeat(${items.length}, minmax(0, 1fr))`;
    plot.style.gridTemplateColumns = tpl; labs.style.gridTemplateColumns = tpl;
    items.forEach((it, i) => {
      const c = el('div', 'c' + (it.dim ? ' dim' : ''));
      const b = el('div', 'b' + (anim ? ' co-rise' : ''));
      morph(b, 'height', key + '|' + it.label, (it.value / max) * 100);
      b.style.background = it.color;
      if (anim) b.style.animationDelay = i * 60 + 'ms';
      if (it.inside) { b.append(el('div', 'bin', it.text)); if (it.inside2) b.append(el('div', 'bin2', it.inside2)); c.append(b); }
      else c.append(el('div', 'bv' + (it.cls ? ' ' + it.cls : ''), it.text), b);
      hover(c, card, it.label, it.tip);
      if (it.onClick) { c.style.cursor = 'pointer'; c.addEventListener('click', it.onClick); }
      plot.append(c);
      labs.append(el('div', it.on ? 'on' : null, it.label));
    });
    const parts = [];
    if (ref != null) {
      const r = el('div', 'co-ref' + (refNeg ? ' neg' : '')); r.style.bottom = (ref / max) * 100 + '%'; plot.append(r);
      const lg = el('div', 'co-reflegend' + (refNeg ? ' neg' : '')), s = el('span');
      s.append(el('i'), document.createTextNode(refLabel)); lg.append(s); parts.push(lg);
    }
    box.replaceChildren(...parts, plot, labs);
  }

  // ═════════ 01 · RESUMEN ═════════
  function drawSparks() {
    const d = dash.data('mensual');
    $$('.co-spark').forEach((box) => {
      if (d.status !== 'ok') { box.replaceChildren(); return; }
      const W = box.clientWidth; if (!W) return;
      const H = 30, f = box.dataset.spark;
      const rs = d.data.filter((r) => r.local === L());
      const x = d3.scaleLinear([0, rs.length - 1], [2, W - 4]);
      const y = d3.scaleLinear(d3.extent(rs, (r) => r[f]), [H - 4, 4]);
      const svg = d3.create('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('aria-hidden', 'true');
      svg.append('path').attr('d', d3.line((r, i) => x(i), (r) => y(r[f]))(rs)).attr('fill', 'none').style('stroke', C.pale).attr('stroke-width', 1.5).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
      svg.append('circle').attr('cx', x(rs.length - 1)).attr('cy', y(rs[rs.length - 1][f])).attr('r', 3).style('fill', C.acc);
      box.replaceChildren(svg.node());
    });
  }

  let showFc = false;
  const heroGeo = new Map();
  $('#fc-toggle').addEventListener('click', () => { showFc = !showFc; render(); });
  function drawHero() {
    const box = $('#hero-chart'), card = $('#hero-card'), d = dash.data('mensual'), pv = dash.data('prevision');
    $('#fc-toggle').setAttribute('aria-checked', String(showFc));
    $('#fc-note').hidden = !showFc;
    if (!ready(box, d)) return;
    const W = box.clientWidth; if (!W) return;
    const rs = d.data.filter((r) => r.local === L());
    const fc = showFc && pv.status === 'ok' ? pv.data.filter((r) => r.local === L()) : [];
    const H = 280, mb = 30, mt = 30, mr = 8, T = RM ? 0 : 750;
    const y = d3.scaleLinear([0, d3.max([...rs.map((r) => r.revenue), ...fc.map((r) => r.alto)])], [H - mb, mt]).nice();
    const ticks = y.ticks(4);
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Ventas mensuales' + (fc.length ? ' y previsión' : ''));
    box.replaceChildren(svg.node());
    const probe = svg.append('g').attr('font-size', 11);
    let lw = 0;
    ticks.forEach((t) => { lw = Math.max(lw, probe.append('text').text(fK(t)).node().getComputedTextLength()); });
    probe.remove();
    const ml = lw + 10;
    const dom = [...rs.map((r) => r.mes), ...fc.map((r) => r.mes)];
    const x = d3.scaleBand(dom, [ml, W - mr]).paddingInner(0.22).paddingOuter(0.05);
    const bw = x.bandwidth(), half = (x.step() * x.paddingInner()) / 2;
    svg.append('g').selectAll('line').data(ticks.slice(1)).join('line').attr('x1', ml).attr('x2', W - mr).attr('y1', (t) => y(t)).attr('y2', (t) => y(t)).style('stroke', 'var(--cds-chart-grid)');
    svg.append('g').selectAll('text').data(ticks).join('text').attr('x', ml - 8).attr('y', (t) => y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(fK);
    const yr = rs[rs.length - 1].mes.slice(0, 4);
    const ly = rs.filter((r) => r.mes.startsWith(yr));
    const peak = ly.reduce((a, b) => (b.revenue > a.revenue ? b : a));
    const valley = ly.reduce((a, b) => (b.revenue < a.revenue ? b : a));
    const years = [...new Set(dom.map((m) => m.slice(0, 4)))];
    years.forEach((yy, i) => {
      const ms = dom.filter((m) => m.startsWith(yy));
      const x0 = x(ms[0]) - half, x1 = x(ms[ms.length - 1]) + bw + half;
      const isF = fc.length && yy === fc[0].mes.slice(0, 4);
      if (i % 2 === 1 || isF) {
        const band = svg.append('rect').attr('x', x0).attr('width', x1 - x0).attr('y', mt - 6).attr('height', y(0) - mt + 6).style('fill', 'var(--co-soft)').attr('opacity', isF ? 0 : 0.6);
        if (isF) band.transition().duration(T).attr('opacity', 0.9);
      }
      const lab = svg.append('text').attr('x', x0 + 4).attr('y', H - 9).attr('font-size', 11).attr('font-weight', yy === yr ? 600 : 400).attr('font-style', isF ? 'italic' : null)
        .style('fill', yy === yr ? 'var(--co-ink)' : 'var(--color-fg-muted)').text(isF ? yy + ' · previsión' : yy);
      if (isF) lab.attr('opacity', 0).transition().delay(T * 0.5).duration(T * 0.6).attr('opacity', 1);
    });
    const anim = first('hero') && !RM;
    const geo = (r) => ({ x: x(r.mes), w: bw, y: y(r.revenue), h: y(0) - y(r.revenue) });
    const bars = svg.append('g').selectAll('rect').data(rs).join('rect').attr('rx', Math.min(3, bw / 2))
      .style('fill', (r) => (r === peak ? C.acc : r === valley ? C.neg : C.pale)).style('transform-box', 'fill-box');
    const morphing = heroGeo.size > 0 && T > 0;
    if (morphing) {
      bars.attr('x', (r) => (heroGeo.get(r.mes) ?? geo(r)).x).attr('width', (r) => (heroGeo.get(r.mes) ?? geo(r)).w)
        .attr('y', (r) => (heroGeo.get(r.mes) ?? geo(r)).y).attr('height', (r) => (heroGeo.get(r.mes) ?? geo(r)).h)
        .transition().duration(T).ease(d3.easeCubicInOut)
        .attr('x', (r) => geo(r).x).attr('width', bw).attr('y', (r) => geo(r).y).attr('height', (r) => geo(r).h);
    } else {
      bars.attr('x', (r) => geo(r).x).attr('width', bw).attr('y', (r) => geo(r).y).attr('height', (r) => geo(r).h)
        .attr('class', anim ? 'co-rise' : null).style('animation-delay', (r, i) => (anim ? i * 14 + 'ms' : null));
    }
    heroGeo.clear(); rs.forEach((r) => heroGeo.set(r.mes, geo(r)));
    if (fc.length) {
      const cx = (r) => x(r.mes) + bw / 2;
      const id = 'fcclip' + Math.round(Math.random() * 1e9);
      const x0 = x(rs[rs.length - 1].mes) + bw / 2 - 2;
      svg.append('clipPath').attr('id', id).append('rect').attr('x', x0).attr('y', 0).attr('height', H).attr('width', T ? 0 : W)
        .transition().delay(T * 0.6).duration(T * 1.4).ease(d3.easeCubicOut).attr('width', W - x0);
      const g = svg.append('g').attr('clip-path', `url(#${id})`);
      g.append('path').attr('d', d3.area(cx, (r) => y(r.bajo), (r) => y(r.alto))(fc)).style('fill', C.acc).attr('opacity', 0.18);
      g.append('path').attr('d', d3.line(cx, (r) => y(r.centro))(fc)).attr('fill', 'none').style('stroke', C.acc).attr('stroke-width', 2.2).attr('stroke-dasharray', '5 4').attr('stroke-linecap', 'round');
      g.selectAll('circle').data(fc).join('circle').attr('cx', cx).attr('cy', (r) => y(r.centro)).attr('r', 2.6).style('fill', C.acc);
      const last = rs[rs.length - 1];
      g.append('line').attr('x1', x(last.mes) + bw / 2).attr('x2', cx(fc[0])).attr('y1', y(last.revenue)).attr('y2', y(fc[0].centro)).style('stroke', C.acc).attr('stroke-width', 1.5).attr('stroke-dasharray', '2 3').attr('opacity', 0.7);
      const tot = row('prevision_resumen', 'local=' + L());
      if (tot) {
        const lx = cx(fc[fc.length - 1]) + bw / 2, ly2 = mt - 16;
        g.append('text').attr('x', lx).attr('y', ly2).attr('text-anchor', 'end').attr('font-size', 11).attr('font-weight', 600).style('fill', 'var(--co-ink)')
          .text(tot.anio + ': entre ' + fK(tot.bajo) + ' y ' + fK(tot.alto));
      }
    }
    svg.append('line').attr('x1', ml).attr('x2', W - mr).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--cds-chart-axis)');
    if (L() !== 'Lavapiés' && rs.some((r) => r.mes === '2024-07') && rs[0].mes < '2024-07') {
      const xx = x('2024-07') - half;
      svg.append('line').attr('x1', xx).attr('x2', xx).attr('y1', mt - 14).attr('y2', y(0)).style('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '3 3');
      svg.append('text').attr('x', xx + 5).attr('y', mt - 16).attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text('Abre Malasaña');
    }
    const label = (r, txt, color) => {
      const cx = x(r.mes) + bw / 2;
      const anchor = cx > W - 80 ? 'end' : cx < ml + 50 ? 'start' : 'middle';
      const t = svg.append('text').attr('x', anchor === 'end' ? x(r.mes) + bw : anchor === 'start' ? x(r.mes) : cx).attr('y', y(r.revenue) - 7)
        .attr('text-anchor', anchor).attr('font-size', 11).attr('font-weight', 600).style('fill', color).text(txt);
      if (morphing) t.attr('opacity', 0).transition().delay(T * 0.7).duration(300).attr('opacity', 1);
    };
    label(peak, fK(peak.revenue), 'var(--co-ink)');
    label(valley, fK(valley.revenue), C.neg);
    svg.append('g').selectAll('rect').data([...rs, ...fc]).join('rect')
      .attr('x', (r) => x(r.mes) - half).attr('width', x.step()).attr('y', mt).attr('height', y(0) - mt).style('fill', 'transparent')
      .on('mousemove', (e, r) => tip(card, e, mesLabel(r.mes) + (r.centro != null ? ' · previsión' : ''), r.centro != null
        ? ['Lo más probable: ' + fK(r.centro), 'Entre ' + fK(r.bajo) + ' y ' + fK(r.alto), 'Estimación, no un dato real']
        : [fEur0.format(r.revenue) + ' vendidos', fInt.format(r.tickets) + ' tickets', 'Gasto medio por visita: ' + fEur2.format(r.ticket_medio)]))
      .on('mouseleave', () => untip(card));
  }

  let calYear = null;
  function drawCal() {
    const box = $('#cal'), card = $('#cal-card'), d = dash.data('ventas_dia');
    if (!ready(box, d)) return;
    const W = box.clientWidth; if (!W) return;
    const by = new Map();
    for (const r of d.data) {
      if (L() !== 'Ambos' && r.local !== L()) continue;
      const g = by.get(r.fecha) ?? { fecha: r.fecha, revenue: 0, tickets: 0, festivo: Number(r.festivo) };
      g.revenue += Number(r.revenue); g.tickets += Number(r.tickets); by.set(r.fecha, g);
    }
    const all = [...new Set([...by.keys()].map((f) => f.slice(0, 4)))].sort();
    if (calYear == null || (calYear !== 'todos' && !all.includes(calYear))) calYear = all[all.length - 1];
    const yb = $('#cal-years');
    yb.replaceChildren(...[...all, 'todos'].map((yy) => {
      const b = el('button', null, yy === 'todos' ? 'Los ' + all.length + ' años' : yy); b.type = 'button';
      b.setAttribute('aria-pressed', String(yy === calYear));
      b.addEventListener('click', () => { calYear = yy; drawCal(); });
      return b;
    }));
    const multi = calYear === 'todos', years = multi ? all : [calYear];
    $('#cal-title').textContent = (multi ? (all.length === 3 ? 'Tres años' : 'Año y medio') + ', día a día' : calYear + ', día a día') + ': agosto se apaga y los fines de semana se encienden';
    const info = years.map((yy) => {
      const jan1 = new Date(Date.UTC(Number(yy), 0, 1)), off = (jan1.getUTCDay() + 6) % 7;
      const days = (Date.UTC(Number(yy) + 1, 0, 1) - jan1) / 864e5;
      return { yy, jan1, off, ncol: Math.floor((days - 1 + off) / 7) + 1 };
    });
    const ncol = Math.max(...info.map((i) => i.ncol));
    const lw = 24, cs = (W - lw) / ncol, gap = cs > 14 ? 3 : cs > 9 ? 2 : 1;
    const head = multi ? 32 : 18, spacing = multi ? 12 : 0, yh = head + 7 * cs;
    const mesTxt = (m) => (cs < 11 ? 'EFMAMJJASOND'[m] : MES[m]);
    const H = years.length * yh + (years.length - 1) * spacing + 2;
    const fsM = Math.max(9, Math.min(12, cs * 0.55)), fsD = Math.max(8, Math.min(11, cs * 0.5));
    const shown = [...by.values()].filter((g) => years.includes(g.fecha.slice(0, 4)));
    const vmax = d3.max(shown, (g) => g.revenue) || 1;
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Calendario de ventas diarias');
    const cells = [];
    info.forEach(({ yy, jan1, off }, i) => {
      const y0 = i * (yh + spacing);
      if (multi) svg.append('text').attr('x', 0).attr('y', y0 + 12).attr('font-size', 11).attr('font-weight', 700).style('fill', 'var(--co-ink)').text(yy);
      for (let m = 0; m < 12; m++) {
        const dm = new Date(Date.UTC(Number(yy), m, 1)), doy = Math.round((dm - jan1) / 864e5), col = Math.floor((doy + off) / 7);
        svg.append('text').attr('x', lw + col * cs).attr('y', y0 + head - 6).attr('font-size', fsM).style('fill', 'var(--color-fg-muted)').text(mesTxt(m));
      }
      ['L', 'X', 'V', 'D'].forEach((t, j) => svg.append('text').attr('x', lw - 7).attr('y', y0 + head + [0, 2, 4, 6][j] * cs + cs / 2).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', fsD).style('fill', 'var(--color-fg-muted)').text(t));
      for (let dt = new Date(jan1); dt.getUTCFullYear() === Number(yy); dt.setUTCDate(dt.getUTCDate() + 1)) {
        const f = dt.toISOString().slice(0, 10), doy = Math.round((dt - jan1) / 864e5), dow = (dt.getUTCDay() + 6) % 7;
        cells.push({ f, x: lw + Math.floor((doy + off) / 7) * cs, y: y0 + head + dow * cs, g: by.get(f), dow });
      }
    });
    const anim = !RM;
    const rects = svg.append('g').selectAll('rect').data(cells).join('rect')
      .attr('x', (c) => c.x + gap / 2).attr('y', (c) => c.y + gap / 2).attr('width', cs - gap).attr('height', cs - gap).attr('rx', Math.min(4, cs / 4))
      .style('fill', (c) => (c.g ? `color-mix(in srgb, ${C.acc} ${Math.round(8 + (c.g.revenue / vmax) * 90)}%, transparent)` : 'var(--co-soft)'))
      .attr('opacity', (c) => (c.g ? 1 : 0.45))
      .style('stroke', (c) => (c.g && c.g.festivo ? C.neg : null)).attr('stroke-width', (c) => (c.g && c.g.festivo ? Math.max(1.2, cs / 10) : null))
      .on('mousemove', (e, c) => {
        const dias = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
        const t = dias[c.dow] + ', ' + Number(c.f.slice(8)) + ' ' + MES[Number(c.f.slice(5, 7)) - 1] + ' ' + c.f.slice(0, 4);
        tip(card, e, t, c.g ? [fEur0.format(c.g.revenue) + ' vendidos', fInt.format(c.g.tickets) + ' tickets', ...(c.g.festivo ? ['Festivo en Madrid'] : [])] : ['Sin ventas: local aún cerrado']);
      })
      .on('mouseleave', () => untip(card));
    if (anim) rects.attr('opacity', 0).transition().delay((c) => (c.x / W) * 500).duration(350).attr('opacity', (c) => (c.g ? 1 : 0.45));
    box.replaceChildren(svg.node());
  }

  // ═════════ 02 · CARTA ═════════
  function drawPareto() {
    const box = $('#pareto'), card = $('#pareto-card'), d = dash.data('abc');
    if (!ready(box, d)) return;
    const rs = d.data.filter((r) => r.local === L()).sort((a, b) => a.rank - b.rank);
    if (!rs.length) { box.replaceChildren(); return; }
    const max = rs[0].revenue, anim = first('pareto');
    const kids = [];
    rs.forEach((r, i) => {
      const prev = rs[i - 1];
      if (prev && prev.clase !== r.clase) {
        const s = el('div', 'co-sep'), tx = el('span'); tx.append(document.createTextNode('Hasta aquí, el '), el('b', null, prev.clase === 'A' ? '70 %' : '90 %'), document.createTextNode(prev.clase === 'A' ? ' de las ventas' : ' de las ventas. Lo que queda es la cola')); s.append(tx);
        kids.push(s);
      }
      const rw = el('div', 'co-row'), track = el('div', 'track'), bar = el('div', 'bar' + (anim ? ' co-grow' : ''));
      morph(bar, 'width', 'p|' + r.producto, (r.revenue / max) * 100);
      bar.style.background = r.clase === 'A' ? C.acc : r.clase === 'B' ? C.pale : C.neg;
      if (anim) bar.style.animationDelay = i * 12 + 'ms';
      if (fichaProd && fichaProd !== r.producto) rw.style.opacity = '.45';
      track.append(bar);
      const lab = el('div', 'lab', r.producto); if (r.clase !== 'A') lab.style.color = 'var(--color-fg-muted)';
      if (fichaProd === r.producto) { lab.style.color = 'var(--co-ink)'; lab.style.fontWeight = 700; }
      const v = el('div', 'v', fK(r.revenue)); v.style.color = r.clase === 'A' ? 'var(--co-ink)' : r.clase === 'C' ? C.neg : 'var(--color-fg-muted)';
      rw.append(lab, track, v, el('div', 'cum', fPct0.format(r.pct_acumulado)));
      hover(rw, card, r.producto, [fEur0.format(r.revenue) + ' vendidos', ({ A: 'Imprescindible', B: 'Secundario', C: 'En la cola' })[r.clase] + ' · ' + r.categoria, fPct1.format(r.pct_revenue) + ' de la caja · ' + fPct0.format(r.pct_acumulado) + ' acumulado', 'Toca para abrir su ficha']);
      rw.addEventListener('click', () => openFicha(r.producto));
      kids.push(rw);
    });
    box.replaceChildren(...kids);
  }

  function drawMix() {
    const box = $('#mix'), d = dash.data('abc_resumen');
    if (!ready(box, d)) return;
    const a = d.data.find((r) => r.local === L()); if (!a) return;
    const lines = [['En la carta', [a.n_a / a.productos, a.n_b / a.productos, a.n_c / a.productos]], ['En las ventas', [a.revenue_pct_a, 1 - a.revenue_pct_a - a.revenue_pct_c, a.revenue_pct_c]]];
    const cls = [['Imprescindibles', C.acc, ''], ['Secundarios', C.pale, 'lt'], ['La cola', C.neg, '']];
    box.replaceChildren(...lines.map(([name, vals], li) => {
      const ln = el('div', 'ln'), bar = el('div', 'bar');
      vals.forEach((v, i) => {
        const s = el('div', 'seg ' + cls[i][2], v >= 0.08 ? fPct0.format(v) : '');
        morph(s, 'flexGrow', 'mix|' + li + i, v, ''); s.style.flexBasis = '0'; s.style.background = cls[i][1]; s.title = cls[i][0] + ': ' + fPct1.format(v);
        bar.append(s);
      });
      ln.append(el('div', null, name), bar);
      return ln;
    }));
  }

  function drawPoda() {
    const tb = $('#poda-table tbody'), d = dash.data('abc');
    if (d.status !== 'ok') { tb.replaceChildren(); return; }
    const rs = d.data.filter((r) => r.local === L() && r.clase === 'C').sort((a, b) => a.revenue - b.revenue);
    const max = Math.max(...rs.map((r) => r.revenue));
    tb.replaceChildren(...rs.map((r, i) => {
      const lead = i < 3;
      const tr = el('tr', lead ? 'lead' : null);
      tr.dataset.key = enc(r.local) + ',' + enc(r.producto);
      const name = el('td', lead ? 'k' : null);
      const dot = el('span', 'mk'); dot.style.background = lead ? C.neg : 'transparent'; dot.style.border = lead ? '0' : '1px solid var(--color-fg-muted)';
      name.append(dot, document.createTextNode(r.producto), el('span', 'sub', r.categoria + (lead ? ' · retirar primero' : '')));
      const ventas = el('td', 'r'), cb = el('div', 'cellbar'), bar = el('i');
      bar.style.width = (r.revenue / max) * 3.5 + 'rem'; bar.style.background = lead ? C.neg : C.pale;
      cb.append(bar, el('span', null, fK(r.revenue))); ventas.append(cb);
      tr.append(name, ventas, el('td', 'r', fPct1.format(r.pct_revenue)), el('td', 'r hide-sm', fPct0.format(r.margen_pct)));
      tr.title = 'Abrir la ficha de ' + r.producto;
      tr.addEventListener('click', () => openFicha(r.producto));
      return tr;
    }));
  }

  function equalizeCarta() {
    const grid = $('#carta-grid'), left = $('#pareto-card'), right = $('#carta-right'), pareto = $('#pareto');
    grid.style.alignItems = 'start';
    pareto.style.setProperty('--pg', '2px');
    if (getComputedStyle(grid).gridTemplateColumns.split(' ').length > 1) {
      const diff = right.offsetHeight - left.offsetHeight, n = $$('.co-row', pareto).length || 1;
      if (diff > 0) pareto.style.setProperty('--pg', Math.min(2 + diff / n / 2, 9) + 'px');
    }
    grid.style.alignItems = 'stretch';
  }

  function drawCombos() {
    const d = dash.data('combos_top'); if (d.status !== 'ok') return;
    const max = Math.max(...d.data.map((r) => r.lift)) * 1.08, f = FR();
    $$('.co-meter').forEach((m) => {
      const r = d.data.find((x) => String(x.puesto) === m.dataset.p); if (!r) return;
      morph($('i', m), 'width', 'meter|' + r.puesto, (r.lift / max) * 100);
      $('u', m).style.left = (1 / max) * 100 + '%';
      m.closest('.co-combo').classList.toggle('dim', !!f && r.franja_pico !== f);
    });
  }

  function headCells(onClick) {
    return [el('div', 'hh', '')].concat(FRANJAS.map((f) => {
      const h = el('div', 'hh click' + (FR() === f ? ' on' : ''), f);
      h.setAttribute('role', 'button'); h.tabIndex = 0; h.title = FR() === f ? 'Quitar el filtro' : 'Filtrar la página por ' + f.toLowerCase();
      h.addEventListener('click', () => onClick(f));
      h.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(f); } });
      return h;
    }));
  }

  function drawHeatCombos() {
    const box = $('#heat-combos'), card = $('#heat-card'), d = dash.data('combos_franja');
    if (!ready(box, d)) return;
    const rs = d.data.map((r) => ({ ...r, n_tickets: Number(r.n_tickets), support_pct: Number(r.support_pct) }));
    const f = FR();
    const key = {};
    rs.forEach((r) => { if (!f || r.franja === f) key[r.itemset_str] = (key[r.itemset_str] ?? 0) + (f ? r.support_pct : r.n_tickets); });
    const combos = Object.keys(key).sort((a, b) => key[b] - key[a]);
    const vmax = Math.max(...rs.map((r) => r.support_pct));
    const kids = headCells((fr) => setFranja(fr));
    for (const c of combos) {
      const lab = el('div', 'rl', c); lab.title = c; kids.push(lab);
      const cells = FRANJAS.map((fr) => rs.find((r) => r.itemset_str === c && r.franja === fr));
      const rmax = Math.max(...cells.map((x) => (x ? x.support_pct : 0)));
      cells.forEach((x, i) => {
        const v = x ? x.support_pct : 0, p = Math.round(6 + (v / vmax) * 88);
        const cell = el('div', 'cell' + (x && v === rmax ? ' max' : '') + (f && FRANJAS[i] !== f ? ' dim' : ''), x ? fD1.format(v) : '');
        cell.style.background = `color-mix(in srgb, ${C.acc} ${p}%, transparent)`;
        cell.style.color = p > 55 ? (dark() ? '#1D2638' : '#fff') : 'var(--color-fg)';
        if (x) hover(cell, card, c, [fD1.format(v) + ' de cada 100 tickets', 'Franja: ' + FRANJAS[i], fInt.format(x.n_tickets) + ' tickets con la pareja']);
        kids.push(cell);
      });
    }
    box.replaceChildren(...kids);
  }

  // ── Ficha de producto (drill-through) ──
  function openFicha(p) {
    fichaProd = p;
    const c = $('#ficha'); c.hidden = false;
    render();
    c.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
  }
  $('#ficha-close').addEventListener('click', () => { fichaProd = null; $('#ficha').hidden = true; render(); });
  function buildFicha() {
    const card = $('#ficha');
    if (!fichaProd) { card.hidden = true; return; }
    card.hidden = false;
    const w = 'local={local}&producto=' + enc(fichaProd);
    const a = row('abc', 'local=' + L() + '&producto=' + enc(fichaProd));
    $('#ficha-title').replaceChildren(node(M('abc', 'producto', 'text', w)));
    const chips = $('#ficha-chips');
    chips.replaceChildren();
    if (a) {
      const cl = { A: ['Imprescindible', 'pos'], B: ['Secundario', ''], C: ['En la cola', 'neg'] }[a.clase];
      const c1 = el('span', 'co-chip'); c1.append(node(M('abc', 'categoria', 'text', w)));
      const c2 = el('span', 'co-chip ' + cl[1], cl[0]);
      const c3 = el('span', 'co-chip'); c3.append(document.createTextNode('Puesto '), node(M('abc', 'rank', 'int', w)), document.createTextNode(' de '), node(M('abc_resumen', 'productos', 'int', W_LOC)));
      chips.append(c1, c2, c3);
    }
    const pares = fichaPairs();
    const pv = pares[0];
    const verdict = !a ? [] : a.clase === 'A'
      ? ['Es de los que sostienen la caja: solo él trae el ', M('abc', 'pct_revenue', 'pct1', w, 'ink'), ' de las ventas. Ni se toca.']
      : a.clase === 'B' ? ['Cumple sin destacar: trae el ', M('abc', 'pct_revenue', 'pct1', w, 'ink'), ' de las ventas. Merece la pena vigilarlo.']
        : ['Vende poco: apenas el ', M('abc', 'pct_revenue', 'pct1', w, 'bad'), ' de la caja. Es candidato a salir de la carta.'];
    if (pv) verdict.push(' Cuando se pide acompañado, suele ir con ' + pv.pareja + '.');
    $('#ficha-verdict').replaceChildren(...verdict.map(node));
    const kp = $('#ficha-kp');
    kp.replaceChildren(...[['Ventas 2023–2025', 'revenue', 'eurk'], ['Peso en la caja', 'pct_revenue', 'pct1'], ['Margen bruto', 'margen_pct', 'pct0'], ['Unidades', 'unidades', 'int']].map(([t, f, fmt]) => {
      const d = el('div'); d.append(el('div', 't', t)); const v = el('div', 'v'); v.append(node(M('abc', f, fmt, w))); d.append(v); return d;
    }));
  }
  function fichaPairs() {
    const pr = rows('producto_pares').filter((r) => r.producto === fichaProd && (L() === 'Ambos' || r.local === L()));
    const base = {}, by = {};
    pr.forEach((r) => { base[r.local] = Number(r.tickets_producto); by[r.pareja] = (by[r.pareja] ?? 0) + Number(r.tickets_juntos); });
    const tot = Object.values(base).reduce((s, v) => s + v, 0);
    return Object.entries(by).map(([pareja, n]) => ({ pareja, n, pct: n / tot })).sort((a, b) => b.n - a.n).slice(0, 4);
  }
  function drawFicha() {
    if (!fichaProd) return;
    const card = $('#ficha');
    const bm = $('#ficha-mes'), dm = dash.data('producto_mes');
    if (ready(bm, dm)) {
      const by = {};
      dm.data.forEach((r) => { if (r.producto === fichaProd && (L() === 'Ambos' || r.local === L())) by[r.mes] = (by[r.mes] ?? 0) + Number(r.revenue); });
      const ms = Object.keys(by).sort(), W = bm.clientWidth || 300, H = 150;
      const x = d3.scaleBand(ms, [0, W]).paddingInner(0.2), y = d3.scaleLinear([0, d3.max(ms, (m) => by[m]) || 1], [H - 16, 8]);
      const yr = ms.length ? ms[ms.length - 1].slice(0, 4) : '';
      const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Ventas mensuales del producto');
      svg.append('g').selectAll('rect').data(ms).join('rect').attr('x', (m) => x(m)).attr('width', x.bandwidth()).attr('y', (m) => y(by[m])).attr('height', (m) => y(0) - y(by[m]))
        .attr('rx', 2).style('fill', (m) => (m.startsWith(yr) ? C.acc : C.pale))
        .on('mousemove', (e, m) => tip(card, e, mesLabel(m), [fEur0.format(by[m]) + ' vendidos'])).on('mouseleave', () => untip(card));
      svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--cds-chart-axis)');
      [...new Set(ms.map((m) => m.slice(0, 4)))].forEach((yy) => { const m0 = ms.find((m) => m.startsWith(yy)); svg.append('text').attr('x', x(m0)).attr('y', H - 2).attr('font-size', 10).style('fill', yy === yr ? 'var(--co-ink)' : 'var(--color-fg-muted)').text(yy); });
      bm.replaceChildren(svg.node());
    }
    const bf = $('#ficha-franja'), df = dash.data('producto_franja');
    if (ready(bf, df)) {
      const by = {};
      df.data.forEach((r) => { if (r.producto === fichaProd && (L() === 'Ambos' || r.local === L())) by[r.franja] = (by[r.franja] ?? 0) + Number(r.revenue); });
      const tot = Object.values(by).reduce((s, v) => s + v, 0) || 1, mx = Math.max(...FRANJAS.map((f) => by[f] ?? 0));
      bf.replaceChildren(...FRANJAS.map((f) => {
        const v = (by[f] ?? 0) / tot, rw = el('div', 'co-row'); rw.style.gridTemplateColumns = '5.5rem minmax(0,1fr) 3rem';
        const tr = el('div', 'track'), b = el('div', 'bar');
        morph(b, 'width', 'ff|' + f, (v / (mx / tot || 1)) * 100); b.style.background = (by[f] ?? 0) === mx ? C.acc : C.pale;
        tr.append(b); rw.append(el('div', 'lab', f), tr, el('div', 'v', fPct0.format(v)));
        hover(rw, card, f, [fPct1.format(v) + ' de sus ventas', fEur0.format(by[f] ?? 0)]);
        return rw;
      }));
    }
    const bp = $('#ficha-pares'), dp = dash.data('producto_pares');
    if (ready(bp, dp)) {
      const ps = fichaPairs(), mx = ps.length ? ps[0].pct : 1;
      bp.replaceChildren(...(ps.length ? ps.map((p) => {
        const r = el('div', 'p'); r.append(el('span', null, p.pareja), el('span', 'v', fPct0.format(p.pct)));
        const t = el('div', 'trk'), i = el('i'); morph(i, 'width', 'fp|' + p.pareja, (p.pct / mx) * 100); t.append(i); r.append(t);
        hover(r, card, p.pareja, [fPct1.format(p.pct) + ' de sus tickets lo llevan también', fInt.format(p.n) + ' tickets juntos']);
        return r;
      }) : [el('div', 'co-note', 'Casi siempre se pide solo.')]));
    }
  }

  // ═════════ 03 · HORARIOS ═════════
  function setFranja(f) { dash.setParams({ franja: FR() === f ? null : f }); }
  function selFranja() { if (FR()) return FR(); const o = row('ops_resumen', 'local=' + L()); return o ? o.franja_peor : 'Tarde'; }
  function drawRp() {
    const box = $('#rp-franja'), card = $('#rp-card'), d = dash.data('revpash');
    if (!ready(box, d)) return;
    const rs = d.data.filter((r) => r.local === L()).sort((a, b) => a.franja_orden - b.franja_orden);
    const max = Math.max(UMBRAL, ...rs.map((r) => r.revpash)) * 1.15, f = FR();
    cols(box, card, rs.map((r) => {
      const low = r.revpash < UMBRAL;
      return { label: r.franja, value: r.revpash, text: fEur2.format(r.revpash), color: low ? C.neg : C.pale, cls: r.franja === f ? 'strong' : '',
        inside: low, inside2: low ? signed(r.revpash - UMBRAL, fEur2.format(UMBRAL - r.revpash)) : null,
        on: r.franja === f, dim: !!f && r.franja !== f,
        onClick: () => { setFranja(r.franja); if (FR() !== r.franja) setTimeout(() => $('#explica').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' }), 80); },
        tip: [fEur2.format(r.revpash) + ' por silla y hora', low ? 'No cubre lo que cuesta abrir (2,50 €)' : 'Cubre lo que cuesta abrir', 'Gasto medio por visita: ' + fEur2.format(r.ticket_medio), fEur0.format(r.revenue) + ' vendidos en el año', r.franja === f ? 'Toca para quitar el filtro' : 'Toca para filtrar y ver la cuenta'] };
    }), { max, ref: UMBRAL, refLabel: 'Lo que cuesta tener una silla abierta una hora: ' + fEur2.format(UMBRAL), refNeg: true, key: 'rp' });
  }

  function drawRpHeat() {
    const box = $('#rp-heat'), card = $('#rpd-card'), d = dash.data('revpash_dia');
    if (!ready(box, d)) return;
    const rs = d.data.filter((r) => r.local === L()), f = FR();
    const vmax = Math.max(...rs.map((r) => r.revpash));
    const top = rs.reduce((a, b) => (b.revpash > a.revpash ? b : a));
    const dias = [...new Map(rs.map((r) => [r.dia_semana, r.nombre_dia])).entries()].sort((a, b) => a[0] - b[0]);
    const kids = headCells((fr) => setFranja(fr));
    for (const [n, nombre] of dias) {
      const lab = el('div', 'rl', nombre); if (n >= 6) lab.style.fontWeight = 600;
      kids.push(lab);
      FRANJAS.forEach((fr) => {
        const x = rs.find((r) => r.dia_semana === n && r.franja === fr);
        if (!x) { kids.push(el('div', 'cell')); return; }
        const p = Math.round(6 + (x.revpash / vmax) * 88), low = x.revpash < UMBRAL;
        const cell = el('div', 'cell' + (low ? ' low' : '') + (x === top ? ' max' : '') + (f && fr !== f ? ' dim' : ''), (low ? '▼ ' : '') + fD2.format(x.revpash));
        cell.style.background = low ? `color-mix(in srgb, ${C.neg} 8%, transparent)` : `color-mix(in srgb, ${C.acc} ${p}%, transparent)`;
        if (!low) cell.style.color = p > 55 ? (dark() ? '#1D2638' : '#fff') : 'var(--color-fg)';
        hover(cell, card, nombre + ' · ' + fr, [fEur2.format(x.revpash) + ' por silla y hora', low ? 'No cubre lo que cuesta abrir' : 'Cubre lo que cuesta abrir', 'Gasto medio por visita: ' + fEur2.format(x.ticket_medio), fInt.format(x.tickets) + ' tickets en el año']);
        kids.push(cell);
      });
    }
    box.replaceChildren(...kids);
  }

  const DAY = {
    lv: { name: 'Lun–Vie', start: 7.5, segs: [['Apertura', 7.5, 9], ['Mañana', 9, 12], ['Mediodía', 12, 14], ['Tarde', 14, 17]] },
    sd: { name: 'Sáb–Dom', start: 8, segs: [['Apertura', 8, 9], ['Mañana', 9, 12], ['Mediodía', 12, 14], ['Tarde', 14, 15]] },
  };
  const hhmm = (h) => Math.floor(h) + ':' + (h % 1 ? '30' : '00');
  function buildExplainer() {
    const rs = rows('revpash').filter((r) => r.local === L());
    const sel = selFranja();
    const picker = $('#franja-picker');
    if (!picker.childElementCount) {
      FRANJAS.forEach((f) => { const b = el('button'); b.type = 'button'; b.dataset.f = f; b.append(el('i'), document.createTextNode(f)); b.addEventListener('click', () => { if (FR() !== f) dash.setParams({ franja: f }); }); picker.append(b); });
    }
    $$('button', picker).forEach((b) => {
      const r = rs.find((x) => x.franja === b.dataset.f);
      b.setAttribute('aria-pressed', String(b.dataset.f === sel));
      $('i', b).style.background = r && r.revpash < UMBRAL ? C.neg : C.acc;
    });
    const cur = rs.find((x) => x.franja === sel), low = cur ? cur.revpash < UMBRAL : false;
    $('#eq-res').classList.toggle('neg', low);
    $('#eq-verdict').replaceChildren(node(M('revpash', 'vs_umbral', 'eurdiff', 'local={local}&franja={franja}', low ? 'bad' : 'good')), document.createTextNode(low ? ' por hora por debajo de lo que cuesta abrir (2,50 €)' : ' por hora por encima de lo que cuesta abrir (2,50 €)'));
    const kids = [];
    for (const k of ['lv', 'sd']) {
      const day = DAY[k];
      kids.push(el('div', null, day.name));
      const bar = el('div', 'tl');
      if (day.start > 7.5) { const c = el('div', 'closed'); c.style.flex = String(day.start - 7.5); bar.append(c); }
      day.segs.forEach(([f, a, b]) => {
        const s = el('div', 'fr' + (f === sel ? ' on' + (low ? ' neg' : '') : ''), f + ' · ' + fD1.format(b - a).replace(',0', '') + ' h');
        s.style.flex = String(b - a); s.title = f + ': ' + hhmm(a) + '–' + hhmm(b);
        bar.append(s);
      });
      const end = day.segs[day.segs.length - 1][2];
      if (end < 17) { const c = el('div', 'closed'); c.style.flex = String(17 - end); c.title = 'Cerrado'; bar.append(c); }
      kids.push(bar);
    }
    kids.push(el('div'));
    const ticks = el('div', 'ticks'); ticks.style.position = 'relative'; ticks.style.height = '1em';
    [7.5, 9, 12, 14, 15, 17].forEach((h) => { const t = el('span', null, hhmm(h)); t.style.position = 'absolute'; t.style.left = ((h - 7.5) / 9.5) * 100 + '%'; t.style.transform = h === 7.5 ? 'none' : h === 17 ? 'translateX(-100%)' : 'translateX(-50%)'; ticks.append(t); });
    kids.push(ticks);
    $('#day-tl').replaceChildren(...kids);
  }

  function drawTickets() {
    const bf = $('#ticket-franja'), bd = $('#ticket-dia');
    const df = dash.data('revpash'), dd = dash.data('ticket_dia'), k = dash.data('kpis');
    const okF = ready(bf, df, k), okD = ready(bd, dd, k);
    if (!okF && !okD) return;
    const media = k.status === 'ok' ? findRow(k.data, 'local=' + L()).ticket_medio : null;
    const fr = okF ? df.data.filter((r) => r.local === L()).sort((a, b) => a.franja_orden - b.franja_orden) : [];
    const dy = okD ? dd.data.filter((r) => r.local === L()).sort((a, b) => a.dia_semana - b.dia_semana) : [];
    const max = Math.max(...fr.map((r) => r.ticket_medio), ...dy.map((r) => r.ticket_medio)) * 1.14;
    const bestF = Math.max(...fr.map((r) => r.ticket_medio)), bestD = Math.max(...dy.map((r) => r.ticket_medio));
    const refLabel = media ? 'Media del año: ' + fEur2.format(media) : '', f = FR();
    const vs = (v) => signed(v - media, fEur2.format(Math.abs(v - media))) + ' frente a la media';
    if (okF) cols(bf, $('#tf-card'), fr.map((r) => {
      const on = f ? r.franja === f : r.ticket_medio === bestF;
      return { label: r.franja, value: r.ticket_medio, text: fEur2.format(r.ticket_medio), on, dim: !!f && r.franja !== f, color: on ? C.acc : C.pale, cls: on ? 'strong' : '',
        onClick: () => setFranja(r.franja), tip: [fEur2.format(r.ticket_medio) + ' por visita', vs(r.ticket_medio), fInt.format(r.tickets) + ' tickets en el año'] };
    }), { max, ref: media, refLabel, key: 'tf' });
    if (okD) cols(bd, $('#td-card'), dy.map((r) => ({ label: r.nombre_dia.slice(0, 3), value: r.ticket_medio, text: fEur2.format(r.ticket_medio), on: r.ticket_medio === bestD,
      color: r.ticket_medio === bestD ? C.acc : C.pale, cls: r.ticket_medio === bestD ? 'strong' : '',
      tip: [fEur2.format(r.ticket_medio) + ' por visita', r.nombre_dia, vs(r.ticket_medio), fInt.format(r.tickets) + ' tickets en el año'] })), { max, ref: media, refLabel, key: 'td' });
  }

  // ═════════ 04 · CLIENTES ═════════
  const segColor = (s) => (s === 'Champions' || s === 'Loyal' ? C.acc : s === 'At Risk' ? C.neg : C.pale);
  function drawSeg() {
    const box = $('#seg-chart'), card = $('#seg-card'), d = dash.data('segmentos');
    if (!ready(box, d)) return;
    const rs = d.data, max = Math.max(...rs.flatMap((r) => [r.pct_clientes, r.pct_revenue]));
    const anim = first('seg');
    const wrap = el('div'); wrap.style.cssText = 'display:flex;flex-direction:column;justify-content:space-around;flex:1;gap:12px';
    rs.forEach((r, i) => {
      const c = segColor(r.segmento_rfm), key = r.segmento_rfm !== 'Potential' && r.segmento_rfm !== 'Lost';
      const rw = el('div', 'co-row'); rw.style.gridTemplateColumns = 'minmax(5.5rem, 7rem) minmax(0, 1fr)';
      const lab = el('div', 'lab', r.segmento_rfm); lab.style.color = key ? 'var(--co-ink)' : 'var(--color-fg-muted)'; if (key) lab.style.fontWeight = 600;
      const bars = el('div'); bars.style.cssText = 'display:grid;gap:3px';
      [[r.pct_clientes, 0.35, ' de clientes'], [r.pct_revenue, 1, ' de ventas']].forEach(([v, op, k], j) => {
        const line = el('div'); line.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 7.5rem;gap:8px;align-items:center';
        const track = el('div', 'track'), bar = el('div', 'bar' + (anim ? ' co-grow' : ''));
        morph(bar, 'width', 'seg|' + r.segmento_rfm + j, (v / max) * 100); bar.style.background = c; bar.style.opacity = op;
        if (anim) bar.style.animationDelay = i * 60 + 'ms';
        track.append(bar);
        const t = el('div', 'v', fPct1.format(v) + k); t.style.textAlign = 'left';
        t.style.color = op === 1 && key ? (r.segmento_rfm === 'At Risk' ? C.neg : 'var(--co-ink)') : 'var(--color-fg-muted)';
        if (op === 1 && key) t.style.fontWeight = 600;
        line.append(track, t); bars.append(line);
      });
      rw.append(lab, bars);
      hover(rw, card, r.segmento_rfm + ' · ' + r.apodo, [fPct1.format(r.pct_revenue) + ' de las ventas', fInt.format(r.clientes) + ' clientes (' + fPct1.format(r.pct_clientes) + ' del total)', 'Última visita: hace ' + fInt.format(r.recencia_media) + ' días de media', 'Gasto medio por visita: ' + fEur2.format(r.ticket_medio)]);
      wrap.append(rw);
    });
    box.replaceChildren(wrap);
  }

  function drawSegTable() {
    const tb = $('#seg-table tbody'), d = dash.data('segmentos');
    if (d.status !== 'ok') { tb.replaceChildren(); return; }
    const max = Math.max(...d.data.map((r) => r.pct_revenue));
    tb.replaceChildren(...d.data.map((r) => {
      const s = r.segmento_rfm, risk = s === 'At Risk', lead = s === 'Champions' || s === 'Loyal' || risk;
      const tr = el('tr', (lead ? 'lead' : '') + (risk ? ' risk' : ''));
      const name = el('td', 'k'), dot = el('span', 'mk'); dot.style.background = segColor(s);
      name.append(dot, document.createTextNode(s), el('span', 'sub', r.apodo + ' · ' + fInt.format(r.clientes) + ' clientes'));
      if (!lead) name.style.color = 'var(--color-fg-muted)';
      const peso = el('td', 'r'), cb = el('div', 'cellbar'), bar = el('i');
      bar.style.width = (r.pct_revenue / max) * 4 + 'rem'; bar.style.background = segColor(s);
      const pv = el('span', null, fPct1.format(r.pct_revenue)); if (lead) { pv.style.color = risk ? C.neg : 'var(--co-ink)'; pv.style.fontWeight = 600; }
      cb.append(bar, pv); peso.append(cb);
      const rec = el('td', 'r hide-sm', 'hace ' + fInt.format(r.recencia_media) + ' d'); if (risk) { rec.style.color = C.neg; rec.style.fontWeight = 600; }
      const camp = el('td'); camp.append(el('span', 'pill' + (risk ? ' neg' : lead ? ' acc' : ''), r.accion));
      tr.append(name, peso, rec, camp);
      return tr;
    }));
  }

  const ICONS = {
    Champions: { fill: ['M5 17.5h14l1.6-10-4.6 3.6L12 5l-4 6.1L3.4 7.5z'], stroke: ['M5 17.5h14l1.6-10-4.6 3.6L12 5l-4 6.1L3.4 7.5z', 'M6 21h12', 'M12 5V3.2'] },
    Loyal: { fill: [], stroke: ['M5 10h11v4.5A5.5 5.5 0 0 1 10.5 20h0A5.5 5.5 0 0 1 5 14.5z', 'M16 11h1.4a2.6 2.6 0 0 1 0 5.2H16', 'M8.5 3.4c-.9 1 .9 2 0 3.2', 'M12 3.4c-.9 1 .9 2 0 3.2', 'M9 13.4c.6-.9 2-.7 1.9.5-.1.8-1.4 1.6-1.9 1.9-.5-.3-1.8-1.1-1.9-1.9-.1-1.2 1.3-1.4 1.9-.5z'] },
    'At Risk': { fill: [], stroke: ['M4 21V3.5h9V21', 'M2.5 21h12', 'M10.2 12.4h.01', 'M15 12h6.5', 'M18.6 8.8 21.5 12l-2.9 3.2'] },
    Potential: { fill: ['M12 12.5c0-4-3-6.6-7.2-6.6 0 4.1 3 6.6 7.2 6.6z'], stroke: ['M12 21v-9', 'M12 12.5c0-4-3-6.6-7.2-6.6 0 4.1 3 6.6 7.2 6.6z', 'M12 10.2c0-3.6 2.6-5.8 6.6-5.8 0 3.6-2.6 5.8-6.6 5.8z', 'M7 21h10'] },
    Lost: { fill: [], stroke: ['M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1z', 'M15.5 3.5h3.3l-3.3 3.6h3.3', 'M20 8.5h2l-2 2.3h2'] },
  };
  function avatar(seg, color) {
    const ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg');
    s.setAttribute('width', '52'); s.setAttribute('height', '52'); s.setAttribute('viewBox', '0 0 52 52'); s.setAttribute('aria-hidden', 'true');
    const mk = (parent, tag, attrs) => { const e = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); parent.append(e); return e; };
    mk(s, 'circle', { cx: 26, cy: 26, r: 26, style: `fill: color-mix(in srgb, ${color} 16%, var(--color-panel))` });
    mk(s, 'circle', { cx: 26, cy: 26, r: 24.5, fill: 'none', style: `stroke: ${color}; stroke-opacity: .35`, 'stroke-width': 1.5 });
    const g = mk(s, 'g', { transform: 'translate(13 13) scale(1.08)' });
    const ic = ICONS[seg] ?? ICONS.Loyal;
    ic.fill.forEach((d) => mk(g, 'path', { d, style: `fill: color-mix(in srgb, ${color} 28%, transparent)` }));
    ic.stroke.forEach((d) => mk(g, 'path', { d, fill: 'none', style: `stroke: ${color}`, 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return s;
  }
  function buildPersonas() {
    const box = $('#personas'), d = dash.data('perfil_segmento'), sg = dash.data('segmentos');
    if (!ready(box, d, sg)) return;
    const prods = new Set(d.data.map((r) => r.producto));
    $('#personas-title').replaceChildren(...(prods.size === 1
      ? ['Todos piden ', M('perfil_segmento', 'producto', 'text', 'segmento_rfm=Champions'), ' y ', M('perfil_segmento', 'producto2', 'text', 'segmento_rfm=Champions'), '. Lo que los separa es cuántas veces vuelven']
      : ['Cinco clientes, cinco historias']).map(node));
    box.replaceChildren(...sg.data.map((s) => {
      const k = s.segmento_rfm, w = 'segmento_rfm=' + enc(k), risk = k === 'At Risk';
      const card = el('div', 'co-card co-persona' + (risk ? ' risk' : ''));
      const face = el('div', 'face'), nm = el('div', 'nm', k); nm.append(el('small', null, s.apodo));
      face.append(avatar(k, segColor(k)), nm);
      const big = el('div', 'big'); big.append(node(M('perfil_segmento', 'visitas_anio', 'int', w)), el('small', null, ' visitas al año'));
      const ul = el('ul');
      const li = (parts) => { const l = el('li'); parts.forEach((p) => l.append(node(p))); ul.append(l); };
      li(['Gasta ', M('perfil_segmento', 'gasto_anio', 'eurk', w, 'ink'), ' al año, ', M('perfil_segmento', 'ticket_medio', 'eur2', w), ' por visita']);
      li(['Última visita: hace ', M('segmentos', 'recencia_media', 'int', w, risk ? 'bad' : 'ink'), ' días']);
      li(['El ', M('perfil_segmento', 'pct_local', 'pct0', w, 'ink'), ' de sus visitas, en ', M('perfil_segmento', 'local', 'text', w)]);
      li(['Viene sobre todo por la ', M('perfil_segmento', 'franja', 'lower', w, 'ink'), ', y más los ', M('perfil_segmento', 'dia', 'lower', w), 's']);
      li(['Pide ', M('perfil_segmento', 'producto', 'text', w, 'ink'), ' con ', M('perfil_segmento', 'producto2', 'text', w)]);
      card.append(face, big, ul);
      return card;
    }));
  }

  function drawWf() {
    const box = $('#waterfall'), card = $('#wf-card'), d = dash.data('canal');
    if (!ready(box, d)) return;
    const r = d.data.find((x) => x.local === L() && x.tipo_canal === 'Delivery');
    if (!r) { box.replaceChildren(); return; }
    const W = box.clientWidth; if (!W) return;
    const H = Math.max(box.clientHeight, 256);
    const steps = [
      { lab: ['Ventas por', 'delivery'], from: 0, to: r.revenue, c: C.pale, v: r.revenue },
      { lab: ['Coste del', 'producto'], from: r.margen_bruto, to: r.revenue, c: C.pale, v: -r.coste_producto, op: 0.5 },
      { lab: ['Margen', 'bruto'], from: 0, to: r.margen_bruto, c: C.pale, v: r.margen_bruto },
      { lab: ['Comisión de', 'la plataforma'], from: r.margen_neto, to: r.margen_bruto, c: C.neg, v: -r.comision, hot: true },
      { lab: ['Lo que', 'queda'], from: 0, to: r.margen_neto, c: C.acc, v: r.margen_neto, hot: true },
    ];
    const mt = 40, mb = 40;
    const x = d3.scaleBand(steps.map((s, i) => i), [0, W]).paddingInner(0.28).paddingOuter(0.06);
    const y = d3.scaleLinear([0, r.revenue], [H - mb, mt]);
    const svg = d3.create('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Cascada del delivery');
    const anim = first('wf');
    steps.forEach((s, i) => {
      const x0 = x(i), bw = x.bandwidth();
      if (i < steps.length - 1) { const lvl = s.v >= 0 ? s.to : s.from; svg.append('line').attr('x1', x0 + bw).attr('x2', x(i + 1)).attr('y1', y(lvl)).attr('y2', y(lvl)).style('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '3 3').attr('opacity', 0.6); }
      const g = svg.append('g').style('cursor', 'default');
      g.append('rect').attr('x', x0).attr('width', bw).attr('y', y(s.to)).attr('height', Math.max(1, y(s.from) - y(s.to))).attr('rx', 4)
        .style('fill', s.c).attr('opacity', s.op ?? 1).attr('class', anim ? 'co-rise' : null).style('transform-box', 'fill-box').style('animation-delay', anim ? i * 110 + 'ms' : null);
      g.append('text').attr('x', x0 + bw / 2).attr('y', y(s.to) - 20).attr('text-anchor', 'middle').attr('font-size', 13).attr('font-weight', s.hot ? 700 : 500)
        .style('fill', s.c === C.neg ? C.neg : s.hot ? 'var(--co-ink)' : 'var(--color-fg-muted)').text((s.v < 0 ? '−' : '') + fK(Math.abs(s.v)));
      g.append('text').attr('x', x0 + bw / 2).attr('y', y(s.to) - 6).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', s.c === C.neg ? C.neg : 'var(--color-fg-muted)').text(fInt.format(Math.round((Math.abs(s.v) / r.revenue) * 100)) + ' céntimos');
      const t = g.append('text').attr('x', x0 + bw / 2).attr('y', H - mb + 16).attr('text-anchor', 'middle').attr('font-size', 11).style('fill', s.hot ? 'var(--co-ink)' : 'var(--color-fg-muted)').attr('font-weight', s.hot ? 600 : 400);
      s.lab.forEach((wd, j) => t.append('tspan').attr('x', x0 + bw / 2).attr('dy', j ? 13 : 0).text(wd));
      g.on('mousemove', (e) => tip(card, e, s.lab.join(' '), [(s.v < 0 ? '−' : '') + fEur0.format(Math.abs(s.v)), fInt.format(Math.round((Math.abs(s.v) / r.revenue) * 100)) + ' céntimos de cada euro de delivery'])).on('mouseleave', () => untip(card));
    });
    svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--cds-chart-axis)');
    box.replaceChildren(svg.node());
  }

  function drawSplit() {
    const box = $('#mn-canal'), card = $('#mn-card'), d = dash.data('canal');
    if (!ready(box, d)) return;
    const rs = ['Presencial', 'Delivery'].map((t) => d.data.find((x) => x.local === L() && x.tipo_canal === t)).filter(Boolean);
    box.replaceChildren(...rs.map((r) => {
      const del = r.tipo_canal === 'Delivery';
      const ln = el('div', 'ln'), top = el('div', 'top');
      const big = el('b', null, fPct1.format(r.margen_neto_pct)); big.style.color = del ? C.neg : 'var(--co-deep)';
      const right = el('span'); right.append(big, document.createTextNode(' se queda en casa')); right.style.color = 'var(--color-fg-muted)';
      top.append(el('span', null, del ? 'Delivery (Glovo y Uber Eats)' : 'En la barra'), right);
      const bar = el('div', 'bar');
      [[r.coste_pct, C.pale, 'lt', 'Producto'], [r.comision_pct, C.neg, '', 'Comisión'], [r.margen_neto_pct, C.acc, '', 'Lo que queda']].forEach(([v, c, cl, lab]) => {
        if (v <= 0) return;
        const s = el('div', 'seg ' + cl, v >= 0.1 ? fInt.format(Math.round(v * 100)) + ' c' : '');
        morph(s, 'flexGrow', 'split|' + r.tipo_canal + lab, v, ''); s.style.flexBasis = '0'; s.style.background = c;
        hover(s, card, lab + (del ? ' · delivery' : ' · en la barra'), [fInt.format(Math.round(v * 100)) + ' céntimos de cada euro', fPct1.format(v) + ' de las ventas']);
        bar.append(s);
      });
      ln.append(top, bar);
      return ln;
    }));
  }

  // ═════════ 05 · PLAN · SIMULADOR ═════════
  const SIM = { reactivar: 20, ticket: 8, comision: 5, cierre: 0 };
  const CIERRE = ['17:00 (como hoy)', '16:00', '15:00', '14:00'];
  const SL = [
    { k: 'reactivar', lab: 'Clientes que se van y recuperas', min: 0, max: 50, step: 5, show: (v) => v + ' %', sub: () => ['de los ', M('rfm_resumen', 'at_risk_clientes', 'int', '#0', 'ink'), ' que se van, que gastaban ', M('sim_base', 'at_risk_gasto_anual', 'eurk', W_LOC, 'ink'), ' al año' + (L() === 'Ambos' ? '' : ' en ' + L())] },
    { k: 'ticket', lab: 'Cuánto sube el ticket a mediodía', min: 0, max: 15, step: 1, show: (v) => '+' + v + ' %', sub: () => ['sobre ', M('sim_base', 'mediodia_revenue', 'eurk', W_LOC, 'ink'), ' vendidos a mediodía, con un ', M('sim_base', 'mediodia_margen', 'eurk', W_LOC), ' de margen'] },
    { k: 'comision', lab: 'Puntos menos de comisión de delivery', min: 0, max: 15, step: 1, show: (v) => (v ? '−' + v : '0') + ' puntos', sub: () => ['sobre ', M('sim_base', 'delivery_revenue', 'eurk', W_LOC, 'ink'), ' de delivery al año'] },
    { k: 'cierre', lab: 'Hora de cierre de lunes a viernes', min: 0, max: 3, step: 1, show: (v) => CIERRE[v], sub: () => ['cada silla cuesta 2,50 € la hora'] },
  ];
  function simGains(b) {
    return {
      reactivar: (SIM.reactivar / 100) * b.at_risk_margen_anual,
      ticket: (SIM.ticket / 100) * b.mediodia_margen,
      comision: (SIM.comision / 100) * b.delivery_revenue,
      cierre: [0, b.ahorro_16, b.ahorro_15, b.ahorro_14][SIM.cierre],
    };
  }
  const LEVERS = [
    ['reactivar', 'Recuperar clientes', C.acc],
    ['ticket', 'Ticket a mediodía', 'color-mix(in srgb, var(--co-acc) 78%, transparent)'],
    ['comision', 'Menos comisión', 'color-mix(in srgb, var(--co-acc) 58%, transparent)'],
    ['cierre', 'Cerrar antes la tarde', 'color-mix(in srgb, var(--co-acc) 40%, transparent)'],
  ];
  function buildSim() {
    const box = $('#sim-sliders');
    if (!box.childElementCount) {
      SL.forEach((s) => {
        const lab = el('label', 'co-sl'); lab.dataset.k = s.k;
        const top = el('div', 'top'); top.append(el('span', null, s.lab), el('b', 'val', s.show(SIM[s.k])));
        const inp = el('input'); inp.type = 'range'; inp.min = s.min; inp.max = s.max; inp.step = s.step; inp.value = SIM[s.k]; inp.setAttribute('aria-label', s.lab);
        const sub = el('div', 'sub'); sub.append(el('span', 'txt'), el('span', 'gain'));
        inp.addEventListener('input', () => { SIM[s.k] = Number(inp.value); drawSim(); });
        lab.append(top, inp, sub); box.append(lab);
      });
    }
    SL.forEach((s) => { $('[data-k="' + s.k + '"] .txt', box).replaceChildren(...s.sub().map(node)); });
    const viz = $('#sim-viz');
    if (!viz.childElementCount) {
      const big = el('div', 'co-simbig');
      const a = el('div'); a.append(el('div', 't', 'Margen hoy'), el('div', 'v hoy'));
      const f = el('div', 'fut'); f.append(el('div', 't', 'Podría ser'), el('div', 'v fut'), el('div', 'd'));
      big.append(a, el('div', 'arw', '→'), f);
      $('.v.hoy', a).append(node(M('sim_base', 'margen_actual', 'eurk', W_LOC)));
      const meter = el('div', 'co-simmeter');
      const lg = el('div', 'lg'); lg.append(el('span', 'l1', 'Lo que ya ganas'), el('span', 'l2', 'Lo que sumarías'));
      const bar = el('div', 'bar'); bar.append(el('i'), el('b'));
      meter.append(lg, bar);
      const story = el('p', 'co-simstory');
      const wrap = el('div');
      const h = el('div', 'co-note', 'De dónde sale cada euro de más'); h.style.cssText = 'margin: 0 0 4px; font-weight: 600; color: var(--co-ink)';
      const wf = el('div', 'co-wfall'), labs = el('div', 'co-wflabs');
      const tpl = 'repeat(5, minmax(0, 1fr))'; wf.style.gridTemplateColumns = tpl; labs.style.gridTemplateColumns = tpl;
      [...LEVERS, ['total', 'Total al año', C.deep]].forEach(([k, name, color]) => {
        const col = el('div', 'col' + (k === 'total' ? ' total' : '')); col.dataset.k = k;
        const blk = el('div', 'blk'); blk.style.background = color; blk.style.bottom = '0%'; blk.style.height = '0%';
        const val = el('div', 'val'); val.style.bottom = '0%';
        col.append(blk, val);
        if (k !== 'total') { const ln = el('div', 'lnk'); ln.style.bottom = '0%'; col.append(ln); }
        wf.append(col);
        const lb = el('div', k === 'total' ? 'total' : null); const sw = el('i'); sw.style.background = color; lb.append(sw, document.createTextNode(name)); labs.append(lb);
      });
      const zero = el('div', 'zero', 'Mueve un regulador para ver de dónde sale el dinero'); zero.hidden = true; wf.append(zero);
      wrap.append(h, wf, labs);
      viz.append(big, meter, story, wrap);
    }
  }
  let simPrev = null;
  function drawSim() {
    const b = row('sim_base', 'local=' + L()), viz = $('#sim-viz'), title = $('#sim-title');
    if (!b || !viz.childElementCount) return;
    const g = simGains(b), total = g.reactivar + g.ticket + g.comision + g.cierre, fut = b.margen_actual + total;
    SL.forEach((s) => {
      const lab = $('[data-k="' + s.k + '"]', $('#sim-sliders')); if (!lab) return;
      const inp = $('input', lab); inp.style.setProperty('--p', ((SIM[s.k] - s.min) / (s.max - s.min)) * 100 + '%');
      $('.val', lab).textContent = s.show(SIM[s.k]);
      const gn = $('.gain', lab); gn.textContent = signed(g[s.k], fK(Math.abs(g[s.k]))) + ' al año'; gn.classList.toggle('neg', g[s.k] < 0);
    });
    const pct = total / b.margen_actual;
    const strong = (t, cls) => el('span', cls, t);
    title.replaceChildren(...(total > 0
      ? ['Con estas decisiones, ' + who() + ' ganaría ', strong(fK(total), 'hl'), ' más de margen al año: un ', strong(fPct1.format(pct), 'hl'), ' más que hoy.']
      : ['Con estos ajustes, ' + who() + ' no ganaría margen. Prueba a mover otro regulador.']).map(node));
    const fv = $('.v.fut', viz);
    if (simPrev != null && !RM && simPrev !== fut) countTo(fv, simPrev, fut, fK); else fv.textContent = fK(fut);
    simPrev = fut;
    $('.d', viz).textContent = signed(total, fK(Math.abs(total))) + ' (' + signed(pct, fPct1.format(Math.abs(pct))) + ')';
    // Meter: what you already earn vs what you'd add
    const pos = Math.max(0, total), sc = b.margen_actual + pos;
    const m = $('.co-simmeter', viz);
    $('.bar i', m).style.width = (b.margen_actual / sc) * 100 + '%';
    const add = $('.bar b', m); add.style.left = (b.margen_actual / sc) * 100 + '%'; add.style.width = (pos / sc) * 100 + '%';
    $('.l2', m).textContent = pos > 0 ? '+ ' + fK(pos) + ' que sumarías' : 'Nada que sumar todavía';
    // Story line
    const top = Object.entries(g).sort((a, c) => c[1] - a[1])[0];
    const nm = Object.fromEntries(LEVERS.map(([k, n]) => [k, n.toLowerCase()]));
    $('.co-simstory', viz).replaceChildren(...(total > 0
      ? [document.createTextNode('Son unos '), el('b', null, fEur0.format(total / 365)), document.createTextNode(' más cada día del año. La palanca que más aporta es '), el('b', null, nm[top[0]]), document.createTextNode(', con ' + fK(top[1]) + '.')]
      : [document.createTextNode('Todavía no hay ganancia: sube algún regulador para verla.')]));
    // Waterfall of the extra margin
    let cum = 0, lo = 0, hi = 0;
    const steps = LEVERS.map(([k]) => { const from = cum; cum += g[k]; lo = Math.min(lo, from, cum); hi = Math.max(hi, from, cum); return { k, from, to: cum, v: g[k] }; });
    hi = Math.max(hi, total); const span = (hi - lo) || 1;
    const pctOf = (v) => ((v - lo) / span) * 100;
    const wf = $('.co-wfall', viz);
    $('.zero', wf).hidden = Math.abs(total) > 1 || steps.some((s) => Math.abs(s.v) > 1);
    [...steps, { k: 'total', from: 0, to: total, v: total }].forEach((s, i, arr) => {
      const col = $('.col[data-k="' + s.k + '"]', wf);
      const blk = $('.blk', col), val = $('.val', col), lnk = $('.lnk', col);
      const a = Math.min(s.from, s.to), z = Math.max(s.from, s.to);
      blk.style.bottom = pctOf(a) + '%'; blk.style.height = Math.max(0.6, pctOf(z) - pctOf(a)) + '%';
      if (s.k !== 'total') blk.style.background = s.v < 0 ? C.neg : LEVERS.find((l) => l[0] === s.k)[2];
      val.style.bottom = 'calc(' + pctOf(z) + '% + 4px)';
      val.replaceChildren(document.createTextNode(Math.abs(s.v) < 1 ? '0 €' : signed(s.v, fK(Math.abs(s.v)))));
      if (s.k !== 'total' && total > 0 && s.v > 0) val.append(el('small', null, fPct0.format(s.v / total) + ' del total'));
      val.style.color = s.v < 0 ? C.neg : '';
      if (lnk) lnk.style.bottom = pctOf(s.to) + '%';
      col.onmousemove = (e) => tip($('#sim-card'), e, s.k === 'total' ? 'Total al año' : LEVERS.find((l) => l[0] === s.k)[1], [signed(s.v, fEur0.format(Math.abs(s.v))) + ' de margen al año', ...(s.k !== 'total' && total > 0 ? [fPct0.format(Math.max(0, s.v) / total) + ' de lo que se gana de más'] : [])]);
      col.onmouseleave = () => untip($('#sim-card'));
    });
  }

  // ═════════ COMPARAR ═════════
  const DUO = {
    carta: [
      ['Productos imprescindibles', 'abc_resumen', 'n_a', 'int', (l) => 'local=' + l],
      ['Peso de los imprescindibles', 'abc_resumen', 'revenue_pct_a', 'pct1', (l) => 'local=' + l],
      ['Peso de la cola en la caja', 'abc_resumen', 'revenue_pct_c', 'pct1', (l) => 'local=' + l, true],
    ],
    operacion: [
      ...FRANJAS.map((f) => ['Euros por silla y hora · ' + f.toLowerCase(), 'revpash', 'revpash', 'rp', (l) => 'local=' + l + '&franja=' + f, false, true]),
      ['El fin de semana rinde', 'ops_resumen', 'ratio_finde', 'x1', (l) => 'local=' + l],
      ['Lo que pierde la tarde al año', 'ops_resumen', 'brecha_peor', 'eurk', (l) => 'local=' + l, true],
    ],
    clientes: [
      ['Peso del delivery en las ventas', 'canal', 'pct_revenue', 'pct1', (l) => 'local=' + l + '&tipo_canal=Delivery', true],
      ['Margen del delivery tras comisión', 'canal', 'margen_neto_pct', 'pct1', (l) => 'local=' + l + '&tipo_canal=Delivery'],
      ['Comisión pagada al año', 'canal', 'comision', 'eurk', (l) => 'local=' + l + '&tipo_canal=Delivery', true],
      ['Te queda por pedido en la barra', 'canal', 'margen_neto_pedido', 'eur2', (l) => 'local=' + l + '&tipo_canal=Presencial'],
      ['Te queda por pedido en delivery', 'canal', 'margen_neto_pedido', 'eur2', (l) => 'local=' + l + '&tipo_canal=Delivery'],
    ],
    plan: [
      ['Recuperar a los que se van', 'plan', 'impacto', 'eurk', (l) => 'local=' + l + '&id=reactivar'],
      ['Que la tarde se pague sola', 'plan', 'impacto', 'eurk', (l) => 'local=' + l + '&id=franja'],
      ['Combos fijos a mediodía', 'plan', 'impacto', 'eurk', (l) => 'local=' + l + '&id=combos'],
      ['5 puntos menos de comisión', 'plan', 'impacto', 'eurk', (l) => 'local=' + l + '&id=delivery'],
    ],
  };
  const lastLocal = { v: 'Ambos' };
  ['resumen', 'carta', 'operacion', 'clientes', 'plan'].forEach((p) => { const c = $('#cmp-' + p); if (c) $('#cmp-body').append(c); });
  $$('#cmp-tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.cmpTab, { link: false, quiet: true })));
  const closeCmp = () => dash.setParams({ local: lastLocal.v });
  $('#cmp-close').addEventListener('click', closeCmp);
  $('#cmp-overlay').addEventListener('click', (e) => { if (e.target.id === 'cmp-overlay') closeCmp(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isCmp() && story == null) closeCmp(); });
  let cmpWasOpen = false;
  function syncCmpOverlay() {
    const open = isCmp(), ov = $('#cmp-overlay');
    if (!open) lastLocal.v = rawLocal();
    ov.hidden = !open;
    $$('#cmp-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cmpTab === current)));
    const names = { resumen: 'Resumen', carta: 'Carta', operacion: 'Horarios', clientes: 'Clientes y delivery', plan: 'Plan de acción' };
    $('#cmp-title').textContent = 'Lavapiés frente a Malasaña · ' + names[current];
    if (open && !cmpWasOpen) setTimeout(() => $('#cmp-close').focus({ preventScroll: true }), 60);
    cmpWasOpen = open;
  }
  function buildCmp() {
    syncCmpOverlay();
    PAGES.forEach((p) => { const c = $('#cmp-' + p); if (c) c.hidden = !isCmp() || p !== current; });
    if (!isCmp() || !DUO[current]) return;
    const spec = DUO[current], box = $('#cmpbox-' + current);
    box.dataset.source = [...new Set(spec.map((s) => s[1]))].join(' ');
    const grid = el('div', 'co-duo');
    grid.append(el('div', 'hd l', ''), el('div', 'hd', 'Lavapiés'), el('div', 'hd', 'Malasaña'));
    spec.forEach(([lab, src, field, fmt, w, lowerBetter, umbral], i) => {
      const a = row(src, w('Lavapiés')), b = row(src, w('Malasaña'));
      const va = a ? a[field] : 0, vb = b ? b[field] : 0, mx = Math.max(va, vb, umbral ? UMBRAL : 0) || 1;
      const win = lowerBetter ? (va < vb ? 'Lavapiés' : 'Malasaña') : (va > vb ? 'Lavapiés' : 'Malasaña');
      grid.append(el('div', 'lab', lab));
      [['Lavapiés', va], ['Malasaña', vb]].forEach(([loc, v]) => {
        const cell = el('div', 'cell'), trk = el('div', 'trk'), f = el('div', 'fill');
        f.dataset.k = 'duo|' + current + i + loc; f.dataset.v = (v / mx) * 100;
        f.style.background = umbral && v < UMBRAL ? C.neg : LOC_COLOR[loc];
        trk.append(f);
        const vv = el('div', 'v' + (loc === win ? ' win' : '')); vv.append(node(M(src, field, fmt, w(loc))));
        cell.append(trk, vv); grid.append(cell);
      });
    });
    box.replaceChildren(grid);
  }
  function drawCmp() {
    if (!isCmp()) return;
    $$('.co-duo .fill').forEach((f) => morph(f, 'width', f.dataset.k, Number(f.dataset.v)));
    if (current !== 'resumen') return;
    const card = $('#cmp-resumen');
    const sb = $('#cmp-slope'), k = dash.data('kpis');
    if (ready(sb, k)) {
      const W = sb.clientWidth || 320, H = 230, ml = 84, mr = Math.min(140, Math.max(124, W * 0.34));
      const pts = ['Lavapiés', 'Malasaña'].map((l) => { const r = k.data.find((x) => x.local === l); return { l, a: r.revenue_previo, b: r.revenue, v: r.var_revenue, y0: r.anio_previo, y1: r.anio }; });
      const y = d3.scaleLinear([0, d3.max(pts, (p) => Math.max(p.a, p.b)) * 1.1], [H - 24, 16]);
      const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Ventas por local, año contra año');
      [ml, W - mr].forEach((xx, i) => { svg.append('line').attr('x1', xx).attr('x2', xx).attr('y1', 10).attr('y2', H - 22).style('stroke', 'var(--cds-chart-grid)'); svg.append('text').attr('x', xx).attr('y', H - 6).attr('text-anchor', 'middle').attr('font-size', 11).attr('font-weight', 600).style('fill', 'var(--co-ink)').text(i ? pts[0].y1 : pts[0].y0); });
      const ends = pts.map((p) => ({ p, y: y(p.b) })).sort((m, n) => m.y - n.y);
      for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 34) { const mid = (ends[i].y + ends[i - 1].y) / 2; ends[i - 1].y = mid - 17; ends[i].y = mid + 17; }
      const starts = pts.map((p) => ({ p, y: y(p.a) })).sort((m, n) => m.y - n.y);
      for (let i = 1; i < starts.length; i++) if (starts[i].y - starts[i - 1].y < 16) { const mid = (starts[i].y + starts[i - 1].y) / 2; starts[i - 1].y = mid - 8; starts[i].y = mid + 8; }
      pts.forEach((p) => {
        const c = LOC_COLOR[p.l], ey = ends.find((e) => e.p === p).y, sy = starts.find((e) => e.p === p).y;
        svg.append('line').attr('x1', ml).attr('x2', W - mr).attr('y1', y(p.a)).attr('y2', y(p.b)).style('stroke', c).attr('stroke-width', 3.5).attr('stroke-linecap', 'round');
        [[ml, p.a], [W - mr, p.b]].forEach(([xx, v]) => svg.append('circle').attr('cx', xx).attr('cy', y(v)).attr('r', 5).style('fill', c));
        svg.append('text').attr('x', ml - 10).attr('y', sy).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 11).style('fill', 'var(--color-fg-muted)').text(fK(p.a) + (p.l === 'Malasaña' ? '*' : ''));
        const t = svg.append('text').attr('x', W - mr + 10).attr('y', ey - 3).attr('font-size', 12);
        t.append('tspan').attr('font-weight', 700).style('fill', 'var(--co-ink)').text(p.l);
        const t2 = svg.append('text').attr('x', W - mr + 10).attr('y', ey + 12).attr('font-size', 11);
        t2.append('tspan').style('fill', 'var(--color-fg-muted)').text(fK(p.b) + ' ');
        t2.append('tspan').attr('font-weight', 700).style('fill', p.v < 0 ? C.neg : C.pos).text(signed(p.v, fPct1.format(Math.abs(p.v))));
      });
      svg.append('text').attr('x', 0).attr('y', 10).attr('font-size', 10).style('fill', 'var(--color-fg-muted)').text('* Malasaña, solo medio año');
      sb.replaceChildren(svg.node());
    }
    const mb = $('#cmp-mult'), m = dash.data('mensual');
    if (ready(mb, m)) {
      const all = m.data.filter((r) => r.local !== 'Ambos'), ymax = d3.max(all, (r) => r.revenue);
      const doms = [...new Set(all.map((r) => r.mes))].sort();
      mb.replaceChildren(...['Lavapiés', 'Malasaña'].map((l) => {
        const wrap = el('div'), t = el('div', 't', l), rs = all.filter((r) => r.local === l);
        const tot = rs.filter((r) => r.mes.startsWith(doms[doms.length - 1].slice(0, 4))).reduce((s, r) => s + r.revenue, 0);
        t.append(el('span', null, fK(tot) + ' en ' + doms[doms.length - 1].slice(0, 4)));
        const W = (mb.clientWidth || 600) / (mb.clientWidth > 640 ? 2 : 1) - 8, H = 120;
        const x = d3.scaleBand(doms, [0, W]).paddingInner(0.2), y = d3.scaleLinear([0, ymax], [H - 14, 4]);
        const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Ventas mensuales de ' + l);
        svg.append('g').selectAll('rect').data(rs).join('rect').attr('x', (r) => x(r.mes)).attr('width', x.bandwidth()).attr('y', (r) => y(r.revenue)).attr('height', (r) => y(0) - y(r.revenue)).attr('rx', 1.5).style('fill', LOC_COLOR[l])
          .on('mousemove', (e, r) => tip(card, e, l + ' · ' + mesLabel(r.mes), [fEur0.format(r.revenue) + ' vendidos'])).on('mouseleave', () => untip(card));
        svg.append('line').attr('x1', 0).attr('x2', W).attr('y1', y(0)).attr('y2', y(0)).style('stroke', 'var(--cds-chart-axis)');
        [...new Set(doms.map((d) => d.slice(0, 4)))].forEach((yy) => svg.append('text').attr('x', x(yy + '-01') ?? 0).attr('y', H - 2).attr('font-size', 9).style('fill', 'var(--color-fg-muted)').text(yy));
        wrap.append(t, svg.node());
        return wrap;
      }));
    }
  }

  // ═════════ MODO "CUÉNTAMELO" ═════════
  const STEPS = [
    { tab: 'resumen', t: ['inicio'], ch: 'Antes de empezar', tx: () => ['En cinco minutos vas a ver por qué ' + who() + ' vende más que nunca pero no gana más por cliente, y qué cinco decisiones pueden cambiarlo.'] },
    { tab: 'resumen', t: ['kpis'], ch: 'Capítulo 1 de 5 · Dónde estamos', tx: () => ['Las ventas suben un ', M('kpis', 'var_revenue', 'pct1', W_LOC, 'hl'), ', pero el gasto por visita se queda en ', M('kpis', 'ticket_medio', 'eur2', W_LOC, 'ink'), '. Crecemos porque viene más gente, no porque cada cliente deje más.'] },
    { tab: 'resumen', t: ['hero-card'], fc: true, ch: 'Capítulo 1 de 5 · Dónde estamos', tx: () => ['Y ojo: casi todo ese salto es la apertura de Malasaña. Comparando los mismos meses, se vende un ', M('comparable', 'var_comparable', 'pctabs', W_LOC, 'bad'), ' menos. Si nada cambia, ', M('prevision_resumen', 'anio', 'year', W_LOC), ' cerraría en torno a ', M('prevision_resumen', 'centro', 'eurk', W_LOC, 'ink'), '.'] },
    { tab: 'resumen', t: ['cal-card'], ch: 'Capítulo 1 de 5 · Dónde estamos', tx: () => ['El calendario lo confirma sin palabras: agosto se apaga cada año y los fines de semana sostienen la caja.'] },
    { tab: 'carta', t: ['pareto-card'], ch: 'Capítulo 2 de 5 · La carta', tx: () => ['Con ', M('abc_resumen', 'n_a', 'int', W_LOC, 'hl'), ' de los ', M('abc_resumen', 'productos', 'int', W_LOC), ' productos se hace el 70 % de las ventas…'] },
    { tab: 'carta', t: ['carta-right'], ch: 'Capítulo 2 de 5 · La carta', tx: () => ['…y los ', M('abc_resumen', 'n_c', 'int', W_LOC, 'bad'), ' de la cola apenas traen el ', M('abc_resumen', 'revenue_pct_c', 'pct1', W_LOC, 'bad'), '. Ocupan sitio en la carta, en la cocina y en el almacén.'] },
    { tab: 'carta', t: ['combos', 'cesta'], ch: 'Capítulo 2 de 5 · La carta', tx: () => ['Mientras, la gente ya nos dice qué combos quiere: ', M('combos_top', 'combo', 'text', 'puesto=1', 'ink'), ' se piden juntos ', M('combos_top', 'lift', 'times', 'puesto=1', 'hl'), ' más de lo normal.'] },
    { tab: 'operacion', t: ['rp-card'], ch: 'Capítulo 3 de 5 · Los horarios', tx: () => ['Cada silla factura ', M('ops_resumen', 'revpash_peor', 'rp', W_LOC, 'bad'), ' por hora en la ', M('ops_resumen', 'franja_peor', 'lower', W_LOC, 'ink'), ', y tenerla abierta cuesta 2,50 €. Esa franja pierde dinero.'] },
    { tab: 'operacion', t: ['rpd-card'], ch: 'Capítulo 3 de 5 · Los horarios', tx: () => ['El fin de semana es otra historia: cada silla rinde ', M('ops_resumen', 'ratio_finde', 'x1', W_LOC, 'hl'), ' más que entre semana.'] },
    { tab: 'operacion', t: ['tf-card', 'td-card'], ch: 'Capítulo 3 de 5 · Los horarios', tx: () => ['Y lo que gasta un cliente depende de la hora a la que entra: ', M('ops_resumen', 'rango_ticket_franja', 'eur2', W_LOC, 'ink'), ' de diferencia entre franjas, frente a ', M('ops_resumen', 'rango_ticket_dia', 'eur2', W_LOC), ' entre días.'] },
    { tab: 'clientes', t: ['seg-card', 'seg-table-card'], ch: 'Capítulo 4 de 5 · Los clientes', tx: () => [M('rfm_resumen', 'clientes_top', 'int', '#0', 'hl'), ' clientes fieles traen el ', M('rfm_resumen', 'pct_revenue_top', 'pct1', '#0', 'hl'), ' de las ventas. Y ', M('rfm_resumen', 'at_risk_clientes', 'int', '#0', 'bad'), ' que gastaban igual que ellos se están yendo.'] },
    { tab: 'clientes', t: ['personas', 'personas-sec'], ch: 'Capítulo 4 de 5 · Los clientes', tx: () => ['Todos piden lo mismo: ', M('perfil_segmento', 'producto', 'text', 'segmento_rfm=Champions', 'ink'), ' y ', M('perfil_segmento', 'producto2', 'text', 'segmento_rfm=Champions', 'ink'), '. Lo que los separa es cuántas veces vuelven.'] },
    { tab: 'clientes', t: ['wf-card', 'mn-card'], ch: 'Capítulo 4 de 5 · Los clientes', tx: () => ['Y en el delivery, de cada euro, ', M('canal_resumen', 'centimos_comision', 'cent', W_LOC, 'bad'), ' se van a la plataforma. En la barra te quedas ', M('canal_resumen', 'centimos_local', 'cent', W_LOC, 'hl'), '; en delivery, ', M('canal_resumen', 'centimos_delivery', 'cent', W_LOC, 'bad'), '.'] },
    { tab: 'plan', t: ['sim-card'], ch: 'Capítulo 5 de 5 · Qué hacemos', tx: () => { const b = row('sim_base', 'local=' + L()); const g = b ? simGains(b) : null; const tot = g ? g.reactivar + g.ticket + g.comision + g.cierre : 0; return ['Ahora te toca a ti. Mueve los reguladores: recuperar clientes, combos a mediodía, apretar la comisión y cerrar antes la tarde. Con los valores de ahora, el margen crecería ', el('span', 'hl', fK(tot)), ' al año.']; } },
    { tab: 'resumen', t: ['inicio'], ch: 'En resumen', tx: () => ['Vendemos más, pero no mejor. El margen que falta está en el mediodía, en los ', M('rfm_resumen', 'clientes_top', 'int', '#0', 'ink'), ' clientes fieles y en el delivery. Y la primera decisión es urgente: recuperar a los ', M('rfm_resumen', 'at_risk_clientes', 'int', '#0', 'bad'), ' que se van.'] },
  ];
  let story = null, litTimer = null;
  function storyGo(i) {
    story = Math.max(0, Math.min(STEPS.length - 1, i));
    const s = STEPS[story];
    if (s.fc && !showFc) showFc = true;
    root.classList.add('co-storying');
    $('#player').hidden = false;
    if (s.tab !== current) show(s.tab, { link: false, quiet: true });
    $$('.is-focus').forEach((e) => e.classList.remove('is-focus', 'is-lit'));
    const targets = s.t.map((id) => document.getElementById(id)).filter(Boolean);
    targets.forEach((e) => e.classList.add('is-focus'));
    clearTimeout(litTimer);
    litTimer = setTimeout(() => targets.forEach((e) => e.classList.add('is-lit')), RM ? 0 : 450);
    buildStoryText();
    fill();
    const t0 = targets[0];
    if (t0) t0.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: t0.offsetHeight > window.innerHeight * 0.6 ? 'start' : 'center' });
  }
  function buildStoryText() {
    if (story == null) return;
    const s = STEPS[story];
    $('#pl-ch').textContent = s.ch;
    $('#pl-tx').replaceChildren(...s.tx().map(node));
    $('#pl-dots').replaceChildren(...STEPS.map((x, i) => el('i', i === story ? 'on' : null)));
    $('#pl-pv').disabled = story === 0;
    $('#pl-nx').textContent = story === STEPS.length - 1 ? 'Terminar' : 'Siguiente →';
  }
  function storyEnd() {
    story = null; clearTimeout(litTimer);
    root.classList.remove('co-storying');
    $$('.is-focus').forEach((e) => e.classList.remove('is-focus', 'is-lit'));
    $('#player').hidden = true;
    $('#inicio').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
  }
  $('#story-start').addEventListener('click', () => storyGo(0));
  $('#pl-nx').addEventListener('click', () => (story === STEPS.length - 1 ? storyEnd() : storyGo(story + 1)));
  $('#pl-pv').addEventListener('click', () => storyGo(story - 1));
  $('#pl-x').addEventListener('click', storyEnd);
  document.addEventListener('keydown', (e) => {
    if (story == null) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); story === STEPS.length - 1 ? storyEnd() : storyGo(story + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); storyGo(story - 1); }
    else if (e.key === 'Escape') storyEnd();
  });

  // ═════════ GLOSARIO ═════════
  const GL = {
    margen_bruto: ['Margen bruto', 'Lo que queda de cada venta después de pagar el producto (café, harina, leche…). Todavía sin contar sueldos ni alquiler.'],
    margen_neto: ['Margen tras comisiones', 'El margen bruto menos lo que se quedan Glovo y Uber Eats en los pedidos a domicilio.'],
    ticket: ['Gasto medio por visita', 'Lo que paga de media cada cliente en una compra. En hostelería se llama ticket medio.'],
    tickets: ['Tickets', 'Número de compras. Un café y un croissant pagados juntos cuentan como un ticket.'],
    rp: ['Euros por silla y hora', 'Lo que factura cada silla en cada hora abierta (en hostelería, RevPASH). Si baja de 2,50 €, esa hora cuesta más de lo que trae.'],
    horas_silla: ['Horas de silla', 'Cuántas horas hay sillas disponibles: días abiertos × horas de la franja × número de sillas.'],
    imprescindibles: ['Imprescindibles', 'Los productos que, sumados de más a menos vendido, hacen el 70 % de la caja (clase A de un análisis ABC).'],
    secundarios: ['Secundarios', 'Los que llevan del 70 % al 90 % de las ventas (clase B).'],
    cola: ['La cola', 'Los productos que, todos juntos, solo suman el último 10 % de las ventas (clase C). Son los candidatos a salir.'],
    lift: ['Veces más de lo normal', 'Cuántas veces más se compran juntos dos productos de lo que pasaría por puro azar. 1 vez es casualidad; 3 veces es una pareja de verdad.'],
    tipos: ['Tipos de cliente', 'Agrupamos a los 1.200 clientes según cuándo vinieron por última vez, cuántas veces vienen y cuánto gastan (modelo RFM con K-Means).'],
    comision: ['Comisión', 'Lo que cobra la plataforma por cada pedido a domicilio: el 30 % de lo vendido.'],
    franja: ['Franja', 'Tramos del día: apertura (antes de las 9), mañana (9 a 12), mediodía (12 a 14) y tarde (14 a 17).'],
    prevision: ['Previsión 2026', 'Una estimación sencilla: cada mes de 2025 por lo que crecieron las ventas en el segundo semestre, con un margen de error. No es un modelo de machine learning.'],
  };
  const gtip = $('#gtip');
  function showG(t) {
    const g = GL[t.dataset.g]; if (!g) return;
    gtip.replaceChildren(el('b', null, g[0]), document.createTextNode(g[1]));
    gtip.hidden = false;
    const rr = root.getBoundingClientRect(), r = t.getBoundingClientRect();
    let x = r.left - rr.left; const maxX = rr.width - gtip.offsetWidth - 4;
    x = Math.max(4, Math.min(x, maxX));
    let y = r.bottom - rr.top + 8;
    if (r.bottom + gtip.offsetHeight + 12 > window.innerHeight) y = r.top - rr.top - gtip.offsetHeight - 8;
    gtip.style.left = x + 'px'; gtip.style.top = y + 'px';
  }
  root.addEventListener('mouseover', (e) => { const t = e.target.closest('.co-g'); if (t) showG(t); });
  root.addEventListener('mouseout', (e) => { if (e.target.closest('.co-g')) gtip.hidden = true; });
  root.addEventListener('focusin', (e) => { const t = e.target.closest('.co-g'); if (t) showG(t); });
  root.addEventListener('focusout', (e) => { if (e.target.closest('.co-g')) gtip.hidden = true; });
  root.addEventListener('click', (e) => { const t = e.target.closest('.co-g'); if (t) { e.preventDefault(); gtip.hidden ? showG(t) : (gtip.hidden = true); } });

  // ═════════ RENDER, TABS, FILTERS ═════════
  let current = 'resumen';
  function drawPage() {
    if (current === 'resumen') { drawSparks(); drawHero(); drawCal(); }
    if (current === 'carta') { drawPareto(); drawMix(); drawPoda(); drawCombos(); drawHeatCombos(); drawFicha(); requestAnimationFrame(equalizeCarta); }
    if (current === 'operacion') { drawRp(); drawRpHeat(); drawTickets(); }
    if (current === 'clientes') { drawSeg(); drawSegTable(); drawWf(); drawSplit(); }
    if (current === 'plan') drawSim();
    drawCmp();
  }
  function render() {
    detectDark();
    const raw = rawLocal(), f = FR();
    $$('#local-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.local === raw)));
    $('#caveat-mal').hidden = raw !== 'Malasaña' || current !== 'resumen';
    const chip = $('#franja-chip');
    chip.hidden = !f || !['carta', 'operacion'].includes(current);
    chip.textContent = f ? 'Franja: ' + f + '  ✕' : '';
    buildHook();
    buildSignals();
    buildCmp();
    if (current === 'operacion') buildExplainer();
    if (current === 'carta') buildFicha();
    if (current === 'clientes') buildPersonas();
    if (current === 'plan') buildSim();
    buildStoryText();
    fill();
    drawPage();
  }
  function show(id, { anchor, link = true, quiet = false } = {}) {
    if (!PAGES.includes(id)) return;
    current = id;
    $$('.co-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    PAGES.forEach((p) => { $('#' + p).hidden = p !== id; });
    render();
    if (link) dash.setLink(anchor || id);
    if (quiet) return;
    const target = anchor ? $('#' + anchor) : null;
    if (target) target.scrollIntoView({ block: 'start' });
    else if (link) $('#inicio').scrollIntoView({ block: 'start' });
  }
  $$('.co-tab').forEach((b) => b.addEventListener('click', () => { if (story != null) storyEnd(); show(b.dataset.tab); }));
  $$('[data-go]').forEach((b) => {
    const go = () => show(b.dataset.go, { anchor: b.dataset.anchor });
    b.addEventListener('click', go);
    b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  $$('#local-filter button').forEach((b) => b.addEventListener('click', () => dash.setParams({ local: b.dataset.local })));
  $('#franja-chip').addEventListener('click', () => dash.setParams({ franja: null }));

  dash.onData(render);

  const named = location.hash.slice(1) && document.getElementById(location.hash.slice(1));
  if (named && root.contains(named)) {
    const page = named.closest('.co-page');
    if (page) show(page.id, { anchor: named.id === page.id ? null : named.id, link: false });
  }
})();
