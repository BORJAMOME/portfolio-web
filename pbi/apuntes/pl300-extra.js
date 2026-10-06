/* PL-300 · páginas complementarias: especificaciones, registro de cambios, apuntes de alumnos por clase,
   grupo de Telegram, caso de estudio e información extra.
   Las notas con t:"pl300" se muestran en la vista PL-300; el resto, en su tema. */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var S1 = "PL-300 · Especificaciones del examen";
var S2 = "PL-300 · Apuntes de alumnos (temas importantes)";
var S3 = "PL-300 · Caso de estudio del examen";
var S4 = "PL-300 · Información extra";
NOTES.push(
{t:"pl300", s:S1, h:`
<h4>Cómo se actualiza el examen</h4>
<ul>
<li><b>Actualización periódica:</b> el examen se revisa para reflejar las habilidades más relevantes del rol.</li>
<li><b>Primero en inglés:</b> la versión inglesa se actualiza antes; el resto de idiomas suele llegar unas <b>ocho semanas después</b>.</li>
<li>Si la versión en español no está al día, puede no reflejar los últimos cambios. Se comprueba en <i>Schedule Exam</i> de la página oficial.</li>
<li>Si el examen no está en tu idioma puedes pedir <b>30 minutos adicionales</b>.</li>
</ul>
<p><b>Estrategia:</b> verifica el idioma antes de programar; prepárate con materiales actualizados en inglés; si lo haces en inglés, pide la extensión de tiempo.</p>
<h4>Perfil del candidato</h4>
<ul>
<li>Traducir datos en información accionable que genere valor y crear visualizaciones claras.</li>
<li>Diseñar soluciones de <b>autoservicio</b> para que otros trabajen con los datos de forma independiente.</li>
<li>Colaborar con las partes interesadas (necesidades de negocio) y con ingenieros de datos (adquirir y preparar datos).</li>
</ul>
<h4>Áreas que se miden</h4>
<ol>
<li><b>Preparar los datos:</b> importar, limpiar y transformar con Power Query; formatos y técnicas de modelado.</li>
<li><b>Modelar los datos:</b> modelos eficaces, relaciones, medidas y jerarquías con DAX.</li>
<li><b>Visualizar y analizar:</b> informes y paneles funcionales; análisis avanzado con las herramientas nativas.</li>
<li><b>Administrar y proteger Power BI:</b> flujos de trabajo, permisos y seguridad; protección de datos sensibles.</li>
</ol>
<p><b>Competencias técnicas:</b> Power Query (limpiar, transformar, cargar, consultas complejas y ETL optimizado) y DAX (medidas avanzadas, columnas calculadas, problemas complejos de modelado).</p>
`},
{t:"pl300", s:"PL-300 · Registro de cambios (21 de octubre de 2024)", h:`
<table class="dxtbl"><thead><tr><th>Antes del 21/10/2024</th><th>Desde el 21/10/2024</th><th>Cambio</th></tr></thead><tbody>
<tr><td>Perfil del público</td><td>(se elimina como área)</td><td>Principal</td></tr>
<tr><td>Crear informes · Transformar y cargar datos · Diseñar e implementar un modelo de datos · Mejorar los informes para la facilidad de uso y la narración · Identificar patrones y tendencias</td><td>Igual</td><td>Principal</td></tr>
<tr><td>Modelado de los datos</td><td>Modelado de los datos</td><td>Sin cambios</td></tr>
<tr><td>Preparar los datos</td><td>Preparar los datos</td><td>Sin cambios</td></tr>
<tr><td>Obtener datos desde orígenes de datos</td><td>Obtención o conexión a datos</td><td>Secundaria</td></tr>
<tr><td>Limpieza de los datos</td><td>Generación de perfiles y limpieza de los datos</td><td>Secundaria</td></tr>
<tr><td>Crear cálculos de modelos mediante DAX</td><td>Igual</td><td>Secundaria</td></tr>
<tr><td>Optimizar el rendimiento del modelo</td><td>Igual</td><td>Secundaria</td></tr>
<tr><td>Visualización y análisis de los datos</td><td>Igual</td><td>Sin cambios</td></tr>
<tr><td>Implementar y mantener elementos</td><td>Administración y protección de Power BI</td><td>Secundaria</td></tr>
<tr><td>Crear y administrar áreas de trabajo y recursos</td><td>Igual</td><td>Secundaria</td></tr>
<tr><td>—</td><td>Protección y control de elementos de Power BI</td><td>Nuevo</td></tr>
<tr><td>Administración de modelos semánticos</td><td>—</td><td>Eliminado</td></tr>
</tbody></table>
`},
{t:"pl300", s:"PL-300 · Grupo de Telegram (preparación)", h:`
<p><b>Qué preguntan según quienes ya se han presentado:</b> seguridad en Power BI Service, para qué sirve la calidad de columna (<i>Data Quality</i>), el perfil de datos (<i>Data Profile</i>) y las interfaces de Power Query.</p>
<p><b>Consejo:</b> prepararse a fondo el <i>learning path</i> oficial de Microsoft Learn.</p>
<p>Recursos que se compartieron: vídeo «Sin miedo al PL-300: preparación y registro», cursos gratuitos de learndatainsights.com, vídeo «Desentrañando el caso de uso del examen PL-300» y el test de práctica oficial de MeasureUp.</p>
`},
{t:"pl300", s:S3, h:`
<p>El caso de estudio tiene un enunciado largo con pestañas (situación, requisitos, datos) y <b>entre 4 y 6 preguntas</b>.</p>
<h4>Caso 1</h4>
<ul><li>Nombres de país mal escritos: <b>Reemplazar valores</b> en la columna País.</li>
<li>Unir productos y tipos: <b>Combinar</b> ambas tablas por la columna ProductTypeID.</li></ul>
<h4>Caso 2</h4>
<ul>
<li><b>Conjunto de datos compartido</b>: varios informes usan el mismo modelo publicado.</li>
<li>Al compartir el modelo con permiso <b>Compilación</b> (crear contenido), la RLS se sigue respetando: el usuario de Asia solo ve su unidad de negocio. El permiso de <b>escritura</b> permite modificar el modelo.</li>
<li>Distribución a usuarios: mediante una <b>aplicación</b> asignada a un <b>grupo de seguridad de Azure AD</b>.</li>
<li>Relación entre las tablas del caso: <b>uno a varios</b>.</li>
<li>Actualización: configurar una <b>actualización programada con puerta de enlace de datos local</b>; en cuanto hay un origen local (en el caso, Dynamics 365 junto a SQL Server) hace falta puerta de enlace.</li>
<li>RLS por región, orden de pasos: 1) en Desktop crear 4 roles; 2) en Desktop añadir a los roles la expresión DAX de filtro de tabla; 3) publicar el modelo en powerbi.com; 4) en powerbi.com agregar miembros a los roles.</li>
</ul>
`}
);

