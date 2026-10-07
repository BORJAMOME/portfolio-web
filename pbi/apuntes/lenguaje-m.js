/* Fundamentos del lenguaje M (NamasData) */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var S = "Fundamentos del lenguaje M (NamasData)";
NOTES.push(
{t:"m", s:S + " · 0. Repaso", h:`
<h4>Ventajas de aprender M</h4>
<ul>
<li>ETL en menos pasos que con la interfaz.</li>
<li>Transformaciones complejas que la interfaz sola no resuelve.</li>
<li>Optimizar el rendimiento de las consultas.</li>
<li>Retocar el código que genera la interfaz para evitar pasos posteriores innecesarios.</li>
<li>Más de 800 funciones disponibles.</li>
</ul>
`},
{t:"m", s:S + " · 1. Introducción al lenguaje M", h:`
<h4>Los tres ambientes</h4>
<p><b>Barra de fórmulas</b>, cuadro de <b>columna personalizada</b> y <b>editor avanzado</b>. Partes del editor avanzado: nombre de la consulta, opciones de presentación, cuerpo, panel de mensajes, botones de acción y ayuda.</p>
<p><b>Opciones de presentación:</b> mostrar números de línea; representar el espacio en blanco (puntos, útil para indentar a mano); minimapa (código largo); habilitar el ajuste de línea (parte el código para leerlo mejor).</p>
<h4>Reglas de formato del código</h4>
<ul>
<li>Salto de línea entre el identificador y su primera función.</li>
<li>Un espacio entre expresiones y subexpresiones, salvo las triviales (<code>a = 3</code>).</li>
<li>Un espacio antes y después de cada operador.</li>
<li>Funciones con muchos argumentos: un parámetro por línea salvo el primero; listas y registros muy estructurados, un elemento por línea con su indentación.</li>
<li>No partir código sencillo que se lee en una línea. Atajos: Mayús + Intro (salto) y Tab (indentar).</li>
</ul>
<h4>let e in</h4>
<p><b>let</b> abre el bloque donde se definen variables y expresiones (lo que se ve al abrir cualquier consulta); <b>in</b> lo cierra e indica qué variable se devuelve (cualquiera de las definidas). Dentro de un bloque puede haber <b>bloques anidados</b> para cálculos intermedios o como argumento de otra función (por ejemplo dentro de <code>Table.AddColumn</code>).</p>
<h4>Variables o identificadores</h4>
<p>Son «cajas» que guardan valores; la interfaz las crea y nombra sola en cada paso, pero se pueden nombrar a mano. Reglas: empezar por texto o guion bajo, sin espacios. Válidos: <code>_Nombre</code>, <code>Nombre</code>, <code>NombreCompuesto</code>, <code>Nombre_Compuesto</code>. Con espacios: <code>#"Nombre Compuesto" = Expresión</code>.</p>
<p><b>No usar palabras reservadas</b> (ni con otras mayúsculas): and, as, each, else, error, false, if, in, is, let, meta, not, null, or, otherwise, section, shared, then, true, try, type, #binary, #date, #datetime, #datetimezone, #duration, #infinity, #nan, #sections, #shared, #table, #time. Tampoco nombres de tipos como number, text o logical.</p>
<h4>Expresiones</h4>
<p>Fórmulas que producen un valor (válido o un error). <b>Literales</b>: <code>A = 3</code>, <code>Y = "Texto"</code>, <code>U = null</code>. <b>Complejas</b>: <code>A = (Y + Z) - (X * C)</code>. <b>Subexpresiones</b>: partes separadas por operadores. <b>Tokens</b>: comas, paréntesis, llaves, corchetes, comillas.</p>
<h4>Valores</h4>
<table class="dxtbl"><thead><tr><th>Tipo</th><th>Sintaxis</th></tr></thead><tbody>
<tr><td>Fecha</td><td><code>#date(2023,3,17)</code></td></tr>
<tr><td>Hora</td><td><code>#time(23,23,23)</code></td></tr>
<tr><td>Fecha y hora</td><td><code>#datetime(2023,3,17,23,23,23)</code></td></tr>
<tr><td>Con zona</td><td><code>#datetimezone(2023,3,17,23,23,23,1,0)</code></td></tr>
<tr><td>Duración (d, h, m, s)</td><td><code>#duration(1,12,15,23)</code>; <code>Duration.From</code> convierte a duración</td></tr>
</tbody></table>
<p><b>Estructurados</b> (construidos con primitivos): listas, registros, tablas y funciones.</p>
<h4>Errores de escritura</h4>
<ul>
<li><b>Internos o de sintaxis:</b> subrayado rojo mientras escribes (falta una coma, un token, sintaxis mal escrita).</li>
<li><b>Posteriores:</b> al pulsar Listo; variables inexistentes o mal escritas. M distingue mayúsculas: <code>Potencia</code> no es <code>potencia</code>.</li>
<li>Consejos: corregir en cuanto aparezcan; cerrar cada token abierto; <b>todos los pasos acaban en coma salvo el último antes de in</b>; escribir las funciones tal cual; respetar los nombres de variables.</li>
</ul>
<p><b>IntelliSense</b> colorea: azul para palabras reservadas (each, type, let, in, if, then, else…), verde para tipos y números (text, number, list, record, table…), rojo para cadenas de texto y errores.</p>
<h4>Prácticas</h4>
<p>Leer el código de una consulta: let/in y las variables Origen, Encabezados promovidos y Tipo cambiado. Crear una fecha a partir de las columnas Mes, Día y Año (en la fórmula que genera M <b>importa el orden de las columnas</b>). Ejercicios de listas (lista de listas, de números, alfabética <code>{"a".."z"}</code>, de fechas, alfanumérica) y registros (registro de registros).</p>
`},
{t:"m", s:S + " · 2 y 3. Expresiones y ambiente", h:`
<p>El tema 2 (expresiones, declaración de variables literal y explícita, reglas de identificadores, valores primitivos e intrínsecos, estructurados y operadores) quedó como índice en Notion; su contenido está resumido en la nota anterior.</p>
<h4>El ambiente</h4>
<p>Es el espacio donde viven las variables y sus expresiones. En un registro <code>R1 = [C1 = 1, C2 = 2, C3 = C1 + C2]</code>, R1 crea un ambiente padre y sus campos son variables de ese ambiente: R1 accede a cada campo, pero desde fuera no se puede usar C1 como si fuera una variable suelta.</p>
<h4>Cómo evalúa M</h4>
<ul>
<li><b>Evaluación perezosa (lazy):</b> solo se calcula cuando hace falta; las asignaciones a variables funcionan así (un paso que no se usa en el resultado no se evalúa).</li>
<li><b>Evaluación ansiosa (eager):</b> el resto de expresiones se evalúan en cuanto aparecen al ejecutar la consulta.</li>
</ul>
`},
{t:"m", s:S + " · 4. Funciones", h:`
<pre><code>NombreFuncion = (Par1, Par2, ParN) =&gt; Expresión</code></pre>
<p>Los parámetros se pueden tipar (<code>(precio as number, cantidad as number) =&gt; ...</code>) y marcar como <b>opcionales</b> con <code>optional</code>; dentro se resuelve con <code>if ... then ... else</code> (caso IVA: si no se informa el IVA, se aplica uno por defecto). Para usarla sobre una tabla: Agregar columna → <b>Invocar función personalizada</b>.</p>
<h4>Parámetros dinámicos: IVA por país</h4>
<ol>
<li>Inicio → Administrar parámetros → Nuevo parámetro (tipo, valores sugeridos: lista de valores para tener un desplegable de países <code>PaisIva</code>).</li>
<li>Consulta en blanco con la tabla de IVA:
<pre><code>= #table({"Pais", "IVA"},
    {
        {"Argentina", 0.21},
        {"Chile", 0.19},
        {"España", 0.21},
        {"Venezuela", 0.16}
    }
)</code></pre></li>
<li>Filtrar la columna País y sustituir el texto fijo del filtro por el parámetro <code>PaisIva</code>.</li>
<li>Extraer el valor con <code>{0}</code> (es la única fila): <code>Tabla[IVA]{0}</code>.</li>
<li>En la consulta de ventas, cambiar el IVA estático por esa consulta: la variable pasa de estática a dinámica. Al cambiar el parámetro (también desde Power BI Desktop) cambian los importes.</li>
</ol>
<h4>Lógica condicional</h4>
<pre><code>if Expresión then ValorSiVerdadero else ValorSiFalso</code></pre>
<p>Caso: calcular el IVA según si el producto es EXENTO o GRAVABLE. La columna condicional de la interfaz no admite un parámetro como resultado, pero se puede editar el M generado para multiplicar directamente y ahorrarse un paso.</p>
<h4>Librería estándar</h4>
<p>Se consulta en: documentación oficial de Microsoft, <code>#shared</code>, escribiendo el nombre de la función en la barra de fórmulas (sin paréntesis muestra su ayuda) e IntelliSense.</p>
<table class="dxtbl"><thead><tr><th>Función</th><th>Resultado</th></tr></thead><tbody>
<tr><td><code>List.Reverse({1..10})</code></td><td>10, 9, …, 1</td></tr>
<tr><td><code>List.Numbers(10, 10, -1)</code></td><td>10 números desde 10 bajando de 1 en 1</td></tr>
<tr><td><code>Number.Power(2, 32)</code></td><td>Potencia</td></tr>
<tr><td><code>{"a".."z"}</code></td><td>Lista de letras</td></tr>
<tr><td><code>List.Dates(#date(2023,1,1), 15, #duration(1,0,0,0))</code></td><td>15 fechas consecutivas (base de un calendario)</td></tr>
<tr><td><code>List.Dates(#date(2023,1,1), 15, #duration(-1,0,0,0))</code></td><td>15 fechas hacia atrás</td></tr>
</tbody></table>
<p>Quedaron como índice sin desarrollar: sintaxis y componentes (nombre, argumentos, separadores, tipos, optional), la expresión <code>each</code> y tablas y listas anidadas.</p>
`},
{t:"m", s:S + " · 5. Casos reales", h:`
<h4>Caso 1: participación en eventos</h4>
<p>Una tabla de 200 empleados y tres listas de asistentes. Se duplica la consulta de empleados cambiando la hoja (<code>[Name="Evento1"]</code>…).</p>
<ul>
<li><b>Fueron a los tres:</b> consulta en blanco con <code>List.Intersect({Evento1[ID], Evento2[ID], Evento3[ID]})</code> → 58 personas. Para ver nombre y apellido se filtra la tabla de personal de forma dinámica con <code>List.ContainsAny</code> / <code>List.Contains</code> sobre esa lista.</li>
<li><b>Al menos a uno (sin los anteriores):</b> unión de las tres listas (<code>List.Union</code>) menos la intersección (<code>List.Difference</code>).</li>
<li><b>A ninguno:</b> la lista de empleados menos la unión de asistentes.</li>
</ul>
<h4>Caso 2: unpivot dinámico</h4>
<p>Una hoja con bloques de columnas (Nombre, Edad) por ciudad que crecerá en el futuro. Objetivo: tres columnas Nombre, Edad y Ciudad que sigan funcionando cuando se añadan sedes.</p>
<ol>
<li>Conectar el Excel y quitar Encabezados promovidos.</li>
<li>Insertar paso con la primera fila, pasar de registro a lista y quedarse con los valores únicos (las ciudades, sin null).</li>
<li>Convertir las columnas de la tabla en lista (<code>Table.ToColumns</code>), partirlas en bloques del tamaño de columnas por ciudad (<code>List.Split</code>) y hacer dinámico ese número en lugar de escribir 2.</li>
<li>Quitar las filas que no son datos y los null, convertir cada bloque en tabla (<code>Table.FromColumns</code>) y nombrar las columnas.</li>
<li>Anexar el nombre de la sede (posición 0 de la lista de ciudades) y combinar las tablas; renombrar.</li>
<li>Al añadir una sede nueva en el Excel, basta con actualizar.</li>
</ol>
<h4>Caso 3: aplicación de impuestos</h4>
<p>Cargar, eliminar Tipo cambiado, agregar un paso <b>Impuestos</b> que convierte la tabla de impuestos en un <b>registro</b> (<code>Record.FromList</code> o <code>Record.FromTable</code>), empaquetar los registros, extraer el valor que corresponde a cada fila con <code>Record.Field</code> y transformar la lista resultante en el importe final.</p>
`}
);
EXAM.push(
{k:"Power Query", t:"m", s:S, q:"¿Cómo se escribe el nombre de un paso de M que contiene espacios?", a:"Con almohadilla y comillas: <code>#\"Nombre Compuesto\"</code>."},
{k:"Power Query", t:"m", s:S, q:"En el editor avanzado, ¿qué paso no termina en coma?", a:"El último paso del bloque let, el que precede a in."},
{k:"Power Query", t:"m", s:S, q:"¿Qué diferencia hay entre evaluación perezosa y ansiosa en M?", a:"La perezosa solo calcula cuando el valor hace falta (asignaciones de variables; un paso no usado no se evalúa). La ansiosa evalúa la expresión en cuanto aparece."},
{k:"Power Query", t:"m", s:S, q:"¿Qué función usarías para obtener los empleados que asistieron a los tres eventos?", a:"<code>List.Intersect</code> sobre las tres listas de ID y después filtrar la tabla de personal con <code>List.Contains</code>."}
);
})();
