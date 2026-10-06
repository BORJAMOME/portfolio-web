/* Informes Efectivos de Negocio en Power BI · Claudio Trombini (NamasData) */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var B1 = "Informes Efectivos · Trombini · Bloque 1. Gráficos y diseño visual";
var B2 = "Informes Efectivos · Trombini · Bloque 2. Segmentación y gestión temporal";
var B3 = "Informes Efectivos · Trombini · Bloque 3. Parámetros dinámicos y técnicas gráficas";
NOTES.push(
/* ---------------- Bloque 1 ---------------- */
{t:"graficosav", s:B1, h:`
<h4>Escalas y barras de error</h4>
<ul>
<li>Fijar el <b>máximo y mínimo del eje X</b> y el <b>máximo del eje Y</b> con medidas para que la escala no baile al filtrar.</li>
<li><b>Barras de error</b> (panel Análisis) para dibujar rangos máximo-mínimo. El mismo dato presentado de tres maneras: sin un margen normalizado, el gráfico básico confunde; con barras de error se ven claramente los extremos.</li>
</ul>
<h4>Gráfico compuesto (líneas y columnas)</h4>
<p>Problemas: pocas opciones de configuración, no se puede dibujar la <b>línea de 0</b> y, sobre todo, <b>no hay tooltip estándar</b>. No es aconsejable. Alternativa: construir la línea de 0 con una medida (<code>Cero = 0</code>) en un gráfico de líneas normal; así hay tooltip y más opciones, y mejor aún con un <b>tooltip personalizado</b>.</p>
<h4>Graficar el delta</h4>
<p>Medidas de diferencia (valor − referencia, y separadas en positiva y negativa para colorear). En un gráfico de barras el tooltip no aparece si la barra es muy fina; hay que preverlo.</p>
<h4>Barras apiladas y múltiplos pequeños</h4>
<p>Las barras apiladas solo sirven con <b>muy pocos elementos</b>; con mucha información es mejor <b>Small Multiples</b>. Color por continente con una medida de color (formato condicional por valor de campo). Las líneas permiten ver si algo sube o baja y si hay correlaciones.</p>
<h4>Fondo y maquetación</h4>
<ul>
<li><b>Nunca dejar el fondo blanco</b>: un fondo gris muy suave con tarjetas blancas hace que el cerebro se centre en los gráficos.</li>
<li>Barra de segmentadores <b>horizontal arriba</b> mejor que vertical (la vertical tapa otros segmentadores al desplegarse).</li>
<li><b>Layout interno</b> (la zona de visuales, sin los segmentadores) con una estructura básica en rejilla. Un segmentador específico puede afectar solo a ciertos gráficos de la hoja.</li>
<li>Error típico: <b>repetir los mismos valores</b> en varios gráficos de la hoja. Solución: cada gráfico aporta una dimensión o granularidad distinta.</li>
</ul>
<h4>Pasos para construir una hoja</h4>
<ol>
<li><b>Perímetro de la hoja</b> (temporal: qué periodo se ve).</li>
<li><b>Layout base</b>: color y fondo.</li>
<li><b>Segmentadores</b> de la barra superior.</li>
<li><b>Layout interno</b>.</li>
<li><b>Dimensiones</b> de cada gráfico y cómo interactúan entre sí.</li>
</ol>
`},
{t:"interactividad", s:B1, h:`
<h4>Marcadores (bookmarks)</h4>
<ul>
<li><b>Total y estático:</b> el marcador guarda datos, visualización y página; al aplicarlo todo vuelve a ese estado.</li>
<li>Variante que conserva los segmentadores: desmarcar <b>Datos</b> en el marcador para que al cambiar de gráfico se mantengan las selecciones.</li>
<li><b>Parcial:</b> aplicado solo a los objetos seleccionados (opción «Objetos seleccionados»), para alternar unos visuales sin tocar el resto.</li>
<li><b>Parcial y dinámico</b>: combinar objetos seleccionados sin datos, para cambiar el gráfico respetando el filtrado actual.</li>
<li>Extra: grupos de visuales y panel de selección para mostrar u ocultar capas con botones.</li>
</ul>
<h4>Navegación entre páginas</h4>
<p>Botones con acción <b>Navegación de páginas</b> o el navegador de páginas automático; para que el usuario lo entienda, un botón visible con estado al pasar el ratón.</p>
<h4>Tooltips</h4>
<p>Página de tipo <b>información sobre herramientas</b> (tamaño de tooltip, permitir uso como tooltip), con los visuales del detalle; se asigna en Formato → Información sobre herramientas → Página del informe. Permite mostrar contexto (evolución, comparativa) al pasar por un punto.</p>
`},
/* ---------------- Bloque 2 ---------------- */
{t:"calendario", s:B2 + " · Clase 2", h:`
<h4>Perímetros temporales en el calendario</h4>
<p>Calendario dinámico (desde 2010 hasta hoy) con columnas de <b>desplazamiento relativo a hoy</b>, que permiten filtros que se actualizan solos:</p>
<pre><code>Año Offset      = YEAR ( TODAY () ) - YEAR ( 'Calendario'[Fecha] )      -- 0 actual, 1 anterior
Trimestre Offset = DATEDIFF ( 'Calendario'[Fecha], TODAY (), QUARTER )   -- negativo = futuro
Mes Offset       = DATEDIFF ( 'Calendario'[Fecha], TODAY (), MONTH )</code></pre>
<p><b>Semana:</b> <code>DATEDIFF(..., WEEK)</code> cuenta semanas de domingo a sábado. Solución: calcular el lunes de la semana de cada fecha y el de hoy (<code>Fecha - WEEKDAY(Fecha, 2) + 1</code>) y dividir la diferencia de días entre 7; así la semana actual va de lunes a domingo.</p>
<h4>Segmentadores de fecha</h4>
<ul>
<li>Diferencia entre fechas como número o como texto, búsqueda textual y no permitir cambios de tamaño inesperados.</li>
<li>El segmentador «Entre» devuelve un rango; si se quiere <b>una sola fecha</b>, usar otro estilo (lista o desplegable con selección única) o tomar el máximo de la selección en la medida.</li>
<li>Segmentador <b>Año / Trimestre</b> jerárquico, ordenado descendente y que se abre en el trimestre actual: columna auxiliar que llama «Actual» al periodo en curso (siempre el mismo nombre) y se deja seleccionada al publicar.</li>
<li>Formato: forma del botón, color del valor seleccionado (si no, no se ve), ordenar de manera dimensional.</li>
</ul>
`},
{t:"ti", s:B2 + " · Clase 2", h:`
<h4>MTD, QTD y YTD con segmentador de fecha</h4>
<p>Con una fecha seleccionada, las medidas calculan el acumulado del mes, trimestre o año <b>hasta esa fecha</b>, respetando el límite de hoy. <code>KEEPFILTERS</code> conserva el filtro existente en lugar de sustituirlo, necesario cuando la medida depende de la fecha puntual elegida.</p>
<pre><code>Ventas MTD =
VAR _Fecha = MAX ( 'Calendario'[Fecha] )
RETURN
    CALCULATE (
        [Ventas],
        'Calendario'[Fecha] &lt;= _Fecha,
        'Calendario'[Fecha] &gt;= DATE ( YEAR ( _Fecha ), MONTH ( _Fecha ), 1 ),
        REMOVEFILTERS ( 'Calendario' )
    )</code></pre>
<p>No usar filtros de granularidad excesiva directamente en los visuales.</p>
`},
{t:"graficosav", s:B2 + " · Clase 2", h:`
<h4>Informe automático de cinco semanas (Perímetro Custom A)</h4>
<p>Para usuarios de negocio, sin segmentadores: dos semanas pasadas, la actual y dos futuras, que se actualizan solas. Cinco medidas, una por semana, filtradas con la columna de offset de semana.</p>
<ul>
<li>Quitar el ruido: sin cuadrícula, solo <b>máximo y mínimo</b> etiquetados.</li>
<li>Punto <b>Hoy</b> con una medida que solo devuelve valor en la fecha de hoy (y una línea vertical). Si hoy coincide con el máximo o el mínimo, priorizar el punto de hoy para que no se solapen.</li>
<li><code>IF</code> frente a <code>FILTER</code>: IF para dibujar un punto concreto; FILTER si se necesitan totales.</li>
<li>Títulos dinámicos con medidas de texto y referencia al valor de hoy.</li>
<li>Tablas semana a semana debajo del gráfico con el mismo perímetro, sin títulos redundantes.</li>
<li>Mejora: <b>promedio semanal</b> (cinco medidas más) con estilo diferenciado y subtítulos con las medias. Versión con Small Multiples.</li>
</ul>
`},
{t:"graficosav", s:B2 + " · Clase 3", h:`
<h4>Perímetro Custom B: la fecha la elige el usuario</h4>
<p>El perímetro es la vista de datos estrictamente necesaria para decidir. Para poder elegir una fecha (también futura) y ver las semanas a su alrededor, se crea una <b>tabla de fechas desconectada</b> para el segmentador y las medidas leen la selección (<code>SELECTEDVALUE</code>) para filtrar el calendario real.</p>
<ul>
<li>El punto «hoy» pasa a ser el <b>punto de selección</b>, con la misma prioridad sobre máximo y mínimo.</li>
<li><b>Filtros visuales</b> para limitar los segmentadores a valores con datos.</li>
<li>Si falta un día, forzar que se vean siempre los 7 días de la semana (medida que devuelve 0 en vez de blanco).</li>
<li>Título y subtítulo dinámicos. Versión 2: rangos que cruzan dos años.</li>
<li><b>Apertura dinámica</b> en el pasado o en el futuro según la fecha seleccionada.</li>
<li>Ejes dinámicos, líneas de referencia, barras de error y gráficos de conexión para trayectorias.</li>
<li>Calendario solar y semanal para comparar periodos homogéneos.</li>
<li>Tablas desconectadas para <b>simulaciones</b> y planificación de escenarios.</li>
</ul>
`},
/* ---------------- Bloque 3 ---------------- */
{t:"interactividad", s:B3 + " · Clase 4", h:`
<h4>Elegir la medida que se ve en el gráfico</h4>
<table class="dxtbl"><thead><tr><th>Escenario</th><th>Técnica</th><th>Trucos</th></tr></thead><tbody>
<tr><td>Live Connection, selección única</td><td>Tabla desconectada con los nombres (Ventas, Costes, Margen) + medida <code>SWITCH(SELECTEDVALUE(...))</code></td><td>Para poder dar color a cada línea, añadir una medida <b>cero</b>; el tooltip y el título se construyen con la medida de la selección</td></tr>
<tr><td>Live Connection, multiselección</td><td>Una medida por opción que devuelve BLANK si no está seleccionada</td><td>La leyenda muestra todas: usar <b>etiquetas de serie</b> en su lugar</td></tr>
<tr><td>Live Connection, caso real (3 medidas + 2 %)</td><td>Tabla desconectada + SWITCH</td><td>Formato con <b>cadena de formato dinámica</b> para que los % salgan como %; revisar el eje lateral</td></tr>
<tr><td>Importación</td><td><b>Parámetro de campo</b> (la mejor opción)</td><td>Sirve también para el título; para colores distintos por línea, pasar de selección única a varias</td></tr>
<tr><td>Importación, dimensiones</td><td>Parámetro de campo con columnas (día, mes, país…)</td><td>Un gráfico en lugar de diez: mejor rendimiento</td></tr>
</tbody></table>
<p>Truco: si al seleccionar un valor el gráfico desaparece, añadir una medida BLANK y ocultarla con un carácter transparente.</p>
`},
{t:"graficosav", s:B3 + " · Clase 4", h:`
<h4>Small Multiples</h4>
<ul>
<li>Línea superior común para todos los paneles (medida con el máximo) y ejes verticales ajustados por gráfico.</li>
<li><b>Avanzado 1:</b> año actual frente a anterior en múltiplos, con tabla desconectada; ajustar etiquetas y barras.</li>
<li><b>Avanzado 2:</b> dos gráficos en uno con tabla desconectada y <b>dos medidas SWITCH</b>.</li>
<li>Parámetro de campo de dimensiones con tooltips adaptados.</li>
<li><b>Extra A:</b> barras en múltiplos + barras de error y superposición de elementos.</li>
<li>Color y transparencia para distinguir positivo y negativo; medir con precisión (proporciones, zoom) para no deformar los datos.</li>
</ul>
`},
{t:"graficosav", s:B3 + " · Clase 5", h:`
<h4>Contexto con tabla desconectada</h4>
<p>Una métrica sin contexto no se interpreta. Se crea una tabla desconectada de meses (DAX) y otra equivalente dentro del modelo; se <b>sincronizan</b> los segmentadores y se ocultan.</p>
<ul>
<li><b>Puntos dinámicos</b> con <code>SWITCH(TRUE())</code>: solo aparecen puntos en la línea en los meses seleccionados (contexto general + foco).</li>
<li>Colores accesibles (azul y naranja en lugar de verde y rojo), etiquetas con fondo blanco semitransparente y densidad al 100 %.</li>
<li><b>Filtro visual</b> <code>NOT ISBLANK(...)</code> para que el segmentador de meses solo muestre los del año elegido.</li>
<li>Sin selección, mostrar por defecto el <b>máximo y el mínimo</b>.</li>
<li><b>Small Multiples por continente</b> con medidas centralizadas de color y eje.</li>
<li><b>Línea techo</b> estable: <code>CROSSJOIN</code> de Mes y Continente (o Marca) y máximo de margen por combinación multiplicado por un coeficiente. <code>ALL()</code> no admite columnas de tablas distintas: usar variables.</li>
<li>Etiquetas con offset mínimo y máximo y línea guía.</li>
<li>Cambiar la dimensión (Continente → Marca) sin rehacer cálculos.</li>
<li><b>YoY y delta</b> absoluto y relativo, con un <b>filtro de perímetro de página</b> que impide elegir años sin histórico.</li>
<li><b>Tooltip con la tarjeta nueva</b>: color condicional, sin padding, tamaño exacto 73 × 45 px.</li>
<li>Barras que se colorean o engrosan según la marca seleccionada (medidas de color duales) sin perder el contexto.</li>
<li>Layout: desactivar el modo <i>responsive</i>, márgenes internos a cero, títulos con medidas de estilo, disposición 4 × 1 combinando tendencias y deltas.</li>
<li><b>Extra B:</b> barras de error configuradas como marcadores.</li>
</ul>
`}
);
EXAM.push(
{k:"Visualización", t:"graficosav", s:B1, q:"¿Por qué Trombini desaconseja el gráfico combinado de líneas y columnas?", a:"Tiene pocas opciones de configuración, no permite la línea de 0 y no muestra el tooltip estándar. Mejor un gráfico de líneas con una medida Cero y tooltip personalizado."},
{k:"Visualización", t:"interactividad", s:B3, q:"En importación, ¿qué técnica es la mejor para que el usuario elija la medida de un gráfico?", a:"Un parámetro de campo. En Live Connection se recurre a una tabla desconectada y una medida SWITCH."},
{k:"DAX", t:"calendario", s:B2, q:"¿Por qué DATEDIFF con WEEK no sirve para una semana de lunes a domingo?", a:"Porque cuenta semanas de domingo a sábado. Hay que calcular el lunes de cada semana (Fecha - WEEKDAY(Fecha, 2) + 1) y dividir la diferencia de días entre 7."}
);
})();
