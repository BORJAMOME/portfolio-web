#!/usr/bin/env node
/* Cabina · Rutas: todas las rutas ferroviarias de viajeros de España a partir de los GTFS públicos.
   Una fila = relación origen → destino por marca (AV, larga y media distancia, iryo y OUIGO)
   o una línea de Cercanías por núcleo (los dos sentidos juntos). Salida: visor-ferroviario/capas/rutas.json.

     node tools/build-rutas.mjs --download        descarga las fuentes a .cache/rutas/ y genera
     node tools/build-rutas.mjs                   genera con lo ya descargado
     node tools/build-rutas.mjs --hoy=2026-11-21  fija «hoy» (pruebas y regeneración reproducible)

   Semana de referencia: la primera semana completa (lunes a domingo), a partir de la de «hoy», que cubren TODAS
   las fuentes. Mes y año son ESTIMACIONES con esa semana tipo (× 4,35 y × 52): no recogen festivos ni cambios de horario.
   Fuentes, licencias y decisiones: visor-ferroviario/RUTAS_ESTADO.md. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readGtfs,serviceDays,minutes} from './rutas/gtfs.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CACHE=path.join(ROOT,'.cache','rutas'),V=path.join(ROOT,'visor-ferroviario'),OUT=path.join(V,'capas','rutas.json');
const arg=k=>process.argv.find(a=>a.startsWith('--'+k+'='))?.split('=')[1];

export const SOURCES={
  renfe:{file:'renfe.zip',url:'https://ssl.renfe.com/gtransit/Fichero_AV_LD/google_transit.zip',label:'Renfe · GTFS alta velocidad, larga y media distancia',licence:'CC BY 4.0 · Origen de los datos: Renfe Operadora',official:true},
  cercanias:{file:'cercanias.zip',url:'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip',label:'Renfe · GTFS Cercanías (todos los núcleos, ancho ibérico y métrico)',licence:'CC BY 4.0 · Origen de los datos: Renfe Operadora',official:true},
  iryo:{file:'iryo.zip',url:'https://deryclem.github.io/iryo-gtfs/gtfs-iryo.zip',label:'iryo · GTFS comunitario de Clément Desouche (@deryclem), con horarios de iryo.eu',licence:'CC BY 4.0 (compilación) · no oficial, sin relación con iryo',official:false},
  estaciones:{file:'estaciones.csv',url:'https://ssl.renfe.com/ftransit/Fichero_estaciones/estaciones.csv',label:'Renfe · listado completo de estaciones',licence:'CC BY 4.0 · Origen de los datos: Renfe Operadora',official:true}
};

async function download(){
  fs.mkdirSync(CACHE,{recursive:true});const meta={};
  for(const [k,s] of Object.entries(SOURCES)){
    const r=await fetch(s.url,{headers:{'user-agent':'borjamora.es visor ferroviario (portfolio)'}});
    if(!r.ok)throw new Error(`${k}: HTTP ${r.status} en ${s.url}`);
    fs.writeFileSync(path.join(CACHE,s.file),Buffer.from(await r.arrayBuffer()));
    meta[k]={downloaded:new Date().toISOString().slice(0,10),last_modified:r.headers.get('last-modified')};
  }
  fs.writeFileSync(path.join(CACHE,'meta.json'),JSON.stringify(meta,null,1));
}

/* ── familias y marcas (nueva arquitectura de Renfe, trenes.renfe.com) ── */
const BRAND={'AVE':'AVE','AVE EUROMED':'AVE Euromed','AVLO':'Avlo','AVANT':'Avant','AVANT EXP':'Avant Exprés','INTERCITY':'Intercity','REGIONAL':'Regional'};
const FAMILY={'AVE':'Alta velocidad','AVE Euromed':'Alta velocidad','Avlo':'Alta velocidad','iryo':'Alta velocidad','OUIGO':'Alta velocidad',
  'Avant':'Avant','Avant Exprés':'Avant','Intercity':'Intercity','Regional':'Regional'};
const COMPANY={Renfe:'Pública · Renfe',iryo:'Privada',OUIGO:'Privada'};

