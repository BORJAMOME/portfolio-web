#!/usr/bin/env node
/* Control antes de publicar los datos regenerados (lo usa .github/workflows/rutas-semanal.yml).
   Compara los JSON nuevos con los del último commit y falla si una fuente se hunde de golpe: un GTFS vacío o
   corrupto, o una descarga a medias, no debe dejar la tabla sin trenes.
   Reglas: por fuente, trenes del laborable ≥ 60 % de los anteriores y rutas ≥ 70 %; Cabina, trenes ≥ 60 %;
   CNMC, mismos 5 corredores y un último trimestre igual o posterior.
     node tools/rutas/sanity.mjs           compara con HEAD
   Escribe un resumen en $GITHUB_STEP_SUMMARY si existe. */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rel = f => 'visor-ferroviario/capas/' + f;
const now = f => JSON.parse(fs.readFileSync(path.join(ROOT, rel(f)), 'utf8'));
const before = f => { try { return JSON.parse(execFileSync('git', ['show', 'HEAD:' + rel(f)], {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20})); } catch { return null; } };
const problems = [], lines = [];

const R = now('rutas.json'), R0 = before('rutas.json');
lines.push(`Semana de referencia: ${R.referencia.semana} (laborable ${R.referencia.laborable}).`, '', '| Fuente | Trenes laborable | Antes | Rutas | Antes | Horarios hasta |', '|---|---|---|---|---|---|');
for (const [k, t] of Object.entries(R.totales)) {
  const o = R0?.totales?.[k];
  lines.push(`| ${k} | ${t.lab} | ${o?.lab ?? '—'} | ${t.filas} | ${o?.filas ?? '—'} | ${R.fuentes[k]?.to ?? '—'} |`);
  if (o && o.lab > 0 && t.lab < .6 * o.lab) problems.push(`${k}: ${t.lab} trenes frente a ${o.lab} (caída de más del 40 %)`);
  if (o && o.filas > 0 && t.filas < .7 * o.filas) problems.push(`${k}: ${t.filas} rutas frente a ${o.filas} (caída de más del 30 %)`);
}
const C = now('cabina.json'), C0 = before('cabina.json');
if (C0?.oferta && C.oferta.trenes.lab < .6 * C0.oferta.trenes.lab) problems.push(`Cabina: ${C.oferta.trenes.lab} trenes frente a ${C0.oferta.trenes.lab}`);
const N = now('cnmc.json'), N0 = before('cnmc.json');
if (N.corredores.length !== 5) problems.push(`CNMC: ${N.corredores.length} corredores en vez de 5`);
if (N0 && N.ultimo_trimestre < N0.ultimo_trimestre) problems.push(`CNMC: último trimestre ${N.ultimo_trimestre}, anterior ${N0.ultimo_trimestre}`);
lines.push('', `Cabina: ${C.oferta.trenes.lab} trenes un laborable (antes ${C0?.oferta?.trenes?.lab ?? '—'}). CNMC: último trimestre ${N.ultimo_trimestre}.`);
for (const n of R.notas || []) lines.push('', '> ' + n);

const summary = (problems.length ? '## ❌ Datos de rutas: no se publican\n\n' + problems.map(p => '- ' + p).join('\n') + '\n\n' : '## ✅ Datos de rutas regenerados\n\n') + lines.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
if (problems.length) process.exit(1);
