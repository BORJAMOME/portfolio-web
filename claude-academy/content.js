/* ══════════════════════════════════════════════════════════════
   Manual de Claude · datos generales
   Aquí vive lo que NO es una ficha: identidad del manual, bloques, cursos, tipos de
   relación, glosario y registro de cambios. Las fichas están en temas/*.js
   (cada archivo hace TOPICS.push(...)); se cargan desde index.html.

   Campos de cada tema (TOPICS):
     id (estable: no se cambia nunca), b (bloque), t (título), lvl (1-3), q (pregunta que responde)
     one, friend, steps[3-6], ex, key, viz (id de VIZ.<id>), vizNote
     caso{sec,q,html}, yes[], no[], conf[{t,d}], rec[3-5], quiz{q,o[],a,w}, pro[{k,t}]
     src[]  → objeto {t, u?, k, c?, d?, rev?} o texto (ver SRCKINDS)
     kw[]   → palabras sencillas por las que alguien buscaría el tema (sinónimos, «para qué sirve»)
     tags[] → etiquetas visibles · upd → fecha de la última revisión (AAAA-MM-DD)
     ver    → {e: verificado|parcial|pendiente|interno, d?, n?} estado de verificación del contenido
     rel[]  → [{t: tipo de RELTYPES, a: id del otro tema, w: por qué se relacionan}]
     code[{l,t,s}], lab{…}, ejer[{n,q,sol}]  → opcionales
   Todos los campos admiten HTML en línea (<b>, <i>, <code>); nada de estilos en línea.
   ══════════════════════════════════════════════════════════════ */
var MANUAL = {
  slug: "claudeacademy",                    // prefijo de localStorage
  title: "Manual de Claude",
  edition: "octubre de 2026",
  heroTitle: "Manual de <em>Claude</em>",   // la palabra clave va en cursiva
  mapCenter: "Claude y su ecosistema",
  lead: "Un manual que crece con cada curso de Claude Academy que estudio: cada concepto explicado en llano, con su fuente, sus conexiones y un mapa para ver cómo encaja todo.",
  stats: [["Temas", "auto"], ["Bloques", "auto"], ["Cursos", "auto"], ["Relaciones", "auto"]],   // "auto" = se calcula
  how: [
    ["Entiéndelo", "La idea en una frase, una analogía, los pasos y un ejemplo con números."],
    ["Míralo en acción", "Un visual interactivo propio del tema: toca los controles y fíjate en lo que cambia."],
    ["Úsalo en un proyecto", "Un caso real, cuándo sí y cuándo no, y, si el tema lo permite, un ejercicio paso a paso."],
    ["Por dentro", "El código o la configuración y los conceptos con los que se confunde."],
    ["Ponte a prueba", "Lo que tienes que recordar y una pregunta de autochequeo con progreso guardado."],
    ["Nivel profesional", "Matices de proyectos reales, cómo encaja con otros temas y de dónde sale la información."]
  ],
  sources: "Este manual se construye a partir de los cursos y la documentación oficial de Anthropic que voy incorporando, uno a uno. Cada ficha indica su fuente, el curso de origen, cuándo se consultó y si el contenido se ha contrastado. Las explicaciones están reformuladas para entenderlas; no son citas."
};

/* Las fichas se añaden desde temas/*.js con TOPICS.push(...) */
var TOPICS = [];

/* n empieza en 0: la Guía es el bloque 0 y el resto sigue la numeración de la estructura prevista.
   No se crean bloques vacíos: un bloque nace cuando llega su primer tema. */
var BLOCKS = [
  {id:"guia", n:0, t:"Guía del manual", s:"Cómo recorrerlo, cómo está hecha cada ficha, de dónde sale la información y cómo se leen el buscador y el mapa."}
];

/* Cursos y recursos de origen. Se rellena al incorporar cada curso:
   {id, t, u, k, d, e}  →  id estable · título · URL original · tipo (SRCKINDS) · fecha de consulta (AAAA-MM-DD) · e: accesible|parcial
   Los temas se enlazan a un curso con src:[{…, c:"<id del curso>"}]. */