/* ── territorio: comunidad por coordenadas (NUTS 2 de Eurostat/GISCO en datos.json) ── */
function inRing(p,ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];
  if((yi>p[1])!==(yj>p[1])&&p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi)c=!c;}return c;}
function regionOf(regions){
  return p=>{for(const f of regions){const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    for(const poly of polys)if(inRing(p,poly[0])&&!poly.slice(1).some(h=>inRing(p,h)))return f.properties.NAME_LATN;}
    // Costa: los polígonos NUTS 1:1 M están generalizados y dejan fuera estaciones del litoral (≤ 3 km; más lejos
    // se cuela la frontera: La Tor de Querol está a pocos km de Puigcerdà, pero en Francia).
    let best=null,bm=3000;for(const f of regions){const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
      for(const poly of polys)for(const v of poly[0]){const m=metres(p,v);if(m<bm){bm=m;best=f.properties.NAME_LATN;}}}
    return best;};
}
// Terminales al otro lado de la frontera a menos de 3 km del polígono español (generalizado): Rodalies R3 y R11, Celta.
const FOREIGN=/Tor de Querol|Cerb[eè]re|Valen[cç]a do Minho|Hendaye|Hendaia/i;
const metres=(a,b)=>{const k=Math.cos((a[1]+b[1])/2*Math.PI/180);return Math.hypot((a[0]-b[0])*k,a[1]-b[1])*111320;};
const title=s=>s.toLowerCase().replace(/(^|[\s,(/'-])(\p{L})/gu,(a,b,c)=>b+c.toUpperCase()).replace(/\b(De|Del|La|Las|Los|El|Y|I|D'|L')\b/g,m=>m.toLowerCase()).replace(/^./,m=>m.toUpperCase());

/* ── lectura de cada GTFS a una lista de trenes ── */
function trainsFrom(src,g,opts){
  const days=serviceDays(g),route=new Map(g.routes.map(r=>[r.route_id,r])),byTrip=new Map();
  const st=g.stop_times;
  for(let i=0;i<st.trip_id.length;i++){let a=byTrip.get(st.trip_id[i]);if(!a)byTrip.set(st.trip_id[i],a=[]);
    a.push([+st.stop_sequence[i],opts.code(st.stop_id[i]),minutes(st.arrival_time[i]),minutes(st.departure_time[i])]);}
  const out=[],bad={bus:[],incomplete:[]};
  for(const t of g.trips){
    const r=route.get(t.route_id),calls=byTrip.get(t.trip_id);
    if(r&&opts.skip?.(r)){bad.bus.push(days.get(t.service_id));continue;}
    if(!r||!calls||calls.length<2){bad.incomplete.push(days.get(t.service_id));continue;}   // sin paradas u horas: no se puede mostrar
    calls.sort((a,b)=>a[0]-b[0]);
    const dep=calls[0][3]??calls[0][2],arr=calls.at(-1)[2]??calls.at(-1)[3];
    out.push({src,...opts.describe(r,t,calls),dep,arr,stops:calls.map(c=>c[1]),times:calls.map(c=>c[3]??c[2]),number:opts.number?.(t)||null,days:days.get(t.service_id)||new Set()});
  }
  return {trains:out,bad};
}

function build(today){
  const need=Object.values(SOURCES).filter(s=>!fs.existsSync(path.join(CACHE,s.file)));
  if(need.length)throw new Error('Faltan fuentes en .cache/rutas: ejecuta con --download');
  const dl=fs.existsSync(path.join(CACHE,'meta.json'))?JSON.parse(fs.readFileSync(path.join(CACHE,'meta.json'),'utf8')):{};

  // Estaciones: catálogo de Renfe (código de 5 cifras, provincia) + nombres y coordenadas de los GTFS.
  const catalog=new Map();
  for(const l of fs.readFileSync(path.join(CACHE,'estaciones.csv'),'utf8').split(/\r?\n/).slice(1)){
    const c=l.split(';').map(x=>x.replace(/^"|"$/g,''));if(c[0])catalog.set(c[0],{prov:c[7]?title(c[7]).replace(/^(.*), (A|La|Las|Los|El|Les|L')$/i,'$2 $1'):null,coord:[+c[3],+c[2]]});
  }
  const stations=new Map(),seeStop=(code,s,rank)=>{const x=stations.get(code);if(!x||rank<x.rank)stations.set(code,{code,name:s.stop_name,coord:[+s.stop_lon,+s.stop_lat],rank});};
  const nuc=Object.fromEntries(JSON.parse(fs.readFileSync(path.join(V,'transit-catalog.json'),'utf8')).networks.filter(n=>n.id.startsWith('renfe-')).map(n=>[n.id.slice(6),n.name]));

  const sources={},all=[],notes=[];
  const G={};for(const k of ['renfe','cercanias','iryo'])G[k]=readGtfs(path.join(CACHE,SOURCES[k].file));
  const id=x=>x;
  for(const s of G.renfe.stops)seeStop(s.stop_id,s,1);
  for(const s of G.cercanias.stops)seeStop(s.stop_id,s,2);
  for(const s of G.iryo.stops)seeStop(s.stop_id,s,3);

  const bad={};
  const add=(k,res)=>{all.push(...res.trains);bad[k]=res.bad;sources[k]={...SOURCES[k],file:undefined,trains:res.trains.length,...(dl[k]||{})};};
  add('renfe',trainsFrom('renfe',G.renfe,{code:id,number:t=>t.trip_short_name,
    describe:r=>{const marca=BRAND[r.route_short_name.trim().toUpperCase()]||r.route_short_name.trim();return {operador:'Renfe',marca,familia:FAMILY[marca]||'Regional'};}}));
  add('cercanias',trainsFrom('cercanias',G.cercanias,{code:id,
    skip:r=>r.route_type==='3',   // autobuses de sustitución: no son trenes
    describe:r=>{const n=r.route_id.slice(0,2);return {operador:'Renfe',marca:r.route_short_name,familia:'Cercanías',nucleo:nuc[n]||('Núcleo '+n),line:n+'|'+r.route_short_name,long:r.route_long_name.replace(/\s+/g,' ').trim(),color:r.route_color?'#'+r.route_color:null};}}));
  // OUIGO: su GTFS del NAP es el plan de julio de 2026 (no recoge la suspensión Madrid–Andalucía ni la programación
  // de diciembre). Se usa el PDF oficial «Horarios OUIGO 2026-2027» que ya integra el visor (capas/horarios.json).
  const ou=ouigoFromAtlas();for(const [code,s] of ou.stations)seeStop(code,s,4);
  all.push(...ou.trains);sources.ouigo={label:ou.source.title,url:ou.source.url,licence:'Horario oficial de OUIGO España; trenes reconstruidos por el atlas uniendo los trayectos origen-destino del PDF',official:true,trains:ou.trains.length,skipped:0,consulted:ou.source.consulted};
  add('iryo',trainsFrom('iryo',G.iryo,{code:id,number:t=>t.trip_short_name,describe:()=>({operador:'iryo',marca:'iryo',familia:'Alta velocidad'})}));

  // Cobertura de cada fuente y semana de referencia común.
  const iso=d=>new Date(d).toISOString().slice(0,10),U=s=>Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10));
  for(const k of ['renfe','cercanias','ouigo','iryo']){const d=new Set();for(const t of all)if(t.src===k)for(const x of t.days)d.add(x);const s=[...d].sort();sources[k].from=s[0];sources[k].to=s.at(-1);}
  const t0=U(today);let mon=t0-((new Date(t0).getUTCDay()+6)%7)*864e5,week=null;
  for(let w=0;w<60&&!week;w++,mon+=7*864e5){const sun=iso(mon+6*864e5),m=iso(mon);
    if(Object.values(sources).filter(s=>s.from).every(s=>s.from<=m&&s.to>=sun))week=m;}
  if(!week)throw new Error('No hay ninguna semana completa cubierta por todas las fuentes');
  const W=[...Array(7)].map((_,i)=>iso(U(week)+i*864e5)),WD=W[2];   // miércoles = día laborable de referencia
  // Lo excluido, contado también el día laborable de referencia, para poder reconciliar con el GTFS.
  for(const [k,b] of Object.entries(bad)){const on=a=>a.filter(d=>d?.has(WD)).length,parts=[];
    if(b.bus.length)parts.push(b.bus.length+' viajes de autobús de sustitución ('+on(b.bus)+' el día de referencia)');
    if(b.incomplete.length)parts.push(b.incomplete.length+' viajes sin paradas u horas en el GTFS ('+on(b.incomplete)+' el día de referencia)');
    if(parts.length)sources[k].excluidos='Se excluyen '+parts.join(' y ')+'.';}
  for(const [k,s] of Object.entries(sources))if(s.to<iso(U(week)+28*864e5))notes.push(s.label+': horarios publicados solo hasta el '+s.to+'.');

  // Estaciones usadas → índice, comunidad y provincia.
  const region=regionOf(datosRegions());
  const used=new Set(all.flatMap(t=>t.stops)),stIdx=new Map(),stOut=[];
  const cat=[...catalog.values()].filter(x=>x.prov&&x.coord[0]);for(const x of cat)x.ca??=region(x.coord);
  let provInferred=0;
  for(const code of [...used].sort()){const s=stations.get(code)||{code,name:code,coord:null};stIdx.set(code,stOut.length);
    const ca=!s.coord?null:FOREIGN.test(s.name)?'Fuera de España':(region(s.coord)||'Fuera de España');let pr=ca==='Fuera de España'?null:catalog.get(code)?.prov||null;   // el catálogo asigna provincia española a Cerbère o Valença
    if(!pr&&s.coord&&ca!=='Fuera de España'){let bm=40000;for(const x of cat){if(x.ca!==ca)continue;const m=metres(s.coord,x.coord);if(m<bm){bm=m;pr=x.prov;}}if(pr)provInferred++;}
    stOut.push({k:code,n:s.name,c:s.coord?s.coord.map(x=>+x.toFixed(5)):null,ca,pr});}
  notes.push('Provincia: la del catálogo de estaciones de Renfe; '+provInferred+' estaciones que no figuran en él toman la de la estación del catálogo más cercana (≤ 40 km, misma comunidad).');

  // Agregar trenes en filas.
  const rows=new Map();
  for(const t of all){
    const o=t.stops[0],d=t.stops.at(-1);
    const key=t.familia==='Cercanías'?'cer|'+t.line:[t.src,t.marca,o,d].join('|');
    let r=rows.get(key);
    if(!r)rows.set(key,r={key,src:t.src,operador:t.operador,empresa:COMPANY[t.operador],familia:t.familia,marca:t.marca,nucleo:t.nucleo||null,color:t.color||null,
      o:t.familia==='Cercanías'?null:o,d:t.familia==='Cercanías'?null:d,long:t.long||null,trains:[]});
    r.trains.push(t);
  }
  const median=a=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};
  const out=[];
  for(const r of rows.values()){
    const per=W.map(day=>r.trains.filter(t=>t.days.has(day)));
    const week7=per.reduce((a,x)=>a+x.length,0);
    const allDays=new Set();for(const t of r.trains)for(const x of t.days)allDays.add(x);const sd=[...allDays].sort();
    if(!sd.length)continue;
    const wd=per[2],base=wd.length?wd:per.find(x=>x.length)||[];
    const st=new Set();for(const t of r.trains)for(const s of t.stops)st.add(stIdx.get(s));
    let o=r.o,d=r.d;
    if(r.familia==='Cercanías'){const f=new Map();for(const t of base){const k=[t.stops[0],t.stops.at(-1)].sort().join('>');f.set(k,(f.get(k)||0)+1);}
      const top=[...f].sort((a,b)=>b[1]-a[1])[0];if(top)[o,d]=top[0].split('>');}
    out.push({
      id:r.key,src:r.src,op:r.operador,emp:r.empresa,fam:r.familia,marca:r.marca,nuc:r.nucleo,color:r.color,
      o:o?stIdx.get(o):null,d:d?stIdx.get(d):null,linea:r.long?r.long.replace(/\s+-\s*/g,' – '):null,
      lab:wd.length,sab:per[5].length,dom:per[6].length,sem:week7,mes:Math.round(week7*4.35),anio:week7*52,
      dias:per.map(x=>x.length),
      pri:base.length?Math.min(...base.map(t=>t.dep)):null,ult:base.length?Math.max(...base.map(t=>t.dep)):null,
      dur:median(base.map(t=>t.arr-t.dep)),durMin:base.length?Math.min(...base.map(t=>t.arr-t.dep)):null,
      par:median(base.map(t=>t.stops.length)),
      // Salidas del miércoles: [minuto, índice de la estación de origen del tren] (en Cercanías, de cada extremo).
      sal:wd.map(t=>[t.dep,stIdx.get(t.stops[0])]).sort((a,b)=>a[0]-b[0]),
      est:[...st].sort((a,b)=>a-b),
      num:[...new Set(r.trains.map(t=>t.number).filter(Boolean))].sort().slice(0,60),
      desde:sd[0],hasta:sd.at(-1)
    });
  }
  out.sort((a,b)=>b.sem-a.sem||String(a.id).localeCompare(String(b.id)));

  const oferta=stationOffer(all,stIdx,stOut.length,W,sources);
  oferta.capitales=capitalPairs(all,stOut,stIdx,WD);
  const totals={};for(const k of ['renfe','cercanias','ouigo','iryo'])totals[k]={lab:out.filter(r=>r.src===k).reduce((a,r)=>a+r.lab,0),filas:out.filter(r=>r.src===k).length};
  return {version:1,generado:today,generado_con:'tools/build-rutas.mjs',
    referencia:{semana:W[0],laborable:WD,sabado:W[5],domingo:W[6],
      nota:'Semana completa (lunes a domingo) que cubren todas las fuentes. Mes = semana × 4,35 y año = semana × 52: estimaciones con semana tipo, sin festivos ni cambios de horario.'},
    fuentes:sources,totales:totals,notas:notes,estaciones:stOut,rutas:out,oferta};
}
/* Oferta por estación y por familia en la semana de referencia, con TODOS los trenes de viajeros con horario público
   (Renfe AV/LD/MD, Cercanías de todos los núcleos, OUIGO e iryo). Es la base de los titulares de Cabina, que así no
   calcula nada en el navegador. Un tren cuenta una vez en cada estación donde para (llegue, salga o ambas cosas). */
export const FAMILIES=['Alta velocidad','Avant','Intercity','Regional','Cercanías'];
const AV_KEY={'AVE':'ave','AVE Euromed':'ave','Avlo':'avlo','iryo':'iryo','OUIGO':'ouigo','Avant':'avant','Avant Exprés':'avant'};
function stationOffer(all,stIdx,n,W,sources){
  const WD=W[2],SA=W[5],SU=W[6],AVK=['ave','avlo','avant','ouigo','iryo'];
  const st=[...Array(n)].map(()=>({lab:0,sab:0,dom:0,fam:[0,0,0,0,0],av:[0,0,0,0,0],pri:null,ult:null,dest:new Set()}));
  const fam=Object.fromEntries(FAMILIES.map(f=>[f,{lab:0,sab:0,dom:0,horas:new Array(24).fill(0)}]));
  for(const t of all){
    const onWD=t.days.has(WD),onSA=t.days.has(SA),onSU=t.days.has(SU);if(!onWD&&!onSA&&!onSU)continue;
    const F=fam[t.familia];if(onWD){F.lab++;F.horas[Math.floor(t.dep/60)%24]++;}if(onSA)F.sab++;if(onSU)F.dom++;
    const fi=FAMILIES.indexOf(t.familia),ai=AVK.indexOf(AV_KEY[t.marca]);
    const seen=new Set();
    t.stops.forEach((code,i)=>{const k=stIdx.get(code);if(seen.has(k))return;seen.add(k);const x=st[k];
      if(onSA)x.sab++;if(onSU)x.dom++;
      if(!onWD)return;
      x.lab++;x.fam[fi]++;if(ai>=0)x.av[ai]++;
      const tm=t.times[i];if(tm!==null&&tm!==undefined){x.pri=x.pri===null?tm:Math.min(x.pri,tm);x.ult=x.ult===null?tm:Math.max(x.ult,tm);}
      for(let j=i+1;j<t.stops.length;j++)x.dest.add(stIdx.get(t.stops[j]));});
  }
  return {
    referencia:{laborable:WD,sabado:SA,domingo:SU},
    universo:'Trenes de viajeros con horario público: Renfe (alta velocidad, larga y media distancia y Cercanías de todos los núcleos, de ancho ibérico y métrico), OUIGO e iryo.',
    fuentes:Object.fromEntries(Object.entries(sources).filter(([,s])=>s.from).map(([k,s])=>[k,{label:s.label,from:s.from,to:s.to,official:s.official}])),
    familias:fam,av_claves:AVK,
    // Por estación (mismo índice que rutas.json · estaciones): [laborable, sábado, domingo, [por familia], [ave, avlo, avant, ouigo, iryo], primero, último, destinos directos]
    por_estacion:st.map((x,k)=>[x.lab,x.sab,x.dom,x.fam,x.av,x.pri,x.ult,(x.dest.delete(k),x.dest.size)])
  };
}
/* Tiempo directo más corto entre dos capitales de provincia, con cualquier tren que pare en las dos (no solo los que
   empiezan y terminan en ellas: un AVE Madrid–Barcelona da también Madrid–Zaragoza). Estación → capital si está a ≤ 12 km.
   Salida: [código de estación A, código de estación B, minutos, marca, operador, familia], A antes que B en el recorrido. */
function capitalPairs(all,stOut,stIdx,WD){
  const caps=JSON.parse(fs.readFileSync(path.join(V,'capas','poblacion.json'),'utf8')).units.filter(u=>u.kind==='capital');
  const capOf=new Map();
  for(const s of stOut){if(!s.c)continue;let best=null,bd=12000;for(const c of caps){const d=metres(s.c,c.coordinates);if(d<bd){bd=d;best=c.id;}}if(best)capOf.set(s.k,best);}
  const best=new Map();
  for(const t of all){
    if(t.familia==='Cercanías'||!t.days.has(WD))continue;
    for(let i=0;i<t.stops.length;i++){const ci=capOf.get(t.stops[i]),ti=t.times[i];if(!ci||ti===null||ti===undefined)continue;
      for(let j=i+1;j<t.stops.length;j++){const cj=capOf.get(t.stops[j]),tj=t.times[j];if(!cj||cj===ci||tj===null||tj===undefined)continue;
        const key=t.stops[i]+'>'+t.stops[j],min=tj-ti;if(min<=0)continue;
        const x=best.get(key);if(!x||min<x[2])best.set(key,[t.stops[i],t.stops[j],min,t.marca,t.operador,t.familia,ci,cj]);}}
  }
  return [...best.values()];
}
/* OUIGO desde capas/horarios.json (PDF oficial): registros origen-destino [paradas, t0, patrón, calendario]. Cada día se unen
   los que comparten estación y hora de salida o de llegada (componentes conexas, como oferta.js · stationDay); un tren = una
   componente, identificado por su secuencia de paradas y horas para juntar los días en que circula igual. */
function ouigoFromAtlas(){
  const S=JSON.parse(fs.readFileSync(path.join(V,'capas','servicios.json'),'utf8')),H=JSON.parse(fs.readFileSync(path.join(V,'capas','horarios.json'),'utf8'));
  const code=sid=>S.stations[sid]?.official_id||sid,start=Date.UTC(+H.meta.start.slice(0,4),+H.meta.start.slice(5,7)-1,+H.meta.start.slice(8,10));
  const bits=H.days.map(b=>Buffer.from(b,'base64')),runs=(cal,k)=>k>=0&&k<bits[cal].length*8&&((bits[cal][k>>3]>>(k&7))&1)===1;
  const recs=(H.ouigo||[]).map(([sids,t0,p,cal])=>{const prof=H.patterns[p],n=sids.length;
    return {cal,calls:sids.map((s,i)=>({code:code(s),arr:i?t0+prof[2*i-2]:null,dep:i<n-1?t0+(i?prof[2*i-1]:0):null}))};});
  const xy=new Map();for(const s of Object.values(S.stations))if(s.official_id)xy.set(s.official_id,s.coordinates);
  const bearing=(a,b)=>{const A=xy.get(a),B=xy.get(b);if(!A||!B)return null;return Math.atan2(B[1]-A[1],(B[0]-A[0])*Math.cos(A[1]*Math.PI/180));};
  const sameWay=(p,q)=>p===null||q===null||Math.abs(Math.atan2(Math.sin(p-q),Math.cos(p-q)))<Math.PI/2;
  const days=Math.round((Date.UTC(+H.meta.ouigo_end.slice(0,4),+H.meta.ouigo_end.slice(5,7)-1,+H.meta.ouigo_end.slice(8,10))-start)/864e5)+1;
  const trains=new Map();
  for(let k=0;k<days;k++){
    const on=recs.filter(r=>runs(r.cal,k));if(!on.length)continue;
    const parent=on.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i])),groups=new Map();
    // Misma estación y misma hora de llegada (o de salida) Y mismo sentido: rumbo hacia la parada anterior/siguiente a
    // menos de 90°. Sin el rumbo, dos trenes de sentido contrario que coinciden en Albacete a las 18:45/18:48 se unían en
    // un tren imposible; con la parada siguiente exacta, un mismo tren listado con y sin paradas intermedias se partía.
    on.forEach((r,i)=>r.calls.forEach((c,ci)=>{
      if(c.arr!==null&&ci>0){const k='a'+c.code+'@'+c.arr;if(!groups.has(k))groups.set(k,[]);groups.get(k).push([i,bearing(r.calls[ci-1].code,c.code)]);}
      if(c.dep!==null&&ci<r.calls.length-1){const k='d'+c.code+'@'+c.dep;if(!groups.has(k))groups.set(k,[]);groups.get(k).push([i,bearing(c.code,r.calls[ci+1].code)]);}}));
    for(const g of groups.values())for(let x=0;x<g.length;x++)for(let y=x+1;y<g.length;y++)if(sameWay(g[x][1],g[y][1]))parent[find(g[x][0])]=find(g[y][0]);
    const comp=new Map();on.forEach((r,i)=>{const root=find(i);if(!comp.has(root))comp.set(root,new Map());const m=comp.get(root);
      for(const c of r.calls){const t=c.dep??c.arr,x=m.get(c.code);if(!x||t<x)m.set(c.code,t);}});
    const iso=new Date(start+k*864e5).toISOString().slice(0,10);
    for(const m of comp.values()){const seq=[...m].sort((a,b)=>a[1]-b[1]),sig=seq.map(([c,t])=>c+'@'+t).join('>');
      let t=trains.get(sig);if(!t)trains.set(sig,t={src:'ouigo',operador:'OUIGO',marca:'OUIGO',familia:'Alta velocidad',dep:seq[0][1],arr:seq.at(-1)[1],stops:seq.map(x=>x[0]),times:seq.map(x=>x[1]),number:null,days:new Set()});
      t.days.add(iso);}
  }
  const stations=new Map();for(const s of Object.values(S.stations))if(s.official_id)stations.set(s.official_id,{stop_name:s.name,stop_lon:s.coordinates[0],stop_lat:s.coordinates[1]});
  return {trains:[...trains.values()],stations,source:S.meta.sources['ouigo-horarios']};
}
function datosRegions(){
  // datos.json pesa 31 MB: se leen solo las regiones.
  const j=JSON.parse(fs.readFileSync(path.join(V,'datos.json'),'utf8'));return j.regions.features;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  if(process.argv.includes('--download'))await download();
  const today=arg('hoy')||new Date().toISOString().slice(0,10);
  const {oferta,...data}=build(today),txt=JSON.stringify(data)+'\n';
  fs.writeFileSync(OUT,txt);
  // oferta.json: misma lista de estaciones que rutas.json (los índices coinciden) y su oferta del día de referencia.
  const otxt=JSON.stringify({generado:today,generado_con:'tools/build-rutas.mjs',estaciones:data.estaciones,...oferta})+'\n';
  fs.writeFileSync(path.join(V,'capas','oferta.json'),otxt);
  console.log('Escrito visor-ferroviario/capas/oferta.json',(otxt.length/1024).toFixed(0)+' KB');
  console.log('Escrito',path.relative(ROOT,OUT),(txt.length/1024).toFixed(0)+' KB','· semana',data.referencia.semana,'· filas',data.rutas.length,'· estaciones',data.estaciones.length);
  for(const [k,t] of Object.entries(data.totales))console.log(' ',k.padEnd(9),'filas',String(t.filas).padStart(4),'· trenes el',data.referencia.laborable,t.lab);
  for(const n of data.notas)console.log('  aviso:',n);
}
