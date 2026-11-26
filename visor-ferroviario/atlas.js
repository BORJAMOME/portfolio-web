"use strict";
const CFG = window.AtlasConfig;
const statusText = document.querySelector("#status");
const loading = document.querySelector("#loading");
const number = new Intl.NumberFormat("es-ES");
const filters = {gauge:[], electric:[], tracks:[]};
const UNKNOWN_GAUGE=["in",["coalesce",["get","filter_gauge"],"unknown"],["literal",["unknown","pending","notApplicable"]]];
const dimensions = {gauge:"Ancho de vía", electric:"Electrificación", tracks:"Número de vías"};
const bounds = CFG.bounds;
const padding = () => CFG.compact() ? {top:20,bottom:20,left:20,right:20} : {top:30,bottom:40,left:document.querySelector("#tools")?.hidden?40:(document.querySelector("#tools")?.offsetWidth||340)+24,right:40};
let dataset = null;
let peninsular = [];
let filtered = [];
let ready = false;
let selectedId = null;
let selectedStation = null;
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
  const state = {...filters, ...(window.AtlasCapas?.getState() || {}), p: window.AtlasPopulation?.state(), tp: window.AtlasTransport?.state(), d: window.AtlasDemography?.state(), ix: window.AtlasInfrastructure?.state(), r: window.AtlasRoute?.state(), m: terrainEnabled ? 1 : undefined,
    b:basemapController&&basemapController.state()!=='simple'?basemapController.state():undefined,
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
/* Etiquetas de lo que está filtrando el mapa, con su botón para quitarlo. Solo lo que se aparta de la
   vista por defecto: el tema elegido se muestra como contexto, sin botón (siempre hay uno). */
function activeChips(){
  const chips=[],CAP=window.AtlasCapas,state=CAP?.getState?.()||{};
  const theme=state.t,themeName=CFG.themes[theme]?.name;
  if(themeName)chips.push({label:themeName,kind:"theme",title:"Tema de las vías",open:()=>document.querySelector('#rail [data-cat="vias"]')?.click()});
  const lists={corridors:CFG.corridors,brands:CFG.brands,services:CFG.services,tourism:CFG.tourism};
  if(lists[theme]&&typeof state.k==="string"){
    const all=lists[theme].map(x=>x.id),keys=state.k?state.k.split(","):[];
    if(keys.length<all.length)chips.push({label:(keys.length?lists[theme].filter(x=>keys.includes(x.id)).map(x=>x.name.split(" · ")[0]).join(", "):"Ninguno seleccionado"),
      title:"Selección del tema",remove:async()=>{await CAP.restore({...CAP.getState(),k:all.join(",")});applyFilters();renderLegend();writeHash();}});
  }
  if(theme==="corridors"&&typeof state.st==="string"){
    const all=Object.keys(CFG.status),st=state.st?state.st.split(","):[];
    if(st.length<all.length)chips.push({label:"Estado: "+(st.map(x=>CFG.status[x]?.name.toLowerCase()).join(", ")||"ninguno"),title:"Estado de la infraestructura",
      remove:async()=>{await CAP.restore({...CAP.getState(),st:all.join(",")});applyFilters();renderLegend();writeHash();}});
  }
  const names={gauge:"Ancho",electric:"Electrificación",tracks:"Vías"};
  for(const [dimension,values] of Object.entries(filters))for(const value of values)
    chips.push({label:names[dimension]+": "+label(dimension,value),title:"Filtro de vías",remove:()=>{filters[dimension]=filters[dimension].filter(v=>v!==value);renderFacets();applyFilters();}});
  for(const input of document.querySelectorAll('#tools .cat[data-cat]:not([data-cat="vias"]) input[role=switch][id]:checked')){
    const name=input.closest(".layer")?.querySelector(".layer-name")?.textContent.trim();
    if(name)chips.push({label:name,title:"Capa",remove:()=>{input.checked=false;input.dispatchEvent(new Event("change",{bubbles:true}));}});
  }
  const base=basemapController?.state();
  if(base&&base!=="simple")chips.push({label:"Fondo "+window.AtlasBasemap.label(base),title:"Mapa base",remove:()=>basemapController.set("simple")});
  if(terrainEnabled)chips.push({label:"Inclinado con relieve",title:"Vista del mapa",remove:()=>setTerrain(false)});
  return chips;
}
function renderChips(){
  const host=$("#active-chips");if(!host||!ready)return;
  const chips=activeChips(),ul=host.querySelector("ul");ul.replaceChildren();
  for(const chip of chips){
    const li=document.createElement("li");li.className="chip"+(chip.kind?" chip-"+chip.kind:"");
    if(chip.open){const b=document.createElement("button");b.type="button";b.className="chip-label";b.textContent=chip.label;b.title=chip.title+": cambiar";b.onclick=chip.open;li.append(b);}
    else{const span=document.createElement("span");span.className="chip-label";span.textContent=chip.label;span.title=chip.title;li.append(span);}
    if(chip.remove){const x=document.createElement("button");x.type="button";x.className="chip-remove";x.setAttribute("aria-label","Quitar "+chip.label);x.textContent="×";
      x.onclick=async()=>{await chip.remove();renderChips();const next=$("#active-chips:not([hidden]) .chip-remove")||$("#map");next.focus({preventScroll:true});};li.append(x);}
    ul.append(li);
  }
  const removable=chips.filter(c=>c.remove);
  if(removable.length>1){const li=document.createElement("li"),b=document.createElement("button");b.type="button";b.className="chip-clear";b.textContent="Quitar todo";
    b.onclick=async()=>{for(const c of removable)await c.remove();renderChips();};li.append(b);ul.append(li);}
  host.hidden=!removable.length;
}
function writeHash() {
  window.AtlasPanel?.sync();renderChips();
  clearTimeout(hashTimer);
  if(!ready||restoringView)return;
  hashTimer = setTimeout(persistHash,150);
}
try { savedQueries = JSON.parse(localStorage.getItem("ferro_atlas_queries") || "[]"); if(!Array.isArray(savedQueries))savedQueries=[]; } catch {}

function label(dimension, value) {
  if(dimension === "gauge" && value === "unknown") return "Sin determinar";
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
      layers:[{id:"background",type:"background",paint:{"background-color":"#FBFBFB"}}]}
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
    if(basemapController?.ignores(event.sourceId))return;
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
function toast(text){const t=$("#toast");if(!t)return;t.textContent=text;t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{t.hidden=true;},4200);}
$("#explorer").onclick=()=>{
  if(!ready||!terrainController)return;
  const opened=terrainController.openExplorer({center:map.getCenter().toArray(),station:selectedStation});
  if(opened&&!opened.inside)toast("El explorador 3D cubre seis paisajes de montaña. Se abre el más cercano: "+opened.name+".");
};
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
  infoRevision++;markStation(null);
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
  if(window.AtlasTerrainScene?.isOpen())return;
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
// Nombres del catálogo en mayúsculas → forma de rótulo («MADRID-PRÍNCIPE PÍO» → «Madrid-Príncipe Pío»).
function stationLabel(name){
  name=String(name||"");if(name!==name.toLocaleUpperCase("es"))return name;
  return name.toLocaleLowerCase("es").replace(/(^|[\s\-/(.])\p{L}/gu,w=>w.toLocaleUpperCase("es"))
    .replace(/\s(De|Del|La|Las|Los|El|Y|En)\s/g,w=>w.toLocaleLowerCase("es"));
}
function markStation(feature){
  selectedStation=feature||null;
  map?.getSource("station-selected")?.setData({type:"FeatureCollection",features:feature?[{type:"Feature",geometry:feature.geometry,properties:{}}]:[]});
}
async function stationInfo(feature) {
  markStation(feature);
  const revision=++infoRevision;
  const p=feature.properties;
  // La ficha de estación muestra los servicios con parada acreditada, sea cual sea el tema activo.
  try{await Promise.all([AtlasCapas.loadServices(),AtlasThemes.prepareConnections(),AtlasTransport.load()]);}catch{}
  if(revision!==infoRevision)return;
  if(AtlasCapas.hasStation(p.CODIGO)){AtlasCapas.stationInfo(AtlasCapas.hasStation(p.CODIGO));return;}
  // Estación sin rutas trazadas en el atlas (sobre todo Cercanías de ancho ibérico): sus trenes salen de
  // capas/estaciones-oferta.json (oferta.js), que incluye todos los operadores y núcleos.
  const fields={
    "Dirección":p.DIRECION,
    "Rutas en el mapa":"Ninguna: el atlas solo traza los recorridos de alta velocidad, larga y media distancia, Cercanías de ancho métrico y OUIGO.",
    "Ubicación":p.gtfs?"Coordenadas de los horarios publicados (GTFS): la estación no figura en el catálogo de estaciones de Renfe.":undefined,
    "Conexiones con otros transportes":connections(feature.geometry.coordinates)
  },opts={subtitle:[p.POBLACION,p.PROVINCIA].filter(Boolean).join(" · ")};
  showInfo("Estación Renfe",p.DESCRIPCION,fields,opts);
  const shown=infoRevision;
  window.AtlasOffer?.forStationCode(p.CODIGO).then(o=>{
    if(infoRevision!==shown)return;
    if(o)showInfo("Estación Renfe",p.DESCRIPCION,fields,{...opts,facts:o.facts,extra:o.block,keepFocus:true});
    else showInfo("Estación Renfe",p.DESCRIPCION,{...fields,"Servicios con parada":"Ningún tren de viajeros con horario público para aquí en la semana de referencia."},{...opts,keepFocus:true});
  }).catch(e=>console.warn(e));
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
    // «de la línea»: el IGN no da el dato del tramo y se toma el de su línea de Adif (capas/lineas-adif.json).
    (()=>{const g=AtlasFilters.value(feature,"gauge"),src=p.gauge_fix?GAUGE_SOURCE[p.gauge_src]||"":p.fill_g?"de la línea":"";
      return {value:/^d+$/.test(g)?number.format(Number(g))+" mm":g==="mixed"?"Mixto":label("gauge",g),label:"ancho de vía"+(src?" · "+src:"")};})(),
    ...(tracks!=="unknown"?[{value:tracks==="1"?"Única":tracks==="2"?"Doble":tracks+" vías",label:"vía"}]:[]),
    ...(electric!=="unknown"?[{value:electric==="yes"?"Sí":"No",label:"electrificada"+(p.fill_e?" · de la línea":"")}]:[])
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
  // Grosor «por trenes al día»: universo más amplio que «Trenes un día laborable» (incluye iryo y Cercanías de ancho ibérico).
  const flow=AtlasCapas.width?.()==="traffic"?AtlasCapas.trafficOn?.(rendered.id):null;
  if(flow)base["Grosor en el mapa"]=number.format(flow.total)+" trenes de viajeros en día laborable, los dos sentidos. Incluye iryo y Cercanías de ancho ibérico, que no salen en «Trenes un día laborable»";
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
    ...adifLineFields(adifLines?.[identity.code]),
    ...base
  }, {...opts, subtitle:endpoints && endpoints!==lineTitle ? endpoints : opts.subtitle,
      chips:[...opts.chips,...corridors.map(name=>({label:"Corredor "+name}))]});
}
window.AtlasStationInfo=stationInfo;
/* Atributos de la línea entera según Adif (vía la capa del Atlas Estratégico de España). Son de la línea,
   no del tramo seleccionado: la velocidad es la de DISEÑO, no la comercial, y el 0 que declara Adif no se muestra. */
