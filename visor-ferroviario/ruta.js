/* Buscador de estaciones y rutas (barra superior del atlas).
   Una sola estación: centra el mapa y abre su ficha. Origen y destino: calcula la mejor ruta con los
   servicios vigentes de capas/servicios.json (Renfe AV/LD, Media Distancia, Cercanías métricas y OUIGO).
   Los horarios integrados traen las paradas de cada tren, pero no las horas de paso: la duración es una
   estimación por distancia y tipo de vía, y así se dice en la ficha. */
(function(root){
  'use strict';
  const CFG=root.AtlasConfig||{};
  const CUTOFF='2026-11-16', FUTURE_FROM='2026-12-17';
  // Velocidad comercial media (km/h) por tipo de servicio: [vía de alta velocidad, vía convencional].
  const SPEED={highspeed:[215,110],euromed:[170,115],avant:[165,100],alvia:[180,95],day:[160,90],'md-conventional':[140,75],'commuter-metric':[45,45]};
  const DWELL=2, TRANSFER=20, BIAS=8, WALK_RADIUS=450, CITY_RADIUS=8000, ACCESS_RADIUS=1500, DETOUR=1.18;

  /* ── núcleo: grafo de paradas y cálculo (sin DOM) ──────────── */
  function metres(a,b){const k=Math.cos((a[1]+b[1])/2*Math.PI/180);return Math.hypot((a[0]-b[0])*k,a[1]-b[1])*111320;}
  const current=v=>v.validity&&!(v.validity.to<CUTOFF)&&!(v.validity.from>=FUTURE_FROM);
  const speedOf=v=>SPEED[(v.categories||[]).find(c=>SPEED[c])]||[120,80];
  const gid=(sid,st)=>'c:'+(st?.official_id||sid);
  function minutes(v,km,hsKm){const [vh,vc]=speedOf(v);return (hsKm/vh+(km-hsKm)/vc)*60;}

  function build(services,rail,catalog){
    const groups=new Map(),stationGroup={};
    for(const [sid,st] of Object.entries(services.stations)){
      const key=gid(sid,st);stationGroup[sid]=key;
      if(!groups.has(key))groups.set(key,{key,name:st.name,coords:st.coordinates,sids:[],calls:0,spain:st.spain!==false,code:st.official_id});
      const g=groups.get(key);g.sids.push(sid);
      if(sid.startsWith('renfe-national:')){g.name=st.name;g.coords=st.coordinates;}
    }
    const pairs=new Map(),adj=new Map();
    const link=(a,e)=>{if(!adj.has(a))adj.set(a,[]);adj.get(a).push(e);};
    for(const v of services.variants){
      if(!current(v)||v.calls.length<2)continue;
      // Parte del recorrido por vía de ancho estándar (alta velocidad), según los tramos IGN de la variante.
      let hs=0,all=0;
      for(const fid of v.edges||[]){const p=rail?.[fid]?.properties;if(!p)continue;all+=p.length_m||0;if(p.nominalgauge===1435)hs+=p.length_m||0;}
      const ratio=all?hs/all:0;
      const cum=[0],dwell=v.categories?.includes('commuter-metric')?0:DWELL;
      for(let i=1;i<v.calls.length;i++){
        const a=services.stations[v.calls[i-1].s].coordinates,b=services.stations[v.calls[i].s].coordinates;
        const km=metres(a,b)/1000*DETOUR;
        cum.push(cum[i-1]+minutes(v,km,km*ratio)+(i>1?dwell:0));
      }
      for(const c of v.calls)groups.get(stationGroup[c.s]).calls++;
      for(let i=0;i<v.calls.length-1;i++){
        if(v.calls[i].p)continue;                       // solo bajada: no se puede subir
        const a=stationGroup[v.calls[i].s];
        for(let j=i+1;j<v.calls.length;j++){
          if(v.calls[j].d)continue;                     // solo subida: no se puede bajar
          const b=stationGroup[v.calls[j].s];if(a===b)continue;
          const key=a+'>'+b,cost=cum[j]-cum[i];
          let pair=pairs.get(key);
          if(!pair){pair={a,b,cost,variants:[]};pairs.set(key,pair);link(a,{type:'ride',pair});}
          if(cost<pair.cost)pair.cost=cost;
          pair.variants.push({v,i,j,cost});
        }
      }
    }
    // Transbordos entre estaciones con servicio: a pie si están a menos de 450 m (Atocha AV y Cercanías);
    // en transporte urbano si están en la misma localidad del catálogo Renfe y a menos de 8 km (Chamartín y Atocha).
    const town=new Map((catalog||[]).map(f=>[String(f.properties.CODIGO),String(f.properties.POBLACION||'').trim().toUpperCase()]));
    const served=[...groups.values()].filter(g=>g.calls);
    for(const g of served)g.town=town.get(String(g.code))||null;
    for(let x=0;x<served.length;x++)for(let y=x+1;y<served.length;y++){
      const A=served[x],B=served[y],m=metres(A.coords,B.coords);
      const type=m<=WALK_RADIUS?'walk':m<=CITY_RADIUS&&A.town&&A.town===B.town?'city':null;
      if(!type)continue;
      link(A.key,{type,a:A.key,b:B.key,m});link(B.key,{type,a:B.key,b:A.key,m});
    }
    return {groups,pairs,adj,stationGroup,services,rail};
  }
  const walkMin=m=>m*1.3/75;
  const cityMin=m=>12+m/1000/18*60;      // espera y trayecto urbano puerta a puerta (≈ 18 km/h)
  const linkMin=e=>e.type==='city'?cityMin(e.m):walkMin(e.m);

  function heap(){const a=[];return {push(x){a.push(x);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p][0]<=a[i][0])break;[a[p],a[i]]=[a[i],a[p]];i=p;}},
    pop(){const top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<a.length&&a[l][0]<a[m][0])m=l;if(r<a.length&&a[r][0]<a[m][0])m=r;if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m;}}return top;},get size(){return a.length;}};}

  // sources/targets: [{key, walk:metros hasta la estación}]
  function search(graph,sources,targets){
    const dist=new Map(),prev=new Map(),h=heap();
    const goal=new Map(targets.map(t=>[t.key,t.walk||0]));
    for(const s of sources){const c=walkMin(s.walk||0);if(!(dist.get(s.key)<=c)){dist.set(s.key,c);prev.set(s.key,null);h.push([c,s.key]);}}
    let best=null;
    while(h.size){
      const [d,k]=h.pop();if(d>dist.get(k))continue;
      if(best&&d>=best.cost)break;
      if(goal.has(k)){const total=d+walkMin(goal.get(k));if(!best||total<best.cost)best={cost:total,key:k};}
      for(const e of graph.adj.get(k)||[]){
        const to=e.type==='ride'?e.pair.b:e.b,cost=d+(e.type==='ride'?e.pair.cost+TRANSFER+BIAS:linkMin(e)+3);
        if(!(dist.get(to)<=cost)){dist.set(to,cost);prev.set(to,{edge:e,from:k});h.push([cost,to]);}
      }
    }
    if(!best)return null;
    const steps=[];let k=best.key;
    while(prev.get(k)){const p=prev.get(k);steps.unshift(p.edge);k=p.from;}
    return {steps,start:k,end:best.key};
  }

  /* Trazado de un tramo: camino más corto dentro de los tramos IGN de la variante, parada a parada. */
  const nodeKey=c=>Math.round(c[0]*1e5)+','+Math.round(c[1]*1e5);
  function subgraph(edgeIds,rail){
    const nodes=new Map(),adj=new Map();
    const add=(k,c)=>{if(!nodes.has(k)){nodes.set(k,c);adj.set(k,[]);}};
    for(const fid of edgeIds){
      const f=rail[fid];if(!f)continue;const cs=f.geometry.coordinates;const a=nodeKey(cs[0]),b=nodeKey(cs.at(-1));
      add(a,cs[0]);add(b,cs.at(-1));const len=f.properties.length_m||0;
      adj.get(a).push({to:b,fid,len,fwd:true});adj.get(b).push({to:a,fid,len,fwd:false});
    }
    // Los tramos de una variante no siempre se tocan en sus extremos (cruces a media línea, huecos del IGN):
    // se unen los componentes sueltos por su par de nodos más próximo si distan menos de 3 km.
    const parent=new Map([...nodes.keys()].map(k=>[k,k]));
    const find=k=>{while(parent.get(k)!==k){parent.set(k,parent.get(parent.get(k)));k=parent.get(k);}return k;};
    for(const [k,list] of adj)for(const e of list)parent.set(find(k),find(e.to));
    const comps=new Map();for(const k of nodes.keys()){const r=find(k);if(!comps.has(r))comps.set(r,[]);comps.get(r).push(k);}
    const groups=[...comps.values()];
    // Basta con mirar los extremos sueltos (grado 1) de un lado contra todos los nodos del otro.
    const loose=groups.map(list=>list.filter(k=>adj.get(k).length===1));
    for(let x=0;x<groups.length;x++)for(let y=x+1;y<groups.length;y++){
      let best=null,bm=3000;
      const scan=(from,to)=>{for(const a of from){const pa=nodes.get(a);for(const b of to){const m=metres(pa,nodes.get(b));if(m<bm){bm=m;best=[a,b];}}}};
      scan(loose[x],groups[y]);scan(loose[y],groups[x]);
      if(best){adj.get(best[0]).push({to:best[1],fid:null,len:bm,fwd:true});adj.get(best[1]).push({to:best[0],fid:null,len:bm,fwd:true});}
    }
    return {nodes,adj};
  }
  function nearestNode(g,c){let best=null,bm=Infinity;for(const [k,p] of g.nodes){const m=metres(c,p);if(m<bm){bm=m;best=k;}}return bm<4000?best:null;}
  function shortest(g,from,to){
    if(from===to)return [];
    const dist=new Map([[from,0]]),prev=new Map(),h=heap();h.push([0,from]);
    while(h.size){const [d,k]=h.pop();if(k===to)break;if(d>dist.get(k))continue;
      for(const e of g.adj.get(k)){const c=d+e.len;if(!(dist.get(e.to)<=c)){dist.set(e.to,c);prev.set(e.to,{e,from:k});h.push([c,e.to]);}}}
    if(!prev.has(to))return null;
    const out=[];let k=to;while(k!==from){const p=prev.get(k);out.unshift(p.e);k=p.from;}return out;
  }
  function legTrace(graph,v,i,j){
    const S=graph.services,rail=graph.rail,coords=[];let km=0,hsKm=0,exact=true;
    const stop=n=>S.stations[v.calls[n].s].coordinates;
    if(v.geometry&&S.geometries?.[v.geometry]){
      const line=S.geometries[v.geometry],near=c=>{let b=0,bm=Infinity;line.forEach((p,n)=>{const m=metres(c,p);if(m<bm){bm=m;b=n;}});return b;};
      let a=near(stop(i)),b=near(stop(j));const part=a<=b?line.slice(a,b+1):line.slice(b,a+1).reverse();
      for(let n=1;n<part.length;n++)km+=metres(part[n-1],part[n])/1000;
      return {coords:part,km,hsKm:0,exact:true};
    }
    const g=v.edges?.length?subgraph(v.edges,rail):null;
    for(let n=i;n<j;n++){
      const a=g&&nearestNode(g,stop(n)),b=g&&nearestNode(g,stop(n+1));
      const path=a&&b?shortest(g,a,b):null;
      if(!path){exact=false;const seg=metres(stop(n),stop(n+1))/1000*DETOUR;km+=seg;if(!coords.length)coords.push(stop(n));coords.push(stop(n+1));continue;}
      if(!coords.length)coords.push(g.nodes.get(a));
      for(const e of path){
        if(e.fid===null){coords.push(g.nodes.get(e.to));km+=e.len/1000;continue;}
        const cs=rail[e.fid].geometry.coordinates,seq=e.fwd?cs:[...cs].reverse();
        for(let m=1;m<seq.length;m++)coords.push(seq[m]);
        km+=e.len/1000;if(rail[e.fid].properties.nominalgauge===1435)hsKm+=e.len/1000;
      }
    }
    return {coords,km,hsKm,exact};
  }

  // Producto y color de una variante (misma lógica que las fichas de ruta).
  function product(v){
    const brand=(CFG.brands||[]).find(b=>b.id===v.brand);
    if(brand)return {name:brand.name,color:brand.color};
    const svc=(CFG.services||[]).find(s=>(v.categories||[]).includes(s.id));
    const raw=v.published_brand||'';
    const name=v.categories?.includes('commuter-metric')?'Cercanías '+raw:({AVANT:'Avant','AVANT EXP':'Avant Exprés',AVLO:'Avlo'})[raw]||raw||svc?.name||'Tren';
    return {name,color:svc?.color||'#273a5f'};
  }

  function plan(graph,origin,destination){
    const ends=e=>e.key&&graph.groups.get(e.key)?.calls?[{key:e.key,walk:0}]:
      [...graph.groups.values()].filter(g=>g.calls).map(g=>({key:g.key,walk:metres(e.coords,g.coords)})).filter(x=>x.walk<=ACCESS_RADIUS).sort((a,b)=>a.walk-b.walk).slice(0,4);
    const src=ends(origin),dst=ends(destination);
    if(!src.length)return {error:'origin'};
    if(!dst.length)return {error:'destination'};
    const found=search(graph,src,dst);
    if(!found)return {error:'none'};
    const S=graph.services,legs=[];
    const startWalk=src.find(s=>s.key===found.start)?.walk||0,endWalk=dst.find(s=>s.key===found.end)?.walk||0;
    if(startWalk>30)legs.push({type:'walk',m:startWalk,from:origin.name,to:graph.groups.get(found.start).name,coords:[origin.coords,graph.groups.get(found.start).coords]});
    for(const e of found.steps){
      if(e.type!=='ride'){const a=graph.groups.get(e.a),b=graph.groups.get(e.b);legs.push({type:e.type,m:e.m,town:a.town,from:a.name,to:b.name,coords:[a.coords,b.coords]});continue;}
      const options=[...e.pair.variants].sort((x,y)=>x.cost-y.cost),best=options[0],v=best.v;
      const trace=legTrace(graph,v,best.i,best.j);
      const p=product(v);
      const alts=[...new Set(options.map(o=>product(o.v).name))].filter(n=>n!==p.name);
      const relations=new Set(options.map(o=>o.v.relation)).size;
      const stops=v.calls.slice(best.i+1,best.j).map(c=>S.stations[c.s].name);
      const dwell=v.categories?.includes('commuter-metric')?0:DWELL*stops.length;
      legs.push({type:'ride',variant:v,product:p,alternatives:alts,relations,
        from:S.stations[v.calls[best.i].s].name,to:S.stations[v.calls[best.j].s].name,
        fromCoords:S.stations[v.calls[best.i].s].coordinates,toCoords:S.stations[v.calls[best.j].s].coordinates,
        direction:v.destination,stops,km:trace.km,hsKm:trace.hsKm,exact:trace.exact,coords:trace.coords,
        minutes:minutes(v,trace.km,trace.hsKm)+dwell});
    }
    if(endWalk>30)legs.push({type:'walk',m:endWalk,from:graph.groups.get(found.end).name,to:destination.name,coords:[graph.groups.get(found.end).coords,destination.coords]});
    const rides=legs.filter(l=>l.type==='ride');
    for(const l of legs)if(l.type!=='ride')l.minutes=linkMin(l);
    const transfers=Math.max(0,rides.length-1);
    const total=legs.reduce((a,l)=>a+l.minutes,0)+transfers*TRANSFER;
    return {legs,rides,transfers,minutes:total,km:rides.reduce((a,l)=>a+l.km,0),hsKm:rides.reduce((a,l)=>a+l.hsKm,0),exact:rides.every(l=>l.exact)};
  }
  /* ── horarios reales: capas/horarios.json y búsqueda por conexiones (Connection Scan) ──
     Cada tren se descompone en conexiones parada a parada de un día concreto; se recorren por hora de
     salida y se guarda la llegada más temprana a cada estación. Margen mínimo de 10 min para cambiar de tren. */
  const MIN_CHANGE=10,KEEP_DAYS=3;
  const decode=b=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
  function timetable(h){
    const [y,m,d]=h.meta.start.split('-').map(Number);
    return {h,bits:h.days.map(decode),start:Date.UTC(y,m-1,d),cache:new Map()};
  }
  const dayIndex=(tt,iso)=>Math.round((Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10))-tt.start)/864e5);
  const runs=(tt,cal,k)=>k>=0&&k<tt.bits[cal].length*8&&((tt.bits[cal][k>>3]>>(k&7))&1)===1;
  function inRange(tt,iso){return iso>=tt.h.meta.start&&iso<=tt.h.meta.end;}
  function connections(graph,tt,iso){
    if(tt.cache.has(iso))return tt.cache.get(iso);
    const k=dayIndex(tt,iso),out=[];
    graph.byId??=new Map(graph.services.variants.map(v=>[v.id,v]));
    for(const [vid,trips] of Object.entries(tt.h.trips)){
      const v=graph.byId.get(vid);if(!v)continue;
      const g=v.calls.map(c=>graph.stationGroup[c.s]);
      for(const [t0,p,cal,num] of trips){
        // Trenes del día y, del día anterior, solo lo que circula pasada la medianoche.
        for(const shift of [0,-1440]){
          if(!runs(tt,cal,k+(shift?-1:0)))continue;
          const prof=tt.h.patterns[p],trip={v,t0:t0+shift,prof,num};
          for(let i=0;i<v.calls.length-1;i++){
            const dep=trip.t0+(i?prof[2*i-1]:0),arr=trip.t0+prof[2*i];
            if(dep<0)continue;
            out.push({from:g[i],to:g[i+1],dep,arr,trip,i,board:!v.calls[i].p,alight:!v.calls[i+1].d});
          }
        }
      }
    }
    // OUIGO: trayectos origen-destino del PDF oficial, cada uno como un tren propio con su calendario.
    for(const tr of ouigoTrips(graph,tt)){
      if(!runs(tt,tr.cal,k))continue;
      const v=tr.v,prof=tr.prof,trip={v,t0:tr.t0,prof,num:null};
      for(let i=0;i<v.calls.length-1;i++)
        out.push({from:graph.stationGroup[v.calls[i].s],to:graph.stationGroup[v.calls[i+1].s],dep:tr.t0+(i?prof[2*i-1]:0),arr:tr.t0+prof[2*i],trip,i,board:true,alight:true});
    }
    out.sort((a,b)=>a.dep-b.dep||a.arr-b.arr);
    tt.cache.set(iso,out);
    if(tt.cache.size>KEEP_DAYS)tt.cache.delete(tt.cache.keys().next().value);
    return out;
  }
  function ouigoTrips(graph,tt){
    if(tt.ouigo)return tt.ouigo;
    const S=graph.services;
    // Trazado: tramos IGN de todas las variantes OUIGO del atlas (el camino se busca dentro de ellos).
    const edges=[...new Set(S.variants.filter(v=>v.brand==='ouigo').flatMap(v=>v.edges||[]))];
    tt.ouigo=(tt.h.ouigo||[]).map(([sids,t0,p,cal,assumed],n)=>({t0,cal,prof:tt.h.patterns[p],
      v:{id:'ouigo-pdf:'+n,operator:'OUIGO España',brand:'ouigo',published_brand:'OUIGO',categories:['highspeed'],
        calls:sids.map(s=>({s})),destination:S.stations[sids.at(-1)]?.name,edges,madrid_assumed:Boolean(assumed),pdf:true}}))
      .filter(x=>x.v.calls.every(c=>graph.stationGroup[c.s]));
    return tt.ouigo;
  }
  function scan(graph,conns,src,dst,t0){
    const ready=new Map(),arrive=new Map(),via=new Map(),boarded=new Map();
    const goal=new Map(dst.map(d=>[d.key,walkMin(d.walk||0)]));
    let best=Infinity,bestKey=null;
    const check=g=>{if(goal.has(g)){const a=arrive.get(g)+goal.get(g);if(a<best){best=a;bestKey=g;}}};
    const label=(g,r,a,how)=>{if(ready.get(g)<=r)return false;ready.set(g,r);arrive.set(g,a);via.set(g,how);check(g);return true;};
    const foot=(g,a)=>{for(const e of graph.adj.get(g)||[])if(e.type!=='ride'){const t=a+linkMin(e);label(e.b,t+3,t,{type:e.type,from:g,to:e.b,m:e.m,dep:a,arr:t});}};
    for(const s of src){const t=t0+walkMin(s.walk||0);if(label(s.key,t,t,null))foot(s.key,t);}
    // Primera conexión con salida ≥ t0 (búsqueda binaria).
    let lo=0,hi=conns.length;while(lo<hi){const mid=(lo+hi)>>1;if(conns[mid].dep<t0)lo=mid+1;else hi=mid;}
    for(let n=lo;n<conns.length;n++){
      const c=conns[n];if(c.dep>=best)break;
      let on=boarded.get(c.trip);
      if(!on&&c.board&&ready.get(c.from)<=c.dep){on=c;boarded.set(c.trip,c);}
      if(on&&c.alight&&label(c.to,c.arr+MIN_CHANGE,c.arr,{type:'ride',board:on,exit:c}))foot(c.to,c.arr);
    }
    if(bestKey===null)return null;
    const steps=[];let g=bestKey,guard=0;
    while(via.get(g)&&guard++<40){const w=via.get(g);steps.unshift(w);g=w.type==='ride'?w.board.from:w.from;}
    return {steps,start:g,end:bestKey,arrival:best};
  }
  function ends(graph,e){
    return e.key&&graph.groups.get(e.key)?.calls?[{key:e.key,walk:0}]:
      [...graph.groups.values()].filter(g=>g.calls).map(g=>({key:g.key,walk:metres(e.coords,g.coords)})).filter(x=>x.walk<=ACCESS_RADIUS).sort((a,b)=>a.walk-b.walk).slice(0,4);
  }
  // Hasta `count` opciones: la que llega antes saliendo desde t0 y las siguientes salidas.
  // Si una salida posterior llega a la misma hora, sustituye a la anterior (menos espera).
  function planTimed(graph,tt,origin,destination,iso,t0,count=4){
    const src=ends(graph,origin),dst=ends(graph,destination);
    if(!src.length)return {error:'origin'};
    if(!dst.length)return {error:'destination'};
    if(!inRange(tt,iso))return {error:'range'};
    const conns=connections(graph,tt,iso),found=[];
    let t=t0;
    for(let n=0;n<count+3&&found.length<count;n++){
      const r=scan(graph,conns,src,dst,t);if(!r)break;
      const first=r.steps.find(s=>s.type==='ride');if(!first)break;
      const option=journey(graph,r,src,dst,origin,destination);
      const prev=found.at(-1);
      if(prev&&prev.arr===option.arr)found[found.length-1]=option;else found.push(option);
      t=first.board.dep+1;
    }
    return found.length?{options:found}:{error:'none'};
  }
  const tripTime=(trip,i,kind)=>trip.t0+(i===0?0:kind==='arr'?trip.prof[2*i-2]:(trip.prof[2*i-1]??trip.prof[2*i-2]));
  function journey(graph,r,src,dst,origin,destination){
    const S=graph.services,legs=[];
    const startWalk=src.find(s=>s.key===r.start)?.walk||0,endWalk=dst.find(s=>s.key===r.end)?.walk||0;
    const g=k=>graph.groups.get(k);
    for(const s of r.steps){
      if(s.type!=='ride'){legs.push({type:s.type,m:s.m,town:g(s.from).town,from:g(s.from).name,to:g(s.to).name,coords:[g(s.from).coords,g(s.to).coords],dep:s.dep,arr:s.arr,minutes:s.arr-s.dep});continue;}
      const v=s.board.trip.v,i=s.board.i,j=s.exit.i+1,trip=s.board.trip;
      const trace=legTrace(graph,v,i,j),p=product(v);
      const pair=graph.pairs.get(graph.stationGroup[v.calls[i].s]+'>'+graph.stationGroup[v.calls[j].s]);
      const alts=pair?[...new Set(pair.variants.map(o=>product(o.v).name))].filter(n=>n!==p.name):[];
      const stops=[];for(let k=i+1;k<j;k++)stops.push({name:S.stations[v.calls[k].s].name,time:tripTime(trip,k,'arr'),coords:S.stations[v.calls[k].s].coordinates});
      legs.push({type:'ride',variant:v,product:p,alternatives:alts,number:trip.num,
        from:S.stations[v.calls[i].s].name,to:S.stations[v.calls[j].s].name,
        fromCoords:S.stations[v.calls[i].s].coordinates,toCoords:S.stations[v.calls[j].s].coordinates,
        direction:v.destination,stops,km:trace.km,hsKm:trace.hsKm,exact:trace.exact,coords:trace.coords,
        dep:s.board.dep,arr:s.exit.arr,minutes:s.exit.arr-s.board.dep});
    }
    const firstRide=legs.find(l=>l.type==='ride');
    if(startWalk>30){const w=walkMin(startWalk);legs.unshift({type:'walk',m:startWalk,from:origin.name,to:g(r.start).name,coords:[origin.coords,g(r.start).coords],dep:firstRide.dep-w-3,arr:firstRide.dep-3,minutes:w});}
    if(endWalk>30){const last=legs.at(-1),w=walkMin(endWalk);legs.push({type:'walk',m:endWalk,from:g(r.end).name,to:destination.name,coords:[g(r.end).coords,destination.coords],dep:last.arr,arr:last.arr+w,minutes:w});}
    const rides=legs.filter(l=>l.type==='ride');
    const dep=legs[0].dep,arr=legs.at(-1).arr;
    return {timed:true,legs,rides,transfers:Math.max(0,rides.length-1),dep,arr,minutes:arr-dep,
      km:rides.reduce((a,l)=>a+l.km,0),hsKm:rides.reduce((a,l)=>a+l.hsKm,0),exact:rides.every(l=>l.exact)};
  }
  root.AtlasRouteCore={build,plan,planTimed,timetable,metres,TRANSFER};
  if(typeof document==='undefined')return;

  /* ── interfaz: barra de búsqueda, sugerencias, ficha y trazo ─ */
  const $=s=>document.querySelector(s);
  const number=new Intl.NumberFormat('es-ES');
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9ñ]+/g,' ').trim();
  // El catálogo Renfe viene en mayúsculas: «JEREZ DE LA FRONTERA» → «Jerez de la Frontera».
  const SMALL=new Set(['de','del','la','las','los','el','y','i','en']);
  const title=s=>String(s||'').toLowerCase().replace(/(^|[\s\-\/(.'])(\p{L}+)/gu,(m,a,w,at)=>a+(at&&SMALL.has(w)?w:w[0].toUpperCase()+w.slice(1)));
  let map,dataset,showInfo,onChange,openStation,graph=null,index=[],routeOn=false;
  const sel={origin:null,destination:null,date:null,time:null,pinned:false};
  const fields={origin:null,destination:null};
  let active=null,options=[],cursor=-1;

  function buildIndex(){
    const out=[],byCode=new Map();
    if(graph){
      for(const g of graph.groups.values()){
        if(!g.spain||!g.calls||!CFG.peninsular(g.coords))continue;
        const e={key:g.key,name:g.name,coords:g.coords,served:true,weight:g.calls,code:g.code};
        out.push(e);byCode.set(String(g.code),e);
      }
    }
    for(const f of dataset?.stations.features||[]){
      const p=f.properties,known=byCode.get(String(p.CODIGO));
      const place=[title(p.POBLACION),title(p.PROVINCIA)].filter(Boolean).join(' · ');
      if(known){known.place=place;known.feature=f;known.search=norm(known.name+' '+p.POBLACION);continue;}
      // Un registro del catálogo sin servicio pegado a una estación con servicio es la misma estación: no se repite.
      const c=f.geometry.coordinates;
      if(graph&&out.some(e=>e.served&&metres(e.coords,c)<300))continue;
      out.push({key:'k:'+p.CODIGO,name:title(p.DESCRIPCION),coords:f.geometry.coordinates.slice(0,2),served:false,weight:0,place,feature:f,code:p.CODIGO,search:norm(p.DESCRIPCION+' '+p.POBLACION)});
    }
    for(const e of out){e.search??=norm(e.name+' '+(e.place||''));e.nname=norm(e.name);}
    index=out;
  }
  function suggest(q){
    const query=norm(q);if(query.length<2)return [];
    const words=query.split(' ');
    const scored=[];
    for(const e of index){
      if(!words.every(w=>e.search.includes(w)))continue;
      let s=e.nname.startsWith(query)?0:(' '+e.nname).includes(' '+query)?1:e.nname.includes(query)?2:3;
      scored.push([s,-Math.log1p(e.weight)*.35+s+(e.served?0:1.5),e]);
    }
    return scored.sort((a,b)=>a[1]-b[1]).slice(0,8).map(x=>x[2]);
  }
  function highlight(el,text,q){
    const n=norm(text),query=norm(q),at=query?n.indexOf(query):-1;
    // La normalización conserva la longitud salvo en signos: solo se resalta si cuadra con el original.
    if(at<0||norm(text.slice(at,at+query.length))!==query){el.textContent=text;return;}
    const b=document.createElement('b');b.textContent=text.slice(at,at+query.length);
    el.append(text.slice(0,at),b,text.slice(at+query.length));
  }
  const list=()=>$('#rb-list');
  function closeList(){const ul=list();ul.hidden=true;ul.replaceChildren();options=[];cursor=-1;
    for(const k of ['origin','destination']){fields[k].setAttribute('aria-expanded','false');fields[k].removeAttribute('aria-activedescendant');}}
  function renderList(role){
    const ul=list(),input=fields[role];ul.replaceChildren();active=role;
    ul.dataset.for=role;
    if(!dataset){const li=document.createElement('li');li.className='rb-empty';li.textContent='Preparando el catálogo de estaciones…';ul.append(li);ul.hidden=false;return;}
    options=suggest(input.value);cursor=options.length?0:-1;
    if(!options.length){
      if(norm(input.value).length<2){closeList();return;}
      const li=document.createElement('li');li.className='rb-empty';li.textContent='Sin coincidencias en el catálogo de estaciones peninsulares.';ul.append(li);
    }
    options.forEach((e,n)=>{
      const li=document.createElement('li'),ic=document.createElement('i'),txt=document.createElement('span'),name=document.createElement('span'),meta=document.createElement('small');
      li.id='rb-opt-'+n;li.setAttribute('role','option');li.className='rb-option'+(e.served?'':' unserved');
      ic.className='rb-ico';ic.setAttribute('aria-hidden','true');
      name.className='rb-name';highlight(name,e.name,input.value);
      meta.textContent=[e.place,e.served||!graph?null:'sin servicio integrado'].filter(Boolean).join(' · ')||'Estación';
      txt.append(name,meta);li.append(ic,txt);
      li.addEventListener('pointerdown',ev=>{ev.preventDefault();choose(role,e);});
      ul.append(li);
    });
    ul.hidden=false;input.setAttribute('aria-expanded','true');mark();
  }
  function mark(){
    [...list().querySelectorAll('[role=option]')].forEach((li,n)=>{li.setAttribute('aria-selected',String(n===cursor));if(n===cursor)li.scrollIntoView({block:'nearest'});});
    const input=fields[active];if(!input)return;
    if(cursor>=0)input.setAttribute('aria-activedescendant','rb-opt-'+cursor);else input.removeAttribute('aria-activedescendant');
  }
  function syncBar(){
    const bar=$('#route-bar');
    bar.classList.toggle('has-value',Boolean(fields.origin.value||fields.destination.value));
    for(const k of ['origin','destination'])bar.querySelector('[data-clear="'+k+'"]').hidden=!fields[k].value;
    $('#rb-go').disabled=!(sel.origin||fields.origin.value.trim());
    const h=bar.getBoundingClientRect().height;document.querySelector('main')?.style.setProperty('--rb-h',Math.round(h)+'px');
  }
  function choose(role,entry){
    sel[role]=entry;fields[role].value=entry.name;closeList();syncBar();
    if(sel.origin&&sel.destination)run();
    else focusStation(entry);
  }
  async function focusStation(entry){
    map.flyTo({center:entry.coords,zoom:12,duration:CFG.reducedMotion()?0:1200});
    if(entry.feature)return openStation(entry.feature);
    await Promise.all([root.AtlasCapas.loadServices(),root.AtlasThemes?.prepareConnections(),root.AtlasTransport?.load()]).catch(()=>{});
    const sid=graph?.groups.get(entry.key)?.sids.find(s=>s.startsWith('renfe-national:'))||graph?.groups.get(entry.key)?.sids[0];
    if(sid)root.AtlasCapas.stationInfo(sid);
  }
  let graphRequest=null;
  function ensureGraph(){
    graphRequest??=root.AtlasCapas.loadServices().then(services=>{
      graph=build(services,dataset.rail.features,dataset.stations.features);buildIndex();
      // Las sugerencias abiertas se rehacen con las estaciones que tienen servicio.
      if(active&&!list().hidden&&document.activeElement===fields[active])renderList(active);
      return graph;
    }).catch(e=>{graphRequest=null;throw e;});
    return graphRequest;
  }
  const fmtMin=m=>{m=Math.max(5,Math.round(m/5)*5);const h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+r+' min':''):r+' min';};
  const fmtKm=k=>number.format(Math.round(k))+' km';
  const fmtM=m=>m<1000?number.format(Math.round(m/10)*10)+' m':number.format(Math.round(m/100)/10)+' km';

  /* ── horarios: carga, día y hora de salida ── */
  let tt=null,ttRequest=null,shown=null;
  function ensureTimetable(){
    ttRequest??=fetch('capas/horarios.json').then(r=>{if(!r.ok)throw new Error('horarios');return r.json();})
      .then(h=>tt=timetable(h)).catch(e=>{ttRequest=null;throw e;});
    return ttRequest;
  }
  const pad2=n=>String(n).padStart(2,'0');
  const isoOf=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
  const nextIso=iso=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+1);return isoOf(d);};
  // Hora del día de servicio; los trenes que pasan de medianoche se marcan con «+1».
  const hm=m=>pad2(Math.floor(m/60)%24)+':'+pad2(m%60)+(m>=1440?' (+1)':'');
  const hmInput=m=>pad2(Math.floor(m/60)%24)+':'+pad2(m%60);
  const dayLabel=iso=>{const s=new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});return s[0].toUpperCase()+s.slice(1);};
  const fmtDur=m=>{m=Math.round(m);const h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+pad2(r)+' min':''):r+' min';};
  function defaultWhen(){
    const now=new Date();sel.date??=isoOf(now);
    sel.time??=Math.ceil((now.getHours()*60+now.getMinutes())/5)*5;
  }

  async function run(){
    closeList();
    if(!sel.origin||!sel.destination)return;
    if(sel.origin.key===sel.destination.key){toast('El origen y el destino son la misma estación.');return;}
    const go=$('#rb-go');go.classList.add('busy');go.setAttribute('aria-busy','true');
    try{await ensureGraph();}catch(e){toast('No se han podido cargar los servicios. Reintenta en unos segundos.');go.classList.remove('busy');go.removeAttribute('aria-busy');return;}
    try{await ensureTimetable();}catch{/* sin horarios: queda la estimación */}
    await new Promise(r=>setTimeout(r,0));
    defaultWhen();
    let result=null,note=null;
    if(tt){
      result=planTimed(graph,tt,sel.origin,sel.destination,sel.date,sel.time);
      // Sin trenes desde esa hora: primeras salidas del día siguiente.
      if(result.error==='none'&&!sel.pinned){
        const next=planTimed(graph,tt,sel.origin,sel.destination,nextIso(sel.date),0);
        if(next.options){note='No quedan trenes con horario ese día a partir de las '+hmInput(sel.time)+': primeras salidas del día siguiente.';sel.date=nextIso(sel.date);sel.time=0;result=next;}
      }
    }
    go.classList.remove('busy');go.removeAttribute('aria-busy');
    if(result?.error==='origin'||result?.error==='destination'){clearMap();showError(result.error);onChange?.();return;}
    if(result?.options){shown={timed:true,options:result.options,idx:0,note};render();onChange?.();return;}
    // Respaldo: ruta estimada (fuera del calendario, sin trenes con hora o solo OUIGO).
    const est=plan(graph,sel.origin,sel.destination);
    if(est.error){clearMap();showError(est.error);onChange?.();return;}
    const why=!tt?'No se han podido cargar los horarios.':result?.error==='range'?'El día elegido queda fuera del calendario publicado ('+tt.h.meta.start.split('-').reverse().join('/')+' a '+tt.h.meta.end.split('-').reverse().join('/')+').'
      :'No hay combinación con trenes de horario integrado a partir de esa hora.';
    shown={timed:false,est,note:why+' Se muestra la ruta estimada, sin horas.'};render();onChange?.();
  }
  function render(keep){
    const r=shown.timed?shown.options[shown.idx]:shown.est;
    card(r,keep);draw(r,keep);
  }
  function showError(kind){
    const o=sel.origin.name,d=sel.destination.name;
    const text={origin:o+' no tiene parada de los servicios integrados y no hay ninguna estación con servicio a menos de 1,5 km.',
      destination:d+' no tiene parada de los servicios integrados y no hay ninguna estación con servicio a menos de 1,5 km.',
      none:'No hay combinación posible con los servicios integrados: Renfe (alta velocidad, larga y media distancia), Cercanías de ancho métrico y OUIGO. Faltan las Cercanías de ancho ibérico, iryo y las redes autonómicas.'}[kind];
    shown=null;
    showInfo('Ruta en tren',o+' → '+d,{'Sin ruta':text},{subtitle:'No se ha encontrado conexión',route:true});
  }
  function toast(text){const t=$('#toast');if(!t)return;t.textContent=text;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{t.hidden=true;},4200);}
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};

  // Día y hora de salida + lista de opciones (solo con horarios).
  function whenControls(box){
    const form=el('div','rt-when');
    const day=el('label','rt-field'),dl=el('span',null,'Día'),di=el('input');
    di.type='date';di.value=sel.date;if(tt){di.min=tt.h.meta.start;di.max=tt.h.meta.end;}
    di.addEventListener('change',()=>{if(!di.value)return;sel.date=di.value;sel.pinned=true;run().then(()=>sel.pinned=false);});
    day.append(dl,di);
    const time=el('label','rt-field'),tl=el('span',null,'Salir desde'),ti=el('input');
    ti.type='time';ti.step=300;ti.value=hmInput(sel.time);
    ti.addEventListener('change',()=>{if(!ti.value)return;const [h,m]=ti.value.split(':').map(Number);sel.time=h*60+m;sel.pinned=true;run().then(()=>sel.pinned=false);});
    time.append(tl,ti);
    form.append(day,time);box.append(form);
  }
  function optionList(box){
    const wrap=el('div','rt-options');wrap.setAttribute('role','group');wrap.setAttribute('aria-label','Opciones de salida');
    shown.options.forEach((o,n)=>{
      const b=el('button','rt-option');b.type='button';b.setAttribute('aria-pressed',String(n===shown.idx));b.dataset.idx=n;
      const times=el('span','rt-times',hm(o.dep)+' → '+hm(o.arr));
      const meta=el('span','rt-meta',fmtDur(o.minutes)+' · '+(o.transfers?o.transfers+(o.transfers===1?' transbordo':' transbordos'):'directo'));
      const prods=el('span','rt-prods');
      for(const p of [...new Map(o.rides.map(l=>[l.product.name,l.product])).values()]){const c=el('i','rt-dot');c.style.setProperty('--c',p.color);c.title=p.name;prods.append(c,document.createTextNode(p.name+' '));}
      b.append(times,meta,prods);
      b.addEventListener('click',()=>{if(shown.idx===n)return;shown.idx=n;render(true);onChange?.();});
      wrap.append(b);
    });
    box.append(wrap);
  }

  function card(r,keep){
    const timed=Boolean(r.timed);
    const box=el('div','route-card');
    if(shown?.note){const n=el('p','notice-text route-flag',shown.note);box.append(n);}
    if(timed||tt){whenControls(box);}
    if(timed&&shown.options.length>1)optionList(box);
    const ol=el('ol','itinerary');
    const stop=(cls,name,note)=>{const li=el('li','it-stop '+cls),n=el('i','it-node');n.setAttribute('aria-hidden','true');
      const t=el('div');t.append(el('strong',null,name),el('small',null,note));li.append(n,t);ol.append(li);};
    const first=r.legs[0],last=r.legs.at(-1);
    stop('origin',first.from,timed?'Salida '+hm(first.dep):'Salida');
    r.legs.forEach((l,n)=>{
      const li=el('li');
      if(l.type!=='ride'){
        li.className='it-walk';
        const s=el('small',null,l.type==='city'?'Cambio de estación'+(l.town?' en '+title(l.town):'')+' · '+fmtKm(l.m/1000)+' en transporte urbano (Cercanías, metro o autobús) · ≈ '+fmtMin(l.minutes)
          :'A pie hasta '+l.to+' · '+fmtM(l.m)+' · ≈ '+fmtMin(l.minutes));
        li.append(el('i'),s);ol.append(li);
      } else {
        li.className='it-leg';li.style.setProperty('--c',l.product.color);
        const rail=el('i','it-rail');rail.setAttribute('aria-hidden','true');
        const body=el('div'),head=el('p','it-head');
        head.append(el('span','it-chip',l.product.name),el('span',null,(l.number?'Tren '+l.number+' · ':'')+'dirección '+l.direction));
        const meta=el('small',null,[l.stops.length?l.stops.length+(l.stops.length===1?' parada intermedia':' paradas intermedias'):'Sin paradas intermedias',
          (l.exact?'':'≈ ')+fmtKm(l.km),timed?fmtDur(l.minutes):'≈ '+fmtMin(l.minutes)].join(' · '));
        body.append(head,meta);
        if(l.variant.madrid_assumed)body.append(el('small',null,'Estación de Madrid asignada por corredor: el horario de OUIGO solo dice «Madrid».'));
        if(l.alternatives.length){body.append(el('small','it-alt','También directo: '+l.alternatives.join(', ')));}
        if(l.stops.length){const d=el('details','it-stops'),ul=el('ol');d.append(el('summary',null,'Ver paradas'));
          for(const s of l.stops)ul.append(el('li',null,(s.time!==undefined?hm(s.time)+' · ':'')+(s.name||s)));d.append(ul);body.append(d);}
        li.append(rail,body);ol.append(li);
      }
      const next=r.legs[n+1];if(!next)return;
      const rodeBefore=r.legs.slice(0,n+1).some(x=>x.type==='ride');
      let note;
      if(timed){
        const nextRide=r.legs.slice(n+1).find(x=>x.type==='ride');
        if(l.type==='ride'&&next.type==='ride')note='Llega '+hm(l.arr)+' · sale '+hm(next.dep)+' (espera '+fmtDur(next.dep-l.arr)+')';
        else if(l.type==='ride')note='Llega '+hm(l.arr)+' · cambio de estación';
        else note=nextRide?'Sale '+hm(nextRide.dep):'';
      } else note=l.type==='ride'?(next.type==='ride'?'Transbordo · margen de '+TRANSFER+' min':'Bajada y cambio de estación'):rodeBefore?'Transbordo · margen de '+TRANSFER+' min':'Subida al tren';
      stop('transfer',l.to,note);
    });
    stop('dest',last.to,timed?'Llegada '+hm(last.arr):'Llegada');
    const slot=el('div','profile-slot');
    box.append(slot,ol);
    profileFor(r,slot);
    box.append(el('p','muted route-note',timed
      ?'Horas de los GTFS oficiales de Renfe ('+Object.values(tt.h.meta.sources).join('; ')+'), con al menos '+10+' min para cambiar de tren. Los cambios de estación por la ciudad son estimados. '+
        (r.exact?'Kilómetros sobre el trazado inferido en la red IGN.':'Algún tramo sin trazado verificable: sus kilómetros se aproximan en línea recta.')+' OUIGO: horario del PDF oficial 2026-2027 (válido hasta el 14-06-2027), por trayecto y con sus días; sin trenes Madrid–Andalucía hasta el 29-11-2026 por el aviso de suspensión. No incluye iryo, Cercanías de ancho ibérico ni redes autonómicas. Consulta el horario del operador antes de viajar.'
      :'Mejor combinación con los servicios vigentes integrados en el atlas: Renfe (alta velocidad, larga y media distancia), Cercanías de ancho métrico y OUIGO. '+
        'La duración es una estimación por distancia y tipo de vía, con '+TRANSFER+' min de margen por transbordo. '+
        (r.exact?'Los kilómetros se miden sobre el trazado inferido en la red IGN.':'Algún tramo no tiene trazado verificable: sus kilómetros se aproximan en línea recta.')+' No incluye Cercanías de ancho ibérico, iryo ni redes autonómicas.'));
    const operators=[...new Set(r.rides.map(l=>l.variant.operator))];
    const city=r.legs.find(l=>l.type==='city');
    const pct=r.km?Math.round(r.hsKm/r.km*100):0;
    const subtitle=timed?dayLabel(sel.date)+' · '+(r.rides.length===1?'un solo tren':r.rides.length+' trenes')+' · '+operators.join(' y ')
      :(r.rides.length===1?'Un solo tren':r.rides.length+' trenes')+(city?' · cambio de estación'+(city.town?' en '+title(city.town):''):'')+' · '+operators.join(' y ');
    const facts=timed
      ?[{value:hm(r.dep),label:'salida'},{value:hm(r.arr),label:'llegada'},{value:fmtDur(r.minutes),label:r.transfers?r.transfers+(r.transfers===1?' transbordo':' transbordos'):'directo'}]
      :[{value:'≈ '+fmtMin(r.minutes),label:'duración estimada'},{value:(r.exact?'':'≈ ')+fmtKm(r.km),label:pct?pct+' % por alta velocidad':'por vía convencional'},{value:String(r.transfers),label:r.transfers===1?'transbordo':'transbordos'}];
    const info=$('#info'),scroll=keep?info.scrollTop:0;
    showInfo('Ruta en tren',sel.origin.name+' → '+sel.destination.name,{},{subtitle,
      chips:timed?[]:[...new Map(r.rides.map(l=>[l.product.name,l.product])).values()].map(p=>({label:p.name,color:p.color})),
      facts,extra:box,route:true,keepFocus:keep});
    if(keep){info.scrollTop=scroll;info.querySelector('.rt-option[aria-pressed="true"]')?.focus({preventScroll:true});}
  }

  /* ── perfil de elevación (perfil.js): tramos en tren; los cambios de estación cuentan distancia sin dibujarse ── */
  function profileFor(r,slot){
    if(!window.AtlasProfile)return;
    const S=graph.services;
    const parts=r.legs.map(l=>({coords:l.coords,gap:l.type!=='ride'}));
    const marks=[];
    const first=r.legs[0],last=r.legs.at(-1);
    marks.push({name:first.from,c:first.type==='ride'?first.fromCoords:first.coords[0],major:true});
    r.rides.forEach((l,k)=>{
      if(k>0)marks.push({name:l.from,c:l.fromCoords,major:true});
      for(const s of l.stops){const name=s.name||s,c=s.coords||S.stations[l.variant.calls.find(x=>S.stations[x.s].name===name)?.s]?.coordinates;if(c)marks.push({name,c,major:false});}
      if(k<r.rides.length-1)marks.push({name:l.to,c:l.toCoords,major:true});
    });
    marks.push({name:last.to,c:last.type==='ride'?last.toCoords:last.coords.at(-1),major:true});
    AtlasProfile.forRoute(map,parts,marks,{title:'Perfil del recorrido'}).then(block=>{
      if(block&&slot.isConnected)slot.replaceWith(block);
    }).catch(error=>console.warn(error));
  }

  /* ── trazo en el mapa ── */
  function ensureLayers(){
    if(map.getSource('route'))return;
    map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    // Velo: con una ruta activa, el resto del mapa queda en segundo plano.
    map.addSource('route-veil',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-30,20],[30,20],[30,60],[-30,60],[-30,20]]]}}});
    map.addLayer({id:'route-veil',type:'fill',source:'route-veil',layout:{visibility:'none'},paint:{'fill-color':'#f5f7fa','fill-opacity':.62}});
    map.addLayer({id:'route-casing',type:'line',source:'route',filter:['==',['get','kind'],'ride'],layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':'#fbfbfb','line-width':['interpolate',['linear'],['zoom'],5,7,10,11,14,15],'line-opacity':.95}});
    map.addLayer({id:'route-line',type:'line',source:'route',filter:['==',['get','kind'],'ride'],layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':['get','color'],'line-width':['interpolate',['linear'],['zoom'],5,3.6,10,6,14,9]}});
    map.addLayer({id:'route-walk',type:'line',source:'route',filter:['in',['get','kind'],['literal',['walk','city']]],layout:{'line-cap':'round'},
      paint:{'line-color':'#1d2638','line-width':3,'line-dasharray':[.2,1.8]}});
    map.addLayer({id:'route-stops',type:'circle',source:'route',filter:['==',['geometry-type'],'Point'],paint:{
      // Origen: anillo; destino: punto lleno (como en la barra y en el itinerario); transbordo: anillo menor.
      'circle-radius':['interpolate',['linear'],['zoom'],5,['match',['get','role'],'stop',2.2,'transfer',5.5,6.5],10,['match',['get','role'],'stop',4,'transfer',6.5,8]],
      'circle-color':['match',['get','role'],'dest','#1d2638','#fbfbfb'],
      'circle-stroke-color':['match',['get','role'],'stop',['get','color'],'dest','#fbfbfb','#1d2638'],
      'circle-stroke-width':['match',['get','role'],'stop',1.6,3],'circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
    map.addLayer({id:'route-labels',type:'symbol',source:'route',filter:['all',['==',['geometry-type'],'Point'],['!=',['get','role'],'stop']],layout:{
      'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':13,'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':1.1,'text-padding':2,'text-allow-overlap':false},
      paint:{'text-color':'#1d2638','text-halo-color':'#fbfbfb','text-halo-width':2.2}});
  }
  function draw(r){
    ensureLayers();
    const features=[];
    for(const l of r.legs)features.push({type:'Feature',geometry:{type:'LineString',coordinates:l.coords},properties:{kind:l.type,color:l.product?.color||'#1d2638'}});
    const S=graph.services;
    for(const l of r.rides)for(const s of l.stops){
      const name=s.name||s,c=s.coords||S.stations[l.variant.calls.find(x=>S.stations[x.s].name===name)?.s]?.coordinates;
      if(c)features.push(pt(c,'stop',name,l.product.color));
    }
    const first=r.legs[0],last=r.legs.at(-1),seen=new Set();
    features.push(pt(first.type==='ride'?first.fromCoords:first.coords[0],'origin',first.from));
    // Transbordos: bajada de cada tren y subida al siguiente (en un cambio de estación son dos puntos).
    r.rides.forEach((l,k)=>{
      if(k>0&&!seen.has(l.from)){seen.add(l.from);features.push(pt(l.fromCoords,'transfer',l.from));}
      if(k<r.rides.length-1&&!seen.has(l.to)){seen.add(l.to);features.push(pt(l.toCoords,'transfer',l.to));}
    });
    features.push(pt(last.type==='ride'?last.toCoords:last.coords.at(-1),'dest',last.to));
    map.getSource('route').setData({type:'FeatureCollection',features});
    map.setLayoutProperty('route-veil','visibility','visible');
    routeOn=true;
    const all=r.legs.flatMap(l=>l.coords);
    const lons=all.map(p=>p[0]),lats=all.map(p=>p[1]);
    const pad=CFG.phoneLandscape()?{top:64,bottom:16,left:16,right:Math.round(Math.min(360,window.innerWidth*.48))}:
      CFG.compact()?{top:Math.round((document.querySelector('main').style.getPropertyValue('--rb-h').replace('px','')|0)+24),bottom:Math.round($('#info').hidden?window.innerHeight*.5:$('#info').getBoundingClientRect().height+28),left:24,right:24}:
      {top:110,bottom:Math.max(60,($('#legend')?.offsetHeight||0)+70),left:($('#rail')?.parentElement===$('#tools')?0:84)+($('#tools').hidden?60:356),right:400};
    // En pantallas estrechas, a zoom bajo, los límites del mapa impiden desplazar la ruta por encima de la ficha:
    // se amplían mientras la ruta está en pantalla y se recuperan al cerrarla.
    if(CFG.compact()){savedBounds??=map.getMaxBounds();map.setMaxBounds([[-40,10],[35,65]]);}
    map.fitBounds([[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]],{padding:pad,maxZoom:12,duration:CFG.reducedMotion()?0:900});
  }
  let savedBounds=null;
  const pt=(c,role,name,color)=>({type:'Feature',geometry:{type:'Point',coordinates:c},properties:{role,name,color:color||'#1d2638'}});
  function clearMap(){
    window.AtlasProfile?.clear();
    if(!routeOn)return;routeOn=false;
    map?.getSource('route')?.setData({type:'FeatureCollection',features:[]});
    if(map?.getLayer('route-veil'))map.setLayoutProperty('route-veil','visibility','none');
    if(savedBounds){map.setMaxBounds(savedBounds);savedBounds=null;}
    onChange?.();
  }

  /* ── teclado y eventos de la barra ── */
  function wire(role){
    const input=fields[role];
    input.addEventListener('focus',()=>{ensureGraph().catch(()=>{});if(input.value&&!sel[role])renderList(role);});
    input.addEventListener('input',()=>{sel[role]=null;syncBar();renderList(role);});
    input.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==input&&active===role)closeList();},120));
    input.addEventListener('keydown',ev=>{
      const open=!list().hidden&&active===role&&options.length;
      if(ev.key==='ArrowDown'){ev.preventDefault();if(!open)renderList(role);else{cursor=(cursor+1)%options.length;mark();}}
      else if(ev.key==='ArrowUp'&&open){ev.preventDefault();cursor=(cursor-1+options.length)%options.length;mark();}
      else if(ev.key==='Enter'){
        ev.preventDefault();
        if(open&&cursor>=0){choose(role,options[cursor]);if(role==='origin'&&!sel.destination&&!CFG.compact())fields.destination.focus();}
        else if(sel.origin&&sel.destination)run();
      }
      else if(ev.key==='Escape'&&open){ev.preventDefault();ev.stopPropagation();closeList();}
      else if(ev.key==='Tab'&&open&&cursor>=0&&input.value&&!sel[role]){sel[role]=options[cursor];input.value=options[cursor].name;closeList();syncBar();}
    });
  }
  function init(o){
    ({map,dataset,showInfo,onChange,openStation}=o);
    fields.origin=$('#rb-origin');fields.destination=$('#rb-destination');
    if(!fields.origin)return;
    buildIndex();
    wire('origin');wire('destination');
    $('#route-bar').addEventListener('submit',ev=>{
      ev.preventDefault();
      for(const role of ['origin','destination'])if(!sel[role]&&fields[role].value.trim()){const s=suggest(fields[role].value)[0];if(s){sel[role]=s;fields[role].value=s.name;}}
      syncBar();
      if(sel.origin&&sel.destination)run();else if(sel.origin)focusStation(sel.origin);else if(sel.destination)focusStation(sel.destination);
    });
    $('#rb-swap').addEventListener('click',()=>{
      [sel.origin,sel.destination]=[sel.destination,sel.origin];
      [fields.origin.value,fields.destination.value]=[fields.destination.value,fields.origin.value];
      syncBar();if(sel.origin&&sel.destination)run();
    });
    for(const b of document.querySelectorAll('#route-bar [data-clear]'))b.addEventListener('click',()=>{
      const role=b.dataset.clear;sel[role]=null;fields[role].value='';closeList();syncBar();
      if(routeOn){clearMap();if(!$('#info').hidden&&$('#info').dataset.route)$('#close').click();}
      fields[role].focus();onChange?.();
    });
    if('ResizeObserver' in root)new ResizeObserver(syncBar).observe($('#route-bar'));
    syncBar();
  }
  function state(){if(!(sel.origin&&sel.destination&&routeOn))return undefined;return sel.origin.key+'>'+sel.destination.key+(shown?.timed?'@'+sel.date+'T'+hmInput(sel.time):'');}
  async function restore(value){
    if(typeof value!=='string'||!value.includes('>'))return;
    try{await ensureGraph();}catch{return;}
    const [pair,when]=value.split('@'),[a,b]=pair.split('>'),find=k=>index.find(e=>e.key===k);
    const m=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(when||'');
    if(m){sel.date=m[1];sel.time=+m[2]*60+ +m[3];sel.pinned=true;}
    const o=find(a),d=find(b);if(!o||!d)return;
    sel.origin=o;sel.destination=d;fields.origin.value=o.name;fields.destination.value=d.name;syncBar();
    await run();sel.pinned=false;
  }
  root.AtlasRoute={init,clearMap,state,restore,active:()=>routeOn};
})(typeof window!=='undefined'?window:globalThis);
