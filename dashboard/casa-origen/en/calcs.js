dash.calc('mensual', {
  title: 'Monthly revenue by café',
  description: 'Revenue, tickets, margin and average ticket for each month, by café and for both.',
  inputs: ['ventas_mes'],
  fn: (ventas_mes) => {
    const by = {};
    for (const r of ventas_mes) {
      for (const local of ['Both', r.local]) {
        const g = by[local + '|' + r.mes] ??= { local, mes: r.mes, revenue: 0, tickets: 0, margen_bruto: 0 };
        g.revenue += Number(r.revenue); g.tickets += Number(r.tickets); g.margen_bruto += Number(r.margen_bruto);
      }
    }
    return Object.values(by)
      .map((g) => ({ ...g, ticket_medio: g.revenue / g.tickets, margen_pct: g.margen_bruto / g.revenue }))
      .sort((a, b) => a.local.localeCompare(b.local) || a.mes.localeCompare(b.mes));
  },
});

dash.calc('kpis', {
  title: 'Latest-year KPIs',
  description: 'Revenue, tickets, average ticket and margins for the latest full year versus the previous one, with its best and worst month.',
  inputs: ['ventas_mes'],
  fn: (ventas_mes) => {
    const meses = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const yr = ventas_mes.reduce((m, r) => (r.mes > m ? r.mes : m), '').slice(0, 4);
    const py = String(Number(yr) - 1);
    const out = {};
    for (const r of ventas_mes) {
      const y = r.mes.slice(0, 4);
      if (y !== yr && y !== py) continue;
      for (const local of ['Both', r.local]) {
        const g = out[local] ??= { local, c: { revenue: 0, tickets: 0, margen: 0, comision: 0, delivery: 0 }, p: { revenue: 0, tickets: 0, margen: 0 }, mes: {} };
        const s = y === yr ? g.c : g.p;
        s.revenue += Number(r.revenue); s.tickets += Number(r.tickets); s.margen += Number(r.margen_bruto);
        if (y === yr) {
          s.comision += Number(r.comision);
          if (r.tipo_canal === 'Delivery') s.delivery += Number(r.revenue);
          g.mes[r.mes] = (g.mes[r.mes] ?? 0) + Number(r.revenue);
        }
      }
    }
    return Object.values(out).map(({ local, c, p, mes }) => {
      const ms = Object.entries(mes).sort((a, b) => b[1] - a[1]);
      const [pico, valle] = [ms[0], ms[ms.length - 1]];
      return {
        local, anio: Number(yr), anio_previo: Number(py),
        revenue: c.revenue, revenue_previo: p.revenue, var_revenue: p.revenue ? c.revenue / p.revenue - 1 : null,
        tickets: c.tickets, var_tickets: p.tickets ? c.tickets / p.tickets - 1 : null,
        ticket_medio: c.revenue / c.tickets, var_ticket: p.tickets ? (c.revenue / c.tickets) / (p.revenue / p.tickets) - 1 : null,
        margen_pct: c.margen / c.revenue, var_margen_pp: p.revenue ? (c.margen / c.revenue - p.margen / p.revenue) * 100 : null,
        margen_neto_pct: (c.margen - c.comision) / c.revenue, pct_delivery: c.delivery / c.revenue,
        mes_pico: meses[Number(pico[0].slice(5)) - 1], revenue_pico: pico[1],
        mes_valle: meses[Number(valle[0].slice(5)) - 1], revenue_valle: valle[1],
      };
    });
  },
});

dash.calc('abc', {
  title: 'ABC product classification',
  description: 'Products ranked by revenue 2023–2025 with cumulative %: A up to 70%, B up to 90%, C the tail.',
  inputs: ['productos'],
  fn: (productos) => {
    const by = {};
    for (const r of productos) {
      for (const local of ['Both', r.local]) {
        const g = by[local + '|' + r.producto] ??= { local, producto: r.producto, categoria: r.categoria, revenue: 0, margen_bruto: 0, unidades: 0 };
        g.revenue += Number(r.revenue); g.margen_bruto += Number(r.margen_bruto); g.unidades += Number(r.unidades);
      }
    }
    const out = [];
    for (const local of ['Both', 'Lavapiés', 'Malasaña']) {
      const rows = Object.values(by).filter((g) => g.local === local).sort((a, b) => b.revenue - a.revenue);
      const total = rows.reduce((s, g) => s + g.revenue, 0);
      let acum = 0;
      rows.forEach((g, i) => {
        acum += g.revenue;
        const pct_acumulado = acum / total;
        out.push({ ...g, rank: i + 1, pct_revenue: g.revenue / total, pct_acumulado, margen_pct: g.margen_bruto / g.revenue,
          clase: pct_acumulado <= 0.7 ? 'A' : pct_acumulado <= 0.9 ? 'B' : 'C' });
      });
    }
    return out;
  },
});

