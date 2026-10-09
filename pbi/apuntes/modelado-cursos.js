/* Modelado de datos (NamasData) · Modelado en estrella (Salvador Ramos) · Modelado Estratégico y DAX (masterclass) */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var N = "Modelado de datos (curso NamasData)";
var SR = "Modelado de datos en estrella · Salvador Ramos";
var ME = "Modelado Estratégico y DAX · Masterclass Salvador Ramos";
NOTES.push(
/* ---------- NamasData: I. Fundamentos ---------- */
{t:"estrella", s:N + " · I. Fundamentos", h:`
<h4>Qué es el modelo tabular</h4>
<p>La forma ordenada de estructurar los datos para analizarlos: define tablas, relaciones y reglas. Sin modelo solo hay datos; con modelo, información útil. Permite cálculos correctos, buen rendimiento, informes fiables y escalabilidad. <b>El modelo organiza, DAX piensa y Power BI comunica.</b></p>
<h4>Tipos de tablas</h4>
<ul>
<li><b>Dimensiones:</b> atributos descriptivos que dan contexto a los hechos (por ejemplo, el territorio de venta). Deben ser <b>anchas</b> (muchos atributos) y <b>cortas</b> (sin valores repetidos).</li>
<li><b>Hechos:</b> datos cuantitativos (ventas, ingresos, cantidades). Deben ser <b>estrechas</b> y <b>largas</b> (todas las transacciones), sin atributos descriptivos y con valores repetidos. Contienen campos de fecha, claves hacia las dimensiones y datos cuantitativos.</li>
</ul>
<h4>Granularidad</h4>
<p>Nivel de detalle de una tabla. Ventas por día es una foto en alta calidad: se ve todo, pero pesa. Ventas por mes pierde detalle pero responde «¿cuánto vendimos este mes?». Elegir bien la granularidad da los datos suficientes para el negocio sin guardar de más: modelo más pequeño, rápido y eficiente.</p>
<h4>Tipos de esquema</h4>
<table class="dxtbl"><thead><tr><th>Esquema</th><th>Descripción</th></tr></thead><tbody>
<tr><td>Tabla única (aplanada)</td><td>Hechos y dimensiones en una tabla desnormalizada. Ineficiente; el objetivo es pasar a estrella.</td></tr>
<tr><td>Copo de nieve</td><td>Dimensiones descompuestas en subdimensiones: más normalizado, más relaciones y menos atributos por tabla.</td></tr>
<tr><td>Estrella</td><td>Una tabla de hechos central rodeada de dimensiones. El más efectivo en Power BI.</td></tr>
<tr><td>Constelación</td><td>Varias estrellas en un mismo modelo con tablas de hechos separadas.</td></tr>
<tr><td>«Armagedón»</td><td>Sin orden entre hechos y dimensiones, relaciones por todas partes. Hay que huir de él.</td></tr>
</tbody></table>
`},
{t:"relaciones", s:N + " · I. Fundamentos", h:`
<h4>Relaciones</h4>
<p>Conectan tablas mediante <b>un solo campo</b>. Entre dos tablas solo puede haber <b>una relación activa</b> (línea continua) y tantas inactivas (discontinuas) como se quiera; una inactiva se puede activar. Las columnas no tienen que llamarse igual, pero es buena práctica.</p>
<h4>Cardinalidad</h4>
<ul>
<li><b>1:1:</b> cada fila de A con una fila de B.</li>
<li><b>1:N / N:1:</b> cada fila de A con 0, 1 o muchas de B. La más habitual y el objetivo al modelar.</li>
<li><b>N:N:</b> no se pueden determinar valores únicos. Evitarla eliminando duplicados en el ETL.</li>
</ul>
<h4>Dirección de filtro</h4>
<p><b>Única:</b> el filtro va de la dimensión a los hechos, no al revés; usarla siempre que se pueda. En un copo, filtrar ProductSubcategory filtra hacia abajo (productos, ventas) pero no hacia arriba (categoría). <b>Ambas:</b> se propaga en los dos sentidos; evitarla por buenas prácticas.</p>
<p>Si una dimensión necesita filtrar a otra a través de los hechos, en vez de cambiar la relación del modelo se resuelve en la medida:</p>
<pre><code>Clientes con ventas =
CALCULATE (
    DISTINCTCOUNT ( DimCustomer[CustomerKey] ),
    CROSSFILTER ( FactInternetSales[ProductKey], DimProduct[ProductKey], BOTH )
)</code></pre>
`},
/* ---------- NamasData: II. Power Query ---------- */
{t:"transformar", s:N + " · II. Transformación", h:`
<p>Power Query está en Excel, Power BI Desktop, Power BI Service (dataflows), Power Automate y otras herramientas de Microsoft. Permite filtrar filas, eliminar columnas, combinar tablas, agregar columnas y cambiar tipos.</p>
<p><b>Interfaz en cinco zonas:</b> cinta superior (Inicio, Transformar, Agregar columna, Vista, Herramientas, Ayuda), panel de consultas a la izquierda, vista previa en el centro, configuración y pasos aplicados a la derecha y barra de estado inferior (tiempo, número de columnas y filas).</p>
<h4>Referenciar frente a duplicar</h4>
<ul>
<li><b>Referenciar:</b> nueva consulta que parte del resultado de otra; los cambios en la original se propagan.</li>
<li><b>Duplicar:</b> copia independiente con todos los pasos; más memoria, útil para transformar sin afectar a la original.</li>
</ul>
<h4>Analizar columnas</h4>
<ul>
<li>Perfil y distribución de columna: «un detective» que muestra anomalías al instante.</li>
<li><b>Redondear</b> lo más posible para reducir valores distintos.</li>
<li><b>Fechas sin hora:</b> no conservar horas, minutos y segundos si no hacen falta.</li>
<li><b>Extraer</b>: el texto ocupa más que los números.</li>
<li>Recortar y limpiar textos.</li>
</ul>
`},
{t:"combinar", s:N + " · II. Transformación", h:`
<h4>Tipos de combinación</h4>
<table class="dxtbl"><thead><tr><th>Tipo</th><th>Devuelve</th></tr></thead><tbody>
<tr><td>Externa izquierda</td><td>Todas las filas de la izquierda y las coincidentes de la derecha (null si no hay)</td></tr>
<tr><td>Externa derecha</td><td>Todas las de la derecha y las coincidentes de la izquierda</td></tr>
<tr><td>Externa completa</td><td>Todas las filas de ambas, con null donde no coinciden</td></tr>
<tr><td>Interna</td><td>Solo las filas con coincidencia en ambas</td></tr>
<tr><td>Anti izquierda</td><td>Filas de la izquierda sin coincidencia en la derecha</td></tr>
<tr><td>Anti derecha</td><td>Filas de la derecha sin coincidencia en la izquierda</td></tr>
</tbody></table>
<p><b>Anexar</b> apila filas de consultas con la misma estructura (vertical): «Anexar consultas» o «Anexar consultas para crear una nueva». <b>Combinar</b> añade columnas de una consulta relacionada (horizontal).</p>
<p><b>Filas huérfanas:</b> se encuentran con una combinación (anti izquierda) entre la tabla de hechos y la dimensión, creando una consulta nueva.</p>
`},
/* ---------- NamasData: III. Estructuración ---------- */
{t:"estrella", s:N + " · III. Estructuración", h:`
<h4>De tabla única a estrella</h4>
<ol>
<li>Crear un grupo de consultas <b>Dimensiones</b>.</li>
<li>Por cada dimensión: duplicar la tabla única, <b>elegir columnas</b>, <b>quitar duplicados</b> y renombrar (por ejemplo <code>DimChannel</code>).</li>
<li><b>Claves subrogadas numéricas</b>: ordenar ascendente y Agregar columna → Columna de índice → Desde 1 (imprescindible si la clave original es texto).</li>
<li><b>Combinar</b> cada dimensión con la tabla de hechos y expandir solo el índice subrogado.</li>
<li>Dejar en los hechos solo claves y campos numéricos; revisar tipos; crear un grupo <b>Hechos</b>.</li>
<li>Buena práctica: describir los pasos aplicados (se puede pasar el M a un asistente para que proponga nombres y descripciones).</li>
<li>Cerrar y aplicar. En el ejemplo el modelo se redujo casi a la mitad.</li>
</ol>
<h4>De copo de nieve a estrella</h4>
<p>Combinar las subdimensiones (subcategoría, categoría) en una sola dimensión por tipo, traer las columnas útiles, <b>deshabilitar la carga</b> de las tablas auxiliares (y agruparlas en su propio grupo) y cerrar y aplicar.</p>
`},
{t:"relaciones", s:N + " · III. Estructuración", h:`
<h4>Evitar relaciones 1:1</h4>
<p>Dos tablas de clientes con la misma clave crean una 1:1. Solución: eliminar la relación, en Power Query <b>Combinar consultas para crear una nueva</b> por ID de cliente, expandir y quedarse con las columnas necesarias: una única dimensión.</p>
<h4>Evitar relaciones N:N</h4>
<ol>
<li><b>Duplicados en el lado uno:</b> activar el perfil sobre todo el conjunto de datos; si Distintos (2517) ≠ Únicos (2507) hay duplicados. Quitar duplicados, cerrar y aplicar: la relación pasa a 1:N.</li>
<li><b>Nulos en la clave:</b> reemplazar valores.</li>
<li><b>Granularidad distinta</b> (presupuestos por año, mes y día con categorías repetidas): crear una <b>tabla puente</b> anexando las consultas en una nueva, quedarse con la columna Categoría, quitar duplicados y revisar espacios o saltos de línea que generan filas de más.</li>
</ol>
`},
{t:"calendario", s:N + " · III. Calendario en Power Query", h:`
<h4>Tabla de fechas dinámica</h4>
<ol>
<li><b>Fecha fin</b> dinámica (hoy o fin del año actual) y <b>fecha inicio</b> (puede ser un parámetro).</li>
<li>Consulta en blanco con la diferencia de días. Ojo con los años bisiestos: 2024 da 365 si no se suma 1 día.</li>
<li>Generar la lista de fechas (<code>List.Dates</code>), convertirla en tabla y tipar como fecha.</li>
<li>Agregar año, mes, nombre de mes (con cultura <code>"en-US"</code> para inglés), día de la semana (+1 para empezar en 1).</li>
<li><b>ID de fecha entero</b> para comprimir mejor: <code>Año * 10000 + Mes * 100 + Día</code>, tipo entero.</li>
<li>Fecha de hoy como número: redondear <b>a la baja</b> (al convertir a entero redondea y da el día equivocado).</li>
<li>Festivo o laborable, trimestre con prefijo «T» (texto), año, mes y día actuales.</li>
<li><b>Desvíos</b> (offsets) de año, mes, trimestre y día respecto a hoy para filtros relativos; semana ISO.</li>
</ol>
`},
/* ---------- NamasData: IV y V. DAX ---------- */
{t:"medidas", s:N + " · IV. DAX en el modelo", h:`
<p><b>Sintaxis:</b> nombre de la medida, <code>=</code>, función, argumentos y referencias a columnas con la tabla delante y la columna entre corchetes.</p>
<p>Con DAX se crean <b>tablas calculadas</b>, <b>columnas calculadas</b> (ambas se calculan al actualizar el modelo y ocupan memoria; muchas columnas calculadas ralentizan) y <b>medidas</b> (se calculan en memoria al consultar). Tipos de datos: entero, decimal, fecha y hora, booleano, texto y binario.</p>
<p><b>Buenas prácticas:</b> columnas siempre con su tabla, medidas sin tabla, textos entre comillas, saltos de línea y formato con <b>DAX Formatter</b>.</p>
<h4>Conteos</h4>
<table class="dxtbl"><thead><tr><th>Función</th><th>Qué cuenta</th></tr></thead><tbody>
<tr><td><code>COUNTROWS</code></td><td>Filas de una tabla</td></tr>
<tr><td><code>DISTINCTCOUNT</code></td><td>Valores distintos (incluye el blanco)</td></tr>
<tr><td><code>DISTINCTCOUNTNOBLANK</code></td><td>Valores distintos sin blanco</td></tr>
<tr><td><code>COUNTBLANK</code></td><td>Vacíos</td></tr>
<tr><td><code>COUNT</code> / <code>COUNTA</code></td><td>No blancos</td></tr>
</tbody></table>
<p>Agregados por varias columnas con iteradores; de tablas distintas con <code>RELATED</code>. Variables con <code>VAR</code>/<code>RETURN</code> y divisiones por cero con <code>DIVIDE</code>. También: ordenar una columna por otra y crear medidas base.</p>
`},
{t:"contextos", s:N + " · V. Filtrado", h:`
<p><b>Contexto de filtro</b>, por niveles: RLS, DAX y después segmentadores y visuales. <b>Contexto de fila</b>: solo existe en columnas calculadas y dentro de iteradores; no hay otra forma de crearlo. <b>Transición de contexto</b>: CALCULATE convierte el contexto de fila en contexto de filtro.</p>
<p><b>Evitar el filtro cruzado bidireccional</b> en el modelo por rendimiento: aplicarlo solo en la medida que lo necesita con <code>CALCULATE + CROSSFILTER</code>.</p>
`},
{t:"calculate", s:N + " · V. Filtrado", h:`
<ul>
<li><b>CALCULATE</b>, el director de orquesta: neutraliza los filtros externos de la columna (los de la matriz) y añade los suyos.</li>
<li><b>FILTER</b>: genera una tabla virtual; filtra la fila del producto y deja en blanco el resto. Usarlo con precaución.</li>
<li>Filtrar por dos columnas («Azul» y «Normal») con varios argumentos o <code>&amp;&amp;</code>; para OR, <code>||</code>.</li>
<li><b>ALL</b> devuelve todas las filas o valores ignorando filtros; <b>ALLEXCEPT</b> todas las columnas salvo las indicadas; <b>ALLSELECTED</b> el total de la selección, útil para el % sobre lo seleccionado.</li>
<li><b>VALUES</b> muestra la fila en blanco si hay filas huérfanas (venta de un producto que no está en DimProduct); <b>DISTINCT</b> no; <b>ALL</b> devuelve todos más el blanco (2518).</li>
<li><b>Tablas no relacionadas:</b> <code>CALCULATE([Ventas], TREATAS(VALUES(Tabla[Tipo]), Ventas[Tipo]))</code>; los valores deben coincidir.</li>
<li><b>Relación inactiva:</b> <code>CALCULATE([Ventas], USERELATIONSHIP(...))</code>.</li>
<li>Comparar periodos con <code>SAMEPERIODLASTYEAR</code> y <code>DATEADD</code>.</li>
</ul>
`},
/* ---------- Salvador Ramos: Modelado en estrella ---------- */
{t:"estrella", s:SR, h:`
<h4>Proceso de modelado</h4>
<ol>
<li><b>Elegir el proceso de negocio</b>: ventas, compras, finanzas, stocks…</li>
<li><b>Batería de preguntas</b> de cada persona de cada departamento.</li>
<li>Dónde está la <b>historia de lo ocurrido</b> y con qué detalle (ahí están los indicadores).</li>
<li>Desde qué <b>puntos de vista</b> se analiza (las columnas de texto por las que se segmenta).</li>
</ol>
<p>Ejemplo ventas: analizar cada venta al máximo detalle; puntos de vista Cliente, Fecha, Tienda, Producto y Empleado (¿a quién, cuándo, dónde, qué y quién?). Qué medir: PVP, importe, descuento, coste, beneficio. Hechos ocurridos → <b>una tabla de hechos</b>; cada punto de vista → <b>una tabla de dimensión</b>.</p>
<p><b>Ejemplo real:</b> procesos de ventas y compras con 7 dimensiones.</p>
<h4>Bus dimensional</h4>
<p>Matriz con las tablas de hechos en filas y las dimensiones en columnas, marcando qué dimensión usa cada hecho. Imprescindible con muchas estrellas; en la vista de modelo de Power BI, <b>una pestaña de diagrama por estrella</b> para quitar ruido.</p>
<h4>Tablas de hechos</h4>
<ul>
<li>Representan procesos o subprocesos (ventas: oportunidades, pedidos, albaranes, facturas, presupuestos) y guardan la historia: ventas, compras, envíos, incidencias, llamadas, asistencia, apuntes contables.</li>
<li><b>Estrechas</b> (pocas columnas, casi todas numéricas) y con <b>muchas filas</b> (cientos de miles o millones por periodo, crecimiento periódico).</li>
<li>Columnas: identificadores opcionales (Ticket, Línea), <b>claves externas</b> hacia la clave principal de cada dimensión, <b>medidas</b> (cantidad, importe coste, importe venta, beneficio) y <b>metadatos y linaje</b> (fichero de origen, fecha de carga).</li>
<li><b>Granularidad</b>: el mayor nivel de detalle; la característica más importante de una tabla de hechos.</li>
<li><b>Agregaciones</b>: hoy se calculan al vuelo desde el detalle, no se almacenan.</li>
<li>Cada subproceso en su propia tabla de hechos (suelen tener granularidad distinta): ventas, una fila por línea de ticket; presupuesto, una por tienda y mes.</li>
</ul>
<h4>Dimensiones</h4>
<ul>
<li>Ponen en contexto los hechos: tienda, producto, fecha, cliente, proveedor, empleado, geografía, cuenta contable, almacén, máquina. <b>Se comparten</b> entre procesos.</li>
<li><b>Anchas</b> (muchas columnas descriptivas de texto) y con <b>pocas filas</b> (decenas a miles, crecimiento lento).</li>
<li>Columnas: <b>clave principal</b> (define la granularidad) y <b>atributos</b> para describir, filtrar y agrupar.</li>
<li><b>Jerarquías</b>: atributos de la misma dimensión organizados en niveles para drill up y drill down; puede haber varias por dimensión.</li>
</ul>
<h4>Pasos</h4>
<ol>
<li>Hechos: granularidad, claves externas y medidas.</li>
<li>Dimensiones: clave principal, atributos y jerarquías.</li>
<li>Validar relaciones: mismo tipo de datos y mismos valores.</li>
</ol>
<p>Antes de construirlo, dibujar el modelo en PowerPoint o documentarlo en Excel.</p>
`},
/* ---------- Masterclass Modelado Estratégico ---------- */
{t:"estrella", s:ME, h:`
<p>Masterclass con tres casos reales (la mayor parte del material son capturas):</p>
<ul>
<li><b>Ventas:</b> requisitos, preguntas y <b>bus dimensional</b> para ver cómo se conectan dimensiones y hechos.</li>
<li><b>Logística:</b> constelación con muchas tablas de hechos que comparten dimensiones y convergen en la tabla <b>Fecha</b>.</li>
<li><b>Inventario de farmacia:</b> modelo de stock.</li>
</ul>
<h4>Capas de un proyecto</h4>
<ul>
<li><b>Capa 1, diseño:</b> estructura (toma de requisitos, preguntas de negocio, modelado, definición de tablas, relaciones e indicadores) y diseño interior y exterior del informe.</li>
<li><b>Capa 2, base de datos.</b></li>
<li><b>Método B17</b> de diseño de informes (presentado con capturas).</li>
</ul>
`}
);
EXAM.push(
{k:"Modelado", t:"estrella", s:SR, q:"¿Qué es el bus dimensional y para qué sirve?", a:"Una matriz con las tablas de hechos en filas y las dimensiones en columnas que muestra qué dimensiones comparte cada proceso. Sirve para planificar modelos con varias estrellas (constelación)."},
{k:"Modelado", t:"estrella", s:SR, q:"Tienes ventas por línea de ticket y presupuesto por tienda y mes. ¿Una o dos tablas de hechos?", a:"Dos: cada subproceso con granularidad distinta va en su propia tabla de hechos, relacionadas con las dimensiones compartidas."},
{k:"Modelado", t:"relaciones", s:N, q:"Al crear una relación Power BI propone N:N. El perfil (todo el conjunto) muestra Distintos 2517 y Únicos 2507. ¿Qué pasa?", a:"Hay valores duplicados en el lado que debería ser uno. Quitar duplicados en Power Query para que la relación sea 1:N."},
{k:"Modelado", t:"calendario", s:N, q:"¿Cómo creas un ID de fecha entero en el calendario?", a:"Año * 10000 + Mes * 100 + Día, con tipo número entero."}
);
})();
