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
  root.AtlasRouteCore={build,plan,metres,TRANSFER};
  if(typeof document==='undefined')return;

  /* ── interfaz: barra de búsqueda, sugerencias, ficha y trazo ─ */
  const $=s=>document.querySelector(s);
  const number=new Intl.NumberFormat('es-ES');
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9ñ]+/g,' ').trim();
  // El catálogo Renfe viene en mayúsculas: «JEREZ DE LA FRONTERA» → «Jerez de la Frontera».
  const SMALL=new Set(['de','del','la','las','los','el','y','i','en']);
  const title=s=>String(s||'').toLowerCase().replace(/(^|[\s\-\/(.'])(\p{L}+)/gu,(m,a,w,at)=>a+(at&&SMALL.has(w)?w:w[0].toUpperCase()+w.slice(1)));
  let map,dataset,showInfo,onChange,openStation,graph=null,index=[],routeOn=false;
  const sel={origin:null,destination:null};
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

  async function run(){
    closeList();
    if(!sel.origin||!sel.destination)return;
    if(sel.origin.key===sel.destination.key){toast('El origen y el destino son la misma estación.');return;}
    const go=$('#rb-go');go.classList.add('busy');go.setAttribute('aria-busy','true');
    try{await ensureGraph();}catch(e){toast('No se han podido cargar los horarios. Reintenta en unos segundos.');go.classList.remove('busy');go.removeAttribute('aria-busy');return;}
    await new Promise(r=>setTimeout(r,0));
    const result=plan(graph,sel.origin,sel.destination);
    go.classList.remove('busy');go.removeAttribute('aria-busy');
    if(result.error){clearMap();showError(result.error);onChange?.();return;}
    card(result);draw(result);onChange?.();
  }
  function showError(kind){
    const o=sel.origin.name,d=sel.destination.name;
    const text={origin:o+' no tiene parada de los servicios integrados y no hay ninguna estación con servicio a menos de 1,5 km.',
      destination:d+' no tiene parada de los servicios integrados y no hay ninguna estación con servicio a menos de 1,5 km.',
      none:'No hay combinación posible con los servicios integrados: Renfe (alta velocidad, larga y media distancia), Cercanías de ancho métrico y OUIGO. Faltan las Cercanías de ancho ibérico, iryo y las redes autonómicas.'}[kind];
    showInfo('Ruta en tren',o+' → '+d,{'Sin ruta':text},{subtitle:'No se ha encontrado conexión',route:true});
  }
  function toast(text){const t=$('#toast');if(!t)return;t.textContent=text;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{t.hidden=true;},4200);}

  function card(r){
    const box=document.createElement('div');box.className='route-card';
    const ol=document.createElement('ol');ol.className='itinerary';
    const stop=(cls,name,note)=>{const li=document.createElement('li');li.className='it-stop '+cls;const n=document.createElement('i');n.className='it-node';n.setAttribute('aria-hidden','true');
      const t=document.createElement('div'),s=document.createElement('strong'),m=document.createElement('small');s.textContent=name;m.textContent=note;t.append(s,m);li.append(n,t);ol.append(li);};
    const first=r.legs[0],last=r.legs.at(-1);
    stop('origin',first.from,'Salida');
    r.legs.forEach((l,n)=>{
      const li=document.createElement('li');
      if(l.type!=='ride'){
        li.className='it-walk';const s=document.createElement('small');
        s.textContent=l.type==='city'?'Cambio de estación'+(l.town?' en '+title(l.town):'')+' · '+fmtKm(l.m/1000)+' en transporte urbano (Cercanías, metro o autobús) · ≈ '+fmtMin(l.minutes)
          :'A pie hasta '+l.to+' · '+fmtM(l.m)+' · ≈ '+fmtMin(l.minutes);
        li.append(document.createElement('i'),s);ol.append(li);
      }
      else{
        li.className='it-leg';li.style.setProperty('--c',l.product.color);
        const rail=document.createElement('i');rail.className='it-rail';rail.setAttribute('aria-hidden','true');
        const body=document.createElement('div'),head=document.createElement('p'),chip=document.createElement('span'),dir=document.createElement('span'),meta=document.createElement('small');
        head.className='it-head';chip.className='it-chip';chip.textContent=l.product.name;dir.textContent='dirección '+l.direction;head.append(chip,dir);
        meta.textContent=[l.stops.length?l.stops.length+(l.stops.length===1?' parada intermedia':' paradas intermedias'):'Sin paradas intermedias',(l.exact?'':'≈ ')+fmtKm(l.km),'≈ '+fmtMin(l.minutes)].join(' · ');
        body.append(head,meta);
        if(l.alternatives.length){const a=document.createElement('small');a.className='it-alt';a.textContent='También directo: '+l.alternatives.join(', ');body.append(a);}
        if(l.stops.length){const d=document.createElement('details'),s=document.createElement('summary'),ul=document.createElement('ol');d.className='it-stops';s.textContent='Ver paradas';
          for(const name of l.stops){const x=document.createElement('li');x.textContent=name;ul.append(x);}d.append(s,ul);body.append(d);}
        li.append(rail,body);ol.append(li);
      }
      const next=r.legs[n+1];if(!next)return;
      const rodeBefore=r.legs.slice(0,n+1).some(x=>x.type==='ride');
      const note=l.type==='ride'?(next.type==='ride'?'Transbordo · margen de '+TRANSFER+' min':'Bajada y cambio de estación')
        :rodeBefore?'Transbordo · margen de '+TRANSFER+' min':'Subida al tren';
      stop('transfer',l.to,note);
    });
    stop('dest',last.to,'Llegada');
    box.append(ol);
    const note=document.createElement('p');note.className='muted route-note';
    note.textContent='Mejor combinación con los servicios vigentes integrados en el atlas: Renfe (alta velocidad, larga y media distancia), Cercanías de ancho métrico y OUIGO. '+
      'La duración es una estimación por distancia y tipo de vía, con '+TRANSFER+' min de margen por transbordo: los horarios integrados no traen horas de paso. '+
      (r.exact?'Los kilómetros se miden sobre el trazado inferido en la red IGN.':'Algún tramo no tiene trazado verificable: sus kilómetros se aproximan en línea recta.')+' No incluye Cercanías de ancho ibérico, iryo ni redes autonómicas.';
    box.append(note);
    const products=[];for(const l of r.rides)if(!products.some(p=>p.name===l.product.name))products.push(l.product);
    const operators=[...new Set(r.rides.map(l=>l.variant.operator))];
    const city=r.legs.find(l=>l.type==='city');
    const pct=r.km?Math.round(r.hsKm/r.km*100):0;
    showInfo('Ruta en tren',sel.origin.name+' → '+sel.destination.name,{},{
      subtitle:(r.rides.length===1?'Un solo tren':r.rides.length+' trenes')+(city?' · cambio de estación'+(city.town?' en '+title(city.town):''):'')+' · '+operators.join(' y '),
      chips:products.map(p=>({label:p.name,color:p.color})),
      facts:[{value:'≈ '+fmtMin(r.minutes),label:'duración estimada'},
        {value:(r.exact?'':'≈ ')+fmtKm(r.km),label:pct?pct+' % por alta velocidad':'por vía convencional'},
        {value:String(r.transfers),label:r.transfers===1?'transbordo':'transbordos'}],
      extra:box,route:true});
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
    for(const l of r.rides){
      const S=graph.services;
      for(const name of l.stops){const sid=l.variant.calls.find(c=>S.stations[c.s].name===name)?.s;if(sid)features.push(pt(S.stations[sid].coordinates,'stop',name,l.product.color));}
    }
    const first=r.legs[0],last=r.legs.at(-1);
    features.push(pt(first.type==='ride'?first.fromCoords:first.coords[0],'origin',first.from));
    r.rides.slice(0,-1).forEach(l=>features.push(pt(l.toCoords,'transfer',l.to)));
    features.push(pt(last.type==='ride'?last.toCoords:last.coords.at(-1),'dest',last.to));
    map.getSource('route').setData({type:'FeatureCollection',features});
    map.setLayoutProperty('route-veil','visibility','visible');
    routeOn=true;
    const all=r.legs.flatMap(l=>l.coords);
    const lons=all.map(p=>p[0]),lats=all.map(p=>p[1]);
    const pad=CFG.phoneLandscape()?{top:64,bottom:16,left:16,right:Math.round(Math.min(360,window.innerWidth*.48))}:
      CFG.compact()?{top:Math.round((document.querySelector('main').style.getPropertyValue('--rb-h').replace('px','')|0)+24),bottom:Math.round($('#info').hidden?window.innerHeight*.5:$('#info').getBoundingClientRect().height+28),left:24,right:24}:
      {top:110,bottom:Math.max(60,($('#legend')?.offsetHeight||0)+70),left:$('#tools').hidden?60:350,right:400};
    // En pantallas estrechas, a zoom bajo, los límites del mapa impiden desplazar la ruta por encima de la ficha:
    // se amplían mientras la ruta está en pantalla y se recuperan al cerrarla.
    if(CFG.compact()){savedBounds??=map.getMaxBounds();map.setMaxBounds([[-40,10],[35,65]]);}
    map.fitBounds([[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]],{padding:pad,maxZoom:12,duration:CFG.reducedMotion()?0:900});
  }
  let savedBounds=null;
  const pt=(c,role,name,color)=>({type:'Feature',geometry:{type:'Point',coordinates:c},properties:{role,name,color:color||'#1d2638'}});
  function clearMap(){
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
  function state(){return sel.origin&&sel.destination&&routeOn?sel.origin.key+'>'+sel.destination.key:undefined;}
  async function restore(value){
    if(typeof value!=='string'||!value.includes('>'))return;
    try{await ensureGraph();}catch{return;}
    const [a,b]=value.split('>'),find=k=>index.find(e=>e.key===k);
    const o=find(a),d=find(b);if(!o||!d)return;
    sel.origin=o;sel.destination=d;fields.origin.value=o.name;fields.destination.value=d.name;syncBar();
    await run();
  }
  root.AtlasRoute={init,clearMap,state,restore,active:()=>routeOn};
})(typeof window!=='undefined'?window:globalThis);
