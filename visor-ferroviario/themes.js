/* Temas heredados: corredores TEN-T (Hermes) y Cercanías/redes urbanas (GTFS), con las estaciones de
   Metro de Madrid y Metro Ligero (CRTM). Solo España peninsular. */
(function(root){
 'use strict';
 const catalog={};let current='gauge',selected=[];let context;let revision=0;let legendItems=[];
 const number=new Intl.NumberFormat('es-ES');
 const definitions={
  corridors:{file:'tramos-ten-t.geojson',name:'Corredores TEN-T · Hermes 2024'},
  transit:{file:'transit-catalog.json',name:'Servicios urbanos y Cercanías'}
 };
 const tent={'ten-t-atlantico':{name:'Atlántico',color:'#0072B2'},'ten-t-mediterraneo':{name:'Mediterráneo',color:'#AA4499'}};
 const modeName={metro:'Metro','metro-ligero':'Metro Ligero',cercanias:'Cercanías','tram-train':'Tren-tranvía'};
 const pen=f=>{const c=f.geometry.type==='LineString'?f.geometry.coordinates[0]:f.geometry.coordinates[0][0];return root.AtlasConfig.peninsular(c);};
 const lineById=id=>catalog.transit?.lines.find(l=>l.id===id);
 const lineLabel=l=>l.mode==='metro'?'L'+l.code:l.code;
 function options(mode,data){
  if(mode==='corridors')return Object.entries(tent).map(([id,t])=>({id,name:'TEN-T '+t.name,color:t.color}));
  return (catalog.transit?.lines||[]).filter(l=>data.features.some(f=>f.properties.line_id===l.id)).map(l=>({id:l.id,name:[l.network||l.network_id,l.code,l.name].filter(Boolean).join(' · '),color:l.color||'#727C8B'}));
 }
 function matches(f){if(!selected.length)return true;const p=f.properties;return current==='corridors'?(p.corridor_ids||[]).some(id=>selected.includes(id)):selected.includes(p.line_id);}

 /* ── estaciones urbanas (Metro de Madrid y Metro Ligero, CRTM) ── */
 let urban,urbanData=null;
 function loadUrban(){
  urban??=fetch('capas/urbano.json').then(r=>{if(!r.ok)throw new Error('Estaciones urbanas no disponibles');return r.json();}).catch(e=>{urban=undefined;throw e;});
  return urban;
 }
 function metres(a,b){const k=Math.cos((a[1]+b[1])/2*Math.PI/180);return Math.hypot((a[0]-b[0])*k,a[1]-b[1])*111320;}
 function nearbyStations(coordinates,radius){
  if(!urbanData||!catalog.transit)return [];
  const out=[];
  for(const f of urbanData.stations.features){
   const m=metres(coordinates,f.geometry.coordinates);if(m>radius)continue;
   out.push({name:f.properties.name,network:f.properties.network,metres:m,lines:f.properties.lines.map(lineById).filter(Boolean).map(lineLabel)});
  }
  return out.sort((a,b)=>a.metres-b.metres).slice(0,4);
 }
 const lineInfo=id=>urbanData?.line_info?.[id];
 function stationFeatures(){
  if(!urbanData||current!=='transit')return [];
  return urbanData.stations.features.filter(f=>!selected.length||f.properties.lines.some(id=>selected.includes(id))).map(f=>{
   const lines=f.properties.lines,first=lineById(lines[0]);
   return {type:'Feature',geometry:f.geometry,properties:{sid:f.properties.sid,name:f.properties.name,color:lines.length>1?'#1d2638':first?.color||'#1d2638',multi:lines.length>1?1:0}};
  });
 }
 function stationInfo(sid){
  const f=urbanData.stations.features.find(x=>x.properties.sid===sid);if(!f)return;
  const p=f.properties,lines=p.lines.map(lineById).filter(Boolean);
  const renfe=context.dataset?root.AtlasLineIdentity?.nearestStation(f.geometry.coordinates,context.dataset.stations.features):null;
  const others=nearbyStations(f.geometry.coordinates,250).filter(s=>s.name!==p.name);
  const links=[
   ...(renfe&&renfe.metres<=400?['Renfe: '+renfe.name+' a '+number.format(Math.round(renfe.metres/10)*10)+' m']:[]),
   ...others.map(s=>s.network+': '+s.name+' ('+s.lines.join(', ')+')'),
   ...(root.AtlasTransport?.near?.(f.geometry.coordinates,3000)||[]).map(x=>x.kind+': '+x.name)
  ];
  context.showInfo('Estación · '+p.network,p.name,{
   'Líneas':lines.map(l=>'Línea '+l.code+((lineInfo(l.id)?.terminals||[]).length===2?' · '+lineInfo(l.id).terminals.join(' – '):'')).join('\n'),
   'Correspondencia':lines.length>1?'Sí, entre '+lines.map(lineLabel).join(', '):undefined,
   'Conexiones con otros transportes':links.join('\n')||undefined,
   'Dirección':p.address||undefined,
   'Zona tarifaria':p.zone||undefined,
   'Accesibilidad':p.accessible||undefined
  },{subtitle:[...new Set(lines.map(l=>l.operator))].join(' · '),chips:lines.map(l=>({label:lineLabel(l),color:l.color||'#536071'}))});
 }
 function lineCard(p){
  const l=lineById(p.line_id)||p,info=lineInfo(p.line_id);
  const stations=info?urbanData.stations.features.filter(f=>f.properties.lines.includes(p.line_id)):[];
  const transfers=stations.filter(f=>f.properties.lines.length>1).map(f=>f.properties.name+' ('+f.properties.lines.filter(x=>x!==p.line_id).map(lineById).filter(Boolean).map(lineLabel).join(', ')+')');
  const urbanLine=l.mode==='metro'||l.mode==='metro-ligero';
  context.showInfo((modeName[l.mode]||'Línea urbana')+' · '+l.network,urbanLine?'Línea '+l.code:l.code,{
   'Recorrido':info?(info.circular?'Línea circular con cabecera en '+info.terminals[0]:info.terminals.join(' – ')):undefined,
   'Municipios que atraviesa':info?.municipalities?.join(', '),
   'Correspondencias con otras líneas':transfers.length?transfers.slice(0,10).join('\n')+(transfers.length>10?'\n…y '+(transfers.length-10)+' más':''):undefined,
   'Operador':l.operator,
   'Red':urbanLine?undefined:'Cercanías '+l.network
  },{subtitle:l.operator,
     chips:[{label:lineLabel(l),color:l.color||'#536071'},{label:modeName[l.mode]||l.mode}],
     facts:info?[{value:String(info.stations),label:'estaciones'},...(info.municipalities?[{value:String(info.municipalities.length),label:info.municipalities.length===1?'municipio':'municipios'}]:[]),{value:String(transfers.length),label:'correspondencias'}]:undefined});
 }
 function tentCard(p){
  const ids=p.corridor_ids||[];
  context.showInfo('Corredor TEN-T',p.name||(p.origin&&p.destination&&p.origin+' – '+p.destination)||'Tramo ferroviario',{
   'Origen y destino':p.origin&&p.destination?p.origin+' – '+p.destination:undefined,
   'Tipo de infraestructura':p.rail_type,
   'Tráfico':p.activity,
   'Estado de explotación':p.status,
   'Titular':p.owner,
   'Línea':p.line_code,
   'Puntos kilométricos':p.pk_start!=null&&p.pk_end!=null?'PK '+number.format(p.pk_start)+' – '+number.format(p.pk_end):undefined
  },{subtitle:ids.map(id=>'Corredor '+tent[id]?.name).join(' · '),chips:[...ids.map(id=>({label:tent[id]?.name,color:tent[id]?.color})),...(p.status?[{label:p.status}]:[])]});
 }

 const statusFilter={service:['==',['get','status'],'En servicio'],construction:['==',['get','status'],'En construcción'],project:['==',['get','status'],'Planificado']};
 function ensureLayers(map){
  if(map.getLayer('theme'))return;
  const before=map.getLayer('cx-halo')?'cx-halo':'stations';
  // line-dasharray no admite expresiones de datos en MapLibre 5.6: una capa por estado.
  map.addLayer({id:'theme',type:'line',source:'theme',filter:['!',['in',['get','status'],['literal',['En construcción','Planificado']]]],paint:{'line-width':['interpolate',['linear'],['zoom'],5,1.5,10,3,15,5],'line-color':'#0072B2'}},before);
  map.addLayer({id:'theme-construction',type:'line',source:'theme',filter:statusFilter.construction,paint:{'line-width':['interpolate',['linear'],['zoom'],5,1.5,10,3,15,5],'line-color':'#0072B2','line-dasharray':[4,2]}},before);
  map.addLayer({id:'theme-project',type:'line',source:'theme',filter:statusFilter.project,layout:{'line-cap':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],5,1.5,10,3,15,5],'line-color':'#0072B2','line-dasharray':[0.6,2.2]}},before);
  map.addLayer({id:'theme-hit',type:'line',source:'theme',paint:{'line-width':12,'line-opacity':0}},before);
  // Estaciones urbanas encima de todas las líneas: aparecen al acercarse a la ciudad.
  map.addSource('urban-stations',{type:'geojson',data:{type:'FeatureCollection',features:[]},attribution:'Estaciones: <a href="https://www.crtm.es/">Powered by CRTM</a>'});
  map.addLayer({id:'urban-stations',type:'circle',source:'urban-stations',minzoom:10,paint:{
   'circle-radius':['interpolate',['linear'],['zoom'],10,['case',['==',['get','multi'],1],3.2,2.4],14,['case',['==',['get','multi'],1],7,5.5]],
   'circle-color':'#fbfbfb','circle-stroke-color':['get','color'],'circle-stroke-width':['interpolate',['linear'],['zoom'],10,1.4,14,2.4],
   'circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}});
  map.addLayer({id:'urban-station-labels',type:'symbol',source:'urban-stations',minzoom:12.5,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':12,
   'text-variable-anchor':['top','bottom','left','right'],'text-radial-offset':.7,'text-optional':true,'symbol-sort-key':['-',['get','multi']]},
   paint:{'text-color':'#1d2638','text-halo-color':'#fbfbfb','text-halo-width':1.8}});
  for(const id of ['theme-hit','urban-stations']){map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',id,()=>map.getCanvas().style.cursor='');}
  // Prioridad: puerto o aeropuerto > estación Renfe (su ficha ya cita el metro cercano) > estación urbana.
  map.on('click','urban-stations',event=>{
   if(root.AtlasTransport?.hit(event.point))return;
   if(map.getLayer('stations')&&map.getLayoutProperty('stations','visibility')!=='none'&&map.queryRenderedFeatures(event.point,{layers:['stations']}).length)return;
   stationInfo(event.features[0].properties.sid);
  });
  map.on('click','theme-hit',event=>{
   if(root.AtlasTransport?.hit(event.point))return;
   if(map.queryRenderedFeatures(event.point,{layers:['stations','urban-stations'].filter(id=>map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none')}).length)return;
   const p=event.features[0].properties;
   // MapLibre devuelve los arrays de propiedades como texto.
   if(typeof p.corridor_ids==='string')try{p.corridor_ids=JSON.parse(p.corridor_ids);}catch{p.corridor_ids=[];}
   if(current==='transit')lineCard(p);else tentCard(p);
  });
 }
 function show(){
  const {map,onMetrics,onLegend}=context;const data=catalog[current]?.geometry||catalog[current];if(!data?.features)return;
  const features=data.features.filter(f=>pen(f)&&matches(f));const collection={type:'FeatureCollection',features};
  if(map.getSource('theme'))map.getSource('theme').setData(collection);else map.addSource('theme',{type:'geojson',data:collection,attribution:'Hermes · Ministerio de Transportes | Renfe | <a href="https://www.crtm.es/">Powered by CRTM</a>'});
  ensureLayers(map);
  const color=current==='corridors'?(selected.length===1?tent[selected[0]].color:['case',['in','ten-t-atlantico',['get','corridor_ids']],'#0072B2','#AA4499']):['coalesce',['get','color'],'#727C8B'];
  for(const id of ['theme','theme-construction','theme-project']){map.setLayoutProperty(id,'visibility','visible');map.setPaintProperty(id,'line-color',color);}
  map.setLayoutProperty('theme-hit','visibility','visible');
  map.getSource('urban-stations').setData({type:'FeatureCollection',features:stationFeatures()});
  for(const id of ['urban-stations','urban-station-labels'])map.setLayoutProperty(id,'visibility',current==='transit'?'visible':'none');
  onMetrics?.(features,current);legendItems=options(current,data).filter(o=>!selected.length||selected.includes(o.id));onLegend?.(legendItems);
  document.querySelector('#theme-note').textContent=current==='corridors'?'Continuo en servicio, discontinuo en construcción, punteado planificado.':'Acércate a Madrid para ver las estaciones de Metro y Metro Ligero.';
 }
 function hide(){const map=context.map;for(const id of ['theme','theme-construction','theme-project','theme-hit','urban-stations','urban-station-labels'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');}
 async function change(mode){
  const token=++revision;current=mode;selected=[];hide();
  const box=document.querySelector('#theme-options');box.replaceChildren();
  if(mode==='gauge'){legendItems=[];document.querySelector('#theme-note').textContent='';return;}
  try{
   document.querySelector('#theme-note').textContent='Cargando catálogo…';
   if(!catalog[mode]){const response=await fetch(definitions[mode].file);if(!response.ok)throw new Error('Catálogo no disponible');catalog[mode]=await response.json();}
   if(mode==='transit'&&!urbanData)urbanData=await loadUrban().catch(()=>null);
   if(token!==revision)return;
   const data=catalog[mode].geometry||catalog[mode];
   for(const item of options(mode,data)){const row=document.createElement('label'),input=document.createElement('input'),sw=document.createElement('i');row.className='row';input.type='checkbox';input.value=item.id;
    input.onchange=()=>{selected=input.checked?[...selected,item.id]:selected.filter(x=>x!==item.id);show();context.onChange?.();};
    sw.className='swatch';sw.style.setProperty('--c',item.color);row.append(input,sw,document.createTextNode(item.name));box.append(row);}
   show();context.onChange?.();
  }catch(error){if(token===revision)document.querySelector('#theme-note').textContent=error.message+'. Reintenta más tarde.';}
 }
 // Las fichas de estación Renfe usan las estaciones urbanas para las conexiones.
 async function prepareConnections(){
  try{
   if(!catalog.transit){const response=await fetch(definitions.transit.file);if(response.ok)catalog.transit=await response.json();}
   if(!urbanData)urbanData=await loadUrban();
  }catch{}
 }
 function init(config){context=config;}
 root.AtlasThemes={init,change,legend:()=>legendItems,current:()=>current,refresh:()=>{if(current!=='gauge')show();},nearbyStations,prepareConnections,stationInfo,lineCard,tentCard};
})(window);