function adifLineFields(l){
  if(!l)return {};
  const electrification={total:"Toda la línea",ninguna:"Ninguna",parcial:l.tramos_electrificados&&l.n_tramos?"Parcial · "+l.tramos_electrificados+" de "+l.n_tramos+" tramos de Adif":"Parcial"}[l.electrificacion];
  return {
    "Velocidad de diseño de la línea":l.velocidad_diseno_kmh>0?number.format(l.velocidad_diseno_kmh)+" km/h · no es la velocidad comercial":undefined,
    "Uso de la línea":l.uso?{viajeros:"Viajeros",mercancías:"Mercancías",mixto:"Mixto: viajeros y mercancías"}[l.uso]||l.uso:undefined,
    "Electrificación de la línea":electrification,
    "Longitud de la línea":l.longitud_medida_km?number.format(l.longitud_medida_km)+" km · medida sobre el trazado":undefined
  };
}

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
    map.setFilter("rail",expression);map.setFilter("rail-hit",expression);for(const id of ["rail-casing","rail-state"])if(map.getLayer(id))map.setFilter(id,expression);
    if(map.getLayer("rail-double"))map.setFilter("rail-double",["all",expression,["in",["get","filter_tracks"],["literal",["2","4"]]]]);
    if(map.getLayer("rail-electric"))map.setFilter("rail-electric",["all",expression,["==",["get","filter_electric"],"yes"]]);if(map.getLayer("rail-unknown"))map.setFilter("rail-unknown",["all",expression,UNKNOWN_GAUGE]);
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
      ? ($('[data-layer="rail"]').checked?["1668","1435","1000","mixed","other","unknown"].filter(v=>filtered.some(f=>AtlasFilters.value(f,"gauge")===v)).map(v=>AtlasCartography.style(v)):[])
      : AtlasThemes.legend();
    if(items.length){
      const h=document.createElement("strong");h.textContent=CFG.themes[theme]?.name||"Red ferroviaria";legend.append(h);
      const ul=document.createElement("ul");ul.className="legend-cols";
      for(const item of items.slice(0,12)){const li=document.createElement("li"),sw=document.createElement("i");sw.className="swatch"+(theme==="gauge"&&item===AtlasCartography.style("unknown")?" dashed":"");sw.style.setProperty("--c",item.color);li.append(sw,document.createTextNode(item.name));ul.append(li);}
      if(items.length>12){const li=document.createElement("li");li.className="legend-more";li.textContent="Y "+(items.length-12)+" más: selecciona líneas para acotar la leyenda.";ul.append(li);}
      legend.append(ul);
    }
  }
  window.AtlasCapas?.trafficLegend?.(legend);
  // Puntos del mapa en una sola fila.
  const points=document.createElement("div");points.className="legend-points";
  if($('[data-layer="stations"]').checked){
    const p=document.createElement("p"),key=document.createElement("i");key.className="poi-key station";p.append(key,document.createTextNode("Estación Renfe"));points.append(p);
  }
  const pois=window.AtlasTransport?.legend();
  if(pois)points.append(...pois.children);
  if(points.childElementCount)legend.append(points);
  const demography=window.AtlasDemography?.legend();if(demography)legend.append(demography);
  const infrastructure=window.AtlasInfrastructure?.legendItems()||[];
  for(const item of infrastructure){const row=document.createElement("div"),sw=document.createElement("i");row.className="infrastructure-legend";sw.className="demo-swatch";sw.style.background=item.color;row.append(sw,document.createTextNode(item.name));legend.append(row);}
  const sizes=window.AtlasPopulation?.legend();
  if(sizes)legend.append(sizes);
  if(basemapController?.state()==="pnoa"){const p=document.createElement("p");p.className="legend-note";p.textContent="Fondo: vista aérea PNOA Máxima Actualidad (IGN). Las vías llevan contorno claro para leerse sobre la imagen.";legend.append(p);}
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
    await window.AtlasDemography?.restore(view.d);
    await window.AtlasInfrastructure?.restore(view.ix);
    if(view.r)await window.AtlasRoute?.restore(view.r);else window.AtlasRoute?.reset();
    terrainController?.restoreState({exaggeration:1,shade:true,lighting:'day',reliefStyle:'soft',strength:0.45,palette:'cartographic',...window.AtlasViewState.terrain(view.tv)});
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
    const ids=checkbox.dataset.layer==="stations"?["stations","station-badges","station-labels"]:checkbox.dataset.layer==="rail"?["rail","rail-hit","rail-double","rail-electric"]:[checkbox.dataset.layer];
    for(const id of ids)if(map.getLayer(id))map.setLayoutProperty(id,"visibility",checkbox.checked?"visible":"none");
    if(checkbox.dataset.layer==="rail")window.AtlasCapas?.railStyle?.();
    basemapController?.sync();
    applyFilters();
  };
}

