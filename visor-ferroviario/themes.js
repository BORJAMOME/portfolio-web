/* Temas heredados: corredores TEN-T (Hermes) y Cercanías/redes urbanas (GTFS). Solo España peninsular. */
(function(root){
 'use strict';
 const catalog={};let current='gauge',selected=[];let context;let revision=0;let legendItems=[];
 const definitions={
  corridors:{file:'tramos-ten-t.geojson',name:'Corredores TEN-T · Hermes 2024',source:'Hermes · Ministerio de Transportes',url:'https://hermes.transportes.gob.es/'},
  transit:{file:'transit-catalog.json',name:'Servicios urbanos y Cercanías',source:'GTFS oficial',url:'https://www.renfe.com/'}
 };
 const pen=f=>{const c=f.geometry.type==='LineString'?f.geometry.coordinates[0]:f.geometry.coordinates[0][0];return root.AtlasConfig.peninsular(c);};
 function options(mode,data){
  if(mode==='corridors')return [{id:'ten-t-atlantico',name:'TEN-T Atlántico',color:'#0072B2'},{id:'ten-t-mediterraneo',name:'TEN-T Mediterráneo',color:'#AA4499'}];
  return (catalog.transit?.lines||[]).filter(l=>data.features.some(f=>f.properties.line_id===l.id)).map(l=>({id:l.id,name:[l.network||l.network_id,l.code,l.name].filter(Boolean).join(' · '),color:l.color||'#727C8B'}));
 }
 function matches(f){if(!selected.length)return true;const p=f.properties;return current==='corridors'?(p.corridor_ids||[]).some(id=>selected.includes(id)):selected.includes(p.line_id);}
 const statusFilter={service:['==',['get','status'],'En servicio'],construction:['==',['get','status'],'En construcción'],project:['==',['get','status'],'Planificado']};
 function ensureLayers(map){
  if(map.getLayer('theme'))return;
  const before=map.getLayer('cx-halo')?'cx-halo':'stations';
  // line-dasharray no admite expresiones de datos en MapLibre 5.6: una capa por estado.
  map.addLayer({id:'theme',type:'line',source:'theme',filter:['!',['in',['get','status'],['literal',['En construcción','Planificado']]]],paint:{'line-width':['interpolate',['linear'],['zoom'],5,1.5,10,3,15,5],'line-color':'#0072B2'}},before);
  map.addLayer({id:'theme-construction',type:'line',source:'theme',filter:statusFilter.construction,paint:{'line-width':['interpolate',['linear'],['zoom'],5,1.5,10,3,15,5],'line-color':'#0072B2','line-dasharray':[4,2]}},before);
  map.addLayer({id:'theme-project',type:'line',source:'theme',filter:statusFilter.project,layout:{'line-cap':'round'},paint:{'line-width':['interpolate',['linear'],['zoom'],5,1.5,10,3,15,5],'line-color':'#0072B2','line-dasharray':[0.6,2.2]}},before);
  map.addLayer({id:'theme-hit',type:'line',source:'theme',paint:{'line-width':12,'line-opacity':0}},before);
  map.on('click','theme-hit',event=>{
   if(map.queryRenderedFeatures(event.point,{layers:['stations']}).length)return;
   const p=event.features[0].properties;
   context.showInfo(definitions[current].name,p.name||(p.origin&&p.destination&&p.origin+' – '+p.destination)||(p.line_code&&'Línea '+p.line_code)||'Tramo ferroviario',
    {'Operador':p.operator,'Línea':p.code,'Nombre':p.name,'Origen':p.origin,'Destino':p.destination,'Tipo de infraestructura':p.rail_type,'Estado en la fuente':p.status,'Titular publicado':p.owner,'Fecha de la fuente':p.source_date,'Referencia':p.source_url},
    {title:definitions[current].source,url:p.geometry_source_url||p.source_url||definitions[current].url});
  });
 }
 function show(){
  const {map,onMetrics,onLegend}=context;const data=catalog[current]?.geometry||catalog[current];if(!data?.features)return;
  const features=data.features.filter(f=>pen(f)&&matches(f));const collection={type:'FeatureCollection',features};
  if(map.getSource('theme'))map.getSource('theme').setData(collection);else map.addSource('theme',{type:'geojson',data:collection,attribution:'Hermes · Ministerio de Transportes | Renfe | <a href="https://www.crtm.es/">Powered by CRTM</a>'});
  ensureLayers(map);
  const color=current==='corridors'?(selected.length===1?(selected[0]==='ten-t-atlantico'?'#0072B2':'#AA4499'):['case',['in','ten-t-atlantico',['get','corridor_ids']],'#0072B2','#AA4499']):['coalesce',['get','color'],'#727C8B'];
  for(const id of ['theme','theme-construction','theme-project']){map.setLayoutProperty(id,'visibility','visible');map.setPaintProperty(id,'line-color',color);}
  map.setLayoutProperty('theme-hit','visibility','visible');
  onMetrics?.(features,current);legendItems=options(current,data).filter(o=>!selected.length||selected.includes(o.id));onLegend?.(legendItems);
  document.querySelector('#theme-note').textContent=current==='corridors'?'Hermes 2024: continuo en servicio, discontinuo en construcción, punteado planificado. RFC y ejes de Adif son clasificaciones independientes.':'Servicios Renfe y red de referencia de Madrid; sin incidencias en directo. Powered by CRTM · crtm.es.';
 }
 function hide(){const map=context.map;for(const id of ['theme','theme-construction','theme-project','theme-hit'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility','none');}
 async function change(mode){
  const token=++revision;current=mode;selected=[];hide();
  const box=document.querySelector('#theme-options');box.replaceChildren();
  if(mode==='gauge'){legendItems=[];document.querySelector('#theme-note').textContent='';return;}
  try{
   document.querySelector('#theme-note').textContent='Cargando catálogo…';
   if(!catalog[mode]){const response=await fetch(definitions[mode].file);if(!response.ok)throw new Error('Catálogo no disponible');catalog[mode]=await response.json();}
   if(token!==revision)return;
   const data=catalog[mode].geometry||catalog[mode];
   for(const item of options(mode,data)){const row=document.createElement('label'),input=document.createElement('input'),sw=document.createElement('i');row.className='row';input.type='checkbox';input.value=item.id;
    input.onchange=()=>{selected=input.checked?[...selected,item.id]:selected.filter(x=>x!==item.id);show();context.onChange?.();};
    sw.className='swatch';sw.style.setProperty('--c',item.color);row.append(input,sw,document.createTextNode(item.name));box.append(row);}
   show();context.onChange?.();
  }catch(error){if(token===revision)document.querySelector('#theme-note').textContent=error.message+'. Reintenta más tarde.';}
 }
 function init(config){context=config;}
 root.AtlasThemes={init,change,legend:()=>legendItems,current:()=>current,refresh:()=>{if(current!=='gauge')show();}};
})(window);
