/* Curso de lenguaje DAX · Ana María Bisbé York · temas 10, 11 y 12 */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var S10 = "Curso de lenguaje DAX · Bisbé · Tema 10. Consultas DAX para explorar el modelo";
var S12 = "Curso de lenguaje DAX · Bisbé · Tema 12. Optimización de consultas DAX";
NOTES.push(
{t:"consultasdax", s:S10, h:`
<h4>La vista Consultas DAX</h4>
<ul>
<li><b>Banda de opciones:</b> edición, dar formato, comentarios, buscar y reemplazar (con coincidencia de mayúsculas) y paleta de comandos.</li>
<li><b>Barra de comandos:</b> Ejecutar (la selección o todas las consultas de la pestaña), Actualizar modelo con cambios (se habilita al proponer cambios) y Compartir comentarios.</li>
<li><b>Editor</b>, <b>vista en miniatura</b> (para moverse por código largo), <b>panel Resultados</b> (con copiar, incluidos encabezados, o un rango de celdas) y <b>pestañas</b> de consultas, que se guardan dentro del PBIX.</li>
<li><b>Panel Datos</b> (Tablas y Modelo) con menú contextual de <b>Consultas rápidas</b>.</li>
</ul>
<h4>DEFINE y consultas rápidas</h4>
<pre><code>DEFINE
    MEASURE '_Indicadores'[Cantidad] = SUM ( Ventas[Cantidades] )
    MEASURE '_Indicadores'[Total Acumulado] =
        CALCULATE ( [Cantidad], DATESYTD ( Calendario[Fecha] ) )
EVALUATE
SUMMARIZECOLUMNS ( Calendario[Año], "Acumulado", [Total Acumulado] )</code></pre>
<p>«Definir» crea la medida en la consulta; «Definir con referencias» incluye además las medidas de las que depende; ambas tienen la variante «y evaluar».</p>
<p><b>Estadísticas de columna</b> (consulta rápida): para texto devuelve recuento, distintos sin blancos, mínimo y máximo:</p>
<pre><code>EVALUATE
ROW (
    "Table", "Clientes",
    "Column", "País",
    "Count", COUNT ( 'Clientes'[País] ),
    "Distinct Values", DISTINCTCOUNTNOBLANK ( 'Clientes'[País] ),
    "Min", MIN ( 'Clientes'[País] ),
    "Max", MAX ( 'Clientes'[País] )
)</code></pre>
<p>Para números añade media, mediana, desviación estándar, ceros, pares, impares y percentiles 25 y 75; para fechas, rango y conteos. También «Mostrar las primeras 100 filas» de una tabla.</p>
<h4>Estructura de una consulta</h4>
<ol>
<li><b>Definición</b> (opcional, DEFINE): medidas, variables, columnas o tablas con alcance de consulta, existan o no en el modelo. Buena práctica usar variables.</li>
<li><b>Evaluación</b> (EVALUATE): debe devolver una tabla; si no, error.</li>
<li><b>Modificación de salida</b> (opcional): ORDER BY ASC/DESC, START AT.</li>
</ol>
<p><b>Metadatos:</b> INFO.VIEW.TABLES, INFO.VIEW.RELATIONSHIPS, INFO.VIEW.COLUMNS e INFO.VIEW.MEASURES, que se pueden filtrar y seleccionar columnas para personalizar la documentación del modelo.</p>
<p>El tema 11 (lenguajes de consulta DAX frente a SQL) quedó sin apuntes en Notion.</p>
`},
{t:"consultasdax", s:S12, h:`
<h4>Pasos para optimizar</h4>
<ol>
<li>Analizador de rendimiento: iniciar grabación, analizar el visual y <b>Copiar consulta</b>.</li>
<li>Abrir DAX Studio desde Herramientas externas y pegar la consulta.</li>
<li>Activar <b>Server Timings</b>, limpiar la caché y ejecutar.</li>
<li>Revisar pasos y tiempos. Opciones de DAX Studio: <i>Define Measure</i> (la medida), <i>Define Dependent Measures</i> (la medida y las que llama) y <i>Define and Expand Measure</i> (sustituye cada referencia por su expresión).</li>
</ol>
<h4>Motores</h4>
<ul>
<li><b>DSE (Data Shape Engine):</b> el coreógrafo; decide qué consultas DAX hacen falta según los visuales afectados (7 visuales = 7 consultas).</li>
<li><b>FE (Formula Engine):</b> el cerebro; interpreta DAX, crea el plan, pide datos al SE, combina resultados y resuelve lo complejo. <b>Un solo hilo</b> y sin caché en operaciones complejas: suele ser el culpable de la lentitud.</li>
<li><b>SE (Storage Engine):</b> la bestia rápida sobre VertiPaq, DirectQuery o Direct Lake; un hilo por segmento, en paralelo y con caché. Resuelve lo simple (SUM, COUNT, DISTINCTCOUNT con buen modelo).</li>
</ul>
<p>Siempre interviene el FE (interpreta, pide, combina y serializa el resultado); <b>optimizar es desplazar trabajo del FE al SE</b>.</p>
<p><b>Consejos:</b> evitar iteradores innecesarios (SUMX, FILTER, ADDCOLUMNS); preferir KEEPFILTERS o buenas relaciones a <code>FILTER(ALL(...))</code>; usar variables; baja cardinalidad; evitar relaciones bidireccionales o ambiguas; no invocar la misma medida muchas veces.</p>
<h4>Server Timings</h4>
<ul>
<li><b>Total:</b> duración total en el servidor (ms). <b>SE CPU:</b> CPU dedicada a consultas del SE. <b>FE:</b> total menos SE. <b>SE:</b> suma de la duración de las consultas del SE. <b>SE Queries:</b> número de consultas al SE. <b>SE Cache:</b> veces que se usó la caché.</li>
<li><b>Métricas de ejecución:</b> filas procesadas, retraso por limitación de capacidad, tiempo de conexión al origen, memoria y CPU aproximadas.</li>
<li>Las consultas del SE se muestran en <b>xmSQL</b>, un pseudo-SQL.</li>
</ul>
<h4>Escenarios</h4>
<p><b>Variables:</b> si un cálculo se repite (en la expresión o al referenciar una medida), usar variables reduce peticiones al SE. La posición importa: definir variables que recorren la tabla dos veces por separado es peor que definirlas dentro del iterador.</p>
<p><b>Fusión:</b> el motor combina eventos del SE similares en uno solo dentro de una misma consulta; cada visual es una consulta independiente, así que conviene usar visuales que acepten varias medidas (tarjeta múltiple, tabla, matriz).</p>
<p><b>Panel de filtros frente a medidas:</b> una tarjeta filtrada por «Verde» desde el panel queda en blanco si el segmentador filtra otro color, mientras que la medida Color_Verde con CALCULATE sigue funcionando.</p>
<p><b>Ceros y auto-exist:</b> auto-exist es la optimización que evita combinaciones inexistentes; para mostrar ceros, <code>Suma Cero = [Cantidad] + 0</code> es más eficiente que alternativas con IF.</p>
<p><b>IF dentro de un iterador</b> provoca <b>CallbackDataID</b>: el resultado no se cachea y se piden datos al SE fila a fila. Sustituirlo por FILTER: sobre la tabla completa evita el callback pero genera una tabla con todas las columnas (20 filas × 5 columnas); sobre <code>ALL(Ventas[Cantidades], Ventas[Precio])</code> solo 16 filas × 2 columnas; y con CALCULATE y un filtro booleano de esas columnas se obtiene lo mismo de forma más simple.</p>
<p><b>SUM frente a SUMX:</b> SUMX sobre una sola columna equivale a SUM. SUMX con una <b>medida</b> como expresión penaliza (transición de contexto por fila); mejor iterar sobre una expresión de columnas o una tabla resumida.</p>
<p><b>FILTER frente a KEEPFILTERS:</b> FILTER crea un filtro fila a fila que CALCULATE convierte en contexto de filtro y puede reemplazar el filtro externo; KEEPFILTERS no elimina el filtro existente sino que lo combina con AND (escenario: productos con operaciones de precio mayor que 25).</p>
`}
);
})();
