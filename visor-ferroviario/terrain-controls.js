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
    const summary=document.createElement('p');summary.className='terrain-note';
    summary.textContent=manifest?.tiles?.length?'Relieve IGN · detalle regional en Guadarrama. Fuera de esta zona se suavizan las alturas de la malla nacional; el acercamiento no añade detalle medido.':'Relieve Mapzen · fuente alternativa. MDT oficial no cargado.';
    function setEnabled(value){
      enabled=Boolean(value);map.setTerrain(enabled?{source,exaggeration}:null);
      map.easeTo({pitch:enabled?55:0,duration:root.AtlasConfig?.reducedMotion()?0:600});
      if(sliders.pitch)sliders.pitch.input.value=enabled?55:0;
      options.onToggle?.(enabled);sync();
    }
    function sync(){
      if(sliders.pitch){sliders.pitch.input.value=Math.round(map.getPitch());sliders.pitch.output.textContent=Math.round(map.getPitch())+'°';}
      if(sliders.bearing){sliders.bearing.input.value=Math.round(map.getBearing());sliders.bearing.output.textContent=Math.round(map.getBearing())+'°';}
    }
    function slider(key,title,min,max,step,value,unit,change){
      const label=document.createElement('label'),input=document.createElement('input'),output=document.createElement('output');
      label.className='terrain-control';label.append(document.createTextNode(title));input.type='range';input.min=min;input.max=max;input.step=step;input.value=value;input.setAttribute('aria-label',title);output.textContent=value+unit;
      input.oninput=()=>{output.textContent=input.value+unit;change(Number(input.value));};label.append(input,output);host.append(label);sliders[key]={input,output};
    }
    function action(title,fn){const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=fn;host.append(b);}
    if(host){
      slider('pitch','Inclinación',0,75,1,0,'°',v=>{if(!enabled)setEnabled(true);map.jumpTo({pitch:v});});
      slider('bearing','Orientación',-180,180,1,0,'°',v=>map.jumpTo({bearing:v}));
      slider('exaggeration','Escala vertical',1,2,0.1,1,'×',v=>{exaggeration=v;if(enabled)map.setTerrain({source,exaggeration});});
      const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;
      check.onchange=()=>{shade=check.checked;map.setLayoutProperty('hillshade','visibility',shade?'visible':'none');};label.append(check,document.createTextNode('Sombreado del relieve'));host.append(label);
      action('Explorar Guadarrama',()=>{setEnabled(true);map.flyTo({center:[-4.02,40.77],zoom:10.6,pitch:65,bearing:-25,duration:root.AtlasConfig?.reducedMotion()?0:1400});});
      action('Restablecer perspectiva',()=>{exaggeration=1;sliders.exaggeration.input.value=1;sliders.exaggeration.output.textContent='1×';if(enabled)map.setTerrain({source,exaggeration});map.easeTo({pitch:enabled?55:0,bearing:0});});
      if(options.getSelection)action('Centrar selección',()=>{
        const feature=options.getSelection();if(!feature)return;
        let points=[];function walk(v){if(typeof v[0]==='number')points.push(v);else v.forEach(walk);}walk(feature.geometry.coordinates);
        const box=points.reduce((b,p)=>[[Math.min(b[0][0],p[0]),Math.min(b[0][1],p[1])],[Math.max(b[1][0],p[0]),Math.max(b[1][1],p[1])]],[[180,90],[-180,-90]]);
        map.fitBounds(box,{padding:85,maxZoom:14,pitch:enabled?55:0});
      });
      host.append(summary);
    }
    map.on('moveend',sync);
    return {setEnabled,getState:()=>({enabled,exaggeration,shade,pitch:map.getPitch(),bearing:map.getBearing(),source}),destroy:()=>map.off('moveend',sync)};
  }
  root.AtlasTerrain={create};
})(typeof window!=='undefined'?window:globalThis);
