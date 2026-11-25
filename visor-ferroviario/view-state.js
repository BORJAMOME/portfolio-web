/* Estado compartible de la vista. Valida datos de URL sin coerciones ni efectos de DOM. */
(function(root){
  'use strict';
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const between=(value,min,max)=>finite(value)&&value>=min&&value<=max;
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  function camera(raw){
    if(!Array.isArray(raw)||raw.length!==5)return null;
    const [lng,lat,zoom,bearing,pitch]=raw;
    if(!between(lng,-16,10)||!between(lat,30,49)||!between(zoom,4,17)||!between(bearing,-180,180)||!between(pitch,0,75))return null;
    return {center:[lng,lat],zoom,bearing,pitch};
  }
  function terrain(raw){
    const result={};
    if(!record(raw))return result;
    if(between(raw.exaggeration,1,2))result.exaggeration=raw.exaggeration;
    if(typeof raw.shade==='boolean')result.shade=raw.shade;
    if(['day','warm','studio'].includes(raw.lighting))result.lighting=raw.lighting;
    if(['soft','crisp','slope','zenith'].includes(raw.reliefStyle))result.reliefStyle=raw.reliefStyle;
    if(between(raw.strength,0.2,1))result.strength=raw.strength;
    if(['cartographic','natural','bosque','meseta','suizo','elevation'].includes(raw.palette))result.palette=raw.palette;
    return result;
  }
  function layers(raw){
    const result={};
    if(!record(raw))return result;
    for(const key of ['rail','stations','topography'])if(typeof raw[key]==='boolean')result[key]=raw[key];
    return result;
  }
  function capture(map){
    const center=map.getCenter();
    const round=(value,digits)=>finite(value)?Number(value.toFixed(digits)):value;
    const raw=[round(center.lng,5),round(center.lat,5),round(map.getZoom(),3),round(map.getBearing(),2),round(map.getPitch(),2)];
    return camera(raw)?raw:null;
  }
  const api={camera,terrain,layers,capture};
  if(typeof module!=='undefined')module.exports=api;
  root.AtlasViewState=api;
})(typeof window==='undefined'?globalThis:window);
