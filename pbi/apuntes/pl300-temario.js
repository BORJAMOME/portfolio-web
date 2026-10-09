/* Apuntes de Notion · PL-300 (Alex Ayala, NamasData) · Estructura de estudio: Preparar, Modelar (DAX), Visualizar, Administrar */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var S = "PL-300 · Alex Ayala (NamasData)";

/* ── PREPARAR LOS DATOS ── */
NOTES.push({t:"transformar", s:S + " · Preparar los datos · Transformar una consulta", h:`
<h4>Caso: el origen cambia de sistema</h4>
<p>Un CSV con grupo de compras y objetivo sin impuestos (en millones), con el presupuesto de 2020 y 2021. El director financiero lo recibía en CSV desde un sistema informático, pero desde 2022 recibe un Excel con la misma información y desglose mensual. Hay que adaptar la extracción para seguir trabajando con los datos. En el examen pueden darte los datos históricos en un formato y estructura y pedirte las modificaciones.</p>
<h4>Pasos aplicados</h4>
<ul><li><b>Valores null</b>: no es «valor nulo», es que la celda no tiene información. En Pasos aplicados > Valor reemplazado (rueda) > Opciones avanzadas > <b>Coincidir con el contenido de toda la celda</b>: solo reemplaza celdas que contienen únicamente espacios.</li>
<li>En M, los nombres con espacio llevan delante # (#"Valor reemplazado") y todo lo que va entre comillas es texto.</li>
<li><b>Columna de índice</b>: Agregar columna > Columna de índice > Desde 1.</li>
<li><b>Quitar filas</b>: quitar filas en blanco; quitar filas superiores (eliminamos 2 y aún queda una).</li>
<li>Si cierras sin guardar, recupera el trabajo con <b>Orígenes recientes</b>. Buena práctica: guardar los pasos en el portapapeles (clic derecho > Editor avanzado > copiar/pegar).</li>
<li>Si alguien manipula el Excel y añade una fila, al actualizar aparece un problema. Criterio: que las transformaciones se vean lo menos afectadas posible por las decisiones de los usuarios. Aquí se corrige cambiando el 2 por un 3 en la fórmula (Quitar filas superiores), quitando los null de la fila 7 y aplicando «Quitar filas en blanco».</li>
<li><b>Encabezados</b>: Transformar > Usar la primera fila como encabezado.</li>
<li><b>Totales</b>: filtrar directamente, o <b>Filtros de texto</b> > no contiene «total». En Power Query se distingue entre mayúsculas y minúsculas; en DAX no.</li>
<li>Con 12 meses + 1 columna deberían verse 13 columnas y hay 14: otra columna totalizadora que hay que suprimir.</li>
<li><b>Modelo tabular</b>: clic derecho sobre las columnas fijas > Anulación de dinamización de otras columnas.</li>
<li><b>Fechas personalizadas</b>: Agregar columna > Columna personalizada para crear una fecha con mes y año; por lógica empresarial se lleva a fin de mes (Transformar > Fecha > Fin de mes); después se elimina la columna del mes y se cambia el formato de fecha.</li></ul>`});

NOTES.push({t:"combinar", s:S + " · Preparar los datos · Carpetas, distribuir y anexar", h:`
<h4>Cargar los objetivos de 2020 y 2021 desde una carpeta de CSV</h4>
<p>Conector Carpeta > <b>Combinar y transformar datos</b> para unificar en una sola consulta. Si en la carpeta hay, por ejemplo, un PowerPoint, se filtra y desaparece. Aparece una vista previa del primer archivo y el resultado es como anexar los archivos.</p>
<h4>Distribuir un valor</h4>
<p>Problemas: el objetivo sin impuestos debe expresarse en millones y no está mensualizado. Hay que aplicar lógica de negocio (compararlo con el histórico) y, en este caso, repartirlo entre 12.</p>
<ul><li><b>Millones</b>: multiplicar por un valor estándar.</li>
<li><b>Mensualizar generando una lista</b>: columna personalizada <code>{1..12}</code> (una lista de letras sería <code>{"a".."g"}</code>). Al pulsar la lista hay dos opciones: <b>Extraer valores</b> (los concatena con un separador) o <b>Expandir en nuevas filas</b> (una fila por mes).</li>
<li><b>Fecha completa</b>: cambiar a número las columnas necesarias, combinar Source.Name (año) y el mes con «/» (el resultado depende del orden en que selecciones las columnas), pasar a fecha y llevar a fin de mes. Alternativa: columna personalizada con #date(año, mes, 1); se usa el día 1 porque todos los meses empiezan en 1 y no todos terminan igual.</li></ul>
<h4>Valores mensuales</h4>
<p>Combinar las tablas Fecha y Grupo de compras, expandir y calcular las mensualidades multiplicando presupuesto por porcentaje. Después se anexa el presupuesto 2022 con 2019-2021.</p>
<h4>Anexar consultas</h4>
<ul><li>Los nombres de las columnas deben coincidir en todas las consultas; prevalece el orden de columnas de la primera (cuando se cargan manualmente).</li>
<li><b>Anexar consultas</b>: pone una debajo de otra en la consulta actual. <b>Anexar consultas para crear una nueva</b>: conserva las originales.</li>
<li>Se pueden anexar más de dos tablas e incluso la misma tabla. Fallos típicos: nombres distintos y orden de columnas distinto.</li></ul>
<h4>Combinar consultas: los seis tipos de combinación</h4>
<p>Ejemplo: grupo A = Ana, Juan, María; grupo B = Juan, Pedro.</p>
<ul><li><b>Externa izquierda</b>: todas las filas de la primera y las coincidencias de la segunda → Ana, Juan, María.</li><li><b>Externa derecha</b>: todas las de la segunda y las coincidencias de la primera → Pedro, Juan.</li><li><b>Externa completa</b>: todas las filas de ambas → Ana, Juan, María, Pedro.</li><li><b>Interna</b>: solo las coincidentes → Juan.</li><li><b>Anti izquierda</b>: solo las de la primera sin coincidencia → Ana, María.</li><li><b>Anti derecha</b>: solo las de la segunda sin coincidencia → Pedro.</li></ul>
<h4>Maneras de quitar columnas (qué pasa con columnas nuevas en origen)</h4>
<ul><li><b>Elegir columnas</b>: las nuevas no aparecerán (solo mantiene las elegidas).</li><li><b>Quitar columna</b>: las nuevas sí aparecerán.</li><li><b>Quitar otras columnas</b>: las nuevas se eliminan automáticamente.</li><li><b>Suprimir columnas</b>: se comporta como Quitar columnas; las nuevas seguirán apareciendo.</li></ul>`});

