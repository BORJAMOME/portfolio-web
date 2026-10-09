/* Power UI, Hackeando tablas, Gráficos nuevos, Python + Power BI y Javier San Juan */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var PU = "Power UI · guía de diseño (YouTube)";
var HT = "Hackeando tablas en Power BI (YouTube)";
var GN = "Gráficos nuevos en Power BI · Nicolás Lea-Trengrouse (LinkedIn)";
var PY = "Análisis de datos con Python y Power BI (NamasData)";
var JS = "Clase Power BI · Javier San Juan (masterclass)";
NOTES.push(
{t:"percepcion", s:PU + " · Color y tipografía", h:`
<h4>El poder del color</h4>
<ul>
<li>El color no solo embellece: <b>dirige la atención y transmite información</b>. Bien usado estructura y resalta; mal usado confunde y fatiga.</li>
<li><b>Menos es más:</b> colores sutiles para que destaque lo importante.</li>
<li><b>Fondo</b> sutil y neutral (claro o en tonos suaves); nunca saturado.</li>
<li><b>Colores de métricas consistentes:</b> si Ventas es azul en un gráfico, lo es en todos.</li>
<li><b>Aplicación uniforme:</b> el mismo gris en fondos, bordes y textos refuerza la jerarquía.</li>
<li>El color más importante es la <b>escala de grises</b>: todo en gris y color solo para lo que importa.</li>
</ul>
<p>Tipografía: jerarquía clara de tamaños y pesos, pocas fuentes.</p>
`},
{t:"storytelling", s:PU + " · Lienzo, rejilla y componentes", h:`
<h4>Tamaño del lienzo</h4>
<ul>
<li><b>1280 × 720</b> (por defecto): dashboards, presentaciones, TV y PowerPoint.</li>
<li><b>1440 × 1080</b>: más espacio para informes detallados, habitual en diseño web. Buena práctica empezar aquí y ajustar según el dispositivo de la audiencia, manteniendo 16:9 o 4:3.</li>
</ul>
<h4>Rejillas</h4>
<ul>
<li>La rejilla por defecto son cuadrados de <b>96 × 96 px</b> que no cambian con el lienzo.</li>
<li>Con <b>Ajustar a la cuadrícula</b> activado: flechas mueven 8 px (16 con zoom alejado) y Mayús + flechas 96 px. Desactivado: 1 px y 10 px.</li>
<li>Mejor una <b>rejilla de columnas</b> (como en diseño web, Google Material Design): columnas, márgenes y <i>gutters</i>. Densa para informes con muchos visuales, espaciada para dashboards limpios.</li>
<li>Para 1440 px de ancho: márgenes de <b>80 px</b>, gutters de <b>26 px</b>, columnas de <b>83 px</b> y 1280 px útiles.</li>
<li>Rejillas hechas con formas que se activan desde el panel de selección; guían, no son una regla rígida.</li>
</ul>
<h4>Componentes</h4>
<ul>
<li><b>Bordes y sombras</b> sutiles, tablas y métricas, tarjetas y KPI, botones, segmentadores y navegación.</li>
<li><b>Padding</b> uniforme (por ejemplo 16 px en todos los lados) definido en el <b>tema JSON</b>.</li>
<li><b>Formato numérico</b> coherente con el eje (no mostrar K con decimales si el eje está en millones) y revisar los tipos de datos en multiplicaciones y divisiones para evitar errores de redondeo (artículo de SQLBI sobre conversiones numéricas en DAX).</li>
<li><b>SVG</b>: barras de progreso, estrellas… con medidas DAX que devuelven el código SVG (categoría de datos URL de imagen). No hace falta saber XML; Power UI GPT genera el código.</li>
<li><b>Medidas:</b> comentarlas, formatearlas (DAX Formatter o herramienta externa para todo el modelo) y agruparlas en tablas o carpetas de medidas.</li>
</ul>
`},
{t:"graficosav", s:HT, h:`
<ul>
<li><b>Totales con descripciones:</b> en el total aparecían también las descripciones; con <code>HASONEVALUE</code> se devuelve el texto solo cuando hay un único valor. Corregir también los totales mal sumados (por ejemplo Nº palets / producto) con un iterador.</li>
<li><b>% sobre el total en una matriz</b> con <code>ISINSCOPE</code> para saber en qué nivel está la celda.</li>
<li><b>Tabla plana con varias segmentaciones</b>: tabla manual con las cabeceras; guiones para jerarquizar y en M sustituirlos por espacios en blanco con <code>Character.FromNumber</code>/UNICHAR.</li>
<li><b>Formatos nativos</b> y <b>mapas de calor</b> con formato condicional.</li>
<li><b>Filas cebra</b> con DAX: ranking <code>_RowNumber</code> e <code>ISEVEN</code> para pares e impares, medida aplicada al color de fondo.</li>
<li><b>Colorear la columna seleccionada</b> con una tabla desconectada como segmentador y una medida (trampa visual: columna en blanco con las cabeceras).</li>
<li><b>Efecto de columnas cruzadas</b> con dos tablas desconectadas y DAX.</li>
<li><b>Iconos</b> mediante un tema JSON, <b>UNICHAR</b> para símbolos de texto e imágenes <b>SVG</b> (categoría de datos «URL de imagen»).</li>
</ul>
`},
{t:"interactividad", s:GN, h:`<p>Mejorar visuales alternando vistas con <b>marcadores</b> (bookmarks) y botones: misma zona del lienzo, distintos gráficos según lo que elija el usuario.</p>`},
{t:"python", s:PY, h:`
<h4>Fundamentos de Python</h4>
<p>Operadores matemáticos, relacionales, de asignación y lógicos; práctica en Google Colab.</p>
<table class="dxtbl"><thead><tr><th>Librería</th><th>Para qué</th></tr></thead><tbody>
<tr><td>Pandas</td><td>Limpieza y manipulación de datos, indexación y selección avanzadas; se integra con NumPy, Matplotlib y Scikit-learn</td></tr>
<tr><td>Matplotlib</td><td>Visualizaciones con alto grado de personalización</td></tr>
<tr><td>Seaborn</td><td>Visualización más moderna sobre Matplotlib, gráficos estadísticos</td></tr>
<tr><td>NumPy</td><td>Cálculo numérico</td></tr>
<tr><td>SciPy</td><td>Cálculo científico sobre NumPy</td></tr>
<tr><td>Scikit-learn</td><td>Machine learning</td></tr>
</tbody></table>
<h4>Conectar Python con Power BI</h4>
<ol>
<li>Opciones → <b>Scripts de Python</b>: indicar la instalación (mejor Python que Anaconda).</li>
<li>En la terminal instalar <code>pandas</code>, <code>numpy</code>, <code>matplotlib</code>, <code>seaborn</code> y <code>openpyxl</code>.</li>
<li>Obtener datos → <b>Script de Python</b>, o en Power Query Transformar → <b>Ejecutar script de Python</b> (por ejemplo para quitar duplicados y nulos con pandas).</li>
<li><b>Objeto visual de Python:</b> arrastrar los campos (poner como <b>No resumir</b>), importar las librerías y generar el gráfico. Admite segmentadores; se edita desde el código y en cada visual hay que volver a importar las librerías. Power BI solo admite ciertas librerías en el servicio.</li>
</ol>
<p>Referencia: crear un informe rápido de Power BI desde Jupyter.</p>
`},
{t:"bi", s:JS, h:`<p>Masterclass de Javier San Juan (septiembre de 2025). Los apuntes en Notion son solo capturas de las diapositivas, sin texto transcrito.</p>`}
);
EXAM.push(
{k:"Visualización", t:"storytelling", s:PU, q:"¿Qué tamaño de lienzo propone Power UI para informes detallados y con qué rejilla?", a:"1440 × 1080 px, con márgenes de 80 px, gutters de 26 px y columnas de 83 px (1280 px útiles)."},
{k:"DAX", t:"graficosav", s:HT, q:"¿Qué función usas en una matriz para saber en qué nivel de la jerarquía está la celda?", a:"ISINSCOPE."},
{k:"Python", t:"python", s:PY, q:"Al usar un objeto visual de Python, ¿qué ajuste debes hacer en los campos?", a:"Ponerlos como No resumir, porque Power BI pasa al script un dataframe con los valores agregados y elimina duplicados."}
);
})();
