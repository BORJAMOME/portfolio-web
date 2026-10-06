/* Apuntes de Notion · «Impacta con Power BI» (Salvador Ramos), capítulos 6 a 9 */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var S = "Impacta con Power BI · Salvador Ramos";

NOTES.push({t:"medidas", s:S + " · cap. 6 · Fundamentos de DAX", h:`
<h4>Dónde se usa DAX</h4>
<p>En Power BI, Power Pivot para Excel, SQL Server Analysis Services Tabular y Azure Analysis Services. Sus principales usos son los cálculos en sus tres variantes: tablas calculadas, columnas calculadas y medidas.</p>
<h4>Operadores</h4>
<table class="t"><tr><th>Tipo</th><th>Operadores</th></tr><tr><td>Aritméticos</td><td>+ − * /</td></tr><tr><td>Comparativos</td><td>= &lt;&gt; &gt; &gt;= &lt; &lt;=</td></tr><tr><td>Lógicos</td><td>&amp;&amp; (Y) · || (O)</td></tr><tr><td>Otros</td><td>&amp; (concatenar) · IN (incluido en una lista)</td></tr><tr><td>Comentarios</td><td>// una línea · /* varias líneas */</td></tr></table>
<h4>Cómo referenciar</h4>
<ul><li><b>Columnas</b>: <code>NombreDeTabla[NombreDeColumna]</code></li><li><b>Medidas</b>: <code>[NombreDeMedida]</code></li></ul>
<p>Si creas la medida [VentasTotal] alojada en la tabla Ventas y la referencias como Ventas[VentasTotal], funciona; pero si más tarde creas una tabla de medidas «Indicadores» y la mueves allí, dejarán de funcionar todos los cálculos que la referencian con la tabla y tendrás que cambiarlos por Indicadores[VentasTotal]. Por eso las medidas se referencian sin tabla.</p>
<h4>Funciones de agregación básicas</h4>
<table class="t"><tr><th>Función</th><th>Devuelve</th></tr><tr><td>SUM( Tabla[Columna] )</td><td>La suma de los valores de la columna</td></tr><tr><td>MIN( Tabla[Columna] )</td><td>El menor valor</td></tr><tr><td>MAX( Tabla[Columna] )</td><td>El mayor valor</td></tr><tr><td>AVERAGE( Tabla[Columna] )</td><td>La media aritmética</td></tr><tr><td>COUNTROWS( Tabla )</td><td>El número de filas de la tabla</td></tr><tr><td>DISTINCTCOUNT( Tabla[Columna] )</td><td>El número de valores distintos</td></tr></table>
<pre class="dcode">VentasTotal    = SUM( Ventas[ImporteVenta] )
VentasPromedio = AVERAGE( Ventas[ImporteVenta] )
VentasMinimo   = MIN( Ventas[ImporteVenta] )
VentasMaximo   = MAX( Ventas[ImporteVenta] )
Num.Lineas     = COUNTROWS( Ventas )
Num.Tickets    = DISTINCTCOUNT( Ventas[Ticket] )</pre>
<p>Con una sola medida [VentasTotal] y distintos filtros y segmentaciones se obtiene: el total en una tarjeta, las ventas por tienda, por categoría, por año y mes, por ticket y por tienda y categoría.</p>`});

