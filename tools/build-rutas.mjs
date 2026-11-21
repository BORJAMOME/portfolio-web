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
import {readGtfs,serviceDays,minutes,unzip,columns} from './rutas/gtfs.mjs';
import {loadRed} from './rutas/red.mjs';

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
    // Solo en la caché local: ni la fecha de descarga ni Last-Modified (Renfe lo da distinto en cada servidor, con segundos de diferencia)
    // van a rutas.json, o la tarea semanal confirmaría un commit con los mismos datos. La vigencia de cada fuente está en from/to.
    meta[k]={downloaded:new Date().toISOString(),last_modified:r.headers.get('last-modified')};
  }
  fs.writeFileSync(path.join(CACHE,'meta.json'),JSON.stringify(meta,null,1));
}

/* ── familias y marcas (nueva arquitectura de Renfe, trenes.renfe.com) ── */
export const BRAND={'AVE':'AVE','AVE EUROMED':'AVE Euromed','AVLO':'Avlo','AVANT':'Avant','AVANT EXP':'Avant Exprés','INTERCITY':'Intercity','REGIONAL':'Regional'};
const FAMILY={'AVE':'Alta velocidad','AVE Euromed':'Alta velocidad','Avlo':'Alta velocidad','iryo':'Alta velocidad','OUIGO':'Alta velocidad',
  'Avant':'Avant','Avant Exprés':'Avant','Intercity':'Intercity','Regional':'Regional'};
const COMPANY={Renfe:'Pública · Renfe',iryo:'Privada',OUIGO:'Privada'};

/* ── territorio: comunidad por coordenadas (NUTS 2 de Eurostat/GISCO en datos.json) ── */
function inRing(p,ring){let c=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];
  if((yi>p[1])!==(yj>p[1])&&p[0]<(xj-xi)*(p[1]-yi)/(yj-yi)+xi)c=!c;}return c;}
