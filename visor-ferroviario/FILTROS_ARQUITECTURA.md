# Arquitectura de datos de los filtros del atlas ferroviario

Diseño, 26-11-2026. Parte de la auditoría de los filtros del mismo día. Todavía no está implementado.

## 1. Problema que resuelve

Hoy hay **tres clasificaciones distintas** de lo mismo:

| Dónde | Archivo | Categorías |
|---|---|---|
| Mapa, tema «Servicios» | `capas-config.js` → `services` | 7 propias: Alvia, Euromed, «Alta velocidad comercial», Regional, Avant, «Cercanías de ancho métrico» y «Convencional diurno» |
| Mapa, tema «Marcas» | `capas-config.js` → `brands` | AVE, Avlo, iryo y OUIGO |
| Tabla «Rutas» | `tools/build-rutas.mjs` → `FAMILY`/`BRAND` | 5 familias: Alta velocidad, Avant, Intercity, Regional y Cercanías |

Consecuencias, medidas con los datos del corte del 16-11-2026:
- **Alvia se cuenta dos veces.** Sus 39 relaciones están también entre las 114 de «Convencional diurno».
- **Las Cercanías de ancho métrico están en dos temas.** Asturias C4–C8, Bilbao C4–C5, Cantabria C2–C3 y otras aparecen en «Servicios» y en «Cercanías y redes urbanas».
- **El mapa y la tabla usan fuentes distintas** para Cercanías (una réplica de Open Data Euskadi y el GTFS oficial) y **cortes distintos** (16-11 y 22-11). Por eso sus cifras no pueden cuadrar.
- **Hay dos taxonomías de corredor.** El mapa usa 5 corredores propios sacados de Hermes y la tabla usa los 5 de la CNMC. A los primeros les faltan Madrid–Toledo, Zaragoza–Huesca y Plasencia–Badajoz.
- **No existen como dimensión** el régimen (servicio público u OSP frente a comercial) ni el ámbito (nacional frente a internacional).

## 2. Principios

1. **Un solo diccionario.** Un único archivo define ids, nombres, alias, orden, colores y jerarquía. Lo leen el mapa, la tabla y los scripts de generación.
2. **Dos granos, nunca mezclados.**
   - **Servicio**: lo que circula. Una fila es una relación origen-destino de una marca.
   - **Tramo**: la vía. Una fila es un tramo del IGN.
   - Cada filtro pertenece a un solo grano. El único puente entre los dos es el **eje**, que comparten ambos.
3. **Cada servicio tiene un valor por dimensión.** La excepción es el eje, que admite varios valores: una ruta puede recorrer dos ejes.
4. **Cifras reconciliables.** El mapa y la tabla salen de las mismas fuentes y el mismo corte. La suma por familia es igual al total.
5. **Lo oficial se distingue de lo deducido.** Cada valor dice de dónde sale. Los nombres antiguos se conservan como alias para la búsqueda, no como categorías.

## 3. Modelo

Es un esquema en estrella: dos tablas de hechos (servicios y tramos) y dimensiones compartidas.

```
                  ┌────────────┐
                  │  operador  │
                  └─────┬──────┘
┌──────────┐   ┌────────┴────────┐   ┌──────────┐
│ familia  │◄──┤     marca       │   │ régimen  │ (derivado de marca + núcleo)
└──────────┘   └────────┬────────┘   └────┬─────┘
                        │                 │
                 ┌──────┴─────────────────┴──┐       ┌────────┐
                 │   SERVICIO (relación)     ├──────►│ ámbito │
                 │ id, origen, destino,      │       └────────┘
                 │ trenes/día, vigencia,     ├──────►┌────────────────┐
                 │ calidad, tramos[]         │       │ núcleo · línea │ (solo Cercanías)
                 └──────┬────────────────────┘       └────────────────┘
                        │ ejes[] (por km recorridos)
                 ┌──────┴──────┐
                 │     eje     │◄──────────┐
                 └─────────────┘           │ eje
                                    ┌──────┴────────────────────────┐
                                    │ TRAMO IGN                     │
                                    │ ancho, electrificación, vías, │
                                    │ prestaciones, titularidad,    │
                                    │ estado, TEN-T                 │
                                    └───────────────────────────────┘
```

### 3.1 Dimensiones del grano servicio