NOTES.push(
{t:"obtener", s:S2, h:`
<p><b>Clase 2. Metadatos en SharePoint:</b> pregunta típica (conocer los metadatos de un archivo de carpeta o SharePoint: Transformar datos y expandir Attributes).</p>
<p><b>Tipos de conexión:</b> DirectQuery para muchos datos y mucha frecuencia; Importar para pocos datos y poca frecuencia; Mixto (compuesto), combinación de ambos.</p>
<p><b>Clase 3. «Navegador»:</b> cuando el examen habla del Navegador se refiere a la ventana de selección de orígenes y tablas al conectar.</p>
`},
{t:"vertipaq", s:S2, h:`
<p><b>Agregaciones (clase 2):</b></p>
<ul><li><b>Tabla intermedia agrupada:</b> se duplica la tabla de hechos en Power Query y se agrupa por la dimensión correspondiente.</li>
<li><b>Administrar agregaciones:</b> la tabla agregada se marca en modo Importación y se configura con clic derecho &gt; Administrar agregaciones.</li>
<li>El tipo de dato debe coincidir en ambas tablas; por defecto, al agrupar en Power Query las sumas salen como decimales.</li></ul>
`},
{t:"transformar", s:S2, h:`
<p><b>Clase 5. Transponer:</b> pasa los encabezados de columnas a filas y viceversa. Los encabezados desaparecen al transponer; para conservarlos, primero <i>Usar encabezados como primera fila</i> y después transponer.</p>
<p><b>Anular dinamización:</b> pasar columnas en horizontal a vertical. Las columnas deben ser de la misma tipología (por ejemplo, meses); si hay Presupuesto y Real mezclados se usa otra técnica. La tabla debe tener encabezados.</p>
<p><b>Dinamizar:</b> poner atributos de filas como columnas (por ejemplo, los meses), de vertical a horizontal.</p>
`},
{t:"combinar", s:S2, h:`
<p><b>Clase 6. Operaciones de tabla:</b> combinar, anexar, extraer… Para combinar, las columnas clave deben tener el <b>mismo tipo de datos</b>. En el examen puede aparecer como pregunta camuflada: una captura donde los campos combinados no tienen el mismo tipo.</p>
`},
{t:"perfilado", s:S2, h:`
<p><b>Clase 7. Operaciones de columna:</b></p>
<ul>
<li><b>Calidad de columna:</b> arriba, justo bajo el encabezado (la más rápida para ver válidos, errores y vacíos).</li>
<li><b>Distribución de columnas:</b> en medio, bajo la calidad.</li>
<li><b>Perfil de columna:</b> en el pie de la vista; los tres puntos de la derecha amplían información.</li>
</ul>
<p>Las opciones de los tres puntos y del clic derecho sobre las barras cambian según el tipo de dato (numérico, fecha o texto). Cuidado con <b>distintos y únicos</b>. Granularidad = nivel de detalle.</p>
`},
{t:"relaciones", s:S2, h:`
<p><b>Cardinalidad en el examen:</b> fíjate en el orden en que se nombran las tablas. «Uno a varios» y «varios a uno» son lo mismo en la práctica, pero el enunciado puede presentarlo de una u otra forma para confundir.</p>
`},
{t:"grupos", s:S2, h:`
<p><b>Clase 8. Categorización de datos e icono de jerarquía:</b> puede salir pregunta. <b>Explorar en profundidad:</b> al seleccionar un punto, el filtro se extiende al resto de visuales.</p>
<p><b>Agregaciones por defecto en columnas numéricas:</b> Power BI suma automáticamente. Conviene desactivarlo: de una en una, o (más rápido) en la vista de modelo seleccionando varios campos y poniendo Resumir por = Ninguno.</p>
<p><b>Ordenación de columnas</b> según el análisis. Se pueden crear <b>grupos de grupos</b>.</p>
`},
{t:"calendario", s:S2, h:`
<p><b>Clase 9. Calendarios:</b> Power BI puede crear jerarquías de fecha automáticas. <code>CALENDARAUTO()</code> busca la fecha mínima y máxima de todas las tablas; <code>CALENDAR(inicio, fin)</code> usa el rango indicado.</p>
<p>La columna generada se llama <b>[Date]</b>; aunque la renombres, el DAX sigue respondiendo a Date.</p>
<p><b>Orden de creación:</b> 1) crear la tabla calendario; 2) marcarla como tabla de fechas (clic derecho &gt; Marcar como tabla de fechas); 3) elegir la columna Date. No basta con crearla y relacionarla. Puede haber más de una tabla de fechas.</p>
`},
{t:"medidas", s:S2, h:`
<p><b>Clase 10. Medidas rápidas:</b> pueden enseñarte los campos rellenos y preguntar el resultado, o al revés. <b>Valor base</b>: columnas numéricas o medidas. <b>Categoría</b>: una dimensión o categoría.</p>
`},
{t:"ti", s:S2, h:`
<p><b>Clase 11. Inteligencia de tiempo:</b> <code>DATEADD</code> con intervalo <b>-1</b> para el año previo (sin signo, hacia delante). Acumulados desde el inicio del año: <code>DATESYTD</code> o <code>TOTALYTD</code>. Si el año fiscal no coincide con el natural se configura el final del año fiscal; si coincide, nada.</p>
<p><b>Clase 12.</b> El acumulado a lo largo del tiempo sin reiniciar cada año (no es YTD) no entra en el examen, pero es útil.</p>
<p><b>Clase 13. Contar días laborables:</b> <code>NETWORKDAYS</code> cuenta días excluyendo sábados, domingos o festivos.</p>
<p><b>Medidas aditivas, semiaditivas y no aditivas:</b> aditivas, se suman en vertical y horizontal; semiaditivas, en horizontal pero no en vertical (tiempo); no aditivas, en ninguna dirección. Algunas funciones de saldo solo informan de meses completos: a mitad de mes devuelven blanco (posible pregunta).</p>
`},
{t:"calculate", s:S2, h:`
<p><b>Clase 12. Porcentajes:</b></p>
<ul><li><code>ALL</code>: cuidado con una columna ordenada por otra; hay que indicar ambas columnas o aplicarlo a toda la tabla, si no deja de funcionar.</li>
<li><code>REMOVEFILTERS</code>: solo dentro de CALCULATE; se comporta como ALL.</li>
<li><code>KEEPFILTERS</code>: mantiene los filtros de lo seleccionado.</li></ul>
<p><b>Juego de roles:</b> una tabla que cumple varios roles (fecha de apertura y de cierre). Opción A: duplicar la tabla de fechas y relacionar cada copia con un campo (dos segmentadores). Opción B: una sola tabla con dos relaciones y <code>USERELATIONSHIP</code> dentro de CALCULATE para elegir por cuál viajar.</p>
`},
{t:"interactividad", s:S2, h:`
<p><b>Clase 13. Objetos visuales personalizados:</b> la organización puede restringir su uso y descarga; normalmente hay que iniciar sesión. Pueden preguntar cómo configurar la descarga de la nube de palabras.</p>
<p><b>Clase 15. Filtros:</b> a nivel de página o de todas las páginas desde el panel de filtros. Puedes <b>bloquear</b> un filtro (el usuario ve que existe pero no lo cambia) u <b>ocultarlo</b> (no lo ve ni sabe que se aplica). <b>Sincronizar segmentaciones</b> entre páginas.</p>
<p><b>Analizar en Excel y exportar (Service):</b> saber cuántas filas se exportan en cada tipo de conexión. La exportación se puede deshabilitar en las opciones del servicio, en los tres puntos del informe o en Desktop marcando «Ninguno». <i>Analizar en Excel</i> conecta al modelo completo; requiere el complemento y permisos sobre el modelo, si no aparece en gris.</p>
<p><b>Informe paginado:</b> pensado para imprimir o compartir, tablas que ocupan varias páginas y control total del diseño; se crean con Power BI Report Builder.</p>
<p><b>Marcadores:</b> con los paneles Selección y Marcadores; decide si recuerdan los datos. Se agrupan y se elige qué grupo muestra el navegador de marcadores. Son de informe; los que crea un usuario solo le afectan a él.</p>
<p><b>Clase 16. Tooltips</b> para información adicional. <b>Navegador de páginas:</b> por defecto muestra las visibles y no las ocultas; se configura qué páginas mostrar. <b>Obtención de detalles</b> con dimensiones o medidas; <i>Entre varios informes</i> navega entre informes de la misma área de trabajo (se habilita en Service, configuración del informe).</p>
<p><b>Explorar en profundidad:</b> <i>Expandir siguiente nivel</i> baja de forma agrupada; <i>Ir al siguiente nivel</i> baja manteniendo el filtro. Se puede configurar para que afecte solo al objeto y no a toda la página.</p>
<p><b>Interacciones:</b> Filtro (filtra el gráfico entero), Resaltado (resalta la parte sobre el total), Ninguno. Pueden enseñar una imagen y preguntar qué pasa. El comportamiento por defecto se cambia en las opciones del archivo actual.</p>
<p><b>Clase 17. Vista móvil:</b> sus ajustes no afectan a escritorio; sin vista móvil el usuario ve la de escritorio. Los paneles de Service también tienen vista móvil (más limitada) y admiten visuales de distintos informes.</p>
<p><b>Preguntas y respuestas:</b> parametrizar <b>sinónimos</b> para los campos que se nombran de varias formas.</p>
`},
{t:"percepcion", s:S2, h:`
<p><b>Clase 14. Vocabulario:</b> <b>lienzo</b> (el folio donde trabajas), <b>papel tapiz</b> (fondo alrededor del lienzo), <b>panel de filtros</b> (a la derecha) y <b>tarjetas de filtro</b> (cada cajita del panel). <b>Barras</b> = horizontales; <b>columnas</b> = verticales.</p>
<p><b>Panel de selección:</b> orden de capas (un objeto puede tapar a otro), agrupar objetos (clic derecho &gt; Agrupar) y <b>orden de tabulación</b> para accesibilidad (se puede excluir un objeto del tabulador sin ocultarlo).</p>
<p><b>Temas:</b> predeterminados y personalizados; cambiar un color del tema cambia todos los elementos; el personalizado se guarda en <b>JSON</b>.</p>
<p><b>Formato condicional</b> (siempre que aparece el botón <i>fx</i>): degradado (mapa de calor con mínimo y máximo), reglas (condiciones sobre campos o medidas) y valor de campo.</p>
<p><b>Clase 17. Detección de anomalías vs marcadores de datos:</b> los marcadores ponen puntos en todos los valores; la detección de anomalías muestra una banda sombreada y puntos solo en los valores anómalos. <b>Percentil</b> mediante líneas de referencia del panel Análisis. <b>Agrupación</b> (crear grupos) y <b>discretización</b> (grupos sobre un campo numérico).</p>
<p><b>Visuales de IA:</b> esquema jerárquico (descomponer una medida), influenciadores clave (factores que afectan a una métrica) y narrativa inteligente (texto automático). En Service, las <b>métricas</b> sirven para KPI de control y seguimiento.</p>
`},
{t:"roles", s:S2, h:`
<p><b>Clase 18. Áreas de trabajo:</b> organizan contenido y acceso. Se da acceso a personas o grupos; Microsoft recomienda <b>grupos de seguridad</b>.</p>
<p><b>Roles:</b> Administrador (control total), Miembro (edita y administra contenido), Colaborador (crea y colabora), Visor (solo ve).</p>
<p><b>Licencias:</b> Gratuita (limitada), Pro (9,40 €/mes, compartir y colaborar), Premium por usuario PPU (18,70 €/mes, funciones avanzadas), Embedded (pago por uso). Un área PPU no es accesible para usuarios Pro; los usuarios PPU sí acceden a áreas Pro.</p>
<p><b>Aplicaciones:</b> una por área de trabajo. Configuración: programa de instalación (colores, logo), contenido (enlaces, paneles, informes y menú lateral; no se pueden ocultar pestañas de un informe) y <b>audiencias</b> (primero se crean y luego se asignan usuarios). Son de solo lectura; usuarios sin acceso al área pueden verlas. Los cambios no llegan hasta pulsar <b>Actualizar aplicación</b>. Los Colaboradores pueden actualizar la app si se les da permiso. Para que un usuario no vea más de lo debido, rol <b>Visor</b>.</p>
`},
{t:"service", s:S2, h:`
<p><b>Clase 19. Anclar:</b> sí se puede anclar un informe completo (página dinámica) a un panel; así los cambios del informe se reflejan, y es la forma de anclar segmentadores.</p>
<p><b>Alertas:</b> sobre un visual (KPI, medidor, tarjeta) con el icono de campana. Las alertas de informe son Premium y no entran; en el examen, alertas desde el panel con los tres puntos del icono.</p>
<p><b>Puerta de enlace:</b> necesaria si los orígenes están en un servidor local. <b>Suscripción:</b> recibir correos cuando se actualiza un informe o se cumplen hitos.</p>
<p><b>Clase 20. Promover y certificar:</b> promover da visibilidad (aparece destacado en la página principal; también se promueven modelos). Certificar es el sello de calidad; lo habilita un administrador en el Portal de administración y los Visores no pueden certificar.</p>
<p><b>Cálculos visuales:</b> específicos de un visual; solo usan elementos de ese visual.</p>
`},
{t:"grupos", s:S2, h:`
<p><b>Clase 20. Grupos de cálculo:</b> no conviven con medidas implícitas: las anteriores siguen funcionando, pero no se pueden añadir nuevas.</p>
`},
{t:"rls", s:S2, h:`
<p><b>Clase 20. RLS estática:</b> filtro sobre un campo concreto y asignación del rol a usuarios en Service. <b>RLS dinámica:</b> función DAX que usa el correo del usuario; se prueba con «Ver como» seleccionando el rol y en Service se asignan los usuarios al rol.</p>
`},
{t:"obtener", s:S4, h:`
<p><b>Actualización incremental:</b> material en presentación (Actualización incremental.pptx). Particiona la tabla por fechas (parámetros RangeStart y RangeEnd) y solo refresca el periodo reciente.</p>
<p><b>Rango de datos vs tabla de Excel:</b> un rango son celdas sin nada que lo delimite; una tabla (Inicio &gt; Dar formato como tabla) es un objeto con nombre dentro de la hoja. Power Query detecta ambos, pero la tabla es más robusta porque crece con los datos.</p>
<p><b>Excel con nombres de pestaña distintos:</b> conectar por carpeta y, en lugar de navegar por el nombre de la hoja, tomar la primera hoja de cada libro por posición (por ejemplo <code>Excel.Workbook([Content]){0}[Data]</code>); así entran todos los archivos sin error y después se limpia.</p>
`},
{t:"transformar", s:S4, h:`
<p><b>Caso: búsqueda de palabras en una columna.</b> 1) Crear una consulta con la lista de palabras a buscar. 2) En la tabla principal, añadir una columna personalizada en M que compruebe si el texto contiene alguna palabra de la lista, por ejemplo <code>List.AnyTrue(List.Transform(Palabras, (p) =&gt; Text.Contains([Descripcion], p, Comparer.OrdinalIgnoreCase)))</code>, o que devuelva la palabra encontrada con <code>List.Select</code>. 3) Filtrar o etiquetar según el resultado.</p>
`},
{t:"interactividad", s:S4, h:`
<p><b>Nuevo modo de interacción con objetos:</b> se activa en Opciones y configuración &gt; Opciones &gt; Características en versión preliminar. Las características en versión preliminar no forman parte del examen, salvo que tengan mucha penetración en el mercado.</p>
`}
);

