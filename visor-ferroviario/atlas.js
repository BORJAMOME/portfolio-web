"use strict";
const CFG = window.AtlasConfig;
const statusText = document.querySelector("#status");
const loading = document.querySelector("#loading");
const number = new Intl.NumberFormat("es-ES");
const filters = {gauge:[], electric:[], tracks:[]};
const dimensions = {gauge:"Ancho de vía", electric:"Electrificación", tracks:"Número de vías"};
const bounds = CFG.bounds;
const padding = () => ({top:30,bottom:40,left:window.innerWidth>760?330:20,right:window.innerWidth>760?40:20});
let dataset = null;
let peninsular = [];
let filtered = [];
let ready = false;
let selectedId = null;
let savedQueries = [];
let terrainEnabled = false;
let terrainController;
let infoRevision = 0;
let lineCatalog;
let infoOpener = null;
let pendingHash = null;
const $ = s => document.querySelector(s);
const motion = ms => CFG.reducedMotion() ? 0 : ms;

/* ── estado en la URL: filtros IGN + tema + población + 3D (los enlaces antiguos solo traían filtros) ── */
function readFilters(value) {
  for(const dimension of Object.keys(filters)) {
    filters[dimension] = Array.isArray(value?.[dimension]) ? value[dimension].filter(v=>typeof v==="string").slice(0,30) : [];
  }
}
function readHash() {
  try { return JSON.parse(decodeURIComponent(location.hash.slice(1) || "{}")) || {}; } catch { return {}; }
}
pendingHash = readHash();
readFilters(pendingHash);
let hashTimer;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const state = {...filters, ...(window.AtlasCapas?.getState() || {}), p: window.AtlasPopulation?.state(), m: terrainEnabled ? 1 : undefined};
    for(const key of Object.keys(filters)) if(!state[key].length) delete state[key];
    if(state.p && !state.p.on) delete state.p;
    try { history.replaceState(null, "", "#" + encodeURIComponent(JSON.stringify(state))); } catch {}
  }, 150);
}
try { savedQueries = JSON.parse(localStorage.getItem("ferro_atlas_queries") || "[]"); if(!Array.isArray(savedQueries))savedQueries=[]; } catch {}

function label(dimension, value) {
  if(value === "unknown") return "Sin información";
  if(value === "notApplicable") return "No aplica";
  if(value === "pending") return "Pendiente de verificación";
  if(dimension === "gauge" && ["mixed","other"].includes(value)) return AtlasCartography.style(value).name;
  if(dimension === "gauge" && value === "narrow") return "Estrecho · medida no publicada";
  if(dimension === "gauge") return ({"1668":"Ibérico · 1.668 mm","1435":"Estándar · 1.435 mm","1000":"Métrico · 1.000 mm"})[value] || number.format(Number(value))+" mm";
  if(dimension === "electric") return value === "yes" ? "Electrificada" : "Sin electrificar";
  return value === "1" ? "Vía única" : value === "2" ? "Vía doble" : value+" vías";
}

let map;
try {
  map = new maplibregl.Map({
    container:"map", bounds, fitBoundsOptions:{padding:padding()},
    maxBounds:[[-16,30],[10,49]], minZoom:4, maxZoom:17, attributionControl:false,
    style:{version:8,glyphs:"fonts/{fontstack}/{range}.pbf",sources:{},
      layers:[{id:"background",type:"background",paint:{"background-color":"#cad9ea"}}]}
  });
} catch(error) {
  loading.textContent = "El navegador no ha podido iniciar WebGL. Abre este atlas en Chrome, Edge o Firefox con aceleración gráfica.";
  console.error(error);
}
if(map) {
  map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"top-right");
  map.addControl(new maplibregl.ScaleControl({unit:"metric"}),"bottom-left");
  map.addControl(new maplibregl.AttributionControl({compact:true}),"bottom-right");
  const coordinate = new Intl.NumberFormat("es-ES",{minimumFractionDigits:4,maximumFractionDigits:4});
  map.on("mousemove",event=>{
    const {lat,lng}=event.lngLat;
    $("#coordinates").textContent=coordinate.format(Math.abs(lat))+"° "+(lat>=0?"N":"S")+" · "+coordinate.format(Math.abs(lng))+"° "+(lng>=0?"E":"O");
  });
  // Solo avisa de fallos reales de capas externas; ignora cancelaciones y teselas del MDT sin cobertura.
  map.on("error",event=>{
    const message=String(event.error?.message||"");
    if(event.error?.name==="AbortError"||/abort/i.test(message)||["ign-terrain","ign-shading"].includes(event.sourceId))return;
    console.error(event.error);
    statusText.dataset.warning="1";
    statusText.textContent="Una capa externa no ha podido cargarse. La red y las capas locales siguen disponibles.";
  });
  map.on("idle",()=>{if(statusText.dataset.warning&&ready){delete statusText.dataset.warning;statusText.textContent=baseStatus();}});
}
const baseStatus=()=>dataset?number.format(peninsular.length)+" tramos IGN peninsulares · corte de datos 16-11-2026":"Cargando datos…";

