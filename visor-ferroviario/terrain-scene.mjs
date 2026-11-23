import * as THREE from './vendor/three/three.module.js';
import {OrbitControls} from './vendor/three/OrbitControls.js';
import {loadTerrainGrid,validateBounds,mercatorX,mercatorY} from './terrain-data.mjs';

const root=globalThis;
const format=new Intl.NumberFormat('es-ES',{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat('es-ES',{maximumFractionDigits:1});
const LIGHTS={day:{name:'Luz de día',color:0xfff0d5,intensity:2.5,position:[-.55,1,.6],ambient:.85},golden:{name:'Luz rasante',color:0xffd2a0,intensity:2.9,position:[-.8,.25,.48],ambient:.55},cool:{name:'Luz fría',color:0xc9e4ff,intensity:2.6,position:[.7,.65,-.45],ambient:1.05}};
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
  const description=element('p','', 'Una pieza de territorio real. Gira, acerca y cambia la luz.');description.id='terrain-studio-description';heading.append(description);
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
  for(const [key,value] of Object.entries(LIGHTS)){const option=document.createElement('option');option.value=key;option.textContent=value.name;light.append(option);}light.value='golden';lighting.append(light);
  const scale=element('label','terrain-studio-scale terrain-studio-group');
  const scaleLabel=element('span','terrain-studio-label','Escala vertical');
  const exaggeration=document.createElement('input');exaggeration.type='range';exaggeration.min='1';exaggeration.max='3';exaggeration.step='.1';exaggeration.value='2';exaggeration.setAttribute('aria-label','Escala vertical del estudio 3D');exaggeration.setAttribute('aria-valuetext','2 veces la altura del terreno');
  const output=element('output','','2×');output.id='terrain-studio-scale';scale.append(scaleLabel,exaggeration,output);
  const layers=element('div','terrain-studio-toggles terrain-studio-group');
  const contourLabel=document.createElement('label'),contours=document.createElement('input');contours.type='checkbox';contours.checked=true;contourLabel.append(contours,document.createTextNode('Curvas de nivel · 200 m'));
  const railLabel=document.createElement('label'),rail=document.createElement('input');rail.type='checkbox';rail.checked=true;railLabel.append(rail,document.createTextNode('Ejes ferroviarios sobre terreno'));layers.append(contourLabel,railLabel);
  const exportButton=button('Guardar imagen','export','terrain-studio-export');exportButton.disabled=true;
  controls.append(cameras,lighting,scale,layers,exportButton);
  const footer=element('footer','terrain-studio-footer');
  const stats=element('p','terrain-studio-stats','Preparando el modelo de elevaciones…');
  const source=element('p','terrain-studio-source','Obra derivada de MDT IGN · CC BY 4.0. Vista inicial con altura ampliada 2×; el corte lateral delimita la escena. Los ejes se apoyan sobre el terreno y no representan la cota de la vía ni sus túneles o viaductos.');
  footer.append(stats,source);dialog.append(header,stage,controls,footer);document.body.append(dialog);
  return {dialog,stage,overlay,progress,status,retry,close,cameras,light,exaggeration,output,contours,rail,railLabel,exportButton,stats,instruction};
}

function hypsometric(height){
  const stops=[[0,0x48746a],[600,0x557e67],[1100,0x829774],[1600,0xa8ae89],[2100,0xc6bd98],[2600,0xdcd2b7],[3400,0xf2ecdf]];
  for(let i=1;i<stops.length;i++)if(height<=stops[i][0]){
    const fraction=THREE.MathUtils.clamp((height-stops[i-1][0])/(stops[i][0]-stops[i-1][0]),0,1);
    return new THREE.Color(stops[i-1][1]).lerp(new THREE.Color(stops[i][1]),fraction);
  }
  return new THREE.Color(stops.at(-1)[1]);
}
function terrainMaterial({scale=1000,offset=0}={}){
  const uniforms={contours:{value:1},heightScale:{value:scale},heightOffset:{value:offset}};
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0});
  material.onBeforeCompile=shader=>{
    shader.uniforms.uContours=uniforms.contours;shader.uniforms.uHeightScale=uniforms.heightScale;shader.uniforms.uHeightOffset=uniforms.heightOffset;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vTerrainHeight;\nuniform float uHeightScale;\nuniform float uHeightOffset;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrainHeight=position.y*uHeightScale+uHeightOffset;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vTerrainHeight;\nuniform float uContours;')
      .replace('#include <color_fragment>','#include <color_fragment>\nfloat contourHeight=vTerrainHeight/200.0;\nfloat contourWidth=max(fwidth(contourHeight)*0.9,0.003);\nfloat contourDistance=abs(fract(contourHeight+0.5)-0.5);\nfloat contourInk=(1.0-smoothstep(0.0,contourWidth,contourDistance))*uContours;\ndiffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*0.66,contourInk*0.42);');
  };
  material.customProgramCacheKey=()=>`atlas-terrain-${scale}-${offset}`;
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
    const topColor=new THREE.Color(0x69847f),bottomColor=new THREE.Color(0x263e50);colors.push(topColor.r,topColor.g,topColor.b,bottomColor.r,bottomColor.g,bottomColor.b);
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
  const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0xa8324a,transparent:true,opacity:.95,depthTest:true}));
  line.name='Ejes IGN sobre superficie';return line;
}

