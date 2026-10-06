/* Curso de lenguaje DAX · Ana María Bisbé York · página principal y temas 1 a 3 */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var S = "Curso de lenguaje DAX · Ana María Bisbé York";
NOTES.push(
{t:"medidas", s:S + " (chuleta de funciones)", h:`
<table class="dxtbl"><thead><tr><th>Función</th><th>Uso</th><th>Ejemplo</th></tr></thead><tbody>
<tr><td>COUNTROWS</td><td>Filas visibles de una tabla o expresión de tabla</td><td><code>COUNTROWS(Ventas)</code></td></tr>
<tr><td>COUNT</td><td>Valores numéricos no vacíos</td><td><code>COUNT(Ventas[Unidades])</code></td></tr>
<tr><td>COUNTA</td><td>Valores no vacíos (número o texto)</td><td><code>COUNTA(Ventas[Producto])</code></td></tr>
<tr><td>DISTINCTCOUNT</td><td>Valores distintos</td><td><code>DISTINCTCOUNT(Ventas[Producto])</code></td></tr>
<tr><td>DISTINCTCOUNTNOBLANK</td><td>Distintos sin contar el blanco</td><td><code>DISTINCTCOUNTNOBLANK(Ventas[Cliente])</code></td></tr>
<tr><td>COUNTBLANK / ISBLANK</td><td>Cuenta vacíos / TRUE si es blanco</td><td><code>COUNTBLANK(Ventas[Cliente])</code></td></tr>
<tr><td>VALUES</td><td>Valores únicos de una columna o tabla</td><td><code>COUNTROWS(VALUES(Ventas[Producto]))</code>; <code>AVERAGEX(VALUES('Productos'[Categoría]), [Margen %])</code></td></tr>
<tr><td>ALL</td><td>Quita filtros de una columna, varias o una tabla</td><td><code>DIVIDE([Ventas Totales], CALCULATE([Ventas Totales], ALL(Productos)))</code></td></tr>
<tr><td>ALLEXCEPT</td><td>Quita todos los filtros menos los indicados</td><td><code>ALLEXCEPT(Productos, Productos[Marca])</code></td></tr>
<tr><td>ALLSELECTED</td><td>Quita filtros respetando la selección del usuario</td><td><code>ALLSELECTED(Productos[Categoría])</code></td></tr>
<tr><td>REMOVEFILTERS</td><td>Como ALL pero más legible (solo como modificador)</td><td><code>REMOVEFILTERS(Productos)</code></td></tr>
<tr><td>SUM / AVERAGE / MIN / MAX</td><td>Agregaciones básicas</td><td><code>MAX(Ventas[Fecha])</code></td></tr>
<tr><td>COALESCE</td><td>Devuelve el primer valor no blanco (convierte blancos en 0)</td><td><code>COALESCE(CALCULATE(COUNTROWS(fact), fact[cash_type] = "Card"), 0)</code></td></tr>
<tr><td>SELECTEDVALUE</td><td>Valor seleccionado en un segmentador (uno solo)</td><td><code>SELECTEDVALUE(Dim_Calendario[Año], "Sin año seleccionado")</code>: con un año devuelve el año; con varios devuelve el valor alternativo (o BLANK si no se indica)</td></tr>
<tr><td>CALCULATE</td><td>Cambia el contexto de filtro y evalúa la expresión. Puede agregar, reemplazar o eliminar filtros (ALL, REMOVEFILTERS) y modificarlos con KEEPFILTERS</td><td><code>CALCULATE([Total de Unidades Vendidas], dim_Fecha[MesCorto] = "Ene.")</code></td></tr>
</tbody></table>
`},
{t:"estrella", s:S + " · Tema 1. Introducción al modelo de datos tabular", h:`
<p>El <b>modelo tabular</b> es la forma en que Power BI organiza y conecta los datos en tablas con filas y columnas. Lo ejecuta el motor <b>VertiPaq</b>, que comprime los datos y calcula con DAX en segundos. Se compone de tablas de hechos y de dimensiones.</p>
<h4>Granularidad</h4>
<p>Nivel de detalle de los datos; al juntar datos deben tener la misma granularidad. <b>Resumida:</b> menos filas, actualización y exploración más rápidas, posible pérdida de detalle. <b>Detallada:</b> más filas, carga y exploración más lentas.</p>
<p>En el perfil de columna: <b>distintos</b> (Ana, Luis, Ana, Pedro, Ana, Luis = 3 distintos) y <b>únicos</b> (solo Pedro aparece una vez = 1 único). Si un ID de cliente tiene menos únicos que filas, hay duplicados. A más valores distintos, más peso en el modelo.</p>
<h4>Cardinalidad</h4>
<p>Cuántos valores distintos hay en una columna. Menor cardinalidad = más compresión = más velocidad. Las relaciones funcionan mejor cuando la columna del lado uno tiene cardinalidad baja. <b>Errores típicos:</b> fechas con hora y minuto en el calendario, usar IDs únicos innecesarios como clave en dimensiones y no agrupar niveles de detalle que no hacen falta.</p>
<h4>Roles y relaciones</h4>
<ul>
<li><b>Lado uno:</b> tablas descriptivas que filtran o agrupan; columna clave con valores únicos, sin nulos ni blancos.</li>
<li><b>Lado varios:</b> hechos enlazados a la clave; cada identificador aparece cero, una o muchas veces.</li>
<li>Cardinalidades: varios a uno, uno a varios, uno a uno, varios a varios.</li>
<li><b>Dirección única:</b> filtra la tabla con valores únicos hacia la otra. <b>Bidireccional:</b> los filtros suben y bajen; minimizar su uso. Cuándo: tablas puente, dos dimensiones que deben filtrarse a través de una intermedia, varios a varios que exigen coherencia en ambos lados.</li>
<li><b>Activa</b> (línea continua; solo una entre dos tablas y sin caminos múltiples) frente a <b>inactiva</b> (discontinua; tantas como hagan falta; solo propagan con <code>USERELATIONSHIP</code>).</li>
</ul>
<h4>Entidades y atributos</h4>
<p>Entidad = tabla importante; atributo = característica que la describe. Cada entidad con ID único y estable; un atributo nunca es una minitabla; una entidad describe una sola cosa. Mejor pocas tablas bien formadas. <b>Evita sobrenormalizar:</b> Países, Provincias y Municipios encadenadas obligan a tres relaciones para saber dónde vive un cliente. Esquemas: tabla única, copo de nieve y estrella.</p>
`},
{t:"vertipaq", s:S + " · Tema 2. Explorar y medir el modelo tabular", h:`
<p>VertiPaq guarda por <b>columnas</b>, encuentra patrones y comprime (como un .zip), y trabaja en <b>memoria RAM</b>: responde en milisegundos con millones de filas. El modelo tabular también lo usan Excel (modelo de datos), SQL Server Analysis Services, Azure Analysis Services y Microsoft Fabric. Contiene tablas, columnas, relaciones y medidas.</p>
<p><b>Modelo semántico:</b> el lenguaje común de los informes, la «fuente única de la verdad»: si todos los informes beben del mismo modelo, los números coinciden.</p>
<h4>Modos de almacenamiento</h4>
<ul>
<li><b>Importar:</b> cocinas una vez y guardas; copia, comprime y responde muy rápido, pero hay que refrescar.</li>
<li><b>DirectQuery:</b> pides la comida cada vez; siempre actualizado pero más lento. Para datos muy cambiantes o que no se pueden copiar.</li>
<li><b>Compuesto:</b> unas tablas importadas y otras en DirectQuery.</li>
<li><b>Direct Lake (Fabric):</b> lee directamente de OneLake sin copiar; casi tan rápido como Importar y siempre actualizado, para volúmenes gigantes.</li>
</ul>
<h4>Herramientas para examinar el modelo</h4>
<ul>
<li><b>Bravo:</b> mapa del modelo: tablas, columnas, relaciones, cardinalidad, distintos y únicos.</li>
<li><b>Tabular Editor:</b> taller mecánico: medidas masivas, jerarquías, roles, relaciones, scripts y buenas prácticas.</li>
<li><b>DAX Studio:</b> laboratorio: escribir y ejecutar consultas DAX, medir tiempos, memoria y cardinalidad, depurar medidas.</li>
</ul>
`},
{t:"medidas", s:S + " · Tema 3. Introducción al lenguaje DAX", h:`
<p><b>Elementos:</b> nombre, signo =, expresión, operadores y constantes, referencias (<code>Ventas[Monto]</code>), funciones y variables.</p>
<p><b>Colores del editor:</b> morado = medidas; azul claro = funciones; verde = variables y comentarios; rojo = texto literal; azul intenso = operadores y palabras clave (VAR, IN).</p>
<h4>Nombres</h4>
<ul>
<li><b>Tablas:</b> nombre único; entre comillas simples si tiene espacios, palabras reservadas o caracteres especiales.</li>
<li><b>Columnas:</b> siempre <code>Tabla[Columna]</code>. El nombre completo es obligatorio en funciones como VALUES, ALL, EXCEPT, RELATEDTABLE, las de inteligencia de tiempo y en filtros de CALCULATE/CALCULATETABLE.</li>
<li><b>Medidas:</b> pertenecen al modelo y se nombran sin tabla: <code>[Ventas]</code>. Nombre único en el modelo.</li>
<li><b>Funciones:</b> fórmulas predefinidas con argumentos (columnas, tablas, números, texto, lógicos, constantes, variables). Categorías: agregación, tiempo (básicas e inteligencia de tiempo), filtrado…</li>
</ul>
<h4>Tipos de datos</h4>
<p>Entero (IDs, cantidades); decimal (~15 dígitos de precisión); moneda (4 decimales fijos, evita errores de redondeo); TRUE/FALSE; texto (entre comillas); fecha/hora (número decimal: parte entera fecha, decimal hora; 0,5 = mediodía); fecha; hora; <b>BLANK</b> (no es 0 ni ""); tabla. Conversión implícita (automática) o explícita (con funciones como VALUE, FORMAT, INT).</p>
<h4>Operadores y prioridad</h4>
<p>Aritméticos <code>+ - * / ^</code>; comparación <code>= &gt; &lt; &gt;= &lt;= &lt;&gt;</code> (y <code>==</code> estricto); texto <code>&amp;</code>; lógicos <code>&amp;&amp;</code>, <code>||</code>, <code>NOT</code>; pertenencia <code>IN { ... }</code>. Prioridad: paréntesis, potencia, multiplicación y división, suma y resta, concatenación, comparación, lógicos.</p>
<h4>Blancos y operadores</h4>
<p>BLANK se trata como 0 en números y como "" en texto: <code>IF([Número] = 0, "Cero", "Otro")</code> con un blanco devuelve «Cero»; <code>[Texto] = ""</code> con blanco es TRUE; con <code>==</code> (igualdad estricta) un blanco <b>no</b> es igual a 0; <code>[Número] + 0</code> con blanco devuelve 0.</p>
`}
);
})();
