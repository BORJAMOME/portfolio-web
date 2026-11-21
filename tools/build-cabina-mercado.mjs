#!/usr/bin/env node
/* Cabina del visor ferroviario · ola 2: demanda (INE), mercancías (CNMC) y comparación con la UE (Eurostat).
   Descarga las series públicas y escribe visor-ferroviario/capas/mercado.json, que build-cabina.mjs incorpora a
   capas/cabina.json (sin red: así `build-cabina --check` sigue funcionando sin conexión).
   La parte de viajeros de alta velocidad de la CNMC (cuota, ocupación, precio) está en capas/cnmc.json
   (tools/build-cnmc.mjs); aquí solo va mercancías (ds_24402), que ese archivo no incluye.

   Fuentes (todas abiertas, sin registro):
   - INE · Estadística de Transporte de Viajeros, tabla 20239, API wstempus (viajeros mensuales por tipo de servicio).
   - CNMC Data · ds_24402 (mercancías por operador; CC BY-SA 4.0).
   - Eurostat · tran_hv_psmod y tran_hv_frmod (reparto modal de viajeros y de mercancías por tierra).

     node tools/build-cabina-mercado.mjs     descarga y escribe capas/mercado.json
   Después: node tools/build-cabina.mjs y node tools/version-assets.mjs. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'visor-ferroviario', 'capas', 'mercado.json');
const UA = {'User-Agent': 'atlas-ferroviario/1.0'};
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
async function getJSON(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {headers: UA});
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return JSON.parse((await r.text()).replace(/^﻿/, ''));
    } catch (e) { if (i === 2) throw e; await new Promise(res => setTimeout(res, 1500)); }
  }
}

/* ── INE: viajeros mensuales (miles) ── */
const INE = {cercanias: ['TV1101', 'Cercanías'], media: ['TV1100', 'Media distancia'], av: ['TV1316', 'Alta velocidad'], resto_ld: ['TV1311', 'Resto de larga distancia']};
const series = {};
for (const [k, [cod, nombre]] of Object.entries(INE)) {
  const d = await getJSON(`https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/${cod}?nult=132`);
  const meses = d.Data.filter(x => x.Valor !== null).map(x => [`${x.Anyo}-${String(x.FK_Periodo).padStart(2, '0')}`, x.Valor]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  series[k] = {nombre, cod, meses};
}
// Comprobación: larga distancia = alta velocidad + resto (TV1099).
const ld = await getJSON('https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/TV1099?nult=132');
const ldMap = new Map(ld.Data.map(x => [`${x.Anyo}-${String(x.FK_Periodo).padStart(2, '0')}`, x.Valor]));
for (const [m, v] of series.av.meses) {
  const r = series.resto_ld.meses.find(x => x[0] === m)?.[1];
  if (ldMap.has(m) && r !== undefined && Math.abs(v + r - ldMap.get(m)) > 2) throw new Error(`INE: LD ≠ AV + resto en ${m}`);
}
const ultimo = series.av.meses.at(-1)[0];
const sumRange = (meses, from, to) => meses.filter(([m]) => m >= from && m <= to).reduce((a, [, v]) => a + v, 0);
const shift = (ym, n) => { const [y, m] = ym.split('-').map(Number), t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
const resumen = {};
for (const [k, s] of Object.entries(series)) {
  const u12 = sumRange(s.meses, shift(ultimo, -11), ultimo), p12 = sumRange(s.meses, shift(ultimo, -23), shift(ultimo, -12)), y19 = sumRange(s.meses, '2019-01', '2019-12');
  resumen[k] = {m12: Math.round(u12), var12: round(100 * (u12 / p12 - 1)), vs2019: round(100 * (u12 / y19 - 1))};
}
const avLd = (from, to) => round(100 * sumRange(series.av.meses, from, to) / (sumRange(series.av.meses, from, to) + sumRange(series.resto_ld.meses, from, to)));
const viajeros = {
  ultimo, series, resumen,
  av_peso_ld: {'2017': avLd('2017-01', '2017-12'), ultimos12: avLd(shift(ultimo, -11), ultimo)},
  // Choque de la alta velocidad a principios de 2026 (la causa no está en estos datos).
  choque_av: {
    ene_feb_2026: round(100 * (sumRange(series.av.meses, '2026-01', '2026-02') / sumRange(series.av.meses, '2025-01', '2025-02') - 1)),
    may_ult_2026: round(100 * (sumRange(series.av.meses, '2026-05', ultimo) / sumRange(series.av.meses, '2025-05', shift(ultimo, -12)) - 1)),
    hasta: ultimo
  }
};

/* ── CNMC: mercancías por operador (t-km netas). La fila TOTAL_EMPRESAS solo trae ingresos: se suma por empresa. ── */
const M = await getJSON('https://catalogodatos.cnmc.es/dataset/ce593a9b-86d7-4a50-a1d5-498d51d597ca/resource/df940a95-9830-4719-a763-e4dc169ba57d/download/ds_24402_1.json');
const key = o => Object.keys(o);
const f = (row, name) => row[key(row).find(k => k.toLowerCase().startsWith(name))];
const rows = M.filter(r => !String(f(r, 'empresa')).startsWith('TOTAL'));
const porAnio = new Map();
for (const r of rows) {
  const tri = f(r, 'trimestre'), y = +String(tri).slice(0, 4), des = f(r, 'desglose'), tkm = +(f(r, 't_km') ?? f(r, 't.km') ?? 0) || 0;
  if (!porAnio.has(y)) porAnio.set(y, {trims: new Set(), total: 0, renfe: 0, intermodal: 0});
  const a = porAnio.get(y); a.trims.add(tri);
  if (des === 'Total') { a.total += tkm; if (String(f(r, 'empresa')).startsWith('Renfe')) a.renfe += tkm; }
  else if (/intermodal/i.test(des)) a.intermodal += tkm;
}
const mercancias = {anual: [...porAnio].filter(([, a]) => a.trims.size === 4 && a.total > 0).sort((a, b) => a[0] - b[0])
  .map(([y, a]) => ({anio: y, tkm_mm: round(a.total / 1e9, 2), renfe_pct: round(100 * a.renfe / a.total), intermodal_pct: a.intermodal ? round(100 * a.intermodal / a.total) : null}))};
if (!mercancias.anual.length) throw new Error('CNMC ds_24402: sin años completos (¿han cambiado los nombres de los campos?)');

/* ── Eurostat: reparto modal (%) del tren, España frente a la UE y vecinos ── */
const GEO = ['ES', 'EU27_2020', 'FR', 'DE', 'IT', 'PT'];
async function modal(ds, filt) {
  const j = await getJSON(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${ds}?format=JSON&lang=EN&${filt}&${GEO.map(g => 'geo=' + g).join('&')}&sinceTimePeriod=2014`);
  const ids = j.id, size = j.size, D = j.dimension, years = Object.keys(D.time.category.index).sort();
  const at = (g, t) => { let idx = 0, mul = 1; for (let k = ids.length - 1; k >= 0; k--) { const pos = ids[k] === 'geo' ? D.geo.category.index[g] : ids[k] === 'time' ? D.time.category.index[t] : 0; idx += pos * mul; mul *= size[k]; } return j.value[idx] ?? null; };
  return {actualizado: j.updated.slice(0, 10), anios: years, pais: Object.fromEntries(GEO.map(g => [g, years.map(t => at(g, t))]))};
}
const ue = {viajeros: await modal('tran_hv_psmod', 'vehicle=TRN'), mercancias: await modal('tran_hv_frmod', 'tra_mode=RAIL')};

const out = {
  version: 1, generado_con: 'tools/build-cabina-mercado.mjs', descargado: new Date().toISOString().slice(0, 10),
  fuentes: {
    ine: {label: 'INE · Estadística de Transporte de Viajeros (tabla 20239)', url: 'https://www.ine.es/jaxiT3/Tabla.htm?t=20239', hasta: ultimo},
    cnmc_mercancias: {label: 'CNMC Data · mercancías por operador (ds_24402), CC BY-SA 4.0', url: 'https://catalogodatos.cnmc.es/dataset/ds_24402_1', hasta: mercancias.anual.at(-1).anio},
    eurostat: {label: 'Eurostat · reparto modal por tierra (tran_hv_psmod, tran_hv_frmod)', url: 'https://ec.europa.eu/eurostat/databrowser/view/tran_hv_psmod/default/table', actualizado: ue.viajeros.actualizado}
  },
  viajeros, mercancias, ue
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`capas/mercado.json · ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB · INE hasta ${ultimo} · mercancías hasta ${out.fuentes.cnmc_mercancias.hasta} · Eurostat ${ue.viajeros.anios.at(-1)}`);
console.log(JSON.stringify({resumen, av_peso_ld: viajeros.av_peso_ld, choque: viajeros.choque_av, merc: mercancias.anual.at(-1)}));
