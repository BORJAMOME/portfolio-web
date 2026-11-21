#!/usr/bin/env node
/* Incidencias por ruta a partir del tiempo real de Renfe (GTFS-RT, CC BY 4.0 · Origen de los datos: Renfe Operadora).

     node tools/rutas/incidencias.mjs captura          una captura de trip_updates (AV/LD/MD y Cercanías); cada 5 min
     node tools/rutas/incidencias.mjs cierre           cierra los días ya terminados y regenera capas/incidencias.json
     node tools/rutas/incidencias.mjs agrega           solo regenera capas/incidencias.json

   Qué se mide (por tren y día de circulación, con el GTFS estático de ESE día; nunca con el de hoy para días pasados):
   · programado: viaje del GTFS activo ese día, sin los que quedan dentro de un corte de tools/rutas/cortes.json (sup);
   · visto: ≥ 2 capturas SCHEDULED entre 3 h antes de la salida y 6 h después de la llegada;
   · cancelado: ≥ 2 capturas CANCELED en esa ventana y ninguna SCHEDULED después de la hora de salida;
   · contradictorio: CANCELED (≥ 2) y también SCHEDULED con retraso después de salir. Cuenta como visto: el tren circuló.
     Renfe publica a menudo el mismo viaje como CANCELED y SCHEDULED a la vez durante todo el día (su trip_id vale para varios
     días y el feed no dice a qué fecha se refiere la cancelación), así que un CANCELED solo es fiable si el tren no se ve;
   · retraso: el último retraso informado mientras se ve el tren (≥ 5 y ≥ 15 min). Es el último dato del feed, no
     necesariamente la llegada;
   · sin dato: el resto. NO es un tren cancelado: el feed de Renfe solo informa de una parte de los trenes (≈ 60 % en
     AV/LD/MD; los números 3xxxx casi nunca salen). Por eso las incidencias nunca se calculan como «previsto − visto».
   Un día cuenta para un feed solo si tiene ≥ 90 % de las capturas esperadas entre las 04:00 y las 24:00 y ningún hueco de más
   de 30 min; una captura
   sin ningún tren SCHEDULED (el feed a veces solo trae cancelados durante horas) no cuenta como captura.

   Estado de trabajo (no versionado): .cache/rt/ (prog-AAAA-MM-DD.json, obs-AAAA-MM-DD.json). En GitHub Actions se conserva
   entre ejecuciones con actions/cache. Salida versionada: visor-ferroviario/capas/incidencias/AAAA-MM.json (un vector por ruta
   y día) y visor-ferroviario/capas/incidencias.json (agregados de 1, 7, 30 y 365 días que lee la tabla de rutas). */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readGtfs,serviceDays,minutes} from './gtfs.mjs';
import {SOURCES,BRAND,afectaCorte} from '../build-rutas.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const STATE=path.join(ROOT,'.cache','rt'),V=path.join(ROOT,'visor-ferroviario','capas'),OUTDIR=path.join(V,'incidencias');
const FEEDS={ld:'https://gtfsrt.renfe.com/trip_updates_LD.json',cer:'https://gtfsrt.renfe.com/trip_updates.json'};
const STATIC={ld:SOURCES.renfe.url,cer:SOURCES.cercanias.url};
const UA={'user-agent':'borjamora.es visor ferroviario (portfolio)'};
// Validez de un día: capturas entre las 04:00 y las 24:00 (el programa del día no existe hasta que Renfe regenera el estático,
// hacia las 02:00 en invierno y las 03:00 en verano; se crea a partir de las 03:30).
const TZ='Europe/Madrid',DESDE_MIN=240,ESPERADAS=(1440-DESDE_MIN)/5,MIN_CAPTURAS=Math.ceil(ESPERADAS*.9),MAX_HUECO=30,ANTES=180,DESPUES=360,PROG_DESDE=210;
// Vector diario por ruta: [programados, vistos (contradictorios incluidos), cancelados, contradictorios, retraso ≥ 5 min,
// retraso ≥ 15 min, suprimidos por corte]
export const CAMPOS=['prog','vistos','canc','contra','ret5','ret15','sup'];

/* ── fechas en hora peninsular ── */
const parts=ms=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
  .formatToParts(new Date(ms)).map(p=>[p.type,p.value]));