/* Municipio del INE que contiene el punto (o el más cercano a ≤ 2 km, por la generalización del litoral) → provincia. */
function municipalityOf(features,prov){
  const items=features.map(f=>{const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
    let b=[180,90,-180,-90];for(const p of polys)for(const [x,y] of p[0]){b=[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)];}
    return {polys,b,pr:prov(f.properties.province),ca:f.properties.community};});
  const ca=new Map(items.map(i=>[i.pr,i.ca]));
  const at=p=>{for(const i of items){if(p[0]<i.b[0]||p[0]>i.b[2]||p[1]<i.b[1]||p[1]>i.b[3])continue;
      for(const poly of i.polys)if(inRing(p,poly[0])&&!poly.slice(1).some(h=>inRing(p,h)))return i;}
    let best=null,bm=2000;for(const i of items){if(p[0]<i.b[0]-0.03||p[0]>i.b[2]+0.03||p[1]<i.b[1]-0.03||p[1]>i.b[3]+0.03)continue;
      for(const poly of i.polys)for(const v of poly[0]){const m=metres(p,v);if(m<bm){bm=m;best=i;}}}
    return best;};
  return {at,ca};
}
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

  // Estaciones: catálogo de Renfe (código de 5 cifras, provincia) + nombres y coordenadas de los GTFS.
  const catalog=new Map();
  // El CSV de Renfe viene en Latin-1 (leído como UTF-8 salía «A Coru�a»). Provincias en castellano: de las bilingües, el nombre en castellano.
  const raw=fs.readFileSync(path.join(CACHE,'estaciones.csv')),txt=raw.toString('utf8').includes('�')?raw.toString('latin1'):raw.toString('utf8');
  const PROV_ES={'Alicante/Alacant':'Alicante','Castellón/Castelló':'Castellón','Valencia/València':'Valencia','Valencia/Valéncia':'Valencia','Araba/Álava':'Álava'};
  const prov=p=>{if(!p||/^desconocid/i.test(p))return null;const t=title(p).replace(/^(.*), (A|La|Las|Los|El|Les|L')$/i,(m,n,a)=>a[0].toUpperCase()+a.slice(1).toLowerCase()+' '+n);return PROV_ES[t]||t;};
  for(const l of txt.split(/\r?\n/).slice(1)){
    const c=l.split(';').map(x=>x.replace(/^"|"$/g,''));if(c[0])catalog.set(c[0],{prov:prov(c[7]),coord:[+c[3],+c[2]],metric:c[10]==='SI'});
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
  const add=(k,res)=>{all.push(...res.trains);bad[k]=res.bad;sources[k]={...SOURCES[k],file:undefined,trains:res.trains.length};};
  add('renfe',trainsFrom('renfe',G.renfe,{code:id,number:t=>t.trip_short_name,
    describe:r=>{const marca=BRAND[r.route_short_name.trim().toUpperCase()]||r.route_short_name.trim();return {operador:'Renfe',marca,familia:FAMILY[marca]||'Regional'};}}));
  add('cercanias',trainsFrom('cercanias',G.cercanias,{code:id,
    skip:r=>r.route_type==='3',   // autobuses de sustitución: no son trenes
    describe:(r,t)=>{const n=r.route_id.slice(0,2);return {operador:'Renfe',marca:r.route_short_name,familia:'Cercanías',nucleo:nuc[n]||('Núcleo '+n),line:n+'|'+r.route_short_name,long:r.route_long_name.replace(/\s+/g,' ').trim(),color:r.route_color?'#'+r.route_color:null,shape:t.shape_id||null};}}));
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
  const RED=loadRed(V),region=regionOf(RED.datos.regions.features);
  const used=new Set(all.flatMap(t=>t.stops)),stIdx=new Map(),stOut=[];
  const cat=[...catalog.values()].filter(x=>x.prov&&x.coord[0]);for(const x of cat)x.ca??=region(x.coord);
  // Municipios del INE (demografia.json): provincia de las estaciones que no están en el catálogo de Renfe, y comunidad
  // de cada provincia. La comunidad sale de la provincia cuando se conoce: el polígono NUTS generalizado pone en Galicia
  // estaciones asturianas de la ría del Eo (Vegadeo).
  const muni=municipalityOf(JSON.parse(fs.readFileSync(path.join(V,'capas','demografia.json'),'utf8')).municipalities.features,prov);
  let provMuni=0,provNear=0;
  for(const code of [...used].sort()){const s=stations.get(code)||{code,name:code,coord:null};stIdx.set(code,stOut.length);
    let ca=!s.coord?null:FOREIGN.test(s.name)?'Fuera de España':(region(s.coord)||'Fuera de España');let pr=ca==='Fuera de España'?null:catalog.get(code)?.prov||null;   // el catálogo asigna provincia española a Cerbère o Valença
    if(!pr&&s.coord&&ca!=='Fuera de España'){const m=muni.at(s.coord);if(m){pr=m.pr;provMuni++;}}
    if(!pr&&s.coord&&ca!=='Fuera de España'){let bm=40000;for(const x of cat){if(x.ca!==ca)continue;const m=metres(s.coord,x.coord);if(m<bm){bm=m;pr=x.prov;}}if(pr)provNear++;}
    if(pr&&muni.ca.get(pr))ca=muni.ca.get(pr);
    stOut.push({k:code,n:s.name,c:s.coord?s.coord.map(x=>+x.toFixed(5)):null,ca,pr});}
  notes.push('Provincia: la del catálogo de estaciones de Renfe; '+provMuni+' estaciones que no figuran en él toman la del municipio del INE donde están'+(provNear?' y '+provNear+' la de la estación del catálogo más cercana (≤ 40 km, misma comunidad)':'')+'. Comunidad: la de su provincia.');

  // Cortes de infraestructura (tools/rutas/cortes.json): los trenes que pasan por un tramo cortado no circulan en esas fechas
  // aunque el horario publicado los programe. Se quitan de sus días y se guardan en t.sup para contarlos aparte.
  const CORTES=JSON.parse(fs.readFileSync(path.join(ROOT,'tools','rutas','cortes.json'),'utf8')).cortes,stByCode=new Map(stOut.map(s=>[s.k,s]));
  const hits=Object.fromEntries(CORTES.map(c=>[c.id,0]));
  for(const t of all){t.sup=new Set();t.cortes=[];
    // El GTFS de Cercanías ya separa los autobuses de sustitución (route_type 3) y no se toca.
    if(t.src==='cercanias')continue;
    for(const c of CORTES){if(!afectaCorte(c.regla,t,stByCode))continue;let n=0;
      // t.days puede ser el mismo Set para todos los viajes del mismo service_id: se copia antes de tocarlo.
      for(const d of [...t.days])if(d>=c.desde&&(!c.hasta||d<=c.hasta)){if(!n)t.days=new Set(t.days);t.days.delete(d);t.sup.add(d);n++;}
      if(n){t.cortes.push(c.id);hits[c.id]+=n;}}}
  for(const c of CORTES){
    if(c.hasta&&c.hasta<today){notes.push('Corte «'+c.tramo+'»: terminó el '+c.hasta+'; se puede retirar de tools/rutas/cortes.json.');continue;}
    if(!hits[c.id])throw new Error('cortes.json: el corte vigente «'+c.id+'» no afecta a ningún tren; revisa la regla o retíralo');
    if(c.revisar&&today>c.revisar)notes.push('Corte «'+c.tramo+'»: había que revisarlo el '+c.revisar+'.');}

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
    const supW=W.map(day=>r.trains.filter(t=>t.sup.has(day)).length),cortesR=[...new Set(r.trains.flatMap(t=>t.cortes))].sort();
    if(!sd.length&&!supW.some(Boolean))continue;
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
      desde:sd[0]||null,hasta:sd.at(-1)||null,
      // Trenes programados que no circulan por un corte (lunes a domingo de la semana) y cortes que los afectan.
      ...(cortesR.length?{sup:supW,cortes:cortesR}:{})
    });
  }
  out.sort((a,b)=>b.sem-a.sem||String(a.id).localeCompare(String(b.id)));
  viaPorRuta(out,rows,stOut,RED,catalog,path.join(CACHE,SOURCES.cercanias.file),WD);

  const oferta=stationOffer(all,stIdx,stOut.length,W,sources);
  oferta.capitales=capitalPairs(all,stOut,stIdx,WD);
  const totals={};for(const k of ['renfe','cercanias','ouigo','iryo'])totals[k]={lab:out.filter(r=>r.src===k).reduce((a,r)=>a+r.lab,0),filas:out.filter(r=>r.src===k).length};
  return {version:1,generado:today,generado_con:'tools/build-rutas.mjs',
    referencia:{semana:W[0],laborable:WD,sabado:W[5],domingo:W[6],
      nota:'Semana completa (lunes a domingo) que cubren todas las fuentes. Mes = semana × 4,35 y año = semana × 52: estimaciones con semana tipo, sin festivos ni cambios de horario.'},
    cortes:CORTES.map(c=>({id:c.id,tramo:c.tramo,desde:c.desde,hasta:c.hasta,hasta_nota:c.hasta_nota||null,efecto:c.efecto,fuentes:c.fuentes,
      lab:all.filter(t=>t.cortes.includes(c.id)&&t.sup.has(WD)).length})),
    fuentes:sources,totales:totals,notas:notes,estaciones:stOut,rutas:out,oferta};
}
/* ¿Pasa el tren por el tramo de un corte? toca: para en alguna estación; toca_prefijo: código de estación con ese prefijo
   (línea entera); cruza: entre dos paradas consecutivas, exactamente una al otro «lado» y esa es una «puerta» (estación de la
   línea cortada), salvo las marcas exceptuadas (los regionales por la convencional). */
