# Taxonomía del Second Brain

> Generado con `node tools/second-brain/analyze.mjs --doc` desde `framework.json` (versión 4). No se edita a mano: cambia el marco y regenera.

## De dónde sale

La estructura **no se inventa**: sale de cómo organizas tus carpetas (por ejemplo `03-Machine-Learning/01-supervisado/clasificacion/random-forest/…`) y de lo que el código confirma.
Cada concepto del marco puede tener un `padre` (la rama a la que pertenece) y unas `rutas` (los nombres de carpeta con los que lo organizas).

- **Una carpeta declara el tema, el código lo confirma.** El nombre de la carpeta solo cuenta como documentación. Un proyecto en `random-forest/` cuyo código no usa `RandomForest*` aparece como _«la carpeta lo declara, el código no lo confirma»_ y no como práctica.
- **La evidencia sube por la jerarquía.** Un área o una disciplina está respaldada si lo está alguna de sus técnicas, y cada rama indica cuántas de sus técnicas tienen práctica, cuántas solo documentación y cuántas ninguna evidencia. Es cobertura, no dominio.
- **Un proyecto, una entidad.** La carpeta del portfolio, el repositorio de su app y la página publicada se unen en un solo proyecto cuando sus README (o el catálogo) se enlazan de forma explícita. No se une nada por parecido de nombre; los posibles duplicados sin vínculo se avisan.
- **Posición en el árbol.** Cada proyecto cuelga de la técnica más específica que su carpeta declara y su código confirma; además se relaciona («demuestra») con todas las que aplica (hasta 10, las más específicas primero).
- **Lo que no existe no se pinta.** Solo hay nodos para lo que aparece en tus materiales. Una rama sin evidencia cuenta como «sin evidencia» en la cobertura de su padre; no se inventa un nodo vacío.

## Etapas de conocimiento

| Etapa | Qué significa | Cómo se llega |
|---|---|---|
| Identificado | Aparece solo en listas o menciones declarativas | Evidencia declarativa |
| Estudiado o documentado | Hay documentación o apuntes, sin práctica detectable | Evidencia explicativa |
| Aplicado | Se ha usado en el código o los artefactos de un proyecto | Evidencia práctica |
| Reforzado | Aplicado en más de un proyecto | Práctica en ≥ 2 proyectos |
| Evaluado | Evaluado con una prueba o evidencia verificable | Solo si lo registras (`assessments`, con motivo y origen) |
| Dominio confirmado | Confirmado con criterios definidos | Solo si lo registras tú («Lo domino» o `assessments`) |

No es una puntuación: cinco proyectos no demuestran más dominio que uno complejo y bien evaluado, y la ausencia de evidencia no se interpreta como desconocimiento.

## Árbol (áreas con ramas)

- **IA y Big Data** _(concepto; Machine Learning e IA; carpeta: `ia bigdata`, `ia big data`)_
  - **Agentes y chatbots** _(concepto; Machine Learning e IA; carpeta: `agentes ia`)_
  - **Big data y procesamiento distribuido** _(concepto; Ingeniería y preparación de datos; carpeta: `big data distribuido`)_
    - **PySpark y Spark** _(técnica; Ingeniería y preparación de datos; carpeta: `pyspark`)_
  - **NLP, LLM y agentes de IA** _(concepto; Machine Learning e IA)_
  - **Reglas de asociación (Apriori)** _(técnica; Machine Learning e IA; carpeta: `mineria datos`, `apriori`)_
  - **Visión artificial** _(técnica; Machine Learning e IA; carpeta: `vision artificial`)_