NOTES.push({t:"contextos", s:S + " · cap. 6 · Contextos de evaluación", h:`
<p>Un mismo cálculo puede obtener resultados diferentes según el contexto de evaluación. Los contextos permiten análisis dinámicos en los que el resultado varía con las selecciones del usuario. Hay dos: el <b>contexto de filtro</b> y el <b>contexto de fila</b>.</p>
<h4>Contexto de filtro</h4>
<p>Todos los filtros que se aplican al modelo para evaluar una expresión DAX: el conjunto de filtros aplicados en cualquier elemento del informe. Su propagación depende de la dirección del filtro cruzado de las relaciones (unidireccional o bidireccional).</p>
<p>Ejemplo detallado: una página con un segmentador de año filtrando 2018 y un filtro de página con Categoría = Bebida. Todos los elementos reciben esos dos filtros; además, cada celda añade los suyos: Año 2018 + Bebida + Provincia Murcia; Año 2018 + Bebida + Provincia Almería; Año 2018 + Bebida + Tienda La Manga, Mojácar, Águilas, Garrucha, Puerto de Mazarrón, Cartagena…</p>
<h4>Contexto de fila</h4>
<p>La expresión se evalúa fila a fila, de forma independiente y sin ver el resto de filas. Aplica a las columnas calculadas y a las funciones iteradoras (SUMX, FILTER). Gracias a él se puede hacer referencia directa a columnas sin envolverlas en ninguna función, porque el motor sabe en qué fila está: <code>BeneficioC = Ventas[ImporteVenta] - Ventas[ImporteCoste]</code>.</p>
<h4>Convivencia de ambos contextos</h4>
<p>El contexto de filtro y el de fila coexisten en un mismo cálculo. Con un iterador como SUMX, cada fila evaluada ya está filtrada por el contexto de filtro del informe, página, visual o segmentadores. El contexto de filtro llega desde visuales, segmentadores, filtros de página/informe/visual, relaciones entre tablas y funciones como CALCULATE.</p>
<ol><li>Power BI aplica primero el contexto de filtro (Año 2018, Tienda Cartagena, Categoría Bebidas).</li><li>Dentro del conjunto filtrado, SUMX aplica el contexto de fila a cada fila.</li><li>La expresión se evalúa solo sobre esas filas visibles.</li></ol>
<p>Con <code>Ventas Total X = SUMX(Ventas, Ventas[Cantidad] * Ventas[Precio])</code> y el usuario filtrando Cartagena, 2018 y Bebidas, SUMX no itera toda la tabla Ventas, solo las filas que cumplen esos filtros. Esta convivencia explica por qué los resultados cambian dinámicamente.</p>`});

NOTES.push({t:"iteradores", s:S + " · cap. 6 · Funciones terminadas en X", h:`
<h4>SUMX, MINX, MAXX, AVERAGEX</h4>
<p>Dos diferencias frente a las agregaciones básicas: reciben parámetros distintos y permiten calcular expresiones (las básicas solo reciben una columna), y se evalúan en contexto de fila: son iteradores que obtienen un resultado por fila antes de aplicar su agregación.</p>
<table class="t"><tr><th>Función</th><th>Devuelve</th></tr><tr><td>SUMX( Tabla, Expresión )</td><td>La suma de la expresión evaluada en cada fila</td></tr><tr><td>MINX( Tabla, Expresión )</td><td>El menor valor de la expresión</td></tr><tr><td>MAXX( Tabla, Expresión )</td><td>El mayor valor de la expresión</td></tr><tr><td>AVERAGEX( Tabla, Expresión )</td><td>La media de los valores de la expresión</td></tr></table>
<p><b>Tabla</b>: la que el iterador recorre fila a fila. <b>Expresión</b>: el cálculo que realiza en cada fila.</p>
<pre class="dcode">VentasTotal X = SUMX( Ventas, Ventas[ImporteVenta] )</pre>
<p>No hay columna Precio en Ventas (solo Cantidad e ImporteVenta). Para el menor precio al que se ha vendido:</p>
<pre class="dcode">Precio Minimo Venta = MINX( Ventas, DIVIDE( Ventas[ImporteVenta], Ventas[Cantidad] ) )</pre>
<ol><li>El iterador recorre fila a fila la tabla que recibe.</li><li>Crea una columna temporal con el valor de la expresión en cada fila.</li><li>Aplica la agregación (aquí, el mínimo).</li><li>Libera la memoria de la columna temporal.</li></ol>
<p>La alternativa «a lo Excel» sería una columna calculada <code>Precio = DIVIDE( Ventas[ImporteVenta], Ventas[Cantidad] )</code> y una medida <code>MIN( Ventas[Precio] )</code>. Inconveniente: acabas con muchas columnas calculadas en memoria permanentemente, las uses o no. Los iteradores ahorran toda esa memoria.</p>
<p>Si tuvieras Precio y Cantidad pero no el importe: <code>VentasTotal X = SUMX( Ventas, Ventas[Cantidad] * Ventas[Precio] )</code>.</p>
<p>Otra ventaja: como primer parámetro admiten cualquier función DAX que devuelva una tabla (cualquiera que sirva para una tabla calculada), sin crearla en el modelo. La tabla se genera temporalmente en memoria, se recorre y se elimina.</p>
<h4>SUM frente a SUMX</h4>
<table class="t"><tr><th>Función</th><th>Motor</th><th>Qué hace</th><th>Cuándo</th></tr><tr><td>SUM</td><td>Agregador</td><td>Suma directa de una columna</td><td>Solo sumar una columna sin cálculos</td></tr><tr><td>SUMX</td><td>Iterador (si hay expresión)</td><td>Recorre fila a fila, calcula y suma</td><td>Cálculos por fila antes de sumar</td></tr></table>
<p>SUM(Tabla[Columna]) es internamente SUMX(Tabla, Tabla[Columna]): en DAX Studio ambas generan la misma instrucción de agregación; solo con una expresión personalizada se activa el iterador real. Usa SUM cuando puedas (más limpio, igual de rápido y correcto) y SUMX para cálculos fila a fila, filtros dinámicos o expresiones complejas.</p>
<pre class="dcode">VentasBebidas = SUMX(
    FILTER( Ventas, RELATED( Producto[Categoria] ) = "Bebidas" ),
    Ventas[Importe]
)</pre>
<h4>RELATED</h4>
<p>Acepta un único parámetro, la columna que se busca en la tabla relacionada: <code>RELATED( 'TablaRelacionada'[ColumnaRelacionada] )</code>.</p>`});

