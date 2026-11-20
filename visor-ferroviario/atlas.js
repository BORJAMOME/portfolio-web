"use strict";
const CFG = window.AtlasConfig;
const statusText = document.querySelector("#status");
const loading = document.querySelector("#loading");
const number = new Intl.NumberFormat("es-ES");
const filters = {gauge:[], electric:[], tracks:[]};
const dimensions = {gauge:"Ancho de vía", electric:"Electrificación", tracks:"Número de vías"};
const bounds = CFG.bounds;
const padding = () => CFG.compact() ? {top:20,bottom:20,left:20,right:20} : {top:30,bottom:40,left:document.querySelector("#tools")?.hidden?40:(document.querySelector("#tools")?.offsetWidth||340)+24,right:40};
let dataset = null;
let peninsular = [];
let filtered = [];
let ready = false;
let selectedId = null;
let savedQueries = [];
let terrainEnabled = false;
let terrainController;
let basemapController;
let terrainSummary="",terrainWarning=false;
const failedMapSources = new Set();
let infoRevision = 0;
let lineCatalog;
let infoOpener = null;
let pendingHash = null;
let restoringView = true;
const $ = s => document.querySelector(s);
const motion = ms => CFG.reducedMotion() ? 0 : ms;

/* ── estado en la URL: filtros IGN + tema + población + 3D (los enlaces antiguos solo traían filtros) ── */
function readFilters(value) {
  for(const dimension of Object.keys(filters)) {
    filters[dimension] = Array.isArray(value?.[dimension]) ? value[dimension].filter(v=>typeof v==="string").slice(0,30) : [];
  }
}
function readHash() {
  try { const value=JSON.parse(decodeURIComponent(location.hash.slice(1) || "{}")); return value&&typeof value==="object"&&!Array.isArray(value)?value:{}; } catch { return {}; }
}
pendingHash = readHash();
readFilters(pendingHash);
let hashTimer;
function persistHash() {
  clearTimeout(hashTimer);
  if(!ready||restoringView)return;
  const state = {...filters, ...(window.AtlasCapas?.getState() || {}), p: window.AtlasPopulation?.state(), tp: window.AtlasTransport?.state(), r: window.AtlasRoute?.state(), m: terrainEnabled ? 1 : undefined,
    b:basemapController?.state()==='positron'?'positron':undefined,
    c:window.AtlasViewState.capture(map), tv:window.AtlasViewState.terrain(terrainController?.getState()),
    l:Object.fromEntries([...document.querySelectorAll("[data-layer]")].map(input=>[input.dataset.layer,input.checked]))};
  for(const key of Object.keys(filters))if(!state[key].length)delete state[key];
  if(state.p&&!state.p.on)delete state.p;
  try {
    const hash="#" + encodeURIComponent(JSON.stringify(state));
    history.replaceState(null, "", hash);
    const web=document.querySelector("#web-view");if(web)web.href="https://borjamora.es/visor-ferroviario/"+hash;
    const cabina=document.querySelector("#cabina-link");if(cabina)cabina.href="cabina.html"+hash;
  } catch {}
}
function writeHash() {
  window.AtlasPanel?.sync();
  clearTimeout(hashTimer);
  if(!ready||restoringView)return;
  hashTimer = setTimeout(persistHash,150);
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
  map.getCanvas().addEventListener("webglcontextlost",()=>{failedMapSources.add("webgl");updateMapStatus();statusText.textContent="Se ha interrumpido el renderizado del mapa. Esperando recuperación gráfica…";});
  map.getCanvas().addEventListener("webglcontextrestored",()=>{failedMapSources.delete("webgl");updateMapStatus();});
  const coordinate = new Intl.NumberFormat("es-ES",{minimumFractionDigits:4,maximumFractionDigits:4});
  map.on("mousemove",event=>{
    const {lat,lng}=event.lngLat;
    $("#coordinates").textContent=coordinate.format(Math.abs(lat))+"° "+(lat>=0?"N":"S")+" · "+coordinate.format(Math.abs(lng))+"° "+(lng>=0?"E":"O");
  });
  // El controlador del terreno comunica sus fallos en el panel de relieve.
  map.on("error",event=>{
    const message=String(event.error?.message||"");
    if(event.error?.name==="AbortError"||/abort/i.test(message))return;
    if(["ign-terrain","ign-shading","terrain"].includes(event.sourceId))return;
    if(event.sourceId==='basemap-openmaptiles'&&basemapController?.state()!=='positron')return;
    console.error(event.error);
    failedMapSources.add(event.sourceId||"unknown");
    updateMapStatus();
  });
  map.on("sourcedata",event=>{
    // Idle also fires after failed requests: only content from the failed source
    // can clear its warning. Metadata or success from another source cannot.
    if(event.sourceDataType!=="content"||!event.isSourceLoaded)return;
    if(failedMapSources.delete(event.sourceId))updateMapStatus();
  });
}
const baseStatus=()=>failedMapSources.size?"Una capa del mapa no ha podido cargarse. Las demás capas siguen disponibles.":terrainWarning?"Relieve incompleto: parte del terreno no ha cargado. La red sigue disponible en 2D.":dataset?number.format(peninsular.length)+" tramos IGN peninsulares · datos a noviembre de 2026":"Cargando datos…";

