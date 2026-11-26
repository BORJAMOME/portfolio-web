# Arquitectura de datos de los filtros del atlas ferroviario

Diseño, versión 2 del 26-11-2026. Todavía no está implementado.
Incorpora el dossier «Red ferroviaria de España: filtros, oferta oficial y arquitectura de datos» (26-11-2026), el tema 5 del *Manual de ferrocarriles* (copia de estudio) y la revisión de la versión 1.

Marcas de verificación: **[V]** fuente oficial, **[P]** prensa o terceros, **[D]** deducción propia, **[C]** calculado con código sobre el repositorio.

## 1. Problema que resuelve

Hoy hay **tres clasificaciones distintas** de lo mismo:

| Dónde | Archivo | Categorías |
|---|---|---|
| Mapa, tema «Servicios» | `capas-config.js` → `services` | 7 propias: Alvia, Euromed, «Alta velocidad comercial», Regional, Avant, «Cercanías de ancho métrico» y «Convencional diurno» |
| Mapa, tema «Marcas» | `capas-config.js` → `brands` | AVE, Avlo, iryo y OUIGO |
| Tabla «Rutas» | `tools/build-rutas.mjs` → `FAMILY`/`BRAND` | 5 familias: Alta velocidad, Avant, Intercity, Regional y Cercanías |

Consecuencias, con los datos del corte del 16-11-2026 [C]:
- **Alvia se cuenta dos veces.** Sus 39 relaciones vigentes están también entre las 114 de «Convencional diurno».
- **Las Cercanías de ancho métrico están en dos temas.** Asturias C4–C8, Bilbao C4–C5, Cantabria C2–C3 y otras aparecen en «Servicios» y en «Cercanías y redes urbanas».
- **El mapa y la tabla usan fuentes, cortes y reglas de vigencia distintos.** Cercanías sale de una réplica de Open Data Euskadi en el mapa y del GTFS oficial en la tabla; los cortes son el 16-11 y el 22-11; el mapa excluye las relaciones futuras y la tabla no (al menos 10 de las 34 filas de OUIGO empiezan en diciembre o enero).
- **Hay dos taxonomías de corredor.** El mapa usa 5 corredores propios sacados de Hermes y la tabla los 5 de la CNMC. A los primeros les faltan Madrid–Toledo, Zaragoza–Huesca y Plasencia–Badajoz.
- **No existen como dimensión** el régimen (servicio público u OSP frente a comercial) ni el ámbito (nacional frente a internacional).
- **Las incidencias van en notas escritas a mano.** El día de referencia de la tabla (25-11-2026), con Madrid–Andalucía cortada desde el 28-10, la tabla cuenta 13 AVE y 5 iryo Madrid–Sevilla [C].

## 2. Principios

1. **Un solo diccionario.** Un único archivo define ids, nombres, alias, orden, colores, jerarquía, regla y fuente. Lo leen el mapa, la tabla y los scripts de generación.
2. **Dos granos, nunca mezclados.**
   - **Servicio**: lo que circula. Una fila es una **relación**: operador + marca publicada + origen + destino, **con sentido**. Es la clave `relation` que ya tiene `servicios.json` (735 relaciones, ninguna con dos marcas ni dos sentidos [C]) y la de `rutas.json` (`renfe|AVE|71801|60000`). Una relación tiene una o varias **variantes** (paradas y días); la variante es detalle, no grano.
   - **Tramo**: la vía. Una fila es un tramo del IGN.
   - Cada filtro pertenece a un solo grano. El único puente entre los dos es el **eje**.
3. **Cada servicio tiene un valor por dimensión.** La excepción es el eje, que admite varios valores en los dos granos.
4. **Cifras reconciliables.** El mapa y la tabla salen de las mismas fuentes, el mismo corte y la misma regla de vigencia. La suma por familia es igual al total.
5. **Lo oficial se distingue de lo deducido.** Cada valor dice de dónde sale. Los nombres antiguos se conservan como alias para la búsqueda, no como categorías.

**Relación vigente** (regla única para el mapa y la tabla): al menos una variante con `validity.to ≥ corte` y `validity.from < corte + 31 días`, y sin incidencia que la suspenda. Es la regla actual de `capas.js` (`CUTOFF`, `FUTURE_FROM`) más la tabla de incidencias. Con ella se reproducen las cifras del dossier: Intercity 114, Regional 341, AVE 82, Avlo 24, OUIGO 11 [C].