dash.calc('abc_resumen', {
  title: 'ABC summary',
  description: 'How many products sit in each ABC class and what share of revenue they add up to.',
  inputs: ['abc'],
  fn: (abc) => ['Both', 'Lavapiés', 'Malasaña'].map((local) => {
    const rows = abc.filter((r) => r.local === local);
    const n = (c) => rows.filter((r) => r.clase === c).length;
    const rev = (c) => rows.filter((r) => r.clase === c).reduce((s, r) => s + r.pct_revenue, 0);
    return { local, productos: rows.length, n_a: n('A'), n_b: n('B'), n_c: n('C'),
      pct_productos_a: n('A') / rows.length, revenue_pct_a: rev('A'), revenue_pct_c: rev('C') };
  }),
});

dash.calc('combos_top', {
  title: 'Top 5 pairs by lift',
  description: 'The highest-lift rule for each product pair; the five strongest pairs, with the time slot where they are ordered together most.',
  inputs: ['reglas', 'combos_franja'],
  fn: (reglas, combos_franja) => {
    const pico = {};
    for (const r of combos_franja) {
      const k = [r.producto_a, r.producto_b].sort().join(' + ');
      if (!pico[k] || Number(r.support_pct) > pico[k].v) pico[k] = { v: Number(r.support_pct), franja: r.franja };
    }
    const best = {};
    for (const r of reglas) {
      const combo = [r.antecedente, r.consecuente].sort().join(' + ');
      if (!best[combo] || Number(r.lift) > best[combo].lift) {
        best[combo] = { combo, antecedente: r.antecedente, consecuente: r.consecuente, franja: r.franja, franja_txt: r.franja,
          lift: Number(r.lift), confianza: Number(r.confianza), n_tickets: Number(r.n_tickets) };
      }
    }
    return Object.values(best).sort((a, b) => b.lift - a.lift).slice(0, 5).map((x, i) => ({ puesto: i + 1, ...x, franja_pico: pico[x.combo] ? pico[x.combo].franja : x.franja_txt }));
  },
});

dash.calc('revpash', {
  title: 'RevPASH by time slot',
  description: 'Revenue per available seat-hour for each slot in the latest year: revenue divided by (open days × slot hours × seats), and its distance to the €2.50 threshold.',
  inputs: ['operacion'],
  fn: (operacion) => {
    const yr = Math.max(...operacion.map((r) => Number(r.anio)));
    const by = {};
    for (const r of operacion) {
      if (Number(r.anio) !== yr) continue;
      for (const local of ['Both', r.local]) {
        const g = by[local + '|' + r.franja] ??= { local, franja: r.franja, franja_orden: Number(r.franja_orden), revenue: 0, horas_asiento: 0, tickets: 0 };
        g.revenue += Number(r.revenue); g.horas_asiento += Number(r.horas_asiento); g.tickets += Number(r.tickets);
      }
    }
    return Object.values(by)
      .map((g) => ({ ...g, anio: yr, revpash: g.revenue / g.horas_asiento, vs_umbral: g.revenue / g.horas_asiento - 2.5, ticket_medio: g.revenue / g.tickets }))
      .sort((a, b) => a.local.localeCompare(b.local) || a.franja_orden - b.franja_orden);
  },
});

