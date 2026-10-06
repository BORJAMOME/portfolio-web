/* ══════════════════════════════════════════════════════════════
   MANUAL DE POWER BI · contenido (1/2)
   Bloques del manual y temas de Fundamentos, Modelado y Power Query.
   Fuente: mis apuntes de Notion (libro «Impacta con Power BI» de
   Salvador Ramos, temario PL-300, masterclasses de NamasData y
   bootcamp de Data Analytics).
   Campos de cada tema:
     id, b (bloque), t (título), lvl (1-3), q (pregunta que responde)
     one (en una frase), friend (analogía), steps[], ex (ejemplo), key
     viz (visual interactivo), vizNote, caso{sec,q,html}, yes[], no[]
     code[{l,t,s}], conf[{t,d}], rec[], quiz{q,o[],a,w}, pro[{k,t}]
     exam[] (trampas de examen PL-300), src[] (de dónde sale)
   ══════════════════════════════════════════════════════════════ */
var BLOCKS = [
  {id:"fund", n:1, t:"Fundamentos", s:"Qué es BI, qué piezas tiene Power BI y el método BI7 para no empezar la casa por el tejado."},
  {id:"modelo", n:2, t:"Modelado de datos", s:"El modelo en estrella, las relaciones, el motor columnar y la tabla calendario: la base que decide si todo lo demás funciona."},
  {id:"pq", n:3, t:"Power Query", s:"Obtener, limpiar, transformar y combinar datos antes de que lleguen al modelo."},
  {id:"dax", n:4, t:"DAX", s:"Medidas, contextos de evaluación, CALCULATE, inteligencia de tiempo y las funciones modernas de DAX."},
  {id:"vis", n:5, t:"Visualización y storytelling", s:"Elegir el gráfico correcto, diseñar la interacción y contar una historia que termine en una decisión."},
  {id:"svc", n:6, t:"Service y gobierno", s:"Publicar, compartir, dar permisos, proteger filas y versionar el trabajo como un equipo de desarrollo."}
];

