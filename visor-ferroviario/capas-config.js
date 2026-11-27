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
    servicios:{name:'Servicios',hint:'Operador, familia y marca, régimen, eje y Cercanías de todos los núcleos'},
    corridors:{name:'Corredores de alta velocidad',hint:'Por dónde va la red de alta velocidad'},
    tourism:{name:'Trenes turísticos',hint:'Viajes de varios días y excursiones'},
    all:{name:'Todas las vías',hint:'Toda la red IGN por tipo de infraestructura'},
    gauge:{name:'Ancho de vía',hint:'IGN y Adif: filtra por ancho, electrificación y vías'},
    tent:{name:'Corredores TEN-T',hint:'Red transeuropea (Hermes 2024)'},
    transit:{name:'Cercanías y redes urbanas',hint:'Líneas urbanas y de Cercanías (GTFS)'}
  };
  // «Marcas y operadores» y «Servicios» (antiguos) ya no son temas: sus enlaces se traducen a «Servicios» (capas.js, translateLegacy).
  const themeOrder=['servicios','corridors','tourism','all','gauge','tent','transit'];

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
  // Marcas, operadores y servicios: diccionario único en taxonomia.js (fase 6: aquí ya no hay listas propias).
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
      {id:'1000',name:'Métrico · 1.000 mm',color:'#00856A'},
      {id:'mixed',name:'Mixto (dos anchos)',color:'#AA4499'},
      {id:'unknown',name:'Sin determinar',color:'#A0A7B2',values:['unknown','narrow','notApplicable','pending','other']}]}
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
  root.AtlasConfig={peninsular,bounds,themes,themeOrder,corridors,status,classifications,transport,families,tourism,population,zoomFactor,radius,reducedMotion,compact,phoneLandscape};
})(window);