function setTerrain(enabled) {
  if(!ready||!terrainController)return;
  terrainController.setEnabled(enabled);
}
$("#mode").onclick=()=>setTerrain(true);
$("#flat").onclick=()=>setTerrain(false);
$("#home").onclick=()=>map?.fitBounds(bounds,{padding:padding(),bearing:0,pitch:terrainEnabled?55:0,duration:motion(900)});
$("#toggle-panel").onclick=function(){
  const panel=$("#tools");
  panel.hidden=!panel.hidden;
  this.setAttribute("aria-expanded",String(!panel.hidden));
};
if(window.innerWidth<=760)$("#toggle-panel").click();

/* ── ficha (hoja inferior en móvil) ── */
function clearSelection(){
  if(selectedId!==null&&map?.getSource("rail"))map.setFeatureState({source:"rail",id:selectedId},{selected:false});
  selectedId=null;
}
function closeInfo(){
  $("#info").hidden=true;
  clearSelection();
  window.AtlasCapas?.clearSelection();
  window.AtlasPopulation?.clearSelection();
  infoOpener?.focus?.();infoOpener=null;
  writeHash();
}
$("#close").onclick=closeInfo;
document.addEventListener("keydown",event=>{
  if(event.key!=="Escape")return;
  if(!$("#info").hidden){closeInfo();event.preventDefault();}
  else if(window.innerWidth<=760&&!$("#tools").hidden){$("#toggle-panel").click();$("#toggle-panel").focus();}
});
function showInfo(kind,title,fields,source,actions,media) {
  infoRevision++;
  if($("#info").hidden)infoOpener=document.activeElement!==document.body?document.activeElement:null;
  $("#kind").textContent=kind;
  $("#name").textContent=title;
  const figure=$("#info-media");figure.hidden=!media;
  if(media){const img=figure.querySelector("img");img.src=media.src;img.alt=media.alt;figure.querySelector("figcaption").textContent=media.caption;}
  const list=$("#attributes");
  list.replaceChildren();
  for(const [key,value] of Object.entries(fields)) {
    if(value===undefined)continue;
    const dt=document.createElement("dt"),dd=document.createElement("dd");
    dt.textContent=key;
    if(value?.url) {
      const link=document.createElement("a");
      link.textContent=value.title;link.href=value.url;link.target="_blank";link.rel="noopener";
      dd.append(link);
    } else dd.textContent=value ?? "Sin dato en la fuente";
    list.append(dt,dd);
  }
  if(actions?.length){
    const dt=document.createElement("dt"),dd=document.createElement("dd"),ul=document.createElement("ul");
    dt.textContent="Rutas";ul.className="info-actions";
    for(const action of actions){const li=document.createElement("li"),b=document.createElement("button");b.type="button";b.textContent=action.label;b.onclick=action.action;li.append(b);ul.append(li);}
    dd.append(ul);list.append(dt,dd);
  }
  const dt=document.createElement("dt"),dd=document.createElement("dd"),a=document.createElement("a");
  dt.textContent="Fuente";a.textContent=source.title;a.href=source.url;a.target="_blank";a.rel="noopener";
  dd.append(a);list.append(dt,dd);
  $("#info").hidden=false;
  // En móvil la ficha ocupa la hoja inferior: se pliega el panel para que no se superpongan.
  if(window.innerWidth<=760&&!$("#tools").hidden){$("#tools").hidden=true;$("#toggle-panel").setAttribute("aria-expanded","false");}
  $("#name").focus({preventScroll:true});
  writeHash();
}
async function stationInfo(feature) {
  const p=feature.properties;
  // La ficha de estación muestra los servicios con parada acreditada, sea cual sea el tema activo.
  try{await AtlasCapas.loadServices();}catch{}
  if(AtlasCapas.hasStation(p.CODIGO)){AtlasCapas.stationInfo(AtlasCapas.hasStation(p.CODIGO));return;}
  showInfo("Estación · catálogo Renfe",p.DESCRIPCION,{
    "Código":p.CODIGO,"Localidad":p.POBLACION,"Provincia":p.PROVINCIA,
    "Dirección":p.DIRECION,
    "Servicios con parada":"Ningún tren de los horarios integrados (Renfe AV/LD, Cercanías métricas y OUIGO) tiene parada comercial acreditada en esta estación.",
    "Fecha de descarga":"13/11/2026"
  },{title:"Renfe Operadora · CC BY 4.0",url:"https://data.renfe.com/es/dataset/estaciones-listado-completo"});
}
function loadLineCatalog() {
  lineCatalog ??= fetch("line-catalog.geojson").then(response => {
    if(!response.ok) throw new Error("Catálogo de líneas no disponible");
    return response.json();
  }).then(AtlasLineIdentity.build).catch(error => { lineCatalog = undefined; console.warn(error); return null; });
  return lineCatalog;
}
async function sectionInfo(rendered, location) {
  const original = dataset.rail.features[rendered.id];
  const feature = original?.properties.id === rendered.properties.id ? original : rendered;
  const p = feature.properties;
  clearSelection();
  selectedId=rendered.id;
  map.setFeatureState({source:"rail",id:selectedId},{selected:true});
  const coordinates = [location.lng, location.lat];
  const station = AtlasLineIdentity.nearestStation(coordinates, dataset.stations.features);
  const title = station ? "Tramo cerca de " + station.name : "Tramo ferroviario";
  const stationDistance = station && (station.metres < 1000 ? number.format(Math.round(station.metres))+" m" : number.format(Math.round(station.metres/100)/10)+" km");
  const fields = {
    "Ubicación":coordinates.slice().reverse().map(value=>value.toFixed(5)).join(", "),
    ...(station && {"Estación Renfe de referencia":station.name+" · "+stationDistance+" en línea recta"}),
    "Ancho de vía":p.nominalgauge?number.format(p.nominalgauge)+" mm":label("gauge",AtlasFilters.value(feature,"gauge")),
    "Electrificación":label("electric",AtlasFilters.value(feature,"electric")),
    "Configuración":label("tracks",AtlasFilters.value(feature,"tracks")),
    "Longitud del tramo seleccionado":number.format(Math.round(p.length_m))+" m",
    "Referencia IGN":p.id
  };
  const source = {title:"IGN · IGR Redes de Transporte",url:"https://api-features.idee.es/collections/railwaylink/items/"+encodeURIComponent(p.id)+"?f=json"};
  showInfo("Infraestructura ferroviaria", title, {"Línea":"Buscando en el catálogo de Adif…", ...fields}, source);
  const revision = infoRevision;
  const match = await loadLineCatalog();
  if(revision !== infoRevision || $("#info").hidden) return;
  const identity = feature === original ? match?.(feature.geometry.coordinates) : null;
  if(!identity) {
    showInfo("Infraestructura ferroviaria", title, {"Línea":match ? "Sin correspondencia inequívoca en el catálogo de Adif" : "Catálogo de Adif no disponible", ...fields}, source);
    return;
  }
  const section = identity.sections[0];
  const endpoints = section.origin && section.destination ? section.origin+" – "+section.destination : null;
  const sharedValue = key => { const value = section[key]; return value && identity.sections.every(item => item[key] === value) ? value : null; };
  const axis = sharedValue("axis"), status = sharedValue("status");
  const catalogSource = identity.source;
  const updated = section.source_date || catalogSource?.source_date;
  const lineTitle = section.line_name || (identity.sections.length === 1 && endpoints) || "Línea "+identity.code;
  showInfo("Línea ferroviaria · coincidencia cartográfica", lineTitle, {
    "Código de línea Adif":identity.code,
    ...(axis && {"Eje según Adif":axis}), ...(status && {"Estado en el catálogo Adif":status}),
    ...(identity.sections.length === 1 && endpoints && {"Sector según Adif":endpoints}),
    ...(updated && {"Actualización del catálogo Adif":updated}),
    ...fields,
    ...(catalogSource?.source_url && {"Catálogo de líneas":{title:catalogSource.attribution,url:catalogSource.source_url}})
  }, source);
}
$("#search").oninput=function(){
  const results=$("#results");results.replaceChildren();
  const query=AtlasFilters.normalize(this.value.trim());
  if(query.length<2||!dataset)return;
  const matches=dataset.stations.features.filter(f=>AtlasFilters.normalize(f.properties.DESCRIPCION+" "+f.properties.POBLACION).includes(query)).slice(0,15);
  for(const feature of matches) {
    const button=document.createElement("button");button.type="button";
    button.textContent=feature.properties.DESCRIPCION+" · "+feature.properties.POBLACION;
    button.onclick=()=>{
      map.flyTo({center:feature.geometry.coordinates.slice(0,2),zoom:12,duration:motion(1200)});
      stationInfo(feature);results.replaceChildren();
      if(window.innerWidth<=760&&!$("#tools").hidden)$("#toggle-panel").click();
    };
    results.append(button);
  }
  if(!matches.length)results.textContent="Sin coincidencias en el catálogo de estaciones peninsulares.";
};

