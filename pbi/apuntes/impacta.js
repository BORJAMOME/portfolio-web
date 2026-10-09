/* Apuntes de Notion · «Impacta con Power BI» (Salvador Ramos), 9 capítulos + caso práctico Tiendas AHORA */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){
var S = "Impacta con Power BI · Salvador Ramos";

NOTES.push({t:"bi", s:S + " · cap. 1", h:`
<h4>Sobre el libro</h4>
<p>Guía práctica para aprender Power BI pensada para profesionales con o sin experiencia. A través de un caso real (Tiendas AHORA) se construye un proyecto completo: desde entender las preguntas de negocio hasta publicar el informe en la nube. Se aprende qué preguntas hacer al empezar, cómo organizar los datos, cómo convertirlos en gráficos útiles y cómo compartirlos con el equipo.</p>
<h4>¿Qué es BI?</h4>
<p>Business Intelligence es el conjunto de estrategias, tecnologías y metodologías que permiten transformar los datos en información relevante y de calidad, a partir de la cual inferimos el conocimiento con el que tomar mejores decisiones en el negocio.</p>
<h4>Power BI como plataforma</h4>
<ul><li>Múltiples conectores con orígenes de datos muy diversos.</li><li>Un servicio en la nube donde publicar y compartir las soluciones.</li><li>Herramientas de administración y de acceso a la información compartida.</li><li>Flujos de datos (Dataflows), puerta de enlace (Data Gateway) y aplicaciones para móviles.</li><li>Forma parte de Office 365, lo que facilita la colaboración en la toma de decisiones.</li></ul>
<h4>Power BI Desktop: sus cuatro piezas</h4>
<ul><li><b>Power Query</b>: herramienta ETL (Extract, Transform and Load). Conecta con muchos orígenes para obtener, transformar y cargar los datos en el modelo. Es el punto de unión entre los datos dispersos y su almacenamiento en Power BI.</li>
<li><b>Modelos semánticos</b>: base de datos analítica en memoria que almacena la información y permite acceder a ella de forma rápida gracias al lenguaje de consultas DAX.</li>
<li><b>Informes (Reports)</b>: la parte visible. Con los distintos visuales se responde de forma rápida, clara y concisa a las preguntas de negocio.</li>
<li><b>Publicar</b>: sube la solución hecha en Desktop al servicio en la nube para compartirla con la organización.</li></ul>`});

NOTES.push({t:"bi7", s:S + " · cap. 1", h:`
<h4>Método BI7: ciclo de desarrollo de soluciones Power BI</h4>
<ol><li>Toma de requisitos y batería de preguntas de negocio.</li><li>Diseño del modelo de datos en estrella y boceto de los informes.</li><li>Acceder, transformar, limpiar y cargar los datos con Power Query para conseguir la estructura de tablas diseñada.</li><li>Optimizar el modelo de datos.</li><li>Crear los cálculos DAX necesarios para responder a las preguntas de negocio.</li><li>Diseñar y crear los informes.</li><li>Compartir y colaborar mediante el servicio de Power BI en la nube.</li></ol>
<p><b>1. Requisitos.</b> Batería de 50 a 100 preguntas. Sirven para validar el modelo, para elegir la mejor técnica de visualización y para agruparlas en informes y dashboards de forma óptima.</p>
<p><b>2. Diseño.</b> Equivocarse aquí condiciona todo el proyecto. El modelo debe diseñarse acorde al paso 1 y resolver de forma eficiente el análisis planteado.</p>
<p><b>3. Power Query.</b> Se extraen los datos de distintas fuentes, se integran y transforman según el paso 2 y se cargan en el modelo. Hay que tener claro el punto de destino: qué tablas necesitas, qué columnas tiene cada una y cómo se relacionan.</p>
<p><b>4. Optimizar.</b> Configurar, ajustar y optimizar cada tabla, columna y relación: tipos de datos óptimos, ordenación correcta de los valores de cada columna, formato adecuado y relaciones basadas en el bus dimensional diseñado.</p>
<p><b>5. DAX.</b> Con el modelo listo se le añade toda la capacidad de cálculo necesaria.</p>
<p><b>6. Informes.</b> Diseñar y crear los informes y cuadros de mando que respondan de forma óptima a la batería de preguntas del paso 1.</p>
<p><b>7. Compartir.</b> Publicar en el servicio en la nube para que todos analicen y colaboren con el sistema de información centralizado.</p>`});

NOTES.push({t:"preguntas", s:S + " · cap. 1 · Caso Tiendas AHORA", h:`
<h4>El caso práctico</h4>
<p>Tiendas AHORA es una cadena de tiendas de las que encuentras en una zona turística, en un paseo marítimo o en tu barrio: prensa, una botella de agua, un refresco, una camiseta de la ciudad o un paraguas. Se analizan sus ventas. La gerencia tiene un TPV que recopila todas las ventas, pero solo ve algunos informes puntuales y la recaudación diaria. Necesita una solución analítica que responda a las preguntas que se hace en el día a día.</p>
<h4>Batería de preguntas de la gerencia</h4>
<ul><li>¿Cuánto he vendido en una tienda, en una provincia, en un país? ¿Cada día, mes, semana, año, en Semana Santa, en el puente de diciembre?</li>
<li>¿Qué productos se venden más? ¿Se comportan igual en todas las tiendas? ¿Se venden igual todos los meses o tienen picos? (Los helados se venden más en verano, pero quiero ver cómo se comporta cada producto a lo largo del tiempo).</li>
<li>Además de las ventas quiero conocer el beneficio: ¿qué productos me dejan más importe de beneficio? ¿Obtengo el mismo beneficio en las distintas tiendas para un mismo producto?</li>
<li>Tengo objetivos de ventas por tienda: ¿los cumplo mes a mes? ¿Cuánto me desvío? ¿Cómo los cumple cada tienda? ¿Qué tiendas van mejor o peor?</li>
<li>Quiero comparar con meses y años anteriores: ¿cuánto suben o bajan las ventas frente al mes anterior y al año anterior? ¿Puedo comparar por trimestres? ¿Y por semanas?</li>
<li>Quiero aumentar lo que compra cada cliente: ¿cuántas ventas hago al día, mes o año? ¿Cuánto me compra cada cliente (ticket medio)? ¿Qué diferencias hay entre tiendas? ¿Es similar todos los meses?</li>
<li>Más comparativas: ventas y margen; un mes frente al anterior; un mes frente al mismo mes del año anterior (el negocio es estacional); ventas desde inicio de año y su comparación entre años.</li>
<li>Por productos y categorías (familias): ¿qué categorías vendo más? ¿Cuáles son los productos más vendidos de cada categoría? ¿Cómo se comporta cada categoría a lo largo de los meses (picos y valles)?</li></ul>
<h4>Cómo preparar la batería de preguntas</h4>
<ol><li>Bloquea 30 minutos al día durante una semana. Mejor 2 h 30 repartidas (30 minutos durante 5 días) que 3 horas seguidas.</li>
<li>Escribe todas las preguntas que se te ocurran, aunque parezcan básicas, complejas, extrañas o poco habituales.</li>
<li>Activa tu mente para recopilar preguntas durante esos días: envíate un correo, graba una nota de voz; luego las pasas al documento en tu bloque de 30 minutos.</li>
<li>Si varias personas tienen preguntas sobre el negocio, cada una hace el ejercicio de forma independiente y sin compartir hasta terminar.</li>
<li>Reúne los documentos en una reunión, ponlos en común y descarta las preguntas abiertas.</li>
<li>Extrae las prioritarias: de cada 100, quédate con 10-15.</li></ol>
<p>Si eres consultor y son tus clientes quienes hacen la recopilación, habla con ellos y hazles ver el beneficio y la importancia del ejercicio.</p>
<p><b>Recuerda:</b> las preguntas de negocio son siempre el primer paso. Cuanto mejores sean las preguntas, mejores respuestas. Las preguntas van antes que las respuestas.</p>`});

NOTES.push({t:"estrella", s:S + " · cap. 2", h:`
<h4>Modelado dimensional</h4>
<p>Conjunto de técnicas, métodos y fundamentos para diseñar una estructura de tablas que responda de forma rápida y eficiente a las preguntas de negocio.</p>
<h4>Orígenes de los datos</h4>
<ul><li><b>Sistemas transaccionales y bases de datos relacionales normalizadas (SQL)</b>: diseñadas para automatizar procesos (ERP, CRM, aplicaciones departamentales, TPV) con muchos usuarios escribiendo y consultando a la vez. Sus tablas siguen las formas normales (hay hasta 6+2; lo habitual es aplicar las 3 primeras). Una base en 3FN tiene cientos de tablas: Business Central (antes Navision) tiene al menos 1.500 en una instalación base. Pide al departamento o proveedor acceso de solo lectura y documentación para localizar tablas y columnas.</li>
<li><b>Ficheros (Excel, texto, CSV)</b>: se obtienen con los botones «Exportar a…» de las aplicaciones o pidiéndolos a IT. Excel tiene límites: una tabla dinámica solo lee un rango (una estructura de tabla) y BUSCARV entre tablas es lento.</li>
<li>Bases de datos semiestructuradas, no estructuradas y otras fuentes.</li></ul>
<p>El diseño en estrella se hace <b>antes de abrir Power BI</b>, con PowerPoint, Word o Excel.</p>
<h4>Departamentos frente a procesos de negocio</h4>
<p>Error frecuente: crear soluciones de BI aisladas por departamento. Cada área tiene sus propios datos, indicadores y versiones, y las cifras no coinciden (Marketing dice 100 camisetas, Facturación 95 y Tiendas 110). La solución es organizar los datos por <b>procesos de negocio</b> (Ventas), con un único modelo centralizado por proceso al que se añaden las necesidades de cada departamento. Resultado: una única fuente de la verdad, con datos consistentes y consensuados. Para BI developers refuerza los principios de modelos estrella compartidos por proceso, gobernanza y cálculo unificado de KPIs, DRY (Don't Repeat Yourself) y escalabilidad con mantenimiento simplificado.</p>
<p><b>Recuerda:</b> los cuadros de mando son específicos de cada departamento (sus KPIs y su punto de vista), pero la base de datos analítica es única y se estructura por procesos de negocio.</p>
<h4>Cómo se diseña: el caso Ventas</h4>
<ol><li>Identificar el proceso de negocio (los más comunes: Compras, Ventas, Finanzas, Stocks). Aquí: <b>Ventas</b>.</li>
<li>Hablar con cada departamento y persona que analiza ventas para que cada miembro prepare su batería de preguntas, con gerencia como nexo entre departamentos.</li>
<li>Recopilar las preguntas y diseñar la base de datos: decidir el nivel de detalle de la historia (aquí, el máximo disponible en el TPV: cada línea de cada ticket) e identificar cada punto de vista.</li></ol>
<p>Puntos de vista: ¿a quién he vendido? <b>Cliente</b>. ¿Cuándo? <b>Fecha</b>. ¿Dónde? <b>Tienda</b>. ¿Qué he vendido? <b>Producto</b>. ¿Quién vendió? <b>Empleado</b>.</p>
<p>Indicadores a medir inicialmente: PVP, importe vendido, descuento aplicado, coste asignado a cada venta y beneficio (venta − coste) neto y porcentual.</p>
<p>Atributos por punto de vista: <b>Cliente</b> (código, nombre, edad, tipo, código postal, ciudad, provincia, región, país, zona, salario, riesgo); <b>Fecha</b> (día, mes, año, trimestre, día de la semana, es festivo); <b>Tienda</b> (código, nombre, superficie en m², empleados, código postal, ciudad, país, zona, tamaño, tipo de tienda); <b>Producto</b> (código, descripción, tipo, subtipo, grupo, ubicación, familia, subfamilia, tamaño, color); <b>Empleado</b> (código, nombre, apellidos, edad, salario, departamento, sección, grupo).</p>
<p>Cuantos más indicadores, puntos de vista y atributos, más ricas y poderosas serán las analíticas. Para responder cualquier pregunta necesitamos siempre: algo que medir, describir lo que medimos, filtrar y agrupar (por ejemplo, para la tienda de Águilas, en mayo de 2019, categoría Bebidas).</p>
<p>Resumen del diseño: 1) proceso de negocio Ventas; 2) historia al máximo detalle disponible (cada línea de cada ticket); 3) indicadores PVP, importe, descuento, coste y beneficio; 4) cinco puntos de vista (Cliente, Fecha, Tienda, Producto, Empleado) con muchos atributos cada uno.</p>
<h4>Hechos y dimensiones</h4>
<table class="t"><tr><th>Hechos</th><th>Dimensiones</th></tr><tr><td>Detalles históricos del proceso de negocio: lo que ha ocurrido.</td><td>Perspectivas o puntos de vista desde los que se analizan esos hechos.</td></tr><tr><td>Una tabla de hechos por cada conjunto de información histórica de un proceso o subproceso (Ventas).</td><td>Una tabla por perspectiva (Cliente, Fecha, Tienda, Producto, Empleado).</td></tr><tr><td>Elemento central de la estrella.</td><td>Cada pico de la estrella.</td></tr></table>
<p>Ejemplo: «¿Cuál es el importe vendido de Bebidas en Águilas en mayo de 2019?». El importe sale siempre de los hechos (sumando ImporteVenta); se segmenta y filtra por categoría (dimensión Producto), tienda (dimensión Tienda) y mes (dimensión Fecha).</p>
<h4>Tablas, claves principales y externas</h4>
<ul><li>Las <b>columnas</b> son la estructura mínima de almacenamiento; su contenido debe ser único y con el tipo de datos adecuado.</li><li>Las <b>filas</b> son un registro único por elemento.</li><li><b>Clave principal</b>: columna (o combinación) que identifica de forma única cada fila.</li><li><b>Clave externa</b>: almacena esos mismos valores, que aquí sí pueden repetirse, para relacionar la tabla con la que contiene la clave principal.</li></ul>
<h4>Tabla de hechos</h4>
<p>Almacena los hechos medibles de un proceso (ventas, envíos, incidencias), con datos históricos para calcular KPIs. Características: <b>estrecha</b> (pocas columnas, sobre todo numéricas), <b>larga</b> (miles o millones de filas) y en <b>crecimiento constante</b>. Columnas: clave principal (opcional, solo si aporta valor al análisis), claves externas (relaciones con las dimensiones) y medidas (datos numéricos agregables: ventas, cantidades, costes).</p>
<h4>Granularidad</h4>
<p>El nivel de detalle más bajo de cada fila de hechos. Se define según el detalle necesario para responder todas las preguntas y el máximo disponible en origen.</p>
<table class="t"><tr><th>Escenario</th><th>Granularidad</th></tr><tr><td>Stock diario</td><td>Tienda + Producto + Día</td></tr><tr><td>Presupuesto mensual</td><td>Tienda + Mes</td></tr><tr><td>Ventas por ticket</td><td>Una fila por ticket (sin detalle de productos)</td></tr><tr><td>Ventas detalladas (recomendado)</td><td>Una fila por línea de ticket (detalle por producto)</td></tr></table>
<h4>Tablas de dimensiones</h4>
<p>Ponen los hechos en contexto y exponen las perspectivas de análisis (Fecha; Tienda, Producto, Cliente, Empleado, Proveedor; Geografía, Cuenta contable, Almacén, Máquina). Cuantas más tablas y columnas, más rico el análisis. Son <b>anchas</b> (muchas columnas), <b>cortas</b> (pocas filas) y con <b>poco crecimiento</b>. Columnas: clave principal (para relacionarse con los hechos) y una columna por cada característica de análisis (Fecha: día, mes, trimestre, año, día de la semana, festivo, campaña, temporada, semana del año; Cliente: código, nombre, ciudad, país, edad, tipo, estado civil; Proveedor: código, nombre, ciudad, país, tipo, zona). Una dimensión puede relacionarse con varias tablas de hechos.</p>
<p><b>Nota:</b> la dimensión Fecha es la más importante y común. Debe recoger lo necesario para analizar no solo por calendario natural, sino por periodos fiscales, campañas, temporadas y lo que cada negocio necesite.</p>
<h4>Bus dimensional</h4>
<p>Si se analizan varios procesos (ventas, compras, stocks, logística, finanzas), cada uno con su estrella, el bus dimensional es imprescindible: muestra de un vistazo todas las relaciones entre tablas de hechos y dimensiones. En el caso práctico las tablas de hechos son Ventas y Presupuestos.</p>
<h4>Pasos de diseño, en este orden y por cada estrella</h4>
<ol><li>Diseña la tabla de hechos: granularidad (máximo detalle), claves externas y medidas.</li><li>Diseña cada dimensión: clave principal y una columna por atributo.</li><li>Valida las relaciones: que en los hechos esté la clave externa de cada dimensión (un par clave externa/clave principal por pico de la estrella), con el mismo tipo de datos y con valores comunes en ambas tablas.</li></ol>
<p><b>Recuerda:</b> hechos, dimensiones, relaciones (en el sentido de las agujas del reloj).</p>`});

NOTES.push({t:"obtener", s:S + " · cap. 3", h:`
<h4>Para qué sirve Power Query</h4>
<p>Es el medio que automatiza la carga de datos del modelo. 1) <b>Extract</b>: se conecta a casi cualquier origen (bases SQL, Excel, CSV, web, APIs, SharePoint) y permite combinar varios (ventas de un ERP y datos de marketing en Excel). 2) <b>Transform</b>: el paso más importante: filtrar, dividir columnas, eliminar duplicados, cambiar tipos, pivotar, desnormalizar; los pasos son una receta automatizable y reutilizable. 3) <b>Load</b>: en Desktop el único destino posible es el modelo de datos; lo que defines aquí es lo que después usarás en visuales, relaciones y medidas.</p>
<h4>La interfaz del editor</h4>
<ul><li><b>Bloque 1 · Consultas</b>: todas las consultas; cada una representa una tabla o vista (Ventas, Clientes, Producto). La seleccionada se resalta en gris oscuro.</li>
<li><b>Bloque 2 · Datos</b>: vista previa de los datos transformados hasta el paso actual. Arriba se ve el código M generado por cada acción.</li>
<li><b>Bloque 3 · Pasos aplicados</b>: lista secuencial de acciones (cambiar tipo, quitar columnas, ordenar). Se pueden editar, eliminar o reordenar y se guarda el historial para volver atrás. Consejo: renombra los pasos (clic derecho > Cambiar nombre) para mantener el flujo.</li>
<li><b>Bloque 4 · Muestra</b>: por rendimiento Power Query solo carga <b>1.000 filas</b> de muestra. La vista previa puede diferir del resultado final; los pasos se aplican a todo el conjunto al cargar.</li></ul>
<h4>Obtener datos: los seis grupos de conectores</h4>
<ul><li><b>Archivo</b>: Excel, texto, CSV, XML, JSON, carpeta, PDF, Parquet, carpeta de SharePoint.</li>
<li><b>Base de datos</b>: SQL Server, Access, Oracle, Informix, DB2, MySQL, PostgreSQL y otras más nuevas (SAP HANA, Amazon Redshift, Google BigQuery).</li>
<li><b>Microsoft</b>: Power Platform (flujos de datos de Power BI, Common Data Service, Dataverse, modelos semánticos de Power BI) y Azure (SQL Database, Synapse Analytics SQL, Blob Storage, Data Lake Storage, Databricks).</li>
<li><b>Servicios en línea</b>: Salesforce, Google Analytics, Mailchimp, Marketo, LinkedIn, GitHub, Asana, Zendesk, Zoho Creator…</li>
<li><b>Otras</b>: Web, OData, Active Directory, Spark, ODBC, OLE DB…</li>
<li><b>Consulta en blanco</b>: abre el editor para escribir M directamente; útil para conectar a servicios con API.</li></ul>
<h4>SQL Server</h4>
<p>Servidor, base de datos (opcional, también se puede elegir después) y modo de conectividad. Deja <b>Importar</b>, que lee los datos y los importa al modelo. No uses DirectQuery salvo que te documentes y entiendas perfectamente lo que hace: está para situaciones muy concretas. Con conocimientos de SQL, en «Opciones avanzadas» puedes escribir la instrucción. Tras autenticarte con los datos que te dé el administrador, marca las tablas y vistas a importar.</p>
<h4>Archivos de texto y CSV</h4>
<p>Admite cualquier separador o ancho fijo. Revisa tres cosas: 1) el <b>origen de archivo</b> (codificación) para no ver caracteres extraños en eñes y tildes; 2) el <b>delimitador</b>, comprobando que salen exactamente las columnas esperadas; 3) la <b>detección del tipo de datos</b>: el autor prefiere decidir él los tipos, porque Power Query no conoce las reglas de negocio (las tiendas «001», «002» parecen números, pero mañana puede llegar «T01» y la carga fallará).</p>
<h4>Libros de Excel</h4>
<p>Power Query identifica las hojas y las tablas de un libro. Una tabla de Excel es un rango con «Formato de tabla» y nombre (si no lo cambias, Tabla1, Tabla2…). Recomendación: trabaja con <b>tablas</b>: identifica los nombres de columna y solo importa su rango; importar una hoja trae todo, incluidos comentarios fuera de la tabla. Si el fichero lo genera automáticamente una aplicación o web, evita cualquier intervención humana sobre él: los errores humanos son muy frecuentes.</p>`});

NOTES.push({t:"transformar", s:S + " · cap. 3", h:`
<h4>Dónde están las transformaciones</h4>
<p>En varios menús. Algunas se repiten pero actúan distinto: <b>Transformar</b> aplica el cambio sobre la propia columna; <b>Agregar columna</b> deja la columna intacta y crea una nueva con el resultado. La forma más rápida: clic derecho sobre la columna.</p>
<h4>Quitar columnas</h4>
<p>No sobrecargues el modelo con columnas innecesarias. <b>Quitar columnas</b> elimina las seleccionadas; <b>Quitar otras columnas</b> mantiene las seleccionadas y elimina el resto (facilita el mantenimiento: las columnas nuevas del origen no aparecerán, porque forman parte del resto a eliminar); <b>Elegir columnas</b> permite marcar con un check las que se muestran o descartan.</p>
<h4>Filtrar filas</h4>
<p>Para quedarte con un año o una tienda. Interfaz como la de Excel. Si un valor (la tienda «006») no aparece en la lista es porque no está en la muestra de 1.000 filas: pulsa «Cargar más».</p>
<h4>Encabezados, nombres y tipos</h4>
<p><b>Usar la primera fila como encabezado</b>: muy habitual al importar archivos. <b>Cambiar nombre</b>: de las más sencillas e imprescindibles, porque es el nombre que verán los informes (clic derecho > Cambiar nombre, doble clic o F2 con la columna marcada).</p>
<p><b>Cambiar tipos de datos</b> (al importar archivos casi todo llega como texto; hay que asignar el óptimo columna a columna): Número decimal (5 o más decimales, coma flotante); Decimal fijo (1 a 4 decimales); Número entero (el numérico más óptimo); Fecha/Hora; Fecha; Hora; Fecha/Hora/Zona horaria (UTC con desplazamiento, que se convierte a fecha y hora al cargar); Duración (periodo de tiempo; se convierte a decimal al cargar); Binario (imágenes, documentos: evítalo siempre que se pueda, ocupa mucho y aporta poco). Evita el tipo «Cualquiera»: asigna siempre el óptimo.</p>
<h4>Otras transformaciones</h4>
<ul><li><b>Quitar duplicados</b>: mantiene una fila por cada valor de la columna (clic derecho > Quitar duplicados). Mucho cuidado: puedes eliminar información que necesitas.</li><li><b>Reemplazar valores</b>: recorre fila a fila la columna y sustituye.</li><li><b>Columna condicional</b>: el valor de cada fila depende de criterios y condiciones.</li><li><b>Columna personalizada</b>: por ejemplo Beneficio a partir de ImporteVenta e ImporteCoste.</li><li><b>Quitar filas superiores e inferiores</b>.</li></ul>
<h4>Anular dinamización (Unpivot)</h4>
<p>Caso frecuente: columnas estáticas y columnas dinámicas que varían o crecen con el tiempo y contienen valores numéricos con los que calcular (presupuestos anuales en Excel con una columna por mes). Tras eliminar la columna Total y la última fila, se quiere una columna Mes con el nombre del mes y otra Importe Presupuestado. Es una estructura más óptima para la tabla de hechos de presupuestos. Tres transformaciones:</p>
<ul><li><b>Anular dinamización de columnas</b>: seleccionando Enero a Diciembre.</li><li><b>Anular dinamización de otras columnas</b>: seleccionando Tienda.</li><li><b>Anular dinamización de las columnas seleccionadas únicamente</b>: seleccionando Enero a Diciembre.</li></ul>
<p>Las dos primeras solo se diferencian en qué columnas marcas; generan el mismo M: <code>Table.UnpivotOtherColumns(#"Columnas quitadas", {"Tienda"}, "Atributo", "Valor")</code>, que también anula la dinamización de las columnas nuevas que se creen en origen. La tercera genera <code>Table.Unpivot(#"Columnas quitadas", {"Enero", "Febrero", …, "Diciembre"}, "Atributo", "Valor")</code> y solo afecta a las columnas indicadas. Ninguna es mejor ni peor: depende del escenario (importa si inicialmente hay columnas solo para algunos meses y se van creando con el tiempo). Las columnas resultantes se llaman Atributo y Valor; renómbralas con nombres adecuados (Mes, ImportePresupuesto).</p>`});

NOTES.push({t:"combinar", s:S + " · cap. 3", h:`
<h4>Combinar consultas</h4>
<p>Fusiona datos de dos consultas en una sola cuando tienen una o varias columnas en común que las relacionen. Imprescindible para construir modelos en estrella, porque en origen suele haber más tablas de las que necesita el modelo: permite añadir a una consulta columnas procedentes de otra. Para quien conozca SQL, es el equivalente a un JOIN. Ejemplo del libro: crear la dimensión Producto a partir de las consultas Productos y Categorías.</p>
<h4>Anexar consultas</h4>
<p>Otro escenario de fusión: varias tablas o archivos segmentados en origen (uno por mes o año, uno por país). Se anexan en una única consulta.</p>
<h4>Cargar datos</h4>
<p>Si se leen Facturas2019 y Facturas2020 y se anexan en una consulta Facturas, en el modelo solo debe cargarse Facturas, con todo el histórico. Clic derecho sobre la consulta > desmarcar «Habilitar carga». Las consultas con la carga deshabilitada aparecen en <i>cursiva</i> y sin el check. También hay que deshabilitar la carga de Categorías, que solo se usa para obtener columnas adicionales de la dimensión Producto.</p>
<h4>Diagrama de dependencias entre consultas</h4>
<p>Menú Vista > Dependencias de la consulta (a la derecha): visión global de todas las consultas y de las dependencias entre ellas.</p>`});

NOTES.push({t:"vertipaq", s:S + " · cap. 4", h:`
<h4>Qué contiene un modelo semántico</h4>
<p>Es la base de datos en memoria de Power BI y contiene, además de datos, toda la capa lógica: conexiones a cada origen, transformaciones que obtienen, limpian y preparan los datos, la base de datos (tablas, relaciones y datos almacenados) y los cálculos y métricas en DAX.</p>
<h4>Bases de datos relacionales</h4>
<p>SQL Server, MySQL o PostgreSQL organizan los datos en tablas relacionadas. Son perfectas para sistemas transaccionales que registran operaciones constantemente con muchos usuarios insertando, leyendo y modificando a la vez: ERP (SAP, Business Central: compras, ventas, almacén), CRM (Salesforce), aplicaciones internas (contabilidad, RR. HH., logística) y TPV. Están optimizadas para la entrada y salida rápida de datos, la integridad y la concurrencia. Almacenan en disco, no comprimen, guardan por filas y sin un orden concreto: optimizadas para muchas escrituras y lecturas concurrentes de pocas filas.</p>
<h4>Bases de datos columnares (Power BI)</h4>
<p>Almacenan en memoria RAM, comprimen mucho, guardan por columnas y cada columna se almacena ordenada y devuelve la información en ese orden: optimizadas para muchas lecturas concurrentes de muchas filas. <b>Cuanto más se repiten los valores de una columna, más se comprime.</b> Con 800.000 clientes (760.000 de España y 40.000 de Francia) la columna País comprime muchísimo porque solo tiene dos valores. Para «cantidad vendida en toda la historia» el motor recorre solo la columna Cantidad, sin los saltos de una base relacional, en RAM (mucho más rápida que el disco) y comprimida (lee menos bytes).</p>
<h4>Tipos de datos en Power BI</h4>
<p><b>Numéricos</b> (todos ocupan 8 bytes): Número decimal (coma flotante, hasta 15 dígitos, el separador puede ir en cualquier posición), Decimal fijo (separador en posición fija, hasta 19 dígitos y siempre 4 decimales), Número entero (hasta 19 dígitos, sin decimales). Criterio: entero si no hay decimales, decimal fijo con 1 a 4, decimal con 5 o más.</p>
<p><b>Fecha y hora</b>: Fecha y hora, Fecha, Hora. Cuantos menos valores distintos, más comprime: conviene separar fecha y hora en dos columnas, lo que además mejora las capacidades analíticas. Internamente se guardan como número decimal: la parte entera son los días transcurridos desde el 31/12/1899 y la decimal la fracción del día (12 horas = 0,5; 6 horas = 0,25), con los decimales necesarios para cada segundo.</p>
<p><b>Texto</b>: almacena números, letras o caracteres especiales, pero no permite calcular y ordena como texto (1, 10, 100, 2, 3…). Hay datos con números que conviene guardar como texto, como el código postal (queremos ver 03345, no 3345) o códigos de tienda que hoy son números pero mañana pueden no serlo. Solo hay un tipo Texto: se guarda en Unicode (2 bytes por carácter), hasta 512 MB (256 millones de caracteres). Salvo que sea imprescindible, evita columnas de observaciones o comentarios.</p>
<p><b>Booleanos</b> (verdadero/falso) y <b>binarios</b> (fotos o documentos).</p>
<h4>Recomendaciones para reducir el tamaño</h4>
<ul><li>Asignar un tipo que cumpla las reglas de negocio y admita todos los valores que puedan llegar del origen.</li><li>Eliminar columnas innecesarias (las que dejas por si acaso y que en años nadie ha pedido).</li><li>Eliminar columnas calculadas que puedan convertirse en medidas.</li></ul>
<h4>Optimización del caso práctico con Bravo</h4>
<p>Bravo muestra el tamaño real de almacenamiento de cada columna y tabla del modelo. Tiendas AHORA ocupaba <b>23,95 MB</b>; la tabla Ventas 22,93 MB (96 %). La columna Ticket ocupaba 17,78 MB (74 % del total) y Línea 3,39 MB (14 %): juntas, más del 90 %. Línea ya estaba como entero: solo cabe preguntarse si alguna pregunta de negocio la necesita. Ticket debe ser texto porque contiene letras, así que técnicamente no hay más que hacer; pero desde el negocio sí: «S1-18-005-2324108» es Serie (S1, texto), Año (18, entero), Tienda (005, texto) y Nº ticket (2324108, entero). Dividido en 4 columnas con Power Query y con una jerarquía de esas columnas en Power BI, el modelo pasó a <b>8,12 MB</b>: una tercera parte, un 66 % menos. Serie 17 KB, Año 17 KB, Tienda 19 KB, Nº ticket 1,83 MB.</p>
<h4>Formato</h4>
<p>El tipo de datos indica cómo se almacena el dato y qué requisitos cumple, y afecta a los cálculos (se tienen en cuenta todos los decimales almacenados). El formato es solo cómo se visualiza: redondea al presentar. 1,6275346545346 con formato de 2 decimales se ve 1,63, pero se calcula con todos los decimales.</p>
<h4>Ordenación de columnas</h4>
<p>Por defecto una columna se ordena por los valores que contiene (los nombres de mes, por orden alfabético). Se corrige ordenándola por otra columna.</p>
<h4>Jerarquías</h4>
<p>Una jerarquía es un grupo de dos o más columnas al que se le asigna un nombre, con tantos niveles como columnas.</p>
<h4>Pasos para crear y optimizar cualquier modelo</h4>
<ol><li>Crea la dimensión Fecha acorde a los requisitos y preguntas de negocio.</li><li>Asigna los tipos de datos óptimos a cada columna de cada tabla y ordénala correctamente.</li><li>Crea jerarquías.</li><li>Define relaciones correctas y óptimas: habitualmente 1→* (1 en dimensiones, * en hechos, unidireccionales).</li></ol>`});

NOTES.push({t:"relaciones", s:S + " · cap. 4", h:`
<h4>Relaciones entre tablas</h4>
<p>Conexiones lógicas entre dos o más tablas mediante campos comunes que permiten unir datos y analizarlos de forma eficiente. Afectan a la propagación de filtros por el modelo: las «flechitas» de la relación indican en qué sentido se propagan. Las tablas deben tener un campo en común.</p>
<h4>Tres tipos</h4>
<ul><li><b>Uno a varios</b>: la más utilizada. Cada fila del lado uno se relaciona con muchas del lado varios; cada fila del lado varios solo con una del lado uno.</li><li><b>Varios a varios</b>: solo para situaciones excepcionales. Una fila de una tabla se relaciona con muchas de la otra y viceversa; puede dar resultados distintos a los esperados si no dominas su comportamiento.</li><li><b>Uno a uno</b>: se suele evitar con buen modelado combinando antes las consultas en Power Query; si solo hay una fila en común, mejor unificar todas las columnas en una sola tabla.</li></ul>
<h4>Limitaciones</h4>
<ul><li>Solo por un campo: no se pueden crear relaciones entre dos tablas por más de una columna.</li><li>No se permiten relaciones entre dos columnas de la misma tabla.</li><li>Solo una relación activa.</li><li>No se permiten referencias circulares.</li></ul>
<h4>Dirección del filtro cruzado</h4>
<p>Es la forma en que los filtros de una tabla se aplican al resto. <b>Unidireccional</b>: cualquier filtro en Tienda, por cualquiera de sus columnas, se propaga en el contexto de filtro a Ventas; ningún filtro en Ventas se propaga a Tienda. <b>Bidireccional</b>: se propaga en ambos sentidos. Minimiza su uso: exclusivamente para excepciones sin alternativa.</p>
<p><b>Regla:</b> crea relaciones uno a varios unidireccionales, con propagación desde la parte uno (dimensión) a la parte varios (hechos), en la mayoría de casos. Usa el resto de tipos y la propagación bidireccional de forma excepcional para problemas concretos que lo necesiten.</p>`});

NOTES.push({t:"medidas", s:S + " · cap. 5", h:`
<h4>Enriquecer el modelo</h4>
<p>Una vez creado el modelo con una estructura de tablas, columnas y relaciones óptimas, se enriquece con cálculos adicionales (KPIs) que aumentan la capacidad de análisis. Con DAX se crean tres tipos de cálculos: tablas calculadas, columnas calculadas y medidas.</p>
<h4>Tipos de tablas del modelo</h4>
<ul><li>Tablas que provienen de una consulta de Power Query.</li><li><b>Tablas calculadas</b>: creadas con DAX (icono de calculadora). Usan memoria igual que las de Power Query.</li><li><b>Tablas que solo contienen medidas</b> (home tables o tablas iniciales): agrupan medidas para localizarlas fácilmente.</li></ul>
<h4>Columnas calculadas</h4>
<p>Columnas creadas con DAX que se añaden como una columna más. Se calculan en tiempo de refresco (al pulsar Actualizar) y ocupan memoria igual que cualquier columna, venga del origen, de Power Query o de DAX. Pueden devolver valores numéricos o no numéricos.</p>
<h4>Medidas</h4>
<p>Cálculos en DAX que no almacenan el resultado en memoria: se calculan al vuelo y consumen CPU. Las que escribes tú son <b>medidas explícitas</b>. Las <b>implícitas</b> se crean sin escribir DAX, pero tienen grandes limitaciones de cálculo y uso: hoy en día, mejor no usarlas. Por cada columna sobre la que Power BI cree automáticamente una medida implícita, ocúltala o quítale la función de agregación.</p>
<table class="t"><tr><th>Columna calculada</th><th>Medida</th></tr><tr><td>Se calcula al refrescar y se almacena en la base de datos</td><td>Se calcula en tiempo de ejecución en los informes y no se almacena</td></tr><tr><td>Consume memoria</td><td>Consume procesador (CPU)</td></tr><tr><td>No usar, salvo excepciones</td><td>Usar siempre que sea posible</td></tr></table>
<h4>Ocultar elementos en la vista de informes</h4>
<p>Todo modelo tiene elementos necesarios en la base de datos que no hacen falta en los informes: mostrarlos solo aporta ruido. Oculta todas las medidas implícitas. Las tablas de hechos se ocultan por completo o se deja visible solo alguna columna descriptiva que no exista en otra tabla. En el caso práctico, Ventas solo muestra Ticket y Línea (el resto son medidas implícitas o claves externas) y Presupuestos se oculta entera. Buena práctica: en hechos oculta claves externas y medidas implícitas; en dimensiones, columnas de ordenación y de uso interno. Agrupa columnas y medidas en <b>carpetas</b>.</p>`});
})();