## 3. Modelo

Esquema en estrella: dos tablas de hechos (relaciones y tramos) y dimensiones compartidas.

```
                  ┌────────────┐
                  │  operador  │
                  └─────┬──────┘
┌──────────┐   ┌────────┴────────┐   ┌──────────┐
│ familia  │◄──┤     marca       │   │ régimen  │ (de la marca, con excepciones por relación)
└──────────┘   └────────┬────────┘   └────┬─────┘
                        │                 │
                 ┌──────┴─────────────────┴──┐       ┌────────┐
                 │   RELACIÓN (con sentido)  ├──────►│ ámbito │
                 │ operador, marca, origen,  │       └────────┘
                 │ destino, trenes/día,      ├──────►┌────────────────┐
                 │ vigencia, calidad,        │       │ núcleo · línea │ (solo Cercanías)
                 │ variantes[] → tramos[]    │       └────────────────┘
                 └──────┬────────────────────┘
                        │ ejes[] (por km recorridos)        ┌────────────┐
                 ┌──────┴──────┐        ┌─────────────┐     │ incidencia │ (tramo, fechas, fuente)
                 │ eje lectura │◄───────┤  eje RFIG   │     └─────┬──────┘
                 └──────┬──────┘        └──────┬──────┘           │
                        │                      │ línea Adif       │
                 ┌──────┴──────────────────────┴─────────┐        │
                 │ TRAMO IGN                             │◄───────┘
                 │ ancho, electrificación, vías,         │
                 │ prestaciones, titularidad, estado,    │
                 │ TEN-T, línea Adif                     │
                 └───────────────────────────────────────┘
```

### 3.1 Dimensiones del grano servicio

| Dimensión | Valores | Regla | Fuente |
|---|---|---|---|
| `operador` | `renfe`, `ouigo`, `iryo` | Lo da cada fuente | GTFS de Renfe, PDF de OUIGO, GTFS comunitario de iryo |
| `familia` | `av` (Alta velocidad), `ld-md` (Distancias largas y medias), `metro` (Movilidad metropolitana), `turismo` (Experiencias turísticas) | Se deriva de la marca. Las tres primeras son las familias de Renfe; `turismo` queda fuera de esa arquitectura y se dice así. **Avant pasa a `av`**, como en Renfe; hoy la tabla Rutas la tiene como familia propia y cambia | [V] trenes.renfe.com, 26-11-2026 |
| `marca` | AV: `ave`, `ave-euromed`, `avlo`, `avant`, `ouigo`, `iryo`. LD-MD: `intercity`, `regional`. Metro: `cercanias`. Turismo: `lujo`, `tematico` | `route_short_name` del GTFS, normalizado con la tabla de alias. Avant Exprés es alias de `avant` | GTFS |
| `regimen` | `osp-age`, `osp-generalitat`, `osp-ccaa`, `comercial-plazas-osp`, `comercial` | Valor por defecto en la marca; la tabla `osp_relaciones` del diccionario lo sobrescribe por relación (ver 3.4). La variante guarda el valor final en `d.reg` | Ver 3.4 |
| `cofinanciacion` | Lista de convenios | Atributo, no filtro: convenios que solo cofinancian o bonifican y no cambian el régimen | [V] BOE-A-2025-15718 (ver 8); [V] renfe.com, abonos de Castilla y León |
| `ambito` | `nacional`, `internacional-fr`, `internacional-pt` | Si alguna parada está fuera de España | GTFS: AVE Francia (Lyon, Marsella); Intercity Vigo–Oporto |
| `nucleo` y `linea` | Los 15 núcleos de renfe.com/cercanias y sus líneas (C1, R2N…) | Solo con familia `metro`. El ancho métrico es un **atributo de la línea** (`ancho_red`), no una categoría | GTFS oficial `fomento_transit.zip` |
| `ejes[]` | Ejes de lectura (3.3) | Ejes por los que la relación recorre al menos el 20 % de sus km. Umbral por validar | Tramos de las variantes cruzados con `ejes.json` |
| `vigencia` | `vigente`, `futura`, `sin-oferta`, `suspendida` | Regla de relación vigente (2). `suspendida` si todas sus variantes pasan por un tramo con incidencia activa al corte | Calendario del GTFS y `cortes.json` |
| `calidad` | `oficial`, `reconstruido`, `comunitario`, `sin-trazado` | Procedencia del horario y del trazado. iryo: horario `comunitario`; relaciones sin trazado dibujable, `sin-trazado` | `meta.sources` |

