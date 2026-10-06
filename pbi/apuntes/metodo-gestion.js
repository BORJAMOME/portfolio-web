/* Flujo de trabajo (Federico Pastor) y Gestión de proyectos y negociación con clientes de BI (NamasData) */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var FP = "Flujo de trabajo · Federico Pastor (masterclass NamasData)";
var GP = "Gestión de proyectos y negociación con clientes de BI (masterclass NamasData)";
NOTES.push(
{t:"gestion", s:FP, h:`
<p>Masterclass sobre el flujo completo de un proyecto de informe, de la ficha técnica a la demo (las diapositivas de contenido y la plantilla base para presentar al cliente están en capturas).</p>
<h4>1. Ficha técnica</h4>
<p>Un Excel con la información del proyecto: tablas, campos, medidas y requisitos.</p>
<h4>2. Power Query</h4>
<ul>
<li>Antes de empezar, revisar la configuración de carga (buena práctica de opciones del archivo).</li>
<li>Dos <b>parámetros</b>: Carpeta y Archivo, para cambiar de origen sin tocar las consultas.</li>
<li>Una <b>función de calendario</b> en M guardada y reutilizable en todos los proyectos.</li>
<li>Dimensiones y hechos; prefijo <b>guion bajo</b> en el nombre de la tabla de hechos para que aparezca siempre la primera.</li>
<li>Que el último paso aplicado sea siempre <b>Tipo cambiado</b>, y comentar cada paso.</li>
</ul>
<h4>3. Modelo</h4>
<ul>
<li>Dim_Calendario <b>marcada como tabla de fechas</b> para evitar errores de inteligencia de tiempo.</li>
<li><b>Ocultar todos los ID</b> del modelo.</li>
<li>Vista de tabla: revisar tabla a tabla y que el calendario esté bien ordenado.</li>
</ul>
<h4>4. Diseño</h4>
<ul>
<li>Tema en <b>JSON</b> (Vista → Temas → Examinar), configuración y fondo del lienzo.</li>
<li>Página de presentación y <b>wireframe</b>: asegurar tamaños y distancias.</li>
<li>Explicar los segmentadores (año, mes) en el propio título, dejar claro el año seleccionado con color e indicar la moneda (€ o $).</li>
<li>Etiquetas legibles; <code>SELECTEDVALUE</code> para que los textos cambien con el año elegido; evitar filtros de mes que dejan una sola barra.</li>
<li>Nombrar todo en el <b>panel de selección</b>.</li>
<li>Padding de 10 px en cada visual; la línea de distinto color que las barras.</li>
<li>Gráficos: columnas y líneas reconfigurado, líneas, barras con <b>línea de objetivo</b>, barras con medida <b>Highlight Max-Min</b> (o formato condicional por reglas, más sencillo).</li>
<li><b>Carpetas de medidas</b> ordenadas para entenderlas fácilmente.</li>
<li>Demo: tarjetas KPI, barras de AC (real) con medida propia, columna de <b>minigráficos</b> (sparklines) en la tabla y color de barras por % con formato condicional.</li>
</ul>
`},
{t:"gestion", s:GP, h:`
<p>Masterclass con el temario en diapositivas (capturas). Estructura:</p>
<ol>
<li>Concepto y <b>tipos de proyecto</b> de BI.</li>
<li><b>Metodología</b> de proyecto, con un ejemplo completo de <b>documento de análisis funcional</b>.</li>
<li><b>Cierre del alcance</b> del proyecto, con demo de alcance de un informe de ventas.</li>
<li><b>Estimaciones</b>.</li>
<li>Las tareas <b>«consume-horas»</b> que no se presupuestan y se comen el margen.</li>
<li><b>Gestión del tiempo</b>.</li>
<li><b>Gestión de desviaciones</b>.</li>
<li><b>Medir la productividad</b>, con demo sobre el alcance del informe de ventas.</li>
<li>¿Cuál es el éxito de un proyecto?</li>
</ol>
<p>Idea clave: cerrar por escrito el alcance (qué entra y qué no) antes de estimar, y controlar horas reales frente a estimadas para detectar desviaciones a tiempo.</p>
`}
);
EXAM.push(
{k:"Buenas prácticas", t:"gestion", s:FP, q:"¿Por qué conviene crear parámetros Carpeta y Archivo en Power Query?", a:"Para cambiar el origen de datos (otra ruta u otro cliente) modificando solo el parámetro, sin editar cada consulta."}
);
})();
