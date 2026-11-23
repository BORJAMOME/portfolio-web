import * as THREE from './vendor/three/three.module.js';
import {OrbitControls} from './vendor/three/OrbitControls.js';
import {loadTerrainGrid,validateBounds,mercatorX,mercatorY} from './terrain-data.mjs';
import {loadPositronTexture} from './terrain-basemap.mjs?v=7ed2acf4';
import {createStations} from './terrain-stations.mjs?v=c347a9ba';

const root=globalThis;
const format=new Intl.NumberFormat('es-ES',{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat('es-ES',{maximumFractionDigits:1});
const LIGHTS={day:{name:'Día claro',color:0xfffaf0,intensity:2.3,position:[-.45,1.1,.6],ambient:1.5},golden:{name:'Tarde suave',color:0xffe6c9,intensity:2.4,position:[-.8,.65,.48],ambient:1.25},cool:{name:'Luz difusa',color:0xe8f3ff,intensity:1.7,position:[.7,1.1,-.45],ambient:1.8}};
const MAP_CREDIT='Positron · OpenFreeMap / OpenMapTiles · © OpenStreetMap (openstreetmap.org/copyright)';
let active=null;

function button(label,action,className=''){
  const element=document.createElement('button');element.type='button';element.textContent=label;
  if(action)element.dataset.action=action;
  if(className)element.className=className;
  return element;
}
function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function areaOf(value){
  if(value&&validateBounds(value.bounds))return {name:value.name||value.title||'Terreno IGN',id:value.id||'',bounds:[...value.bounds]};
  const areas=root.IGN_TERRAIN_MANIFEST?.detail_areas||{};
  const match=Object.entries(areas).find(([name])=>name===value||name.toLowerCase().startsWith(String(value||'guadarrama').toLowerCase()));
  if(match)return {name:match[0].split(' (')[0],id:match[0].split(' ')[0].toLowerCase(),bounds:[...match[1]]};
  throw new Error('No se encuentra esta zona del relieve.');
}
function disposeObject(object){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  object.traverse(child=>{
    if(child.geometry)geometries.add(child.geometry);
    for(const material of child.material?(Array.isArray(child.material)?child.material:[child.material]):[]){
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    }
  });
  textures.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());geometries.forEach(item=>item.dispose());
}

function createUI(area){
  const dialog=element('dialog','terrain-studio');dialog.dataset.state='loading';
  dialog.setAttribute('aria-labelledby','terrain-studio-title');
  dialog.setAttribute('aria-describedby','terrain-studio-description');
  const header=element('header','terrain-studio-header');
  const heading=element('div','terrain-studio-heading');
  heading.append(element('span','terrain-studio-eyebrow','ESTUDIO DEL RELIEVE'));
  const title=element('h2','',area.name);title.id='terrain-studio-title';heading.append(title);
  const description=element('p','', 'Relieve, localidades y estaciones. Explora la zona con su mapa.');description.id='terrain-studio-description';heading.append(description);
  const close=button('Cerrar','close','terrain-studio-close');close.setAttribute('aria-label','Cerrar el estudio del relieve');
  header.append(heading,close);
  const stage=element('div','terrain-studio-stage');
  const overlay=element('div','terrain-studio-loading');
  const progress=element('progress');progress.removeAttribute('value');progress.setAttribute('aria-label','Cargando elevaciones del IGN');
  const status=element('p','terrain-studio-status','Leyendo las elevaciones del IGN…');status.setAttribute('role','status');
  const retry=button('Volver a cargar','retry');retry.hidden=true;overlay.append(progress,status,retry);stage.append(overlay);
  const orientation=element('div','terrain-studio-orientation');orientation.setAttribute('aria-hidden','true');
  orientation.append(element('span','terrain-studio-north','N'),element('span','','Terreno IGN · 3D'));stage.append(orientation);
  const instruction=element('p','terrain-studio-gesture','Arrastra para girar · rueda para acercar · clic derecho para desplazar');stage.append(instruction);
  const controls=element('div','terrain-studio-controls');
  const cameras=element('div','terrain-studio-group');cameras.setAttribute('role','group');cameras.setAttribute('aria-label','Punto de vista');
  cameras.append(element('span','terrain-studio-label','Punto de vista'));
  for(const [key,label] of [['perspective','Perspectiva'],['top','Cenital'],['low','A ras del terreno']]){
    const control=button(label,`camera-${key}`);control.setAttribute('aria-pressed',String(key==='perspective'));cameras.append(control);
  }
  const lighting=element('label','terrain-studio-light terrain-studio-group');lighting.append(element('span','terrain-studio-label','Iluminación'));
  const light=document.createElement('select');light.setAttribute('aria-label','Iluminación del terreno');
  for(const [key,value] of Object.entries(LIGHTS)){const option=document.createElement('option');option.value=key;option.textContent=value.name;light.append(option);}light.value='day';lighting.append(light);
  const surface=element('label','terrain-studio-surface terrain-studio-group');surface.append(element('span','terrain-studio-label','Mapa sobre el terreno'));
  const basemap=document.createElement('select');basemap.setAttribute('aria-label','Mapa base del estudio 3D');
  for(const [key,label] of [['positron','Positron'],['natural','Relieve natural']]){const option=document.createElement('option');option.value=key;option.textContent=label;basemap.append(option);}surface.append(basemap);
  const scale=element('label','terrain-studio-scale terrain-studio-group');
  const scaleLabel=element('span','terrain-studio-label','Escala vertical');
  const exaggeration=document.createElement('input');exaggeration.type='range';exaggeration.min='1';exaggeration.max='3';exaggeration.step='.1';exaggeration.value='2';exaggeration.setAttribute('aria-label','Escala vertical del estudio 3D');exaggeration.setAttribute('aria-valuetext','2 veces la altura del terreno');
  const output=element('output','','2×');output.id='terrain-studio-scale';scale.append(scaleLabel,exaggeration,output);
  const layers=element('div','terrain-studio-toggles terrain-studio-group');
  const contourLabel=document.createElement('label'),contours=document.createElement('input');contours.type='checkbox';contours.checked=true;contourLabel.append(contours,document.createTextNode('Curvas de nivel · 200 m'));
  const railLabel=document.createElement('label'),rail=document.createElement('input');rail.type='checkbox';rail.checked=true;railLabel.append(rail,document.createTextNode('Ejes ferroviarios sobre terreno'));
  const stationLabel=document.createElement('label'),stations=document.createElement('input');stations.type='checkbox';stations.checked=true;stationLabel.append(stations,document.createTextNode('Estaciones y nombres'));layers.append(contourLabel,railLabel,stationLabel);
  const stationField=element('label','terrain-studio-station-select terrain-studio-group');stationField.append(element('span','terrain-studio-label','Estaciones de la zona'));
  const stationSelect=document.createElement('select');stationSelect.setAttribute('aria-label','Buscar estación en el modelo');
  const emptyStation=document.createElement('option');emptyStation.value='';emptyStation.textContent='Seleccionar estación';stationSelect.append(emptyStation);stationField.append(stationSelect);
  const exportButton=button('Guardar imagen','export','terrain-studio-export');exportButton.disabled=true;
  controls.append(cameras,surface,lighting,scale,layers,stationField,exportButton);
  const mapMessage=element('div','terrain-studio-map-message');mapMessage.setAttribute('role','status');
  const mapStatus=element('span','','Cargando cartografía Positron…'),mapRetry=button('Reintentar Positron','retry-basemap');mapRetry.hidden=true;mapMessage.append(mapStatus,mapRetry);stage.append(mapMessage);
  const stationInfo=element('div','terrain-studio-station-info');stationInfo.hidden=true;stationInfo.setAttribute('role','status');
  const stationName=element('strong'),stationCode=element('span'),stationFocus=button('Centrar estación','focus-station');stationInfo.append(stationName,stationCode,stationFocus);stage.append(stationInfo);
  const footer=element('footer','terrain-studio-footer');
  const stats=element('p','terrain-studio-stats','Preparando el modelo de elevaciones…');
  const source=element('p','terrain-studio-source','Obra derivada de MDT IGN · CC BY 4.0. Estaciones: catálogo Renfe. Vista inicial con altura ampliada 2×; el corte lateral delimita la escena. Ejes y estaciones se apoyan sobre el terreno: no representan cotas ferroviarias, túneles ni viaductos.');
  const mapCredit=element('p','terrain-studio-map-credit');
  footer.append(stats,source,mapCredit);dialog.append(header,stage,controls,footer);document.body.append(dialog);
  return {dialog,stage,overlay,progress,status,retry,close,cameras,light,basemap,mapStatus,mapRetry,mapCredit,exaggeration,output,contours,rail,railLabel,stations,stationLabel,stationSelect,stationInfo,stationName,stationCode,stationFocus,exportButton,stats,instruction};
}

function hypsometric(height){
  const stops=[[0,0xafc4b5],[600,0xb2c7aa],[1100,0xc1ceb4],[1600,0xd0d1b8],[2100,0xdad2be],[2600,0xe5dfd1],[3400,0xf4f1e8]];
  for(let i=1;i<stops.length;i++)if(height<=stops[i][0]){
    const fraction=THREE.MathUtils.clamp((height-stops[i-1][0])/(stops[i][0]-stops[i-1][0]),0,1);
    return new THREE.Color(stops[i-1][1]).lerp(new THREE.Color(stops[i][1]),fraction);
  }
  return new THREE.Color(stops.at(-1)[1]);
}
function terrainMaterial({scale=1000,offset=0}={}){
  const uniforms={contours:{value:1},heightScale:{value:scale},heightOffset:{value:offset},cartography:{value:0},lightDirection:{value:new THREE.Vector3(-.45,1.1,.6).normalize()}};
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uContours=uniforms.contours;shader.uniforms.uHeightScale=uniforms.heightScale;shader.uniforms.uHeightOffset=uniforms.heightOffset;shader.uniforms.uCartography=uniforms.cartography;shader.uniforms.uCartographyLight=uniforms.lightDirection;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vTerrainHeight;\nuniform float uHeightScale;\nuniform float uHeightOffset;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainHeight=position.y*uHeightScale+uHeightOffset;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vTerrainHeight;\nuniform float uContours;\nuniform float uCartography;\nuniform vec3 uCartographyLight;')
      .replace('#include <color_fragment>','#include <color_fragment>\nfloat contourHeight=vTerrainHeight/200.0;\nfloat contourWidth=max(fwidth(contourHeight)*0.9,0.003);\nfloat contourDistance=abs(fract(contourHeight+0.5)-0.5);\nfloat contourInk=(1.0-smoothstep(0.0,contourWidth,contourDistance))*uContours;\ndiffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*0.72,contourInk*0.30);')
      .replace('#include <opaque_fragment>','vec3 atlasLight=normalize(mat3(viewMatrix)*uCartographyLight);\nfloat atlasIncidence=max(dot(normal,atlasLight),0.0);\nfloat atlasShade=0.65+0.39*sqrt(atlasIncidence);\noutgoingLight=mix(outgoingLight,diffuseColor.rgb*atlasShade,uCartography);\n#include <opaque_fragment>');
  };
  material.userData.terrainUniforms=uniforms;
  material.customProgramCacheKey=()=>`atlas-terrain-context-${scale}-${offset}`;
  return {material,uniforms};
}
function makeTerrain(data){
  const {columns,rows,heights,width,depth,minimum}=data;
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array(heights.length*3),colors=new Float32Array(heights.length*3);
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
    const i=row*columns+col,h=heights[i],color=hypsometric(h);
    positions.set([(col/(columns-1)-.5)*width/1000,(h-minimum)/1000+.25,(row/(rows-1)-.5)*depth/1000],i*3);colors.set([color.r,color.g,color.b],i*3);
  }
  const indices=new Uint32Array((columns-1)*(rows-1)*6);let p=0;
  for(let row=0;row<rows-1;row++)for(let col=0;col<columns-1;col++){
    const a=row*columns+col,b=a+columns;indices.set([a,b,a+1,a+1,b,b+1],p);p+=6;
  }
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeVertexNormals();
  const {material,uniforms}=terrainMaterial({scale:1000,offset:minimum-250});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='IGN_Terrain';mesh.receiveShadow=true;mesh.castShadow=true;
  return {mesh,uniforms};
}
function makeSkirt(data,bottom=-.35){
  const {columns,rows,heights,width,depth,minimum}=data,edge=[];
  for(let col=0;col<columns;col++)edge.push(col);
  for(let row=1;row<rows;row++)edge.push(row*columns+columns-1);
  for(let col=columns-2;col>=0;col--)edge.push((rows-1)*columns+col);
  for(let row=rows-2;row>0;row--)edge.push(row*columns);
  const position=[],colors=[],indices=[];
  for(let i=0;i<edge.length;i++){
    const index=edge[i],row=Math.floor(index/columns),col=index%columns;
    const x=(col/(columns-1)-.5)*width/1000,z=(row/(rows-1)-.5)*depth/1000,y=(heights[index]-minimum)/1000+.25;
    position.push(x,y,z,x,bottom,z);
    const topColor=new THREE.Color(0xc5d1ce),bottomColor=new THREE.Color(0xa8b8ba);colors.push(topColor.r,topColor.g,topColor.b,bottomColor.r,bottomColor.g,bottomColor.b);
    const a=i*2,b=((i+1)%edge.length)*2;indices.push(a,b,a+1,b,b+1,a+1);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}));
}
function makeRail(data,features){
  const positions=[];
  const [west,south,east,north]=data.bounds;
  function inside(p){return p[0]>=west&&p[0]<=east&&p[1]>=south&&p[1]<=north;}
  function intersect(a,b){
    let t0=0,t1=1;const dx=b[0]-a[0],dy=b[1]-a[1];
    for(const [p,q] of [[-dx,a[0]-west],[dx,east-a[0]],[-dy,a[1]-south],[dy,north-a[1]]]){
      if(p===0){if(q<0)return null;continue;}
      const t=q/p;if(p<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);if(t0>t1)return null;
    }
    return [[a[0]+dx*t0,a[1]+dy*t0],[a[0]+dx*t1,a[1]+dy*t1]];
  }
  for(const feature of features||[]){
    const geometry=feature?.geometry;if(!geometry)continue;
    const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.type==='MultiLineString'?geometry.coordinates:[];
    for(const line of lines)for(let i=1;i<line.length;i++){
      const a=line[i-1],b=line[i];if(!Array.isArray(a)||!Array.isArray(b))continue;
      const segment=inside(a)&&inside(b)?[a,b]:intersect(a,b);if(!segment)continue;
      const p=data.point(...segment[0]),q=data.point(...segment[1]);if(!p||!q)continue;
      const pieces=Math.min(120,Math.max(1,Math.ceil(Math.hypot(q[0]-p[0],q[2]-p[2])*1000/Math.max(60,data.gridSpacing))));
      let previous=p;
      for(let j=1;j<=pieces;j++){
        const f=j/pieces,point=data.point(segment[0][0]+(segment[1][0]-segment[0][0])*f,segment[0][1]+(segment[1][1]-segment[0][1])*f);
        if(point){positions.push(previous[0],previous[1]+.018,previous[2],point[0],point[1]+.018,point[2]);previous=point;}
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x92506c,transparent:true,opacity:.95,depthTest:true}));
  line.name='Ejes IGN sobre superficie';return line;
}

