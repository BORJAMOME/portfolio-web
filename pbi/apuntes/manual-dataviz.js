/* Manual DataViz (guía propia en Notion, capítulos 1 a 8; del 9 al 14 quedaron como títulos vacíos) */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var S = "Manual DataViz (Notion)";
NOTES.push(
{t:"percepcion", s:S + " · 1. Introducción", h:`
<p>Visualizar datos no es «poner números bonitos»: es <b>diseñar una experiencia cognitiva</b> para que cualquiera vea lo importante en segundos, lo entienda sin esfuerzo, lo recuerde y decida. Combina ciencia del comportamiento, neuromarketing, UX/UI, storytelling, análisis y tecnología.</p>
<ul>
<li><b>El cerebro es vago:</b> evita el esfuerzo, odia el caos, ama los patrones, se guía por el contraste y recuerda historias. Si un gráfico requiere interpretación, está mal diseñado.</li>
<li><b>Tu visualización es para ellos:</b> el analista piensa en datos; la audiencia, en decisiones (qué significa para mi trabajo, qué hago ahora, es grave o positivo).</li>
<li><b>Visualización eficaz:</b> se entiende en menos de 3 segundos, destaca lo importante sin distracciones, responde a una sola pregunta y conduce a una acción (sin «¿y qué?» es decoración).</li>
<li><b>Qué dominar en Power BI:</b> diseño (color intencional, cuadrícula, espacio en blanco, tipografía, navegación), storytelling interactivo (marcadores, tooltips, tarjetas que cambian con la selección), UX (jerarquía, flujo de izquierda a derecha, evitar scroll, módulos), DAX pensado para UX (semáforos, alertas, rangos dinámicos) y rendimiento (Fabric, Direct Lake).</li>
<li><b>No es</b> un informe lleno de números, una explosión de colores, un gráfico con 12 categorías, una tarta (casi nunca), una tabla de 40 columnas ni un dashboard sin historia.</li>
</ul>
<p><b>Plantilla de propósito:</b> audiencia, decisión que debe tomar, pregunta clave, qué debe ver primero, qué simplificar o eliminar, la Gran Idea y la llamada a la acción. Si no puedes definir el propósito en una frase, el dashboard no lo tiene.</p>
`},
{t:"percepcion", s:S + " · 2. Fundamentos cognitivos", h:`
<ul>
<li><b>El cerebro ve diferencias, no valores absolutos:</b> la atención se atrae con contraste. Usa color solo para llamar la atención; si todo es importante, nada lo es.</li>
<li><b>Sistema 1 y Sistema 2</b> (Kahneman): el 1 es rápido e intuitivo (patrones en gráficos); el 2 es lento y se cansa (tablas, cálculos). Una buena visualización activa el Sistema 1.</li>
<li><b>Atributos preatentivos:</b> color, forma, tamaño, orientación, alineación, posición, movimiento, grosor y patrón. Ejemplo: línea importante en azul oscuro y más gruesa; contexto en gris claro y más fina.</li>
<li><b>Gestalt:</b> proximidad (agrupar KPI por módulos), similitud (misma paleta e iconos para lo mismo), continuidad (ordenar gráficos según la narrativa), figura-fondo (fondo suave, datos en alto contraste) y cierre (menos cajas, el espacio separa).</li>
<li><b>Carga cognitiva</b> (Sweller, 1988): espacio en blanco, módulos, sin bordes ni rellenos, paleta de 1 color primario y 2 grises, una idea por visual.</li>
<li><b>Patrones de lectura:</b> arriba-izquierda, arriba-derecha, centro, abajo. <b>Patrón F</b> para dashboards empresariales y <b>Z</b> para storytelling lineal. Diseñar para escanear, no para leer.</li>
<li><b>Neuromarketing:</b> rojo solo para alertas, azul para insights y confianza, gris para contexto; las flechas dirigen la mirada; la simetría reduce el estrés; el cerebro recuerda picos y finales.</li>
<li><b>Percepción:</b> Weber-Fechner (detectamos cambios relativos: mostrar Δ frente a objetivo o año anterior), <b>anclaje</b> (el primer valor condiciona; el KPI crítico arriba a la izquierda) y <b>framing</b> («estamos al 95 % del objetivo y creciendo»).</li>
<li><b>Diseño en 3 niveles:</b> KPI (¿cómo vamos?), análisis (¿por qué?) y acción (¿qué hacemos?).</li>
</ul>
<p><b>Framework CEREBRO:</b> Contraste, Enfoque (una idea por visual), Reducción, Estructura, Balance, Recuerdo y Orientación.</p>
`},
{t:"percepcion", s:S + " · 3. Contexto y elección del gráfico", h:`
<p>Un gráfico no muestra datos, muestra <b>relaciones</b>: variación, comparación, composición, correlación, distribución, ritmo, proporción, cambio, anomalías.</p>
<p><b>Framework:</b> 1) qué pregunta respondes (tiempo, comparación, composición, distribución, correlación, geografía, ranking/anomalías o estado KPI); 2) qué énfasis necesitas; 3) qué sesgos juegan (no distinguimos bien áreas, diferencias relativas, Gestalt, 1-2 highlights por gráfico, evitar gráficos mixtos); 4) elegir.</p>
<table class="dxtbl"><thead><tr><th>Objetivo</th><th>Gráfico</th><th>Reglas</th></tr></thead><tbody>
<tr><td>Tendencia</td><td>Líneas</td><td>Máximo 3 líneas; serie principal en azul y 3 px, comparativas en gris y 1 px; línea suave solo si la variación es continua</td></tr>
<tr><td>Comparar categorías</td><td>Columnas</td><td>Ordenar de mayor a menor, máximo 7 categorías, etiquetas fuera</td></tr>
<tr><td>Ranking / textos largos</td><td>Barras horizontales</td><td>Siempre descendente (Top 10 / Bottom 10)</td></tr>
<tr><td>Acumulado en el tiempo</td><td>Área</td><td>Máximo 2 áreas</td></tr>
<tr><td>Relación entre variables</td><td>Dispersión</td><td>Tooltips enriquecidos y etiquetas dinámicas</td></tr>
<tr><td>Densidad o patrones</td><td>Mapa de calor</td><td>Un solo color con intensidades, 3-4 niveles, orden lógico</td></tr>
<tr><td>Estado</td><td>Tarjeta KPI</td><td>Número grande, contexto pequeño (frente a objetivo o periodo anterior), semáforo</td></tr>
<tr><td>Explicar un resultado</td><td>Cascada</td><td>Ingresos netos, márgenes, variaciones</td></tr>
<tr><td>Proporción</td><td>Anillo</td><td>Solo con 3 o menos categorías y el número en el centro</td></tr>
<tr><td>Espacial</td><td>Mapa</td><td>Solo si el lugar importa de verdad</td></tr>
<tr><td>Composición %</td><td>Columnas 100 %</td><td></td></tr>
<tr><td>Distribución</td><td>Histograma / boxplot</td><td></td></tr>
</tbody></table>
<p>Casos: ventas trimestrales de 12 categorías y 4 colores → una línea azul; mapa sin sentido espacial → ranking horizontal; beneficio neto en barras → cascada. Storyboard: KPI, explicación, profundización, anomalías, acción.</p>
`},
{t:"percepcion", s:S + " · 4 y 5. Eliminar el caos", h:`
<p><b>Caos = tinta que no aporta información</b> (data-ink desperdiciada). Roba capacidad mental: la memoria de trabajo solo maneja 4-7 elementos. Eliminarlo reduce el tiempo de lectura y los errores, aumenta el impacto y mejora la accesibilidad.</p>
<table class="dxtbl"><thead><tr><th>Caos</th><th>Solución</th></tr></thead><tbody>
<tr><td>Cuadrícula muy visible</td><td>Quitarla o gris al 15-20 %</td></tr>
<tr><td>Bordes innecesarios</td><td>Separar con el fondo y márgenes</td></tr>
<tr><td>Demasiados colores</td><td>Máximo 3: principal, secundario y highlight</td></tr>
<tr><td>Demasiado texto</td><td>Redondear, quitar .00, abreviar (K, M), sin duplicados</td></tr>
<tr><td>Leyendas</td><td>Etiquetado directo</td></tr>
<tr><td>Marcadores en todos los puntos</td><td>Solo en los importantes</td></tr>
<tr><td>Sombras y 3D</td><td>Nunca</td></tr>
<tr><td>Ejes saturados</td><td>Meses abreviados, máximo 8-10 categorías, sin texto diagonal</td></tr>
<tr><td>Tamaños y alineación erráticos</td><td>Alineación milimétrica, márgenes de 16-24 px</td></tr>
<tr><td>Iconos decorativos</td><td>Solo con función</td></tr>
</tbody></table>
<p><b>Proceso:</b> identificar (¿puedo quitarlo sin perder información?), eliminar, jerarquizar (contraste, tamaño, color, posición) y añadir intención. «Lo que destaca se entiende; lo que no destaca, desaparece.»</p>
<h4>Atención</h4>
<p>El cerebro procesa lo visual en 250 ms antes de ser consciente: preatentivo → focal → cognitivo → memoria. Hay que controlar las dos primeras capas. Doce atributos preatentivos: color (un color, un significado), tamaño, orientación, posición, forma, grosor (real 3 px, forecast 1,5 px), contraste, agrupación, contornos, movimiento, relleno y espacio negativo.</p>
<p><b>F.E.C.O.:</b> Focus (qué debe verse primero), Emphasis (un atributo potente), Context (desaturar el resto) y Order (orden de lectura). El texto guía más que el color: qué ha pasado, por qué importa, qué hago. <b>Spotlight test:</b> enseñar el gráfico 2 segundos y preguntar qué se vio primero.</p>
`},
{t:"storytelling", s:S + " · 6. Pensar como diseñador", h:`
<p>La estética es efectividad: lo atractivo parece más fácil de usar, genera confianza y se recuerda mejor.</p>
<ol>
<li><b>Alineación</b> (KPI a la izquierda, columnas invisibles), 2. <b>proximidad</b>, 3. <b>repetición</b> (misma paleta y tamaños), 4. <b>contraste</b>, 5. <b>jerarquía</b> (título, KPI, gráficos principales, detalle), 6. <b>simplicidad</b> («si puedes quitarlo y el significado no cambia, quítalo»), 7. <b>espacio en blanco</b>, 8. <b>balance</b> (simétrico serio, asimétrico dinámico), 9. <b>flujo</b> (Z o F), 10. <b>legibilidad</b> (texto de 12 a 36 px, sin fuentes decorativas, contraste WCAG mayor de 4,5).</li>
</ol>
<ul>
<li><b>Paleta:</b> 1 color primario, 1 highlight y 3-4 grises; accesible para daltonismo. Ejemplo: azul #0041C2, naranja #FF7A00, grises #F4F4F4, #D9D9D9 y #6A6A6A.</li>
<li><b>Tipografías:</b> Segoe UI, Inter, Roboto, Source Sans Pro.</li>
<li><b>Márgenes:</b> 24 px entre visuales grandes, 12 px entre KPI, 32 px arriba, 16 px laterales, 8 px entre icono y texto.</li>
<li><b>Tarjeta KPI:</b> icono pequeño, título pequeño, número grande, variación frente a objetivo en color y sparkline gris.</li>
</ul>
<p><b>Frameworks:</b> diseño por capas (fondo y estructura, zonas, KPI, visuales, anotaciones, interactividad), diseño en 7 segundos (¿qué ve, dónde mira, qué historia, qué acción?), diseño modular (KPI, temporal, detalle, segmentación, conclusiones) y diseño por intención (cada elemento responde a una pregunta o habilita una acción). Test de 5 segundos.</p>
`},
{t:"storytelling", s:S + " · 8. Storytelling (caso completo)", h:`
<p>Seis lecciones: comprender el contexto, elegir el visual, eliminar el caos, dirigir la atención, pensar como diseñador y contar una historia. Caso: precios de cinco productos de consumo por año.</p>
<ol>
<li><b>Contexto:</b> audiencia (jefe de producto), qué debe hacer (fijar un rango de precio competitivo) y cómo ayudamos. <b>Gran Idea:</b> «recomendamos un rango ABC €-XYZ € por la tendencia decreciente y la convergencia del mercado»; accionable, concreta y relevante.</li>
<li><b>Visual:</b> de columnas de colores con leyenda a <b>líneas</b> en un único eje: v1 colores por defecto, v2 todo gris con etiquetas directas, v3 color solo en el insight.</li>
<li><b>Caos:</b> sin cuadrícula, bordes ni sombras, ejes mínimos, etiquetas directas.</li>
<li><b>Atención:</b> tres titulares posibles con distinto highlight: caída tras el lanzamiento de C en 2010, patrón de entrada cara y caída posterior, y convergencia en torno a 223 € en 2014.</li>
<li><b>Diseño:</b> espacio en blanco, tipografía, alineación, capas.</li>
<li><b>Historia:</b> planteamiento (analizamos los competidores), nudo (2010 punto de inflexión, patrón de lanzamientos, convergencia) y desenlace (recomendación). Storyboard de siete diapositivas, de todas las líneas en gris a la tarjeta KPI con el rango recomendado.</li>
</ol>
`}
);
EXAM.push(
{k:"Visualización", t:"percepcion", s:S, q:"Según el Manual DataViz, ¿cuántos colores como máximo por visualización y con qué papel?", a:"Tres: un color principal, uno secundario y uno de highlight; el resto en grises."},
{k:"Visualización", t:"percepcion", s:S, q:"¿Qué significa F.E.C.O.?", a:"Focus (qué se ve primero), Emphasis (un atributo preatentivo potente), Context (desaturar lo secundario) y Order (orden de lectura)."},
{k:"Visualización", t:"percepcion", s:S, q:"¿Cuándo es aceptable un gráfico de anillo?", a:"Solo con una categoría principal y 3 o menos segmentos, con el número en el centro; nunca para comparar categorías ni ver tendencias."}
);
})();
