/* Claudio Trombini: Gráficos imprescindibles para negocio, Gráficos avanzados, Revisión gráfica y Perímetros temporales */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var GI = "Gráficos imprescindibles para negocio · Claudio Trombini (NamasData)";
var GA = "Gráficos avanzados · Claudio Trombini (masterclass)";
var RG = "Revisión gráfica: teoría y práctica · Claudio Trombini (masterclass)";
var PT = "Perímetros temporales · Claudio Trombini (masterclass)";
var AVISO = "<p class=\"note-img\">Gran parte de este material está en capturas en Notion; aquí se recoge el texto y la técnica de cada paso.</p>";
NOTES.push(
/* ---------- Gráficos imprescindibles ---------- */
{t:"graficosav", s:GI + " · Gráfico de barras", h:AVISO + `
<h4>Proceso para un gráfico de barras de negocio</h4>
<ul>
<li>Línea constante en 0, mejor en gris; quitar los títulos de ejes.</li>
<li><b>Carpeta de medidas de color</b> (siempre de tipo texto, devuelven un hexadecimal) y aplicarlas con <b>fx</b> en el color de ejes, la línea divisoria y las barras.</li>
<li><b>Línea MAX</b> y <b>línea AVG</b> como medidas (para controlar el máximo del eje desde DAX).</li>
<li>Medidas dentro del subtítulo con <code>FORMAT</code> y la cultura adecuada (en el curso, <code>"it-IT"</code>).</li>
<li>Color de las barras según su valor (formato condicional por medida).</li>
<li><b>Barras de error</b> con línea cero y barra transparente para dibujar marcadores.</li>
<li><b>MAX entre dos medidas</b> (máximo de los máximos) para que ambas series compartan escala.</li>
</ul>
<h4>Segmentador en blanco</h4>
<ul>
<li><b>Solución 1:</b> que el elemento se vea aunque no tenga datos, ocultando los textos de promedio del subtítulo con una medida que comprueba si hay valor.</li>
<li><b>Solución 2:</b> que no se vea si está en blanco. En un modelo en estrella parece imposible, pero se resuelve con una medida de control (1 si hay datos) usada como <b>filtro visual</b> del segmentador.</li>
</ul>
<h4>Delta frente al promedio</h4>
<p>Medida Delta = margen − promedio, líneas MAX DELTA y MIN DELTA para la escala, barra Delta en barras y etiquetas, colores por signo, subtítulo construido con varias medidas de texto y una barra entre columnas. Al quitar un país del gráfico <b>el promedio se recalcula</b> (ALLSELECTED). Para las cifras de las etiquetas: en la medida, quitar el formato automático y elegir «Ninguno» para controlar las unidades. Extra: bordes de color según positivo o negativo.</p>
`},
{t:"graficosav", s:GI + " · Tarjetas", h:`
<ul>
<li>Tarjetas con valor, variación y <b>fecha máxima</b> de los datos.</li>
<li>Formato del texto, <b>barra izquierda</b> de color según el valor, valores encima y etiqueta debajo, texto alternativo cuando el valor está vacío.</li>
<li>Buscar fechas por día de la semana (LUN, MAR…) con una columna ordenada por fecha.</li>
<li><b>Segmentador MTD / QTD / YTD</b> con tabla desconectada y medida <code>MARGEN_SWITCH</code>; título dinámico.</li>
<li>Que las tarjetas respondan a todos los segmentadores del modelo.</li>
<li><b>Benchmark</b> entre dos marcas: <b>tabla desconectada + TREATAS</b>. Diferencia entre las marcas seleccionadas (con corrección de la fórmula para el total), layout y barras.</li>
<li>Evitar que lo seleccionado en un segmentador aparezca en el otro (filtro visual con medida).</li>
<li>Una tarjeta que lo tiene todo y tooltip propio.</li>
</ul>
`},
{t:"graficosav", s:GI + " · Tablas", h:`
<h4>Tabla frente a matriz</h4>
<ul>
<li><b>Total arriba</b> de la tabla (opción de posición de totales).</li>
<li><b>Columnas separadoras</b>: medida BLANK con nombre de un carácter invisible (U+200C) para dar aire entre bloques.</li>
<li>Modificar la línea negra de encabezado y cuadrícula.</li>
<li><b>Mostrar elementos sin valores</b> para los meses vacíos; los blancos son fechas del calendario sin hechos. Columna en el calendario: 1 si la fecha existe en los hechos y 0 si no, para filtrarlas.</li>
<li>Ordenar temporalmente (más reciente primero) con columna de orden.</li>
<li>Quitar el título con el carácter transparente y la línea que queda.</li>
<li>Subtotal por año (fórmula en el calendario y formato <code>""</code>), eliminar iconos sobrantes.</li>
<li>Icono en el <b>margen máximo</b> (formato condicional por icono con medida), porcentajes y <b>barras de datos</b>; quitar el drill-down para que no se pierdan las barras; porcentaje y barra juntos duplicando la medida.</li>
<li>Máximo de los máximos de toda la tabla; extra con marcas de columnas a filas y tabla desconectada.</li>
<li><b>DAX 2.0</b>: lo más avanzado se hace con objetos visuales personalizados.</li>
</ul>
`},
{t:"graficosav", s:GI + " · Gráfico de líneas", h:`
<ul>
<li>Límite inferior y superior del eje con medidas para que no cambie la escala cuando una marca no tiene datos (meterlas en el apartado de la lupa, Análisis). Ojo: puede obligar a que enero aparezca primero.</li>
<li>Máximo y mínimo marcados; cambiar la configuración para que no se dibujen líneas no deseadas.</li>
<li>Al cambiar de año cambian las proporciones: dos líneas de máximo con <b>transparencia al 100 %</b> para fijar la escala.</li>
<li>Corregir el tooltip que aparecía con esas líneas invisibles.</li>
<li><b>Media</b>: nunca usar las medidas automáticas de la lupa; crear la propia y mejorar su etiqueta.</li>
<li>Subtítulos dinámicos construidos con varias medidas.</li>
<li>Color con <b>barras de error</b>, <b>lollipop</b> con barra de error, modificación cuando no hay valores.</li>
<li>Proporcionar el gráfico y crear un <b>zoom</b> con tabla desconectada.</li>
<li>Cambiar el marcador de punto, tipologías de gráfico de tendencia y error al ocultar un año intermedio (corregir el eje temporal y el hueco final).</li>
</ul>
`},
/* ---------- Gráficos avanzados ---------- */
{t:"graficosav", s:GA, h:`
<p>Los gráficos avanzados necesitan <b>medidas personalizadas</b>: por filtros, de filtro visual y de soporte.</p>
<ul>
<li>Representar correctamente la información y dar <b>contexto temporal</b> (también por puntos) y <b>contexto de mapa</b> (MapBox).</li>
<li>Gráfico de temporadas y varias dimensiones en un mismo gráfico.</li>
<li>Lecturas recomendadas de <b>Alberto Cairo</b>: <i>El arte funcional</i>, <i>The Truthful Art</i> y <i>Cómo mienten los gráficos</i>.</li>
</ul>
<h4>Caso 1: año actual frente a anterior</h4>
<ol>
<li>Tabla con dos dimensiones (actual y anterior) y medida que devuelve cada valor según la fila.</li>
<li>Colores en DAX con sus ajustes.</li>
<li>Un gráfico por país (múltiplos), nombre por gráfico y fondo gris al 80 %.</li>
<li>Ordenar por margen o por margen del año anterior.</li>
</ol>
`},
/* ---------- Revisión gráfica ---------- */
{t:"percepcion", s:RG, h:`
<p>Revisión de tipos de gráficos: <b>puntos</b>, <b>mapas</b> y <b>áreas</b>, con sus usos y errores.</p>
<ul>
<li><b>Cycle plots:</b> muestran la estacionalidad (cada mes con su evolución a lo largo de los años) y dan información que otro gráfico no da.</li>
<li><b>Slope graph</b> y small multiples para comparar dos momentos.</li>
<li><b>Transparencia por punto</b> con una medida que se aplica en el formato de color.</li>
</ul>
`},
/* ---------- Perímetros temporales ---------- */
{t:"calendario", s:PT, h:`
<h4>Segmentadores sincronizados con filtro visual</h4>
<p>Cuando se filtra un segmentador (Tienda) los demás deben mostrar solo valores con datos, sin cambiar la dirección de las relaciones (Factura no debe filtrar hacia las dimensiones). Se usa una medida como <b>filtro visual</b> del segmentador:</p>
<pre><code>Filtro Segmentador = INT ( NOT ISEMPTY ( Factura ) )   -- 1 si hay filas, 0 si no</code></pre>
<p>Aplicada al segmentador como «es 1», solo muestra las opciones con datos y todos quedan sincronizados.</p>
<h4>Perímetros temporales</h4>
<p><code>DATEDIFF</code> es la base para crear columnas que generan rangos temporales dinámicos en las hojas: diferencia en años, trimestres, meses y semanas respecto a hoy.</p>
<p>Columnas de texto que cambian según el desplazamiento («Año actual», «Año anterior», «Trimestre actual», año y mes juntos, año y semana) para que el segmentador siempre tenga el mismo nombre en el periodo en curso.</p>
<p>También: cambiar cualquier valor y modificarlo con parámetros, y formato condicional con flechas de texto mediante <code>UNICHAR(8600)</code> y similares (iconos como texto).</p>
`}
);
EXAM.push(
{k:"Visualización", t:"graficosav", s:GI, q:"¿Cómo se construye un benchmark entre dos marcas elegidas por el usuario?", a:"Con una tabla desconectada de marcas para el segundo segmentador y TREATAS en la medida para aplicar esa selección al modelo."},
{k:"Visualización", t:"calendario", s:PT, q:"¿Cómo haces que un segmentador solo muestre valores con datos sin poner relaciones bidireccionales?", a:"Con una medida (por ejemplo INT(NOT ISEMPTY(Hechos))) usada como filtro visual del segmentador igual a 1."}
);
})();