NOTES.push({t:"dataflows", s:S + " · Preparar los datos · Flujo de datos", h:`
<p>Un flujo de datos es una «fábrica de datos» que prepara la información antes de usarla en los informes: recoge datos de distintas fuentes (bases de datos, Excel, APIs), los limpia y organiza (quitar errores, unir tablas) y los guarda en la nube en un lugar central para que otros informes y usuarios los reutilicen. Sirve para reutilización (no repetir el trabajo en cada informe), colaboración y automatización (se actualizan solos). Es una cocina central que prepara los ingredientes para cocinar informes: un ETL en la nube.</p>
<ul><li>En Power BI Service crea un <b>área de trabajo</b>.</li><li><b>Nuevo elemento</b> > Flujo de datos Gen1.</li><li>De las 4 opciones, elige <b>Definir tablas nuevas</b>.</li><li>Si los datos están en tu ordenador o red local, necesitas una <b>puerta de enlace</b>.</li></ul>`});

NOTES.push({t:"plana", s:S + " · Preparar los datos · Bravo y claves subrogadas", h:`
<h4>Caso del hotel</h4>
<p>Tablas Reservas, Clientes, Habitaciones y Tipos de pago. Se eligen las columnas necesarias de cada tabla y se quitan duplicados. Problema: CodigoCliente es un código muy largo. Solución: crear una <b>columna de índice</b> (clave subrogada). ¿Por qué otro identificador si ya hay uno? Por rendimiento.</p>
<p>Para ver si las columnas están optimizadas se instalan <b>Bravo</b> y <b>DAX Studio</b>, que aparecen en la pestaña <b>Herramientas externas</b>.</p>
<p>Disyuntiva: ¿priorizar la velocidad de la consulta de Power Query o el tamaño del modelo? Con CodigoCliente la tabla y el modelo son más grandes; sin él, más pequeños. Para llevar el Id del cliente a Reservas se combinan consultas; si ya no tienes CodigoCliente en ambas, se combina por las mismas columnas (nombre, apellidos…) en ambas consultas, lo que da una coincidencia exacta; se expande IdCliente y se eliminan NombreCliente, ApellidoCliente, etc. Así el modelo no repite columnas. Lo mismo en cada dimensión.</p>
<h4>Herramientas de diagnóstico de Power Query</h4>
<p>Para comparar rendimiento: Herramientas > <b>Iniciar diagnóstico</b> > en la consulta, Inicio > Actualizar vista previa (en ambas versiones de la consulta) > <b>Detener diagnóstico</b>. Se generan consultas de diagnóstico; se habilita su carga, se pone la duración en segundos para sumarla y se compara en una matriz con las consultas en columnas.</p>
<h4>Pasos de tabla plana a modelo dimensional</h4>
<ol><li><b>Identificar dimensiones y atributos</b>: duplicar la consulta, Inicio > Conservar filas (una), y para ver la estructura en vertical: Transformar > Usar encabezados como primera fila y después <b>Transponer</b> (si transpones sin bajar los encabezados, pierdes los títulos). Copia la tabla a Excel para clasificar.</li>
<li><b>Crear tantos duplicados como dimensiones</b> (Ventas, Canal de distribución, Producto, Tienda). Microsoft recomienda nombres de negocio, sin prefijos ni sufijos como DIM.</li>
<li><b>Eliminar columnas innecesarias</b> de cada dimensión.</li>
<li><b>Quitar filas duplicadas</b>: a nivel de tabla (filas completamente iguales, deja la primera) o a nivel de columna (solo mira esa columna).</li>
<li><b>Añadir columna de índice</b> y renombrarla (IdCanal): número único por fila que actúa de clave principal; el usuario del informe no la verá.</li>
<li><b>Combinar los hechos con cada dimensión para traer el Id</b>. Trampa de examen: las columnas deben ser del <b>mismo tipo</b>. Se pueden seleccionar varias columnas para la unión (Producto y Fabricante si un mismo producto se fabrica en varios países); el orden de selección arriba y abajo es fundamental. «Usar coincidencias aproximadas» empareja textos gramaticalmente parecidos.</li>
<li><b>Eliminar las columnas dimensionales de los hechos</b> (Elegir columnas) y dejar los Id numéricos.</li>
<li><b>Cerrar y aplicar</b> y comprobar las relaciones.</li></ol>
<h4>Duplicar frente a referenciar</h4>
<p><b>Duplicar</b> hace una copia independiente de todos los pasos: los cambios en la original no le afectan (analizar ventas totales y productos más vendidos con transformaciones distintas). <b>Referenciar</b> solo tiene un paso (el origen = la consulta original) y hereda sus cambios (calcular ventas por región, producto y mes desde un mismo origen).</p>`});

NOTES.push({t:"vertipaq", s:S + " · Preparar los datos · Fecha y hora, agrupaciones", h:`
<h4>Experimento: fecha y hora</h4>
<p>Se carga un CSV con fecha y hora, se duplica: una consulta conserva una columna fecha-hora y la otra la separa en fecha y hora. Analizado con Bravo, juntas el modelo es mayor; separadas, la fecha baja a 1.826 valores distintos. Pregunta de examen: ¿qué columna o tabla es más grande? La que tiene fecha y hora juntas. ¿Cómo optimizar una tabla con fecha y hora? Separando, e incluso extrayendo hora, minuto y segundo: se <b>reduce la cardinalidad</b> de las columnas y se comprime más.</p>
<h4>Columnas a partir de ejemplos</h4>
<p>Crea columnas según patrones que escribes a partir de otras columnas.</p>
<h4>Agrupaciones</h4>
<p>Forma de reducir la cardinalidad agrupando valores.</p>`});

NOTES.push({t:"estrella", s:S + " · Preparar los datos · Hechos frente a dimensiones", h:`
<p><b>Tabla de hechos</b>: datos transaccionales o numéricos que queremos analizar: medidas (ventas, cantidades, costes) y claves foráneas hacia las dimensiones. Ejemplo: Fecha 2024-12-10, IDProducto 101, IDCliente 301, Ventas 500 €, Cantidad 2. Su objetivo: almacenar lo que se suma, cuenta o promedia.</p>
<p><b>Tabla de dimensiones</b>: información descriptiva para categorizar y filtrar (Productos, Clientes, Fechas, Regiones). Ejemplo: IDProducto 101, Portátil A, Electrónica, 250. Facilita filtros y jerarquías (ventas por categoría).</p>
<p>Un modelo de tabla plana tiene todo en una sola tabla; el proceso de la consulta transforma esa tabla plana en un modelo en estrella.</p>`});

