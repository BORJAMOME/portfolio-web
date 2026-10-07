/* Curso de lenguaje DAX · Ana María Bisbé York · temas 4 y 5 */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var S4 = "Curso de lenguaje DAX · Bisbé · Tema 4. Crear expresiones de cálculo";
var S5 = "Curso de lenguaje DAX · Bisbé · Tema 5. Medidas para proteger el modelo";
NOTES.push(
{t:"medidas", s:S4, h:`
<p>En el panel de datos se distinguen: tabla solo de medidas (_Cálculos), grupo de cálculo (BI Tiempo), tablas con columnas, medidas y columnas calculadas (Calendario, Clientes, Productos), tablas calculadas (Filtro Columnas, Filtro Tabla) y medidas (icono de calculadora).</p>
<p><b>Medida:</b> resultado dinámico según el contexto e interacción del usuario. No almacena el resultado, solo la expresión; no ocupa espacio; no se ejecuta hasta que una consulta la invoca. <b>Medida implícita:</b> automática, no recomendable (conviene deshabilitarlas). <b>Medida rápida:</b> plantillas predefinidas.</p>
<h4>Columnas calculadas</h4>
<p>Se calculan para todas las filas y se guardan en memoria: con 1 millón de ventas, <code>Precio * Cantidad</code> guarda 1 millón de valores y ralentiza el modelo.</p>
<table class="dxtbl"><thead><tr><th>Recomendación</th><th>Explicación</th></tr></thead><tbody>
<tr><td>Valorar alternativas</td><td>Antes de crearla, ¿se puede hacer en Power Query o como medida?</td></tr>
<tr><td>Jerarquías</td><td>Para aplanar relaciones padre-hijo (categoría y subcategoría)</td></tr>
<tr><td>Segmentar y filtrar</td><td>Cuando la clasificación no se puede hacer antes</td></tr>
<tr><td>Preparación en ETL</td><td>Mejor crearla en origen o en Power Query</td></tr>
<tr><td>Cálculos complejos</td><td>Valorar precalcular total o parcialmente</td></tr>
<tr><td>Evaluar la necesidad</td><td>Para no sobrecargar el modelo</td></tr>
</tbody></table>
<p><b>Desventajas:</b> ineficiencia (fila a fila y en memoria), se calculan después de la carga (no aprovechan la compresión eficiente), solo se recalculan al actualizar sus tablas, pueden dar resultados incorrectos en ratios o con filtros complejos, y aumentan el tamaño del modelo.</p>
<table class="dxtbl"><thead><tr><th></th><th>Medidas</th><th>Columnas calculadas</th></tr></thead><tbody>
<tr><td>Almacenamiento</td><td>Solo la fórmula</td><td>Un valor por fila</td></tr>
<tr><td>Cuándo se calculan</td><td>Al consultar, según el contexto del visual</td><td>Al cargar o actualizar</td></tr>
<tr><td>Uso</td><td>KPIs, totales, ratios, promedios</td><td>Clasificaciones, etiquetas, jerarquías, atributos derivados</td></tr>
<tr><td>Memoria y rendimiento</td><td>Muy bajo; aprovechan VertiPaq</td><td>Alto; más tamaño y carga</td></tr>
<tr><td>Contexto</td><td>Filtro</td><td>Fila</td></tr>
<tr><td>Recomendación</td><td>Primera opción</td><td>Solo si es necesario (mejor Power Query u origen)</td></tr>
<tr><td>Ejemplo</td><td><code>Total Ventas = SUM(Ventas[Monto])</code></td><td><code>IVA = Ventas[Monto] * 0.21</code></td></tr>
</tbody></table>
<p>Una columna calculada depende de su tabla: no se puede mover a otra. Al seleccionar una medida se activa la pestaña <b>Herramientas de medición</b>; con una columna, <b>Herramientas de columnas</b>; también hay propiedades de tabla y el panel de propiedades de la vista de modelo.</p>
`},
{t:"funtabla", s:S4, h:`
<h4>Tablas calculadas</h4>
<ul>
<li>Se crean con funciones que devuelven tablas: FILTER, ALL, ADDCOLUMNS, SELECTCOLUMNS, GENERATESERIES, SUMMARIZE… Ej.: <code>TablaFiltrada = FILTER(Ventas, Ventas[Cantidad] &gt; 10)</code>; <code>ADDCOLUMNS(Clientes, "EdadAdulto", IF(Clientes[Edad] &gt;= 18, "Adulto", "Menor"))</code>.</li>
<li>Pueden materializarse en el modelo o existir solo en memoria como tablas temporales (por ejemplo <code>FILTER(ALL(Ventas), Ventas[Cantidad] &gt; 10)</code> como argumento).</li>
<li>Se relacionan como cualquier tabla; siempre se importan (aumentan tamaño y tiempo de actualización); se recalculan al actualizar sus orígenes; no se conectan a datos externos.</li>
<li>Usos: dimensiones con juego de roles, variaciones de tablas, tablas temporales para cálculos complejos.</li>
<li><b>Constructores de tabla:</b> <code>{(1, "A"), (2, "B")}</code>, usados por ejemplo con IN.</li>
</ul>
<h4>Cálculos visuales</h4>
<p>DAX definido y ejecutado dentro de un visual: solo ve las columnas y medidas del visual, trabaja sobre datos agregados, se guarda en el propio visual, se calcula al vuelo y no se reutiliza. Funciones típicas: <code>RUNNINGSUM</code>, <code>MOVINGAVERAGE</code>, <code>PREVIOUS</code>, <code>NEXT</code>, <code>FIRST</code>, <code>LAST</code>. Admiten selectores de parámetros. Ideales para análisis exploratorio.</p>
<h4>Consultas DAX</h4>
<p>No crean objetos: devuelven datos del motor. Sirven para analizar distribuciones, detectar atípicos, agregar y probar o depurar expresiones sin visuales.</p>
<pre><code>EVALUATE
SUMMARIZECOLUMNS (
    DimProduct[ColorName],
    "Ventas", SUM ( FactSales[SalesQuantity] )
)
ORDER BY [Ventas] DESC</code></pre>
<p><b>Metadatos con INFO.VIEW:</b> <code>INFO.VIEW.TABLES()</code>, <code>.COLUMNS()</code>, <code>.MEASURES()</code>, <code>.RELATIONSHIPS()</code>, <code>.HIERARCHIES()</code>. Solo funcionan en consultas (DAX Studio o la vista Consultas DAX), no en medidas.</p>
<pre><code>EVALUATE
FILTER ( INFO.VIEW.TABLES (), [IsCalculatedTable] = TRUE () )

EVALUATE
SELECTCOLUMNS (
    INFO.VIEW.MEASURES (),
    "Tabla", [TableName],
    "Medida", [Name],
    "Expresión", [Expression]
)</code></pre>
<p>Útiles para documentar y auditar modelos (medidas duplicadas, tablas calculadas, relaciones inactivas).</p>
`},
{t:"grupos", s:S4, h:`
<p><b>Grupos de cálculo:</b> colección de fórmulas reutilizables para no repetir medidas. Disponibles en Power BI Desktop desde julio de 2023 (pestaña Modelo &gt; Grupo de cálculo); antes, con Tabular Editor. Elemento de cálculo base: <code>SELECTEDMEASURE()</code>; con lógica, por ejemplo <code>CALCULATE(SELECTEDMEASURE(), DATESYTD(Calendario[Fecha]))</code>. Se usan en los visuales como si fueran una columna (por ejemplo en las columnas de una matriz). Escenarios: año a año, acumulados, variaciones de ingresos, coste u ocupación hotelera: un solo grupo para todas las medidas base.</p>
`},
{t:"rls", s:S4, h:`
<p><b>Condición de seguridad de nivel de fila:</b> en Modelado &gt; Administrar roles, una expresión DAX que devuelve TRUE/FALSE por fila, por ejemplo <code>[País] IN { "Francia", "Alemania", "Reino Unido" }</code> en un rol Rol_Europa. Solo afecta a los Visores; se prueba con «Ver como rol».</p>
<p><b>Buenas prácticas:</b> roles bien definidos (región, país, departamento); funciones dinámicas como USERPRINCIPALNAME; evitar listas largas con IN y usar una tabla de usuarios relacionada; probar antes de publicar.</p>
<table class="dxtbl"><thead><tr><th>Función</th><th>Desktop</th><th>Service</th></tr></thead><tbody>
<tr><td>USERNAME()</td><td>DOMINIO\\usuario</td><td>usuario@empresa.com</td></tr>
<tr><td>USERPRINCIPALNAME()</td><td>usuario@empresa.com</td><td>usuario@empresa.com</td></tr>
</tbody></table>
<p><b>Seguridad dinámica paso a paso:</b> 1) tabla Usuarios (UsuarioEmail, País); 2) relacionarla con Clientes o Ventas por País; 3) rol sobre Usuarios con <code>[UsuarioEmail] = USERPRINCIPALNAME()</code>; 4) probar con Ver como rol y correos simulados; 5) publicar y asignar usuarios. María ve Francia, Juan España, Peter Alemania.</p>
`},
{t:"medidas", s:S5, h:`
<p>Modelo del tema: Ventas (hechos) y Fechas, Productos y Clientes (dimensiones). Medidas base que agregan una tabla, una columna, una expresión con varias columnas de una o varias tablas, u otras medidas. Propiedades de una medida: nombre, tabla contenedora, formato y separador de miles.</p>
<h4>Indicadores del ejemplo</h4>
<pre><code>Conteo Productos   = COUNTROWS ( Productos )               -- catálogo disponible
Productos Vendidos = DISTINCTCOUNT ( Ventas[IdProducto] )  -- productos con ventas
Cantidad           = SUM ( Ventas[Cantidades] )            -- unidades
Operaciones        = COUNTROWS ( Ventas )                  -- transacciones

Productos No Vendidos =
VAR _ConteoProductos = COUNTROWS ( Productos )
VAR _ProductosVendidos = DISTINCTCOUNT ( Ventas[IdProducto] )
RETURN
    _ConteoProductos - _ProductosVendidos</code></pre>
<p>Es un ejemplo de información de «no hechos»: lo que no ocurrió (productos sin ventas) se obtiene comparando la dimensión con la tabla de hechos.</p>
<h4>Agregaciones de una columna</h4>
<p>SUM, AVERAGE, MIN, MAX, COUNT, COUNTA, COUNTBLANK operan sobre el contexto de filtro. Blancos: ISBLANK, COUNTBLANK, DISTINCTCOUNTNOBLANK.</p>
<p><b>MAX vs MAXX:</b> MAX(columna) devuelve el máximo de una columna, no itera y solo acepta columnas. MAXX(tabla, expresión) recorre la tabla, evalúa la expresión fila a fila y devuelve el máximo: la versión personalizable.</p>
<pre><code>Venta Máxima = MAXX ( Ventas, Ventas[Cantidad] * Ventas[Precio] )

Máximo Margen Rentable =
MAXX ( FILTER ( Ventas, Ventas[Precio] &gt; 100 ), Ventas[Precio] - Ventas[Costo] )

Máximo Importe =
VAR TablaTemporal =
    ADDCOLUMNS ( Ventas, "Importe", Ventas[Cantidad] * Ventas[Precio] )
RETURN
    MAXX ( TablaTemporal, [Importe] )</code></pre>
`},
{t:"calculate", s:S5, h:`
<h4>Tabla virtual como parámetro</h4>
<pre><code>Conteo Tabla Virtual =
VAR TablaBase = ALL ( Ventas[Cantidades], Ventas[Precios] )
VAR TablaFiltrada = FILTER ( TablaBase, Ventas[Cantidades] * Ventas[Precios] &gt; 100 )
RETURN
    COUNTROWS ( TablaFiltrada )</code></pre>
<p>Orden: ALL quita solo los filtros de esas dos columnas (mantiene fecha, tienda, categoría, cliente…) y genera las combinaciones visibles; FILTER evalúa la condición fila a fila; COUNTROWS cuenta lo que queda.</p>
<h4>ALL, ALLEXCEPT, ALLSELECTED, REMOVEFILTERS («superpoderes de filtros»)</h4>
<ul>
<li><code>ALL(Productos[Categoría])</code>: ignora solo esa columna. <code>ALL(col1, col2)</code>: varias columnas. <code>ALL(Ventas)</code>: toda la tabla (fechas, tiendas, productos…).</li>
<li><code>ALLEXCEPT(Productos, Productos[Marca])</code>: quita todos menos los indicados.</li>
<li><code>ALLSELECTED(Productos[Categoría])</code>: respeta lo que eligió el usuario y quita lo que añade el visual. Con un segmentador en Bebidas, ALL ve todas las categorías y ALLSELECTED solo Bebidas.</li>
<li><code>REMOVEFILTERS(Productos)</code>: lo mismo que ALL, más legible.</li>
</ul>
<pre><code>% Ventas sobre Total =
DIVIDE ( [Ventas Totales], CALCULATE ( [Ventas Totales], ALL ( Productos ) ) )</code></pre>
`},
{t:"iteradores", s:S5, h:`
<p>Las agregaciones simples solo aceptan una columna; para operar entre columnas se usan <b>iteradores</b>: <code>FUNCIONX(&lt;tabla&gt;, &lt;expresión&gt;)</code> recorre la tabla, evalúa la expresión fila a fila en una columna virtual y agrega.</p>
<table class="dxtbl"><thead><tr><th>Función</th><th>Ejemplo</th><th>Resultado</th></tr></thead><tbody>
<tr><td>SUMX</td><td><code>SUMX(Ventas, Ventas[Cantidad]*Ventas[Precio])</code></td><td>Total de ventas</td></tr>
<tr><td>AVERAGEX</td><td><code>AVERAGEX(Ventas, Ventas[Cantidad]*Ventas[Precio])</code></td><td>Venta media</td></tr>
<tr><td>MINX</td><td><code>MINX(Ventas, Ventas[Precio]*0.9)</code></td><td>Precio mínimo con descuento</td></tr>
<tr><td>MAXX</td><td><code>MAXX(Ventas, Ventas[Precio]*1.1)</code></td><td>Precio máximo ajustado</td></tr>
<tr><td>COUNTX</td><td><code>COUNTX(Ventas, Ventas[Precio])</code></td><td>Precios no vacíos</td></tr>
<tr><td>PRODUCTX</td><td><code>PRODUCTX(Ventas, Ventas[Factor])</code></td><td>Producto de factores</td></tr>
</tbody></table>
<p><b>Limitación:</b> dentro del iterador solo se ven las columnas de la tabla iterada; <code>SUMX(Ventas, Ventas[Cantidad] * Productos[PrecioCatálogo])</code> da error. Solución: <code>RELATED(Productos[PrecioCatálogo])</code>.</p>
<pre><code>Beneficio =
SUMX (
    Ventas,
    ( Ventas[Cantidad] * Ventas[PrecioVenta] )
        - ( Ventas[Cantidad] * RELATED ( Productos[PrecioCosto] ) )
)</code></pre>
<h4>Variables</h4>
<p>Mejoran la legibilidad, evitan cálculos repetidos y facilitan depurar (puedes devolver una variable con RETURN).</p>
<pre><code>Dif Ingresos =
VAR IngresoReal = SUMX ( Ventas, Ventas[Cantidad] * Ventas[Precio Venta] )
VAR IngresoBase = SUMX ( Ventas, Ventas[Cantidad] * RELATED ( Productos[Precio Base] ) )
RETURN
    IngresoReal - IngresoBase

MargenPorVenta =
SUMX (
    Ventas,
    VAR Costo = RELATED ( Productos[Costo] )
    VAR Precio = Ventas[Precio Venta]
    VAR Margen = Precio - Costo
    RETURN Margen * Ventas[Cantidad]
)</code></pre>
<p>Las variables definidas dentro del iterador se evalúan en cada fila, sin recalcular toda la tabla.</p>
`}
);
})();