Atributos que no son filtros pero entran en la búsqueda y en las fichas:
- `alias`: Alvia (trenes de la serie 04xxx), Euromed, Media Distancia, Regional Exprés, Proximidad y Avant Exprés.
- Número de tren, trenes por día, duración y paradas.
- `confirmacion` (solo iryo): `web` si la relación aparece en las páginas de destinos de iryo.eu (copia manual del 26-11-2026), `sin-confirmar` si no. Barcelona–Sevilla y Barcelona–Málaga quedan `sin-confirmar`; Lleida y Antequera no se añaden.

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
| `linea_adif` | Código de 5 cifras del catálogo de la RFIG (`02100`…) | Nuevo. Hoy solo lo tienen los 11.436 tramos de `lineas-adif.json → relleno` [C] |
| `eje_rfig` | Los 12 ejes oficiales (3.3) | Nuevo. Son las dos primeras cifras de `linea_adif` |
| `ejes[]` | Ejes de lectura (3.3) | Nuevo. **Varios valores**: hay tramos compartidos de verdad, como Monforte–Alicante (Levante y Mediterráneo) |

### 3.3 Ejes: catálogo oficial y ejes de lectura

**Cambio frente a la versión 1.** La versión 1 inventaba 7 ejes y los asignaba por proximidad a menos de 150 m. El Ministerio publica en el BOE un **catálogo de líneas y tramos de la RFIG** estructurado en ejes con código de 2 cifras, y Adif designa cada línea con ese código más 3 cifras (*Manual de ferrocarriles*, tema 5.3.2). `lineas-adif.json` ya usa esos códigos: 326 líneas en los ejes 01–06, 08 y 11–16 [C]. Así que el eje sale del código de la línea, no de la geometría.

Dos niveles, como una jerarquía eje → línea:

**Eje RFIG** (oficial, se filtra en «Infraestructura»):

| Código | Eje | Eje de lectura por defecto |
|---|---|---|
| 01 | Madrid Chamartín–Irún/Hendaya | `norte` |
| 02 | Madrid Chamartín–Zaragoza–Lleida–Barcelona–Portbou/Cerbère | `noreste` |
| 03 | Madrid Chamartín–Valencia–San Vicente de Calders | `levante`; las líneas del litoral, `mediterraneo` |
| 04 | Alcázar de San Juan–Córdoba–Sevilla–Cádiz | `sur` |
| 05 | Madrid Atocha–Cáceres–Valencia de Alcántara | `extremadura` |
| 06 | Venta de Baños–León–Ourense–Vigo | `norte` |
| 08 | Red de ancho métrico (excepto Cercedilla–Los Cotos) | `norte` |
| 11 | Madrid Chamartín–Valladolid (AV) | `norte` |
| 12 | Madrid Atocha–Barcelona–frontera francesa (AV) | `noreste` |
| 13 | Madrid Atocha–Levante (AV) | `levante` |
| 14 | Madrid Atocha–Toledo/Sevilla/Málaga (AV) | `sur` |
| 15 | Sin identificar: el manual no lo recoge y `lineas-adif.json` tiene 3 líneas con ese código | Por decidir (ver 8) |
| 16 | Olmedo–Medina–Zamora–Ourense–Santiago (AV) | `norte` |

**Eje de lectura** (7 propios, se filtra en «Servicios» e «Infraestructura»): `noreste`, `levante`, `sur`, `norte`, `extremadura`, `mediterraneo` y `otros`. Cada uno es un conjunto de ejes RFIG con **excepciones por línea** escritas en el diccionario (el corredor litoral cruza varios ejes RFIG). Cada eje de lectura lleva su equivalencia CNMC:

