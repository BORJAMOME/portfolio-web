/* Cabina · cálculo de la oferta de trenes de toda la red (sin DOM).
   Usa las reglas de oferta.js (AtlasOffer.core): mismos días de referencia, mismo calendario y misma forma de unir
   los trayectos OUIGO del PDF en trenes. Así una estación tiene en Cabina las mismas cifras que en su ficha del visor. */
(function(root){
  'use strict';
  const FAMILY={  // servicio del visor (capas-config.js) → familia de la nueva arquitectura de marcas de Renfe
    highspeed:'Alta velocidad comercial',euromed:'Alta velocidad comercial',avant:'Avant',
    alvia:'Intercity',day:'Intercity','md-conventional':'Regional','commuter-metric':'Cercanías de ancho métrico'};
  const FAMILY_ORDER=['Alta velocidad comercial','Avant','Intercity','Regional','Cercanías de ancho métrico'];

  function serviceOf(v,CFG){
    if(v.brand==='ouigo')return 'highspeed';
    return CFG.services.find(s=>v.categories?.includes(s.id))?.id||v.categories?.[0]||'day';
  }
  const operatorOf=v=>v.brand==='ouigo'?'OUIGO':v.operator==='Renfe Viajeros'?'Renfe':v.operator;

  /* Trenes que circulan un día k (índice desde el inicio del calendario).
     Renfe: un viaje del GTFS = un tren. OUIGO: el PDF da trayectos origen-destino; los que comparten estación y hora
     de salida son el mismo tren (componentes conexas), como hace stationDay en oferta.js. */
  function trainsOn(D,k,CFG,detail){
    const {runs,at}=D.core;
    const out={trains:0,hours:detail?new Array(24).fill(0):null,family:detail?new Map():null,operator:detail?new Map():null};
    const add=(hour,fam,op)=>{out.trains++;if(!detail)return;out.hours[Math.floor(hour/60)%24]++;
      out.family.set(fam,(out.family.get(fam)||0)+1);out.operator.set(op,(out.operator.get(op)||0)+1);};
    const pdf=[];
    for(const r of D.runsList){
      const v=r.v;
      for(const [t0,p,cal] of r.trips){
        if(!runs(D,cal,k))continue;
        if(v.pdf){pdf.push({v,t0,p});continue;}
        add(t0,FAMILY[serviceOf(v,CFG)]||'Intercity',operatorOf(v));
      }
    }
    const parent=pdf.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i])),seen=new Map();
    pdf.forEach((x,i)=>{const n=x.v.calls.length;
      x.v.calls.forEach((c,j)=>{const t=at(D.h.patterns[x.p],x.t0,j,n);if(t.dep===null)return;
        const key=D.gid(c.s)+'@'+t.dep;if(seen.has(key))parent[find(i)]=find(seen.get(key));else seen.set(key,i);});});
    const first=new Map();
    pdf.forEach((x,i)=>{const r=find(i);first.set(r,Math.min(first.get(r)??Infinity,x.t0));});
    for(const t0 of first.values())add(t0,'Alta velocidad comercial','OUIGO');
    return out;
  }

  /* Serie diaria de todo el calendario y media por semana (lunes a domingo). */
  function calendar(D,CFG){
    const days=Math.round((Date.UTC(+D.h.meta.end.slice(0,4),+D.h.meta.end.slice(5,7)-1,+D.h.meta.end.slice(8,10))-D.start)/864e5)+1;
    // Renfe: viajes agrupados por calendario (mismo resultado que trainsOn, sin recorrer 22.000 viajes cada día).
    const byCal=new Map(),ouigo={...D,runsList:D.runsList.filter(r=>r.v.pdf)};
    for(const r of D.runsList)if(!r.v.pdf){const src=r.v.source==='renfe-commuter'?'commuter':'national';
      for(const [,,cal] of r.trips){const key=src+':'+cal;byCal.set(key,(byCal.get(key)||0)+1);}}
    const daily=[],last={national:null,commuter:null,ouigo:null};
    for(let k=0;k<days;k++){const iso=new Date(D.start+k*864e5).toISOString().slice(0,10),n={national:0,commuter:0};
      for(const [key,c] of byCal){const [src,cal]=key.split(':');if(D.core.runs(D,+cal,k))n[src]+=c;}
      const o=trainsOn(ouigo,k,CFG,false).trains;
      daily.push({iso,trains:n.national+n.commuter+o,renfe:n.national+n.commuter,ouigo:o,national:n.national,commuter:n.commuter});}
    // Fin de cobertura de cada fuente: último día con al menos el 10 % de su máximo (ignora viajes sueltos aislados,
    // p. ej. 4 trenes el último día del fichero tras meses vacíos).
    for(const src of ['national','commuter','ouigo']){const max=Math.max(...daily.map(d=>d[src]));
      for(const d of daily)if(max&&d[src]>=max*.1)last[src]=d.iso;}
    const weeks=new Map();
    for(const d of daily){const dt=new Date(d.iso+'T00:00:00Z'),mon=new Date(+dt-((dt.getUTCDay()+6)%7)*864e5).toISOString().slice(0,10);
      const w=weeks.get(mon)||{week:mon,renfe:0,ouigo:0,n:0};w.renfe+=d.renfe;w.ouigo+=d.ouigo;w.n++;weeks.set(mon,w);}
    return {daily,last,weekly:[...weeks.values()].filter(w=>w.n===7).map(w=>({week:w.week,renfe:Math.round(w.renfe/7),ouigo:Math.round(w.ouigo/7)}))};
  }

  /* Ranking de estaciones (grupo con el mismo código oficial) en un día. */
  function stations(D,iso){
    const {stationDay,groups}=D.core;
    return groups(D).map(g=>({key:g.key,sid:g.sid,name:g.name,coords:g.coords,day:stationDay(D,g.sid,iso)}))
      .filter(g=>g.day.trains).sort((a,b)=>b.day.trains-a.day.trains);
  }

  /* Población y transporte con tren cerca: mismas distancias que las fichas (áreas 15 km, capitales 5 km, puertos y aeropuertos 15 km). */
  function near(list,coord,radius,metres){
    return list.filter(s=>metres(coord,s.coords)<=radius);
  }
  // Igual que AtlasOffer.forArea: estaciones con tren en el radio, paradas y destinos sin transbordo (sin contar las propias).
  function coverage(units,ranked,radius,metres){
    return units.map(u=>{const st=near(ranked,u.coord,radius,metres),dests=new Set(st.flatMap(s=>s.day.dests.map(([d])=>d)));
      for(const s of st)dests.delete(s.name);
      return {...u,stations:st.length,trains:st.reduce((a,s)=>a+s.day.trains,0),dests:dests.size};});
  }
  /* Competencia en alta velocidad por estación: trenes Renfe de alta velocidad (AVE, Avlo, AVE Euromed) frente a OUIGO.
     OUIGO sale de stationDay (trayectos del PDF unidos en trenes); Renfe, de los viajes del GTFS con parada ese día. */
  function competition(D,ranked,k,CFG){
    const {runs}=D.core,out=[];
    for(const s of ranked){
      const ouigo=s.day.ops.find(([o])=>o==='OUIGO')?.[1]||0;if(!ouigo)continue;
      const by={AVE:0,AVLO:0,'AVE Euromed':0};
      for(const {r} of D.byGroup.get(s.key)||[]){const v=r.v;if(v.pdf)continue;
        const svc=serviceOf(v,CFG);if(svc!=='highspeed'&&svc!=='euromed')continue;
        const name=by[v.published_brand]!==undefined?v.published_brand:'AVE';
        by[name]+=r.trips.filter(([,,cal])=>runs(D,cal,k)).length;}
      out.push({name:s.name,sid:s.sid,ave:by.AVE+by['AVE Euromed'],avlo:by.AVLO,ouigo});
    }
    return out.sort((a,b)=>(b.ave+b.avlo+b.ouigo)-(a.ave+a.avlo+a.ouigo));
  }
  function nearestStation(points,ranked,radius,metres){
    return points.map(p=>{let best=null,bm=radius;
      for(const s of ranked){const m=metres(p.coord,s.coords);if(m<=bm){bm=m;best=s;}}
      return {...p,station:best?best.name:null,metres:best?Math.round(bm):null,trains:best?best.day.trains:0};});
  }

  const api={FAMILY,FAMILY_ORDER,serviceOf,operatorOf,trainsOn,calendar,stations,coverage,competition,nearestStation};
  if(typeof module!=='undefined')module.exports=api;
  root.CabinaDatos=api;
})(typeof window==='undefined'?globalThis:window);