/* ── filtros IGN (tema «Ancho de vía») ── */
let facetValues;
function renderFacets() {
  const container=$("#facets");
  container.replaceChildren();
  facetValues ??= Object.fromEntries(Object.keys(dimensions).map(d=>[d,[...new Set(peninsular.map(f=>f.properties["filter_"+d]))]]));
  const counts=Object.fromEntries(Object.keys(dimensions).map(d=>[d,new Map()]));
  for(const f of peninsular) {
    const p=f.properties;
    for(const d of Object.keys(dimensions)) {
      // Recuento de cada faceta con los filtros de las otras dimensiones (lectura de filter_* precalculado).
      if(Object.keys(dimensions).every(o=>o===d||!filters[o].length||filters[o].includes(p["filter_"+o])))
        counts[d].set(p["filter_"+d],(counts[d].get(p["filter_"+d])||0)+1);
    }
  }
  for(const [dimension,title] of Object.entries(dimensions)) {
    const fieldset=document.createElement("fieldset"),legend=document.createElement("legend");
    legend.textContent=title;fieldset.append(legend);
    const all=new Set([...facetValues[dimension],...filters[dimension]]);
    for(const value of [...all].sort((a,b)=>a==="unknown"?1:b==="unknown"?-1:a.localeCompare(b,undefined,{numeric:true}))) {
      const row=document.createElement("label"),input=document.createElement("input"),text=document.createElement("span"),count=document.createElement("span");
      row.className="row";input.type="checkbox";input.value=value;input.checked=filters[dimension].includes(value);
      text.textContent=label(dimension,value);count.className="count";count.textContent=number.format(counts[dimension].get(value)||0);
      input.disabled=!input.checked&&!counts[dimension].get(value);
      input.onchange=()=>{ filters[dimension]=input.checked?[...filters[dimension],value]:filters[dimension].filter(v=>v!==value); applyFilters(); };
      row.append(input,text,count);fieldset.append(row);
    }
    container.append(fieldset);
  }
}
function updateStationCount(){
  if(!map||!dataset)return;const b=map.getBounds();const enabled=$('[data-layer="stations"]').checked;
  $("#station-count").textContent=number.format(enabled?dataset.stations.features.filter(f=>b.contains(f.geometry.coordinates.slice(0,2))).length:0);
}
function applyFilters() {
  filtered=peninsular.filter(f=>Object.keys(filters).every(d=>!filters[d].length||filters[d].includes(f.properties["filter_"+d])));
  if(ready) {
    const clauses=Object.entries(filters).filter(([,values])=>values.length).map(([dimension,values])=>["in",AtlasFilters.expression(dimension),["literal",values]]);
    const expression=["all",["==",["get","pen"],1],...clauses];
    map.setFilter("rail",expression);map.setFilter("rail-hit",expression);
  }
  const metrics=AtlasCartography.metrics(filtered);
  const visible=$('[data-layer="rail"]').checked;
  $("#count").textContent=number.format(visible?metrics.sections:0);
  $("#km").textContent=number.format(visible?Math.round(metrics.km):0);
  $("#gauge-coverage").textContent=visible&&metrics.gaugeCoverage!==null?number.format(Math.round(metrics.gaugeCoverage))+" %":"—";
  updateStationCount();
  if(window.AtlasCapas?.current()==="gauge"||!window.AtlasCapas)renderFacets();
  renderLegend();
  writeHash();
  if(selectedId!==null&&!filtered.some(f=>f.id===selectedId)){$("#info").hidden=true;clearSelection();}
}
$("#reset").onclick=()=>{readFilters({});applyFilters();};