| Eje de lectura | Corredor CNMC |
|---|---|
| `noreste` | Madrid–Barcelona |
| `levante` | Madrid–Valencia y Madrid–Alicante |
| `sur` | Madrid–Sevilla y Madrid–Málaga/Granada |
| `norte`, `extremadura`, `mediterraneo`, `otros` | — |

**Por qué no la taxonomía de la CNMC.** Solo publica 5 corredores de alta velocidad con origen en Madrid; dejaría fuera Galicia, el Norte, Extremadura, el litoral y toda la red Regional e Intercity. Queda como columna de equivalencia, que es lo que la tabla Rutas necesita para cruzar viajeros y cuotas.

**De dónde sale `linea_adif` en los tramos que no la tienen.** Los 11.436 tramos de `relleno` la traen ya. Para el resto hace falta un cruce nuevo de **línea a tramo**: cada línea de Adif (geometría de la capa WFS que cita `lineas-adif.json`) contra los tramos del IGN. `nearestEdge` de `oferta.js` no sirve: busca el tramo de ancho estándar más cercano a un **punto**. Si el cruce no cubre la red, el plan B es asignar ejes de lectura por las estaciones de paso de cada relación, marcado [D].

### 3.4 Régimen de servicio público

| Valor | Significado | Ejemplos | Fuente |
|---|---|---|---|
| `osp-age` | Contrato del Estado con Renfe Viajeros (2018–2027) | Cercanías (salvo Rodalies), Regional, Avant, Zaragoza–Canfranc | [V] La Moncloa, 14-12-2018; RDL 45/2026 (BOE, 25-11-2026); CNMC STP/DTSP/008/26 |
| `osp-generalitat` | Titularidad de la Generalitat de Catalunya | Rodalies R1–R8; regionales R11–R17, RG1, RL3, RL4, RT1, RT2 | [V] RD 2034/2009 y RD 1598/2010. Sin lista oficial línea a línea: se aplica «íntegramente en Cataluña», marcado [D] |
| `osp-ccaa` (con `titular`) | Contrato con una comunidad | Extremadura: Cáceres–Valencia de Alcántara, Llerena–Mérida, Plasencia–Cáceres, Zafra–Mérida. Aragón: Caspe–Fayón y Zaragoza–Binéfar de las 06:10 y su vuelta | [V] juntaex.es; [V] aragonhoy.es, 14-03-2024 |
| `comercial-plazas-osp` | Tren comercial con plazas para abonos Avant | Intercity Madrid–Salamanca, AVE Madrid–Cuenca–Albacete, Zaragoza–Huesca, Valladolid–León y Palencia | [V] renfe.com, trenes Avant y Regional |
| `comercial` | Sin servicio público | AVE, Avlo, Intercity, AVE Euromed, AVE Francia, OUIGO, iryo | [D] por exclusión |

`osp_relaciones` es una tabla del diccionario: `{origen, destino, regimen, titular?, titulo_admitido?, fuente, fecha}`. No se crean excepciones en la marca: Madrid–Salamanca sigue siendo Intercity y Madrid–Cuenca, AVE.

### 3.5 Incidencias

`capas/cortes.json` (el nombre `incidencias.json` ya lo usan los avisos de Cercanías de Cabina): `{id, nombre, desde, hasta|null, entre: [[estaciones de un lado], [del otro]], aplicar, fuente, ver}`. Una relación vigente que pasa por estaciones de los dos lados de un corte con `aplicar: true` queda `suspendida`. Con `aplicar: false` el corte se documenta sin cambiar nada, mientras los horarios publicados sigan trayendo trenes. Se aplica a las dos tablas con la misma regla y sustituye a las notas escritas a mano en `capas.js`. Primera entrada: Madrid–Andalucía entre Mora, Orgaz y Urda, desde el 28-10-2026, sin fecha de reapertura ([V] Adif, 05-11-2026).

## 4. Archivos