var Q = S2;
EXAM.push(
{k:"Visualización", t:"grupos", s:Q, q:"Tienes una jerarquía en un visual y no quieres ver todos los niveles a la vez. ¿Qué haces?", a:"Usar los controles de exploración (explorar en profundidad / rastrear agrupando) del visual: Expandir al siguiente nivel o Ir al siguiente nivel, y subir con Rastrear agrupando datos."},
{k:"Modelado", t:"grupos", s:Q, q:"¿Cuál es la forma más rápida de desactivar las agregaciones automáticas en muchas columnas numéricas?", a:"En la vista de modelo, seleccionar varios campos a la vez y poner Resumir por = Ninguno."},
{k:"DAX", t:"calendario", s:Q, q:"¿Basta con crear una tabla calendario y relacionarla?", a:"No: además hay que marcarla como tabla de fechas eligiendo la columna Date, para que la inteligencia de tiempo funcione con fiabilidad y se desactive la jerarquía automática."},
{k:"DAX", t:"calculate", s:Q, q:"¿Qué precaución hay con ALL sobre una columna ordenada por otra?", a:"Hay que quitar también el filtro de la columna de orden (ALL de ambas columnas o de toda la tabla); si no, el cálculo deja de funcionar porque el filtro de la columna de orden sigue activo."},
{k:"DAX", t:"ti", s:Q, q:"¿Cómo cuentas días quitando sábados y domingos?", a:"Con NETWORKDAYS(inicio, fin, [fin de semana], [festivos]), que excluye fines de semana y opcionalmente una lista de festivos."},
{k:"Service", t:"interactividad", s:Q, q:"¿Cómo se restringe el uso de objetos visuales personalizados?", a:"Desde el Portal de administración de Power BI (configuración de inquilino): permitir solo visuales certificados o los de la organización, o bloquearlos."},
{k:"Visualización", t:"percepcion", s:Q, q:"¿Qué es un tema personalizado y cómo se guarda?", a:"Un conjunto de colores, fuentes y formatos aplicados a todo el informe; se exporta y se importa como archivo JSON."},
{k:"Visualización", t:"interactividad", s:Q, q:"¿Qué ocurre al bloquear y al ocultar un filtro del panel de filtros?", a:"Bloqueado: el usuario ve el filtro pero no puede cambiarlo. Oculto: no lo ve y no sabe que se aplica."},
{k:"Service", t:"roles", s:Q, q:"¿Cuántas aplicaciones puede tener un área de trabajo? ¿Qué pasa si cambias el informe y no actualizas la app?", a:"Una aplicación por área de trabajo (con audiencias para mostrar contenido distinto). Los cambios no llegan a los usuarios de la app hasta pulsar Actualizar aplicación."},
{k:"Service", t:"roles", s:Q, q:"¿Qué diferencia hay entre las licencias Pro y PPU?", a:"Ambas permiten compartir y colaborar. PPU añade funciones Premium (más actualizaciones, modelos más grandes, informes paginados, etc.). Un área de trabajo PPU solo es accesible a usuarios PPU; un usuario PPU sí accede a áreas Pro."}
);
})();