/* ── MODELAR: CREAR CÁLCULOS DAX ── */
NOTES.push({t:"medidas", s:S + " · Modelar · Crear cálculos con DAX", h:`
<p>DAX permite crear un cálculo, añadir una columna a una tabla o una tabla desde cero. Al crear medidas, mejor crearlas desde la tabla. En la sintaxis, los argumentos entre corchetes son opcionales.</p>
<pre class="dcode">-- Comentario
// Comentario
/* Comentario
   de varias filas */</pre>
<h4>Mover y organizar medidas</h4>
<ul><li>Mover una medida: seleccionarla y cambiar <b>Tabla inicial</b> arriba, o arrastrarla en la vista de modelo.</li>
<li><b>Carpetas</b> (vista de modelo > Propiedades > Carpeta para mostrar): para columnas también; una medida en dos carpetas separando con punto y coma <code>01Agregación;02Solicitudes</code>; subcarpetas con barra invertida <code>01Agregación\Recuento</code>.</li>
<li><b>Tabla contenedora de medidas</b>: Inicio > Introducir datos (tabla vacía) llamada Medidas, y se mueven las medidas con Tabla inicial.</li></ul>
<h4>Funciones de agregación</h4>
<pre class="dcode">Solicitudes = COUNTROWS( Solicitudes )
Horas = SUM( Solicitudes[Cantidad] )
Promedio Horas = AVERAGE( Solicitudes[Cantidad] )
Nº canales activos = DISTINCTCOUNT( Venta[IdCanal] )</pre>
<p>DISTINCTCOUNT cuenta los valores únicos o distintos de una columna.</p>
<h4>Medidas rápidas</h4>
<p>Cálculos predefinidos: acumulados, inteligencia de tiempo, porcentajes del total, promedios ponderados, filtros específicos (IF, MAX, MIN…). Se rellenan los cajones: valor base (puede ser una medida) y categoría (sobre qué se ejecuta). Lo que se construye en DAX no se puede ver en Power Query.</p>
<h4>Medidas explícitas e implícitas</h4>
<p>Explícitas: las defines tú con DAX. Implícitas: Power BI las crea automáticamente.</p>`});

NOTES.push({t:"logica", s:S + " · Modelar · IF, SWITCH, SELECTEDVALUE y parámetros", h:`
<pre class="dcode">Precio/hora =
IF( Solicitudes[GestorID] = 1, 10,
    IF( Solicitudes[GestorID] = 2, 20, ... ) )

Precio/hora =
SWITCH( Solicitudes[GestorID],
    1, 10,
    2, 20,
    3, 30,
    4, 40 )</pre>
<p>SWITCH es la alternativa compacta y estructurada a IF: evalúa una expresión y devuelve resultados según una lista de valores o condiciones.</p>
<h4>Parámetro numérico: método para proyecciones</h4>
<p>Permite ver qué ocurriría si sumo un 5 % o resto un 10 % a las ventas. Creación de un intervalo numérico: nombre, tipo de datos (número entero si son meses), mínimo y máximo (−12 a 12 para ir 12 meses atrás y adelante), incremento (0,1 para un 10 %) y valor predeterminado (el que toma si no se elige nada). Genera un segmentador.</p>
<h4>SELECTEDVALUE</h4>
<pre class="dcode">Valor categoría seleccionada = SELECTEDVALUE( 'Categoría'[NombreCategoría] )</pre>
<p>Con un segmentador de categorías y una tarjeta con esta medida se ve la selección. Tiene un argumento opcional para cuando el usuario no selecciona nada. Uso: dentro de la medida de solicitudes del mes anterior, en lugar de un 1 fijo se pone la medida del parámetro, y al mover el selector de meses cambia la tabla (cuánto aumenta un 5 %, 8 % o 10 %).</p>`});

NOTES.push({t:"iteradores", s:S + " · Modelar · Iteradores y fechas erróneas", h:`
<p>Un iterador repite una operación para cada fila de una tabla y combina los resultados en un único valor. Cuando es una sola columna se usa SUM; cuando intervienen varias columnas, SUMX.</p>
<pre class="dcode">Facturación =
SUMX( Solicitudes, Solicitudes[Cantidad] * Solicitudes[Precio/hora] )

Promedio días gestión =
AVERAGEX( Solicitudes, Solicitudes[FechaCierre] - Solicitudes[FechaApertura] )</pre>
<h4>Caso: fechas mal o vacías → DATEDIFF</h4>
<p>DATEDIFF calcula la diferencia entre dos fechas en la unidad indicada (días, meses, años). Ojo al orden: primero la de apertura y luego la de cierre.</p>
<pre class="dcode">Promedio días gestión =
AVERAGEX( Solicitudes,
    DATEDIFF( Solicitudes[FechaApertura], Solicitudes[FechaCierre], DAY ) )</pre>
<h4>Fechas ficticias (31/12/9999 = sin cerrar) → FILTER</h4>
<pre class="dcode">Promedio días gestión (cerradas) =
AVERAGEX(
    FILTER( Solicitudes, Solicitudes[FechaCierre] &lt;&gt; DATE( 9999, 12, 31 ) ),
    DATEDIFF( Solicitudes[FechaApertura], Solicitudes[FechaCierre], DAY ) )</pre>
<h4>RELATED</h4>
<p>Trae el valor de otra tabla; todo debe estar relacionado en el modelo: <code>Precio/hora tabla GESTOR = RELATED( Agente[PrecioHora] )</code>.</p>`});

