/* Lectura de GTFS sin dependencias: ZIP (directorio central + inflateRaw de node:zlib) y CSV (RFC 4180).
   Los GTFS de Renfe, iryo y OUIGO usan ZIP sin cifrar con «deflate» o «store». */
import {readFileSync} from 'node:fs';
import {inflateRawSync} from 'node:zlib';

export function unzip(file){
  const b=readFileSync(file),out=new Map();
  let e=b.length-22;while(e>=0&&b.readUInt32LE(e)!==0x06054b50)e--;
  if(e<0)throw new Error('ZIP sin directorio central: '+file);
  const n=b.readUInt16LE(e+10);let p=b.readUInt32LE(e+16);
  for(let i=0;i<n;i++){
    if(b.readUInt32LE(p)!==0x02014b50)throw new Error('ZIP dañado: '+file);
    const method=b.readUInt16LE(p+10),size=b.readUInt32LE(p+20),nl=b.readUInt16LE(p+28),xl=b.readUInt16LE(p+30),cl=b.readUInt16LE(p+32),off=b.readUInt32LE(p+42);
    const name=b.toString('utf8',p+46,p+46+nl).split('/').pop();
    const lnl=b.readUInt16LE(off+26),lxl=b.readUInt16LE(off+28),start=off+30+lnl+lxl,data=b.subarray(start,start+size);
    if(name)out.set(name,()=>method===0?data:inflateRawSync(data));
    p+=46+nl+xl+cl;
  }
  return out;
}

/* CSV (RFC 4180) recorrido fila a fila, sin construir el texto completo de filas que no se usan.
   Quita BOM y espacios de las cabeceras y los valores (algunos GTFS de Renfe los traen). */
function eachRow(buf,fn){
  const s=buf.toString('utf8').replace(/^﻿/,'');let row=[],f='',q=false,head=null;
  const end=()=>{row.push(f);f='';if(row.length>1||row[0]!==''){if(head)fn(row,head);else head=row.map(h=>h.trim());}row=[];};
  for(let i=0;i<s.length;i++){const c=s[i];
    if(q){if(c==='"'){if(s[i+1]==='"'){f+='"';i++;}else q=false;}else f+=c;continue;}
    if(c==='"')q=true;else if(c===','){row.push(f);f='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;end();}
    else f+=c;}
  if(f!==''||row.length)end();
  return head;
}
// Tabla pequeña → array de objetos.
export function csv(buf){
  const out=[];eachRow(buf,(r,h)=>out.push(Object.fromEntries(h.map((k,i)=>[k,(r[i]??'').trim()]))));return out;
}
// Tabla grande → solo las columnas pedidas, como arrays paralelos (stop_times de Cercanías: millones de filas).
export function columns(buf,cols){
  const out=Object.fromEntries(cols.map(c=>[c,[]]));let idx=null;
  eachRow(buf,(r,h)=>{idx??=cols.map(c=>h.indexOf(c));cols.forEach((c,k)=>out[c].push(idx[k]<0?'':(r[idx[k]]??'').trim()));});
  return out;
}

const SMALL=['agency','routes','trips','stops','calendar','calendar_dates'];
export function readGtfs(file){
  const z=unzip(file),g={};
  for(const t of SMALL){const f=z.get(t+'.txt');g[t]=f?csv(f()):[];}
  const st=z.get('stop_times.txt');
  g.stop_times=st?columns(st(),['trip_id','arrival_time','departure_time','stop_id','stop_sequence']):null;
  return g;
}

// «HH:MM:SS» (puede pasar de 24 h) → minutos desde medianoche del día de servicio.
export const minutes=t=>{if(!t)return null;const [h,m]=t.split(':').map(Number);return h*60+m;};
const ymd=s=>Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8));
const iso=d=>new Date(d).toISOString().slice(0,10);

/* Días en que circula cada service_id (calendar + calendar_dates), como conjunto de fechas ISO. */
export function serviceDays(g){
  const out=new Map(),get=id=>{if(!out.has(id))out.set(id,new Set());return out.get(id);};
  const wd=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  for(const c of g.calendar){const s=get(c.service_id);
    for(let d=ymd(c.start_date);d<=ymd(c.end_date);d+=864e5)if(c[wd[new Date(d).getUTCDay()]]==='1')s.add(iso(d));}
  for(const c of g.calendar_dates){const s=get(c.service_id),d=iso(ymd(c.date));if(c.exception_type==='1')s.add(d);else if(c.exception_type==='2')s.delete(d);}
  return out;
}
