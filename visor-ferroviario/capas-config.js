/* Configuración central de temas y capas del atlas: nombres, colores, estados y fuentes.
   Los renderizadores 2D y 3D usan el mismo estilo MapLibre, así que todo sale de aquí. */
(function(root){
  'use strict';
  // Ámbito: España peninsular. Regla contrastada con los 8.132 municipios del IGN
  // (0 discrepancias con el código de provincia): fuera Baleares, Canarias, Ceuta y Melilla.
  function peninsular(point){
    const [lon,lat]=point;
    return lat>=35.98 && !(lon>1.0 && lat<40.2) && lon>-9.6 && lon<3.4 && lat<43.9;
  }
  const bounds=[[-9.4,35.9],[3.35,43.85]];

  const themes={
    corridors:{name:'Corredores de alta velocidad',hint:'Por dónde va la red de alta velocidad'},
    brands:{name:'Marcas y operadores',hint:'Quién opera cada ruta de alta velocidad'},
    services:{name:'Servicios',hint:'Qué tipo de tren circula y dónde para'},
    tourism:{name:'Trenes turísticos',hint:'Viajes de varios días y excursiones'},
    all:{name:'Todas las vías',hint:'Toda la red IGN por tipo de infraestructura'},
    gauge:{name:'Ancho de vía · IGN',hint:'Filtra la red por ancho, electrificación y vías'},
    tent:{name:'Corredores TEN-T',hint:'Red transeuropea (Hermes 2024)'},
    transit:{name:'Cercanías y redes urbanas',hint:'Líneas urbanas y de Cercanías (GTFS)'}
  };
  const themeOrder=['corridors','brands','services','tourism','all','gauge','tent','transit'];

  const corridors=[
    {id:'sur',name:'Sur',color:'#8A5A00'},
    {id:'noreste',name:'Noreste',color:'#A3155C'},
    {id:'norte',name:'Norte',color:'#0072B2'},
    {id:'levante',name:'Eje Madrid–Levante',group:'Levante y litoral mediterráneo',color:'#4B1F6F'},
    {id:'litoral',name:'Corredor litoral mediterráneo',group:'Levante y litoral mediterráneo',color:'#4B1F6F',double:true}
  ];
  const status={
    service:{name:'En servicio',dash:null},
    construction:{name:'En construcción',dash:[4,2]},
    project:{name:'En proyecto',dash:[0.6,2.2]}
  };
  const brands=[
    {id:'ave',name:'AVE',operator:'Renfe Viajeros',color:'#4B1F6F'},
    {id:'avlo',name:'Avlo',operator:'Renfe Viajeros',color:'#A13CB0'},
    {id:'iryo',name:'iryo',operator:'Iryo (Intermodalidad de Levante, S. A.)',color:'#C8102E'},
    {id:'ouigo',name:'OUIGO',operator:'OUIGO España',color:'#007C91'}
  ];
  // Denominaciones de la nueva arquitectura de Renfe (trenes.renfe.com, implantación desde el 13-11-2026),
  // con la denominación anterior como alias para seguir encontrándolas.
  const services=[
    {id:'alvia',name:'Alvia · ahora Intercity',color:'#8A5A00',width:2.4,family:'intercity'},
    {id:'euromed',name:'Euromed · ahora AVE Euromed',color:'#0072B2',width:2.4,aliases:['AVE Euromed'],family:'ave'},
    {id:'highspeed',name:'Alta velocidad comercial',color:'#C8102E',width:3.2,note:'AVE, Avlo, iryo y OUIGO'},
    {id:'md-conventional',name:'Media Distancia · ahora Regional',color:'#1E7F4C',width:2.2,family:'regional'},
    {id:'avant',name:'Media Distancia de alta velocidad · Avant',color:'#1E7F4C',width:3.2,dash:[2,1.2],family:'avant'},
    {id:'commuter-metric',name:'Cercanías de ancho métrico',color:'#7A2E86',width:2.4,family:'cercanias'},
    {id:'day',name:'Convencional diurno · Intercity',color:'#1D2638',width:2,family:'intercity'}
  ];
  // «Todas las vías»: tres clasificaciones independientes de la red (prestaciones, titularidad y gestión,
  // ancho de vía). La propiedad de cada tramo sale de preparar_clasificacion_red.py (net, perf) o del IGN (ancho).
  const classifications={
    perf:{name:'Prestaciones',prop:'perf',items:[
      {id:'hs',name:'Alta velocidad',color:'#C45C00'},
      {id:'conv',name:'Convencional',color:'#0072B2'},
      {id:'none',name:'Sin determinar',color:'#A0A7B2'}]},
    net:{name:'Titularidad y gestión',prop:'net',items:[
      {id:'adif',name:'Adif',group:'Estatal (RFIG)',color:'#0072B2'},
      {id:'adifav',name:'Adif AV',group:'Estatal (RFIG)',color:'#C45C00'},
      {id:'port',name:'Autoridades portuarias',group:'Estatal (RFIG)',color:'#0B4F6C'},
      {id:'lfp',name:'LFP Perthus (concesión)',group:'Estatal (RFIG)',color:'#D55E00'},
      {id:'other',name:'Otros titulares',group:'Estatal (RFIG)',color:'#56B4E9'},
      {id:'fgc',name:'FGC · Cataluña',group:'Autonómica',color:'#00856A'},
      {id:'fgv',name:'FGV · Comunitat Valenciana',group:'Autonómica',color:'#4E9A06'},
      {id:'ets',name:'ETS · Euskadi',group:'Autonómica',color:'#1B6B3A'},
      {id:'urban',name:'Metros y metros ligeros',group:'Municipal o metropolitana',color:'#7A2E86'},
      {id:'part',name:'Derivaciones particulares',group:'Privada',color:'#8A5A00'},
      {id:'none',name:'Sin identificar',group:'',color:'#A0A7B2'}]},
    gauge:{name:'Ancho de vía',prop:'filter_gauge',items:[
      {id:'1668',name:'Ibérico · 1.668 mm',color:'#0072B2'},
      {id:'1435',name:'Estándar · 1.435 mm',color:'#C45C00'},
      {id:'narrow',name:'Métrico · 1.000 mm',color:'#00856A',values:['1000','narrow']},
      {id:'mixed',name:'Mixto',color:'#AA4499'},
      {id:'unknown',name:'Sin ancho en el IGN',color:'#A0A7B2',values:['unknown','notApplicable','pending','other']}]}
  };
  const transport={
    ports:{name:'Puertos de interés general',color:'#0B4F6C'},
    airports:{name:'Aeropuertos de interés general',color:'#3D3A8C'}
  };
  // Libreas de la nueva imagen de Renfe (recreación generada con IA por Renfe; © Renfe). Uso personal del manual.
  const families={};  // versión pública: sin libreas © Renfe
  const tourism=[
    {id:'multi',name:'Viajes de varios días',color:'#8B2E5A',marker:'square'},
    {id:'day',name:'Excursiones temáticas',color:'#9A6414',marker:'circle'}
  ];
  const population={
    views:[{id:'area',name:'Grandes áreas urbanas',unit:'Gran área urbana'},{id:'capital',name:'Capitales de provincia',unit:'Capital de provincia'}],
    color:'#490938',fill:'rgba(73,9,56,.16)',stroke:'rgba(73,9,56,.55)',selected:'#490938',
    // r = k·√habitantes. Un mismo k para las dos vistas; crece con el zoom.
    k:0.0125, minRadius:2.5,
    zoomFactor:[[5,1],[7,1.7],[9,2.6],[12,3.6]],
    samples:[5000000,1000000,100000]
  };
  function zoomFactor(zoom){
    const z=population.zoomFactor;
    if(zoom<=z[0][0])return z[0][1];
    for(let i=1;i<z.length;i++)if(zoom<=z[i][0]){const [z0,f0]=z[i-1],[z1,f1]=z[i];return f0+(f1-f0)*(zoom-z0)/(z1-z0);}
    return z.at(-1)[1];
  }
  function radius(pop,zoom){return Math.max(population.minRadius,population.k*Math.sqrt(pop)*zoomFactor(zoom));}
  // Móvil: vertical (ancho ≤ 760) u horizontal (alto ≤ 520).
  const compact=()=>root.matchMedia?.('(max-width: 760px), (max-height: 520px)').matches;
  const phoneLandscape=()=>root.matchMedia?.('(max-height: 520px) and (orientation: landscape)').matches;
  const reducedMotion=()=>root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  root.AtlasConfig={peninsular,bounds,themes,themeOrder,corridors,status,brands,services,classifications,transport,families,tourism,population,zoomFactor,radius,reducedMotion,compact,phoneLandscape};
})(window);