NOTES.push({t:"calendario", s:S + " · Modelar · Tabla calendario", h:`
<p>Formas de obtenerla: en el origen de datos (preferible), con lenguaje M o con DAX. Caso: dos tablas de hechos con columnas de fecha distintas dan datos erróneos; la solución es una tabla de fechas común.</p>
<h4>Inteligencia de tiempo automática</h4>
<p>Solo se activa si hay una columna de fecha, la opción Auto Date/Time está activada (Opciones > Configuración global) y se usa la jerarquía de fechas que genera Power BI. Permite construir visuales año-trimestre-mes-día sin conocimientos, pero no es buena práctica.</p>
<p>Cómo funciona: un punto de datos es como una prisión de la que los números no pueden escapar (contexto de filtro); CALCULATE rompe la restricción para moverse, y la inteligencia de tiempo lleva a un punto concreto de la tabla. Siempre se usa CALCULATE con inteligencia de tiempo.</p>
<h4>CALENDARAUTO</h4>
<p>Escanea todas las fechas del modelo, de la mínima a la máxima. Desventaja: si añades la fecha de nacimiento de los empleados, amplía el rango y deja grandes márgenes vacíos en los gráficos de tiempo.</p>
<pre class="dcode">Calendario = CALENDARAUTO()</pre>
<h4>CALENDAR</h4>
<pre class="dcode">Calendario = CALENDAR(
    DATE( YEAR( MIN( Solicitudes[FechaApertura] ) ), 1, 1 ),
    DATE( YEAR( MAX( Solicitudes[FechaCierre] ) ), 12, 31 ) )

Calendario =
ADDCOLUMNS(
    CALENDAR(
        DATE( YEAR( MIN( Solicitudes[FechaApertura] ) ), 1, 1 ),
        DATE( YEAR( MAX( Solicitudes[FechaCierre] ) ), 12, 31 ) ),
    "Año", YEAR( [Date] ),
    "Mes", MONTH( [Date] ) )</pre>
<h4>Calendario DAX completo (ajustar a cada modelo)</h4>
<pre class="dcode">Fechas =
VAR vHoy = TODAY()
VAR vAnyoMinimo = YEAR( MIN( Ventas[Fecha] ) )   -- año de inicio
VAR vAnyoMaximo = YEAR( MAX( Ventas[Fecha] ) )   -- año de fin
RETURN
ADDCOLUMNS(
    CALENDAR( DATE( vAnyoMinimo, 1, 1 ), DATE( vAnyoMaximo, 12, 31 ) ),
    "FechaCompleta", FORMAT( [Date], "DDDD, DD ""de"" MMMM ""de"" yyyy" ),
    "idFecha", INT( FORMAT( [Date], "YYYYMMDD" ) ),
    "Año", YEAR( [Date] ),
    "Mes", MONTH( [Date] ),                       -- orden de NombreMes y MesCorto
    "NombreMes", FORMAT( [Date], "MMMM" ),
    "MesCorto", FORMAT( [Date], "MMM" ),
    "Día", DAY( [Date] ),
    "NombreDía", FORMAT( [Date], "DDDD" ),
    "OrdenDíaSemana", WEEKDAY( [Date], 2 ),       -- 1 lunes .. 7 domingo
    "AñoMes", FORMAT( [Date], "YYYY-MMM" ),
    "OrdenAñoMes", INT( FORMAT( [Date], "YYYYMM" ) ),
    "Trimestre", QUARTER( [Date] ),
    "AñoTrimestre", FORMAT( [Date], "YYYY-""Trim""Q" ),
    "OrdenAñoTrimestre", FORMAT( [Date], "YYYYQ" ),
    "InicioAño", DATE( YEAR( [Date] ), 1, 1 ),
    "FinAño", DATE( YEAR( [Date] ), 12, 31 ),
    "InicioTrimestre", DATE( YEAR( [Date] ), QUARTER( [Date] ) * 3 - 2, 1 ),
    "FinTrimestre", EOMONTH( DATE( YEAR( [Date] ), QUARTER( [Date] ) * 3, 1 ), 0 ),
    "InicioMes", DATE( YEAR( [Date] ), MONTH( [Date] ), 1 ),
    "FinMes", EOMONTH( [Date], 0 ),
    "NumSemana", "Sem " & WEEKNUM( [Date] ),
    "OrdenSemana", WEEKNUM( [Date] ),
    "AñoSemana", FORMAT( [Date], "YYYY ""Sem """ ) & WEEKNUM( [Date] ),
    "OrdenAñoSemana", INT( FORMAT( [Date], "YYYY" ) & FORMAT( WEEKNUM( [Date] ), "00" ) ),
    "PrimerDíaSemana", IF( WEEKDAY( [Date], 2 ) = 1, [Date], [Date] - WEEKDAY( [Date], 3 ) ),
    "UltimoDíaSemana", IF( WEEKDAY( [Date], 2 ) = 7, [Date], [Date] + 6 - WEEKDAY( [Date], 3 ) ),
    "Laboral/FinSemana", IF( WEEKDAY( [Date], 2 ) &lt;= 5, "Laborable", "FinDeSemana" ),
    "CuentaLaboral", IF( WEEKDAY( [Date], 2 ) &lt;= 5, 1, 0 ),
    "CuentaFinSemana", IF( WEEKDAY( [Date], 2 ) &lt;= 5, 0, 1 ),
    "Estación", SWITCH( TRUE(),
        INT( FORMAT( [Date], "MMDD" ) ) &lt; 0320, "INVIERNO",
        INT( FORMAT( [Date], "MMDD" ) ) &lt; 0621, "PRIMAVERA",
        INT( FORMAT( [Date], "MMDD" ) ) &lt; 0921, "VERANO",
        INT( FORMAT( [Date], "MMDD" ) ) &lt; 1221, "OTOÑO",
        "INVIERNO" ),
    "DíasInicioAño", DATEDIFF( DATE( YEAR( [Date] ), 1, 1 ), [Date], DAY ) + 1,
    "DíasFinAño", DATEDIFF( [Date], DATE( YEAR( [Date] ) + 1, 1, 1 ), DAY ) - 1,
    "Semestre", IF( MONTH( [Date] ) &lt;= 6, "Semestre 1", "Semestre 2" ),
    "AñoSemestre", YEAR( [Date] ) & IF( MONTH( [Date] ) &lt;= 6, " Semestre 1", " Semestre 2" ),
    "OrdenAñoSemestre", YEAR( [Date] ) * 10 + IF( MONTH( [Date] ) &lt;= 6, 1, 2 ),
    "DesvíoDía", DATEDIFF( vHoy, [Date], DAY ),
    "DesvíoMes", DATEDIFF( vHoy, [Date], MONTH ),
    "DesvíoTrimestre", DATEDIFF( vHoy, [Date], QUARTER ),
    "DesvíoAño", DATEDIFF( vHoy, [Date], YEAR ) )</pre>
<h4>Calendario DAX simplificado</h4>
<pre class="dcode">Fechas =
VAR vAnyoMinimo = YEAR( MIN( Ventas[Fecha] ) )
VAR vAnyoMaximo = YEAR( MAX( Ventas[Fecha] ) )
RETURN
ADDCOLUMNS(
    CALENDAR( DATE( vAnyoMinimo, 1, 1 ), DATE( vAnyoMaximo, 12, 31 ) ),
    "Año", YEAR( [Date] ),
    "Mes número", MONTH( [Date] ),
    "Mes", FORMAT( [Date], "mmmm yyyy", "es-ES" ) )</pre>
<h4>Calendario con M</h4>
<p>Nueva consulta > Consulta en blanco > renombrar > clic derecho > Editor avanzado > pegar el código. Para las fechas iniciales, ajusta la fórmula del primer paso.</p>
<pre class="dcode">let
    FechaInicial = Date.StartOfYear( Date.From( List.Min( Solicitudes[FechaApertura] ) ) ),
    FechaFinal   = Date.EndOfYear( Date.From( List.Max( Solicitudes[FechaApertura] ) ) ),
    vHoy         = Date.From( DateTime.LocalNow() ),
    NumDias      = Duration.Days( FechaFinal - FechaInicial ) + 1,
    // días entre inicio y fin; +1 para contar el día de inicio
    Fechas       = List.Dates( FechaInicial, NumDias, #duration(1,0,0,0) ),
    // lista desde la fecha inicial, NumDias elementos, en saltos de 1 día
    #"Convertida en tabla" = Table.FromList( Fechas, Splitter.SplitByNothing(), null, null, ExtraValues.Error ),
    #"Tipo cambiado" = Table.TransformColumnTypes( #"Convertida en tabla", {{"Column1", type date}} ),
    #"Columnas con nombre cambiado" = Table.RenameColumns( #"Tipo cambiado", {{"Column1", "Fecha"}} ),
    FechaCompleta = Table.AddColumn( #"Columnas con nombre cambiado", "FechaCompleta", each Date.ToText([Fecha], "dddd, dd ""de"" MMMM ""de"" yyyy"), type text ),
    #"Año insertado" = Table.AddColumn( FechaCompleta, "Año", each Date.Year([Fecha]), Int64.Type ),
    #"Mes insertado" = Table.AddColumn( #"Año insertado", "Mes", each Date.Month([Fecha]), Int64.Type ),
    nombreMes = Table.AddColumn( #"Mes insertado", "nombreMes", each Date.MonthName([Fecha]), type text ),
    MesCorto = Table.AddColumn( nombreMes, "MesCorto", each Text.Start([nombreMes], 3), type text ),
    Día = Table.AddColumn( MesCorto, "Día", each Date.Day([Fecha]), Int64.Type ),
    DíaSemana = Table.AddColumn( Día, "DíaSemana", each Date.DayOfWeek([Fecha]) + 1, Int64.Type ),
    NombreDíaSemana = Table.AddColumn( DíaSemana, "NombreDía", each Date.DayOfWeekName([Fecha]), type text ),
    #"Año Mes" = Table.AddColumn( NombreDíaSemana, "Año Mes", each Number.ToText([Año]) & " " & Text.Start( Date.MonthName([Fecha], "ES-ES"), 3 ), type text ),
    OrdenAñoMes = Table.AddColumn( #"Año Mes", "ordenAñoMes", each [Año] * 100 + [Mes], Int64.Type ),
    Trimestre = Table.AddColumn( OrdenAñoMes, "Trimestre", each "Trim " & Number.ToText( Date.QuarterOfYear([Fecha]) ), type text ),
    AñoTrimestre = Table.AddColumn( Trimestre, "AñoTrimestre", each Number.ToText([Año]) & "-" & [Trimestre], type text ),
    OrdenAñoTrimestre = Table.AddColumn( AñoTrimestre, "OrdenAñoTrimestre", each [Año] * 10 + Date.QuarterOfYear([Fecha]), Int64.Type ),
    Semestre = Table.AddColumn( OrdenAñoTrimestre, "Semestre", each if [Mes] &lt;= 6 then "Semestre 1" else "Semestre 2", type text ),
    AñoSemestre = Table.AddColumn( Semestre, "Año Semestre", each Number.ToText([Año]) & "-" & [Semestre], type text ),
    OrdenAñoSemestre = Table.AddColumn( AñoSemestre, "OrdenAñoSemestre", each [Año] * 10 + Number.FromText( Text.End([Semestre], 1) ), Int64.Type ),
    PrimerDíaSemana = Table.AddColumn( OrdenAñoSemestre, "PrimerDíaSemana", each Date.StartOfWeek([Fecha]), type date ),
    ÚltimoDíaSemana = Table.AddColumn( PrimerDíaSemana, "ÚltimoDíaSemana", each Date.EndOfWeek([Fecha]), type date ),
    PrimerDíaMes = Table.AddColumn( ÚltimoDíaSemana, "PrimerDíaMes", each Date.StartOfMonth([Fecha]), type date ),
    ÚltimoDíaMes = Table.AddColumn( PrimerDíaMes, "ÚltimoDíaMes", each Date.EndOfMonth([Fecha]), type date ),
    PrimerDíaTrimestre = Table.AddColumn( ÚltimoDíaMes, "PrimerDíaTrimestre", each Date.StartOfQuarter([Fecha]), type date ),
    ÚltimoDíaTrimestre = Table.AddColumn( PrimerDíaTrimestre, "ÚltimoDíaTrimestre", each Date.EndOfQuarter([Fecha]), type date ),
    PrimerDíaAño = Table.AddColumn( ÚltimoDíaTrimestre, "PrimerDíaAño", each Date.StartOfYear([Fecha]), type date ),
    ÚltimoDíaAño = Table.AddColumn( PrimerDíaAño, "ÚltimoDíaAño", each Date.EndOfYear([Fecha]), type date ),
    Semana = Table.AddColumn( ÚltimoDíaAño, "Semana", each "Sem " & Number.ToText( Date.WeekOfYear([Fecha]) ), type text ),
    OrdenSemana = Table.AddColumn( Semana, "OrdenSemana", each Date.WeekOfYear([Fecha]), Int64.Type ),
    AñoSemana = Table.AddColumn( OrdenSemana, "AñoSemana", each Number.ToText([Año]) & "-" & [Semana], type text ),
    OrdenAñoSemana = Table.AddColumn( AñoSemana, "OrdenAñoSemana", each [Año] * 100 + [OrdenSemana], Int64.Type ),
    #"Laborable/Festivo" = Table.AddColumn( OrdenAñoSemana, "Laboral/FinSemana", each if [DíaSemana] &lt;= 5 then "Laborable" else "Festivo", type text ),
    CuentaLaborable = Table.AddColumn( #"Laborable/Festivo", "CuentaLaborable", each if [DíaSemana] &lt;= 5 then 1 else 0, Int64.Type ),
    CuentaFinDeSemana = Table.AddColumn( CuentaLaborable, "CuentaFinDeSemana", each if [DíaSemana] &lt;= 5 then 0 else 1, Int64.Type ),
    Estaciones = Table.AddColumn( CuentaFinDeSemana, "Estacion", each
        if Number.FromText( Date.ToText([Fecha], "MMdd") ) &lt; 0320 then "INVIERNO" else
        if Number.FromText( Date.ToText([Fecha], "MMdd") ) &lt; 0621 then "PRIMAVERA" else
        if Number.FromText( Date.ToText([Fecha], "MMdd") ) &lt; 0921 then "VERANO" else
        if Number.FromText( Date.ToText([Fecha], "MMdd") ) &lt; 1221 then "OTOÑO" else "INVIERNO", type text ),
    DíasInicioAño = Table.AddColumn( Estaciones, "DíasInicioAño", each Duration.Days([Fecha] - [PrimerDíaAño]) + 1, Int64.Type ),
    DíasFinAño = Table.AddColumn( DíasInicioAño, "DíasFinAño", each Duration.Days([ÚltimoDíaAño] - [Fecha]), Int64.Type ),
    DesvíoDías = Table.AddColumn( DíasFinAño, "DesvíoDías", each Duration.Days([Fecha] - vHoy), Int64.Type ),
    DesvíoMes = Table.AddColumn( DesvíoDías, "DesvíoMes", each (([Año] - Date.Year(vHoy)) * 12) + ([Mes] - Date.Month(vHoy)), Int64.Type ),
    DesvíoTrimestre = Table.AddColumn( DesvíoMes, "DesvíoTrimestre", each (([Año] - Date.Year(vHoy)) * 4 + Date.QuarterOfYear([Fecha]) - Date.QuarterOfYear(vHoy)), Int64.Type ),
    DesvíoAño = Table.AddColumn( DesvíoTrimestre, "DesvíoAño", each [Año] - Date.Year(vHoy), Int64.Type )
in
    DesvíoAño</pre>
<h4>Ordenar fechas y ejes</h4>
<p>Para corregir el orden: seleccionar la columna > Herramientas de columna > <b>Ordenar por columna</b> > la columna con el criterio correcto.</p>
<p><b>Eje categórico</b>: dibuja todos los puntos y aparece un scroll. <b>Eje continuo</b>: con la fecha como valor no hay scroll, pero no aparecen todos los puntos. Para ver el gráfico a nivel mes y sin scroll se crea una columna con el fin de mes de cada fecha (<code>"Mes y año", EOMONTH( [Date], 0 )</code>), se usa en el eje continuo y se cambia el formato a <b>mmm yy</b> en Herramientas de columna > Formato.</p>`});

