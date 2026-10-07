/* Curso DAX · Javier Sánchez Rivero (NamasData). 8 temas.
   Material del curso: PDF de los temas 1 a 7 (Tema1 a Tema7 Alumnado) y «Dimensión Fecha Power Query». */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var S = "Curso DAX · Javier Sánchez Rivero (NamasData)";
NOTES.push(
{t:"contextos", s:S, h:`
<h4>Tema 1. Conceptos generales</h4>
<p><b>Qué se crea en DAX:</b> tablas calculadas, columnas calculadas y métricas (medidas, con variables).</p>
<p><b>Columna calculada:</b> se calcula solo sobre la fila actual, en el momento del procesamiento (refresco); consume espacio y da problemas si se añade en tablas de hechos grandes.</p>
<p><b>Variables:</b> mejoran la legibilidad. <code>VAR nombre = expresión ... RETURN resultado</code>.</p>
<p><b>Tipos de datos:</b> entero, decimal, fecha y hora, booleano, moneda, texto, binario, y BLANK(). <b>Operadores:</b> usar DIVIDE en lugar de «/».</p>
<p><b>Contexto de filtro.</b> Jerarquía de filtros: RLS, después DAX y después visuales, segmentadores y panel de filtros. Se propagan por las relaciones. Cada vez que creamos una medida, el contexto de filtro existe.</p>
<p><b>Contexto de fila.</b> No filtra tablas: sirve para iterar y evaluar valores de una columna. Se crea en una columna calculada y en una iteración (funciones X).</p>
<p><b>Transición de contexto.</b> Los dos contextos coexisten. Transformar el contexto de fila en contexto de filtro es la <b>transición de contexto</b>, y la hace CALCULATE (también implícito al llamar a una medida dentro de un iterador).</p>
`},
{t:"estrella", s:S, h:`
<h4>Tema 2. Modelo de datos</h4>
<p><b>Dimensión:</b> información descriptiva para filtrar y agrupar los hechos. Filas únicas, tablas desnormalizadas, anchas y cortas. Dos tipos de clave: clave primaria (de negocio) y clave subrogada.</p>
<p><b>Tabla de hechos:</b> transacciones o métricas; puede repetir valores; estrecha y larga.</p>
<p><b>Cardinalidad de una columna:</b> número de valores únicos. Baja = muchos repetidos; alta = pocos repetidos. <b>Granularidad:</b> nivel de detalle con que se almacenan los datos.</p>
<p><b>Esquema en estrella</b> (hechos en el centro y dimensiones alrededor) frente a <b>copo de nieve</b> (dimensiones normalizadas en varias tablas encadenadas).</p>
<h4>De tabla única a estrella (Power Query)</h4>
<ol>
<li>Cargar la tabla plana (FactSales).</li>
<li>Para cada dimensión: volver a traer la tabla (referencia), elegir sus columnas y nombrarla Dim…</li>
<li>Quitar duplicados.</li>
<li>Añadir una columna de índice (clave subrogada) y nombrarla. Repetir para todas las dimensiones.</li>
<li>Combinar FactSales con cada Dim para traer su índice a la tabla de hechos.</li>
<li>Quedarse en FactSales solo con las claves y las columnas numéricas.</li>
<li>Revisar tipos de datos. El modelo queda mucho más comprimido.</li>
</ol>
`},
{t:"relaciones", s:S, h:`
<p><b>Cardinalidad de la relación:</b> número de filas relacionadas en cada lado: 1 a 1, 1 a N, N a N.</p>
<p><b>Tipos de relaciones:</b> activas; inactivas (se activan con <code>USERELATIONSHIP</code>); y <b>virtuales</b> con <code>TREATAS</code>, que fuerza un filtro sin relación física.</p>
<p><code>TREATAS(&lt;columna_de_valores&gt;, &lt;columna_a_filtrar&gt;)</code> toma los valores de una columna y los aplica como filtro a otra, como si estuvieran relacionadas. Útil con tablas desconectadas, tablas virtuales (SUMMARIZE, VALUES) o filtros personalizados. Mejor evitarlo si hay alternativa, por rendimiento.</p>
<pre><code>Clientes segmento seleccionado =
CALCULATE (
    COUNTROWS ( Clientes ),
    TREATAS ( VALUES ( Segmentos[SegmentoSeleccionado] ), Clientes[Segmento] )
)</code></pre>
`},
{t:"funtabla", s:S, h:`
<h4>Tema 3. Funciones que devuelven tablas</h4>
<p><b>FILTER(&lt;tabla&gt;, &lt;condición&gt;)</b>: dentro de CALCULATE, SUMX, AVERAGEX… cuando necesitas un filtro complejo o dinámico.</p>
<pre><code>Alojamientos caros =
CALCULATE ( COUNTROWS ( Airbnb ), FILTER ( Airbnb, Airbnb[Precio] &gt; 100 ) )</code></pre>
<p>Se pueden anidar filtros (filtro sobre filtro) o combinarlos con AND (&amp;&amp;).</p>
<p><b>ALL(tabla o columna)</b>: devuelve todas las filas o valores ignorando filtros. Con una columna quita los filtros de esa columna; con una tabla, de todas sus columnas. Sirve para totales globales, % del total y rankings.</p>
<pre><code>% por tipo =
DIVIDE (
    COUNTROWS ( Airbnb ),
    CALCULATE ( COUNTROWS ( Airbnb ), ALL ( Airbnb[room_type] ) ),
    0
)</code></pre>
<p><b>ALLEXCEPT</b>: quita todos los filtros de la tabla excepto los de las columnas indicadas. <b>ALLSELECTED</b>: respeta los filtros externos (segmentadores) e ignora los internos del visual: porcentaje sobre el total visible, no el absoluto.</p>
<p><b>VALUES(columna)</b>: tabla de una columna con los valores distintos en el contexto actual. Usos: iterar con AVERAGEX/SUMX (<code>AVERAGEX(VALUES(Airbnb[room_type]), CALCULATE(AVERAGE(Airbnb[price])))</code>), contar distintos (<code>COUNTROWS(VALUES(...))</code>) o mostrar un valor único con <code>IF(HASONEVALUE(col), VALUES(col), "Varios tipos")</code>. Diferencia con <b>DISTINCT</b>: VALUES incluye la fila en blanco que genera una relación sin coincidencia; DISTINCT no.</p>
<p><b>RELATED</b>: trae una columna de la tabla del lado uno (de muchos a uno), por ejemplo <code>Nombre provincia = RELATED(Provincia[nombre])</code>. <b>RELATEDTABLE</b>: lo contrario, devuelve las filas relacionadas del lado muchos (por ejemplo, para contar alojamientos por provincia desde la tabla Provincia).</p>
<p><b>SUMMARIZE</b>: crea una tabla resumen agrupando por columnas y añadiendo cálculos:</p>
<pre><code>Resumen Airbnb =
SUMMARIZE (
    Airbnb,
    Airbnb[neighbourhood],
    Airbnb[room_type],
    "Total anuncios", COUNTROWS ( Airbnb ),
    "Precio medio", AVERAGE ( Airbnb[price] )
)</code></pre>
<p><b>SUMMARIZECOLUMNS</b>: igual, pero respeta automáticamente el contexto del informe y es la opción recomendada para resúmenes con cálculos.</p>
<p><b>ADDCOLUMNS</b>: añade columnas calculadas a una tabla sin modificar la original:</p>
<pre><code>Tabla room type =
ADDCOLUMNS (
    VALUES ( Airbnb[room_type] ),
    "Precio medio", CALCULATE ( AVERAGE ( Airbnb[price] ) )
)</code></pre>
<p>El tema enumera también GROUPBY, CROSSJOIN y TOPN (sin desarrollar en los apuntes).</p>
`},
{t:"calculate", s:S, h:`
<h4>Tema 4. CALCULATE y CALCULATETABLE</h4>
<p><b>CALCULATE</b> cambia el contexto de filtro y evalúa la expresión en el nuevo contexto. «Cuenta las piezas de Lego, pero solo las rojas.»</p>
<pre><code>Total hotel precio &gt; 100 =
CALCULATE (
    SUM ( Airbnb[price] ),
    Airbnb[room_type] = "Hotel",
    Airbnb[price] &gt; 100
)</code></pre>
<p><b>CALCULATETABLE</b> hace lo mismo pero devuelve una tabla filtrada: «dame una caja nueva solo con los cromos del Real Madrid».</p>
<pre><code>Alojamientos caros = CALCULATETABLE ( Airbnb, Airbnb[price] &gt; 100 )</code></pre>
`},
{t:"grupos", s:S, h:`
<h4>Tema 5. Grupos de cálculo</h4>
<p>Reducen el número de medidas y aplican cálculos dinámicos (YTD, YoY, % del total…) sobre cualquier medida base: son «plantillas de cálculo». Un grupo es una tabla especial con una columna (por ejemplo «Tipo de cálculo»); cada fila es un elemento de cálculo con su DAX.</p>
<pre><code>[Total Ventas] = SUM ( Ventas[Monto] )

Base        = SELECTEDMEASURE ()
% del total = DIVIDE ( SELECTEDMEASURE (), CALCULATE ( SELECTEDMEASURE (), ALL ( 'Tabla' ) ) )
YTD         = CALCULATE ( SELECTEDMEASURE (), DATESYTD ( 'Fecha'[Date] ) )</code></pre>
<p>Evitan crear Total, % del total, acumulado, año anterior, diferencia… para cada medida: con una medida base y un segmentador del grupo se obtiene todo. En el curso se crearon con <b>Tabular Editor</b> (herramientas externas): nuevo grupo, añadir elementos, guardar; hoy también se pueden crear desde la vista de modelo de Desktop.</p>
<p><b>Usos:</b> visuales con varias perspectivas, cuadros de mando ejecutivos que cambian entre % del total, YTD, YoY, y reutilizar medidas base. <b>Advertencias:</b> sustituyen el filtro de la medida original (cuidado con contextos duplicados); no se usan en relaciones ni como columnas normales; pueden interferir con otros filtros.</p>
`},
{t:"calendario", s:S, h:`
<h4>Tema 6. Tablas de fechas</h4>
<p><b>CALENDARAUTO()</b> detecta la fecha mínima y máxima de todas las columnas de fecha del modelo y genera el rango. <b>CALENDAR(inicio, fin)</b> genera la columna Date entre dos fechas (incluidas): <code>CALENDAR(DATE(2022,1,1), DATE(2025,12,31))</code> o <code>CALENDAR(MIN(Airbnb[last_review]), MAX(Airbnb[last_review]))</code>.</p>
<p><b>Calendario dinámico</b> (siempre actualizado, X años atrás y adelante):</p>
<pre><code>Calendario =
CALENDAR ( DATE ( YEAR ( TODAY () ) - 10, 1, 1 ), DATE ( YEAR ( TODAY () ) + 5, 12, 31 ) )

Calendario II =
CALENDAR (
    DATE ( YEAR ( MIN ( FactSales[DateKey] ) ), 1, 1 ),
    DATE ( YEAR ( MAX ( FactSales[DateKey] ) ), 12, 31 )
)

Calendario III =
ADDCOLUMNS (
    CALENDAR (
        DATE ( YEAR ( MIN ( FactSales[DateKey] ) ), 1, 1 ),
        DATE ( YEAR ( MAX ( FactSales[DateKey] ) ), 12, 31 )
    ),
    "Año", YEAR ( [Date] ),
    "Mes", MONTH ( [Date] ),
    "Semana", WEEKNUM ( [Date] )
)</code></pre>
<p>También se vio la tabla calendario en M (PDF «Dimensión Fecha Power Query»).</p>
`},
{t:"ti", s:S, h:`
<h4>Tema 6. Funciones de inteligencia de tiempo</h4>
<ul>
<li><code>DATESYTD(&lt;dates&gt;[, &lt;year_end_date&gt;])</code>: fechas del año hasta la fecha (fin de año por defecto 31/12).</li>
<li><code>DATESMTD(&lt;dates&gt;)</code> y <code>DATESQTD(&lt;dates&gt;)</code>: mes y trimestre hasta la fecha.</li>
<li><code>DATESINPERIOD(&lt;dates&gt;, &lt;start_date&gt;, &lt;n&gt;, &lt;interval&gt;)</code>: desde una fecha, N intervalos; ideal como filtro de CALCULATE (por ejemplo, últimos 12 meses).</li>
<li><code>TOTALYTD(&lt;expr&gt;, &lt;dates&gt;[, &lt;filter&gt;][, &lt;year_end_date&gt;])</code> y <code>TOTALQTD(&lt;expr&gt;, &lt;dates&gt;[, &lt;filter&gt;])</code>.</li>
<li><code>SAMEPERIODLASTYEAR(&lt;dates&gt;)</code>: fechas desplazadas un año atrás.</li>
<li><code>DATEADD(&lt;dates&gt;, &lt;n&gt;, &lt;interval&gt;)</code>: desplaza N intervalos (year, quarter, month, day) adelante o atrás.</li>
<li><code>DATESBETWEEN(&lt;dates&gt;, &lt;inicio&gt;, &lt;fin&gt;)</code>: rango entre dos fechas, como filtro de CALCULATE.</li>
<li><code>FIRSTDATE</code> y <code>LASTDATE</code>: primera y última fecha del contexto.</li>
</ul>
<p>Ejercicios: acumulado frente al año anterior y <b>TAM</b> (total acumulado móvil, últimos 12 meses con DATESINPERIOD), útil para ver si las ventas han sido lineales a lo largo del año.</p>
`},
{t:"iteradores", s:S, h:`
<h4>Tema 7. Agregaciones e iteradores</h4>
<p><b>Agregaciones</b> aditivas, semiaditivas y no aditivas. <b>Iteradores:</b> SUMX, AVERAGEX, MINX, MAXX, COUNTX, FILTER y <b>RANKX</b>.</p>
<p>Con RANKX sobre ALL(Producto) el total también recibe un ranking; para ocultarlo se usa <code>IF(ISINSCOPE(Producto[Nombre]), RANKX(...))</code> (o HASONEVALUE). Si se usan segmentadores, cambiar <b>ALL por ALLSELECTED</b> para que el ranking se calcule sobre lo seleccionado.</p>
<pre><code>Ranking producto =
IF (
    ISINSCOPE ( Producto[Nombre] ),
    RANKX ( ALLSELECTED ( Producto[Nombre] ), [Ventas] )
)</code></pre>
`},
{t:"logica", s:S, h:`
<h4>Tema 8. Funciones de información</h4>
<ul>
<li><code>HASONEFILTER(col)</code>: TRUE si la columna tiene exactamente un valor filtrado directamente.</li>
<li><code>HASONEVALUE(col)</code>: TRUE si el contexto deja un solo valor distinto.</li>
<li><code>ISBLANK(valor)</code>: comprueba si está en blanco.</li>
<li><code>ISCROSSFILTERED(tabla o col)</code>: TRUE si se filtra de forma cruzada (desde otra tabla).</li>
<li><code>ISINSCOPE(col)</code>: TRUE si la columna es el nivel actual de una jerarquía (ideal para totales y subtotales distintos).</li>
<li><code>USERNAME()</code>: dominio\\usuario de la conexión. <code>USERPRINCIPALNAME()</code>: nombre principal (correo). Se usan en RLS dinámica.</li>
</ul>
`}
);
})();