/* ── leyenda: refleja el tema y las capas activas ── */
function renderLegend() {
  const legend=$("#legend");
  legend.replaceChildren();
  const theme=window.AtlasCapas?.current()||"gauge";
  if(!window.AtlasCapas?.legend(legend)) {
    const items=theme==="gauge"
      ? ($('[data-layer="rail"]').checked?[...new Set(filtered.map(f=>AtlasFilters.value(f,"gauge")))].map(v=>AtlasCartography.style(v)):[])
      : AtlasThemes.legend();
    if(items.length){
      const h=document.createElement("strong");h.textContent=CFG.themes[theme]?.name||"Red ferroviaria";legend.append(h);
      const ul=document.createElement("ul");
      for(const item of items.slice(0,12)){const li=document.createElement("li"),sw=document.createElement("i");sw.className="swatch";sw.style.setProperty("--c",item.color);li.append(sw,document.createTextNode(item.name));ul.append(li);}
      if(items.length>12){const li=document.createElement("li");li.textContent="Y "+(items.length-12)+" más: selecciona líneas para acotar la leyenda.";ul.append(li);}
      legend.append(ul);
    }
  }
  if($('[data-layer="stations"]').checked){
    const p=document.createElement("p"),key=document.createElement("i");key.className="station-key";p.append(key,document.createTextNode("Estación Renfe (catálogo)"));legend.append(p);
  }
  const sizes=window.AtlasPopulation?.legend();
  if(sizes)legend.append(sizes);
  legend.hidden=!legend.childElementCount;
}