| Dimensión | Valores | Regla | Fuente |
|---|---|---|---|
| `operador` | `renfe`, `ouigo`, `iryo` | Lo da el GTFS o el PDF de cada operador | GTFS de Renfe, PDF de OUIGO, GTFS comunitario de iryo |
| `familia` | `av` (Alta velocidad), `ld-md` (Distancias largas y medias), `metro` (Movilidad metropolitana), `turismo` (Experiencias turísticas) | Se deriva de la marca. Las tres primeras son las familias de Renfe (trenes.renfe.com). `turismo` queda fuera de esa arquitectura y se dice así | trenes.renfe.com, consultado el 26-11-2026 |
| `marca` | AV: `ave`, `ave-euromed`, `avlo`, `avant`, `ouigo`, `iryo`. LD-MD: `intercity`, `regional`. Metro: `cercanias`. Turismo: `lujo`, `tematico` | `route_short_name` del GTFS, normalizado con la tabla de alias | GTFS |
| `regimen` | `osp-age`, `osp-generalitat`, `osp-ccaa` (con `titular`), `comercial-plazas-osp`, `comercial` | Estado: Cercanías (salvo Rodalies), Regional y Avant. Generalitat: Rodalies R1–R8 y regionales R11–R17, RG1, RL y RT. Comunidad: Extremadura (Cáceres–Valencia de Alcántara, Llerena–Mérida, Plasencia–Cáceres, Zafra–Mérida) y Aragón (Caspe–Fayón, Zaragoza–Binéfar 06:10). `comercial-plazas-osp`: trenes AVE o Intercity con plazas para abonos Avant (Madrid–Salamanca, Madrid–Cuenca–Albacete, Zaragoza–Huesca…), desde una tabla de relaciones del diccionario. Los convenios que solo cofinancian (País Vasco en Alsasua–Miranda, Castilla y León en los Avant) van en el atributo `cofinanciacion` | La Moncloa (14-12-2018), RDL 45/2026 (BOE, 25-11-2026), RD 1598/2010, juntaex.es (29-07-2025), aragonhoy.es (14-03-2024), BOE-A-2025-15718 |
| `ambito` | `nacional`, `internacional-fr`, `internacional-pt` | Si alguna parada está fuera de España | GTFS: AVE Francia (Lyon, Marsella) e Intercity Vigo–Oporto |
| `nucleo` y `linea` | Los 15 núcleos de renfe.com/cercanias y sus líneas (C1, R2N…) | Solo cuando la familia es `metro`. El ancho métrico pasa a ser un **atributo de la línea** (`ancho_red`), no una categoría | GTFS oficial `fomento_transit.zip` |
| `ejes[]` | Ver 3.3 | Ejes por los que la ruta recorre al menos el 20 % de sus km. Ese umbral está por validar | Tramos de la ruta cruzados con `ejes.json` |
| `vigencia` | `vigente`, `futura`, `sin-oferta` | Fechas del calendario frente al corte. Es la regla actual de `capas.js` | GTFS |
| `calidad` | `oficial`, `reconstruido`, `comunitario`, `sin-trazado` | Procedencia del horario y del trazado. iryo es `comunitario` | `meta.sources` |

Atributos que no son filtros pero sí entran en la búsqueda y en las fichas:
- `alias`: Alvia (trenes de la serie 04xxx), Euromed, Media Distancia, Regional Exprés, Proximidad y Avant Exprés.
- Número de tren, trenes por día, duración y paradas.

### 3.2 Dimensiones del grano tramo

| Dimensión | Valores | Cambio frente a hoy |
|---|---|---|
| `ancho` | Ibérico, estándar, métrico, mixto, sin determinar | Ninguno: ya lo calcula `filtros.js` con `capas/ancho.json` |
| `electrificacion` | Sí, no, sin dato | Ninguno |
| `vias` | 1, 2, 4, sin dato | Ninguno |
| `prestaciones` | AV, convencional, sin determinar | **Ahora se puede filtrar** (hoy solo colorea) |
| `titularidad` | Adif, Adif AV, autoridades portuarias, LFP, FGC, FGV, ETS, metros, particulares, otros | **Ahora se puede filtrar** |
| `estado` | En servicio, en construcción, en proyecto | Un solo nombre en todo el visor. Desaparecen «Planificado» y «En obras» |
| `tent` | Atlántico, Mediterráneo, ninguno | Pasa de ser un tema a ser una dimensión |
| `eje` | Ver 3.3 | Pasa a ser una dimensión |

### 3.3 Ejes: la única taxonomía de corredor

Sustituye a los 5 «corredores de alta velocidad» y se aplica a todas las familias salvo Cercanías.

