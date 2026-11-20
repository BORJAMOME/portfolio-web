(function(root){
  'use strict';
  let protocolRegistered=false;
  function create(map,options={}) {
    const host=typeof options.container==='string'?document.querySelector(options.container):options.container;
    const manifest=root.IGN_TERRAIN_MANIFEST;
    let enabled=false, exaggeration=1, shade=true;
    let source='terrain';
    if(manifest?.tiles?.length) {
      const available=new Set(manifest.tiles);
      if(!protocolRegistered) {
        // Cache decoded numeric heights, not interpolated RGB channels.
        const elevationCache=new Map();
        async function heightsAt(key) {
          if(elevationCache.has(key))return elevationCache.get(key);
          const pending=(async()=>{
            const response=await fetch(`terrain-ign/${key}.png`);
            if(!response.ok)throw new Error('No se pudo cargar el MDT IGN');
            const bitmap=await createImageBitmap(await response.blob());
            const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
            const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
            const rgba=ctx.getImageData(0,0,256,256).data;
            const result=new Float32Array(256*256);
            for(let i=0;i<result.length;i++)result[i]=rgba[i*4]*256+rgba[i*4+1]+rgba[i*4+2]/256-32768;
            return result;
          })();
          elevationCache.set(key,pending);
          if(elevationCache.size>48)elevationCache.delete(elevationCache.keys().next().value);
          try{return await pending;}catch(error){elevationCache.delete(key);throw error;}
        }
        maplibregl.addProtocol('ign-dem',async (request,abortController)=>{
          const match=request.url.match(/(\d+)\/(\d+)\/(\d+)\.png$/);
          if(!match)throw new Error('Tesela IGN inválida');
          const [z,x,y]=match.slice(1).map(Number);
          let parent=z, px=x, py=y;
          while(parent>=0&&!available.has(`${parent}/${px}/${py}`)){parent--;px=Math.floor(px/2);py=Math.floor(py/2);}
          if(parent<0)throw new Error('Fuera de cobertura del MDT IGN');
          if(parent===z){
            const response=await fetch(`terrain-ign/${parent}/${px}/${py}.png`,{signal:abortController.signal});
            if(!response.ok)throw new Error('No se pudo cargar el MDT IGN');
            return {data:await response.arrayBuffer()};
          }
          const factor=2**(z-parent),size=256/factor;
          const startX=(x-px*factor)*size, startY=(y-py*factor)*size;
          const centreKey=`${parent}/${px}/${py}`;
          const sources=new Map([[centreKey,await heightsAt(centreKey)]]);
          // Sample pixel centres. Border samples come from adjacent parent tiles
          // when available, preventing seams between overzoomed children.
          const dxs=[0],dys=[0];
          if(startX+0.5/factor-0.5<0)dxs.push(-1);
          if(startX+255.5/factor-0.5>=255)dxs.push(1);
          if(startY+0.5/factor-0.5<0)dys.push(-1);
          if(startY+255.5/factor-0.5>=255)dys.push(1);
          const neighbors=[];
          for(const dx of dxs)for(const dy of dys){
            const key=`${parent}/${px+dx}/${py+dy}`;
            if(key!==centreKey&&available.has(key))neighbors.push(heightsAt(key).then(data=>sources.set(key,data)));
          }
          await Promise.all(neighbors);
          abortController.signal.throwIfAborted();
          function sample(ix,iy){
            const dx=Math.floor(ix/256),dy=Math.floor(iy/256);
            const data=sources.get(`${parent}/${px+dx}/${py+dy}`);
            if(data)return data[((iy%256+256)%256)*256+(ix%256+256)%256];
            return sources.get(centreKey)[Math.max(0,Math.min(255,iy))*256+Math.max(0,Math.min(255,ix))];
          }
          const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
          const ctx=canvas.getContext('2d'),output=ctx.createImageData(256,256);
          for(let row=0;row<256;row++)for(let col=0;col<256;col++){
            const sx=startX+(col+0.5)/factor-0.5,sy=startY+(row+0.5)/factor-0.5;
            const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
            const top=sample(ix,iy)*(1-fx)+sample(ix+1,iy)*fx;
            const bottom=sample(ix,iy+1)*(1-fx)+sample(ix+1,iy+1)*fx;
            const height=top*(1-fy)+bottom*fy;
            const encoded=Math.max(0,Math.min(16777215,Math.round((height+32768)*256)));
            const i=(row*256+col)*4;
            output.data[i]=Math.floor(encoded/65536);output.data[i+1]=Math.floor(encoded/256)%256;output.data[i+2]=encoded%256;output.data[i+3]=255;
          }
          ctx.putImageData(output,0,0);
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
          return {data:await blob.arrayBuffer()};
        });
        protocolRegistered=true;
      }
      const config={type:'raster-dem',tiles:['ign-dem://local/{z}/{x}/{y}.png'],encoding:'terrarium',tileSize:256,maxzoom:12,attribution:manifest.attribution};
      map.addSource('ign-terrain',config);map.addSource('ign-shading',{...config});source='ign-terrain';
      if(map.getLayer('hillshade'))map.removeLayer('hillshade');
      map.addLayer({id:'hillshade',type:'hillshade',source:'ign-shading',paint:{'hillshade-exaggeration':0.45,'hillshade-shadow-color':'#4a628e','hillshade-highlight-color':'#fbfbfb','hillshade-accent-color':'#b9c5d6','hillshade-illumination-direction':315,'hillshade-illumination-anchor':'map'}},map.getLayer('outside')?'outside':undefined);
    }
    if(typeof map.setSky==='function')map.setSky({'sky-color':'#b9c5d6','horizon-color':'#fbfbfb','fog-color':'#cad9ea','sky-horizon-blend':0.8,'horizon-fog-blend':0.5,'fog-ground-blend':0.12});
    map.setMaxPitch(75);
    const sliders={};
    const summary=document.createElement('p');summary.className='terrain-note';summary.setAttribute('role','status');
    let terrainError='',previousView=null,returnButton=null;
    const failedSources=new Set();
    const tileKeys=new Set(manifest?.tiles||[]);
    const motion=duration=>root.AtlasConfig?.reducedMotion()?0:duration;
    function getState(){return {enabled,exaggeration,shade,pitch:map.getPitch(),bearing:map.getBearing(),source};}
    function changed(){options.onChange?.(getState());}
    function updateSummary(){
      let text=manifest?.tiles?.length?'MDT IGN':'Relieve Mapzen · fuente alternativa';
      if(tileKeys.size){
        const centre=map.getCenter(),lat=Math.max(-85.051129,Math.min(85.051129,centre.lat));
        // MapLibre's camera zoom uses 512 px tiles; this raster-dem uses 256 px.
        // Nominal z = camera zoom + 1. This estimates sampling at the centre,
        // not the renderer's adaptive terrain mesh LOD or altimetric accuracy.
        const limit=Math.min(manifest.maxzoom??12,Math.max(0,Math.floor(map.getZoom()+1)));
        let level=-1;
        for(let z=limit;z>=0;z--){
          const n=2**z,x=Math.floor((centre.lng+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
          if(tileKeys.has(`${z}/${x}/${y}`)){level=z;break;}
        }
        if(level>=0){
          const metres=40075016.68557849*Math.cos(lat*Math.PI/180)/(256*2**level);
          const resolution=new Intl.NumberFormat('es-ES',{maximumSignificantDigits:2}).format(metres);
          text+=` · muestreo aproximado en el centro: ≈${resolution} m/píxel (z${level})`;
          if(level<limit||Math.floor(map.getZoom()+1)>(manifest.maxzoom??12))text+=' · detalle limitado a esta malla';
        }else text+=' · sin cobertura en el centro';
      }
      text+=` · escala vertical ${new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(exaggeration)}×. `;
      text+='El terreno no representa la cota de la vía: túneles y viaductos no están modelados. El muestreo no indica precisión altimétrica.';
      if(terrainError)text+=' '+terrainError;
      const hasChanged=summary.textContent!==text;
      summary.textContent=text;
      summary.dataset.warning=terrainError?'1':'0';
      if(hasChanged)options.onSummary?.(text,Boolean(terrainError));
    }
    function onError(event){
      if(![source,'ign-shading'].includes(event.sourceId))return;
      const error=event.error,message=String(error?.message||'');
      if(error?.name==='AbortError'||/abort|Fuera de cobertura del MDT IGN/i.test(message))return;
      failedSources.add(event.sourceId);
      summary.dataset.error=message;
      terrainError='No se ha podido cargar parte del relieve. Puedes seguir explorando la red en 2D.';
      updateSummary();
    }
    function onSourceData(event){
      if(failedSources.has(event.sourceId)&&event.sourceDataType==='content'&&event.isSourceLoaded){
        failedSources.delete(event.sourceId);if(!failedSources.size){terrainError='';delete summary.dataset.error;}updateSummary();
      }
    }
    function setEnabled(value,{camera=true}={}){
      enabled=Boolean(value);map.setTerrain(enabled?{source,exaggeration}:null);
      if(camera)map.easeTo({pitch:enabled?55:0,duration:motion(600)});
      if(sliders.pitch)sliders.pitch.input.value=enabled?55:0;
      options.onToggle?.(enabled);sync();
    }
    function sync(){
      if(sliders.pitch){sliders.pitch.input.value=Math.round(map.getPitch());sliders.pitch.output.textContent=Math.round(map.getPitch())+'°';}
      if(sliders.bearing){sliders.bearing.input.value=Math.round(map.getBearing());sliders.bearing.output.textContent=Math.round(map.getBearing())+'°';}
      updateSummary();
    }
    function slider(key,title,min,max,step,value,unit,change){
      const label=document.createElement('label'),input=document.createElement('input'),output=document.createElement('output');
      label.className='terrain-control';label.append(document.createTextNode(title));input.type='range';input.min=min;input.max=max;input.step=step;input.value=value;input.setAttribute('aria-label',title);output.textContent=value+unit;
      input.oninput=()=>{output.textContent=input.value+unit;change(Number(input.value));};label.append(input,output);host.append(label);sliders[key]={input,output};
    }
    function action(title,fn){const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=fn;host.append(b);return b;}
    if(host){
      slider('pitch','Inclinación',0,75,1,0,'°',v=>{if(!enabled)setEnabled(true);map.jumpTo({pitch:v});});
      slider('bearing','Orientación',-180,180,1,0,'°',v=>map.jumpTo({bearing:v}));
      slider('exaggeration','Escala vertical',1,2,0.1,1,'×',v=>{exaggeration=v;if(enabled)map.setTerrain({source,exaggeration});updateSummary();changed();});
      const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;
      sliders.shade=check;
      check.onchange=()=>{shade=check.checked;if(map.getLayer('hillshade'))map.setLayoutProperty('hillshade','visibility',shade?'visible':'none');changed();};label.append(check,document.createTextNode('Sombreado del relieve'));host.append(label);
      const areas=manifest?.detail_areas||(manifest?.detail_bounds?{Guadarrama:manifest.detail_bounds}:{});
      for(const [name,box] of Object.entries(areas)){
        if(!Array.isArray(box)||box.length!==4||!box.every(Number.isFinite))continue;
        action('Explorar '+name.split(' (')[0],()=>{
          const centre=map.getCenter();
          previousView={...getState(),center:[centre.lng,centre.lat],zoom:map.getZoom(),padding:map.getPadding?.(),roll:map.getRoll?.()};
          returnButton.disabled=false;
          map.stop();setEnabled(true,{camera:false});
          map.fitBounds([[box[0],box[1]],[box[2],box[3]]],{padding:typeof options.padding==='function'?options.padding():options.padding??65,maxZoom:11,pitch:60,bearing:0,duration:motion(1100)});
        });
      }
      returnButton=action('Volver al encuadre anterior',()=>{
        if(!previousView)return;
        const view=previousView;previousView=null;returnButton.disabled=true;
        map.stop();restoreState(view);setEnabled(view.enabled,{camera:false});
        const camera={center:view.center,zoom:view.zoom,pitch:view.pitch,bearing:view.bearing,duration:motion(600)};
        if(view.padding)camera.padding=view.padding;
        if(Number.isFinite(view.roll))camera.roll=view.roll;
        map.easeTo(camera);
      });
      returnButton.disabled=true;
      action('Restablecer perspectiva',()=>{restoreState({exaggeration:1});map.easeTo({pitch:enabled?55:0,bearing:0,duration:motion(600)});});
      if(options.getSelection)action('Centrar selección',()=>{
        const feature=options.getSelection();if(!feature)return;
        let points=[];function walk(v){if(typeof v[0]==='number')points.push(v);else v.forEach(walk);}walk(feature.geometry.coordinates);
        const box=points.reduce((b,p)=>[[Math.min(b[0][0],p[0]),Math.min(b[0][1],p[1])],[Math.max(b[1][0],p[0]),Math.max(b[1][1],p[1])]],[[180,90],[-180,-90]]);
        map.fitBounds(box,{padding:typeof options.padding==='function'?options.padding():options.padding??85,maxZoom:14,pitch:enabled?55:0,duration:motion(600)});
      });
      host.append(summary);
    }
    function restoreState(state={}){
      if(typeof state.exaggeration==='number'&&Number.isFinite(state.exaggeration)&&state.exaggeration>=1&&state.exaggeration<=2){
        exaggeration=Math.round(state.exaggeration*10)/10;
        if(sliders.exaggeration){sliders.exaggeration.input.value=exaggeration;sliders.exaggeration.output.textContent=exaggeration+'×';}
        if(enabled)map.setTerrain({source,exaggeration});
      }
      if(typeof state.shade==='boolean'){
        shade=state.shade;if(sliders.shade)sliders.shade.checked=shade;
        if(map.getLayer('hillshade'))map.setLayoutProperty('hillshade','visibility',shade?'visible':'none');
      }
      updateSummary();changed();
    }
    map.on('moveend',sync);map.on('error',onError);map.on('sourcedata',onSourceData);
    updateSummary();
    return {setEnabled,getState,getSummary:()=>summary.textContent,restoreState,destroy:()=>{map.off('moveend',sync);map.off('error',onError);map.off('sourcedata',onSourceData);}};
  }
  root.AtlasTerrain={create};
})(typeof window!=='undefined'?window:globalThis);
