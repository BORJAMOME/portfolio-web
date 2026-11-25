import * as THREE from './vendor/three/three.module.js';

function displayName(name){
  if(name!==name.toLocaleUpperCase('es'))return name;
  return name.toLocaleLowerCase('es').replace(/(^|[\s\-/])\p{L}/gu,word=>word.toLocaleUpperCase('es'))
    .replace(/\s(De|Del|La|Las|Los|El|Y)\s/g,word=>word.toLocaleLowerCase('es'));
}

/** Station catalog entries are point symbols; no station footprint or rail height is inferred. */
export function stationFeaturesInBounds(stations,bounds){
  if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite))return [];
  const source=Array.isArray(stations)?stations:stations?.features||[];
  const [west,south,east,north]=bounds,seen=new Set(),result=[];
  for(const feature of source){
    const coordinates=feature?.geometry?.coordinates;
    if(feature?.geometry?.type!=='Point'||!Array.isArray(coordinates))continue;
    const [longitude,latitude]=coordinates;
    if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||longitude<west||longitude>east||latitude<south||latitude>north)continue;
    const properties=feature.properties||{};
    const name=String(properties.DESCRIPCION||properties.NOMBRE||properties.name||properties.CODIGO||'Estación').trim();
    const code=String(properties.CODIGO??feature.id??'').trim();
    const id=code||`${longitude},${latitude}:${name}`;
    if(seen.has(id))continue;
    seen.add(id);result.push({id,code,name,displayName:displayName(name),longitude,latitude,feature});
  }
  return result.sort((a,b)=>a.name.localeCompare(b.name,'es'));
}

export function placeStationLabels(entries,{width,height,maxLabels=18,padding=6}={}){
  if(!(width>0&&height>0))return [];
  const limit=Math.min(maxLabels,width<600?6:maxLabels),occupied=[],accepted=[];
  const candidates=entries.filter(item=>item.onScreen).slice().sort((a,b)=>
    Number(Boolean(b.selected))-Number(Boolean(a.selected))||a.priority-b.priority||String(a.id).localeCompare(String(b.id)));
  for(const entry of candidates){
    if(accepted.length>=limit)break;
    const box={left:entry.x-entry.labelWidth/2,right:entry.x+entry.labelWidth/2,top:entry.y-entry.labelHeight*1.45,bottom:entry.y-entry.labelHeight*.45};
    if(box.left<4||box.right>width-4||box.top<4||box.bottom>height-4)continue;
    if(!entry.selected&&occupied.some(other=>box.left<other.right+padding&&box.right>other.left-padding&&box.top<other.bottom+padding&&box.bottom>other.top-padding))continue;
    occupied.push(box);accepted.push(entry.id);
  }
  return accepted;
}

function canvasTexture(canvas){
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
  return texture;
}
function markerTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
  const context=canvas.getContext('2d');
  context.fillStyle='#ffffff';context.beginPath();context.arc(48,48,39,0,Math.PI*2);context.fill();
  context.lineWidth=8;context.strokeStyle='#234c60';context.beginPath();context.arc(48,48,31,0,Math.PI*2);context.stroke();
  context.fillStyle='#367f87';context.beginPath();context.arc(48,48,18,0,Math.PI*2);context.fill();
  return canvasTexture(canvas);
}
function labelTexture(name){
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  context.font='600 24px "Plus Jakarta Sans","Segoe UI",sans-serif';
  const measured=context.measureText(name).width;
  canvas.width=Math.min(900,Math.max(100,Math.ceil(measured)+26));canvas.height=48;
  context.font='600 24px "Plus Jakarta Sans","Segoe UI",sans-serif';
  context.fillStyle='rgba(255,255,255,.97)';context.strokeStyle='#bed1d7';context.lineWidth=2;
  context.beginPath();
  if(context.roundRect)context.roundRect(1,1,canvas.width-2,46,8);else context.rect(1,1,canvas.width-2,46);
  context.fill();context.stroke();context.fillStyle='#173e51';context.textBaseline='middle';
  context.fillText(name,13,25,canvas.width-26);
  return {texture:canvasTexture(canvas),width:Math.min(205,canvas.width*.52),height:25};
}

/**
 * Add the returned group to the vertically scaled terrain group and call update
 * immediately before rendering. Sprites remain legible at any vertical scale.
 * A camera-aware label layout runs only when the caller renders; no RAF is owned.
 */
