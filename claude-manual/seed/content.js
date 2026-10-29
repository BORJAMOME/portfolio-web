/* ══════════════════════════════════════════════════════════════
   Semilla del Manual de Claude · bloque 0 (Guía del manual)
   Contenido propio del manual, sin datos de cursos: va en el repositorio para que las pruebas tengan datos reales.
   El contenido de los cursos NO se versiona: vive en .claude-academy/ (carpeta local, ignorada por git) con este mismo
   formato y se publica en Supabase con tools/claude-academy/publish.mjs. Ver claude-manual/README.md.

   Campos de cada tema (export default [...] en temas/*.js):
     id (estable: no se cambia nunca), b (bloque), t (título), lvl (1-3), q (pregunta que responde)
     one, friend, steps[3-6], ex, key, viz (id de VIZ.<id>), vizNote
     caso{sec,q,html}, yes[], no[], conf[{t,d}], rec[3-5], quiz{q,o[],a,w}, pro[{k,t}]
     src[]  → objeto {t, u?, k, c?, d?, rev?} o texto (ver SRCKINDS en config.js)
     kw[]   → palabras sencillas por las que alguien buscaría el tema (sinónimos, «para qué sirve»)
     tags[] → etiquetas visibles · upd → fecha de la última revisión (AAAA-MM-DD)
     ver    → {e: verificado|parcial|pendiente|interno, d?, n?} estado de verificación del contenido
     rel[]  → [{t: tipo de RELTYPES, a: id del otro tema, w: por qué se relacionan}]
     code[{l,t,s}], lab{…}, ejer[{n,q,sol}]  → opcionales
   Los campos de texto admiten HTML en línea (<b>, <i>, <code>, <p>, <ul>…); al pintarlos se sanean (lista blanca).
   ══════════════════════════════════════════════════════════════ */
/* n empieza en 0: la Guía es el bloque 0 y el resto sigue la numeración de la estructura prevista.
   No se crean bloques vacíos: un bloque nace cuando llega su primer tema. */
export const BLOCKS = [
  {id:"guia", n:0, t:"Guía del manual", s:"Cómo recorrerlo, cómo está hecha cada ficha, de dónde sale la información y cómo se leen el buscador y el mapa."}
];

/* Cursos y recursos de origen. Se rellena al incorporar cada curso:
   {id, t, u, k, d, e}  →  id estable · título · URL original · tipo (SRCKINDS) · fecha de consulta (AAAA-MM-DD) · e: accesible|parcial
   Los temas se enlazan a un curso con src:[{…, c:"<id del curso>"}]. */
export const COURSES = [];

/* Términos del propio manual. Los términos de cada curso se añaden con su tema. {k, d, t: id del tema que lo explica} */
export const GLOSS = [
  {k:"Bloque", d:"Agrupación de temas del mismo ámbito. Cada bloque es una rama del mapa mental.", t:"guia-fichas"},
  {k:"Ficha", d:"La página de un tema: seis capítulos con la misma secuencia, de la idea sencilla a los matices técnicos.", t:"guia-fichas"},
  {k:"Identificador", d:"Nombre interno y estable de una ficha (lo que va tras <code>tema/</code> en la dirección). Aunque cambie el título, el enlace sigue funcionando.", t:"guia-fichas"},
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
export const LOG = [
  {d:"2026-10-29", r:"Estructura inicial del manual y Guía del manual",
   nuevo:["guia-recorrer","guia-fichas","guia-fuentes","guia-busqueda","guia-mapa"], mod:[],
   mapa:"Nodo central, rama «Guía del manual» y sus cinco temas, con cuatro relaciones «necesita conocer» y una «se integra con».",
   pend:["Incorporar el primer curso de Claude Academy."]}
];