async function blenderSurface(area,data,signal){
  const reference=[-4.35,40.5,-3.7,41.05];
  if(!area.bounds.every((value,index)=>Math.abs(value-reference[index])<1e-6))return null;
  const [{GLTFLoader},metadataResponse]=await Promise.all([import('./vendor/three/GLTFLoader.js'),fetch(new URL('./assets/terrain/guadarrama.json',import.meta.url),{signal})]);
  if(!metadataResponse.ok)return null;
  const metadata=await metadataResponse.json();
  const response=await fetch(new URL('./assets/terrain/guadarrama.glb',import.meta.url),{signal});if(!response.ok)return null;
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

async function buildScene(session,data,features){
  const {ui,area,controller}=session,signal=controller.signal;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'default'});
  session.renderer=renderer;
  renderer.setPixelRatio(Math.min(root.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.96;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x142f3b,1);
  const canvas=renderer.domElement;canvas.tabIndex=0;canvas.setAttribute('aria-label','Modelo 3D del terreno. Arrastra para girar; usa las flechas para girar, más y menos para acercar y alejar, e Inicio para restablecer.');
  ui.stage.prepend(canvas);
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x142f3b);session.scene=scene;
  const span=Math.max(data.width,data.depth)/1000,relief=(data.maximum-data.minimum)/1000;
  const camera=new THREE.PerspectiveCamera(35,1,.02,span*20);session.camera=camera;
  scene.fog=new THREE.Fog(0x142f3b,span*2.8,span*6);
  const group=new THREE.Group();scene.add(group);session.group=group;
  const terrain=makeTerrain(data);group.add(terrain.mesh);session.contourUniforms=[terrain.uniforms];
  const baseDepth=Math.max(.2,Math.min(1.5,span*.02)-.25);
  const skirt=makeSkirt(data,-baseDepth);group.add(skirt);session.skirt=skirt;
  const base=new THREE.Mesh(new THREE.BoxGeometry(data.width/1000,.10,data.depth/1000),new THREE.MeshStandardMaterial({color:0x263e50,roughness:.8}));base.position.y=-baseDepth-.05;base.receiveShadow=true;scene.add(base);
  const rail=makeRail(data,features);group.add(rail);session.rail=rail;
  const hasRail=rail.geometry.attributes.position.count>0;ui.railLabel.hidden=!hasRail;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(span*8,span*8),new THREE.ShadowMaterial({opacity:.3}));ground.rotation.x=-Math.PI/2;ground.position.y=-baseDepth-.12;ground.receiveShadow=true;scene.add(ground);
  const ambient=new THREE.HemisphereLight(0xc4e5ed,0x304337,.85);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xfff0d5,3.4);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=sun.shadow.camera.bottom=-span*.7;sun.shadow.camera.right=sun.shadow.camera.top=span*.7;
  sun.shadow.camera.near=.1;sun.shadow.camera.far=span*4;sun.shadow.normalBias=.045;sun.shadow.bias=-.00008;sun.shadow.radius=3;
  scene.add(sun);scene.add(sun.target);
  const controls=new OrbitControls(camera,canvas);session.controls=controls;
  controls.enableDamping=false;controls.minDistance=span*.16;controls.maxDistance=span*5;controls.maxPolarAngle=Math.PI*.48;controls.minPolarAngle=.025;controls.zoomSpeed=.85;controls.panSpeed=.65;controls.target.set(0,.25+relief*.36,0);
  function render(){
    if(active!==session||session.closed)return;
    renderer.render(scene,camera);
    const direction=camera.position.clone().sub(controls.target);const rotation=Math.atan2(direction.x,direction.z)*180/Math.PI;
    ui.stage.querySelector('.terrain-studio-north').style.transform=`rotate(${rotation}deg)`;
  }
  function requestRender(){if(!session.frame&&!session.closed)session.frame=requestAnimationFrame(()=>{session.frame=0;render();});}
  session.render=render;session.requestRender=requestRender;
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
  };
  session.observer=new ResizeObserver(resize);session.observer.observe(ui.stage);resize();preset('perspective');
  const setLighting=()=>{const light=LIGHTS[ui.light.value]||LIGHTS.day;sun.color.set(light.color);sun.intensity=light.intensity;ambient.intensity=light.ambient;sun.position.set(...light.position.map(value=>value*span));requestRender();};
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
      group.remove(terrain.mesh);disposeObject(terrain.mesh);group.add(blender.mesh);
      group.remove(session.skirt);disposeObject(session.skirt);session.skirt=makeSkirt(blender.surfaceData);group.add(session.skirt);applyVerticalScale();
      group.remove(session.rail);disposeObject(session.rail);session.rail=makeRail(blender.surfaceData,features);session.rail.visible=ui.rail.checked;group.add(session.rail);
      session.contourUniforms=blender.uniforms;ui.contours.onchange();
      const blenderMinimum=Number.isFinite(blender.metadata.minimum)?blender.metadata.minimum:data.minimum;
      const blenderMaximum=Number.isFinite(blender.metadata.maximum)?blender.metadata.maximum:data.maximum;
      session.summary=`${decimal.format(data.width/1000)} × ${decimal.format(data.depth/1000)} km · terreno ${format.format(blenderMinimum)}–${format.format(blenderMaximum)} m · DEM ${resolution} · malla ≈${format.format(blender.surfaceData.gridSpacing)} m`;
      ui.stats.textContent=session.summary+' · superficie preparada en Blender';requestRender();
    }
  }catch(error){if(error.name!=='AbortError'&&!signal.aborted){ui.stats.textContent=summary+' · superficie reconstruida del DEM local';ui.stats.dataset.blenderError=error.message;}}
}