var COURSES = [];

/* Tipos de fuente (campo k de cada src) */
var SRCKINDS = {
  oficial:    "Fuente oficial",
  tecnica:    "Documentación técnica",
  ejemplo:    "Ejemplo o repositorio",
  herramienta:"Herramienta relacionada",
  lectura:    "Lectura recomendada",
  interna:    "Documentación del manual"
};

/* Estados de verificación del contenido (campo ver.e) */
var VERSTATES = {
  verificado: "Contrastado con la fuente",
  parcial:    "Contrastado en parte",
  pendiente:  "Por verificar",
  interno:    "Contenido propio del manual"
};

/* Tipos de relación entre temas. l: lectura directa (A → B) · i: lectura inversa (B → A) · s: simétrica
   d: trazo de la línea en el mapa (no se depende solo del color). El orden es el de la leyenda. */
var RELTYPES = {
  necesita:   {l:"necesita conocer",       i:"es requisito de",     s:false, d:""},
  tipo:       {l:"es un tipo de",          i:"incluye como tipo",   s:false, d:"2 3"},
  integra:    {l:"se integra con",         i:"se integra con",      s:true,  d:"7 4"},
  sirve:      {l:"sirve para",             i:"se resuelve con",     s:false, d:"10 3 2 3"},
  alternativa:{l:"es una alternativa a",   i:"es una alternativa a",s:true,  d:"1 4"},
  usa:        {l:"se utiliza en",          i:"utiliza",             s:false, d:"12 4"}
};

/* Términos del propio manual. Los términos de cada curso se añaden con su tema. {k, d, t: id del tema que lo explica} */
var GLOSS = [
  {k:"Bloque", d:"Agrupación de temas del mismo ámbito. Cada bloque es una rama del mapa mental.", t:"guia-fichas"},
  {k:"Ficha", d:"La página de un tema: seis capítulos con la misma secuencia, de la idea sencilla a los matices técnicos.", t:"guia-fichas"},
  {k:"Identificador", d:"Nombre interno y estable de una ficha (lo que va tras <code>#tema/</code>). Aunque cambie el título, el enlace sigue funcionando.", t:"guia-fichas"},
  {k:"Fuente oficial", d:"Documentación, curso o repositorio publicado por Anthropic. Se distingue de la documentación técnica complementaria.", t:"guia-fuentes"},
  {k:"Estado de verificación", d:"Indica si el contenido de una ficha se ha contrastado con su fuente, y en qué fecha.", t:"guia-fuentes"},
  {k:"Palabras clave", d:"Sinónimos y expresiones sencillas que cada tema guarda para que el buscador lo encuentre aunque no recuerdes su nombre técnico.", t:"guia-busqueda"},
  {k:"Nodo", d:"Cada punto del mapa mental: un tema, un bloque o un curso.", t:"guia-mapa"},
  {k:"Relación", d:"Línea con nombre entre dos temas: necesita conocer, se integra con, sirve para…", t:"guia-mapa"},
  {k:"Prerrequisito", d:"Tema que conviene entender antes de otro. Se declara con la relación «necesita conocer».", t:"guia-mapa"},
  {k:"Ruta de aprendizaje", d:"Los prerrequisitos de un tema, en el orden en que conviene estudiarlos.", t:"guia-mapa"}
];

/* Registro de cambios (se muestra plegado al final de Inicio). Una entrada por incorporación:
   {d, r, curso?, nuevo[], mod[], mapa, pend[]} */
var LOG = [
  {d:"2026-10-29", r:"Estructura inicial del manual y Guía del manual",
   nuevo:["guia-recorrer","guia-fichas","guia-fuentes","guia-busqueda","guia-mapa"], mod:[],
   mapa:"Nodo central, rama «Guía del manual» y sus cinco temas, con cuatro relaciones «necesita conocer» y una «se integra con».",
   pend:["Incorporar el primer curso de Claude Academy."]}
];
