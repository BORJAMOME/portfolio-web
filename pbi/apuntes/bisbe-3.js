/* Curso de lenguaje DAX · Ana María Bisbé York · temas 6 y 7 */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var S6 = "Curso de lenguaje DAX · Bisbé · Tema 6. Contextos de evaluación";
var S7 = "Curso de lenguaje DAX · Bisbé · Tema 7. La función CALCULATE";
NOTES.push(
{t:"relaciones", s:S6, h:`
<h4>Propagación de filtros</h4>
<p>Los filtros de una tabla se extienden por las relaciones a otras tablas. Con relaciones de sentido único en estrella, el filtro va de Productos, Clientes y Calendario hacia Ventas, nunca al revés. En copo de nieve, Categoría filtra Subcategoría, esta filtra Productos y solo después llega a Ventas. Si las tablas están desconectadas, no hay filtrado.</p>
<h4>Tablas expandidas</h4>
<p>Concepto lógico del motor (no se almacena): la tabla más las columnas de las tablas relacionadas por el lado uno (varios a uno o uno a uno), en cascada siguiendo relaciones activas. Explican la propagación de filtros y por qué dentro de un iterador se ven unas columnas y otras no.</p>
<h4>Integridad referencial y filas huérfanas</h4>
<p>Integridad referencial: cada fila de hechos tiene su clave en la dimensión (si Ventas[ProductoID] = 101, existe Productos[ProductoID] = 101). Si no, hay <b>filas huérfanas</b> y Power BI añade <b>una</b> fila en blanco a la dimensión (aunque haya muchas huérfanas). Ejemplo: Productos_No_Amarillos sin los 24 productos amarillos que sí tienen ventas.</p>
<table class="dxtbl"><thead><tr><th>Expresión</th><th>Resultado</th><th>Motivo</th></tr></thead><tbody>
<tr><td><code>COUNTROWS(Productos_No_Amarillos)</code></td><td>135</td><td>No cuenta la fila en blanco</td></tr>
<tr><td><code>COUNTROWS(ALL(Productos_No_Amarillos))</code></td><td>136</td><td>Incluye la fila en blanco</td></tr>
<tr><td><code>COUNTROWS(DISTINCT(Productos_No_Amarillos))</code></td><td>135</td><td>DISTINCT la ignora</td></tr>
<tr><td><code>COUNTROWS(VALUES(Productos_No_Amarillos))</code></td><td>136</td><td>VALUES la cuenta como visible</td></tr>
</tbody></table>
<p><b>Buenas prácticas:</b> garantizar integridad antes de cargar; limpiar en Power Query (filtrar inválidas o añadir un miembro «Desconocido» a la dimensión); recordar que ALL y VALUES cuentan la fila en blanco y DISTINCT no.</p>
`},
{t:"contextos", s:S6, h:`
<h4>Contexto de filtro</h4>
<p>Lo generan los visuales (filas, ejes, segmentadores), los filtros de página o informe y acciones como tooltips, obtención de detalles o segmentaciones sincronizadas. Decide qué filas ve la medida: cada celda de una matriz y cada punto de un gráfico tiene su propio contexto. <code>Cantidad = SUM(Ventas[Cantidades])</code> da el total en una tarjeta, la suma de un color en una fila de tabla y la de color y categoría en una celda de matriz.</p>
<p><code>SELECTEDVALUE(Clientes[País], "Ninguno o Varios")</code> devuelve el valor si hay uno solo y el alternativo si hay cero o varios; sustituye el patrón HASONEVALUE + VALUES. Usarlo en iteraciones grandes puede penalizar el rendimiento.</p>
<p><b>CALCULATE cambia las gafas</b> con las que Power BI mira los datos: modifica el contexto de filtro y calcula en el nuevo. Puede agregar, reemplazar o eliminar filtros (ALL, REMOVEFILTERS) y modificarlos con KEEPFILTERS. <code>CALCULATE(SUM(Ventas[Cantidades]), Clientes[País] = "Argentina")</code>.</p>
<h4>Contexto de fila</h4>
<p>La fila actual que se evalúa. Aparece en <b>columnas calculadas</b> (<code>Ventas[Importe] = Ventas[Cantidad] * Ventas[PrecioUnitario]</code>, una vez por fila) y en <b>iteradores</b> (SUMX, AVERAGEX, FILTER…). En una medida, sin contexto de fila, no se puede referenciar una columna «suelta»: hay que agregarla o iterar.</p>
<h4>Transición de contexto</h4>
<p>Cuando CALCULATE (o CALCULATETABLE) se ejecuta dentro de un contexto de fila, convierte esa fila en un filtro sobre todo el modelo. Sin CALCULATE el contexto de fila solo afecta a la fila; con CALCULATE la fila actual (Producto = A) pasa a ser un filtro global. <code>SUM(Ventas[PrecioUnitario] * Ventas[Cantidad])</code> no funciona (SUM no itera); <code>SUMX</code> sí, pero sin transición. En una columna calculada <code>Ventas[ImportePorProducto] = CALCULATE([Total Ventas])</code> hay transición: la medida se evalúa filtrada por la fila. Llamar a una medida dentro de una columna calculada equivale a envolverla en CALCULATE.</p>
<h4>Dependencia circular</h4>
<p>Dos cálculos que dependen el uno del otro («dímelo tú primero»): una columna calculada que usa una medida que usa esa columna, o relaciones basadas en columnas o tablas calculadas que se miran entre sí. Para evitarlo: no usar CALCULATE en columnas calculadas si no hace falta; limpiar el contexto con ALLEXCEPT; y cambiar VALUES o ALL por <b>DISTINCT</b> o <b>ALLNOBLANKROW</b>, que no dependen de la fila en blanco de relaciones rotas.</p>
`},
{t:"calculate", s:S7, h:`
<p>CALCULATE es el director de orquesta del contexto de filtro: sin él, los filtros mandan sobre los cálculos; con él, tú mandas sobre los filtros. Puede agregar filtros («solo verde»), quitarlos («todo el mundo»), cambiarlos («si era azul, ahora rojo») y es la única función con ese poder (junto con CALCULATETABLE).</p>
<pre><code>Cantidad = SUM ( Ventas[Cantidad] )
Color_Verde = CALCULATE ( [Cantidad], Productos[Color] = "Verde" )</code></pre>
<p>Aunque el gráfico filtre Rojo, Color_Verde muestra el verde. Buenas prácticas: variables, no abusar en columnas calculadas y entender qué filtros hay antes y después.</p>
<h4>Cómo trabaja CALCULATE</h4>
<ol>
<li>Evalúa los argumentos de filtro en el contexto original (el que ya existía).</li>
<li>Si hay contexto de fila, hace la transición de contexto (la fila se convierte en filtro).</li>
<li>Combina los filtros y construye el nuevo contexto de filtro.</li>
<li>Aplica los modificadores (USERELATIONSHIP, CROSSFILTER, ALL, ALLSELECTED, ALLEXCEPT, ALLNOBLANKROW) que cambian relaciones o quitan filtros.</li>
<li>Evalúa la expresión en el nuevo contexto.</li>
</ol>
<h4>Filtro de columna, FILTER y ALL</h4>
<table class="dxtbl"><thead><tr><th>Situación</th><th>Qué ve la medida</th><th>Resultado</th></tr></thead><tbody>
<tr><td><code>Productos[Color] = "Verde"</code> dentro de CALCULATE</td><td>Siempre Verde, ignora el filtro externo sobre Color</td><td>Siempre igual en cada fila</td></tr>
<tr><td><code>FILTER(Productos, Productos[Color] = "Verde")</code></td><td>Lo que queda tras los filtros externos</td><td>Si fuera se filtra Amarillo, BLANK</td></tr>
<tr><td><code>FILTER(ALL(Productos[Color]), Productos[Color] = "Verde")</code></td><td>Todos los colores, ignora filtros externos</td><td>Siempre encuentra Verde</td></tr>
</tbody></table>
<p>CALCULATE con filtro directo sobre una columna ignora los filtros externos de esa columna; FILTER los respeta; ALL los borra.</p>
<h4>Comprobar que un valor está visible</h4>
<p>Para que el filtro «Verde» solo actúe si Verde está visible (y si no, BLANK), se combina con KEEPFILTERS o con VALUES/DISTINCT:</p>
<pre><code>Values_Color_Verde =
CALCULATE ( [Cantidad], Productos[Color] = "Verde", VALUES ( Productos[Color] ) )

DISTINCT_Color_Verde =
CALCULATE ( [Cantidad], Productos[Color] = "Verde", DISTINCT ( Productos[Color] ) )</code></pre>
<p>VALUES devuelve los valores visibles (puede incluir el blanco); DISTINCT, sin la fila en blanco.</p>
<h4>Varias condiciones y conjuntos</h4>
<pre><code>Objetivo_Alcanzado = IF ( [Ventas] &gt; [Objetivo] &amp;&amp; [Mes] &lt;&gt; "Enero", "OK", "NO" )
Color_Promocion = IF ( Productos[Color] = "Verde" || Productos[Color] = "Rojo", "Promo", "Normal" )

America del Sur = CALCULATE ( [Cantidad], Clientes[Pais] IN { "Argentina", "Chile" } )
Sin America del Sur = CALCULATE ( [Cantidad], NOT Clientes[Pais] IN { "Argentina", "Chile" } )</code></pre>
<h4>Modificadores</h4>
<table class="dxtbl"><thead><tr><th>Modificador</th><th>Para qué</th><th>Ejemplo</th></tr></thead><tbody>
<tr><td>USERELATIONSHIP</td><td>Activa una relación inactiva («despierta una relación dormida»)</td><td><code>CALCULATE([Cantidad Orden], USERELATIONSHIP(Calendario[Fecha], Fecha_Venta[Fecha Entrega]))</code></td></tr>
<tr><td>CROSSFILTER</td><td>Cambia la dirección (ONEWAY, BOTH, NONE)</td><td><code>CALCULATE([Total_Clientes], CROSSFILTER(Clientes[IdCliente], Ventas[IdCliente], BOTH))</code></td></tr>
<tr><td>ALL / REMOVEFILTERS</td><td>Borra filtros de columna, tabla o todo</td><td><code>CALCULATE([Cantidad], ALL(Productos[Color]))</code></td></tr>
<tr><td>ALLNOBLANKROW</td><td>Como ALL sin la fila en blanco («todo menos el niño invisible»); requiere parámetro</td><td><code>ALLNOBLANKROW(Productos)</code></td></tr>
<tr><td>ALLEXCEPT</td><td>Borra todo menos lo indicado</td><td><code>CALCULATE([Cantidad], ALLEXCEPT(Ventas, Clientes[Pais]))</code></td></tr>
<tr><td>ALLSELECTED</td><td>Respeta filtros externos (segmentadores), ignora los del visual; sin filtros externos actúa como ALL</td><td><code>CALCULATE([Cantidad], ALLSELECTED(Productos[Color]))</code></td></tr>
</tbody></table>
<p>El tema termina con el <b>orden de los filtros</b>: los argumentos de filtro se evalúan en el contexto original y luego se combinan, de modo que el resultado no depende del orden en que se escriban, salvo por los modificadores que actúan sobre el contexto.</p>
`}
);
})();
