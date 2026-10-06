/* Proyectos propios, recursos y enlaces guardados en Notion, libro de Salvador Ramos y Power Apps */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
var PROJ = window.PROJ || (window.PROJ = []);
var RES = window.RES || (window.RES = []);
(function(){
var LIB = "A cuánto asciende tu factura por no entender los datos de tu empresa · Salvador Ramos (libro)";
var PA = "Power Apps (NamasData)";
NOTES.push(
{t:"bi", s:LIB, h:`
<ol>
<li><b>Decisiones a ciegas:</b> el problema no es la falta de datos sino que están separados; el negocio es un rompecabezas con todas las piezas pero sin la imagen.</li>
<li><b>El mito del control:</b> los informes tradicionales son conducir mirando el retrovisor. «El 11 de mayo llevas 18.895,15 €» es exacto pero no dice si es mucho, si mejoras frente al año pasado ni si cumplirás. Un cuadro de mando responde: vas un 17,83 % mejor que el año anterior, pero faltan 4.286 € (−18,49 %) sobre el objetivo de 23.181 y, al ritmo actual, el 31 de mayo faltarán 9.335 € (−14,08 %).</li>
<li><b>Delegar no es desentenderse:</b> el líder no hace los números, pero está donde se decide. Tres hábitos: reunión semanal de 15 minutos con 3 indicadores, la pregunta «¿qué dato te falta esta semana para decidir mejor?» y revisar el cuadro de mando para ajustar lo que viene.</li>
<li><b>Tú eres el motor del cambio:</b> el jefe que lo revisa todo paraliza; el que marca la dirección moviliza.</li>
<li><b>Los 5 peligros de Excel:</b> errores invisibles, datos viejos, fragmentación, dependencia de personas y tiempo perdido.</li>
<li><b>«Eso es para empresas grandes»:</b> basta con 5-7 indicadores que digan en 3 minutos si vas bien, regular o mal y dónde está el problema.</li>
<li><b>El perfil adecuado:</b> curiosidad por el negocio, organizado y metódico, conoce los datos de cada departamento, soltura con Excel y Power BI y buena comunicación.</li>
<li><b>Las consecuencias de no actuar:</b> decidir sin datos (comprar de más, vender sin margen, reaccionar tarde, perder clientes), desgaste emocional y retroceso frente a quien decide con datos.</li>
<li><b>Pilares de un buen cuadro de mando:</b> menos es más (5-6 indicadores), operativo y no decorativo, actualizado con frecuencia («si se refresca una vez al mes es un álbum de fotos del pasado»), lectura en 5 segundos, siempre con contexto (objetivos, tendencias, promedios, históricos) y personalizado.</li>
<li><b>KPI frente a indicador:</b> un KPI obliga a actuar cuando cambia; si al verlo no sabes qué hacer, es solo información. Errores: medir lo que no puedes cambiar, indicadores genéricos, ratios sin contexto y KPI de vanidad. Un buen KPI es accionable, relevante y comprensible. Ejemplos: ventas (cifra y TAM, margen comercial, ticket medio), compras y stock (rotación, cobertura, precio medio de coste), finanzas (EBITDA, flujo de caja operativo, margen neto) y operaciones (tiempo de producción, tasa de defectos, capacidad utilizada). Limpieza trimestral de indicadores.</li>
<li><b>Siete creencias que frenan:</b> no tenemos tiempo, es para empresas grandes, lo controlo en mi cabeza, mi equipo no está preparado, ya tenemos informes, cuesta mucho, ya lo intentamos. Se pasa de «creo que vamos bien» a «vamos un 7 % abajo y cerraremos un 10 % por debajo si no actuamos».</li>
<li><b>Un sistema vivo</b> que se revisa y se reinventa con la empresa.</li>
<li><b>De la estrategia a la acción:</b> con los datos ordenados aparece el Pareto (el 80 % de los ingresos del 20 % de los productos) y mejores preguntas: qué indicador anticipa problemas, cuál refleja la ventaja competitiva, dónde está el cuello de botella.</li>
<li><b>Un deseo no cambia nada, una decisión sí:</b> el cuadro de mando es un punto de apoyo para dejar de apagar fuegos y dirigir con evidencia.</li>
</ol>
`},
{t:"herramientas", s:PA, h:`
<p>Curso introductorio (casi todo en capturas). La Power Platform incluye <b>Power BI</b>, <b>Power Apps</b>, <b>Power Automate</b> (automatización de tareas), <b>Power Pages</b> (sitios web) y <b>Power Virtual Agents</b> (Copilot Studio).</p>
<ul>
<li>Las fórmulas de Power Apps (Power Fx) mezclan funciones de Excel con funciones propias.</li>
<li>Tipos de app: <b>lienzo</b> (diseño libre), <b>basada en modelo</b> (sobre Dataverse) y portales.</li>
<li>Formas de crear una app: desde datos (Excel, SharePoint, Dataverse), desde plantilla, desde una imagen o un diseño, o en blanco.</li>
<li>Prácticas: app de lienzo desde Excel, tablas en <b>Dataverse</b>, app desde una imagen y app de lienzo conectada a Dataverse.</li>
</ul>
`}
);

PROJ.push(
{t:"Construcción de una Cuenta de Pérdidas y Ganancias", cat:"Finanzas", tools:"Power BI · DAX", url:"https://app.powerbi.com/view?r=eyJrIjoiM2Y3MzMxNTQtMGMzOS00ZDhlLTljYWYtMmU5N2E5ZTA3MjU2IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=41273635f861390cd9fd",
 ctx:"La PyG es el informe más importante de una empresa y de los que peor pasan a BI: vive en Excel, PDF o exportaciones del ERP. Pregunta: ¿se puede construir un P&amp;L riguroso, dinámico y fácil de analizar?",
 prob:"Conviven real y presupuesto, las cuentas no tienen jerarquía limpia, los signos contables no coinciden con la lógica analítica, los subtotales tienen reglas propias y los totales dejan de cuadrar al cambiar el contexto.",
 model:"Estrella financiera: hechos con importes contables, Calendario, Cuentas (jerarquía y clasificación ingreso/coste/gasto), Escenario (real/presupuesto), Departamento y Organización.",
 diff:"Subtotales inteligentes (margen bruto, beneficio operativo y neto con reglas contables), control de signos en el modelo y las medidas (no en el visual), matriz real frente a presupuesto con variación absoluta y %, cascada que explica las desviaciones y jerarquía que un director financiero reconoce.",
 learn:"En BI financiero la dificultad no está en el gráfico sino en la lógica que lo sostiene: modelo sólido, DAX preciso y comprensión del negocio."},
{t:"Informe Financiero Integral", cat:"Finanzas", tools:"Power BI · Power Query · DAX", url:"https://app.powerbi.com/view?r=eyJrIjoiNDgzZjBmY2MtMDhhMy00MGIzLTlmYmItODlkMmY2NDg3ZDdmIiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=a961ceadc15fe4dcfcfb",
 ctx:"Datos contables detallados (asientos, balances, PyG, presupuestos) dispersos; el objetivo era convertir contabilidad en información para decidir.",
 prob:"Estructura del balance difícil de entender, resultados, liquidez y cash flow analizados por separado, procesos manuales poco trazables e información poco accesible.",
 model:"Esquema en estrella contable que unifica balance, PyG y cash flow, coherente entre periodos, empresas y orígenes, con trazabilidad hasta el asiento.",
 diff:"Navegación de aplicación: vista general de KPI, checklist de calidad (asientos descuadrados y cuentas sin clasificar), balance de sumas y saldos con detalle hasta el asiento, análisis vertical y horizontal del balance y su evolución, PyG interanual con márgenes, EBITDA, frente a presupuesto y proyección a cierre, y cash flow con ratios de solvencia y rentabilidad. Colores neutros y jerarquía clara.",
 learn:"Primero estructura, después claridad, siempre pensando en el usuario y en la decisión."},
{t:"Informe de ventas con enfoque IBCS", cat:"Ventas", tools:"Power BI · IBCS", url:"https://app.powerbi.com/view?r=eyJrIjoiYWFhNjA5YmQtNjEyYS00YTA3LWIxMzktYWQxOTYzMmZkYzIyIiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=a1d29223385a59346e65",
 ctx:"El análisis comercial suele quedarse en «¿hemos vendido más que el año pasado?», y el total anual es solo el final de la película.",
 prob:"Se pierden patrones estacionales, meses débiles compensados por otros, variaciones sin contexto; y volumen, variación absoluta y % en gráficos distintos obligan a hacer cálculos mentales.",
 model:"Estrella: hechos de ventas, fecha (Año, Trimestre, Mes), producto (Categoría, Producto), región y campaña, con drill-down en un único eje.",
 diff:"Notación IBCS (CY, SPLY, Δ, Δ%): variación integrada en la barra y % como lollipop en otra capa; el mismo lenguaje visual para tiempo y negocio; verde mejora, rojo empeora, gris contexto; parámetro para alternar unidades y euros.",
 learn:"Un buen informe de ventas reduce el riesgo de interpretar mal los datos; IBCS obliga a decidir qué es contexto y qué es señal."},
{t:"Análisis del mercado de Airbnb en el País Vasco", cat:"Mercado", tools:"Power BI · Figma", url:"https://app.powerbi.com/view?r=eyJrIjoiOTA2ZDExNjktYzE4Ny00Y2UzLThmM2YtMjI5Y2FmNDg1MzM5IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9",
 ctx:"«Airbnb en el País Vasco está carísimo» suele apoyarse en una media general, que sin contexto engaña.",
 prob:"No es lo mismo San Sebastián en agosto que un municipio interior en enero, un alojamiento entero que una habitación, ni un anfitrión con una propiedad que uno con 30.",
 model:"Provincia, municipio, tipo de alojamiento, rango de precio, reseñas y disponibilidad anual, separando dimensiones geográficas, de alojamiento y métricas.",
 diff:"El mapa como protagonista, filtrado en tiempo real; segmentación por tipo, rango de precio (económico a lujo) y tipo de propietario (ocasional o profesional); KPI siempre acompañados de segmentación.",
 learn:"La media simplifica, el contexto explica. El mercado turístico es espacial antes que estadístico."},
{t:"Dashboard de Recursos Humanos (DataDNA Challenge, octubre 2024)", cat:"RR. HH.", tools:"Power BI · Figma", url:"https://app.powerbi.com/view?r=eyJrIjoiNDM1ZjhmZTYtYjNlZC00MjI1LTg0ODgtZmE2YzE2YjFhYzA2IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=49d9f91f18acde224c7a",
 ctx:"Reto de Onyx Data sobre productividad y desempeño de empleados.",
 prob:"Transformar un dataset de empleados en conocimiento estratégico para RR. HH.",
 model:"Dataset limpiado en Power Query y medidas DAX de desempeño, productividad y segmentación.",
 diff:"Cuatro páginas: visión general (puntuación, productividad, horas, rotación), factores de productividad (remoto/presencial, horas extra, formación), desempeño según salario, tamaño de equipo y estudios, y demografía y comportamiento. Diseño previo en Figma y narrativa guiada.",
 learn:"Storytelling con datos para que RR. HH. identifique áreas de mejora del talento."},
{t:"Dashboard vitivinícola de España", cat:"Mercado", tools:"Power BI · Figma", url:"https://app.powerbi.com/view?r=eyJrIjoiZjYzZTFhY2YtZmIyYy00YmZjLWEwMGEtMWJmNTdhMjM5NDI3IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9",
 ctx:"Convertir una base de datos vitivinícola en una herramienta para entender la estructura y diversidad del sector del vino en España.",
 prob:"Dónde se produce cada tipo de vino, qué uvas predominan y cómo se distribuyen las bodegas por regiones y denominaciones de origen.",
 model:"Datos por región, tipo de vino, variedad de uva y DO; KPI de bodegas por región, tipo y calificación.",
 diff:"Mapa interactivo con cada bodega y filtros por provincia, municipio, uva, tipo de DO, color y calidad; diseño previo en Figma.",
 learn:"Un dashboard educativo para explorar y comparar regiones."},
{t:"Calendario laboral 2025", cat:"Operaciones", tools:"Power BI · DAX", url:"https://app.powerbi.com/view?r=eyJrIjoiYzkyYWI2M2MtYjUwOC00Zjk1LThhOWYtMGJiZTRhZDJkOGQ1IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9",
 ctx:"Calendario laboral inteligente con días laborables y festivos por comunidad autónoma, tipo de festivo y localidad.",
 prob:"Responder qué días son laborables en cada comunidad, qué festivos afectan a cada día y qué localidad tiene festivo, con filtros sencillos.",
 model:"Estrella con tabla de fechas personalizada (día, semana, mes, año, orden) y tabla de festivos (tipo, localidad, comunidad, laborable); datos abiertos normalizados en Power Query.",
 diff:"Medida [Eventos] que concatena festivos y localidades con iconos según el tipo, días laborables por comunidad, UNICHAR para el formato, matriz configurada como calendario (semanas en filas, días en columnas) con ajuste de texto y celdas homogéneas.",
 learn:"Útil para RR. HH. (vacaciones y turnos), gestión de proyectos y planificación operativa."},
{t:"Caso práctico Impacta: Cuadro de mando de ventas", cat:"Ventas", tools:"Power BI", url:"",
 ctx:"Caso práctico del libro y curso Impacta con Power BI (Salvador Ramos), en cinco laboratorios.",
 prob:"Construir un cuadro de mando de ventas con comparación frente a presupuesto.",
 model:"Hechos Ventas y Presupuestos (presupuesto a nivel tienda y mes, sin producto) con dimensiones Tiendas, Productos y Fechas.",
 diff:"Lab01 Power Query, Lab02 modelo y DAX, Lab03 DAX avanzado (omitido en Notion), Lab04 informes (Cuadro de mando de ventas) y Lab05 Power BI Service.",
 learn:"Tablas de hechos con distinta granularidad compartiendo dimensiones."}
);

var R = function(cat, name, url, note){ RES.push({cat:cat, name:name, url:url||"", note:note||""}); };
/* Herramientas de diseño */
R("Diseño de visuales","Librería de iconos (NudgeBI)","https://www.nudgebi.com/icon-library");
R("Diseño de visuales","Google Material Symbols","https://fonts.google.com/icons");
R("Diseño de visuales","Librería Unicode (NudgeBI)","https://www.nudgebi.com/unicode-library","Símbolos para UNICHAR");
R("Diseño de visuales","Librería de colores (NudgeBI)","https://www.nudgebi.com/color-library");
R("Diseño de visuales","Temas shadcn/ui","https://ui.shadcn.com/themes","Ideas de gráficos y colores");
R("Diseño de visuales","Comprobador de contraste WebAIM","https://webaim.org/resources/contrastchecker/");
R("Diseño de visuales","Adobe Color: analizador de contraste","https://color.adobe.com/es/create/color-contrast-analyzer");
R("Diseño de visuales","Coolors","https://coolors.co/","Generador de paletas");
R("Diseño de visuales","Guía de buenas prácticas en gráficos (Miro)","https://miro.com/app/board/uXjVMn3WomE=/");
R("Diseño de visuales","Kolumna","https://kolumna.dazlog.com/","Generador de lienzos para dashboards");
R("Diseño de visuales","Typescale","https://typescale.com/","Escalas tipográficas");
R("Diseño de visuales","Colores en guías de estilo de dataviz (Datawrapper)","https://www.datawrapper.de/blog/colors-for-data-vis-style-guides","Artículo destacado");
R("Diseño de visuales","uiGradients","https://uigradients.com/","Degradados");
R("Diseño de visuales","The Data Visualisation Catalogue","https://datavizcatalogue.com/");
R("Diseño de visuales","Galería de Seaborn","https://seaborn.pydata.org/examples/index.html");
R("Diseño de visuales","Dashs Criativos (curso)","https://dadoscriativos.com/dashscriativos/","Catálogo de dashboards");
R("Diseño de visuales","HR Dashboard (Tableau Public, Iaroslava)","https://public.tableau.com/app/profile/iaroslava/viz/HRDashboard_17194096809750/OVERVIEW","Catálogo de dashboards");
R("Diseño de visuales","HR Attrition Dashboard (Tableau Public, Iaroslava)","https://public.tableau.com/app/profile/iaroslava/viz/HRAttritionDashboard_17278679162880/GENERALINFO","Catálogo de dashboards");
/* Perfiles */
R("Perfiles a seguir","Claudio Trombini","https://www.linkedin.com/in/claudio-trombini-91757b149/");
R("Perfiles a seguir","Bernat Agulló","https://www.linkedin.com/in/bernatagullo/");
R("Perfiles a seguir","Injae Park","https://www.linkedin.com/in/injae-park/");
R("Perfiles a seguir","Gustaw Dudek","https://www.linkedin.com/in/gustaw-dudek/");
R("Perfiles a seguir","Carlos Bergamo","https://www.linkedin.com/in/carlos-bergamo/");
R("Perfiles a seguir","Michel van Schaik","https://www.linkedin.com/in/michel-van-schaik/");
R("Perfiles a seguir","Mariska van Kan","https://www.linkedin.com/in/mariska-van-kan/");
R("Perfiles a seguir","Manuel Luciano Rojas","https://www.linkedin.com/in/manuellucianorojas/");
R("Perfiles a seguir","Carlos Barboza (Spilled Graphics)","https://spilledgraphics.com/power-bi-graphics/");
R("Perfiles a seguir","Nicolás Lea-Trengrouse","","Visuales nuevos con marcadores (LinkedIn)");
/* Libros */
R("Libros","Storytelling with Data · Cole Nussbaumer Knaflic");
R("Libros","Impacta con Power BI · Salvador Ramos");
R("Libros","A cuánto asciende tu factura por no entender los datos de tu empresa · Salvador Ramos");
R("Libros","Curso de lenguaje DAX · Ana María Bisbé York");
R("Libros","Modelado de datos en Power BI con Power Query y DAX · Javier Sánchez Rivero");
R("Libros","El arte funcional, The Truthful Art y Cómo mienten los gráficos · Alberto Cairo");
R("Libros","The Science of Visual Data Communication: What Works","https://journals.sagepub.com/doi/10.1177/15291006211051956");
/* Documentación */
R("Documentación oficial","Power BI · Microsoft Learn","https://learn.microsoft.com/es-es/power-bi/");
R("Documentación oficial","DAX Guide","https://dax.guide/");
R("Documentación oficial","SQLBI · conversiones numéricas en DAX","https://www.sqlbi.com/articles/understanding-numeric-data-type-conversions-in-dax/");
R("Documentación oficial","Informe rápido de Power BI desde Jupyter","https://learn.microsoft.com/es-es/power-bi/create-reports/jupyter-quick-report");
R("Documentación oficial","Pandas","https://pandas.pydata.org/docs/");
R("Documentación oficial","Pandas (W3Schools)","https://www.w3schools.com/python/pandas/default.asp");
R("Documentación oficial","Scikit-learn","https://scikit-learn.org/stable/user_guide.html");
R("Documentación oficial","PostgreSQL","https://www.postgresql.org/docs/");
R("Documentación oficial","Tableau Help","https://help.tableau.com/");
R("Documentación oficial","dbt","https://docs.getdbt.com/");
R("Documentación oficial","Apache Airflow","https://airflow.apache.org/docs/");
/* Datasets */
R("Datasets","Kaggle Datasets","https://www.kaggle.com/datasets");
R("Datasets","Google Dataset Search","https://datasetsearch.research.google.com/");
R("Datasets","INE · DataLab","https://www.ine.es/dyngs/DataLab/");
R("Datasets","Datos abiertos de Madrid","https://datos.madrid.es/");
R("Datasets","Our World in Data","https://ourworldindata.org/","Ideal para storytelling");
/* Cheatsheets */
R("Chuletas","SQL Cheat Sheet","https://www.sqltutorial.org/sql-cheat-sheet/");
R("Chuletas","Pandas Cheat Sheet","https://pandas.pydata.org/Pandas_Cheat_Sheet.pdf");
R("Chuletas","Python Cheatsheet","https://www.pythoncheatsheet.org/");
R("Chuletas","Git Cheat Sheet","https://education.github.com/git-cheat-sheet-education.pdf");
R("Chuletas","Markdown Cheat Sheet","https://www.markdownguide.org/cheat-sheet/");
/* Herramientas */
R("Herramientas","DAX Studio","https://daxstudio.org/");
R("Herramientas","Tabular Editor","https://tabulareditor.com/");
R("Herramientas","Bravo for Power BI (SQLBI)","https://bravo.bi/");
R("Herramientas","DAX Formatter (SQLBI)","https://www.daxformatter.com/");
R("Herramientas","Google Colab","https://colab.research.google.com/");
R("Herramientas","Power UI","https://www.powerui.com/","Rejillas, plantillas y GPT para SVG");
})();