| Archivo | Contenido | Estado |
|---|---|---|
| `visor-ferroviario/taxonomia.js` (UMD, como `filtros.js`) | Diccionario: dimensiones, valores, nombres, alias, orden, color, padre, regla y fuente con fecha; `ejes_rfig`, `ejes_lectura` con excepciones por línea y `osp_relaciones` | Nuevo. Sustituye a `services`, `brands`, `corridors` y `status` de `capas-config.js`, y a `FAMILY`/`BRAND`/`COMPANY` de `build-rutas.mjs` |
| `capas/ejes.json` | `{tramo: {linea_adif, eje_rfig, ejes[]}}`, más `meta` con método, cobertura y fecha | Nuevo |
| `capas/cortes.json` | Ver 3.5 | Nuevo (fase 2). Madrid–Andalucía con `aplicar: false` |
| `capas/servicios.json` | Cada variante lleva un bloque `tx: {op, fam, marca, reg, amb, nuc, lin, ejes, vig, cal}` con ids del diccionario. Se llama `tx` y no `d` porque en `rutas.json` `d` ya es la estación de destino. Lo escribe `tools/visor/anotar-taxonomia.mjs` | Cambia. Durante una versión conviven `categories` y `brand` para no romper enlaces |
| `capas/cercanias.json` | Cercanías de todos los núcleos desde el GTFS oficial, con el mismo bloque `tx` | Nuevo. Se carga solo al marcar Cercanías, para no inflar `servicios.json` (4,8 MB) |
| `capas/rutas.json` | El mismo bloque `tx`, los mismos ids, el mismo corte y la misma regla de vigencia | Cambia. `fam` y `marca` pasan a ser ids |
| `datos.json` (tramos) | Se añaden `linea_adif`, `eje_rfig`, `ejes` y `tent`. `perf` y `net` ya existen | Cambia |
| `transit-catalog.json` | Solo Metro y Metro Ligero (operadores no Renfe) | Se reduce |

Ejemplo de variante:

```json
{"id":"renfe-national:04e3279d3654704e","relation":"rel:…","origin":"Barcelona-Sants","destination":"Lyon Part Dieu",
 "tx":{"op":"renfe","fam":"av","marca":"ave","reg":"comercial","amb":"internacional-fr",
      "nuc":null,"lin":null,"ejes":["noreste"],"vig":"vigente","cal":"oficial"},
 "alias":[],"trips":4,"numbers":["09737"],"validity":{"from":"2026-11-15","to":"2027-01-24"}}
```

Extracto del diccionario:

```js
marca: [
  {id:'ave',         name:'AVE',         fam:'av',    op:'renfe', reg:'comercial', color:'#4B1F6F'},
  {id:'ave-euromed', name:'AVE Euromed', fam:'av',    op:'renfe', reg:'comercial', alias:['Euromed'],
   nota:'Nombre provisional hasta el fin de las obras del corredor (2027)'},
  {id:'avant',       name:'Avant',       fam:'av',    op:'renfe', reg:'osp-age',   alias:['Avant Exprés']},
  {id:'intercity',   name:'Intercity',   fam:'ld-md', op:'renfe', reg:'comercial', alias:['Alvia']},
  {id:'regional',    name:'Regional',    fam:'ld-md', op:'renfe', reg:'osp-age',
   alias:['Media Distancia','Regional Exprés','Proximidad']},
  {id:'cercanias',   name:'Cercanías',   fam:'metro', op:'renfe', reg:'osp-age', alias:['Rodalies']},
  …
],
osp_relaciones: [
  {origen:'Madrid', destino:'Salamanca', regimen:'comercial-plazas-osp', titulo_admitido:'multiviaje',
   fuente:'renfe.com, trenes Avant y Regional', fecha:'2026-11-26'},
  …
]
```

## 5. Cómo queda el panel

Los temas de «Vías» pasan de 8 a 4. Cada grupo de casillas muestra su recuento y se recalcula con los demás filtros, como ya hace hoy el tema «Ancho de vía».

| Tema nuevo | Grupos de filtros | Sustituye a |
|---|---|---|
| **Servicios** (grano servicio) | Operador · Familia → Marca (anidada) · Régimen · Ámbito · Eje de lectura · Núcleo → Línea (solo si Cercanías está marcada) · Vigencia | Marcas y operadores, Servicios, Cercanías (parte de Renfe) y Trenes turísticos |
| **Infraestructura** (grano tramo) | Eje de lectura → Eje RFIG → Línea · Estado · Prestaciones · Titularidad · Ancho · Electrificación · Vías · TEN-T, más «Colorear por» | Corredores de alta velocidad, Todas las vías, Ancho de vía y Corredores TEN-T |
| **Redes urbanas** | Metro y Metro Ligero de Madrid | Cercanías y redes urbanas (parte no Renfe) |
| **Población** | Sin cambios | — |