| id | Eje | Incluye | Corredor CNMC |
|---|---|---|---|
| `noreste` | Madrid–Zaragoza–Barcelona–Francia | Huesca, Lleida, Girona, Figueres–Perpiñán | Madrid-Barcelona |
| `levante` | Madrid–Levante | Cuenca, València, Albacete, Alicante, Elche, Murcia | Madrid-Valencia y Madrid-Alicante |
| `sur` | Madrid–Andalucía | Toledo, Ciudad Real, Puertollano, Córdoba, Sevilla, Málaga, Antequera, Granada | Madrid-Sevilla y Madrid-Málaga/Granada |
| `norte` | Madrid–Norte y Noroeste | Segovia, Valladolid, León, Asturias, Palencia, Burgos, País Vasco, Cantabria, Zamora y Galicia | — |
| `extremadura` | Madrid–Extremadura | Talavera, Plasencia, Cáceres, Mérida, Badajoz | — |
| `mediterraneo` | Corredor litoral | Portbou/Barcelona–Tarragona–Castelló–València–Alicante–Murcia–Almería | — |
| `otros` | Resto de la red convencional | Transversales sin eje dominante | — |

**Por qué no uso la taxonomía de la CNMC.** En la auditoría recomendé la de la CNMC, pero al revisar `capas/cnmc.json` cambio de criterio: la CNMC solo publica **5 corredores de alta velocidad con origen en Madrid**. Con ella quedarían fuera Galicia, el Norte, Extremadura, el litoral y toda la red Regional e Intercity. Por eso la CNMC queda como **columna de equivalencia** (`cnmc`), que es lo que la tabla Rutas necesita para cruzar viajeros y cuotas.

**De dónde sale el eje.**
- `ejes.json` asigna cada tramo del IGN a un eje.
- Se genera cruzando los tramos de Hermes con `lineas-adif.json` (Adif, que sí incluye Toledo, Huesca y Badajoz), a menos de 150 m. Es el mismo método que ya usa `oferta.js` (`nearestEdge`).
- Lo que quede sin asignar se revisa a mano en una lista corta dentro del propio archivo.

## 4. Archivos

| Archivo | Contenido | Estado |
|---|---|---|
| `visor-ferroviario/taxonomia.js` (UMD, como `filtros.js`) | Diccionario: dimensiones, valores, nombres, alias, orden, color, padre, regla y fuente con fecha | Nuevo. Sustituye a `services`, `brands`, `corridors` y `status` de `capas-config.js`, y a `FAMILY`/`BRAND`/`COMPANY` de `build-rutas.mjs` |
| `capas/ejes.json` | `{eje: [ids de tramos IGN]}`, más `meta` con método y fecha | Nuevo |
| `capas/servicios.json` | Cada variante lleva un bloque `d: {op, fam, marca, reg, amb, nuc, lin, ejes, vig, cal}` con ids del diccionario | Cambia. Durante una versión conviven `categories` y `brand` para no romper enlaces |
| `capas/rutas.json` | Las mismas claves `d` y los mismos ids que `servicios.json` | Cambia. `fam` y `marca` pasan a ser ids |
| `datos.json` (tramos) | Se añaden `eje` y `tent`. `perf` y `net` ya existen | Cambia |
| `transit-catalog.json` | Solo Metro y Metro Ligero (operadores no Renfe). Las Cercanías salen del GTFS oficial dentro de `servicios.json` | Se reduce |

Ejemplo de variante:

```json
{"id":"renfe-national:04e3279d3654704e","origin":"Barcelona-Sants","destination":"Lyon Part Dieu",
 "d":{"op":"renfe","fam":"av","marca":"ave","reg":"comercial","amb":"internacional-fr",
      "nuc":null,"lin":null,"ejes":["noreste"],"vig":"vigente","cal":"oficial"},
 "alias":[],"trips":4,"numbers":["09737"],"validity":{"from":"2026-11-15","to":"2027-01-24"}}
```

Extracto del diccionario:

```js
marca: [
  {id:'ave',         name:'AVE',         fam:'av', op:'renfe', reg:'comercial', color:'#4B1F6F'},
  {id:'ave-euromed', name:'AVE Euromed', fam:'av', op:'renfe', reg:'comercial', alias:['Euromed'],
   nota:'Nombre provisional hasta el fin de las obras del corredor (2027)'},
  {id:'intercity',   name:'Intercity',   fam:'ld-md', op:'renfe', reg:'comercial', alias:['Alvia']},
  {id:'regional',    name:'Regional',    fam:'ld-md', op:'renfe', reg:'osp-age',
   alias:['Media Distancia','Regional Exprés','Proximidad']},
  {id:'cercanias',   name:'Cercanías',   fam:'metro', op:'renfe', reg:'osp-age', alias:['Rodalies']},
  …
]
```

## 5. Cómo queda el panel

Los temas de «Vías» pasan de 8 a 4. Cada grupo de casillas muestra su recuento y se recalcula con los demás filtros, como ya hace hoy el tema «Ancho de vía».