/* ── carga ── */
const loadStarted=performance.now();
const dataPromise=fetch("datos.json").then(r=>{if(!r.ok)throw new Error("No se ha podido cargar datos.json ("+r.status+")");return r.json();});
// Ancho completado (Adif, IGN mixto, red métrica, topología). Si falta, el visor sigue con el ancho del IGN.
const gaugePromise=fetch("capas/ancho.json").then(r=>r.ok?r.json():null).catch(()=>null);
const GAUGE_SOURCE={adif:"según Adif",ign:"IGN (mixto)",net:"inferido: red métrica",topo:"inferido por la red",none:""};
function applyGauge(features,gauge){
  if(!gauge?.groups)return;
  const fix=new Map();
  for(const [key,ids] of Object.entries(gauge.groups)){const [value,src]=key.split("|");if(value==="unknown")continue;for(const id of ids)fix.set("FFCC_TR"+id,[value,src]);}
  for(const f of features){const x=fix.get(f.properties.id);if(x){f.properties.gauge_fix=x[0];f.properties.gauge_src=x[1];}}
}
// Opcional: sin este archivo el visor funciona igual, solo sin los atributos de línea de Adif.
const adifPromise=fetch("capas/lineas-adif.json").then(r=>r.ok?r.json():null).catch(()=>null);
let adifLines=null;
/* Tramos IGN de Adif sin electrificación o ancho: se completan con el valor de su línea cuando es uniforme
   (regla y recuento en tools/visor-atlas-adif.mjs). Se marcan con fill_e / fill_g para decirlo en la ficha. */