- **Machine learning** _(concepto; Machine Learning e IA)_
  - **Aprendizaje no supervisado** _(concepto; Machine Learning e IA; carpeta: `no supervisado`)_
    - **Clustering y segmentación** _(técnica; Machine Learning e IA; carpeta: `clustering`)_
      - **Clustering jerárquico** _(técnica; Machine Learning e IA; carpeta: `jerarquico`)_
      - **K-Means** _(técnica; Machine Learning e IA; carpeta: `kmeans`, `k means`)_
    - **Reducción de dimensionalidad** _(técnica; Machine Learning e IA; carpeta: `reduccion dimensionalidad`)_
      - **PCA (componentes principales)** _(técnica; Machine Learning e IA; carpeta: `pca`)_
      - **t-SNE** _(técnica; Machine Learning e IA; carpeta: `tsne`, `t sne`)_
  - **Aprendizaje por refuerzo** _(concepto; Machine Learning e IA; carpeta: `aprendizaje por refuerzo`)_
    - **SARSA** _(técnica; Machine Learning e IA; carpeta: `sarsa`)_
  - **Aprendizaje supervisado** _(técnica; Machine Learning e IA; carpeta: `supervisado`)_
    - **Clasificación** _(técnica; Machine Learning e IA; carpeta: `clasificacion`)_
      - **Árboles de decisión** _(técnica; Machine Learning e IA; carpeta: `arbol decision`, `arboles decision`)_
      - **Naive Bayes** _(técnica; Machine Learning e IA; carpeta: `naive bayes`)_
      - **Random Forest** _(técnica; Machine Learning e IA; carpeta: `random forest`)_
      - **Regresión logística** _(técnica; Machine Learning e IA; carpeta: `regresion logistica`)_
      - **SVM (máquinas de vectores de soporte)** _(técnica; Machine Learning e IA; carpeta: `svm`)_
      - **XGBoost** _(técnica; Machine Learning e IA; carpeta: `xgboost`)_
    - **Regresión** _(técnica; Machine Learning e IA; carpeta: `regresion`)_
      - **Gradient Boosting** _(técnica; Machine Learning e IA; carpeta: `gradient boosting`)_
      - **Regresión lineal (simple y múltiple)** _(técnica; Machine Learning e IA; carpeta: `regresion lineal`)_
      - **Regularización (Ridge y Lasso)** _(técnica; Machine Learning e IA; carpeta: `ridge lasso`, `regularizacion`)_
  - **Evaluación de modelos** _(técnica; Machine Learning e IA)_
    - **Ajuste de hiperparámetros** _(técnica; Machine Learning e IA)_
    - **Comparación de modelos** _(técnica; Machine Learning e IA; carpeta: `comparativa modelos`)_
    - **Métricas de clasificación** _(técnica; Machine Learning e IA)_
    - **Métricas de regresión** _(técnica; Machine Learning e IA)_
    - **Separación y validación cruzada** _(técnica; Machine Learning e IA)_
  - **Explicabilidad de modelos** _(técnica; Machine Learning e IA)_
  - **Ingeniería de variables** _(técnica; Machine Learning e IA)_
    - **Codificación de variables categóricas** _(técnica; Machine Learning e IA)_
    - **Escalado de variables** _(técnica; Machine Learning e IA)_
    - **Tratamiento de valores ausentes** _(técnica; Machine Learning e IA)_
  - **Redes neuronales y deep learning** _(concepto; Machine Learning e IA; carpeta: `redes neuronales`)_
    - **Mapas autoorganizados (SOM)** _(técnica; Machine Learning e IA; carpeta: `som`)_
    - **Perceptrón multicapa (MLP)** _(técnica; Machine Learning e IA; carpeta: `mlp`)_
  - **Series temporales y previsión** _(técnica; Machine Learning e IA; carpeta: `series temporales`)_
    - **ARIMA, SARIMA y SARIMAX** _(técnica; Machine Learning e IA; carpeta: `arima`, `sarima`)_
    - **Estacionariedad, ACF/PACF y descomposición** _(técnica; Machine Learning e IA)_
  - **Sistemas de recomendación** _(técnica; Machine Learning e IA; carpeta: `sistemas recomendacion`)_
    - **Recomendación basada en contenido** _(técnica; Machine Learning e IA; carpeta: `recomendador peliculas contenido`)_
- **Power BI** _(tecnología; Power BI y Business Intelligence)_
  - **DAX** _(tecnología; Power BI y Business Intelligence)_
    - **Contexto de filtro en DAX** _(técnica; Power BI y Business Intelligence)_
    - **Funciones DAX avanzadas** _(técnica; Power BI y Business Intelligence)_
    - **Inteligencia de tiempo** _(técnica; Power BI y Business Intelligence)_
  - **Interactividad en Power BI** _(técnica; Power BI y Business Intelligence)_
  - **Modelo en estrella** _(concepto; Power BI y Business Intelligence)_
  - **Optimización de modelos** _(técnica; Power BI y Business Intelligence)_
  - **Power BI Service** _(tecnología; Power BI y Business Intelligence)_
    - **Seguridad a nivel de fila (RLS)** _(técnica; Power BI y Business Intelligence)_
  - **Power Query** _(tecnología; Power BI y Business Intelligence)_
