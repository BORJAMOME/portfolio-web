/* Libro «Modelado de datos en Power BI: con Power Query y DAX» · Javier Sánchez Rivero. 8 capítulos. */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var S = "Libro Modelado de datos en Power BI · Javier Sánchez Rivero";
NOTES.push(
{t:"transformar", s:S + " · Introducción a Power Query", h:`
<p>Power Query está en Power BI, Excel, Power Automate, Power Apps y otras aplicaciones de Microsoft. En Desktop se abre con Transformar datos; en Service, creando un <b>flujo de datos</b> &gt; Agregar nuevas tablas.</p>
<h4>Interfaz (cinco zonas)</h4>
<ul>
<li><b>Cinta de opciones:</b> Inicio (conectar, quitar filas, ordenar, filtrar, combinar, anexar), Transformar (tipos, dividir, operaciones), Agregar columna, Vista y Herramientas de consulta (contextual).</li>
<li><b>Panel de consultas:</b> lista y gestión de consultas (agrupar en carpetas y añadir descripciones a los pasos es buena práctica).</li>
<li><b>Vista actual:</b> vista previa de datos, <b>vista de diagrama</b> (dependencias entre consultas) y <b>vista de esquema</b> (columnas y tipos sin datos).</li>
<li><b>Configuración de la consulta:</b> nombre, pasos aplicados e <b>indicador de plegado</b> (en Power Query online). En Desktop se comprueba con clic derecho en un paso &gt; Ver consulta nativa: si está deshabilitado, el plegado se ha roto o el origen no lo admite (archivos planos).</li>
<li><b>Barra de estado:</b> información de la consulta y si el perfil se calcula sobre las primeras 1.000 filas o sobre todo el conjunto.</li>
</ul>
`},
{t:"perfilado", s:S + " · Introducción a Power Query", h:`
<p><b>Calidad de la columna (colores):</b> verde = calidad adecuada; rojo = errores; gris oscuro = vacíos; verde y blanco (discontinuo) = calidad desconocida porque hay errores; rojo y blanco = se perdió la conexión con el origen o se referencia una columna inexistente.</p>
<p><b>Distribución:</b> detectar valores únicos o repetidos, verificar categorías y evaluar numéricos. IDCliente con 20 distintos y 20 únicos es lo esperado en una clave del lado uno. IDPaís con solo 2 únicos puede indicar mala calidad (o dos países con un solo cliente). Columnas como FechaAltaCliente en dimensiones tienen alta cardinalidad: si son necesarias, agrupar en rangos; si no aportan, eliminarlas.</p>
`},
{t:"vertipaq", s:S + " · Introducción a Power Query", h:`
<h4>Tipos de datos en Power Query</h4>
<p>Número decimal (hasta 15 dígitos), número decimal fijo (4 decimales, para moneda), número entero, porcentaje, fecha/hora, fecha, hora, fecha/hora/zona horaria, duración, texto, verdadero/falso y binario (imágenes o archivos).</p>
<p><b>Fecha frente a fecha y hora:</b> las fechas se almacenan como enteros (eficiente); fecha+hora como decimales, con más cardinalidad y peor compresión. Usar fechas puras salvo que el análisis necesite la hora.</p>
<p><b>Redondeo:</b> muchos decimales = más espacio y más valores únicos = menos compresión. Redondear o escalar a enteros (12,34 → 1234); mejor aún, reducir decimales en el origen.</p>
`},
{t:"transformar", s:S + " · Columnas de texto", h:`
<p><b>Extraer</b> (sin código): longitud, primeros o últimos caracteres, rango, texto antes, después o entre delimitadores; se aplica sobre la columna o creando una nueva.</p>
<p><b>Recortar:</b> elimina espacios al inicio y al final y reduce los espacios múltiples entre palabras a uno. <b>Limpiar:</b> elimina caracteres no imprimibles (saltos de línea, tabulaciones, caracteres de control) que no se ven pero rompen comparaciones.</p>
<p>Consejo del libro: a todo campo de texto, aplicarle una limpieza extra (Recortar y Limpiar) antes de quitar duplicados; en el ejemplo, «Cámaras y videograbadoras» aparecía duplicada por un carácter invisible.</p>
`},
{t:"estrella", s:S + " · Los pilares del modelado de datos", h:`
<p>El modelo tabular es una base de datos de Analysis Services en memoria (VertiPaq) o en DirectQuery, con compresión y consultas en paralelo. Se puede consumir desde Excel (Obtener datos &gt; Power BI / Analysis Services) y desde Power BI Desktop.</p>
<p><b>Dimensiones:</b> contexto (producto, tiempo, geografía, cliente); sin duplicados; anchas y cortas; se recomienda una <b>clave subrogada entera</b> (más eficiente para VertiPaq). <b>Hechos:</b> datos cuantitativos, estrechos y largos, relacionados por claves subrogadas: el núcleo del modelo.</p>
<p><b>Granularidad</b> = resolución de la imagen: más detalle, más tamaño; menos, más simple pero menos información (ventas diarias frente a mensuales). Ajustarla al análisis previsto.</p>
<h4>Esquemas</h4>
<ul>
<li><b>Tabla única:</b> ineficiente en rendimiento, tamaño y gestión aunque se depure. Ejemplo: una tabla plana de Excel de 3.194 KB queda en 696 KB en el PBIX y sigue siendo peor que un modelo estructurado.</li>
<li><b>Copo de nieve:</b> dimensiones descompuestas en subdimensiones; algunas no tocan los hechos. Organiza y reduce redundancia, pero complica las relaciones.</li>
<li><b>Estrella:</b> hechos en el centro y dimensiones conectadas directamente. Acceso rápido, rendimiento, relaciones intuitivas y simplicidad; maximiza la inteligencia de tiempo y el análisis multidimensional. Categoría y subcategoría son atributos del producto: se integran en la dimensión Producto.</li>
</ul>
<h4>Proceso de tabla plana a modelo</h4>
<ol>
<li>Sobre la tabla original (solo encabezados promovidos y tipos), duplicar o referenciar una vez por dimensión.</li>
<li>Elegir columnas de la dimensión y quitar duplicados.</li>
<li>Crear un <b>índice numérico</b> como clave subrogada (por ejemplo IndChannel): aunque ChannelLabel sea único hoy, la clave debe ser controlada, numérica y estable.</li>
<li>Combinar la tabla de hechos con cada dimensión para traer los índices y eliminar de los hechos las columnas descriptivas. El modelo se reduce considerablemente.</li>
</ol>
`},
{t:"relaciones", s:S + " · Pilares y diseño del modelo tabular", h:`
<p><b>Reglas para relacionar:</b> mismo tipo de dato en ambos lados (no número con texto); se puede relacionar un número con una fecha (la fecha es un entero); los nombres de columna pueden diferir.</p>
<p><b>Cardinalidades:</b> 1:N/N:1 (la normal); N:N (resultados inesperados, consultas complejas, peor rendimiento); 1:1 (redundancia e ineficiencia: fusionar ambas tablas en Power Query con una combinación externa izquierda).</p>
<p><b>Dirección:</b> unidireccional de dimensión a hechos; la bidireccional puede dar resultados inesperados: mejor <code>CROSSFILTER</code> en la medida concreta.</p>
<h4>Relaciones tóxicas: N:N</h4>
<p>Si Power BI propone varios a varios con filtro en ambas direcciones, normalmente la clave de la dimensión no es única:</p>
<ol>
<li>Comprobar la unicidad de la clave (por ejemplo ProductKey) con el perfil sobre <b>todo el conjunto</b>: con 1.000 filas parecía único; con todo, 2.517 distintos y 2.507 únicos = 10 duplicados (se ven con Conservar duplicados).</li>
<li>Si no aparece «Quitar duplicados» en el menú de la tabla, hay alguna columna sin tipo definido: tipificarla (en el ejemplo, una fecha) y ya aparece.</li>
<li>Otro caso: DimChannel con 4 distintos y 4 únicos pero un 25 % vacío: el null rompe la unicidad; reemplazarlo por una clave que no exista (4).</li>
</ol>
<p><b>Presupuesto por mes y categoría</b> frente a DimProduct por producto: N:N legítima. Solución: <b>tabla puente</b> con los valores únicos de la clave compartida (duplicar DimProduct, quedarse con Categoría, quitar duplicados), relaciones 1:N hacia la dimensión y hacia los hechos; para que DimProduct filtre los presupuestos, mejor CROSSFILTER en la medida que poner la relación en ambas direcciones.</p>
<p>Si el presupuesto trae categorías que aún no existen en DimProduct (nueva línea de productos), construir la tabla puente <b>anexando</b> Presupuestos y DimProduct, limpiar (Recortar) y quitar duplicados.</p>
<h4>Filas huérfanas</h4>
<p>Registros de hechos sin coincidencia en la dimensión: aparecen como «(En blanco)», distorsionan resultados y ocultan errores de carga. Causas: registros borrados en la dimensión, errores de carga, nuevos valores en hechos, datos incompletos.</p>
<ol>
<li>Detectarlas: referenciar DimProduct, quedarse con ProductKey y combinar con FactOnlineSales con <b>anti derecha</b> (filas de hechos sin coincidencia). En el ejemplo, ~1.600 registros con ProductKey 9 y 10.</li>
<li>Solucionar: añadir a la dimensión un miembro «desconocido» por cada clave huérfana (anexar, quitar duplicados, concatenar clave y nombre para identificarlos y renombrar para mantener el linaje).</li>
<li>Filtrar el blanco en el panel de filtros solo lo esconde: se pierden esas ventas.</li>
</ol>
`},
{t:"calendario", s:S + " · Diseño del modelo tabular", h:`
<p><b>Tabla calendario:</b> todas las fechas seguidas sin huecos, de la primera a la última fecha de los datos (y años futuros para previsiones), columna principal única, a veces con una clave entera (20230924). Se puede crear una vez y reutilizar en varios informes (por ejemplo, como flujo de datos en Service).</p>
<p><b>Inteligencia de tiempo automática:</b> crea una tabla de fechas oculta por cada columna de fecha; aumenta el tamaño, alarga la actualización y no es flexible (años fiscales, semanas ISO, festivos). Mejor desactivarla (Opciones &gt; Archivo actual &gt; Carga de datos &gt; Fecha y hora automáticas; afecta al archivo abierto) y usar una tabla calendario propia referenciada por todas las fechas.</p>
<p>En DAX: CALENDARAUTO, CALENDAR (fijo o dinámico respecto a TODAY o a las fechas de los hechos) y ADDCOLUMNS para añadir año, mes, nombre de mes, trimestre, etc.</p>
`},
{t:"plana", s:S + " · Consultas: buenas prácticas", h:`
<ul>
<li><b>Referenciar:</b> nueva consulta que hereda los pasos de la original y sus cambios futuros (dependencia). Para subconsultas o agregaciones derivadas sin tocar la original. La vista de dependencias muestra qué consulta referencia a cuál.</li>
<li><b>Duplicar:</b> copia independiente en el mismo archivo; consume más recursos.</li>
<li><b>Copiar:</b> copia independiente que se puede pegar incluso en otro archivo; ideal para trasladar lógicas de transformación.</li>
</ul>
`},
{t:"combinar", s:S + " · Consultas: buenas prácticas", h:`
<p><b>Combinar</b> (joins) relaciona dos tablas por columnas clave. Tipos: externa izquierda (todas las de la izquierda y coincidencias; útil para conservar la tabla principal), externa derecha, externa completa (todo, con nulos), interna (solo coincidencias), anti izquierda (solo las de la izquierda sin coincidencia: exclusiones) y anti derecha (solo las de la derecha sin coincidencia).</p>
<p><b>Anexar</b> combina en vertical tablas con la misma estructura (ventas de distintos meses): Inicio &gt; Combinar &gt; Anexar consultas.</p>
<p><b>Normalización de fechas:</b> fechas con formatos distintos (31/12/2025 o 12/31/2025) y separadores distintos (/ o -) generan errores: verificar y estandarizar en Power Query (configuración regional, dividir y recomponer) antes de cargar.</p>
`},
{t:"obtener", s:S + " · Consultas: parámetros", h:`
<p>Los parámetros son «variables globales» de Power Query: rutas de archivo, servidor y base de datos, filtros de fechas o productos, personalización de informes.</p>
<p>Si cambia la ruta del Excel, la consulta falla; se puede corregir en el paso Origen, pero lo correcto es un <b>parámetro</b> de ruta.</p>
<p>Campos al crear un parámetro: <b>Nombre</b>, <b>Descripción</b> (dentro de un año no recordarás para qué era), <b>Requerido</b>, <b>Tipo</b> (configurarlo siempre), <b>Valores sugeridos</b> (cualquier valor, lista de valores con valor predeterminado, o consulta de lista) y <b>Valor actual</b> (el que se usa en las transformaciones).</p>
<p>Uso típico: parámetros Servidor y BDD seleccionados en el conector de SQL Server en lugar de escribir los nombres.</p>
`},
{t:"medidas", s:S + " · Introducción a DAX", h:`
<p><b>Sintaxis:</b> nombre de la medida, operador = (o := por compatibilidad con Visual Studio), función (SUM), tabla y columna (<code>FactOnlineSales[SalesAmount]</code>).</p>
<p><b>Qué se crea con DAX:</b> tablas calculadas, columnas calculadas y métricas.</p>
<ul>
<li><b>Tablas calculadas</b> (escribiendo el código o por referencia: <code>Tabla Referenciada = DimProduct</code>): útiles para dimensiones con juego de roles (Kimball), pero no conservan formatos y se calculan cuando ya se han cargado todas las tablas, alargando la actualización. Mejor en el origen o el ETL.</li>
<li><b>Columnas calculadas:</b> se calculan durante el procesamiento, ocupan memoria y comprimen peor; con 100 millones de filas pueden disparar la carga (límite aproximado de 2 horas en capacidad estándar). Usarlas solo para simplificar medidas complejas, precálculos que no dependen de filtros o agrupar y filtrar cuando no se pueda antes.</li>
<li><b>Métricas:</b> se evalúan al consultar según el contexto de filtro; no ocupan espacio pero consumen CPU si son complejas o anidadas.</li>
</ul>
<p><b>Orden recomendado para una columna calculada:</b> 1) en el origen de datos; 2) en Power Query; 3) en DAX como última opción.</p>
<p><b>Tipos en DAX:</b> entero (ideal para claves e IDs), decimal y moneda (limitar precisión en el ETL), fecha y hora (separarlas si no hace falta la hora), booleano, texto y binario (imágenes, no operable). VAR/RETURN para resultados intermedios.</p>
<h4>Buenas prácticas</h4>
<ul>
<li>Columnas siempre como <code>Tabla[Columna]</code> (FactSales[Precio] frente a DimProduct[Precio]); tablas con espacios entre comillas simples; nombres de tabla únicos.</li>
<li>Medidas sin prefijo de tabla (aparecen en lila; las funciones en azul).</li>
<li>Texto entre comillas; números sin ellas. Comentarios con // o /* */. Mayús+Intro para saltos de línea y DAX Formatter (SQLBI) para formatear.</li>
<li>Variables para eficiencia y claridad. RELATED para usar columnas de otra tabla en un iterador. DIVIDE para evitar errores de división por cero.</li>
</ul>
`},
{t:"contextos", s:S + " · Contextos en DAX", h:`
<p>Tres contextos: de fila, de filtro y <b>visual</b>.</p>
<p><b>Contexto de filtro:</b> las reglas que dicen a DAX qué mirar (visuales, segmentadores, panel de filtros y también la RLS). Sin contexto, DAX mira todo.</p>
<p><b>Contexto de fila:</b> evaluar la fórmula para una fila concreta. Las columnas calculadas lo tienen automáticamente; las medidas no (por eso una medida no puede referenciar una columna suelta). Los iteradores (sufijo X) recorren fila a fila y combinan resultados.</p>
<p><b>Coexistencia:</b> fila y filtro influyen a la vez sin transición. <b>Transición:</b> pasar de mirar una fila a mirar la tabla filtrada por esa fila, normalmente con CALCULATE.</p>
<p><b>Ejemplo de almacenes:</b> contar almacenes con más empleados que la media. Si AVERAGE se evalúa dentro del iterador con transición de contexto, cada fila compara consigo misma y devuelve blanco; sin transición, AVERAGE se calcula en el contexto global (78 almacenes por encima de la media). Llamar a una medida dentro de otra provoca un <b>CALCULATE implícito</b>; usar &gt;= en lugar de &gt; muestra el efecto. Solución limpia: calcular la media en una variable antes de iterar.</p>
<p><b>Contexto visual</b> (febrero de 2024): los <b>cálculos visuales</b> solo ven lo que hay en el visual, como sumar celdas en Excel (Ventas − Coste fabricación − Coste publicidad = Margen); los totales siempre cuadran con lo mostrado; tienen un icono distinto y las medidas usadas pueden ocultarse del visual. Complementan, no sustituyen, los contextos de fila y filtro.</p>
`},
{t:"calculate", s:S + " · Contextos en DAX", h:`
<h4>Bidireccional: un enemigo a evitar</h4>
<p>Pregunta: ¿en qué canales se han vendido los colores? Con relaciones unidireccionales, todos los canales salen con 4 colores (incorrecto) porque el filtro no viaja de hechos a Producto. Poner la relación en ambas direcciones lo arregla pero es mala práctica: mejor <code>CALCULATE([Medida], CROSSFILTER(FactSales[ProductKey], DimProduct[ProductKey], BOTH))</code>.</p>
<h4>Reducir filas: CALCULATE, FILTER y KEEPFILTERS</h4>
<p>Un filtro de CALCULATE sobre ColorName <b>reemplaza</b> el filtro externo de esa columna (al filtrar por color, la medida sigue mostrando su color). FILTER no altera el contexto: respeta el filtro externo. Para que CALCULATE no sobrescriba sino que combine, usar <b>KEEPFILTERS</b>. La elección depende de la pregunta de negocio.</p>
<h4>ALL y porcentajes</h4>
<p><code>COUNTROWS(ALL(DimProduct))</code> devuelve 2.517 (todas las filas); <code>ALL(DimProduct[Columna])</code> devuelve solo los valores distintos de esa columna (2.493); también admite varias columnas. Porcentaje de ventas por color: <code>DIVIDE([Ventas], CALCULATE([Ventas], ALL(DimProduct[ColorName])))</code>.</p>
<p><b>Filas huérfanas y funciones:</b> el segmentador muestra «(En blanco)» porque el motor añade la fila en blanco para mantener la integridad referencial; VALUES y ALL la cuentan; DISTINCT no.</p>
<h4>Tablas no relacionadas: TREATAS y USERELATIONSHIP</h4>
<p>Con una tabla desconectada, el visual repite el mismo total en cada fila. <b>TREATAS</b> crea una relación virtual solo en el cálculo (desventajas: difícil de interpretar y menos eficiente en modelos grandes):</p>
<pre><code>Ventas por entrega =
CALCULATE (
    SUM ( Ventas[Importe] ),
    TREATAS ( VALUES ( Calendario[Date] ), Ventas[FechaEntrega] )
)

Ventas por fecha de envío =
CALCULATE (
    SUM ( Ventas[Importe] ),
    USERELATIONSHIP ( Ventas[ShipDate], Calendario[Date] )
)</code></pre>
<p>USERELATIONSHIP activa temporalmente una relación inactiva (dimensión con juego de roles: fecha de pedido, envío, entrega).</p>
`},
{t:"vertipaq", s:S + " · Optimización del modelo tabular", h:`
<h4>Analizador de rendimiento</h4>
<p>Registra el tiempo de cada visual tras una interacción y lo desglosa en <b>consulta DAX</b> (enviar y obtener del modelo), <b>presentación visual</b> (dibujar, incluidas imágenes o mapas) y <b>otros</b> (preparar consultas, esperar a otros visuales). Se puede ordenar por duración, copiar la consulta (que no es la medida, sino la consulta generada con SUMMARIZECOLUMNS, filtros e IGNORE) y exportar a JSON. Ejemplo: «Crecimiento no optimizado» tardaba casi el doble que el optimizado.</p>
<h4>DAX Studio</h4>
<p>Explorar y ejecutar consultas DAX, medir rendimiento, cargar el JSON del analizador de rendimiento y ver Server Timings.</p>
<h4>Menos es más: eliminar columnas</h4>
<p>Solo las columnas necesarias: mejor compresión, carga más rápida, mantenimiento más fácil. <b>Bravo</b> (SQLBI) muestra tamaño del modelo (en el ejemplo 237,30 MB), columnas totales (149) y no referenciadas (133), y por columna su cardinalidad, tamaño y peso (OnlineSalesKey: 12,63 M valores únicos, 80,26 MB, 34 % del modelo). Cuidado: una columna usada solo como segmentador puede figurar como no referenciada. Bravo también gestiona medidas, se integra con DAX Studio, crea calendarios y exporta datos.</p>
<h4>Motores y CallbackDataID</h4>
<p>El <b>Formula Engine</b> interpreta DAX/MDX y genera el plan (uniones, filtros, agregaciones), en un solo hilo y sin reutilizar resultados. El <b>Storage Engine</b> devuelve datos en cachés: VertiPaq (memoria comprimida), DirectQuery (origen en tiempo real) o Dual; admite paralelismo y agregaciones.</p>
<p><b>CallbackDataID:</b> el SE no puede resolver algo y llama al FE fila a fila (iteradores como SUMX, FILTER, RANKX, dependencias de columnas calculadas, RELATEDTABLE). No se cachea: «semáforos en una autopista». Optimizando la medida del ejemplo se pasó de 13 ms a 4 ms y desapareció el CallbackDataID. Reducir columnas calculadas, preferir agregaciones simples y descomponer cálculos complejos.</p>
`}
);
})();
