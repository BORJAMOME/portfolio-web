#!/usr/bin/env node
/* Demanda, ocupación, cuota y precio de la alta velocidad por corredor y operador, de CNMC Data (CC BY-SA 4.0).
   Salida: visor-ferroviario/capas/cnmc.json, que se publica con la MISMA licencia (CC BY-SA 4.0), como exige la CNMC.
   Lo usan la tabla de rutas (cada ruta de alta velocidad de Madrid, con su corredor) y Cabina (capítulo de competencia).

     node tools/build-cnmc.mjs --download   descarga los tres conjuntos a .cache/rutas/ y genera
     node tools/build-cnmc.mjs              genera con lo descargado

   Conjuntos (datastore de catalogodatos.cnmc.es, UTF-8, punto decimal):
   - ds_24408: viajeros y plazas de larga distancia AV por corredor y operador, trimestral (millones).
   - ds_24406: viajeros, viajeros-km, plazas-km, tren-km por producto, corredor y operador, trimestral.
   - ds_24410: precio medio mensual por trayecto Madrid–X y operador (LD AV comercial).
   Reglas (validadas contra la nota de prensa de la CNMC del 17-07-2026 y el análisis de manual-ferrocarriles):
   - Ocupación = viajeros-km ÷ plazas-km (no viajeros ÷ plazas: los viajeros del corredor incluyen trayectos intermedios).
   - Se excluyen las filas «Total» (si no, se cuenta dos veces).
   - Precio: año natural 2025. La CNMC cambió el método en el 1T 2026: no se mezcla con meses anteriores. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'rutas'), V = path.join(ROOT, 'visor-ferroviario'), OUT = path.join(V, 'capas', 'cnmc.json');
const SRC = {
  c24408: {id: 'ds_24408_1', url: 'https://catalogodatos.cnmc.es/datastore/dump/9eab841c-b915-4d53-907a-d09f600fafef', label: 'CNMC · Indicadores de larga distancia AV por corredor (ds_24408)'},
  c24406: {id: 'ds_24406_1', url: 'https://catalogodatos.cnmc.es/datastore/dump/9ff35ab8-e3b0-420d-a71b-606578dc5287', label: 'CNMC · Indicadores trimestrales de viajeros (ds_24406)'},
  c24410: {id: 'ds_24410_1', url: 'https://catalogodatos.cnmc.es/datastore/dump/69671e28-b299-4e45-8cf9-24d04f7e5117', label: 'CNMC · Precio medio mensual por trayecto (ds_24410)'}
};
const file = k => path.join(CACHE, 'cnmc-' + k + '.csv');

async function download() {
  fs.mkdirSync(CACHE, {recursive: true});
  for (const [k, s] of Object.entries(SRC)) {
    const r = await fetch(s.url, {headers: {'user-agent': 'borjamora.es visor ferroviario (portfolio)'}});
    if (!r.ok) throw new Error(k + ': HTTP ' + r.status);
    fs.writeFileSync(file(k), Buffer.from(await r.arrayBuffer()));
  }
}
// CSV con comillas (el datastore las usa cuando un valor lleva comas).
function csv(k) {
  const t = fs.readFileSync(file(k), 'utf8').replace(/^﻿/, ''), rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1) rows.push(row); row = []; } else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); }
  const h = rows.shift();
  return rows.map(r => Object.fromEntries(h.map((x, i) => [x, r[i] ?? ''])));
}
const num = s => s === '' || s === undefined ? null : Number(s);
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
const OP = {'Renfe Viajeros': 'Renfe', 'Iryo': 'iryo', 'OUIGO': 'OUIGO'};

function build() {
  const v = csv('c24408').filter(x => x.corredor !== 'Total' && x.empresa !== 'Total');
  const q = csv('c24406').filter(x => x.tipo_de_producto === 'LD AV' && x.corredor !== 'Total' && x.empresa !== 'Total' && x.corredor !== 'Resto');
  const p = csv('c24410');
  const quarters = [...new Set(v.map(x => x.trimestre))].sort(), last = quarters.at(-1), last4 = quarters.slice(-4);
  const corredores = [...new Set(v.map(x => x.corredor))].sort((a, b) => a.localeCompare(b, 'es'));
  const ops = ['Renfe Viajeros', 'Iryo', 'OUIGO'];
  const sum = (rows, k) => rows.reduce((a, x) => a + (num(x[k]) || 0), 0);

  // Viajeros y plazas (millones) y cuota: año 2025 y últimos 4 trimestres.
  const periodo = (rows, pred) => rows.filter(pred);
  const y2025 = x => x.trimestre.startsWith('2025'), l4 = x => last4.includes(x.trimestre);
  const porCorredor = corredores.map(c => {
    const out = {corredor: c};
    for (const [key, pred] of [['a2025', y2025], ['ult4', l4]]) {
      const rows = periodo(v, x => x.corredor === c && pred(x)), tot = sum(rows, 'viajeros');
      const qr = periodo(q, x => x.corredor === c && pred(x));
      out[key] = {viajeros: r2(tot), operadores: Object.fromEntries(ops.map(o => {
        const ro = rows.filter(x => x.empresa === o), vo = sum(ro, 'viajeros'), po = sum(ro, 'plazas_ofertadas');
        const qo = qr.filter(x => x.empresa === o), vkm = sum(qo, 'viajeros_km'), pkm = sum(qo, 'plazas_km_ofertadas');
        return [OP[o], {viajeros: r2(vo), plazas: r2(po), cuota: tot ? r1(100 * vo / tot) : null, ocupacion: pkm ? r1(100 * vkm / pkm) : null}];
      }))};
    }
    return out;
  });
  // Ocupación de los cinco corredores juntos por operador (2025).
  const ocup5 = Object.fromEntries(ops.map(o => { const r = q.filter(x => x.empresa === o && y2025(x)); return [OP[o], r1(100 * sum(r, 'viajeros_km') / sum(r, 'plazas_km_ofertadas'))]; }));
  // Cuota trimestral de Renfe (cinco corredores) y viajeros por año.
  const serie = quarters.map(t => { const r = v.filter(x => x.trimestre === t), tot = sum(r, 'viajeros'); return {t, viajeros: r2(tot), renfe: tot ? r1(100 * sum(r.filter(x => x.empresa === 'Renfe Viajeros'), 'viajeros') / tot) : null}; });
  const anual = {}; for (const x of v) { const a = x.trimestre.slice(0, 4); anual[a] = (anual[a] || 0) + (num(x.viajeros) || 0); }
  // Precio medio 2025 por trayecto y producto (media de los 12 meses).
  const meses = [...new Set(p.map(x => x.mes))].sort();
  const trayectos = [...new Set(p.map(x => x.trayecto))].sort((a, b) => a.localeCompare(b, 'es'));
  const productos = [...new Set(p.map(x => x.empresa))].filter(e => e !== 'Total').sort();
  const precio2025 = trayectos.map(tr => ({trayecto: tr, ...Object.fromEntries([...productos, 'Total'].map(e => {
    const r = p.filter(x => x.trayecto === tr && x.empresa === e && x.mes.startsWith('2025')).map(x => num(x.precio)).filter(x => x !== null);
    return [e, r.length === 12 ? r2(r.reduce((a, b) => a + b, 0) / r.length) : null];
  }))}));
  const precioUlt = trayectos.map(tr => ({trayecto: tr, ...Object.fromEntries([...productos, 'Total'].map(e => [e, num(p.find(x => x.trayecto === tr && x.empresa === e && x.mes === meses.at(-1))?.precio) ?? null]))}));

  // Estaciones de cada corredor para asignar rutas de la tabla (rutas con Madrid en un extremo y el otro aquí).
  // Por la ciudad del otro extremo; Madrid–Málaga/Granada y Madrid–Sevilla comparten Córdoba: va por el destino final.
  const corredorDe = {
    // Solo ciudades de la propia línea hasta la cabecera: lo que sigue más allá (Girona, Castellón, Murcia, Cádiz…) no
    // consta que la CNMC lo cuente en ese corredor, y las cifras que se muestran son las del corredor.
    'Madrid-Barcelona': /Barcelona|Zaragoza|Lleida|Tarragona|Guadalajara|Calatayud/i,
    'Madrid-Valencia': /Val[eè]ncia|Valencia|Cuenca|Requena/i,
    'Madrid-Alicante': /Alicante|Alacant|Albacete|Villena/i,
    'Madrid-Sevilla': /Sevilla|Ciudad Real|Puertollano|C[oó]rdoba/i,
    'Madrid-Málaga/Granada': /M[aá]laga|Granada|Antequera|Loja/i
  };
  return {
    version: 1, generado: new Date().toISOString().slice(0, 10), generado_con: 'tools/build-cnmc.mjs',
    licencia: 'Datos derivados de CNMC Data (catalogodatos.cnmc.es), CC BY-SA 4.0. Este fichero se publica con la misma licencia.',
    fuentes: Object.fromEntries(Object.entries(SRC).map(([k, s]) => [k, {id: s.id, label: s.label, url: s.url}])),
    ultimo_trimestre: last, ultimos_4: [last4[0], last], ultimo_mes_precio: meses.at(-1),
    notas: [
      'Ocupación = viajeros-km ÷ plazas-km del operador en el corredor.',
      'Viajeros del corredor: incluyen los trayectos intermedios (Madrid–Zaragoza cuenta en Madrid–Barcelona).',
      'Precio: media de 2025 (año completo). La CNMC cambió el método de cálculo en el 1T 2026; los meses de 2026 no son comparables con los anteriores.',
      'Solo los cinco corredores de alta velocidad que publica la CNMC; el resto de rutas no tiene estos datos.'
    ],
    corredores: porCorredor, ocupacion_5: ocup5, serie, anual: Object.fromEntries(Object.entries(anual).map(([a, x]) => [a, r2(x)])),
    precio_2025: precio2025, precio_ultimo: precioUlt, productos,
    corredor_regex: Object.fromEntries(Object.entries(corredorDe).map(([k, re]) => [k, re.source])),
    trayecto_de: {'Madrid-Barcelona': 'Madrid-Barcelona', 'Madrid-Valencia': 'Madrid-Valencia', 'Madrid-Alicante': 'Madrid-Alicante', 'Madrid-Sevilla': 'Madrid-Sevilla', 'Madrid-Málaga/Granada': 'Madrid-Málaga'}
  };
}

if (process.argv.includes('--download')) await download();
const data = build(), txt = JSON.stringify(data) + '\n';
fs.writeFileSync(OUT, txt);
console.log('Escrito', path.relative(ROOT, OUT), (txt.length / 1024).toFixed(1) + ' KB', '· último trimestre', data.ultimo_trimestre, '· último mes de precio', data.ultimo_mes_precio);
