/* Power Query Esencial · Introducción a M (NamasData) */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var S = "Power Query Esencial · Introducción a M (NamasData)";
NOTES.push(
{t:"obtener", s:S, h:`
<h4>Interfaz de Power Query</h4>
<p>Desde Power BI Desktop: <b>Obtener datos</b> → elegir el conector → <b>Transformar datos</b> abre el editor. Zonas: panel de <b>Consultas</b> (izquierda), vista previa de datos (centro), <b>Configuración de la consulta</b> con Propiedades y <b>Pasos aplicados</b> (derecha), barra de fórmulas y cinta de herramientas (Inicio, Transformar, Agregar columna, Vista). Cada clic en la interfaz genera un paso en M que se puede revisar, renombrar, mover o eliminar.</p>
<h4>Tipos de conexión</h4>
<table class="dxtbl"><thead><tr><th>Modo</th><th>Qué hace</th><th>Ventajas</th><th>Limitaciones</th></tr></thead><tbody>
<tr><td><b>Importar</b></td><td>Opción por defecto: copia los datos en memoria (VertiPaq)</td><td>El más rápido; permite combinar fuentes; todas las funciones de DAX y Power Query</td><td>Hay que refrescar para ver datos nuevos; es la única opción para archivos (Excel, CSV…)</td></tr>
<tr><td><b>DirectQuery</b></td><td>Consulta el origen en cada interacción</td><td>Bases de datos muy grandes; datos siempre actualizados de forma automática</td><td>No se pueden combinar fuentes libremente; sin columnas calculadas complejas; depende del rendimiento del origen</td></tr>
<tr><td><b>Conexión en vivo</b></td><td>Se conecta a un modelo ya construido</td><td>El modelo ya viene relacionado y gobernado</td><td>Solo para Azure Analysis Services, SSAS Tabular, SSAS Multidimensional y modelos semánticos de Power BI; sin Power Query ni columnas calculadas; solo medidas locales al informe</td></tr>
<tr><td><b>Compuesto / Dual</b></td><td>Mezcla tablas importadas y DirectQuery</td><td>Dimensiones en Dual sirven a ambos mundos</td><td>Hay que configurar niveles de privacidad; la vista de tabla solo muestra las tablas importadas</td></tr>
</tbody></table>
`},
{t:"m", s:S, h:`
<h4>Listar todas las funciones de M</h4>
<p>En una <b>consulta en blanco</b> escribir <code>= #shared</code>. Devuelve un registro con todas las funciones y valores disponibles: convertir a tabla, filtrar la columna Name (por ejemplo «Text.») y hacer clic en <i>Function</i> para ver la ayuda y probarla.</p>
<h4>Introducción a M</h4>
<p>M se escribe en tres ambientes: la <b>barra de fórmulas</b>, el cuadro de <b>columna personalizada</b> y el <b>editor avanzado</b>.</p>
<ul>
<li><b>Variables o nombres de paso:</b> cada paso es una variable. Si el nombre tiene espacios se escribe como <code>#"Tipo cambiado"</code>; mejor evitar espacios.</li>
<li><b>Valores primitivos</b> (número, texto, lógico, null, fecha…) y <b>estructurados</b>: lista <code>{1, 2, 3}</code>, registro <code>[Nombre = "Ana", Edad = 30]</code> y tabla.</li>
<li><b>Operadores:</b> <code>+ - * / &gt; &gt;= &lt; &lt;= = &lt;&gt; or and not &amp;</code> (concatenar), <code>[ ]</code> (acceso a campo), <code>{ }</code> (acceso por posición), <code>is</code> y <code>as</code> (tipos).</li>
<li><b>Expresiones y let/in:</b> el bloque <code>let</code> define pasos y <code>in</code> devuelve el resultado.</li>
</ul>
<pre><code>let
    Nombre = "power query esencial",
    Resultado = Text.Proper(Nombre)
in
    Resultado</code></pre>
<p>El temario lista también, sin desarrollar en los apuntes, la librería estándar, las funciones personalizadas y la palabra clave <code>each</code>.</p>
`},
{t:"perfilado", s:S, h:`
<h4>Caso CSV</h4>
<ul>
<li>Activar <b>Calidad, distribución y perfil de columna</b> y cambiar a «Generación de perfiles basada en todo el conjunto de datos» (por defecto solo usa las primeras 1000 filas).</li>
<li>Para investigar errores: clic derecho en la columna → <b>Conservar errores</b>, y ver qué valores fallan.</li>
<li><b>Error de fecha por configuración regional</b>: el CSV trae fechas en formato mes/día. Solución: eliminar el paso «Tipo cambiado» y usar <b>Cambiar tipo → Usando configuración regional</b> (Fecha, Inglés (Estados Unidos)).</li>
<li><b>Columna Amount con decimales</b>: en vez de borrar el paso y rehacerlo, <b>modificar el código M del paso</b> en la barra de fórmulas (cambiar el tipo o la referencia regional).</li>
</ul>
`},
{t:"transformar", s:S, h:`
<h4>Libros de mayor (contabilidad)</h4>
<ol>
<li>Contar filas al empezar para comprobar después que no se pierden datos.</li>
<li>Quitar filas en blanco.</li>
<li>Crear <b>columnas condicionales</b> que extraigan el número y nombre de cuenta de las filas de cabecera y <b>Rellenar hacia abajo</b>.</li>
<li>Columna condicional para detectar la fila de encabezado y <b>Usar la primera fila como encabezado</b>.</li>
<li>Tipificar la columna Fecha: lo que no es fecha pasa a error o null y se filtra (más robusto que desmarcar valores en el filtro, que se rompe con datos nuevos).</li>
<li>Reemplazar null por 0 en Débito y Crédito.</li>
<li><b>Saldo neto</b>: columna personalizada <code>[Débito] - [Crédito]</code> o seleccionar las dos columnas → Agregar columna → Estándar → Restar.</li>
</ol>
<h4>Limpieza de datos</h4>
<ul>
<li>Quitar filas y columnas en blanco.</li>
<li>Eliminar filas de <b>totales y subtotales</b> (no deben entrar al modelo: DAX ya agrega).</li>
<li>Contar filas antes y después de cada limpieza.</li>
<li>Tratar los null, quitar columnas innecesarias y <b>extraer la fecha sin la hora</b> (Transformar → Fecha → Solo fecha) para reducir cardinalidad.</li>
</ul>
<h4>Transposiciones</h4>
<p>PDF con la tabla «girada»: Transformar → <b>Transponer</b> → Usar la primera fila como encabezado.</p>
`},
{t:"combinar", s:S, h:`
<h4>PDF avanzado: varios PDF de una carpeta</h4>
<ol>
<li>Obtener datos → <b>Carpeta</b> → Transformar datos (se ven los metadatos: Name, Extension, Date modified, Content…).</li>
<li>Filtrar <code>Kind = Page</code> (las páginas, no las tablas detectadas) y expandir Data sin prefijo de nombre.</li>
<li>Aplicar configuración regional, quitar errores y nulos.</li>
<li>Columna de índice + <b>Anular dinamización de otras columnas</b>.</li>
<li>Extraer el texto tras un delimitador, columna par/impar, columna condicional, <b>Rellenar hacia arriba</b>, quitar nulos y ordenar.</li>
</ol>
<p><b>Método 2: función personalizada.</b> Copiar el M del editor avanzado de la consulta de un PDF y convertirlo en función con <code>(tbl as table) =&gt;</code> al inicio; renombrarla (por ejemplo <code>FxPDFRet</code>). Después: Agregar columna → <b>Invocar función personalizada</b> sobre cada archivo. Si hay que «rastrear» los datos, desagrupar y convertir a lista y combinar con <code>Table.Combine</code>.</p>
<h4>Transposiciones desde carpeta</h4>
<ol>
<li>Carpeta → quedarse con la columna binaria Content.</li>
<li>Columna personalizada <code>Pdf.Tables([Content])</code>, expandir y filtrar <code>Kind = Table</code>.</li>
<li>Crear la función personalizada desde el editor avanzado (transponer + encabezados) e invocarla.</li>
<li>Al añadir nuevos PDF a la carpeta basta con <b>Actualizar</b>.</li>
</ol>
`}
);
EXAM.push(
{k:"Power Query", t:"obtener", s:S, q:"Te conectas a un modelo semántico publicado en Power BI Service con conexión en vivo. ¿Puedes crear columnas calculadas o abrir Power Query?", a:"No. En conexión en vivo no hay Power Query ni columnas calculadas; solo puedes crear medidas locales al informe."},
{k:"Power Query", t:"m", s:S, q:"¿Cómo obtienes en Power Query la lista de todas las funciones disponibles de M?", a:"Consulta en blanco con <code>= #shared</code>, convertir el registro a tabla y filtrar por nombre."},
{k:"Power Query", t:"perfilado", s:S, q:"Un CSV con fechas mes/día da errores al convertir a fecha. ¿Qué haces?", a:"Eliminar el paso Tipo cambiado y usar Cambiar tipo → Usando configuración regional con la región del origen (por ejemplo Inglés (Estados Unidos))."}
);
})();
