/* Demografía oficial, independiente del tema ferroviario. Un coropleta a la vez. */
(function(root){
  'use strict';
  const $=s=>document.querySelector(s),n=new Intl.NumberFormat('es-ES'),dec=new Intl.NumberFormat('es-ES',{maximumFractionDigits:1});
  const colors=['#edf4f1','#cbded6','#97beb0','#5b9687','#28695f','#12483f'];
  const definitions={density:{title:'Densidad municipal · 2025',unit:'hab./km²',stops:[10,50,100,500,1000]},
    provinces:{title:'Población provincial · oct. 2026',unit:'habitantes',stops:[100000,300000,500000,1000000,2000000]},
    communities:{title:'Población autonómica · oct. 2026',unit:'habitantes',stops:[500000,1000000,2000000,5000000,8000000]}};
  let map,showInfo,onChange,data,promise,revision=0;
  let state={municipalities:false,density:false,provinces:false,communities:false,opacity:55};
  const kinds=['municipalities','density','provinces','communities'];
  const active=()=>Object.keys(definitions).find(k=>state[k]);
  function load(){return promise??=fetch('capas/demografia.json').then(r=>{if(!r.ok)throw Error('No se ha podido cargar la demografía. Vuelve a activar la capa para reintentar.');return r.json();}).then(d=>data=d).catch(e=>{promise=null;throw e;});}
  function expression(key){const d=definitions[key];return ['step',['get',key==='density'?'density':'population'],colors[0],...d.stops.flatMap((v,i)=>[v,colors[i+1]])];}
  function ensure(){
    if(map.getSource('demo-municipalities'))return;
    const before=map.getStyle().layers.find(l=>['rail','theme-line','population-halo'].includes(l.id))?.id;
    for(const kind of ['municipalities','provinces','communities'])map.addSource('demo-'+kind,{type:'geojson',data:data[kind],attribution:'Demografía: INE, Censo 2025 y ECP 1/10/2026 (provisional) · Límites: INE / IGN'});
    for(const key of Object.keys(definitions))map.addLayer({id:'demo-'+key,type:'fill',source:'demo-'+(key==='density'?'municipalities':key),layout:{visibility:'none'},paint:{'fill-color':expression(key),'fill-opacity':state.opacity/100}},before);
    map.addLayer({id:'demo-municipal-hit',type:'fill',source:'demo-municipalities',layout:{visibility:'none'},paint:{'fill-opacity':0}},before);
    map.addLayer({id:'demo-boundaries',type:'line',source:'demo-municipalities',layout:{visibility:'none'},paint:{'line-color':'#557d74','line-opacity':.65,'line-width':['interpolate',['linear'],['zoom'],5,.2,10,.8]}},before);
    map.addLayer({id:'demo-outline',type:'line',source:'demo-provinces',layout:{visibility:'none'},paint:{'line-color':'#41695f','line-opacity':.65,'line-width':.8}},before);
    map.addLayer({id:'demo-community-outline',type:'line',source:'demo-communities',layout:{visibility:'none'},paint:{'line-color':'#41695f','line-opacity':.65,'line-width':1}},before);
    map.on('click',e=>{
      if(!kinds.some(k=>state[k])||root.AtlasInfrastructure?.hit(e.point))return;
      const priority=['stations','transport-icons','cx-stops','cx-hit','theme-hit','rail-hit','population-circles'].filter(id=>map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none');
      if(priority.length&&map.queryRenderedFeatures([[e.point.x-4,e.point.y-4],[e.point.x+4,e.point.y+4]],{layers:priority}).length)return;
      const key=active(),id=key?'demo-'+key:'demo-municipal-hit';
      const f=map.queryRenderedFeatures(e.point,{layers:[id]})[0];if(f)info(f.properties,key||'municipalities');
    });
  }
  function info(p,key){
    const municipal=['density','municipalities'].includes(key);
    showInfo(municipal?'Municipio':key==='provinces'?'Provincia':'Comunidad autónoma',p.name,{
      'Provincia':p.province||undefined,'Comunidad autónoma':p.community||undefined,
      'Fecha del dato':municipal?'1 de enero de 2025 · Censo anual INE':'1 de octubre de 2026 · ECP INE · provisional',
      'Superficie':dec.format(p.area)+' km²',
      'Densidad':municipal?dec.format(p.density)+' hab./km² · cálculo sobre superficie INE':undefined,
      'Código INE':p.id
    },{subtitle:municipal?'Censo anual 2025':'ECP octubre de 2026 · provisional',facts:[{value:n.format(p.population),label:'habitantes'},...(municipal?[{value:dec.format(p.density),label:'hab./km²'}]:[])]});
  }
  function refresh(){
    for(const k of kinds)$('#demo-'+k+'-toggle').checked=state[k];
    $('#demo-opacity').value=state.opacity;$('#demo-opacity-value').textContent=state.opacity+' %';
    $('#demo-opacity-options').hidden=!active();
    if(data&&map){ensure();for(const k of Object.keys(definitions)){map.setLayoutProperty('demo-'+k,'visibility',state[k]?'visible':'none');map.setPaintProperty('demo-'+k,'fill-opacity',state.opacity/100);}
      map.setLayoutProperty('demo-municipal-hit','visibility',state.municipalities?'visible':'none');
      map.setLayoutProperty('demo-boundaries','visibility',state.municipalities?'visible':'none');
      map.setLayoutProperty('demo-outline','visibility',state.provinces?'visible':'none');
      map.setLayoutProperty('demo-community-outline','visibility',state.communities?'visible':'none');
    }
    onChange?.();
  }
  async function set(key,value){
    if(!kinds.includes(key))return;
    const rev=++revision;state[key]=Boolean(value);
    if(value&&key!=='municipalities')for(const k of Object.keys(definitions))if(k!==key)state[k]=false;
    refresh();
    if(value&&!data){$('#demo-status').textContent='Cargando cartografía demográfica…';try{await load();}catch(e){if(rev!==revision){refresh();return;}state[key]=false;$('#demo-status').textContent=e.message;refresh();return;}}
    // Una carga anterior puede terminar tras apagar otra capa: se aplica siempre el estado vigente.
    $('#demo-status').textContent=kinds.some(k=>state[k])?'Pulsa un territorio para consultar sus habitantes. Las vías conservan prioridad al pulsar.':'';refresh();
  }
  function legendItems(){const key=active(),d=definitions[key];const items=d?colors.map((color,i)=>({color,fill:true,name:d.title+' · '+(i===0?'< '+n.format(d.stops[0]):i===5?'≥ '+n.format(d.stops[4]):n.format(d.stops[i-1])+'–< '+n.format(d.stops[i]))+' '+d.unit})):[];if(state.municipalities)items.push({color:'#557d74',fill:false,name:'Límites municipales · INE 2025'});return items;}
  function legend(){const key=active();if(!key&&!state.municipalities)return null;const d=definitions[key],box=document.createElement('div');box.className='demo-legend';const h=document.createElement('strong');h.textContent=d?.title||'Municipios · 2025';box.append(h);const unit=document.createElement('small');unit.textContent=d?d.unit+(key==='density'?' · Censo INE':' · ECP INE, provisional'):'Límites municipales · Censo INE';box.append(unit);const ul=document.createElement('ul');ul.className='legend-cols';for(const item of legendItems()){const li=document.createElement('li'),sw=document.createElement('i');sw.className='demo-swatch';sw.style.background=item.color;li.append(sw,document.createTextNode(item.fill?item.name.split(' · ').at(-1):item.name));ul.append(li);}box.append(ul);return box;}
  root.AtlasDemography={
    init(options){({map,showInfo,onChange}=options);for(const k of kinds)$('#demo-'+k+'-toggle').onchange=e=>set(k,e.target.checked);
      $('#demo-opacity').oninput=e=>{state.opacity=Number(e.target.value);refresh();};refresh();},
    state:()=>kinds.some(k=>state[k])?{...state}:undefined,
    async restore(s){revision++;state={municipalities:false,density:false,provinces:false,communities:false,opacity:55};if(s&&typeof s==='object'){state.opacity=Number.isFinite(s.opacity)?Math.max(15,Math.min(85,s.opacity)):55;state.municipalities=s.municipalities===true;const key=Object.keys(definitions).find(k=>s[k]===true);if(key)state[key]=true;}
      refresh();if(kinds.some(k=>state[k])){try{await load();$('#demo-status').textContent='Pulsa un territorio para consultar sus habitantes.';}catch(e){for(const k of kinds)state[k]=false;$('#demo-status').textContent=e.message;}}refresh();},legend,legendItems
  };
})(window);
