/* ══════════════════════════════════════════════════════════════
   Manual de Claude · configuración (público, sin contenido de cursos)
   Lo que define cómo funciona el manual: identidad, tipos de relación, de fuente y de verificación.
   El contenido (bloques, temas, cursos, glosario, registro) NO está aquí: vive en Supabase (cm_docs, con RLS)
   y se carga tras iniciar sesión. Lo usan el módulo del área privada y las comprobaciones de Node.
   ══════════════════════════════════════════════════════════════ */
export const MANUAL = {
  slug: "claudemanual",                     // prefijo de localStorage (bm_cm_)
  title: "Manual de Claude",
  edition: "octubre de 2026",
  heroTitle: "Manual de <em>Claude</em>",   // la palabra clave va en cursiva
  mapCenter: "Claude y su ecosistema",
  lead: "Un manual privado que crece con cada curso de Claude Academy que estudio: cada concepto explicado en llano, con su fuente, sus conexiones y un mapa para ver cómo encaja todo.",
  stats: [["Temas", "auto"], ["Bloques", "auto"], ["Cursos", "auto"], ["Relaciones", "auto"]],   // "auto" = se calcula
  sources: "Este manual se construye a partir de los cursos y la documentación oficial de Anthropic que voy incorporando, uno a uno. Cada ficha indica su fuente, el curso de origen, cuándo se consultó y si el contenido se ha contrastado. Las explicaciones están reformuladas para entenderlas; no son citas."
};

/* Tipos de fuente (campo k de cada src) */
export const SRCKINDS = {
  oficial:    "Fuente oficial",
  tecnica:    "Documentación técnica",
  ejemplo:    "Ejemplo o repositorio",
  herramienta:"Herramienta relacionada",
  lectura:    "Lectura recomendada",
  interna:    "Documentación del manual"
};

/* Estados de verificación del contenido (campo ver.e) */
export const VERSTATES = {
  verificado: "Contrastado con la fuente",
  parcial:    "Contrastado en parte",
  pendiente:  "Por verificar",
  interno:    "Contenido propio del manual"
};

/* Tipos de relación entre temas. l: lectura directa (A → B) · i: lectura inversa (B → A) · s: simétrica
   d: trazo de la línea en el mapa (no se depende solo del color). El orden es el de la leyenda. */
export const RELTYPES = {
  necesita:   {l:"necesita conocer",       i:"es requisito de",     s:false, d:""},
  tipo:       {l:"es un tipo de",          i:"incluye como tipo",   s:false, d:"2 3"},
  integra:    {l:"se integra con",         i:"se integra con",      s:true,  d:"7 4"},
  sirve:      {l:"sirve para",             i:"se resuelve con",     s:false, d:"10 3 2 3"},
  alternativa:{l:"es una alternativa a",   i:"es una alternativa a",s:true,  d:"1 4"},
  usa:        {l:"se utiliza en",          i:"utiliza",             s:false, d:"12 4"}
};
