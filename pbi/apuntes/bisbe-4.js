/* Curso de lenguaje DAX · Ana María Bisbé York · temas 8 y 9 */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var S8 = "Curso de lenguaje DAX · Bisbé · Tema 8. DAX e inteligencia de tiempo";
var S9 = "Curso de lenguaje DAX · Bisbé · Tema 9. Filtros visuales, funciones y consultas DAX";
NOTES.push(
{t:"ti", s:S8, h:`
<h4>Funciones de fecha básicas</h4>
<table class="dxtbl"><thead><tr><th>Función</th><th>Ejemplo</th><th>Qué hace</th></tr></thead><tbody>
<tr><td>YEAR, MONTH, DAY</td><td><code>AñoVenta = YEAR(Ventas[Fecha])</code></td><td>Año, mes y día</td></tr>
<tr><td>QUARTER</td><td><code>QUARTER(Ventas[Fecha])</code></td><td>Trimestre 1 a 4</td></tr>
<tr><td>WEEKNUM(fecha, 2)</td><td><code>WEEKNUM(Ventas[Fecha], 2)</code></td><td>Semana del año empezando en lunes</td></tr>
<tr><td>WEEKDAY(fecha, 2)</td><td><code>WEEKDAY(Ventas[Fecha], 2)</code></td><td>1 = lunes … 7 = domingo</td></tr>
<tr><td>DATEDIFF</td><td><code>DATEDIFF(Ventas[FechaPedido], Ventas[FechaEntrega], DAY)</code></td><td>Días (o MONTH…) entre fechas</td></tr>
<tr><td>TODAY / NOW</td><td><code>TODAY()</code></td><td>Fecha de hoy / fecha y hora</td></tr>
</tbody></table>
<p>Todas las funciones de inteligencia de tiempo necesitan una <b>columna de fecha</b> de una tabla calendario completa (sin huecos, del 1/1 al 31/12 de cada año, valores únicos) y marcada como tabla de fechas. Se puede crear en el origen, en Power Query (consulta en blanco) o con CALENDARAUTO/CALENDAR en DAX.</p>
<h4>Familias de funciones</h4>
<ul>
<li><b>PREVIOUS / NEXT:</b> PREVIOUSDAY, NEXTDAY, PREVIOUSMONTH, NEXTMONTH, PREVIOUSQUARTER, NEXTQUARTER, PREVIOUSYEAR, NEXTYEAR. Ej.: <code>CALCULATE(SUM(Ventas[Importe]), PREVIOUSMONTH(Calendario[Fecha]))</code>.</li>
<li><b>Rangos:</b> DATESBETWEEN (<code>DATESBETWEEN(Calendario[Fecha], BLANK(), TODAY())</code>, desde el principio hasta hoy; con TODAY() y BLANK() al revés, desde hoy), DATESINPERIOD (<code>DATESINPERIOD(Calendario[Fecha], TODAY(), -3, MONTH)</code>, últimos 3 meses), DATESYTD, DATESQTD, DATESMTD.</li>
<li><b>Comparación:</b> SAMEPERIODLASTYEAR, PARALLELPERIOD, PREVIOUSQUARTER, PREVIOUSYEAR.</li>
<li><b>Límites:</b> FIRSTDATE y LASTDATE devuelven una <b>tabla</b> de una fila; MIN y MAX, un <b>escalar</b> (cambia cómo se usan dentro de CALCULATE).</li>
<li><b>STARTOF / ENDOF:</b> STARTOFYEAR, ENDOFYEAR, STARTOFQUARTER, ENDOFQUARTER, STARTOFMONTH, ENDOFMONTH.</li>
</ul>
<h4>CALCULATE con inteligencia de tiempo</h4>
<pre><code>Verde_AnoAnterior =
CALCULATE ( [Cantidad], Productos[Color] = "Verde", PREVIOUSYEAR ( Calendario[Fecha] ) )

VentasHastaHoy =
CALCULATE (
    [Cantidad],
    DATESBETWEEN ( Calendario[Fecha], BLANK (), TODAY () ),
    NOT Clientes[País] IN { "Argentina", "Chile" }
)</code></pre>
<h4>Acumulados</h4>
<pre><code>Total Acumulado = CALCULATE ( [Cantidad], DATESYTD ( Calendario[Fecha] ) )
-- equivalente: DATESBETWEEN(Fecha, STARTOFYEAR(LASTDATE(Fecha)), LASTDATE(Fecha))

DATESYTD Fiscal = CALCULATE ( [Cantidad], DATESYTD ( Calendario[Fecha], "06-30" ) )

Acumulado TOTALYTD = TOTALYTD ( [Cantidad], Calendario[Fecha] )   -- «syntax sugar» (TOTALQTD, TOTALMTD)

Acumulado últimos 2 meses =
CALCULATE (
    [Cantidad],
    DATESINPERIOD ( Calendario[Fecha], MAX ( Calendario[Fecha] ), -2, MONTH )
)

Acumulado total =        -- más allá del año, sin reinicio
VAR FechaActual = MAX ( Calendario[Fecha] )
RETURN
    CALCULATE ( [Cantidad], Calendario[Fecha] &lt;= FechaActual )

Acumulado Semana =
VAR vCalcular = HASONEVALUE ( Calendario[Año] ) &amp;&amp; HASONEVALUE ( Calendario[Semana] )
RETURN
    IF (
        vCalcular,
        CALCULATE (
            [Cantidad],
            Calendario[Año] = VALUES ( Calendario[Año] ),
            Calendario[Semana] = VALUES ( Calendario[Semana] ),
            Calendario[Fecha] &lt;= VALUES ( Calendario[Fecha] )
        )
    )</code></pre>
<p><b>Medias móviles:</b> suavizan los extremos en gráficos de líneas; a más días (10, 30…), más suave la curva.</p>
<h4>Comparativas</h4>
<pre><code>Año Pasado PREVIOUSYEAR       = CALCULATE ( [Cantidad], PREVIOUSYEAR ( Calendario[Fecha] ) )
Año Pasado SAMEPERIODLASTYEAR = CALCULATE ( [Cantidad], SAMEPERIODLASTYEAR ( Calendario[Fecha] ) )
Año Pasado DATEADD            = CALCULATE ( [Cantidad], DATEADD ( Calendario[Fecha], -1, YEAR ) )
Semana anterior               = CALCULATE ( [Cantidad], DATEADD ( Calendario[Fecha], -7, DAY ) )</code></pre>
<p><b>DATEADD frente a PARALLELPERIOD:</b> DATEADD desplaza el bloque exacto de fechas del contexto (si filtras del 1 al 15 de marzo, devuelve del 1 al 15 de febrero). PARALLELPERIOD devuelve el periodo <b>completo</b> del nivel indicado (si filtras el 10 de marzo con MONTH, devuelve todo febrero; con QUARTER, todo el trimestre anterior) y no admite DAY. No existe WEEK: se simula con DATEADD de –7 días (la semana sin actividad devuelve blanco).</p>
<p><b>Comparar solo hasta una fecha</b> (2024 frente a 2025 hasta el 24 de julio, último dato de 2025): limitar el periodo anterior a la última fecha con hechos desplazada un año. <b>Hasta fin de mes:</b> EOMONTH para obtener el último día del mes del año anterior (con datos hasta el 28/07/2025, la referencia de 2024 es el 31/07). <b>Hasta la última fecha:</b> EDATE (desplazar meses exactos).</p>
<p><b>Según el nivel de jerarquía:</b> calcular el periodo anterior según el nivel visible (año, trimestre, mes) con SWITCH(TRUE(), ISINSCOPE…), cuidando el orden de evaluación del SWITCH (del nivel más detallado al más general).</p>
<p><b>Acumulado del año anterior y cumplimiento:</b> comparar el YTD actual con el YTD anterior completo: cada valor negativo es lo que falta para igualar el año anterior (en enero de 2025, 57 − 960 = −903).</p>
`},
{t:"interactividad", s:S9, h:`
<h4>Filtros del informe y su efecto en DAX</h4>
<p>Tipos de filtrado: interacción entre objetos (por ejemplo, clic en 2023), segmentadores (y su sincronización en Ver &gt; Sincronizar segmentaciones), panel de filtros (objeto visual, página, todas las páginas), obtención de detalles (drillthrough), filtros en tooltips y exploración en profundidad de jerarquías.</p>
<p><b>Ver el rendimiento:</b> Analizador de rendimiento (Ver &gt; Analizador de rendimiento; Iniciar, Actualizar objetos visuales, Detener, Borrar, Exportar para DAX Studio) y la vista <b>Consultas DAX</b> (antes en características en versión preliminar). Desde el analizador se puede copiar la consulta de cada visual y ver cómo se traducen los filtros sobre columnas de texto y numéricas.</p>
<h4>Comportamiento del filtro de valor</h4>
<p>Propiedad del modelo semántico (vista de modelo &gt; Modelo &gt; Propiedades): <b>Independiente</b> (comportamiento clásico, los filtros se combinan como AND), <b>Automático</b> y <b>Unidos</b> (fuerza que coincida la combinación de valores entre columnas). Afecta a cómo se combinan selecciones de varias columnas en un mismo visual.</p>
`},
{t:"calculate", s:S9, h:`
<h4>Expresiones de filtro</h4>
<pre><code>FILTER_ALL_Color_Verde =
CALCULATE ( [Cantidad], FILTER ( ALL ( Productos[Color] ), Productos[Color] = "Verde" ) )

Verde_España = CALCULATE ( [Cantidad], Productos[Color] = "Verde", Clientes[País] = "España" )

Verde_o_Grande =
CALCULATE ( [Cantidad], Productos[Color] = "Verde" || Productos[Tamaño] = "Grande" )</code></pre>
<p>Con OR dentro de un solo filtro booleano, las columnas deben ser de la <b>misma tabla</b>. Un filtro con varios valores de una columna (por ejemplo «Semáforo») se convierte en un filtro de tabla.</p>
<h4>TREATAS</h4>
<pre><code>Años 2024-2025 = CALCULATE ( [Cantidad], TREATAS ( { 2024, 2025 }, Calendario[Año] ) )

Fin 2024 - Inicio 2025 =
CALCULATE (
    [Cantidad],
    TREATAS ( { ( 2024, 12 ), ( 2025, 1 ) }, Calendario[Año], Calendario[Num Mes] )
)</code></pre>
<p>La tabla de valores se aplica como filtro sobre las columnas indicadas, aunque no haya relación; con varias columnas, cada fila es un AND y las filas se combinan con OR (diciembre 2024 o enero 2025 = 150 + 200 = 350).</p>
<h4>ALLCROSSFILTERED</h4>
<p>Quita de una tabla todos los filtros, incluidos los que le llegan por relaciones desde otras tablas: <code>CALCULATE(SUM(Ventas[Importe]), ALLCROSSFILTERED(Ventas))</code> muestra todas las ventas aunque se seleccione el cliente Ana. Solo se usa como modificador de CALCULATE.</p>
`},
{t:"funtabla", s:S9, h:`
<h4>TOPN y TOPSKIP</h4>
<pre><code>TOP3 Productos =
VAR vTop3 = TOPN ( 3, 'Productos', [Cantidad] )
RETURN
    CALCULATE ( [Cantidad], vTop3 )

Ranking 4 a 6 Cantidad =
CALCULATE ( [Cantidad], TOPSKIP ( 3, 3, Productos, [Cantidad] ) )</code></pre>
<p>TOPN devuelve una tabla con las N filas superiores (500 + 450 + 430 = 1.380). TOPSKIP(saltar, tomar, tabla, orden) devuelve un tramo del ranking (del 4.º al 6.º), útil para cubos de ranking.</p>
<h4>FILTER sobre tabla o sobre columnas</h4>
<pre><code>Filtro Tabla = FILTER ( Ventas, Ventas[Cantidades] * Ventas[Precio] &gt;= 2000 )   -- recorre 597 filas, quedan 20

Filtro columnas =
FILTER (
    ALL ( Ventas[Cantidades], Ventas[Precio] ),                                  -- solo 16 combinaciones
    Ventas[Cantidades] * Ventas[Precio] &gt;= 200
)</code></pre>
<p>Filtrar sobre las columnas necesarias (ALL de columnas) es más eficiente que filtrar la tabla completa.</p>
<h4>Consultas: ORDER BY, START AT y FILTERS</h4>
<pre><code>EVALUATE
SUMMARIZECOLUMNS ( Ventas[IdProducto], Ventas[IdCliente], Ventas[Cantidades] )
ORDER BY Ventas[Cantidades]
START AT 15

EVALUATE
CALCULATETABLE ( FILTERS ( Productos[Color] ), Productos[Color] IN { "Rojo", "Negro" } )</code></pre>
<p>EVALUATE es la base de una consulta y siempre devuelve una tabla. Si un valor no existe, no hay error: tabla vacía.</p>
`},
{t:"window", s:S9, h:`
<h4>Funciones de ventana: INDEX, OFFSET y WINDOW</h4>
<p><b>INDEX</b> devuelve la enésima fila de una tabla ordenada (positivo desde el principio, negativo desde el final). Argumentos: posición, tabla, ORDERBY y tratamiento de blancos (en números se colocan entre 0 y negativos; en texto, al principio).</p>
<pre><code>EVALUATE
VAR vTabla = ADDCOLUMNS ( ALL ( Ventas[IdProducto] ), "Vendidos", [Cantidad] )
RETURN
    INDEX ( 3, vTabla, ORDERBY ( [Vendidos], DESC ) )   -- 3.er producto del ranking</code></pre>
<p><b>OFFSET</b> devuelve una fila relativa a la actual (N hacia delante o atrás) con ORDERBY y PARTITIONBY: comparar con la categoría anterior aunque no sea una serie temporal.</p>
<p><b>WINDOW</b> abre una «ventana» de filas alrededor de la actual (o en posiciones absolutas) para calcular sobre el bloque: acumulados, medias móviles, ventanas móviles… Ej.: estando en Marzo, <code>WINDOW(-1, REL, 0, REL, …)</code> devuelve Febrero y Marzo.</p>
<pre><code>Clientes_Países =
CALCULATE (
    [Total Clientes],
    WINDOW (
        1, ABS,          -- desde la primera fila
        -1, ABS,         -- hasta la última
        SUMMARIZE ( ALLSELECTED ( Clientes ), Clientes[IdCliente], Clientes[País] ),
        ,
        PARTITIONBY ( Clientes[País] )
    )
)</code></pre>
<p>Con PARTITIONBY por país y la ventana de la primera a la última fila, devuelve el total de clientes de cada país respetando los filtros externos (ALLSELECTED).</p>
`},
{t:"logica", s:S9, h:`
<h4>Documentar y evaluar filtros activos</h4>
<pre><code>Pasado =
SWITCH (
    TRUE (),
    ISINSCOPE ( Calendario[Mes] ), [Mes pasado],
    ISINSCOPE ( Calendario[Trimestre] ), [Trimestre pasado],
    [Año pasado]
)

Un valor año = HASONEVALUE ( Calendario[Año] )</code></pre>
<ul>
<li><b>ISINSCOPE:</b> TRUE si la columna es el nivel actual de la jerarquía en el visual.</li>
<li><b>HASONEVALUE:</b> TRUE si hay un único valor visible.</li>
<li><b>ISFILTERED:</b> TRUE si la columna tiene un filtro <b>directo</b>.</li>
<li><b>ISCROSSFILTERED:</b> TRUE si la columna o tabla está filtrada, directa o indirectamente (por relaciones).</li>
<li><b>TOCSV y TOJSON:</b> convierten una tabla (por ejemplo los valores filtrados) en texto CSV o JSON para documentar los filtros activos en una tarjeta o depurar.</li>
</ul>
`}
);
})();
