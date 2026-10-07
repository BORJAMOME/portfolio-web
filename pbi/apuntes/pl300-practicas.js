/* PL-300 · páginas de práctica: perfilado y limpieza, granularidad (ejercicio DataGlobal),
   bonus de conexión a Excel y carpetas, propiedades del modelo (clase 8, 4º trimestre 2023)
   y temas recurrentes según testimonios de estudiantes. */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var A = "PL-300 · Evaluar datos: estadísticas y propiedades de columna";
var B = "PL-300 · Mejora del rendimiento al reducir la granularidad";
var C = "PL-300 · Bonus: conexión a ficheros Excel y carpetas";
var D = "PL-300 · Clase 8 (4º trimestre 2023): propiedades del modelo";
NOTES.push(
{t:"perfilado", s:A, h:`
<h4>CDP: Calidad, Distribución y Perfil</h4>
<ul>
<li><b>Calidad de columnas:</b> para <i>todas</i> las columnas, porcentaje de válidos, erróneos y vacíos. Es el semáforo de la columna y la forma más rápida de detectar errores.</li>
<li><b>Distribución de columnas:</b> recuento de distintos y únicos con un mini histograma. Las entradas superior e inferior de la distribución identifican valores atípicos (el que más y el que menos se repite). Sirve para detectar situaciones anómalas, como un valor que se repite muy por encima del resto.</li>
<li><b>Perfil de columna:</b> en el pie; estadísticas (mín., máx., media, vacíos, distintos…) y distribución de valores. Permite profundizar en el error aplicando filtros. En el perfil también se ven los errores, pero hay que ir seleccionándolos uno a uno.</li>
</ul>
<p><b>Distintos vs únicos:</b> en Canal, Tienda, Online, Catálogo con Online y Catálogo una sola vez, hay 4 distintos y 2 únicos.</p>
<p><b>Agrupar en la distribución (tres puntos):</b> depende del tipo. Texto: por longitud, primera letra, etc. Fecha: por día de la semana, mes, año… (útil para ver qué día se vende más). Número: por <b>paridad</b> (par/impar) o por <b>signo</b> (positivo/negativo).</p>
<h4>Vista previa de datos</h4>
<ul>
<li><b>Monoespaciada:</b> todos los caracteres con la misma anchura (detectar longitudes distintas).</li>
<li><b>Mostrar espacio en blanco:</b> muestra espacios, saltos de línea y espacios delante o detrás del texto.</li>
</ul>
<p>En columnas de fecha, numéricas o de tipo indeterminado no se pueden hacer ciertas transformaciones de texto (quitar duplicados desde el menú de texto, dividir columnas, formato…): solo en <b>columnas de texto</b>. Transformaciones de texto: minúsculas, mayúsculas, mayúscula en cada palabra, <b>Recortar</b> (espacios delante y detrás), <b>Limpiar</b> (caracteres no imprimibles como saltos de línea), agregar prefijo y sufijo. El reemplazo en texto puede ser parcial; en números no.</p>
<h4>Caso: «Cell phones» aparece arriba y abajo del ranking</h4>
<ol>
<li>Duplicar la consulta.</li>
<li>Quedarse solo con la columna Subcategoría.</li>
<li>Quitar duplicados y ordenar alfabéticamente: aparecen dos «Cell phones».</li>
<li>Comprobar que no son iguales: Agregar columna &gt; Extraer &gt; Longitud.</li>
<li>Activar <i>Mostrar espacio en blanco</i>: hay un salto de línea.</li>
<li>Transformar &gt; Formato &gt; <b>Limpiar</b> (y Recortar si hay espacios).</li>
<li>Quitar duplicados de nuevo para verificar.</li>
</ol>
<h4>Perfilado de datos</h4>
<p>Analizar una fuente para comprender su contenido, estructura y calidad: valores nulos, inconsistencias, duplicados o datos fuera de rango, y la distribución de los datos.</p>
<p><b>Power Query perfila por defecto las primeras 1.000 filas</b> por rendimiento. Para perfilar todo: barra de estado &gt; <i>Generación de perfiles de columna en función del conjunto de datos completo</i>. Por eso a veces la carga da errores que no se ven en la vista previa: Power BI genera una consulta «Errores» y el error está más allá de la fila 1.000.</p>
<p><b>Técnica para localizar errores:</b> duplicar la tabla, crear una muestra, añadir una columna de control con <code>try</code> (devuelve un registro con HasError y Error), modificarla para que devuelva texto con el tipo de error o el valor, y filtrar. Una vez detectado, corregir en el <b>origen</b>; si no se puede, en Power Query.</p>
<p><b>Opciones sobre errores y filas:</b> conservar errores, quitar duplicados, quitar vacíos, quitar errores y reemplazar errores por un valor.</p>
<h4>Trampas al conectar Excel</h4>
<ul>
<li>Mejor conectar a una <b>tabla</b> que a una hoja: así no entran celdas fuera del rango de análisis.</li>
<li>Eliminar los registros que no valen (cabeceras, totales), subir la primera fila a encabezado (o bajar el encabezado a primera fila) desde Transformar.</li>
<li><b>Tipificar siempre.</b> Si una fecha da problemas: pasarla a texto, corregir los valores erróneos y después volver a fecha.</li>
</ul>
`},
{t:"perfilado", s:B, h:`
<h4>Localizar errores fila a fila (ejercicio DataGlobal Solutions)</h4>
<ol>
<li>Pulsar <b>Ver errores</b>: se crea un grupo con las consultas de errores. En la vista de tabla, los errores aparecen en blanco.</li>
<li>Ir a la consulta que genera el error (Ventas), quitar las demás columnas y dejar solo la errónea.</li>
<li>Agregar una <b>columna de índice</b> para identificar la fila.</li>
<li>Insertar un paso después del índice con una columna de control:</li>
</ol>
<pre><code>= Table.AddColumn(#"Índice agregado", "Control de errores", each try [IdTienda])</code></pre>
<p>Cada fila devuelve un <i>Record</i>; al expandirlo aparecen HasError, Value y Error, y dentro de Error el motivo (Reason, Message, Detail). Con el índice localizas la fila y la corriges en el Excel de origen.</p>
<p>Otro error típico: fechas con «00:00:00,000» pegado. Se copia ese texto y se usa <b>Reemplazar valores</b> para quitarlo. Para tipificar todas las columnas de una vez: seleccionarlas y Transformar &gt; <b>Detectar tipo de datos</b>.</p>
`},
{t:"obtener", s:B, h:`
<h4>Carpeta con 4 CSV (2019 a 2022) preparada para 2023 y 2024</h4>
<p>Conectar a la carpeta, comprobar que todos los archivos tienen el mismo formato, quedarse con la columna <b>Content</b> y pulsar el botón de combinar (esquina superior derecha) para unirlos en una consulta. Los archivos nuevos que se dejen en la carpeta entrarán al actualizar.</p>
<h4>Excel que crece en número de hojas (Enero, Febrero, Marzo…)</h4>
<ol>
<li>Al conectar, en el navegador hacer clic derecho sobre el <b>archivo</b> (no sobre una hoja) &gt; Transformar datos: aparece la tabla con todas las hojas.</li>
<li>Seleccionar la columna <b>Data</b> y Quitar otras columnas; expandirla (desmarcar «Usar el nombre de columna original como prefijo»).</li>
<li>Cada hoja trae su propio encabezado (Column1, Column2…): Transformar &gt; Usar primera fila como encabezado y filtrar las filas de encabezado repetidas (en Budget solo deben quedar números).</li>
<li>Poner el tipo numérico. Al añadir hojas, basta con <b>Actualizar vista previa</b>.</li>
</ol>
`},
{t:"relaciones", s:B, h:`
<h4>Granularidad distinta entre Ventas y Presupuesto</h4>
<p>Las ventas están a nivel de <b>producto</b> y tienda; el presupuesto, a nivel de <b>categoría</b> y <b>país</b>. Relacionar Presupuesto[Categoría] con Producto[Categoría] crea una relación <b>varios a varios</b> y, al analizar por producto, el presupuesto repite el total de su categoría en cada producto: no se puede comparar por producto. O se define un <b>criterio de reparto</b> del presupuesto por producto, o el análisis se hace a nivel de categoría. Con tiendas y país pasa lo mismo y Power BI avisa de ambigüedad.</p>
<p><b>Solución: tablas puente</b> (Categorías entre Producto y Presupuesto; Países entre Tienda y Presupuesto).</p>
<ul>
<li>En Power Query: duplicar Producto y Tienda, dejar solo la columna (País), quitar duplicados, <b>anexar</b> (los encabezados deben llamarse igual o se generan errores/columnas nuevas) y volver a quitar duplicados.</li>
<li>Así se filtra bien, pero se pierde la geografía de Tienda (continente, provincia, ciudad). Se categorizan esas columnas y se crea una <b>jerarquía</b> Geografía (clic derecho en Continente &gt; Crear jerarquía), ocultando el resto.</li>
<li>Si la jerarquía no filtra el presupuesto (problema de diseño), se oculta la tabla País y se pone su relación con Tienda en <b>ambas direcciones</b>.</li>
<li>La tabla de categorías también se puede crear en DAX y relacionar en ambas direcciones:</li>
</ul>
<pre><code>Categorías =
DISTINCT (
    UNION (
        DISTINCT ( Presupuesto[Categoria] ),
        DISTINCT ( Producto[Categoria] )
    )
)</code></pre>
<h4>Tareas del ejercicio</h4>
<ul>
<li>Medidas de unidades vendidas y presupuestadas; segmentadores por país y categoría que muestren real y presupuesto.</li>
<li>Gráfico combinado real vs presupuesto mensual y anual con segmentador de año, ejes y leyendas claros.</li>
<li>Unidades de productos de color negro y su porcentaje sobre el total, en un visual destacado.</li>
<li>Variación porcentual de unidades entre 2022 y 2023.</li>
<li>Acumulado mes a mes de 2019, 2020 y 2021, por año y combinado (excluyendo 2022).</li>
<li>Gráfico de líneas de evolución con línea de promedio dinámica según el periodo seleccionado.</li>
</ul>
`},
{t:"combinar", s:C, h:`
<p><b>Anexar consultas:</b> pone una tabla encima de otra en una tabla única. Si una tiene columnas que la otra no, Power Query rellena con nulos; funciona en ambos sentidos (de 3 a 2 columnas o de 2 a 3).</p>
<p><b>Combinar consultas:</b> necesita un campo en común.</p>
<h4>Conexión a carpetas</h4>
<p>Power BI repite automáticamente para cada archivo los pasos del <b>archivo de ejemplo</b> (se crean el parámetro, el archivo de ejemplo, la función «Transformar archivo» y la consulta final). Se elige como ejemplo el archivo con más columnas.</p>
<ul>
<li><b>Mismos nombres de hoja y columnas:</b> el caso sencillo. Al dejar archivos nuevos en la carpeta, <i>Actualizar vista previa</i> los incorpora.</li>
<li><b>Hojas con nombres distintos y mismas columnas:</b> da error (busca «Ventas 2007» y en el otro libro es «Ventas 2008»). Se edita el M del archivo de ejemplo para tomar la hoja por posición: <code>Origen{0}[Data]</code>, la primera hoja de cada libro.</li>
<li><b>Hojas y nombres de columna distintos:</b> en <i>Transformar archivo de ejemplo</i> eliminar los pasos automáticos <b>Encabezados promovidos</b> y <b>Tipo cambiado</b> (el tipo cambiado referencia nombres de columna concretos y provoca error). Promover encabezados en la consulta final, renombrar y filtrar las filas de encabezado que se repiten.</li>
<li><b>Excel con varias hojas:</b> conectar al libro, eliminar los pasos posteriores al origen, filtrar Kind = Sheet y expandir la columna Data para juntar todas.</li>
</ul>
<p><b>Encabezados promovidos y tipo cambiado automáticos:</b> Power Query los crea solo al cargar; tiene ventajas e inconvenientes y se controla en Opciones &gt; Carga de datos &gt; Detección de tipos (archivo actual o global).</p>
`},
{t:"relaciones", s:D, h:`
<h4>Propiedades de tarjetas (vista de modelo)</h4>
<ul>
<li><b>Mostrar base de datos en el encabezado cuando sea aplicable:</b> muestra base de datos y servidor en la tarjeta de la tabla.</li>
<li><b>Mostrar campos relacionados cuando la tarjeta se contrae.</b></li>
<li><b>Anclar campos relacionados a la parte superior de la tarjeta.</b></li>
</ul>
<h4>Propiedades de tabla</h4>
<p>Nombre; <b>Descripción</b> (aparece al pasar el cursor); <b>Sinónimos</b> (para Preguntas y respuestas); <b>Etiqueta de fila</b> y <b>Columna clave</b> (necesarias para las <b>tablas destacadas</b> de Excel: la etiqueta de fila identifica el registro y la columna clave lo distingue de forma única); <b>Está oculta</b> (oculta en modelo e informe); <b>Es una tabla destacada</b> (aparece en los tipos de datos de Excel).</p>
<h4>Propiedades de columna</h4>
<p>Nombre, descripción, sinónimos, <b>carpeta para mostrar</b> (organizar columnas y medidas), oculta, tipo de dato y formato. En Avanzado: <b>Ordenar por columna</b>, <b>Categoría de datos</b> (ciudad, país, continente, URL…) y <b>Resumir por</b>, clave para columnas numéricas que no deben agregarse (en el examen: «agregaciones en columnas numéricas»).</p>
<h4>Al crear una relación</h4>
<p>Lo importante: la <b>cardinalidad</b> y la <b>dirección del filtro cruzado</b>. Entre dos tablas solo puede haber una relación activa a la vez; con DAX (USERELATIONSHIP) se pueden usar las inactivas.</p>
`},
{t:"pl300", s:"PL-300 · Testimonios de estudiantes: temas que salieron", h:`
<p><b>Caso práctico:</b> revisarlo (también hay en YouTube). Leer primero las preguntas y luego buscarlas en el texto; dedicarle unos 20-25 minutos.</p>
<p><b>Temas recurrentes:</b> conector para Cassandra (ODBC), gráfico con detección de anomalías, longitud de texto y agrupar por longitud, RLS y roles estáticos/dinámicos, modos Importar, Dual y DirectQuery con SQL, influenciadores clave, temas de Azure y SQL Server (muy recurrente), Dataverse, combinar y anexar, transponer, dinamizar y anular dinamización, perfilado (cuál es la vista más rápida), tiempo de espera por defecto de la conexión SQL, formato condicional, SAMEPERIODLASTYEAR y PARALLELPERIOD, DISTINCTCOUNT y COUNTROWS, aplicaciones, modelado, CSV/OneDrive/SharePoint, percentil en gráficos, tablas destacadas de Excel (qué campo como etiqueta de fila y cuál como columna clave), lenguaje M (expandir una columna), anclar la página completa para que se actualicen los gráficos, tema corporativo en JSON, varias tablas de fechas para distintas relaciones, error de tiempo de espera con Azure SQL (partir la consulta), diferencia entre filtrar y resaltar, programar una actualización y compartir con roles.</p>
<p>Del programa de PL-300 constan además los bloques de vídeo «Recursos de entrenamiento» (5 vídeos), «SQL Server y Azure SQL» (14), «Testimonio de estudiantes» (10), «4º trimestre 2023» (20) y «4º trimestre 2024» (21), sin apuntes escritos aparte de lo recogido aquí.</p>
`}
);
})();