async function blenderSurface(area,data,signal){
  const reference=[-4.35,40.5,-3.7,41.05];
  if(!area.bounds.every((value,index)=>Math.abs(value-reference[index])<1e-6))return null;
  const [{GLTFLoader},metadataResponse]=await Promise.all([import('./vendor/three/GLTFLoader.js'),fetch(new URL('./assets/terrain/guadarrama.json?v=35d81311',import.meta.url),{signal})]);
  if(!metadataResponse.ok)return null;
  const metadata=await metadataResponse.json();
  const response=await fetch(new URL('./assets/terrain/guadarrama.glb?v=b17e6104',import.meta.url),{signal});if(!response.ok)return null;
  const buffer=await response.arrayBuffer();signal.throwIfAborted();
  const gltf=await new GLTFLoader().parseAsync(buffer,new URL('./assets/terrain/',import.meta.url).href);
  if(signal.aborted){disposeObject(gltf.scene);signal.throwIfAborted();}
  let terrain=null;gltf.scene.traverse(child=>{if(child.isMesh&&(!terrain||child.name==='IGN_Terrain'))terrain=child;});
  if(!terrain){disposeObject(gltf.scene);return null;}
  const model=gltf.scene;model.scale.setScalar(.001);model.position.y=-data.minimum/1000+.25;
  // Blender's origin is the projected geographic centre; this scene uses the
  // midpoint of the projected bounds. Those differ slightly on the north axis.
  const centreY=mercatorY((area.bounds[1]+area.bounds[3])/2);
  const projectedMidY=(mercatorY(area.bounds[1])+mercatorY(area.bounds[3]))/2;
  const localMetres=data.depth/(mercatorY(area.bounds[1])-mercatorY(area.bounds[3]));
  model.position.z=(centreY-projectedMidY)*localMetres/1000;
  const uniforms=[];
  model.traverse(child=>{
    if(!child.isMesh)return;
    const previous=Array.isArray(child.material)?child.material:[child.material];previous.forEach(material=>material.dispose());
    const replacement=terrainMaterial({scale:1,offset:0});child.material=replacement.material;
    child.castShadow=child.receiveShadow=true;uniforms.push(replacement.uniforms);
  });
  // Recover the regular Blender grid for overlays and the cut edge. Reusing
  // this exact surface keeps railway overlays above its triangles instead of
  // relying on a differently sampled procedural grid.
  let surfaceData=data;
  const columns=metadata.grid?.[0],rows=metadata.grid?.[1],attribute=terrain.geometry.getAttribute('position');
  if(Number.isInteger(columns)&&Number.isInteger(rows)&&columns*rows===attribute.count){
    terrain.geometry.computeBoundingBox();const box=terrain.geometry.boundingBox;
    const heights=new Float32Array(columns*rows);heights.fill(NaN);
    for(let i=0;i<attribute.count;i++){
      const col=Math.round((attribute.getX(i)-box.min.x)/(box.max.x-box.min.x)*(columns-1));
      const row=Math.round((attribute.getZ(i)-box.min.z)/(box.max.z-box.min.z)*(rows-1));
      heights[row*columns+col]=attribute.getY(i);
    }
    if(heights.every(Number.isFinite)){
      surfaceData={...data,columns,rows,heights,gridSpacing:Math.max(data.width/(columns-1),data.depth/(rows-1))};
      surfaceData.sampleHeight=(longitude,latitude)=>{
        const u=(mercatorX(longitude)-mercatorX(area.bounds[0]))/(mercatorX(area.bounds[2])-mercatorX(area.bounds[0]))*(columns-1);
        const v=(mercatorY(latitude)-mercatorY(area.bounds[3]))/(mercatorY(area.bounds[1])-mercatorY(area.bounds[3]))*(rows-1);
        if(u<0||v<0||u>columns-1||v>rows-1)return null;
        const x=Math.min(columns-2,Math.floor(u)),y=Math.min(rows-2,Math.floor(v)),fx=u-x,fy=v-y;
        const a=heights[y*columns+x],b=heights[y*columns+x+1],c=heights[(y+1)*columns+x],d=heights[(y+1)*columns+x+1];
        return fx+fy<=1?a+(b-a)*fx+(c-a)*fy:d+(c-d)*(1-fx)+(b-d)*(1-fy);
      };
      surfaceData.point=(longitude,latitude,height=surfaceData.sampleHeight(longitude,latitude))=>data.point(longitude,latitude,height);
    }
  }
  return {mesh:model,uniforms,metadata,surfaceData};
}

