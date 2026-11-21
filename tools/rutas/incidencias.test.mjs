// Pruebas de las reglas de tools/rutas/incidencias.mjs (sin red): node --test tools/rutas/incidencias.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {epochOf,localDay,localMin,anotar,cerrarDia,validez,agregar} from './incidencias.mjs';

const DIA='2026-11-25';
const prog={dia:DIA,trenes:{
  A:{f:'ld',r:'renfe|AVE|60000|71801',dep:600,arr:780},           // 10:00 → 13:00
  B:{f:'ld',r:'renfe|AVE|60000|71801',dep:720,arr:900},
  C:{f:'ld',r:'renfe|AVE|60000|71801',dep:840,arr:1020},
  D:{f:'ld',r:'renfe|AVE|60000|71801',dep:960,arr:1140},
  S:{f:'ld',r:'renfe|AVE|60000|51003',dep:600,arr:760,sup:1}}};
const ent=(id,rel,delay)=>({tripUpdate:{trip:{tripId:id,scheduleRelationship:rel},...(delay!==undefined?{delay}:{})}});
const at=m=>epochOf(DIA,m);

test('hora peninsular: invierno, verano y trenes que pasan de medianoche', ()=>{
  assert.equal(new Date(epochOf('2026-11-25',600)).toISOString(),'2026-11-25T09:00:00.000Z');
  assert.equal(new Date(epochOf('2026-07-01',600)).toISOString(),'2026-07-01T08:00:00.000Z');
  assert.equal(new Date(epochOf('2026-11-25',1500)).toISOString(),'2026-11-26T00:00:00.000Z');
  assert.equal(localDay(epochOf(DIA,1439)),DIA);assert.equal(localMin(epochOf(DIA,615)),615);
});

test('visto, cancelado, contradictorio, sin dato y suprimido por corte', ()=>{
  const obs={dia:DIA,capturas:{},t:{}};
  // A: circula con 20 min de retraso al final. B: solo cancelado. C: cancelado y a la vez circulando (Renfe lo hace a menudo).
  // D: nunca aparece. S: dentro de un corte.
  for(const m of [590,605,640,700,760]){
    anotar(obs,prog,'ld',{entity:[ent('A','SCHEDULED',m<700?120:1200),ent('B','CANCELED'),ent('C','CANCELED'),ent('C','SCHEDULED',60)]},at(m+250));
  }
  const D=cerrarDia(prog,obs);
  // [prog, vistos, canc, contra, ret5, ret15, sup]
  assert.deepEqual(D.rutas['renfe|AVE|60000|71801'],[4,2,1,1,1,1,0]);
  assert.deepEqual(D.rutas['renfe|AVE|60000|51003'],[0,0,0,0,0,0,1]);
});

test('una captura sin ningún tren en circulación no cuenta (feed degradado)', ()=>{
  const obs={dia:DIA,capturas:{},t:{}};
  assert.equal(anotar(obs,prog,'ld',{entity:[ent('B','CANCELED')]},at(700)),false);
  assert.equal(obs.capturas.ld,undefined);
});

test('retrasos imposibles del feed no se usan', ()=>{
  const obs={dia:DIA,capturas:{},t:{}};
  for(const m of [610,620])anotar(obs,prog,'ld',{entity:[ent('A','SCHEDULED',-11220)]},at(m));
  assert.equal(obs.t.A[3],null);
});

test('validez del día: 90 % de las capturas de 04:00 a 24:00 y huecos de 30 min como mucho', ()=>{
  const todas=[...Array(240)].map((_,i)=>240+i*5);
  assert.equal(validez(todas).valido,true);
  assert.equal(validez(todas.filter(m=>m<600||m>640)).valido,false);         // hueco de 45 min
  assert.equal(validez(todas.filter((m,i)=>i%10)).valido,true);              // 216 de 240, huecos de 10 min
  assert.equal(validez(todas.filter((m,i)=>i%5)).valido,false);              // 192 de 240
});

test('agregados: solo cuentan los días válidos de cada feed', ()=>{
  const dia=(v,ok)=>({validez:{ld:{valido:ok},cer:{valido:true}},rutas:{'renfe|X|1|2':v,'cer|10|C1':[10,8,1,0,2,1,0]}});
  const a=agregar([{dias:{'2026-11-24':dia([10,6,1,0,2,1,0],true),'2026-11-25':dia([10,7,0,0,1,0,0],false)}}]);
  assert.equal(a.ultimo,'2026-11-25');
  assert.equal(a.rutas['renfe|X|1|2'].d1,undefined);                          // el último día no es válido en AV/LD/MD
  assert.deepEqual(a.rutas['renfe|X|1|2'].d7,{dias:1,v:[10,6,1,0,2,1,0]});
  assert.deepEqual(a.rutas['cer|10|C1'].d7,{dias:2,v:[20,16,2,0,4,2,0]});
  assert.deepEqual(a.cobertura.ld.d7,{dias:2,validos:1});
});
