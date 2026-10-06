/* ══════════════════════════════════════════════════════════════
   MANUAL DE POWER BI · temas de ampliación
   Diez temas nuevos que salen del volcado completo de Notion
   (perfilado, lenguaje M, funciones de tabla, consultas DAX,
   gráficos avanzados, informes financieros, herramientas externas,
   Python, gestión de proyectos y Microsoft Fabric) y sus visuales.
   Se carga después de content-2.js y viz.js, y antes de app.js.
   ══════════════════════════════════════════════════════════════ */
(function(){
"use strict";

BLOCKS.push({id:"ext", n:7, t:"Ampliación profesional", s:"Herramientas externas, Python, Fabric, informes financieros y gestión de proyectos: lo que separa un informe correcto de un proyecto profesional."});

var NEW = [
/* ── Power Query ── */
{id:"perfilado", b:"pq", t:"Perfilado y calidad de datos", lvl:1, after:"obtener",
 q:"¿Cómo sé si mis datos tienen errores, vacíos o duplicados antes de cargarlos?",
 one:"Antes de transformar nada, mira la calidad, la distribución y el perfil de cada columna sobre todo el conjunto de datos: es la radiografía que te dice qué hay que limpiar.",
 friend:"Es como revisar la fruta antes de cocinar. Si solo miras las piezas de arriba de la caja (las 1.000 primeras filas), puedes no ver las que están podridas al fondo. El perfilado es vaciar la caja en la mesa y contar cuántas están bien, cuántas mal y cuántas faltan.",
 steps:["Vista → activa <b>Calidad de columna</b>, <b>Distribución de columna</b> y <b>Perfil de columna</b>.","En la barra de estado cambia «Generación de perfiles basada en las 1000 primeras filas» por <b>todo el conjunto de datos</b>.","Lee la calidad: porcentaje de <b>válidos</b>, <b>errores</b> y <b>vacíos</b>.","Lee la distribución: <b>distintos</b> (valores diferentes) frente a <b>únicos</b> (aparecen una sola vez). Si en una clave distintos ≠ filas, hay duplicados.","Investiga los errores con clic derecho → <b>Conservar errores</b> y corrige la causa (tipo, configuración regional, texto en una columna numérica).","Cuenta filas antes y después de cada limpieza para no perder datos por el camino."],
 ex:"<p>La dimensión Productos tiene 2.517 valores <b>distintos</b> en ProductKey pero solo 2.507 <b>únicos</b>: diez claves están repetidas. Al relacionarla con Ventas, Power BI propone una relación <b>varios a varios</b>. Tras <b>Quitar duplicados</b> en la clave, distintos = únicos = 2.507 y la relación vuelve a ser 1:N.</p><p>En un CSV con fechas en formato mes/día, el perfil muestra un 12 % de errores en la columna Fecha. No es que los datos estén mal: el paso «Tipo cambiado» usa la configuración regional española. Se borra ese paso y se usa <b>Cambiar tipo → Usando configuración regional</b> (Inglés, Estados Unidos).</p>",
 key:"Por defecto el perfil solo mira las 1.000 primeras filas. Cambia siempre a todo el conjunto de datos antes de sacar conclusiones, y compara distintos con únicos en cualquier columna que vaya a ser clave.",
 viz:"perfilado", vizNote:"Cambia entre las 1.000 primeras filas y todo el conjunto. Fíjate en que los errores y los duplicados de la clave <b>solo aparecen cuando miras todo</b>.",
 caso:{sec:"Caso CSV de ventas", q:"La columna Amount sale con decimales mal y la fecha falla", html:"<p>El perfil completo revela errores en Fecha y un Amount con valores multiplicados por cien. En lugar de borrar pasos y rehacerlos, se edita el código M del paso en la barra de fórmulas para indicar la configuración regional correcta. Con «Conservar errores» se aíslan las filas problemáticas y se comprueba que tras la corrección el porcentaje de válidos es del 100 %.</p>"},
 yes:["Vas a usar una columna como clave de relación.","Recibes datos de un origen nuevo o poco fiable.","Una relación sale como varios a varios sin motivo aparente.","Quieres documentar la calidad de un origen."],
 no:["Ya validaste el origen y los datos vienen de un proceso controlado (aun así, revisa tras cambios).","Necesitas reglas de calidad automáticas en producción: eso es trabajo de un proceso ETL con alertas, no del perfil interactivo."],
 code:[{l:"M",t:"Quitar duplicados y conservar errores",s:'let\n    Origen = Csv.Document(File.Contents(Ruta & "ventas.csv"), [Delimiter = ",", Encoding = 65001]),\n    Encabezados = Table.PromoteHeaders(Origen, [PromoteAllScalars = true]),\n    // tipar con la configuración regional del origen\n    Tipos = Table.TransformColumnTypes(Encabezados, {{"Fecha", type date}, {"Amount", type number}}, "en-US"),\n    SinDuplicados = Table.Distinct(Tipos, {"ProductKey"}),\n    SoloErrores = Table.SelectRowsWithErrors(Tipos)\nin\n    SinDuplicados'},
       {l:"M",t:"Controlar errores con try",s:'Table.AddColumn(#"Índice agregado", "Control de errores",\n    each try [IdTienda] otherwise null)'}],
 conf:[{t:"Distintos frente a únicos",d:"Distintos cuenta valores diferentes; únicos, los que aparecen una sola vez. En una clave sana coinciden con el número de filas."},{t:"Quitar errores frente a reemplazar errores",d:"Quitar elimina filas enteras (pierdes datos); reemplazar sustituye el error por un valor (por ejemplo null) y conserva la fila."},{t:"Perfil de columna frente a estadísticas DAX",d:"El perfil vive en Power Query, antes de cargar. En el modelo puedes obtener estadísticas con consultas DAX (COUNTROWS, DISTINCTCOUNT)."}],
 rec:["Cambia el perfil a todo el conjunto de datos.","Distintos ≠ únicos en una clave = duplicados = riesgo de relación N:N.","Errores de fecha suelen ser configuración regional, no datos malos.","Edita el paso en vez de borrarlo y rehacerlo.","Cuenta filas antes y después de limpiar."],
 quiz:{q:"El perfil de una columna clave muestra 2.517 distintos y 2.507 únicos. ¿Qué significa?",o:["Que hay 10 valores vacíos","Que hay valores que se repiten: la columna no es única","Que hay 10 errores de tipo","Que el perfil está mal calculado"],a:1,w:"Distintos cuenta valores diferentes y únicos solo los que aparecen una vez: si no coinciden, algún valor se repite y la columna no puede ser el lado uno de una relación hasta quitar duplicados."},
 pro:[{k:"Rendimiento",t:"El perfil sobre todo el conjunto escanea la tabla completa: en orígenes enormes úsalo puntualmente y vuelve a las 1.000 filas para trabajar."},{k:"Filas huérfanas",t:"Una combinación anti izquierda entre hechos y dimensión lista las claves de hechos sin pareja: es el complemento natural del perfil."}],
 exam:["Si te preguntan cómo ver el número de valores distintos y únicos de una columna, la respuesta es Distribución de columna; para mínimo, máximo, media y desviación, Perfil de columna."],
 src:["PL-300 · Alex Ayala (NamasData)","Power Query Esencial (NamasData)","Modelado de datos (NamasData)"]},

{id:"m", b:"pq", t:"El lenguaje M", lvl:2, after:"transformar",
 q:"¿Qué hay detrás de cada clic en Power Query y cómo lo modifico a mano?",
 one:"Cada paso de Power Query es una línea de código M: un bloque let que define pasos con nombre y un in que devuelve el último, y que puedes editar, parametrizar y convertir en funciones.",
 friend:"Power Query es como grabar una macro: cada clic queda apuntado en una receta. M es esa receta escrita. Leerla te permite corregir un paso sin rehacerlo, y escribirla te permite cocinar cosas que la interfaz no sabe hacer.",
 steps:["M se escribe en tres sitios: la <b>barra de fórmulas</b>, el cuadro de <b>columna personalizada</b> y el <b>editor avanzado</b>.","Una consulta es un bloque <code>let ... in</code>: cada paso es una variable que se separa con coma; el último antes de <code>in</code> no lleva coma.","Los nombres con espacios se escriben <code>#\"Tipo cambiado\"</code>. M distingue mayúsculas y minúsculas.","Valores: primitivos (número, texto, lógico, null, fecha) y estructurados: lista <code>{1, 2, 3}</code>, registro <code>[Nombre = \"Ana\"]</code>, tabla y función.","Una función personalizada es <code>(param as tipo) =&gt; expresión</code>; se aplica con «Invocar función personalizada».","M evalúa de forma <b>perezosa</b>: un paso que no se usa en el resultado no se calcula."],
 ex:"<p>Para elegir el IVA por país sin tocar el código cada vez: se crea un parámetro <code>PaisIva</code> con una lista de países, una tabla de IVA con <code>#table</code>, se filtra por el parámetro y se extrae el valor con <code>{0}</code>. Cambiando el parámetro (también desde Power BI Desktop) se recalculan todos los importes.</p><p>Para leer 50 PDF de una carpeta se copia el M de la consulta de un PDF, se convierte en función <code>(tbl as table) =&gt; ...</code> llamada <code>FxPDFRet</code> y se invoca sobre cada archivo: los PDF nuevos se procesan solos al actualizar.</p>",
 key:"No borres pasos para rehacerlos: edita el M del paso. Y cuando repites la misma transformación sobre varios archivos o tablas, conviértela en una función personalizada.",
 viz:"mlet", vizNote:"Pulsa cada paso del bloque let. Fíjate en que cada paso <b>parte del anterior por su nombre</b> y en que in devuelve solo el último.",
 caso:{sec:"Caso IVA por país", q:"Cada país tiene un IVA distinto y el usuario quiere elegirlo", html:"<p>En vez de duplicar consultas, se crea el parámetro PaisIva (lista de valores sugeridos), una tabla de IVA y una función personalizada con parámetro opcional que aplica el IVA o uno por defecto con <code>if ... then ... else</code>. La consulta de ventas invoca la función: la lógica vive en un solo sitio.</p>"},
 yes:["Necesitas una transformación que la interfaz no ofrece.","Repites los mismos pasos sobre muchos archivos o tablas.","Quieres parametrizar rutas, fechas o valores.","Un paso generado por la interfaz casi sirve y solo hay que retocarlo."],
 no:["La interfaz ya lo hace en un clic: el código generado es igual de bueno.","La lógica es de cálculo analítico que depende del filtro del usuario: eso es DAX, no M."],
 code:[{l:"M",t:"Estructura let ... in",s:'let\n    Origen = Excel.Workbook(File.Contents(Ruta & "ventas.xlsx"), null, true),\n    Hoja = Origen{[Item = "Ventas", Kind = "Sheet"]}[Data],\n    #"Encabezados promovidos" = Table.PromoteHeaders(Hoja, [PromoteAllScalars = true]),\n    #"Tipo cambiado" = Table.TransformColumnTypes(#"Encabezados promovidos", {{"Importe", type number}})\nin\n    #"Tipo cambiado"'},
       {l:"M",t:"Tabla manual y valor de un parámetro",s:'let\n    TablaIva = #table({"Pais", "IVA"}, {{"Argentina", 0.21}, {"Chile", 0.19}, {"España", 0.21}, {"Venezuela", 0.16}}),\n    Filtrada = Table.SelectRows(TablaIva, each [Pais] = PaisIva),\n    Iva = Filtrada[IVA]{0}\nin\n    Iva'},
       {l:"M",t:"Función personalizada con parámetro opcional",s:'(precio as number, cantidad as number, optional iva as number) as number =>\n    let\n        tipo = if iva = null then 0.21 else iva\n    in\n        precio * cantidad * (1 + tipo)'},
       {l:"M",t:"Listas útiles",s:'List.Dates(#date(2023, 1, 1), 365, #duration(1, 0, 0, 0))   // calendario\nList.Intersect({Evento1[ID], Evento2[ID], Evento3[ID]})       // fueron a los tres\n= #shared                                                      // todas las funciones de M'}],
 conf:[{t:"M frente a DAX",d:"M prepara y carga los datos (se ejecuta al actualizar); DAX calcula sobre el modelo según el contexto de filtro (se ejecuta al consultar)."},{t:"Referenciar frente a duplicar",d:"Referenciar parte del resultado de otra consulta y hereda sus cambios; duplicar copia todos los pasos y queda independiente."},{t:"Parámetro de Power Query frente a parámetro de campo",d:"El primero cambia la carga de datos (rutas, valores); el segundo cambia qué campo muestra un visual."}],
 rec:["let define pasos, in devuelve el resultado.","Todos los pasos terminan en coma salvo el último antes de in.","#\"Nombre con espacios\" para pasos con espacios.","{0} extrae el primer elemento de una lista; [Campo] accede a un registro.","= #shared lista todas las funciones disponibles.","Función personalizada: (x as tipo) =&gt; expresión."],
 quiz:{q:"En el editor avanzado, ¿qué paso del bloque let no termina en coma?",o:["El primero","El que tenga el nombre más largo","El último antes de in","Ninguno: todos llevan coma"],a:2,w:"Los pasos se separan con coma; el último del bloque precede a in y no la lleva. Una coma de más o de menos es el error de sintaxis más frecuente."},
 pro:[{k:"Plegado",t:"Mientras los pasos se traduzcan al lenguaje del origen (plegado de consultas), el trabajo lo hace la base de datos. Las funciones personalizadas complejas suelen romper el plegado: colócalas al final."},{k:"Evaluación perezosa",t:"Un paso intermedio que no llega al resultado no se ejecuta: útil para dejar pasos de diagnóstico sin coste."}],
 exam:["Para listar todas las funciones de M se usa una consulta en blanco con = #shared."],
 src:["Fundamentos del lenguaje M (NamasData)","Power Query Esencial (NamasData)","PL-300 · Alex Ayala (NamasData)"]},

/* ── DAX ── */
{id:"funtabla", b:"dax", t:"Funciones de tabla", lvl:2, after:"calculate",
 q:"¿Cómo construyo tablas virtuales para filtrar, resumir o combinar dentro de una medida?",
 one:"Las funciones de tabla devuelven tablas en lugar de valores: sirven de filtro en CALCULATE, de tabla que recorre un iterador o de tabla calculada en el modelo.",
 friend:"Si una medida es una calculadora, las funciones de tabla son las hojas de cálculo auxiliares que preparas en borrador: una lista de clientes filtrada, un resumen por mes, una lista de fechas. No se ven en el informe, pero sin ellas no puedes hacer la cuenta.",
 steps:["<b>Filtrar</b>: <code>FILTER</code>, <code>ALL</code>, <code>VALUES</code>, <code>DISTINCT</code>, <code>ALLEXCEPT</code>, <code>ALLSELECTED</code>.","<b>Resumir</b>: <code>SUMMARIZE</code> (agrupar, como GROUP BY), <code>SUMMARIZECOLUMNS</code> (agrupar, filtrar y calcular a la vez), <code>GROUPBY</code>.","<b>Añadir columnas</b>: <code>ADDCOLUMNS</code>, <code>SELECTCOLUMNS</code>.","<b>Combinar</b>: <code>UNION</code>, <code>INTERSECT</code>, <code>EXCEPT</code>, <code>CROSSJOIN</code>, <code>NATURALINNERJOIN</code>.","<b>Generar</b>: <code>CALENDAR</code>, <code>GENERATESERIES</code>, <code>DATATABLE</code>, <code>ROW</code>.","<b>Relacionar sin relación</b>: <code>TREATAS</code> aplica los valores de una tabla como filtro sobre otra columna.","Se depuran en la vista <b>Consultas DAX</b> o en DAX Studio con <code>EVALUATE</code>."],
 ex:"<p>Una tabla de objetivos por categoría no está relacionada con Productos. <code>CALCULATE([Objetivo], TREATAS(VALUES(Productos[Categoría]), Objetivos[Categoría]))</code> filtra los objetivos con las categorías visibles en el informe, como si hubiera relación.</p><p>Para un benchmark entre dos marcas elegidas por el usuario se crea una <b>tabla desconectada</b> de marcas para el segundo segmentador y TREATAS aplica esa selección al modelo.</p>",
 key:"Una tabla virtual hereda el linaje de sus columnas: aunque la construyas con VALUES o SUMMARIZE, sus valores siguen filtrando el modelo a través de las relaciones.",
 viz:"funtabla", vizNote:"Cambia de función y mira la tabla virtual resultante. Fíjate en cuántas <b>filas y columnas</b> genera cada una: es lo que pesa en memoria.",
 caso:{sec:"Caso benchmark de marcas", q:"Dirección quiere comparar dos marcas cualesquiera", html:"<p>Dos segmentadores de marca no pueden filtrar el mismo campo a la vez. Se crea una tabla desconectada con las marcas (DISTINCT de la dimensión) y se usa TREATAS en las medidas de la segunda marca. Una medida adicional evita que la marca elegida en un segmentador aparezca en el otro.</p>"},
 yes:["Necesitas filtrar por una condición compleja o por una tabla resumida.","Quieres aplicar la selección de una tabla desconectada al modelo.","Construyes tablas auxiliares: calendario, rangos, parámetros.","Necesitas iterar sobre una agrupación (por ejemplo, máximo de ventas mensuales)."],
 no:["Un filtro simple de columna basta: usa el filtro booleano en CALCULATE, que es más eficiente que FILTER sobre toda la tabla.","La tabla debería existir en el modelo de forma permanente y se puede preparar en Power Query."],
 code:[{l:"DAX",t:"TREATAS con tabla desconectada",s:"Ventas Marca B =\nCALCULATE (\n    [Ventas],\n    TREATAS ( VALUES ( MarcasB[Marca] ), Productos[Marca] )\n)"},
       {l:"DAX",t:"Máximo de ventas mensuales con una tabla virtual",s:"Mejor mes =\nMAXX (\n    SUMMARIZE ( Ventas, Calendario[Año], Calendario[Mes] ),\n    [Ventas]\n)"},
       {l:"DAX",t:"Tabla calculada combinando categorías",s:"Categorías =\nDISTINCT (\n    UNION (\n        SELECTCOLUMNS ( Ventas, \"Categoría\", Ventas[Categoría] ),\n        SELECTCOLUMNS ( Presupuesto, \"Categoría\", Presupuesto[Categoría] )\n    )\n)"}],
 conf:[{t:"VALUES frente a DISTINCT",d:"VALUES incluye la fila en blanco que crea una relación con filas huérfanas; DISTINCT no la incluye."},{t:"SUMMARIZE frente a SUMMARIZECOLUMNS",d:"SUMMARIZE agrupa a partir de una tabla; SUMMARIZECOLUMNS agrupa, filtra y calcula en una sola función y es la que generan los visuales."},{t:"FILTER(tabla) frente a filtro booleano",d:"FILTER sobre toda la tabla genera una tabla con todas sus columnas; el filtro booleano de CALCULATE solo usa la columna implicada."}],
 rec:["Las funciones de tabla devuelven tablas, no valores.","TREATAS conecta tablas sin relación física.","VALUES cuenta la fila en blanco; DISTINCT no.","SUMMARIZECOLUMNS es la consulta que lanzan los visuales.","Prueba las tablas virtuales con EVALUATE en Consultas DAX."],
 quiz:{q:"Tienes una tabla de objetivos sin relación con Productos. ¿Qué función aplica las categorías visibles como filtro sobre los objetivos?",o:["RELATED","USERELATIONSHIP","TREATAS","LOOKUPVALUE"],a:2,w:"TREATAS toma los valores de una tabla (aquí, las categorías visibles) y los aplica como filtro sobre una columna de otra tabla, sin necesidad de relación física. USERELATIONSHIP solo activa relaciones que ya existen."},
 pro:[{k:"Rendimiento",t:"Una tabla virtual grande dentro de un iterador se materializa en memoria: filtra columnas con ALL(columna) o SUMMARIZE antes de iterar."},{k:"Linaje",t:"Si construyes una tabla con valores literales (DATATABLE, ROW) pierdes el linaje; TREATAS lo recupera."}],
 exam:[],
 src:["Curso DAX · Javier Sánchez Rivero (NamasData)","Curso de lenguaje DAX · Ana María Bisbé York","Gráficos imprescindibles · Claudio Trombini"]},

{id:"consultasdax", b:"dax", t:"Consultas DAX y optimización", lvl:3, after:"window",
 q:"¿Por qué va lento un visual y cómo lo analizo y lo arreglo?",
 one:"Cada visual lanza una consulta DAX que resuelven dos motores: el Formula Engine (un hilo, sin caché) y el Storage Engine (paralelo, con caché). Optimizar es mover trabajo del primero al segundo.",
 friend:"El Formula Engine es el jefe de cocina que lee la receta y reparte tareas; el Storage Engine es el equipo de pinches que pela y corta en paralelo a toda velocidad. Si el jefe se pone a pelar patatas una a una, la cocina se atasca. Optimizar es que el jefe delegue todo lo que pueda.",
 steps:["<b>Analizador de rendimiento</b> (Vista): iniciar grabación, refrescar visuales y ver tiempos de consulta DAX, presentación visual y otros.","<b>Copiar consulta</b> del visual lento y pegarla en <b>DAX Studio</b> (Herramientas externas) o en la vista <b>Consultas DAX</b>.","En DAX Studio, activar <b>Server Timings</b>, limpiar la caché y ejecutar.","Leer el reparto: tiempo total, tiempo de <b>FE</b>, tiempo de <b>SE</b>, número de consultas al SE (en pseudo-SQL xmSQL) y aciertos de caché.","Buscar señales de alarma: muchas consultas al SE, <b>CallbackDataID</b> (el SE pide ayuda al FE fila a fila) o mucho tiempo de FE.","Reescribir: variables para no repetir cálculos, filtros de columna en lugar de FILTER(tabla), menos iteradores sobre medidas, KEEPFILTERS en vez de FILTER(ALL()), relaciones simples."],
 ex:"<p>Una medida con <code>SUMX(Ventas, IF(Ventas[Precio] &gt; 25, Ventas[Cantidad]))</code> provoca CallbackDataID: el IF no lo resuelve el SE y no se cachea. Reescrita como <code>CALCULATE(SUM(Ventas[Cantidad]), Ventas[Precio] &gt; 25)</code>, el SE hace todo el trabajo en una sola consulta.</p><p>Con <code>FILTER(Ventas, ...)</code> la tabla intermedia tenía 20 filas × 5 columnas; con <code>FILTER(ALL(Ventas[Cantidades], Ventas[Precio]), ...)</code>, 16 filas × 2 columnas.</p>",
 key:"El FE siempre interviene, pero cuanto más resuelva el SE (que trabaja en paralelo y con caché), más rápido. Un CallbackDataID en Server Timings es la pista más clara de que algo debe reescribirse.",
 viz:"motores", vizNote:"Cambia entre la versión con IF dentro del iterador y la optimizada. Fíjate en cómo se reparte el tiempo entre <b>FE</b> y <b>SE</b> y en el número de consultas.",
 caso:{sec:"Caso informe lento", q:"La página de ventas tarda ocho segundos en cargar", html:"<p>El analizador de rendimiento señala una matriz. En DAX Studio, Server Timings muestra el 80 % del tiempo en el FE y decenas de consultas al SE con CallbackDataID. La medida usaba una medida dentro de SUMX con un IF. Al sustituirla por un filtro booleano en CALCULATE y guardar el valor repetido en una variable, la matriz baja a menos de un segundo.</p>"},
 yes:["Un visual tarda más de un par de segundos.","Quieres comprobar si dos formas de escribir una medida son equivalentes y cuál es más rápida.","Documentas el modelo con INFO.VIEW.TABLES, INFO.VIEW.MEASURES y similares.","Necesitas probar una tabla virtual antes de usarla en una medida."],
 no:["El cuello de botella es el origen en DirectQuery: ahí el problema está en la base de datos o en el modelo.","El visual tarda por la presentación (muchos puntos, visuales personalizados): eso no se arregla en DAX."],
 code:[{l:"DAX",t:"Estructura de una consulta",s:"DEFINE\n    MEASURE '_Indicadores'[Cantidad] = SUM ( Ventas[Cantidades] )\n    VAR _Año = 2024\nEVALUATE\n    SUMMARIZECOLUMNS (\n        Calendario[Mes],\n        TREATAS ( { _Año }, Calendario[Año] ),\n        \"Cantidad\", [Cantidad]\n    )\nORDER BY Calendario[Mes] ASC"},
       {l:"DAX",t:"Antes y después: quitar el CallbackDataID",s:"-- antes: IF dentro del iterador\nVentas caras = SUMX ( Ventas, IF ( Ventas[Precio] > 25, Ventas[Cantidad] ) )\n\n-- después: filtro de columnas que resuelve el Storage Engine\nVentas caras = CALCULATE ( SUM ( Ventas[Cantidad] ), Ventas[Precio] > 25 )"},
       {l:"DAX",t:"Documentar el modelo",s:"EVALUATE INFO.VIEW.MEASURES ()\n\nEVALUATE\n    SELECTCOLUMNS ( INFO.VIEW.RELATIONSHIPS (), \"De\", [FromTable], \"A\", [ToTable], \"Activa\", [IsActive] )"}],
 conf:[{t:"Formula Engine frente a Storage Engine",d:"El FE interpreta DAX y combina resultados (un hilo, sin caché); el SE lee y agrega los datos de VertiPaq o DirectQuery (multihilo, con caché)."},{t:"Analizador de rendimiento frente a DAX Studio",d:"El analizador dice qué visual es lento y copia su consulta; DAX Studio explica por qué con Server Timings y planes de consulta."},{t:"Vista Consultas DAX frente a DAX Studio",d:"La vista está integrada en Desktop y permite proponer cambios al modelo; DAX Studio añade métricas del servidor, VertiPaq Analyzer y conexión a modelos publicados (con XMLA)."}],
 rec:["Optimizar es mover trabajo del FE al SE.","CallbackDataID = el SE pide ayuda fila a fila al FE.","Variables para no repetir cálculos.","Filtro booleano en CALCULATE mejor que FILTER sobre la tabla completa.","Cada visual es una consulta: menos visuales con varias medidas fusionan consultas."],
 quiz:{q:"En Server Timings ves muchas consultas al Storage Engine con CallbackDataID. ¿Qué indica?",o:["Que la caché está funcionando bien","Que el Storage Engine necesita al Formula Engine fila a fila, normalmente por un IF o una medida dentro de un iterador","Que el modelo está en DirectQuery","Que la consulta tiene un error de sintaxis"],a:1,w:"CallbackDataID aparece cuando el SE no puede resolver una expresión (un IF, una medida dentro de SUMX) y llama al FE para cada fila. Esas consultas no se cachean y suelen ser la causa de la lentitud."},
 pro:[{k:"Fusión",t:"Dentro de una misma consulta el motor fusiona eventos del SE parecidos; por eso una tabla con varias medidas puede costar menos que varias tarjetas separadas."},{k:"Ceros",t:"Para mostrar ceros, [Medida] + 0 es más eficiente que IF(ISBLANK(...)), pero desactiva el auto-exist y puede generar combinaciones vacías: úsalo con cuidado."}],
 exam:["El analizador de rendimiento muestra para cada visual la consulta DAX, la presentación visual y «Otros» (espera de otras operaciones)."],
 src:["Curso de lenguaje DAX · Ana María Bisbé York (temas 10 y 12)","DAX Studio · Javier Sánchez Rivero (NamasData)","PL-300 · Alex Ayala (NamasData)"]},

/* ── Visualización ── */
{id:"graficosav", b:"vis", t:"Gráficos avanzados de negocio", lvl:3, after:"percepcion",
 q:"¿Cómo construyo gráficos que se leen solos: con máximos, mínimos, hoy, deltas y escalas estables?",
 one:"Un gráfico de negocio avanzado se monta con medidas de soporte: líneas de cero, máximo y mínimo, punto de hoy, escalas fijas, colores por medida y tablas desconectadas que permiten elegir qué ver sin romper el contexto.",
 friend:"Es la diferencia entre una foto y una infografía. La foto (el gráfico por defecto) muestra todo igual; la infografía señala con un círculo el dato importante, pone la referencia al lado y quita lo que sobra. Esas marcas no las dibuja Power BI: las calculas tú con DAX.",
 steps:["<b>Escala estable</b>: medidas de máximo y mínimo del eje (o líneas invisibles al 100 % de transparencia) para que el gráfico no salte al filtrar.","<b>Línea de cero</b> y <b>línea de media</b> como medidas (nunca las automáticas de la lupa si necesitas controlarlas).","<b>Puntos clave</b>: medidas que solo devuelven valor en el máximo, el mínimo o la fecha de hoy; si coinciden, prioriza una.","<b>Color por medida</b>: medidas de texto con hexadecimales aplicadas con fx (formato condicional por valor de campo).","<b>Perímetro temporal</b>: columnas de desplazamiento respecto a hoy en el calendario para mostrar siempre, por ejemplo, las cinco semanas alrededor de hoy.","<b>Tablas desconectadas</b> para segmentadores que no filtran el modelo directamente (fechas elegibles, medidas, contexto).","<b>Small multiples</b> con línea techo común (CROSSJOIN de las dos dimensiones y máximo por combinación)."],
 ex:"<p>Informe automático de cinco semanas: dos pasadas, la actual y dos futuras, sin segmentadores. Cinco medidas filtran el calendario con el desplazamiento de semana; una medida dibuja el punto de hoy, otras dos el máximo y el mínimo, y una línea de media completa el contexto. Cada mañana el informe se mueve solo.</p><p>Con una tabla de fechas desconectada, el usuario elige cualquier fecha (también futura) y el mismo gráfico se recoloca alrededor de ella.</p>",
 key:"Casi todo lo «avanzado» son medidas DAX pensadas para el visual: lo importante destacado, lo secundario en gris y una escala que no engañe.",
 viz:"puntos", vizNote:"Activa y desactiva las capas. Fíjate en que el mismo dato <b>se lee en un segundo</b> cuando el máximo, el mínimo y hoy están marcados y el resto está en gris.",
 caso:{sec:"Caso operaciones semanales", q:"El jefe de tienda quiere saber cada lunes cómo va la semana", html:"<p>Se construye una página sin segmentadores que siempre muestra el perímetro de cinco semanas, con el punto de hoy, máximo y mínimo, la media semanal y tablas semana a semana debajo. Los títulos son medidas que cuentan el insight («Semana actual: +8 % sobre la media»). No hay que tocar nada para leerlo.</p>"},
 yes:["El informe lo usan personas que no van a filtrar ni explorar.","Necesitas comparar periodos o marcas con una escala estable.","Quieres destacar un dato concreto (hoy, máximo, objetivo) sin depender del usuario.","Un gráfico combinado no te deja la configuración que necesitas."],
 no:["El usuario es analista y quiere explorar libremente: demasiadas medidas de soporte pueden estorbar.","Cada medida de soporte es mantenimiento: si el informe es de un solo uso, no compensa."],
 code:[{l:"DAX",t:"Punto de hoy y máximo",s:"Punto Hoy =\nIF ( MAX ( Calendario[Fecha] ) = TODAY (), [Ventas] )\n\nPunto Máximo =\nVAR _Max = MAXX ( ALLSELECTED ( Calendario[Fecha] ), [Ventas] )\nRETURN IF ( [Ventas] = _Max && MAX ( Calendario[Fecha] ) <> TODAY (), [Ventas] )"},
       {l:"DAX",t:"Color por medida",s:"Color Barra =\nSWITCH ( TRUE (),\n    [Delta] > 0, \"#1F8A7A\",\n    [Delta] < 0, \"#B03A4E\",\n    \"#B9C5D6\"\n)"},
       {l:"DAX",t:"Línea techo para small multiples",s:"Techo =\nVAR _T = CROSSJOIN ( ALL ( Calendario[Mes] ), ALL ( Geografia[Continente] ) )\nRETURN MAXX ( _T, [Margen] ) * 1.15"}],
 conf:[{t:"Medida de soporte frente a línea de análisis",d:"La línea de la lupa (Análisis) es rápida pero limitada; una medida da control total (filtros, formato, tooltip)."},{t:"Tabla desconectada frente a parámetro de campo",d:"El parámetro de campo cambia qué campo o medida se ve; la tabla desconectada guarda una selección que tus medidas leen con SELECTEDVALUE."},{t:"Gráfico combinado frente a líneas con medida cero",d:"El combinado no admite línea de cero ni tooltip estándar en algunas configuraciones; un gráfico de líneas con medidas auxiliares sí."}],
 rec:["Escala estable con medidas de máximo y mínimo.","Punto de hoy, máximo y mínimo como medidas.","Color con medidas de texto y fx.","Desplazamientos respecto a hoy en el calendario.","Tablas desconectadas + SELECTEDVALUE o TREATAS."],
 quiz:{q:"Quieres que el eje Y de un gráfico no cambie al filtrar una marca sin datos. ¿Qué haces?",o:["Desactivar el segmentador","Fijar el máximo y el mínimo del eje con medidas (o líneas invisibles) calculadas sobre todo el rango","Usar un gráfico de anillo","Activar la leyenda"],a:1,w:"Calculando el máximo y el mínimo sobre todo el rango con una medida (o con líneas transparentes que fuerzan la escala), el eje queda estable y las comparaciones entre filtros son honestas."},
 pro:[{k:"Accesibilidad",t:"Azul y naranja distinguen mejor que verde y rojo para personas con daltonismo; refuerza el color con forma o etiqueta."},{k:"Rendimiento",t:"Cada medida de soporte es una consulta más dentro del visual; agrúpalas en el mismo visual para que el motor las fusione."}],
 exam:[],
 src:["Informes Efectivos de Negocio · Claudio Trombini","Gráficos imprescindibles para negocio · Claudio Trombini","Hackeando tablas en Power BI"]},

/* ── Ampliación profesional ── */
{id:"financiero", b:"ext", t:"Informes financieros", lvl:3,
 q:"¿Cómo construyo una cuenta de resultados, un balance y sus ratios en Power BI sin que dejen de cuadrar?",
 one:"Un informe financiero es un modelo contable en estrella (diario, cuentas, jerarquía de PyG, balance y cash flow) más medidas que respetan signos, subtotales y saldos acumulados en cualquier nivel de filtro.",
 friend:"Es como montar un puzle donde las piezas ya existen (los asientos), pero hay que ordenarlas por la plantilla del Plan General Contable. Si una pieza va al hueco equivocado, o se pone del revés (el signo), la imagen final no cuadra y nadie se fía del informe.",
 steps:["<b>Modelo</b>: hechos Diario (y Presupuesto) con dimensiones Calendario, Cuentas, Empresas, Partners y las jerarquías de <b>Balance</b>, <b>PyG</b> y <b>Cash flow</b> relacionadas por la cuenta a 4 dígitos.","<b>Clasificación</b>: cada cuenta en su lugar del PGC; una consulta anti izquierda detecta cuentas sin clasificar y una tabla de reclasificación las asigna.","<b>Signos</b>: columna Signo en la dimensión y medidas que suman ingresos y restan gastos; el signo de presentación se ajusta en la medida, no en el visual.","<b>Subtotales</b>: tabla de encabezados con orden y tipo de cálculo (valor o acumulado) para margen bruto, EBITDA, BAI y resultado neto.","<b>Saldos</b>: Debe, Haber, Saldo y Saldo acumulado; el balance es una foto acumulada a una fecha.","<b>Análisis</b>: vertical (% sobre el total), horizontal (variación), real frente a presupuesto, proyección a cierre y ratios (liquidez, solvencia, fondo de maniobra, NOF, ROE, ROA, free cash flow).","<b>Calidad</b>: página de checklist con asientos descuadrados y cuentas sin clasificar; obtención de detalles hasta el asiento."],
 ex:"<p>Sumas y saldos: Total Debe − Total Haber debe ser 0. Si no lo es, la página de checklist muestra el asiento descuadrado.</p><p>PyG frente a presupuesto con cascada: se parte del beneficio presupuestado, cada barra suma o resta la desviación de una partida (ventas +12 k, coste de ventas −8 k, gastos operativos −15 k) y el total final es el beneficio real. La conversación pasa de «estamos por debajo» a «la desviación viene de gastos operativos, no de ventas».</p>",
 key:"En BI financiero la dificultad no está en el gráfico sino en la lógica: clasificación de cuentas, signos y subtotales. Si eso está en el modelo y en las medidas, cualquier visual cuadra.",
 viz:"cascada", vizNote:"Cambia entre real y presupuesto y pulsa las partidas. Fíjate en que el <b>total de la cascada es el resultado</b> y cada barra explica una parte de la diferencia.",
 caso:{sec:"Caso informe financiero integral", q:"La dirección analiza balance, PyG y tesorería en documentos separados", html:"<p>Se unifican los diarios de tres empresas y los ajustes, se clasifican las cuentas a 4 dígitos contra el PGC, se modela una constelación con diario y presupuesto y se construye una aplicación con KPI, checklist, sumas y saldos con detalle de asiento, balance vertical y horizontal, PyG con EBITDA, presupuesto y proyección, cash flow y ratios.</p>"},
 yes:["Tienes datos contables a nivel de asiento (ERP como Sage u Odoo).","Necesitas comparar real con presupuesto y explicar desviaciones.","Varias empresas o periodos deben consolidarse con la misma estructura.","Quieres trazabilidad desde el KPI hasta el asiento."],
 no:["Solo tienes cifras agregadas en un Excel: el informe será tan bueno como ese Excel.","Nadie del área financiera valida la clasificación de cuentas: un informe financiero sin validación no genera confianza."],
 code:[{l:"DAX",t:"Importe con signo",s:"Importe Según Signo =\nSUMX ( PyG, PyG[Importe] * RELATED ( Cuentas[Signo] ) )"},
       {l:"DAX",t:"Saldo acumulado a la fecha",s:"Saldo Acumulado =\nCALCULATE (\n    [Debe] - [Haber],\n    FILTER ( ALL ( Calendario[Fecha] ), Calendario[Fecha] <= MAX ( Calendario[Fecha] ) )\n)"},
       {l:"DAX",t:"Fondo de maniobra",s:"Fondo de Maniobra =\nVAR _PN = CALCULATE ( [BS], Balance[Nivel2] = \"Patrimonio neto\" )\nVAR _PNC = CALCULATE ( [BS], Balance[Nivel2] = \"Pasivo no corriente\" )\nVAR _ANC = CALCULATE ( [BS], Balance[Nivel2] = \"Activo no corriente\" )\nRETURN ( _PN + _PNC ) - _ANC"}],
 conf:[{t:"Balance frente a PyG",d:"El balance es una foto acumulada a una fecha (activo y pasivo); la PyG es una película de un periodo (ingresos y gastos)."},{t:"Análisis vertical frente a horizontal",d:"Vertical: peso de cada partida sobre el total del mismo periodo. Horizontal: variación de una partida entre periodos."},{t:"Fondo de maniobra frente a NOF",d:"El fondo de maniobra es la financiación a largo plazo que sobra tras el activo no corriente; las NOF son lo que el negocio necesita para operar (existencias + clientes − proveedores)."}],
 rec:["Debe − Haber = 0 en sumas y saldos.","Clasificar todas las cuentas a 4 dígitos contra el PGC.","Signo en la dimensión, no en el visual.","Tabla de encabezados con orden y tipo de cálculo.","El balance es saldo acumulado; la PyG, movimiento del periodo.","Cascada para explicar real frente a presupuesto."],
 quiz:{q:"¿Cómo compruebas que la contabilidad cargada en el modelo cuadra?",o:["Con un gráfico de cascada","Con sumas y saldos: Total Debe − Total Haber debe ser 0","Contando las cuentas","Comparando con el presupuesto"],a:1,w:"En contabilidad por partida doble cada asiento debe y haber suman lo mismo: si la diferencia total no es cero, hay asientos descuadrados que la página de checklist debe localizar."},
 pro:[{k:"ERP",t:"En Sage 200 los periodos 0, 98 y 99 son apertura, regularización y cierre: quítalos (salvo la apertura del primer año) para no duplicar saldos."},{k:"Proyección",t:"Con una fecha de cierre contable, la PyG proyectada usa el real hasta esa fecha y el presupuesto después."}],
 exam:[],
 src:["Informes Financieros (NamasData)","Construcción de una cuenta de Pérdidas y Ganancias (NamasData)","Balance Financiero (NamasData)"]},

{id:"herramientas", b:"ext", t:"Herramientas externas", lvl:2,
 q:"¿Qué herramientas complementan a Power BI Desktop y cuándo uso cada una?",
 one:"DAX Studio, Tabular Editor y Bravo amplían Desktop: consultar y optimizar DAX, editar y automatizar el modelo, y analizarlo, formatearlo y exportarlo. Se abren desde la pestaña Herramientas externas.",
 friend:"Desktop es el coche; las herramientas externas son el taller. DAX Studio es el banco de diagnóstico que mide el motor, Tabular Editor es la caja de herramientas para cambiar piezas en bloque y Bravo es el kit de limpieza y puesta a punto.",
 steps:["<b>DAX Studio</b>: ejecutar consultas DAX, Server Timings, planes de consulta, VertiPaq Analyzer, exportar resultados y conectarse a modelos publicados (Premium, XMLA).","<b>Tabular Editor</b>: editar el modelo fuera de Desktop, crear grupos de cálculo, scripts C# para automatizar (medidas en bloque), Best Practice Analyzer.","<b>Bravo</b> (SQLBI, gratuita): analizar tamaño y columnas sin usar, formatear todas las medidas, crear un calendario con plantillas y exportar datos a Excel.","<b>DAX Formatter</b>: formatear medidas en línea.","<b>Power Apps y Power Automate</b>: escribir datos desde un informe o automatizar flujos (Power Platform)."],
 ex:"<p>VertiPaq Analyzer revela que el 30 % del modelo son tablas <b>LocalDateTable</b> ocultas. Se desactiva Fecha y hora automáticas, se usa un calendario propio y el modelo pasa de 180 MB a 125 MB.</p><p>Con un script C# en Tabular Editor se crean en un minuto las medidas YTD, PY y YOY % para veinte medidas base, con su formato.</p>",
 key:"Antes de optimizar a ciegas, mide: VertiPaq Analyzer dice dónde está el tamaño y Server Timings dónde está el tiempo.",
 viz:"herrams", vizNote:"Elige una tarea y mira qué herramienta la resuelve. Fíjate en que <b>ninguna sustituye a Desktop</b>: lo complementan.",
 caso:{sec:"Caso modelo pesado", q:"El modelo tarda en abrir y en refrescar", html:"<p>Con Bravo se ve qué columnas ocupan más y cuáles no se usan en ningún visual ni medida; con VertiPaq Analyzer, la cardinalidad de cada columna. Se eliminan columnas sin uso, se redondean decimales, se quita la hora de las fechas y se desactiva la fecha automática.</p>"},
 yes:["Necesitas medir rendimiento o tamaño.","Quieres crear o modificar muchos objetos a la vez.","Gestionas grupos de cálculo.","Quieres formatear y documentar el modelo."],
 no:["Un cambio puntual se hace igual de rápido en Desktop.","Tu organización no permite instalar herramientas de terceros: consulta antes con TI."],
 code:[{l:"DAX",t:"Consulta en DAX Studio",s:"EVALUATE\n    TOPN ( 10,\n        SUMMARIZECOLUMNS ( Productos[Producto], \"Ventas\", [Ventas] ),\n        [Ventas], DESC\n    )"}],
 conf:[{t:"DAX Studio frente a vista Consultas DAX",d:"La vista integrada sirve para consultar y proponer cambios al modelo; DAX Studio añade métricas del servidor y análisis de memoria."},{t:"Tabular Editor 2 frente a 3",d:"El 2 es gratuito; el 3 es de pago y añade editor DAX avanzado, depuración y más comodidad."}],
 rec:["DAX Studio: consultar, medir y analizar memoria.","Tabular Editor: editar, automatizar con C# y grupos de cálculo.","Bravo: analizar, formatear, calendario y exportar.","Mide antes de optimizar.","Desactiva Fecha y hora automáticas."],
 quiz:{q:"VertiPaq Analyzer muestra varias tablas LocalDateTable ocupando memoria. ¿Qué haces?",o:["Borrarlas desde la vista de modelo","Desactivar Fecha y hora automáticas y usar una tabla de calendario propia","Convertirlas en tablas calculadas","Pasar el modelo a DirectQuery"],a:1,w:"Esas tablas las crea Power BI por cada columna de fecha cuando la opción Fecha y hora automáticas está activa. Se eliminan desactivando la opción y marcando un calendario propio como tabla de fechas."},
 pro:[{k:"XMLA",t:"Conectar DAX Studio o Tabular Editor a un modelo publicado requiere capacidad Premium o Fabric y el punto de conexión XMLA habilitado."},{k:"Best Practice Analyzer",t:"Reglas automáticas (columnas sin ocultar, relaciones bidireccionales, formato de medidas) que conviene pasar antes de publicar."}],
 exam:[],
 src:["DAX Studio · Javier Sánchez Rivero (NamasData)","Bravo (NamasData)","Grupos de cálculo y C# · Bernat Agulló"]},

{id:"python", b:"ext", t:"Python en Power BI", lvl:2,
 q:"¿Cuándo y cómo uso Python dentro de Power BI?",
 one:"Python entra en Power BI por tres puertas: como origen de datos, como paso de transformación en Power Query y como objeto visual; útil para limpieza avanzada, estadística o gráficos que Power BI no trae de serie.",
 friend:"Python es un invitado experto: Power BI le pasa una tabla, Python hace su trabajo con sus herramientas (pandas, seaborn) y devuelve una tabla o una imagen. Es potente, pero cada vez que entra hay que presentarle a sus amigos (importar librerías) y no todos los salones (el servicio) le dejan pasar.",
 steps:["Opciones → <b>Scripts de Python</b>: indicar la instalación local (mejor Python que Anaconda).","Instalar librerías: <code>pandas</code>, <code>numpy</code>, <code>matplotlib</code>, <code>seaborn</code>, <code>openpyxl</code>.","<b>Origen</b>: Obtener datos → Script de Python (cada DataFrame resultante es una tabla).","<b>Transformación</b>: Power Query → Transformar → Ejecutar script de Python; la tabla entra como <code>dataset</code>.","<b>Visual</b>: objeto visual de Python; los campos llegan como <code>dataset</code> (ponlos en <b>No resumir</b>) y el gráfico se dibuja con matplotlib o seaborn.","Cada visual importa sus librerías y se edita desde el código; los segmentadores lo filtran."],
 ex:"<p>Un objeto visual de Python con seaborn dibuja un diagrama de caja de ventas por tienda, algo que Power BI no ofrece de forma nativa. Al filtrar por año con un segmentador, el script se vuelve a ejecutar con el subconjunto.</p>",
 key:"Python en el visual recibe los datos ya agregados y sin duplicados: pon los campos en No resumir o los resultados no serán los que esperas.",
 viz:"pyflujo", vizNote:"Pulsa cada puerta de entrada. Fíjate en <b>qué recibe y qué devuelve</b> Python en cada caso.",
 caso:{sec:"Caso limpieza con pandas", q:"Un origen con duplicados y nulos difíciles de tratar con clics", html:"<p>En Power Query se añade un paso Ejecutar script de Python que elimina duplicados y nulos con pandas (<code>dataset.drop_duplicates().dropna()</code>) y devuelve la tabla limpia al siguiente paso.</p>"},
 yes:["Necesitas estadística o machine learning ligero.","Un gráfico estadístico no existe en Power BI.","Ya tienes la lógica escrita en Python."],
 no:["Power Query o DAX lo resuelven: serán más rápidos y sin dependencias.","El informe se actualizará en el servicio sin una puerta de enlace personal o sin soporte para esas librerías."],
 code:[{l:"Python",t:"Objeto visual de Python",s:"# 'dataset' contiene los campos arrastrados al visual\nimport matplotlib.pyplot as plt\nimport seaborn as sns\n\nsns.boxplot(data=dataset, x='Tienda', y='Ventas')\nplt.title('Distribución de ventas por tienda')\nplt.show()"},
       {l:"Python",t:"Paso de Power Query",s:"# 'dataset' es la tabla del paso anterior\nimport pandas as pd\nlimpia = dataset.drop_duplicates().dropna()"}],
 conf:[{t:"Python frente a R",d:"Ambos tienen las mismas tres puertas; elige el lenguaje que domine tu equipo."},{t:"Visual de Python frente a visual personalizado",d:"El de Python es una imagen estática generada por el script; un visual personalizado del marketplace es interactivo."}],
 rec:["Tres puertas: origen, transformación y visual.","Campos en No resumir en el visual.","Importar librerías en cada visual.","El visual es una imagen: no tiene interacción de clic.","Comprueba el soporte en el servicio antes de depender de él."],
 quiz:{q:"En un objeto visual de Python, ¿por qué conviene poner los campos en No resumir?",o:["Para que el visual sea interactivo","Porque Power BI pasa al script un dataframe agregado y sin filas duplicadas, que puede distorsionar el análisis","Porque Python no admite números","Para que se actualice en el servicio"],a:1,w:"Power BI agrupa los campos y elimina duplicados antes de pasar el dataset al script. Con No resumir (y una columna de índice si hace falta) el script recibe los datos tal cual."},
 pro:[{k:"Servicio",t:"El servicio admite un conjunto concreto de librerías y versiones; un script que usa otras falla al publicarse."}],
 exam:[],
 src:["Análisis de datos con Python y Power BI (NamasData)"]},

{id:"gestion", b:"ext", t:"Gestión de proyectos BI", lvl:1,
 q:"¿Cómo organizo un proyecto de Power BI de principio a fin para que salga a tiempo y se use?",
 one:"Un proyecto BI se gana antes de abrir Power BI: ficha técnica, alcance cerrado por escrito, estimación, una metodología de trabajo repetible (parámetros, calendario reutilizable, buenas prácticas de modelo y diseño) y control de horas y desviaciones.",
 friend:"Es como una reforma: si no acuerdas con el cliente qué se hace y qué no antes de tirar tabiques, cada visita añade un enchufe más y la obra nunca termina. El alcance firmado es el plano; la metodología, que el albañil trabaje siempre igual de bien.",
 steps:["<b>Requisitos y preguntas de negocio</b>: quién usa el informe y qué decisiones toma.","<b>Ficha técnica</b> y <b>análisis funcional</b>: tablas, campos, medidas, páginas.","<b>Cierre del alcance</b> por escrito y <b>estimación</b> (incluyendo las tareas que consumen horas sin verse: reuniones, cambios, validaciones).","<b>Desarrollo con método</b>: parámetros de carpeta y archivo, función de calendario reutilizable, hechos con prefijo, último paso Tipo cambiado, pasos comentados, calendario marcado, IDs ocultos, carpetas de medidas.","<b>Diseño</b>: tema JSON, wireframe, rejilla, títulos que explican filtros, padding uniforme.","<b>Seguimiento</b>: horas reales frente a estimadas, gestión de desviaciones y productividad.","<b>Entrega</b>: publicación, formación y feedback."],
 ex:"<p>Para un informe de ventas se cierra el alcance en cinco páginas con 12 medidas y dos orígenes. A mitad del proyecto el cliente pide una página de RR. HH.: como no está en el alcance, se estima aparte y se decide si entra o va a una segunda fase, en lugar de comerse el margen.</p>",
 key:"El éxito de un proyecto BI no es el informe más bonito: es el que responde las preguntas acordadas, a tiempo y dentro del presupuesto, y que la gente usa.",
 viz:"fases", vizNote:"Recorre las fases. Fíjate en cuántas ocurren <b>antes de abrir Power BI Desktop</b>.",
 caso:{sec:"Caso flujo de trabajo (Federico Pastor)", q:"Cada proyecto empezaba de cero", html:"<p>Se estandariza: una ficha técnica en Excel, dos parámetros (Carpeta y Archivo) para cambiar de origen, una función de calendario en M guardada, un tema JSON, una plantilla base para presentar al cliente y una estructura de carpetas de medidas. Cada proyecto nuevo arranca con la mitad del trabajo hecho.</p>"},
 yes:["Trabajas para un cliente o un departamento con expectativas concretas.","El proyecto tiene varias semanas o varias personas.","Vas a repetir proyectos parecidos."],
 no:["Es un análisis exploratorio de una tarde: basta con apuntar las preguntas."],
 code:[],
 conf:[{t:"Alcance frente a requisitos",d:"Los requisitos dicen qué necesita el negocio; el alcance, qué se compromete a entregar este proyecto."},{t:"Estimación frente a presupuesto",d:"La estimación son horas de trabajo; el presupuesto, lo que cuesta. Las tareas «consume-horas» no aparecen si no se estiman."}],
 rec:["Preguntas de negocio antes que gráficos.","Alcance cerrado por escrito.","Estimar también reuniones, cambios y validaciones.","Método repetible: parámetros, calendario, tema, plantillas.","Medir horas reales frente a estimadas."],
 quiz:{q:"A mitad de proyecto el cliente pide una página nueva que no estaba acordada. ¿Qué haces?",o:["La haces sin decir nada para quedar bien","Revisas el alcance: se estima aparte y se decide si entra o va a otra fase","La rechazas siempre","Quitas otra página para compensar sin avisar"],a:1,w:"Lo que no está en el alcance se gestiona como cambio: se estima, se comunica el impacto en plazo y coste y se decide con el cliente. Así no se come el margen ni se retrasa lo acordado."},
 pro:[{k:"Documento de análisis funcional",t:"Describe cada página, medida y origen; es la referencia para validar con el cliente y para el mantenimiento."}],
 exam:[],
 src:["Flujo de trabajo · Federico Pastor (NamasData)","Gestión de proyectos y negociación con clientes de BI (NamasData)","A cuánto asciende tu factura · Salvador Ramos"]},

{id:"fabric", b:"ext", t:"Microsoft Fabric", lvl:3,
 q:"¿Qué es Fabric y cómo se construye una arquitectura de datos de extremo a extremo?",
 one:"Microsoft Fabric reúne en una sola plataforma la ingesta, el almacenamiento (Lakehouse con tablas Delta), el procesamiento (pipelines, dataflows, notebooks), el tiempo real y Power BI, organizados normalmente en capas Bronze, Silver y Gold.",
 friend:"Si Power BI es la tienda, Fabric es toda la cadena: el almacén de recepción donde llega la mercancía tal cual (Bronze), la nave donde se limpia y clasifica (Silver) y el expositor listo para vender (Gold). Pipelines y notebooks son las carretillas y las máquinas que la mueven.",
 steps:["<b>Capacidad y área de trabajo</b>: asignar una capacidad Fabric (región) y permisos mínimos por rol.","<b>Lakehouse</b> con <b>Files</b> (archivos tal cual) y <b>Tables</b> (tablas Delta), consultable con el punto de conexión SQL.","<b>Bronze</b>: ingesta con <b>pipelines</b> (mover y orquestar, por ejemplo HTTP + ForEach con un parámetro) o accesos directos.","<b>Silver</b>: limpiar y modelar con <b>notebooks</b> PySpark (transformaciones complejas) o <b>Dataflows Gen2</b> (ligeras).","<b>Gold</b>: tablas listas para consumo analítico o machine learning (Semantic Link).","<b>Modelo semántico</b> sobre el Lakehouse y <b>Power BI</b> (Direct Lake).","<b>Tiempo real</b>: Eventstream hacia Lakehouse (frío) y Eventhouse con KQL (caliente); Activator para alertas.","<b>Gobierno</b>: centro de monitorización, portal de administración, RLS, certificación y Git."],
 ex:"<p>70 años de temperaturas de Chile: un pipeline con un bucle ForEach descarga un archivo por año desde GitHub al Lakehouse Bronze; un notebook PySpark construye la dimensión tiempo y un Dataflow Gen2 la de estaciones en Silver; otro notebook une mínimas y máximas en la tabla de hechos; el modelo semántico se crea desde Silver y en Gold se guardan las predicciones de un modelo de machine learning.</p>",
 key:"Cada artefacto tiene su papel: pipelines para mover y orquestar, Dataflows Gen2 para transformaciones ligeras y notebooks para las pesadas. La arquitectura medallón es una guía, no un dogma.",
 viz:"medallon", vizNote:"Pulsa cada capa. Fíjate en <b>qué artefacto mueve los datos</b> de una capa a la siguiente.",
 caso:{sec:"Caso curso de Fabric", q:"Pasar de archivos sueltos a un modelo semántico gobernado", html:"<p>Se monta un área de trabajo con tres lakehouses (Bronze, Silver, Gold), un flujo de tareas que ordena los artefactos, el modelo semántico desde Silver y un informe. En el módulo de tiempo real, un Eventstream de datos bursátiles alimenta un Eventhouse consultado con KQL y un informe que se actualiza solo.</p>"},
 yes:["Varias fuentes y equipos necesitan una plataforma común.","Hay volúmenes que Power Query no maneja con soltura.","Necesitas datos en tiempo real o machine learning cerca del dato.","Quieres gobierno centralizado (linaje, permisos, monitorización)."],
 no:["Un informe con dos Excel y un modelo pequeño: Power BI Pro basta.","No hay presupuesto ni personas para gestionar una capacidad."],
 code:[{l:"Python",t:"Notebook PySpark: dimensión tiempo",s:"from pyspark.sql import functions as F\n\ndf = spark.read.table(\"LH_Bronze.temperaturas\")\ndim_tiempo = (df.select(\"time\").distinct()\n    .withColumn(\"Fecha\", F.to_date(\"time\"))\n    .withColumn(\"Año\", F.year(\"Fecha\"))\n    .withColumn(\"Mes\", F.month(\"Fecha\"))\n    .withColumn(\"Dia\", F.dayofmonth(\"Fecha\")))\ndim_tiempo.write.mode(\"overwrite\").saveAsTable(\"LH_Silver.dim_tiempo\")"},
       {l:"KQL",t:"Consulta en un Eventhouse",s:"StockMarket\n| where Sector == \"Tecnología\"\n| summarize Volumen = sum(Volume) by bin(Timestamp, 1m)\n| take 100"}],
 conf:[{t:"Lakehouse frente a Warehouse",d:"El Lakehouse guarda archivos y tablas Delta y se trabaja con Spark y SQL de solo lectura; el Warehouse es un almacén relacional con T-SQL completo."},{t:"Pipeline frente a Dataflow Gen2 frente a notebook",d:"Pipeline: mover y orquestar. Dataflow Gen2: Power Query en la nube para transformaciones ligeras. Notebook: código para transformaciones complejas y machine learning."},{t:"Lakehouse frente a Eventhouse",d:"El Lakehouse es almacenamiento analítico (histórico, frío); el Eventhouse, base KQL para datos de eventos en tiempo real (caliente)."}],
 rec:["Bronze bruto, Silver limpio y modelado, Gold listo para consumir.","Pipeline mueve y orquesta; notebook transforma.","Accesos directos: datos de otra ubicación sin copiarlos.","Eventstream + Eventhouse + KQL para tiempo real.","Certificaciones relacionadas: DP-600 y DP-700."],
 quiz:{q:"Necesitas descargar cada noche un archivo por año desde una URL y guardarlo en el Lakehouse. ¿Qué artefacto usas?",o:["Un notebook de machine learning","Un pipeline con actividad de copia y un bucle ForEach","Un informe de Power BI","Un Eventstream"],a:1,w:"Los pipelines están pensados para mover y orquestar: una actividad de copia con conector HTTP dentro de un ForEach sobre la lista de años, programada cada noche."},
 pro:[{k:"Direct Lake",t:"Power BI lee directamente las tablas Delta del Lakehouse sin importarlas ni consultarlas en DirectQuery: rendimiento de importación con datos al día."},{k:"Regiones",t:"Planifica la región de la capacidad desde el principio: mover artefactos entre regiones obliga a migrarlos."}],
 exam:[],
 src:["Curso de Microsoft Fabric","Manual DataViz (Notion)"]}
];

/* insertar cada tema detrás del indicado (o al final de su bloque) */
NEW.forEach(function(t){
  var idx = -1;
  if(t.after){ for(var i = 0; i < TOPICS.length; i++) if(TOPICS[i].id === t.after){ idx = i; break; } }
  if(idx < 0){ for(var j = TOPICS.length - 1; j >= 0; j--) if(TOPICS[j].b === t.b){ idx = j; break; } }
  delete t.after;
  if(idx < 0) TOPICS.push(t); else TOPICS.splice(idx + 1, 0, t);
});
/* los temas de ampliación van al final, en este orden */
var extOrder = ["financiero","herramientas","python","fabric","gestion"];
var ext = TOPICS.filter(function(t){ return t.b === "ext"; }).sort(function(a, b){ return extOrder.indexOf(a.id) - extOrder.indexOf(b.id); });
for(var k = TOPICS.length - 1; k >= 0; k--) if(TOPICS[k].b === "ext") TOPICS.splice(k, 1);
ext.forEach(function(t){ TOPICS.push(t); });

/* ══ VISUALES DE LOS TEMAS NUEVOS ══ */
function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function nf(n, d){ d = d || 0; return Number(n).toLocaleString("es-ES", {minimumFractionDigits:d, maximumFractionDigits:d}); }
function seg(key, opts, cur, label){
  return '<div class="seg" role="group"' + (label ? ' aria-label="' + label + '"' : "") + ' data-k="' + key + '">' + opts.map(function(o){ var on = String(o[0]) === String(cur); return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + on + '"' + (on ? ' class="on"' : "") + ">" + o[1] + "</button>"; }).join("") + "</div>";
}
function onSeg(root, key, cb){
  var s = root.querySelector('.seg[data-k="' + key + '"]'); if(!s) return;
  s.addEventListener("click", function(e){ var b = e.target.closest("button"); if(!b) return; s.querySelectorAll("button").forEach(function(x){ x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); }); b.classList.add("on"); b.setAttribute("aria-pressed", "true"); cb(b.dataset.v); });
}
function chooser(f, title, items, labelKey){
  /* lista de nodos pulsables con detalle debajo */
  f.title.textContent = title;
  var cur = 0;
  function draw(){
    var h = '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:stretch">';
    items.forEach(function(n, i){ if(i && n.arrow !== false) h += '<div aria-hidden="true" style="display:grid;place-items:center;color:var(--muted)">→</div>'; h += '<button type="button" class="kpi" data-i="' + i + '" style="flex:1 1 140px;text-align:left;cursor:pointer;border:.5px solid ' + (i === cur ? "var(--accent)" : "transparent") + ';' + (i === cur ? "box-shadow:inset 0 0 0 1px var(--accent)" : "") + '"><div class="kl">' + n[labelKey || "z"] + '</div><div style="font-weight:600;color:var(--ink);margin-top:4px">' + n.t + '</div><div class="ks">' + n.s + "</div></button>"; });
    h += '</div><div class="kpi" style="margin-top:14px;background:var(--card)"><div class="kl">' + items[cur].t + '</div><p style="font-size:14.5px;line-height:1.6;margin-top:6px;color:var(--text)">' + items[cur].d + "</p></div>";
    f.body.innerHTML = h;
  }
  f.body.addEventListener("click", function(e){ var b = e.target.closest("[data-i]"); if(!b) return; cur = +b.dataset.i; draw(); });
  draw();
}

VIZ.perfilado = function(f){
  f.title.textContent = "Perfil de columna: 1.000 filas frente a todo el conjunto";
  var m = "1000";
  var P = {
    "1000":{rows:"1.000", cols:[["ProductKey",100,0,0,"1.000 distintos · 1.000 únicos"],["Fecha",100,0,0,"Sin errores en la muestra"],["Amount",98,0,2,"20 vacíos"],["Tienda",100,0,0,"3 distintos"]]},
    "all":{rows:"48.320", cols:[["ProductKey",100,0,0,"2.517 distintos · 2.507 únicos: hay duplicados"],["Fecha",88,12,0,"12 % de errores: fechas mes/día"],["Amount",97,1,2,"Texto en una celda y vacíos"],["Tienda",99,0,1,"Un vacío en marzo"]]}
  };
  f.ctrl.innerHTML = seg("m", [["1000","1.000 primeras filas"],["all","Todo el conjunto"]], m, "Base del perfil");
  onSeg(f.ctrl, "m", function(v){ m = v; draw(); });
  function draw(){
    var p = P[m];
    f.body.innerHTML = '<div class="tw"><table class="vtbl"><thead><tr><th>Columna</th><th>Calidad</th><th class="n">Válido</th><th class="n">Error</th><th class="n">Vacío</th><th>Distribución</th></tr></thead><tbody>' +
      p.cols.map(function(c){ var bad = c[2] > 0 || /duplicad/.test(c[4]); return "<tr><td><b>" + c[0] + '</b></td><td style="min-width:140px"><div style="display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--card-2)"><i style="width:' + c[1] + '%;background:var(--lab3)"></i><i style="width:' + c[2] + '%;background:var(--lab4)"></i><i style="width:' + c[3] + '%;background:var(--line-2)"></i></div></td><td class="n">' + c[1] + ' %</td><td class="n" style="' + (c[2] ? "color:var(--negative-ink);font-weight:600" : "") + '">' + c[2] + ' %</td><td class="n">' + c[3] + ' %</td><td style="' + (bad ? "color:var(--negative-ink)" : "") + '">' + c[4] + "</td></tr>"; }).join("") +
      '</tbody></table></div><p style="font-size:14px;margin-top:10px;color:var(--muted)">Perfil calculado sobre ' + p.rows + " filas. " + (m === "1000" ? "Todo parece limpio… en la muestra." : "Ahora aparecen los problemas reales: errores de fecha y una clave con duplicados que daría una relación varios a varios.") + "</p>";
  }
  draw();
};

VIZ.mlet = function(f){
  f.title.textContent = "Un bloque let paso a paso";
  var steps = [
    {n:"Origen", c:'Origen = Excel.Workbook(File.Contents(Ruta & "ventas.xlsx"))', r:"Lista de hojas y tablas del libro", rows:[["Ventas","Sheet"],["Objetivos","Sheet"]]},
    {n:"Hoja", c:'Hoja = Origen{[Item = "Ventas", Kind = "Sheet"]}[Data]', r:"La hoja Ventas con encabezados en la primera fila", rows:[["Column1","Column2"],["Tienda","Importe"],["Águilas","120,5"]]},
    {n:'#"Encabezados promovidos"', c:'#"Encabezados promovidos" = Table.PromoteHeaders(Hoja)', r:"La primera fila pasa a ser encabezado", rows:[["Tienda","Importe"],["Águilas","120,5"],["Mojácar","98,0"]]},
    {n:'#"Tipo cambiado"', c:'#"Tipo cambiado" = Table.TransformColumnTypes(#"Encabezados promovidos", {{"Importe", type number}})', r:"Importe ya es número: lo devuelve in", rows:[["Tienda","Importe (número)"],["Águilas","120,50"],["Mojácar","98,00"]]}
  ];
  var cur = 3;
  function draw(){
    var code = "let\n" + steps.map(function(s, i){ return "    " + s.c + (i < steps.length - 1 ? "," : ""); }).join("\n") + "\nin\n    " + steps[steps.length - 1].n;
    var lines = code.split("\n");
    f.body.innerHTML = '<div class="vgrid" style="align-items:start"><div class="dax">' + lines.map(function(l, k){ var on = k === cur + 1; return '<div data-l="' + (k - 1) + '" style="cursor:' + (k >= 1 && k <= steps.length ? "pointer" : "default") + ';' + (on ? "background:color-mix(in srgb,var(--lab5) 35%,transparent);border-radius:4px" : "") + '">' + esc(l) + "</div>"; }).join("") + '</div><div class="kpi"><div class="kl">Resultado de ' + esc(steps[cur].n) + '</div><div class="ks" style="margin-bottom:8px">' + steps[cur].r + '</div><table class="vtbl" style="min-width:0">' + steps[cur].rows.map(function(r, i){ return "<tr>" + r.map(function(c){ return (i === 0 ? "<th>" : "<td>") + c + (i === 0 ? "</th>" : "</td>"); }).join("") + "</tr>"; }).join("") + "</table></div></div>" +
      '<div class="pill-row" style="margin-top:12px">' + steps.map(function(s, i){ return '<button type="button" class="vbtn' + (i === cur ? " solid" : "") + '" data-s="' + i + '">' + (i + 1) + ". " + esc(s.n) + "</button>"; }).join("") + "</div>";
  }
  f.body.addEventListener("click", function(e){ var b = e.target.closest("[data-s]"), l = e.target.closest("[data-l]"); if(b) cur = +b.dataset.s; else if(l && +l.dataset.l >= 0 && +l.dataset.l < steps.length) cur = +l.dataset.l; else return; draw(); });
  draw();
};

VIZ.funtabla = function(f){
  f.title.textContent = "La tabla virtual que devuelve cada función";
  var k = "summarize";
  var V = {
    values:{n:"VALUES(Productos[Categoría])", h:["Categoría"], r:[["Bebida"],["Helado"],["Prensa"],["(en blanco)"]], d:"Valores visibles de la columna, incluida la fila en blanco si hay ventas huérfanas."},
    distinct:{n:"DISTINCT(Productos[Categoría])", h:["Categoría"], r:[["Bebida"],["Helado"],["Prensa"]], d:"Igual que VALUES pero sin la fila en blanco."},
    filter:{n:"FILTER(Ventas, Ventas[Importe] > 100)", h:["Fecha","Tienda","Producto","Importe"], r:[["02/07","Águilas","Agua","120,5"],["14/07","Mojácar","Helado","210,0"]], d:"Todas las columnas de Ventas, solo las filas que cumplen la condición: tabla ancha."},
    summarize:{n:"SUMMARIZE(Ventas, Calendario[Mes], \"Ventas\", [Ventas])", h:["Mes","Ventas"], r:[["Jun","72,0"],["Jul","95,0"],["Ago","98,0"]], d:"Una fila por mes con la medida calculada: base para MAXX o AVERAGEX."},
    crossjoin:{n:"CROSSJOIN(VALUES(Calendario[Mes]), VALUES(Tiendas[Tienda]))", h:["Mes","Tienda"], r:[["Jul","Águilas"],["Jul","Cartagena"],["Jul","Mojácar"],["Ago","Águilas"],["Ago","Cartagena"],["Ago","Mojácar"]], d:"Todas las combinaciones: útil para líneas techo o rejillas completas."},
    treatas:{n:"TREATAS(VALUES(MarcasB[Marca]), Productos[Marca])", h:["Productos[Marca]"], r:[["Marca B elegida"]], d:"La selección de una tabla desconectada pasa a filtrar Productos[Marca]."}
  };
  f.ctrl.innerHTML = seg("k", Object.keys(V).map(function(x){ return [x, x.toUpperCase()]; }), k, "Función");
  onSeg(f.ctrl, "k", function(v){ k = v; draw(); });
  function draw(){
    var v = V[k];
    f.body.innerHTML = '<div class="dax" style="margin-bottom:12px">' + esc(v.n) + '</div><div class="vsplit" style="align-items:start"><div class="tw"><table class="vtbl"><thead><tr>' + v.h.map(function(c){ return "<th>" + c + "</th>"; }).join("") + "</tr></thead><tbody>" + v.r.map(function(r){ return "<tr>" + r.map(function(c){ return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") + '</tbody></table></div><div class="kpi"><div class="kl">Tamaño de la tabla virtual</div><div class="kv">' + v.r.length + " × " + v.h.length + '</div><div class="ks">' + v.d + "</div></div></div>";
  }
  draw();
};

VIZ.motores = function(f){
  f.title.textContent = "Formula Engine y Storage Engine";
  var k = "if";
  var V = {
    "if":{n:"SUMX(Ventas, IF(Ventas[Precio] > 25, Ventas[Cantidad]))", fe:620, se:180, q:24, cb:true, d:"El IF no lo resuelve el Storage Engine: aparece CallbackDataID, una petición por bloque de filas y nada se cachea."},
    "filtro":{n:"CALCULATE(SUM(Ventas[Cantidad]), Ventas[Precio] > 25)", fe:12, se:38, q:1, cb:false, d:"El filtro de columna lo resuelve el Storage Engine en una sola consulta xmSQL, en paralelo y cacheable."}
  };
  f.ctrl.innerHTML = seg("k", [["if","IF en el iterador"],["filtro","Filtro de columna"]], k, "Versión de la medida");
  onSeg(f.ctrl, "k", function(v){ k = v; draw(); });
  function draw(){
    var v = V[k], tot = v.fe + v.se, w = 640;
    f.body.innerHTML = '<div class="dax" style="margin-bottom:12px">' + esc(v.n) + '</div><svg viewBox="0 0 ' + w + ' 70" role="img" aria-label="Reparto del tiempo entre motores" style="width:100%;max-width:720px"><rect x="0" y="10" width="' + (w * v.fe / 820) + '" height="34" rx="6" style="fill:var(--lab2)"/><rect x="' + (w * v.fe / 820) + '" y="10" width="' + (w * v.se / 820) + '" height="34" rx="6" style="fill:var(--lab1)"/><text x="4" y="62" style="font-size:12px;fill:var(--muted)">FE ' + v.fe + ' ms · SE ' + v.se + " ms</text></svg>" +
      '<div class="vgrid" style="margin-top:8px"><div class="kpi"><div class="kl">Tiempo total</div><div class="kv">' + tot + ' ms</div></div><div class="kpi"><div class="kl">Consultas al SE</div><div class="kv">' + v.q + '</div></div><div class="kpi"><div class="kl">CallbackDataID</div><div class="kv" style="color:' + (v.cb ? "var(--negative-ink)" : "var(--positive-ink)") + '">' + (v.cb ? "Sí" : "No") + '</div></div></div><p style="font-size:14px;margin-top:10px">' + v.d + "</p>";
  }
  draw();
};

VIZ.puntos = function(f){
  f.title.textContent = "Las capas de un gráfico de negocio";
  var L = {max:true, hoy:true, media:true, gris:true};
  var d = [42,38,45,50,58,72,95,98,64,52,46,60], hoy = 8, mx = 7, mn = 1, avg = d.reduce(function(a, b){ return a + b; }, 0) / d.length;
  f.ctrl.innerHTML = [["max","Máx. y mín."],["hoy","Punto de hoy"],["media","Línea de media"],["gris","Contexto en gris"]].map(function(o){ return '<label class="vlab" style="gap:6px"><input type="checkbox" data-c="' + o[0] + '" checked> ' + o[1] + "</label>"; }).join("");
  f.ctrl.addEventListener("change", function(e){ var c = e.target.dataset.c; if(c){ L[c] = e.target.checked; draw(); } });
  function draw(){
    var W = 640, H = 230, x = function(i){ return 40 + i * (W - 70) / 11; }, y = function(v){ return H - 30 - v * (H - 60) / 110; };
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Gráfico de líneas con puntos destacados" style="width:100%">';
    s += '<line x1="40" x2="' + (W - 30) + '" y1="' + y(0) + '" y2="' + y(0) + '" style="stroke:var(--line-2)"/>';
    if(L.media) s += '<line x1="40" x2="' + (W - 30) + '" y1="' + y(avg) + '" y2="' + y(avg) + '" style="stroke:var(--muted);stroke-dasharray:4 4"/><text x="' + (W - 30) + '" y="' + (y(avg) - 6) + '" text-anchor="end" style="font-size:11px;fill:var(--muted)">Media ' + nf(avg, 1) + "</text>";
    s += '<polyline fill="none" style="stroke:' + (L.gris ? "var(--line-2)" : "var(--lab1)") + ';stroke-width:2.5" points="' + d.map(function(v, i){ return x(i) + "," + y(v); }).join(" ") + '"/>';
    if(L.gris) s += '<polyline fill="none" style="stroke:var(--lab1);stroke-width:3" points="' + d.slice(5, hoy + 1).map(function(v, i){ return x(i + 5) + "," + y(v); }).join(" ") + '"/>';
    if(L.max){ s += '<circle cx="' + x(mx) + '" cy="' + y(d[mx]) + '" r="6" style="fill:var(--lab3)"/><text x="' + x(mx) + '" y="' + (y(d[mx]) - 12) + '" text-anchor="middle" style="font-size:12px;font-weight:600;fill:var(--positive-ink)">Máx. ' + d[mx] + '</text><circle cx="' + x(mn) + '" cy="' + y(d[mn]) + '" r="6" style="fill:var(--lab4)"/><text x="' + x(mn) + '" y="' + (y(d[mn]) + 22) + '" text-anchor="middle" style="font-size:12px;font-weight:600;fill:var(--negative-ink)">Mín. ' + d[mn] + "</text>"; }
    if(L.hoy) s += '<line x1="' + x(hoy) + '" x2="' + x(hoy) + '" y1="20" y2="' + y(0) + '" style="stroke:var(--lab5);stroke-width:1.5"/><circle cx="' + x(hoy) + '" cy="' + y(d[hoy]) + '" r="7" style="fill:var(--lab5)"/><text x="' + (x(hoy) + 8) + '" y="30" style="font-size:12px;font-weight:600;fill:var(--support-ink)">Hoy ' + d[hoy] + "</text>";
    ["E","F","M","A","M","J","J","A","S","O","N","D"].forEach(function(m, i){ s += '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle" style="font-size:11px;fill:var(--muted)">' + m + "</text>"; });
    f.body.innerHTML = s + "</svg>";
  }
  draw();
};

VIZ.cascada = function(f){
  f.title.textContent = "Cuenta de resultados en cascada";
  var esc_ = "real", sel = -1;
  var D = {
    real:[["Ventas netas",420],["Coste de ventas",-236],["Gastos de personal",-78],["Otros gastos",-41],["Amortizaciones",-18],["Resultado financiero",-6],["Impuestos",-10]],
    ppto:[["Ventas netas",408],["Coste de ventas",-228],["Gastos de personal",-75],["Otros gastos",-30],["Amortizaciones",-18],["Resultado financiero",-6],["Impuestos",-13]]
  };
  f.ctrl.innerHTML = seg("e", [["real","Real"],["ppto","Presupuesto"]], esc_, "Escenario");
  onSeg(f.ctrl, "e", function(v){ esc_ = v; sel = -1; draw(); });
  f.body.addEventListener("click", function(e){ var g = e.target.closest("[data-b]"); if(!g) return; sel = +g.dataset.b; draw(); });
  function draw(){
    var rows = D[esc_], W = 660, H = 250, n = rows.length + 1, bw = (W - 60) / n - 10, acc = 0, top = 430, y = function(v){ return H - 40 - v * (H - 70) / top; };
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Gráfico de cascada de la cuenta de resultados" style="width:100%">';
    rows.forEach(function(r, i){ var a = acc, b = acc + r[1]; acc = b; var x = 40 + i * (bw + 10), y1 = y(Math.max(a, b)), h = Math.abs(y(a) - y(b));
      s += '<g data-b="' + i + '" style="cursor:pointer"><rect x="' + x + '" y="' + y1 + '" width="' + bw + '" height="' + Math.max(h, 1) + '" rx="3" style="fill:' + (r[1] >= 0 ? "var(--lab3)" : "var(--lab4)") + ';opacity:' + (sel < 0 || sel === i ? 1 : .35) + '"/><text x="' + (x + bw / 2) + '" y="' + (y1 - 5) + '" text-anchor="middle" style="font-size:11px;fill:var(--ink)">' + (r[1] > 0 ? "+" : "") + r[1] + "</text></g>"; });
    var x = 40 + rows.length * (bw + 10);
    s += '<rect x="' + x + '" y="' + y(acc) + '" width="' + bw + '" height="' + (y(0) - y(acc)) + '" rx="3" style="fill:var(--lab1)"/><text x="' + (x + bw / 2) + '" y="' + (y(acc) - 5) + '" text-anchor="middle" style="font-size:12px;font-weight:700;fill:var(--ink)">' + acc + "</text>";
    rows.concat([["Resultado",0]]).forEach(function(r, i){ s += '<text x="' + (40 + i * (bw + 10) + bw / 2) + '" y="' + (H - 22) + '" text-anchor="middle" style="font-size:9.5px;fill:var(--muted)">' + ({"Ventas netas":"Ventas","Coste de ventas":"Coste","Gastos de personal":"Personal","Otros gastos":"Otros","Amortizaciones":"Amort.","Resultado financiero":"Financiero","Impuestos":"Impuestos","Resultado":"Resultado"})[r[0]] + "</text>"; });
    s += "</svg>";
    var o = D[esc_ === "real" ? "ppto" : "real"], det = sel >= 0 ? '<div class="kpi" style="margin-top:10px"><div class="kl">' + rows[sel][0] + '</div><div class="kv">' + rows[sel][1] + ' k€</div><div class="ks">' + (esc_ === "real" ? "Presupuesto: " : "Real: ") + o[sel][1] + " k€ · desviación " + (rows[sel][1] - o[sel][1] > 0 ? "+" : "") + (rows[sel][1] - o[sel][1]) + " k€</div></div>" : '<p style="font-size:13.5px;color:var(--muted);margin-top:8px">Pulsa una barra para ver su desviación frente al otro escenario.</p>';
    f.body.innerHTML = s + det;
  }
  draw();
};

VIZ.herrams = function(f){
  f.title.textContent = "¿Qué herramienta para qué tarea?";
  var T = [["Medir por qué un visual es lento","DAX Studio","Server Timings y planes de consulta"],["Ver qué columna ocupa más memoria","DAX Studio · Bravo","VertiPaq Analyzer"],["Crear 60 medidas de tiempo de golpe","Tabular Editor","Script C#"],["Crear un grupo de cálculo","Tabular Editor (o Desktop)","Elementos con SELECTEDMEASURE"],["Formatear todas las medidas","Bravo · DAX Formatter","Formato con estilo SQLBI"],["Crear un calendario con festivos","Bravo","Plantillas de fechas"],["Revisar buenas prácticas del modelo","Tabular Editor","Best Practice Analyzer"],["Exportar una tabla del modelo a Excel","Bravo · DAX Studio","Exportar datos"]];
  var cur = 0;
  function draw(){
    f.body.innerHTML = '<div class="pill-row">' + T.map(function(t, i){ return '<button type="button" class="vbtn' + (i === cur ? " solid" : "") + '" data-t="' + i + '">' + t[0] + "</button>"; }).join("") + '</div><div class="vgrid" style="margin-top:14px"><div class="kpi"><div class="kl">Herramienta</div><div class="kv" style="font-size:24px">' + T[cur][1] + '</div></div><div class="kpi"><div class="kl">Función que usas</div><div class="kv" style="font-size:20px">' + T[cur][2] + "</div></div></div>";
  }
  f.body.addEventListener("click", function(e){ var b = e.target.closest("[data-t]"); if(!b) return; cur = +b.dataset.t; draw(); });
  draw();
};

VIZ.pyflujo = function(f){
  chooser(f, "Las tres puertas de Python", [
    {z:"Origen", t:"Script de Python", s:"Obtener datos", d:"El script genera uno o varios DataFrames de pandas; cada uno aparece en el navegador como una tabla que se puede cargar o transformar."},
    {z:"Power Query", t:"Ejecutar script", s:"Transformar", d:"La tabla del paso anterior llega como <code>dataset</code>; el script devuelve DataFrames que el siguiente paso puede expandir. Útil para limpieza con pandas (duplicados, nulos)."},
    {z:"Informe", t:"Objeto visual de Python", s:"Visualizar", d:"Los campos del visual llegan como <code>dataset</code> (agregados y sin duplicados: usa No resumir). El script dibuja con matplotlib o seaborn y Power BI muestra la imagen; los segmentadores la filtran."}
  ]);
};

VIZ.fases = function(f){
  chooser(f, "Fases de un proyecto BI", [
    {z:"Antes de Desktop", t:"Preguntas y requisitos", s:"Quién decide qué", d:"Reuniones con cada área para listar las preguntas de negocio y las decisiones que se tomarán con el informe."},
    {z:"Antes de Desktop", t:"Ficha técnica y análisis", s:"Tablas, medidas, páginas", d:"Documento de análisis funcional: orígenes, campos, medidas y contenido de cada página. Base para validar con el cliente."},
    {z:"Antes de Desktop", t:"Alcance y estimación", s:"Qué entra y qué no", d:"Alcance cerrado por escrito y estimación que incluye las tareas «consume-horas»: reuniones, cambios, validaciones y formación."},
    {z:"Desktop", t:"Desarrollo con método", s:"Parámetros, calendario, modelo", d:"Parámetros de carpeta y archivo, función de calendario reutilizable, estrella, IDs ocultos, carpetas de medidas, tema JSON y wireframe."},
    {z:"Seguimiento", t:"Horas y desviaciones", s:"Real frente a estimado", d:"Control semanal de horas reales frente a estimadas; los cambios fuera de alcance se estiman y se deciden aparte."},
    {z:"Entrega", t:"Publicación y adopción", s:"Que se use", d:"Publicación en el servicio, aplicación, formación a usuarios y feedback. El éxito es que el informe se use para decidir."}
  ]);
};

VIZ.medallon = function(f){
  chooser(f, "Arquitectura medallón en Fabric", [
    {z:"Orígenes", t:"Fuentes", s:"APIs, archivos, bases de datos", d:"Datos operacionales: ERP, CSV en GitHub, sensores en streaming. Fabric los alcanza con conectores, accesos directos o Eventstream."},
    {z:"Bronze", t:"Datos en bruto", s:"Pipeline · acceso directo", d:"Copia fiel del origen (Files y tablas Delta). Salvaguarda histórica: si algo falla después, se reprocesa desde aquí. Un pipeline con ForEach puede traer un archivo por año."},
    {z:"Silver", t:"Limpio y modelado", s:"Notebook · Dataflow Gen2", d:"Tipos correctos, duplicados fuera, dimensiones y hechos. Notebooks PySpark para lo pesado; Dataflows Gen2 para transformaciones ligeras."},
    {z:"Gold", t:"Listo para consumir", s:"Notebook · Semantic Link", d:"Agregados, tablas para informes y resultados de machine learning (predicciones) listos para negocio e IA."},
    {z:"Consumo", t:"Modelo semántico y Power BI", s:"Direct Lake", d:"El modelo semántico lee las tablas Delta sin copiarlas; los informes de Power BI se publican con seguridad (RLS) y gobierno (certificación, Git)."}
  ]);
};

})();