function updateMapStatus(){
  if(failedMapSources.size)statusText.dataset.warning="1";
  else delete statusText.dataset.warning;
  statusText.textContent=baseStatus();
}

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
if(CFG.compact())$("#toggle-panel").click();

/* ── ficha (hoja inferior en móvil) ── */
function clearSelection(){
  if(selectedId!==null&&map?.getSource("rail"))map.setFeatureState({source:"rail",id:selectedId},{selected:false});
  selectedId=null;
}
function closeInfo(){
  infoRevision++;
  $("#info").hidden=true;
  clearSelection();
  window.AtlasCapas?.clearSelection();
  window.AtlasPopulation?.clearSelection();
  window.AtlasRoute?.clearMap();
  infoOpener?.focus?.();infoOpener=null;
  writeHash();
}
$("#close").onclick=closeInfo;
document.addEventListener("keydown",event=>{
  if(event.key!=="Escape")return;
  if(!$("#info").hidden){closeInfo();event.preventDefault();}
  else if(CFG.compact()&&!$("#tools").hidden){$("#toggle-panel").click();$("#toggle-panel").focus();}
});
/* Ficha: antetítulo, título, subtítulo, etiquetas (líneas o marcas), cifras clave y atributos.
   La procedencia de cada dato queda en la atribución del mapa y en CAPAS.md, no en la ficha. */
