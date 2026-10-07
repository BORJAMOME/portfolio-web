/* Curso de Microsoft Fabric (Walter, arquitecto de datos y Microsoft MVP) */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var S = "Curso de Microsoft Fabric (ingeniería de datos)";
NOTES.push(
{t:"fabric", s:S + " · Temario", h:`
<ol>
<li><b>Lakehouse</b> (5 h): fundamentos y arquitectura, implementación, consultas con SQL Endpoints, modelos semánticos desde el Lakehouse, Data Warehouse.</li>
<li><b>Ingesta y preparación con Power Query</b> (8 h): pipelines con Data Factory, Dataflows Gen1 y Gen2, ingesta completa.</li>
<li><b>PySpark</b> (3 h + 6 de práctica): DataFrames, transformaciones y optimización, buenas prácticas en notebooks.</li>
<li><b>Tiempo real con Eventstream</b> (4 h): eventos, integración de fuentes, taller de ingesta y visualización.</li>
<li><b>Administración, monitorización y gobierno</b> (3 h + 3): supervisión de recursos, auditoría y gobernanza.</li>
<li><b>Proyecto integrador</b>: pipeline de extremo a extremo con arquitectura medallón, tiempo real y presentación con paneles.</li>
</ol>
<p>Curso de 20 h teóricas y 40 h prácticas. En Notion, los módulos 2 y 6 quedaron vacíos.</p>
`},
{t:"fabric", s:S + " · Clase magistral y módulo 1. Lakehouse", h:`
<p><b>Ingeniería de datos:</b> el arte de mover datos desde cualquier fuente al repositorio analítico. Big Data por sus tres V (volumen, velocidad y variedad), un reto incluso para empresas pequeñas.</p>
<h4>Arquitectura</h4>
<ul>
<li>Modelo de <b>siete capas</b> de una solución analítica; las cuatro primeras (origen, procesamiento, almacenamiento y servicios) son terreno del ingeniero de datos. SaaS frente a PaaS.</li>
<li>Evolución: bases de datos, data lakes y <b>Lakehouse</b> (lo mejor de ambos). Inmon (top-down) frente a Kimball (bottom-up); muchas empresas son híbridas. Herramientas: Airflow, Kafka, Spark, Databricks; gobierno y catalogación del dato.</li>
<li>Formatos columnares (<b>Parquet</b>, ORC) y tablas <b>Delta</b>; <b>accesos directos</b> (shortcuts) a datos de otras ubicaciones sin copiarlos (si el origen cambia o se borra, el acceso lo refleja).</li>
<li><b>Medallón</b>: <b>Bronze</b> (datos en bruto, salvaguarda histórica), <b>Silver</b> (limpios, estandarizados y dimensionales) y <b>Gold</b> (listos para consumo analítico e IA). Se aconseja adaptarla a cada organización, no aplicarla de forma rígida.</li>
</ul>
<h4>Artefactos para mover datos</h4>
<table class="dxtbl"><thead><tr><th>Artefacto</th><th>Para qué</th></tr></thead><tbody>
<tr><td><b>Pipeline</b> (canalización)</td><td>Mover y <b>orquestar</b> con poco código; no es buena para transformar</td></tr>
<tr><td><b>Dataflow Gen2</b></td><td>Transformaciones ligeras con Power Query; lento para grandes volúmenes</td></tr>
<tr><td><b>Notebook</b></td><td>PySpark, Python o R: más control, rendimiento y versatilidad; también machine learning</td></tr>
<tr><td><b>Eventstream</b></td><td>Datos en streaming</td></tr>
</tbody></table>
<p>Ingesta <b>por lotes</b> (se buscan los datos cada cierto tiempo) frente a <b>streaming</b> (se escuchan continuamente).</p>
<h4>Práctica</h4>
<ol>
<li>Crear una capacidad Fabric (región de Europa, etiquetado de costes), área de trabajo asignada a la capacidad y permisos mínimos para cada rol.</li>
<li><b>Lakehouse</b> «LH_raw» con dos carpetas: <b>Files</b> (archivos tal cual) y <b>Tables</b> (tablas Delta).</li>
<li><b>Pipeline</b> con conector <b>HTTP</b> para descargar 70 años de temperaturas de Chile desde GitHub, manteniendo el binario original. Con un <b>parámetro</b> de año y un bucle <b>ForEach</b> sobre un array de años se traen todas las carpetas (1950-2022), con URL dinámica. Resultado: una partición por año.</li>
<li>Cargar los ficheros como tabla Delta que crece con cada carga (mínimas y máximas).</li>
<li>Lakehouse Bronze con accesos directos a esas tablas y consultas con el <b>punto de conexión SQL</b> (TOP para no traerlo todo).</li>
<li>Lakehouse <b>Silver</b>: <b>notebook</b> PySpark para la <b>dimensión tiempo</b> (con <code>withColumn</code> para fecha, año, mes, día y <code>write.saveAsTable</code>), una tabla mejor que una vista para la dimensión de tiempo; <b>Dataflow Gen2</b> para la dimensión estaciones (código nacional de decimal a entero) con destino Silver.</li>
<li>Notebook para la <b>tabla de hechos</b> uniendo mínimas y máximas por estación y día, y otra de <b>agregados</b>.</li>
<li><b>Flujo de tareas</b> del área de trabajo para ordenar visualmente los artefactos.</li>
<li><b>Modelo semántico</b> desde el Lakehouse Silver con sus relaciones, listo para Power BI.</li>
</ol>
<p>Las puertas de enlace no son obligatorias para conectores web públicos, pero aportan cifrado y aislamiento.</p>
`},
{t:"fabric", s:S + " · Módulo 3. PySpark y capa Gold", h:`
<ul>
<li>Las pruebas de Fabric y las áreas de trabajo dependen de la capacidad y su región: planificar regiones emparejadas evita migrar artefactos.</li>
<li>Un modelo semántico se puede publicar y consumir desde un área sin Fabric.</li>
<li>Lakehouse <b>Gold</b> y notebook Silver → Gold.</li>
<li><b>Semantic Link (SemPy)</b> para explorar el modelo semántico desde el notebook (tablas, columnas, tipos) y leer hechos y dimensiones.</li>
<li>Ejercicio de <b>predicción de temperaturas</b>: DataFrame de Spark, columnas de fecha y año, funciones de ventana (<code>lag</code> con <code>Window</code>), dataframe de entrenamiento, modelo entrenado y guardado en Gold, calendario futuro con SQL <code>sequence</code>, doble predicción y guardado de resultados (ojo a conversiones objeto/fecha y mayúsculas en identificadores).</li>
</ul>
`},
{t:"fabric", s:S + " · Módulos 4 y 5. Tiempo real y administración", h:`
<h4>Eventstream</h4>
<ol>
<li>Crear un Eventstream con datos de ejemplo (mercado bursátil); conectores Kafka, Event Hubs, CDC.</li>
<li>Transformar con <b>Manage fields</b>: tipos correctos (enteros, decimales, fechas) y quitar columnas.</li>
<li><b>Arquitectura lambda</b>: destino en frío en un <b>Lakehouse</b> (histórico) y en caliente en un <b>Eventhouse</b> (base KQL) para análisis inmediato.</li>
<li>Consultas con <b>KQL</b> (<code>take</code>, conteos, filtros) e informe de Power BI sobre el Eventhouse que se actualiza en tiempo real.</li>
<li>Notebook para muestreo y machine learning ligero sobre datos calientes.</li>
<li><b>Activator</b>: reglas y disparadores (por ejemplo, precio por debajo de un umbral) que envían correos o lanzan pipelines.</li>
</ol>
<h4>Administración y gobierno</h4>
<ul>
<li>Jerarquía de permisos y <b>mínimo privilegio</b>: roles en áreas de trabajo y permisos por artefacto.</li>
<li><b>Centro de monitorización</b>: ejecuciones, métricas, errores y cargas de trabajo de toda la organización.</li>
<li><b>Portal de administración</b>: inquilino, dominios, áreas de trabajo, capacidades, etiquetas y métricas de uso.</li>
<li>Seguridad por capas: red, áreas de trabajo, acceso a datos y <b>RLS</b>; <b>certificación</b> de contenido.</li>
<li><b>DevOps</b>: integración con GitHub y entornos de desarrollo, QA y producción.</li>
<li>Certificaciones relacionadas: <b>DP-600</b> y <b>DP-700</b>.</li>
</ul>
`}
);
EXAM.push(
{k:"Fabric", t:"fabric", s:S, q:"¿Qué papel tienen las capas Bronze, Silver y Gold de la arquitectura medallón?", a:"Bronze guarda los datos en bruto como salvaguarda histórica; Silver los limpia, estandariza y modela de forma dimensional; Gold los deja listos para consumo analítico e IA."},
{k:"Fabric", t:"fabric", s:S, q:"¿Qué artefacto de Fabric usarías para orquestar descargas y cuál para transformaciones pesadas?", a:"Un pipeline para mover y orquestar; un notebook (PySpark) para transformaciones complejas o grandes volúmenes. Los Dataflow Gen2 sirven para transformaciones ligeras."},
{k:"Fabric", t:"fabric", s:S, q:"En una arquitectura lambda con Eventstream, ¿dónde va cada flujo?", a:"El frío a un Lakehouse para el histórico y el caliente a un Eventhouse (KQL) para análisis inmediato."}
);
})();