dash.calc('revpash_dia', {
  title: 'RevPASH by day and slot',
  description: 'Latest-year RevPASH for each weekday and time slot.',
  inputs: ['operacion'],
  fn: (operacion) => {
    const yr = Math.max(...operacion.map((r) => Number(r.anio)));
    const by = {};
    for (const r of operacion) {
      if (Number(r.anio) !== yr) continue;
      for (const local of ['Both', r.local]) {
        const g = by[local + '|' + r.dia_semana + '|' + r.franja] ??= { local, dia_semana: Number(r.dia_semana), nombre_dia: r.nombre_dia,
          franja: r.franja, franja_orden: Number(r.franja_orden), revenue: 0, horas_asiento: 0, tickets: 0 };
        g.revenue += Number(r.revenue); g.horas_asiento += Number(r.horas_asiento); g.tickets += Number(r.tickets);
      }
    }
    return Object.values(by).map((g) => ({ ...g, revpash: g.revenue / g.horas_asiento, ticket_medio: g.revenue / g.tickets }));
  },
});

dash.calc('ticket_dia', {
  title: 'Average ticket by day',
  description: 'Latest-year average ticket and RevPASH for each weekday.',
  inputs: ['operacion'],
  fn: (operacion) => {
    const yr = Math.max(...operacion.map((r) => Number(r.anio)));
    const by = {};
    for (const r of operacion) {
      if (Number(r.anio) !== yr) continue;
      for (const local of ['Both', r.local]) {
        const g = by[local + '|' + r.dia_semana] ??= { local, dia_semana: Number(r.dia_semana), nombre_dia: r.nombre_dia, revenue: 0, horas_asiento: 0, tickets: 0 };
        g.revenue += Number(r.revenue); g.horas_asiento += Number(r.horas_asiento); g.tickets += Number(r.tickets);
      }
    }
    return Object.values(by)
      .map((g) => ({ ...g, ticket_medio: g.revenue / g.tickets, revpash: g.revenue / g.horas_asiento }))
      .sort((a, b) => a.local.localeCompare(b.local) || a.dia_semana - b.dia_semana);
  },
});

dash.calc('ops_resumen', {
  title: 'Operations summary',
  description: 'Overall RevPASH, best and worst slot against the €2.50 threshold, extreme cells and spread of the ticket by slot and by day.',
  inputs: ['revpash', 'revpash_dia', 'ticket_dia'],
  fn: (revpash, revpash_dia, ticket_dia) => ['Both', 'Lavapiés', 'Malasaña'].map((local) => {
    const umbral = 2.5;
    const cuando = { Opening: 'first thing', Morning: 'morning', Midday: 'lunchtime', Afternoon: 'afternoon' };
    const fr = revpash.filter((r) => r.local === local).sort((a, b) => a.revpash - b.revpash);
    const cel = revpash_dia.filter((r) => r.local === local).sort((a, b) => a.revpash - b.revpash);
    const dias = ticket_dia.filter((r) => r.local === local);
    const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
    const finde = dias.filter((r) => r.dia_semana >= 6), lv = dias.filter((r) => r.dia_semana <= 5);
    const tf = fr.map((r) => r.ticket_medio), td = dias.map((r) => r.ticket_medio);
    const peor = fr[0], mejor = fr[fr.length - 1];
    return {
      local, revpash_global: sum(fr, 'revenue') / sum(fr, 'horas_asiento'),
      franja_peor: peor.franja, revpash_peor: peor.revpash, franja_mejor: mejor.franja, revpash_mejor: mejor.revpash,
      franjas_bajo_umbral: fr.filter((r) => r.revpash < umbral).length,
      brecha_peor: Math.max(0, (umbral - peor.revpash) * peor.horas_asiento),
      celda_max: cel[cel.length - 1].nombre_dia + ' ' + cuando[cel[cel.length - 1].franja], revpash_celda_max: cel[cel.length - 1].revpash,
      celda_min: cel[0].nombre_dia + ' ' + cuando[cel[0].franja], revpash_celda_min: cel[0].revpash,
      revpash_finde: sum(finde, 'revenue') / sum(finde, 'horas_asiento'), revpash_lv: sum(lv, 'revenue') / sum(lv, 'horas_asiento'),
      ratio_finde: (sum(finde, 'revenue') / sum(finde, 'horas_asiento')) / (sum(lv, 'revenue') / sum(lv, 'horas_asiento')),
      rango_ticket_franja: Math.max(...tf) - Math.min(...tf), rango_ticket_dia: Math.max(...td) - Math.min(...td),
    };
  }),
});

