/* Capas combinables de puertos y aeropuertos de interés general (España peninsular).
   Datos: capas/transporte.json (Anexo I de la Ley de Puertos, red de Aena y coordenadas del IGN). */
(function(root){
  'use strict';
  const CFG=root.AtlasConfig;
  const number=new Intl.NumberFormat('es-ES');
  const $=s=>document.querySelector(s);
  let map,showInfo,onChange,data=null,request=null;
  const on={ports:false,airports:false};
  // Iconos propios: distintivo circular con el glifo en blanco (barco y avión con el mismo trazo).
  const glyph={
    ports:'<path d="M3.6 13.4h16.8l-2.5 4.9a1.8 1.8 0 0 1-1.6 1H7.7a1.8 1.8 0 0 1-1.6-1z"/><path d="M7 12.4V9.3h10v3.1z"/><path d="M10.6 8.3V5.4h2.8v2.9z"/>',
    airports:'<path d="M12 2.6c.8 0 1.4.8 1.4 1.8v4.7l7.4 4.5v2.1l-7.4-2.2v4.3l2.1 1.6v1.7L12 20.2l-3.5 1v-1.7l2.1-1.6v-4.3l-7.4 2.2v-2.1l7.4-4.5V4.4c0-1 .6-1.8 1.4-1.8z"/>'
  };
  function badge(kind){
    const color=CFG.transport[kind].color;
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 32 32">'+
      '<circle cx="16" cy="16" r="14.5" fill="'+color+'" stroke="#fbfbfb" stroke-width="2.2"/><g transform="translate(4 4)" fill="#fbfbfb">'+glyph[kind]+'</g></svg>');
  }
  function addIcon(kind){
    return new Promise(resolve=>{
      if(map.hasImage('poi-'+kind))return resolve();
      const img=new Image(64,64);
      img.onload=()=>{if(!map.hasImage('poi-'+kind))map.addImage('poi-'+kind,img,{pixelRatio:2});resolve();};
      img.onerror=()=>resolve();
      img.src=badge(kind);
    });
  }
  function load(){
    request??=fetch('capas/transporte.json').then(r=>{if(!r.ok)throw new Error('No se han podido cargar puertos y aeropuertos');return r.json();})
      .then(d=>{data=d;return d;}).catch(e=>{request=null;throw e;});
    return request;
  }
  function features(){
    if(!data)return [];
    const out=[];
    if(on.ports)for(const p of data.ports)out.push({type:'Feature',geometry:{type:'Point',coordinates:p.coordinates},properties:{id:p.id,kind:'ports',icon:'poi-ports',label:p.name}});
    if(on.airports)for(const a of data.airports)out.push({type:'Feature',geometry:{type:'Point',coordinates:a.coordinates},properties:{id:a.id,kind:'airports',icon:'poi-airports',label:a.iata}});
    return out;
  }
  async function ensureLayers(){
    await Promise.all([addIcon('ports'),addIcon('airports')]);
    if(map.getSource('transport'))return;
    map.addSource('transport',{type:'geojson',data:{type:'FeatureCollection',features:[]},
      attribution:'Puertos y aeropuertos: IGN (IGR-RT) · Ley de Puertos (BOE) · Aena'});
    // Iconos siempre visibles y por encima del resto; los rótulos ceden ante colisiones.
    map.addLayer({id:'transport-icons',type:'symbol',source:'transport',layout:{
      'icon-image':['get','icon'],'icon-size':['interpolate',['linear'],['zoom'],5,.62,8,.85,12,1],
      'icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-sort-key':['match',['get','kind'],'airports',1,0],
      'icon-pitch-alignment':'viewport'}});
    map.addLayer({id:'transport-labels',type:'symbol',source:'transport',minzoom:6.5,layout:{
      'text-field':['get','label'],'text-font':['Noto Sans Regular'],'text-size':12,'text-optional':true,
      'text-variable-anchor':['left','right','top','bottom'],'text-radial-offset':1.25,'text-padding':3},
      paint:{'text-color':['match',['get','kind'],'airports',CFG.transport.airports.color,CFG.transport.ports.color],'text-halo-color':'#fbfbfb','text-halo-width':1.8}});
    map.on('mouseenter','transport-icons',()=>map.getCanvas().style.cursor='pointer');
    map.on('mouseleave','transport-icons',()=>map.getCanvas().style.cursor='');
    map.on('click','transport-icons',e=>{const p=e.features[0].properties;info(p.kind,p.id);});
  }
  function hit(point){
    if(!map?.getLayer('transport-icons')||!(on.ports||on.airports))return false;
    return map.queryRenderedFeatures([[point.x-9,point.y-9],[point.x+9,point.y+9]],{layers:['transport-icons']}).length>0;
  }
  function metres(a,b){const k=Math.cos((a[1]+b[1])/2*Math.PI/180);return Math.hypot((a[0]-b[0])*k,a[1]-b[1])*111320;}
  const distance=m=>m<1000?number.format(Math.round(m/10)*10)+' m':number.format(Math.round(m/100)/10)+' km';
  function nearestStation(point){
    const stations=root.AtlasDataset?.stations.features||[];
    let best=null;
    for(const f of stations){const m=metres(point,f.geometry.coordinates);if(!best||m<best.m)best={m,name:f.properties.DESCRIPCION};}
    return best;
  }
  function near(point,radius){
    if(!data)return [];
    return [...data.airports.map(a=>({kind:'Aeropuerto',name:a.name+' ('+a.iata+')',metres:metres(point,a.coordinates)})),
      ...data.ports.map(p=>({kind:'Puerto',name:p.official_name,metres:metres(point,p.coordinates)}))]
      .filter(x=>x.metres<=radius).sort((a,b)=>a.metres-b.metres).slice(0,2);
  }
  const title=s=>s.toLowerCase().replace(/(^|[\s\-\/(])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase());
  async function info(kind,id){
    await root.AtlasThemes?.prepareConnections();
    if(kind==='ports'){
      const p=data.ports.find(x=>x.id===id);if(!p)return;
      const station=nearestStation(p.coordinates);
      const siblings=data.ports.filter(x=>x.authority===p.authority&&x.id!==p.id).map(x=>x.official_name);
      showInfo('Puerto de interés general',p.official_name,{
        'Autoridad Portuaria':p.authority,
        'Titularidad':'Estado · sistema portuario de Puertos del Estado',
        'Incluye':p.note||undefined,
        'Otros puertos de la misma Autoridad':siblings.join('\n')||undefined,
        'Estación del catálogo Renfe más próxima':station?title(station.name)+' · a '+distance(station.m)+' en línea recta':undefined
      },{subtitle:p.province,chips:[{label:'Interés general',color:CFG.transport.ports.color},{label:p.authority.replace('Autoridad Portuaria de ','AP ')}]});
    } else {
      const a=data.airports.find(x=>x.id===id);if(!a)return;
      // Acceso ferroviario: solo estaciones cuyo nombre las identifica con el aeropuerto (Renfe o Metro).
      // Los catálogos integrados no incluyen todas las estaciones de Cercanías, así que no se afirma la ausencia.
      const access=[
        ...(root.AtlasDataset?.stations.features||[]).filter(f=>/aeropuerto|aeroport/i.test(f.properties.DESCRIPCION)&&metres(a.coordinates,f.geometry.coordinates)<6000).map(f=>'Renfe: '+title(f.properties.DESCRIPCION)),
        ...(root.AtlasThemes?.nearbyStations(a.coordinates,6000)||[]).filter(s=>/aeropuerto|aeroport/i.test(s.name)).map(s=>s.network+': '+s.name+' ('+s.lines.join(', ')+')')
      ];
      showInfo('Aeropuerto de interés general','Aeropuerto '+a.name,{
        'Gestor':a.operator+' · red de Aena',
        'Tráfico':a.category?a.category+(a.category==='Internacional'?' (vuelos nacionales e internacionales)':''):undefined,
        'Uso':a.military?'Compartido con una base aérea del Ejército del Aire y del Espacio':undefined,
        'Acceso en tren o metro':access.join('\n')||undefined
      },{subtitle:a.province,chips:[{label:a.iata,color:CFG.transport.airports.color,title:'Código IATA'},{label:a.icao,title:'Código OACI (ICAO)'}],
        facts:[{value:a.iata,label:'código IATA'},{value:a.icao,label:'código OACI'}]});
    }
  }
  async function setEnabled(kind,value){
    on[kind]=Boolean(value);
    const box=$('#'+kind+'-toggle');if(box)box.checked=on[kind];
    if(on[kind]){try{await load();}catch(e){on[kind]=false;if(box)box.checked=false;return;}}
    if(!data)return;
    await ensureLayers();
    map.getSource('transport').setData({type:'FeatureCollection',features:features()});
    onChange?.();
  }
  function legend(){
    const items=Object.entries(on).filter(([,v])=>v);if(!items.length)return null;
    const box=document.createElement('div');box.className='legend-pois';
    for(const [kind] of items){const p=document.createElement('p'),i=document.createElement('i');i.className='poi-key '+(kind==='ports'?'port':'airport');p.append(i,document.createTextNode(CFG.transport[kind].name));box.append(p);}
    return box;
  }
  function state(){const v=[on.ports&&'p',on.airports&&'a'].filter(Boolean).join(',');return v||undefined;}
  async function restore(v){if(typeof v!=='string')return;const k=v.split(',');await setEnabled('ports',k.includes('p'));await setEnabled('airports',k.includes('a'));}
  function init(options){
    ({map,showInfo,onChange}=options);
    root.AtlasDataset=options.dataset;
    for(const kind of ['ports','airports']){const box=$('#'+kind+'-toggle');if(box)box.onchange=()=>setEnabled(kind,box.checked);}
  }
  root.AtlasTransport={init,load,hit,near,legend,state,restore,setEnabled,info};
})(window);