NOTES.push({t:"logica", s:S + " · cap. 6 · Funciones más usuales", h:`
<h4>IF</h4>
<p>Comprueba una condición y devuelve un valor si es verdadera y otro si es falsa: <code>IF( &lt;condición&gt;, &lt;si_verdadero&gt;, &lt;si_falso&gt; )</code>.</p>
<pre class="dcode">TipoPrecio1 = IF( Producto[PVP] >= 20, "Caro", "Barato" )

TipoPrecio3 = IF( Producto[PVP] >= 20, "Caro",
                IF( Producto[PVP] >= 10, "Medio",
                  IF( Producto[PVP] > 0, "Barato", "Regalado" ) ) )</pre>
<h4>SWITCH</h4>
<p>Evalúa una expresión contra una lista de valores y devuelve el resultado correspondiente: <code>SWITCH( &lt;expresión&gt;, &lt;valor&gt;, &lt;resultado&gt;, [&lt;valor&gt;, &lt;resultado&gt;], &lt;else&gt; )</code>. Para nombrar los meses con IF harían falta 11 IF anidados:</p>
<pre class="dcode">Mes = SWITCH( Fecha[MesNum], 1, "Ene", 2, "Feb", 3, "Mar", 4, "Abr",
              5, "May", 6, "Jun", 7, "Jul", 8, "Ago",
              9, "Sep", 10, "Oct", 11, "Nov", 12, "Dic", "Error" )

TipoPrecio3 = SWITCH( TRUE(),
    Producto[PVP] >= 20, "Caro",
    Producto[PVP] >= 10, "Medio",
    Producto[PVP] > 0,   "Barato",
    "Regalado" )</pre>
<h4>Variables (VAR)</h4>
<p>Se pueden usar en medidas, columnas calculadas y tablas calculadas. Guardan el resultado de una expresión con un nombre para reutilizarlo dentro del mismo cálculo; solo existen y son visibles dentro del cálculo donde se crean.</p>
<pre class="dcode">-- sin variables: SUM se repite
VentasComisiones = SWITCH( TRUE(),
    SUM( Ventas[ImporteVenta] ) >= 100000, SUM( Ventas[ImporteVenta] ) * 0.05,
    SUM( Ventas[ImporteVenta] ) >= 50000,  SUM( Ventas[ImporteVenta] ) * 0.03,
    SUM( Ventas[ImporteVenta] ) * 0.01 )

-- con variable: se calcula una vez y se usa 5 veces
VentasComisiones =
VAR _Ventas = SUM( Ventas[ImporteVenta] )
RETURN SWITCH( TRUE(),
    _Ventas >= 100000, _Ventas * 0.05,
    _Ventas >= 50000,  _Ventas * 0.03,
    _Ventas * 0.01 )

VentasDifMesAnterior =
VAR _VentasActuales = SUM( Ventas[ImporteVenta] )
VAR _VentasMesAnterior = CALCULATE( SUM( Ventas[ImporteVenta] ),
                                    PARALLELPERIOD( Fecha[Fecha], -1, MONTH ) )
RETURN _VentasActuales - _VentasMesAnterior</pre>
<p><i>Nota del manual:</i> en el apunte original la segunda variable era CALCULATE(_VentasActuales, …). Como una variable ya está evaluada, CALCULATE no la recalcula con el nuevo filtro y devolvería las ventas actuales; hay que repetir la expresión (o usar una medida) dentro de CALCULATE.</p>`});

