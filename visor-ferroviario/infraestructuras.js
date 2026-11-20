/* Carreteras oficiales SignA (teselas raster) y nodos de mercancías IGR-RT (local). */
(function(root){
  'use strict';
  const $=s=>document.querySelector(s),ROAD='#b08b51',FREIGHT='#72547c';
  const BASE='https://certiserviciosgis.ign.es/servicios/rest/services/signa/02_redes_transporte/MapServer/export';
  let map,showInfo,onChange,data,request,revision=0;
  let state={roads:false,freight:false,roadClass:'all',freightUse:'all'};
  function roadUrl(){
    const ids=state.roadClass==='motorways'?[20,21]:[20,21,22];
    const layers=ids.map(id=>({id,source:{type:'mapLayer',mapLayerId:id},drawingInfo:{renderer:{type:'simple',symbol:{type:'esriSLS',style:'esriSLSSolid',color:id===22?[176,139,81,160]:[149,104,45,210],width:id===22?.6:1.2}}}}));
    return BASE+'?f=image&format=png32&transparent=true&bboxSR=3857&imageSR=3857&size=256,256&dpi=96&bbox={bbox-epsg-3857}&dynamicLayers='+encodeURIComponent(JSON.stringify(layers));
  }
  function roads(){
    if(map.getLayer('infrastructure-roads'))map.removeLayer('infrastructure-roads');
    if(map.getSource('infrastructure-roads'))map.removeSource('infrastructure-roads');
    if(!state.roads)return;
    map.addSource('infrastructure-roads',{type:'raster',tiles:[roadUrl()],tileSize:256,maxzoom:16,attribution:'Carreteras: IGN / CNIG, SignA · IGR-RT'});
    map.addLayer({id:'infrastructure-roads',type:'raster',source:'infrastructure-roads',paint:{'raster-opacity':.8,'raster-fade-duration':0}},map.getLayer('rail')?'rail':undefined);
  }
  function load(){return request??=fetch('capas/mercancias.geojson').then(r=>{if(!r.ok)throw Error('No se ha podido cargar el inventario de mercancías. Vuelve a activarlo para reintentar.');return r.json();}).then(d=>data=d).catch(e=>{request=null;throw e;});}
  function ensure(){
    if(map.getSource('infrastructure-freight'))return;
    map.addSource('infrastructure-freight',{type:'geojson',data,attribution:'Instalaciones de mercancías: IGN, IGR-RT · consulta 20/11/2026'});
    map.addLayer({id:'infrastructure-freight',type:'circle',source:'infrastructure-freight',paint:{'circle-color':FREIGHT,'circle-radius':['interpolate',['linear'],['zoom'],5,3.5,10,6],'circle-stroke-width':1.4,'circle-stroke-color':'#fbfbfb'}});
    map.addLayer({id:'infrastructure-freight-labels',type:'symbol',source:'infrastructure-freight',minzoom:10,layout:{'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':11,'text-variable-anchor':['top','bottom'],'text-radial-offset':1,'text-optional':true},paint:{'text-color':FREIGHT,'text-halo-color':'#fbfbfb','text-halo-width':1.5}});
    map.on('mouseenter','infrastructure-freight',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','infrastructure-freight',()=>map.getCanvas().style.cursor='');
    map.on('click','infrastructure-freight',e=>{const p=e.features[0].properties;showInfo('Instalación de mercancías',p.name,{'Código de estación':p.code||'No publicado','Uso en el IGN':p.use==='cargo'?'Mercancías':'Mixto: viajeros y mercancías','Inventario':'IGN · IGR-RT, consultado el 20 de noviembre de 2026','Alcance':'Incluye terminales, estaciones y apartaderos. La clasificación no acredita actividad actual ni gestión por Adif.'},{subtitle:p.use==='cargo'?'Mercancías · inventario IGN':'Uso mixto · inventario IGN'});});
  }
  function refresh(){
    $('#roads-toggle').checked=state.roads;$('#freight-toggle').checked=state.freight;
    $('#roads-options').hidden=!state.roads;$('#freight-options').hidden=!state.freight;
    $('#road-class').value=state.roadClass;$('#freight-use').value=state.freightUse;
    if(data){ensure();const filter=state.freightUse==='all'?null:['==',['get','use'],state.freightUse];for(const id of ['infrastructure-freight','infrastructure-freight-labels']){map.setLayoutProperty(id,'visibility',state.freight?'visible':'none');map.setFilter(id,filter);}
      const count=data.features.filter(f=>state.freightUse==='all'||f.properties.use===state.freightUse).length;$('#freight-count').textContent=count.toLocaleString('es-ES')+' instalaciones en la península';}
    onChange?.();
  }
  async function setFreight(value){const rev=++revision;state.freight=Boolean(value);refresh();if(value&&!data){$('#infrastructure-status').textContent='Cargando instalaciones…';try{await load();}catch(e){if(rev!==revision)return;state.freight=false;$('#infrastructure-status').textContent=e.message;refresh();return;}}if(rev!==revision)return;$('#infrastructure-status').textContent='';refresh();}
  function hit(point){return Boolean(state.freight&&map.getLayer('infrastructure-freight')&&map.queryRenderedFeatures([[point.x-6,point.y-6],[point.x+6,point.y+6]],{layers:['infrastructure-freight']}).length);}
  function legendItems(){return [...(state.roads?[{name:state.roadClass==='motorways'?'Autopistas y autovías · IGN':'Carreteras · IGN',color:ROAD}]:[]),...(state.freight?[{name:'Instalaciones de mercancías · IGN',color:FREIGHT}]:[])];}
  root.AtlasInfrastructure={init(options){({map,showInfo,onChange}=options);$('#roads-toggle').onchange=e=>{state.roads=e.target.checked;roads();refresh();};$('#freight-toggle').onchange=e=>setFreight(e.target.checked);$('#road-class').onchange=e=>{state.roadClass=e.target.value;roads();refresh();};$('#freight-use').onchange=e=>{state.freightUse=e.target.value;refresh();};refresh();},
    state:()=>state.roads||state.freight?{...state}:undefined,
    async restore(s){state.roads=s?.roads===true;state.roadClass=s?.roadClass==='motorways'?'motorways':'all';state.freightUse=['cargo','mixed'].includes(s?.freightUse)?s.freightUse:'all';roads();await setFreight(s?.freight===true);},
    hit,legendItems
  };
})(window);