async function saveImage(session){
  if(session.closed||!session.renderer)return;
  const {ui,renderer}=session;ui.exportButton.disabled=true;
  try{
    session.render();const source=renderer.domElement;
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height+180;
    const context=canvas.getContext('2d');if(!context)throw new Error('No está disponible la captura de imagen.');
    context.fillStyle='#eaf0f2';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(source,0,0);
    const size=Math.max(14,Math.min(22,canvas.width/70));context.fillStyle='#273a5f';context.font=`600 ${size+5}px sans-serif`;context.fillText(`${session.area.name} · estudio del relieve`,24,source.height+32,canvas.width-48);
    context.font=`${size}px sans-serif`;context.fillText(`Escala vertical ${decimal.format(Number(ui.exaggeration.value))}× · ${LIGHTS[ui.light.value].name}`,24,source.height+63,canvas.width-48);
    context.font=`${Math.max(12,size-2)}px sans-serif`;
    const words='Obra derivada de MDT IGN · CC BY 4.0. Alturas del terreno; los ejes se superponen y no representan la cota de la vía.'.split(' ');
    let line='',y=source.height+94;
    for(const word of words){
      const next=line?line+' '+word:word;
      if(context.measureText(next).width>canvas.width-48&&line){context.fillText(line,24,y);line=word;y+=21;}else line=next;
    }
    if(line)context.fillText(line,24,y);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('No se ha podido crear la imagen.');
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`relieve-${session.area.id||'ign'}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(error){ui.stats.textContent=error.message;}
  finally{if(!session.closed)ui.exportButton.disabled=false;}
}

export function close(){
  const session=active;if(!session)return;session.closed=true;active=null;
  session.controller.abort();if(session.frame)cancelAnimationFrame(session.frame);
  session.observer?.disconnect();session.controls?.dispose();
  if(session.scene)disposeObject(session.scene);
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
    else if(action==='export')saveImage(session);
    else if(action?.startsWith('camera-'))session.preset?.(action.slice(7));
  });
  try{
    const data=await loadTerrainGrid({bounds:area.bounds,segments:root.matchMedia?.('(max-width:760px)').matches?180:260,signal:controller.signal,
      onProgress:(done,total)=>{if(session.closed)return;ui.progress.max=total;ui.progress.value=done;ui.status.textContent=`Leyendo el terreno IGN · ${done}/${total}`;}});
    if(session.closed||active!==session)return;
    ui.status.textContent='Construyendo el relieve y su iluminación…';
    await buildScene(session,data,options.features||[]);
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