function fillFromLine(p,relleno){
  const r=relleno?.[p.id];if(!r)return;
  if("e" in r&&(p.electrified===null||p.electrified===undefined)){p.electrified=r.e===1;p.fill_e=1;}
  if("g" in r&&!(p.nominalgauge>0)){p.nominalgauge=r.g;p.fill_g=1;}
}
if(map)map.on("load",async()=>{
  try {
    dataset=await dataPromise;
    applyGauge(dataset.rail.features,await gaugePromise);
    const adif=await adifPromise;adifLines=adif?.lineas||null;
    for(const f of dataset.rail.features){fillFromLine(f.properties,adif?.relleno);AtlasFilters.prepare(f);f.properties.pen=CFG.peninsular(f.geometry.coordinates[0])?1:0;}
    peninsular=dataset.rail.features.filter(f=>f.properties.pen);
    dataset.stations.features=dataset.stations.features.filter(f=>CFG.peninsular(f.geometry.coordinates));
    map.addSource("land",{type:"geojson",data:dataset.boundary});
    map.addLayer({id:"land",type:"fill",source:"land",paint:{"fill-color":"#f5f7fa"}});
    map.addSource("topography",{type:"raster",tileSize:256,
      tiles:["https://www.ign.es/wms-inspire/mapa-raster?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=mtn_rasterizado&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256"],
      bounds:[-9.6,35.9,4.5,44.2],attribution:'© <a href="https://www.ign.es/">IGN</a> · CC BY 4.0'});
    map.addLayer({id:"topography",type:"raster",source:"topography",layout:{visibility:"none"},paint:{"raster-saturation":-1,"raster-opacity":.45}});
    const rings=dataset.boundary.type==="Polygon"?[dataset.boundary.coordinates]:dataset.boundary.coordinates;
    map.addSource("outside",{type:"geojson",data:{type:"Feature",properties:{},geometry:{type:"Polygon",coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]],...rings.map(poly=>poly[0])]}}});
    // Fuera de España todo es #FBFBFB, con cualquier fondo, sombreado o color del terreno (basemap.js no la oculta):
    // la máscara va por encima de todos ellos y un contorno fino dibuja la costa y la frontera.
    map.addLayer({id:"outside",type:"fill",source:"outside",paint:{"fill-color":"#FBFBFB"}});
    map.addLayer({id:"outside-edge",type:"line",source:"land",layout:{"line-join":"round"},paint:{"line-color":"#b9c5d6","line-width":["interpolate",["linear"],["zoom"],5,.6,10,1.1]}});
    map.addSource("regions",{type:"geojson",data:dataset.regions,attribution:'Límites © EuroGeographics · Eurostat/GISCO 2021'});
    map.addLayer({id:"region-lines",type:"line",source:"regions",paint:{"line-color":"#b9c5d6","line-width":.7,"line-dasharray":[3,3]}});
    if(!window.IGN_TERRAIN_MANIFEST?.tiles?.length){
      map.addSource("terrain",{type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],encoding:"terrarium",tileSize:256,maxzoom:15,
        attribution:'Relieve <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">Mapzen y colaboradores</a>'});
      map.addLayer({id:"hillshade",type:"hillshade",source:"terrain",maxzoom:14,paint:{"hillshade-exaggeration":.2,"hillshade-shadow-color":"#526a8e","hillshade-highlight-color":"#fbfbfb"}},"outside");
    }
    map.addSource("rail",{type:"geojson",data:dataset.rail,tolerance:.2,attribution:'Obra derivada IGR-RT · IGN/SCNE · CC BY 4.0 · Atributos de línea: Adif vía <a href="https://atlas.eltercioviejo.com/ficha/ferrocarril/">Atlas Estratégico de España</a> · CC BY 4.0'});
    window.AtlasBaseRailColor=["case",["boolean",["feature-state","selected"],false],"#101e36",
      ["match",AtlasFilters.expression("gauge"),...Object.entries(AtlasCartography.styles).flatMap(([key,value])=>[key,value.color]),"#76542C"]];
    // Jerarquía de la red: contorno claro (separa la vía del relieve, la ortofoto y los rellenos),
    // halo de estado (puntero y selección) y trazo. El ancho y el color los fija el tema (capas.js).
    map.addLayer({id:"rail-casing",type:"line",source:"rail",filter:["==",["get","pen"],1],minzoom:6,layout:{"line-join":"round","line-cap":"round"},paint:{
      "line-color":"#fbfbfb","line-width":["interpolate",["linear"],["zoom"],6,1.8,9,3.4,12,5.6,16,8],"line-opacity":["interpolate",["linear"],["zoom"],6,0,8,.8]}});
    map.addLayer({id:"rail-state",type:"line",source:"rail",filter:["==",["get","pen"],1],layout:{"line-join":"round","line-cap":"round"},paint:{
      "line-color":["case",["boolean",["feature-state","selected"],false],"#101e36","#273a5f"],
      "line-width":["interpolate",["linear"],["zoom"],5,6,12,11,16,15],"line-blur":1.5,
      "line-opacity":["case",["boolean",["feature-state","selected"],false],.3,["boolean",["feature-state","hover"],false],.22,0]}});
    map.addLayer({id:"rail",type:"line",source:"rail",filter:["==",["get","pen"],1],layout:{"line-join":"round","line-cap":"round"},paint:{
      "line-color":window.AtlasBaseRailColor,"line-width":["interpolate",["linear"],["zoom"],5,.9,8,1.5,12,2.8,16,4],"line-opacity":.95}});
    // Simbología por escala (el color lo fija el tema en capas.js · applyRailStyle):
    // desde z10 la vía doble son dos trazos paralelos (line-gap-width) y desde z11 la electrificada lleva marcas
    // transversales (guiones muy cortos sobre un trazo ancho), como los postes de la catenaria.
    const DOUBLE_TRACK=["in",["get","filter_tracks"],["literal",["2","4"]]];
    map.addLayer({id:"rail-double",type:"line",source:"rail",minzoom:10,filter:["all",["==",["get","pen"],1],DOUBLE_TRACK],layout:{"line-join":"round"},paint:{
      "line-color":window.AtlasBaseRailColor,"line-width":["interpolate",["linear"],["zoom"],10,.9,13,1.2,16,1.8],"line-gap-width":["interpolate",["linear"],["zoom"],10,1.4,13,2.6,16,4.5],"line-opacity":.95}});
    map.addLayer({id:"rail-electric",type:"line",source:"rail",minzoom:11,filter:["all",["==",["get","pen"],1],["==",["get","filter_electric"],"yes"]],layout:{visibility:"none"},paint:{
      "line-color":window.AtlasBaseRailColor,"line-width":["interpolate",["linear"],["zoom"],11,5.5,14,8,16,11],"line-dasharray":[.16,4.5],"line-opacity":["interpolate",["linear"],["zoom"],11,0,11.6,.85]}});
    // Ancho desconocido: guiones claros sobre el trazo gris (MapLibre 5.24 no admite line-dasharray por dato).
    map.addLayer({id:"rail-unknown",type:"line",source:"rail",minzoom:7,filter:["all",["==",["get","pen"],1],UNKNOWN_GAUGE],layout:{visibility:"none"},paint:{
      "line-color":"#fbfbfb","line-width":["interpolate",["linear"],["zoom"],7,.7,12,1.4,16,2],"line-dasharray":[1.2,1.8]}});
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
    for(const f of dataset.stations.features)f.properties.label=stationLabel(f.properties.DESCRIPCION);
    map.addSource("stations",{type:"geojson",data:dataset.stations,attribution:'Origen de los datos: Renfe Operadora · CC BY 4.0'});
    // Jerarquía de estaciones por trenes en día laborable (capas/estaciones-oferta.json): a escala regional
    // solo las relevantes; al acercarse, todas. Sin dato de oferta, la estación cuenta como poco servida.
    const trains=["coalesce",["get","trains"],0];
    map.addLayer({id:"stations",type:"circle",source:"stations",minzoom:7,filter:[">=",trains,["step",["zoom"],120,8,40,9,8,10,0]],paint:{
      "circle-radius":["interpolate",["linear"],["zoom"],7,["step",trains,2,120,3.2],9.9,["step",trains,3.4,40,4.4],10,9,13,12],"circle-color":"#fbfbfb","circle-stroke-color":"#273a5f","circle-stroke-width":["interpolate",["linear"],["zoom"],7,1.1,10,1.4],
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
    // Rótulos (los filtros con zoom se evalúan en niveles enteros): desde z8 las estaciones con más trenes; las demás entran al acercarse y ceden el sitio
    // por prioridad (symbol-sort-key) en vez de solaparse.
    map.addLayer({id:"station-labels",type:"symbol",source:"stations",minzoom:8,filter:[">=",trains,["step",["zoom"],150,10,40,11,0]],layout:{
      "icon-image":"station-badge","icon-text-fit":"both","icon-text-fit-padding":[3,6,3,6],"text-field":["coalesce",["get","label"],["get","DESCRIPCION"]],"text-font":["Noto Sans Regular"],
      "text-size":["interpolate",["linear"],["zoom"],8,11,12,12.5],"symbol-sort-key":["-",0,trains],"text-max-width":9,
      "text-variable-anchor":["top","bottom","left","right"],"text-radial-offset":["interpolate",["linear"],["zoom"],8,.8,10,1.35],"text-padding":6},
      paint:{"text-color":"#1d2638","text-halo-color":"#fbfbfb","text-halo-width":1.5}});
    map.addSource("station-selected",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
    map.addLayer({id:"station-selected",type:"circle",source:"station-selected",paint:{"circle-radius":["interpolate",["linear"],["zoom"],6,7,10,13,14,17],"circle-color":"rgba(0,0,0,0)",
      "circle-stroke-color":"#101e36","circle-stroke-width":2.5,"circle-pitch-alignment":"viewport"}});
    // Prioridad de selección: paradas del tema > estaciones > líneas del tema > tramo IGN > población.
    const themeHit = point => { const layers=[...AtlasCapas.hitLayers(),"theme-hit","urban-stations"].filter(id=>map.getLayer(id)&&map.getLayoutProperty(id,"visibility")!=="none");
      const box=[[point.x-6,point.y-6],[point.x+6,point.y+6]]; return layers.length && map.queryRenderedFeatures(box,{layers}).length; };
    map.on("click","stations",e=>{ if(window.AtlasInfrastructure?.hit(e.point)||window.AtlasTransport?.hit(e.point))return; if(map.getLayer("cx-stops")&&map.queryRenderedFeatures(e.point,{layers:["cx-stops"]}).length)return; stationInfo(e.features[0]); });
    // Estaciones con trenes que no están en el catálogo de Renfe (sobre todo Cercanías de ancho ibérico: Sol,
    // Majadahonda, Hernani…): se añaden con las coordenadas de los GTFS (capas/estaciones-oferta.json) para que tengan ficha.
    window.AtlasOffer?.loadStations().then(({F,byCode})=>{
      for(const f of dataset.stations.features){const ficha=byCode.get(String(f.properties.CODIGO));if(ficha)f.properties.trains=ficha[1];}
      const known=new Set(dataset.stations.features.map(f=>String(f.properties.CODIGO))),served=new Set(F.fichas.map(f=>f[0]));
      const extra=F.estaciones.filter(([code,,lon,lat],i)=>served.has(i)&&lon!==null&&!known.has(String(code))&&CFG.peninsular([lon,lat]))
        .map(([code,name,lon,lat])=>({type:"Feature",geometry:{type:"Point",coordinates:[lon,lat]},properties:{CODIGO:code,DESCRIPCION:name,label:stationLabel(name),gtfs:1,trains:byCode.get(String(code))?.[1]}}));
      if(!extra.length){map.getSource("stations")?.setData(dataset.stations);return;}
      dataset.stations.features.push(...extra);map.getSource("stations")?.setData(dataset.stations);
    }).catch(e=>console.warn(e));
    map.on("click","rail-hit",e=>{
      if(window.AtlasInfrastructure?.hit(e.point)||window.AtlasTransport?.hit(e.point)||themeHit(e.point) || map.queryRenderedFeatures(e.point,{layers:["stations"]}).length)return;
      // Con Población activa, el círculo tiene prioridad sobre el tramo IGN de fondo.
      if(map.getLayer("population-circles")&&map.getLayoutProperty("population-circles","visibility")!=="none"&&map.queryRenderedFeatures(e.point,{layers:["population-circles"]}).length)return;
      sectionInfo(e.features[0], e.lngLat);
    });
    let hoverId=null;
    const setHover=id=>{if(hoverId===id)return;if(hoverId!==null)map.setFeatureState({source:"rail",id:hoverId},{hover:false});hoverId=id;if(id!==null)map.setFeatureState({source:"rail",id},{hover:true});};
    map.on("mousemove","rail-hit",e=>setHover(e.features[0]?.id??null));
    map.on("mouseleave","rail-hit",()=>setHover(null));
    for(const id of ["rail-hit","stations"]){
      map.on("mouseenter",id,()=>map.getCanvas().style.cursor="pointer");
      map.on("mouseleave",id,()=>map.getCanvas().style.cursor="");
    }
    basemapController=window.AtlasBasemap.create(map,{select:$("#basemap-select"),note:$("#basemap-note"),retry:$("#basemap-fallback"),onChange:()=>{for(const id of failedMapSources)if(basemapController.ignores(id))failedMapSources.delete(id);updateMapStatus();terrainController?.refresh?.();renderLegend();writeHash();}});
    // Botón de estilos justo debajo del zoom (mismo rincón, añadido después).
    map.addControl(window.AtlasBasemap.control(basemapController),"top-right");
    ready=true;
    AtlasThemes.init({map,dataset,showInfo,onChange:()=>{renderLegend();writeHash();},onLegend:()=>renderLegend()});
    AtlasCapas.init({map,dataset,showInfo,legacy:AtlasThemes,onChange:()=>applyFilters()});
    window.AtlasDemography?.init({map,showInfo,onChange:()=>{renderLegend();writeHash();}});
    window.AtlasInfrastructure?.init({map,showInfo,onChange:()=>{if(!window.AtlasInfrastructure?.state()?.roads){failedMapSources.delete("infrastructure-roads");updateMapStatus();}renderLegend();writeHash();}});
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
    },padding,getSelection:()=>dataset.rail.features.find(f=>f.id===selectedId),getFeatures:()=>filtered,getStations:()=>dataset.stations.features,
      // El explorador 3D reutiliza el estilo del mapa: red filtrada con los colores del tema, trazados del tema y selección.
      getNetwork:()=>{const style=window.AtlasCapas?.scene3d?.()||{};const selected=dataset.rail.features.filter(f=>f.id===selectedId);
        return {base:filtered,baseColor:style.baseColor,overlay:style.overlay||[],overlayColor:f=>f.properties.color,selected};},
      getFocus:()=>selectedStation?{station:selectedStation.properties.CODIGO}:null,
      getBasemap:()=>basemapController?.state()});
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
    if(hash.d)await window.AtlasDemography?.restore(hash.d);
    if(hash.ix)await window.AtlasInfrastructure?.restore(hash.ix);
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