export function afectaCorte(regla,t,st){
  if(regla.toca&&t.stops.some(c=>regla.toca.includes(c)))return true;
  if(regla.toca_prefijo&&t.stops.some(c=>regla.toca_prefijo.some(p=>c.startsWith(p))))return true;
  const x=regla.cruza;if(!x||(x.excepto_marcas||[]).includes(t.marca))return false;
  const lado=c=>{const s=st.get(c);return !!s&&((x.lado.comunidades||[]).includes(s.ca)||(x.lado.provincias||[]).includes(s.pr));};
  for(let i=1;i<t.stops.length;i++){const a=t.stops[i-1],b=t.stops[i],la=lado(a),lb=lado(b);
    if(la!==lb&&x.puerta.includes(la?a:b))return true;}
  return false;
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
/* Erratas del PDF «Horarios OUIGO 2026-2027» (y de su lectura en capas/horarios.json, cuyo generador no está en este repo).
   Se aplican a los registros antes de reconstruir los trenes. Cada una identifica su registro por [origen, hora de salida,
   destino] (códigos oficiales de estación); si no lo encuentra (o, al añadir, ya existe), el script falla: señal de que el
   PDF o horarios.json han cambiado y hay que revisar la lista.
   · cal: calendario completo que sustituye al del registro. dias = letras LMXJVSD; desde/hasta = fechas ISO (inclusive);
     cerrado = fechas sueltas 'MM-DD'; cierre = {dias, desde, hasta} (esos días de la semana cerrados en ese intervalo).
   · paradas: [[código, llegada, salida], …] con horas 'hh:mm' (null en la llegada del origen y en la salida del destino).
   Estaciones: 60000 Madrid-Atocha, 17000 Madrid-Chamartín, 04040 Zaragoza, 50500 Córdoba, 51003 Sevilla, 60600 Albacete,
   60911 Alicante, 03410 Elche, 61200 Murcia, 03208 Cuenca, 03216 València, 08004 Segovia. */
const OUIGO_ERRATAS=[
  // p. 27 · Zaragoza>Madrid 09:19 «Lunes, Viernes y Sábados¹» (¹ = disponible desde el 13-12): horarios.json perdió los sábados.
  {registro:['04040','09:19','60000'],cal:{dias:'LVS',desde:'2026-12-13'},causa:'faltan los sábados'},
  // p. 18 · Murcia>Albacete 21:00 «Todos los días¹,³» (¹ cerrada 25-12 y 1-1; ³ martes y miércoles cerrada del 11-1 al 14-3):
  // horarios.json solo cierra los martes.
  {registro:['61200','21:00','60600'],cal:{dias:'LMXJVSD',cerrado:['12-25','01-01'],cierre:{dias:'MX',desde:'2027-01-11',hasta:'2027-03-14'}},causa:'faltan los miércoles cerrados'},
  // p. 16 · Madrid>Valencia 07:15: Cuenca «08:17→08.20» (punto en vez de dos puntos); horarios.json guarda 08:17→08:17.
  {registro:['17000','07:15','03216'],paradas:[['17000',null,'07:15'],['03208','08:17','08:20'],['03216','09:16',null]],causa:'«08.20»'},
  // p. 28 · Zaragoza>Sevilla «09:10 · Madrid 11:05→11:40 · Córdoba 13:25→13:28 · Sevilla 14:21»: es el Barcelona 07:50, que sale de
  // Zaragoza a las 09:19 y llega a Madrid a las 11:07 (Barcelona>Madrid, Zaragoza>Madrid y Zaragoza>Córdoba 09:19) y a Sevilla a las 14:20
  // (Madrid>Sevilla 11:40).
  {registro:['04040','09:10','51003'],paradas:[['04040',null,'09:19'],['60000','11:07','11:40'],['50500','13:25','13:28'],['51003','14:20',null]],causa:'09:10 por 09:19'},
  // Filas del PDF que horarios.json no recoge (tienen horas imposibles):
  // p. 14 · Madrid>Elche 17:15 «Cuenca 17:45→17:48 · Albacete 17:45→17:48»: no para en Cuenca (Madrid>Albacete y Madrid>Murcia 17:15)
  // y pasa por Albacete a las 18:45→18:48. «Todos los días», sin nota.
  {añadir:['17000','17:15','03410'],paradas:[['17000',null,'17:15'],['60600','18:45','18:48'],['03410','19:36',null]],cal:{dias:'LMXJVSD'},causa:'Cuenca y Albacete con horas cruzadas'},
  // p. 11 · Elche>Madrid 21:24 «Albacete 22:23→22:16»: llega a Albacete a las 22:13 (Elche>Albacete 21:24). «Todos los días²» (² cerrada 24 y 31-12).
  {añadir:['03410','21:24','17000'],paradas:[['03410',null,'21:24'],['60600','22:13','22:16'],['17000','23:48',null]],cal:{dias:'LMXJVSD',cerrado:['12-24','12-31']},causa:'«22:23→22:16»'},
  // p. 12 · Elche>Segovia 07:03 «Madrid 10:23→11:15»: sale de Madrid a las 10:45 (las demás secciones). «Todos los días¹» (¹ cerrada 25-12 y 1-1).
  {añadir:['03410','07:03','08004'],paradas:[['03410',null,'07:03'],['60911','07:23','07:51'],['60600','08:39','08:42'],['03208','09:16','09:19'],['17000','10:23','10:45'],['08004','11:12',null]],
    cal:{dias:'LMXJVSD',cerrado:['12-25','01-01']},causa:'Madrid «10:23→11:15»'},
  // p. 27 · Zaragoza>Córdoba 17:28 «Madrid 11:19→11:55»: es 19:19→19:55 (Barcelona y Tarragona>Córdoba). «Todos los días¹» (¹ en esa
  // página: disponible desde el 13-12).
  {añadir:['04040','17:28','50500'],paradas:[['04040',null,'17:28'],['60000','19:19','19:55'],['50500','21:39',null]],cal:{dias:'LMXJVSD',desde:'2026-12-13'},causa:'Madrid «11:19→11:55»'}
];
/* OUIGO desde capas/horarios.json (PDF oficial): registros origen-destino [paradas, t0, patrón, calendario], corregidos con
   OUIGO_ERRATAS. Cada día se unen los que comparten estación y hora de salida o de llegada (componentes conexas, como
   oferta.js · stationDay); un tren = una componente, identificado por su secuencia de paradas y horas para juntar los días en
   que circula igual. */
function ouigoFromAtlas(){
  const S=JSON.parse(fs.readFileSync(path.join(V,'capas','servicios.json'),'utf8')),H=JSON.parse(fs.readFileSync(path.join(V,'capas','horarios.json'),'utf8'));
  const code=sid=>S.stations[sid]?.official_id||sid,start=Date.UTC(+H.meta.start.slice(0,4),+H.meta.start.slice(5,7)-1,+H.meta.start.slice(8,10));
  const bits=H.days.map(b=>Buffer.from(b,'base64')),runs=(cal,k)=>k>=0&&k<bits[cal].length*8&&((bits[cal][k>>3]>>(k&7))&1)===1;
  const recs=(H.ouigo||[]).map(([sids,t0,p,cal])=>{const prof=H.patterns[p],n=sids.length;
    return {on:k=>runs(cal,k),calls:sids.map((s,i)=>({code:code(s),arr:i?t0+prof[2*i-2]:null,dep:i<n-1?t0+(i?prof[2*i-1]:0):null}))};});
  // Erratas: calendario declarativo → función del día k (días desde H.meta.start).
  const mins=h=>h===null?null:+h.slice(0,2)*60+ +h.slice(3,5),WDAY='DLMXJVS';
  const calOf=c=>k=>{const d=new Date(start+k*864e5),iso=d.toISOString().slice(0,10),md=iso.slice(5),wd=WDAY[d.getUTCDay()];
    return c.dias.includes(wd)&&(!c.desde||iso>=c.desde)&&(!c.hasta||iso<=c.hasta)&&!(c.cerrado||[]).includes(md)
      &&!(c.cierre&&c.cierre.dias.includes(wd)&&iso>=c.cierre.desde&&iso<=c.cierre.hasta);};
  const callsOf=p=>p.map(([c,a,d])=>({code:c,arr:mins(a),dep:mins(d)}));
  const keyOf=r=>r.calls[0].code+'@'+r.calls[0].dep+'>'+r.calls.at(-1).code;
  for(const e of OUIGO_ERRATAS){const [o,h,d]=e.registro||e.añadir,k=o+'@'+mins(h)+'>'+d,hit=recs.filter(r=>keyOf(r)===k);
    if(e.añadir){if(hit.length)throw new Error(`OUIGO_ERRATAS: ${o} ${h} → ${d} ya está en horarios.json; revisa la errata («${e.causa}»)`);
      recs.push({on:calOf(e.cal),calls:callsOf(e.paradas)});continue;}
    if(hit.length!==1)throw new Error(`OUIGO_ERRATAS: ${hit.length?'varios registros':'ningún registro'} ${o} ${h} → ${d} en horarios.json; revisa la errata («${e.causa}»)`);
    if(e.cal)hit[0].on=calOf(e.cal);
    if(e.paradas)hit[0].calls=callsOf(e.paradas);}
  // Paradas conocidas (estación, llegada ↔ salida) de cualquier registro que pase por ella: unen un registro que acaba en una
  // estación con otro que empieza en ella (Madrid 17:15 → Elche + Elche 19:39 → Murcia, los días en que no se vende el trayecto
  // entero), que si no quedarían como dos trenes.
  const xy=new Map();for(const s of Object.values(S.stations))if(s.official_id)xy.set(s.official_id,s.coordinates);
  const bearing=(a,b)=>{const A=xy.get(a),B=xy.get(b);if(!A||!B)return null;return Math.atan2(B[1]-A[1],(B[0]-A[0])*Math.cos(A[1]*Math.PI/180));};
  const sameWay=(p,q)=>p===null||q===null||Math.abs(Math.atan2(Math.sin(p-q),Math.cos(p-q)))<Math.PI/2;
  // Cada parada conocida guarda también el rumbo con que se llega y con que se sale (el tren puede cambiar de rumbo, como en
  // Elche): un extremo solo se une a la parada que llega o sale con su mismo rumbo (en Albacete a las 18:45→18:48 coinciden
  // dos trenes de sentido contrario).
  const byArr=new Map(),byDep=new Map(),addTo=(m,k,v)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(v);};
  for(const r of recs)r.calls.forEach((c,ci)=>{if(c.arr===null||c.dep===null)return;
    const bIn=bearing(r.calls[ci-1].code,c.code),bOut=bearing(c.code,r.calls[ci+1].code);
    addTo(byArr,c.code+'@'+c.arr,[c.dep,bIn,bOut]);addTo(byDep,c.code+'@'+c.dep,[c.arr,bIn,bOut]);});
  const days=Math.round((Date.UTC(+H.meta.ouigo_end.slice(0,4),+H.meta.ouigo_end.slice(5,7)-1,+H.meta.ouigo_end.slice(8,10))-start)/864e5)+1;
  const trains=new Map();
  for(let k=0;k<days;k++){
    const on=recs.filter(r=>r.on(k));if(!on.length)continue;
    const parent=on.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i])),groups=new Map();
    const put=(key,i,b)=>{if(!groups.has(key))groups.set(key,[]);groups.get(key).push([i,b]);};
    // Misma estación y misma hora de llegada (o de salida) Y mismo sentido: rumbo hacia la parada anterior/siguiente a
    // menos de 90°. Sin el rumbo, dos trenes de sentido contrario que coinciden en Albacete a las 18:45/18:48 se unían en
    // un tren imposible; con la parada siguiente exacta, un mismo tren listado con y sin paradas intermedias se partía.
    // Un extremo (solo llegada o solo salida) entra también en el grupo de la hora complementaria si es una parada conocida.
    on.forEach((r,i)=>r.calls.forEach((c,ci)=>{
      if(c.arr!==null&&ci>0){const b=bearing(r.calls[ci-1].code,c.code);put('a'+c.code+'@'+c.arr,i,b);
        if(c.dep===null)for(const [d,bIn,bOut] of byArr.get(c.code+'@'+c.arr)||[])if(sameWay(b,bIn))put('d'+c.code+'@'+d,i,bOut);}
      if(c.dep!==null&&ci<r.calls.length-1){const b=bearing(c.code,r.calls[ci+1].code);put('d'+c.code+'@'+c.dep,i,b);
        if(c.arr===null)for(const [a,bIn,bOut] of byDep.get(c.code+'@'+c.dep)||[])if(sameWay(b,bOut))put('a'+c.code+'@'+a,i,bIn);}}));
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
/* Vía e infraestructura de cada ruta.
   - Renfe (AV/LD/MD), OUIGO e iryo: recorrido IGN inferido de la variante de servicios.json con los mismos extremos
     (de la misma marca si la hay; si no, cualquiera: OUIGO e iryo usan las mismas vías). Km, % de alta velocidad,
     % electrificado y ancho, con las correcciones del visor (tools/rutas/red.mjs).
   - Cercanías: km del dibujo (shapes.txt) más frecuente de la línea el día de referencia; ancho métrico si al menos el
     80 % de sus estaciones son de las Cercanías métricas del visor; electrificación y prestaciones sin dato.
   Velocidad: km ÷ duración (mediana del día, y la del tren más rápido). */
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().slice(0,5);
const GAUGE_GROUP=v=>['1668','1435','1000','mixed'].includes(v)?v:'unknown';
function viaPorRuta(out,rows,stOut,RED,catalog,shapesFile,WD){
  const S=JSON.parse(fs.readFileSync(path.join(V,'capas','servicios.json'),'utf8'));
  const feat=RED.datos.rail.features,F=RED.F,code=sid=>S.stations[sid]?.official_id;
  // Estaciones de ancho métrico: las de las Cercanías métricas del visor (el catálogo de Renfe no las marca todas).
  const metricSet=new Set(S.variants.filter(v=>v.source==='renfe-commuter').flatMap(v=>v.calls.map(c=>code(c.s))).filter(Boolean));
  const byEnds=new Map();
  for(const v of S.variants){if(!v.edges?.length)continue;const a=code(v.calls[0].s),b=code(v.calls.at(-1).s);if(!a||!b)continue;
    for(const k of [a+'>'+b,b+'>'+a]){if(!byEnds.has(k))byEnds.set(k,[]);byEnds.get(k).push(v);}}
  const stats=edges=>{let km=0;const perf={},el={},g={};
    for(const fid of new Set(edges)){const f=feat[fid];if(!f)continue;const m=(Number(f.properties.length_m)||0)/1000;km+=m;
      const pf=f.properties.perf||'none';perf[pf]=(perf[pf]||0)+m;const e=F.value(f,'electric');el[e]=(el[e]||0)+m;const gg=GAUGE_GROUP(F.value(f,'gauge'));g[gg]=(g[gg]||0)+m;}
    return {km,perf,el,g};};
  // El trazado inferido de servicios.json se calcula parada a parada y deja un hueco en casi cada parada intermedia
  // (la vía por la estación no entra en `edges`): Valladolid–Salamanca perdía 11 km en 12 huecos. Se cierran por la red
  // IGN con el camino más corto entre los extremos sueltos de componentes distintas (Dijkstra, ≤ 6 km y ≤ 2 × la recta
  // + 1,5 km); si la red IGN no da un camino razonable (falta el enlace, p. ej. en los túneles de Barcelona), con la recta
  // hasta 3 km. Lo que no se puede cerrar se cuenta en `sueltos` y deja la ruta como incompleta.
  const GAP_NET=6000,GAP_RECTA=3000,nkey=c=>c[0].toFixed(5)+','+c[1].toFixed(5),graph=new Map();
  feat.forEach((f,i)=>{const c=f.geometry.coordinates,a=nkey(c[0]),b=nkey(c.at(-1)),m=Number(f.properties.length_m)||0;if(a===b)return;
    for(const [x,y] of [[a,b],[b,a]]){if(!graph.has(x))graph.set(x,[]);graph.get(x).push([y,m,i]);}});
  const near=(from,max)=>{const dist=new Map([[from,0]]),prev=new Map(),done=new Set(),q=[[0,from]];
    while(q.length){let bi=0;for(let i=1;i<q.length;i++)if(q[i][0]<q[bi][0])bi=i;const [d,x]=q.splice(bi,1)[0];if(done.has(x))continue;done.add(x);
      for(const [y,m,fid] of graph.get(x)||[]){const nd=d+m;if(nd<=max&&nd<(dist.get(y)??Infinity)){dist.set(y,nd);prev.set(y,[x,fid]);q.push([nd,y]);}}}
    return {dist,prev};};
  const bridge=edges=>{const E=[...new Set(edges)].filter(f=>feat[f]),deg=new Map(),adj=new Map();
    for(const f of E){const c=feat[f].geometry.coordinates,a=nkey(c[0]),b=nkey(c.at(-1));for(const [x,y] of [[a,b],[b,a]]){deg.set(x,(deg.get(x)||0)+1);if(!adj.has(x))adj.set(x,[]);adj.get(x).push(y);}}
    const comp=new Map();let n=0;for(const k of adj.keys()){if(comp.has(k))continue;n++;comp.set(k,n);const st=[k];while(st.length){const x=st.pop();for(const y of adj.get(x))if(!comp.has(y)){comp.set(y,n);st.push(y);}}}
    if(n<2)return {edges:E,recta:0,sueltos:0};
    const leaves=[...deg].filter(([,d])=>d===1).map(([k])=>k),pairs=[],pt=k=>k.split(',').map(Number);
    for(const a of leaves){const {dist,prev}=near(a,GAP_NET);for(const b of leaves){if(comp.get(b)===comp.get(a))continue;
      const recta=metres(pt(a),pt(b)),net=dist.get(b)??Infinity;
      if(net<=2*recta+1500)pairs.push([net,a,b,prev]);else if(recta<=GAP_RECTA)pairs.push([recta,a,b,null]);}}
    pairs.sort((x,y)=>x[0]-y[0]);const par=[...Array(n+1).keys()],fd=x=>par[x]===x?x:(par[x]=fd(par[x])),add=new Set();let recta=0,joined=0;
    for(const [d,a,b,prev] of pairs){const A=fd(comp.get(a)),B=fd(comp.get(b));if(A===B)continue;par[A]=B;joined++;
      if(!prev){recta+=d;continue;}for(let x=b;x!==a;){const [px,fid]=prev.get(x);add.add(fid);x=px;}}
    return {edges:[...E,...add],recta:recta/1000,sueltos:n-1-joined};};
  // Cercanías: el GTFS da un único dibujo por línea (shapes.txt), no por tren. Los km de un tren son la distancia a lo
  // largo de ese dibujo entre su primera y su última parada (cada estación, en el punto del dibujo más cercano).
  const shapes=new Map();
  {const c=columns(unzip(shapesFile).get('shapes.txt')(),['shape_id','shape_pt_lat','shape_pt_lon','shape_pt_sequence']),pts=new Map();
    for(let i=0;i<c.shape_id.length;i++){const id=c.shape_id[i];if(!pts.has(id))pts.set(id,[]);pts.get(id).push([+c.shape_pt_sequence[i],+c.shape_pt_lon[i],+c.shape_pt_lat[i]]);}
    for(const [id,a] of pts){a.sort((x,y)=>x[0]-y[0]);const xy=a.map(p=>[p[1],p[2]]),cum=[0];for(let i=1;i<xy.length;i++)cum.push(cum[i-1]+metres(xy[i-1],xy[i]));shapes.set(id,{xy,cum});}}
  const posCache=new Map(),coordOf=new Map(stOut.map(s=>[s.k,s.c]));
  const posOn=(sh,code)=>{const k=sh+'|'+code;if(posCache.has(k))return posCache.get(k);const S2=shapes.get(sh),c=coordOf.get(code);let b=null,bd=2000;
    if(S2&&c)for(let i=0;i<S2.xy.length;i++){const d=metres(S2.xy[i],c);if(d<bd){bd=d;b=S2.cum[i];}}posCache.set(k,b);return b;};
  const tripKm=t=>{if(!t.shape)return null;const a=posOn(t.shape,t.stops[0]),b=posOn(t.shape,t.stops.at(-1));return a===null||b===null||a===b?null:Math.abs(b-a)/1000;};
  const pct=(x,t)=>t?Math.round(1000*x/t)/10:null,r1=x=>Math.round(x*10)/10,trazas=new Map();
  for(const row of out){
    const src=rows.get(row.id);let via=null;
    if(row.fam==='Cercanías'){
      // Solo los trenes que van de un extremo al otro de la línea (los extremos de la fila): muchos hacen solo un tramo y
      // su dibujo puede ser el de la línea entera (con 3 minutos de viaje saldrían 600 km/h).
      const ends=new Set([stOut[row.o]?.k,stOut[row.d]?.k]);
      const base=src.trains.filter(t=>t.days.has(WD)&&ends.has(t.stops[0])&&ends.has(t.stops.at(-1))&&t.stops[0]!==t.stops.at(-1)),freq=new Map();
      const med=a=>{const x=a.filter(v=>v!==null).sort((p,q)=>p-q);return x.length?x[Math.floor(x.length/2)]:null;};
      const len=med(base.map(tripKm)),d=med(base.map(t=>t.arr-t.dep));
      const met=row.est.filter(i=>metricSet.has(stOut[i].k)).length;
      if(len){via={km:Math.round(len),fuente:'gtfs',ancho:met>=.8*row.est.length?'1000':'1668',tipo:null,av:null,el:null,vel:d?Math.round(len/(d/60)):null,velMax:null};}
    }else{
      const ends=row.o!==null&&row.d!==null?stOut[row.o].k+'>'+stOut[row.d].k:null,cands=byEnds.get(ends)||[];
      const v=cands.find(x=>norm(x.published_brand)===norm(row.marca)&&code(x.calls[0].s)===stOut[row.o].k)||cands.find(x=>norm(x.published_brand)===norm(row.marca))||cands[0];
      const straight=row.o!==null&&row.d!==null&&stOut[row.o].c&&stOut[row.d].c?metres(stOut[row.o].c,stOut[row.d].c)/1000:0;
      const br=v?bridge(v.edges):null,st0=v?stats(br.edges):null;if(st0)st0.km+=br.recta;
      // Trazado inferido incompleto: con tramos pendientes, con huecos sin cerrar o casi tan corto como la línea recta
      // entre los extremos (por vía siempre hay más de un 2 % de rodeo), o que se queda a más de 2 km de un extremo.
      const lejos=c=>{let b=Infinity;if(c)for(const f of br.edges)for(const q of feat[f].geometry.coordinates){const d=metres(c,q);if(d<b)b=d;}return b>2000;};
      const motivo=!v?null:v.pending_segments>0?'tramos pendientes':br.sueltos>0?'huecos en el trazado':st0.km<straight*1.02?'más corto que la línea recta'
        :lejos(stOut[row.o].c)||lejos(stOut[row.d].c)?'el trazado no llega a un extremo':null;
      if(motivo){row.via={km:null,fuente:'ign',incompleto:true,motivo,variante:v.id};continue;}
      if(v){const st=st0,hs=st.perf.hs||0,yes=st.el.yes||0,no=st.el.no||0,unk=st.km-yes-no;
        const gs=Object.entries(st.g).sort((a,b)=>b[1]-a[1]),dom=gs[0]?.[0]||'unknown';
        via={km:Math.round(st.km),fuente:'ign',av:pct(hs,st.km),el:pct(yes,st.km),elSin:pct(unk,st.km),
          ancho:gs.length>1&&gs[1][1]/st.km>=.1?'varios':dom,anchos:Object.fromEntries(gs.map(([k,m])=>[k,pct(m,st.km)])),
          tipo:hs/st.km>=.8?'Alta velocidad':hs/st.km>=.2?'Mixta':'Convencional',
          vel:row.dur?Math.round(st.km/(row.dur/60)):null,velMax:row.durMin?Math.round(st.km/(row.durMin/60)):null,variante:v.id};
        trazas.set(row,new Set(br.edges));}
    }
    row.via=via;
  }
  cordura(out,trazas,feat);
}
/* Controles de cordura sobre `via` ya calculado:
   - ida y vuelta (mismos extremos, misma fuente y marca) con km que difieren más de un 5 %: si los dos trazados
     comparten casi toda la vía (≥ 90 % de los km del más corto) es el mismo recorrido mal medido y los dos quedan
     incompletos; si no, son recorridos distintos de verdad (Ávila → Chamartín por Atocha, la vuelta por Pitis);
   - velocidad media imposible para el tipo de vía (la del tren más rápido): convencional > 160, mixta > 230,
     alta velocidad > 300, Cercanías > 120 km/h, o cualquiera < 10 km/h. */