dash.calc('segmentos', {
  title: 'Summary by RFM segment',
  description: 'Customers, revenue, RFM averages and proposed action for each K-Means segment.',
  inputs: ['rfm_clientes'],
  fn: (rfm_clientes) => {
    const accion = { Champions: 'VIP treatment: a coffee on the house and first taste of new items', Loyal: 'Stamp card: the 5th drink is free',
      'At Risk': 'A personal message with a reason to come back, now', Potential: 'Welcome pack and a reward for coming back', Lost: 'Stop messaging them after 180 days' };
    const apodo = { Champions: 'the regulars', Loyal: 'the usuals', 'At Risk': 'slipping away', Potential: 'still to win over', Lost: 'gone quiet' };
    const total = rfm_clientes.length;
    const revTotal = rfm_clientes.reduce((s, r) => s + Number(r.monetary), 0);
    const by = {};
    for (const r of rfm_clientes) {
      const g = by[r.segmento_rfm] ??= { segmento_rfm: r.segmento_rfm, orden: Number(r.orden_segmento_rfm), clientes: 0, revenue: 0, rec: 0, visitas: 0 };
      g.clientes += 1; g.revenue += Number(r.monetary); g.rec += Number(r.recency); g.visitas += Number(r.frequency);
    }
    return Object.values(by).sort((a, b) => a.orden - b.orden).map((g) => ({
      segmento_rfm: g.segmento_rfm, orden: g.orden, clientes: g.clientes, pct_clientes: g.clientes / total,
      revenue: g.revenue, pct_revenue: g.revenue / revTotal, recencia_media: g.rec / g.clientes,
      frecuencia_media: g.visitas / g.clientes, ticket_medio: g.revenue / g.visitas, accion: accion[g.segmento_rfm] ?? '', apodo: apodo[g.segmento_rfm] ?? '',
    }));
  },
});

dash.calc('rfm_resumen', {
  title: 'Value concentration',
  description: 'Share of Champions + Loyal in customers and revenue, and historic value of the At Risk segment.',
  inputs: ['segmentos'],
  fn: (segmentos) => {
    const s = (n) => segmentos.find((r) => r.segmento_rfm === n) ?? { clientes: 0, revenue: 0, pct_clientes: 0, pct_revenue: 0 };
    const ch = s('Champions'), lo = s('Loyal'), ar = s('At Risk');
    return [{
      clientes: segmentos.reduce((t, r) => t + r.clientes, 0), clientes_top: ch.clientes + lo.clientes,
      pct_clientes_top: ch.pct_clientes + lo.pct_clientes, pct_revenue_top: ch.pct_revenue + lo.pct_revenue,
      revenue_top: ch.revenue + lo.revenue, at_risk_clientes: ar.clientes, at_risk_revenue: ar.revenue,
      champions_pct_clientes: ch.pct_clientes, champions_pct_revenue: ch.pct_revenue,
    }];
  },
});

dash.calc('canal', {
  title: 'Margin by channel',
  description: 'From revenue to net margin after platform commission, by channel type, in the latest year; with net margin per order.',
  inputs: ['ventas_mes'],
  fn: (ventas_mes) => {
    const yr = ventas_mes.reduce((m, r) => (r.mes > m ? r.mes : m), '').slice(0, 4);
    const by = {}, tot = {};
    for (const r of ventas_mes) {
      if (r.mes.slice(0, 4) !== yr) continue;
      for (const local of ['Both', r.local]) {
        const g = by[local + '|' + r.tipo_canal] ??= { local, tipo_canal: r.tipo_canal, revenue: 0, margen_bruto: 0, comision: 0, tickets: 0 };
        g.revenue += Number(r.revenue); g.margen_bruto += Number(r.margen_bruto); g.comision += Number(r.comision); g.tickets += Number(r.tickets);
        tot[local] = (tot[local] ?? 0) + Number(r.revenue);
      }
    }
    return Object.values(by).map((g) => ({
      ...g, anio: Number(yr), coste_producto: g.revenue - g.margen_bruto, margen_neto: g.margen_bruto - g.comision,
      coste_pct: (g.revenue - g.margen_bruto) / g.revenue, comision_pct: g.comision / g.revenue,
      margen_neto_pct: (g.margen_bruto - g.comision) / g.revenue, pct_revenue: g.revenue / tot[g.local],
      ticket_medio: g.revenue / g.tickets, margen_neto_pedido: (g.margen_bruto - g.comision) / g.tickets,
    }));
  },
});

