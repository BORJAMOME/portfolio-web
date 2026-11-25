/* Fondos insertados bajo las capas del atlas: nunca sustituyen el estilo
   completo, sus imágenes, feature-state, terreno o listeners.
   - simple: fondo local (solo España; Portugal y Francia en el color del mar).
   - Vectoriales: Positron (OpenFreeMap) y VersaTiles Graybeard y Colorful
     (estilos CC0 adaptados con tools/visor/adaptar-estilos.mjs).
   - Ráster oficiales del IGN (WMTS, EPSG:3857): Mapa base IGN gris y en color,
     con cobertura mundial, y la vista aérea PNOA Máxima Actualidad.
   También pinta el botón de estilos que va bajo los controles de zoom. */
(function(root){
  'use strict';
  const IGN_BASE=layer=>`https://www.ign.es/wmts/ign-base?layer=${layer}&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}`;
  const IGN_ATTRIBUTION='Mapa base: © <a href="https://www.ign.es/">IGN</a> · <a href="https://www.scne.es/">SCNE</a> · CC BY 4.0';
  const PNOA_ATTRIBUTION='Vista aérea: <a href="https://pnoa.ign.es/">PNOA</a> cedido por © <a href="https://www.ign.es/">IGN</a> · CC BY 4.0 · escalas pequeñas: Copernicus Sentinel-2';
  // Orden del selector y del botón de estilos.
  const MODES={
    simple:{label:'Simplificado',hint:'Fondo local claro',note:'Fondo simplificado local. Topografía IGN se puede superponer.'},
    positron:{label:'Positron',hint:'Calles y territorio en gris claro',style:'styles/positron.json',sources:['basemap-openmaptiles'],
      note:'Positron · OpenFreeMap / OpenMapTiles / OpenStreetMap. Topografía IGN se superpone y sustituye sus etiquetas.'},
    'ign-gris':{label:'IGN gris',hint:'Mapa base oficial del IGN en grises',raster:{layer:'IGNBase-gris',maxzoom:20,attribution:IGN_ATTRIBUTION},
      paint:{'raster-saturation':-.2,'raster-contrast':-.06},note:'Mapa base del IGN en gris (WMTS oficial, en directo). Cubre también Portugal, Francia y el norte de África.'},
    'versatiles-gris':{label:'Graybeard',hint:'Gris neutro con cobertura del suelo',style:'styles/versatiles-gris.json',sources:['basemap-versatiles-shortbread','basemap-versatiles-landcover'],
      note:'Graybeard · VersaTiles (estilo CC0) con OpenStreetMap y ESA WorldCover. Servidor público sin garantías de servicio.'},
    'versatiles-color':{label:'Colorful',hint:'Color suave con bosques, agua y cultivos',style:'styles/versatiles-color.json',sources:['basemap-versatiles-shortbread','basemap-versatiles-landcover'],
      note:'Colorful · VersaTiles (estilo CC0) con OpenStreetMap y ESA WorldCover. Servidor público sin garantías de servicio.'},
    ign:{label:'IGN color',hint:'Mapa base oficial del IGN',raster:{layer:'IGNBaseTodo',maxzoom:20,attribution:IGN_ATTRIBUTION},
      paint:{'raster-saturation':-.35,'raster-contrast':-.08,'raster-brightness-max':.97},note:'Mapa base del IGN en color, atenuado para que mande la red (WMTS oficial, en directo).'},
    pnoa:{label:'Vista aérea',hint:'Ortofoto PNOA Máxima Actualidad',raster:{url:'https://www.ign.es/wmts/pnoa-ma?layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&Service=WMTS&Request=GetTile&Version=1.0.0&Format=image/jpeg&TileMatrix={z}&TileCol={x}&TileRow={y}',
      maxzoom:19,bounds:[-18.5,27,4.6,44.2],attribution:PNOA_ATTRIBUTION},
      // Atenuada para que las vías y los rótulos destaquen sobre la imagen.
      paint:{'raster-saturation':-.25,'raster-contrast':-.08,'raster-brightness-max':.9},photo:true,
      note:'Vista aérea PNOA Máxima Actualidad del IGN, en directo (requiere conexión). El mapa cartográfico sigue disponible.'}
  };
  const valid=value=>Object.hasOwn(MODES,value)?value:'simple';
  const label=value=>MODES[valid(value)].label;
  const SOURCES=new Set(Object.entries(MODES).flatMap(([id,mode])=>mode.raster?['basemap-'+id]:mode.sources||[]));
  const sourcesOf=mode=>MODES[mode].raster?['basemap-'+mode]:MODES[mode].sources||[];

  function create(map,{select,note,retry,onChange=()=>{}}={}){
    let mode='simple',revision=0,disposed=false;
    const installed={},pending={},failed=new Set(),listeners=new Set();
    const local=['land','outside','region-lines','region-labels','city-labels'];
    function message(text,warning=false){
      if(note){note.textContent=text;note.dataset.warning=warning?'1':'0';}
      if(retry)retry.hidden=!warning;
    }
    function raster(id){
      const def=MODES[id];if(map.getSource('basemap-'+id))return;
      const {url,layer,maxzoom,bounds,attribution}=def.raster;
      map.addSource('basemap-'+id,{type:'raster',tiles:[url||IGN_BASE(layer)],tileSize:256,maxzoom,...(bounds?{bounds}:{}),attribution});
      map.addLayer({id:'basemap-'+id,type:'raster',source:'basemap-'+id,layout:{visibility:'none'},
        paint:{...def.paint,'raster-opacity':def.photo?['interpolate',['linear'],['zoom'],5,.85,9,1]:1,'raster-fade-duration':150}},map.getLayer('topography')?'topography':undefined);
      installed[id]=[{id:'basemap-'+id,type:'raster'}];
    }
    async function vector(id){
      if(installed[id])return;
      if(!pending[id])pending[id]=(async()=>{
        const response=await fetch(MODES[id].style);
        if(!response.ok)throw new Error('No se pudo cargar el estilo '+MODES[id].label);
        const style=await response.json();
        if(disposed)return;
        for(const [key,source] of Object.entries(style.sources))if(!map.getSource(key))map.addSource(key,source);
        for(const layer of style.layers)if(!map.getLayer(layer.id))map.addLayer({...layer,layout:{...layer.layout,visibility:'none'}},'land');
        installed[id]=style.layers;
      })().catch(error=>{delete pending[id];throw error;});
      return pending[id];
    }
    function sync(){
      const def=MODES[mode],photo=Boolean(def.photo),covers=mode!=='simple'&&!photo&&Boolean(installed[mode]);
      if(map.getLayer('land'))map.setPaintProperty('land','fill-opacity',photo?0:1);
      document.documentElement.dataset.basemap=mode;
      const topo=map.getLayer('topography')&&map.getLayoutProperty('topography','visibility')!=='none';
      for(const [id,layers] of Object.entries(installed))for(const layer of layers)if(map.getLayer(layer.id))
        map.setLayoutProperty(layer.id,'visibility',id===mode&&!(topo&&layer.type==='symbol')?'visible':'none');
      // Un fondo completo (vectorial o mapa IGN) sustituye la máscara exterior y los rótulos locales.
      for(const id of local)if(map.getLayer(id))map.setLayoutProperty(id,'visibility',covers||(topo&&id.endsWith('labels'))||(photo&&id==='region-labels')?'none':'visible');
      if(select)select.value=mode;
      for(const listener of listeners)listener(mode);
    }
    const broken=id=>sourcesOf(id).some(source=>failed.has(source));
    function settled(){
      const def=MODES[mode];
      if(broken(mode))message(`${def.label} está incompleto. Puedes volver al fondo simplificado.`,true);
      else message(def.note);
    }
    async function set(value){
      const request=++revision;
      mode=valid(value);
      if(select)select.value=mode;
      const def=MODES[mode];
      if(def.raster)raster(mode);
      if(def.style){
        message(`Cargando ${def.label}…`);
        try{await vector(mode);}
        catch(error){
          if(disposed||request!==revision)return;
          mode='simple';sync();message(`No se pudo cargar ${def.label}. Se mantiene el fondo simplificado.`,true);onChange(mode);return;
        }
        if(disposed||request!==revision)return;
      }
      sync();settled();onChange(mode);
    }
    function error(event){
      if(!SOURCES.has(event.sourceId)||event.error?.name==='AbortError')return;
      failed.add(event.sourceId);
      if(sourcesOf(mode).includes(event.sourceId))settled();
    }
    function recovered(event){
      if(!failed.has(event.sourceId)||event.sourceDataType!=='content'||!event.isSourceLoaded)return;
      failed.delete(event.sourceId);
      if(sourcesOf(mode).includes(event.sourceId))settled();
    }
    const change=()=>set(select.value),fallback=()=>set('simple');
    select?.addEventListener('change',change);retry?.addEventListener('click',fallback);
    map.on('error',error);map.on('sourcedata',recovered);
    sync();settled();
    return {set,sync,state:()=>mode,
      // Errores de fuentes de fondo que no están a la vista: no deben avisar en el mapa.
      ignores:sourceId=>SOURCES.has(sourceId)&&!sourcesOf(mode).includes(sourceId),
      onSync:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);},
      destroy(){disposed=true;revision++;listeners.clear();select?.removeEventListener('change',change);retry?.removeEventListener('click',fallback);map.off('error',error);map.off('sourcedata',recovered);}};
  }

  /* Botón de estilos bajo el zoom: abre una lista con miniaturas. Mismo estado que el selector
     del panel «Territorio»; teclado (flechas, Inicio/Fin, Esc) y cierre al pulsar fuera. */
  function control(controller,{version=''}={}){
    let container,button,panel,detach,outside,keys;
    const close=(focus=false)=>{if(!panel||panel.hidden)return;panel.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();};
    const items=()=>[...panel.querySelectorAll('button')];
    function open(){
      panel.hidden=false;button.setAttribute('aria-expanded','true');
      (panel.querySelector('[aria-pressed="true"]')||items()[0]).focus();
    }
    return {
      onAdd(){
        container=document.createElement('div');container.className='maplibregl-ctrl maplibregl-ctrl-group basemap-ctrl';
        button=document.createElement('button');button.type='button';button.className='basemap-ctrl-toggle';
        button.setAttribute('aria-label','Estilo del mapa');button.title='Estilo del mapa';
        button.setAttribute('aria-haspopup','true');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','basemap-ctrl-panel');
        button.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 3 2.5 8 12 13l9.5-5L12 3Z" fill="currentColor" opacity=".9"/><path d="m4.6 11.1-2.1 1.1L12 17.2l9.5-5-2.1-1.1L12 15Z" fill="currentColor" opacity=".6"/><path d="m4.6 15.1-2.1 1.1L12 21.2l9.5-5-2.1-1.1L12 19Z" fill="currentColor" opacity=".35"/></svg>';
        panel=document.createElement('div');panel.className='basemap-ctrl-panel';panel.id='basemap-ctrl-panel';panel.hidden=true;
        panel.setAttribute('role','group');panel.setAttribute('aria-label','Estilo del mapa');
        const title=document.createElement('p');title.className='basemap-ctrl-title';title.textContent='Estilo del mapa';panel.append(title);
        const grid=document.createElement('div');grid.className='basemap-ctrl-grid';
        for(const [id,def] of Object.entries(MODES)){
          const option=document.createElement('button');option.type='button';option.dataset.mode=id;option.title=def.hint;
          const image=document.createElement('img');image.src=`img/basemaps/${id}.jpg${version}`;image.alt='';image.width=88;image.height=60;image.loading='lazy';image.decoding='async';
          const name=document.createElement('span');name.textContent=def.label;
          option.append(image,name);option.setAttribute('aria-label',`${def.label}: ${def.hint}`);
          option.onclick=()=>{controller.set(id);close(true);};
          grid.append(option);
        }
        panel.append(grid);container.append(button,panel);
        button.onclick=()=>panel.hidden?open():close();
        keys=event=>{
          if(event.key==='Escape'){event.stopPropagation();close(true);return;}
          const list=items(),index=list.indexOf(document.activeElement);if(index<0)return;
          const next={ArrowRight:index+1,ArrowDown:index+2,ArrowLeft:index-1,ArrowUp:index-2,Home:0,End:list.length-1}[event.key];
          if(next===undefined)return;event.preventDefault();list[Math.max(0,Math.min(list.length-1,next))].focus();
        };
        panel.addEventListener('keydown',keys);
        outside=event=>{if(!container.contains(event.target))close();};
        document.addEventListener('pointerdown',outside);
        const mark=mode=>{for(const option of items())option.setAttribute('aria-pressed',String(option.dataset.mode===mode));button.dataset.mode=mode;};
        detach=controller.onSync(mark);mark(controller.state());
        return container;
      },
      onRemove(){detach?.();document.removeEventListener('pointerdown',outside);container?.remove();}
    };
  }
  const api={create,control,valid,label,modes:Object.keys(MODES)};
  if(typeof module!=='undefined')module.exports=api;
  root.AtlasBasemap=api;
})(typeof window==='undefined'?globalThis:window);
