dash.calc('mensual', {
  title: 'Revenue mensual por local',
  description: 'Revenue, tickets, margen y ticket medio de cada mes, por local y para ambos locales.',
  inputs: ['ventas_mes'],
  fn: (ventas_mes) => {
    const by = {};
    for (const r of ventas_mes) {
      for (const local of ['Ambos', r.local]) {
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
  title: 'KPIs del último año',
  description: 'Revenue, tickets, ticket medio y márgenes del último año completo frente al anterior, con su mes pico y valle.',
  inputs: ['ventas_mes'],
  fn: (ventas_mes) => {
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const yr = ventas_mes.reduce((m, r) => (r.mes > m ? r.mes : m), '').slice(0, 4);
    const py = String(Number(yr) - 1);
    const out = {};
    for (const r of ventas_mes) {
      const y = r.mes.slice(0, 4);
      if (y !== yr && y !== py) continue;
      for (const local of ['Ambos', r.local]) {
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
  title: 'Clasificación ABC de productos',
  description: 'Ranking de productos por revenue 2023–2025 con % acumulado: A hasta el 70 %, B hasta el 90 %, C la cola.',
  inputs: ['productos'],
  fn: (productos) => {
    const by = {};
    for (const r of productos) {
      for (const local of ['Ambos', r.local]) {
        const g = by[local + '|' + r.producto] ??= { local, producto: r.producto, categoria: r.categoria, revenue: 0, margen_bruto: 0, unidades: 0 };
        g.revenue += Number(r.revenue); g.margen_bruto += Number(r.margen_bruto); g.unidades += Number(r.unidades);
      }
    }
    const out = [];
    for (const local of ['Ambos', 'Lavapiés', 'Malasaña']) {
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
  title: 'Resumen ABC',
  description: 'Cuántos productos hay en cada clase ABC y qué parte del revenue suman.',
  inputs: ['abc'],
  fn: (abc) => ['Ambos', 'Lavapiés', 'Malasaña'].map((local) => {
    const rows = abc.filter((r) => r.local === local);
    const n = (c) => rows.filter((r) => r.clase === c).length;
    const rev = (c) => rows.filter((r) => r.clase === c).reduce((s, r) => s + r.pct_revenue, 0);
    return { local, productos: rows.length, n_a: n('A'), n_b: n('B'), n_c: n('C'),
      pct_productos_a: n('A') / rows.length, revenue_pct_a: rev('A'), revenue_pct_c: rev('C') };
  }),
});

dash.calc('combos_top', {
  title: 'Top 5 combos por lift',
  description: 'La regla con más lift de cada pareja de productos; las cinco parejas más fuertes, con la franja en la que más se piden juntas.',
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
        best[combo] = { combo, antecedente: r.antecedente, consecuente: r.consecuente, franja: r.franja, franja_txt: r.franja === 'Global' ? 'Todo el día' : r.franja,
          lift: Number(r.lift), confianza: Number(r.confianza), n_tickets: Number(r.n_tickets) };
      }
    }
    return Object.values(best).sort((a, b) => b.lift - a.lift).slice(0, 5).map((x, i) => ({ puesto: i + 1, ...x, franja_pico: pico[x.combo] ? pico[x.combo].franja : x.franja_txt }));
  },
});

dash.calc('revpash', {
  title: 'RevPASH por franja',
  description: 'Revenue por asiento y hora disponible de cada franja en el último año: revenue entre (días abiertos × horas de la franja × aforo), y su distancia al umbral de 2,50 €.',
  inputs: ['operacion'],
  fn: (operacion) => {
    const yr = Math.max(...operacion.map((r) => Number(r.anio)));
    const by = {};
    for (const r of operacion) {
      if (Number(r.anio) !== yr) continue;
      for (const local of ['Ambos', r.local]) {
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
  title: 'RevPASH por día y franja',
  description: 'RevPASH del último año para cada día de la semana y franja horaria.',
  inputs: ['operacion'],
  fn: (operacion) => {
    const yr = Math.max(...operacion.map((r) => Number(r.anio)));
    const by = {};
    for (const r of operacion) {
      if (Number(r.anio) !== yr) continue;
      for (const local of ['Ambos', r.local]) {
        const g = by[local + '|' + r.dia_semana + '|' + r.franja] ??= { local, dia_semana: Number(r.dia_semana), nombre_dia: r.nombre_dia,
          franja: r.franja, franja_orden: Number(r.franja_orden), revenue: 0, horas_asiento: 0, tickets: 0 };
        g.revenue += Number(r.revenue); g.horas_asiento += Number(r.horas_asiento); g.tickets += Number(r.tickets);
      }
    }
    return Object.values(by).map((g) => ({ ...g, revpash: g.revenue / g.horas_asiento, ticket_medio: g.revenue / g.tickets }));
  },
});

dash.calc('ticket_dia', {
  title: 'Ticket medio por día',
  description: 'Ticket medio y RevPASH del último año para cada día de la semana.',
  inputs: ['operacion'],
  fn: (operacion) => {
    const yr = Math.max(...operacion.map((r) => Number(r.anio)));
    const by = {};
    for (const r of operacion) {
      if (Number(r.anio) !== yr) continue;
      for (const local of ['Ambos', r.local]) {
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
  title: 'Resumen de operaciones',
  description: 'RevPASH global, mejor y peor franja frente al umbral de 2,50 €, celdas extremas y dispersión del ticket por franja y por día.',
  inputs: ['revpash', 'revpash_dia', 'ticket_dia'],
  fn: (revpash, revpash_dia, ticket_dia) => ['Ambos', 'Lavapiés', 'Malasaña'].map((local) => {
    const umbral = 2.5;
    const cuando = { Apertura: 'a primera hora', 'Mañana': 'por la mañana', 'Mediodía': 'a mediodía', Tarde: 'por la tarde' };
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
  title: 'Resumen por segmento RFM',
  description: 'Clientes, revenue, medias RFM y acción propuesta de cada segmento K-Means.',
  inputs: ['rfm_clientes'],
  fn: (rfm_clientes) => {
    const accion = { Champions: 'Trato VIP: café de cortesía y probar antes las novedades', Loyal: 'Tarjeta de sellos: la 5.ª bebida, gratis',
      'At Risk': 'Un mensaje personal con un motivo para volver, ya', Potential: 'Pack de bienvenida y premio por repetir', Lost: 'Dejar de escribirles a los 180 días' };
    const apodo = { Champions: 'los de casa', Loyal: 'los habituales', 'At Risk': 'se están yendo', Potential: 'por enganchar', Lost: 'ya no vienen' };
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
  title: 'Concentración de valor (H5)',
  description: 'Peso de Champions + Loyal en clientes y revenue, y valor histórico del segmento At Risk.',
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
  title: 'Margen por canal',
  description: 'Del revenue al margen neto tras la comisión de plataforma, por tipo de canal, en el último año; con margen neto por pedido.',
  inputs: ['ventas_mes'],
  fn: (ventas_mes) => {
    const yr = ventas_mes.reduce((m, r) => (r.mes > m ? r.mes : m), '').slice(0, 4);
    const by = {}, tot = {};
    for (const r of ventas_mes) {
      if (r.mes.slice(0, 4) !== yr) continue;
      for (const local of ['Ambos', r.local]) {
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
  title: 'Brecha de margen por canal',
  description: 'Diferencia de margen neto entre el local y el delivery, y si la comisión supera al coste de producto.',
  inputs: ['canal'],
  fn: (canal) => ['Ambos', 'Lavapiés', 'Malasaña'].map((local) => {
    const p = canal.find((r) => r.local === local && r.tipo_canal === 'Presencial');
    const d = canal.find((r) => r.local === local && r.tipo_canal === 'Delivery');
    return { local, brecha_pp: (p.margen_neto_pct - d.margen_neto_pct) * 100, centimos_local: p.margen_neto_pct * 100, centimos_delivery: d.margen_neto_pct * 100,
      centimos_comision: d.comision_pct * 100, comision_vs_coste: d.comision / d.coste_producto };
  }),
});

dash.calc('plan', {
  title: 'Impacto estimado del plan',
  description: 'Impacto anual de cada decisión y local con supuestos fijos: recuperar 1 de cada 5 clientes At Risk (su margen anual en ese local), +8 % de ticket al mediodía (sobre su margen bruto real), −5 puntos de comisión de delivery y cubrir el umbral de 2,50 € en la peor franja.',
  inputs: ['riesgo_local', 'operacion', 'canal', 'ops_resumen', 'abc_resumen'],
  fn: (riesgo_local, operacion, canal, ops_resumen, abc_resumen) => {
    const yr = Math.max(...operacion.map((r) => Number(r.anio)));
    return ['Ambos', 'Lavapiés', 'Malasaña'].flatMap((local) => {
      const inL = (r) => local === 'Ambos' || r.local === local;
      const mid = operacion.filter((r) => inL(r) && Number(r.anio) === yr && r.franja === 'Mediodía');
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
  title: 'Previsión 2026',
  description: 'Estimación mensual de 2026 si todo sigue igual: cada mes de 2025 por el crecimiento interanual del segundo semestre de 2025 (con los dos locales ya abiertos), con una banda del 80 % según lo que variaron esos meses.',
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
      const a = amb[r.mes] ??= { local: 'Ambos', mes: r.mes, centro: 0, bajo: 0, alto: 0 };
      a.centro += r.centro; a.bajo += r.bajo; a.alto += r.alto;
    }
    return [...Object.values(amb), ...out];
  },
});

dash.calc('prevision_resumen', {
  title: 'Previsión 2026 · total',
  description: 'Suma de la previsión mensual de 2026, con su rango bajo y alto, frente a las ventas de 2025.',
  inputs: ['prevision', 'kpis'],
  fn: (prevision, kpis) => ['Ambos', 'Lavapiés', 'Malasaña'].map((local) => {
    const rows = prevision.filter((r) => r.local === local);
    const k = kpis.find((r) => r.local === local);
    const s = (f) => rows.reduce((t, r) => t + r[f], 0);
    return { local, anio: k.anio + 1, centro: s('centro'), bajo: s('bajo'), alto: s('alto'), var_centro: s('centro') / k.revenue - 1 };
  }),
});

dash.calc('horas_resumen', {
  title: 'Tarde entre semana, hora a hora',
  description: 'Lo que se ahorraría cerrando antes de lunes a viernes en el último año, con el mismo criterio que el umbral de rentabilidad del proyecto: 2,50 € por silla y hora que deja de abrirse, menos lo que se vendía en esas horas (14, 15 y 16 h).',
  inputs: ['horas'],
  fn: (horas) => ['Ambos', 'Lavapiés', 'Malasaña'].map((local) => {
    const rows = horas.filter((r) => r.tipo_dia === 'L-V' && Number(r.hora) >= 14 && (local === 'Ambos' || r.local === local));
    const at = (h, f) => rows.filter((r) => Number(r.hora) === h).reduce((s, r) => s + Number(r[f]), 0);
    const neto = (h) => 2.5 * at(h, 'horas_asiento') - at(h, 'revenue');
    return { local, ahorro_16: neto(16), ahorro_15: neto(16) + neto(15), ahorro_14: neto(16) + neto(15) + neto(14),
      ventas_perdidas_16: at(16, 'revenue'), ventas_perdidas_15: at(16, 'revenue') + at(15, 'revenue'), ventas_perdidas_14: at(16, 'revenue') + at(15, 'revenue') + at(14, 'revenue'),
      coste_ahorrado_16: 2.5 * at(16, 'horas_asiento'), coste_ahorrado_15: 2.5 * (at(16, 'horas_asiento') + at(15, 'horas_asiento')), coste_ahorrado_14: 2.5 * (at(16, 'horas_asiento') + at(15, 'horas_asiento') + at(14, 'horas_asiento')) };
  }),
});

dash.calc('sim_base', {
  title: 'Punto de partida del simulador',
  description: 'Margen tras comisiones del último año y la base exacta de cada palanca por local: margen anual que dejaban los clientes At Risk en ese local mientras venían, margen bruto real de mediodía, ventas de delivery y ahorro neto por cerrar antes la tarde.',
  inputs: ['canal', 'operacion', 'riesgo_local', 'horas_resumen'],
  fn: (canal, operacion, riesgo_local, horas_resumen) => {
    const yr = Math.max(...operacion.map((r) => Number(r.anio)));
    return ['Ambos', 'Lavapiés', 'Malasaña'].map((local) => {
      const inL = (r) => local === 'Ambos' || r.local === local;
      const p = canal.find((r) => r.local === local && r.tipo_canal === 'Presencial');
      const d = canal.find((r) => r.local === local && r.tipo_canal === 'Delivery');
      const mid = operacion.filter((r) => inL(r) && Number(r.anio) === yr && r.franja === 'Mediodía');
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
  title: 'Lo que ha cambiado',
  description: 'Señales automáticas del último año frente al anterior: peso del delivery, mejor mes, productos que ganan y pierden peso, franjas que mejoran o empeoran y margen del delivery.',
  inputs: ['ventas_mes', 'producto_mes', 'operacion'],
  fn: (ventas_mes, producto_mes, operacion) => {
    const yr = ventas_mes.reduce((m, r) => (r.mes > m ? r.mes : m), '').slice(0, 4), py = String(Number(yr) - 1);
    const pct = (v) => (v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' %';
    const pts = (v) => Math.abs(v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' puntos';
    const eur = (v) => v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const out = [];
    for (const local of ['Ambos', 'Lavapiés', 'Malasaña']) {
      const inL = (r) => local === 'Ambos' || r.local === local;
      const vm = ventas_mes.filter(inL);
      const sum = (rows, f) => rows.reduce((s, r) => s + Number(r[f]), 0);
      const y = (rows, a) => rows.filter((r) => r.mes.startsWith(a));
      const del = (a) => sum(y(vm, a).filter((r) => r.tipo_canal === 'Delivery'), 'revenue') / sum(y(vm, a), 'revenue');
      const dd = del(yr) - del(py);
      const h2 = (a) => sum(vm.filter((r) => r.mes >= a + '-07' && r.mes <= a + '-12'), 'revenue');
      const comp = local === 'Lavapiés' ? sum(y(vm, yr), 'revenue') / sum(y(vm, py), 'revenue') - 1 : h2(yr) / h2(py) - 1;
      out.push({ local, tab: 'resumen', orden: 1, tono: comp < 0 ? 'neg' : 'pos', texto: (local === 'Lavapiés' ? 'Lavapiés vende un ' : local === 'Malasaña' ? 'De julio a diciembre, Malasaña vendió un ' : 'Con los dos locales ya abiertos, de julio a diciembre se vendió un ') + pct(Math.abs(comp)) + (comp < 0 ? ' menos' : ' más') + ' que el año anterior' });
      const mesAll = {};
      vm.forEach((r) => { mesAll[r.mes] = (mesAll[r.mes] ?? 0) + Number(r.revenue); });
      const best = Object.entries(mesAll).sort((a, b) => b[1] - a[1])[0];
      out.push({ local, tab: 'resumen', orden: 2, tono: 'pos', texto: meses[Number(best[0].slice(5)) - 1].replace(/^./, (c) => c.toUpperCase()) + ' de ' + best[0].slice(0, 4) + ' fue el mejor mes de la historia: ' + eur(best[1]) });
      const tk = (a) => sum(y(vm, a), 'revenue') / sum(y(vm, a), 'tickets');
      const dt = tk(yr) / tk(py) - 1;
      out.push({ local, tab: 'resumen', orden: 3, tono: Math.abs(dt) < 0.01 ? 'flat' : dt > 0 ? 'pos' : 'neg', texto: 'El gasto por visita ' + (Math.abs(dt) < 0.01 ? 'se queda casi igual' : dt > 0 ? 'sube un ' + pct(dt) : 'baja un ' + pct(-dt)) });
      const pm = producto_mes.filter(inL);
      const share = (a) => { const t = {}; let tot = 0; pm.filter((r) => r.mes.startsWith(a)).forEach((r) => { t[r.producto] = (t[r.producto] ?? 0) + Number(r.revenue); tot += Number(r.revenue); }); Object.keys(t).forEach((k) => { t[k] /= tot; }); return t; };
      const s1 = share(yr), s0 = share(py);
      const ch = Object.keys(s1).map((k) => [k, s1[k] - (s0[k] ?? 0)]).sort((a, b) => b[1] - a[1]);
      out.push({ local, tab: 'carta', orden: 1, tono: 'pos', texto: ch[0][0] + ' gana ' + pts(ch[0][1]) + ' de peso en la caja' });
      out.push({ local, tab: 'carta', orden: 2, tono: 'neg', texto: ch[ch.length - 1][0] + ' pierde ' + pts(ch[ch.length - 1][1]) });
      const op = operacion.filter(inL);
      const rp = (a, f) => { const rows = op.filter((r) => String(r.anio) === a && r.franja === f); return sum(rows, 'revenue') / sum(rows, 'horas_asiento'); };
      const fr = ['Apertura', 'Mañana', 'Mediodía', 'Tarde'].map((f) => [f, rp(yr, f) / rp(py, f) - 1]).filter((x) => isFinite(x[1])).sort((a, b) => a[1] - b[1]);
      if (fr.length) {
        const w = fr[0], b = fr[fr.length - 1];
        out.push({ local, tab: 'operacion', orden: 1, tono: w[1] < 0 ? 'neg' : 'pos', texto: 'La franja de ' + w[0].toLowerCase() + (w[1] < 0 ? ' empeora un ' + pct(-w[1]) : ' mejora un ' + pct(w[1])) + ' por silla y hora' });
        out.push({ local, tab: 'operacion', orden: 2, tono: b[1] < 0 ? 'neg' : 'pos', texto: b[1] < 0 ? 'Ninguna franja mejora: hasta la que mejor aguanta, ' + b[0].toLowerCase() + ', cae un ' + pct(-b[1]) : 'La que más mejora es ' + b[0].toLowerCase() + ': +' + pct(b[1]) });
      }
      const mn = (a) => { const r = y(vm, a).filter((x) => x.tipo_canal === 'Delivery'); return (sum(r, 'margen_bruto') - sum(r, 'comision')) / sum(r, 'revenue'); };
      const dm = mn(yr) - mn(py);
      out.push({ local, tab: 'clientes', orden: 1, tono: Math.abs(dd) < 0.005 ? 'flat' : dd > 0 ? 'neg' : 'pos', texto: Math.abs(dd) < 0.005 ? 'El delivery se mantiene en el ' + pct(del(yr)) + ' de las ventas' : 'El delivery ' + (dd > 0 ? 'gana ' : 'pierde ') + pts(dd) + ' de peso en un año' });
      out.push({ local, tab: 'clientes', orden: 2, tono: Math.abs(dm) < 0.005 ? 'flat' : dm > 0 ? 'pos' : 'neg', texto: 'Su margen tras comisión ' + (Math.abs(dm) < 0.005 ? 'no se mueve: sigue en ' + pct(mn(yr)) : (dm > 0 ? 'sube ' : 'baja ') + pts(dm)) });
    }
    return out;
  },
});

dash.calc('comparable', {
  title: 'Crecimiento comparable',
  description: 'Variación de ventas comparando periodos con los mismos locales abiertos: julio a diciembre del último año frente al anterior (Lavapiés, el año completo).',
  inputs: ['ventas_mes'],
  fn: (ventas_mes) => {
    const yr = ventas_mes.reduce((m, r) => (r.mes > m ? r.mes : m), '').slice(0, 4), py = String(Number(yr) - 1);
    return ['Ambos', 'Lavapiés', 'Malasaña'].map((local) => {
      const vm = ventas_mes.filter((r) => local === 'Ambos' || r.local === local);
      const s = (a, b) => vm.filter((r) => r.mes >= a && r.mes <= b).reduce((t, r) => t + Number(r.revenue), 0);
      const full = local === 'Lavapiés';
      return { local, periodo: full ? 'todo el año' : 'de julio a diciembre', var_comparable: full ? s(yr + '-01', yr + '-12') / s(py + '-01', py + '-12') - 1 : s(yr + '-07', yr + '-12') / s(py + '-07', py + '-12') - 1 };
    });
  },
});
