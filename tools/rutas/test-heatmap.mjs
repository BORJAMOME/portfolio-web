import assert from 'node:assert/strict';
import fs from 'node:fs';
import {routeActivity} from './heatmap.mjs';

const week=['2026-11-23','2026-11-24','2026-11-25','2026-11-26','2026-11-27','2026-11-28','2026-11-29'];
const index=new Map([['A',0],['B',1],['C',2],['D',3]]);
const train=(stops,days)=>({stops,days:new Set(days.map(i=>week[i]))});
const result=routeActivity([train(['A','B','C'],[2]),train(['B','D'],[2,5]),train(['A','B','A'],[6])],index,week);
assert.deepEqual(result.calls.find(([i])=>i===1)[1],[0,0,2,0,0,1,1]);
assert.equal(result.calls.find(([i])=>i===2)[1][2],1,'El tren parcial no sirve C');
assert.equal(result.calls.find(([i])=>i===0)[1][6],1,'Una parada repetida cuenta una vez');
assert(!result.links.some(([a,b])=>a===0&&b===3),'A y D no comparten tren');
assert(!result.links.some(([a,b])=>a===2&&b===0),'No se inventa el sentido contrario');
assert(result.links.some(([a,b,mask])=>a===1&&b===3&&mask===(1<<2|1<<5)));
const read=name=>JSON.parse(fs.readFileSync(new URL('../../visor-ferroviario/capas/'+name,import.meta.url)));
const routes=read('rutas.json'),activity=read('rutas-actividad.json');
assert.equal(activity.referencia[0],routes.referencia.semana);
assert.equal(Object.keys(activity.rutas).length,routes.rutas.length);
for(const route of routes.rutas){
  const a=activity.rutas[route.id];
  for(const [i,counts] of a.calls){assert(routes.estaciones[i]);assert.equal(counts.length,7);counts.forEach((n,d)=>assert(n>=0&&n<=route.dias[d],route.id));}
  for(const [from,to,mask] of a.links){assert(routes.estaciones[from]&&routes.estaciones[to]);assert(from!==to&&mask>0&&mask<128);}
  for(const id of activity.traces.routes[route.id]||[])assert(activity.traces.geometries[id]?.length>=2);
}
console.log('OK: servicios parciales, ramales, sentidos, días y coherencia de las '+routes.rutas.length+' rutas.');