function showInfo(kind,title,fields,opts={},actions,media) {
  if(opts?.url!==undefined)opts={};                       // llamadas antiguas: (…, fuente, acciones, imagen)
  opts={actions,media,...opts};
  infoRevision++;
  if($("#info").hidden)infoOpener=document.activeElement!==document.body?document.activeElement:null;
  $("#kind").textContent=kind;
  $("#name").textContent=title;
  const subtitle=$("#info-subtitle");subtitle.hidden=!opts.subtitle;subtitle.textContent=opts.subtitle||"";
  const chips=$("#info-chips");chips.replaceChildren();chips.hidden=!opts.chips?.length;
  for(const chip of opts.chips||[]){const li=document.createElement("li");li.textContent=chip.label;if(chip.color){li.style.setProperty("--c",chip.color);li.classList.add("coloured");}if(chip.title)li.title=chip.title;chips.append(li);}
  const facts=$("#info-facts");facts.replaceChildren();facts.hidden=!opts.facts?.length;
  for(const fact of opts.facts||[]){const div=document.createElement("div"),strong=document.createElement("strong"),span=document.createElement("span");strong.textContent=fact.value;span.textContent=fact.label;div.append(strong,span);facts.append(div);}
  const extra=$("#info-extra");
  for(const profile of extra.querySelectorAll('.profile'))profile.dispatchEvent(new Event('profile-dispose'));
  extra.replaceChildren();extra.hidden=!opts.extra;if(opts.extra)extra.append(opts.extra);
  // Una ficha que no es de ruta retira el trazo de la ruta anterior.
  $("#info").dataset.route=opts.route?"1":"";if(!opts.route)window.AtlasRoute?.clearMap();
  const figure=$("#info-media");figure.hidden=!opts.media;
  if(opts.media){const img=figure.querySelector("img");img.src=opts.media.src;img.alt=opts.media.alt;figure.querySelector("figcaption").textContent=opts.media.caption;}
  const list=$("#attributes");
  list.replaceChildren();
  for(const [key,value] of Object.entries(fields||{})) {
    if(value===undefined||value===null||value==="")continue;
    const dt=document.createElement("dt"),dd=document.createElement("dd");
    dt.textContent=key;
    dd.textContent=value?.title??value;
    list.append(dt,dd);
  }
  if(opts.actions?.length){
    const dt=document.createElement("dt"),dd=document.createElement("dd"),ul=document.createElement("ul");
    dt.textContent=opts.actionsLabel||"Rutas";ul.className="info-actions";
    for(const action of opts.actions){const li=document.createElement("li"),b=document.createElement("button");b.type="button";b.textContent=action.label;b.onclick=action.action;li.append(b);ul.append(li);}
    dd.append(ul);list.append(dt,dd);
  }
  $("#info").hidden=false;
  // En móvil la ficha ocupa la hoja inferior: se pliega el panel para que no se superpongan.
  if(CFG.compact()&&!$("#tools").hidden){$("#tools").hidden=true;$("#toggle-panel").setAttribute("aria-expanded","false");}
  if(!opts.keepFocus)$("#name").focus({preventScroll:true});
  writeHash();
}
window.AtlasShowInfo=(...args)=>showInfo(...args);
/* Conexiones de una estación con otros modos: metro o metro ligero a pie (≤ 400 m) y aeropuertos o puertos cercanos (≤ 3 km). */
function connections(coordinates){
  const out=[];
  const near=window.AtlasThemes?.nearbyStations?.(coordinates,400)||[];
  for(const s of near)out.push(s.network+": "+s.name+" ("+s.lines.join(", ")+") a "+number.format(Math.round(s.metres/10)*10)+" m");
  for(const x of window.AtlasTransport?.near?.(coordinates,3000)||[])out.push(x.kind+": "+x.name+" a "+(x.metres<1000?number.format(Math.round(x.metres/10)*10)+" m":number.format(Math.round(x.metres/100)/10)+" km"));
  return out.length?out.join("\n"):undefined;
}
window.AtlasConnections=connections;
async function stationInfo(feature) {
  const revision=++infoRevision;
  const p=feature.properties;
  // La ficha de estación muestra los servicios con parada acreditada, sea cual sea el tema activo.
  try{await Promise.all([AtlasCapas.loadServices(),AtlasThemes.prepareConnections(),AtlasTransport.load()]);}catch{}
  if(revision!==infoRevision)return;
  if(AtlasCapas.hasStation(p.CODIGO)){AtlasCapas.stationInfo(AtlasCapas.hasStation(p.CODIGO));return;}
  showInfo("Estación Renfe",p.DESCRIPCION,{
    "Dirección":p.DIRECION,
    "Servicios con parada":"Sin parada comercial de los trenes de alta velocidad, larga distancia, Cercanías métricas u OUIGO en los horarios integrados.",
    "Conexiones con otros transportes":connections(feature.geometry.coordinates)
  },{subtitle:[p.POBLACION,p.PROVINCIA].filter(Boolean).join(" · ")});
}
function loadLineCatalog() {
  lineCatalog ??= fetch("line-catalog.geojson").then(response => {
    if(!response.ok) throw new Error("Catálogo de líneas no disponible");
    return response.json();
  }).then(AtlasLineIdentity.build).catch(error => { lineCatalog = undefined; console.warn(error); return null; });
  return lineCatalog;
}
function classOf(dim,p){
  const d=CFG.classifications[dim];
  return d.items.find(i=>(i.values||[i.id]).includes(String(p[d.prop])))||d.items.find(i=>i.id==="none"||i.id==="unknown");
}
async function sectionInfo(rendered, location) {
  const requestRevision=++infoRevision;
  const original = dataset.rail.features[rendered.id];
  const feature = original?.properties.id === rendered.properties.id ? original : rendered;
  const p = feature.properties;
  clearSelection();
  selectedId=rendered.id;
  map.setFeatureState({source:"rail",id:selectedId},{selected:true});
  const coordinates = [location.lng, location.lat];
  const station = AtlasLineIdentity.nearestStation(coordinates, dataset.stations.features);
  const net = classOf("net",p), perf = classOf("perf",p);
  const rfig = ["adif","adifav","port","lfp","other"].includes(net.id);
  const tracks = AtlasFilters.value(feature,"tracks"), electric = AtlasFilters.value(feature,"electric");
  const facts = [
    {value:p.nominalgauge?number.format(p.nominalgauge)+" mm":label("gauge",AtlasFilters.value(feature,"gauge")),label:"ancho de vía"},
    ...(tracks!=="unknown"?[{value:tracks==="1"?"Única":tracks==="2"?"Doble":tracks+" vías",label:"vía"}]:[]),
    ...(electric!=="unknown"?[{value:electric==="yes"?"Sí":"No",label:"electrificada"}]:[])
  ];
  try{await AtlasCapas.loadServices();}catch{}
  if(requestRevision!==infoRevision)return;
  const services = AtlasCapas.servicesOnEdge?.(rendered.id) || [];
  const base = {
    "Titularidad y gestión":net.id==="none"?"Sin identificar: no coincide con el catálogo de Adif ni con los trazados oficiales de FGC, FGV, ETS, Metro Bilbao o el CRTM.":(net.group?net.group+" · ":"")+net.name,
    "Prestaciones":perf.id==="none"?undefined:perf.name,
    "Red Ferroviaria de Interés General":rfig?"Sí":undefined,
    // Solo hay horarios integrados de Renfe, OUIGO y las Cercanías métricas: en otras redes no se afirma la ausencia.
    "Servicios que circulan":services.length?services.join(" · "):(["adif","adifav","lfp"].includes(net.id)?"Ningún servicio de viajeros de los horarios integrados usa este tramo.":undefined),
    "Estación más próxima":station?station.name+" · a "+(station.metres<1000?number.format(Math.round(station.metres/10)*10)+" m":number.format(Math.round(station.metres/100)/10)+" km"):undefined,
    "Longitud del tramo seleccionado":number.format(Math.round(p.length_m))+" m"
  };
  const opts = {subtitle:station?"Cerca de "+station.name:undefined,chips:[...(perf.id!=="none"?[{label:perf.name,color:perf.color}]:[]),...(net.id!=="none"?[{label:net.name,color:net.color}]:[])],facts};
  showInfo("Tramo ferroviario", "Tramo ferroviario", {"Línea":"Buscando en el catálogo de Adif…", ...base}, opts);
  const revision = infoRevision;
  const match = await loadLineCatalog();
  if(revision !== infoRevision || $("#info").hidden) return;
  const identity = feature === original ? match?.(feature.geometry.coordinates) : null;
  // Trenes al día por el tramo (oferta.js): se añaden a la ficha cuando llegan los horarios.
  const finish = (kind,title,fields,o) => {
    showInfo(kind,title,fields,o);
    const rev = infoRevision;
    window.AtlasOffer?.forEdge(rendered.id).then(x => {
      if(!x || rev !== infoRevision || $("#info").hidden) return;
      showInfo(kind,title,{...fields,"Trenes un día laborable":x.by.map(([n,c])=>n+" "+c).join(" · ")+" ("+x.label+"; sin OUIGO, cuyo horario oficial no trae el recorrido)"},
        {...o,keepFocus:true,facts:[{value:number.format(x.trains),label:"trenes al día"},...o.facts].slice(0,3)});
    }).catch(e=>console.warn(e));
  };
  if(!identity) {
    finish("Tramo ferroviario", "Tramo ferroviario", base, opts);
    return;
  }
  const section = identity.sections[0];
  const endpoints = section.origin && section.destination ? section.origin+" – "+section.destination : null;
  const sharedValue = key => { const value = section[key]; return value && identity.sections.every(item => item[key] === value) ? value : null; };
  const axis = sharedValue("axis"), status = sharedValue("status");
  const corridors = AtlasCapas.corridorsForLine?.(identity.code) || [];
  const lineTitle = section.line_name || (identity.sections.length === 1 && endpoints) || "Línea "+identity.code;
  finish("Tramo ferroviario · línea "+identity.code, lineTitle, {
    ...(identity.sections.length === 1 && endpoints && {"Origen y destino":endpoints}),
    ...(corridors.length && {"Corredor de alta velocidad":corridors.join(" · ")}),
    ...(axis && {"Eje":axis}),
    ...(status && {"Estado de explotación":status}),
    ...base
  }, {...opts, subtitle:endpoints && endpoints!==lineTitle ? endpoints : opts.subtitle,
      chips:[...opts.chips,...corridors.map(name=>({label:"Corredor "+name}))]});
}
window.AtlasStationInfo=stationInfo;

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
  if(!map||!dataset)return;
  const zoom=map.getZoom(),enabled=$('[data-layer="stations"]').checked;
  // At z10 the point is only an invisible hit target; count visible symbols and
  // labels instead. Deduplicate tile fragments and icon/label pairs by station.
  const candidates=zoom<10?["stations"]:["station-badges","station-labels"];
  const layers=enabled?candidates.filter(id=>{
    const layer=map.getLayer(id);
    return layer&&map.getLayoutProperty(id,"visibility")!=="none"&&
      zoom>=(layer.minzoom??0)&&zoom<(layer.maxzoom??24);
  }):[];
  const stations=new Set(layers.length?map.queryRenderedFeatures({layers}).map(feature=>
    String(feature.properties?.CODIGO??feature.id??JSON.stringify(feature.geometry.coordinates))):[]);
  $("#station-count").textContent=number.format(stations.size);
}
function applyFilters() {
  const all=window.AtlasCapas?.current()==="all";
  filtered=all?peninsular:peninsular.filter(f=>Object.keys(filters).every(d=>!filters[d].length||filters[d].includes(f.properties["filter_"+d])));
  if(ready) {
    const clauses=Object.entries(filters).filter(([,values])=>values.length).map(([dimension,values])=>["in",AtlasFilters.expression(dimension),["literal",values]]);
    // «Todas las vías» dibuja la red completa: los filtros de «Ancho de vía» no se aplican.
    const expression=window.AtlasCapas?.current()==="all"?["==",["get","pen"],1]:["all",["==",["get","pen"],1],...clauses];
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

/* ── leyenda: refleja el tema y las capas activas ──
   Tarjeta compacta y plegable: colores del tema en columnas, estados en una fila, puntos
   (estación, puerto, aeropuerto) en otra y círculos de población anidados. Plegada queda en
   una línea con las muestras de color. Se pliega sola en pantallas compactas y, a 1100 px o
   menos, mientras el panel de capas está abierto; si el usuario la toca, manda su elección. */
let legendOpen=null,legendTouched=false;
const legendAuto=()=>!CFG.compact()&&!(innerWidth<=1100&&!$("#tools").hidden);
function syncTerrainLegend(){
  const body=$("#legend-body");if(!body)return;
  let note=body.querySelector('.legend-terrain');
  if(!terrainEnabled&&!terrainWarning){note?.remove();return;}
  if(!note){note=document.createElement('p');note.className='legend-terrain';body.append(note);}
  note.textContent=(terrainEnabled?'Relieve 3D · ':'')+terrainSummary.split('El terreno')[0].trim()+(terrainWarning?' Relieve incompleto; puedes usar 2D.':'');
  note.dataset.warning=terrainWarning?'1':'0';
}
function renderLegend() {
  const host=$("#legend");
  host.replaceChildren();
  if(!legendTouched)legendOpen=legendAuto();
  const toggle=document.createElement("button");
  toggle.type="button";toggle.className="legend-toggle";toggle.setAttribute("aria-expanded",String(legendOpen));toggle.setAttribute("aria-controls","legend-body");
  const label=document.createElement("span");label.className="legend-label";label.textContent="Leyenda";
  const preview=document.createElement("span");preview.className="legend-preview";preview.setAttribute("aria-hidden","true");
  toggle.append(label,preview);
  toggle.onclick=()=>{legendOpen=!legendOpen;legendTouched=true;renderLegend();};
  const legend=document.createElement("div");legend.id="legend-body";legend.hidden=!legendOpen;
  host.append(toggle,legend);
  const theme=window.AtlasCapas?.current()||"gauge";
  if(!window.AtlasCapas?.legend(legend)) {
    const items=theme==="gauge"
      ? ($('[data-layer="rail"]').checked?[...new Set(filtered.map(f=>AtlasFilters.value(f,"gauge")))].map(v=>AtlasCartography.style(v)):[])
      : AtlasThemes.legend();
    if(items.length){
      const h=document.createElement("strong");h.textContent=CFG.themes[theme]?.name||"Red ferroviaria";legend.append(h);
      const ul=document.createElement("ul");ul.className="legend-cols";
      for(const item of items.slice(0,12)){const li=document.createElement("li"),sw=document.createElement("i");sw.className="swatch";sw.style.setProperty("--c",item.color);li.append(sw,document.createTextNode(item.name));ul.append(li);}
      if(items.length>12){const li=document.createElement("li");li.className="legend-more";li.textContent="Y "+(items.length-12)+" más: selecciona líneas para acotar la leyenda.";ul.append(li);}
      legend.append(ul);
    }
  }
  // Puntos del mapa en una sola fila.
  const points=document.createElement("div");points.className="legend-points";
  if($('[data-layer="stations"]').checked){
    const p=document.createElement("p"),key=document.createElement("i");key.className="poi-key station";p.append(key,document.createTextNode("Estación Renfe"));points.append(p);
  }
  const pois=window.AtlasTransport?.legend();
  if(pois)points.append(...pois.children);
  if(points.childElementCount)legend.append(points);
  const sizes=window.AtlasPopulation?.legend();
  if(sizes)legend.append(sizes);
  syncTerrainLegend();
  for(const sw of [...legend.querySelectorAll(".legend-cols .swatch")].slice(0,6))preview.append(sw.cloneNode());
  if(legend.querySelector(".legend-sizes")){const dot=document.createElement("i");dot.className="legend-dot";preview.append(dot);}
  host.hidden=!legend.childElementCount;
  host.classList.toggle("collapsed",!legendOpen);
}
window.AtlasRenderLegend=()=>{if(dataset)renderLegend();};

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
  persistHash();
  savedQueries.push({name,view:readHash(),filters:JSON.parse(JSON.stringify(filters)),capas:window.AtlasCapas?.getState(),population:window.AtlasPopulation?.state()});
  try{localStorage.setItem("ferro_atlas_queries",JSON.stringify(savedQueries));renderSaved();$("#action-message").textContent="Consulta guardada en este navegador.";}
  catch{$("#action-message").textContent="El navegador no permite guardar consultas.";}
};
$("#saved-query").onchange=async function(){
  if(this.value===""||!ready||restoringView)return;
  const query=savedQueries[Number(this.value)];if(!query)return;
  if(!query.view){
    readFilters(query.filters);applyFilters();
    if(query.capas)await AtlasCapas.restore(query.capas);
    if(query.population)await AtlasPopulation.restore(query.population);
    return;
  }
  restoringView=true;this.disabled=true;
  try{
    const view=query.view;
    readFilters(view);applyFilters();
    await AtlasCapas.restore(view);
    await AtlasPopulation.restore(view.p||{on:false});
    await AtlasTransport.restore(view.tp||'');
    if(view.r)await window.AtlasRoute?.restore(view.r);else window.AtlasRoute?.reset();
    terrainController?.restoreState({exaggeration:1,shade:true,...window.AtlasViewState.terrain(view.tv)});
    setTerrain(view.m===1||view.m===true);
    for(const [id,value] of Object.entries(window.AtlasViewState.layers(view.l))){
      const input=document.querySelector('[data-layer="'+id+'"]');
      if(input){input.checked=value;input.onchange();}
    }
    await basemapController.set(window.AtlasBasemap.valid(view.b));
    const camera=window.AtlasViewState.camera(view.c);
    if(camera){map.stop();map.jumpTo({...camera,pitch:terrainEnabled?camera.pitch:0});}
    $("#action-message").textContent="Consulta restaurada con su encuadre, fondo y capas.";
  }catch(error){$("#action-message").textContent="No se pudo restaurar toda la consulta: "+error.message;}
  finally{restoringView=false;this.disabled=false;writeHash();renderLegend();}
};
$("#web-view").addEventListener("click",persistHash);
$("#web-view").addEventListener("auxclick",persistHash);
$("#cabina-link").addEventListener("click",persistHash);
$("#share").onclick=async()=>{
  persistHash();
  try{await navigator.clipboard.writeText(location.href);$("#action-message").textContent="Enlace copiado con el tema, los filtros, la cámara, el fondo, el relieve y las capas.";}
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
    const ids=checkbox.dataset.layer==="stations"?["stations","station-badges","station-labels"]:checkbox.dataset.layer==="rail"?["rail","rail-hit"]:[checkbox.dataset.layer];
    for(const id of ids)if(map.getLayer(id))map.setLayoutProperty(id,"visibility",checkbox.checked?"visible":"none");
    basemapController?.sync();
    applyFilters();
  };
}