var TOPICS = [
/* ─────────────── 1 · FUNDAMENTOS ─────────────── */
{
  id:"bi", b:"fund", t:"Qué es BI y qué es Power BI", lvl:1,
  q:"¿Qué problema resuelve Power BI y de qué piezas está hecho?",
  one:"Business Intelligence es convertir datos dispersos en información fiable con la que tomar mejores decisiones; Power BI es la caja de herramientas de Microsoft para hacerlo de punta a punta.",
  friend:"Piensa en una cocina profesional. Power Query es el puesto donde se lavan y cortan los ingredientes, el modelo semántico es la despensa ordenada, DAX son las recetas, el informe es el plato emplatado y Power BI Service es el comedor donde se sirve a los clientes. Puedes tener el mejor emplatado del mundo, pero si la despensa está desordenada el plato sale mal.",
  steps:[
    "<b>Power Query</b> (ETL): se conecta a casi cualquier origen, transforma y limpia los datos y los carga en el modelo.",
    "<b>Modelo semántico</b>: base de datos analítica en memoria con tablas, relaciones y cálculos. Se consulta con DAX.",
    "<b>DAX</b>: el lenguaje con el que añades medidas, columnas y tablas calculadas al modelo.",
    "<b>Informes</b>: páginas con objetos visuales interactivos que responden a las preguntas de negocio.",
    "<b>Publicar</b>: el archivo .pbix sube a Power BI Service, donde el modelo y el informe se comparten, se actualizan y se protegen."
  ],
  ex:`<p>En el caso práctico del libro, <b>Tiendas AHORA</b> es una cadena de tiendas de conveniencia en zonas turísticas (prensa, bebidas, helados, souvenirs). Tienen un TPV que registra cada venta pero solo saben la recaudación diaria. Con Power BI conectan el TPV (SQL Server), los presupuestos (Excel) y los objetivos (CSV), los modelan en estrella y publican un informe que responde a «¿cuánto vendo, dónde, cuándo y con qué margen?».</p>`,
  key:"Power BI Desktop es donde se desarrolla (Power Query + modelo + DAX + informe); Power BI Service es donde se publica, comparte, actualiza y gobierna. Todo el desarrollo se hace en Desktop.",
  viz:"arquitectura",
  vizNote:"Pulsa cada pieza de la cadena. Fíjate en que el informe <b>no toca los datos de origen</b>: siempre lee del modelo semántico, y el modelo solo se rellena a través de Power Query.",
  caso:{sec:"Caso Tiendas AHORA", q:"Gerencia solo ve la recaudación del día", html:`<p>El TPV ya guarda cada línea de cada ticket, pero sus informes son fijos. El trabajo de BI no empieza por los gráficos: empieza por entender qué preguntas se hace la dirección (¿qué productos dejan más margen?, ¿cumplo objetivos por tienda?, ¿cómo voy frente al año pasado?) y por construir un modelo que pueda responderlas todas desde una única fuente de verdad.</p>`},
  yes:["Necesitas combinar varias fuentes (ERP, Excel, CSV, web) en un solo análisis.","Quieres informes interactivos que se actualicen solos.","Varios departamentos deben ver los mismos números con su propio enfoque."],
  no:["Solo necesitas una tabla puntual que nadie volverá a mirar: Excel basta.","El problema es transaccional (registrar ventas, facturar): eso es trabajo del ERP o del TPV.","Necesitas un documento pixel-perfect para imprimir: usa informes paginados (Report Builder)."],
  code:[],
  conf:[
    {t:"Power BI Desktop frente a Power BI Service", d:"Desktop es la herramienta de desarrollo (gratuita, en tu PC). Service es la plataforma en la nube para publicar, compartir, programar actualizaciones, crear paneles y apps. Los paneles solo existen en Service."},
    {t:"Informe frente a panel (dashboard)", d:"Un informe tiene varias páginas y está conectado a un único modelo semántico. Un panel es una sola página creada en Service que ancla visuales de distintos informes y modelos."}
  ],
  rec:["BI = transformar datos en información de calidad para decidir mejor.","Power BI Desktop = Power Query + modelo semántico + DAX + informes.","El informe nunca lee el origen directamente: lee del modelo.","Desarrolla siempre en Desktop y publica en Service."],
  quiz:{q:"¿Dónde se crea un panel (dashboard) que combine visuales de dos informes distintos?", o:["En Power BI Desktop, en una página nueva","En Power BI Service, anclando visuales de cada informe","En Power Query, combinando las dos consultas","En Excel, con Analizar en Excel"], a:1, w:"Los paneles solo existen en Power BI Service. Se construyen anclando (chincheta) visuales de informes publicados, aunque procedan de modelos semánticos distintos."},
  pro:[
    {k:"Arquitectura", t:"En organizaciones grandes se separa el modelo semántico (publicado una vez y certificado) de los informes que lo consumen con conexión dinámica. Así hay una única fuente de verdad y muchos informes ligeros."},
    {k:"Ecosistema", t:"Power BI forma parte de Microsoft Fabric: los modelos pueden leer de un Lakehouse con Direct Lake, y los flujos de datos Gen2 sustituyen a muchos procesos de Power Query en Desktop."}
  ],
  exam:["Si un enunciado pide combinar visuales de <b>varios informes</b> en una sola vista, la respuesta es un <b>panel</b>, no un informe.","Si piden un documento maquetado para exportar a PDF (facturas, listados largos), la respuesta es un <b>informe paginado</b>."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 1","Temario PL-300 (Alex Ayala, NamasData)"]
},
{
  id:"bi7", b:"fund", t:"El método BI7", lvl:1,
  q:"¿En qué orden se construye una solución de Power BI para no tener que rehacerla?",
  one:"Siete pasos en el sentido de las agujas del reloj: preguntas, diseño, Power Query, optimización, DAX, informes y compartir. Saltarse uno se paga más adelante.",
  friend:"Es como construir una casa: primero hablas con quien va a vivir en ella (preguntas), luego haces los planos (modelo en estrella y bocetos), después traes y preparas los materiales (Power Query), compruebas los cimientos (optimizar), instalas la fontanería (DAX), decoras (informes) y por último entregas las llaves (Service). Nadie pinta las paredes antes de tener los planos.",
  steps:[
    "<b>Toma de requisitos</b> y batería de preguntas de negocio (entre 50 y 100).",
    "<b>Diseño</b> del modelo en estrella y boceto de los informes, antes de abrir Power BI.",
    "<b>Power Query</b>: acceder, transformar, limpiar y cargar los datos hasta conseguir exactamente las tablas diseñadas.",
    "<b>Optimizar el modelo</b>: tipos de datos, ordenaciones, formatos, jerarquías y relaciones según el bus dimensional.",
    "<b>DAX</b>: crear los cálculos que responden a las preguntas de negocio.",
    "<b>Informes</b>: diseñar las páginas y cuadros de mando que responden a la batería de preguntas.",
    "<b>Compartir y colaborar</b> mediante Power BI Service."
  ],
  ex:`<p>Si en el paso 1 la gerencia de Tiendas AHORA pregunta «¿estoy cumpliendo los objetivos por tienda y mes?», en el paso 2 ya sabes que necesitas una segunda tabla de hechos (Presupuestos) con granularidad Tienda + Mes, y que debe compartir las dimensiones Tienda y Fecha con Ventas. Si te saltas el paso 2, lo descubres en el paso 6, con el informe a medias.</p>`,
  key:"Las preguntas van antes que las respuestas. El modelo de datos se diseña en papel (PowerPoint, Excel) antes de abrir Power BI; equivocarse ahí condiciona todo el proyecto.",
  viz:"bi7",
  vizNote:"Pulsa cada paso del ciclo. Observa que los pasos 2 y 4 son los que más se saltan en la práctica y los que más retrabajo generan.",
  caso:{sec:"Método en la práctica", q:"Un informe que «no cuadra» casi siempre es un paso 2 mal hecho", html:`<p>Cuando dos departamentos discuten porque sus cifras no coinciden, el problema rara vez es un gráfico: es que cada uno construyó su propio modelo. El método BI7 obliga a diseñar un modelo por <b>proceso de negocio</b> (Ventas, Compras, Stock) y no por departamento, de forma que todos beban de la misma fuente.</p>`},
  yes:["Cualquier proyecto nuevo de Power BI, por pequeño que sea.","Cuando heredas un informe caótico y necesitas rehacerlo con orden."],
  no:["Un prototipo exploratorio de una tarde para ver si los datos sirven: ahí puedes saltar al paso 3, pero tíralo después."],
  code:[],
  conf:[{t:"BI7 frente a «abrir Power BI y empezar a arrastrar»", d:"Arrastrar campos funciona con una tabla. Con varias fuentes y procesos acaba en relaciones bidireccionales, columnas calculadas por todas partes y totales que no cuadran."}],
  rec:["Orden: preguntas, diseño, Power Query, optimizar, DAX, informes, compartir.","El diseño del modelo se hace fuera de Power BI.","Un modelo por proceso de negocio, no por departamento."],
  quiz:{q:"Según el método BI7, ¿qué se hace justo después de cargar los datos con Power Query?", o:["Crear las medidas DAX","Diseñar los informes","Optimizar el modelo: tipos, ordenaciones, jerarquías y relaciones","Publicar en Power BI Service"], a:2, w:"El paso 4 es optimizar el modelo. Las medidas DAX (paso 5) se escriben sobre un modelo ya ajustado; si cambias tipos o relaciones después, tendrás que revisar los cálculos."},
  pro:[{k:"Iteración", t:"En proyectos reales el ciclo se repite: el MVP cubre las 10-15 preguntas prioritarias y cada iteración añade preguntas nuevas sin romper el modelo. Un buen diseño en estrella es lo que permite crecer sin rehacer."}],
  exam:[],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 1: método BI7"]
},
{
  id:"preguntas", b:"fund", t:"Preguntas de negocio", lvl:1,
  q:"¿Cómo convierto lo que me pide la dirección en algo que un modelo de datos pueda responder?",
  one:"Toda pregunta de negocio se descompone en algo que medir, algo que lo describe, algo por lo que filtrar y algo por lo que agrupar; eso te dice qué tablas y columnas necesitas.",
  friend:"Una pregunta de negocio es como un pedido en un restaurante: «un café con leche, sin azúcar, para llevar». Hay un producto (lo que se mide), unas condiciones (filtros) y una forma de servirlo (agrupación). Si el camarero no apunta las condiciones, el café llega mal aunque esté bien hecho.",
  steps:[
    "Reserva <b>30 minutos al día durante una semana</b> para escribir preguntas. Rinde más que tres horas seguidas.",
    "Escríbelas <b>todas</b>, aunque parezcan básicas o raras. Apunta las que surjan durante el día (una nota de voz basta).",
    "Si son varias personas, que cada una haga su lista <b>por separado</b> antes de ponerlas en común.",
    "En una reunión, unifica, elimina duplicados y descarta preguntas abiertas que no se pueden medir.",
    "Prioriza: de cada 100 preguntas quédate con <b>10-15</b> para la primera versión."
  ],
  ex:`<p>«¿Cuál es el importe vendido de la categoría Bebidas en la tienda de Águilas en mayo de 2019?»</p>
<div class="tw"><table class="t"><thead><tr><th>Pieza</th><th>En la pregunta</th><th>De qué tabla sale</th></tr></thead><tbody>
<tr><td>Algo que medir</td><td>Importe vendido</td><td>Hechos: Ventas[ImporteVenta]</td></tr>
<tr><td>Filtro 1</td><td>Categoría = Bebidas</td><td>Dimensión Producto</td></tr>
<tr><td>Filtro 2</td><td>Tienda = Águilas</td><td>Dimensión Tienda</td></tr>
<tr><td>Filtro 3</td><td>Mayo de 2019</td><td>Dimensión Fecha</td></tr></tbody></table></div>
<p class="res">Lo que se mide siempre sale de los hechos; cómo se filtra y agrupa, de las dimensiones.</p>`,
  key:"Cuanto mejores sean las preguntas, mejores respuestas. Las preguntas sirven tres veces: para diseñar el modelo, para validarlo y para decidir qué visual responde mejor a cada una.",
  viz:"preguntas",
  vizNote:"Elige una pregunta de Tiendas AHORA y mira cómo se descompone. Fíjate en que la medida casi siempre es la misma; lo que cambia son las dimensiones.",
  caso:{sec:"Batería real", q:"Algunas preguntas de la gerencia de Tiendas AHORA", html:`<ul><li>¿Cuánto vendo por tienda, provincia y país? ¿Cada día, semana, mes, en Semana Santa?</li><li>¿Qué productos dejan más beneficio? ¿Tienen el mismo margen en todas las tiendas?</li><li>¿Cumplo los objetivos mes a mes? ¿Qué tiendas se desvían más?</li><li>¿Cuánto suben o bajan las ventas frente al mes y al año anterior?</li><li>¿Cuánto me compra cada cliente que entra? (ticket medio) ¿Es igual en todas las tiendas y meses?</li><li>¿Cómo se comporta cada categoría a lo largo del año? ¿Dónde están sus picos y valles?</li></ul>`},
  yes:["Siempre, al inicio de cualquier proyecto.","Para validar el modelo: si una pregunta prioritaria no se puede responder, falta algo."],
  no:["No sustituye a hablar con los usuarios: una lista inventada por el analista no vale."],
  code:[],
  conf:[{t:"Pregunta de negocio frente a petición de gráfico", d:"«Quiero un gráfico de tarta por región» es una petición de formato. La pregunta de fondo puede ser «¿qué región aporta más al total?», y quizá se responda mejor con barras ordenadas."}],
  rec:["Medir + describir + filtrar + agrupar.","Lo que se mide, de los hechos; el contexto, de las dimensiones.","Prioriza 10-15 de cada 100 para el MVP."],
  quiz:{q:"En «ventas de helados por mes en las tiendas de Almería», ¿qué es lo que se mide?", o:["Los helados","Las ventas","Los meses","Almería"], a:1, w:"Se mide el importe de ventas (hechos). Helados es un filtro de Producto, Almería un filtro de Tienda/geografía y mes es la agrupación de la dimensión Fecha."},
  pro:[{k:"Entrevistas", t:"Pregunta para qué es el informe, cómo se medirá su éxito, qué métricas se usan hoy, qué decisiones se tomarán con él y cuáles son las tres preguntas más importantes que debe resolver."}],
  exam:[],
  src:["Impacta con Power BI (Salvador Ramos), capítulos 1 y 2","Storytelling con datos con Power BI (Paula García)"]
},

/* ─────────────── 2 · MODELADO ─────────────── */
{
  id:"estrella", b:"modelo", t:"El modelo en estrella", lvl:1,
  q:"¿Cómo organizo las tablas para que cualquier pregunta se responda rápido y sin contradicciones?",
  one:"Una tabla de hechos en el centro con lo que ha ocurrido y lo que se mide, rodeada de tablas de dimensiones con los puntos de vista desde los que se analiza.",
  friend:"Imagina un ticket de compra pegado en el centro de una mesa. Alrededor pones fichas: quién compró, cuándo, dónde, qué producto y quién atendió. El ticket solo guarda números y referencias a las fichas; las fichas guardan todos los detalles. Para cualquier pregunta tiras de una ficha y te lleva a los tickets que te interesan.",
  steps:[
    "Elige el <b>proceso de negocio</b> a analizar (Ventas, Compras, Stock, Finanzas).",
    "Diseña la <b>tabla de hechos</b>: define su granularidad, sus claves externas y sus medidas.",
    "Diseña cada <b>dimensión</b>: una clave principal y una columna por cada característica por la que quieras filtrar o agrupar.",
    "Valida las <b>relaciones</b>: un par clave externa / clave principal por dimensión, con el mismo tipo de datos y valores comunes.",
    "Si hay varias estrellas, documenta qué dimensiones comparten en el <b>bus dimensional</b>."
  ],
  ex:`<div class="tw"><table class="t"><thead><tr><th></th><th>Hechos</th><th>Dimensiones</th></tr></thead><tbody>
<tr><td>Qué guardan</td><td>Lo que ha ocurrido: medidas y claves</td><td>Puntos de vista: atributos descriptivos</td></tr>
<tr><td>Forma</td><td>Estrechas y largas (millones de filas)</td><td>Anchas y cortas</td></tr>
<tr><td>Crecimiento</td><td>Constante</td><td>Lento</td></tr>
<tr><td>Ejemplo</td><td>Ventas (una fila por línea de ticket)</td><td>Cliente, Fecha, Tienda, Producto, Empleado</td></tr></tbody></table></div>
<p class="res">Recuerda el orden: <b>hechos, dimensiones, relaciones</b>, en el sentido de las agujas del reloj.</p>`,
  key:"La granularidad (el nivel de detalle de cada fila de hechos) se fija con el detalle que piden las preguntas y el máximo disponible en el origen. Ventas por línea de ticket es la opción recomendada: siempre puedes agregar, nunca desagregar.",
  viz:"estrella",
  vizNote:"Pulsa cada dimensión para ver qué pregunta contesta y qué par de claves la une a los hechos. Cambia la granularidad y mira qué preguntas dejan de poder responderse.",
  caso:{sec:"Departamentos frente a procesos", q:"Marketing dice 100 camisetas, Facturación 95 y Tiendas 110", html:`<p>Ocurre cuando cada departamento tiene su propio modelo. La solución es una única estrella por <b>proceso de negocio</b> (Ventas) a la que se van añadiendo las necesidades de cada área. Los cuadros de mando sí son por departamento, cada uno con sus KPI; la base de datos analítica es única.</p>`},
  yes:["Prácticamente siempre en Power BI: el motor está optimizado para estrellas.","Cuando varias tablas de hechos comparten dimensiones (Ventas y Presupuestos comparten Tienda y Fecha)."],
  no:["Copo de nieve (dimensiones encadenadas, como Producto, Subcategoría y Categoría) solo si hay un motivo; en general se desnormaliza en Power Query.","Una tabla plana gigante con todo: funciona con pocos datos, pero multiplica el tamaño y complica el DAX."],
  code:[],
  conf:[
    {t:"Estrella frente a copo de nieve", d:"En la estrella cada dimensión se une directamente a los hechos. En el copo de nieve una dimensión cuelga de otra. El copo de nieve añade saltos de relación y filtros más lentos; en Power BI se prefiere aplanar."},
    {t:"Hechos frente a dimensiones", d:"Si una columna se suma, cuenta o promedia, va a hechos. Si sirve para filtrar, agrupar o describir, va a una dimensión."}
  ],
  rec:["Hechos en el centro: medidas y claves externas.","Dimensiones alrededor: clave principal y atributos.","Granularidad = nivel de detalle de cada fila de hechos.","Un modelo por proceso de negocio, compartiendo dimensiones."],
  quiz:{q:"Tu tabla de presupuesto tiene una fila por tienda y mes. ¿Qué pregunta NO podrá responder?", o:["Presupuesto de la tienda de Águilas en marzo","Presupuesto total de 2024","Presupuesto por producto","Presupuesto por provincia"], a:2, w:"La granularidad es Tienda + Mes. No hay detalle por producto, así que el presupuesto por producto no existe en esos datos. Provincia sí se puede, porque es un atributo de la dimensión Tienda."},
  pro:[
    {k:"Dimensiones de rol", t:"Una misma dimensión puede tener varios papeles (fecha de pedido, fecha de envío). En Power BI se resuelve con una relación activa y otras inactivas que activas con USERELATIONSHIP, o duplicando la dimensión."},
    {k:"Bus dimensional", t:"Matriz de procesos (filas) por dimensiones (columnas). De un vistazo ves qué hechos comparten qué dimensiones y dónde puedes cruzar análisis, por ejemplo ventas frente a presupuesto por tienda y mes."}
  ],
  exam:["Si te preguntan qué tipo de modelo aparece en un diagrama con una dimensión colgando de otra, es un <b>copo de nieve</b>.","Una columna de texto descriptiva en la tabla de hechos (como Ticket) solo debe quedarse visible si no existe en ninguna dimensión."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 2","Curso de modelado de datos en estrella con Power BI (Salvador Ramos)"]
},
{
  id:"plana", b:"modelo", t:"De tabla plana a modelo en estrella", lvl:2,
  q:"Me llega un Excel enorme con todo junto, ¿cómo lo convierto en hechos y dimensiones?",
  one:"Duplicas la consulta una vez por dimensión, dejas en cada copia solo sus columnas sin duplicados, les das un índice y sustituyes en los hechos los textos por esos índices.",
  friend:"Es como ordenar un cajón de tickets en el que cada ticket repite el nombre completo de la tienda, su dirección y su provincia. Haces una agenda de tiendas con un número para cada una y en los tickets solo escribes el número. Ocupa mucho menos y si la tienda cambia de nombre lo corriges una vez.",
  steps:[
    "Identifica qué columnas son dimensiones o atributos (truco: conserva una fila, usa encabezados como primera fila y transpón para verlas en vertical).",
    "Duplica la consulta original tantas veces como dimensiones hayas encontrado.",
    "En cada dimensión, elimina las columnas que no le corresponden.",
    "Quita filas duplicadas en cada dimensión.",
    "Añade una columna de índice (desde 1) y renómbrala (IdTienda, IdProducto).",
    "Combina la tabla de hechos con cada dimensión para traer su Id (las columnas deben tener el mismo tipo).",
    "Elimina de los hechos las columnas descriptivas que ya viven en las dimensiones.",
    "Cierra y aplica, y comprueba en la vista de modelo que las relaciones son 1 a varios."
  ],
  ex:`<p>Una tabla de ventas plana tiene Fecha, Tienda, Provincia, Canal, Producto, Fabricante, Unidades e Importe. Se convierte en <b>Ventas</b> (Fecha, IdTienda, IdCanal, IdProducto, Unidades, Importe) y tres dimensiones: <b>Tienda</b> (IdTienda, Tienda, Provincia), <b>Canal</b> (IdCanal, Canal) y <b>Producto</b> (IdProducto, Producto, Fabricante).</p><p class="res">Si un mismo producto lo fabrican en varios países, combina por Producto <b>y</b> Fabricante: el orden en que seleccionas las columnas arriba y abajo debe ser el mismo.</p>`,
  key:"Duplicar crea una copia independiente de todos los pasos; referenciar crea una consulta que lee el resultado de la original y hereda sus cambios. Para sacar dimensiones de una tabla plana se suele referenciar una consulta base limpia.",
  viz:"plana",
  vizNote:"Avanza paso a paso. Fíjate en cómo los textos repetidos de la tabla de hechos desaparecen y se convierten en números pequeños: eso es lo que hace que el modelo comprima.",
  caso:{sec:"Examen PL-300", q:"La trampa del tipo de datos al combinar", html:`<p>Al combinar la tabla de hechos con una dimensión para traer el Id, las columnas de unión deben tener <b>el mismo tipo</b> (texto con texto, número con número). Si una es texto y la otra número, la combinación no encuentra coincidencias y el Id llega vacío.</p>`},
  yes:["Te entregan un Excel o CSV exportado de un sistema con todo en una sola hoja.","Quieres reducir el tamaño del modelo y simplificar el DAX."],
  no:["Si tienes acceso a la base de datos origen, es mejor construir las dimensiones con vistas SQL allí."],
  code:[{l:"M", t:"Columna de índice como clave de una dimensión", s:`let
    Origen = Ventas_Plana,
    Columnas = Table.SelectColumns(Origen, {"Tienda", "Provincia"}),
    SinDuplicados = Table.Distinct(Columnas),
    ConIndice = Table.AddIndexColumn(SinDuplicados, "IdTienda", 1, 1, Int64.Type)
in
    ConIndice`}],
  conf:[{t:"Duplicar frente a referenciar", d:"Duplicar copia todos los pasos y la nueva consulta es independiente. Referenciar solo tiene un paso (apuntar a la original) y cualquier cambio en la original se propaga."},{t:"Quitar duplicados a nivel de tabla o de columna", d:"A nivel de tabla compara la fila entera. A nivel de columna mira solo esa columna y puede eliminar filas que difieren en otras columnas: cuidado."}],
  rec:["Una consulta por dimensión: columnas propias, sin duplicados, con índice.","Combina para llevar el Id a los hechos (mismo tipo de datos).","Los hechos se quedan con claves y medidas.","Nombres de negocio: Tienda, no DIM_Tienda."],
  quiz:{q:"Quieres crear varias consultas que partan de la misma tabla limpia y que hereden sus cambios futuros. ¿Qué usas?", o:["Duplicar","Referenciar","Anexar","Combinar"], a:1, w:"Referenciar crea una consulta que lee el resultado de la original; si cambias la original, todas las referencias se actualizan. Duplicar copia los pasos y queda independiente."},
  pro:[{k:"Nombres", t:"Microsoft recomienda nombres de negocio, sin prefijos ni sufijos técnicos (nada de DIM_ o FACT_). El usuario del informe verá esos nombres en el panel de datos."},{k:"Claves subrogadas", t:"Un índice entero pequeño ocupa mucho menos que un código de cliente largo. Bravo te permite comprobar el ahorro columna a columna, aunque el paso de combinación puede hacer más lenta la actualización: es un equilibrio entre tamaño y tiempo de refresco."}],
  exam:["Las columnas que usas para combinar consultas deben ser del <b>mismo tipo de datos</b>.","«Usar coincidencias aproximadas» en una combinación empareja textos parecidos (fuzzy matching)."],
  src:["Temario PL-300: Preparar los datos (Alex Ayala, NamasData)"]
},
{
  id:"relaciones", b:"modelo", t:"Relaciones y cardinalidad", lvl:2,
  q:"¿Cómo se propagan los filtros entre tablas y qué tipo de relación debo usar?",
  one:"Las relaciones son el camino por el que viajan los filtros: de la dimensión (lado uno) a los hechos (lado varios), en un solo sentido salvo excepciones.",
  friend:"Una relación es como una tubería con una válvula antirretorno. El agua (el filtro) baja de la dimensión a los hechos. Si abres la válvula en los dos sentidos (bidireccional) el agua puede volver hacia arriba y llegar a sitios que no esperabas, sobre todo cuando hay varias tuberías.",
  steps:[
    "Crea relaciones <b>uno a varios</b> desde la clave principal de la dimensión hasta la clave externa de los hechos.",
    "Deja la dirección de filtro cruzado en <b>única</b> (de la dimensión a los hechos).",
    "Comprueba que las dos columnas tienen el mismo tipo y valores comunes.",
    "Usa varios a varios, uno a uno y filtros bidireccionales solo como excepción justificada.",
    "Si hay dos caminos posibles entre tablas, solo uno puede estar activo; el otro se activa en una medida con USERELATIONSHIP."
  ],
  ex:`<div class="tw"><table class="t"><thead><tr><th>Tipo</th><th>Cuándo</th><th>Consejo</th></tr></thead><tbody>
<tr><td>Uno a varios (1:*)</td><td>Dimensión a hechos</td><td>La norma. Unidireccional.</td></tr>
<tr><td>Varios a varios (*:*)</td><td>Tablas con granularidades distintas (presupuesto por mes frente a fecha diaria)</td><td>Excepcional. Resultados inesperados si no dominas su comportamiento.</td></tr>
<tr><td>Uno a uno (1:1)</td><td>Dos tablas con una fila por elemento</td><td>Mejor unirlas en Power Query.</td></tr></tbody></table></div>
<p class="res">Limitaciones: una relación usa una sola columna por lado, no puede unir una tabla consigo misma, solo una puede estar activa entre dos tablas y no se permiten referencias circulares.</p>`,
  key:"Relaciones 1:* unidireccionales de dimensiones a hechos en la inmensa mayoría de casos. Los filtros bidireccionales y las relaciones varios a varios son herramientas para problemas concretos, no una configuración por defecto.",
  viz:"relaciones",
  vizNote:"Selecciona un valor en una tabla y mira por dónde viaja el filtro. Activa el filtro bidireccional y observa cómo un filtro en Ventas llega hasta Producto: útil a veces, peligroso por defecto.",
  caso:{sec:"Repaso PL-300", q:"Leer bien la cardinalidad", html:`<p>Entre Cliente y Ventas, «uno a varios entre Cliente y Ventas» y «varios a uno entre Ventas y Cliente» describen <b>la misma relación</b>; en el examen fíjate en el orden en que se nombran las tablas. Una relación uno a uno entre Cliente y Ventas solo ocurriría si cada cliente hubiera comprado exactamente una vez.</p>`},
  yes:["Unidireccional 1:* para el 95 % de las relaciones.","Bidireccional en una tabla puente de un varios a varios controlado.","USERELATIONSHIP para dimensiones de rol (fecha de pedido y fecha de envío)."],
  no:["Bidireccional para «que funcione el segmentador»: suele indicar un problema de diseño.","Relaciones entre dos tablas de hechos: relaciónalas a través de dimensiones comunes."],
  code:[{l:"DAX", t:"Activar una relación inactiva en una medida", s:`Ventas por fecha de envío =
CALCULATE (
    [Ventas],
    USERELATIONSHIP ( Ventas[FechaEnvio], Fecha[Fecha] )
)`},{l:"DAX", t:"Cambiar la dirección de filtro solo en una medida", s:`Clientes con compra =
CALCULATE (
    COUNTROWS ( Cliente ),
    CROSSFILTER ( Ventas[IdCliente], Cliente[IdCliente], BOTH )
)`}],
  conf:[{t:"Relación inactiva frente a eliminarla", d:"La inactiva (línea discontinua) sigue en el modelo y la activas cuando la necesitas con USERELATIONSHIP. Eliminarla te obliga a recrearla."},{t:"Bidireccional en el modelo frente a CROSSFILTER", d:"Bidireccional en el modelo afecta a todos los cálculos. CROSSFILTER dentro de CALCULATE solo cambia la dirección para esa medida."}],
  rec:["1:* unidireccional de dimensión a hechos.","Una sola relación activa entre dos tablas.","USERELATIONSHIP activa una relación inactiva dentro de CALCULATE.","Bidireccional y *:* solo por excepción."],
  quiz:{q:"Tu tabla de hechos tiene FechaPedido y FechaEnvio, ambas relacionadas con Fecha. ¿Qué ocurre?", o:["Las dos relaciones están activas a la vez","Solo una está activa; la otra queda inactiva y se usa con USERELATIONSHIP","Power BI no permite la segunda relación","Debes marcar ambas como bidireccionales"], a:1, w:"Entre dos tablas solo puede haber una relación activa. La segunda queda inactiva (línea discontinua) y se activa dentro de una medida con CALCULATE y USERELATIONSHIP."},
  pro:[{k:"RLS y bidireccional", t:"Si dos tablas tienen seguridad a nivel de fila y necesitas filtro bidireccional entre ellas, activa «Aplicar filtro de seguridad en ambas direcciones» en la relación; si no, la seguridad solo viaja en un sentido."},{k:"TREATAS", t:"Cuando no puedes o no quieres crear una relación física (por ejemplo, entre tablas desconectadas), TREATAS aplica los valores de una tabla como filtro sobre columnas de otra dentro de CALCULATE."}],
  exam:["Varios a varios entre Cliente y Ventas es <b>imposible</b> si cada venta tiene un único cliente.","Si dos tablas con RLS necesitan filtro bidireccional que respete la seguridad: marca <b>aplicar filtro de seguridad en ambas direcciones</b>.","En una pregunta de diagrama con flechas dobles entre una dimensión y los hechos, la corrección suele ser <b>quitar la doble dirección</b>."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 4","Temario PL-300: Repaso general","Curso DAX (Javier Sánchez Rivero), tema 2"]
},
{
  id:"vertipaq", b:"modelo", t:"Motor columnar y optimización", lvl:2,
  q:"¿Por qué mi modelo ocupa tanto y cómo lo hago más pequeño y rápido?",
  one:"Power BI guarda cada columna por separado, ordenada y comprimida en memoria; cuantos menos valores distintos tenga una columna (menos cardinalidad), menos ocupa.",
  friend:"Imagina que tienes que apuntar el país de 800.000 clientes: 760.000 de España y 40.000 de Francia. En lugar de escribir «España» 760.000 veces, escribes «España: filas 1 a 760.000; Francia: el resto». Eso es compresión columnar. Ahora intenta hacer lo mismo con un número de ticket que no se repite nunca: imposible.",
  steps:[
    "Asigna a cada columna el <b>tipo de datos óptimo</b>: entero si no hay decimales, decimal fijo con 1 a 4 decimales, decimal con 5 o más.",
    "<b>Elimina columnas</b> que ninguna pregunta de negocio necesita (las de «por si acaso»).",
    "Sustituye <b>columnas calculadas</b> por medidas siempre que puedas.",
    "<b>Reduce la cardinalidad</b>: separa fecha y hora, divide códigos compuestos en sus partes, redondea o agrupa.",
    "Mide antes y después con <b>Bravo</b> o DAX Studio (VertiPaq Analyzer)."
  ],
  ex:`<p>En Tiendas AHORA el modelo ocupaba <b>23,95 MB</b> y la columna Ticket se llevaba el 74 %. El ticket «S1-18-005-2324108» era en realidad Serie + Año + Tienda + Número. Al dividirlo en cuatro columnas con Power Query (y crear una jerarquía con ellas), el modelo bajó a <b>8,12 MB</b>, un 66 % menos.</p>
<div class="tw"><table class="t"><thead><tr><th>Columna</th><th class="n">Tamaño</th></tr></thead><tbody><tr><td>Ticket (original)</td><td class="n">17,78 MB</td></tr><tr><td>Serie</td><td class="n">17 KB</td></tr><tr><td>Año</td><td class="n">17 KB</td></tr><tr><td>Tienda</td><td class="n">19 KB</td></tr><tr><td>Nº ticket</td><td class="n">1,83 MB</td></tr></tbody></table></div>`,
  key:"Las bases de datos relacionales (SQL Server) guardan por filas en disco y están pensadas para muchas escrituras pequeñas; el motor de Power BI (VertiPaq) guarda por columnas en RAM, comprime y está pensado para leer muchas filas a la vez.",
  viz:"compresion",
  vizNote:"Mueve el número de valores distintos y mira cómo se dispara el tamaño. Después prueba a dividir la columna fecha-hora: la cardinalidad total baja de golpe.",
  caso:{sec:"Examen PL-300", q:"¿Qué columna ocupa más: fecha y hora juntas o separadas?", html:`<p>Juntas. Un año de datos con hora al segundo puede tener millones de valores distintos; separadas, la fecha tiene como mucho 366 valores y la hora 86.400. Si quieres afinar todavía más, extrae hora, minuto y segundo en columnas distintas o redondea a la precisión que el negocio necesite.</p>`},
  yes:["Siempre que el modelo pase de unas decenas de MB.","Antes de publicar en Service, donde el tamaño y el tiempo de actualización cuentan."],
  no:["No sacrifiques una columna que responde a una pregunta prioritaria solo por ahorrar espacio."],
  code:[{l:"Tipos", t:"Criterio para columnas numéricas", s:`Sin decimales           -> Número entero      (8 bytes, el más eficiente)
Entre 1 y 4 decimales   -> Decimal fijo       (siempre 4 decimales, hasta 19 dígitos)
5 decimales o más       -> Número decimal     (coma flotante, hasta 15 dígitos)
Códigos con ceros (CP)  -> Texto              (03345 no es 3345)`}],
  conf:[{t:"Tipo de datos frente a formato", d:"El tipo decide cómo se guarda y cómo se calcula (con todos sus decimales). El formato solo decide cómo se muestra: 1,6275 con formato de 2 decimales se ve 1,63 pero se calcula con 1,6275."},{t:"Tamaño del modelo frente a velocidad de Power Query", d:"Una clave subrogada reduce el modelo, pero la combinación que la crea alarga la actualización. Decide qué te importa más con las herramientas de diagnóstico de Power Query."}],
  rec:["Cuanto más se repiten los valores, más comprime.","Separa fecha y hora; divide códigos compuestos.","Tipo de datos óptimo en cada columna; evita «Cualquiera».","Mide con Bravo o DAX Studio."],
  quiz:{q:"¿Qué cambio reducirá más el tamaño de una tabla de 10 millones de filas?", o:["Cambiar el formato de la columna Importe a 2 decimales","Separar la columna FechaHora en Fecha y Hora","Ocultar la columna en la vista de informes","Ordenar la tabla por fecha en Power Query"], a:1, w:"Separar fecha y hora reduce muchísimo la cardinalidad. El formato no cambia cómo se almacena y ocultar una columna no la elimina del modelo."},
  pro:[{k:"Columnas de texto largas", t:"Evita columnas de observaciones o comentarios salvo que sean imprescindibles: el texto se guarda en Unicode (2 bytes por carácter) y casi no se repite."},{k:"Auto fecha/hora", t:"Desactiva la inteligencia de tiempo automática en modelos serios: crea una tabla de fechas oculta por cada columna de fecha y engorda el modelo sin que lo veas."}],
  exam:["Te preguntarán qué tabla o columna es más grande: la que tiene <b>fecha y hora juntas</b>.","Reducir la cardinalidad agrupando valores (discretización) también es una técnica de optimización válida."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 4","Temario PL-300: Optimizar el rendimiento del modelo","Bravo para Power BI (NamasData)"]
},
{
  id:"calendario", b:"modelo", t:"La tabla calendario", lvl:1,
  q:"¿Cómo creo una dimensión Fecha que haga funcionar la inteligencia de tiempo?",
  one:"Una tabla con una fila por cada día, del 1 de enero del primer año al 31 de diciembre del último, marcada como tabla de fechas y relacionada con las fechas de los hechos.",
  friend:"La tabla calendario es como un calendario de pared completo en el que no falta ningún día, aunque ese día no se vendiera nada. Si arrancas las hojas de los domingos porque cerraste, luego no puedes contar cuántos domingos han pasado ni comparar semanas completas.",
  steps:[
    "Créala en el <b>origen</b> si puedes; si no, con Power Query (lenguaje M) o con DAX.",
    "Debe ir del <b>1 de enero</b> del año mínimo al <b>31 de diciembre</b> del año máximo, sin huecos.",
    "Añade las columnas que el negocio necesite: año, trimestre, mes, nombre del mes, semana, día de la semana, festivo, temporada, campaña, año fiscal.",
    "Ordena las columnas de texto por su número (NombreMes por Mes) con <b>Ordenar por columna</b>.",
    "<b>Márcala como tabla de fechas</b> y relaciónala 1:* con las fechas de los hechos.",
    "Desactiva la fecha/hora automática."
  ],
  ex:`<p>CALENDARAUTO() parece cómodo pero escanea <b>todas</b> las fechas del modelo. Si añades la fecha de nacimiento de los empleados, el calendario empezará en 1960 y tus gráficos de tiempo tendrán décadas vacías. Con CALENDAR controlas el rango a partir de la tabla de hechos.</p>`,
  key:"La dimensión Fecha es la más importante de casi todos los modelos. Sin ella, marcada y completa, las funciones de inteligencia de tiempo dan resultados erróneos o directamente fallan.",
  viz:"calendario",
  vizNote:"Elige el rango de años y mira las filas y columnas que se generan. Fíjate en que el número de filas siempre es 365 o 366 por año: si no, falta algo.",
  caso:{sec:"Dos tablas de hechos con fechas distintas", q:"Solicitudes por fecha de apertura y por fecha de cierre", html:`<p>Si cada tabla de hechos usa su propia columna de fecha como eje, los gráficos no se pueden cruzar. La solución es una única tabla calendario relacionada con las dos (una relación activa y la otra inactiva si es la misma tabla de hechos).</p>`},
  yes:["En todo modelo con análisis temporal.","Cuando necesitas periodos fiscales, campañas o temporadas que el calendario natural no tiene."],
  no:["La tabla automática de Power BI (Auto fecha/hora) en modelos de producción."],
  code:[{l:"DAX", t:"Calendario con CALENDAR y ADDCOLUMNS", s:`Fecha =
VAR AnyoMin = YEAR ( MIN ( Ventas[Fecha] ) )
VAR AnyoMax = YEAR ( MAX ( Ventas[Fecha] ) )
RETURN
ADDCOLUMNS (
    CALENDAR ( DATE ( AnyoMin, 1, 1 ), DATE ( AnyoMax, 12, 31 ) ),
    "Año", YEAR ( [Date] ),
    "Mes", MONTH ( [Date] ),
    "NombreMes", FORMAT ( [Date], "MMMM" ),
    "Trimestre", "T" & QUARTER ( [Date] ),
    "AñoMes", FORMAT ( [Date], "YYYY-MM" ),
    "DiaSemana", WEEKDAY ( [Date], 2 ),
    "Laborable", IF ( WEEKDAY ( [Date], 2 ) <= 5, "Laborable", "Fin de semana" ),
    "FinMes", EOMONTH ( [Date], 0 )
)`},{l:"M", t:"Calendario en Power Query", s:`let
    FechaInicial = Date.StartOfYear(Date.From(List.Min(Ventas[Fecha]))),
    FechaFinal   = Date.EndOfYear(Date.From(List.Max(Ventas[Fecha]))),
    NumDias      = Duration.Days(FechaFinal - FechaInicial) + 1,
    Fechas       = List.Dates(FechaInicial, NumDias, #duration(1, 0, 0, 0)),
    Tabla        = Table.FromList(Fechas, Splitter.SplitByNothing(), {"Fecha"}),
    Tipo         = Table.TransformColumnTypes(Tabla, {{"Fecha", type date}}),
    Año          = Table.AddColumn(Tipo, "Año", each Date.Year([Fecha]), Int64.Type),
    Mes          = Table.AddColumn(Año, "Mes", each Date.Month([Fecha]), Int64.Type),
    NombreMes    = Table.AddColumn(Mes, "NombreMes", each Date.MonthName([Fecha]), type text)
in
    NombreMes`}],
  conf:[{t:"CALENDAR frente a CALENDARAUTO", d:"CALENDAR(inicio, fin) usa el rango que tú le das. CALENDARAUTO() busca la fecha mínima y máxima de todo el modelo, incluidas columnas que no tienen nada que ver con el análisis."},{t:"Eje continuo frente a categórico", d:"Con eje categórico se dibujan todos los puntos y aparece scroll. Con eje continuo (por ejemplo, FinMes como fecha con formato mmm yy) el gráfico cabe sin scroll."}],
  rec:["Una fila por día, años completos, sin huecos.","Márcala como tabla de fechas.","Ordena NombreMes por Mes.","Mejor en origen, luego M, luego DAX."],
  quiz:{q:"¿Por qué CALENDARAUTO puede generar un calendario desde 1960 en un modelo de ventas de 2020 a 2024?", o:["Porque siempre empieza en 1960","Porque escanea todas las columnas de fecha del modelo, incluida la fecha de nacimiento de los empleados","Porque usa la fecha mínima de Windows","Porque la tabla no está marcada como tabla de fechas"], a:1, w:"CALENDARAUTO recorre todas las columnas de tipo fecha del modelo. Una fecha de nacimiento antigua amplía el rango y deja décadas vacías en los gráficos."},
  pro:[{k:"Columnas de desvío", t:"Añade DesvíoDías, DesvíoMes y DesvíoAño respecto a hoy (DATEDIFF(TODAY(), [Date], MONTH)). Permiten filtros relativos estables, como «últimos 12 meses cerrados», sin DAX complejo."},{k:"Calendario fiscal", t:"Si el ejercicio empieza en septiembre, añade AñoFiscal y MesFiscal, y usa el tercer argumento de DATESYTD o TOTALYTD («31/08») para los acumulados."}],
  exam:["Para que funcionen las funciones de inteligencia de tiempo, la tabla debe estar <b>marcada como tabla de fechas</b> y tener fechas contiguas."],
  src:["Temario PL-300: Crear cálculos de modelos mediante DAX","Impacta con Power BI (Salvador Ramos), capítulo 6"]
},

/* ─────────────── 3 · POWER QUERY ─────────────── */
{
  id:"obtener", b:"pq", t:"Obtener datos y modos de conexión", lvl:1,
  q:"¿Cómo me conecto a cada origen y cuándo uso Importar o DirectQuery?",
  one:"Power Query se conecta a cientos de orígenes; por defecto usa Importar (copia comprimida en el modelo) y DirectQuery solo cuando necesitas datos casi en tiempo real o volúmenes que no caben.",
  friend:"Importar es hacer la compra semanal y tener la nevera llena: cocinas rapidísimo, pero lo que hay es lo que compraste el sábado. DirectQuery es pedir a domicilio cada vez que tienes hambre: siempre está fresco, pero cada plato tarda y depende del restaurante.",
  steps:[
    "Inicio > Obtener datos y elige el conector: Archivo, Base de datos, Microsoft (Power Platform, Azure), Servicios en línea, Otras o Consulta en blanco.",
    "Para <b>SQL Server</b>: servidor, base de datos opcional y modo de conectividad. Deja Importar salvo que tengas claro por qué no. En Opciones avanzadas puedes escribir la consulta SQL.",
    "Para <b>CSV</b>: revisa el origen de archivo (codificación, para no romper eñes y tildes), el delimitador y la detección de tipos.",
    "Para <b>Excel</b>: importa tablas con nombre en lugar de hojas, así no arrastras comentarios ni celdas sueltas.",
    "Para varios archivos iguales (un CSV por año), usa el conector <b>Carpeta</b> y combina."
  ],
  ex:`<p>Un informe antifraude con tarjetas necesita datos que no tengan más de 5 minutos de antigüedad. Con Importar no llegas: el modelo semántico se puede actualizar 8 veces al día con licencia Pro y 48 con Premium. Con <b>DirectQuery</b> y la actualización automática de página cada 5 minutos, sí.</p>`,
  key:"Importar es más rápido y tiene todas las funciones de DAX y Power Query; DirectQuery delega cada consulta al origen. El modo compuesto mezcla ambos: dimensiones importadas y una tabla de hechos enorme en DirectQuery.",
  viz:"modos",
  vizNote:"Ajusta frescura, volumen y transformaciones necesarias y mira qué modo recomienda. Observa que DirectQuery gana solo en escenarios muy concretos.",
  caso:{sec:"Decisión de diseño", q:"No dejes que Power Query decida los tipos por ti", html:`<p>Si las tiendas llegan como «001», «002», Power Query puede detectarlas como número. El día que aparezca la tienda «T01», la actualización fallará. Decide tú el tipo de cada columna según las reglas de negocio, no según la muestra de 1.000 filas que ve el editor.</p>`},
  yes:["Importar: casi siempre.","DirectQuery: datos que cambian cada pocos minutos o tablas que no caben en memoria.","Conexión dinámica: informes ligeros sobre un modelo ya publicado."],
  no:["DirectQuery «por si acaso»: pierdes rendimiento y funciones sin necesidad.","Importar hojas de Excel con comentarios y totales fuera de una tabla."],
  code:[{l:"M", t:"Conexión a SQL Server con consulta nativa", s:`let
    Origen = Sql.Database("SERVIDOR", "TPV",
        [Query = "SELECT Fecha, IdTienda, IdProducto, Cantidad, ImporteVenta FROM dbo.LineasTicket"])
in
    Origen`}],
  conf:[{t:"Importar frente a DirectQuery", d:"Importar copia y comprime los datos: rápido, todo el DAX disponible, frescura limitada a las actualizaciones programadas. DirectQuery consulta el origen en cada interacción: datos frescos, rendimiento atado al origen y algunas limitaciones de DAX y Power Query."},{t:"Conexión dinámica frente a DirectQuery", d:"La conexión dinámica (Live) apunta a un modelo semántico ya publicado o a Analysis Services: no tienes Power Query ni puedes cambiar el modelo, solo crear medidas de informe."}],
  rec:["Importar por defecto.","DirectQuery para frescura de minutos o volumen enorme.","Excel: importa tablas, no hojas.","Tú decides los tipos, no la detección automática."],
  quiz:{q:"Un informe debe mostrar datos con menos de 5 minutos de antigüedad desde una base SQL que recibe registros continuamente. ¿Qué haces?", o:["Importar y programar la actualización cada 5 minutos","DirectQuery con actualización automática de página","Escribir una consulta SQL en Opciones avanzadas","Aumentar el tiempo de espera del comando"], a:1, w:"Con Importar no puedes actualizar cada 5 minutos (8 veces al día en Pro, 48 en Premium). DirectQuery consulta el origen en cada interacción y la actualización automática de página refresca el visual."},
  pro:[{k:"Plegado de consultas", t:"Con orígenes SQL, Power Query traduce tus pasos a SQL y los ejecuta en el servidor (query folding). Mantén al principio los pasos que pliegan (filtrar, quitar columnas) y deja para el final los que no (columna de índice, ciertas funciones personalizadas)."},{k:"Parámetros", t:"Parametriza servidor, base de datos y rutas. Facilita pasar de desarrollo a producción y es imprescindible para la actualización incremental (RangeStart y RangeEnd)."}],
  exam:["Datos casi en tiempo real (minutos): <b>DirectQuery</b>. Con Importar el límite es 8 actualizaciones al día en Pro y 48 en Premium.","Para eliminar totales y filas de cabecera de un Excel exportado, la secuencia típica es: quitar filas superiores, usar la primera fila como encabezado, cambiar tipos y filtrar los totales."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 3","Temario PL-300: Preparar los datos y Repaso general"]
},
{
  id:"transformar", b:"pq", t:"Transformaciones esenciales", lvl:1,
  q:"¿Qué transformaciones de Power Query uso constantemente y cuáles tienen trampa?",
  one:"Cada clic en Power Query es un paso aplicado que se repite en cada actualización; elegir bien el paso (quitar frente a quitar otras columnas, anular dinamización de columnas frente a solo las seleccionadas) decide si tu consulta sobrevive a los cambios del origen.",
  friend:"Power Query es una receta. Cada paso aplicado es una instrucción («pelar, cortar, freír»). Si mañana te traen patatas de otro tamaño, una receta que dice «corta en 4 trozos» sigue funcionando; una que dice «corta por el centímetro 3» no. Las buenas transformaciones son las que siguen funcionando cuando el origen cambia un poco.",
  steps:[
    "<b>Quitar columnas</b> innecesarias cuanto antes (mejor «Quitar otras columnas» si no quieres que entren columnas nuevas del origen).",
    "<b>Filtrar filas</b>, quitar filas superiores e inferiores y <b>usar la primera fila como encabezado</b>.",
    "<b>Cambiar nombres</b> (doble clic o F2) por nombres de negocio y <b>cambiar tipos</b> a mano.",
    "<b>Reemplazar valores</b> (con «Coincidir con el contenido de toda la celda» si solo quieres celdas que sean exactamente ese valor).",
    "<b>Columna condicional</b>, <b>personalizada</b> o <b>a partir de ejemplos</b> para derivar campos.",
    "<b>Anular dinamización</b> para pasar de columnas por mes a filas (formato tabular).",
    "<b>Agrupar por</b> para reducir granularidad cuando el detalle no hace falta."
  ],
  ex:`<p>Un presupuesto en Excel llega con una columna por mes (Enero a Diciembre) y una de Total. Quitas Total y la fila de totales, seleccionas Tienda y aplicas <b>Anular dinamización de otras columnas</b>. Resultado: Tienda, Atributo (el mes) y Valor (el importe). Renombras a Mes e ImportePresupuesto y ya es una tabla de hechos válida.</p>`,
  key:"Menú Transformar modifica la columna; menú Agregar columna deja la original y crea una nueva. Y recuerda: Power Query solo enseña una muestra de 1.000 filas, pero los pasos se aplican a todas.",
  viz:"unpivot",
  vizNote:"Alterna entre la tabla dinamizada y la tabular. Después añade un mes nuevo al origen y comprueba qué variante lo recoge sola y cuál lo ignora.",
  caso:{sec:"Caso de examen", q:"El origen cambia de CSV a Excel con desglose mensual", html:`<p>Un director financiero recibía el presupuesto en CSV y desde 2022 en Excel mensual. La consulta debe: reemplazar celdas vacías (Coincidir con toda la celda), quitar filas en blanco y superiores, usar encabezados, filtrar totales por texto (ojo: Power Query distingue mayúsculas, DAX no), anular dinamización, construir la fecha y llevarla a fin de mes. Después se anexa con los presupuestos históricos.</p>`},
  yes:["Siempre que el dato no llegue con forma de tabla tabular.","Para crear claves, fechas y categorías antes del modelo."],
  no:["Cálculos que dependen de lo que el usuario filtra en el informe: eso es DAX.","Columnas «por si acaso»: cada columna cuesta memoria."],
  code:[{l:"M", t:"Anular dinamización que recoge columnas nuevas", s:`= Table.UnpivotOtherColumns(#"Columnas quitadas", {"Tienda"}, "Mes", "ImportePresupuesto")`},{l:"M", t:"Solo las columnas seleccionadas (ignora meses nuevos)", s:`= Table.Unpivot(#"Columnas quitadas", {"Enero", "Febrero", "Marzo"}, "Mes", "ImportePresupuesto")`},{l:"M", t:"Mensualizar un objetivo anual con una lista {1..12}", s:`= Table.AddColumn(Objetivos, "Mes", each {1..12})
// Expandir en nuevas filas y repartir: [ObjetivoAnual] / 12`}],
  conf:[
    {t:"Elegir columnas / Quitar otras columnas", d:"Mantienen solo las columnas elegidas. Si el origen añade columnas nuevas, no aparecerán."},
    {t:"Quitar columnas / Suprimir", d:"Eliminan las seleccionadas. Si el origen añade columnas nuevas, sí aparecerán."},
    {t:"Anular dinamización de columnas frente a de otras columnas", d:"Generan el mismo código M (Table.UnpivotOtherColumns) y recogen meses nuevos. «Solo las columnas seleccionadas» genera Table.Unpivot y no los recoge."}
  ],
  rec:["Cada paso aplicado se repite en cada actualización.","Quitar otras columnas blinda frente a columnas nuevas.","Anular dinamización de otras columnas recoge columnas nuevas.","Nombra los pasos para poder mantenerlos."],
  quiz:{q:"El Excel de presupuestos añadirá una columna por cada mes nuevo. ¿Qué transformación recoge esos meses sin tocar la consulta?", o:["Anular dinamización de las columnas seleccionadas únicamente","Anular dinamización de otras columnas","Transponer","Dinamizar columna"], a:1, w:"«Anular dinamización de otras columnas» (Table.UnpivotOtherColumns) fija las columnas estáticas y convierte en filas todo lo demás, incluidas columnas futuras."},
  pro:[{k:"Editor avanzado", t:"Copia el código M de una consulta (Editor avanzado) como copia de seguridad o para reutilizarlo. Recuerda que en M los nombres con espacios van como #\"Nombre del paso\"."},{k:"Columna de índice", t:"Agregar columna > Columna de índice desde 1 sirve para crear claves subrogadas, para ordenar y para detectar duplicados. Ojo: rompe el plegado de consultas."}],
  exam:["En Power Query los filtros de texto distinguen mayúsculas y minúsculas; en DAX no.","Distinto frente a único en el perfil de columna: <b>distintos</b> son todos los valores diferentes; <b>únicos</b> son los que aparecen una sola vez. Una matriz muestra tantas filas como valores <b>distintos</b>."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 3","Temario PL-300: Preparar los datos"]
},
{
  id:"combinar", b:"pq", t:"Combinar y anexar consultas", lvl:2,
  q:"¿Cómo junto dos tablas: añadiendo columnas o añadiendo filas?",
  one:"Combinar trae columnas de otra consulta por una clave común (como un JOIN de SQL); anexar pone las filas de una consulta debajo de otra (como un UNION).",
  friend:"Combinar es como cruzar dos listas de invitados para saber quién viene a las dos fiestas. Anexar es grapar la lista de invitados de enero debajo de la de febrero para tener una sola lista larga.",
  steps:[
    "<b>Combinar</b>: elige la consulta y la columna de unión arriba, la otra consulta y su columna abajo, y el tipo de combinación.",
    "Expande la columna resultante y elige solo los campos que necesitas.",
    "<b>Anexar</b>: elige dos o más consultas con <b>los mismos nombres de columna</b>.",
    "Usa «Anexar consultas para crear una nueva» si quieres conservar las originales.",
    "Deshabilita la carga de las consultas intermedias (aparecerán en cursiva)."
  ],
  ex:`<p>Grupo A: Ana, Juan y María. Grupo B: Juan y Pedro.</p>
<div class="tw"><table class="t"><thead><tr><th>Combinación</th><th>Resultado</th></tr></thead><tbody>
<tr><td>Externa izquierda</td><td>Ana, Juan, María</td></tr><tr><td>Externa derecha</td><td>Juan, Pedro</td></tr>
<tr><td>Externa completa</td><td>Ana, Juan, María, Pedro</td></tr><tr><td>Interna</td><td>Juan</td></tr>
<tr><td>Anti izquierda</td><td>Ana, María</td></tr><tr><td>Anti derecha</td><td>Pedro</td></tr></tbody></table></div>`,
  key:"Al anexar, las columnas se emparejan por nombre: si una se llama Importe y otra Importe venta, obtendrás dos columnas medio vacías. Al combinar, las columnas de unión deben tener el mismo tipo.",
  viz:"joins",
  vizNote:"Cambia el tipo de combinación y fíjate en qué filas sobreviven. Las combinaciones anti son la forma más rápida de encontrar registros huérfanos.",
  caso:{sec:"Uso típico", q:"Facturas2019 + Facturas2020 = Facturas", html:`<p>Cuando el origen está partido por años, meses o países, anexas todo en una consulta Facturas y deshabilitas la carga de las piezas. Si son muchos archivos iguales en una carpeta, el conector Carpeta hace lo mismo automáticamente con «Combinar y transformar».</p>`},
  yes:["Combinar: llevar el Id de una dimensión a los hechos o desnormalizar Producto con Categoría.","Anexar: históricos repartidos en varios archivos o tablas iguales.","Anti izquierda: encontrar ventas con productos que no existen en el maestro."],
  no:["Combinar dos tablas grandes que podrías relacionar en el modelo: la relación es más barata."],
  code:[{l:"M", t:"Combinar (externa izquierda) y expandir", s:`let
    Combinada = Table.NestedJoin(Ventas, {"Tienda"}, Tiendas, {"Tienda"}, "T", JoinKind.LeftOuter),
    Expandida = Table.ExpandTableColumn(Combinada, "T", {"IdTienda"})
in
    Expandida`},{l:"M", t:"Anexar", s:`= Table.Combine({Facturas2019, Facturas2020})`}],
  conf:[{t:"Combinar (merge) frente a anexar (append)", d:"Combinar añade columnas, como un JOIN. Anexar añade filas, como un UNION ALL."},{t:"Combinar en Power Query frente a relacionar en el modelo", d:"Combinar copia columnas físicamente (más memoria, menos relaciones). Relacionar deja las tablas separadas y une al consultar. Para desnormalizar dimensiones pequeñas, combina; para hechos y dimensiones, relaciona."}],
  rec:["Combinar = columnas (JOIN); anexar = filas (UNION).","Seis tipos de combinación: izquierda, derecha, completa, interna, anti izquierda, anti derecha.","Anexar empareja por nombre de columna.","Deshabilita la carga de las consultas auxiliares."],
  quiz:{q:"¿Qué combinación devuelve las ventas cuyo producto NO existe en la tabla de productos?", o:["Interna","Externa izquierda","Anti izquierda (Ventas arriba)","Externa completa"], a:2, w:"La anti izquierda devuelve las filas de la primera tabla que no tienen coincidencia en la segunda: justo los huérfanos."},
  pro:[{k:"Coincidencias aproximadas", t:"La combinación difusa empareja textos parecidos con un umbral de similitud. Útil para nombres escritos a mano, peligrosa sin revisar el resultado."},{k:"Diagrama de dependencias", t:"Vista > Dependencias de la consulta muestra qué consultas alimentan a cuáles. Imprescindible cuando un modelo tiene decenas de consultas auxiliares."}],
  exam:["Al anexar, los nombres de las columnas deben ser iguales; el orden de columnas lo marca la primera tabla.","Si te piden mantener las consultas originales y crear una nueva con el resultado: <b>Anexar consultas para crear una nueva</b>."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 3","Temario PL-300: Preparar los datos"]
},
{
  id:"dataflows", b:"pq", t:"Flujos de datos y puerta de enlace", lvl:2,
  q:"¿Cómo reutilizo la misma preparación de datos en varios informes y cómo actualizo datos que están en mi red local?",
  one:"Un flujo de datos es Power Query en la nube: preparas una vez y muchos modelos lo reutilizan; la puerta de enlace es el puente que deja a la nube leer orígenes que están dentro de tu empresa.",
  friend:"Un flujo de datos es una cocina central que prepara los ingredientes para todos los restaurantes de la cadena. La puerta de enlace es el camión que lleva los ingredientes desde el almacén del polígono (tu servidor local) hasta esa cocina.",
  steps:[
    "En Power BI Service crea un <b>área de trabajo</b>.",
    "Nuevo elemento > <b>Flujo de datos</b> y elige «Definir tablas nuevas».",
    "Conéctate al origen y transforma con el mismo Power Query que conoces.",
    "Si el origen está en tu red local (SQL Server, carpeta), instala y configura una <b>puerta de enlace de datos local</b>.",
    "Programa la actualización del flujo; los modelos semánticos se conectan a él con el conector Flujos de datos."
  ],
  ex:`<p>Tres informes (Ventas, Márgenes, Objetivos) necesitan las mismas dimensiones Tienda y Producto limpias. Sin flujo de datos, la misma limpieza vive en tres .pbix y acaba divergiendo. Con un flujo, se limpia una vez y los tres modelos leen el mismo resultado.</p>`,
  key:"Los flujos de datos separan la preparación (ETL) del modelado. La puerta de enlace no es opcional: sin ella, Service no puede actualizar nada que esté detrás del cortafuegos de tu empresa.",
  viz:"flujo",
  vizNote:"Recorre el camino de los datos desde el servidor local hasta los informes. Fíjate en dónde vive cada pieza: tu red, la nube o el escritorio.",
  caso:{sec:"Gobierno", q:"Una sola definición de Cliente para toda la empresa", html:`<p>Si cada analista limpia la tabla de clientes a su manera, cada informe cuenta clientes distintos. Un flujo de datos certificado con la dimensión Cliente oficial es la forma más sencilla de imponer una única definición.</p>`},
  yes:["La misma preparación sirve a varios modelos.","Quieres separar el trabajo de ingeniería de datos del de análisis.","Orígenes locales que deben actualizarse desde Service (puerta de enlace)."],
  no:["Un único informe personal con un Excel en OneDrive: no necesitas ni flujo ni puerta de enlace."],
  code:[],
  conf:[{t:"Flujo de datos frente a modelo semántico", d:"El flujo prepara y guarda tablas (ETL). El modelo semántico añade relaciones, medidas DAX y seguridad, y es lo que consumen los informes."},{t:"Gen1 frente a Gen2", d:"Los flujos Gen2 de Fabric pueden escribir en un Lakehouse o un almacén; los Gen1 guardan en el almacenamiento propio de Power BI."}],
  rec:["Flujo de datos = Power Query en la nube y reutilizable.","Puerta de enlace = acceso desde la nube a orígenes locales.","Prepara una vez, consume muchas."],
  quiz:{q:"Tu modelo publicado lee de un SQL Server de la oficina y la actualización programada falla. ¿Qué falta casi seguro?", o:["Una licencia Premium","Una puerta de enlace de datos local configurada","Marcar la tabla como tabla de fechas","Un flujo de datos Gen2"], a:1, w:"Service está en la nube y no ve tu red local. La puerta de enlace es el puente que le permite conectarse al SQL Server para actualizar."},
  pro:[{k:"Actualización incremental", t:"En tablas de hechos grandes, configura actualización incremental con los parámetros RangeStart y RangeEnd: solo se recargan los periodos recientes y el resto del histórico se conserva."}],
  exam:["Si los datos están en el equipo o la red local, la actualización desde Service requiere una <b>puerta de enlace</b>."],
  src:["Temario PL-300: Preparar los datos (flujo de datos)","Temario PL-300: Administración (actualización incremental)"]
}
];