**Recuento por eje.** Como una relación puede tener varios ejes, el grupo «Eje» se rotula «Rutas que pasan por el eje» y no muestra suma: no cuadra con el total por construcción.

**Qué se ve de partida.** Todas las familias marcadas, para que la primera vista sea la red completa y deje de faltar Intercity. Las líneas de Cercanías se cargan al marcarlas y se dibujan desde el zoom 8.

**Enlaces antiguos.** `view-state` traduce los temas antiguos al tema nuevo con sus filtros:

| Tema antiguo | Tema nuevo y filtro |
|---|---|
| `brands` | Servicios + `marca` |
| `services` | Servicios + `marca` (`day`/`alvia` → `intercity`, `euromed` → `ave-euromed`, `highspeed` → ave+avlo+ouigo+iryo, `md-conventional` → `regional`, `avant` → `avant`, `commuter-metric` → `cercanias` con `ancho_red=1000`) |
| `corridors` | Infraestructura + eje de lectura + `estado` |
| `all` | Infraestructura + «Colorear por» |
| `gauge` | Infraestructura |
| `tent` | Infraestructura + `tent` |
| `tourism` | Servicios + familia `turismo` |
| `transit` | Línea de un núcleo de Renfe → Servicios + Cercanías + esa línea. Línea de Metro o Metro Ligero → Redes urbanas. Sin línea → Redes urbanas |

## 6. Comprobaciones nuevas (`tools/check-taxonomia.mjs`)

1. Todo id que aparezca en `servicios.json`, `cercanias.json`, `rutas.json`, `datos.json`, `ejes.json` y `cortes.json` existe en el diccionario.
2. La familia de cada variante es la de su marca: no hay doble pertenencia.
3. Cada línea de Cercanías aparece una sola vez (núcleo + línea únicos).
4. La suma de relaciones por familia es igual al total, y lo mismo por régimen y por ámbito.
5. El mapa y la tabla tienen el mismo corte, la misma regla de vigencia y el mismo número de relaciones vigentes por marca. iryo queda fuera mientras su trazado sea `sin-trazado`.
6. Ningún tramo en servicio con trenes de alta velocidad programados queda sin eje.
7. Ningún nombre de categoría está escrito a mano fuera de `taxonomia.js`. Se comprueba con grep sobre los JS del visor.
8. El `eje_rfig` de cada tramo son las dos primeras cifras de su `linea_adif`.
9. Toda relación de `osp_relaciones` existe en los datos; si no, avisa (puede haber cambiado la oferta).

## 7. Orden de implantación

Cada paso es un PR en borrador. Primera tanda (datos, sin tocar la interfaz): pasos 1 a 4. Segunda tanda: pasos 5 y 6.

1. `taxonomia.js` y `check-taxonomia.mjs` (comprobaciones 1 a 4), en modo informe. Sin cambios en la interfaz.
2. `tools/visor/anotar-taxonomia.mjs` escribe `tx` en `servicios.json` y `rutas.json` con la misma regla de vigencia (el visor la lee de `tx.vig`); `osp_relaciones`; `cortes.json`. Comprobaciones 5 y 9. **Mismo corte, pendiente:** regenerar `servicios.json` cada semana desplazaría los ids de variante de los que depende `horarios.json` (horas del buscador de rutas), cuyo generador no está en el repositorio. Hasta traerlo, la comprobación 5 informa sin bloquear.
3. `linea_adif`, `eje_rfig` y `ejes` en `capas/ejes.json` (`tools/visor/build-ejes.mjs`; `datos.json` no cambia) y `tx.ejes` en cada relación. Comprobaciones 6 y 8, y los casos de prueba de 8. **Hecho (fase 3):** 11.436 tramos con la línea de Adif y 31.307 con la línea deducida por la red [D]; quedan 5 km de Adif sin eje. Resultado de los casos: Barcelona–Vigo norte+noreste, Lleida–Vigo norte, Valladolid–Alicante y Valladolid–Murcia levante+norte, Madrid–Badajoz extremadura, Zaragoza–Sevilla sur+noreste, Albacete–Toledo levante. Litoral: la línea 03600 (Valencia–Sant Vicenç de Calders) se lee como `mediterraneo`.
4. `cercanias.json` desde el GTFS oficial; `transit-catalog.json` reducido. Se mide el tamaño antes de publicar. **Hecho (fase 4):** `tools/visor/build-cercanias.mjs` lo genera cada semana desde `rutas.json` y los dibujos de `rutas-actividad.json` (shapes.txt de `fomento_transit.zip`): 70 líneas de 15 núcleos, 406 KB con los dibujos simplificados a 12 m. Sin dibujo en el GTFS: Madrid C9, València C5 y Rodalies R7. `transit-catalog.json` no existe en el repositorio; Metro y Metro Ligero siguen en `urbano.json`.
5. Panel con los 4 temas y traducción de los enlaces antiguos.
6. Se retiran `categories`, `brand` y las listas de `capas-config.js`. Comprobación 7.