/* ── carga ── */
const loadStarted=performance.now();
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
      "circle-radius":["interpolate",["linear"],["zoom"],7,2,9.9,4,10,9,13,12],"circle-color":"#fbfbfb","circle-stroke-color":"#273a5f","circle-stroke-width":1.3,
      // Desde el zoom 10 el punto cede el sitio al símbolo de estación y queda invisible como zona de clic.
      "circle-opacity":["step",["zoom"],1,10,0],"circle-stroke-opacity":["step",["zoom"],1,10,0],
      "circle-pitch-alignment":"viewport","circle-pitch-scale":"viewport"}});
    AtlasStationSymbol.add(map).then(()=>{
      if(!map.hasImage("station-symbol")){
        map.setPaintProperty("stations","circle-opacity",1);map.setPaintProperty("stations","circle-stroke-opacity",1);
        return;
      }
      if(map.getLayer("station-badges"))return;map.addLayer({id:"station-badges",type:"symbol",source:"stations",minzoom:10,layout:{
      "icon-image":"station-symbol","icon-size":["interpolate",["linear"],["zoom"],10,.62,13,.85,16,1],"icon-allow-overlap":true,"icon-pitch-alignment":"viewport",
      visibility:$('[data-layer="stations"]').checked?"visible":"none"}},"station-labels");});
    const badge=document.createElement('canvas');badge.width=badge.height=32;const badgeContext=badge.getContext('2d');badgeContext.fillStyle='#fbfbfb';badgeContext.strokeStyle='#b9c5d6';badgeContext.lineWidth=1;badgeContext.beginPath();badgeContext.roundRect(1,1,30,30,5);badgeContext.fill();badgeContext.stroke();map.addImage('station-badge',badgeContext.getImageData(0,0,32,32),{stretchX:[[8,24]],stretchY:[[8,24]],content:[5,5,27,27],pixelRatio:2});
    map.addLayer({id:"station-labels",type:"symbol",source:"stations",minzoom:10,layout:{
      "icon-image":"station-badge","icon-text-fit":"both","icon-text-fit-padding":[4,6,4,6],"text-field":["get","DESCRIPCION"],"text-font":["Noto Sans Regular"],"text-size":12,
      "text-variable-anchor":["top","bottom","left","right"],"text-radial-offset":1.35,"text-padding":4},
      paint:{"text-color":"#273a5f","text-halo-color":"#fbfbfb","text-halo-width":2}});
    // Prioridad de selección: paradas del tema > estaciones > líneas del tema > tramo IGN > población.
    const themeHit = point => { const layers=[...AtlasCapas.hitLayers(),"theme-hit","urban-stations"].filter(id=>map.getLayer(id)&&map.getLayoutProperty(id,"visibility")!=="none");
      const box=[[point.x-6,point.y-6],[point.x+6,point.y+6]]; return layers.length && map.queryRenderedFeatures(box,{layers}).length; };
    map.on("click","stations",e=>{ if(window.AtlasTransport?.hit(e.point))return; if(map.getLayer("cx-stops")&&map.queryRenderedFeatures(e.point,{layers:["cx-stops"]}).length)return; stationInfo(e.features[0]); });
    map.on("click","rail-hit",e=>{
      if(window.AtlasTransport?.hit(e.point)||themeHit(e.point) || map.queryRenderedFeatures(e.point,{layers:["stations"]}).length)return;
      // Con Población activa, el círculo tiene prioridad sobre el tramo IGN de fondo.
      if(map.getLayer("population-circles")&&map.getLayoutProperty("population-circles","visibility")!=="none"&&map.queryRenderedFeatures(e.point,{layers:["population-circles"]}).length)return;
      sectionInfo(e.features[0], e.lngLat);
    });
    for(const id of ["rail-hit","stations"]){
      map.on("mouseenter",id,()=>map.getCanvas().style.cursor="pointer");
      map.on("mouseleave",id,()=>map.getCanvas().style.cursor="");
    }
    basemapController=window.AtlasBasemap.create(map,{select:$("#basemap-select"),note:$("#basemap-note"),retry:$("#basemap-fallback"),onChange:mode=>{if(mode==='simple'){failedMapSources.delete('basemap-openmaptiles');updateMapStatus();}writeHash();}});
    ready=true;
    AtlasThemes.init({map,dataset,showInfo,onChange:()=>{renderLegend();writeHash();},onLegend:()=>renderLegend()});
    AtlasCapas.init({map,dataset,showInfo,legacy:AtlasThemes,onChange:()=>applyFilters()});
    AtlasPopulation.init({map,showInfo,onChange:()=>{renderLegend();writeHash();}});
    AtlasTransport.init({map,dataset,showInfo,onChange:()=>{renderLegend();writeHash();}});
    window.AtlasRoute?.init({map,dataset,showInfo,onChange:writeHash,openStation:stationInfo});
    applyFilters();
    map.on("moveend",updateStationCount);
    map.on("idle",updateStationCount);
    terrainController=window.AtlasTerrain?.create(map,{container:$("#terrain-controls"),onToggle:enabled=>{
      terrainEnabled=enabled;$("#mode").setAttribute("aria-pressed",String(enabled));$("#flat").setAttribute("aria-pressed",String(!enabled));syncTerrainLegend();writeHash();
    },onChange:writeHash,onSummary:(text,warning)=>{
      terrainSummary=text;terrainWarning=warning;syncTerrainLegend();
      if(ready&&!statusText.dataset.warning)statusText.textContent=baseStatus();
    },padding,getSelection:()=>dataset.rail.features.find(f=>f.id===selectedId)});
    map.on("moveend",writeHash);
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
    if(hash.tp)await AtlasTransport.restore(hash.tp);
    terrainController?.restoreState(window.AtlasViewState.terrain(hash.tv));
    if(hash.m===1||hash.m===true)setTerrain(true);
    if(hash.r)await window.AtlasRoute?.restore(hash.r);
    for(const [id,value] of Object.entries(window.AtlasViewState.layers(hash.l))){
      const input=document.querySelector('[data-layer="'+id+'"]');
      if(input){input.checked=value;input.onchange();}
    }
    await basemapController.set(window.AtlasBasemap.valid(hash.b));
    // La ficha de ruta puede mover la cámara; el encuadre explícito del enlace tiene prioridad.
    const camera=window.AtlasViewState.camera(hash.c);
    if(camera){map.stop();map.jumpTo({...camera,pitch:terrainEnabled?camera.pitch:0});}
    restoringView=false;writeHash();
    document.querySelector("#map").dataset.readyMs=String(Math.round(performance.now()-loadStarted));
    renderLegend();finishLoading();
  } catch(error) {
    console.error(error);loading.textContent="Error al preparar el mapa: "+error.message;
  }
});
dataPromise.catch(error=>{loading.textContent=error.message+". Recarga la página para reintentarlo.";});