NOTES.push({t:"ti", s:S + " · Modelar · Inteligencia de tiempo", h:`
<pre class="dcode">Solicitudes PY =
CALCULATE( [Solicitudes], SAMEPERIODLASTYEAR( Calendario[Fecha] ) )

-- YoY con resta y división directa: da infinito y rompe los gráficos
-- mejor con DIVIDE (el tercer argumento es lo que se muestra si no hay dato)
Solicitudes YoY =
DIVIDE( [Solicitudes] - [Solicitudes PY], [Solicitudes PY] )

Solicitudes YoY (con alternativo) =
DIVIDE( [Solicitudes] - [Solicitudes PY], [Solicitudes PY], 0 )

Solicitudes PM =
CALCULATE( [Solicitudes], DATEADD( Calendario[Fecha], -1, MONTH ) )
-- 1. tabla de fechas  2. intervalo  3. DAY, MONTH, QUARTER, YEAR</pre>
<p>SAMEPERIODLASTYEAR devuelve el resultado un año atrás respecto a la fecha del contexto. DATEADD es más versátil: año, mes o 7 días antes o después (negativo hacia el pasado, positivo hacia el futuro).</p>
<h4>Acumulados</h4>
<pre class="dcode">Solicitudes DATESYTD =
CALCULATE( [Solicitudes], DATESYTD( Calendario[Fecha] ) )
-- acumulado del año natural; se reinicia cada año

Solicitudes DATESYTD fiscal =
CALCULATE( [Solicitudes], DATESYTD( Calendario[Fecha], "31/08" ) )
-- el tercer argumento cambia el cierre: reinicia en septiembre

Solicitudes TOTALYTD =
TOTALYTD( [Solicitudes], Calendario[Fecha] )</pre>
<h4>Medidas de saldo (semiaditivas)</h4>
<ul><li><b>CLOSINGBALANCEMONTH</b>: valor al cierre de cada mes.</li><li><b>OPENINGBALANCEMONTH</b>: valor a la apertura de cada mes.</li><li><b>LASTDATE</b>: devuelve la última fecha de un conjunto de datos o de una columna de fechas; se combina con CALCULATE, FILTER o TOTALYTD.</li><li><b>LASTNONBLANKVALUE</b>: el último valor no vacío.</li></ul>`});

