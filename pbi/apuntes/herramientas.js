/* Herramientas externas: DAX Studio (Javier Sánchez Rivero), Bravo, Grupos de cálculo y C# (Bernat Agulló) */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var DS = "DAX Studio · Javier Sánchez Rivero (NamasData)";
var BR = "Bravo (NamasData)";
var BA = "Grupos de cálculo y automatización con C# · Bernat Agulló (masterclass)";
NOTES.push(
{t:"herramientas", s:DS, h:`
<p>DAX Studio es la herramienta para <b>escribir, depurar y optimizar consultas DAX</b>: ejecutar consultas, analizar rendimiento, depurar y visualizar o exportar resultados.</p>
<table class="dxtbl"><thead><tr><th>Herramienta</th><th>Para qué</th></tr></thead><tbody>
<tr><td><b>DAX Studio</b></td><td>Consultas DAX, rendimiento (Server Timings), VertiPaq Analyzer, exportación</td></tr>
<tr><td><b>Tabular Editor</b></td><td>Editar el modelo tabular, scripting y automatización (C#), validación y Best Practice Analyzer</td></tr>
<tr><td><b>Bravo</b> (SQLBI, gratuita)</td><td>Optimizar el modelo, analizar uso de columnas y medidas, formatear DAX, exportar datos a Excel</td></tr>
</tbody></table>
<h4>Escenarios de uso</h4>
<ul>
<li>Rendimiento: medir, detectar cuellos de botella y optimizar consultas complejas.</li>
<li>Depuración: contexto de fila y filtro, variables intermedias, errores de sintaxis y lógica.</li>
<li>Optimización del modelo: memoria y cardinalidad.</li>
<li>Escritura y pruebas de consultas; exportación y documentación.</li>
</ul>
<h4>Conexión</h4>
<ul>
<li>Requisitos: Windows 10/11, .NET Framework y Power BI Desktop actualizado.</li>
<li><b>Power BI Desktop:</b> abrir el PBIX y después DAX Studio, o desde la pestaña <b>Herramientas externas</b>.</li>
<li><b>Excel:</b> Archivo → Opciones → Complementos → Complementos COM.</li>
<li><b>Power BI Service (servidor tabular):</b> mínimo Premium por usuario; copiar la cadena de conexión del área de trabajo (punto de conexión XMLA), pegarla en DAX Studio y conectar.</li>
</ul>
<h4>Interfaz</h4>
<p>Paneles <b>Metadata</b> (tablas, columnas, medidas), <b>Functions</b> (guía de cada función DAX), <b>DMV</b> (consultas de vistas de administración sobre estado y estructura del modelo), <b>Log</b>, <b>Results</b> e <b>History</b>. Cintas Home, Advanced y Help, y opciones de configuración. El <b>Query Builder</b> construye consultas arrastrando campos.</p>
`},
{t:"consultasdax", s:DS, h:`
<p><code>EVALUATE</code> es el punto de partida: ejecuta una expresión que devuelve una tabla.</p>
<pre><code>SUMMARIZE ( &lt;tabla&gt;, &lt;columna1&gt;, &lt;columna2&gt;, ..., "Nombre", &lt;expresión&gt; )
-- tabla resumida, parecido a GROUP BY de SQL (puede agrupar por columnas de tablas relacionadas)

ADDCOLUMNS ( &lt;tabla&gt;, "Nombre", &lt;expresión&gt;, ... )
-- añade columnas calculadas a una tabla

SUMMARIZECOLUMNS ( &lt;columnaAgrupar&gt;, ..., &lt;tablaFiltro&gt;, ..., "Nombre", &lt;expresión&gt; )
-- la función de consulta integral: agrupa, filtra y calcula</code></pre>
<ul>
<li><b>DEFINE MEASURE / COLUMN / TABLE:</b> medidas, columnas y tablas temporales con alcance de consulta.</li>
<li><b>DEFINE MPARAMETER:</b> parámetros macro reutilizables en la consulta; solo funciona en DirectQuery. Sirve para simular escenarios y parámetros de usuario y facilita la depuración.</li>
<li><b>Query Parameters:</b> variables (<code>@Parametro</code>) que DAX Studio pide justo antes de ejecutar; útiles para probar valores y filtros.</li>
<li>Resultados en rejilla, archivo, portapapeles o Excel.</li>
</ul>
<p><b>Data lineage (linaje):</b> la capacidad de DAX de recordar de qué columna del modelo procede cada valor, aunque esté en una tabla virtual; por eso un filtro construido con valores de una columna sigue las relaciones. Mantiene la integridad de las relaciones, facilita consultas entre tablas y permite optimizarlas.</p>
`},
{t:"vertipaq", s:DS, h:`
<p>VertiPaq es el motor en memoria de Power BI, Analysis Services y Power Pivot: compresión, acceso en RAM y <b>escaneo selectivo</b> (solo las columnas necesarias).</p>
<table class="dxtbl"><thead><tr><th>Codificación</th><th>Cómo comprime</th></tr></thead><tbody>
<tr><td>Valor</td><td>Reduce los bits necesarios para representar números de la columna</td></tr>
<tr><td>Hash (diccionario)</td><td>Diccionario de valores únicos; la columna guarda índices numéricos</td></tr>
<tr><td>RLE</td><td>Sustituye secuencias repetidas por el valor y el número de repeticiones</td></tr>
</tbody></table>
<p>Las relaciones también ocupan memoria (dependen de la cardinalidad de la clave). Las <b>agregaciones</b> son versiones resumidas de una tabla. Motores: <b>Formula Engine</b> (interpreta DAX, un hilo) y <b>Storage Engine</b> (lee los datos, multihilo y con caché). Métricas del servidor en <b>Server Timings</b>.</p>
<h4>CallbackDataID</h4>
<p>Aparece cuando el SE necesita que el FE le calcule algo que no sabe resolver: iteradores (SUMX, FILTER) con expresiones complejas de contexto de fila o relaciones dependientes. Minimizarlo con filtros directos en CALCULATE, menos expresiones fila a fila y relaciones más simples.</p>
<h4>VertiPaq Analyzer y ejercicio</h4>
<p>Muestra el tamaño de tablas, columnas, diccionarios y relaciones. En el ejercicio aparecían tablas <b>LocalDateTable</b> ocupando espacio: se eliminan desactivando <i>Fecha y hora automáticas</i> en Opciones → Carga de datos.</p>
`},
{t:"herramientas", s:BR, h:`
<p>Bravo se descarga desde sqlbi.com. Funciones:</p>
<ul>
<li><b>Analizar el modelo</b>: tamaño de tablas y columnas, columnas sin usar (para analizar modelos publicados hay que descargarlos antes).</li>
<li><b>Formatear medidas DAX</b> con el estilo de DAX Formatter y aplicarlo al modelo.</li>
<li><b>Administrar fechas</b>: crea una tabla de calendario con plantillas y festivos y medidas de inteligencia de tiempo.</li>
<li><b>Exportar datos</b> a Excel o CSV.</li>
</ul>
`},
{t:"grupos", s:BA, h:`
<p>Masterclass de Bernat Agulló (esbrina-ba.com). Primero se crea un <b>parámetro de campo</b> «KPI» con las medidas base para elegir cuál se ve en la tabla (en Valores se pone KPI).</p>
<h4>Grupo de cálculo de inteligencia de tiempo</h4>
<pre><code>CY   = SELECTEDMEASURE ()
PY   = CALCULATE ( SELECTEDMEASURE (), SAMEPERIODLASTYEAR ( 'Fecha'[Fecha] ) )
YOY  = SELECTEDMEASURE () - CALCULATE ( SELECTEDMEASURE (), SAMEPERIODLASTYEAR ( 'Fecha'[Fecha] ) )
YOY% = DIVIDE (
           SELECTEDMEASURE () - CALCULATE ( SELECTEDMEASURE (), SAMEPERIODLASTYEAR ( 'Fecha'[Fecha] ) ),
           CALCULATE ( SELECTEDMEASURE (), SAMEPERIODLASTYEAR ( 'Fecha'[Fecha] ) )
       )</code></pre>
<p>Problema: YOY% no sale como porcentaje. Solución: en la vista de modelo, en el elemento de cálculo, activar la <b>expresión de cadena de formato dinámica</b> (por ejemplo <code>"0.0%"</code> para YOY% y <code>SELECTEDMEASUREFORMATSTRING()</code> para el resto).</p>
<h4>MIN, MAX y AVERAGE sobre el periodo</h4>
<p>Otro grupo de cálculo devuelve el máximo, mínimo o la media de la medida base sobre los meses visibles (por ejemplo <code>MAXX(VALUES('Fecha'[Mes]), SELECTEDMEASURE())</code>).</p>
<h4>Automatización con C#</h4>
<p>Para añadir columnas según la elección (combinar media, PY o YOY% en la misma tabla) se generan elementos con un <b>script C#</b> en Tabular Editor 3 (de pago), que crea en bloque los elementos de cálculo y sus cadenas de formato.</p>
`}
);
EXAM.push(
{k:"Herramientas", t:"vertipaq", s:DS, q:"VertiPaq Analyzer muestra varias tablas LocalDateTable ocupando memoria. ¿Qué haces?", a:"Desactivar Fecha y hora automáticas (Opciones → Carga de datos) y usar una tabla de calendario propia marcada como tabla de fechas."},
{k:"Herramientas", t:"herramientas", s:DS, q:"¿Qué necesitas para conectar DAX Studio a un modelo publicado en Power BI Service?", a:"Capacidad Premium (como mínimo Premium por usuario) para usar el punto de conexión XMLA; se copia la cadena de conexión del área de trabajo y se pega en DAX Studio."},
{k:"DAX", t:"grupos", s:BA, q:"Un elemento de cálculo YOY% muestra 0,12 en lugar de 12 %. ¿Cómo se arregla?", a:"Definiendo la expresión de cadena de formato dinámica del elemento de cálculo (por ejemplo \"0.0%\")."}
);
})();
