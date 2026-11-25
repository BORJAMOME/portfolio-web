import {validateBounds,mercatorX,mercatorY,longitudeAt,latitudeAt} from './terrain-data.mjs';

export const POSITRON_ATTRIBUTION='Positron · OpenFreeMap / OpenMapTiles / © OpenStreetMap contributors';

/** A north-up Mercator viewport; any sub-pixel letterbox is cropped after render. */
export function positronView(bounds,maxSize=2048){
  if(!validateBounds(bounds))throw new Error('La extensión de Positron no es válida.');
  if(typeof maxSize!=='number'||!Number.isFinite(maxSize)||maxSize<256||maxSize>4096)throw new Error('El tamaño de la textura de Positron no es válido.');
  const [west,south,east,north]=bounds;
  const left=mercatorX(west),right=mercatorX(east),top=mercatorY(north),bottom=mercatorY(south);
  const dx=right-left,dy=bottom-top,longest=Math.max(dx,dy),size=Math.round(maxSize);
  const width=Math.max(1,Math.round(size*dx/longest)),height=Math.max(1,Math.round(size*dy/longest));
  return {width,height,center:[longitudeAt((left+right)/2),latitudeAt((top+bottom)/2)],
    zoom:Math.log2(Math.min(width/dx,height/dy)/512)};
}

function abortError(){return new DOMException('Se ha cancelado la carga de Positron.','AbortError');}

/**
 * Render the actual local Positron vector style once, then release MapLibre.
 * The returned canvas contains only the requested geographic extent, with north
 * at its top. Three.js CanvasTexture's default flipY=true pairs with UV v=1-y.
 * This snapshot retains roads, water and place labels rather than synthesizing
 * a different basemap from the terrain's elevation colours.
 */
