# Portfolio Web — Borja Mora Méndez

Código fuente de mi portfolio profesional de Data Analytics y Business Intelligence.

**Ver en vivo:** [borjamora.es](https://borjamora.es)

## Cómo se mantiene

Es un sitio estático (HTML, CSS y JavaScript sin framework) publicado con GitHub Pages desde `main`.

| Qué | Dónde |
| --- | --- |
| Estilos comunes (variables, menú, pie) | `shared.css` · estilos de la home y de Power BI en `css/` |
| Aviso de cookies y preferencias (RGPD) | `consent.js` · política en `privacidad.html` |
| Casos de estudio (apariciones y contadores) | `case.js` |
| «Copiar email» | `contact.js` |
| Selector de idioma | `lang.js` |
| Librerías de terceros (Chart.js, GSAP) | `vendor/`, servidas desde el propio dominio |
| Manual de Data Storytelling | `ds/` |

### Versión en inglés

Las páginas de `en/` se generan desde las españolas; no se editan a mano. Después de cambiar una página española:

```bash
node tools/build-en.mjs            # regenera todas las páginas inglesas
node tools/build-en.mjs --missing  # y además lista las frases nuevas sin traducir
```

Si cambias un CSS o JS propio, actualiza sus versiones de caché (`?v=` con el hash del contenido) en todas las páginas:

```bash
node tools/version-assets.mjs
```

Las traducciones están en `i18n/` (ver `i18n/README.md`).

### Comprobaciones

Se ejecutan solas en cada pull request (`.github/workflows/checks.yml`) y también se pueden lanzar en local:

```bash
node tools/build-en.mjs --check    # inglés al día y sin frases por traducir
node tools/check-links.mjs         # enlaces, imágenes, anclas, sitemap y hreflang
node tools/version-assets.mjs --check  # versiones de caché al día
npm i --no-save playwright axe-core && npx playwright install chromium
node tools/check-a11y.mjs          # accesibilidad WCAG 2.2 AA y errores de JavaScript
```

### Google Analytics

GA4 con Consent Mode v2: nada se guarda en el navegador hasta que el visitante acepta. Los eventos se declaran en el HTML con atributos, sin JavaScript en línea (`consent.js` los envía):

```html
<a href="…" data-ga="clic_linkedin" data-ga-location="footer">LinkedIn</a>
```

Eventos propios:

| Evento | Parámetros | Cuándo |
| --- | --- | --- |
| `scroll_depth` | `percent` (25, 50, 75, 100), `location` | Al alcanzar cada profundidad de lectura |
| `clic_email`, `copiar_email` | `location` | Contacto por correo |
| `clic_linkedin`, `clic_github`, `clic_agendar`, `clic_form_cv` | `location` | Enlaces de contacto y perfiles |
| `ver_dashboard_powerbi` | `dashboard_name`, `location` | Apertura de un dashboard |
| `clic_siguiente_caso` | `location` | Paso al siguiente caso de estudio |
| `descarga_pbix` | `file_id`, `file_title`, `file_category`, `trigger` | Descarga de un .pbix |
| `clic_app_streamlit`, `clic_github_proyecto` | `location` | Apps y código de los proyectos de análisis |
| `hero_cta_proyectos`, `hero_cta_como_trabajo`, `clic_pbi_mockup`, `clic_foto_sobre_mi` | `location` | Llamadas a la acción de la home |

Para que `location`, `percent` y `page_language` aparezcan en los informes hay que registrarlos una vez en GA4: *Administrar → Definiciones personalizadas → Crear dimensión personalizada* (ámbito «Evento»).