dash.calc('canal_resumen', {
  title: 'Margin gap by channel',
  description: 'Net margin gap between in-store and delivery, and whether commission exceeds product cost.',
  inputs: ['canal'],
  fn: (canal) => ['Both', 'Lavapiés', 'Malasaña'].map((local) => {
    const p = canal.find((r) => r.local === local && r.tipo_canal === 'In-store');
    const d = canal.find((r) => r.local === local && r.tipo_canal === 'Delivery');
    return { local, brecha_pp: (p.margen_neto_pct - d.margen_neto_pct) * 100, centimos_local: p.margen_neto_pct * 100, centimos_delivery: d.margen_neto_pct * 100,
      centimos_comision: d.comision_pct * 100, comision_vs_coste: d.comision / d.coste_producto };
  }),
});

dash.calc('plan', {
  title: 'Estimated impact of the plan',
  description: 'Yearly impact of each decision and café with fixed assumptions: win back 1 in 5 At Risk customers (their yearly margin at that café), +8% midday ticket (on its real gross margin), 5 points less delivery commission, and covering the €2.50 threshold in the worst slot.',
  inputs: ['riesgo_local', 'operacion', 'canal', 'ops_resumen', 'abc_resumen'],
  fn: (riesgo_local, operacion, canal, ops_resumen, abc_resumen) => {
    const yr = Math.max(...operacion.map((r) => Number(r.anio)));
    return ['Both', 'Lavapiés', 'Malasaña'].flatMap((local) => {
      const inL = (r) => local === 'Both' || r.local === local;
      const mid = operacion.filter((r) => inL(r) && Number(r.anio) === yr && r.franja === 'Midday');
      const midRev = mid.reduce((s, r) => s + Number(r.revenue), 0), midMar = mid.reduce((s, r) => s + Number(r.margen_bruto), 0);
      const rk = riesgo_local.filter(inL);
      const gasto = rk.reduce((s, r) => s + Number(r.gasto_anual), 0), margen = rk.reduce((s, r) => s + Number(r.margen_anual), 0);
      const delivery = canal.find((r) => r.local === local && r.tipo_canal === 'Delivery');
      const ops = ops_resumen.find((r) => r.local === local);
      const abc = abc_resumen.find((r) => r.local === local);
      return [
        { local, id: 'reactivar', orden: 1, base: gasto, supuesto: 0.2, impacto: margen * 0.2 },
        { local, id: 'franja', orden: 2, base: ops.revpash_peor, supuesto: 2.5, impacto: ops.brecha_peor },
        { local, id: 'combos', orden: 3, base: midRev, supuesto: 0.08, impacto: midMar * 0.08 },
        { local, id: 'delivery', orden: 4, base: delivery.revenue, supuesto: 0.05, impacto: delivery.revenue * 0.05 },
        { local, id: 'poda', orden: 5, base: abc.revenue_pct_c, supuesto: abc.n_c, impacto: 0 },
      ];
    });
  },
});

