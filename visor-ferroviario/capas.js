/* Temas de líneas del atlas (corredores, marcas, servicios, turismo) sobre la red IGN.
   Un solo tema colorea las vías a la vez; Población y Estaciones se combinan encima.
   Las rutas se guardan como listas de tramos IGN: cada tramo se dibuja una vez por marca o
   categoría, aunque lo usen cien variantes, así que las capas no multiplican la misma ruta. */
(function(root){
  'use strict';
  const CFG=root.AtlasConfig;
  const number=new Intl.NumberFormat('es-ES');
  const CUTOFF='2026-11-16', FUTURE_FROM='2026-12-17';
  const $=s=>document.querySelector(s);
  let map,dataset,showInfo,onChange,legacy;
  const data={};
  const state={theme:'corridors',
    keys:{corridors:CFG.corridors.map(c=>c.id),brands:CFG.brands.map(b=>b.id),services:['highspeed','avant','md-conventional','euromed'],tourism:CFG.tourism.map(t=>t.id)},
    statuses:['service','construction','project'],dim:'perf',variant:null,station:null,experience:null,corridor:null};
  const files={corridors:'capas/corredores.geojson',brands:'capas/servicios.json',services:'capas/servicios.json',tourism:'capas/turismo.json'};
  const cache={};
  function load(theme){
    const file=files[theme];if(!file)return Promise.resolve(null);
    cache[file]??=fetch(file).then(r=>{if(!r.ok)throw new Error('No se ha podido cargar '+file);return r.json();}).catch(e=>{delete cache[file];throw e;});
    return cache[file];
  }
  const rail=fid=>dataset.rail.features[fid];
  const fmtDate=s=>s?s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4):'—';
  const reduced=()=>CFG.reducedMotion();

  /* ── vigencia ─────────────────────────────────────────── */
  function variantStatus(v){
    const val=v.validity;if(!val)return 'unknown';
    if(val.to<CUTOFF)return 'expired';
    if(val.from>=FUTURE_FROM)return 'future';
    return 'current';
  }
  const services=()=>data.services;
  function activeVariants(theme=state.theme){
    const s=services();if(!s)return [];
    const keys=state.keys[theme];
    return s.variants.filter(v=>variantStatus(v)==='current'&&(theme==='brands'?keys.includes(v.brand):v.categories.some(c=>keys.includes(c))));
  }
  function variantKey(v,theme){return theme==='brands'?v.brand:v.categories.find(c=>state.keys.services.includes(c))||v.categories[0];}
  const styleOf=(theme,key)=>(theme==='brands'?CFG.brands:theme==='services'?CFG.services:theme==='tourism'?CFG.tourism:CFG.corridors).find(x=>x.id===key);

  /* ── capas MapLibre ───────────────────────────────────── */
  function ensureLayers(){
    if(map.getSource('cx-lines'))return;
    const empty={type:'FeatureCollection',features:[]};
    map.addSource('cx-lines',{type:'geojson',data:empty,attribution:'Servicios: Renfe Operadora CC BY 4.0 · OUIGO · corredores: Hermes, Ministerio de Transportes'});
    map.addSource('cx-highlight',{type:'geojson',data:empty});
    map.addSource('cx-stops',{type:'geojson',data:empty});
    const before=map.getLayer('region-labels')?'region-labels':undefined;
    // Bandas paralelas solo al acercar: a escala peninsular los cambios de tramo las harían saltar.
    const offset=['interpolate',['linear'],['zoom'],7.5,0,9,['get','off'],13,['*',['get','off'],1.6]];
    const width=['interpolate',['linear'],['zoom'],5,['*',['get','w'],.75],9,['get','w'],13,['*',['get','w'],1.6]];
    map.addLayer({id:'cx-halo',type:'line',source:'cx-highlight',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffd166','line-width':['interpolate',['linear'],['zoom'],5,7,12,14],'line-opacity':.85}},before);
    map.addLayer({id:'cx-line',type:'line',source:'cx-lines',filter:['==',['get','dash'],0],layout:{'line-join':'round'},paint:{'line-color':['get','color'],'line-width':width,'line-offset':offset}},before);
    map.addLayer({id:'cx-line-dash',type:'line',source:'cx-lines',filter:['==',['get','dash'],1],paint:{'line-color':['get','color'],'line-width':width,'line-offset':offset,'line-dasharray':[3,2]}},before);
    map.addLayer({id:'cx-line-dot',type:'line',source:'cx-lines',filter:['==',['get','dash'],2],layout:{'line-cap':'round'},paint:{'line-color':['get','color'],'line-width':width,'line-offset':offset,'line-dasharray':[0.6,2.2],'line-opacity':.85}},before);
    map.addLayer({id:'cx-core',type:'line',source:'cx-lines',filter:['==',['get','core'],1],paint:{'line-color':'#fbfbfb','line-width':['interpolate',['linear'],['zoom'],5,.8,12,1.8],'line-offset':offset}},before);
    // Recorrido seleccionado: continuo por vía de ancho estándar (alta velocidad), discontinuo por vía convencional.
    map.addLayer({id:'cx-sel-hs',type:'line',source:'cx-highlight',filter:['==',['get','hs'],1],layout:{'line-cap':'round'},paint:{'line-color':'#1d2638','line-width':3}},before);
    map.addLayer({id:'cx-sel-conv',type:'line',source:'cx-highlight',filter:['==',['get','hs'],0],paint:{'line-color':'#1d2638','line-width':3,'line-dasharray':[2,1.4]}},before);
    map.addLayer({id:'cx-hit',type:'line',source:'cx-lines',paint:{'line-color':'#000','line-width':14,'line-opacity':0}},before);
    map.addSource('cx-border',{type:'geojson',data:empty});
    map.addLayer({id:'cx-border',type:'symbol',source:'cx-border',minzoom:6.2,layout:{'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':12,'text-anchor':['get','anchor'],'text-max-width':12,'text-allow-overlap':true},paint:{'text-color':'#273a5f','text-halo-color':'#fbfbfb','text-halo-width':2}});
    map.addLayer({id:'cx-stops',type:'circle',source:'cx-stops',paint:{
      'circle-radius':['interpolate',['linear'],['zoom'],5,['case',['==',['get','sel'],1],4.5,2.6],10,['case',['==',['get','sel'],1],7,4.8]],
      'circle-color':'#fbfbfb','circle-stroke-color':['get','color'],'circle-stroke-width':['case',['==',['get','sel'],1],2.6,1.6],
      'circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
    map.addLayer({id:'cx-stop-labels',type:'symbol',source:'cx-stops',minzoom:7,layout:{'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':12,
      'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':.7,'text-optional':true,'symbol-sort-key':['-',['get','rank']]},
      paint:{'text-color':'#1d2638','text-halo-color':'#fbfbfb','text-halo-width':1.8}});
    for(const id of ['cx-hit','cx-stops']){
      map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');
      map.on('mouseleave',id,()=>map.getCanvas().style.cursor='');
    }
    map.on('click',onClick);
  }
  function edgeFeature(fid,props){return {type:'Feature',geometry:rail(fid).geometry,properties:{fid,...props}};}
  function bandOffsets(byEdge,order){
    // Desplazamiento discreto de las bandas solo donde comparten tramo (en píxeles a zoom 8).
    const result=new Map();
    for(const [fid,keys] of byEdge){
      const present=order.filter(k=>keys.has(k));
      present.forEach((k,i)=>result.set(fid+'|'+k,(i-(present.length-1)/2)*3));
    }
    return result;
  }
  function buildLines(){
    const theme=state.theme,features=[],stops=new Map();
    if(theme==='corridors'&&data.corridors){
      for(const f of data.corridors.features){
        const p=f.properties;
        if(!state.keys.corridors.includes(p.corridor)||!state.statuses.includes(p.status))continue;
        const st=CFG.corridors.find(c=>c.id===p.corridor);
        features.push({type:'Feature',geometry:f.geometry,properties:{sid:p.id,key:p.corridor,color:st.color,w:st.double?4.2:3.2,off:0,
          dash:p.status==='service'?0:p.status==='construction'?1:2,core:st.double?1:0}});
      }
    } else if((theme==='brands'||theme==='services')&&services()){
      const order=theme==='brands'?CFG.brands.map(b=>b.id):CFG.services.map(s=>s.id);
      const byEdge=new Map();
      for(const v of activeVariants()){
        const key=variantKey(v,theme);
        for(const fid of v.edges){if(!byEdge.has(fid))byEdge.set(fid,new Set());byEdge.get(fid).add(key);}
        for(const c of v.calls)addStop(stops,c.s,key,theme);
      }
      const offsets=bandOffsets(byEdge,order);
      for(const [fid,keys] of byEdge)for(const key of keys){
        const st=styleOf(theme,key);
        features.push(edgeFeature(fid,{key,color:st.color,w:st.width||2.6,off:offsets.get(fid+'|'+key)||0,dash:st.dash?1:0,core:0}));
      }
      // Cercanías métricas con forma GTFS propia
      if(theme==='services'&&state.keys.services.includes('commuter-metric')){
        const st=styleOf('services','commuter-metric');
        for(const v of activeVariants())if(v.geometry&&v.categories.includes('commuter-metric'))
          features.push({type:'Feature',geometry:{type:'LineString',coordinates:services().geometries[v.geometry]},properties:{vid:v.id,key:'commuter-metric',color:st.color,w:st.width,off:0,dash:0,core:0}});
      }
    } else if(theme==='tourism'&&data.tourism){
      const byEdge=new Map();
      for(const e of data.tourism.experiences){
        if(e.status!=='current'||!state.keys.tourism.includes(e.group))continue;
        for(const fid of e.edges){if(!byEdge.has(fid))byEdge.set(fid,new Set());byEdge.get(fid).add(e.group);}
        for(const s of e.stops){const id='t:'+s.name;const st=styleOf('tourism',e.group);
          if(!stops.has(id))stops.set(id,{sid:id,name:s.name,coordinates:s.coordinates,color:st.color,keys:new Set()});stops.get(id).keys.add(e.group);}
      }
      const offsets=bandOffsets(byEdge,CFG.tourism.map(t=>t.id));
      for(const [fid,keys] of byEdge)for(const key of keys){const st=styleOf('tourism',key);features.push(edgeFeature(fid,{key,color:st.color,w:3,off:offsets.get(fid+'|'+key)||0,dash:0,core:0}));}
    }
    map.getSource('cx-border').setData({type:'FeatureCollection',features:borders()});
    map.getSource('cx-lines').setData({type:'FeatureCollection',features});
    map.setLayerZoomRange('cx-stops',theme==='services'?6.5:0,24);map.setLayerZoomRange('cx-stop-labels',theme==='services'?9:7,24);
    map.getSource('cx-stops').setData({type:'FeatureCollection',features:[...stops.values()].map(s=>({type:'Feature',geometry:{type:'Point',coordinates:s.coordinates},
      properties:{sid:s.sid,label:s.name,color:s.keys.size>1?'#1d2638':s.color,rank:s.rank||s.keys.size,sel:s.sid===state.station?1:0}}))});
    renderHighlight();
    return features.length;
  }
  // Continuidad internacional acreditada por el horario: rótulo en la frontera, sin dibujar fuera del ámbito.
  function borders(){
    if(!['brands','services'].includes(state.theme)||!services())return [];
    const fr=new Set(),pt=new Set();
    for(const v of activeVariants())for(const name of v.international||[]){const st=Object.values(services().stations).find(s=>s.name===name);if(!st)continue;(st.coordinates[0]<-6?pt:fr).add(name);}
    const out=[];
    if(fr.size)out.push({type:'Feature',geometry:{type:'Point',coordinates:[2.87,42.46]},properties:{label:'Continúa a Francia: '+[...fr].slice(0,4).join(', '),anchor:'left'}});
    if(pt.size)out.push({type:'Feature',geometry:{type:'Point',coordinates:[-8.65,42.05]},properties:{label:'Continúa a Portugal: '+[...pt].slice(0,3).join(', '),anchor:'right'}});
    return out;
  }
  function addStop(stops,sid,key,theme){
    const s=services().stations[sid];if(!s||s.spain===false)return;
    if(!stops.has(sid))stops.set(sid,{sid,name:s.name,coordinates:s.coordinates,color:styleOf(theme,key).color,keys:new Set(),rank:0});
    const stop=stops.get(sid);stop.keys.add(key);stop.rank++;
  }
  function renderHighlight(){
    const features=[];
    if(state.variant&&services()){
      const v=services().variants.find(x=>x.id===state.variant);
      if(v){
        if(v.geometry)features.push({type:'Feature',geometry:{type:'LineString',coordinates:services().geometries[v.geometry]},properties:{hs:0}});
        for(const fid of v.edges)features.push(edgeFeature(fid,{hs:rail(fid).properties.nominalgauge===1435?1:0}));
      }
    } else if(state.experience&&data.tourism){
      const e=data.tourism.experiences.find(x=>x.id===state.experience);
      for(const fid of e?.edges||[])features.push(edgeFeature(fid,{hs:rail(fid).properties.nominalgauge===1435?1:0}));
    } else if(state.corridor&&data.corridors){
      for(const f of data.corridors.features)if(f.properties.branch===state.corridor)features.push({...f,properties:{hs:1}});
    }
    map.getSource('cx-highlight')?.setData({type:'FeatureCollection',features});
  }

  /* ── fichas ───────────────────────────────────────────── */
  function familyOf(v){
    if(v.brand==='ave'||v.brand==='avlo')return v.brand;
    if(v.brand)return null;   // OUIGO e iryo: sin imagen de Renfe
    const key=CFG.services.find(s=>v.categories.includes(s.id)&&s.family);return key?.family||null;
  }
  function media(family){
    const f=CFG.families[family];if(!f)return null;
    return {src:f.img,alt:f.alt,caption:'Nueva imagen de '+f.name+' (familia '+f.group.toLowerCase()+'). Recreación generada con IA por Renfe; la flota la adopta de forma progresiva. © Renfe · trenes.renfe.com'};
  }
  function variantInfo(v){
    const s=services(),names=v.calls.map(c=>s.stations[c.s].name);
    const flags=c=>c.p?' (solo bajada)':c.d?' (solo subida)':'';
    let hs=0,conv=0;for(const fid of v.edges){const p=rail(fid).properties;(p.nominalgauge===1435?(()=>hs+=p.length_m):(()=>conv+=p.length_m))();}
    const siblings=s.variants.filter(x=>x.relation===v.relation&&variantStatus(x)==='current');
    const brand=CFG.brands.find(b=>b.id===v.brand);
    const val=v.validity;
    const fields={
      'Producto':brand?brand.name+' · marca de '+brand.operator:v.published_brand,
      ['Paradas comerciales ('+v.calls.length+')']:v.calls.map((c,i)=>(i+1)+'. '+s.stations[c.s].name+flags(c)).join('\n'),
      'Esta variante':siblings.length>1?'Una de '+siblings.length+' variantes con el mismo origen y destino; cada una tiene sus propias paradas. Elige otra en la ficha de una estación.':'Única variante vigente de esta relación.',
      'Vigencia':val?(val.note?val.note+(val.from===val.to?' ('+fmtDate(val.from)+')':' (del '+fmtDate(val.from)+' al '+fmtDate(val.to)+')'):'Del '+fmtDate(val.from)+' al '+fmtDate(val.to))+(v.trips?' · '+number.format(v.trips)+' circulaciones en el calendario publicado':'')+(v.calendar_note?' · '+v.calendar_note:''):'Sin calendario',
      'Recorrido':v.trace==='gtfs'?'Forma publicada en el GTFS del operador.':
        'Trazado inferido sobre la red IGN entre paradas consecutivas (no es dato del operador). '+number.format(Math.round(hs/1000))+' km por vía de ancho estándar (alta velocidad) y '+number.format(Math.round(conv/1000))+' km por vía convencional; en el mapa, línea continua y discontinua.'+
        (v.pending_segments?' '+v.pending_segments+' de '+v.segments+' saltos entre paradas sin trazado verificable: no se dibujan.':'')+(v.international?' Continúa fuera del ámbito: '+v.international.join(', ')+'.':''),
      ...(v.madrid_assumed&&{'Estación de Madrid':'El horario oficial solo dice «Madrid»; la estación se asigna por corredor (Atocha o Chamartín) y no está confirmada para esta relación.'})
    };
    if(v.numbers?.length)fields['Números de tren']=v.numbers.slice(0,12).join(', ')+(v.numbers.length>12?'…':'');
    if(v.aliases?.length)fields['Denominación anterior']=v.aliases.join(', ');
    const svc=CFG.services.find(x=>v.categories.includes(x.id));
    const kind='Ruta · '+(brand?brand.name:svc?.name.split(' · ').at(-1).replace(/^ahora /,'')||v.published_brand),title=names[0]+' → '+names.at(-1);
    const km=(hs+conv)/1000;
    const opts={subtitle:v.operator,chips:[{label:brand?brand.name:v.published_brand,color:(brand||svc)?.color}],
       facts:[{value:String(v.calls.length),label:'paradas'},{value:number.format(Math.round(km))+' km',label:'recorrido dibujado'},...(v.trips?[{value:number.format(v.trips),label:'circulaciones'}]:[])],
       media:media(familyOf(v))};
    showInfo(kind,title,fields,opts);
    // Horario (oferta.js): trenes del día, duración y velocidad comercial; las paradas pasan a llevar hora.
    root.AtlasOffer?.forVariant(v).then(o=>{
      if(!o||state.variant!==v.id||$('#info').hidden)return;
      const {['Paradas comerciales ('+v.calls.length+')']:_,...rest}=fields;
      const speed=km>0&&!v.pending_segments&&v.trace!=='gtfs'?Math.round(km/(o.duration/60)):null;
      const scroll=$('#info').scrollTop;
      showInfo(kind,title,rest,{...opts,extra:o.block,keepFocus:true,facts:[
        {value:number.format(o.trains),label:o.trains===1?'tren con estas paradas':'trenes con estas paradas'},
        {value:root.AtlasOffer.dur(o.duration),label:'duración habitual'},
        speed?{value:speed+' km/h',label:'velocidad comercial'}:{value:String(v.calls.length),label:'paradas'}]});
      $('#info').scrollTop=scroll;
    }).catch(e=>console.warn(e));
  }
  function selectVariant(id){state.variant=id;state.experience=null;state.corridor=null;renderHighlight();variantInfo(services().variants.find(v=>v.id===id));
    const v=services().variants.find(x=>x.id===id);fit(v.calls.map(c=>services().stations[c.s].coordinates));onChange?.();}
  function fit(points){if(!points.length)return;const lons=points.map(p=>p[0]),lats=points.map(p=>p[1]);
    map.fitBounds([[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]],{padding:CFG.phoneLandscape()?{top:20,bottom:20,left:20,right:Math.round(Math.min(360,window.innerWidth*.48))}:CFG.compact()?{top:40,bottom:Math.round(window.innerHeight*.5),left:24,right:24}:{top:60,bottom:60,left:340,right:340},maxZoom:11,duration:reduced()?0:700});}
  function relationButtons(variants){
    const groups=new Map();
    for(const v of variants){const k=v.relation;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(v);}
    return [...groups.values()].sort((a,b)=>b.length-a.length).slice(0,14).map(list=>{
      const v=list[0],label=(CFG.brands.find(b=>b.id===v.brand)?.name||v.published_brand)+' · '+v.origin+' → '+v.destination+(list.length>1?' ('+list.length+' variantes)':'');
      return {label,action:()=>selectVariant(v.id)};
    });
  }
  function stationInfo(sid){
    const s=services(),st=s.stations[sid];state.station=sid;
    const calling=s.variants.filter(v=>variantStatus(v)==='current'&&v.calls.some(c=>c.s===sid));
    const brandIds=[...new Set(calling.map(v=>v.brand).filter(Boolean))];
    const cats=[...new Set(calling.flatMap(v=>v.categories))].map(c=>CFG.services.find(x=>x.id===c)).filter(Boolean);
    const relations=new Set(calling.map(v=>v.relation)).size;
    const catalog=dataset.stations.features.find(f=>String(f.properties.CODIGO)===String(st.official_id))?.properties;
    // Importancia: rutas vigentes con parada (todas las marcas y servicios integrados).
    const rank=relations>=60?'Nudo principal de la red':relations>=20?'Estación de primer nivel':relations>=5?'Estación con servicio regular':relations?'Servicio limitado':'Sin servicio integrado';
    const destinations=[...new Set(calling.flatMap(v=>[v.origin,v.destination]))].filter(n=>n&&n!==st.name).length;
    const fields={
      'Servicios con parada':[...new Set(cats.map(c=>c.name.split(' · ').at(-1).replace(/^ahora /,'')))].join(' · ')||undefined,
      'Importancia en la red':rank+' · '+number.format(relations)+' rutas con parada en el horario vigente',
      'Dirección':catalog?.DIRECION,
      'Conexiones con otros transportes':root.AtlasConnections?.(st.coordinates)
    };
    const opts={
      subtitle:catalog?[catalog.POBLACION,catalog.PROVINCIA].filter(Boolean).join(' · '):undefined,
      chips:brandIds.map(b=>CFG.brands.find(x=>x.id===b)).map(b=>({label:b.name,color:b.color})),
      facts:[{value:number.format(relations),label:'rutas con parada'},{value:number.format(destinations),label:'orígenes y destinos'}],
      actionsLabel:'Rutas con parada',actions:relationButtons(calling)};
    showInfo('Estación',st.name,fields,opts);
    buildLines();onChange?.();
    // Trenes del día (oferta.js): cuando llegan los horarios, la ficha responde primero cuántos trenes paran y cuándo.
    root.AtlasOffer?.forStation(sid).then(o=>{
      if(!o||state.station!==sid||$('#info').hidden||$('#name').textContent!==st.name)return;
      const scroll=$('#info').scrollTop;
      showInfo('Estación',st.name,fields,{...opts,facts:o.facts,extra:o.block,keepFocus:true});
      $('#info').scrollTop=scroll;
    }).catch(e=>console.warn(e));
  }
  function corridorInfo(p){
    const group=CFG.corridors.find(c=>c.id===p.corridor);
    state.corridor=p.branch;state.variant=null;state.experience=null;renderHighlight();
    const sections=data.corridors.features.filter(f=>f.properties.branch===p.branch).map(f=>f.properties);
    const km=k=>number.format(Math.round(sections.filter(s=>s.status===k).reduce((a,s)=>a+s.km,0)));
    const fields={
      'Tramo seleccionado':p.name+' · '+CFG.status[p.status].name.toLowerCase()+' · '+number.format(p.km)+' km',
      'Tramos del ramal':[...new Set(sections.map(s=>s.name+' ('+CFG.status[s.status].name.toLowerCase()+')'))].join('\n'),
      'Trenes de alta velocidad':p.high_speed_trains?'Circulan servicios AVE, Avlo, OUIGO, Avant o Euromed por este tramo.':'Ningún tren de alta velocidad programado por este tramo.',
      'Línea':p.line_code,
      ...(p.status_note&&{'Situación':p.status_note}),
      ...(p.corridor==='sur'&&{'NAFA':'Nuevo Acceso Ferroviario a Andalucía: nombre del proyecto de la línea Madrid–Sevilla, inaugurada en 1992. Los ramales de Málaga y Granada salen de ella. Fuente secundaria; no se ha localizado documento oficial.'})
    };
    const opts={subtitle:(group.group?group.group+' · ':'')+group.name,
      chips:[{label:CFG.status[p.status].name,color:group.color}],
      facts:[{value:km('service')+' km',label:'en servicio'},{value:km('construction')+' km',label:'en obras'},{value:km('project')+' km',label:'en proyecto'}]};
    showInfo('Corredor de alta velocidad',p.branch,fields,opts);
    onChange?.();
    // Trenes por el tramo seleccionado (oferta.js): el tramo IGN de ancho estándar más próximo a su punto medio (≤ 150 m).
    if(p.status!=='service'||!root.AtlasOffer)return;
    const geom=data.corridors.features.find(f=>f.properties.id===p.id)?.geometry;
    const line=geom?.type==='MultiLineString'?geom.coordinates.flat():geom?.coordinates;
    if(!line?.length)return;
    const mid=line[Math.floor(line.length/2)];
    const fid=root.AtlasOffer.nearestEdge(dataset.rail.features,mid,150,q=>q.nominalgauge===1435);
    if(fid===null)return;
    root.AtlasOffer.forEdge(fid).then(x=>{
      if(!x||state.corridor!==p.branch||$('#info').hidden||$('#name').textContent!==p.branch)return;
      const scroll=$('#info').scrollTop;
      showInfo('Corredor de alta velocidad',p.branch,{
        'Trenes por el tramo seleccionado':x.by.map(([n,c])=>n+' '+c).join(' · ')+' ('+x.label+').',
        'Qué no está contado':'OUIGO (su horario oficial no trae el recorrido) e iryo (sin horarios abiertos). En los corredores con competencia, la CNMC atribuye a estos dos operadores una parte importante de los viajeros.',
        ...fields},{...opts,keepFocus:true,facts:[{value:number.format(x.trains),label:'trenes Renfe al día por aquí'},...opts.facts.slice(0,2)]});
      $('#info').scrollTop=scroll;
    }).catch(e=>console.warn(e));
  }
  function experienceInfo(e){
    state.experience=e.id;state.variant=null;state.corridor=null;renderHighlight();
    const m=data.tourism.meta,src=m.sources[e.sources[0]];
    const group=CFG.tourism.find(t=>t.id===e.group);
    const statusText={current:'Oferta vigente',unconfirmed:'Sin oferta vigente confirmada',historical:'Histórico'}[e.status];
    const fields={
      ...(e.programme&&{'Programa':e.programme}),
      'Tipo':group.name+(e.days?' · '+e.days:''),
      'Organizador':e.organizer,'Estado':statusText,
      ...(e.calendar&&{'Calendario':e.calendar}),
      ...(e.stops?.length&&{'Estaciones ferroviarias citadas':e.stops.map(s=>s.name).join(' → ')}),
      ...(e.stations_note&&{'Nota sobre las estaciones':e.stations_note}),
      ...(e.bus&&{'Fuera de la vía':e.bus}),
      ...(e.note&&{'Nota':e.note}),
      'Trazado':e.edges?.length?'Vía entre las estaciones citadas, inferida sobre la red IGN. Los traslados en autocar no se dibujan.':'Sin recorrido ferroviario publicado: solo se marca la estación de salida.'
    };
    showInfo('Tren turístico',e.name,fields,{subtitle:e.organizer,chips:[{label:group.name,color:group.color}]});
    if(e.stops?.length)fit(e.stops.map(s=>s.coordinates));
    onChange?.();
  }
  async function onClick(e){
    if(root.AtlasTransport?.hit(e.point))return;
    const box=[[e.point.x-6,e.point.y-6],[e.point.x+6,e.point.y+6]];
    const stops=map.queryRenderedFeatures(box,{layers:['cx-stops']});
    if(stops.length){
      const sid=stops[0].properties.sid;
      if(state.theme==='tourism'){const name=sid.slice(2);const list=data.tourism.experiences.filter(x=>x.status==='current'&&state.keys.tourism.includes(x.group)&&x.stops.some(s=>s.name===name));
        if(list.length===1)experienceInfo(list[0]);else showInfo('Estación · trenes turísticos',name,{'Experiencias con salida o parada aquí':list.map(x=>x.name).join('\n')},{actionsLabel:'Experiencias'},list.map(x=>({label:x.name,action:()=>experienceInfo(x)})));}
      else{await Promise.all([root.AtlasThemes?.prepareConnections(),root.AtlasTransport?.load()]).catch(()=>{});stationInfo(sid);}
      return;
    }
    // Una estación del catálogo bajo el cursor tiene prioridad sobre la línea del tema.
    if(map.getLayer('stations')&&map.getLayoutProperty('stations','visibility')!=='none'&&map.queryRenderedFeatures(e.point,{layers:['stations']}).length)return;
    const lines=map.queryRenderedFeatures(box,{layers:['cx-hit']});
    if(!lines.length)return;
    const p=lines[0].properties;
    if(state.theme==='corridors'){corridorInfo(data.corridors.features.find(f=>f.properties.id===p.sid).properties);return;}
    if(state.theme==='tourism'){const list=data.tourism.experiences.filter(x=>x.status==='current'&&x.edges.includes(p.fid)&&state.keys.tourism.includes(x.group));
      if(list.length===1)experienceInfo(list[0]);else showInfo('Vía de trenes turísticos','Experiencias por este tramo',{'Experiencias':list.map(x=>x.name).join('\n')},{actionsLabel:'Experiencias'},list.map(x=>({label:x.name,action:()=>experienceInfo(x)})));return;}
    const variants=p.vid?activeVariants().filter(v=>v.id===p.vid):activeVariants().filter(v=>v.edges.includes(p.fid));
    if(variants.length===1){selectVariant(variants[0].id);return;}
    const keys=[...new Set(variants.map(v=>variantKey(v,state.theme)))].map(k=>styleOf(state.theme,k).name);
    showInfo('Tramo compartido','Rutas que pasan por aquí',{'Marcas o servicios':keys.join(' · '),'Rutas vigentes':number.format(new Set(variants.map(v=>v.relation)).size)+' relaciones, '+number.format(variants.length)+' variantes. Elige una para ver sus paradas.',
      'Trazado':'Inferido sobre la red IGN a partir de las paradas del horario.'},{},relationButtons(variants));
  }

  /* ── panel ────────────────────────────────────────────── */
  function themeList(){
    const box=$('#theme-list');box.replaceChildren();
    for(const id of CFG.themeOrder){
      const t=CFG.themes[id],label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span'),hint=document.createElement('small');
      label.className='theme-option';input.type='radio';input.name='theme';input.value=id;input.checked=state.theme===id;
      input.onchange=()=>setTheme(id);
      text.textContent=t.name;hint.textContent=t.hint;text.append(hint);label.append(input,text);box.append(label);
    }
  }
  function checkboxGroup(title,items,selected,counts,onToggle){
    const fs=document.createElement('fieldset'),lg=document.createElement('legend');lg.textContent=title;fs.append(lg);
    const tools=document.createElement('div');tools.className='group-tools';
    for(const [label,all] of [['Todas',true],['Ninguna',false]]){const b=document.createElement('button');b.type='button';b.className='link';b.textContent=label;
      b.onclick=()=>{onToggle(all?items.map(i=>i.id):[]);};tools.append(b);}
    fs.append(tools);
    for(const item of items){
      const row=document.createElement('label'),input=document.createElement('input'),sw=document.createElement('i'),name=document.createElement('span'),count=document.createElement('span');
      row.className='row';input.type='checkbox';input.checked=selected.includes(item.id);
      input.onchange=()=>onToggle(input.checked?[...selected,item.id]:selected.filter(x=>x!==item.id));
      sw.className='swatch'+(item.dash?' dashed':'')+(item.double?' double':'')+(item.marker==='square'?' square':'');sw.style.setProperty('--c',item.color);
      name.textContent=item.name+(item.operator?' · '+item.operator.replace(' Viajeros',''):'');
      count.className='count';count.textContent=counts?.[item.id]??'';
      row.append(input,sw,name,count);fs.append(row);
    }
    return fs;
  }
  function note(text,cls='muted'){const p=document.createElement('p');p.className=cls;p.textContent=text;return p;}
  function renderPanel(){
    const panel=$('#theme-panel');panel.replaceChildren();
    $('#gauge-panel').hidden=state.theme!=='gauge';
    $('#legacy-panel').hidden=!['tent','transit'].includes(state.theme);
    if(['gauge','tent','transit'].includes(state.theme))return;
    const theme=state.theme;
    if(theme==='all'){allPanel(panel);return;}
    if(theme==='corridors'){
      if(!data.corridors){panel.append(note('Cargando corredores…'));return;}
      const km={};for(const f of data.corridors.features){const p=f.properties;if(p.status==='service')km[p.corridor]=(km[p.corridor]||0)+p.km;}
      const counts=Object.fromEntries(Object.entries(km).map(([k,v])=>[k,number.format(Math.round(v))+' km']));
      panel.append(checkboxGroup('Corredores (km en servicio)',CFG.corridors.map(c=>({...c,name:(c.group?c.group.replace(' y litoral mediterráneo','')+': ':'')+c.name})),state.keys.corridors,counts,v=>{state.keys.corridors=v;refresh();}));
      panel.append(checkboxGroup('Estado de la infraestructura',Object.entries(CFG.status).map(([id,s])=>({id,name:s.name,color:'#586278',dash:id!=='service'})),state.statuses,null,v=>{state.statuses=v;refresh();}));
      return;
    }
    if(theme==='tourism'){
      if(!data.tourism){panel.append(note('Cargando trenes turísticos…'));return;}
      const ex=data.tourism.experiences,counts={};for(const t of CFG.tourism)counts[t.id]=ex.filter(e=>e.group===t.id&&e.status==='current').length;
      panel.append(checkboxGroup('Trenes turísticos vigentes',CFG.tourism,state.keys.tourism,counts,v=>{state.keys.tourism=v;refresh();}));
      const list=document.createElement('ul');list.className='plain-list';
      for(const e of ex.filter(x=>x.status==='current'&&state.keys.tourism.includes(x.group))){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=(e.programme?e.programme.replace('Trenes Turísticos de ','')+': ':'')+e.name;b.onclick=()=>experienceInfo(e);li.append(b);list.append(li);}
      panel.append(list);
      const off=ex.filter(x=>x.status!=='current');
      const d=document.createElement('details');d.className='inline';const s=document.createElement('summary');s.textContent='Sin oferta vigente confirmada ('+off.length+')';d.append(s);
      const ul=document.createElement('ul');ul.className='plain-list';for(const e of off){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=(e.programme?e.programme.replace('Trenes Turísticos de ','')+': ':'')+e.name;b.onclick=()=>experienceInfo(e);li.append(b);ul.append(li);}
      d.append(ul);panel.append(d);
      panel.append(note('Criterio: '+data.tourism.meta.criteria.current));
      return;
    }
    if(!services()){panel.append(note('Cargando horarios…'));return;}
    const s=services(),items=theme==='brands'?CFG.brands:CFG.services;
    const counts={};
    for(const item of items){
      const vs=s.variants.filter(v=>variantStatus(v)==='current'&&(theme==='brands'?v.brand===item.id:v.categories.includes(item.id)));
      counts[item.id]=vs.length?number.format(new Set(vs.map(v=>v.relation)).size)+' rutas':'0';
    }
    panel.append(checkboxGroup(theme==='brands'?'Marcas de alta velocidad':'Tipos de servicio',items,state.keys[theme],counts,v=>{state.keys[theme]=v;refresh();}));
    const selected=state.keys[theme];
    if(theme==='brands'&&selected.includes('iryo')){
      const box=document.createElement('div');box.className='notice';
      box.append(note('iryo: '+s.meta.iryo_note,'notice-text'));
      const ul=document.createElement('ul');ul.className='plain-list compact';for(const r of s.meta.iryo){const li=document.createElement('li');li.textContent=r.origin+' – '+r.destination+' · paradas citadas: '+r.listed_stops.join(', ');ul.append(li);}
      box.append(ul);panel.append(box);
    }
    if(theme==='brands'&&selected.includes('ouigo'))panel.append(note('OUIGO: '+s.meta.ouigo_note));
    if(theme==='services'){
      if(Object.keys(CFG.families).length){
      const d=document.createElement('details');d.className='inline gallery';const sum=document.createElement('summary');sum.textContent='Ver la nueva imagen de los trenes Renfe';d.append(sum);
      for(const [id,f] of Object.entries(CFG.families)){const fig=document.createElement('figure'),img=document.createElement('img'),cap=document.createElement('figcaption');
        img.src=f.img;img.alt=f.alt;img.loading='lazy';img.width=280;img.height=80;cap.textContent=f.name+' · '+f.group;fig.append(img,cap);d.append(fig);}
      d.append(note('Recreaciones generadas con IA por Renfe para presentar la nueva organización de servicios; los trenes reales la adoptan poco a poco. © Renfe · trenes.renfe.com, consultado el 18-11-2026.'));
      panel.append(d);}
    }
    if(!activeVariants().length)panel.append(note(selected.length?'Ninguna ruta vigente con esta selección. Elige otra marca o servicio.':'No hay ninguna marca o servicio seleccionado.','muted status-line'));
  }

  /* ── leyenda ──────────────────────────────────────────── */
  function legendItems(){
    const t=state.theme;
    if(t==='corridors')return [...CFG.corridors.filter(c=>state.keys.corridors.includes(c.id)).map(c=>({name:(c.group?'Levante y litoral · ':'')+c.name,color:c.color,double:c.double})),
      ...state.statuses.map(s=>({name:CFG.status[s].name,color:'#586278',dash:s!=='service',pattern:s}))];
    if(t==='brands')return CFG.brands.filter(b=>state.keys.brands.includes(b.id)).map(b=>({name:b.name+(b.id==='iryo'?' (sin trazado verificado)':''),color:b.color}));
    if(t==='services')return CFG.services.filter(s=>state.keys.services.includes(s.id)).map(s=>({name:s.name,color:s.color,dash:!!s.dash}));
    if(t==='all')return [...dimension().items.filter(x=>classKm()[x.id+'_n']).map(x=>({name:x.name,color:x.color})),{name:'Vía doble (trazo grueso)',color:'#586278',thick:true}];
    if(t==='tourism')return CFG.tourism.filter(x=>state.keys.tourism.includes(x.id)).map(x=>({name:x.name,color:x.color}));
    return null;
  }
  function legend(container){
    const items=legendItems();if(!items)return false;
    const h=document.createElement('strong');h.textContent=CFG.themes[state.theme].name+(state.theme==='all'?' · '+dimension().name.toLowerCase():'');container.append(h);
    const ul=document.createElement('ul');
    for(const item of items){const li=document.createElement('li'),sw=document.createElement('i');sw.className='swatch'+(item.dash?' dashed':'')+(item.double?' double':'')+(item.pattern==='project'?' dotted':'')+(item.thick?' thick':'');
      sw.style.setProperty('--c',item.color);li.append(sw,document.createTextNode(item.name));ul.append(li);}
    if(['brands','services','tourism'].includes(state.theme)){const li=document.createElement('li'),sw=document.createElement('i');sw.className='stop-key';li.append(sw,document.createTextNode('Parada comercial acreditada'));ul.append(li);}
    if(state.variant||state.experience){for(const [name,cls] of [['Recorrido elegido por vía de alta velocidad',''],['Recorrido elegido por vía convencional',' dashed']]){const li=document.createElement('li'),sw=document.createElement('i');sw.className='swatch'+cls;sw.style.setProperty('--c','#1d2638');li.append(sw,document.createTextNode(name));ul.append(li);}}
    container.append(ul);return true;
  }

  /* ── Todas las vías ───────────────────────────────────── */
  const dimension=()=>CFG.classifications[state.dim]||CFG.classifications.perf;
  const valueOf=(d,p)=>{const v=p[d.prop];const item=d.items.find(i=>(i.values||[i.id]).includes(String(v)));return item?item.id:'none';};
  function allColor(){
    const d=dimension(),pairs=[];
    for(const it of d.items)for(const v of (it.values||[it.id]))pairs.push(v,it.color);
    return ['case',['boolean',['feature-state','selected'],false],'#101e36',['match',['to-string',['coalesce',['get',d.prop],'none']],...pairs,'#A0A7B2']];
  }
  const kmCache={};
  function classKm(){
    const d=dimension();if(kmCache[state.dim])return kmCache[state.dim];
    const out={},ids=new Set();
    for(const f of dataset.rail.features){
      const p=f.properties;if(!p.pen||ids.has(p.id))continue;ids.add(p.id);
      const k=valueOf(d,p);out[k]=(out[k]||0)+(p.attr!==0?(Number(p.length_m)||0)/1000:0);out[k+'_n']=(out[k+'_n']||0)+1;
    }
    return kmCache[state.dim]=out;
  }
  // Derivaciones particulares documentadas en el manual sin geometría oficial: se citan, no se dibujan.
  const sidings=[
    ['Sector energético e industrial','Samper–Andorra (Teruel; Carboex, de Endesa) · Adisseo (Villalonquéjar, Burgos) · Solvay (Torrelavega) · Naturgy (central de Meirama, A Coruña) · CLH (Escombreras, Torrejón de Ardoz) · Cepsa (Huelva) · Repsol (Tarragona y Puertollano)'],
    ['Otros sectores','Azvi (Alcalá de Guadaíra) · Talgo (Las Matas) · CAF (Beasain) · Stadler (Massalfassar) · Seat (Martorell, Can Tunis) · Renault (Valladolid-La Carrera, Palencia)'],
    ['Sin servicio','Ramal de Cella (Teruel) al polígono «Platea» y al complejo aeroportuario de Caudé']];
  function allPanel(panel){
    const seg=document.createElement('div');seg.className='segmented dims';seg.setAttribute('role','radiogroup');seg.setAttribute('aria-label','Clasificar la red por');
    for(const [id,d] of Object.entries(CFG.classifications)){
      const l=document.createElement('label'),i=document.createElement('input');i.type='radio';i.name='dim';i.value=id;i.checked=state.dim===id;
      i.onchange=()=>{state.dim=id;map.setPaintProperty('rail','line-color',allColor());renderPanel();onChange?.();};l.append(i,document.createTextNode(' '+d.name));seg.append(l);
    }
    panel.append(seg);
    const d=dimension(),km=classKm();let group=null,ul;
    const flush=()=>{if(ul)panel.append(ul);};
    for(const t of d.items){
      if(t.group!==undefined&&t.group!==group){flush();group=t.group;if(group){const h=document.createElement('p');h.className='type-group';h.textContent=group;panel.append(h);}ul=null;}
      ul??=document.createElement('ul');ul.className='type-list';
      const li=document.createElement('li'),sw=document.createElement('i'),name=document.createElement('span'),count=document.createElement('span');
      sw.className='swatch';sw.style.setProperty('--c',t.color);name.textContent=t.name;count.className='count';
      const n=km[t.id+'_n']||0;
      count.textContent=n?(km[t.id]>=1?number.format(Math.round(km[t.id]))+' km':number.format(n)+' tramos'):'sin tramos';
      if(!n)li.classList.add('empty');
      li.append(sw,name,count);ul.append(li);
    }
    flush();
    const notes={
      perf:'Alta velocidad: tramos de los ejes «A.V.» del catálogo de Adif y la concesión LFP Perthus. Sin determinar: ancho estándar sin correspondencia con ninguna red oficial.',
      net:'Cada tramo del IGN se compara con el catálogo de Adif y los trazados oficiales de FGC, FGV, Euskotren, Metro Bilbao y el CRTM. Sin identificar: apartaderos, vías de servicio y redes sin geometría oficial integrada.',
      gauge:'El IGN no distingue el ancho mixto (tercer carril): esos tramos figuran con uno de los dos anchos.'};
    panel.append(note(notes[state.dim]+' Trazo grueso: vía doble.'));
    if(state.dim==='net'){
      const det=document.createElement('details');det.className='inline';const sum=document.createElement('summary');sum.textContent='Otras derivaciones particulares (sin trazado oficial)';det.append(sum);
      for(const [t,txt] of sidings){const p=document.createElement('p');p.className='muted';const b=document.createElement('strong');b.textContent=t+': ';p.append(b,document.createTextNode(txt));det.append(p);}
      panel.append(det);
    }
  }
  // Servicios con trazado vigente por un tramo IGN (ficha del tramo).
  function servicesOnEdge(fid){
    const s=services();if(!s)return [];
    const out=new Set();
    for(const v of s.variants){
      if(variantStatus(v)!=='current'||!v.edges.includes(fid))continue;
      const brand=CFG.brands.find(b=>b.id===v.brand),svc=CFG.services.find(x=>v.categories.includes(x.id));
      out.add(brand?brand.name:svc?svc.name.split(' · ').at(-1).replace(/^ahora /,''):v.published_brand);
    }
    return [...out];
  }
  function corridorsForLine(code){
    if(!data.corridors||!code)return [];
    const out=new Set();
    for(const f of data.corridors.features){const p=f.properties;if(p.line_code&&String(p.line_code)===String(code)){const c=CFG.corridors.find(x=>x.id===p.corridor);out.add(c?.group||c?.name);}}
    return [...out].filter(Boolean);
  }

  /* ── API ──────────────────────────────────────────────── */
  async function setTheme(id,{silent}={}){
    if(!CFG.themes[id])id='corridors';
    state.theme=id;state.variant=null;state.experience=null;state.corridor=null;state.station=null;
    for(const input of document.querySelectorAll('input[name="theme"]'))input.checked=input.value===id;
    const base=id==='gauge',all=id==='all';
    map.setPaintProperty('rail','line-color',base?root.AtlasBaseRailColor:all?allColor():['case',['boolean',['feature-state','selected'],false],'#101e36','#b3bfd0']);
    map.setPaintProperty('rail','line-opacity',base||all?.95:.9);
    // En «Todas las vías» la vía doble se dibuja más gruesa que la única.
    const double=['in',['get','filter_tracks'],['literal',['2','4']]];
    map.setPaintProperty('rail','line-width',all?['interpolate',['linear'],['zoom'],5,['case',double,1.3,.8],12,['case',double,3.6,2.2],16,['case',double,5,3]]:['interpolate',['linear'],['zoom'],5,.9,8,1.5,12,2.8,16,4]);
    if(['tent','transit'].includes(id))legacy?.change(id==='tent'?'corridors':'transit');else legacy?.change('gauge',{silent:true});
    renderPanel();
    try{if(files[id])data[id==='brands'?'services':id]=await load(id);}catch(e){$('#theme-panel').replaceChildren(note(e.message+' Reintenta más tarde.','notice-text'));}
    if(state.theme!==id)return;
    refresh(silent);
  }
  function refresh(silent){
    if(!map.getSource('cx-lines'))return;
    if(['corridors','brands','services','tourism'].includes(state.theme))buildLines();
    else{map.getSource('cx-lines').setData({type:'FeatureCollection',features:[]});map.getSource('cx-stops').setData({type:'FeatureCollection',features:[]});renderHighlight();}
    renderPanel();if(!silent)onChange?.();
  }
  function init(options){
    ({map,dataset,showInfo,onChange,legacy}=options);
    ensureLayers();themeList();
  }
  function getState(){
    return {t:state.theme,k:state.keys[state.theme]&&state.keys[state.theme].join(','),st:state.theme==='corridors'?state.statuses.join(','):undefined,d:state.theme==='all'?state.dim:undefined,v:state.variant||undefined,x:state.experience||undefined};
  }
  async function restore(s){
    if(!s)return setTheme(state.theme);
    if(typeof s.k==='string'&&state.keys[s.t]){const allowed=(s.t==='brands'?CFG.brands:s.t==='services'?CFG.services:s.t==='tourism'?CFG.tourism:CFG.corridors).map(x=>x.id);state.keys[s.t]=s.k.split(',').filter(x=>allowed.includes(x));}
    if(typeof s.d==='string'&&CFG.classifications[s.d])state.dim=s.d;
    if(typeof s.st==='string')state.statuses=s.st.split(',').filter(x=>CFG.status[x]);
    await setTheme(s.t||state.theme,{silent:true});
    if(s.v&&services()?.variants.some(v=>v.id===s.v))selectVariant(s.v);
    if(s.x&&data.tourism){const e=data.tourism.experiences.find(x=>x.id===s.x);if(e)experienceInfo(e);}
  }
  function clearSelection(){state.variant=null;state.experience=null;state.corridor=null;state.station=null;if(map.getSource('cx-lines')){renderHighlight();if(['brands','services','tourism'].includes(state.theme))buildLines();}onChange?.();}
  function hasStation(code){const s=services();if(!s||!code)return null;const id='renfe-national:'+code;return s.stations[id]?id:(s.stations['renfe-commuter:'+code]?'renfe-commuter:'+code:null);}
  async function loadServices(){if(!data.services)data.services=await load('services');return data.services;}
  root.AtlasCapas={init,hasStation,loadServices,setTheme,legend,legendItems,getState,restore,clearSelection,current:()=>state.theme,stationInfo,servicesOnEdge,corridorsForLine,
    hitLayers:()=>['cx-stops','cx-hit'].filter(id=>map?.getLayer(id))};
})(window);