export const localDay=ms=>{const p=parts(ms);return p.year+'-'+p.month+'-'+p.day;};
export const localMin=ms=>{const p=parts(ms);return +p.hour*60+ +p.minute;};
// Instante (ms) de «día D a los m minutos» en hora peninsular (m puede pasar de 1440: trenes que cruzan la medianoche).
export function epochOf(day,m){const [y,mo,d]=day.split('-').map(Number);let t=Date.UTC(y,mo-1,d)+m*60e3;
  for(let i=0;i<2;i++){const p=parts(t),shown=Date.UTC(+p.year,+p.month-1,+p.day)+(+p.hour*60+ +p.minute)*60e3,want=Date.UTC(y,mo-1,d)+m*60e3;t+=want-shown;}return t;}
const addDays=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const readJson=(f,def)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return def;}};
const writeJson=(f,o)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(o)+'\n');};

/* ── programa del día: cada viaje con su ruta (mismo id que rutas.json), salida y llegada ── */
async function fetchTo(url,file){const r=await fetch(url,{headers:UA});if(!r.ok)throw new Error('HTTP '+r.status+' en '+url);
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));}
export function programa(day,gtfs,stations,cortes){
  // gtfs = {ld, cer} ya leídos con readGtfs; stations = Map código → {ca, pr}; cortes = lista de cortes.json
  const out={};
  for(const [feed,g] of Object.entries(gtfs)){
    const days=serviceDays(g),route=new Map(g.routes.map(r=>[r.route_id,r])),calls=new Map(),st=g.stop_times;
    for(let i=0;i<st.trip_id.length;i++){let a=calls.get(st.trip_id[i]);if(!a)calls.set(st.trip_id[i],a=[]);
      a.push([+st.stop_sequence[i],st.stop_id[i],minutes(st.arrival_time[i]),minutes(st.departure_time[i])]);}
    for(const t of g.trips){
      if(!days.get(t.service_id)?.has(day))continue;
      const r=route.get(t.route_id),c=calls.get(t.trip_id);if(!r||!c||c.length<2)continue;
      if(feed==='cer'&&r.route_type==='3')continue;   // autobuses de sustitución
      c.sort((a,b)=>a[0]-b[0]);
      const stops=c.map(x=>x[1]),dep=c[0][3]??c[0][2],arr=c.at(-1)[2]??c.at(-1)[3];
      const marca=feed==='ld'?(BRAND[r.route_short_name.trim().toUpperCase()]||r.route_short_name.trim()):r.route_short_name;
      const id=feed==='ld'?['renfe',marca,stops[0],stops.at(-1)].join('|'):'cer|'+r.route_id.slice(0,2)+'|'+r.route_short_name;
      const sup=feed==='ld'&&cortes.some(k=>day>=k.desde&&(!k.hasta||day<=k.hasta)&&afectaCorte(k.regla,{stops,marca},stations));
      out[t.trip_id]={f:feed,r:id,dep,arr,...(sup?{sup:1}:{})};
    }
  }
  return out;
}
async function asegurarPrograma(day){
  const f=path.join(STATE,'prog-'+day+'.json');if(fs.existsSync(f))return readJson(f);
  const tmp=path.join(STATE,'gtfs');const g={};
  for(const k of ['ld','cer']){const z=path.join(tmp,k+'.zip');await fetchTo(STATIC[k],z);g[k]=readGtfs(z);}
  const R=readJson(path.join(V,'rutas.json'),{estaciones:[]});
  const stations=new Map(R.estaciones.map(s=>[s.k,s]));
  const cortes=readJson(path.join(ROOT,'tools','rutas','cortes.json'),{cortes:[]}).cortes;
  const p={dia:day,generado:new Date().toISOString(),trenes:programa(day,g,stations,cortes)};
  writeJson(f,p);return p;
}