dash.calc('prevision', {
  title: '2026 forecast',
  description: 'Monthly 2026 estimate if nothing changes: each 2025 month times the year-on-year growth of H2 2025 (with both cafés open), with an 80% band based on how much those months varied.',
  inputs: ['ventas_mes'],
  fn: (ventas_mes) => {
    const yr = Number(ventas_mes.reduce((m, r) => (r.mes > m ? r.mes : m), '').slice(0, 4));
    const rev = {};
    for (const r of ventas_mes) { const k = r.local + '|' + r.mes; rev[k] = (rev[k] ?? 0) + Number(r.revenue); }
    const out = [];
    const porLocal = {};
    for (const local of ['Lavapiés', 'Malasaña']) {
      const ratios = [];
      for (let m = 7; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        const a = rev[local + '|' + yr + '-' + mm], b = rev[local + '|' + (yr - 1) + '-' + mm];
        if (a && b) ratios.push(a / b);
      }
      const g = ratios.reduce((s, x) => s + x, 0) / ratios.length;
      const sd = Math.sqrt(ratios.reduce((s, x) => s + (x - g) ** 2, 0) / Math.max(1, ratios.length - 1));
      porLocal[local] = { g, sd };
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        const base = rev[local + '|' + yr + '-' + mm] ?? 0;
        out.push({ local, mes: (yr + 1) + '-' + mm, centro: base * g, bajo: base * Math.max(0, g - 1.28 * sd), alto: base * (g + 1.28 * sd) });
      }
    }
    const amb = {};
    for (const r of out) {
      const a = amb[r.mes] ??= { local: 'Both', mes: r.mes, centro: 0, bajo: 0, alto: 0 };
      a.centro += r.centro; a.bajo += r.bajo; a.alto += r.alto;
    }
    return [...Object.values(amb), ...out];
  },
});

dash.calc('prevision_resumen', {
  title: '2026 forecast · total',
  description: 'Sum of the 2026 monthly forecast, with its low and high range, against 2025 sales.',
  inputs: ['prevision', 'kpis'],
  fn: (prevision, kpis) => ['Both', 'Lavapiés', 'Malasaña'].map((local) => {
    const rows = prevision.filter((r) => r.local === local);
    const k = kpis.find((r) => r.local === local);
    const s = (f) => rows.reduce((t, r) => t + r[f], 0);
    return { local, anio: k.anio + 1, centro: s('centro'), bajo: s('bajo'), alto: s('alto'), var_centro: s('centro') / k.revenue - 1 };
  }),
});

dash.calc('horas_resumen', {
  title: 'Weekday afternoon, hour by hour',
  description: 'What closing earlier Monday to Friday would have saved in the latest year, using the project break-even rule: €2.50 per seat-hour no longer open, minus what used to sell in those hours (2, 3 and 4 pm).',
  inputs: ['horas'],
  fn: (horas) => ['Both', 'Lavapiés', 'Malasaña'].map((local) => {
    const rows = horas.filter((r) => r.tipo_dia === 'Mon-Fri' && Number(r.hora) >= 14 && (local === 'Both' || r.local === local));
    const at = (h, f) => rows.filter((r) => Number(r.hora) === h).reduce((s, r) => s + Number(r[f]), 0);
    const neto = (h) => 2.5 * at(h, 'horas_asiento') - at(h, 'revenue');
    return { local, ahorro_16: neto(16), ahorro_15: neto(16) + neto(15), ahorro_14: neto(16) + neto(15) + neto(14),
      ventas_perdidas_16: at(16, 'revenue'), ventas_perdidas_15: at(16, 'revenue') + at(15, 'revenue'), ventas_perdidas_14: at(16, 'revenue') + at(15, 'revenue') + at(14, 'revenue'),
      coste_ahorrado_16: 2.5 * at(16, 'horas_asiento'), coste_ahorrado_15: 2.5 * (at(16, 'horas_asiento') + at(15, 'horas_asiento')), coste_ahorrado_14: 2.5 * (at(16, 'horas_asiento') + at(15, 'horas_asiento') + at(14, 'horas_asiento')) };
  }),
});

