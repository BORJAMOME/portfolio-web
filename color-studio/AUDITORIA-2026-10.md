# Auditoría integral de Color Studio · 26-10-2026

Commit auditado: `4ed58e7` (`main`, tras el PR #74). Durante la auditoría no se modificó ni código ni datos.
Las pruebas de interfaz usan el Supabase simulado en memoria y el modo ejemplo; la base real no se tocó.
Leyenda: **[C]** confirmado con una prueba reproducible · **[L]** confirmado leyendo el código · **[R]** riesgo pendiente de verificar.

## 1. Resumen ejecutivo

- **Las bases son sólidas**:
  - La matemática del color es correcta:
    - CIEDE2000 coincide con los **34 pares oficiales** de Sharma, Wu y Dalal (error máximo 4,95·10⁻⁵, que es el redondeo del propio dataset).
    - sRGB↔CIELAB (D65) es exacto en los colores de referencia.
    - La ida y vuelta HEX→Lab→HEX no falla en ninguno de 200 000 colores.
  - La lógica está en módulos puros con pruebas deterministas.
  - El esquema y la RLS del repositorio son coherentes.
  - Los datos de Sanzo Wada están íntegros.
- **Lo que más afecta a la fiabilidad hoy**:
  1. **La CI de `main` está en rojo desde #75** por una prueba del Centro de trabajo que falla de forma intermitente. El paso de interfaz de Color Studio se **omite** (CS-01). En la práctica, Color Studio no tiene protección automática en remoto.
  2. **Fuga de estado**: los colores que tecleas en la guía de calcetines cambian en silencio los calcetines que propone el Studio (CS-02).
  3. **Extracción de color de fotos**: con sombra, el tono de la sombra pasa a ser el color principal (CS-03). Con un fondo de rayas, los colores del fondo se proponen como colores de la prenda (CS-04).
  4. **Arquitectura de carga**: cada módulo ES se descarga dos veces (con y sin `?v=`). Tras un despliegue, durante hasta 10 minutos, pueden mezclarse versiones (CS-05).
  5. **UX móvil**: el Studio mide unos 5 500 px de alto. La dirección cromática empieza a unos 1 550 px y «Guardar outfit» está al final (CS-06).
  6. **Utilidad de las paletas**: solo 60 de las 348 paletas de Wada tienen algún color a ΔE00 ≤ 10 de un armario neutro típico. Con armarios sobrios, «Paletas que inspiran» suele quedarse corta (CS-07).
- No hay hallazgos P0. Tampoco hay pérdida de datos confirmada.

## 2. Mapa de arquitectura (real)

```
area-privada.html ── link data-ap-module="color" (?v=) ── area-privada.js (shell: sesión, api, rutas, modo app #/apps)
                                                         │ render(ctx) → Promise<paint>
                                                         ▼
area-privada-color.js (1 304 líneas, 328 funciones; solo interfaz)
   │  import() de cs-engine, cs-socks, cs-data, cs-image, cs-compose (con ?v=)
   ├── color-studio/engine.js   HEX, Lab/LCh, ΔE00, familias, paletas, distribución, k-means
   ├── color-studio/compose.js  lectura del conjunto, direcciones (MOVES), adaptación de paletas  → importa ./engine.js (sin ?v=)
   ├── color-studio/socks.js    calcetines (RULES), tipo de calzado                               → importa ./engine.js y ./compose.js (sin ?v=)
   ├── color-studio/data.js     validación, import/export JSON-CSV, modo ejemplo                  → importa ./engine.js (sin ?v=)
   └── color-studio/image.js    validar, reducir sin EXIF, muestra 96 px                          → importa ./engine.js (sin ?v=)
Persistencia: fetch → PostgREST (cs_garments, cs_palettes, cs_outfits) y Storage (bucket privado «armario»), RLS is_member().
Estado: caché en memoria del módulo (5 min) + borrador en sessionStorage (bm_cs_draft) + mem (filtros, ajustes de la guía de calcetines).
Ciclo de vida: cada acción → refresh() → rebuild() repinta la vista completa y restaura el foco por data-key.
```

- **Fuentes de verdad**:
  - Supabase guarda prendas, paletas y outfits.
  - El borrador vive en `sessionStorage`.
  - Lo derivado (familias, distribución, propuestas) se recalcula y no se guarda.
- **Duplicación**: no hay lógica duplicada entre módulos. `buildItems` (en compose) la usan tanto la interfaz como el motor.
- **Acoplamiento**:
  - `area-privada-color.js` concentra las 4 vistas, los formularios y la carga. Es grande, pero está ordenado por secciones.
  - El estado de la guía de calcetines (`mem.sock`) es compartido y provoca el CS-02.
- **Código muerto**: `PREFERENCE` en `socks.js` solo se mantiene por compatibilidad. No se han encontrado más rutas inaccesibles.

## 3. Auditoría de funcionalidades

| Área | Estado | Evidencia |
|---|---|---|
| Studio: elegir prendas, pesos, distribución que suma 100, ajuste manual | Funciona | check-color (44/44) |
| Direcciones, comparar, aplicar y volver al original | Funciona | check-color, test-color |
| Biblioteca: crear, validar, duplicados, filtros, importar y exportar | Funciona | check-color |
| Armario: alta, edición, foto privada sin EXIF, borrado de la foto | Funciona | check-color |
| Calcetines: guía y bloque en el Studio | Funciona, con la fuga del CS-02 | [C] Playwright |
| Modo ejemplo sin escrituras | Funciona | check-color (recuento de peticiones) |
| Errores de guardado sin falsa confirmación; sesión caducada | Funciona | check-color |

## 4. Motor cromático

- **Calculable y correcto**:
  - Conversiones sRGB D65 (matrices de Lindbloom, ε = 216/24389, κ = 24389/27).
  - CIEDE2000, que es simétrico.
  - LCh.
  - Entradas no válidas: `normalizeHex` devuelve `null`, `colorDistance` devuelve `Infinity` y `describeColor` devuelve `null`.
- **Distancia frente a armonía**: el código ya lo separa bien.
  - ΔE00 solo se usa como «proximidad».
  - La armonía son criterios con nombre (`MOVES`, `RULES`).
  - La lectura es una orientación y no muestra puntuaciones.
- **Qué es matemático y qué es criterio**:

| Concepto | Naturaleza |
|---|---|
| Luminosidad, croma, tono, ΔE00, superficie estimada | Matemático |
| Temperatura | Aproximación por tono |
| Relación (tonal, análoga, complementaria) | Convención sobre el ángulo de tono |
| Jerarquía (dominante, apoyo, acento) | Heurística con umbrales documentados |
| Lectura y direcciones | Criterio estilístico |

- **Hallazgos**:
  - CS-08: familias mal asignadas en colores frecuentes de ropa.
  - CS-16: recorte fuera de gama por canal.
  - CS-18: las pruebas cubren solo 6 de los 34 pares de CIEDE2000.

Clasificación de colores de referencia (extracto):

| HEX | Debería leerse | El motor dice | L · C · h |
|---|---|---|---|
| #808000 | oliva | amarillo / «mostaza» | 52 · 58 · 103 |
| #BDB76B | caqui | amarillo / «mostaza» | 73 · 40 · 103 |
| #E1AD01 | mostaza | naranja / «naranja» | 73 · 77 · 85 |
| #000080 | marino intenso | marino (neutro) | 13 · 80 · 306 |
| #008080 | petróleo | azul / «azul» | 48 · 30 · 196 |
| #1F2A44, #556B2F, #C19A6B | marino, oliva oscuro, camel | correcto | — |

## 5. Armario, fotografías y conjuntos

### Extracción de color de fotos

k-means sobre una muestra de 96 px, con más peso en el centro y menos en lo que se parece al borde. Resultados con imágenes sintéticas [C]:

| Caso | Resultado | ΔE00 del 1.er color frente al real |
|---|---|---|
| Prenda centrada, descentrada, primer plano, cuadros | Correcto | 0 |
| Beige sobre fondo muy parecido | Se fusiona con el fondo (aceptable) | 0 |
| **Media prenda en sombra** | **La sombra sale primera (45 %) y se fija como principal**: rojo → «marrón» | **14,8** |
| **Fondo de rayas** | Los dos colores del fondo aparecen con un 30 % cada uno | — |
| Luz cálida sobre camisa blanca | «Crudo»; no hay corrección del balance de blancos | 11,7 |

- Con tantas fotos de móvil hechas con luz lateral, los casos de sombra y luz cálida serán frecuentes.
- La interfaz ya avisa de que hay que corregir, y la edición manual funciona.
- Al editar una prenda existente, cambiar la foto no pisa el color principal (correcto).

### Conjuntos

- El conjunto se evalúa como composición, no por parejas: dominante, acentos, repetición, contraste de luminosidad, temperatura y relación pantalón-calzado.
- Las prendas multicolor reparten su superficie.
- Una prenda borrada se muestra como «prenda eliminada».
- CS-13: el aviso «hipotético» se pierde al guardar.

## 6. Sistema de calcetines

- **Entradas que usa**:
  - Pantalón y su dibujo.
  - Calzado, su tipo (deducido del texto) y sus secundarios.
  - Parte superior, prenda exterior y accesorios.
  - Formalidad y dirección.
  - Los calcetines que tienes.
  - La biblioteca de paletas.
- **Las tres estrategias están separadas**: Continuidad, Coordinación y Contraste.
- **Determinismo**: el mismo resultado en dos llamadas [C].
- **Duplicados**: con 4 000 conjuntos aleatorios, ningún par de propuestas a ΔE00 ≤ 10. Hubo 14 casos con menos de tres propuestas, todos explicados con una nota [C].
- **Hallazgos**:
  - CS-09: una regla no coincide con lo que se decide (calcetín propio idéntico etiquetado como «un punto más oscuro»).
  - CS-10: «Zapato informal» se detecta como zapato formal.
  - CS-11: el contraste calculado incumple su propia regla (> 15 de pantalón y calzado) en el 1,85 % de los casos aleatorios.
  - CS-12: el nivel de contraste toma el mínimo de las dos distancias y oculta el contraste con el pantalón.
  - CS-02: la fuga de estado entre la guía y el Studio.
- **Estabilidad**:
  - Ante el orden de prendas con la misma superficie, el resultado cambia.
  - En la aplicación ese orden es fijo (exterior → superior → accesorio), así que en la práctica es estable. Nota P4.
- **Entradas que faltan para un consejo realmente contextual**:
  - Estilo y largo del calcetín (invisible, tobillero, media caña).
  - Cuánto asoma: largo del pantalón y caída sobre el zapato.
  - Ocasión.
  - Material y textura.
- **Con lo que ya existe**: la subcategoría del calcetín, el material y el patrón son texto o campos que ya se guardan y se podrían aprovechar sin tocar el esquema.

## 7. Sanzo Wada y paletas

- **Íntegras** [C]:
  - 348 paletas: 120 de 2 colores, 120 de 3 y 108 de 4.
  - 159 colores, todos con HEX válido.
  - 348 combinaciones únicas y ninguna casi duplicada (ΔE00 ≤ 2).
  - Mismo nombre siempre con el mismo HEX.
  - El código de la web las importa sin errores.
- **Procedencia**:
  - Commit y SHA-256 fijados.
  - El HEX está marcado como conversión aproximada desde CMYK. No se presenta como fiel al ejemplar impreso.
- **Utilidad práctica** (CS-07):
  - El croma medio de los colores es 38 y el 42 % tiene croma ≥ 40.
  - Contra un armario neutro típico (marino, crudo, gris, marrón, piedra, negro), solo 60 paletas conectan a ΔE00 ≤ 10.
  - La coincidencia por proximidad exacta es demasiado estricta para usar las paletas como inspiración.

## 8. Persistencia y seguridad

- **RLS**:
  - Las tres tablas tienen RLS por operación con `is_member()`, y se revoca el acceso a `anon`.
  - El bucket es privado (5 MB, JPEG/PNG/WebP) y tiene políticas de lectura, subida y borrado.
- **Validación**:
  - Hay checks en la base (`cs_is_hex`, colores de la paleta, items del outfit, URL http(s)).
  - La web valida antes con el mismo criterio (`data.js`).
- **Sin vías de XSS**: los dos `innerHTML` son constantes estáticas (iconos e intro). Todo lo que viene de la base se pinta como texto.
- **Fotos**:
  - Se recodifican en el navegador, lo que elimina el EXIF.
  - Si falla el alta, se borra la foto ya subida.
  - Al cambiar la foto, se borra la anterior.
- **[R] Pendiente de verificar**:
  - El estado de la base en producción (scripts ejecutados, políticas activas). No hay credenciales en este entorno, y es lo correcto.
  - Fotos huérfanas si falla el borrado en Storage después de borrar la fila (solo se registra en la consola).
  - Varias pestañas o dispositivos: gana la última escritura (PATCH con la fila completa y caché de 5 min).

## 9. UX/UI móvil

Medido con Playwright a 320 y 390 px, en modo app, táctil y con movimiento reducido [C]:

- **Sin desbordes**:
  - No hay scroll horizontal.
  - La barra inferior (61 px) no tapa el último control.
  - Las hojas inferiores ocupan todo el ancho.
  - El foco se conserva tras repintar.
  - No hay errores de JavaScript.
- **CS-06, jerarquía**:
  - Página de 5 374 px a 390 px y de 5 746 px a 320 px.
  - La dirección cromática empieza a 1 529–1 652 px.
  - «Guardar outfit» queda al final.
- **CS-14**: a 320 px se recorta la etiqueta Dominante/Apoyo, porque va dentro del nombre con puntos suspensivos.
- **CS-15, objetivos táctiles por debajo de 44 px**:
  - Botones `cs-btn-s`: 40 px.
  - Desplegables (`summary`): 32–36 px.
  - Deslizadores: 32 px.
  - Pesos: 40 px.
  - Cumplen WCAG 2.5.8 (24 px), pero no la recomendación de Apple (44 pt).
- **[R] No verificado**:
  - El teclado virtual de iOS sobre las hojas inferiores.
  - Que los lectores de pantalla anuncien bien las regiones `aria-live`: se recrean en cada repintado (CS-20).

## 10. Resultados de pruebas (comandos ejecutados)

| Comando | Resultado |
|---|---|
| `node --test tools/test-color.mjs` | 60/60 |
| `node tools/check-color.mjs` | 44/44 (local) |
| `node tools/check-kanban.mjs` | 34/34 en local; **33/34 en CI** (prueba de reordenación con filtro; intermitente) |
| CIEDE2000 con los 34 pares oficiales (script de auditoría) | 34/34, error ≤ 4,95·10⁻⁵ |
| Ida y vuelta HEX→Lab→HEX con 200 000 colores | 0 fallos |
| Extracción con 9 fotos sintéticas | 2 fallos relevantes (sombra, fondo de rayas) |
| Calcetines con 4 000 conjuntos aleatorios | 0 duplicados · 74 contrastes que incumplen su regla |
| Coste del motor en un repintado del Studio (348 paletas, 60 prendas, Node) | unos 28 ms (en un móvil será más; no medido) |
| CI de `main`, ejecuciones 180 y 182 | **Fallo** en «Centro de trabajo»; paso de Color Studio **omitido** |

Huecos de cobertura:
- Solo hay 6 de los 34 pares de CIEDE2000.
- No hay casos de sombra ni de fondo complejo en la extracción.
- No hay pruebas fuera de gama.
- `inferShoeType` no tiene ningún caso con «informal».
- No se prueba que el contraste calculado cumpla su regla.
- No se prueba que la guía no afecte al Studio.

## 11. Registro priorizado

| ID | P | Tipo | Archivo | Hallazgo | Impacto | Solución propuesta | Esfuerzo | Riesgo | Validación |
|---|---|---|---|---|---|---|---|---|---|
| CS-01 | P1 | [C] | `.github/workflows/checks.yml` (pasos 67-69); `tools/check-kanban.mjs` | `main` en rojo; el paso de Color Studio se omite porque falla antes el de kanban | Color Studio sin protección en CI; #74 se fusionó sin validación remota | Separar los pasos (`if: always()` o un job por suite). Aparte, estabilizar la prueba de reordenación con filtro del Centro de trabajo | S | Bajo | CI verde con las dos suites |
| CS-02 | P2 | [C] | `area-privada-color.js` (`sockInputFrom`, `paintSocks`, `mem.sock`) | Lo que se teclea en la guía cambia los calcetines del Studio, incluso sin pulsar «Actualizar» | Recomendaciones que no corresponden al outfit mostrado | Guardar el ajuste solo al pulsar «Actualizar»; usarlo solo en la guía, o avisarlo en el Studio con «Volver a los colores del outfit» | S | Bajo | Nueva prueba de interfaz: teclear, volver al Studio y comprobar que no cambia nada |
| CS-03 | P2 | [C] | `engine.js` (`extractDominantColors`); `area-privada-color.js` (principal automático) | Una sombra se convierte en el color principal | Prendas guardadas con un color equivocado | Fusionar grupos de tono y croma parecidos que difieren sobre todo en luminosidad; no fijar el principal automáticamente si los dos primeros comparten tono | M | Medio | Caso «sombra» en test-color |
| CS-04 | P2 | [C] | `engine.js` | Un fondo multicolor no se rebaja (usa la media del borde) | Colores del fondo propuestos como secundarios | Agrupar los píxeles del borde (k pequeño) y rebajar cada grupo | M | Medio | Caso «rayas» en test-color |
| CS-05 | P2 | [L] | `color-studio/*.js` (imports relativos sin `?v=`) | Cada módulo carga dos veces; hasta 10 min de versiones mezcladas tras un despliegue | Fallo de carga o comportamiento incoherente tras publicar | Que `version-assets` añada `?v=` a los imports relativos de `color-studio/`. Un import map no sirve: la CSP bloquea el JSON en línea | M | Medio | `version-assets --check`; una sola petición por módulo en la pestaña Red |
| CS-06 | P2 | [C] | `area-privada-color.js` (`paintStudio`); CSS | Studio de unos 5 500 px; lo importante queda abajo | Uso desde el móvil lento | Orden: prendas compactas → dirección → calcetines → composición plegable; acción de guardar fija en móvil | M | Medio | Medir la posición con Playwright; axe |
| CS-07 | P2 | [C] | `compose.js`, `engine.js` (`rankPalettes` ΔE00 ≤ 10) | Pocas paletas conectan con armarios sobrios | Pierde valor la inspiración en Wada | Segundo nivel de relación por familia y banda de luminosidad, etiquetado como «relación por familia, no por color» | M | Bajo | Recuento con un armario neutro en test-color |
| CS-08 | P3 | [C] | `engine.js` (`describeColor`) | Oliva, caqui y mostaza mal clasificados; marino intenso como neutro | Explicaciones y lectura menos precisas | Recalibrar con un juego de colores de ropa y añadirlo a las pruebas | S-M | Medio (cambia nombres) | Tabla de referencias en test-color |
| CS-09 | P3 | [C] | `socks.js` (continuidad con calcetín propio) | Regla «separacion-sutil» con un HEX idéntico al pantalón | La explicación no coincide con la decisión | Recalcular las reglas según el color final | S | Bajo | Prueba unitaria |
| CS-10 | P3 | [C] | `socks.js` (`inferShoeType`) | «informal» contiene «formal» | Contexto de calzado equivocado | Límite de palabra o comprobar «informal» antes | S | Bajo | Prueba unitaria |
| CS-11 | P3 | [C] | `socks.js` (contraste calculado) | El segundo intento no se valida | Contraste que incumple su regla (1,85 %) | Validar y, si no cumple, buscar otro o no proponer contraste | S | Bajo | Propiedad sobre 4 000 conjuntos aleatorios |
| CS-12 | P3 | [C] | `socks.js` (`contrastLevel`) | Usa el mínimo frente a pantalón y calzado | «Bajo» cuando es alto frente al pantalón | Mostrar los dos niveles por separado | S | Bajo | Prueba unitaria e interfaz |
| CS-13 | P3 | [L] | `data.js` (`validateOutfit`) | Al guardar se pierde la marca de hipotético | Al reabrir parece una elección hecha a mano | Guardar `hypothetical: true` en el item (el check del JSON lo permite) | S | Bajo (cambia el formato guardado: pedir permiso) | Prueba de guardar y recargar |
| CS-14 | P3 | [C] | `css/color-studio.css` (`.cs-dist-name`) | La etiqueta de rol se recorta a 320 px | Se pierde la jerarquía en móviles pequeños | Etiqueta fuera del nombre recortado | S | Bajo | Captura a 320 px |
| CS-15 | P3 | [C] | CSS | Objetivos táctiles de 32–40 px | Toques fallidos | Subir a 44 px en móvil | S | Bajo | Medición con Playwright |
| CS-16 | P3 | [C] | `engine.js` (`labToRgb`) | Recorte por canal fuera de gama | Colores calculados que se desvían en tono | Reducir el croma hasta entrar en gama | S | Bajo | Prueba con LCh fuera de gama |
| CS-18 | P3 | [C] | `tools/test-color.mjs` | Cobertura de referencia incompleta | Regresiones sin detectar | Los 34 pares y los casos de esta auditoría | S | Nulo | La propia suite |
| CS-19 | P3 | [L] | `area-privada-color.js` (`rebuild`) | Repintado completo en cada acción | Latencia en móviles lentos | Medir en un dispositivo; si hace falta, memorizar `rankPalettes` por composición | S-M | Bajo | Perfil de rendimiento |
| CS-20 | P3 | [R] | `area-privada-color.js` | `aria-live` recreado en cada repintado | Posibles anuncios perdidos | Una región viva persistente en la raíz | S | Bajo | Prueba con VoiceOver o NVDA |
| CS-17 | P4 | [C] | `image.js` | Sin corrección del balance de blancos | Blancos y crudos confundidos | Consejo de captura y un cuentagotas sobre la foto (elegir el píxel a mano) | M | Bajo | Manual |
| CS-21 | P4 | — | `socks.js`, `cs_garments` | Faltan el estilo y largo del calcetín y la ocasión | Consejo menos contextual | Empezar leyendo la subcategoría; campos opcionales solo si hace falta (pedir permiso para el esquema) | M | Medio | Pruebas unitarias |
| CS-22 | P4 | — | `compose.js` | Las propuestas cambian una sola prenda | Exploración limitada | Combinaciones de 2 prendas con poda y análisis de «qué prenda me falta» | L | Medio | Pruebas unitarias |

## Estado de las correcciones

**Fase 1, hecha el 26-10-2026.** Cada corrección lleva una prueba que fallaba antes del cambio.

| ID | Qué se ha hecho |
|---|---|
| CS-01 | En la CI, cada suite de interfaz corre aunque falle la anterior (`if: ${{ !cancelled() }}`), así que Color Studio vuelve a probarse en remoto. La prueba intermitente del Centro de trabajo sigue pendiente: queda fuera del alcance de Color Studio. |
| CS-02 | Lo escrito en la guía solo cuenta al pulsar «Actualizar», solo afecta a la guía (con un aviso) y el Studio usa siempre el outfit. |
| CS-09 | Las reglas de continuidad describen el color que se propone de verdad. |
| CS-10 | «informal» se lee como calzado casual. |
| CS-11 | El contraste calculado prueba candidatos en orden y solo propone uno que cumpla la regla; si ninguno la cumple, lo explica. |
| CS-12 | El contraste se informa por separado frente al pantalón y frente al calzado. |
| CS-14 | A 320 px la etiqueta de rol baja de línea en vez de cortar el nombre. |
| CS-15 | En pantallas táctiles o estrechas, los controles miden 44 px; los desplegables conservan su triángulo. |
| CS-18 | Pruebas con los 34 pares de CIEDE2000, referencias sRGB, ida y vuelta, y regresiones de esta fase. |

## 12. Roadmap

1. **Inmediato** (pequeño, localizado, reversible): CS-01 (solo separar los pasos de la CI), CS-02, CS-09, CS-10, CS-11, CS-12, CS-14, CS-15 y CS-18.
2. **Precisión cromática**: CS-03, CS-04, CS-08, CS-16 y CS-07, cada uno con sus casos de prueba antes de cambiar la lógica.
3. **Arquitectura y UX** (necesitan permiso):
   - CS-05: cambia la herramienta de versiones.
   - CS-06: reorganiza el Studio en móvil.
   - CS-13: cambia el formato guardado en `cs_outfits.items`.
4. **Evolución del producto**: CS-17, CS-21 y CS-22.

Fuera del alcance de Color Studio, pero bloquea su CI: la prueba intermitente de `tools/check-kanban.mjs` («con filtro activo, soltar entre dos visibles respeta el orden real»).