function surfaceUV(surface,data){
  surface.updateWorldMatrix(true,true);
  const point=new THREE.Vector3();
  surface.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const positions=mesh.geometry.getAttribute('position'),uv=new Float32Array(positions.count*2);
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
      uv[i*2]=point.x/(data.width/1000)+.5;
      uv[i*2+1]=.5-point.z/(data.depth/1000);
    }
    mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  });
}

function applySurface(session){
  if(!session.surface)return;
  const map=session.basemapMode==='positron'?session.mapTexture:null;
  session.surface.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      const changed=material.map!==map||material.vertexColors===Boolean(map);
      material.map=map||null;material.vertexColors=!map;
      if(material.userData.terrainUniforms){material.userData.terrainUniforms.cartography.value=map?1:0;if(session.lightDirection)material.userData.terrainUniforms.lightDirection.value.copy(session.lightDirection);}
      if(changed)material.needsUpdate=true;
    }
  });
  session.requestRender?.();
}

function mapCredit(ui,visible){
  ui.mapCredit.replaceChildren();if(!visible)return;
  for(const [label,href] of [['Positron','./styles/POSITRON-LICENSE.md'],['OpenFreeMap','https://openfreemap.org/'],['OpenMapTiles','https://openmaptiles.org/'],['© OpenStreetMap','https://www.openstreetmap.org/copyright']]){
    if(ui.mapCredit.childNodes.length)ui.mapCredit.append(document.createTextNode(' · '));
    const link=document.createElement('a');link.textContent=label;link.href=href;link.target='_blank';link.rel='noopener';ui.mapCredit.append(link);
  }
}

