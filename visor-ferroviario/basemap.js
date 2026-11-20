/* Fondo Positron insertado bajo las capas del atlas: nunca sustituye el estilo
   completo, sus imágenes, feature-state, terreno o listeners. */
(function(root){
  'use strict';
  const valid=value=>value==='positron'?'positron':'simple';
  function create(map,{select,note,retry,onChange=()=>{}}={}){
    let mode='simple',pending=null,revision=0,installed=false,disposed=false,sourceError=false;
    let layers=[];
    const local=['land','outside','region-lines','region-labels','city-labels'];
    function message(text,warning=false){
      if(note){note.textContent=text;note.dataset.warning=warning?'1':'0';}
      if(retry)retry.hidden=!warning;
    }
    function sync(){
      const detailed=mode==='positron'&&installed;
      const raster=map.getLayer('topography')&&map.getLayoutProperty('topography','visibility')!=='none';
      for(const layer of layers)if(map.getLayer(layer.id))map.setLayoutProperty(layer.id,'visibility',detailed&&!(raster&&layer.type==='symbol')?'visible':'none');
      for(const id of local)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',detailed||(raster&&id.endsWith('labels'))?'none':'visible');
      if(select)select.value=mode;
    }
    async function install(){
      if(installed)return;
      if(!pending)pending=(async()=>{
        const response=await fetch('styles/positron.json');
        if(!response.ok)throw new Error('No se pudo cargar el estilo Positron');
        const style=await response.json();
        if(disposed)return;
        for(const [id,source] of Object.entries(style.sources))if(!map.getSource(id))map.addSource(id,source);
        layers=style.layers;
        for(const layer of layers)if(!map.getLayer(layer.id))map.addLayer(layer,'land');
        installed=true;
      })().catch(error=>{pending=null;throw error;});
      return pending;
    }
    async function set(value){
      const request=++revision;
      mode=valid(value);
      if(select)select.value=mode;
      if(mode==='simple'){
        sync();message('Fondo simplificado local. Topografía IGN se puede superponer.');onChange(mode);return;
      }
      message('Cargando Positron…');
      try{
        await install();
        if(disposed||request!==revision)return;
        sync();
        message(sourceError?'Positron está incompleto. Puedes volver al fondo simplificado.':'Positron · OpenFreeMap / OpenMapTiles / OpenStreetMap. Topografía IGN se superpone y sustituye sus etiquetas.',sourceError);
        onChange(mode);
      }catch(error){
        if(disposed||request!==revision)return;
        mode='simple';sync();message('No se pudo cargar Positron. Se mantiene el fondo simplificado.',true);onChange(mode);
      }
    }
    function error(event){
      if(event.sourceId!=='basemap-openmaptiles'||event.error?.name==='AbortError')return;
      sourceError=true;
      if(mode==='positron')message('Positron está incompleto. Puedes volver al fondo simplificado.',true);
    }
    function recovered(event){
      if(event.sourceId!=='basemap-openmaptiles'||event.sourceDataType!=='content'||!event.isSourceLoaded)return;
      sourceError=false;
      if(mode==='positron')message('Positron · OpenFreeMap / OpenMapTiles / OpenStreetMap.');
    }
    const change=()=>set(select.value),fallback=()=>set('simple');
    select?.addEventListener('change',change);retry?.addEventListener('click',fallback);
    map.on('error',error);map.on('sourcedata',recovered);
    sync();message('Fondo simplificado local. Topografía IGN se puede superponer.');
    return {set,sync,state:()=>mode,destroy(){disposed=true;revision++;select?.removeEventListener('change',change);retry?.removeEventListener('click',fallback);map.off('error',error);map.off('sourcedata',recovered);}};
  }
  const api={create,valid};
  if(typeof module!=='undefined')module.exports=api;
  root.AtlasBasemap=api;
})(typeof window==='undefined'?globalThis:window);
