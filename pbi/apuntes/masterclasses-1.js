/* Apuntes de Notion · Masterclasses NamasData (1): contextos, DAX 2.0, RLS, control de versiones, storytelling */
var NOTES = window.NOTES || (window.NOTES = []);
(function(){

NOTES.push({t:"contextos", s:"Contextos en DAX · José Manuel Pomares", h:`
<h4>La propagación de filtros</h4>
<p>Los filtros se propagan por las relaciones. Cuando se combinan varios filtros se intersectan. <b>SELECTEDVALUE</b> permite leer el valor filtrado.</p>
<h4>El contexto de filtro</h4>
<p>Conjunto de filtros que afectan a un modelo de datos dejando no disponibles (invisibles) parte de las filas de sus tablas. Se programa mediante relaciones desde las tablas de dimensión (tablas que filtran) hasta las de hechos (tablas filtradas). Los cálculos (medidas) sobre las tablas de hechos dependen siempre del contexto de filtro. Lo forman:</p>
<ul><li>Los filtros explícitos del usuario: segmentadores, panel de filtros e interacciones entre objetos visuales.</li><li>Los filtros y modificaciones de contexto que aportan CALCULATE o CALCULATETABLE en su 2.º y siguientes argumentos: mediante expresiones que generan tablas, expresiones que modifican el contexto y expresiones que alteran las características de las relaciones.</li></ul>
<h4>El contexto de fila</h4>
<ul><li>Conjunto de celdas que componen una fila de una tabla.</li><li>Acceder al interior de una fila e iterar por todas las filas sirve para: evaluar expresiones en ese contexto (suma, multiplicación, resta), filtrar tablas mediante expresiones booleanas y crear columnas con el resultado de una expresión.</li><li>El contexto de fila <b>no se propaga</b> por las relaciones de forma automática.</li></ul>
<h4>La transición de contextos</h4>
<p>Operación de CALCULATE que transforma un contexto de fila en un contexto de filtro equivalente.</p>
<ul><li>Ocurre siempre si, y solo si, existe una función CALCULATE o una medida dentro de un contexto de fila.</li><li>Todas las columnas de la tabla iterada se transfieren como filtros a la tabla sobre la que se calcula.</li></ul>
<h4>El contexto de filtro sombra</h4>
<ul><li>Tipo de contexto de filtro creado exclusivamente por las funciones iteradoras.</li><li>Los iteradores guardan una copia de las filas visibles de la tabla por la que iteran (su contexto de filtro «particular», los filtros explícitos): eso es el contexto de filtro sombra.</li><li>Está siempre latente sin actuar. Solo lo activa <b>ALLSELECTED</b>, que sobrescribe el contexto actual tomando el último contexto de filtro sombra existente. Es la base de las fórmulas de acumulado sobre lo seleccionado.</li></ul>
<h4>Otras cuestiones</h4>
<ul><li>La <b>vista de tabla</b> no se ve afectada por el contexto de filtro, pero existe un contexto de fila automático.</li><li>La <b>vista de consultas DAX</b> no se ve afectada por el contexto de filtro.</li><li>Hay funciones que operan sobre columnas o tablas afectadas por el contexto de filtro (SUM, AVERAGE…), otras que acceden a un contexto de fila (SUMX, AVERAGEX, FILTER…), otras que no acceden a ningún contexto (IF, SWITCH, DIVIDE…), y CALCULATE y CALCULATETABLE, que modifican el contexto de filtro.</li></ul>
<h4>CALCULATE y los 5 pasos de su algoritmo</h4>
<ol><li>Evaluación del contexto de filtro actual.</li><li>Copia del contexto de filtro actual.</li><li>Transición de contextos si existe un contexto de fila.</li><li>Aplicación de las funciones modificadoras de contexto (ALL, ALLSELECTED, CROSSFILTER…).</li><li>Aplicación de los filtros explícitos.</li></ol>
<h4>El contexto visual</h4>
<p>El contexto que crea el propio visual (sus filas, columnas y totales). Ejemplo de la sesión: en una matriz los totales salían mal con una medida que no iteraba; la fórmula correcta itera sobre los elementos visibles para que el total sea la suma de las filas.</p>`});

NOTES.push({t:"window", s:"DAX 2.0: funciones Window y cálculos visuales · Víctor Lozano", h:`
<h4>Las funciones Window</h4>
<ul><li>Son funciones de tabla.</li><li>Navegan sobre una tabla ordenada y particionada.</li><li>Sus argumentos son opcionales y pueden ir en cualquier orden.</li></ul>
<h4>Ejercicios de la sesión</h4>
<ul><li>Medida que devuelve las ventas de la primera categoría: INDEX con ORDERBY ascendente; con −1 se obtiene la última.</li>
<li>Porcentaje de las ventas de cada categoría sobre la categoría con mayor importe.</li>
<li>Comparar el importe de cada pedido con el primero disponible en el mes seleccionado en el segmentador.</li>
<li>El primer pedido de cada país (PARTITIONBY país) y el pedido actual menos el primero.</li>
<li>Comparar con el pedido anterior dentro de cada país: se cambia INDEX por OFFSET con −1.</li>
<li>WINDOW permite seleccionar varias filas: el mismo resultado que antes, o un ROI de 2 días, a nivel mensual.</li>
<li>Acumulados: anual, trimestral, semanal (WINDOW con inicio absoluto y fin relativo, particionando por año, trimestre o semana).</li>
<li>Comparativas con periodos anteriores (para el año anterior se cambia a ALL en la relación de la ventana).</li>
<li><b>Pareto</b> con funciones Window.</li>
<li><b>Clientes nuevos, perdidos y recuperados</b>, y una variante que devuelve sus nombres; los perdidos se obtienen cambiando una variable.</li></ul>
<h4>Cálculos visuales</h4>
<ul><li>Columna calculada virtual añadida a una visualización.</li><li>No tienen acceso a ningún objeto del modelo; solo a los datos del visual.</li><li>No forman parte del modelo de datos.</li></ul>
<p>Ejercicios: margen (con la opción personalizada), % de margen (con formato propio), ocultar cálculos del visual, acumulado (RUNNINGSUM) y su orden cuando hay continente (se ordena por el eje de columnas), <b>contexto visual</b>, porcentaje sobre el padre con <b>COLLAPSE</b> (se puede indicar el número de pasos), <b>EXPAND</b>, <b>ISATLEVEL</b>, promedio de los hermanos, un indicador, formato condicional, <b>media móvil</b>, <b>PREVIOUS, NEXT, FIRST y LAST</b>, trabajo con los ejes de columna vertical, <b>Pareto II</b>, <b>parámetro de intervalo</b> (se pone en Información sobre herramientas del gráfico) y dar color a las barras según una condición (con otro objeto visual o cambiando el color de columnas).</p>`});

NOTES.push({t:"rls", s:"Seguridad a nivel de fila · Ricardo Rincón (NamasData)", h:`
<h4>Enlaces de referencia</h4>
<ul><li>sqlbi.com/articles/implement-non-visual-totals-with-power-bi-security-roles/</li><li>sqlbi.com/articles/security-cost-in-analysis-services-tabular/</li></ul>
<h4>Creación de roles</h4>
<ul><li>Filtrar para ver solo artículos rojos.</li><li>Resolver una RLS «RED-Europa o BLUE-Pacífico» (dos intentos fallidos antes de la buena). No recomendable para modelos muy grandes.</li><li><b>Rol con acceso a todo</b>: se crea el rol sin seleccionar ninguna tabla.</li><li>Roles que se ejecutan sobre una tabla de perfiles: se crearon 12 roles a partir de una tabla de permisos y su modelo.</li></ul>
<h4>Comprobar que funciona</h4>
<p>En <b>DAX Studio</b> se pueden comprobar los filtros con una consulta EVALUATE sobre la tabla (por ejemplo con ADDCOLUMNS) conectando con el rol. Los roles también se prueban directamente desde el código.</p>
<h4>Perfiles estáticos con DAX sin conexión con tablas</h4>
<p>Un perfil define permisos por región y color: el 3 no tendría permiso en Europa; el 9 tiene permiso en Europa y en colores Rojo y Azul; el 8 tendría permiso total. Se prueban con «Ver como».</p>
<h4>Perfil dinámico</h4>
<p>El cambio es que se usa <b>USERPRINCIPALNAME()</b>. Para probar roles dinámicos hay que marcar dos cosas: <b>Otro usuario</b> y el perfil dinámico.</p>
<h4>Demo USERELATIONSHIP</h4>
<p>Uso de relaciones inactivas combinado con la seguridad.</p>
<h4>Agregar gente en el servicio</h4>
<p>Publicar el informe y, en el modelo semántico, Seguridad: asignar usuarios o grupos a cada rol.</p>`});

NOTES.push({t:"git", s:"Control de versiones en Power BI con GitHub y Azure DevOps · NamasData", h:`
<h4>Preparación</h4>
<ul><li>Visual Studio Code > New Terminal.</li><li>Instalar <b>Visual Studio Code</b> y, en la pestaña Extensiones, las necesarias para trabajar con Power BI.</li><li>Instalar <b>Git / GitHub</b> y crear una cuenta de <b>Azure DevOps</b> (gratuita).</li><li>Crear una carpeta nueva para guardar los archivos <b>PBIP</b> donde empezará el repositorio.</li><li>Abrir la carpeta en VS Code: File > Open Folder.</li></ul>
<h4>Primer repositorio con Git</h4>
<ul><li>Crear una carpeta para Git y guardar el archivo de Power BI Desktop como <b>.pbip</b> dentro.</li><li>Conectar VS Code con la carpeta y ejecutar <code>git init</code>, <code>git add</code> (coger los ficheros) y <code>git commit</code>.</li><li><b>Publicar la rama</b> (subir a la nube).</li><li>Para <b>clonar</b> desde GitHub: copiar la URL, clonar y colocar en una carpeta nueva DESARROLLADOR.</li></ul>
<h4>Azure DevOps</h4>
<p>Crear el repositorio y repetir el proceso: carpeta nueva con el archivo de Power BI, VS Code > Open Folder, inicializar y subir. Así quedan los dos repositorios creados.</p>
<h4>Trabajar con versiones</h4>
<ul><li><b>Para que toda modificación quede registrada hay que guardar siempre en Power BI.</b></li><li>VS Code muestra todo lo que se va creando y el diff (antes del cambio a la derecha, con el cambio a la izquierda).</li><li><b>Cada vez que cambio de rama, cambio de Power BI</b> (el proyecto en disco cambia).</li><li>Volver a una versión anterior: buscar el ID (hash) del commit y copiar los 7 primeros dígitos; <code>git checkout</code> con ese hash. Para deshacer desde un paso, se borra el último commit o desde donde se quiera.</li><li>Elegir repositorio público o privado.</li></ul>
<h4>Caso práctico con preguntas de negocio</h4>
<ol><li>Crear carpeta y guardar el archivo de Power BI.</li><li>Subir el nuevo repositorio a GitHub.</li><li>Crear una rama DESARROLLO y cambiarse a ella.</li><li>Responder la primera pregunta en Power BI, ir a GitHub (Desktop) y hacer el primer commit.</li><li>Cambiar a la rama main y hacer un <b>merge</b> de DESARROLLO; sincronizar cambios.</li><li>Volver a la rama de desarrollo para continuar. Repetir para el resto de preguntas.</li></ol>
<h4>Power BI Service: espacio de desarrollo conectado a Git</h4>
<ul><li>Mi área de trabajo > Nueva área de trabajo > <b>Premium por usuario</b>.</li><li>Configuración del área > Integración con Git > GitHub. Hace falta un <b>token de acceso personal</b>: en GitHub > Settings > Developer settings > Personal access tokens > generar uno con nombre, «Only select repositories» y los permisos necesarios (contenidos de lectura y escritura).</li><li>Pegar la URL del repositorio y conectar.</li><li>Desde ese momento se puede crear en Service y cada cambio se enlaza con GitHub (commit desde el área); el archivo del repositorio refleja el cambio hecho en Service.</li></ul>`});

NOTES.push({t:"storytelling", s:"Storytelling con datos con Power BI · Paula García (NamasData)", h:`
<h4>UX aplicada a informes</h4>
<p>La UX es el resultado de la interacción de una persona con una interfaz (un producto de datos) y la percepción que genera. Es una forma de diseñar que busca crear productos que resuelvan necesidades concretas de sus usuarios finales para lograr el mayor uso y satisfacción. En esa percepción intervienen factores sociales, culturales, contextuales y personales, como las expectativas y la experiencia previa con Power BI o con el análisis de datos.</p>
<h4>Los cinco planos (de lo abstracto a lo concreto)</h4>
<p>Modelo conceptual del desarrollo web con dos perspectivas: la web como interfaz de software (orientada a tareas) y como sistema de hipertexto (orientada a la información).</p>
<ol><li><b>Estrategia</b> (base): necesidades del usuario (objetivos externos, obtenidos por investigación de usuarios, estudios etnográficos, tecnológicos o psicográficos) y objetivos del sitio (metas internas de negocio, creativas u otras).</li>
<li><b>Alcance</b>: especificaciones funcionales (el conjunto de características del software) y requerimientos de contenido (los elementos necesarios en el hipertexto).</li>
<li><b>Estructura</b>: diseño de interacción (flujos que facilitan las tareas) y arquitectura de la información (diseño estructural del espacio de información).</li>
<li><b>Esqueleto</b>: diseño de interfaz, diseño de navegación y diseño de información (en sentido «tufteano»: presentar la información para facilitar su comprensión).</li>
<li><b>Superficie</b>: diseño visual, el tratamiento gráfico final («look» del «look-and-feel»).</li></ol>
<p>Ejes: de lo abstracto (concepción) a lo concreto (realización), y de la orientación a tareas a la orientación a información; el diseño de información es el puente constante.</p>
<h4>Cómo influye cada plano en el storytelling en Power BI</h4>
<ol><li><b>Estrategia, el porqué</b>: objetivos de negocio + necesidades del usuario. ¿Qué pregunta crítica intenta responder el usuario hoy? ¿Qué decisiones se tomarán con esta información? Sin esta base, la historia carece de mensaje central.</li>
<li><b>Alcance, el qué</b>: especificaciones funcionales (lo que el informe puede hacer) + requerimientos de contenido (la información que contiene). Qué KPIs y dimensiones protagonizan la historia; limpieza narrativa (filtrar el ruido); elegir entre drill-through o parámetros de campo.</li>
<li><b>Estructura, el storytelling</b>: arquitectura de la información + diseño de interacción. Es el guion: de lo general a lo particular, y cómo navegará el usuario (botones de página o una historia que se revela con filtros cruzados).</li>
<li><b>Esqueleto, el layout</b>: diseño de interfaz, navegación e información para facilitar el entendimiento. Lo importante en las zonas de mayor atención (arriba a la izquierda, según los patrones de lectura). El usuario siempre sabe dónde está, qué mira y cómo volver al principio.</li>
<li><b>Superficie, estética al servicio del dato</b>: color y tipografía como herramientas para dirigir la atención; un acabado profesional que genera confianza (si el informe se ve cuidado, el usuario cree en sus datos).</li></ol>
<h4>El proceso creativo: diamantes y embudos</h4>
<ul><li><b>Doble diamante</b>: descubrir y definir (investigación y síntesis), desarrollar y entregar (ideación e implementación), iterando hasta la respuesta correcta.</li>
<li><b>Embudo de insights</b>: datos → información → análisis → <b>insight</b> → <b>acción</b>. <b>Storyframing</b> (exploratorio, informes y dashboards donde el usuario explora) frente a <b>storytelling</b> (explicativo, narrativas que explican un hallazgo).</li></ul>
<h4>Modelos narrativos: ¿sándwich o pizza?</h4>
<ul><li><b>Data story («el sándwich»)</b>: los datos son la base y revelan la historia; la narrativa contextualiza.</li><li><b>Story with data («la pizza»)</b>: la narrativa es la base (el argumento) y los datos se añaden para reforzarla.</li></ul>
<h4>Estructura y flujo visual</h4>
<ul><li><b>Organización</b>: lineal, de «cubo y radios» (hub-and-spoke) o jerárquica. Jerarquía común: KPIs generales → evolución temporal → detalle por dimensiones (geográfica, producto) → tablas.</li>
<li><b>Flujos por audiencia</b>: nivel ejecutivo (flujo rápido para comprobar KPIs y decidir si investigar) y usuario operativo (análisis granular para decisiones diarias).</li>
<li><b>Patrones de lectura</b> en F o en Z para colocar lo de mayor impacto.</li></ul>
<h4>Elementos de diseño en Power BI</h4>
<p>Menús Insertar y Ver. Elementos: visuales (el principal para comunicar), segmentadores (sin abusar), botones para navegar entre páginas y marcadores con iconos intuitivos, y contexto.</p>
<h4>Data storytelling: estructuras</h4>
<ul><li>La <b>pirámide de Freytag</b> (exposición, acción ascendente, clímax, acción descendente, desenlace).</li><li>Opción 1: narrar la historia de un personaje o compañero y el análisis que sigue hasta sus conclusiones. Opción 2: un objetivo acompañado de una estructura narrativa.</li><li>Estructura del <b>«cambio potencial»</b> y estructura <b>«Dan Kennedy»</b>.</li></ul>
<h4>Design thinking: doble diamante en cinco fases</h4>
<ol><li><b>Empatía</b>: entender al usuario (necesidades del usuario + objetivos del sitio, plano de estrategia).</li><li><b>Definición</b>: filtrar para encontrar el insight; fijar el alcance (métricas y dimensiones protagonistas).</li><li><b>Ideación</b>: fase divergente; múltiples formas de visualizar los datos.</li><li><b>Prototipado</b>: versiones rápidas del informe (planos de estructura y esqueleto: flujo narrativo y layout).</li><li><b>Validación</b>: entregar, testear e iterar con el usuario final para asegurar que el informe genera acciones.</li></ol>
<p>Primer diamante (diseñar lo correcto): <b>Descubrir</b> (divergente: «rasgar el brief», investigación primaria y secundaria, del «no sé» al «podría ser») y <b>Definir</b> (convergente: agrupar tópicos, sintetizar, áreas de oportunidad, brief final o pregunta HMW «¿Cómo podríamos…?»). Segundo diamante (diseñar las cosas correctas): <b>Desarrollar</b> (divergente: ideas; ¿sándwich o pizza?) y <b>Entregar</b> (convergente: prototipado y validación en ciclo construir-testear-iterar, hasta el «sí sé» y el «debería ser»). El diseño no es lineal: expansión y contracción de ideas.</p>
<h4>Fase Descubrir: investigación</h4>
<p><b>Entrevista 1:1 con el cliente</b>: ¿para qué es necesario el informe? ¿Cuál es su valor de negocio y cómo definiremos su éxito? ¿Cuáles son tus retos de reporting? ¿Algún ejemplo de éxito o fracaso parecido? ¿Qué métricas se usan? ¿Qué otras podrían añadir valor? ¿Cuáles son las preguntas más importantes que debe resolver el dashboard?</p>
<p><b>Entrevista al usuario</b>: ¿cómo es tu jornada o semana de trabajo? ¿Cómo y cuándo accedes a los datos e informes, y para qué? ¿Cuáles son tus retos y objetivos, y cuáles resuelves con datos? ¿Qué métricas o KPIs miras? ¿Qué dimensiones, granularidad y contexto necesitas? ¿Qué métricas adicionales te gustaría? ¿Para qué quieres el informe? ¿Cuáles son las 3 preguntas clave que responderías con los datos, y cómo?</p>
<p>Herramientas: <b>mapa de empatía</b>, <b>personas o arquetipos</b>, roles a tener en cuenta y <b>MVP</b> (mínimo producto viable).</p>
<h4>Fase Definir: síntesis</h4>
<ul><li><b>Definición técnica</b>: orígenes, transformación y limpieza, modelado y relaciones, medidas y columnas calculadas.</li><li><b>Definición de contenido</b>: navegación (páginas y jerarquía), elección de visual y priorización.</li><li><b>Necesidades UI/UX específicas</b>, como la vista móvil.</li><li><b>Definición de éxito</b> (roadmap): MVP e iteraciones, ¿cuándo hemos terminado?, gestión de peticiones y cambios.</li></ul>
<h4>Fase Idear</h4>
<p>Reglas: no hay ideas buenas o malas, no se juzga, más hacer y menos hablar, co-creación (construir sobre otra idea), cantidad frente a calidad, buscar ejemplos e inspiración, no enamorarse de la propia idea. <b>User flow</b> (customer journey). Por definir y acordar: cada página o pestaña con título, objetivo y descripción; tipo de navegación, menú y filtros. Tipos de navegación: lineal, radial, jerárquica y asociativa (entre informes).</p>
<h4>Fase Implementar</h4>
<p>Beneficios de un <b>tema corporativo</b>: agilidad para crear informes, estandarización (menor curva de aprendizaje), branding del departamento y evitar opiniones. Incluye colores, fuentes, estructura, cabecera con navegación primaria y secundaria, botones y estados, elementos de ayuda y estilo de tooltips. Un <b>design system</b> es el repositorio con todos los elementos para crear dashboards.</p>
<p><b>Testing</b>: tener claro qué mejorar, anticipar errores, minimizar riesgos, asegurar que se resuelve lo buscado e identificar cómo se percibe la solución. Con sus fases y el proceso end-to-end en una organización.</p>
<h4>Orden jerárquico que convierte el mensaje en acción</h4>
<ol><li><b>KPIs generales (el qué)</b>: arriba, donde empiezan los patrones F y Z. ¿Estamos cumpliendo los objetivos? Base del storyframing.</li><li><b>Evolución temporal (el cuándo)</b>: líneas o áreas; ¿vamos en la dirección correcta? Aquí se decide sándwich o pizza.</li><li><b>Análisis dimensional (el porqué)</b>: desgloses por geografía o producto para investigar anomalías, con filtros cruzados o botones.</li><li><b>Detalle (el cómo actuar)</b>: tablas con lógica temporal y datos granulares para el usuario operativo.</li></ol>
<p>Consideraciones: adaptar la jerarquía a la audiencia (el ejecutivo suele terminar tras KPIs y tendencias; el operativo itera en el detalle) y aplicar los planos (estrategia y alcance deciden qué entra; la estructura decide si el flujo es jerárquico, lineal o hub-and-spoke; el esqueleto permite volver al principio; la superficie resalta los KPIs con color y tipografía).</p>`});
})();