function setupBasemap(session,data){
  const {ui}=session;let revision=0;
  session.setBasemap=async(value,{retry=false}={})=>{
    const ticket=++revision;session.mapController?.abort();
    session.basemapMode=value;ui.basemap.value=value;ui.mapRetry.hidden=true;
    if(value==='natural'){
      session.mapLoading=false;ui.dialog.dataset.basemap='natural';ui.mapStatus.textContent='Relieve natural · color por altitud';mapCredit(ui,false);ui.exportButton.disabled=false;applySurface(session);return;
    }
    if(session.mapTexture&&!retry){
      session.mapLoading=false;ui.dialog.dataset.basemap='positron';ui.mapStatus.textContent='Positron · localidades, carreteras y contexto';mapCredit(ui,true);ui.exportButton.disabled=false;applySurface(session);return;
    }
    const controller=new AbortController();session.mapController=controller;
    const cancel=()=>controller.abort();session.controller.signal.addEventListener('abort',cancel,{once:true});
    session.mapLoading=true;ui.dialog.dataset.basemap='loading';ui.mapStatus.textContent='Cargando cartografía Positron…';ui.exportButton.disabled=true;
    try{
      const result=await loadPositronTexture({bounds:session.area.bounds,signal:controller.signal,maxSize:root.matchMedia?.('(max-width:760px)').matches?1536:2048,labelScale:3.25,lineScale:1.6,
        onStatus:text=>{if(!session.closed&&ticket===revision)ui.mapStatus.textContent=text;}});
      if(session.closed||ticket!==revision){result.dispose();return;}
      session.mapTexture?.dispose();session.mapSnapshot?.dispose();session.mapSnapshot=result;
      const texture=new THREE.CanvasTexture(result.canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.flipY=true;
      texture.anisotropy=Math.min(8,session.renderer.capabilities.getMaxAnisotropy());session.mapTexture=texture;
      session.basemapMode='positron';ui.dialog.dataset.basemap='positron';ui.mapStatus.textContent='Positron · localidades, carreteras y contexto';mapCredit(ui,true);applySurface(session);
    }catch(error){
      if(session.closed||ticket!==revision||controller.signal.aborted)return;
      session.basemapMode='natural';ui.basemap.value='natural';ui.dialog.dataset.basemap='error';mapCredit(ui,false);
      ui.mapStatus.textContent='Positron no ha podido cargarse. Se muestra el relieve natural.';ui.mapRetry.hidden=false;applySurface(session);
    }finally{
      session.controller.signal.removeEventListener('abort',cancel);
      if(!session.closed&&ticket===revision){session.mapLoading=false;ui.exportButton.disabled=false;}
    }
  };
  ui.basemap.onchange=()=>session.setBasemap(ui.basemap.value);
  void session.setBasemap('positron');
}

async function buildScene(session,data,features,stations){
  const {ui,area,controller}=session,signal=controller.signal;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'default'});
  session.renderer=renderer;
  renderer.setPixelRatio(Math.min(root.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xedf2f3,1);
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','Modelo 3D del terreno. Arrastra para girar; usa las flechas para girar, más y menos para acercar y alejar, e Inicio para restablecer.');
  ui.stage.prepend(canvas);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xedf2f3);session.scene=scene;
  const span=Math.max(data.width,data.depth)/1000,relief=(data.maximum-data.minimum)/1000;
  const camera=new THREE.PerspectiveCamera(35,1,.02,span*20);session.camera=camera;
  scene.fog=new THREE.Fog(0xedf2f3,span*2.8,span*6);
  const group=new THREE.Group();scene.add(group);session.group=group;
  const terrain=makeTerrain(data);group.add(terrain.mesh);session.surface=terrain.mesh;surfaceUV(session.surface,data);session.contourUniforms=[terrain.uniforms];
  const baseDepth=Math.max(.2,Math.min(1.5,span*.02)-.25);
  const skirt=makeSkirt(data,-baseDepth);group.add(skirt);session.skirt=skirt;
  const base=new THREE.Mesh(new THREE.BoxGeometry(data.width/1000,.10,data.depth/1000),new THREE.MeshStandardMaterial({color:0xb5c3c6,roughness:1}));base.position.y=-baseDepth-.05;base.receiveShadow=true;scene.add(base);
  const rail=makeRail(data,features);group.add(rail);session.rail=rail;
  const hasRail=rail.geometry.attributes.position.count>0;ui.railLabel.hidden=!hasRail;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(span*8,span*8),new THREE.ShadowMaterial({opacity:.13}));ground.rotation.x=-Math.PI/2;ground.position.y=-baseDepth-.12;ground.receiveShadow=true;scene.add(ground);
  const ambient=new THREE.HemisphereLight(0xf1f8fc,0xd0d8cc,1.5);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xfffaf0,2.3);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-span*.7;sun.shadow.camera.right=sun.shadow.camera.top=span*.7;
  sun.shadow.camera.near=.1;sun.shadow.camera.far=span*4;sun.shadow.normalBias=.045;sun.shadow.bias=-.00008;sun.shadow.radius=3;
  scene.add(sun);scene.add(sun.target);
  const controls=new OrbitControls(camera,canvas);session.controls=controls;
  controls.enableDamping=false;controls.minDistance=span*.16;controls.maxDistance=span*5;controls.maxPolarAngle=Math.PI*.48;controls.minPolarAngle=.025;controls.zoomSpeed=.85;controls.panSpeed=.65;controls.target.set(0,.25+relief*.36,0);
  function render(){
    if(active!==session||session.closed)return;
    session.stationLayer?.update(camera,{width:ui.stage.clientWidth,height:ui.stage.clientHeight});
    renderer.render(scene,camera);
    const direction=camera.position.clone().sub(controls.target);const rotation=Math.atan2(direction.x,direction.z)*180/Math.PI;
    ui.stage.querySelector('.terrain-studio-north').style.transform=`rotate(${rotation}deg)`;
  }
  function requestRender(){if(!session.frame&&!session.closed)session.frame=requestAnimationFrame(()=>{session.frame=0;render();});}
  session.render=render;session.requestRender=requestRender;
  function selectedStation(feature,entry){
    session.selectedStation=entry;ui.stationSelect.value=entry.id;ui.stationInfo.hidden=false;
    ui.stationName.textContent=entry.displayName||entry.name;ui.stationCode.textContent=entry.code?'Código Renfe '+entry.code:'Estación Renfe';requestRender();
  }
  function stationLayer(surfaceData){
    const selected=session.selectedStation?.id;session.stationLayer?.dispose();
    const layer=createStations({data:surfaceData,stations,camera,renderer,onSelect:selectedStation,onChange:requestRender});
    session.stationLayer=layer;session.surfaceData=surfaceData;group.add(layer.group);layer.setVisible(ui.stations.checked);
    ui.stationSelect.replaceChildren();
    const empty=document.createElement('option');empty.value='';empty.textContent=layer.count?`Seleccionar estación · ${layer.count}`:'No hay estaciones en esta zona';ui.stationSelect.append(empty);
    for(const entry of layer.features){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.displayName||entry.name;ui.stationSelect.append(option);}
    ui.stationSelect.disabled=!layer.count;ui.stationLabel.hidden=!layer.count;
    if(selected)layer.select(selected);requestRender();
  }
  stationLayer(data);
  session.focusStation=()=>{
    const selected=session.selectedStation;if(!selected)return;
    const point=session.surfaceData.point(selected.longitude,selected.latitude);if(!point)return;
    customView();group.updateWorldMatrix(true,false);
    const target=new THREE.Vector3(...point).applyMatrix4(group.matrixWorld);
    const offset=camera.position.clone().sub(controls.target).normalize();offset.y=Math.max(.85,offset.y);offset.normalize().multiplyScalar(span*.28);
    controls.target.copy(target);camera.position.copy(target).add(offset);controls.update();canvas.focus({preventScroll:true});requestRender();
  };
  ui.stationSelect.onchange=()=>{if(ui.stationSelect.value){ui.stations.checked=true;session.stationLayer.setVisible(true);session.stationLayer.select(ui.stationSelect.value);session.focusStation();}};
  ui.stations.onchange=()=>{session.stationLayer.setVisible(ui.stations.checked);ui.stationInfo.hidden=!ui.stations.checked||!session.selectedStation;requestRender();};
  controls.addEventListener('change',requestRender);
  function customView(){session.userMoved=true;for(const control of ui.cameras.querySelectorAll('button'))control.setAttribute('aria-pressed','false');}
  controls.addEventListener('start',customView);
  function applyVerticalScale(){
    const value=Number(ui.exaggeration.value);group.scale.y=value;group.position.y=.25*(1-value);
    const positions=session.skirt.geometry.getAttribute('position');
    for(let i=1;i<positions.count;i+=2)positions.setY(i,(-baseDepth-group.position.y)/value);
    positions.needsUpdate=true;session.skirt.geometry.computeVertexNormals();
    ui.output.textContent=`${decimal.format(value)}×`;ui.exaggeration.setAttribute('aria-valuetext',`${decimal.format(value)} veces la altura del terreno`);requestRender();
  }
  applyVerticalScale();
  function preset(key){
    session.presetKey=key;session.userMoved=false;
    const top=.25+relief*Number(ui.exaggeration.value);
    const box=new THREE.Box3(new THREE.Vector3(-data.width/2000,-baseDepth-.1,-data.depth/2000),new THREE.Vector3(data.width/2000,top,data.depth/2000));
    box.getCenter(controls.target);
    const direction=(key==='top'?new THREE.Vector3(0,1,.0001):key==='low'?new THREE.Vector3(.27,.24,1.35):new THREE.Vector3(.5,.72,1.03)).normalize();
    camera.position.copy(controls.target).add(direction);camera.lookAt(controls.target);camera.updateMatrixWorld();
    const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);
    const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),tanH=tanV*camera.aspect;
    let distance=0;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const relative=new THREE.Vector3(x,y,z).sub(controls.target),depth=relative.dot(direction);
      distance=Math.max(distance,depth+Math.abs(relative.dot(right))/tanH,depth+Math.abs(relative.dot(up))/tanV);
    }
    camera.position.copy(controls.target).addScaledVector(direction,distance*1.10);
    camera.lookAt(controls.target);controls.update();requestRender();
    for(const control of ui.cameras.querySelectorAll('button'))control.setAttribute('aria-pressed',String(control.dataset.action===`camera-${key}`));
  }
  session.preset=preset;
  const resize=()=>{
    if(session.closed)return;
    const {width,height}=ui.stage.getBoundingClientRect();if(!width||!height)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    if(session.presetKey&&!session.userMoved)preset(session.presetKey);else requestRender();
    // Resizing clears WebGL's drawing buffer. Draw in this same resize turn so
    // changing a footer or a map mode does not briefly show an empty canvas.
    if(session.presetKey)render();
  };
  session.observer=new ResizeObserver(resize);session.observer.observe(ui.stage);resize();preset('perspective');
  const setLighting=()=>{const light=LIGHTS[ui.light.value]||LIGHTS.day;sun.color.set(light.color);sun.intensity=light.intensity;ambient.intensity=light.ambient;sun.position.set(...light.position.map(value=>value*span));session.lightDirection=new THREE.Vector3(...light.position).normalize();applySurface(session);requestRender();};
  setLighting();ui.light.onchange=setLighting;
  ui.exaggeration.oninput=applyVerticalScale;
  ui.contours.onchange=()=>{session.contourUniforms.forEach(uniforms=>{uniforms.contours.value=ui.contours.checked?1:0;});requestRender();};
  ui.rail.onchange=()=>{session.rail.visible=ui.rail.checked;requestRender();};
  canvas.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(event.key))return;event.preventDefault();
    if(event.key==='Home'){preset('perspective');return;}
    customView();
    const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);
    if(event.key==='ArrowLeft')spherical.theta-=.10;if(event.key==='ArrowRight')spherical.theta+=.10;
    if(event.key==='ArrowUp')spherical.phi=Math.max(.025,spherical.phi-.075);if(event.key==='ArrowDown')spherical.phi=Math.min(Math.PI*.48,spherical.phi+.075);
    if(['+','='].includes(event.key))spherical.radius=Math.max(controls.minDistance,spherical.radius*.9);if(event.key==='-')spherical.radius=Math.min(controls.maxDistance,spherical.radius/ .9);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));controls.update();requestRender();
  });
  const onLost=event=>{if(session.closed)return;event.preventDefault();ui.dialog.dataset.state='error';ui.overlay.hidden=false;ui.progress.hidden=true;ui.status.textContent='Se ha interrumpido la escena 3D. Puedes volver a cargarla.';ui.retry.hidden=false;ui.exportButton.disabled=true;};
  canvas.addEventListener('webglcontextlost',onLost);
  ui.dialog.dataset.state='ready';ui.overlay.hidden=true;ui.exportButton.disabled=false;
  setupBasemap(session,data);
  const resolution=data.minZoom===data.maxZoom?`≈${format.format(data.resolutionMin)} m/píxel`:`≈${format.format(data.resolutionMin)}–${format.format(data.resolutionMax)} m/píxel`;
  const summary=`${decimal.format(data.width/1000)} × ${decimal.format(data.depth/1000)} km · terreno ${format.format(data.minimum)}–${format.format(data.maximum)} m · DEM ${resolution} · malla ≈${format.format(data.gridSpacing)} m`;
  ui.stats.textContent=summary;session.summary=summary;
  ui.instruction.textContent=root.matchMedia?.('(pointer:coarse)').matches?'Un dedo para girar · pellizca para acercar · dos dedos para desplazar':'Arrastra para girar · rueda para acercar · flechas con el lienzo enfocado';
  requestRender();
  // Guadarrama can use the real Blender-produced mesh. The rest of the study
  // remains usable even if the optional preprocessed asset is unavailable.
  try{
    const blender=await blenderSurface(area,data,signal);
    if(blender){
      if(session.closed||active!==session){disposeObject(blender.mesh);return;}
      group.remove(terrain.mesh);terrain.mesh.material.map=null;disposeObject(terrain.mesh);group.add(blender.mesh);session.surface=blender.mesh;surfaceUV(session.surface,data);applySurface(session);
      group.remove(session.skirt);disposeObject(session.skirt);session.skirt=makeSkirt(blender.surfaceData);group.add(session.skirt);applyVerticalScale();
      group.remove(session.rail);disposeObject(session.rail);session.rail=makeRail(blender.surfaceData,features);session.rail.visible=ui.rail.checked;group.add(session.rail);
      stationLayer(blender.surfaceData);
      session.contourUniforms=blender.uniforms;ui.contours.onchange();
      const blenderMinimum=Number.isFinite(blender.metadata.minimum)?blender.metadata.minimum:data.minimum;
      const blenderMaximum=Number.isFinite(blender.metadata.maximum)?blender.metadata.maximum:data.maximum;
      session.summary=`${decimal.format(data.width/1000)} × ${decimal.format(data.depth/1000)} km · terreno ${format.format(blenderMinimum)}–${format.format(blenderMaximum)} m · DEM ${resolution} · malla ≈${format.format(blender.surfaceData.gridSpacing)} m`;
      ui.stats.textContent=session.summary+' · superficie preparada en Blender';requestRender();
    }
  }catch(error){if(error.name!=='AbortError'&&!signal.aborted){ui.stats.textContent=summary+' · superficie reconstruida del DEM local';ui.stats.dataset.blenderError=error.message;}}
}