NOTES.push({t:"calculate", s:S + " · cap. 6 · CALCULATE y ALL", h:`
<h4>CALCULATE</h4>
<p>Su objetivo es modificar el contexto de filtro establecido. Para el autor es la función más importante, porque es la única (junto con CALCULATETABLE) que permite modificar ese contexto. Sintaxis: <code>CALCULATE( Expresión, Filtro1, …, FiltroN )</code>. Su potencia aparece al añadir parámetros que alteran el contexto, por ejemplo el total de ventas teniendo en cuenta solo las ventas de 5 o más unidades:</p>
<pre class="dcode">Ej01 = CALCULATE( [VentasTotal] )
Ej02 = CALCULATE( [VentasTotal], Ventas[Cantidad] >= 5 )
Ej03 = CALCULATE( [VentasTotal], Tienda[Tienda] = "Aguilas" )
AquiMandoYo = CALCULATE( [VentasTotal], ALL( Ventas ) )</pre>
<p>Prueba AquiMandoYo en una página en blanco con los segmentadores que quieras: no se filtra por ninguno. Ignora cualquier filtro del usuario: tiene poder total y absoluto.</p>
<h4>ALL</h4>
<p>Función de manipulación de contexto que quita o anula el filtro aplicado a una tabla o columna y devuelve un conjunto sin restricciones: <code>ALL( 'Tabla' )</code> o <code>ALL( 'Tabla'[Columna] )</code>.</p>
<pre class="dcode">VentasTodasTiendas = CALCULATE( [VentasTotal], ALL( Tienda ) )</pre>
<h4>Calcular las partes de un total</h4>
<p>¿Qué porcentaje del total corresponde a cada tienda o provincia? Los gráficos circulares lo calculan solos, pero para mostrarlo en una tabla u otro visual hace falta CALCULATE con su gran aliada ALL:</p>
<pre class="dcode">VentasTienda% = DIVIDE( [VentasTotal], [VentasTodasTiendas] )</pre>
<p>Si agrupas las tiendas por provincia, los porcentajes se calculan automáticamente. Cuando un gráfico circular no es buena opción por el número de elementos, usa columnas, pero antes crea:</p>
<pre class="dcode">VentasTodosProductos = CALCULATE( [VentasTotal], ALL( Producto ) )
VentasRatioProducto  = DIVIDE( [VentasTotal], [VentasTodosProductos] )</pre>`});

NOTES.push({t:"ti", s:S + " · cap. 6 · Time Intelligence", h:`
<p>Funciones que facilitan analizar los datos a lo largo del tiempo: alteran el contexto de filtro para obtener datos de periodos distintos a los filtrados por el usuario. Se usan con <b>CALCULATE</b>.</p>
<h4>Requisitos</h4>
<ul><li>Una dimensión Fecha.</li><li>Con una fila por cada fecha entre el 1 de enero y el 31 de diciembre de cada año con datos.</li><li>Marcada (tabla y columna) como «Tabla de fechas».</li></ul>
<h4>Para practicar y validar resultados</h4>
<ul><li>Crea una jerarquía Año – Trimestre – Mes – Fecha.</li><li>Crea una tabla con esa jerarquía.</li><li>Crea una matriz con la jerarquía y cambia Subtotales > Fila > Posición > «Inferior» para que el total salga al final de cada periodo.</li></ul>
<h4>PREVIOUSMONTH y sus siete hermanas</h4>
<pre class="dcode">VentasMesAnterior = CALCULATE( [VentasTotal], PREVIOUSMONTH( Fecha[Fecha] ) )
VentasAñoAnterior = CALCULATE( [VentasTotal], PREVIOUSYEAR( Fecha[Fecha] ) )</pre>
<p>Combinando PREVIOUS/NEXT con YEAR, QUARTER, MONTH y DAY salen 8 funciones: PREVIOUSYEAR, PREVIOUSQUARTER, PREVIOUSMONTH, PREVIOUSDAY, NEXTYEAR, NEXTQUARTER, NEXTMONTH, NEXTDAY.</p>
<h4>PARALLELPERIOD</h4>
<p>Puede sustituir a las 8 anteriores y cubrir más casos: desplaza el número de periodos que indiques. <code>PARALLELPERIOD( &lt;fecha&gt;, &lt;nº periodos&gt;, &lt;periodo&gt; )</code>: fecha es la columna de la tabla marcada como tabla de fechas; nº periodos negativo va hacia atrás; periodo es YEAR, QUARTER o MONTH.</p>
<pre class="dcode">VentasMismoMesAñoAnterior = CALCULATE( [VentasTotal],
    PARALLELPERIOD( Fecha[Fecha], -12, MONTH ) )</pre>`});