dash.calc('sim_base', {
  title: 'Simulator baseline',
  description: 'Latest-year margin after commissions and the exact base for each lever by café: the yearly margin At Risk customers left at that café while they came, real midday gross margin, delivery sales and net saving from closing the afternoon earlier.',
  inputs: ['canal', 'operacion', 'riesgo_local', 'horas_resumen'],
  fn: (canal, operacion, riesgo_local, horas_resumen) => {
    const yr = Math.max(...operacion.map((r) => Number(r.anio)));
    return ['Both', 'Lavapiés', 'Malasaña'].map((local) => {
      const inL = (r) => local === 'Both' || r.local === local;
      const p = canal.find((r) => r.local === local && r.tipo_canal === 'In-store');
      const d = canal.find((r) => r.local === local && r.tipo_canal === 'Delivery');
      const mid = operacion.filter((r) => inL(r) && Number(r.anio) === yr && r.franja === 'Midday');
      const rk = riesgo_local.filter(inL);
      const h = horas_resumen.find((r) => r.local === local);
      const ventas = p.revenue + d.revenue, margen = p.margen_bruto + d.margen_bruto;
      return { local, anio: yr, margen_actual: margen - d.comision, ventas,
        at_risk_gasto_anual: rk.reduce((s, r) => s + Number(r.gasto_anual), 0), at_risk_margen_anual: rk.reduce((s, r) => s + Number(r.margen_anual), 0),
        mediodia_revenue: mid.reduce((s, r) => s + Number(r.revenue), 0), mediodia_margen: mid.reduce((s, r) => s + Number(r.margen_bruto), 0),
        delivery_revenue: d.revenue, ahorro_16: h.ahorro_16, ahorro_15: h.ahorro_15, ahorro_14: h.ahorro_14 };
    });
  },
});