## 8. Pendientes: estado a 26-11-2026

- **BOE-A-2025-15718.** El dossier lo cita como convenio AGE–Renfe–Gobierno Vasco para Alsasua–Vitoria–Miranda (01-07-2025 a 31-12-2027). El *Manual de ferrocarriles* (tema 9.3) lo cita como el traspaso de Cercanías al País Vasco desde el 01-01-2025. Si es lo segundo, las Cercanías de Bilbao y San Sebastián son `osp-ccaa`, no `osp-age`. Hay que leer el BOE antes del paso 2.
- **Eje RFIG 15.** `lineas-adif.json` tiene 3 líneas con ese código y el manual no lo recoge. Hay que identificarlo en el catálogo antes del paso 3.
- **Cobertura de `linea_adif`.** 11.436 tramos la tienen; en una relación AVE Madrid–Sevilla, solo 0,1 de 469 km [C, dossier]. El cruce de 3.3 es el punto de más riesgo.
- **Umbral del 20 % de km** para asignar ejes a una relación. Casos de prueba: Barcelona–Vigo, Lleida–Vigo, Valladolid–Alicante, Valladolid–Murcia, Madrid–Badajoz, Zaragoza–Sevilla y Albacete–Toledo. Criterio: cada uno recibe los ejes esperados a simple vista y ninguno queda sin eje.
- **Madrid–Andalucía.** Cortada desde el 28-10-2026 sin fecha de reapertura (Adif, 05-11-2026); OUIGO e iryo tienen cancelaciones publicadas hasta el 03-12-2026, y las notas del visor («hasta el 29-11») están desactualizadas. Aun así, el GTFS de Renfe y el de iryo traen trenes el 25-11. No se sabe si Renfe desvía alguno. Hay que contrastarlo antes de marcar sus relaciones como `suspendida`.
- **iryo.** Sigue como `comunitario`. La CNMC tiene comunicada una relación Barcelona–Tarragona–Lleida que el visor no recoge: se confirma con la oferta comercial antes de añadirla. iryo.eu no permite la consulta automática; la lista de relaciones de su web es una copia manual del 26-11-2026, con errores de la propia web (el enlace «Tren a Córdoba» de la página de Málaga apunta a Málaga).
- **Regionales catalanes.** No hay lista oficial línea a línea de los que son de la Generalitat.
- **Avant que no figuran en renfe.com.** El GTFS publica como Avant Madrid–Albacete, Albacete–Toledo y Barcelona–Tortosa (Exprés), que no están en la lista de relaciones Avant de renfe.com. Se mantienen como `avant` porque lo dice el GTFS.

## 9. Fuentes

- Dossier «Red ferroviaria de España: filtros, oferta oficial y arquitectura de datos», 26-11-2026 (fuentes detalladas en su sección 13).
- *Manual de ferrocarriles*, copia de estudio: tema 5.3.2 (subredes, clasificación de líneas, ejes del catálogo de la RFIG) y tema 9.3 (contrato OSP).
- Datos del repositorio [C]: `capas/servicios.json` (corte 16-11-2026), `capas/rutas.json` (22-11-2026), `capas/lineas-adif.json`, `capas.js`, `oferta.js`, `capas-config.js` y `tools/build-rutas.mjs`.