/* ── consultas y exportación ── */
function renderSaved() {
  const select=$("#saved-query");
  select.replaceChildren(new Option("Recuperar consulta…",""));
  savedQueries.forEach((q,i)=>select.append(new Option(q.name,String(i))));
}
renderSaved();
$("#save-query").onclick=()=>{
  const name=$("#query-name").value.trim();
  if(!name){$("#action-message").textContent="Escribe un nombre para guardar la consulta.";return;}
  savedQueries=savedQueries.filter(q=>q.name!==name);
  savedQueries.push({name,filters:JSON.parse(JSON.stringify(filters)),capas:window.AtlasCapas?.getState(),population:window.AtlasPopulation?.state()});
  try{localStorage.setItem("ferro_atlas_queries",JSON.stringify(savedQueries));renderSaved();$("#action-message").textContent="Consulta guardada en este navegador.";}
  catch{$("#action-message").textContent="El navegador no permite guardar consultas.";}
};
$("#saved-query").onchange=async function(){
  if(this.value==="")return;
  const query=savedQueries[Number(this.value)];
  readFilters(query.filters);applyFilters();
  if(query.capas)await AtlasCapas.restore(query.capas);
  if(query.population)await AtlasPopulation.restore(query.population);
};
$("#share").onclick=async()=>{
  try{await navigator.clipboard.writeText(location.href);$("#action-message").textContent="Enlace copiado con el tema, los filtros y la selección.";}
  catch{$("#action-message").textContent="Copia la dirección del navegador para conservar esta vista.";}
};
$("#export").onclick=()=>{
  const features=filtered;
  const blob=new Blob([JSON.stringify({type:"FeatureCollection",metadata:dataset.meta,features})],{type:"application/geo+json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="red-ferroviaria-filtrada.geojson";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  $("#action-message").textContent=number.format(features.length)+" tramos IGN exportados (filtros de «Ancho de vía»).";
};
let pdfLibrary;
$("#export-map").onclick=async()=>{
  if($("#export-format").value==="PDF"&&!window.jspdf){
    pdfLibrary??=new Promise((resolve,reject)=>{const s=document.createElement("script");s.src="vendor/jspdf.umd.min.js";s.onload=resolve;s.onerror=()=>reject(new Error("No se ha podido cargar el generador de PDF."));document.head.append(s);});
    try{await pdfLibrary;}catch(e){$("#action-message").textContent=e.message;pdfLibrary=null;return;}
  }
  const theme=AtlasCapas.current();
  AtlasExport.run({map,dataset,filters,filtered,label,terrainEnabled,
    legendItems:theme==="gauge"?null:(AtlasCapas.legendItems()||AtlasThemes.legend()),themeName:CFG.themes[theme].name});
};

for(const checkbox of document.querySelectorAll("[data-layer]")) {
  checkbox.onchange=()=>{
    if(!ready)return;
    const ids=checkbox.dataset.layer==="stations"?["stations","station-labels"]:checkbox.dataset.layer==="rail"?["rail","rail-hit"]:[checkbox.dataset.layer];
    for(const id of ids)map.setLayoutProperty(id,"visibility",checkbox.checked?"visible":"none");
    applyFilters();
  };
}

/* ── carga ── */
const dataPromise=fetch("datos.json").then(r=>{if(!r.ok)throw new Error("No se ha podido cargar datos.json ("+r.status+")");return r.json();});
if(map)map.on("load",async()=>{
  try {
    dataset=await dataPromise;
    for(const f of dataset.rail.features){AtlasFilters.prepare(f);f.properties.pen=CFG.peninsular(f.geometry.coordinates[0])?1:0;}
    peninsular=dataset.rail.features.filter(f=>f.properties.pen);
    dataset.stations.features=dataset.stations.features.filter(f=>CFG.peninsular(f.geometry.coordinates));
    map.addSource("land",{type:"geojson",data:dataset.boundary});
    map.addLayer({id:"land",type:"fill",source:"land",paint:{"fill-color":"#f5f7fa"}});
    map.addSource("topography",{type:"raster",tileSize:256,
      tiles:["https://www.ign.es/wms-inspire/mapa-raster?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=mtn_rasterizado&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256"],
      bounds:[-9.6,35.9,4.5,44.2],attribution:'© <a href="https://www.ign.es/">IGN</a> · CC BY 4.0'});
    map.addLayer({id:"topography",type:"raster",source:"topography",layout:{visibility:"none"},paint:{"raster-saturation":-1,"raster-opacity":.45}});
    // Portugal y Francia quedan como contexto en el color del mar, con menor protagonismo.
    const rings=dataset.boundary.type==="Polygon"?[dataset.boundary.coordinates]:dataset.boundary.coordinates;
    map.addSource("outside",{type:"geojson",data:{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]],...rings.map(poly=>poly[0])]}}});
    map.addLayer({id:"outside",type:"fill",source:"outside",paint:{"fill-color":"#cad9ea"}});
    map.addSource("regions",{type:"geojson",data:dataset.regions,attribution:'Límites © EuroGeographics · Eurostat/GISCO 2021'});
    map.addLayer({id:"region-lines",type:"line",source:"regions",paint:{"line-color":"#b9c5d6","line-width":.7,"line-dasharray":[3,3]}});
    if(!window.IGN_TERRAIN_MANIFEST?.tiles?.length){
      map.addSource("terrain",{type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],encoding:"terrarium",tileSize:256,maxzoom:15,
        attribution:'Relieve <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen y colaboradores</a>'});
      map.addLayer({id:"hillshade",type:"hillshade",source:"terrain",maxzoom:14,paint:{"hillshade-exaggeration":.2,"hillshade-shadow-color":"#526a8e","hillshade-highlight-color":"#fbfbfb"}},"outside");
    }
    map.addSource("rail",{type:"geojson",data:dataset.rail,tolerance:.2,attribution:'Obra derivada IGR-RT · IGN/SCNE · CC BY 4.0'});
    window.AtlasBaseRailColor=["case",["boolean",["feature-state","selected"],false],"#101e36",
      ["match",AtlasFilters.expression("gauge"),...Object.entries(AtlasCartography.styles).flatMap(([key,value])=>[key,value.color]),"#76542C"]];
    map.addLayer({id:"rail",type:"line",source:"rail",filter:["==",["get","pen"],1],paint:{
      "line-color":window.AtlasBaseRailColor,"line-width":["interpolate",["linear"],["zoom"],5,.9,8,1.5,12,2.8,16,4],"line-opacity":.95}});
    map.addLayer({id:"rail-hit",type:"line",source:"rail",filter:["==",["get","pen"],1],paint:{"line-color":"#273a5f","line-width":10,"line-opacity":0}});
    const placeFeatures=[
      ...regions.filter(([name])=>!["Islas Baleares","Canarias"].includes(name)).map(([name,lat,lng])=>({type:"Feature",geometry:{type:"Point",coordinates:[lng,lat]},properties:{name,kind:"region",rank:6}})),
      ...cities.filter(([,lat,lng])=>CFG.peninsular([lng,lat])).map(([name,lat,lng,rank])=>({type:"Feature",geometry:{type:"Point",coordinates:[lng,lat]},properties:{name,kind:"city",rank}}))
    ];
    map.addSource("places",{type:"geojson",data:{type:"FeatureCollection",features:placeFeatures}});
    map.addLayer({id:"region-labels",type:"symbol",source:"places",filter:["==",["get","kind"],"region"],minzoom:5,maxzoom:9,
      layout:{"text-field":["upcase",["get","name"]],"text-font":["Noto Sans Regular"],"text-size":11,"text-letter-spacing":.1,"text-padding":12},
      paint:{"text-color":"#6e809a","text-halo-color":"#f5f7fa","text-halo-width":2}});
    map.addLayer({id:"city-labels",type:"symbol",source:"places",filter:["==",["get","kind"],"city"],
      layout:{"text-field":["get","name"],"text-font":["Noto Sans Regular"],"text-size":["interpolate",["linear"],["zoom"],5,12,10,14],
        "symbol-sort-key":["get","rank"],"text-variable-anchor":["top","bottom","left","right"],"text-radial-offset":.5,"text-padding":5},
      paint:{"text-color":"#1d2638","text-halo-color":"#fbfbfb","text-halo-width":2}});
    map.addSource("stations",{type:"geojson",data:dataset.stations,attribution:'Origen de los datos: Renfe Operadora · CC BY 4.0'});
    map.addLayer({id:"stations",type:"circle",source:"stations",minzoom:7,paint:{
      "circle-radius":["interpolate",["linear"],["zoom"],7,2,13,5],"circle-color":"#fbfbfb","circle-stroke-color":"#273a5f","circle-stroke-width":1.3,
      "circle-pitch-alignment":"viewport","circle-pitch-scale":"viewport"}});
    const badge=document.createElement('canvas');badge.width=badge.height=32;const badgeContext=badge.getContext('2d');badgeContext.fillStyle='#fbfbfb';badgeContext.strokeStyle='#b9c5d6';badgeContext.lineWidth=1;badgeContext.beginPath();badgeContext.roundRect(1,1,30,30,5);badgeContext.fill();badgeContext.stroke();map.addImage('station-badge',badgeContext.getImageData(0,0,32,32),{stretchX:[[8,24]],stretchY:[[8,24]],content:[5,5,27,27],pixelRatio:2});
    map.addLayer({id:"station-labels",type:"symbol",source:"stations",minzoom:10,layout:{
      "icon-image":"station-badge","icon-text-fit":"both","icon-text-fit-padding":[4,6,4,6],"text-field":["get","DESCRIPCION"],"text-font":["Noto Sans Regular"],"text-size":12,
      "text-variable-anchor":["top","bottom","left","right"],"text-radial-offset":.8,"text-padding":4},
      paint:{"text-color":"#273a5f","text-halo-color":"#fbfbfb","text-halo-width":2}});
    // Prioridad de selección: paradas del tema > estaciones > líneas del tema > tramo IGN > población.
    const themeHit = point => { const layers=[...AtlasCapas.hitLayers(),"theme-hit"].filter(id=>map.getLayer(id)&&map.getLayoutProperty(id,"visibility")!=="none");
      const box=[[point.x-6,point.y-6],[point.x+6,point.y+6]]; return layers.length && map.queryRenderedFeatures(box,{layers}).length; };
    map.on("click","stations",e=>{ if(map.getLayer("cx-stops")&&map.queryRenderedFeatures(e.point,{layers:["cx-stops"]}).length)return; stationInfo(e.features[0]); });
    map.on("click","rail-hit",e=>{
      if(themeHit(e.point) || map.queryRenderedFeatures(e.point,{layers:["stations"]}).length)return;
      // Con Población activa, el círculo tiene prioridad sobre el tramo IGN de fondo.
      if(map.getLayer("population-circles")&&map.getLayoutProperty("population-circles","visibility")!=="none"&&map.queryRenderedFeatures(e.point,{layers:["population-circles"]}).length)return;
      sectionInfo(e.features[0], e.lngLat);
    });
    for(const id of ["rail-hit","stations"]){
      map.on("mouseenter",id,()=>map.getCanvas().style.cursor="pointer");
      map.on("mouseleave",id,()=>map.getCanvas().style.cursor="");
    }
    ready=true;
    AtlasThemes.init({map,showInfo,onChange:()=>{renderLegend();writeHash();},onLegend:()=>renderLegend()});
    AtlasCapas.init({map,dataset,showInfo,legacy:AtlasThemes,onChange:()=>{if(AtlasCapas.current()==="gauge")renderFacets();renderLegend();writeHash();}});
    AtlasPopulation.init({map,showInfo,onChange:()=>{renderLegend();writeHash();}});
    applyFilters();
    map.on("moveend",updateStationCount);
    terrainController=window.AtlasTerrain?.create(map,{container:$("#terrain-controls"),onToggle:enabled=>{
      terrainEnabled=enabled;$("#mode").setAttribute("aria-pressed",String(enabled));$("#flat").setAttribute("aria-pressed",String(!enabled));writeHash();
    },getSelection:()=>dataset.rail.features.find(f=>f.id===selectedId)});
    const finishLoading=()=>{if(loading.hidden)return;loading.hidden=true;const attrib=document.querySelector(".maplibregl-ctrl-attrib");attrib?.classList.remove("maplibregl-compact-show");attrib?.removeAttribute("open");};
    map.once("idle",finishLoading);setTimeout(finishLoading,4000);
    statusText.textContent=baseStatus();
    // Restaurar el estado del enlace (tema, población, selección, 3D). Los enlaces antiguos solo traen filtros.
    const hash=pendingHash;pendingHash=null;
    // Enlace antiguo con filtros de vía y sin tema: abrir el tema «Ancho de vía», donde esos filtros se ven.
    const legacyFilters=!hash.t&&Object.values(filters).some(v=>v.length);
    await AtlasCapas.restore(hash.t?hash:legacyFilters?{t:"gauge"}:null);
    if(AtlasCapas.current()==="gauge")renderFacets();
    if(hash.p)await AtlasPopulation.restore(hash.p);
    if(hash.m)setTerrain(true);
    renderLegend();finishLoading();
  } catch(error) {
    console.error(error);loading.textContent="Error al preparar el mapa: "+error.message;
  }
});
dataPromise.catch(error=>{loading.textContent=error.message+". Recarga la página para reintentarlo.";});