export async function loadPositronTexture({bounds,signal,maxSize=2048,labelScale=1.65,lineScale=1,onStatus,timeoutMs=25000}={}){
  const view=positronView(bounds,maxSize);
  if(!globalThis.maplibregl?.Map)throw new Error('No está disponible el motor cartográfico de Positron.');
  if(typeof timeoutMs!=='number'||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw new Error('El tiempo de espera de Positron no es válido.');
  if(typeof labelScale!=='number'||!Number.isFinite(labelScale)||labelScale<1||labelScale>4)throw new Error('La escala de las etiquetas de Positron no es válida.');
  if(typeof lineScale!=='number'||!Number.isFinite(lineScale)||lineScale<1||lineScale>3)throw new Error('La escala de los trazos de Positron no es válida.');
  signal?.throwIfAborted();
  const controller=new AbortController();
  const cancel=()=>controller.abort(signal.reason||abortError());
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('Positron no ha terminado de cargar. Comprueba la conexión y vuelve a intentarlo.','TimeoutError')),timeoutMs);
  let map,host;
  try{
    onStatus?.('Cargando el mapa base Positron…');
    const styleURL=new URL('./styles/positron.json',import.meta.url);
    const response=await fetch(styleURL,{signal:controller.signal});
    if(!response.ok)throw new Error('No se ha podido leer el estilo Positron.');
    const style=await response.json();controller.signal.throwIfAborted();
    style.glyphs=new URL('./fonts/',import.meta.url).href+'{fontstack}/{range}.pbf';
    for(const source of Object.values(style.sources||{})){
      if(source.url)source.url=new URL(source.url,styleURL).href;
      if(source.tiles)source.tiles=source.tiles.map(url=>new URL(url,styleURL).href.replace(/%7B/gi,'{').replace(/%7D/gi,'}'));
    }
    for(const layer of style.layers||[]){
      layer.layout={...layer.layout,visibility:'visible'};
      const size=layer.layout['text-size'];
      if(typeof size==='number')layer.layout['text-size']=size*labelScale;
      else if(Array.isArray(size)&&size[0]==='interpolate'){
        // Keep zoom at the top-level interpolate required by the style spec.
        layer.layout['text-size']=size.map((value,index)=>index>=4&&index%2===0&&typeof value==='number'?value*labelScale:value);
      }
      const width=layer.paint?.['line-width'];
      if(typeof width==='number')layer.paint['line-width']=width*lineScale;
      else if(Array.isArray(width)&&width[0]==='interpolate')layer.paint['line-width']=width.map((value,index)=>index>=4&&index%2===0&&typeof value==='number'?value*lineScale:value);
    }
    host=document.createElement('div');host.setAttribute('aria-hidden','true');
    // Property assignments work with the site's strict style-src policy. This
    // viewport stays sized and rendered while remaining outside the interface.
    Object.assign(host.style,{position:'fixed',left:'-100000px',top:'0',width:view.width+'px',height:view.height+'px',pointerEvents:'none'});
    document.body.append(host);
    map=new globalThis.maplibregl.Map({container:host,style,center:view.center,zoom:view.zoom,
      bearing:0,pitch:0,minZoom:0,maxZoom:22,maxPitch:0,padding:0,interactive:false,
      renderWorldCopies:false,attributionControl:false,pixelRatio:1,fadeDuration:0,
      canvasContextAttributes:{preserveDrawingBuffer:true,antialias:false}});
    const canvas=await new Promise((resolve,reject)=>{
      let settled=false;
      const failures=new Map();
      function finish(error,result){
        if(settled)return;settled=true;
        controller.signal.removeEventListener('abort',aborted);
        map.off('idle',idle);map.off('error',failed);map.off('sourcedata',recovered);
        error?reject(error):resolve(result);
      }
      function aborted(){finish(controller.signal.reason||abortError());}
      function failed(event){
        const error=event.error;
        if(error?.name==='AbortError'||/abort/i.test(error?.message||''))return;
        failures.set(event.sourceId||'map',error?.message||'No se ha podido cargar una parte de Positron.');
      }
      function recovered(event){
        if(event.sourceDataType==='content'&&event.isSourceLoaded)failures.delete(event.sourceId);
      }
      function idle(){
        if(controller.signal.aborted){aborted();return;}
        if(failures.size){finish(new Error('Positron no ha podido cargar sus datos: '+failures.values().next().value));return;}
        if(!map.loaded()||!map.areTilesLoaded())return;
        try{
          const source=map.getCanvas(),northwest=map.project([bounds[0],bounds[3]]),southeast=map.project([bounds[2],bounds[1]]);
          const ratioX=source.width/host.clientWidth,ratioY=source.height/host.clientHeight;
          const sx=northwest.x*ratioX,sy=northwest.y*ratioY,sw=(southeast.x-northwest.x)*ratioX,sh=(southeast.y-northwest.y)*ratioY;
          if(!(sw>0&&sh>0&&source.width>0&&source.height>0))throw new Error('El mapa base no tiene una extensión dibujable.');
          const copy=document.createElement('canvas');copy.width=view.width;copy.height=view.height;
          const context=copy.getContext('2d');if(!context)throw new Error('No se ha podido preparar la textura de Positron.');
          context.drawImage(source,sx,sy,sw,sh,0,0,copy.width,copy.height);
          finish(null,copy);
        }catch(error){finish(error);}
      }
      controller.signal.addEventListener('abort',aborted,{once:true});
      map.on('idle',idle);map.on('error',failed);map.on('sourcedata',recovered);
      if(controller.signal.aborted)aborted();else map.triggerRepaint();
    });
    controller.signal.throwIfAborted();
    onStatus?.('Positron preparado.');
    let disposed=false;
    return {canvas,width:canvas.width,height:canvas.height,bounds:[...bounds],attribution:POSITRON_ATTRIBUTION,
      dispose(){if(disposed)return;disposed=true;canvas.width=canvas.height=1;}};
  }catch(error){
    if(controller.signal.aborted)throw controller.signal.reason||abortError();
    throw error;
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',cancel);
    map?.remove();host?.remove();
  }
}
