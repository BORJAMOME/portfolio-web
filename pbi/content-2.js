/* ══════════════════════════════════════════════════════════════
   MANUAL DE POWER BI · contenido (2/2)
   Temas de DAX, Visualización y Service; referencia DAX, glosario
   y preparación del examen PL-300.
   ══════════════════════════════════════════════════════════════ */
TOPICS.push(
/* ─────────────── 4 · DAX ─────────────── */
{
  id:"medidas", b:"dax", t:"Columnas calculadas, medidas y tablas", lvl:1,
  q:"¿Cuándo creo una columna calculada y cuándo una medida?",
  one:"Una columna calculada se calcula al actualizar y ocupa memoria fila a fila; una medida se calcula al vuelo en cada visual, según los filtros, y no ocupa memoria. Por defecto, medida.",
  friend:"Una columna calculada es imprimir el precio con IVA en cada etiqueta de la tienda: ocupa papel y si cambia el IVA hay que reimprimir. Una medida es la calculadora de la caja: calcula el total de lo que llevas en la cesta en ese momento, sea lo que sea.",
  steps:[
    "<b>Medida</b>: agregaciones que dependen de lo que el usuario filtra (ventas, margen, % sobre total). Se calculan en tiempo de consulta y consumen CPU.",
    "<b>Columna calculada</b>: atributos fila a fila que necesitas para filtrar, agrupar o relacionar (tramo de precio, segmento). Se calculan al actualizar y consumen memoria.",
    "<b>Tabla calculada</b>: tablas creadas con DAX (calendario, tabla de parámetros). También ocupan memoria.",
    "Crea una <b>tabla de medidas</b> (Inicio > Introducir datos, vacía) y mueve allí las medidas con «Tabla inicial».",
    "Organízalas en <b>carpetas</b> (Carpeta para mostrar; «01 Ventas\\Margen» crea subcarpetas y «A;B» las pone en dos carpetas).",
    "Oculta las <b>claves externas</b> y las <b>medidas implícitas</b> de los hechos."
  ],
  ex:`<div class="tw"><table class="t"><thead><tr><th>Columna calculada</th><th>Medida</th></tr></thead><tbody>
<tr><td>Se calcula al actualizar y se almacena</td><td>Se calcula al consultar y no se almacena</td></tr>
<tr><td>Consume memoria</td><td>Consume procesador</td></tr>
<tr><td>Contexto de fila automático</td><td>Contexto de filtro del visual</td></tr>
<tr><td>Solo si no hay otra opción</td><td>Siempre que sea posible</td></tr></tbody></table></div>`,
  key:"Las medidas implícitas (arrastrar una columna numérica y que Power BI la sume) tienen grandes limitaciones y no funcionan con grupos de cálculo. Crea siempre medidas explícitas y, para cada columna numérica, ocúltala o quita su agregación predeterminada.",
  viz:"colmed",
  vizNote:"Filtra por tienda y compara: la columna calculada no cambia porque se calculó al actualizar; la medida se recalcula con cada filtro.",
  caso:{sec:"Buenas prácticas", q:"Referencia a medidas sin nombre de tabla", html:`<p>Escribe las columnas como <code>Tabla[Columna]</code> y las medidas como <code>[Medida]</code>, sin tabla. Si escribes <code>Ventas[VentasTotal]</code> y luego mueves la medida a la tabla Indicadores, tendrás que corregir cada referencia. Con <code>[VentasTotal]</code> no pasa nada.</p>`},
  yes:["Medida: cualquier KPI que se agrega o depende de filtros.","Columna calculada: segmentar productos en Caro/Medio/Barato para usarlo en un segmentador."],
  no:["Columna calculada para Precio = Importe / Cantidad si solo la vas a agregar: usa un iterador en la medida.","Medidas implícitas en un modelo publicado."],
  code:[{l:"DAX", t:"Medidas explícitas básicas", s:`VentasTotal   = SUM ( Ventas[ImporteVenta] )
VentasPromedio = AVERAGE ( Ventas[ImporteVenta] )
NumLineas      = COUNTROWS ( Ventas )
NumTickets     = DISTINCTCOUNT ( Ventas[Ticket] )`},{l:"DAX", t:"Columna calculada (contexto de fila)", s:`TipoPrecio = IF ( Producto[PVP] >= 20, "Caro", "Barato" )`}],
  conf:[{t:"Medida explícita frente a implícita", d:"La explícita la escribes tú en DAX y la reutilizas. La implícita la crea Power BI al arrastrar una columna; no se puede referenciar en otras medidas ni usar con grupos de cálculo."},{t:"Medida rápida frente a medida escrita", d:"Las medidas rápidas generan DAX por ti (acumulados, % del total, comparativas). Útiles para aprender: revisa siempre el código que generan."}],
  rec:["Medida por defecto; columna calculada solo si necesitas filtrar o agrupar por ese valor.","Columnas: Tabla[Columna]. Medidas: [Medida].","Tabla de medidas y carpetas.","Oculta claves externas y medidas implícitas."],
  quiz:{q:"Necesitas un segmentador con los tramos «Caro», «Medio» y «Barato» según el PVP del producto. ¿Qué creas?", o:["Una medida con SWITCH","Una columna calculada en Producto","Una medida rápida","Un grupo de cálculo"], a:1, w:"Para usar un valor en un segmentador, una fila o un eje necesitas una columna (atributo), no una medida. Una columna calculada en la dimensión Producto es la opción correcta."},
  pro:[{k:"Lo que se hace en DAX no se ve en Power Query", t:"Una columna creada con DAX no existe para Power Query. Si la necesitas para combinar o transformar, créala en Power Query (o mejor, en el origen)."},{k:"Columnas en Power Query frente a DAX", t:"Si la columna no depende de otras tablas del modelo, créala en Power Query: comprime mejor y el modelo queda más limpio."}],
  exam:["Si un enunciado pide un valor que <b>cambie con los segmentadores</b>, es una medida. Si pide algo para <b>filtrar o poner en un eje</b>, es una columna."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 5","Temario PL-300: Crear cálculos de modelos mediante DAX"]
},
{
  id:"contextos", b:"dax", t:"Contextos de evaluación", lvl:2,
  q:"¿Por qué la misma medida da un resultado distinto en cada celda?",
  one:"Cada valor se calcula dentro de un contexto: el contexto de filtro (qué filas son visibles) y, en iteradores y columnas calculadas, el contexto de fila (en qué fila estoy).",
  friend:"Imagina una sala con todas las ventas en fichas. El contexto de filtro son las luces: el segmentador de año, la fila de la matriz y el filtro de página apagan las fichas que no te interesan, y la medida solo suma las que quedan iluminadas. El contexto de fila es el dedo con el que señalas una ficha concreta mientras la lees.",
  steps:[
    "<b>Contexto de filtro</b>: todos los filtros activos al evaluar una expresión (segmentadores, filtros de visual, página e informe, filas y columnas del visual, interacciones y CALCULATE).",
    "Los filtros viajan por las <b>relaciones</b>: de la dimensión (lado uno) a los hechos (lado varios).",
    "<b>Contexto de fila</b>: existe en columnas calculadas y en iteradores (SUMX, FILTER, ADDCOLUMNS). Permite leer columnas de la fila actual sin agregarlas.",
    "El contexto de fila <b>no se propaga</b> por las relaciones: para leer la dimensión desde una fila de hechos usa RELATED.",
    "<b>Transición de contexto</b>: CALCULATE (o una medida usada dentro de un iterador) convierte el contexto de fila en un contexto de filtro equivalente."
  ],
  ex:`<p>Una página filtrada por Año = 2018 y Categoría = Bebida con una matriz de provincias y tiendas. La celda de «La Manga» se evalúa con Año 2018 + Bebida + Provincia Murcia + Tienda La Manga. El total de Murcia, con Año 2018 + Bebida + Murcia. El total general, solo con Año 2018 + Bebida.</p>`,
  key:"Una medida no «sabe» en qué celda está: solo ve el contexto de filtro. Las funciones agregadoras (SUM, AVERAGE) leen del contexto de filtro, los iteradores (SUMX, FILTER) crean contexto de fila, y CALCULATE es la única que puede modificar el contexto de filtro.",
  viz:"contexto",
  vizNote:"Usa los segmentadores y mira qué filas quedan iluminadas: la medida suma solo esas. Después activa ALL(Tienda) y comprueba qué filtros dejan de afectar.",
  caso:{sec:"Totales que no cuadran", q:"El total de la matriz no es la suma de las filas", html:`<p>En una medida como «MAX(precio) * SUM(cantidad)», la fila de cada producto multiplica su propio máximo, pero la fila de total multiplica el máximo global por la cantidad global. No es un error de Power BI: el total se evalúa con su propio contexto de filtro. La solución es iterar (SUMX sobre los productos) para que el total sume lo que se ve en las filas.</p>`},
  yes:["Siempre: entender los contextos es lo que separa escribir DAX de copiarlo."],
  no:["No intentes «arreglar» un total incorrecto con columnas calculadas: suele ser un problema de contexto."],
  code:[{l:"DAX", t:"Contexto de fila en una columna calculada", s:`BeneficioLinea = Ventas[ImporteVenta] - Ventas[ImporteCoste]`},{l:"DAX", t:"RELATED: de la fila de hechos a la dimensión", s:`PrecioCatalogo = RELATED ( Producto[PVP] )`},{l:"DAX", t:"Transición de contexto dentro de un iterador", s:`Media ventas por cliente =
AVERAGEX (
    Cliente,
    [VentasTotal]   -- la medida provoca transición: filtra Ventas por cada cliente
)`}],
  conf:[{t:"Contexto de filtro frente a contexto de fila", d:"El de filtro decide qué filas son visibles. El de fila indica qué fila se está recorriendo. Una columna calculada tiene contexto de fila pero no de filtro; una medida en un visual tiene contexto de filtro pero no de fila."},{t:"Contexto de filtro sombra", d:"Los iteradores guardan una copia de las filas visibles de la tabla que recorren. Solo ALLSELECTED la activa, y por eso ALLSELECTED dentro de un iterador puede dar resultados sorprendentes."}],
  rec:["Filtro = qué filas se ven. Fila = en qué fila estoy.","Los filtros bajan de dimensiones a hechos.","El contexto de fila no cruza relaciones: usa RELATED.","CALCULATE es la única que modifica el contexto de filtro y provoca la transición."],
  quiz:{q:"En una columna calculada de Ventas escribes = SUM(Ventas[Importe]). ¿Qué obtienes en cada fila?", o:["El importe de esa fila","El total de toda la tabla Ventas en todas las filas","Un error","El importe filtrado por el segmentador"], a:1, w:"La columna calculada tiene contexto de fila pero no de filtro: SUM no usa la fila actual y suma toda la tabla. Si la envuelves en CALCULATE, la transición de contexto filtra por la fila y obtienes el importe de esa fila."},
  pro:[{k:"Vistas sin contexto", t:"La vista de tabla y la vista de consultas DAX no se ven afectadas por los filtros del informe. En la vista de tabla sí hay un contexto de fila automático."},{k:"Funciones según el contexto", t:"Agregadoras (SUM, AVERAGE): contexto de filtro. Iteradoras (SUMX, FILTER): contexto de fila. Neutras (IF, SWITCH, DIVIDE): ninguno. CALCULATE y CALCULATETABLE: modifican el de filtro."}],
  exam:[],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 6","Contextos en DAX (José Manuel Pomares)","Curso DAX (Javier Sánchez Rivero), tema 1"]
},
{
  id:"iteradores", b:"dax", t:"Agregadores e iteradores", lvl:2,
  q:"¿Cuándo uso SUM y cuándo SUMX?",
  one:"SUM suma una columna; SUMX recorre una tabla fila a fila, evalúa una expresión en cada una y suma los resultados. SUM(col) es exactamente SUMX(tabla, col).",
  friend:"SUM es pesar la bolsa entera de la compra. SUMX es pasar cada producto por la caja, multiplicar unidades por precio y luego sumar el ticket. Si todo lo que necesitas es el peso total, no hace falta pasar producto a producto.",
  steps:[
    "El iterador recibe una <b>tabla</b> (o una expresión que devuelve una tabla, como FILTER).",
    "Crea un <b>contexto de fila</b> y evalúa la expresión en cada fila visible.",
    "Guarda los resultados en una <b>columna temporal</b> en memoria.",
    "Aplica la agregación (suma, mínimo, máximo, media) y <b>libera</b> la memoria."
  ],
  ex:`<p>No hay columna Precio en Ventas, solo Cantidad e Importe. Para el precio mínimo al que se ha vendido:</p>
<div class="tw"><table class="t"><thead><tr><th>Línea</th><th class="n">Importe</th><th class="n">Cantidad</th><th class="hl">Importe / Cantidad</th></tr></thead><tbody>
<tr><td>1</td><td class="n">12,00</td><td class="n">4</td><td class="hl n">3,00</td></tr><tr><td>2</td><td class="n">7,50</td><td class="n">3</td><td class="hl n">2,50</td></tr><tr><td>3</td><td class="n">9,00</td><td class="n">2</td><td class="hl n">4,50</td></tr></tbody></table></div>
<p class="res">MINX devuelve <b>2,50</b> sin crear una columna Precio permanente en el modelo.</p>`,
  key:"Pensar «a lo Excel» lleva a crear columnas calculadas para todo. Los iteradores calculan lo mismo al vuelo, sin ocupar memoria, y aceptan como primer argumento cualquier tabla, incluida una filtrada.",
  viz:"sumx",
  vizNote:"Avanza fila a fila y mira cómo se rellena la columna temporal. Cambia SUMX por MINX, MAXX o AVERAGEX: el recorrido es el mismo, solo cambia la agregación final.",
  caso:{sec:"Rendimiento", q:"SUM frente a SUMX con DAX Studio", html:`<p>SUM(Ventas[Importe]) y SUMX(Ventas, Ventas[Importe]) generan la misma consulta interna al motor de almacenamiento. Solo cuando SUMX lleva una expresión (Cantidad * Precio, un IF) se activa la iteración real. Usa SUM cuando baste: es más limpio, igual de rápido e igual de correcto.</p>`},
  yes:["Cálculos fila a fila antes de agregar (Cantidad * Precio).","Agregar sobre una tabla filtrada (SUMX(FILTER(...))).","Medias de medidas por elemento (AVERAGEX sobre clientes)."],
  no:["Iterar tablas de hechos enormes con expresiones complejas que podrías precalcular en Power Query.","Usar SUMX cuando solo sumas una columna: no aporta nada."],
  code:[{l:"DAX", t:"Iteradores típicos", s:`VentasX = SUMX ( Ventas, Ventas[Cantidad] * Ventas[Precio] )

Precio Minimo Venta =
MINX ( Ventas, DIVIDE ( Ventas[ImporteVenta], Ventas[Cantidad] ) )

Ventas Bebidas =
SUMX (
    FILTER ( Ventas, RELATED ( Producto[Categoria] ) = "Bebidas" ),
    Ventas[ImporteVenta]
)

Promedio dias gestion =
AVERAGEX ( Solicitudes, DATEDIFF ( Solicitudes[FechaApertura], Solicitudes[FechaCierre], DAY ) )`}],
  conf:[{t:"SUM frente a SUMX", d:"SUM: una sola columna, motor agregador. SUMX: una expresión por fila, motor iterador. SUM(c) es azúcar sintáctico de SUMX(T, c)."},{t:"COUNT, COUNTROWS y DISTINCTCOUNT", d:"COUNTROWS cuenta filas de una tabla; DISTINCTCOUNT cuenta valores distintos de una columna (tickets); COUNT cuenta valores no vacíos de una columna."}],
  rec:["SUM para una columna; SUMX para una expresión por fila.","Los iteradores crean contexto de fila y una columna temporal.","Primer argumento: cualquier tabla, también FILTER(...).","Evita columnas calculadas que solo sirven para agregarse."],
  quiz:{q:"Tienes Cantidad y Precio en Ventas pero no Importe. ¿Cuál es la medida correcta?", o:["SUM(Ventas[Cantidad]) * SUM(Ventas[Precio])","SUMX(Ventas, Ventas[Cantidad] * Ventas[Precio])","SUM(Ventas[Cantidad] * Ventas[Precio])","AVERAGE(Ventas[Precio]) * COUNTROWS(Ventas)"], a:1, w:"Hay que multiplicar en cada fila y después sumar. Multiplicar las dos sumas da un número sin sentido, y SUM no admite expresiones."},
  pro:[{k:"DATEDIFF", t:"DATEDIFF(inicio, fin, DAY) evita restas de fechas con signo invertido. Si hay fechas ficticias como 31/12/9999 para «sin cerrar», fíltralas antes con FILTER."}],
  exam:[],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 6","Temario PL-300: Crear cálculos de modelos mediante DAX","Curso DAX (Javier Sánchez Rivero), tema 7"]
},
{
  id:"calculate", b:"dax", t:"CALCULATE, ALL y el porcentaje del total", lvl:2,
  q:"¿Cómo cambio los filtros dentro de una medida, por ejemplo para calcular el peso de cada tienda sobre el total?",
  one:"CALCULATE evalúa una expresión con un contexto de filtro modificado: añade, sustituye o quita filtros. Con ALL o REMOVEFILTERS quitas filtros para obtener el denominador de un porcentaje.",
  friend:"CALCULATE es el mando de las luces de la sala de fichas. Puedes encender una zona extra («solo ventas de 5 unidades o más»), cambiar la zona iluminada («solo Águilas, diga lo que diga el segmentador») o encender todas las luces («todas las tiendas») para tener la referencia del total.",
  steps:[
    "Evalúa el <b>contexto de filtro actual</b>.",
    "Hace una <b>copia</b> de ese contexto.",
    "Si hay contexto de fila, aplica la <b>transición de contexto</b>.",
    "Aplica los <b>modificadores</b> (ALL, ALLSELECTED, REMOVEFILTERS, KEEPFILTERS, USERELATIONSHIP, CROSSFILTER).",
    "Aplica los <b>filtros explícitos</b> y evalúa la expresión."
  ],
  ex:`<div class="tw"><table class="t"><thead><tr><th>Tienda</th><th class="n">Ventas</th><th class="n">Ventas todas las tiendas</th><th class="hl">% tienda</th></tr></thead><tbody>
<tr><td>Águilas</td><td class="n">40.000</td><td class="n">100.000</td><td class="hl n">40 %</td></tr><tr><td>Cartagena</td><td class="n">35.000</td><td class="n">100.000</td><td class="hl n">35 %</td></tr><tr><td>Mojácar</td><td class="n">25.000</td><td class="n">100.000</td><td class="hl n">25 %</td></tr></tbody></table></div>
<p class="res">El denominador es el mismo en cada fila porque ALL(Tienda) quita el filtro de tienda que pone la fila de la matriz.</p>`,
  key:"Un filtro explícito sobre una columna (Tienda[Tienda] = \"Aguilas\") sustituye el filtro existente sobre esa columna; no se combina con él. Si quieres que se combine, envuélvelo en KEEPFILTERS.",
  viz:"calculate",
  vizNote:"Avanza por los cinco pasos del algoritmo y mira cómo cambia el conjunto de filtros. Después cambia el modificador (sin modificador, ALL(Tienda), ALL(Ventas), ALLSELECTED) y observa el denominador.",
  caso:{sec:"Un gráfico mejor que la tarta", q:"Porcentaje sobre el total en un gráfico de columnas", html:`<p>El gráfico circular calcula el porcentaje solo, pero con muchas categorías es ilegible. Con una medida de ratio (Ventas / Ventas de todos los productos) puedes usar un gráfico de barras ordenado, mucho más fácil de comparar, y el porcentaje sigue disponible en la etiqueta.</p>`},
  yes:["Porcentajes sobre total, sobre categoría padre o sobre lo seleccionado.","Comparar con un subconjunto fijo (ventas de una tienda de referencia).","Activar relaciones inactivas o cambiar la dirección de filtro en una medida."],
  no:["Envolverlo todo en CALCULATE «por si acaso»: provoca transiciones de contexto innecesarias.","ALL(Ventas) cuando solo querías ignorar la tienda: quita todos los filtros que llegan a Ventas."],
  code:[{l:"DAX", t:"Filtros, ALL y porcentaje", s:`Ventas 5 o mas uds = CALCULATE ( [VentasTotal], Ventas[Cantidad] >= 5 )

Ventas Aguilas = CALCULATE ( [VentasTotal], Tienda[Tienda] = "Aguilas" )

Ventas todas las tiendas = CALCULATE ( [VentasTotal], ALL ( Tienda ) )

% Ventas tienda = DIVIDE ( [VentasTotal], [Ventas todas las tiendas] )`},{l:"DAX", t:"Porcentaje con REMOVEFILTERS y variables", s:`% Solicitudes por prioridad =
VAR _Total =
    CALCULATE ( [Solicitudes], REMOVEFILTERS ( Prioridad[NombrePrioridad] ) )
RETURN
    DIVIDE ( [Solicitudes], _Total )`}],
  conf:[{t:"ALL frente a ALLSELECTED", d:"ALL ignora todos los filtros de la tabla o columna. ALLSELECTED ignora los filtros del propio visual pero respeta los segmentadores y filtros externos: el total de lo que el usuario ha seleccionado."},{t:"ALL frente a REMOVEFILTERS", d:"Como modificador dentro de CALCULATE hacen lo mismo; REMOVEFILTERS es más legible. ALL además puede devolver una tabla (por ejemplo en un iterador); REMOVEFILTERS no."},{t:"ALL frente a ALLEXCEPT", d:"ALLEXCEPT(Tienda, Tienda[Provincia]) quita todos los filtros de Tienda salvo el de provincia: útil para el porcentaje sobre el total de la provincia."}],
  rec:["CALCULATE es la única función que modifica el contexto de filtro (junto con CALCULATETABLE).","Un filtro explícito sustituye el filtro de esa columna.","% del total = DIVIDE(medida, CALCULATE(medida, ALL(...))).","ALLSELECTED = total de lo seleccionado por el usuario."],
  quiz:{q:"Quieres que el porcentaje de cada tienda sea sobre el total de las tiendas que el usuario ha marcado en el segmentador. ¿Qué modificador usas en el denominador?", o:["ALL(Tienda)","ALLSELECTED(Tienda)","REMOVEFILTERS(Ventas)","KEEPFILTERS(Tienda)"], a:1, w:"ALLSELECTED quita el filtro que pone cada fila del visual pero respeta lo seleccionado fuera (el segmentador). ALL ignoraría también el segmentador."},
  pro:[{k:"KEEPFILTERS", t:"CALCULATE([Ventas], KEEPFILTERS(Producto[Color] = \"Rojo\")) intersecta con el filtro existente en lugar de sustituirlo. En una matriz por color, las filas que no son rojas quedan vacías en vez de mostrar las ventas de rojo."},{k:"AquiMandoYo", t:"CALCULATE([Ventas], ALL(Ventas)) ignora cualquier segmentador o filtro que llegue a Ventas. Úsalo con cuidado: es fácil que el usuario crea que el informe no responde."}],
  exam:[],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 6","Contextos en DAX (José Manuel Pomares)","Curso DAX (Javier Sánchez Rivero), tema 4"]
},
{
  id:"logica", b:"dax", t:"Lógica, variables y DIVIDE", lvl:1,
  q:"¿Cómo escribo medidas con condiciones que sean legibles y no fallen?",
  one:"IF para una condición, SWITCH(TRUE(), ...) para varias, VAR para no repetir cálculos y DIVIDE para que una división entre cero no rompa el visual.",
  friend:"Las variables son como apuntar un resultado intermedio en un pósit mientras haces cuentas: lo calculas una vez, le pones nombre y lo usas las veces que quieras. Sin pósit, repites la misma suma cinco veces y es fácil equivocarse en una.",
  steps:[
    "<b>IF</b>(condición, si verdadero, si falso) para un solo corte.",
    "<b>SWITCH</b>(expresión, valor1, resultado1, ..., otro) para traducir valores (1 = Ene, 2 = Feb...).",
    "<b>SWITCH(TRUE(), ...)</b> para tramos: evalúa condiciones en orden y devuelve la primera verdadera.",
    "<b>VAR ... RETURN</b>: guarda resultados intermedios. Solo existen dentro de esa expresión y se evalúan una vez, en el contexto en que se definen.",
    "<b>DIVIDE</b>(numerador, denominador, alternativo) en lugar de «/»: devuelve vacío (o el valor alternativo) si el denominador es 0.",
    "<b>SELECTEDVALUE</b>(columna, alternativo) para leer lo que el usuario ha elegido en un segmentador."
  ],
  ex:`<p>Comisiones por volumen: 5 % si las ventas superan 100.000, 3 % si superan 50.000 y 1 % en el resto. Sin variable, SUM(Ventas[ImporteVenta]) aparece cinco veces; con <code>VAR _Ventas</code>, una.</p>`,
  key:"Una variable se evalúa donde se declara, no donde se usa. Si declaras VAR _Ventas = [Ventas] fuera de un CALCULATE y luego la usas dentro, el CALCULATE no la recalcula con sus filtros.",
  viz:"switch",
  vizNote:"Mueve el importe de ventas y mira qué rama del SWITCH se activa y qué comisión resulta. Prueba también un denominador cero con «/» y con DIVIDE.",
  caso:{sec:"Título dinámico", q:"Un título que cambia con el segmentador", html:`<p>Con SELECTEDVALUE construyes medidas de texto («Ventas de » & SELECTEDVALUE(Categoria[Nombre], \"todas las categorías\")) y las usas en el formato condicional del título del visual. El informe se explica solo según lo que el usuario elige.</p>`},
  yes:["Tramos de precio, comisiones, semáforos de cumplimiento.","Cualquier medida que repite una subexpresión.","Ratios: margen %, crecimiento, cumplimiento."],
  no:["IF anidados de diez niveles: usa SWITCH(TRUE()) o una tabla de tramos."],
  code:[{l:"DAX", t:"SWITCH(TRUE()) para tramos", s:`TipoPrecio =
SWITCH (
    TRUE (),
    Producto[PVP] >= 20, "Caro",
    Producto[PVP] >= 10, "Medio",
    Producto[PVP] > 0,   "Barato",
    "Regalado"
)`},{l:"DAX", t:"Variables", s:`VentasComisiones =
VAR _Ventas = SUM ( Ventas[ImporteVenta] )
RETURN
    SWITCH (
        TRUE (),
        _Ventas >= 100000, _Ventas * 0.05,
        _Ventas >= 50000,  _Ventas * 0.03,
        _Ventas * 0.01
    )`},{l:"DAX", t:"DIVIDE y SELECTEDVALUE", s:`Ventas YoY % = DIVIDE ( [Ventas] - [Ventas PY], [Ventas PY] )

Categoria elegida = SELECTEDVALUE ( Categoria[Nombre], "Todas las categorías" )`}],
  conf:[{t:"«/» frente a DIVIDE", d:"El operador «/» devuelve infinito o error con denominador 0 y rompe los gráficos. DIVIDE devuelve vacío o el valor alternativo que indiques."},{t:"IF frente a SWITCH", d:"Ambos dan el mismo resultado. SWITCH es más legible a partir de dos condiciones y evita los paréntesis anidados."}],
  rec:["SWITCH(TRUE(), ...) para tramos.","VAR ... RETURN: legibilidad y rendimiento.","DIVIDE siempre en ratios.","SELECTEDVALUE para leer el segmentador."],
  quiz:{q:"¿Qué devuelve DIVIDE(10, 0)?", o:["0","Infinito","Un valor en blanco","Un error que rompe el visual"], a:2, w:"DIVIDE devuelve BLANK cuando el denominador es 0 (o el tercer argumento si lo indicas). Los visuales simplemente no muestran ese punto."},
  pro:[{k:"Operadores", t:"Aritméticos + - * /; comparación = <> > >= < <=; lógicos && (Y) y || (O); & concatena textos; IN comprueba pertenencia a una lista: Tienda[Provincia] IN {\"Murcia\", \"Almería\"}."},{k:"Comentarios", t:"// y -- comentan una línea; /* ... */ comenta varias. Comenta el porqué, no el qué."}],
  exam:[],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 6","Temario PL-300: Crear cálculos de modelos mediante DAX"]
},
{
  id:"ti", b:"dax", t:"Inteligencia de tiempo", lvl:2,
  q:"¿Cómo comparo con el año anterior, acumulo en el año o calculo el crecimiento?",
  one:"Las funciones de inteligencia de tiempo devuelven conjuntos de fechas desplazados o acumulados; dentro de CALCULATE, sustituyen el filtro de fecha actual por ese nuevo periodo.",
  friend:"El contexto de filtro de una celda es como estar en una habitación de un calendario: «marzo de 2024». La inteligencia de tiempo es un ascensor: SAMEPERIODLASTYEAR te sube a «marzo de 2023», DATESYTD te abre todas las habitaciones de enero a marzo, y CALCULATE es el botón que te deja salir de la habitación en la que estabas.",
  steps:[
    "Requisito: una <b>tabla de fechas</b> completa, marcada como tabla de fechas y relacionada con los hechos.",
    "Crea la medida base (<code>[Ventas]</code>).",
    "Envuelve en <b>CALCULATE</b> con la función de tiempo: SAMEPERIODLASTYEAR, DATEADD, PARALLELPERIOD, PREVIOUSMONTH...",
    "Para acumulados usa <b>DATESYTD / DATESQTD / DATESMTD</b> o los atajos <b>TOTALYTD / TOTALQTD / TOTALMTD</b>.",
    "Calcula la variación con <b>DIVIDE</b>(actual − anterior, anterior)."
  ],
  ex:`<div class="tw"><table class="t"><thead><tr><th>Función</th><th>Desde marzo de 2024 devuelve</th></tr></thead><tbody>
<tr><td>SAMEPERIODLASTYEAR</td><td>Marzo de 2023</td></tr><tr><td>DATEADD(Fecha, -1, MONTH)</td><td>Febrero de 2024</td></tr>
<tr><td>PARALLELPERIOD(Fecha, -12, MONTH)</td><td>Marzo de 2023 (mes completo)</td></tr><tr><td>PREVIOUSYEAR</td><td>Todo 2023</td></tr>
<tr><td>DATESYTD</td><td>1 de enero a 31 de marzo de 2024</td></tr><tr><td>DATESYTD(Fecha, "31/08")</td><td>1 de septiembre de 2023 a 31 de marzo de 2024</td></tr></tbody></table></div>`,
  key:"DATEADD desplaza exactamente las fechas visibles (útil también con días y trimestres); PARALLELPERIOD devuelve siempre periodos completos del nivel indicado; PREVIOUS/NEXT + YEAR/QUARTER/MONTH/DAY son ocho atajos de desplazamientos de un periodo.",
  viz:"ti",
  vizNote:"Cambia entre Actual, Año anterior, Variación %, Acumulado anual y Mes anterior. Fíjate en que el acumulado se reinicia en enero (o en septiembre si eliges ejercicio fiscal).",
  caso:{sec:"Negocio estacional", q:"Comparar marzo con marzo, no con febrero", html:`<p>Tiendas AHORA vende mucho más en verano. Comparar cada mes con el anterior solo muestra la estacionalidad; comparar con el mismo mes del año anterior (SAMEPERIODLASTYEAR) muestra si el negocio crece de verdad. El acumulado anual (YTD) permite comparar el año en curso con el anterior en cualquier momento del año.</p>`},
  yes:["Comparativas interanuales, mensuales, trimestrales y semanales.","Acumulados anuales, trimestrales, mensuales y por ejercicio fiscal.","Saldos de cierre y apertura (CLOSINGBALANCEMONTH, OPENINGBALANCEMONTH)."],
  no:["Sin tabla de fechas marcada.","Con calendarios de 4-4-5 semanas o fiscales muy particulares: ahí se calcula con columnas del calendario y FILTER (o con la nueva inteligencia de tiempo basada en calendarios)."],
  code:[{l:"DAX", t:"Comparativas", s:`Ventas PY = CALCULATE ( [Ventas], SAMEPERIODLASTYEAR ( Fecha[Fecha] ) )

Ventas PM = CALCULATE ( [Ventas], DATEADD ( Fecha[Fecha], -1, MONTH ) )

Ventas mismo mes año anterior =
CALCULATE ( [Ventas], PARALLELPERIOD ( Fecha[Fecha], -12, MONTH ) )

Ventas YoY % = DIVIDE ( [Ventas] - [Ventas PY], [Ventas PY] )`},{l:"DAX", t:"Acumulados", s:`Ventas YTD = CALCULATE ( [Ventas], DATESYTD ( Fecha[Fecha] ) )

Ventas YTD (atajo) = TOTALYTD ( [Ventas], Fecha[Fecha] )

-- ejercicio fiscal que cierra el 31 de agosto
Ventas YTD fiscal = CALCULATE ( [Ventas], DATESYTD ( Fecha[Fecha], "31/08" ) )`},{l:"DAX", t:"Variables con desplazamiento", s:`VentasDifMesAnterior =
VAR _Actual = [Ventas]
VAR _MesAnterior = CALCULATE ( [Ventas], PARALLELPERIOD ( Fecha[Fecha], -1, MONTH ) )
RETURN
    _Actual - _MesAnterior`}],
  conf:[{t:"SAMEPERIODLASTYEAR frente a PREVIOUSYEAR", d:"SAMEPERIODLASTYEAR desplaza las fechas visibles un año (marzo 2024 → marzo 2023). PREVIOUSYEAR devuelve el año anterior completo, sea cual sea el mes visible."},{t:"DATESYTD frente a TOTALYTD", d:"DATESYTD devuelve la tabla de fechas y se usa dentro de CALCULATE. TOTALYTD es un atajo que ya lleva el CALCULATE incorporado."}],
  rec:["Tabla de fechas marcada y contigua.","Siempre dentro de CALCULATE (o con TOTALxTD).","SAMEPERIODLASTYEAR para el año anterior; DATEADD para cualquier desplazamiento.","YoY % = DIVIDE(actual − anterior, anterior)."],
  quiz:{q:"Con marzo de 2022 seleccionado quieres ver las solicitudes de marzo de 2021. ¿Qué función usas?", o:["PREVIOUSYEAR","SAMEPERIODLASTYEAR","DATESYTD","NEXTYEAR"], a:1, w:"SAMEPERIODLASTYEAR desplaza el periodo visible exactamente un año atrás (marzo 2022 → marzo 2021). PREVIOUSYEAR devolvería todo 2021."},
  pro:[{k:"Semanas", t:"Para comparativas semanales usa columnas del calendario (AñoSemana, OrdenSemana) con FILTER y ALL, o DATEADD(Fecha, -7, DAY) si tus semanas son de lunes a domingo completas."},{k:"Grupos de cálculo", t:"Si necesitas Actual, PY, YoY y YTD para diez medidas distintas, no escribas cuarenta medidas: crea un grupo de cálculo de inteligencia de tiempo."}],
  exam:["«Total de marzo del año anterior cuando se selecciona marzo»: <b>SAMEPERIODLASTYEAR</b>.","Las funciones de inteligencia de tiempo necesitan una tabla de fechas con días contiguos."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 6","Temario PL-300: Crear cálculos de modelos mediante DAX y Repaso general","Curso DAX (Javier Sánchez Rivero), tema 6"]
},
{
  id:"grupos", b:"dax", t:"Grupos de cálculo y parámetros", lvl:3,
  q:"¿Cómo evito escribir la misma lógica para decenas de medidas y dejo que el usuario elija qué ver?",
  one:"Un grupo de cálculo aplica una misma transformación (año anterior, YTD, variación) a cualquier medida mediante SELECTEDMEASURE; los parámetros permiten al usuario elegir valores o campos desde un segmentador.",
  friend:"Un grupo de cálculo es un filtro de fotos: no editas cada foto a mano para ponerla en blanco y negro, aplicas el filtro a la que tengas seleccionada. Escribes «año anterior» una vez y vale para ventas, margen, unidades o cualquier medida nueva que crees mañana.",
  steps:[
    "En la <b>vista de modelo</b>, crea un grupo de cálculo (por ejemplo, Inteligencia de tiempo).",
    "Crea elementos de cálculo: <b>Actual</b> = SELECTEDMEASURE(); <b>PY</b> = CALCULATE(SELECTEDMEASURE(), SAMEPERIODLASTYEAR(...)); <b>YoY %</b> y <b>YTD</b>.",
    "Asigna un <b>formato dinámico</b> a los elementos que devuelven porcentajes (0.0 %).",
    "Usa la columna del grupo en un segmentador, en las columnas de una matriz o en la leyenda.",
    "Para «qué pasaría si», crea un <b>parámetro numérico</b> (mínimo, máximo, incremento, valor predeterminado) y léelo con SELECTEDVALUE.",
    "Para elegir medidas o dimensiones del eje, usa <b>parámetros de campo</b>."
  ],
  ex:`<p>Con 4 medidas base (Ventas, Margen, Unidades, Tickets) y 4 variantes temporales, sin grupo de cálculo necesitas 16 medidas. Con un grupo de cálculo, 4 medidas y 4 elementos, y cada medida nueva hereda las variantes gratis.</p>`,
  key:"Al crear un grupo de cálculo, Power BI desactiva las medidas implícitas: las columnas numéricas ya no se pueden arrastrar para sumarlas. Solo funcionan las medidas explícitas.",
  viz:"grupos",
  vizNote:"Elige una medida y un elemento de cálculo: el código se reescribe sustituyendo SELECTEDMEASURE por la medida. Mueve el parámetro de proyección para ver un «qué pasaría si».",
  caso:{sec:"Proyección", q:"¿Y si las ventas suben un 5 %?", html:`<p>Un parámetro numérico de −20 % a +20 % con incremento 0,01 crea una tabla y un segmentador. La medida <code>Ventas proyectadas = [Ventas] * (1 + [Valor de Crecimiento])</code> recalcula todo el informe al mover la barra. El mismo patrón sirve para elegir cuántos meses desplazar una comparativa.</p>`},
  yes:["Muchas medidas con las mismas variantes de tiempo o de moneda.","Informes donde el usuario elige la métrica o la dimensión del gráfico.","Simulaciones sencillas («qué pasaría si»)."],
  no:["Modelos que dependen de medidas implícitas.","Un solo cálculo puntual: una medida normal es más clara."],
  code:[{l:"DAX", t:"Elementos de un grupo de cálculo", s:`Actual  = SELECTEDMEASURE ()
PY      = CALCULATE ( SELECTEDMEASURE (), SAMEPERIODLASTYEAR ( Fecha[Fecha] ) )
YTD     = CALCULATE ( SELECTEDMEASURE (), DATESYTD ( Fecha[Fecha] ) )
YoY %   =
VAR _PY = CALCULATE ( SELECTEDMEASURE (), SAMEPERIODLASTYEAR ( Fecha[Fecha] ) )
RETURN DIVIDE ( SELECTEDMEASURE () - _PY, _PY )`},{l:"DAX", t:"Parámetro numérico", s:`Crecimiento = GENERATESERIES ( -0.20, 0.20, 0.01 )
Valor de Crecimiento = SELECTEDVALUE ( Crecimiento[Crecimiento], 0 )
Ventas proyectadas = [Ventas] * ( 1 + [Valor de Crecimiento] )`}],
  conf:[{t:"Grupo de cálculo frente a parámetro de campo", d:"El grupo de cálculo transforma la medida que haya (cómo se calcula). El parámetro de campo cambia qué medida o columna aparece en el visual (qué se muestra)."},{t:"Parámetro numérico frente a segmentador normal", d:"El parámetro crea una tabla desconectada con una serie de valores; no filtra nada por sí mismo hasta que una medida lo lee con SELECTEDVALUE."}],
  rec:["SELECTEDMEASURE() representa «la medida que haya».","Formato dinámico para los elementos en %.","Desactiva las medidas implícitas.","Parámetro numérico + SELECTEDVALUE = qué pasaría si."],
  quiz:{q:"Tras crear un grupo de cálculo, un compañero no puede arrastrar la columna Importe a un gráfico para sumarla. ¿Por qué?", o:["Porque la columna está oculta","Porque los grupos de cálculo desactivan las medidas implícitas","Porque hace falta licencia Premium","Porque falta la tabla de fechas"], a:1, w:"Al crear un grupo de cálculo el modelo pasa a requerir medidas explícitas. Hay que crear una medida SUM(Ventas[Importe])."},
  pro:[{k:"Herramientas", t:"Desde 2023 los grupos de cálculo se crean en la vista de modelo de Power BI Desktop; antes era necesario Tabular Editor, que sigue siendo la opción más cómoda para gestionar muchos elementos y scripts en C#."}],
  exam:[],
  src:["Temario PL-300: Crear cálculos de modelos mediante DAX (grupos de cálculo y parámetros)","Curso DAX (Javier Sánchez Rivero), tema 5"]
},
{
  id:"window", b:"dax", t:"Funciones Window y cálculos visuales", lvl:3,
  q:"¿Cómo comparo cada fila con la anterior, con la primera o con una ventana móvil sin escribir DAX imposible?",
  one:"INDEX, OFFSET y WINDOW navegan por una tabla ordenada y particionada (la fila anterior, la primera, las tres últimas); los cálculos visuales hacen lo mismo directamente sobre los datos del visual.",
  friend:"Imagina la tabla como una fila de personas ordenadas por altura, separadas en grupos por país. OFFSET(-1) es «mira a quien tienes delante en tu grupo»; INDEX(1) es «mira al primero de tu grupo»; WINDOW es «mira a las tres personas anteriores y a ti».",
  steps:[
    "Son funciones de <b>tabla</b>: devuelven filas, así que suelen ir dentro de CALCULATE.",
    "<b>ORDERBY</b> define el orden (ASC o DESC); <b>PARTITIONBY</b> reinicia el recorrido en cada grupo.",
    "<b>OFFSET</b>(-1) devuelve la fila anterior; <b>INDEX</b>(1) la primera e INDEX(-1) la última.",
    "<b>WINDOW</b>(inicio, tipo, fin, tipo) devuelve un rango: acumulados, medias móviles.",
    "Los <b>cálculos visuales</b> (Nuevo cálculo en el visual) usan RUNNINGSUM, MOVINGAVERAGE, PREVIOUS, FIRST, COLLAPSE, EXPAND, ISATLEVEL sobre la matriz del visual, sin acceso al resto del modelo."
  ],
  ex:`<div class="tw"><table class="t"><thead><tr><th>País</th><th>Pedido</th><th class="n">Importe</th><th class="hl">OFFSET(-1)</th><th class="hl">INDEX(1)</th></tr></thead><tbody>
<tr><td>España</td><td>P1</td><td class="n">120</td><td class="hl"></td><td class="hl n">120</td></tr><tr><td>España</td><td>P2</td><td class="n">90</td><td class="hl n">120</td><td class="hl n">120</td></tr>
<tr><td>España</td><td>P3</td><td class="n">150</td><td class="hl n">90</td><td class="hl n">120</td></tr><tr><td>Francia</td><td>P4</td><td class="n">80</td><td class="hl"></td><td class="hl n">80</td></tr><tr><td>Francia</td><td>P5</td><td class="n">110</td><td class="hl n">80</td><td class="hl n">80</td></tr></tbody></table></div>`,
  key:"Los cálculos visuales son la forma más sencilla de hacer acumulados, medias móviles, porcentajes sobre el padre o comparaciones con la fila anterior, pero solo ven lo que hay en el visual: no forman parte del modelo ni se pueden reutilizar en otros visuales.",
  viz:"window",
  vizNote:"Cambia la función y la partición. Observa que con PARTITIONBY(País) el recorrido se reinicia en Francia; sin partición, P4 mira a P3 aunque sea de otro país.",
  caso:{sec:"Clientes nuevos, perdidos y recuperados", q:"Comparar cada periodo con el anterior por cliente", html:`<p>Con OFFSET sobre los meses de cada cliente puedes saber si compró el mes anterior: si no compró nunca antes es <b>nuevo</b>, si compró antes pero no el periodo anterior es <b>recuperado</b>, y si compró el periodo anterior pero no este es <b>perdido</b>. Es uno de los análisis de retención más pedidos y con estas funciones deja de requerir DAX muy avanzado.</p>`},
  yes:["Comparar con la fila anterior o con la primera de un grupo.","Acumulados y medias móviles sobre un orden que no es una fecha.","Pareto (80/20) y rankings con acumulado."],
  no:["Cálculos que deben reutilizarse en muchos visuales: créalos como medidas, no como cálculos visuales.","Comparativas puramente de calendario: las funciones de inteligencia de tiempo son más claras."],
  code:[{l:"DAX", t:"Pedido anterior dentro de cada país", s:`Importe pedido anterior =
CALCULATE (
    [Importe],
    OFFSET ( -1, ALLSELECTED ( Pedidos[Pais], Pedidos[Pedido] ),
             ORDERBY ( Pedidos[Pedido], ASC ),
             PARTITIONBY ( Pedidos[Pais] ) )
)`},{l:"DAX", t:"Acumulado con WINDOW", s:`Acumulado =
CALCULATE (
    [Importe],
    WINDOW ( 1, ABS, 0, REL, ALLSELECTED ( Fecha[AñoMes] ), ORDERBY ( Fecha[AñoMes] ) )
)`},{l:"Cálculo visual", t:"Sobre la matriz del visual", s:`Acumulado     = RUNNINGSUM ( [Ventas] )
Media movil 3 = MOVINGAVERAGE ( [Ventas], 3 )
% sobre padre = DIVIDE ( [Ventas], COLLAPSE ( [Ventas], ROWS ) )
Vs anterior   = [Ventas] - PREVIOUS ( [Ventas] )`}],
  conf:[{t:"OFFSET frente a INDEX", d:"OFFSET es relativo a la fila actual (−1 la anterior, +1 la siguiente). INDEX es absoluto dentro de la partición (1 la primera, −1 la última)."},{t:"Cálculo visual frente a medida", d:"El cálculo visual vive en un único visual y solo ve sus datos; es más fácil de escribir. La medida vive en el modelo y se reutiliza en todo el informe."}],
  rec:["ORDERBY ordena, PARTITIONBY reinicia.","OFFSET relativo, INDEX absoluto, WINDOW un rango.","Cálculos visuales: RUNNINGSUM, MOVINGAVERAGE, PREVIOUS, COLLAPSE.","Los cálculos visuales no acceden al modelo."],
  quiz:{q:"Quieres comparar cada pedido con el primer pedido de su país. ¿Qué función usas?", o:["OFFSET(-1, ..., PARTITIONBY(País))","INDEX(1, ..., PARTITIONBY(País))","WINDOW(1, ABS, 0, REL, ...)","RANKX"], a:1, w:"INDEX(1) devuelve la primera fila de cada partición. OFFSET(-1) devolvería el pedido inmediatamente anterior, no el primero."},
  pro:[{k:"COLLAPSE, EXPAND e ISATLEVEL", t:"En los cálculos visuales, COLLAPSE sube un nivel en la jerarquía del visual (el padre), EXPAND baja, e ISATLEVEL te dice en qué nivel estás para dar un cálculo distinto en subtotales."}],
  exam:[],
  src:["DAX 2.0: funciones Window y cálculos visuales (Víctor Lozano)"]
},

/* ─────────────── 5 · VISUALIZACIÓN ─────────────── */
{
  id:"percepcion", b:"vis", t:"Percepción visual y elección del gráfico", lvl:1,
  q:"¿Qué gráfico uso para cada pregunta y cómo hago que lo importante se vea primero?",
  one:"El ojo detecta antes de leer el color, la forma, el tamaño y la posición; elige el gráfico por la pregunta (evolución, ranking, partes del total, real frente a objetivo) y usa el color solo para destacar.",
  friend:"Un buen gráfico es como un buen mapa de metro: no dibuja las calles tal cual, sino lo justo para que encuentres tu línea en dos segundos. Si cada línea tuviera tres colores y cada estación un dibujo distinto, el mapa sería precioso e inútil.",
  steps:[
    "Formula la <b>pregunta</b> que debe responder el visual.",
    "Elige la familia: <b>evolución</b> (líneas, columnas), <b>ranking</b> (barras horizontales ordenadas), <b>partes del total</b> (barras apiladas al 100 %, treemap; tarta solo con 2-3 partes), <b>real frente a objetivo</b> (barras con línea, KPI, medidor), <b>relación</b> (dispersión), <b>distribución</b> (histograma).",
    "Aplica las <b>propiedades preatentivas</b>: un único color de acento para lo que importa y gris para el resto.",
    "Usa la <b>posición</b> para comparar valores parecidos: el ojo compara longitudes alineadas mucho mejor que áreas o ángulos.",
    "Combina tablas y gráficos cuando el usuario necesite tanto la forma como la cifra exacta."
  ],
  ex:`<p>Cinco competidores dominan el mercado y quieres saber dónde estás tú. Con cinco colores distintos, el lector tiene que buscarte en la leyenda. Con cuatro barras grises y la tuya en azul, te encuentra antes de leer nada: eso es usar el color como señal, no como decoración.</p>`,
  key:"Barras apiladas comparan totales; barras agrupadas comparan subcategorías entre sí; barras al 100 % comparan el peso porcentual. El gráfico de cintas muestra el ranking de cada categoría en cada periodo.",
  viz:"grafico",
  vizNote:"Elige la pregunta y mira qué gráfico la responde mejor con los mismos datos. Después activa el resaltado: un solo color dirige la mirada al dato que importa.",
  caso:{sec:"Caso real", q:"Beneficio por año y mes en una matriz", html:`<p>Un cliente quería leer cualquier celda, pero también ver de un vistazo qué meses eran pérdidas, cuáles los mejores y peores, si había un patrón por mes y dónde se rompía. La solución fue una matriz con formato condicional de color divergente (rojo para pérdidas, azul para beneficios, intensidad por magnitud): la tabla sigue siendo una tabla, pero se lee como un mapa de calor.</p>`},
  yes:["Barras horizontales ordenadas para rankings con nombres largos.","Líneas para tendencias con muchos puntos temporales.","Cascada para explicar cómo se pasa de un valor a otro (ventas a beneficio)."],
  no:["Tartas con más de 3-4 porciones.","Gráficos 3D, dobles ejes sin necesidad y colores distintos para cada barra de una misma serie.","Medidores para todo: ocupan mucho y dicen poco."],
  code:[],
  conf:[{t:"Barras apiladas frente a agrupadas", d:"Apiladas: comparas el total de cada categoría y ves su composición. Agrupadas: comparas directamente las subcategorías entre sí, barra con barra."},{t:"Treemap: categoría frente a detalles", d:"Con un segundo campo en Categoría creas una jerarquía que el usuario explora; en Detalles, los rectángulos se subdividen y se ven a la vez."}],
  rec:["Pregunta primero, gráfico después.","Color = señal: un acento y el resto en gris.","Posición y longitud se comparan mejor que área y ángulo.","Tabla + gráfico cuando hacen falta forma y cifra."],
  quiz:{q:"Quieres comparar las ventas de 14 categorías de producto. ¿Qué gráfico eliges?", o:["Gráfico circular","Barras horizontales ordenadas de mayor a menor","Medidor","Gráfico de áreas apiladas"], a:1, w:"Con 14 categorías una tarta es ilegible. Las barras ordenadas permiten comparar longitudes alineadas y leer el ranking de un vistazo."},
  pro:[{k:"Visuales de IA", t:"Elementos influyentes clave explica qué factores aumentan o reducen una métrica; el árbol de descomposición permite desglosar un valor por dimensiones a elección (o por el mayor/menor valor automáticamente); la narrativa inteligente genera texto a partir del visual."},{k:"Líneas analíticas", t:"En el panel Análisis puedes añadir líneas de tendencia, de referencia, de media, previsiones y detección de anomalías en gráficos de líneas."}],
  exam:["Los visuales <b>Elementos influyentes clave</b> y <b>Árbol de descomposición</b> aparecen con frecuencia en el examen.","Si un visual que necesitas no existe en ningún informe del área de trabajo, en un panel puedes crearlo con <b>Preguntas y respuestas</b>."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 7","Temario PL-300: Visualizar y analizar los datos","Gráficos imprescindibles para negocio en Power BI (Claudio Trombini)"]
},
{
  id:"interactividad", b:"vis", t:"Interactividad del informe", lvl:2,
  q:"¿Cómo controlo lo que pasa cuando el usuario hace clic, filtra o navega?",
  one:"Interacciones (filtrar, resaltar o nada), niveles de filtro (visual, página, informe), exploración en profundidad, información sobre herramientas, marcadores y navegadores convierten un conjunto de gráficos en una aplicación.",
  friend:"Un informe interactivo es como un museo bien señalizado: puedes entrar a una sala (página), acercarte a una vitrina (exploración en profundidad), leer la cartela al pasar (tooltip) y volver al vestíbulo desde cualquier sitio (botón de inicio). Sin señales, la gente se pierde y se va.",
  steps:[
    "<b>Editar interacciones</b> (Formato > Editar interacciones): para cada visual decide si filtra, resalta o no afecta al resto.",
    "Cambia el comportamiento por defecto en Opciones > Configuración de informe si prefieres filtrado cruzado a resaltado.",
    "Usa <b>filtros</b> a nivel de visual, de página o de todas las páginas; sincroniza segmentadores entre páginas desde Vista > Sincronizar segmentaciones.",
    "Crea <b>jerarquías</b> para explorar en profundidad y decide si el drill afecta solo al visual (Aplicar filtros de exploración en profundidad a: objeto visual seleccionado).",
    "Diseña <b>páginas de información sobre herramientas</b> (Información de la página > Tipo: información sobre herramientas) y asígnalas a los visuales.",
    "Usa <b>marcadores</b> (instantáneas del estado), agrúpalos y combínalos con el panel de selección y los <b>navegadores</b> de páginas y de marcadores.",
    "Aplica <b>formato condicional</b> (degradado, reglas o campo DAX) a colores, iconos, barras de datos, URL y títulos."
  ],
  ex:`<p>Un gráfico de anillo por prioridad y un gráfico de barras por gestor. Con <b>resaltado</b>, al pulsar «Baja» en el anillo las barras muestran en oscuro la parte de prioridad baja de cada gestor sobre su total. Con <b>filtrado</b>, las barras pasan a mostrar solo las solicitudes de prioridad baja.</p>`,
  key:"El panel de selección controla la visibilidad y el orden de capas; los marcadores guardan ese estado (filtros, visibilidad, página). Para que un objeto quede siempre encima en Service, activa «Mantener el orden de las capas» en sus propiedades.",
  viz:"interaccion",
  vizNote:"Pulsa una categoría del gráfico de la izquierda con cada modo de interacción. Fíjate en que resaltar conserva el contexto del total y filtrar lo elimina.",
  caso:{sec:"Seguridad de los datos", q:"Impedir que exporten los datos de un visual", html:`<p>En Desktop, Opciones > Archivo actual > Configuración de informe > Exportar datos permite elegir qué se puede exportar o «No permitir a los usuarios finales exportar datos». También se configura en Service, en la configuración del informe. La exportación por defecto de un visual es un CSV.</p>`},
  yes:["Resaltar cuando el total sigue siendo útil como referencia.","Tooltips de página para dar detalle sin ocupar espacio.","Marcadores para alternar vistas (gráfico o tabla) con un botón."],
  no:["Diez segmentadores en una página: usa el panel de filtros o una página de filtros.","Interacciones que se contradicen entre visuales de la misma página."],
  code:[{l:"DAX", t:"Medida de color para formato condicional", s:`Color variacion =
IF ( [Ventas YoY %] < 0, "#A3223E", "#2F7D5B" )`},{l:"DAX", t:"Título dinámico", s:`Titulo ventas =
"Ventas de " & SELECTEDVALUE ( Fecha[Año], "todos los años" )`}],
  conf:[{t:"Resaltar frente a filtrar", d:"Resaltar mantiene todos los datos y oscurece la parte seleccionada. Filtrar muestra solo los datos que cumplen la selección."},{t:"Exploración en profundidad frente a obtener detalles (drill-through)", d:"Explorar baja niveles dentro del mismo visual (año, trimestre, mes). Obtener detalles salta a otra página filtrada por el elemento pulsado."}],
  rec:["Editar interacciones: filtrar, resaltar o ninguna.","Filtros: visual, página, todas las páginas.","Marcadores + panel de selección = vistas alternativas.","Tooltips de página para el detalle."],
  quiz:{q:"Al hacer drill en un gráfico, los demás visuales de la página también se filtran y no quieres que pase. ¿Qué cambias?", o:["Edita las interacciones y pon «Ninguno»","Aplicar filtros de exploración en profundidad a: objeto visual seleccionado","Desactiva la jerarquía","Sincroniza los segmentadores"], a:1, w:"La opción de formato «Aplicar filtros de exploración en profundidad a» decide si el drill afecta a toda la página o solo al visual seleccionado."},
  pro:[{k:"Navegadores", t:"El navegador de páginas y el de marcadores generan los botones automáticamente. En el examen preguntan sus opciones: mostrar páginas ocultas, mostrar páginas de información sobre herramientas y mostrar todo de forma predeterminada."},{k:"Informes paginados", t:"Para listados largos con maquetación fija (facturas, albaranes) que se exportan a PDF, Excel o Word, usa Power BI Report Builder."}],
  exam:["El orden de capas de un objeto solo se respeta en Service si activas <b>Mantener el orden de las capas</b>.","La exportación predeterminada de un visual es <b>CSV</b>; se puede impedir desde la configuración del informe."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 8","Temario PL-300: Visualizar y analizar los datos"]
},
{
  id:"storytelling", b:"vis", t:"Storytelling y UX de informes", lvl:2,
  q:"¿Cómo diseño un informe que la gente entienda y use para decidir?",
  one:"Diseña de lo abstracto a lo concreto (estrategia, alcance, estructura, esqueleto y superficie) y ordena la página de lo general a lo particular: KPI, evolución, diagnóstico por dimensiones y detalle.",
  friend:"Un buen informe es como un buen titular de prensa: primero la noticia (el KPI), luego el contexto (la tendencia), después el porqué (el desglose) y al final los datos para quien quiera comprobarlo (la tabla). Nadie empieza un periódico por la letra pequeña.",
  steps:[
    "<b>Estrategia</b> (¿por qué?): objetivos del negocio y necesidades del usuario. ¿Qué decisiones se tomarán con el informe?",
    "<b>Alcance</b> (¿qué?): KPI y dimensiones imprescindibles; filtra el ruido.",
    "<b>Estructura</b>: el guion. Arquitectura de la información (de lo general a lo particular) y diseño de la interacción.",
    "<b>Esqueleto</b>: el layout. Lo importante arriba a la izquierda; el usuario siempre sabe dónde está y cómo volver.",
    "<b>Superficie</b>: color y tipografía para dirigir la atención y generar confianza; usa un tema corporativo."
  ],
  ex:`<div class="tw"><table class="t"><thead><tr><th>Nivel</th><th>Contenido</th><th>Pregunta</th></tr></thead><tbody>
<tr><td>1. KPI generales</td><td>Tarjetas con estado bien/mal</td><td>¿Qué está pasando?</td></tr><tr><td>2. Evolución</td><td>Líneas o columnas en el tiempo</td><td>¿Cuándo?</td></tr>
<tr><td>3. Diagnóstico</td><td>Desglose por geografía, producto</td><td>¿Por qué?</td></tr><tr><td>4. Detalle</td><td>Tablas granulares</td><td>¿Cómo actúo?</td></tr></tbody></table></div>`,
  key:"Exploratorio (storyframing: el usuario explora un dashboard) frente a explicativo (storytelling: le cuentas un hallazgo). Y dos modelos: data story o «sándwich» (los datos revelan la historia) y story with data o «pizza» (la narrativa manda y los datos la refuerzan).",
  viz:"layout",
  vizNote:"Alterna entre el patrón en F y en Z, y entre el flujo del directivo y el del usuario operativo. Fíjate en qué zona se lee primero y qué debería ir en ella.",
  caso:{sec:"Método", q:"Doble diamante aplicado a un informe", html:`<p><b>Descubrir</b>: entrevistas 1:1 (¿para qué es el informe?, ¿qué métricas usas?, ¿cuáles son las tres preguntas clave?), mapa de empatía y arquetipos. <b>Definir</b>: definición técnica (orígenes, modelo, medidas), de contenido (páginas, jerarquía, visuales) y de éxito (MVP e iteraciones). <b>Desarrollar</b>: ideación y flujo de usuario. <b>Entregar</b>: tema corporativo, prototipo, test con usuarios e iteración.</p>`},
  yes:["Informes para dirección: pocos KPI, mensaje claro, navegación lineal.","Informes operativos: más detalle, filtros y tablas, navegación jerárquica."],
  no:["Un único informe para todos los perfiles: el directivo se pierde y el operativo se queda corto."],
  code:[],
  conf:[{t:"Directivo frente a usuario operativo", d:"El directivo comprueba KPI y tendencias y decide si hay que investigar. El operativo baja al detalle cada día para actuar."},{t:"Navegación lineal, radial, jerárquica y asociativa", d:"Lineal: páginas en orden. Radial: un inicio con accesos a cada sección. Jerárquica: de lo general al detalle. Asociativa: saltos entre informes relacionados."}],
  rec:["Cinco planos: estrategia, alcance, estructura, esqueleto, superficie.","Jerarquía: KPI, evolución, diagnóstico, detalle.","Lo importante arriba a la izquierda (patrón F o Z).","Tema corporativo y sistema de diseño."],
  quiz:{q:"¿Dónde colocas los KPI principales de un informe para dirección?", o:["Abajo a la derecha, como conclusión","Arriba a la izquierda, donde empieza la lectura en F o en Z","En una página aparte","En un tooltip"], a:1, w:"Los patrones de lectura en F y en Z empiezan arriba a la izquierda: es la zona de mayor atención y donde debe estar la respuesta a «¿cómo vamos?»."},
  pro:[{k:"Tema corporativo", t:"Un tema JSON con colores, fuentes, estilos de visual, botones y tooltips da agilidad, estandariza y reduce la curva de aprendizaje de cada informe nuevo. Lo ideal es un sistema de diseño con plantillas de página."},{k:"Testing", t:"Testea con usuarios reales antes de publicar: anticipa errores, confirma que el informe resuelve lo que debía y muestra cómo se percibe. Itera: construir, testear, repetir."}],
  exam:[],
  src:["Storytelling con datos con Power BI (Paula García)","Informes efectivos de negocio en Power BI (Claudio Trombini)"]
},

/* ─────────────── 6 · SERVICE Y GOBIERNO ─────────────── */
{
  id:"service", b:"svc", t:"Publicar y compartir en Power BI Service", lvl:1,
  q:"¿Qué pasa cuando publico, cómo se actualizan los datos y cómo llega el informe a los usuarios?",
  one:"Al publicar, el modelo semántico va al servidor de datos y el informe al de informes; desde un área de trabajo actualizas, creas paneles y distribuyes con una aplicación.",
  friend:"El área de trabajo es la cocina del restaurante: ahí trabajas tú y tu equipo. La aplicación es el menú que se entrega a los clientes: solo ven lo que decides servir y solo cuando decides actualizar la carta.",
  steps:[
    "Publica desde Desktop a un <b>área de trabajo</b>: se crean el <b>modelo semántico</b> y el <b>informe</b>.",
    "Configura las credenciales y, si hay orígenes locales, la <b>puerta de enlace</b>.",
    "Programa la <b>actualización</b> del modelo semántico (hasta 8 al día en Pro y 48 en Premium); en tablas grandes, actualización incremental.",
    "Crea <b>paneles</b> anclando visuales de varios informes si necesitas una vista consolidada.",
    "Distribuye con una <b>aplicación</b>: eliges contenido, audiencias y cuándo publicar los cambios."
  ],
  ex:`<p>Corriges un error en el informe y lo vuelves a publicar. En el área de trabajo el cambio se ve al instante, pero los usuarios de la aplicación no lo ven hasta que pulsas <b>Actualizar la aplicación</b>. Así controlas cuándo llegan los cambios al negocio.</p>`,
  key:"No edites informes en el navegador: estarías editando una copia distinta a tu .pbix y no podrías fusionar los cambios. Desarrolla siempre en Desktop y publica.",
  viz:"service",
  vizNote:"Recorre el camino desde el .pbix hasta el usuario final. Pulsa «Republicar» y comprueba la diferencia entre lo que ve el área de trabajo y lo que ve la aplicación.",
  caso:{sec:"Paneles", q:"Un único vistazo a cuatro modelos distintos", html:`<p>Un informe solo puede estar conectado a un modelo semántico. Si dirección quiere ver en una pantalla ventas, compras, RR. HH. y finanzas, cada uno con su modelo, un panel ancla un visual de cada informe. Limitaciones: no se anclan segmentadores (salvo anclando la página completa) y si cambias el visual en el informe, el panel no cambia (solo sus datos).</p>`},
  yes:["Áreas de trabajo por equipo o proyecto.","Aplicaciones para distribuir a usuarios de solo lectura, con audiencias.","Alertas de datos en tarjetas, KPI y medidores de un panel."],
  no:["Compartir informe a informe con decenas de personas: usa una aplicación.","Editar el informe publicado en el navegador."],
  code:[],
  conf:[{t:"Informe frente a panel frente a aplicación", d:"Informe: varias páginas sobre un modelo. Panel: una página de visuales anclados de varios informes. Aplicación: paquete de solo lectura con informes y paneles para una audiencia."},{t:"Actualizar el modelo frente a actualizar la aplicación", d:"Actualizar el modelo trae datos nuevos. Actualizar la aplicación publica para los usuarios los cambios de diseño del contenido."}],
  rec:["Publicar = modelo semántico + informe.","Actualización programada: 8 al día en Pro, 48 en Premium.","Panel = visuales de varios informes.","Aplicación = distribución controlada."],
  quiz:{q:"Has republicado un informe corregido, pero los usuarios de la aplicación siguen viendo la versión antigua. ¿Por qué?", o:["Falta actualizar el modelo semántico","Falta pulsar Actualizar la aplicación","Los usuarios no tienen licencia","La caché del navegador"], a:1, w:"La aplicación es una instantánea del contenido del área de trabajo: los cambios no llegan a los usuarios hasta que actualizas la aplicación."},
  pro:[{k:"Alertas", t:"Las alertas de datos en paneles (Pro o Premium por usuario) solo funcionan en tarjetas, KPI y medidores. Las alertas sobre informes se hacen con Activator en Fabric."},{k:"Exportar", t:"PDF exporta una imagen estática. PowerPoint permite insertar datos en directo (el informe interactivo dentro de la diapositiva, si el usuario tiene acceso) o exportar como imagen."}],
  exam:["Solo los roles <b>Administrador</b> y <b>Miembro</b> pueden actualizar una aplicación (el Colaborador solo si el administrador se lo permite).","En el examen un panel puede llamarse «icono» o «mosaico» (tile); un vídeo de YouTube o Vimeo se añade como Vídeo y el de otra plataforma como Contenido web."],
  src:["Impacta con Power BI (Salvador Ramos), capítulo 9","Temario PL-300: Administración y protección de Power BI"]
},
{
  id:"roles", b:"svc", t:"Roles, licencias y permisos", lvl:2,
  q:"¿Quién puede ver, editar, publicar o administrar en un área de trabajo y qué licencia necesita?",
  one:"Cuatro roles de área de trabajo (Visor, Colaborador, Miembro, Administrador) con permisos crecientes, y licencias por usuario (Pro, Premium por usuario) o por capacidad (Premium, Fabric) que deciden qué se puede compartir.",
  friend:"Un área de trabajo es una oficina. El Visor tiene pase de visitante: mira pero no toca. El Colaborador tiene llave de su mesa: crea y edita. El Miembro, además, puede dar pases a otros. El Administrador tiene la llave maestra: puede incluso cerrar la oficina.",
  steps:[
    "<b>Visor</b>: ve e interactúa con los elementos. No puede publicar desde Desktop.",
    "<b>Colaborador</b>: publica, crea, edita y elimina contenido y programa actualizaciones. No asigna roles.",
    "<b>Miembro</b>: todo lo anterior y añade usuarios con permisos iguales o inferiores; publica y cambia permisos de la aplicación. No elimina el área de trabajo.",
    "<b>Administrador</b>: control total, incluidos eliminar el área, gestionar otros administradores y actualizar sus metadatos.",
    "Asigna roles a <b>grupos de seguridad</b> (Microsoft Entra ID), no persona a persona."
  ],
  ex:`<div class="tw"><table class="t"><thead><tr><th>Acción</th><th>Visor</th><th>Colaborador</th><th>Miembro</th><th>Admin</th></tr></thead><tbody>
<tr><td>Ver e interactuar</td><td>Sí</td><td>Sí</td><td>Sí</td><td>Sí</td></tr><tr><td>Publicar y editar</td><td>No</td><td>Sí</td><td>Sí</td><td>Sí</td></tr>
<tr><td>Programar actualización</td><td>No</td><td>Sí</td><td>Sí</td><td>Sí</td></tr><tr><td>Añadir usuarios</td><td>No</td><td>No</td><td>Sí (iguales o inferiores)</td><td>Sí</td></tr>
<tr><td>Publicar o actualizar la app</td><td>No</td><td>Solo con permiso</td><td>Sí</td><td>Sí</td></tr><tr><td>Eliminar el área</td><td>No</td><td>No</td><td>No</td><td>Sí</td></tr></tbody></table></div>`,
  key:"Compartir contenido de un área de trabajo requiere licencia de pago (Pro o superior). Las licencias funcionan como zonas VIP: quien tiene Premium por usuario entra en áreas Pro, pero quien tiene Pro no entra en áreas Premium por usuario.",
  viz:"roles",
  vizNote:"Elige un rol y mira qué acciones tiene permitidas. Prueba también qué puede hacer un usuario con permiso de compilación sobre el modelo sin pertenecer al área.",
  caso:{sec:"Compartir el modelo sin dar acceso al área", q:"Permiso de compilación", html:`<p>Puedes compartir un modelo semántico con permiso de <b>compilación</b> sin dar acceso al área de trabajo. El usuario lo encuentra en el catálogo de OneLake (o en Desktop > Obtener datos > Modelos semánticos de Power BI) y construye sus propios informes sobre él, con una conexión dinámica.</p>`},
  yes:["Grupos de seguridad para gestionar permisos.","Visor para consumidores, Colaborador para desarrolladores, Miembro para responsables, Administrador para uno o dos dueños."],
  no:["Dar Administrador a todo el equipo «para que no haya problemas»."],
  code:[],
  conf:[{t:"Rol de área de trabajo frente a rol RLS", d:"El rol de área de trabajo decide qué puedes hacer con el contenido. El rol RLS decide qué filas de datos ves dentro de un modelo."},{t:"Pro frente a Premium por usuario frente a capacidad", d:"Pro: compartir y colaborar. Premium por usuario: funciones Premium (más actualizaciones, modelos más grandes, aplicaciones de plantilla) por persona. Capacidad Premium o Fabric: se paga por capacidad y los visores no necesitan licencia de pago."}],
  rec:["Visor < Colaborador < Miembro < Administrador.","El Visor no publica; el Colaborador no asigna roles; el Miembro no elimina el área.","Asigna roles a grupos de seguridad.","Compartir requiere licencia de pago."],
  quiz:{q:"¿Cuál es el rol con menos privilegios que permite publicar informes y programar la actualización de datos?", o:["Visor","Colaborador","Miembro","Administrador"], a:1, w:"El Colaborador puede publicar, crear, editar y programar actualizaciones. Es el rol con privilegios mínimos para esas tareas."},
  pro:[{k:"Exportaciones por rol", t:"El Visor puede exportar a PDF y PowerPoint y usar Analizar en Excel si tiene permiso de compilación. El Colaborador, con acceso al modelo, puede analizar en Excel con conexión dinámica."},{k:"Dominios", t:"Los dominios agrupan áreas de trabajo (Marketing 1, 2 y 3 en el dominio Marketing) para gobernarlas a la vez."}],
  exam:["Si el enunciado habla de <b>grupos de seguridad</b>, piensa en grupos de Microsoft Entra ID usados para asignar roles a muchos usuarios a la vez.","Privilegios mínimos para publicar y programar actualizaciones: <b>Colaborador</b>."],
  src:["Temario PL-300: Administración y protección de Power BI"]
},
{
  id:"rls", b:"svc", t:"Seguridad a nivel de fila (RLS)", lvl:2,
  q:"¿Cómo hago que cada usuario vea solo sus datos con un único informe?",
  one:"La RLS define roles con filtros DAX sobre las tablas del modelo; en Service asignas usuarios o grupos a cada rol y cada uno ve solo las filas que su filtro deja pasar.",
  friend:"Es como un edificio de oficinas con un único ascensor y tarjetas de acceso: todos entran por la misma puerta (el mismo informe), pero la tarjeta de cada uno solo abre su planta.",
  steps:[
    "En Desktop: Modelado > <b>Administrar roles</b> y crea un rol por perfil (o uno dinámico).",
    "Escribe el <b>filtro DAX</b> sobre la tabla adecuada, normalmente una dimensión: <code>[Region] = \"Europa\"</code>.",
    "Para RLS <b>dinámica</b>, usa una tabla de usuarios con su correo y filtra con <code>USERPRINCIPALNAME()</code>.",
    "Prueba con <b>Ver como</b> (rol y, en la dinámica, «Otro usuario»).",
    "Publica y en el modelo semántico de Service asigna usuarios o grupos de seguridad a cada rol."
  ],
  ex:`<p>Estática: un rol «Europa-Rojo» con <code>Geografia[Region] = "Europa"</code> en Geografía y <code>Producto[Color] = "Rojo"</code> en Producto (los filtros de distintas tablas se combinan con Y). Dinámica: una tabla Permisos (Email, Región) relacionada con Geografía y un único rol con <code>Permisos[Email] = USERPRINCIPALNAME()</code>.</p>`,
  key:"La RLS solo se aplica a los usuarios con rol Visor (o a quienes se comparte el contenido). Los Administradores, Miembros y Colaboradores del área de trabajo ven todos los datos.",
  viz:"rls",
  vizNote:"Cambia de usuario y mira qué filas sobreviven. Alterna entre estática y dinámica: en la dinámica el filtro es el mismo para todos, cambia quién lo evalúa.",
  caso:{sec:"Mantenimiento", q:"Doce roles o una tabla de permisos", html:`<p>Con RLS estática, cada combinación de región y color necesita su rol, y cada alta o baja exige republicar. Con una tabla de permisos y USERPRINCIPALNAME, el mantenimiento se hace en una tabla (incluso un Excel en SharePoint) y el modelo no cambia. Para delegar en otro equipo la gestión de miembros, asigna <b>grupos de seguridad</b> a los roles.</p>`},
  yes:["Un informe para todos los comerciales, cada uno con sus clientes.","Filiales que solo deben ver su país."],
  no:["Ocultar columnas sensibles: la RLS filtra filas; para columnas o tablas existe la seguridad a nivel de objeto (OLS).","Usuarios que son Miembros o Colaboradores del área: la RLS no les afecta."],
  code:[{l:"DAX", t:"Filtro estático", s:`-- tabla Geografia, rol Europa
[Region] = "Europa"`},{l:"DAX", t:"Filtro dinámico con tabla de permisos", s:`-- tabla Permisos, rol Dinamico
[Email] = USERPRINCIPALNAME ()`},{l:"DAX", t:"Rol con acceso a todo", s:`-- se crea el rol sin ningún filtro en ninguna tabla`}],
  conf:[{t:"RLS estática frente a dinámica", d:"Estática: un rol por perfil con valores fijos. Dinámica: un rol que filtra por el usuario conectado (USERPRINCIPALNAME o USERNAME)."},{t:"RLS frente a OLS", d:"RLS oculta filas. OLS (seguridad a nivel de objeto) oculta tablas o columnas enteras; se configura con Tabular Editor."}],
  rec:["Roles con filtros DAX en Desktop; usuarios asignados en Service.","Dinámica: tabla de permisos + USERPRINCIPALNAME().","Prueba con Ver como.","No afecta a Administradores, Miembros ni Colaboradores."],
  quiz:{q:"Tienes un rol RLS por región y quieres que otro equipo gestione quién pertenece a cada uno sin tocar el modelo. ¿Qué haces?", o:["Darles el rol Miembro del área de trabajo","Asignar grupos de seguridad de Microsoft Entra ID a cada rol","Crear un rol por usuario","Usar OLS"], a:1, w:"Si asignas grupos de seguridad a los roles, el otro equipo solo tiene que gestionar la pertenencia a los grupos en Entra ID; el modelo no cambia."},
  pro:[{k:"Probar con DAX Studio", t:"Puedes conectar DAX Studio indicando un rol o un usuario efectivo y lanzar EVALUATE sobre las tablas para comprobar qué filas ve cada perfil."},{k:"Bidireccional y RLS", t:"Si un filtro de seguridad debe viajar por una relación bidireccional, marca «Aplicar filtro de seguridad en ambas direcciones»."},{k:"Rendimiento", t:"Los filtros RLS sobre dimensiones pequeñas son baratos; filtros complejos sobre tablas de hechos enormes encarecen cada consulta."}],
  exam:["RLS con dos tablas relacionadas en ambas direcciones: activa <b>aplicar filtro de seguridad en ambas direcciones</b>.","Delegar la gestión de miembros de un rol: asigna <b>grupos de seguridad</b>."],
  src:["Seguridad a nivel de fila (Ricardo Rincón, NamasData)","Temario PL-300: Implementar roles de seguridad de nivel de fila"]
},
{
  id:"git", b:"svc", t:"Control de versiones con PBIP y Git", lvl:3,
  q:"¿Cómo guardo el historial de cambios de un informe y trabajo en equipo sin pisarnos?",
  one:"Guardando el proyecto como PBIP (carpetas de texto en lugar de un .pbix binario) puedes versionarlo con Git en GitHub o Azure DevOps: ramas, commits, comparaciones y vuelta atrás.",
  friend:"Un .pbix es una caja cerrada: sabes que algo cambió pero no qué. Un PBIP es la misma caja abierta y con cada pieza etiquetada: Git puede decirte «has cambiado esta medida y este color», guardar cada versión y deshacer solo lo que quieras.",
  steps:[
    "Activa la vista previa y guarda como <b>Proyecto de Power BI (.pbip)</b> en una carpeta nueva.",
    "Abre la carpeta en <b>Visual Studio Code</b> (con extensiones como TMDL) y ejecuta <code>git init</code>.",
    "<code>git add</code> y <code>git commit</code> para la primera versión; publica la rama en GitHub o Azure DevOps.",
    "Crea una rama <b>desarrollo</b> para cada cambio, haz commit y fusiona (merge) en <b>main</b> cuando esté validado.",
    "Para volver atrás, busca el hash del commit y usa <code>git checkout</code> o <code>git revert</code>.",
    "En Service, conecta un área de trabajo Premium por usuario o Fabric al repositorio (<b>integración con Git</b>) con un token de acceso personal."
  ],
  ex:`<p>Cambias el color de un visual y una medida. En el diff de VS Code ves exactamente las dos líneas modificadas del JSON del informe y del TMDL del modelo. Si la medida era un error, reviertes solo ese commit y el color se queda.</p>`,
  key:"Guarda siempre en Power BI Desktop antes de hacer commit: Git solo ve lo que está escrito en los archivos. Y cada vez que cambias de rama, cierra y vuelve a abrir el proyecto, porque estás cambiando el informe que hay en disco.",
  viz:"git",
  vizNote:"Haz commits en desarrollo, fusiona en main y prueba a volver a un commit anterior. Fíjate en que main solo cambia cuando fusionas.",
  caso:{sec:"Equipo", q:"Dos desarrolladores, un mismo informe", html:`<p>Con un .pbix compartido en una carpeta, el último que guarda gana y se pierde el trabajo del otro. Con PBIP y ramas, cada uno trabaja en su rama, los cambios se revisan en una pull request y Git fusiona automáticamente los archivos que no se solapan.</p>`},
  yes:["Equipos de más de una persona sobre los mismos informes.","Necesidad de auditoría: quién cambió qué y cuándo.","Despliegue entre entornos (desarrollo, prueba, producción)."],
  no:["Un informe personal que nadie más toca: el historial de versiones de OneDrive puede bastar."],
  code:[{l:"Git", t:"Flujo básico", s:`git init
git add .
git commit -m "Primera versión del informe de ventas"
git checkout -b desarrollo
# ... cambios en Power BI Desktop, guardar ...
git add .
git commit -m "Añade medida de margen"
git checkout main
git merge desarrollo
git push origin main`}],
  conf:[{t:"PBIX frente a PBIP", d:"PBIX es un único binario (Git no ve qué cambia). PBIP es una carpeta con la definición del informe y del modelo (TMDL) en texto, comparable línea a línea."},{t:"Integración con Git frente a canalizaciones de implementación", d:"La integración con Git sincroniza un área de trabajo con una rama. Las canalizaciones de implementación mueven contenido entre áreas de desarrollo, prueba y producción."}],
  rec:["Guarda como PBIP para poder versionar.","Ramas para cada cambio; merge a main al validar.","Guarda en Desktop antes de cada commit.","Integración con Git en Service con token de acceso."],
  quiz:{q:"¿Por qué no basta con subir el .pbix a GitHub para tener control de versiones útil?", o:["GitHub no admite archivos de más de 1 MB","El .pbix es binario y Git no puede mostrar ni fusionar los cambios","Power BI bloquea los archivos en Git","Hace falta Azure DevOps"], a:1, w:"Git guarda versiones del .pbix pero no puede compararlas ni fusionarlas. El formato PBIP guarda el proyecto como texto y permite ver y combinar cambios."},
  pro:[{k:"TMDL", t:"El formato TMDL describe el modelo (tablas, medidas, relaciones) en texto legible. Puedes editar medidas en VS Code o desde la vista TMDL de Desktop y Git las versiona una a una."}],
  exam:[],
  src:["Control de versiones en Power BI con GitHub y Azure DevOps (NamasData)"]
}
);

/* ══ REFERENCIA DAX ══════════════════════
   f: función · c: categoría · s: sintaxis · d: qué hace · t: tema del manual */
var DAXREF = [
  {f:"SUM", c:"Agregación", s:"SUM(<columna>)", d:"Suma los valores de una columna en el contexto de filtro.", t:"iteradores"},
  {f:"AVERAGE", c:"Agregación", s:"AVERAGE(<columna>)", d:"Media aritmética de una columna.", t:"iteradores"},
  {f:"MIN / MAX", c:"Agregación", s:"MIN(<columna>)", d:"Menor o mayor valor de una columna.", t:"iteradores"},
  {f:"COUNTROWS", c:"Agregación", s:"COUNTROWS(<tabla>)", d:"Número de filas de una tabla (líneas de venta, solicitudes).", t:"medidas"},
  {f:"DISTINCTCOUNT", c:"Agregación", s:"DISTINCTCOUNT(<columna>)", d:"Número de valores distintos de una columna (tickets, clientes).", t:"medidas"},
  {f:"SUMX", c:"Iterador", s:"SUMX(<tabla>, <expresión>)", d:"Evalúa la expresión fila a fila y suma los resultados.", t:"iteradores"},
  {f:"AVERAGEX", c:"Iterador", s:"AVERAGEX(<tabla>, <expresión>)", d:"Media de una expresión evaluada fila a fila.", t:"iteradores"},
  {f:"MINX / MAXX", c:"Iterador", s:"MINX(<tabla>, <expresión>)", d:"Mínimo o máximo de una expresión evaluada fila a fila.", t:"iteradores"},
  {f:"RANKX", c:"Iterador", s:"RANKX(<tabla>, <expresión>[, <valor>[, <orden>[, <empates>]]])", d:"Posición de cada elemento según una expresión.", t:"iteradores"},
  {f:"FILTER", c:"Tabla", s:"FILTER(<tabla>, <condición>)", d:"Devuelve las filas que cumplen una condición; crea contexto de fila.", t:"iteradores"},
  {f:"ALL", c:"Filtro", s:"ALL(<tabla> | <columna>[, ...])", d:"Quita los filtros de una tabla o columnas; también devuelve la tabla sin filtrar.", t:"calculate"},
  {f:"ALLEXCEPT", c:"Filtro", s:"ALLEXCEPT(<tabla>, <columna>[, ...])", d:"Quita todos los filtros de la tabla salvo los de las columnas indicadas.", t:"calculate"},
  {f:"ALLSELECTED", c:"Filtro", s:"ALLSELECTED([<tabla> | <columna>])", d:"Quita los filtros del visual pero mantiene los externos (segmentadores).", t:"calculate"},
  {f:"REMOVEFILTERS", c:"Filtro", s:"REMOVEFILTERS([<tabla> | <columna>])", d:"Quita filtros dentro de CALCULATE. Equivale a ALL como modificador.", t:"calculate"},
  {f:"KEEPFILTERS", c:"Filtro", s:"KEEPFILTERS(<filtro>)", d:"Hace que un filtro de CALCULATE se intersecte con el existente en vez de sustituirlo.", t:"calculate"},
  {f:"CALCULATE", c:"Filtro", s:"CALCULATE(<expresión>[, <filtro1>[, ...]])", d:"Evalúa una expresión con el contexto de filtro modificado. Provoca transición de contexto.", t:"calculate"},
  {f:"CALCULATETABLE", c:"Filtro", s:"CALCULATETABLE(<tabla>[, <filtro1>[, ...]])", d:"Como CALCULATE, pero devuelve una tabla.", t:"calculate"},
  {f:"SELECTEDVALUE", c:"Información", s:"SELECTEDVALUE(<columna>[, <alternativo>])", d:"Valor de la columna si solo hay uno visible; si no, el alternativo.", t:"logica"},
  {f:"VALUES", c:"Tabla", s:"VALUES(<columna> | <tabla>)", d:"Valores distintos visibles de una columna (incluye el blanco de filas huérfanas).", t:"iteradores"},
  {f:"RELATED", c:"Relación", s:"RELATED(<columna>)", d:"Desde una fila del lado varios, lee una columna de la tabla del lado uno.", t:"contextos"},
  {f:"RELATEDTABLE", c:"Relación", s:"RELATEDTABLE(<tabla>)", d:"Desde una fila del lado uno, devuelve las filas relacionadas del lado varios.", t:"contextos"},
  {f:"USERELATIONSHIP", c:"Relación", s:"USERELATIONSHIP(<columna1>, <columna2>)", d:"Activa una relación inactiva dentro de CALCULATE.", t:"relaciones"},
  {f:"CROSSFILTER", c:"Relación", s:"CROSSFILTER(<col1>, <col2>, <dirección>)", d:"Cambia la dirección de filtro de una relación dentro de CALCULATE (BOTH, ONEWAY, NONE).", t:"relaciones"},
  {f:"TREATAS", c:"Relación", s:"TREATAS(<tabla>, <columna>[, ...])", d:"Aplica los valores de una tabla como filtro sobre columnas de otra sin relación física.", t:"relaciones"},
  {f:"IF", c:"Lógica", s:"IF(<condición>, <si verdadero>[, <si falso>])", d:"Devuelve un valor u otro según una condición.", t:"logica"},
  {f:"SWITCH", c:"Lógica", s:"SWITCH(<expresión>, <valor>, <resultado>[, ...][, <otro>])", d:"Traduce valores; con TRUE() como expresión evalúa condiciones en orden.", t:"logica"},
  {f:"DIVIDE", c:"Matemática", s:"DIVIDE(<numerador>, <denominador>[, <alternativo>])", d:"División segura: devuelve blanco o el alternativo si el denominador es 0.", t:"logica"},
  {f:"VAR / RETURN", c:"Lógica", s:"VAR <nombre> = <expresión> RETURN <expresión>", d:"Guarda un resultado intermedio que se evalúa una vez donde se declara.", t:"logica"},
  {f:"SAMEPERIODLASTYEAR", c:"Tiempo", s:"SAMEPERIODLASTYEAR(<fechas>)", d:"Las fechas visibles desplazadas un año atrás.", t:"ti"},
  {f:"DATEADD", c:"Tiempo", s:"DATEADD(<fechas>, <n>, <DAY|MONTH|QUARTER|YEAR>)", d:"Desplaza las fechas visibles n periodos (negativo hacia atrás).", t:"ti"},
  {f:"PARALLELPERIOD", c:"Tiempo", s:"PARALLELPERIOD(<fechas>, <n>, <MONTH|QUARTER|YEAR>)", d:"Periodos completos desplazados n posiciones.", t:"ti"},
  {f:"PREVIOUSMONTH / YEAR", c:"Tiempo", s:"PREVIOUSMONTH(<fechas>)", d:"El mes (o trimestre, año, día) completo anterior. También NEXTMONTH y similares.", t:"ti"},
  {f:"DATESYTD", c:"Tiempo", s:"DATESYTD(<fechas>[, <fin de ejercicio>])", d:"Fechas desde el inicio del año (o ejercicio) hasta la última visible. También DATESQTD y DATESMTD.", t:"ti"},
  {f:"TOTALYTD", c:"Tiempo", s:"TOTALYTD(<expresión>, <fechas>[, <filtro>][, <fin de ejercicio>])", d:"Atajo de CALCULATE + DATESYTD. También TOTALQTD y TOTALMTD.", t:"ti"},
  {f:"CLOSINGBALANCEMONTH", c:"Tiempo", s:"CLOSINGBALANCEMONTH(<expresión>, <fechas>)", d:"Valor en el último día del mes: saldos e inventarios. También OPENINGBALANCEMONTH.", t:"ti"},
  {f:"LASTDATE", c:"Tiempo", s:"LASTDATE(<fechas>)", d:"Última fecha visible, como tabla de una fila (útil dentro de CALCULATE).", t:"ti"},
  {f:"LASTNONBLANKVALUE", c:"Tiempo", s:"LASTNONBLANKVALUE(<columna>, <expresión>)", d:"Valor de la expresión en el último elemento con dato.", t:"ti"},
  {f:"CALENDAR", c:"Tabla", s:"CALENDAR(<inicio>, <fin>)", d:"Tabla con una fila por día entre dos fechas.", t:"calendario"},
  {f:"CALENDARAUTO", c:"Tabla", s:"CALENDARAUTO([<mes fin ejercicio>])", d:"Calendario a partir de todas las fechas del modelo. Úsalo con cuidado.", t:"calendario"},
  {f:"ADDCOLUMNS", c:"Tabla", s:"ADDCOLUMNS(<tabla>, <nombre>, <expresión>[, ...])", d:"Añade columnas calculadas a una tabla (calendarios, tablas virtuales).", t:"calendario"},
  {f:"SUMMARIZECOLUMNS", c:"Tabla", s:"SUMMARIZECOLUMNS(<columnas>, [<filtros>], <nombre>, <expresión>)", d:"Agrupa y calcula: es la consulta que generan los visuales.", t:"iteradores"},
  {f:"TOPN", c:"Tabla", s:"TOPN(<n>, <tabla>, <expresión>[, <orden>])", d:"Las n primeras filas según una expresión.", t:"iteradores"},
  {f:"GENERATESERIES", c:"Tabla", s:"GENERATESERIES(<inicio>, <fin>[, <incremento>])", d:"Serie numérica; base de los parámetros numéricos.", t:"grupos"},
  {f:"SELECTEDMEASURE", c:"Grupos de cálculo", s:"SELECTEDMEASURE()", d:"La medida sobre la que se aplica un elemento de cálculo.", t:"grupos"},
  {f:"INDEX", c:"Window", s:"INDEX(<posición>, [<relación>], [ORDERBY], [PARTITIONBY])", d:"Fila en una posición absoluta de la partición (1 primera, -1 última).", t:"window"},
  {f:"OFFSET", c:"Window", s:"OFFSET(<desplazamiento>, [<relación>], [ORDERBY], [PARTITIONBY])", d:"Fila desplazada respecto a la actual (-1 anterior).", t:"window"},
  {f:"WINDOW", c:"Window", s:"WINDOW(<desde>, <tipo>, <hasta>, <tipo>, [<relación>], [ORDERBY], [PARTITIONBY])", d:"Rango de filas: acumulados y medias móviles.", t:"window"},
  {f:"RUNNINGSUM", c:"Cálculo visual", s:"RUNNINGSUM(<columna>)", d:"Acumulado sobre los datos del visual.", t:"window"},
  {f:"MOVINGAVERAGE", c:"Cálculo visual", s:"MOVINGAVERAGE(<columna>, <tamaño>)", d:"Media móvil sobre los datos del visual.", t:"window"},
  {f:"COLLAPSE / EXPAND", c:"Cálculo visual", s:"COLLAPSE(<expresión>, <eje>)", d:"Evalúa la expresión en el nivel padre (o hijo) de la jerarquía del visual.", t:"window"},
  {f:"USERPRINCIPALNAME", c:"Información", s:"USERPRINCIPALNAME()", d:"Correo (UPN) del usuario conectado: base de la RLS dinámica.", t:"rls"},
  {f:"DATEDIFF", c:"Fecha", s:"DATEDIFF(<inicio>, <fin>, <intervalo>)", d:"Diferencia entre dos fechas en días, meses, años...", t:"iteradores"},
  {f:"EOMONTH", c:"Fecha", s:"EOMONTH(<fecha>, <meses>)", d:"Último día del mes, desplazado n meses.", t:"calendario"},
  {f:"FORMAT", c:"Texto", s:"FORMAT(<valor>, <formato>[, <idioma>])", d:"Convierte a texto con formato (nombres de mes, YYYY-MM).", t:"calendario"}
];

/* ══ GLOSARIO ════════════════════════════ */
var GLOSS = [
  {k:"Modelo semántico", d:"Base de datos analítica en memoria de Power BI: tablas, relaciones, medidas y seguridad. Antes se llamaba conjunto de datos (dataset).", t:"bi"},
  {k:"Tabla de hechos", d:"Tabla central con lo que ha ocurrido: claves externas y medidas numéricas. Estrecha, larga y en crecimiento.", t:"estrella"},
  {k:"Tabla de dimensiones", d:"Tabla con los puntos de vista del análisis (Cliente, Fecha, Producto): una clave y muchos atributos.", t:"estrella"},
  {k:"Granularidad", d:"Nivel de detalle de cada fila de una tabla de hechos (línea de ticket, tienda y mes).", t:"estrella"},
  {k:"Bus dimensional", d:"Matriz que cruza procesos de negocio (hechos) con dimensiones compartidas.", t:"estrella"},
  {k:"Copo de nieve", d:"Modelo en el que una dimensión se relaciona con otra (Producto, Subcategoría, Categoría) en lugar de directamente con los hechos.", t:"estrella"},
  {k:"Cardinalidad (relación)", d:"Tipo de relación: uno a varios, varios a varios o uno a uno.", t:"relaciones"},
  {k:"Cardinalidad (columna)", d:"Número de valores distintos de una columna. Cuanto menor, más comprime.", t:"vertipaq"},
  {k:"Dirección de filtro cruzado", d:"Sentido en que viajan los filtros por una relación: única o en ambas direcciones.", t:"relaciones"},
  {k:"VertiPaq", d:"Motor columnar en memoria de Power BI y Analysis Services: almacena por columnas, ordena y comprime.", t:"vertipaq"},
  {k:"Clave subrogada", d:"Identificador entero sin significado de negocio (índice) que sustituye a una clave larga para unir hechos y dimensiones.", t:"plana"},
  {k:"Plegado de consultas", d:"Capacidad de Power Query de traducir los pasos a la consulta nativa del origen (SQL) para que los ejecute el servidor.", t:"obtener"},
  {k:"Anular dinamización", d:"Unpivot: convierte columnas (meses) en filas con pares atributo-valor.", t:"transformar"},
  {k:"Combinar consultas", d:"Merge: añade columnas de otra consulta por una clave común, como un JOIN.", t:"combinar"},
  {k:"Anexar consultas", d:"Append: pone las filas de una consulta debajo de otra, como un UNION.", t:"combinar"},
  {k:"Flujo de datos", d:"Power Query en la nube: preparación reutilizable por varios modelos semánticos.", t:"dataflows"},
  {k:"Puerta de enlace", d:"Gateway: software que permite a Power BI Service acceder a orígenes de la red local.", t:"dataflows"},
  {k:"DirectQuery", d:"Modo de conexión que consulta el origen en cada interacción en lugar de importar los datos.", t:"obtener"},
  {k:"Medida", d:"Cálculo DAX que se evalúa al vuelo según el contexto de filtro y no se almacena.", t:"medidas"},
  {k:"Medida implícita", d:"Agregación que Power BI crea al arrastrar una columna numérica. Evítala.", t:"medidas"},
  {k:"Columna calculada", d:"Columna creada con DAX que se calcula al actualizar y ocupa memoria.", t:"medidas"},
  {k:"Contexto de filtro", d:"Conjunto de filtros activos cuando se evalúa una expresión.", t:"contextos"},
  {k:"Contexto de fila", d:"La fila que se está recorriendo en una columna calculada o en un iterador.", t:"contextos"},
  {k:"Transición de contexto", d:"Conversión del contexto de fila en un contexto de filtro equivalente que hace CALCULATE.", t:"contextos"},
  {k:"Iterador", d:"Función que recorre una tabla fila a fila (SUMX, AVERAGEX, FILTER).", t:"iteradores"},
  {k:"Inteligencia de tiempo", d:"Funciones DAX que desplazan o acumulan periodos de fechas (YTD, año anterior).", t:"ti"},
  {k:"Grupo de cálculo", d:"Conjunto de elementos de cálculo que transforman cualquier medida con SELECTEDMEASURE.", t:"grupos"},
  {k:"Parámetro de campo", d:"Tabla que permite al usuario elegir qué medida o columna muestra un visual.", t:"grupos"},
  {k:"Cálculo visual", d:"Cálculo DAX definido dentro de un visual que solo ve los datos de ese visual.", t:"window"},
  {k:"Propiedades preatentivas", d:"Color, forma, tamaño y posición: lo que el ojo percibe antes de leer.", t:"percepcion"},
  {k:"Marcador", d:"Instantánea del estado de una página (filtros, visibilidad, selección) que se puede recuperar con un botón.", t:"interactividad"},
  {k:"Obtener detalles", d:"Drill-through: saltar a otra página filtrada por el elemento pulsado.", t:"interactividad"},
  {k:"Informe paginado", d:"Informe de diseño fijo para imprimir o exportar (Power BI Report Builder).", t:"interactividad"},
  {k:"Área de trabajo", d:"Contenedor en Service para modelos, informes, paneles y flujos de un equipo.", t:"service"},
  {k:"Panel", d:"Página única en Service con visuales anclados de uno o varios informes.", t:"service"},
  {k:"Aplicación", d:"Paquete de solo lectura con el contenido de un área de trabajo para una audiencia.", t:"service"},
  {k:"Actualización incremental", d:"Recarga solo los periodos recientes de una tabla grande (parámetros RangeStart y RangeEnd).", t:"service"},
  {k:"RLS", d:"Seguridad a nivel de fila: roles con filtros DAX que limitan las filas visibles por usuario.", t:"rls"},
  {k:"OLS", d:"Seguridad a nivel de objeto: oculta tablas o columnas a ciertos roles.", t:"rls"},
  {k:"PBIP", d:"Proyecto de Power BI: el informe y el modelo guardados como carpetas de texto, aptos para Git.", t:"git"},
  {k:"TMDL", d:"Tabular Model Definition Language: formato de texto que describe el modelo semántico.", t:"git"},
  {k:"Bravo", d:"Herramienta externa gratuita para analizar el tamaño del modelo, formatear DAX y crear calendarios.", t:"vertipaq"},
  {k:"DAX Studio", d:"Herramienta externa para escribir y medir consultas DAX y analizar el modelo (VertiPaq Analyzer).", t:"vertipaq"}
];

/* ══ PL-300 ══════════════════════════════ */
var PL300 = {
  domains:[
    {p:"25-30 %", t:"Preparar los datos", d:"Obtener datos, limpiar, transformar y cargar con Power Query; perfil de datos; flujos de datos.", topics:["obtener","transformar","combinar","dataflows"]},
    {p:"25-30 %", t:"Modelar los datos", d:"Diseñar el modelo, relaciones, DAX, inteligencia de tiempo y optimización del rendimiento.", topics:["estrella","relaciones","vertipaq","calendario","medidas","calculate","ti","grupos"]},
    {p:"25-30 %", t:"Visualizar y analizar", d:"Informes, interactividad, formato condicional, visuales de IA y análisis.", topics:["percepcion","interactividad","storytelling"]},
    {p:"15-20 %", t:"Implementar y mantener", d:"Áreas de trabajo, roles, aplicaciones, actualización, puertas de enlace y RLS.", topics:["service","roles","rls"]}
  ],
  traps:[
    {k:"Modelado", q:"Un diagrama con flecha doble entre Categoría y Solicitudes. ¿Qué corriges?", a:"La doble dirección: entre una dimensión y los hechos la relación debe ser 1:* unidireccional."},
    {k:"Modelado", q:"¿La relación Cliente-Ventas es varios a varios, uno a uno, varios a uno o uno a varios?", a:"Varios a uno entre Ventas y Cliente (o uno a varios entre Cliente y Ventas). Lee con cuidado el orden en que se nombran las tablas."},
    {k:"Perfil de datos", q:"Una columna tiene 4 valores distintos y 2 únicos. ¿Cuántas filas tendrá una matriz por esa columna?", a:"4: distintos son todos los valores diferentes; únicos son los que aparecen una sola vez."},
    {k:"Seguridad", q:"Dos tablas con RLS y una relación bidireccional que debe respetar la seguridad.", a:"Activa «Aplicar filtro de seguridad en ambas direcciones» en la relación."},
    {k:"DAX", q:"Con marzo seleccionado, mostrar el mismo mes del año anterior.", a:"CALCULATE([Medida], SAMEPERIODLASTYEAR(Fecha[Fecha]))."},
    {k:"Conexión", q:"Detección de fraude: datos en pantalla con menos de 5 minutos de antigüedad.", a:"DirectQuery con actualización automática de página. Importar no sirve: 8 actualizaciones al día en Pro y 48 en Premium."},
    {k:"Power Query", q:"Ordenar los pasos para limpiar un Excel exportado con filas de cabecera.", a:"Quitar filas superiores, usar la primera fila como encabezado, cambiar tipos (fechas) y filtrar totales."},
    {k:"Informes", q:"Facturas que deben exportarse a PDF con maquetación fija.", a:"Informes paginados (Power BI Report Builder)."},
    {k:"Optimización", q:"¿Qué tabla ocupa más: la de fecha y hora juntas o separadas?", a:"Juntas. Separar reduce la cardinalidad; extraer hora, minuto y segundo la reduce aún más."},
    {k:"Service", q:"¿Quién puede actualizar una aplicación?", a:"Administradores y Miembros del área de trabajo; el Colaborador solo si se le concede el permiso."},
    {k:"Service", q:"Rol con privilegios mínimos para publicar y programar actualizaciones.", a:"Colaborador."},
    {k:"Paneles", q:"Necesitas un visual en el panel que no existe en ningún informe.", a:"Créalo con Preguntas y respuestas en el propio panel."},
    {k:"Paneles", q:"Anclar un segmentador a un panel.", a:"No se puede anclar suelto: ancla la página completa del informe."},
    {k:"Visuales", q:"Mantener una tarjeta siempre por encima de un gráfico en Service.", a:"Activa «Mantener el orden de las capas» en las propiedades de los visuales implicados."},
    {k:"Power Query", q:"Combinar dos consultas por una columna de texto y otra numérica.", a:"Primero iguala los tipos: las columnas de combinación deben tener el mismo tipo de datos."}
  ]
};
