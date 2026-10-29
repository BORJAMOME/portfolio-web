/* Bloque 0 · Guía del manual. Contenido propio: no depende de ningún curso. */
export default [
{
  id:"guia-recorrer", b:"guia", t:"Cómo recorrer el manual", lvl:1,
  q:"¿Por dónde empiezo y cómo sé qué me falta?",
  one:"El manual se puede leer de principio a fin o consultar por temas sueltos, y recuerda en tu navegador qué has entendido.",
  friend:"Es como un libro de cocina con un menú recomendado y un índice: puedes seguir el menú completo en orden o ir directo a la receta que necesitas esta noche. Y las recetas que ya has cocinado con éxito quedan marcadas, para que sepas qué te falta sin tener que acordarte.",
  steps:[
    "<b>Elige cómo entrar</b>: la ruta de aprendizaje de Inicio te lleva en orden; Temas y el buscador (<code>Ctrl K</code>) te llevan directo a un concepto.",
    "<b>Lee la ficha</b>: tiene seis capítulos, siempre en el mismo orden, de la idea sencilla al detalle técnico.",
    "<b>Marca tu estado</b>: abrir una ficha la deja «En estudio»; «Lo entiendo» lo marcas tú o se activa al acertar la pregunta de autochequeo.",
    "<b>Sigue las conexiones</b>: al final de cada ficha, «Dónde encaja» te dice qué conviene saber antes y qué puedes estudiar después."
  ],
  ex:"Con <b>5 temas</b> en el bloque 0 y <b>1</b> marcado como entendido, la barra del bloque indica <b>1 de 5 entendidos</b>, es decir, un <b>20 %</b>. Con 3 entendidos sería el <b>60 %</b>.",
  key:"Tú decides el orden; el manual solo guarda tu progreso y te enseña cómo se conectan los temas.",
  viz:"guia-recorrer", vizNote:"Cada clic cambia el estado de un tema (pendiente, en estudio, entendido) y la barra se recalcula al momento.",
  caso:{sec:"Uso del manual", q:"Tengo 20 minutos antes de una reunión: ¿qué hago?",
    html:"<p>Abres el buscador con <code>Ctrl K</code> y escribes lo que recuerdas, con tus palabras (cada tema guarda varias palabras sencillas además de su título). Abres la ficha y lees solo el capítulo 1, «Entiéndelo», que en cinco minutos te da la idea, una analogía y el ejemplo. Si te sobra tiempo, miras «Dónde encaja» para saber qué leer a continuación.</p>"},
  yes:["Quieres una visión ordenada de un ámbito entero: sigue la ruta de Inicio.", "Tienes una duda concreta: entra por el buscador o por el catálogo de Temas."],
  no:["Esperas que tu progreso te acompañe a otro dispositivo o navegador: se guarda solo donde lo marcas."],
  conf:[
    {t:"Progreso frente a estado de verificación", d:"El progreso es tuyo: lo que tú has entendido. El estado de verificación es del contenido: si se ha contrastado con su fuente. No dependen el uno del otro."},
    {t:"«En estudio» frente a «Lo entiendo»", d:"Abrir una ficha basta para dejarla «En estudio». «Lo entiendo» exige una acción tuya: pulsar el botón o acertar la pregunta."}
  ],
  rec:["Hay dos formas de entrar: la ruta ordenada y la consulta directa.", "Abrir una ficha la deja «En estudio»; «Lo entiendo» lo decides tú.", "El progreso vive en tu navegador, no en una cuenta."],
  quiz:{q:"Abres una ficha, lees un par de líneas y la cierras. ¿En qué estado queda?", o:["Pendiente","En estudio","Lo entiendo"], a:1,
    w:"Abrir una ficha ya la pasa a «En estudio». «Pendiente» es el estado de las fichas que no has abierto nunca, y «Lo entiendo» solo se marca a mano o acertando la pregunta."},
  pro:[{k:"Dónde se guarda", t:"El progreso y las respuestas se guardan en el almacenamiento local del navegador, con el prefijo <code>bm_cm_</code>. Si borras los datos del sitio o cambias de navegador, empiezas de cero."}],
  src:[{t:"Documentación del propio manual (README del proyecto)", k:"interna"}],
  kw:["empezar","por dónde empiezo","orden de lectura","progreso","ruta","cómo se usa","instrucciones","guardar progreso","primeros pasos"],
  tags:["manual","empezar"], upd:"2026-10-29", ver:{e:"interno", n:"Describe el comportamiento del propio manual."},
  rel:[]
},
{
  id:"guia-fichas", b:"guia", t:"Cómo está hecha una ficha", lvl:1,
  q:"¿Qué encuentro en cada tema y en qué orden?",
  one:"Todas las fichas siguen la misma secuencia de seis capítulos, de la idea sencilla a los matices técnicos.",
  friend:"Como una receta bien escrita: primero qué plato es y cómo debería quedar, luego cómo se prepara en tu cocina y, al final, los trucos de quien lo ha hecho cien veces. Da igual de qué plato se trate: la receta siempre sigue el mismo orden, así que al tercer plato ya sabes dónde buscar cada cosa.",
  steps:[
    "<b>Entiéndelo</b>: una frase, una analogía, los pasos y un ejemplo con números.",
    "<b>Míralo en acción</b>: un visual interactivo propio del tema.",
    "<b>Úsalo en un proyecto</b>: un caso real, cuándo sí y cuándo no, y un ejercicio guiado si el tema lo permite.",
    "<b>Por dentro</b>: el código o la configuración y las confusiones habituales.",
    "<b>Ponte a prueba</b>: lo que hay que recordar y una pregunta con explicación.",
    "<b>Nivel profesional</b>: matices de proyectos reales, dónde encaja el tema y de dónde sale la información."
  ],
  ex:"Para repasar en cinco minutos un tema que ya viste, lees el capítulo 1 (la frase, la analogía y la idea clave) y saltas al 5, «Ponte a prueba»: <b>2 de los 6 capítulos</b>. Para aplicarlo en tu trabajo añades el 3 y el 4: <b>4 de 6</b>.",
  key:"Una ficha explica una sola idea en tres niveles de lectura: inicial (capítulos 1 y 2), de aplicación (3 y 4) y técnico (6).",
  viz:"guia-fichas", vizNote:"Cada capítulo responde a una pregunta distinta del lector; el nivel de lectura te dice cuánto profundizas.",
  caso:{sec:"Estudio", q:"Quiero repasar un tema que estudié hace un mes",
    html:"<p>No relees la ficha entera. Entras por la <b>idea clave</b> (capítulo 1) para recordar el concepto, contestas la pregunta del capítulo 5 y, si fallas, vuelves al capítulo que la explica. El índice lateral de la ficha te deja saltar a cualquier bloque.</p>"},
  yes:["Quieres entender un concepto desde cero: lee los capítulos en orden.", "Quieres refrescarlo: ve a la idea clave y a la pregunta de autochequeo."],
  no:["Buscas la lista completa de comandos o ajustes de una herramienta: eso es referencia, y una ficha explica un concepto, no sustituye a la documentación."],
  conf:[
    {t:"Nivel del tema y nivel de lectura", d:"El nivel (básico, intermedio o avanzado) dice lo exigente que es el tema. El nivel de lectura (inicial, de aplicación, técnico) lo eliges tú según cuántos capítulos leas."},
    {t:"Identificador y título", d:"El título se puede mejorar con el tiempo. El identificador (lo que va tras <code>tema/</code> en la dirección) no cambia nunca, así que los enlaces, las relaciones y el mapa siguen funcionando."}
  ],
  rec:["Seis capítulos, siempre en el mismo orden.", "Una ficha = una idea clave.", "El título puede cambiar; el identificador, no."],
  quiz:{q:"¿En qué capítulo están los matices de proyectos reales y las trampas habituales?", o:["En «Por dentro»","En «Nivel profesional»","En «Ponte a prueba»"], a:1,
    w:"En «Nivel profesional» (capítulo 6). «Por dentro» (capítulo 4) explica el código y las confusiones entre conceptos, y «Ponte a prueba» (capítulo 5) es para comprobar lo aprendido."},
  pro:[
    {k:"Un concepto, una ficha", t:"Si dos cursos explican lo mismo, el manual mantiene una ficha canónica con las dos fuentes, no dos fichas. Lo específico de cada curso se anota dentro de esa ficha."},
    {k:"Estructura estable", t:"Reordenar o renombrar bloques y temas no rompe nada: todo se enlaza por identificador, nunca por posición."}
  ],
  src:[{t:"Documentación del propio manual (README del proyecto)", k:"interna"}],
  kw:["capítulos","estructura","qué lleva cada tema","partes de un tema","plantilla","niveles","básico intermedio avanzado"],
  tags:["manual","estructura"], upd:"2026-10-29", ver:{e:"interno", n:"Describe la estructura real de la ficha."},
  rel:[{t:"necesita", a:"guia-recorrer", w:"Para leer una ficha hay que saber cómo se llega a ella y cómo se guarda el avance."}]
},
{
  id:"guia-fuentes", b:"guia", t:"Fuentes y fiabilidad", lvl:1,
  q:"¿De dónde sale lo que leo y cuánto puedo fiarme?",
  one:"Cada ficha indica su fuente, el curso de origen, la fecha de consulta y si el contenido se ha contrastado.",
  friend:"Es la bibliografía de un libro, pero pegada a cada explicación y con fecha: Claude evoluciona deprisa y una página que era correcta hace unos meses puede haber cambiado. Piensa en la fecha de caducidad de un alimento: no dice que esté malo, dice cuándo conviene volver a mirarlo.",
  steps:[
    "<b>Mira el tipo de fuente</b>: oficial, documentación técnica, ejemplo o repositorio, herramienta o lectura recomendada.",
    "<b>Mira el curso de origen</b>, si lo hay, para saber en qué lección se explica.",
    "<b>Mira la fecha de consulta</b>: es el día en que se leyó la fuente por última vez.",
    "<b>Mira el estado de verificación</b>: contrastado, contrastado en parte o por verificar.",
    "<b>Abre el enlace original</b> cuando algo importe: la ficha explica, la fuente manda."
  ],
  ex:"Imagina una ficha con una fuente oficial consultada el <b>12 de octubre de 2026</b> y el estado «Contrastado en parte». Te dice que el concepto se comprobó ese día, pero que alguna parte, por ejemplo un procedimiento de instalación, no. Si lo lees <b>17 días</b> después, conviene abrir la fuente antes de fiarte de los detalles.",
  key:"Una explicación de la ficha reformula la fuente para que se entienda; no es una cita. Los ejemplos están creados para ilustrar, y la ficha lo indica cuando no proceden de la fuente.",
  viz:"guia-fuentes", vizNote:"Cambia el estado: el texto que acompaña a cada chip te dice qué puedes dar por bueno y qué no.",
  caso:{sec:"Verificación", q:"Una ficha dice «Por verificar». ¿Qué hago?",
    html:"<p>Usas la explicación como orientación, no como dato cerrado. Abres el enlace de la fuente, lees la parte que te interesa y, si ya la has contrastado, lo anotas para que la ficha se actualice. Si el enlace no abre, la ficha queda marcada para revisión: no se sustituye por otra página solo porque el título se parezca.</p>"},
  yes:["Vas a aplicar algo en un proyecto real: comprueba la fecha y abre la fuente.", "Dos fichas parecen contradecirse: mira las fechas y la versión que cada una documenta."],
  no:["Necesitas la redacción exacta de una condición, un precio o un límite: acude siempre a la fuente original."],
  conf:[
    {t:"Fuente oficial frente a documentación complementaria", d:"La oficial la publica Anthropic (cursos, documentación, repositorios). La complementaria aclara un concepto, pero no está respaldada por Anthropic."},
    {t:"Contrastado frente a actualizado", d:"«Contrastado» dice que se comparó con la fuente en una fecha. No garantiza que hoy siga igual: por eso la fecha va siempre al lado."}
  ],
  rec:["Cada fuente lleva tipo, curso, fecha y enlace.", "La explicación reformula; la fuente manda.", "«Por verificar» no significa «falso», significa «no contrastado»."],
  quiz:{q:"Una ficha muestra el estado «Por verificar». ¿Qué significa?", o:["Que el contenido es incorrecto","Que todavía no se ha podido contrastar con la fuente","Que te toca estudiarla a ti"], a:1,
    w:"Significa que no se ha contrastado todavía con la fuente. No dice que sea falso, y el progreso de estudio es otra cosa distinta."},
  pro:[
    {k:"Vigencia", t:"Una función puede estar disponible, ser experimental, estar en desarrollo o ser solo una posibilidad. Cuando una fuente cambia, la ficha conserva lo que decía antes si ayuda a entender la evolución, en lugar de sobrescribirlo sin avisar."},
    {k:"Enlaces rotos", t:"Si una URL deja de funcionar se conserva el registro y la fuente se marca para revisar. Nunca se reemplaza por otra solo porque el título se parezca."}
  ],
  src:[{t:"Documentación del propio manual (README del proyecto)", k:"interna"}],
  kw:["fuentes","bibliografía","referencias","fecha de consulta","fiable","verificado","oficial","enlaces","de dónde sale","caducado","desactualizado"],
  tags:["manual","fuentes"], upd:"2026-10-29", ver:{e:"interno", n:"Describe las reglas de fuentes y verificación del manual."},
  rel:[{t:"necesita", a:"guia-fichas", w:"La fuente, la fecha y el estado de verificación aparecen dentro de la ficha, en su último capítulo."}]
},
{
  id:"guia-busqueda", b:"guia", t:"Encontrar cualquier tema", lvl:1,
  q:"¿Cómo localizo un concepto si no recuerdo su nombre?",
  one:"Puedes buscar por el nombre técnico o por lo que quieres conseguir, y filtrar el catálogo por bloque, nivel o curso.",
  friend:"Como una biblioteca: puedes ir a la sección (el bloque), pedirle ayuda al bibliotecario con una palabra suelta (el buscador) o seguir las referencias de un libro a otro («Dónde encaja»). Si no recuerdas el título, te vale la sección, una palabra suelta o el libro que lo cita.",
  steps:[
    "<b>Buscador global</b>: <code>Ctrl K</code> (<code>⌘ K</code> en Mac) o la tecla <code>/</code>. Mira temas, glosario y secciones.",
    "<b>Catálogo de Temas</b>: busca en el título, la pregunta y la idea clave, y se combina con los filtros.",
    "<b>Glosario</b>: si solo recuerdas el término, cada entrada te lleva al tema que lo explica.",
    "<b>Dónde encaja</b>: al final de cada ficha, los temas relacionados con el que estás leyendo."
  ],
  ex:"Escribes <b>por donde empiezo</b>, sin tilde y con las palabras en cualquier orden. La búsqueda ignora mayúsculas y tildes y exige que aparezcan <b>las 3 palabras</b>; encuentra «Cómo recorrer el manual» porque ese tema guarda la expresión «por dónde empiezo» entre sus palabras clave.",
  key:"El nombre técnico y la descripción con tus palabras llevan al mismo sitio, porque cada tema guarda sus propios sinónimos.",
  viz:"guia-busqueda", vizNote:"Prueba con una palabra suelta, con una expresión y con una errata: así ves qué entiende el buscador y qué no.",
  caso:{sec:"Búsqueda", q:"Recuerdo qué quería hacer, pero no cómo se llama",
    html:"<p>Escribes la idea con las palabras más sencillas que se te ocurran («empezar», «progreso», «fuentes»). Si hay un tema cuyas palabras clave la contienen, aparece aunque su título use otro término. Si no aparece nada, prueba con una palabra más corta: el buscador compara trozos de palabra, no significados.</p>"},
  yes:["Recuerdas una parte del nombre o una idea aproximada.", "Quieres ver todo lo de un bloque: usa los filtros de Temas."],
  no:["Esperas que entienda sinónimos que nadie ha anotado: busca por coincidencia de texto, no por significado."],
  lab:{
    obj:"Encontrar un tema de dos maneras distintas y comprobar que ambas llevan a la misma ficha.",
    antes:["Tener este manual abierto. No hace falta ningún conocimiento previo."],
    pasos:[
      {h:"Pulsa <code>Ctrl K</code> (en Mac, <code>⌘ K</code>) o la tecla <code>/</code>.", w:"Se abre el buscador global, que mira temas, glosario y secciones a la vez."},
      {h:"Escribe <b>por donde empiezo</b> y pulsa Intro sobre el primer resultado.", w:"Cada tema guarda palabras sencillas además de su título. Aquí coincide con las de «Cómo recorrer el manual»."},
      {h:"Vuelve a <b>Temas</b>, escribe <b>recorrer</b> en el buscador del catálogo y abre la ficha que aparece.", w:"El catálogo busca en el título, la pregunta que responde, la frase y las palabras clave del tema, y debe llevarte a la misma ficha."}
    ],
    res:"Las dos búsquedas terminan en la ficha «Cómo recorrer el manual».",
    comprobar:"La dirección del navegador acaba en <code>#/claude/tema/guia-recorrer</code> y la ficha se titula «Cómo recorrer el manual».",
    errores:[
      {t:"La tecla / no hace nada", d:"Solo funciona si el cursor no está dentro de un campo de texto. Haz clic fuera del campo, o usa <code>Ctrl K</code>."},
      {t:"No aparece el tema que esperabas", d:"Prueba con una sola palabra o con un sinónimo. Si un término razonable no lo encuentra, falta una palabra clave en esa ficha."}
    ],
    variantes:["Filtra el catálogo por bloque o nivel antes de escribir.", "Entra por el glosario si solo recuerdas el término."],
    sig:"Mira cómo se ven las conexiones entre fichas en «Cómo leer el mapa mental»."
  },
  conf:[
    {t:"Buscador global y buscador de Temas", d:"El global (<code>Ctrl K</code>) busca en todo el manual. El de Temas solo filtra el catálogo y se combina con los filtros de bloque y nivel."},
    {t:"Palabras clave y etiquetas", d:"Las palabras clave son invisibles: son los sinónimos que ayudan a encontrar el tema. Las etiquetas sí se ven en la ficha y en las tarjetas."}
  ],
  rec:["Mayúsculas y tildes no importan.", "Deben aparecer todas las palabras que escribes, en cualquier orden.", "Busca por coincidencia de texto, no por significado."],
  quiz:{q:"Escribes «por donde empiezo» sin tilde. ¿Qué ocurre?", o:["No encuentra nada porque falta la tilde","Encuentra los temas que guardan esa expresión, porque ignora tildes y mayúsculas","Solo encuentra títulos escritos exactamente igual"], a:1,
    w:"La búsqueda normaliza el texto: ignora mayúsculas y tildes. Y no se limita a los títulos, porque también mira las palabras clave de cada tema."},
  pro:[{k:"Cómo se decide si hay coincidencia", t:"El texto de cada tema se normaliza (minúsculas, sin tildes) y se exige que aparezca cada palabra de la consulta, en cualquier orden. Los resultados cuyo título contiene la consulta salen primero. No tolera erratas ni sinónimos que no estén anotados."}],
  src:[{t:"Documentación del propio manual (README del proyecto)", k:"interna"}],
  kw:["buscar","buscador","encontrar","localizar","filtrar","índice","atajo","ctrl k","no recuerdo el nombre","glosario"],
  tags:["manual","búsqueda"], upd:"2026-10-29", ver:{e:"interno", n:"Comprobado con la interfaz del propio manual."},
  rel:[{t:"necesita", a:"guia-recorrer", w:"El buscador es una de las dos formas de entrar descritas en el recorrido (la otra es la ruta ordenada)."}]
},
{
  id:"guia-mapa", b:"guia", t:"Cómo leer el mapa mental", lvl:2,
  q:"¿Cómo se relacionan los conceptos y qué necesito saber antes de cada uno?",
  one:"El mapa dibuja cada tema como un punto y cada relación como una línea con nombre: qué necesita, con qué se integra y para qué sirve.",
  friend:"Como el plano del metro: no enseña las calles, enseña qué líneas conectan con cuáles. Para llegar a un sitio nuevo miras primero por dónde pasa el camino y qué trasbordos te tocan. Al elegir un punto, solo se resaltan las líneas que parten de él o llegan a él: las que te afectan ahora.",
  steps:[
    "<b>Mira el centro y las ramas</b>: el centro es Claude y su ecosistema; cada rama es un bloque del manual.",
    "<b>Pulsa un punto</b>: se abre su resumen, se resaltan sus conexiones y se atenúa el resto.",
    "<b>Lee el nombre de la relación</b>: «necesita conocer» marca un orden de estudio; «se integra con» solo une piezas que trabajan juntas.",
    "<b>Sigue la ruta de aprendizaje</b>: el panel lista los prerrequisitos en el orden en que conviene estudiarlos.",
    "<b>Filtra o cambia a Lista</b>: por bloque, por estado o por texto; la lista dice lo mismo que el mapa y es más cómoda en pantallas pequeñas."
  ],
  ex:"«Cómo leer el mapa mental» necesita conocer «Cómo está hecha una ficha», que a su vez necesita «Cómo recorrer el manual». La ruta es <b>Cómo recorrer el manual → Cómo está hecha una ficha → Cómo leer el mapa mental</b>: <b>3 temas</b>, en ese orden.",
  key:"El mapa no se dibuja a mano: sale de las relaciones que declara cada ficha, así que siempre refleja el contenido real.",
  viz:"guia-mapa", vizNote:"Cada tipo de relación tiene su trazo y su frase; el trazo permite distinguirlas sin depender del color.",
  caso:{sec:"Planificación del estudio", q:"Quiero estudiar un tema avanzado y no sé qué me falta",
    html:"<p>Buscas el tema en el mapa y lo seleccionas. El panel muestra su <b>ruta de aprendizaje</b>: los prerrequisitos en orden, cada uno con su estado (pendiente, en estudio o entendido). Empiezas por el primero que no tengas marcado como entendido y avanzas hasta el tema que querías.</p>"},
  yes:["Quieres ver cómo encaja un concepto con el resto.", "Necesitas saber qué estudiar antes de un tema."],
  no:["Quieres leer una explicación: el mapa orienta, pero la explicación está en la ficha."],
  ejer:[
    {n:"Comprensión básica", q:"En el mapa, ¿qué diferencia hay entre un punto vacío, uno a medias y uno relleno con una marca?",
     sol:"Indican tu estado en ese tema: vacío = pendiente (no lo has abierto), a medias = en estudio (lo has abierto) y relleno con marca = entendido. El panel lo escribe también con palabras, para no depender solo de la forma."},
    {n:"Aplicación guiada", q:"Selecciona «Cómo leer el mapa mental» y lee su ruta de aprendizaje. ¿Cuántos temas tienes que estudiar antes y en qué orden?",
     sol:"Dos antes: «Cómo recorrer el manual» y «Cómo está hecha una ficha», en ese orden. El tercer tema de la ruta es el propio «Cómo leer el mapa mental»."},
    {n:"Resolución autónoma", q:"Usa el buscador del mapa para localizar un tema por una palabra suelta y abre su ficha desde el panel. ¿Qué botón has usado?",
     sol:"«Abrir ficha», en el panel de detalle. También puedes llegar con doble clic sobre el punto, o con Intro cuando el punto está seleccionado."}
  ],
  conf:[
    {t:"«Necesita conocer» frente a «se integra con»", d:"La primera marca un orden: A antes que B. La segunda no: son piezas que trabajan juntas y puedes aprenderlas en cualquier orden."},
    {t:"Mapa frente a lista", d:"Es la misma información. El mapa enseña la forma del conjunto; la lista es más cómoda con pantallas pequeñas o con lector de pantalla."}
  ],
  rec:["Cada punto es un tema y cada línea, una relación con nombre.", "«Necesita conocer» marca el orden de estudio.", "El mapa sale de los datos de las fichas; no se mantiene aparte."],
  quiz:{q:"Si «C necesita conocer B» y «B necesita conocer A», ¿en qué orden conviene estudiarlos?", o:["C, B, A","A, B, C","El orden es indiferente"], a:1,
    w:"A, B, C: cada tema necesita conocer el anterior. «C, B, A» lo invertiría y «indiferente» solo valdría para relaciones como «se integra con»."},
  pro:[
    {k:"Derivado de los datos", t:"Las relaciones se declaran en la ficha, con una frase que explica por qué existen. El mapa, la ruta de aprendizaje y la sección «Dónde encaja» salen de esos mismos datos."},
    {k:"Legibilidad a escala", t:"Con más de 40 temas, las ramas se muestran plegadas y se despliegan al pulsarlas, para que el mapa siga siendo legible."}
  ],
  src:[{t:"Documentación del propio manual (README del proyecto)", k:"interna"}],
  kw:["mapa","mapa mental","grafo","relaciones","conexiones","prerrequisitos","qué estudiar antes","ruta de aprendizaje","nodos","qué me falta"],
  tags:["manual","mapa"], upd:"2026-10-29", ver:{e:"interno", n:"Comprobado con la interfaz del propio manual."},
  rel:[
    {t:"necesita", a:"guia-fichas", w:"Cada punto del mapa es una ficha, y sus conexiones son las que se listan en «Dónde encaja»."},
    {t:"integra", a:"guia-busqueda", w:"El mapa tiene su propio buscador de conceptos y filtros por bloque, igual que el catálogo de Temas."}
  ]
}
];