dash.calc('senales', {
  title: 'What changed',
  description: 'Automatic signals for the latest year versus the previous one: delivery share, best month, products gaining and losing share, slots improving or worsening and delivery margin.',
  inputs: ['ventas_mes', 'producto_mes', 'operacion'],
  fn: (ventas_mes, producto_mes, operacion) => {
    const yr = ventas_mes.reduce((m, r) => (r.mes > m ? r.mes : m), '').slice(0, 4), py = String(Number(yr) - 1);
    const pct = (v) => (v * 100).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + '%';
    const pts = (v) => Math.abs(v * 100).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + ' points';
    const eur = (v) => v.toLocaleString('en-GB', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
    const meses = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const out = [];
    for (const local of ['Both', 'Lavapiés', 'Malasaña']) {
      const inL = (r) => local === 'Both' || r.local === local;
      const vm = ventas_mes.filter(inL);
      const sum = (rows, f) => rows.reduce((s, r) => s + Number(r[f]), 0);
      const y = (rows, a) => rows.filter((r) => r.mes.startsWith(a));
      const del = (a) => sum(y(vm, a).filter((r) => r.tipo_canal === 'Delivery'), 'revenue') / sum(y(vm, a), 'revenue');
      const dd = del(yr) - del(py);
      const h2 = (a) => sum(vm.filter((r) => r.mes >= a + '-07' && r.mes <= a + '-12'), 'revenue');
      const comp = local === 'Lavapiés' ? sum(y(vm, yr), 'revenue') / sum(y(vm, py), 'revenue') - 1 : h2(yr) / h2(py) - 1;
      out.push({ local, tab: 'resumen', orden: 1, tono: comp < 0 ? 'neg' : 'pos', texto: (local === 'Lavapiés' ? 'Lavapiés sells ' : local === 'Malasaña' ? 'From July to December, Malasaña sold ' : 'With both cafés open, July to December sold ') + pct(Math.abs(comp)) + (comp < 0 ? ' less' : ' more') + ' than the year before' });
      const mesAll = {};
      vm.forEach((r) => { mesAll[r.mes] = (mesAll[r.mes] ?? 0) + Number(r.revenue); });
      const best = Object.entries(mesAll).sort((a, b) => b[1] - a[1])[0];
      out.push({ local, tab: 'resumen', orden: 2, tono: 'pos', texto: meses[Number(best[0].slice(5)) - 1] + ' ' + best[0].slice(0, 4) + ' was the best month ever: ' + eur(best[1]) });
      const tk = (a) => sum(y(vm, a), 'revenue') / sum(y(vm, a), 'tickets');
      const dt = tk(yr) / tk(py) - 1;
      out.push({ local, tab: 'resumen', orden: 3, tono: Math.abs(dt) < 0.01 ? 'flat' : dt > 0 ? 'pos' : 'neg', texto: 'Spend per visit ' + (Math.abs(dt) < 0.01 ? 'barely moves' : dt > 0 ? 'is up ' + pct(dt) : 'is down ' + pct(-dt)) });
      const pm = producto_mes.filter(inL);
      const share = (a) => { const t = {}; let tot = 0; pm.filter((r) => r.mes.startsWith(a)).forEach((r) => { t[r.producto] = (t[r.producto] ?? 0) + Number(r.revenue); tot += Number(r.revenue); }); Object.keys(t).forEach((k) => { t[k] /= tot; }); return t; };
      const s1 = share(yr), s0 = share(py);
      const ch = Object.keys(s1).map((k) => [k, s1[k] - (s0[k] ?? 0)]).sort((a, b) => b[1] - a[1]);
      out.push({ local, tab: 'carta', orden: 1, tono: 'pos', texto: ch[0][0] + ' gains ' + pts(ch[0][1]) + ' of the till' });
      out.push({ local, tab: 'carta', orden: 2, tono: 'neg', texto: ch[ch.length - 1][0] + ' loses ' + pts(ch[ch.length - 1][1]) });
      const op = operacion.filter(inL);
      const rp = (a, f) => { const rows = op.filter((r) => String(r.anio) === a && r.franja === f); return sum(rows, 'revenue') / sum(rows, 'horas_asiento'); };
      const fr = ['Opening', 'Morning', 'Midday', 'Afternoon'].map((f) => [f, rp(yr, f) / rp(py, f) - 1]).filter((x) => isFinite(x[1])).sort((a, b) => a[1] - b[1]);
      if (fr.length) {
        const w = fr[0], b = fr[fr.length - 1];
        out.push({ local, tab: 'operacion', orden: 1, tono: w[1] < 0 ? 'neg' : 'pos', texto: 'The ' + w[0].toLowerCase() + ' slot ' + (w[1] < 0 ? 'drops ' + pct(-w[1]) : 'improves ' + pct(w[1])) + ' per seat per hour' });
        out.push({ local, tab: 'operacion', orden: 2, tono: b[1] < 0 ? 'neg' : 'pos', texto: b[1] < 0 ? 'No slot improves: even the most resilient, ' + b[0].toLowerCase() + ', falls ' + pct(-b[1]) : 'The biggest improver is ' + b[0].toLowerCase() + ': +' + pct(b[1]) });
      }
      const mn = (a) => { const r = y(vm, a).filter((x) => x.tipo_canal === 'Delivery'); return (sum(r, 'margen_bruto') - sum(r, 'comision')) / sum(r, 'revenue'); };
      const dm = mn(yr) - mn(py);
      out.push({ local, tab: 'clientes', orden: 1, tono: Math.abs(dd) < 0.005 ? 'flat' : dd > 0 ? 'neg' : 'pos', texto: Math.abs(dd) < 0.005 ? 'Delivery holds at ' + pct(del(yr)) + ' of sales' : 'Delivery ' + (dd > 0 ? 'gains ' : 'loses ') + pts(dd) + ' of share in a year' });
      out.push({ local, tab: 'clientes', orden: 2, tono: Math.abs(dm) < 0.005 ? 'flat' : dm > 0 ? 'pos' : 'neg', texto: 'Its margin after commission ' + (Math.abs(dm) < 0.005 ? "doesn't move: still " + pct(mn(yr)) : (dm > 0 ? 'rises ' : 'falls ') + pts(dm)) });
    }
    return out;
  },
});

dash.calc('comparable', {
  title: 'Like-for-like growth',
  description: 'Sales change comparing periods with the same cafés open: July to December of the latest year versus the previous one (Lavapiés: full year).',
  inputs: ['ventas_mes'],
  fn: (ventas_mes) => {
    const yr = ventas_mes.reduce((m, r) => (r.mes > m ? r.mes : m), '').slice(0, 4), py = String(Number(yr) - 1);
    return ['Both', 'Lavapiés', 'Malasaña'].map((local) => {
      const vm = ventas_mes.filter((r) => local === 'Both' || r.local === local);
      const s = (a, b) => vm.filter((r) => r.mes >= a && r.mes <= b).reduce((t, r) => t + Number(r.revenue), 0);
      const full = local === 'Lavapiés';
      return { local, periodo: full ? 'the full year' : 'July to December', var_comparable: full ? s(yr + '-01', yr + '-12') / s(py + '-01', py + '-12') - 1 : s(yr + '-07', yr + '-12') / s(py + '-07', py + '-12') - 1 };
    });
  },
});
