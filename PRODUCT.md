# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Reclutadores/HR haciendo el cribado inicial de la candidatura de Borja a puestos de Data Analyst / BI Analyst / Power BI Developer.
- Hiring managers técnicos y data leads validando profundidad técnica y criterio de negocio antes de avanzar a entrevista.
- Clientes potenciales (empresas o particulares) evaluando encargarle una colaboración freelance o un proyecto puntual de análisis/dashboard.

## Product Purpose

Portfolio profesional de Borja Mora Méndez, Data Analyst / Power BI Developer en Madrid. Existe para conseguir que un reclutador o hiring manager avance su candidatura a entrevista y, en segundo plano, que un cliente potencial le encargue un proyecto freelance. Éxito = clic en "Envíame un mensaje" / "Agendar llamada", entrevista concedida, o encargo freelance real.

## Positioning

Combinación de habilidad técnica (Power BI, DAX, Power Query/M, SQL, Python) con criterio de diseño (perspectiva UX) y comunicación de datos (data storytelling) orientada a que alguien tome una decisión con el dato — no solo construir el dashboard, sino diseñar cómo se lee. Reforzado por experiencia previa no-data (marketing digital, operaciones) traducida a comprensión de negocio real (KPIs, márgenes, ventas), no solo skills aprendidos en bootcamp.

## Operating Context

Sitio estático (HTML/CSS/JS vanilla, sin framework ni build step), desplegado en GitHub Pages bajo dominio propio borjamora.es (ver `CNAME`). Analítica vía `gtag` en los CTAs principales.

Estructura de páginas (ES): `index.html` (home: hero + proyectos + contacto), `sobre-mi.html` (bio + CV), `power-bi.html`, `analisis-datos.html`, `visualizacion-datos.html` (proyectos por disciplina), `casa-origen.html` (caso de estudio individual, con activos propios en `CasaOrigen/`), `descargas.html` (archivos .pbix descargables), `proyectos.html`.

Versión en inglés parcial en `en/` — solo `index.html`, `projects.html`, `downloads.html`. No existe equivalente de `sobre-mi`/`about`, lo que genera un 404 conocido desde el nav EN.

## Capabilities and Constraints

- El botón "Descargar CV" no descarga un PDF directo: abre intencionadamente un formulario externo (Tally) para capturar contacto antes de compartir el CV. Es un flujo deliberado de captura de lead, no un bug — preservarlo.
- El dashboard "wow" del hero está etiquetado explícitamente "SIMULACIÓN · DATOS FICTICIOS"; los datos mostrados son ficticios y esa etiqueta debe permanecer visible siempre.
- Las cifras de prueba social del hero (seguidores LinkedIn, impresiones acumuladas) son reales a la fecha en que se escribieron — no inflarlas ni inventarlas; deben mantenerse actualizadas o retirarse si dejan de ser ciertas.
- El proyecto "Casa Origen" tiene página y activos propios (`CasaOrigen/`) como caso de estudio independiente dentro del portfolio.
- Sin framework: cualquier componente nuevo se implementa en HTML/CSS/JS plano siguiendo el patrón existente (bloques `<style>` por sección + `shared.css` global).
- Paridad ES/EN es una deuda conocida y aceptada por ahora (EN tiene menos páginas que ES) — no expandir contenido nuevo en EN sin decisión explícita del usuario.

## Brand Commitments

- Nombre: "Borja Mora" / "Borja Mora Méndez". Dominio: borjamora.es.
- Certificación ancla: Microsoft PL-300 (Power BI Data Analyst Associate), mencionada en hero y meta description.
- Estado de disponibilidad declarado en el hero: "Disponible para incorporación inmediata" — señal principal e independiente del mensaje de apertura a colaboraciones freelance en la sección de contacto (que es secundario, nunca debe competir en peso visual con la búsqueda de puesto fijo).

## Evidence on Hand

- Proyectos reales con narrativa problema → solución → resultado y cifras propias, incluyendo un proyecto de skyline 3D de Madrid, mapeo de inundaciones DANA, y una herramienta propia ("PBI Mockup Creator").
- Archivos .pbix reales descargables en `descargas.html`.
- CV no existe como archivo en el repo; solo accesible vía el formulario Tally (ver Capabilities and Constraints) — no fabricar un enlace de descarga directa.
- Sin testimonios de clientes ni casos de estudio de terceros verificados en este momento — no inventar prueba social que no exista.

## Product Principles

1. Todo copy y evidencia debe ser defendible en una entrevista real — nunca inflar seniority ni inventar experiencia.
2. La señal principal del sitio es "busco incorporarme como Data Analyst"; freelance/colaboraciones es una puerta secundaria y no debe competir en peso visual con esa candidatura.
3. Cada proyecto debe demostrar competencia analítica + Power BI + comprensión de negocio + comunicación visual — un dashboard técnicamente vistoso no basta si no está clara la decisión que facilita.
4. Preservar los flujos de captura de lead existentes (formulario de CV) y las etiquetas de transparencia sobre datos ficticios; no son deuda técnica, son decisiones deliberadas.

## Accessibility & Inclusion

Ya existen señales de cuidado (skip-link a `#main-content`, `aria-label` en bloques de meta/prueba social) — mantener ese nivel como mínimo. No hay un estándar formal (p. ej. WCAG AA) establecido explícitamente más allá de eso.
