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
    statuses:['service','construction','project'],variant:null,station:null,experience:null,corridor:null};
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
    map.addLayer({id:'cx-border',type:'symbol',source:'cx-border',layout:{'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':12,'text-anchor':['get','anchor'],'text-max-width':12,'text-allow-overlap':true},paint:{'text-color':'#273a5f','text-halo-color':'#fbfbfb','text-halo-width':2}});
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
    if(fr.size)out.push({type:'Feature',geometry:{type:'Point',coordinates:[2.87,42.46]},properties:{label:'Continúa a Francia: '+[...fr].slice(0,4).join(', '),anchor:'bottom-right'}});
    if(pt.size)out.push({type:'Feature',geometry:{type:'Point',coordinates:[-8.65,42.05]},properties:{label:'Continúa a Portugal: '+[...pt].slice(0,3).join(', '),anchor:'top-right'}});
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
  function source(id){const s=services()?.meta.sources[id];return s?{title:s.title,url:s.url}:{title:'Fuente no disponible',url:'#'};}
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
      'Producto':brand?brand.name+' · marca de '+brand.operator:(v.published_brand+(v.aliases?.length?' · alias: '+v.aliases.join(', '):'')),
      'Operador':v.operator,
      'Origen y destino':v.origin+' → '+v.destination,
      ['Paradas comerciales ('+v.calls.length+')']:v.calls.map((c,i)=>(i+1)+'. '+s.stations[c.s].name+flags(c)).join('\n'),
      'Esta variante':siblings.length>1?'Una de '+siblings.length+' variantes con el mismo origen y destino; cada una tiene sus propias paradas. Elige otra en la ficha de una estación.':'Única variante vigente de esta relación.',
      'Vigencia':val?(val.note?val.note+' ('+fmtDate(val.from)+')':'Del '+fmtDate(val.from)+' al '+fmtDate(val.to))+(v.trips?' · '+number.format(v.trips)+' circulaciones en el calendario publicado':'')+(v.calendar_note?' · '+v.calendar_note:''):'Sin calendario',
      'Recorrido':v.trace==='gtfs'?'Forma publicada en el GTFS del operador.':
        'Trazado inferido sobre la red IGN entre paradas consecutivas (no es dato del operador). '+number.format(Math.round(hs/1000))+' km por vía de ancho estándar (alta velocidad) y '+number.format(Math.round(conv/1000))+' km por vía convencional; en el mapa, línea continua y discontinua.'+
        (v.pending_segments?' '+v.pending_segments+' de '+v.segments+' saltos entre paradas sin trazado verificable: no se dibujan.':'')+(v.international?' Continúa fuera del ámbito: '+v.international.join(', ')+'.':''),
      ...(v.madrid_assumed&&{'Estación de Madrid':'La tabla oficial solo dice «Madrid»; la estación usada para el trazado es una suposición del visor.'})
    };
    if(v.numbers?.length)fields['Números de tren']=v.numbers.slice(0,12).join(', ')+(v.numbers.length>12?'…':'');
    if(v.aliases?.length)fields['Denominación']='En el horario: '+v.published_brand+' · denominación anterior: '+v.aliases.join(', ')+'. Renfe reorganizó sus marcas desde el 13-11-2026 (Alvia → Intercity, Media Distancia → Regional, Euromed → AVE Euromed).';
    showInfo('Ruta · '+(brand?brand.name:CFG.services.find(x=>x.id===v.categories[0])?.name||v.published_brand),names[0]+' → '+names.at(-1),fields,source(v.source),null,media(familyOf(v)));
  }
  function selectVariant(id){state.variant=id;state.experience=null;state.corridor=null;renderHighlight();variantInfo(services().variants.find(v=>v.id===id));
    const v=services().variants.find(x=>x.id===id);fit(v.calls.map(c=>services().stations[c.s].coordinates));onChange?.();}
  function fit(points){if(!points.length)return;const lons=points.map(p=>p[0]),lats=points.map(p=>p[1]);
    map.fitBounds([[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]],{padding:{top:60,bottom:window.innerWidth<=760?Math.round(window.innerHeight*.5):60,left:window.innerWidth>760?340:30,right:window.innerWidth>760?340:30},maxZoom:11,duration:reduced()?0:700});}
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
    const brands=[...new Set(calling.map(v=>v.brand).filter(Boolean))].map(b=>CFG.brands.find(x=>x.id===b).name);
    const cats=[...new Set(calling.flatMap(v=>v.categories))].map(c=>CFG.services.find(x=>x.id===c)?.name).filter(Boolean);
    const fields={
      'Marcas con parada comercial':brands.join(' · ')||'Ninguna de AVE, Avlo, iryo u OUIGO',
      'Servicios con parada comercial':cats.join(' · ')||'—',
      'Criterio':'Solo cuentan los trenes con parada acreditada en el horario; los que pasan sin parar (sin subida ni bajada) no se cuentan.',
      'Código de estación':st.official_id
    };
    showInfo('Estación · servicios que paran',st.name,fields,source(st.source==='renfe-commuter'?'renfe-commuter':'renfe-national'),relationButtons(calling));
    buildLines();onChange?.();
  }
  function corridorInfo(p){
    const group=CFG.corridors.find(c=>c.id===p.corridor);
    state.corridor=p.branch;state.variant=null;state.experience=null;renderHighlight();
    const sections=data.corridors.features.filter(f=>f.properties.branch===p.branch).map(f=>f.properties);
    const km=k=>number.format(Math.round(sections.filter(s=>s.status===k).reduce((a,s)=>a+s.km,0)));
    const fields={
      'Grupo':(group.group?group.group+' · ':'')+group.name,
      'Ramal o tramo':p.branch,
      'Tramo pulsado':p.name+' · '+CFG.status[p.status].name+' · '+number.format(p.km)+' km',
      'Estado del ramal':'En servicio '+km('service')+' km · en construcción '+km('construction')+' km · en proyecto '+km('project')+' km',
      'Tramos del ramal':[...new Set(sections.map(s=>s.name+' ('+CFG.status[s.status].name.toLowerCase()+')'))].join('\n'),
      'Trenes de alta velocidad':p.high_speed_trains?'Hay servicios AVE, Avlo, OUIGO, Avant o Euromed programados por este tramo en el corte.':'Ningún tren de alta velocidad programado por este tramo en el corte (16-11-2026).',
      'Código de línea (Hermes)':p.line_code,
      ...(p.status_note&&{'Estado actualizado':{title:p.status_note,url:p.status_note_url}}),
      ...(p.corridor==='sur'&&{'NAFA':'Nuevo Acceso Ferroviario a Andalucía: nombre del proyecto de la línea Madrid–Sevilla, inaugurada en 1992. Los ramales de Málaga y Granada salen de ella. Fuente secundaria; no se ha localizado documento oficial.'})
    };
    showInfo('Corredor de alta velocidad · '+(group.group||group.name),p.branch,fields,{title:'Hermes · Ministerio de Transportes ('+fmtDate(p.source_date)+')',url:p.source_url});
    onChange?.();
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
      'Trazado':e.edges?.length?'Vía entre las estaciones citadas, inferida sobre la red IGN. Los traslados en autocar no se dibujan.'+(e.pending_segments?' '+e.pending_segments+' salto sin trazado verificable.':''):'Sin recorrido ferroviario publicado: solo se marca la estación de salida.',
      'Otras fuentes':e.sources.slice(1).map(id=>m.sources[id]?.title).filter(Boolean).join(' · ')||'—'
    };
    showInfo('Tren turístico · '+group.name,e.name,fields,{title:src.title,url:src.url});
    if(e.stops?.length)fit(e.stops.map(s=>s.coordinates));
    onChange?.();
  }
  function onClick(e){
    const box=[[e.point.x-6,e.point.y-6],[e.point.x+6,e.point.y+6]];
    const stops=map.queryRenderedFeatures(box,{layers:['cx-stops']});
    if(stops.length){
      const sid=stops[0].properties.sid;
      if(state.theme==='tourism'){const name=sid.slice(2);const list=data.tourism.experiences.filter(x=>x.status==='current'&&state.keys.tourism.includes(x.group)&&x.stops.some(s=>s.name===name));
        if(list.length===1)experienceInfo(list[0]);else showInfo('Estación · trenes turísticos',name,{'Experiencias con salida o parada aquí':list.map(x=>x.name).join('\n')},{title:'Renfe · Trenes turísticos',url:data.tourism.meta.sources.S11.url},list.map(x=>({label:x.name,action:()=>experienceInfo(x)})));}
      else stationInfo(sid);
      return;
    }
    // Una estación del catálogo bajo el cursor tiene prioridad sobre la línea del tema.
    if(map.getLayer('stations')&&map.getLayoutProperty('stations','visibility')!=='none'&&map.queryRenderedFeatures(e.point,{layers:['stations']}).length)return;
    const lines=map.queryRenderedFeatures(box,{layers:['cx-hit']});
    if(!lines.length)return;
    const p=lines[0].properties;
    if(state.theme==='corridors'){corridorInfo(data.corridors.features.find(f=>f.properties.id===p.sid).properties);return;}
    if(state.theme==='tourism'){const list=data.tourism.experiences.filter(x=>x.status==='current'&&x.edges.includes(p.fid)&&state.keys.tourism.includes(x.group));
      if(list.length===1)experienceInfo(list[0]);else showInfo('Vía de trenes turísticos','Experiencias por este tramo',{'Experiencias':list.map(x=>x.name).join('\n')},{title:'Renfe · Trenes turísticos',url:data.tourism.meta.sources.S11.url},list.map(x=>({label:x.name,action:()=>experienceInfo(x)})));return;}
    const variants=p.vid?activeVariants().filter(v=>v.id===p.vid):activeVariants().filter(v=>v.edges.includes(p.fid));
    if(variants.length===1){selectVariant(variants[0].id);return;}
    const keys=[...new Set(variants.map(v=>variantKey(v,state.theme)))].map(k=>styleOf(state.theme,k).name);
    showInfo('Tramo compartido','Rutas que pasan por aquí',{'Marcas o servicios':keys.join(' · '),'Rutas vigentes':number.format(new Set(variants.map(v=>v.relation)).size)+' relaciones, '+number.format(variants.length)+' variantes. Elige una para ver sus paradas.',
      'Trazado':'Inferido sobre la red IGN a partir de las paradas del horario.'},source('renfe-national'),relationButtons(variants));
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
    if(theme==='corridors'){
      if(!data.corridors){panel.append(note('Cargando corredores…'));return;}
      const km={};for(const f of data.corridors.features){const p=f.properties;if(p.status==='service')km[p.corridor]=(km[p.corridor]||0)+p.km;}
      const counts=Object.fromEntries(Object.entries(km).map(([k,v])=>[k,number.format(Math.round(v))+' km']));
      panel.append(checkboxGroup('Corredores (km en servicio)',CFG.corridors.map(c=>({...c,name:(c.group?c.group.replace(' y litoral mediterráneo','')+': ':'')+c.name})),state.keys.corridors,counts,v=>{state.keys.corridors=v;refresh();}));
      panel.append(checkboxGroup('Estado de la infraestructura',Object.entries(CFG.status).map(([id,s])=>({id,name:s.name,color:'#586278',dash:id!=='service'})),state.statuses,null,v=>{state.statuses=v;refresh();}));
      panel.append(note('Geometría y estado: Hermes (Ministerio de Transportes, febrero de 2024), con Murcia–Almería actualizado a «en construcción» por una nota oficial de 2026. El eje Madrid–Levante y el corredor litoral comparten color; el litoral va en doble trazo.'));
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
      panel.append(note(s.meta.renames.note,'notice-text'));
      if(Object.keys(CFG.families).length){
      const d=document.createElement('details');d.className='inline gallery';const sum=document.createElement('summary');sum.textContent='Ver la nueva imagen de los trenes Renfe';d.append(sum);
      for(const [id,f] of Object.entries(CFG.families)){const fig=document.createElement('figure'),img=document.createElement('img'),cap=document.createElement('figcaption');
        img.src=f.img;img.alt=f.alt;img.loading='lazy';img.width=280;img.height=80;cap.textContent=f.name+' · '+f.group;fig.append(img,cap);d.append(fig);}
      d.append(note('Recreaciones generadas con IA por Renfe para presentar la nueva organización de servicios; los trenes reales la adoptan poco a poco. © Renfe · trenes.renfe.com, consultado el 18-11-2026.'));
      panel.append(d);}
    }
    if(theme==='services'&&selected.includes('alvia'))panel.append(note('Alvia: '+s.meta.alvia.status+' '+s.meta.alvia.detail,'notice-text'));
    if(theme==='services'&&selected.includes('night'))panel.append(note('Nocturnos: '+s.meta.night.status+' Criterio: '+s.meta.night.criterion,'notice-text'));
    const future=s.variants.filter(v=>variantStatus(v)==='future'&&(theme==='brands'?selected.includes(v.brand):v.categories.some(c=>selected.includes(c)))).length;
    const shown=activeVariants().length;
    panel.append(note(shown?'Mostrando '+number.format(shown)+' variantes vigentes. Calendario del GTFS de Renfe del 16-11-2026'+(future?' · '+future+' variantes que empiezan después del 16-12-2026 quedan fuera':'')+'. Pulsa una línea o una estación para ver rutas y paradas.':
      selected.length?'Ninguna ruta vigente con esta selección. Revisa las notas de arriba o elige otra marca o servicio.':'No hay ninguna marca o servicio seleccionado.','muted status-line'));
  }

  /* ── leyenda ──────────────────────────────────────────── */
  function legendItems(){
    const t=state.theme;
    if(t==='corridors')return [...CFG.corridors.filter(c=>state.keys.corridors.includes(c.id)).map(c=>({name:(c.group?'Levante y litoral · ':'')+c.name,color:c.color,double:c.double})),
      ...state.statuses.map(s=>({name:CFG.status[s].name,color:'#586278',dash:s!=='service',pattern:s}))];
    if(t==='brands')return CFG.brands.filter(b=>state.keys.brands.includes(b.id)).map(b=>({name:b.name+(b.id==='iryo'?' (sin trazado verificado)':''),color:b.color}));
    if(t==='services')return CFG.services.filter(s=>state.keys.services.includes(s.id)).map(s=>({name:s.name,color:s.color,dash:!!s.dash}));
    if(t==='tourism')return CFG.tourism.filter(x=>state.keys.tourism.includes(x.id)).map(x=>({name:x.name,color:x.color}));
    return null;
  }
  function legend(container){
    const items=legendItems();if(!items)return false;
    const h=document.createElement('strong');h.textContent=CFG.themes[state.theme].name;container.append(h);
    const ul=document.createElement('ul');
    for(const item of items){const li=document.createElement('li'),sw=document.createElement('i');sw.className='swatch'+(item.dash?' dashed':'')+(item.double?' double':'')+(item.pattern==='project'?' dotted':'');
      sw.style.setProperty('--c',item.color);li.append(sw,document.createTextNode(item.name));ul.append(li);}
    if(['brands','services','tourism'].includes(state.theme)){const li=document.createElement('li'),sw=document.createElement('i');sw.className='stop-key';li.append(sw,document.createTextNode('Parada comercial acreditada'));ul.append(li);}
    if(state.variant||state.experience){for(const [name,cls] of [['Recorrido elegido por vía de alta velocidad',''],['Recorrido elegido por vía convencional',' dashed']]){const li=document.createElement('li'),sw=document.createElement('i');sw.className='swatch'+cls;sw.style.setProperty('--c','#1d2638');li.append(sw,document.createTextNode(name));ul.append(li);}}
    container.append(ul);return true;
  }

  /* ── API ──────────────────────────────────────────────── */
  async function setTheme(id,{silent}={}){
    if(!CFG.themes[id])id='corridors';
    state.theme=id;state.variant=null;state.experience=null;state.corridor=null;state.station=null;
    for(const input of document.querySelectorAll('input[name="theme"]'))input.checked=input.value===id;
    const base=id==='gauge';
    map.setPaintProperty('rail','line-color',base?root.AtlasBaseRailColor:['case',['boolean',['feature-state','selected'],false],'#101e36','#b3bfd0']);
    map.setPaintProperty('rail','line-opacity',base?.95:.9);
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
    return {t:state.theme,k:state.keys[state.theme]&&state.keys[state.theme].join(','),st:state.theme==='corridors'?state.statuses.join(','):undefined,v:state.variant||undefined,x:state.experience||undefined};
  }
  async function restore(s){
    if(!s)return setTheme(state.theme);
    if(typeof s.k==='string'&&state.keys[s.t]){const allowed=(s.t==='brands'?CFG.brands:s.t==='services'?CFG.services:s.t==='tourism'?CFG.tourism:CFG.corridors).map(x=>x.id);state.keys[s.t]=s.k.split(',').filter(x=>allowed.includes(x));}
    if(typeof s.st==='string')state.statuses=s.st.split(',').filter(x=>CFG.status[x]);
    await setTheme(s.t||state.theme,{silent:true});
    if(s.v&&services()?.variants.some(v=>v.id===s.v))selectVariant(s.v);
    if(s.x&&data.tourism){const e=data.tourism.experiences.find(x=>x.id===s.x);if(e)experienceInfo(e);}
  }
  function clearSelection(){state.variant=null;state.experience=null;state.corridor=null;state.station=null;if(map.getSource('cx-lines')){renderHighlight();if(['brands','services','tourism'].includes(state.theme))buildLines();}onChange?.();}
  function hasStation(code){const s=services();if(!s||!code)return null;const id='renfe-national:'+code;return s.stations[id]?id:(s.stations['renfe-commuter:'+code]?'renfe-commuter:'+code:null);}
  async function loadServices(){if(!data.services)data.services=await load('services');return data.services;}
  root.AtlasCapas={init,hasStation,loadServices,setTheme,legend,legendItems,getState,restore,clearSelection,current:()=>state.theme,stationInfo,
    hitLayers:()=>['cx-stops','cx-hit'].filter(id=>map?.getLayer(id))};
})(window);