/* ── una captura ── */
export function anotar(obs,prog,feed,json,ts){
  // obs: {capturas:{ld:[minutos], cer:[minutos]}, t:{tripId:[sched, canc, schedTrasSalida, último retraso, máximo]}}
  const ents=json.entity||[];
  if(!ents.some(e=>e.tripUpdate?.trip?.scheduleRelationship!=='CANCELED'))return false;   // feed degradado: no cuenta
  (obs.capturas[feed]??=[]).push(localMin(ts));
  const seen=new Set();
  // El mismo viaje puede venir dos veces en una captura, cancelado (TUCANCEL_) y en circulación (TUUPDATE_): cuentan las dos.
  for(const e of ents){const tu=e.tripUpdate;if(!tu)continue;const id=tu.trip?.tripId,k=id+'|'+tu.trip.scheduleRelationship;if(!id||seen.has(k))continue;seen.add(k);
    const p=prog.trenes[id];if(!p||p.f!==feed)continue;
    const dep=epochOf(prog.dia,p.dep),arr=epochOf(prog.dia,p.arr);
    if(ts<dep-ANTES*60e3||ts>arr+DESPUES*60e3)continue;
    const x=obs.t[id]??=[0,0,0,null,null];
    if(tu.trip.scheduleRelationship==='CANCELED'){x[1]++;continue;}
    x[0]++;const d=tu.delay??tu.stopTimeUpdate?.[0]?.arrival?.delay??tu.stopTimeUpdate?.[0]?.departure?.delay;
    // Retrasos de más de 6 h o adelantos de más de 30 min son errores del feed (hay valores de −11.220 s): no se usan.
    if(ts>=dep){x[2]++;if(Number.isFinite(+d)&&+d<=21600&&+d>=-1800){x[3]=+d;x[4]=Math.max(x[4]??-Infinity,+d);}}
  }
  return true;
}
async function captura(){
  const ts=Date.now(),hoy=localDay(ts),ayer=addDays(hoy,-1);
  const progs=[];for(const d of [ayer,hoy]){const f=path.join(STATE,'prog-'+d+'.json');
    if(d===hoy&&!fs.existsSync(f)&&localMin(ts)<PROG_DESDE){continue;}   // Renfe aún puede no haber regenerado el estático
    if(fs.existsSync(f)||d===hoy)progs.push(await asegurarPrograma(d));}
  const res={};
  for(const [feed,url] of Object.entries(FEEDS)){
    let json;try{const r=await fetch(url,{headers:UA});if(!r.ok)throw new Error('HTTP '+r.status);json=await r.json();}
    catch(e){res[feed]='error '+e.message;continue;}
    for(const p of progs){const f=path.join(STATE,'obs-'+p.dia+'.json'),obs=readJson(f,{dia:p.dia,capturas:{},t:{}});
      // La captura cuenta para el día del programa solo si cae en ese día (hora peninsular); los viajes que cruzan la
      // medianoche se siguen anotando en su día de circulación.
      const ok=anotar(obs,p,feed,json,ts);if(ok&&localDay(ts)!==p.dia)obs.capturas[feed].pop();
      writeJson(f,obs);res[feed]=(res[feed]?res[feed]+' · ':'')+p.dia+(ok?' ok':' sin trenes SCHEDULED');}
  }
  console.log(new Date(ts).toISOString(),JSON.stringify(res));
}

/* ── cierre de un día: vector por ruta ── */
export function validez(caps){
  const m=[...new Set(caps||[])].filter(x=>x>=DESDE_MIN).sort((a,b)=>a-b);if(m.length<MIN_CAPTURAS)return {n:m.length,valido:false};
  let hueco=m[0]-DESDE_MIN;for(let i=1;i<m.length;i++)hueco=Math.max(hueco,m[i]-m[i-1]);hueco=Math.max(hueco,1440-m.at(-1));
  return {n:m.length,hueco,valido:hueco<=MAX_HUECO};
}
export function cerrarDia(prog,obs){
  const rutas={};
  for(const [id,p] of Object.entries(prog.trenes)){const v=rutas[p.r]??=[0,0,0,0,0,0,0];
    if(p.sup){v[6]++;continue;}
    v[0]++;const x=obs.t[id];if(!x)continue;
    const [s,c,sa,last]=x;
    if(c>=2&&sa===0)v[2]++;
    else if(s>=2){v[1]++;if(c>=2)v[3]++;if(last!=null){if(last>=300)v[4]++;if(last>=900)v[5]++;}}
  }
  return {validez:{ld:validez(obs.capturas.ld),cer:validez(obs.capturas.cer)},rutas};
}
function cierre(){
  const hoy=localDay(Date.now());let n=0;
  for(const f of fs.existsSync(STATE)?fs.readdirSync(STATE).filter(x=>/^prog-\d{4}-\d\d-\d\d\.json$/.test(x)).sort():[]){
    const day=f.slice(5,15);
    // Un día se cierra cuando ya no pueden llegar datos suyos: al día siguiente, pasadas las 07:00 (los trenes nocturnos llegan
    // antes y la ventana de 6 h tras la llegada ha terminado).
    if(day>=hoy||(day===addDays(hoy,-1)&&localMin(Date.now())<420))continue;
    const prog=readJson(path.join(STATE,f)),obs=readJson(path.join(STATE,'obs-'+day+'.json'),{capturas:{},t:{}});
    const mf=path.join(OUTDIR,day.slice(0,7)+'.json'),M=readJson(mf,{campos:CAMPOS,dias:{}});
    M.dias[day]=cerrarDia(prog,obs);M.dias=Object.fromEntries(Object.entries(M.dias).sort());writeJson(mf,M);
    fs.rmSync(path.join(STATE,f));fs.rmSync(path.join(STATE,'obs-'+day+'.json'),{force:true});n++;
    console.log('Cerrado',day,JSON.stringify(M.dias[day].validez));
  }
  if(!n)console.log('Ningún día por cerrar');
  agrega();
}