NOTES.push({t:"grupos", s:S + " · Modelar · Grupos de cálculo", h:`
<p>Forma de organizar y reutilizar cálculos para simplificar la gestión de medidas y hacerlas dinámicas. Se construyen desde la <b>vista de modelo</b> (se pueden crear varios). Su uso más común es la inteligencia de tiempo: solo se crean las medidas base y no X medidas por cada variante temporal.</p>
<p>Al crear un grupo de cálculo ya no se puede tomar una columna numérica y construir un gráfico con ella (medida implícita); las medidas explícitas sí. Los gráficos anteriores con medidas implícitas se respetan.</p>
<ul><li>Se crea el grupo y se selecciona <b>Elemento de cálculo</b>. El primero se llama Actual.</li><li>Previous Year (PY): en lugar de la medida se pone <b>SELECTEDMEASURE()</b>, que toma la medida que haya para crear el nuevo cálculo.</li><li>YoY: hay que poner las cifras en porcentaje (0.0 %) con la cadena de formato del elemento.</li><li>Los grupos de cálculo también sirven para <b>segmentar</b>: un segmentador con Grupo de cálculo > Inteligencia de tiempo, y un gráfico de líneas que muestra cada variante.</li></ul>
<p>Vídeo de Alex Ayala con explicación extensa: youtube.com/watch?v=2WJRcusmvSM.</p>`});

NOTES.push({t:"calculate", s:S + " · Modelar · REMOVEFILTERS y porcentajes", h:`
<pre class="dcode">% Solicitudes por prioridad =
VAR _total = CALCULATE( [Solicitudes], REMOVEFILTERS( Prioridad[NombrePrioridad] ) )
RETURN DIVIDE( [Solicitudes], _total )

Total de solicitudes =
CALCULATE( [Solicitudes],                              -- solicitudes sin borrar la columna
           REMOVEFILTERS( Prioridad[NombrePrioridad] ) ) -- quitar los filtros

% de solicitudes =
DIVIDE( [Solicitudes],
        CALCULATE( [Solicitudes], REMOVEFILTERS( Prioridad[NombrePrioridad] ) ) )</pre>`});

NOTES.push({t:"vertipaq", s:S + " · Modelar · Cardinalidad y rendimiento", h:`
<p>Dentro de «Optimizar el rendimiento del modelo», el temario trabaja la <b>mejora del rendimiento al reducir la granularidad</b>: si el negocio no necesita el detalle diario o por línea, agrupar en Power Query (por mes, por producto) reduce filas y cardinalidad. También la <b>cardinalidad de una columna</b>: cuantos menos valores distintos, mejor compresión.</p>`});

/* ── VISUALIZAR Y ANALIZAR ── */
NOTES.push({t:"percepcion", s:S + " · Visualizar · Catálogo de gráficos", h:`
<h4>Barras y columnas</h4>
<ul><li><b>Barras apiladas</b>: comparar los totales de las categorías; usa el valor de X para la longitud.</li><li><b>Barras agrupadas</b>: comparar los elementos de la leyenda dentro de cada categoría; ideal para comparar subcategorías directamente.</li><li><b>Barras apiladas al 100 %</b>: el peso porcentual de cada parte; todas las barras miden lo mismo.</li><li>Las mismas tres variantes en <b>columnas</b>.</li></ul>
<h4>Líneas y áreas</h4>
<ul><li><b>Líneas</b>.</li><li><b>Áreas</b>: se ven los valores individualmente.</li><li><b>Áreas apiladas</b>: se suman los valores.</li><li><b>Áreas 100 % apiladas</b>.</li><li><b>Cintas</b> (ribbon): parecido a columnas apiladas, pero muestra el ranking de cada categoría en cada periodo.</li><li><b>Columnas apiladas y líneas</b> y <b>columnas agrupadas y líneas</b> (combinados).</li></ul>
<h4>Otros</h4>
<ul><li><b>Cascada</b>, <b>embudo</b>, <b>dispersión</b>, <b>circular</b> y <b>anillo</b>.</li><li><b>Treemap</b>: un segundo campo en <b>Categoría</b> crea una jerarquía que el usuario tiene que explorar; en <b>Detalles</b> subdivide los rectángulos a la vez.</li><li><b>Mapa</b> (requiere Opciones > Seguridad > Usar elementos visuales de mapa y mapa coroplético; se conecta a internet), <b>mapa coroplético</b> y <b>mapa de Azure</b>.</li><li><b>Medidor</b> (permite definir objetivos), <b>tarjeta</b> y <b>KPI</b>.</li><li><b>Segmentadores</b>, <b>tabla</b>, <b>matriz</b>, visuales de <b>R</b> y <b>Python</b>.</li></ul>
<h4>Líneas analíticas</h4>
<p>Líneas de tendencia, predicciones y líneas de referencia. <b>Detector de anomalías</b> en gráficos de líneas. <b>Agrupar datos en un diagrama de dispersión</b> (clústeres).</p>
<h4>Visuales de IA (salen seguro en el examen)</h4>
<ul><li><b>Elementos influyentes clave</b>.</li><li><b>Esquema jerárquico</b> (árbol de descomposición): se puede explorar de forma manual o automática (mayor y menor valor).</li><li><b>Preguntas y respuestas</b>.</li><li><b>Narrativa</b>: genera un texto según los elementos del gráfico.</li></ul>
<h4>Objeto visual personalizado</h4>
<p>Se importan desde AppSource o desde archivo.</p>
<h4>Informe paginado</h4>
<p>Se construye con la aplicación independiente <b>Power BI Report Builder</b>. Se usa cuando lo creado en Power BI debe usarse en otra herramienta o cuando hay que exportar una tabla inmensa a PDF, Excel o PowerPoint.</p>`});

