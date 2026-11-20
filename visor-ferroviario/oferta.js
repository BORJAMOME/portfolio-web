/* Oferta de trenes a partir de los horarios integrados (capas/horarios.json + capas/servicios.json).
   Cifras para las fichas: trenes al día en una estación, primer y último tren, trenes por hora, destinos
   directos y operadores; horario de una ruta; trenes por un tramo. Cuenta solo lo integrado en el atlas:
   Renfe (AV, larga y media distancia, Cercanías de ancho métrico) y OUIGO. Sin iryo ni Cercanías de ancho ibérico. */
(function(root){
  'use strict';
  const nf=new Intl.NumberFormat('es-ES');
  const pad=n=>String(n).padStart(2,'0');
  const hm=m=>pad(Math.floor(m/60)%24)+':'+pad(m%60);
  const decode=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
  const SCOPE='Horarios integrados: Renfe (alta velocidad, larga y media distancia, Cercanías de ancho métrico) y OUIGO. No incluye iryo ni Cercanías de ancho ibérico.';
  let ready=null;

  function load(){
    ready??=Promise.all([root.AtlasCapas.loadServices(),fetch('capas/horarios.json').then(r=>{if(!r.ok)throw new Error('horarios');return r.json();})])
      .then(([S,h])=>build(S,h)).catch(e=>{ready=null;throw e;});
    return ready;
  }
  function build(S,h){
    const [y,m,d]=h.meta.start.split('-').map(Number);
    const bits=h.days.map(decode),start=Date.UTC(y,m-1,d);
    const gid=sid=>'c:'+(S.stations[sid]?.official_id||sid);
    const byId=new Map(S.variants.map(v=>[v.id,v]));
    // Recorridos: [variante (o pseudovariante OUIGO), trenes [t0, patrón, calendario, número]]
    const runsList=[];
    for(const [vid,trips] of Object.entries(h.trips)){const v=byId.get(vid);if(v)runsList.push({v,trips});}
    (h.ouigo||[]).forEach(([sids,t0,p,cal],n)=>runsList.push({v:{id:'ouigo-pdf:'+n,operator:'OUIGO España',brand:'ouigo',published_brand:'OUIGO',pdf:true,calls:sids.map(s=>({s})),edges:null},trips:[[t0,p,cal,null]]}));
    const byGroup=new Map();
    for(const r of runsList)r.v.calls.forEach((c,i)=>{const g=gid(c.s);if(!byGroup.has(g))byGroup.set(g,[]);byGroup.get(g).push({r,i});});
    return {S,h,bits,start,gid,byId,runsList,byGroup};
  }
  const dayIndex=(D,iso)=>Math.round((Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))-D.start)/864e5);
  const runs=(D,cal,k)=>k>=0&&k<D.bits[cal].length*8&&((D.bits[cal][k>>3]>>(k&7))&1)===1;
  const at=(prof,t0,i,n)=>({arr:i?t0+prof[2*i-2]:null,dep:i<n-1?t0+(i?prof[2*i-1]:0):null});

  /* Días de referencia: miércoles, sábado y domingo de la semana actual (o la primera del calendario). */
  function refDays(D){
    const iso=x=>x.toISOString().slice(0,10);
    let base=new Date();base=new Date(Date.UTC(base.getFullYear(),base.getMonth(),base.getDate()));
    const first=new Date(D.start),last=Date.UTC(+D.h.meta.end.slice(0,4),+D.h.meta.end.slice(5,7)-1,+D.h.meta.end.slice(8,10));
    if(base<first)base=first;if(+base>last-7*864e5)base=new Date(last-7*864e5);
    const mon=new Date(+base-((base.getUTCDay()+6)%7)*864e5);
    const day=n=>{const x=new Date(+mon+n*864e5);return x<first?new Date(+x+7*864e5):x;};
    return {weekday:iso(day(2)),saturday:iso(day(5)),sunday:iso(day(6))};
  }
  const label=iso=>{const s=new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});return s;};

  /* Estación (grupo de paradas con el mismo código oficial): trenes con parada en un día. */
  function stationDay(D,sid,iso){
    const g=D.gid(sid),k=dayIndex(D,iso);
    const hours=new Array(24).fill(0),ops=new Map(),dests=new Map();
    let trains=0,first=null,last=null;
    // Cada «tren» es {arr, dep, op, destinos}. OUIGO viene por trayectos origen-destino y un mismo tren aparece en
    // varios: se unen los que comparten hora de llegada o de salida en esta estación (componentes conexas).
    const list=[],ouigo=[];
    for(const {r,i} of D.byGroup.get(g)||[]){
      const v=r.v,n=v.calls.length;
      for(const [t0,p,cal] of r.trips){
        if(!runs(D,cal,k))continue;
        const t=at(D.h.patterns[p],t0,i,n),to=new Set();
        if(t.dep!==null&&!v.calls[i].p)for(let j=i+1;j<n;j++){if(v.calls[j].d)continue;const name=D.S.stations[v.calls[j].s]?.name;if(name&&D.gid(v.calls[j].s)!==g)to.add(name);}
        const op=v.brand==='ouigo'?'OUIGO':v.operator==='Renfe Viajeros'?'Renfe':v.operator;
        (v.pdf?ouigo:list).push({arr:t.arr,dep:t.dep,op,to,board:t.dep!==null&&!v.calls[i].p});
      }
    }
    const parent=ouigo.map((_,n)=>n),find=n=>parent[n]===n?n:(parent[n]=find(parent[n]));
    const byKey=new Map();
    ouigo.forEach((x,n)=>{for(const key of [x.arr!==null&&'a'+x.arr,x.dep!==null&&'d'+x.dep].filter(Boolean)){if(byKey.has(key))parent[find(n)]=find(byKey.get(key));else byKey.set(key,n);}});
    const merged=new Map();
    ouigo.forEach((x,n)=>{const r=find(n),m=merged.get(r)||{arr:null,dep:null,op:x.op,to:new Set(),board:false};
      if(x.arr!==null)m.arr=x.arr;if(x.dep!==null)m.dep=x.dep;x.to.forEach(d=>m.to.add(d));m.board||=x.board;merged.set(r,m);});
    for(const t of [...list,...merged.values()]){
      const when=t.dep??t.arr;
      trains++;hours[Math.floor(when/60)%24]++;ops.set(t.op,(ops.get(t.op)||0)+1);
      if(t.board)first=first===null?t.dep:Math.min(first,t.dep);
      for(const d of t.to)dests.set(d,(dests.get(d)||0)+1);
      last=last===null?when:Math.max(last,when);
    }
    return {iso,trains,first,last,hours,ops:[...ops].sort((a,b)=>b[1]-a[1]),dests:[...dests].sort((a,b)=>b[1]-a[1])};
  }
  /* Ruta (variante): salidas del origen y tiempos de un tren tipo. */
  function variantDay(D,vid,iso){
    const k=dayIndex(D,iso),trips=(D.h.trips[vid]||[]).filter(([,,cal])=>runs(D,cal,k)).sort((a,b)=>a[0]-b[0]);
    return {iso,trips:trips.map(([t0,p,,num])=>({t0,prof:D.h.patterns[p],num}))};
  }
  /* Tramo IGN: trenes de las variantes que lo usan, por producto. */
  function edgeDay(D,fid,iso){
    const k=dayIndex(D,iso),by=new Map();let trains=0;
    for(const r of D.runsList){
      if(!r.v.edges?.includes(fid))continue;
      const n=r.trips.filter(([,,cal])=>runs(D,cal,k)).length;if(!n)continue;
      trains+=n;const name=r.v.published_brand||r.v.operator;by.set(name,(by.get(name)||0)+n);
    }
    return {iso,trains,by:[...by].sort((a,b)=>b[1]-a[1])};
  }

  /* ── piezas de la ficha ── */
  const SVGNS='http://www.w3.org/2000/svg';
  function svg(name,attrs={}){const e=document.createElementNS(SVGNS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;}
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  // Trenes por hora (0-23 h) en barras; texto equivalente para lectores de pantalla.
  function hourChart(hours){
    const W=280,H=78,L=2,B=16,bw=(W-L*2)/24,max=Math.max(1,...hours);
    const s=svg('svg',{viewBox:`0 0 ${W} ${H}`,class:'of-hours',role:'img'});
    const peak=hours.indexOf(max);
    s.setAttribute('aria-label','Trenes por hora: máximo de '+max+' entre las '+peak+' y las '+(peak+1)+' h');
    hours.forEach((n,h)=>{const bh=n?Math.max(2,(H-B-4)*n/max):0;
      const r=svg('rect',{x:(L+h*bw+1).toFixed(1),y:(H-B-bh).toFixed(1),width:(bw-2).toFixed(1),height:bh.toFixed(1),class:h===peak?'of-bar peak':'of-bar'});
      const t=svg('title');t.textContent=h+'–'+(h+1)+' h: '+n+(n===1?' tren':' trenes');r.append(t);s.append(r);});
    for(const h of [0,6,12,18,23]){const t=svg('text',{x:(L+h*bw+bw/2).toFixed(1),y:H-3,'text-anchor':'middle',class:'of-tick'});t.textContent=h+'h';s.append(t);}
    s.append(svg('line',{x1:L,x2:W-L,y1:H-B+.5,y2:H-B+.5,class:'of-axis'}));
    return s;
  }
  function section(title){const box=el('section','offer');box.append(el('h3',null,title));return box;}
  function note(text){return el('p','muted offer-note',text);}

  /* API para las fichas. Cada función devuelve {facts, sentence, block} o null si no hay datos. */
  async function forStation(sid){
    const D=await load(),days=refDays(D);
    const wd=stationDay(D,sid,days.weekday),sa=stationDay(D,sid,days.saturday),su=stationDay(D,sid,days.sunday);
    if(!wd.trains&&!sa.trains&&!su.trains)return null;
    const box=section('Trenes que paran aquí');
    const sentence=wd.trains?nf.format(wd.trains)+(wd.trains===1?' tren para':' trenes paran')+' aquí el '+label(days.weekday)+(wd.first!==null?'; el primero sale a las '+hm(wd.first)+' y el último pasa a las '+hm(wd.last)+'.':'.')
      :'Sin trenes el '+label(days.weekday)+'; '+nf.format(sa.trains)+' el sábado y '+nf.format(su.trains)+' el domingo.';
    box.append(el('p','offer-lead',sentence));
    if(wd.trains){box.append(el('p','offer-sub','Trenes por hora, '+label(days.weekday)));box.append(hourChart(wd.hours));}
    const dl=el('dl','offer-list');
    const row=(k,v)=>{if(!v)return;dl.append(el('dt',null,k),el('dd',null,v));};
    row('Fin de semana',nf.format(sa.trains)+' el sábado · '+nf.format(su.trains)+' el domingo');
    if(wd.ops.length>1)row('Por operador',wd.ops.map(([o,n])=>o+' '+Math.round(n/wd.trains*100)+' %').join(' · '));
    if(wd.dests.length)row('Destinos directos más servidos',wd.dests.slice(0,6).map(([d,n])=>d+' ('+n+')').join(' · ')+(wd.dests.length>6?' · y '+(wd.dests.length-6)+' más':''));
    box.append(dl,note(SCOPE+' Un tren cuenta una vez aunque pare y siga; los que pasan sin parar no cuentan.'));
    return {sentence,block:box,facts:[{value:nf.format(wd.trains),label:'trenes un día laborable'},
      ...(wd.first!==null?[{value:hm(wd.first)+'–'+hm(wd.last),label:'primero y último'}]:[]),
      {value:nf.format(wd.dests.length),label:'destinos directos'}]};
  }
  async function forVariant(v){
    const D=await load(),days=refDays(D);
    let day=variantDay(D,v.id,days.weekday);
    if(!day.trips.length)day=[days.saturday,days.sunday].map(x=>variantDay(D,v.id,x)).find(x=>x.trips.length)||day;
    if(!day.trips.length)return null;
    const box=section('Horario');
    const deps=day.trips.map(t=>hm(t.t0));
    const dur=day.trips.map(t=>t.prof.at(-1)).sort((a,b)=>a-b),mid=dur[Math.floor(dur.length/2)];
    box.append(el('p','offer-lead',nf.format(day.trips.length)+(day.trips.length===1?' tren hace':' trenes hacen')+' exactamente estas paradas el '+label(day.iso)+'. Salidas: '+deps.join(', ')+'.'+(v.variant_count>1?' Hay más trenes entre el mismo origen y destino con otras paradas: elígelos en la ficha de una estación.':'')));
    // Tren tipo: el primero del día, con hora en cada parada.
    const t=day.trips[0],n=v.calls.length,ol=el('ol','offer-stops');
    v.calls.forEach((c,i)=>{const x=at(t.prof,t.t0,i,n),time=x.dep??x.arr;const li=el('li');
      li.append(el('span','of-time',hm(time)),el('span',null,D.S.stations[c.s]?.name||''));ol.append(li);});
    const d=el('details','offer-detail');d.append(el('summary',null,'Paradas y horas del tren '+(t.num?t.num+' ':'')+'de las '+hm(t.t0)),ol);
    box.append(d,note('Horario del GTFS oficial de '+(v.operator||'el operador')+'. '+(day.iso===days.weekday?'Día laborable de referencia.':'Esta ruta no circula el miércoles de referencia: se muestra el fin de semana.')));
    return {block:box,duration:mid,trains:day.trips.length,iso:day.iso};
  }
  async function forEdge(fid){
    const D=await load(),days=refDays(D),wd=edgeDay(D,fid,days.weekday);
    return wd.trains?{trains:wd.trains,by:wd.by,label:label(days.weekday)}:null;
  }
  /* ── cercanía: estaciones con servicio en un radio y tramos IGN junto a un punto ── */
  function metres(a,b){const k=Math.cos((a[1]+b[1])/2*Math.PI/180);return Math.hypot((a[0]-b[0])*k,a[1]-b[1])*111320;}
  function groups(D){
    if(D.groups)return D.groups;
    const out=new Map();
    for(const [sid,st] of Object.entries(D.S.stations)){
      const g=D.gid(sid);if(!D.byGroup.has(g))continue;
      const x=out.get(g);
      if(!x||sid.startsWith('renfe-national:'))out.set(g,{key:g,sid,name:st.name,coords:st.coordinates});
    }
    return D.groups=[...out.values()];
  }
  // Estaciones con al menos un tren el día laborable de referencia, a menos de `radius` metros.
  async function near(coord,radius){
    const D=await load(),days=refDays(D);
    const list=groups(D).map(g=>({...g,m:metres(coord,g.coords)})).filter(g=>g.m<=radius)
      .map(g=>({...g,day:stationDay(D,g.sid,days.weekday)})).filter(g=>g.day.trains).sort((a,b)=>a.m-b.m);
    return {list,label:label(days.weekday)};
  }
  async function forArea(coord,radius,place){
    const {list,label:day}=await near(coord,radius);
    const box=section('Tren');
    if(!list.length){box.append(el('p','offer-lead','Ninguna estación con trenes de los horarios integrados a menos de '+nf.format(radius/1000)+' km de '+place+'.'),note(SCOPE));return {block:box,facts:[]};}
    const stops=list.reduce((a,g)=>a+g.day.trains,0),dests=new Set(list.flatMap(g=>g.day.dests.map(([d])=>d)));
    for(const g of list)dests.delete(g.name);
    box.append(el('p','offer-lead',nf.format(list.length)+(list.length===1?' estación':' estaciones')+' con servicio a menos de '+nf.format(radius/1000)+' km de '+place+': '+nf.format(stops)+' paradas de tren el '+day+' y '+nf.format(dests.size)+' destinos sin transbordo.'));
    const dl=el('dl','offer-list');
    for(const g of list.slice(0,6)){dl.append(el('dt',null,g.name+' · a '+(g.m<1000?nf.format(Math.round(g.m/10)*10)+' m':nf.format(Math.round(g.m/100)/10)+' km')),el('dd',null,nf.format(g.day.trains)+' trenes'+(g.day.first!==null?' · '+hm(g.day.first)+'–'+hm(g.day.last):'')));}
    box.append(dl,note(SCOPE+' Distancias en línea recta. Un tren que para en dos estaciones de la zona cuenta dos paradas.'));
    return {block:box,facts:[{value:nf.format(list.length),label:list.length===1?'estación con trenes':'estaciones con trenes'},{value:nf.format(stops),label:'paradas de tren al día'}]};
  }
  // Estación con servicio más cercana (puertos y aeropuertos).
  async function nearest(coord,radius){const {list,label:day}=await near(coord,radius);return list[0]?{...list[0],label:day}:null;}
  // Tramo IGN de ancho estándar más próximo a un punto (≤ 150 m, la misma regla que la capa de corredores).
  function nearestEdge(features,coord,max=150,filter=()=>true){
    let best=null,bm=max;
    features.forEach((f,fid)=>{
      if(!filter(f.properties))return;
      for(const c of f.geometry.coordinates){if(Math.abs(c[0]-coord[0])>0.01||Math.abs(c[1]-coord[1])>0.01)continue;const m=metres(c,coord);if(m<bm){bm=m;best=fid;}}
    });
    return best;
  }
  const dur=m=>{m=Math.round(m);const h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+pad(r)+' min':''):r+' min';};
  root.AtlasOffer={load,forStation,forVariant,forEdge,forArea,nearest,nearestEdge,SCOPE,hm,dur};
})(window);
