(function(root){
  'use strict';
  let protocolRegistered=false;
  function create(map,options={}) {
    const host=typeof options.container==='string'?document.querySelector(options.container):options.container;
    const manifest=root.IGN_TERRAIN_MANIFEST;
    let enabled=false, exaggeration=1, shade=true;
    let lighting='day',reliefStyle='soft',strength=0.45,palette='cartographic',activeArea=0,disposed=false;
    const areas=Object.entries(manifest?.detail_areas||(manifest?.detail_bounds?{Guadarrama:manifest.detail_bounds}:{}))
      .filter(([,box])=>Array.isArray(box)&&box.length===4&&box.every(Number.isFinite));
    const lights={
      day:{direction:315,altitude:45,shadow:'#4a6280',highlight:'#fbfcfa',accent:'#a6b9c4',sky:'#adc9e0',fog:'#d5e2ec'},
      warm:{direction:285,altitude:25,shadow:'#5c536e',highlight:'#fff0cc',accent:'#b7a2a1',sky:'#b9cadc',fog:'#eee0d2'},
      studio:{direction:345,altitude:60,shadow:'#324e63',highlight:'#e9f7ff',accent:'#85aeb9',sky:'#91b2c9',fog:'#cfdee6'}
    };
    // Paletas hipsométricas (metros → color). Realistas salvo «Pastel», la original del visor.
    const PALETTES={
      natural:{label:'Natural',opacity:.85,stops:[0,'#9dbf8e',200,'#b3cb98',500,'#cdd6a6',800,'#e2dcae',1100,'#e0cb9c',1500,'#cfae86',1900,'#b39880',2300,'#a9a098',2700,'#d6d4d0',3200,'#ffffff']},
      bosque:{label:'Bosque',opacity:.85,stops:[0,'#7fa77a',300,'#8fb07f',700,'#a6b98a',1100,'#b8b78e',1500,'#a89878',1900,'#8f8274',2400,'#9d9a96',2900,'#e4e4e2',3400,'#ffffff']},
      meseta:{label:'Meseta',opacity:.85,stops:[0,'#b9c49a',300,'#d3cf9f',600,'#e3d3a0',900,'#dcbf8c',1300,'#c9a274',1800,'#a98a6c',2400,'#9e948c',3000,'#e8e6e2']},
      suizo:{label:'Suizo',opacity:.9,stops:[0,'#a4c3b6',300,'#bccfae',700,'#d6d9b3',1100,'#e8ddb5',1500,'#efe2c0',2000,'#f3ead6',2600,'#f8f5ee',3400,'#ffffff']},
      elevation:{label:'Pastel',opacity:.78,stops:[0,'#bdd5ce',400,'#a6c5b3',800,'#c9d2b4',1200,'#ded6b9',1800,'#c0b6a6',2400,'#dddcd4',3400,'#fafcfc']}
    };
    // Sombreados: «multidireccional» se retiró por agresivo (tres luces suman contraste en cada ladera).
    const RELIEF={soft:{method:'igor'},crisp:{method:'standard'},slope:{method:'combined'},zenith:{method:'igor',altitude:70,gain:1.25}};
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
            const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close();
            const rgba=ctx.getImageData(0,0,256,256).data;
            const result=new Float32Array(256*256);
            for(let i=0;i<result.length;i++)result[i]=rgba[i*4]*256+rgba[i*4+1]+rgba[i*4+2]/256-32768;
            return result;
          })();
          elevationCache.set(key,pending);
          if(elevationCache.size>96)elevationCache.delete(elevationCache.keys().next().value);
          try{return await pending;}catch(error){elevationCache.delete(key);throw error;}
        }
        async function prepareTile(z,x,y){
          let parent=z, px=x, py=y;
          while(parent>=0&&!available.has(`${parent}/${px}/${py}`)){parent--;px=Math.floor(px/2);py=Math.floor(py/2);}
          if(parent<0)throw new Error('Fuera de cobertura del MDT IGN');
          if(parent===z){
            const response=await fetch(`terrain-ign/${parent}/${px}/${py}.png`);
            if(!response.ok)throw new Error('No se pudo cargar el MDT IGN');
            return {buffer:await response.arrayBuffer()};
          }
          const factor=2**(z-parent),size=256/factor;
          const startX=(x-px*factor)*size, startY=(y-py*factor)*size;
          const centreKey=`${parent}/${px}/${py}`;
          const sources=new Map([[centreKey,await heightsAt(centreKey)]]);
          // Sample pixel centres. Border samples come from adjacent parent tiles
          // when available, preventing seams between overzoomed children.
          // Bicubic sampling reads up to two pixels beyond the window.
          const dxs=[0],dys=[0];
          if(startX+0.5/factor-0.5-1<0)dxs.push(-1);
          if(startX+255.5/factor-0.5+2>255)dxs.push(1);
          if(startY+0.5/factor-0.5-1<0)dys.push(-1);
          if(startY+255.5/factor-0.5+2>255)dys.push(1);
          const neighbors=[];
          for(const dx of dxs)for(const dy of dys){
            const key=`${parent}/${px+dx}/${py+dy}`;
            if(key!==centreKey&&available.has(key))neighbors.push(heightsAt(key).then(data=>sources.set(key,data)));
          }
          await Promise.all(neighbors);
          // Resolve neighbours once: the pixel loop must not allocate hundreds
          // of thousands of tile-key strings for every overzoomed tile.
          const centerData=sources.get(centreKey),grid=new Array(9);
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)grid[(dy+1)*3+dx+1]=sources.get(`${parent}/${px+dx}/${py+dy}`);
          function sample(ix,iy){
            const dx=ix<0?-1:ix>255?1:0,dy=iy<0?-1:iy>255?1:0;
            const data=grid[(dy+1)*3+dx+1];
            if(data)return data[(iy-dy*256)*256+ix-dx*256];
            return centerData[Math.max(0,Math.min(255,iy))*256+Math.max(0,Math.min(255,ix))];
          }
          const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
          const ctx=canvas.getContext('2d'),output=ctx.createImageData(256,256);
          // Catmull-Rom (pendiente continua). La bilineal deja quiebros de pendiente en cada
          // píxel de origen que el sombreado convierte en una rejilla de bandas al ampliar.
          const cubic=(p0,p1,p2,p3,t)=>p1+.5*t*(p2-p0+t*(2*p0-5*p1+4*p2-p3+t*(3*(p1-p2)+p3-p0)));
          const rowValue=(ix,y,t)=>cubic(sample(ix-1,y),sample(ix,y),sample(ix+1,y),sample(ix+2,y),t);
          for(let row=0;row<256;row++)for(let col=0;col<256;col++){
            const sx=startX+(col+0.5)/factor-0.5,sy=startY+(row+0.5)/factor-0.5;
            const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
            const height=cubic(rowValue(ix,iy-1,fx),rowValue(ix,iy,fx),rowValue(ix,iy+1,fx),rowValue(ix,iy+2,fx),fy);
            const encoded=Math.max(0,Math.min(16777215,Math.round((height+32768)*256)));
            const i=(row*256+col)*4;
            output.data[i]=Math.floor(encoded/65536);output.data[i+1]=Math.floor(encoded/256)%256;output.data[i+2]=encoded%256;output.data[i+3]=255;
          }
          // MapLibre accepts ImageBitmap protocol responses. Keep the numeric
          // pixels rather than PNG-encoding them on the main thread and asking
          // the renderer to decode the same PNG immediately afterwards.
          return {rgba:output.data};
        }
        // Terrain and shading request the same URLs independently. Share the
        // producer, but never its transferable buffer or a caller's abort signal.
        const preparedCache=new Map();
        maplibregl.addProtocol('ign-dem',async (request,abortController)=>{
          abortController.signal.throwIfAborted();
          const match=request.url.match(/(\d+)\/(\d+)\/(\d+)\.png$/);
          if(!match)throw new Error('Tesela IGN inválida');
          const key=match.slice(1).join('/');
          let pending=preparedCache.get(key);
          if(pending){preparedCache.delete(key);preparedCache.set(key,pending);}
          else{
            pending=prepareTile(...match.slice(1).map(Number));preparedCache.set(key,pending);
            if(preparedCache.size>64)preparedCache.delete(preparedCache.keys().next().value);
          }
          let tile;
          try{tile=await pending;}catch(error){if(preparedCache.get(key)===pending)preparedCache.delete(key);throw error;}
          abortController.signal.throwIfAborted();
          if(tile.buffer)return {data:tile.buffer.slice(0)};
          const bitmap=await createImageBitmap(new ImageData(tile.rgba.slice(),256,256));
          try{abortController.signal.throwIfAborted();}catch(error){bitmap.close();throw error;}
          return {data:bitmap};
        });
        protocolRegistered=true;
      }
      // maxzoom del manifiesto: z12 en los corredores (MDT25) y z14 en las zonas piloto (MDT05);
      // fuera de ellas el protocolo amplía la tesela antecesora, sin inventar detalle.
      const config={type:'raster-dem',tiles:['ign-dem://local/{z}/{x}/{y}.png'],encoding:'terrarium',tileSize:256,maxzoom:manifest.maxzoom??12,attribution:manifest.attribution+((manifest.detail_zones||[]).length?' · MDT05 IGN (PNOA LiDAR) en zonas piloto':'')};
      map.addSource('ign-terrain',config);map.addSource('ign-shading',{...config});source='ign-terrain';
      if(map.getLayer('hillshade'))map.removeLayer('hillshade');
      map.addLayer({id:'hillshade',type:'hillshade',source:'ign-shading',paint:{'hillshade-exaggeration':0.45,'hillshade-shadow-color':'#4a628e','hillshade-highlight-color':'#fbfbfb','hillshade-accent-color':'#b9c5d6','hillshade-illumination-direction':315,'hillshade-illumination-anchor':'map'}},map.getLayer('outside')?'outside':undefined);
    }
    map.addLayer({id:'terrain-altitude',type:'color-relief',source:source==='ign-terrain'?'ign-shading':source,
      layout:{visibility:'none'},paint:{'color-relief-opacity':PALETTES.natural.opacity,'color-relief-color':['interpolate',['linear'],['elevation'],...PALETTES.natural.stops]}},
      map.getLayer('hillshade')?'hillshade':undefined);
    const sliders={};
    function appearance(){
      const light=lights[lighting];
      if(map.getLayer('hillshade')){
        const relief=RELIEF[reliefStyle],gain=strength*(relief.gain||1);
        const values={'hillshade-method':relief.method,
          // Más suave a escala peninsular: el relieve acompaña y la red manda.
          'hillshade-exaggeration':['interpolate',['linear'],['zoom'],5,Math.min(1,gain*.5),8,Math.min(1,gain*.8),10,Math.min(1,gain)],'hillshade-shadow-color':light.shadow,'hillshade-highlight-color':light.highlight,
          'hillshade-accent-color':light.accent,'hillshade-illumination-anchor':'map',
          'hillshade-illumination-direction':light.direction,'hillshade-illumination-altitude':relief.altitude??light.altitude};
        for(const [key,value] of Object.entries(values))map.setPaintProperty?.('hillshade',key,value);
        map.setLayoutProperty('hillshade','visibility',shade?'visible':'none');
      }
      if(map.getLayer('terrain-altitude')){
        const tint=PALETTES[palette];
        map.setLayoutProperty('terrain-altitude','visibility',tint?'visible':'none');
        // Sobre un fondo completo (IGN, Positron…) la tinta es más ligera para que se lean sus rótulos.
        const backdrop=options.getBasemap?.()||'simple';
        if(tint){map.setPaintProperty('terrain-altitude','color-relief-color',['interpolate',['linear'],['elevation'],...tint.stops]);map.setPaintProperty('terrain-altitude','color-relief-opacity',backdrop==='simple'?tint.opacity:tint.opacity*.55);}
      }
      if(sliders.key){sliders.key.hidden=!PALETTES[palette];sliders.key.dataset.palette=palette;
        if(PALETTES[palette])sliders.key.textContent=`${PALETTES[palette].label} · color por altitud, de 0 a ${new Intl.NumberFormat('es-ES',{useGrouping:'always'}).format(PALETTES[palette].stops.at(-2))} m`;}
      if(typeof map.setSky==='function')map.setSky({'sky-color':light.sky,'horizon-color':light.highlight,'fog-color':light.fog,
        'sky-horizon-blend':0.8,'horizon-fog-blend':0.5,'fog-ground-blend':0.12});
    }
    appearance();
    map.setMaxPitch(75);
    const summary=document.createElement('p');summary.className='terrain-note';summary.setAttribute('role','status');
    let terrainError='',previousView=null,returnButton=null;
    const failedSources=new Set();
    const tileKeys=new Set(manifest?.tiles||[]);
    const motion=duration=>root.AtlasConfig?.reducedMotion()?0:duration;
    function getState(){return {enabled,exaggeration,shade,lighting,reliefStyle,strength,palette,pitch:map.getPitch(),bearing:map.getBearing(),source};}
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
      text+=` · escala vertical ${new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(exaggeration)}×`;
      if(PALETTES[palette])text+=` · color del terreno «${PALETTES[palette].label}» por altitud`;
      text+='. ';
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
      map.stop();enabled=Boolean(value);map.setTerrain(enabled?{source,exaggeration}:null);
      if(camera)map.easeTo({pitch:enabled?55:0,duration:motion(600)});
      if(sliders.pitch)sliders.pitch.input.value=enabled?55:0;
      if(sliders.mode)for(const [value,button] of Object.entries(sliders.mode))button.setAttribute('aria-pressed',String(enabled===(value==='3d')));
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
      input.oninput=()=>{output.textContent=input.value+unit;change(Number(input.value));};label.append(input,output);(sliders.target||host).append(label);sliders[key]={input,output};
    }
    function action(title,fn){const b=document.createElement('button');b.type='button';b.textContent=title;b.onclick=fn;host.append(b);return b;}
    function el(tag,className,text){const node=document.createElement(tag);node.className=className;if(text)node.textContent=text;return node;}
    function choices(key,title,items,value,change,kind='terrain-segments'){
      const group=el('div','terrain-choices'),caption=el('p','terrain-caption',title),row=el('div',kind);
      row.setAttribute('role','group');row.setAttribute('aria-label',title);sliders[key]={};
      for(const [id,label] of items){const b=el('button','',kind==='terrain-swatches'?'':label);b.type='button';
        // Muestra de la paleta (degradado por CSS, sin estilos en línea).
        if(kind==='terrain-swatches'){const swatch=el('span','terrain-swatch');swatch.dataset.palette=id;b.append(swatch,el('span','',label));}b.setAttribute('aria-pressed',String(id===value));
        b.onclick=()=>{change(id);for(const [item,button] of Object.entries(sliders[key]))button.setAttribute('aria-pressed',String(item===id));};
        row.append(b);sliders[key][id]=b;}
      group.append(caption,row);(sliders.target||host).append(group);
    }
    let sceneRequest=0;
    async function openScene(focus=null){
      const request=++sceneRequest,area=areas[activeArea];if(!area)return;
      const opener=document.activeElement;
      const button=sliders.scene;button.disabled=true;button.textContent='Preparando escena…';
      sliders.sceneStatus.textContent='';
      try{
        await import('./terrain-scene.mjs?v=7fe62d65');
        if(disposed||request!==sceneRequest)return;
        button.disabled=false;opener?.focus?.({preventScroll:true});
        await root.AtlasTerrainScene.open({area:{name:area[0].split(' (')[0],bounds:area[1]},network:options.getNetwork?.()||{base:options.getFeatures?.()||[]},
          stations:options.getStations?.()||[],focus:focus||options.getFocus?.()||null});
      }catch(error){if(!disposed&&request===sceneRequest){button.textContent='Reintentar escena 3D';sliders.sceneStatus.textContent='No se ha podido abrir la escena. Puedes reintentarlo o seguir explorando el mapa.';}}
      finally{if(!disposed&&request===sceneRequest){button.disabled=false;if(button.textContent!=='Reintentar escena 3D')button.textContent='Abrir explorador 3D';}}
    }
    // Abre el explorador en el paisaje que contiene la estación seleccionada o el centro del mapa
    // (el más pequeño: las zonas piloto tienen más detalle); si no hay ninguno, el más cercano.
    function areaFor(point){
      const [lng,lat]=point,inside=areas.map(([,b],i)=>({i,b})).filter(({b})=>lng>=b[0]&&lng<=b[2]&&lat>=b[1]&&lat<=b[3]);
      if(inside.length)return {index:inside.sort((a,b)=>(a.b[2]-a.b[0])*(a.b[3]-a.b[1])-(b.b[2]-b.b[0])*(b.b[3]-b.b[1]))[0].i,inside:true};
      let best=0,distance=Infinity;
      areas.forEach(([,b],i)=>{const d=Math.hypot((b[0]+b[2])/2-lng,((b[1]+b[3])/2-lat)*1.3);if(d<distance){distance=d;best=i;}});
      return {index:best,inside:false};
    }
    function openExplorer({center,station}={}){
      const point=station?.geometry?.coordinates||center;if(!point||!areas.length)return null;
      const choice=areaFor(point);activeArea=choice.index;
      openScene({station:station?.properties?.CODIGO??null});
      return {name:areas[choice.index][0].split(' (')[0],inside:choice.inside};
    }
    if(host){
      const hero=el('div','terrain-hero'),eyebrow=el('span','terrain-eyebrow','EXPLORADOR DEL TERRENO'),title=el('h3','', 'La forma del territorio.');
      const image=el('img','terrain-cover');image.src='assets/terrain/guadarrama-preview.png?v=3f3065d0';image.alt='';image.width=960;image.height=640;image.loading='lazy';
      hero.append(image,eyebrow,title,el('p','','Gira las montañas, descubre los valles y mira la red desde otra perspectiva.'));
      const scene=el('button','terrain-launch','Abrir explorador 3D');scene.id='terrain-open-scene';scene.type='button';scene.onclick=()=>openScene();sliders.scene=scene;
      const sceneStatus=el('p','terrain-scene-message');sceneStatus.setAttribute('role','status');sliders.sceneStatus=sceneStatus;
      hero.append(scene,sceneStatus,el('small','','Terreno IGN · escena interactiva de Guadarrama'));sliders.heroNote=hero.children[hero.children.length-1];
      hero.append(el('small','terrain-cover-note','Portada: escala vertical 2×'));host.append(hero);
      choices('mode','Vista del mapa',[['2d','Plano'],['3d','Inclinado con relieve']],'2d',value=>setEnabled(value==='3d'));
      const camera=el('details','terrain-settings');camera.open=true;camera.append(el('summary','','Cámara y profundidad'));host.append(camera);sliders.target=camera;
      slider('pitch','Inclinación',0,75,1,0,'°',v=>{if(!enabled)setEnabled(true);map.jumpTo({pitch:v});});
      slider('bearing','Orientación',-180,180,1,0,'°',v=>map.jumpTo({bearing:v}));
      slider('exaggeration','Escala vertical',1,2,0.1,1,'×',v=>{exaggeration=v;if(enabled)map.setTerrain({source,exaggeration});updateSummary();changed();});
      delete sliders.target;
      const rendering=el('details','terrain-settings');rendering.open=true;rendering.append(el('summary','','Luz y cartografía'));host.append(rendering);sliders.target=rendering;
      choices('lighting','Iluminación',[['day','Natural'],['warm','Rasante'],['studio','Fría']],lighting,value=>{lighting=value;appearance();changed();});
      choices('reliefStyle','Sombreado',[['soft','Suave'],['crisp','Clásico'],['slope','Pendientes'],['zenith','Cenital']],reliefStyle,value=>{reliefStyle=value;appearance();changed();});
      slider('strength','Intensidad',0.2,1,0.05,strength,'',value=>{strength=value;appearance();changed();});
      choices('palette','Color del terreno',[['cartographic','Fondo del mapa'],...Object.entries(PALETTES).map(([id,item])=>[id,item.label])],palette,value=>{palette=value;appearance();updateSummary();changed();},'terrain-swatches');
      sliders.key=el('p','terrain-altitude-key');sliders.key.hidden=true;rendering.append(sliders.key);
      const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;
      sliders.shade=check;
      check.onchange=()=>{shade=check.checked;appearance();changed();};label.append(check,document.createTextNode('Mostrar sombreado'));rendering.append(label);delete sliders.target;
      host.append(el('h3','terrain-section-title','Paisajes ferroviarios'),el('p','terrain-caption','Recórrelos inclinados en el mapa o abre su modelo en el explorador 3D. Las zonas piloto usan el MDT05 del IGN (PNOA LiDAR).'));
      const descriptionOf=name=>({Guadarrama:'La sierra entre las dos mesetas',Pajares:'La Cordillera Cantábrica entre León y Asturias','Despeñaperros':'El paso de Sierra Morena',Contreras:'El paisaje de las hoces del Cabriel'})[name.split(' ')[0]]
        +(/·/.test(name)?' · detalle MDT05':'');
      const descriptions=areas.map(([name])=>descriptionOf(name));
      areas.forEach(([name,box],index)=>{
        const preset=action('Explorar '+name.split(' (')[0],()=>{
          activeArea=index;sliders.heroNote.textContent='Terreno IGN · escena interactiva de '+name.split(' (')[0];
          const centre=map.getCenter();
          previousView={...getState(),center:[centre.lng,centre.lat],zoom:map.getZoom(),padding:map.getPadding?.(),roll:map.getRoll?.()};
          returnButton.disabled=false;
          map.stop();setEnabled(true,{camera:false});
          map.fitBounds([[box[0],box[1]],[box[2],box[3]]],{padding:typeof options.padding==='function'?options.padding():options.padding??65,maxZoom:/·/.test(name)?13:11,pitch:60,bearing:[-25,25,-20,30,-25,25][index]||0,duration:motion(1100)});
        });
        preset.className='terrain-preset';preset.dataset.area=String(index);preset.setAttribute('title',descriptions[index]||name);
        const description=el('div','terrain-area-detail');description.append(el('small','',descriptions[index]||name));
        const model=el('button','terrain-model','Ver modelo 3D');model.type='button';model.setAttribute('aria-label','Ver modelo 3D de '+name.split(' (')[0]);
        model.onclick=()=>{activeArea=index;openScene({});};description.append(model);host.append(description);
      });
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
      action('Restablecer perspectiva',()=>{map.stop();restoreState({exaggeration:1,shade:true,lighting:'day',reliefStyle:'soft',strength:0.45,palette:'cartographic'});map.easeTo({pitch:enabled?55:0,bearing:0,duration:motion(600)});});
      if(options.getSelection)action('Centrar selección',()=>{
        const feature=options.getSelection();if(!feature)return;
        let points=[];function walk(v){if(!Array.isArray(v))return;if(typeof v[0]==='number')points.push(v);else v.forEach(walk);}walk(feature.geometry?.coordinates);if(!points.length)return;
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
      if(Object.hasOwn(lights,state.lighting))lighting=state.lighting;
      if(Object.hasOwn(RELIEF,state.reliefStyle))reliefStyle=state.reliefStyle;
      if(typeof state.strength==='number'&&Number.isFinite(state.strength)&&state.strength>=0.2&&state.strength<=1)strength=state.strength;
      if(state.palette==='cartographic'||Object.hasOwn(PALETTES,state.palette))palette=state.palette;
      for(const [key,value] of Object.entries({lighting,reliefStyle,palette}))if(sliders[key])for(const [id,button] of Object.entries(sliders[key]))button.setAttribute('aria-pressed',String(id===value));
      if(sliders.strength){sliders.strength.input.value=strength;sliders.strength.output.textContent=String(strength);}
      appearance();
      updateSummary();changed();
    }
    map.on('moveend',sync);map.on('error',onError);map.on('sourcedata',onSourceData);
    updateSummary();
    return {setEnabled,getState,openExplorer,refresh:appearance,getSummary:()=>summary.textContent,restoreState,destroy:()=>{disposed=true;sceneRequest++;root.AtlasTerrainScene?.close();map.off('moveend',sync);map.off('error',onError);map.off('sourcedata',onSourceData);}};
  }
  root.AtlasTerrain={create};
})(typeof window!=='undefined'?window:globalThis);
