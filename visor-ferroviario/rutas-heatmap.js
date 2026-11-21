/* Mapa local, sin teselas ni dependencias. Los valores se calculan sobre patrones
   de paradas del GTFS, no sobre la unión desordenada de estaciones de cada fila. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), ns = 'http://www.w3.org/2000/svg';
  const number = n => new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(n);
  const node = (tag, text) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const svg = (tag, attrs) => {const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  let activity, demographics, ready=false, loading=false, zoom=1, centerX=500, centerY=335;
  const map=$('rh-map'), group=svg('g',{});map.append(group);
  const project = ([lon,lat]) => lon < -12 ? [55+(lon+18.3)*75,525+(29.6-lat)*65] : [65+(lon+9.8)*57,35+(44.6-lat)*65];
  const line = points => points.map((p,i)=>(i?'L':'M')+project(p).map(x=>x.toFixed(1)).join(',')).join('');
  const polygons = geometry => geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  const areaPath = geometry => polygons(geometry).map(p=>p.map(r=>line(r)+'Z').join('')).join('');
  const distance = (a,b) => {const r=Math.PI/180,lat=(b[1]-a[1])*r,lon=(b[0]-a[0])*r,h=Math.sin(lat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(lon/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(h)));};
  function center(geometry){
    // Centro de la caja del polígono principal: indicador aproximado, no acceso viario.
    const rings=polygons(geometry).map(p=>p[0]);
    const ring=rings.sort((a,b)=>b.length-a.length)[0];
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    for(const [x,y] of ring){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    return [(x0+x1)/2,(y0+y1)/2];
  }
  function inside(point,geometry){return polygons(geometry).some(poly=>{
    const ringInside=ring=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++) {const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
    return ringInside(poly[0])&&!poly.slice(1).some(ringInside);
  });}
  function showDetail(item){$('rh-detail').textContent=item.label+': '+number(item.value)+' '+item.unit+(item.note?'. '+item.note:'');}
  function paint(items,unit,lowBetter=false){
    const positive=items.map(x=>x.value).filter(x=>x>0).sort((a,b)=>a-b);
    // Umbrales cuantiles explícitos; los empates comparten color.
    const breaks=[...new Set([.2,.4,.6,.8].map(q=>positive[Math.min(positive.length-1,Math.floor(q*positive.length))]).filter(Number.isFinite))];
    const color=value=>value===0?'rh-none':'rh-c'+breaks.filter(b=>value>b).length;
    for(const item of items){
      const attrs=item.geometry?{d:areaPath(item.geometry),class:'rh-area '+color(item.value),'fill-rule':'evenodd'}:{cx:project(item.coordinates)[0],cy:project(item.coordinates)[1],r:4,class:'rh-point '+color(item.value)};
      const n=svg(item.geometry?'path':'circle',attrs),title=svg('title',{});title.textContent=item.label+': '+number(item.value)+' '+unit;n.append(title);n.onclick=()=>showDetail({...item,unit});group.append(n);
    }
    const legend=$('rh-legend');legend.replaceChildren();
    const entry=(cls,text)=>{const span=node('span'),swatch=node('i');swatch.className='rh-swatch '+cls;span.append(swatch,text);legend.append(span);};
    entry('rh-none','0 '+unit);
    if(positive.length){let min=positive[0];for(let i=0;i<=breaks.length;i++){const max=breaks[i]??positive.at(-1);entry('rh-c'+i,number(min)+(max!==min?' – '+number(max):'')+' '+unit+(i?' (límite inferior excluido)':''));min=max;}}
    rank(items,unit,lowBetter);
  }
  function rank(items,unit,lowBetter=false){
    $('rh-ranking').replaceChildren();
    for(const item of [...items].sort((a,b)=>lowBetter?a.value-b.value:b.value-a.value).slice(0,15)){
      const li=node('li'),button=node('button',item.label);button.type='button';button.append(node('b',number(item.value)+' '+unit));button.onclick=()=>showDetail({...item,unit});li.append(button);$('rh-ranking').append(li);
    }
  }
  const methods={
    routes:'Rutas distintas por tramo del trazado disponible, con ambos sentidos como rutas diferentes según la tabla. IGN: recorridos inferidos completos. Cercanías: dibujos de línea GTFS, que pueden incluir ramales sin servicio ese día. Los dos tipos de trazado se cuentan por separado; no se suman por proximidad. Un color suave no significa ausencia de trenes.',
    frequency:'Trenes programados que paran en cada estación el día elegido. Cada tren cuenta una vez por estación, aunque llegue y salga. Se respetan los servicios parciales de Cercanías. La intensidad se muestra en estaciones para evitar atribuir la frecuencia de una línea entera a cada tramo.',
    connectivity:'Destinos directos distintos desde cada estación, en el sentido de circulación y con al menos un tren el día elegido. No incluye transbordos: requieren comprobar la compatibilidad de los horarios.',
    coverage:'Distancia en línea recta desde el centro aproximado del municipio hasta la estación con servicio más cercana de la selección. Color = kilómetros; más oscuro significa mayor distancia. No representa tiempo por carretera ni población con acceso efectivo. Se muestran los municipios del territorio filtrado.',
    potential:'Paradas de tren programadas por cada 10.000 habitantes de la provincia. Un tren que para en varias estaciones de una provincia aporta varias paradas. Es un indicador de oferta relativa, no una estimación de demanda ni una recomendación de inversión. Población: fecha y carácter provisional en cada provincia.',
    reliability:'Pendiente de datos: el catálogo contiene horarios programados. Este modo necesita un histórico de llegadas reales, retrasos y cancelaciones, unido a cada servicio. No se asignan ceros a los tramos sin observaciones.'
  };
  function draw(){
    if(!ready||!window.RutasHeatmapSelection)return;
    const selection=window.RutasHeatmapSelection,mode=$('rh-mode').value,day=+$('rh-day').value;
    const {rows,stations,filters}=selection;
    $('rh-radius-field').hidden=mode!=='coverage';$('rh-day').disabled=mode==='reliability';
    $('rh-method').textContent=methods[mode];$('rh-detail').textContent='Selecciona un punto del mapa o del listado para consultar su valor.';
    $('rh-ranking-title').textContent=mode==='coverage'?'Mayor distancia a una estación':mode==='potential'?'Menor oferta por habitante':'Puntos destacados';
    group.replaceChildren();$('rh-ranking').replaceChildren();$('rh-legend').replaceChildren();
    $('rh-layout').hidden=mode==='reliability';
    if(mode==='reliability'){$('rh-status').textContent='Sin histórico de operación disponible.';return;}
    for(const feature of demographics.communities.features)group.append(svg('path',{d:areaPath(feature.geometry),class:'rh-land','fill-rule':'evenodd'}));
    const calls=new Map(),destinations=new Map();let available=0;
    for(const row of rows){const a=activity.rutas[row.id];if(!a)continue;available++;
      for(const [station,counts] of a.calls)if(counts[day])calls.set(station,(calls.get(station)||0)+counts[day]);
      if(mode==='connectivity')for(const [origin,dest,mask] of a.links)if(mask&(1<<day)){if(!destinations.has(origin))destinations.set(origin,new Set());destinations.get(origin).add(dest);}
    }
    const active=[...calls.keys()].filter(i=>stations[i]?.c);
    const inScope=p=>(!filters.ca||p.community===filters.ca)&&(!filters.pr||provinceName(p.province)===provinceName(filters.pr));
    let summary=number(rows.length)+' rutas seleccionadas · '+activity.referencia[day]+' · '+number(active.length)+' estaciones con servicio.';
    if(available!==rows.length)summary+=' Faltan agregados para '+(rows.length-available)+' rutas.';
    if(mode==='routes'){
      const segments=new Map();let traced=0;
      for(const row of rows){if(!row.dias[day])continue;const ids=activity.traces.routeDays?.[row.id]?.[day]||activity.traces.routes[row.id]||[];if(ids.length)traced++;const seen=new Set();
        for(const id of ids){const points=activity.traces.geometries[id];if(!points)continue;
          // IGN mantiene su identidad topológica. En GTFS se unen segmentos idénticos en ambos sentidos.
          const pieces=id.startsWith('ign:')?[[id,points]]:points.slice(1).map((p,i)=>{const a=points[i],key=[a.join(','),p.join(',')].sort().join('|');return ['gtfs:'+key,[a,p]];});
          for(const [key,xy] of pieces){if(seen.has(key))continue;seen.add(key);if(!segments.has(key))segments.set(key,{coordinates:xy,value:0});segments.get(key).value++;}
        }
      }
      const max=[...segments.values()].reduce((m,s)=>Math.max(m,s.value),0),thresholds=[1,2,5,10];
      const paths=Array(5).fill('');for(const s of segments.values())paths[thresholds.filter(t=>s.value>t).length]+=line(s.coordinates);
      paths.forEach((d,i)=>{if(d)group.append(svg('path',{d,class:'rh-line rh-c'+i}));});
      for(const [i,label] of ['1 ruta','2 rutas','3–5 rutas','6–10 rutas','Más de 10 rutas'].entries()){const span=node('span'),swatch=node('i');swatch.className='rh-swatch rh-c'+i;span.append(swatch,label);$('rh-legend').append(span);}
      summary+=' '+traced+' de '+rows.filter(r=>r.dias[day]>0).length+' rutas activas con trazado disponible. Máximo: '+max+' rutas por tramo.';
      rank([...calls].map(([i,value])=>({label:stations[i].n,coordinates:stations[i].c,value, note:'Frecuencia en estación; el color de los trazados mide rutas distintas.'})),'trenes con parada');
      $('rh-ranking-title').textContent='Estaciones con más servicio';
    }else if(mode==='frequency'||mode==='connectivity'){
      paint(active.map(i=>({label:stations[i].n,coordinates:stations[i].c,value:mode==='frequency'?calls.get(i):(destinations.get(i)?.size||0)})),mode==='frequency'?'trenes':'destinos directos');
    }else if(mode==='coverage'){
      if(!active.length){$('rh-status').textContent=summary+' No se puede calcular una distancia sin estaciones con servicio.';return;}
      const radius=+$('rh-radius').value;
      const items=demographics.municipalities.features.filter(f=>inScope(f.properties)).map(f=>{
        const point=f._center||(f._center=center(f.geometry));let best=Infinity,nearest;
        for(const i of active){const d=distance(point,stations[i].c);if(d<best){best=d;nearest=i;}}
        return {label:f.properties.name,geometry:f.geometry,value:best,population:f.properties.population,note:'Estación más cercana: '+stations[nearest].n};
      });
      paint(items,'km');const total=items.reduce((sum,x)=>sum+x.population,0),near=items.filter(x=>x.value<=radius).reduce((sum,x)=>sum+x.population,0);
      summary+=' '+number(items.filter(x=>x.value<=radius).length)+' de '+number(items.length)+' municipios a ≤ '+radius+' km. '+number(total?near/total*100:0)+' % de la población reside en esos municipios (no equivale a población cubierta).';
    }else if(mode==='potential'){
      const provinces=demographics.provinces.features;
      const included=filters.pr?provinces.filter(f=>provinceName(f.properties.name)===provinceName(filters.pr)):filters.ca?provinces.filter(f=>demographics.municipalities.features.some(m=>m.properties.community===filters.ca&&m.properties.id.slice(0,2)===f.properties.id)):provinces;
      const totals=new Map();
      for(const i of active){const p=provinceOf(stations[i].c,provinces);if(p)totals.set(p.properties.id,(totals.get(p.properties.id)||0)+calls.get(i));}
      paint(included.map(f=>({label:f.properties.name,geometry:f.geometry,value:(totals.get(f.properties.id)||0)*10000/f.properties.population,note:number(totals.get(f.properties.id)||0)+' paradas; '+number(f.properties.population)+' habitantes. Población a '+f.properties.date+(f.properties.provisional?' (provisional)':'')})),'paradas / 10.000 hab.',true);
    }
    $('rh-status').textContent=summary;
  }
  const normal=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const provinceName=s=>normal(({'Araba/Álava':'Álava','Coruña, A':'A Coruña','Rioja, La':'La Rioja','Castellón/Castelló':'Castellón','Valencia/Valéncia':'Valencia','Balears, Illes':'Illes Balears','Palmas, Las':'Las Palmas'})[s]||s);
  const provinceCache=new Map();
  function provinceOf(point,provinces){const key=point.join(',');if(!provinceCache.has(key))provinceCache.set(key,provinces.find(p=>inside(point,p.geometry))||null);return provinceCache.get(key);}
  async function load(){
    if(loading)return;loading=true;$('rh-content').hidden=false;$('rh-load').disabled=true;$('rh-status').textContent='Cargando cartografía y agregados de horarios…';
    try{
      const get=async path=>{const r=await fetch(path,{cache:'no-cache'});if(!r.ok)throw Error(path);return r.json();};
      [activity,demographics]=await Promise.all([get('capas/rutas-actividad.json'),get('capas/demografia.json')]);
      if(activity.referencia[0]!==window.RutasHeatmapSelection?.reference.semana)throw Error('Los agregados y las rutas corresponden a semanas diferentes');
      ready=true;$('rh-load').hidden=true;draw();
    }catch{ $('rh-status').textContent='No se ha podido cargar el mapa o los datos corresponden a semanas distintas. Puedes reintentar; la tabla sigue disponible.';$('rh-load').disabled=false;$('rh-load').textContent='Reintentar carga';}
    finally{loading=false;}
  }
  $('rh-load').onclick=load;
  for(const id of ['rh-mode','rh-day','rh-radius'])$(id).addEventListener('change',draw);
  window.addEventListener('rutas-selection',draw);
  function scale(){centerX=Math.max(500/zoom,Math.min(1000-500/zoom,centerX));centerY=Math.max(335/zoom,Math.min(670-335/zoom,centerY));map.setAttribute('viewBox',`${centerX-500/zoom} ${centerY-335/zoom} ${1000/zoom} ${670/zoom}`);}
  $('rh-in').onclick=()=>{zoom=Math.min(8,zoom*1.5);scale();};$('rh-out').onclick=()=>{zoom=Math.max(1,zoom/1.5);scale();};$('rh-home').onclick=()=>{zoom=1;centerX=500;centerY=335;scale();};
  map.setAttribute('tabindex','0');
  map.addEventListener('keydown',event=>{const delta=60/zoom;if(event.key==='ArrowLeft')centerX-=delta;else if(event.key==='ArrowRight')centerX+=delta;else if(event.key==='ArrowUp')centerY-=delta;else if(event.key==='ArrowDown')centerY+=delta;else return;event.preventDefault();scale();});
  let drag;
  map.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0)return;drag={x:event.clientX,y:event.clientY,cx:centerX,cy:centerY};});
  map.addEventListener('pointermove',event=>{if(!drag)return;const rect=map.getBoundingClientRect();centerX=drag.cx-(event.clientX-drag.x)*1000/(rect.width*zoom);centerY=drag.cy-(event.clientY-drag.y)*670/(rect.height*zoom);scale();});
  map.addEventListener('pointerup',()=>{drag=null;});map.addEventListener('pointercancel',()=>{drag=null;});
  map.addEventListener('pointerleave',()=>{drag=null;});
})();