- **Python** _(tecnología; Python y análisis de datos)_
  - **Jupyter Notebooks** _(tecnología; Python y análisis de datos)_
  - **NumPy y SciPy** _(tecnología; Python y análisis de datos)_
  - **pandas** _(tecnología; Python y análisis de datos)_
- **SQL** _(tecnología; SQL y bases de datos)_
  - **Agregaciones y agrupaciones** _(técnica; SQL y bases de datos)_
  - **Creación de tablas y vistas (DDL)** _(técnica; SQL y bases de datos)_
  - **CTE y consultas por capas** _(técnica; SQL y bases de datos)_
  - **Funciones de ventana** _(técnica; SQL y bases de datos)_
  - **Joins y modelado relacional en SQL** _(técnica; SQL y bases de datos)_
  - **Optimización de consultas** _(técnica; SQL y bases de datos)_
  - **Subconsultas** _(técnica; SQL y bases de datos)_

## Conceptos sueltos (sin ramas propias)

- Accesibilidad _(UX/UI y diseño)_
- Análisis conjunto (conjoint) _(Machine Learning e IA)_
- Análisis exploratorio (EDA) _(Python y análisis de datos)_
- APIs y datos web _(Ingeniería y preparación de datos)_
- Arquitectura de la información _(UX/UI y diseño)_
- Automatización _(Ingeniería y preparación de datos)_
- Calidad y limpieza de datos _(Ingeniería y preparación de datos)_
- Data Storytelling _(Data Storytelling y visualización)_
- Desarrollo web (HTML, CSS, JS) _(UX/UI y diseño)_
- Diseño de dashboards _(Data Storytelling y visualización)_
- Documentación _(Negocio y competencias transversales)_
- Estadística _(Python y análisis de datos)_
- ETL y pipelines _(Ingeniería y preparación de datos)_
- Excel _(Ingeniería y preparación de datos)_
- Experimentación (tests A/B) _(Machine Learning e IA)_
- Figma _(UX/UI y diseño)_
- Finanzas y control de gestión _(Negocio y competencias transversales)_
- Git y GitHub _(Ingeniería y preparación de datos)_
- IBCS _(Data Storytelling y visualización)_
- Interpretación del negocio _(Negocio y competencias transversales)_
- Investigación de usuarios _(UX/UI y diseño)_
- Justificación de decisiones _(Negocio y competencias transversales)_
- KPI e indicadores _(Negocio y competencias transversales)_
- Marketing y clientes _(Negocio y competencias transversales)_
- Modelado de datos _(Ingeniería y preparación de datos)_
- Plataformas cloud de datos _(Ingeniería y preparación de datos)_
- Pruebas y validación _(Ingeniería y preparación de datos)_
- Retail y ventas _(Negocio y competencias transversales)_
- scikit-learn _(Machine Learning e IA)_
- Streamlit _(Python y análisis de datos)_
- Turismo y hostelería _(Negocio y competencias transversales)_
- UX/UI _(UX/UI y diseño)_
- Visualización de datos _(Data Storytelling y visualización)_

## Cómo añadir una técnica

1. Añade el concepto a `framework.json` → `conceptos` con su `padre`, su `familia`, los `terminos` que lo nombran, `codigo` (patrones por lenguaje) y, si tus carpetas lo nombran, `rutas`.
2. Si hay una relación transversal (no jerárquica), añádela a `relaciones` con su fundamento.
3. `node tools/second-brain/analyze.mjs --demo` y `--doc`; ejecuta las pruebas. Si el concepto no aparece en tus materiales, no habrá nodo: es intencionado.

## Compatibilidad y migración

- Los identificadores existentes (`c:…`, `p:…`, `k:…`) no cambian, así que tus notas de `sb_notas` siguen apuntando al mismo elemento. `clasificacion-regresion` pasa a llamarse «Aprendizaje supervisado» sin cambiar de id.
- La migración es aditiva (campos y nodos nuevos); un snapshot anterior sigue siendo válido. Para volver atrás basta con publicar de nuevo un snapshot anterior (cada publicación es una fila de `sb_snapshots`).
- Tus valoraciones y notas no se tocan: se aplican encima del análisis, nunca dentro.
