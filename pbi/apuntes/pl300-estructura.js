/* PL-300 · «Estructura de estudio»: páginas de Preparar los datos, Modelar los datos y
   Administración y protección (bases PrepararDatos_Temas_BD, ModelarDatos_BD, CALCULOS_DAX_BD,
   Adm_Protección_DB y Protección_Control_DB). */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var P1 = "PL-300 · Transformar y cargar datos";
var P2 = "PL-300 · Identificación y conexión a orígenes de datos";
var P3 = "PL-300 · Configuración del origen: credenciales y privacidad";
var P4 = "PL-300 · Elección entre DirectQuery, Importar y Dual";
var P5 = "PL-300 · Creación y modificación de parámetros";
var M1 = "PL-300 · Crear cálculos de modelos mediante DAX";
var M2 = "PL-300 · Dimensiones realizadoras de roles (DDR)";
var A1 = "PL-300 · Implementar seguridad de nivel de fila (RLS)";
var A2 = "PL-300 · Crear y administrar áreas de trabajo y recursos";
NOTES.push(
{t:"transformar", s:P1, h:`
<h4>Transponer</h4>
<p>Cambia filas por columnas y columnas por filas. <b>Con encabezados</b>, al transponer se pierden. Para conservarlos: primero <i>Usar encabezados como primera fila</i> (bajarlos a datos), transponer y después <i>Usar primera fila como encabezado</i>.</p>
<h4>Anular dinamización (columnas a filas)</h4>
<p>Power BI lee los datos en vertical: conviene que estén siempre en ese formato. Útil cuando los valores de varias columnas son en realidad categorías (años, meses) y para analizar con tablas dinámicas y gráficos. Tres maneras:</p>
<ol>
<li><b>Anular dinamización de columnas:</b> seleccionas las columnas a convertir y renombras Atributo/Valor. Si en el origen aparece otra columna, también se anula su dinamización.</li>
<li><b>Anular dinamización de otras columnas:</b> seleccionas las que se quedan (útil cuando hay muchas columnas). Las columnas nuevas del origen también se anulan.</li>
<li><b>Anular dinamización solo de las columnas seleccionadas:</b> fija en el código las columnas concretas (2020, 2021). Si se añade 2022 al Excel, quedará como columna aparte. Se usa cuando anticipas columnas nuevas que <i>no</i> deben pasar a filas.</li>
</ol>
<p>Normalmente se usan la primera y la segunda; la tercera solo cuando quieres blindar el resultado frente a columnas nuevas.</p>
<h4>Dinamizar columna (filas a columnas)</h4>
<p>Cuando los atributos no tienen nada que ver entre sí (por ejemplo Humedad y Temperatura en la misma columna Atributo) y quieres cada uno en su columna: seleccionas la columna Atributo, Dinamizar columna e indicas que los valores están en Valor. Datos más compactos y flexibles para visualizar.</p>
`},
{t:"obtener", s:P2, h:`
<h4>Ventana Navegador</h4>
<p>Muestra los objetos del archivo con vista previa. <b>Tablas sugeridas</b> usa IA para limpiar las tablas, pero no es fiable al 100 %. <b>Cargar</b> cuando los datos ya están listos; <b>Transformar datos</b> para modificarlos.</p>
<p><b>Actualizaciones al día por modelo:</b> Pro (capacidad compartida) 8; Premium 48. Tras <b>4 errores consecutivos</b> de actualización, la programación se deshabilita automáticamente.</p>
<h4>CSV y configuración regional</h4>
<p>Puntos y comas decimales pueden cambiar el valor de los números; solo pasa con archivos CSV y de texto. La configuración regional que hay que elegir es la del <b>origen de datos</b>, no la nuestra. Delimitador habitual en España: punto y coma.</p>
<p>Si el formato se carga mal: en Pasos aplicados quitar <b>Tipo cambiado</b>. Para que no se repita: Opciones &gt; Carga de datos &gt; Detección de tipos y desmarcar <i>Detectar los encabezados y tipos de columna para los orígenes no estructurados</i>.</p>
<p><b>Número decimal vs decimal fijo:</b> decimal muestra todos los decimales; decimal fijo guarda 4 (redondea). Es una técnica de granularidad para optimizar el modelo, a costa de precisión; para recuperarla, volver a Número decimal y Actualizar.</p>
<h4>Carpetas</h4>
<p>Buena opción para muchos CSV. Se puede filtrar por la columna Name. <b>El lenguaje M distingue mayúsculas y minúsculas; DAX no.</b> Para unir los archivos, botón de combinar de la columna Content.</p>
<h4>SharePoint, Teams y OneDrive</h4>
<ul>
<li><b>SharePoint:</b> copiar la URL del sitio (Inicio), conectar con credenciales (se pueden editar o borrar; si la empresa cambia la contraseña cada 6 meses, se restablece en Configuración de origen de datos). Si no aparece la ventana de credenciales: Archivo &gt; Opciones &gt; Seguridad &gt; Explorador de autenticación.</li>
<li>Renombrar la consulta a «Origen SharePoint» y <b>deshabilitar la carga</b>. Cambiar <code>SharePoint.Files</code> por <code>SharePoint.Contents</code> para navegar por carpetas (Documentos compartidos…). Para otros archivos, duplicar esa consulta en lugar de conectar de nuevo.</li>
<li><b>Teams:</b> no hay conector directo: en Teams, <i>Abrir en SharePoint</i>, copiar el enlace y conectar como SharePoint.</li>
<li><b>OneDrive:</b> es un SharePoint personal; no existe conector directo. Copiar el enlace web y conectar con SharePoint.</li>
<li><b>OData:</b> protocolo abierto para acceder a datos vía web. En el examen, Cassandra se conecta con <b>ODBC</b>.</li>
</ul>
<h4>SQL Server</h4>
<p>Importar guarda los datos en Power BI; DirectQuery los deja en el origen. Opciones avanzadas: <b>Incluir columnas de relación</b> (activada por defecto; necesaria para <i>Seleccionar tablas relacionadas</i>), <b>Navegar usando la jerarquía completa</b> (muestra todos los objetos de la base de datos; por defecto solo tablas y vistas). Según la granularidad, las tablas relacionadas aparecen como columnas Value (registro) o Table. Al mezclar orígenes, Power BI avisa y en el modelo las tablas aparecen con colores distintos.</p>
<h4>Archivos de Power BI</h4>
<ul>
<li><b>.pbix:</b> informe completo con datos, modelo y visuales.</li>
<li><b>.pbit:</b> plantilla sin datos (modelo, consultas y visuales) para que otros la usen con sus datos.</li>
<li><b>.pbip:</b> proyecto dividido en archivos (modelo, informe…), pensado para control de versiones con Git.</li>
<li><b>.pbids:</b> guarda servidor y base de datos, <b>sin credenciales</b>; al abrirlo pide las credenciales. Útil para pasar la conexión del cliente.</li>
</ul>
<h4>Origen externo sobre un modelo compartido (modelo compuesto)</h4>
<p>Si a una conexión en vivo a un modelo publicado le añades un Excel, la conexión pasa de <b>conexión en vivo</b> a <b>DirectQuery</b> sobre el modelo remoto. En Service, la <b>vista de linaje</b> muestra el flujo origen → modelo → informe → panel.</p>
`},
{t:"vertipaq", s:P2, h:`
<h4>Plegado de consultas</h4>
<p>Traduce los pasos de M al lenguaje del origen (T-SQL) y los ejecuta el motor de la base de datos: solo llegan las filas ya filtradas. Es como pedir el plato al cocinero en lugar de llevarte toda la despensa. Ventajas: eficiencia, velocidad y menos recursos locales. Hay que mantenerlo activo el mayor tiempo posible y dejar al final los pasos que no se pueden plegar; cuando un paso no se pliega se habla de <b>ruptura del plegado</b>. Solo aplica a orígenes que lo admiten (bases de datos relacionales), no a Excel.</p>
<p><b>Comprobarlo:</b> clic derecho en un paso &gt; <b>Ver consulta nativa</b>. Si aparece en gris, no hay plegado (algunos expertos matizan que puede haberlo igualmente). Comprobación fiable: añadir un paso personalizado con <code>Value.Metadata</code> sobre el paso anterior y revisar el indicador de plegado.</p>
<p>Ejemplos de ruptura: cambiar un entero (IdGeografía) a divisa o un Id a Número decimal fijo; en DirectQuery Power BI avisa de que el origen no puede ejecutar esa transformación. A partir de ahí Power Query ejecuta todo localmente.</p>
`},
{t:"estrella", s:P2, h:`
<p><b>De copo de nieve a estrella:</b> la base de datos devuelve dimensiones encadenadas (Tienda → Geografía). En Power Query se trae a Tienda solo la columna necesaria de Geografía (por ejemplo Ciudad) mediante combinar/expandir y se <b>deshabilita la carga</b> de Geografía para que no aparezca en el modelo.</p>
`},
{t:"obtener", s:P3, h:`
<p><b>Dónde se configura el origen de datos:</b> Archivo &gt; Opciones y configuración &gt; Configuración de origen de datos; desde Power BI Desktop (Transformar datos &gt; Configuración de origen de datos); en Power Query (Inicio &gt; Configuración de origen de datos, o Archivo &gt; Opciones); desde el paso <b>Origen</b> (barra de fórmulas o rueda dentada) y desde el <b>Editor avanzado</b>.</p>
<p><b>Cambiar credenciales</b> cuando la empresa cambia la contraseña: Configuración de origen de datos &gt; <b>Editar permisos</b> &gt; Editar credenciales.</p>
`},
{t:"obtener", s:P4, h:`
<h4>Ventana de SQL Server</h4>
<ul>
<li><b>Servidor:</b> obligatorio. <b>Base de datos:</b> opcional, pero obligatoria si escribes una instrucción SQL (en T-SQL).</li>
<li><b>Tiempo de espera del comando:</b> opcional; el predeterminado es de <b>10 minutos</b>.</li>
<li><b>Incluir columnas de relación</b>, <b>Navegar usando la jerarquía completa</b> (desactivada por defecto) y <b>Habilitar la compatibilidad con la conmutación por error de SQL Server</b> (para infraestructuras con servidores de respaldo).</li>
</ul>
<h4>Importar</h4>
<p>Llenar el plato en el bufé y llevarlo a la mesa. Copia los datos al modelo: cualquier transformación M y DAX, visuales muy rápidos, funciona sin el origen. Contras: el modelo crece y hay que recargar. Compatible con <b>Preguntas y respuestas</b> e <b>Información rápida</b>. Aparece la vista de tabla.</p>
<h4>DirectQuery</h4>
<p>Volver al bufé cada vez. No guarda datos: consulta el origen con cada interacción. Siempre actualizado, ideal para orígenes enormes, modelo pequeño. Contras: más lento, depende del origen, pocas transformaciones y algunas funciones no disponibles; <b>desaparece la vista de tabla</b>; no compatible con Preguntas y respuestas ni Información rápida. Una línea azul en la tabla indica DirectQuery.</p>
<p><b>Modo de almacenamiento:</b> Propiedades &gt; Avanzado &gt; Modo de almacenamiento (por tabla). «Modo de conectividad» y «modo de almacenamiento» son lo mismo. <b>Pasar una tabla a Importar no se puede deshacer</b>: hay que borrarla y volver a crearla.</p>
<p><b>Actualización de página</b> (solo con DirectQuery, Premium o PPU): <i>actualización automática</i> cada X tiempo o <i>detección de cambios</i> (se actualiza cuando una medida de control cambia).</p>
<h4>Dual</h4>
<p>Un poco de comida en la mesa y vuelta al bufé si hace falta. La tabla se importa, pero Power BI conserva la capacidad de consultar el origen directamente. Equilibra velocidad y actualización; requiere decidir qué datos van en cada modo.</p>
<p><b>Cuándo:</b> Importar si los datos son manejables y no necesitas tiempo real; DirectQuery si necesitas datos actualizados y el origen es fiable; Dual cuando mezclas tablas grandes y pequeñas.</p>
`},
{t:"vertipaq", s:P4, h:`
<h4>Analizador de rendimiento</h4>
<p>Vista de informe &gt; Ver &gt; <b>Analizador de rendimiento</b>. Mide el tiempo de cada visual (consulta DAX, visualización, otros). Ideal para optimizar DAX, relaciones, número de visuales y formato. En clase se comparó Presupuesto en Dual/Importar frente a Ventas en Dual/DirectQuery.</p>
<h4>Diagnóstico de consultas</h4>
<p>Power Query &gt; Herramientas &gt; Diagnosticar paso / Iniciar diagnóstico. Mide las consultas de Power Query; algunas opciones solo para administradores. Genera consultas de diagnóstico para ver qué consulta está más optimizada.</p>
`},
{t:"relaciones", s:P4, h:`
<p><b>Jerarquías:</b> se crean con <i>Crear jerarquía</i> en la vista de modelo o en la de informe. En la vista de modelo se editan las propiedades de tablas, columnas y relaciones (cardinalidad y dirección del filtro cruzado; clic en la relación para verlas).</p>
<p><b>Dimensiones realizadoras de roles:</b> una misma dimensión usada en varios contextos. La relación <b>activa</b> se dibuja con línea continua; la <b>inactiva</b>, discontinua (no se puede relacionar un campo de una tabla con dos de otra a la vez de forma activa). Soluciones: sin DAX (duplicar la tabla de fechas) o con DAX (USERELATIONSHIP sobre la relación inactiva).</p>
`},
{t:"obtener", s:P5, h:`
<p><b>Caso del hospital:</b> no quiere dar datos reales a la consultora, así que crea una base de datos ficticia con la misma estructura. La consultora desarrolla con un <b>parámetro</b> que apunta a la base de datos; al terminar, el hospital cambia el valor del parámetro a la base real sin tocar el informe. Los parámetros son un interruptor entre entornos.</p>
<ol>
<li>Activarlo: Transformar datos &gt; Editar parámetros / Administrar parámetros &gt; Nuevo parámetro (también desde Power Query).</li>
<li>Valores sugeridos: lista de valores (Desarrollo, con credenciales; Producción, sin ellas). Valor predeterminado y actual: Desarrollo.</li>
<li>En la conexión a SQL Server, usar el parámetro en el campo Base de datos. Los valores deben corresponder a bases de datos del servidor con la misma estructura.</li>
<li>Comprobar el cambio contando filas: tabla Venta &gt; Transformar &gt; Contar filas.</li>
</ol>
<p><b>Un parámetro es la única parte de una consulta que se puede cambiar en Power BI Service</b> (configuración del modelo semántico &gt; Parámetros), una vez publicado.</p>
<p>También se crean parámetros para rutas de archivos Excel (carpeta y nombre) y así cambiar la ruta sin editar el M.</p>
<p><b>Error de ruta del archivo:</b> si cambia la ubicación, Power Query no encuentra el origen; <i>Editar configuración</i> y elegir la nueva ruta.</p>
`},
{t:"medidas", s:M1, h:`
<p>DAX permite crear cálculos, añadir columnas o crear tablas desde cero. Conviene crear las medidas desde la tabla correspondiente. Los argumentos entre corchetes en la sintaxis son opcionales.</p>
<pre><code>-- Comentario de línea
// Otro comentario de línea
/* Comentario
   de varias líneas */</code></pre>
<p><b>Agregación:</b> <code>Solicitudes = COUNTROWS(Solicitudes)</code>, <code>Horas = SUM(Solicitudes[Cantidad])</code>, <code>Promedio horas = AVERAGE(Solicitudes[Cantidad])</code>, <code>Nº canales activos = DISTINCTCOUNT(Venta[IdCanal])</code>.</p>
<p><b>Mover medidas:</b> seleccionarla y cambiar <i>Tabla inicial</i>, o arrastrarla en la vista de modelo.</p>
<p><b>Carpetas de medidas</b> (vista de modelo &gt; Propiedades &gt; Carpeta para mostrar): carpeta solo para columnas; la misma medida en dos carpetas separando con punto y coma (<code>01Agregación;02Solicitudes</code>); subcarpetas con barra invertida (<code>01Agregación\\Recuento</code>); y <b>tabla de medidas</b>: Inicio &gt; Introducir datos, tabla vacía llamada Medidas, y mover allí las medidas.</p>
<p><b>Medidas rápidas:</b> acumulados, inteligencia de tiempo, porcentajes del total, promedios ponderados, filtros (IF, MAX, MIN). Valor base puede ser una medida; Categoría es sobre qué se ejecuta. <b>Lo que se construye en DAX no se ve en Power Query.</b></p>
<p><b>Medidas explícitas</b> (las defines tú en DAX) frente a <b>implícitas</b> (Power BI las crea al arrastrar una columna).</p>
`},
{t:"logica", s:M1, h:`
<pre><code>Precio/hora =
IF ( Solicitudes[GestorID] = 1, 10,
    IF ( Solicitudes[GestorID] = 2, 20, ... ) )

Precio/hora =
SWITCH ( Solicitudes[GestorID],
    1, 10,
    2, 20,
    3, 30,
    4, 40 )</code></pre>
<p>SWITCH es la alternativa compacta a los IF anidados.</p>
`},
{t:"iteradores", s:M1, h:`
<p>Una función de iteración repite una operación fila a fila y combina los resultados. <b>Una columna: SUM; varias columnas: SUMX.</b></p>
<pre><code>Facturación =
SUMX ( Solicitudes, Solicitudes[Cantidad] * Solicitudes[Precio/hora] )

Promedio días gestión =
AVERAGEX ( Solicitudes, DATEDIFF ( Solicitudes[FechaApertura], Solicitudes[FechaCierre], DAY ) )</code></pre>
<p>Con fechas mal o vacías, restar fechas da resultados erróneos: <b>DATEDIFF</b> (primero la fecha inicial, luego la final). Con fechas ficticias (31/12/9999 = sin cerrar) se filtran antes con <code>FILTER(Solicitudes, Solicitudes[FechaCierre] &lt;&gt; DATE(9999,12,31))</code> dentro del iterador.</p>
<p><b>RELATED</b> trae el valor de otra tabla relacionada: <code>Precio/hora = RELATED(Agente[PrecioHora])</code>; todo debe estar relacionado en el modelo.</p>
`},
{t:"calendario", s:M1, h:`
<p><b>Dónde crear el calendario:</b> preferiblemente en el origen; si no, en M o en DAX. Caso: dos tablas de hechos con columnas de fecha distintas dan datos erróneos; la solución es una tabla calendario común.</p>
<p><b>Inteligencia de tiempo automática:</b> funciona si hay columna de fecha, la opción <i>Fecha y hora automáticas</i> está activa y usas la jerarquía generada. Cómodo pero no es buena práctica.</p>
<pre><code>Calendario = CALENDARAUTO()   -- cuidado: fechas de nacimiento amplían el rango

Calendario =
ADDCOLUMNS (
    CALENDAR (
        DATE ( YEAR ( MIN ( Solicitudes[FechaApertura] ) ), 1, 1 ),
        DATE ( YEAR ( MAX ( Solicitudes[FechaCierre] ) ), 12, 31 )
    ),
    "Año", YEAR ( [Date] ),
    "Mes", MONTH ( [Date] )
)</code></pre>
<p>Los calendarios completos en DAX y en M (con estaciones, semestres, desvíos respecto a hoy…) están en los apuntes del temario de este mismo tema.</p>
<p><b>Ordenar fechas:</b> seleccionar la columna &gt; Herramientas de columna &gt; Ordenar por columna &gt; columna con el criterio correcto.</p>
<p><b>Ejes continuos y categóricos:</b> el categórico dibuja todos los puntos (con scroll); el continuo con la fecha no muestra todos los días. Para ver por mes sin scroll se añade <code>"Mes y año", EOMONTH([Date], 0)</code>, se usa en el eje continuo y se le da formato <b>mmm yy</b>.</p>
`},
{t:"ti", s:M1, h:`
<p>En una matriz, cada celda es una «prisión» (contexto de filtro) de la que los números no escapan; <b>CALCULATE</b> rompe esa restricción y la inteligencia de tiempo lleva a otro punto de la tabla de fechas. <b>Siempre CALCULATE con inteligencia de tiempo.</b></p>
<pre><code>Solicitudes PY =
CALCULATE ( [Solicitudes], SAMEPERIODLASTYEAR ( Calendario[Fecha] ) )

Solicitudes YoY =
DIVIDE ( [Solicitudes] - [Solicitudes PY], [Solicitudes PY], 0 )

Solicitudes PM =
CALCULATE ( [Solicitudes], DATEADD ( Calendario[Fecha], -1, MONTH ) )

Solicitudes YTD =
CALCULATE ( [Solicitudes], DATESYTD ( Calendario[Fecha] ) )

Solicitudes YTD fiscal =
CALCULATE ( [Solicitudes], DATESYTD ( Calendario[Fecha], "31/08" ) )

Solicitudes TOTALYTD =
TOTALYTD ( [Solicitudes], Calendario[Fecha] )</code></pre>
<p>La resta dividida directamente da infinito cuando no hay año previo; <b>DIVIDE</b> lo evita y admite un tercer argumento con el valor alternativo. DATEADD es más versátil que SAMEPERIODLASTYEAR: días, meses, trimestres o años, hacia atrás (–) o hacia delante (+). DATESYTD reinicia el acumulado cada año; con el segundo argumento cambias el fin de año (en el ejemplo, reinicia en septiembre).</p>
<p><b>Medidas de suma parcial (semiaditivas):</b> CLOSINGBALANCEMONTH, OPENINGBALANCEMONTH, LASTDATE (última fecha del contexto; combinable con CALCULATE, FILTER o TOTALYTD) y LASTNONBLANKVALUE (último valor no vacío).</p>
`},
{t:"interactividad", s:M1, h:`
<p><b>Parámetro numérico para proyecciones</b> (¿qué pasa si las ventas suben un 5 % o bajan un 10 %?): Modelado &gt; Nuevo parámetro &gt; Intervalo numérico; nombre, tipo (entero si son meses), mínimo y máximo (por ejemplo –12 a 12), incremento (0,1 para 10 %) y valor predeterminado. Crea una tabla, una medida con el valor elegido y un segmentador.</p>
<pre><code>Valor categoría seleccionada =
SELECTEDVALUE ( 'Categoría'[NombreCategoría], "Todas" )</code></pre>
<p>SELECTEDVALUE devuelve lo que el usuario ha seleccionado (el segundo argumento, si no hay una sola selección). Una medida puede usarse dentro de otra: en DATEADD, en lugar de –1, se pone el valor del parámetro y el usuario decide cuántos meses desplazar.</p>
`},
{t:"grupos", s:M1, h:`
<p><b>Grupos de cálculo:</b> organizan y reutilizan cálculos para no crear una medida por cada variante. Se construyen desde la <b>vista de modelo</b> (se pueden crear varios). Uso típico: inteligencia de tiempo. Se crean elementos de cálculo: <i>Actual</i> = <code>SELECTEDMEASURE()</code>; <i>PY</i> = <code>CALCULATE(SELECTEDMEASURE(), SAMEPERIODLASTYEAR(Calendario[Fecha]))</code>; <i>YoY</i> con DIVIDE. El formato de porcentaje (0.0%) se define con la cadena de formato dinámico del elemento.</p>
<p>Al crear un grupo de cálculo ya no se pueden usar columnas numéricas como medidas implícitas en visuales nuevos (las existentes se respetan). También sirven para <b>segmentar</b>: un segmentador con el grupo de cálculo cambia qué cálculo muestra el gráfico. Hay un vídeo de Alex Ayala que lo explica más a fondo.</p>
`},
{t:"calculate", s:M1, h:`
<pre><code>% Solicitudes por prioridad =
VAR _total =
    CALCULATE ( [Solicitudes], REMOVEFILTERS ( Prioridad[NombrePrioridad] ) )
RETURN
    DIVIDE ( [Solicitudes], _total )</code></pre>
<p>CALCULATE con REMOVEFILTERS da el total sin el filtro de la prioridad; DIVIDE calcula el porcentaje de cada fila sobre ese total.</p>
`},
{t:"relaciones", s:M2, h:`
<p>Una dimensión realizadora de roles es una tabla dimensional que desempeña varios cometidos (fecha de pedido, de entrega…).</p>
<h4>Caso 1: una tabla de fechas por rol</h4>
<p>Se crean tantas tablas de fechas como columnas de fecha a conectar: <code>Fecha entrega = 'Calendario'</code>. Cada copia se relaciona con su columna de la tabla de hechos. Permite <b>doble segmentación</b> (un segmentador por fecha de pedido y otro por fecha de entrega). Modelo más complejo de mantener.</p>
<h4>Caso 2: una sola tabla con DAX</h4>
<p>Un único calendario con una relación activa (FechaApertura, línea continua) y otra inactiva (FechaCierre, discontinua); no se pueden activar las dos. No permite dos segmentadores a la vez.</p>
<pre><code>Solicitudes cerradas =
CALCULATE (
    [Solicitudes],
    USERELATIONSHIP ( Calendario[Fecha], Solicitudes[FechaCierre] ),
    Solicitudes[FechaCierre] &lt;&gt; BLANK ()
)</code></pre>
<p>Un cambio en qué relación está activa altera los resultados: mantener activa la de apertura para que la de cierre se fuerce con USERELATIONSHIP.</p>
<h4>Pendientes = abiertas acumuladas − cerradas acumuladas</h4>
<p><code>[Solicitudes abiertas] - [Solicitudes cerradas]</code> está mal porque trabajamos con acumulados. DATESYTD tampoco sirve (reinicia cada año). Medida correcta:</p>
<pre><code>Pendientes =
VAR _FechaMaxima = MAX ( Calendario[Fecha] )
VAR _AbiertasAcumuladas =
    CALCULATE ( [Solicitudes abiertas],
        REMOVEFILTERS ( Calendario[Fecha] ),
        Calendario[Fecha] &lt;= _FechaMaxima )
VAR _CerradasAcumuladas =
    CALCULATE ( [Solicitudes cerradas],
        REMOVEFILTERS ( Calendario[Fecha] ),
        Calendario[Fecha] &lt;= _FechaMaxima )
RETURN
    _AbiertasAcumuladas - _CerradasAcumuladas</code></pre>
`},
{t:"rls", s:A1, h:`
<p>RLS permite que un único informe lo vean distintas personas sin que cada una vea los datos de las demás, en lugar de publicar varios informes. Se crea (y se simula) en Desktop, pero solo se aplica en Service. Ruta: <b>Modelado &gt; Seguridad &gt; Administrar roles</b>.</p>
<ul><li><b>Estática:</b> un rol por segmento (en el ejemplo, 3 continentes = 3 roles) y usuarios asignados uno a uno; cada cambio es manual.</li>
<li><b>Dinámica:</b> un único rol, una tabla de permisos de acceso y el filtro <code>[Email] = USERPRINCIPALNAME()</code>; los cambios se hacen en la tabla.</li></ul>
<p>Probar: en Desktop <b>Ver como</b>; en Service <b>Probar como rol</b> (en el modelo semántico &gt; Seguridad, tres puntos del rol). Un rol puede filtrar varias regiones (Este y Oeste con OR).</p>
<h4>Comparar con el total a pesar de la RLS</h4>
<p>Un agente no puede ver el total por la RLS. Truco: duplicar la tabla Solicitudes como «Solicitudes sin RLS», <b>agrupar por</b> las columnas no afectadas por la seguridad (no GestorID ni PrioridadID) con un recuento (9.387 filas en el ejemplo), relacionarla con Calendario y Categoría y sumar el recuento en una medida. Así el porcentaje del agente sobre el total funciona.</p>
<h4>Publicar</h4>
<p>Tras publicar, se añaden personas; <b>solo quienes tienen rol de Visor quedan afectados por la RLS</b> (Colaborador, Miembro y Administrador ven todo). La seguridad se gestiona en el modelo semántico; con 0 asignados nadie ve datos. Para la rotación de personal, mejor <b>grupos de seguridad</b> (crear el grupo, añadir propietarios y miembros y asignar el grupo al rol) que personas una a una; una persona puede estar en dos roles.</p>
<p><b>Dinámica paso a paso:</b> tabla de permisos con emails; medidas de prueba <code>USERNAME()</code> (dominio\\usuario en Desktop) y <code>USERPRINCIPALNAME()</code> (email); rol con filtro DAX (siempre DAX); Ver como &gt; Otro usuario con un email; publicar y asignar usuarios al único rol.</p>
<p><b>RLS y varios a varios:</b> con cardinalidad varios a varios y filtro en ambas direcciones la seguridad no se propaga; hay que editar la relación y marcar <b>Aplicar filtro de seguridad en ambas direcciones</b>.</p>
<p>La <b>RLS se propaga a las aplicaciones</b>. La seguridad se programa en Desktop y se gestiona en la nube.</p>
`},
{t:"dataflows", s:A1, h:`
<p><b>Puerta de enlace:</b> en Service se asigna al modelo semántico (Configuración &gt; Conexión de puerta de enlace). Al crearla: <b>colaborativa (estándar)</b>, atiende a varios usuarios con control de acceso a los orígenes; <b>personal</b>, no. Se instala, se registra con la cuenta y se añaden los orígenes de datos.</p>
`},
{t:"roles", s:A2, h:`
<p><b>Licencias en la empresa:</b> se asignan desde el centro de administración de Microsoft 365 (usuarios activos &gt; licencias). Son nominativas (una persona). Con licencia gratuita solo se trabaja en <b>Mi área de trabajo</b>; para colaborar hace falta licencia.</p>
<table class="dxtbl"><thead><tr><th></th><th>Pro</th><th>Premium</th></tr></thead><tbody>
<tr><td>Tamaño de memoria del modelo</td><td>1 GB</td><td>100 GB</td></tr>
<tr><td>Actualizaciones al día</td><td>8</td><td>48</td></tr>
<tr><td>Almacenamiento máximo</td><td>10 GB</td><td>100 TB</td></tr>
<tr><td>Precio (PPU en el apunte)</td><td>9,40 €</td><td>18,70 €</td></tr>
</tbody></table>
<h4>Publicar y compartir modelos</h4>
<p>Para compartir modelos siempre hay que pagar. Un modelo compartido es estándar (todos trabajan sobre la misma información) y no siempre lleva visuales. Iniciar sesión &gt; Publicar &gt; elegir área (hace falta ser al menos <b>Colaborador</b>; el Visor no publica). En el área aparecen el informe y el modelo semántico por separado, para que el Visor acceda solo al informe; Colaborador, Miembro y Administrador acceden a todo. Programar la actualización (por ejemplo a las 3:00) se configura en el <b>modelo</b>, no en el informe. Si borras el informe no pasa nada; si borras el modelo, se borra todo lo que depende de él.</p>
<p><b>Compartir solo el modelo:</b> en el modelo semántico &gt; Administrar permisos &gt; Agregar usuario, con permisos (lectura, compilación…), sin dar acceso al área. El otro usuario crea su propia área (donde es administrador) y se conecta al modelo.</p>
<p><b>Conexión en vivo:</b> desde Desktop, Obtener datos &gt; Modelos semánticos de Power BI. Puede crear visuales y medidas e incluso ver el modelo, pero no modificar Power Query ni el modelo. Publicar cambios es más rápido porque solo sube el informe.</p>
`}
);
})();