/* ── agregados para la tabla ── */
export function agregar(meses){
  const dias={};for(const M of meses)Object.assign(dias,M.dias);
  const lista=Object.keys(dias).sort();if(!lista.length)return null;
  const ult=lista.at(-1),PER={d1:1,d7:7,d30:30,d365:365},rutas={},cobertura={};
  for(const [k,n] of Object.entries(PER)){const desde=addDays(ult,1-n);
    for(const day of lista){if(day<desde)continue;const D=dias[day];
      for(const [id,v] of Object.entries(D.rutas)){const feed=id.startsWith('cer|')?'cer':'ld';if(!D.validez[feed]?.valido)continue;
        const a=(rutas[id]??={})[k]??={dias:0,v:[0,0,0,0,0,0,0]};a.dias++;v.forEach((x,i)=>a.v[i]+=x);}
      for(const feed of ['ld','cer']){const c=(cobertura[feed]??={})[k]??={dias:0,validos:0};c.dias++;if(D.validez[feed]?.valido)c.validos++;}}}
  return {primero:lista[0],ultimo:ult,cobertura,rutas};
}
function agrega(){
  const meses=fs.existsSync(OUTDIR)?fs.readdirSync(OUTDIR).filter(f=>/^\d{4}-\d\d\.json$/.test(f)).sort().slice(-13).map(f=>readJson(path.join(OUTDIR,f))):[];
  const a=agregar(meses);
  const out={version:1,generado_con:'tools/rutas/incidencias.mjs',campos:CAMPOS,
    fuente:{label:'Renfe · GTFS-RT trip_updates (AV/LD/MD y Cercanías)',licence:'CC BY 4.0 · Origen de los datos: Renfe Operadora',urls:Object.values(FEEDS)},
    definiciones:{visto:'≥ 2 capturas en circulación entre 3 h antes de la salida y 6 h después de la llegada',cancelado:'≥ 2 capturas CANCELED y ninguna en circulación después de salir',
      contradictorio:'marcado como cancelado y visto en circulación después de salir; cuenta como visto (el feed no dice a qué fecha se refiere la cancelación)',retraso:'último retraso informado mientras se ve el tren',
      sin_dato:'programado y nunca visto: el feed solo informa de una parte de los trenes; no es una cancelación',
      dia_valido:'≥ '+MIN_CAPTURAS+' de las '+ESPERADAS+' capturas esperadas entre las 04:00 y las 24:00 y ningún hueco de más de '+MAX_HUECO+' min'},
    sin_tiempo_real:['iryo','ouigo'],...(a||{primero:null,ultimo:null,cobertura:{},rutas:{}})};
  writeJson(path.join(V,'incidencias.json'),out);
  console.log('Escrito visor-ferroviario/capas/incidencias.json ·',a?a.primero+' – '+a.ultimo+' · '+Object.keys(a.rutas).length+' rutas':'sin días cerrados');
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const cmd=process.argv[2];
  if(cmd==='captura')await captura();
  else if(cmd==='cierre')cierre();
  else if(cmd==='agrega')agrega();
  else{console.error('Uso: incidencias.mjs captura | cierre | agrega');process.exit(2);}
}
