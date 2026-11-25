/* Mapa local, sin teselas ni dependencias. Los valores se calculan sobre patrones
   de paradas del GTFS, no sobre la unión desordenada de estaciones de cada fila. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), ns = 'http://www.w3.org/2000/svg';
  const number = n => new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(n);
  const node = (tag, text) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const svg = (tag, attrs) => {const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  let municipalities=[],municipalStations=new Map();
  let activity, demographics, ready=false, loading=false, zoom=1, centerX=500, centerY=335;
  const map=$('rh-map'), group=svg('g',{});map.append(group);
  const project = ([lon,lat]) => lon < -12 ? [55+(lon+18.3)*75,525+(29.6-lat)*65] : [65+(lon+9.8)*57,35+(44.6-lat)*65];
  const line = points => points.map((p,i)=>(i?'L':'M')+project(p).map(x=>x.toFixed(1)).join(',')).join('');
  const polygons = geometry => geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  const areaPath = geometry => polygons(geometry).map(p=>p.map(r=>line(r)+'Z').join('')).join('');
  const distance = (a,b) => {const r=Math.PI/180,lat=(b[1]-a[1])*r,lon=(b[0]-a[0])*r,h=Math.sin(lat/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(lon/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(h)));};
  function inside(point,geometry){return polygons(geometry).some(poly=>{
    const ringInside=ring=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++) {const a=ring[i],b=ring[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
    return ringInside(poly[0])&&!poly.slice(1).some(ringInside);
  });}
  let items=[],columns=[],tableRows=[],pageSize=50,pageStart=0,order={key:'value',dir:-1},currentMode='',selectedKey=null;
  const markerLayer=svg('g',{}),labels=svg('g',{'aria-hidden':'true'}),highlight=svg('g',{});map.append(markerLayer,labels,highlight);
  const palette=['#2563a0','#179b9c','#e3b63c','#e87b32','#ba2944'];
  const band=n=>n===null?'rh-na':'rh-c'+Math.min(4,thresholds.filter(t=>n>t).length);
  let thresholds=[1,2,5,10];
  const peninsular=s=>s.c&&s.c[0]>-10&&s.ca!=='Fuera de España';
  const featureAllowed=f=>!['Canarias','Ceuta','Melilla','Illes Balears'].includes(f.properties.community||f.properties.name);
  const cell=(key,label,numeric=false)=>({key,label,numeric});
  const baseColumns=[cell('label','Estación'),cell('province','Provincia'),cell('value','Trenes',true),cell('routeCount','Rutas',true),cell('operators','Operadores')];
  const methods={
    routes:'Rutas distintas por segmento ferroviario. Pulsa sobre un trazado para consultar el tramo, sus operadores y todas las rutas que lo utilizan. Los sentidos cuentan por separado. IGN: trazados inferidos completos. Cercanías: dibujos GTFS de línea; no se suman a IGN por proximidad y pueden incluir ramales de la línea completa.',
    frequency:'Calor según trenes programados con parada en cada estación el día seleccionado. Cada tren cuenta una vez por estación. Los halos facilitan localizar concentraciones; la cifra exacta está en el punto y en la tabla.',
    connectivity:'Calor según destinos directos distintos desde cada estación, en el sentido del tren y el día seleccionado. Al seleccionar una estación puedes consultar sus destinos. No se suponen transbordos.',
    coverage:'Cobertura del catálogo en España peninsular. Se distingue tener estación, tener servicio en la selección y estar cerca de una estación con servicio. La distancia desde el centro aproximado del municipio es orientativa; un municipio que contiene una estación nunca se clasifica como alejado por su centro geométrico.',
    potential:'Paradas programadas por cada 10.000 habitantes de una provincia peninsular. El detalle muestra habitantes, estaciones y paradas para contrastar el indicador. Es oferta relativa; no mide demanda real.',
    reliability:'No hay histórico de llegadas reales ni cancelaciones. No se pinta un mapa ni una tabla con cifras inventadas. Este modo se habilitará cuando exista una serie de operación verificable.'
  };
  function kpis(entries){$('rh-kpis').replaceChildren(...entries.map(([label,value])=>{const box=node('div');box.append(node('span',label),node('strong',value));return box;}));}
  function legend(entries){$('rh-legend').replaceChildren(...entries.map(([cls,label])=>{const span=node('span'),swatch=node('i');swatch.className='rh-swatch '+cls;span.append(swatch,label);return span;}));}
  function numericLegend(unit){legend([['rh-na','Sin dato'],...thresholds.map((n,i)=>['rh-c'+i,(i?'> '+number(thresholds[i-1])+' – ':'0 – ')+number(n)+' '+unit]),['rh-c4','> '+number(thresholds.at(-1))+' '+unit]]);}
  function nearestStation(coordinates,indices,stations){let best=null,min=Infinity;for(const i of indices){const d=distance(coordinates,stations[i].c);if(d<min){min=d;best=i;}}return {index:best,distance:min};}
  function focusItem(item){
    const p=project(item.coordinates);zoom=4;centerX=p[0];centerY=p[1];scale();
    highlight.replaceChildren(svg('circle',{cx:p[0],cy:p[1],r:8,class:'rh-selection'}));
    if(item.lines)for(const points of item.lines)highlight.append(svg('path',{d:line(points),class:'rh-selection-line'}));
  }
  function showDetail(item,focus=false){
    selectedKey=item.key;if(focus)focusItem(item);
    const box=$('rh-detail');box.replaceChildren(node('h4',item.label),node('p',item.value===null?'Sin dato':number(item.value)+' '+item.unit));
    const dl=node('dl');for(const c of columns){if(c.key==='label'||c.key==='value')continue;dl.append(node('dt',c.label),node('dd',item[c.key]===null?'Sin dato':String(item[c.key]??'—')));}box.append(dl);
    if(item.note)box.append(node('p',item.note));
    if(item.destinations?.length){const details=node('details'),summary=node('summary','Destinos directos ('+item.destinations.length+')');details.append(summary,node('p',item.destinations.join(' · ')));box.append(details);}
    if(item.routeIds?.length){const details=node('details'),summary=node('summary','Rutas asociadas ('+item.routeIds.length+')');details.append(summary);const list=node('ul');
      for(const id of item.routeIds){const r=window.RutasHeatmapSelection.rows.find(r=>r.id===id);if(!r)continue;const li=node('li'),a=node('a',r._title+' · '+r.marca+' · '+r.op);a.href='#tabla';a.onclick=()=>{const input=document.querySelector('#f-q');input.value=r._title.split(' → ').join(' ');input.dispatchEvent(new Event('input',{bubbles:true}));};li.append(a);list.append(li);}details.append(list);box.append(details);
    }
    renderTable(false);
  }
  function selectItem(item,focus=false){
    $('rh-search').value='';filterTable();const at=tableRows.indexOf(item);pageStart=at<0?0:Math.floor(at/pageSize)*pageSize;
    showDetail(item,focus);
  }
  function filterTable(){const q=normal($('rh-search').value);tableRows=items.filter(item=>!q||normal(columns.map(c=>item[c.key]).join(' ')).includes(q));
    tableRows.sort((a,b)=>{const x=a[order.key],y=b[order.key];if(x===null)return y===null?0:1;if(y===null)return -1;return (typeof x==='number'?x-y:String(x??'').localeCompare(String(y??''),'es'))*order.dir;});pageStart=0;renderTable();}
  function renderTable(head=true){
    if(head){const tr=node('tr');for(const c of columns){const th=node('th');th.scope='col';const b=node('button',c.label+(order.key===c.key?(order.dir<0?' ↓':' ↑'):''));b.type='button';b.onclick=()=>{order={key:c.key,dir:order.key===c.key?-order.dir:c.numeric?-1:1};filterTable();};th.append(b);if(order.key===c.key)th.setAttribute('aria-sort',order.dir<0?'descending':'ascending');tr.append(th);}$('rh-thead').replaceChildren(tr);}
    const fragment=document.createDocumentFragment();
    for(const item of tableRows.slice(pageStart,pageStart+pageSize)){const tr=node('tr');tr.dataset.key=item.key;if(item.key===selectedKey)tr.className='rh-selected';for(const c of columns){const td=node('td');if(c.numeric)td.className='n';if(c.key==='label'){const b=node('button',item.label);b.type='button';b.onclick=()=>showDetail(item,true);td.append(b);}else td.textContent=item[c.key]===null?'Sin dato':c.numeric?number(item[c.key]):String(item[c.key]??'—');tr.append(td);}fragment.append(tr);}
    if(!tableRows.length){const tr=node('tr'),td=node('td','No hay resultados con estos filtros.');td.colSpan=columns.length;tr.append(td);fragment.append(tr);}$('rh-tbody').replaceChildren(fragment);
    $('rh-table-count').textContent=(tableRows.length?number(pageStart+1)+' – '+number(Math.min(pageStart+pageSize,tableRows.length)):'0')+' de '+number(tableRows.length)+' registros';$('rh-more').hidden=pageStart+pageSize>=tableRows.length;$('rh-prev').hidden=pageStart===0;
  }
  function centroid(geometry){
    let best=null,weight=-1;for(const poly of polygons(geometry)){const ring=poly[0];let a=0,x=0,y=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const cross=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];a+=cross;x+=(ring[j][0]+ring[i][0])*cross;y+=(ring[j][1]+ring[i][1])*cross;}if(Math.abs(a)>weight&&a){best=[x/(3*a),y/(3*a)];weight=Math.abs(a);}}
    if(best&&inside(best,geometry))return best;return polygons(geometry)[0][0][0];
  }
  function pointLayers(list,coverage=false){
    const defs=svg('defs',{});group.append(defs);
    palette.forEach((color,i)=>{const gradient=svg('radialGradient',{id:'rh-glow-'+i});gradient.append(svg('stop',{offset:'0%','stop-color':color,'stop-opacity':'.65'}),svg('stop',{offset:'100%','stop-color':color,'stop-opacity':'0'}));defs.append(gradient);});
    for(const item of list){const p=project(item.coordinates),cls=coverage?'rh-station':band(item.value),i=+cls.slice(-1);
      if(!coverage&&item.value>0)group.append(svg('circle',{cx:p[0],cy:p[1],r:18,fill:'url(#rh-glow-'+i+')',class:'rh-halo'}));
      const n=svg('circle',{cx:p[0],cy:p[1],r:coverage?2.5:3.5,class:'rh-point '+cls,'data-key':item.key});const title=svg('title',{});title.textContent=item.label+' · '+number(item.value)+' '+item.unit;n.append(title);n.onclick=()=>{const municipality=coverage?items.find(m=>m.stationIds?.includes(item.index)):null;selectItem(municipality||item);};markerLayer.append(n);
    }
  }
  function draw(){
    if(!ready||!window.RutasHeatmapSelection)return;
    const {rows,stations,filters}=window.RutasHeatmapSelection,mode=$('rh-mode').value,day=+$('rh-day').value;
    const changed=mode!==currentMode;currentMode=mode;selectedKey=null;items=[];group.replaceChildren();markerLayer.replaceChildren();labels.replaceChildren();highlight.replaceChildren();
    $('rh-radius-field').hidden=mode!=='coverage';$('rh-day').disabled=mode==='reliability';$('rh-method').textContent=methods[mode];
    $('rh-detail').replaceChildren(node('h4','Consulta el mapa'),node('p','Pulsa un tramo, una estación o un municipio. También puedes seleccionar una fila de la tabla para acercar el mapa.'));
    $('rh-layout').hidden=mode==='reliability';$('rh-table-section').hidden=mode==='reliability';$('rh-kpis').hidden=mode==='reliability';
    if(mode==='reliability'){$('rh-status').textContent='Sin histórico de operación disponible.';return;}
    for(const f of demographics.communities.features)if(featureAllowed(f))group.append(svg('path',{d:areaPath(f.geometry),class:'rh-land','fill-rule':'evenodd'}));
    const calls=new Map(),destinations=new Map(),routeSets=new Map();
    for(const r of rows){const a=activity.rutas[r.id];if(!a)continue;for(const [i,counts] of a.calls)if(counts[day]&&peninsular(stations[i])){calls.set(i,(calls.get(i)||0)+counts[day]);if(!routeSets.has(i))routeSets.set(i,new Set());routeSets.get(i).add(r.id);}
      if(mode==='connectivity')for(const [origin,destination,mask] of a.links)if(mask&(1<<day)){if(!destinations.has(origin))destinations.set(origin,new Set());destinations.get(origin).add(destination);}
    }
    const active=[...calls.keys()],allStations=stations.map((s,i)=>peninsular(s)?i:-1).filter(i=>i>=0);
    const scope=p=>(!filters.ca||p.community===filters.ca)&&(!filters.pr||provinceName(p.province)===provinceName(filters.pr));
    const routeById=new Map(rows.map(r=>[r.id,r]));
    const operators=ids=>[...new Set(ids.map(id=>routeById.get(id)?.op).filter(Boolean))].join(', ');
    const stationItem=i=>({key:'s'+i,index:i,label:stations[i].n,province:stations[i].pr,coordinates:stations[i].c,value:calls.get(i)||0,trains:calls.get(i)||0,unit:'trenes con parada',routeIds:[...(routeSets.get(i)||[])],routeCount:routeSets.get(i)?.size||0,operators:operators([...(routeSets.get(i)||[])])});
    let summary=number(rows.length)+' rutas seleccionadas · '+activity.referencia[day]+' · '+number(active.length)+' estaciones peninsulares con servicio.';
    if(mode==='routes'){
      const segments=new Map();let traced=0;
      for(const r of rows){if(!r.dias[day])continue;const ids=activity.traces.routeDays?.[r.id]?.[day]||activity.traces.routes[r.id]||[];if(ids.length)traced++;const seen=new Set();
        for(const id of ids){const points=activity.traces.geometries[id];if(!points)continue;const pieces=id.startsWith('ign:')?[[id,points]]:points.slice(1).map((p,i)=>['gtfs:'+ [points[i].join(','),p.join(',')].sort().join('|'),[points[i],p]]);
          for(const [key,xy] of pieces){if(seen.has(key))continue;seen.add(key);if(!segments.has(key))segments.set(key,{key,lines:[xy],coordinates:xy[Math.floor(xy.length/2)],routeIds:[]});segments.get(key).routeIds.push(r.id);}}
      }
      thresholds=[1,3,10,25];columns=[cell('label','Tramo · estación de referencia'),cell('value','Rutas',true),cell('operators','Operadores'),cell('segments','Segmentos',true),cell('length','Longitud total (km)',true),cell('source','Trazado')];
      const nearby=new Map(),groups=new Map();
      for(const s of segments.values()){
        const xy=s.coordinates,grid=Math.round(xy[0]*100)+':'+Math.round(xy[1]*100);if(!nearby.has(grid))nearby.set(grid,nearestStation(xy,allStations,stations).index);
        const station=nearby.get(grid);s.reference=station;s.value=s.routeIds.length;s.label=(station!==null?'Entorno de '+stations[station].n:'Tramo')+' · '+(s.key.startsWith('ign:')?s.key.replace('ign:','IGN '):'GTFS '+(items.length+1));s.unit='rutas distintas';s.operators=operators(s.routeIds);s.source=s.key.startsWith('ign:')?'IGN inferido':'Dibujo GTFS de línea';s.length=s.lines[0].slice(1).reduce((sum,p,i)=>sum+1000*distance(s.lines[0][i],p),0);s.note='La estación es una referencia geográfica cercana, no el extremo del tramo.';
        items.push(s);const key=s.routeIds.slice().sort().join('|');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);
      }
      // Tabla a escala de entorno: reúne segmentos cercanos a la misma estación,
      // de igual fuente y exactamente las mismas rutas, sin sumar conteos de rutas.
      const areas=new Map();
      for(const segment of items){const key=segment.reference+'|'+segment.source+'|'+segment.routeIds.slice().sort().join('|');if(!areas.has(key))areas.set(key,{...segment,key:'area'+areas.size,label:segment.reference!==null?'Entorno de '+stations[segment.reference].n:'Tramos compartidos',lines:[],length:0,segments:0,note:'Segmentos con las mismas rutas y la misma estación de referencia más próxima. La longitud suma esos segmentos, no la distancia entre estaciones. IGN y GTFS se mantienen separados.'});const area=areas.get(key);area.lines.push(...segment.lines);area.length+=segment.length/1000;area.segments++;segment.tableItem=area;}
      items=[...areas.values()];
      // Agrupa solo la pintura. El clic resuelve el segmento concreto más próximo.
      for(const groupItems of groups.values()){
        const n=svg('path',{d:groupItems.map(s=>line(s.lines[0])).join(''),class:'rh-line '+band(groupItems[0].value)});const title=svg('title',{});title.textContent=groupItems[0].value+' rutas · pulsa para explorar el tramo';n.append(title);
        n.onclick=event=>{const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(map.getScreenCTM().inverse());let best=groupItems[0],min=Infinity;for(const item of groupItems)for(const c of item.lines[0]){const xy=project(c),d=(p.x-xy[0])**2+(p.y-xy[1])**2;if(d<min){min=d;best=item;}}selectItem(best.tableItem||best);focusItem(best.tableItem||best);};group.append(n);
      }
      numericLegend('rutas');kpis([['Entornos analizados',number(items.length)],['Máxima concentración',number(items.reduce((m,i)=>Math.max(m,i.value),0))+' rutas'],['Rutas con trazado',number(traced)],['Rutas activas sin trazado',number(rows.filter(r=>r.dias[day]>0).length-traced)]]);
    }else if(mode==='frequency'||mode==='connectivity'){
      thresholds=mode==='frequency'?[10,50,150,400]:[5,15,40,100];columns=baseColumns.map(c=>({...c}));if(mode==='connectivity'){columns[2].label='Destinos directos';columns.splice(3,0,cell('trains','Trenes',true));}
      items=active.map(i=>{const item=stationItem(i);if(mode==='connectivity'){item.value=destinations.get(i)?.size||0;item.unit='destinos directos';item.destinations=[...(destinations.get(i)||[])].map(j=>stations[j].n).sort((a,b)=>a.localeCompare(b,'es'));}return item;});
      pointLayers(items);numericLegend(mode==='frequency'?'trenes':'destinos');
      kpis([['Estaciones con servicio',number(items.length)],['Mayor intensidad',number(items.reduce((m,i)=>Math.max(m,i.value),0))],['Rutas activas',number(rows.filter(r=>r.dias[day]).length)],['Día analizado',activity.referencia[day]]]);
    }else if(mode==='coverage'){
      columns=[cell('label','Municipio'),cell('province','Provincia'),cell('status','Situación ferroviaria'),cell('stationCount','Estaciones del catálogo',true),cell('servedCount','Con servicio seleccionado',true),cell('value','Distancia orientativa (km)',true),cell('nearest','Estación con servicio más próxima'),cell('population','Habitantes',true)];
      const radius=+$('rh-radius').value;
      items=municipalities.filter(f=>scope(f.properties)).map(f=>{
        const stationIds=municipalStations.get(f.properties.id)||[],served=stationIds.filter(i=>calls.has(i)),nearest=active.length?nearestStation(f.center,served.length?served:active,stations):{index:null,distance:null};
        const value=served.length?0:nearest.distance;
        const status=served.length?'Con estación y servicio':stationIds.length?'Estación sin servicio seleccionado':value===null?'Sin servicio en la selección':value<=radius?'Próximo a estación (≤ '+radius+' km)':'Sin estación próxima';
        const color=served.length?'rh-covered':stationIds.length?'rh-inactive':value===null?'rh-na':value<=radius?'rh-near':'rh-far';
        return {key:'m'+f.properties.id,label:f.properties.name,province:f.properties.province,coordinates:f.center,geometry:f.geometry,value,unit:'km orientativos',population:f.properties.population,stationIds,stationCount:stationIds.length,servedCount:served.length,status,color,nearest:nearest.index===null?'Sin servicio seleccionado':stations[nearest.index].n,routeIds:[...new Set(served.flatMap(i=>[...(routeSets.get(i)||[])]))],note:'Población municipal a '+f.properties.date+'. Con estación y servicio: distancia 0 a escala municipal. Para los demás, distancia geodésica desde un punto representativo del municipio; no es tiempo de acceso.'};
      });
      for(const item of items){const n=svg('path',{d:areaPath(item.geometry),class:'rh-area '+item.color,'fill-rule':'evenodd','data-key':item.key});const title=svg('title',{});title.textContent=item.label+' · '+item.status+' · '+item.stationCount+' estaciones';n.append(title);n.onclick=()=>selectItem(item);group.append(n);}
      pointLayers(active.map(stationItem),true);
      legend([['rh-covered','Con estación y servicio'],['rh-inactive','Estación sin servicio seleccionado'],['rh-near','Sin estación, a ≤ '+radius+' km'],['rh-far','Sin estación próxima'],['rh-na','Sin dato de distancia']]);
      const withStation=items.filter(i=>i.stationCount>0),served=items.filter(i=>i.servedCount>0);kpis([['Municipios con estación',number(withStation.length)],['Municipios con estación y servicio',number(served.length)],['Estaciones en estos municipios',number(withStation.reduce((s,i)=>s+i.stationCount,0))],['Municipios sin estación próxima',number(items.filter(i=>i.color==='rh-far').length)]]);
      summary+=' Los puntos azules señalan estaciones con servicio; los colores distinguen la situación de cada municipio.';
    }else if(mode==='potential'){
      thresholds=[5,15,30,60];columns=[cell('label','Provincia'),cell('value','Paradas / 10.000 hab.',true),cell('trains','Paradas programadas',true),cell('stationCount','Estaciones con servicio',true),cell('population','Habitantes',true),cell('date','Fecha de población')];
      const provinces=demographics.provinces.features.filter(f=>!['35','38','51','52','07'].includes(f.properties.id));
      items=provinces.filter(f=>(!filters.pr||provinceName(f.properties.name)===provinceName(filters.pr))&&(!filters.ca||municipalities.some(m=>m.properties.community===filters.ca&&m.properties.id.slice(0,2)===f.properties.id))).map(f=>{const ids=active.filter(i=>provinceOf(stations[i].c,provinces)?.properties.id===f.properties.id),sum=ids.reduce((s,i)=>s+calls.get(i),0);return {key:'p'+f.properties.id,label:f.properties.name,geometry:f.geometry,coordinates:centroid(f.geometry),value:sum*10000/f.properties.population,unit:'paradas / 10.000 hab.',trains:sum,stationCount:ids.length,population:f.properties.population,date:f.properties.date+(f.properties.provisional?' (provisional)':''),routeIds:[...new Set(ids.flatMap(i=>[...(routeSets.get(i)||[])]))]};});
      for(const item of items){const n=svg('path',{d:areaPath(item.geometry),class:'rh-area '+band(item.value),'fill-rule':'evenodd'});n.onclick=()=>selectItem(item);const title=svg('title',{});title.textContent=item.label+' · '+number(item.value)+' '+item.unit;n.append(title);group.append(n);}numericLegend('paradas / 10.000 hab.');
      kpis([['Provincias analizadas',number(items.length)],['Mayor oferta relativa',number(items.reduce((m,i)=>Math.max(m,i.value),0))],['Población de referencia','INE'],['Medida','Paradas, no viajeros']]);
    }
    for(const [name,pattern] of [['Madrid',/^Madrid-Chamart/i],['Barcelona',/^Barcelona-Sants/i],['Sevilla',/^Sevilla-Santa/i],['Valencia',/^Valencia.*Joaqu/i],['Málaga',/^M.laga-Mar/i],['Zaragoza',/^Zaragoza-Del/i],['Bilbao',/^Bilbao-Abando/i],['A Coruña',/^A Coru.a$/i],['Ourense',/^Ourense$/i],['Vigo',/^Vigo Urz/i]]){const st=stations.find(s=>pattern.test(s.n));if(st){const xy=project(st.c),label=svg('text',{x:xy[0]+6,y:xy[1]-6,class:'rh-place'});label.textContent=name;labels.append(label);}}
    $('rh-status').textContent=summary;$('rh-table-title').textContent=({routes:'Tramos y rutas compartidas',frequency:'Frecuencia por estación',connectivity:'Destinos directos por estación',coverage:'Cobertura por municipio',potential:'Oferta y población por provincia'})[mode];
    if(changed){$('rh-search').value='';order={key:mode==='coverage'?'stationCount':'value',dir:-1};}
    filterTable();window.RutasHeatmapData={mode,items,columns};
  }
  const normal=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const provinceName=s=>normal(({'Araba/Álava':'Álava','Coruña, A':'A Coruña','Rioja, La':'La Rioja','Castellón/Castelló':'Castellón','Valencia/Valéncia':'Valencia','Balears, Illes':'Illes Balears','Palmas, Las':'Las Palmas'})[s]||s);
  const provinceCache=new Map();
  function provinceOf(point,provinces){const key=point.join(',');if(!provinceCache.has(key))provinceCache.set(key,provinces.find(p=>inside(point,p.geometry))||null);return provinceCache.get(key);}
  async function load(){
    if(loading)return;loading=true;$('rh-content').hidden=false;$('rh-load').disabled=true;$('rh-status').textContent='Cargando cartografía y agregados de horarios…';
    try{
      const get=async path=>{const r=await fetch(path,{cache:'no-cache'});if(!r.ok)throw Error(path);return r.json();};
      [activity,demographics]=await Promise.all([get('capas/rutas-actividad.json'),get('capas/demografia.json')]);
      if(activity.referencia[0]!==window.RutasHeatmapSelection?.reference.semana)throw Error('Los agregados y las rutas corresponden a semanas diferentes');
      municipalities=demographics.municipalities.features.filter(featureAllowed).map(f=>{
        const points=polygons(f.geometry).flatMap(p=>p[0]);return {...f,center:centroid(f.geometry),bounds:[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]};
      });
      const stations=window.RutasHeatmapSelection.stations;
      stations.forEach((station,i)=>{if(!peninsular(station))return;const [x,y]=station.c;const m=municipalities.find(f=>x>=f.bounds[0]&&x<=f.bounds[2]&&y>=f.bounds[1]&&y<=f.bounds[3]&&inside(station.c,f.geometry));if(m){if(!municipalStations.has(m.properties.id))municipalStations.set(m.properties.id,[]);municipalStations.get(m.properties.id).push(i);}});
      ready=true;$('rh-load').hidden=true;draw();
    }catch{ $('rh-status').textContent='No se ha podido cargar el mapa o los datos corresponden a semanas distintas. Puedes reintentar; la tabla sigue disponible.';$('rh-load').disabled=false;$('rh-load').textContent='Reintentar carga';}
    finally{loading=false;}
  }
  $('rh-load').onclick=load;
  $('rh-search').addEventListener('input',filterTable);
  $('rh-more').onclick=()=>{pageStart+=pageSize;renderTable(false);};
  $('rh-prev').onclick=()=>{pageStart=Math.max(0,pageStart-pageSize);renderTable(false);};
  $('rh-csv').onclick=()=>{const escape=v=>'"'+String(v??'Sin dato').replaceAll('"','""')+'"';const content=[columns.map(c=>escape(c.label)).join(';'),...tableRows.map(item=>columns.map(c=>escape(item[c.key])).join(';')),'Día;'+activity.referencia[+$('rh-day').value],'Método;'+methods[currentMode]].join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+content],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download='mapa-'+currentMode+'-'+activity.referencia[+$('rh-day').value]+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  for(const id of ['rh-mode','rh-day','rh-radius'])$(id).addEventListener('change',draw);
  window.addEventListener('rutas-selection',draw);
  function scale(){centerX=Math.max(500/zoom,Math.min(1000-500/zoom,centerX));centerY=Math.max(335/zoom,Math.min(670-335/zoom,centerY));map.setAttribute('viewBox',`${centerX-500/zoom} ${centerY-335/zoom} ${1000/zoom} ${670/zoom}`);}
  $('rh-in').onclick=()=>{zoom=Math.min(8,zoom*1.5);scale();};$('rh-out').onclick=()=>{zoom=Math.max(1,zoom/1.5);scale();};$('rh-home').onclick=()=>{zoom=1;centerX=500;centerY=335;scale();};
  map.setAttribute('tabindex','0');
  map.addEventListener('keydown',event=>{const delta=60/zoom;if(event.key==='ArrowLeft')centerX-=delta;else if(event.key==='ArrowRight')centerX+=delta;else if(event.key==='ArrowUp')centerY-=delta;else if(event.key==='ArrowDown')centerY+=delta;else return;event.preventDefault();scale();});
  let drag;
  map.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0)return;drag={x:event.clientX,y:event.clientY,cx:centerX,cy:centerY};});
  map.addEventListener('pointermove',event=>{if(!drag)return;const rect=map.getBoundingClientRect();centerX=drag.cx-(event.clientX-drag.x)*1000/(rect.width*zoom);centerY=drag.cy-(event.clientY-drag.y)*670/(rect.height*zoom);scale();});
  map.addEventListener('pointerup',()=>{drag=null;});map.addEventListener('pointercancel',()=>{drag=null;});
  map.addEventListener('pointerleave',()=>{drag=null;});
})();