NOTES.push({t:"percepcion", s:S + " · cap. 7 · Técnicas de visualización", h:`
<h4>Propiedades visuales preatentivas</h4>
<p>Color, forma, movimiento y ubicación (y tamaño): el ojo las percibe antes de leer.</p>
<h4>Color</h4>
<p>El mercado nacional lo dominan 5 competidores, entre ellos nosotros, y queremos ver nuestras ventas frente a las de cada uno (en millones de €). El uso adecuado del color destaca lo significativo; el mal uso y el abuso solo generan ruido que entorpece la interpretación.</p>
<h4>Caso real: beneficios por año y mes</h4>
<p>El cliente quería, además de leer cualquier celda, que la visualización le ayudase a centrarse en lo importante: identificar rápido si cada mes tenía beneficios o pérdidas, los meses con mayores beneficios y mayores pérdidas, si hay un patrón por meses que se repite y las roturas de ese patrón.</p>
<h4>Tamaño y ubicación</h4>
<p>Con la ubicación se puede ver qué tienda ha vendido más aunque la diferencia sea de 0,01 € en cifras de miles: en un gráfico de barras se ve fácil que la 005 vende más que la 066, pero para saber que la 001 vende más que la 003 (barras de igual longitud) necesitamos la posición (orden).</p>
<h4>Tablas y gráficos</h4>
<p>Son complementarios. A veces se muestran las mismas cifras en gráfico y en tabla para verlas desde distintas perspectivas.</p>
<h4>Representaciones más comunes</h4>
<ul><li>La evolución de un indicador a lo largo del tiempo.</li><li>El ranking o clasificación de un indicador.</li><li>La distribución de las partes de un total.</li><li>La comparación del valor real de un indicador con los valores estimados.</li></ul>`});

NOTES.push({t:"interactividad", s:S + " · cap. 8 · El informe en Power BI", h:`
<h4>Elementos de la vista de informes</h4>
<ol><li>Selector de la vista de informes y de las vistas de datos y cálculos DAX (icono de gráfico de columnas arriba a la izquierda).</li><li><b>Lienzo</b> donde se crea, edita y visualiza.</li><li>Acceso a la vista de escritorio o de móvil de la página.</li><li>Pestañas de las <b>páginas</b> del informe.</li><li>Configuración de <b>filtros</b>: además de segmentadores e interacciones, filtros a nivel de visual, de página o de todas las páginas.</li><li><b>Formato</b> del visual seleccionado. Siempre hay un objeto con el foco, resaltado como en PowerPoint.</li><li><b>Compilar un objeto visual</b>: qué campos van a cada parte (en una matriz, filas, columnas y valores; en un gráfico de líneas, eje X, eje Y, leyenda; en un circular, leyenda y valores).</li><li><b>Datos</b>: todos los campos visibles del modelo semántico (columnas y medidas agrupadas en tablas y carpetas).</li></ol>
<h4>Menú de los objetos visuales</h4>
<ul><li><b>Exportar datos</b>: los datos del visual a CSV.</li><li><b>Mostrar como tabla</b>: los datos del gráfico en formato tabla.</li><li><b>Quitar</b>: elimina el visual.</li><li><b>Destacados</b> (foco): resalta el elemento y difumina los demás.</li><li><b>Ordenar eje</b>: por cualquier campo o medida del visual, ascendente o descendente.</li></ul>
<h4>Interacciones</h4>
<p>Configurables entre visuales (filtrar, resaltar o ninguna). Vídeo de referencia del libro: vimeo.com/933384101.</p>`});

NOTES.push({t:"service", s:S + " · cap. 9 · Power BI Service", h:`
<h4>Qué ocurre al publicar</h4>
<ul><li>La base de datos (modelo semántico) va al servidor de bases de datos.</li><li>El informe, con todas sus páginas, va al servidor de informes.</li><li>El informe queda conectado a esa base de datos.</li></ul>
<h4>Áreas de trabajo</h4>
<p>Contenedor donde se almacenan los objetos publicados o creados en el servicio. Tres tipos principales: <b>modelos semánticos</b> (las bases de datos publicadas), <b>informes</b> (todas las páginas de un mismo .pbix) y <b>paneles</b> (solo se crean en el servicio, no en Desktop).</p>
<h4>Paneles</h4>
<p>Como un informe solo puede conectarse a un modelo semántico, los paneles agrupan en una misma página visuales de distintos informes que a su vez vienen de distintos modelos. Restricciones: no se pueden anclar filtros ni segmentadores, y si modificas el visual en el informe, el panel no se actualiza (solo sus datos).</p>
<h4>Buenas prácticas</h4>
<p>No edites los informes en el navegador: editas una copia distinta, los cambios no llegan a tu .pbix y si luego cambias el .pbix no podrás fusionarlos. Todo el desarrollo y la edición se hacen en Power BI Desktop y desde ahí se publica.</p>`});
})();
