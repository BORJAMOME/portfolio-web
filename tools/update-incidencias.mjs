import { readFile, writeFile, rename } from 'node:fs/promises';
import { collect } from './incidencias-ledger.mjs';

const target = new URL('../visor-ferroviario/capas/incidencias.json', import.meta.url);
const previous = JSON.parse(await readFile(target, 'utf8'));
const response = await fetch(previous.source.url, { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json' } });
if (!response.ok) throw new Error(`Renfe: HTTP ${response.status}; se conserva el histórico anterior`);
const next = collect(previous, await response.json());
const temporary = new URL(target.href + '.tmp');
await writeFile(temporary, JSON.stringify(next, null, 2) + '\n');
await rename(temporary, target);
console.log(`Consulta guardada: ${next.snapshots.at(-1).ids.length} avisos; ${next.records.length} identificadores únicos en el histórico.`);