export function createStations({data,stations,camera,canvas,renderer,onSelect=()=>{},onChange=()=>{},markerPixels=10,maxLabels=18}={}){
  if(!data?.point||!Array.isArray(data.bounds))throw new Error('La superficie no permite situar estaciones.');
  canvas=canvas||renderer?.domElement;
  const group=new THREE.Group();group.name='Estaciones del catálogo Renfe';
  const catalog=stationFeaturesInBounds(stations,data.bounds),entries=[],lookup=new Map();
  const dotTexture=markerTexture();
  const dotMaterial=new THREE.SpriteMaterial({map:dotTexture,transparent:true,depthTest:true,depthWrite:false,toneMapped:false});
  const selectedMaterial=new THREE.SpriteMaterial({map:dotTexture,color:0xb8f1e8,transparent:true,depthTest:true,depthWrite:false,toneMapped:false});
  let visible=true,disposed=false,selectedId=null,pointer=null;
  const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2(),world=new THREE.Vector3(),view=new THREE.Vector3(),scale=new THREE.Vector3();
  for(const station of catalog){
    const point=data.point(station.longitude,station.latitude);
    if(!point||!point.every(Number.isFinite))continue;
    const marker=new THREE.Sprite(dotMaterial);marker.center.set(.5,0);marker.position.set(point[0],point[1]+.025,point[2]);marker.renderOrder=30;
    marker.name=station.name;marker.userData.stationId=station.id;
    const labelImage=labelTexture(station.displayName);
    const labelMaterial=new THREE.SpriteMaterial({map:labelImage.texture,transparent:true,depthTest:true,depthWrite:false,toneMapped:false});
    const label=new THREE.Sprite(labelMaterial);label.center.set(.5,-.45);label.position.copy(marker.position);label.renderOrder=31;label.visible=false;
    group.add(marker,label);
    const entry={...station,marker,label,labelMaterial,labelTexture:labelImage.texture,labelWidth:labelImage.width,labelHeight:labelImage.height,onScreen:false};
    entries.push(entry);lookup.set(station.id,entry);
  }
  function update(currentCamera=camera,size={}){
    if(disposed||!currentCamera)return;
    const width=size.width||canvas?.clientWidth||1,height=size.height||canvas?.clientHeight||1;
    currentCamera.updateMatrixWorld();group.updateWorldMatrix(true,true);group.getWorldScale(scale);
    const sx=Math.max(1e-8,Math.abs(scale.x)),sy=Math.max(1e-8,Math.abs(scale.y));
    for(const entry of entries){
      entry.marker.getWorldPosition(world);view.copy(world).applyMatrix4(currentCamera.matrixWorldInverse);
      const depth=-view.z;
      const unitPerPixel=currentCamera.isOrthographicCamera?(currentCamera.top-currentCamera.bottom)/currentCamera.zoom/height:
        2*Math.max(.01,depth)*Math.tan(THREE.MathUtils.degToRad(currentCamera.fov)/2)/height;
      const selected=entry.id===selectedId,dot=markerPixels+(selected?4:0);
      entry.marker.scale.set(unitPerPixel*dot/sx,unitPerPixel*dot/sy,1);
      entry.label.scale.set(unitPerPixel*entry.labelWidth/sx,unitPerPixel*entry.labelHeight/sy,1);
      view.copy(world).project(currentCamera);
      entry.x=(view.x+1)*width/2;entry.y=(1-view.y)*height/2;entry.selected=selected;
      entry.onScreen=visible&&depth>0&&view.z>=-1&&view.z<=1&&Math.abs(view.x)<=1&&Math.abs(view.y)<=1;
      entry.priority=Math.hypot(entry.x-width/2,entry.y-height/2);
      entry.marker.visible=entry.onScreen;entry.marker.material=selected?selectedMaterial:dotMaterial;entry.label.visible=false;
    }
    const labels=placeStationLabels(entries,{width,height,maxLabels});
    for(const id of labels)lookup.get(id).label.visible=visible;
    group.updateMatrixWorld(true);
  }
  function select(id,{notify=true}={}){
    if(disposed)return null;
    const entry=lookup.get(String(id));if(!entry)return null;
    selectedId=entry.id;
    if(notify)onSelect(entry.feature,entry);
    onChange();return entry.feature;
  }
  function pick(event,target=canvas,currentCamera=camera){
    if(disposed||!visible||!target||!currentCamera)return null;
    const box=target.getBoundingClientRect();if(!box.width||!box.height)return null;
    ndc.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);
    raycaster.setFromCamera(ndc,currentCamera);
    const hit=raycaster.intersectObjects(entries.filter(item=>item.onScreen).map(item=>item.marker),false)[0];
    return hit?select(hit.object.userData.stationId):null;
  }
  const down=event=>{if(event.button===0)pointer={x:event.clientX,y:event.clientY};};
  const up=event=>{
    const start=pointer;pointer=null;
    if(start&&event.button===0&&Math.hypot(event.clientX-start.x,event.clientY-start.y)<6)pick(event);
  };
  const cancel=()=>{pointer=null;};
  if(canvas&&camera){canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);}
  return {
    group,features:entries.map(({marker,label,labelMaterial,labelTexture,...entry})=>entry),count:entries.length,update,pick,select,
    selected:()=>selectedId,
    setVisible(value){visible=Boolean(value);group.visible=visible;onChange();},
    dispose(){
      if(disposed)return;disposed=true;
      canvas?.removeEventListener('pointerdown',down);canvas?.removeEventListener('pointerup',up);canvas?.removeEventListener('pointercancel',cancel);
      group.removeFromParent();group.clear();dotTexture.dispose();dotMaterial.dispose();selectedMaterial.dispose();
      for(const entry of entries){entry.labelTexture.dispose();entry.labelMaterial.dispose();}
      lookup.clear();
    }
  };
}
