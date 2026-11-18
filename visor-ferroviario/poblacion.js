/* Capa «Población»: círculos proporcionales (área ∝ habitantes) combinables con cualquier tema. */
(function(root){
  'use strict';
  const C=root.AtlasConfig.population;
  const number=new Intl.NumberFormat('es-ES');
  let map,showInfo,onChange,data=null,loading=null;
  let enabled=false,view='area',selected=null;
  const $=s=>document.querySelector(s);

  function load(){
    loading??=fetch('capas/poblacion.json').then(r=>{if(!r.ok)throw new Error('No se ha podido cargar la capa de población.');return r.json();})
      .then(json=>{data=json;return json;}).catch(e=>{loading=null;throw e;});
    return loading;
  }
  function units(){return data?data.units.filter(u=>u.kind===view).sort((a,b)=>b.population-a.population):[];}
  function collection(){
    return {type:'FeatureCollection',features:units().map(u=>({type:'Feature',
      geometry:{type:'Point',coordinates:u.coordinates},properties:{uid:u.id,name:u.name,pop:u.population,sel:u.id===selected?1:0}}))};
  }
  function radiusExpression(){
    const stops=C.zoomFactor.flatMap(([z,f])=>[z,['max',C.minRadius,['*',['sqrt',['get','pop']],C.k*f]]]);
    return ['interpolate',['linear'],['zoom'],...stops];
  }
  function ensureLayers(){
    if(map.getSource('population'))return;
    map.addSource('population',{type:'geojson',data:collection(),attribution:'Población: INE, Censo anual 2025 · Áreas urbanas: MIVAU, Atlas 2025'});
    const before=map.getLayer('rail')?'rail':undefined;
    map.addLayer({id:'population-circles',type:'circle',source:'population',layout:{'circle-sort-key':['-',['get','pop']]},paint:{
      'circle-radius':radiusExpression(),'circle-color':C.fill,
      'circle-stroke-color':['case',['==',['get','sel'],1],C.selected,C.stroke],
      'circle-stroke-width':['case',['==',['get','sel'],1],2,.8],
      // Marcador orientado a la pantalla: la inclinación 3D no deforma ni encoge los círculos.
      'circle-pitch-alignment':'viewport','circle-pitch-scale':'viewport'}},before);
    map.addLayer({id:'population-labels',type:'symbol',source:'population',layout:{
      'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-size':12,
      'symbol-sort-key':['-',['get','pop']],'text-optional':true,'text-padding':4,
      'text-variable-anchor':['center','top','bottom'],'text-max-width':8,
      'text-pitch-alignment':'viewport'},
      paint:{'text-color':'#273a5f','text-halo-color':'#fbfbfb','text-halo-width':1.6}},map.getLayer('stations')?'stations':undefined);
    map.on('mouseenter','population-circles',()=>map.getCanvas().style.cursor='pointer');
    map.on('mouseleave','population-circles',()=>{map.getCanvas().style.cursor='';highlight(null);});
    map.on('mousemove','population-circles',e=>highlight(topUnit(e.features)));
    map.on('click',e=>{
      if(!enabled)return;
      // Prioridad: estación > trazado o servicio > círculo de población.
      const above=['stations','cx-stops','cx-hit','theme-hit'].filter(id=>map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!=='none');
      const box=[[e.point.x-6,e.point.y-6],[e.point.x+6,e.point.y+6]];
      if(above.length&&map.queryRenderedFeatures(box,{layers:above}).length)return;
      const hits=map.queryRenderedFeatures(e.point,{layers:['population-circles']});
      const uid=topUnit(hits);if(uid)select(uid,false);
    });
  }
  // Con círculos superpuestos se elige el más pequeño (el que está encima).
  function topUnit(features){
    if(!features?.length)return null;
    return features.slice().sort((a,b)=>a.properties.pop-b.properties.pop)[0].properties.uid;
  }
  function highlight(uid){
    for(const li of document.querySelectorAll('#population-list li'))li.toggleAttribute('data-hover',li.dataset.uid===uid);
  }
  function refresh(){
    if(!map||!data)return;
    ensureLayers();
    map.getSource('population').setData(collection());
    for(const id of ['population-circles','population-labels'])map.setLayoutProperty(id,'visibility',enabled?'visible':'none');
    renderList();onChange?.();
  }
  function renderPanel(){
    const box=$('#population-options');box.hidden=!enabled;
    for(const input of document.querySelectorAll('input[name="population-view"]'))input.checked=input.value===view;
  }
  function renderList(){
    const list=$('#population-list'),note=$('#population-note');
    list.replaceChildren();
    if(!enabled||!data)return;
    for(const [i,u] of units().entries()){
      const li=document.createElement('li'),b=document.createElement('button');
      li.dataset.uid=u.id;b.type='button';
      b.append(Object.assign(document.createElement('span'),{textContent:(i+1)+'. '+u.name}),Object.assign(document.createElement('span'),{className:'num',textContent:number.format(u.population)}));
      if(u.id===selected)b.setAttribute('aria-current','true');
      b.onclick=()=>select(u.id,true);
      li.append(b);list.append(li);
    }
    note.textContent=data.meta.label+'.';
    $('#population-summary').textContent=(view==='area'?'Grandes áreas urbanas':'Capitales de provincia')+' ordenadas por habitantes ('+units().length+')';
  }
  function select(uid,fly){
    const u=data.units.find(x=>x.id===uid);if(!u)return;
    selected=uid;refresh();
    if(fly)map.easeTo({center:u.coordinates,zoom:Math.max(map.getZoom(),u.kind==='area'?8:9),duration:root.AtlasConfig.reducedMotion()?0:700});
    const m=data.meta;
    const fields=u.kind==='area'?{
      'Unidad':'Gran área urbana · suma de sus municipios, no solo la ciudad central',
      'Habitantes':number.format(u.population),
      'Municipios que la forman':number.format(u.municipalities),
      'Fecha de referencia':'1 de enero de 2025 · Censo anual de población (INE)',
      'Delimitación':m.areas.edition+'. La cifra publicada por el Atlas (1-1-2024) era '+number.format(u.atlas_population_2024)+' habitantes.',
      'Posición del círculo':'Municipio de '+u.anchor+' (el más poblado del área). El círculo no dibuja el perímetro del área.'
    }:{
      'Unidad':'Capital de provincia · municipio completo',
      'Habitantes':number.format(u.population),
      'Provincia':u.province,
      'Código INE':u.ine,
      'Fecha de referencia':'1 de enero de 2025 · Censo anual de población (INE)',
      'Posición del círculo':'Núcleo de la capital según el IGN.'
    };
    showInfo(u.kind==='area'?'Población · gran área urbana':'Población · capital de provincia',u.name,fields,{title:'INE · Censo anual de población (tabla 68065)',url:m.series_url});
  }
  function legend(){
    if(!enabled||!data)return null;
    const zoom=map.getZoom();
    const box=document.createElement('div');box.className='legend-sizes';
    const title=document.createElement('strong');title.textContent='Población · tamaño proporcional a los habitantes';box.append(title);
    // Tres círculos de referencia en fila, con la misma escala que el mapa en el zoom actual.
    const svgNS='http://www.w3.org/2000/svg',radii=C.samples.map(v=>root.AtlasConfig.radius(v,zoom));
    const maxR=Math.max(...radii),h=Math.ceil(maxR*2+20);let x=2;
    const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('aria-hidden','true');svg.setAttribute('height',h);
    C.samples.forEach((value,i)=>{
      const r=radii[i],c=document.createElementNS(svgNS,'circle'),t=document.createElementNS(svgNS,'text');
      const cx=x+Math.max(r,32);c.setAttribute('cx',cx);c.setAttribute('cy',maxR*2-r+1);c.setAttribute('r',r);c.setAttribute('class','legend-bubble');
      t.setAttribute('x',cx);t.setAttribute('y',h-2);t.setAttribute('text-anchor','middle');t.textContent=number.format(value);
      svg.append(c,t);x=cx+Math.max(r,32)+8;
    });
    svg.setAttribute('width',Math.ceil(x));
    box.append(svg);
    const note=document.createElement('small');
    note.textContent='Área del círculo ∝ habitantes; misma escala en las dos vistas. Radio mínimo '+String(C.minRadius).replace('.',',')+' px para que las capitales pequeñas se vean.';
    box.append(note);return box;
  }
  async function setEnabled(value){
    enabled=Boolean(value);$('#population-toggle').checked=enabled;renderPanel();
    if(enabled){try{await load();}catch(e){$('#population-note').textContent=e.message+' Reintenta más tarde.';enabled=false;$('#population-toggle').checked=false;renderPanel();onChange?.();return;}}
    if(!enabled&&selected){selected=null;}
    refresh();
  }
  function setView(value){if(!['area','capital'].includes(value))return;view=value;selected=null;renderPanel();refresh();
    const live=$('#population-live');if(live)live.textContent='Mostrando '+units().length+' '+(view==='area'?'grandes áreas urbanas':'capitales de provincia')+', ordenadas por habitantes.';}
  function init(options){
    ({map,showInfo,onChange}=options);
    $('#population-toggle').onchange=e=>setEnabled(e.target.checked);
    for(const input of document.querySelectorAll('input[name="population-view"]'))input.onchange=()=>setView(input.value);
    map.on('zoomend',()=>{if(enabled)onChange?.();});
  }
  root.AtlasPopulation={init,setEnabled,setView,legend,select,
    state:()=>({on:enabled,view,sel:selected}),
    restore:async s=>{if(!s)return;if(['area','capital'].includes(s.view))view=s.view;await setEnabled(Boolean(s.on));if(s.sel&&data?.units.some(u=>u.id===s.sel))select(s.sel,false);},
    clearSelection:()=>{if(selected){selected=null;refresh();}}};
})(window);