NOTES.push({t:"interactividad", s:S + " · Visualizar · Interacción, formato y navegación", h:`
<h4>Formato condicional</h4>
<p>Colorea valores (por ejemplo positivos y negativos): Formato > Columnas > Color > Formato condicional. Estilos: <b>degradado</b>, <b>regla</b> y <b>campo</b> (un valor creado con DAX). En <b>textos</b> también: un título que cambia según la selección de fechas, con una medida DAX. En <b>tablas</b>: barras de datos (si quieres el título invisible, usa un carácter invisible), <b>iconos</b> y <b>URL web</b>. También con una fórmula DAX como campo.</p>
<h4>Información sobre herramientas (tooltip)</h4>
<p>Se configura una página de tooltip en dos sitios: Información de la página > Tipo de página > Información sobre herramientas, o Configuración del lienzo > Tipo > Información sobre herramientas. Pasos: crear una página nueva, configurarla y, en el visual, Propiedades > Información sobre herramientas > elegir la página.</p>
<h4>Grupos y discretización</h4>
<p>Agrupar valores de una columna o crear intervalos (bins) en columnas numéricas o de fecha.</p>
<h4>Segmentación y filtrado</h4>
<p>Formato > <b>Editar interacciones</b>: cada gráfico muestra iconos con tres opciones: <b>ninguno</b>, <b>resaltado</b> (muestra el segmento seleccionado en los demás gráficos) y <b>filtrado</b>. Por defecto Power BI resalta; se cambia en Opciones > Configuración de informe > «Cambiar la interacción predeterminada de los objetos visuales de marcado a filtrado cruzado». Ejemplo: al marcar BAJA en el anillo, con resaltado los demás gráficos marcan la parte de BAJA; con filtrado solo muestran BAJA.</p>
<h4>Jerarquías, filtro cruzado y exploración en profundidad</h4>
<p>Para no confundirse al filtrar, pon el año en la leyenda (cada año de un color). Al explorar en profundidad los filtros afectan a los demás gráficos de la página; si no quieres, Formato > <b>Aplicar filtros de exploración en profundidad a</b> > objeto visual seleccionado.</p>
<h4>Sincronizar segmentaciones y panel de selección</h4>
<p>Vista > Sincronizar segmentaciones para que un segmentador afecte a varias páginas. El <b>panel de selección</b> controla visibilidad y orden.</p>
<h4>Elementos de navegación</h4>
<p>En el examen preguntan por el <b>navegador de páginas</b> y el <b>navegador de marcadores</b>, y por sus opciones: mostrar páginas ocultas, mostrar páginas de información sobre herramientas y mostrar todo de forma predeterminada. También botones de navegador de página.</p>
<h4>Criterios de organización (contenido nuevo del examen)</h4>
<p>Para ordenar por un criterio (que el primer año sea el de más facturación) se usa el <b>segmentador de mosaico</b> y se incluye el criterio en <b>Información sobre herramientas</b>.</p>
<h4>Forzar el orden de capas</h4>
<p>Para que una tarjeta se muestre siempre encima: en los gráficos implicados, Formato > Propiedades > Opciones avanzadas > <b>Mantener el orden de las capas</b>. En Desktop parece no cambiar, pero en Service sí. En las imágenes viene activo por defecto; en los gráficos no.</p>
<h4>Agrupar capas</h4>
<p>Seleccionar los visuales > clic derecho > Agrupar. El grupo se puede copiar y pegar en otra página.</p>
<h4>Marcadores</h4>
<p>Una instantánea del estado del tablero en un momento. Se pueden agrupar (dos grupos de 4 marcadores) y usar con el navegador de marcadores.</p>
<h4>Exportación de datos</h4>
<p>Genera un CSV con la información del gráfico seleccionado; es la exportación predeterminada de Desktop. Permisos para exportar y Analizar en Excel: conexión estática o dinámica (un Excel conectado a un modelo de Power BI). En Desktop hay privilegios para acceder a todo, pero al publicar puede querer restringirse. Para quitar la descarga: Opciones > Archivo actual > Configuración de informes > Exportar datos > <b>No permitir a los usuarios finales exportar datos del servicio o de Report Server</b>. También en Service: Informe > … > Configuración.</p>`});