| Tema nuevo | Grupos de filtros | Sustituye a |
|---|---|---|
| **Servicios** (grano servicio) | Operador · Familia → Marca (anidada) · Régimen · Ámbito · Eje · Núcleo → Línea (solo si Cercanías está marcada) · Vigencia | Marcas y operadores, Servicios, Cercanías (parte de Renfe) y Trenes turísticos |
| **Infraestructura** (grano tramo) | Eje · Estado · Prestaciones · Titularidad · Ancho · Electrificación · Vías · TEN-T, más «Colorear por» | Corredores de alta velocidad, Todas las vías, Ancho de vía y Corredores TEN-T |
| **Redes urbanas** | Metro y Metro Ligero de Madrid | Cercanías y redes urbanas (parte no Renfe) |
| **Población** | Sin cambios | — |

**Decisión: qué se ve de partida.** Están todas las familias marcadas. Así la primera vista es la red completa y deja de faltar Intercity, como ocurre hoy. Para no saturar el mapa, las líneas de Cercanías se dibujan desde el zoom 8.

**Enlaces antiguos.** `view-state` traduce los temas antiguos al tema nuevo con sus filtros:

| Tema antiguo | Tema nuevo y filtro |
|---|---|
| `brands` | Servicios + `marca` |
| `services` | Servicios + `marca` (`day`/`alvia` → `intercity`, `highspeed` → ave+avlo+ouigo+iryo, `md-conventional` → `regional`, `commuter-metric` → `cercanias` con `ancho_red=1000`) |
| `corridors` | Infraestructura + `eje` + `estado` |
| `all` | Infraestructura + «Colorear por» |
| `gauge` | Infraestructura |
| `tent` | Infraestructura + `tent` |
| `transit` | Redes urbanas, o Servicios + Cercanías según la línea |

## 6. Comprobaciones nuevas (`tools/check-taxonomia.mjs`)

1. Todo id que aparezca en `servicios.json`, `rutas.json`, `datos.json` y `ejes.json` existe en el diccionario.
2. La familia de cada variante es la de su marca: no hay doble pertenencia.
3. Cada línea de Cercanías aparece una sola vez (núcleo + línea únicos).
4. La suma de rutas por familia es igual al total, y lo mismo por régimen y por ámbito.
5. `servicios.json` y `rutas.json` tienen el mismo corte y el mismo número de relaciones por marca.
6. Ningún tramo en servicio con trenes de alta velocidad programados queda sin eje.
7. Ningún nombre de categoría está escrito a mano fuera de `taxonomia.js`. Se comprueba con grep sobre los JS del visor.

## 7. Orden de implantación

1. `taxonomia.js` y `check-taxonomia.mjs` (puntos 1 a 4), sin cambiar la interfaz.
2. Los generadores escriben `d` en `servicios.json` y `rutas.json` con el mismo corte, y las Cercanías pasan al GTFS oficial.
3. `ejes.json` y `eje`/`tent` en `datos.json`.
4. Panel con los 4 temas y traducción de los enlaces antiguos.
5. Se retiran `categories`, `brand` y las listas de `capas-config.js`.

## 8. Pendientes: estado a 26-11-2026

- **Régimen de servicio público:** resuelto. Ver la fila `regimen` de 3.1. Falta una lista oficial línea a línea de los regionales catalanes; hasta tenerla se aplica el criterio del RD 1598/2010 (íntegramente en Cataluña).
- **Avant Madrid–Salamanca y Madrid–Cuenca:** existen como servicio OSP sobre trenes Intercity (Salamanca) y AVE (Cuenca), con «solo títulos multiviaje» (renfe.com; RDL 45/2026). No son marca Avant en el GTFS: se marcan con `comercial-plazas-osp`, sin excepciones en la marca.
- **Madrid–Andalucía:** cortada desde el 28-10-2026 sin fecha de reapertura (Adif, 05-11-2026); OUIGO e iryo tienen cancelaciones publicadas hasta el 03-12-2026. Las notas del visor («hasta el 29-11») están desactualizadas. Propuesta: tabla `incidencias` (tramo, fechas, fuente) que marque las relaciones con `vigencia = suspendida`.
- **iryo:** sigue como `comunitario`. Antequera sin confirmar (Adif solo muestra trenes de Renfe allí). La CNMC tiene comunicada una relación Barcelona–Tarragona–Lleida que el visor no recoge: confirmar con la oferta comercial antes de añadirla.
- **Umbral del 20 % para los ejes:** no se puede validar sin `capas/ejes.json` (paso 3). `lineas-adif.json` solo enlaza 11.436 tramos con su línea de Adif. Casos de prueba: Barcelona–Vigo, Lleida–Vigo, Valladolid–Alicante, Valladolid–Murcia, Madrid–Badajoz, Zaragoza–Sevilla y Albacete–Toledo.