async function saveImage(session){
  if(session.closed||!session.renderer||session.mapLoading)return;
  const {ui,renderer}=session;ui.exportButton.disabled=true;
  try{
    session.render();const source=renderer.domElement;
    const canvas=document.createElement('canvas');canvas.width=source.width;
    const context=canvas.getContext('2d');if(!context)throw new Error('No está disponible la captura de imagen.');
    const size=Math.max(14,Math.min(22,canvas.width/70));context.font=`${Math.max(12,size-2)}px sans-serif`;
    const credit='Obra derivada de MDT IGN · CC BY 4.0. Estaciones: catálogo Renfe. '+(session.basemapMode==='positron'?MAP_CREDIT+'. ':'')+'Alturas del terreno; ejes y estaciones no representan la cota de la vía.';
    const lines=[];let line='';
    for(const word of credit.split(' ')){const next=line?line+' '+word:word;if(context.measureText(next).width>canvas.width-48&&line){lines.push(line);line=word;}else line=next;}if(line)lines.push(line);
    canvas.height=source.height+115+lines.length*21;
    context.fillStyle='#edf2f3';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0);
    context.fillStyle='#273a5f';context.font=`600 ${size+5}px sans-serif`;context.fillText(`${session.area.name} · estudio del relieve`,24,source.height+32,canvas.width-48);
    context.font=`${size}px sans-serif`;context.fillText(`Escala vertical ${decimal.format(Number(ui.exaggeration.value))}× · ${LIGHTS[ui.light.value].name}`,24,source.height+63,canvas.width-48);
    context.font=`${Math.max(12,size-2)}px sans-serif`;
    lines.forEach((text,index)=>context.fillText(text,24,source.height+94+index*21));
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('No se ha podido crear la imagen.');
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`relieve-${session.area.id||'ign'}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(error){ui.stats.textContent=error.message;}
  finally{if(!session.closed)ui.exportButton.disabled=Boolean(session.mapLoading);}
}

export function close(){
  const session=active;if(!session)return;session.closed=true;active=null;
  session.controller.abort();if(session.frame)cancelAnimationFrame(session.frame);
  session.observer?.disconnect();session.controls?.dispose();
  session.stationLayer?.dispose();session.mapController?.abort();
  if(session.scene)disposeObject(session.scene);
  session.mapTexture?.dispose();session.mapSnapshot?.dispose();
  if(session.renderer){session.renderer.dispose();session.renderer.forceContextLoss();}
  session.ui.dialog.close();session.ui.dialog.remove();
  document.body.style.overflow=session.previousOverflow;
  if(session.opener?.isConnected)session.opener.focus({preventScroll:true});
}

export async function open(options={}){
  const area=areaOf(options.area);close();
  const ui=createUI(area),controller=new AbortController();
  const session={area,ui,controller,closed:false,opener:document.activeElement,previousOverflow:document.body.style.overflow};active=session;
  document.body.style.overflow='hidden';ui.dialog.showModal();ui.close.focus();
  ui.dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  ui.dialog.addEventListener('click',event=>{
    const action=event.target.closest('button')?.dataset.action;
    if(action==='close')close();
    else if(action==='retry')open(options);
    else if(action==='retry-basemap')void session.setBasemap?.('positron',{retry:true});
    else if(action==='focus-station')session.focusStation?.();
    else if(action==='export')saveImage(session);
    else if(action?.startsWith('camera-'))session.preset?.(action.slice(7));
  });
  try{
    const data=await loadTerrainGrid({bounds:area.bounds,segments:root.matchMedia?.('(max-width:760px)').matches?180:260,signal:controller.signal,
      onProgress:(done,total)=>{if(session.closed)return;ui.progress.max=total;ui.progress.value=done;ui.status.textContent=`Leyendo el terreno IGN · ${done}/${total}`;}});
    if(session.closed||active!==session)return;
    ui.status.textContent='Construyendo el relieve y su iluminación…';
    await buildScene(session,data,options.features||[],options.stations||[]);
  }catch(error){
    if(controller.signal.aborted||session.closed||active!==session)return;
    if(session.scene)disposeObject(session.scene);session.controls?.dispose();session.observer?.disconnect();session.renderer?.dispose();
    ui.dialog.dataset.state='error';ui.overlay.hidden=false;ui.progress.hidden=true;ui.retry.hidden=false;
    ui.status.textContent=error?.message||'No se ha podido preparar el terreno 3D.';
    ui.exportButton.disabled=true;
  }
}

export const isOpen=()=>Boolean(active);
root.AtlasTerrainScene={open,close,isOpen};