/* ── ADMINISTRACIÓN Y PROTECCIÓN ── */
NOTES.push({t:"roles", s:S + " · Administración · Áreas de trabajo, licencias y roles", h:`
<h4>Grupo de seguridad</h4>
<p>Cuando el examen habla de grupos de seguridad se refiere a grupos de trabajo. Se crean fuera de Power BI (Microsoft 365 / Entra) pero le afectan: se añaden propietarios y miembros y se configuran permisos sobre el grupo en vez de persona a persona. El <b>Centro de administración de Microsoft Entra</b> es el nivel superior de gestión de usuarios de la organización.</p>
<h4>Áreas de trabajo</h4>
<p>Es un área privada: tu espacio dentro de un escritorio. Compartir algo de ella requiere <b>licencias de pago</b> (es dejar las llaves del cajón a alguien); con licencia gratuita no se puede compartir. Al crearla: nombre, descripción (opcional), <b>dominio</b> (capa de control: Marketing 1, 2 y 3 en el dominio Marketing para gestionarlas a la vez) e imagen.</p>
<h4>Modo de licencia (avanzado)</h4>
<p>Las licencias se asignan a nivel de persona y de área de trabajo, como zonas VIP de un aeropuerto: quien tiene Premium (la más alta) entra en áreas Pro, pero quien tiene Pro no entra en áreas Premium. <b>Pro</b> y <b>Premium por usuario</b> son a nivel de persona (con Pro se puede elegir la región de los servidores, Europa o América). El diamante indica Premium; diamante con persona, Premium por usuario; el diamante solo, licencias de empresa (capacidad). Premium permite modelos más grandes y <b>aplicaciones de plantilla</b> (un dashboard estándar para toda la empresa). Las otras tres licencias son de empresa y se pagan por consumo. <b>Power BI Embedded</b> permite poner tableros en CRM de terceros.</p>
<h4>Roles del área de trabajo</h4>
<table class="t"><tr><th>Rol</th><th>Resumen</th><th>Acceso</th><th>Permisos</th></tr>
<tr><td><b>Visor</b></td><td>Solo puede ver. No puede publicar desde Desktop.</td><td>Solo al informe</td><td>Ver un elemento e interactuar con él; leer datos de los flujos de datos del área.</td></tr>
<tr><td><b>Colaborador</b></td><td>Modifica conjunto de datos e informes. No asigna roles.</td><td>Informe y modelo</td><td>Publicar informes; crear, editar y eliminar contenido; rol con privilegios mínimos para programar actualizaciones de datos.</td></tr>
<tr><td><b>Miembro</b></td><td>Permisos inferiores al administrador; no puede eliminar el área. Da acceso como visor y colaborador.</td><td>Informe y modelo</td><td>Agregar miembros y usuarios con permisos inferiores; publicar, anular la publicación y cambiar permisos de una app.</td></tr>
<tr><td><b>Administrador</b></td><td>Plenos poderes sobre el área.</td><td>Informe y modelo</td><td>Actualizar y eliminar el área; agregar o quitar personas, incluidos administradores; único con permiso para actualizar los metadatos del área.</td></tr></table>
<p>Existe además el administrador superior, que gestiona todo Power BI de la organización.</p>
<h4>Exportaciones según el rol</h4>
<p>El <b>Visor</b> puede exportar a PDF y PowerPoint y usar Analizar en Excel. <b>PDF</b> devuelve una captura sin interacción. <b>PowerPoint</b>: «Insertar datos en directo» (Power BI dentro de PowerPoint, con botones; el usuario necesita acceso) o «Exportar como imagen» (igual que PDF). El <b>Colaborador</b> puede analizar en Excel conectado al modelo, ve el botón Editar y tiene acceso al modelo semántico (a los datos).</p>
<h4>Compartir sin dar acceso al área</h4>
<p>Se puede compartir un elemento sin dar acceso a toda el área. Al compartir el modelo, dejando marcada la tercera casilla se da permiso para crear informes. El usuario lo encuentra en el catálogo de <b>OneLake</b> o desde Desktop > Obtener datos > Modelos semánticos de Power BI.</p>`});

NOTES.push({t:"service", s:S + " · Administración · Paneles, alertas, actualización y aplicaciones", h:`
<h4>Compartir informes: insertar</h4>
<p>Opciones de inserción del informe (sitio web, SharePoint, Teams).</p>
<h4>Paneles</h4>
<p>Usan gráficos de distintos informes de la <b>misma área de trabajo</b> consolidados en un panel. En el examen un elemento del panel puede llamarse <b>icono</b> o <b>mosaico</b>. Vídeos: si es de YouTube o Vimeo → Vídeo; de otra plataforma → Contenido web insertado.</p>
<ul><li>Los segmentadores influyen en la página completa, no en los otros visuales del panel. Para anclar un segmentador, ancla la <b>página completa</b>.</li><li>Si un visual no existe en ningún informe del área, se consigue con <b>Preguntas y respuestas</b>.</li><li>Pueden combinar datos de varios conjuntos de datos (los informes no).</li><li>No incluyen los paneles Filtros, Visualizaciones y Campos de Desktop.</li><li>Se crean con Nuevo elemento; se anclan visuales con la chincheta superior de cada gráfico.</li><li>Se les pueden aplicar temas, crear <b>suscripciones</b> y chatear en <b>Teams</b>.</li></ul>
<h4>Alertas en paneles</h4>
<p>Se administran con licencia <b>Pro</b> o <b>Premium por usuario</b>. Solo funcionan en <b>medidor, tarjeta y KPI</b>. Las alertas dentro de un informe solo se pueden con Fabric a través de <b>Activator</b>.</p>
<h4>Actualización de un informe</h4>
<p>Al publicar se generan el informe y el modelo semántico (es el que hay que actualizar). Dos formas: actualizar en Desktop y volver a publicar, o en el modelo semántico de Service pulsar Actualizar o programar una actualización.</p>
<h4>Aplicaciones</h4>
<p>Generan elementos de solo lectura: no se puede modificar nada. Muestran los elementos de un área de trabajo decidiendo cuáles se ven y con una capa adicional de <b>audiencias</b> específicas. En Contenido se elige y estructura lo que entra; en Audiencia, si lo ve toda la empresa o solo quien elijas, y qué ve cada uno. Se pueden buscar apps no instaladas: las de tu empresa y las <b>apps de plantilla</b> (construidas por empresas para contratarlas).</p>
<p><b>Actualizar una app</b>: en el informe ves los cambios al instante, en la app no. La app permite al desarrollador controlar cuándo ven los cambios los usuarios: hasta pulsar <b>Actualizar la aplicación</b> no cambian. Solo pueden actualizar apps los <b>administradores</b> y <b>miembros</b> del área. El colaborador no, salvo que el administrador le dé permiso.</p>
<h4>Actualización del modelo en la nube</h4>
<p>Configuración del modelo semántico: credenciales, puerta de enlace y programación.</p>
<h4>Actualización incremental</h4>
<p>Actualiza solo los datos nuevos o modificados en lugar de recargar todo el conjunto desde cero: ahorra tiempo y mejora el rendimiento al procesar menos datos. Se configura con parámetros de rango de fechas en Power Query y la directiva de actualización incremental de la tabla.</p>`});

/* ── REPASO GENERAL ── */
NOTES.push({t:"relaciones", s:S + " · Repaso general", h:`
<ul><li>Diagrama con relaciones bidireccionales: entre Categoría y Solicitudes no tiene que haber doble dirección (1:*). Entre Países y Clientes el concepto es la <b>cardinalidad</b> (no puede darse varios a varios). Te pueden preguntar qué tipo de modelo es: estrella o <b>copo de nieve</b>.</li>
<li>Cliente-Ventas: varios a varios, imposible; 1:1, solo si casualmente cada cliente compró una vez; <b>varios a uno entre Ventas y Cliente</b>, correcto; uno a varios entre Cliente y Ventas… cuidado con el orden en que se dice.</li>
<li>Dos tablas con RLS que necesitan filtro cruzado bidireccional que aplique seguridad: activar la casilla de aplicar filtro de seguridad en ambas direcciones.</li></ul>`});
})();