const VEL_MAX={'Convencional':160,'Mixta':230,'Alta velocidad':300};
function cordura(out,trazas,feat){
  const bad=(row,motivo)=>{row.via={km:null,fuente:row.via.fuente,incompleto:true,motivo,variante:row.via.variante};};
  const idx=new Map(out.map(r=>[[r.src,r.marca,r.o,r.d].join('|'),r]));
  for(const r of out){const w=idx.get([r.src,r.marca,r.d,r.o].join('|'));
    if(!w||r.o>w.o||!r.via?.km||!w.via?.km||r.fam==='Cercanías')continue;
    const a=r.via.km,b=w.via.km;if(Math.abs(a-b)<=.05*Math.min(a,b))continue;
    const ea=trazas.get(r),eb=trazas.get(w);
    const shared=ea&&eb?[...ea].filter(f=>eb.has(f)).reduce((s,f)=>s+(Number(feat[f].properties.length_m)||0),0)/1000:0;
    if(shared>=.9*Math.min(a,b)){bad(r,'ida y vuelta no cuadran');bad(w,'ida y vuelta no cuadran');}
  }
  for(const r of out){const v=r.via;if(!v?.km)continue;const top=r.fam==='Cercanías'?120:VEL_MAX[v.tipo];
    const x=v.velMax??v.vel;if(x!=null&&((top&&x>top)||x<10))bad(r,'velocidad media imposible');}
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
