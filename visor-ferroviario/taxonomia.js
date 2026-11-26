/* Diccionario único de clasificación del atlas ferroviario (FILTROS_ARQUITECTURA.md, versión 2).
   Fase 1: solo lo leen las comprobaciones (tools/check-taxonomia.mjs); la interfaz sigue con capas-config.js.
   Cada valor lleva su fuente y una marca de verificación: V oficial, P prensa o terceros, D deducción propia. */
(function (root) {
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  const fuentes = {
    renfe: {name: 'trenes.renfe.com · nueva arquitectura de servicios', fecha: '2026-11-26', ver: 'V'},
    moncloa: {name: 'La Moncloa · contrato AGE–Renfe Viajeros 2018-2027', url: 'https://www.lamoncloa.gob.es/consejodeministros/Paginas/enlaces/141218-enlacerenfe.aspx', fecha: '2018-12-14', ver: 'V'},
    rdl45: {name: 'Real Decreto-ley 45/2026 (BOE-A-2026-24703)', fecha: '2026-11-25', ver: 'V'},
    rd1598: {name: 'RD 2034/2009 y RD 1598/2010 (traspasos a la Generalitat)', ver: 'V'},
    juntaex: {name: 'juntaex.es · contrato de Media Distancia de Extremadura', fecha: '2025-07-29', ver: 'V'},
    aragon: {name: 'aragonhoy.es · servicios íntegramente aragoneses', fecha: '2024-03-14', ver: 'V'},
    avant: {name: 'renfe.com · trenes Avant y Regional', url: 'https://www.renfe.com/es/es/viajar/prepara-tu-viaje/trenes-avant-y-regional', fecha: '2026-11-26', ver: 'V'},
    cnmc: {name: 'CNMC · informe trimestral 2T 2026', url: 'https://www.cnmc.es/sites/default/files/6808640.pdf', fecha: '2026-09-22', ver: 'V'},
    rfig: {name: 'Catálogo de líneas y tramos de la RFIG (Manual de ferrocarriles, tema 5.3.2)', ver: 'V'},
    cercanias: {name: 'renfe.com/cercanias y GTFS fomento_transit.zip', fecha: '2026-11-24', ver: 'V'},
    gtfs: {name: 'GTFS de Renfe Viajeros (alta velocidad, larga y media distancia)', fecha: '2026-11-16', ver: 'V'}
  };

  const operador = [
    {id: 'renfe', name: 'Renfe', empresa: 'publica', alias: ['Renfe Viajeros']},
    {id: 'ouigo', name: 'OUIGO', empresa: 'privada', alias: ['OUIGO España']},
    {id: 'iryo', name: 'iryo', empresa: 'privada', alias: ['Iryo (Intermodalidad de Levante, S. A.)']}
  ];

  const familia = [
    {id: 'av', name: 'Alta velocidad', fuente: 'renfe'},
    {id: 'ld-md', name: 'Distancias largas y medias', fuente: 'renfe'},
    {id: 'metro', name: 'Movilidad metropolitana', fuente: 'renfe'},
    {id: 'turismo', name: 'Experiencias turísticas', nota: 'Fuera de la arquitectura de servicios de Renfe'}
  ];

  // reg = régimen por defecto; osp_relaciones lo sobrescribe por relación.
  const marca = [
    {id: 'ave', name: 'AVE', fam: 'av', op: 'renfe', reg: 'comercial'},
    {id: 'ave-euromed', name: 'AVE Euromed', fam: 'av', op: 'renfe', reg: 'comercial', alias: ['Euromed'],
     nota: 'Nombre provisional hasta el fin de las obras del corredor (2027)'},
    {id: 'avlo', name: 'Avlo', fam: 'av', op: 'renfe', reg: 'comercial'},
    {id: 'avant', name: 'Avant', fam: 'av', op: 'renfe', reg: 'osp-age', alias: ['Avant Exprés', 'AVANT EXP']},
    {id: 'ouigo', name: 'OUIGO', fam: 'av', op: 'ouigo', reg: 'comercial'},
    {id: 'iryo', name: 'iryo', fam: 'av', op: 'iryo', reg: 'comercial'},
    {id: 'intercity', name: 'Intercity', fam: 'ld-md', op: 'renfe', reg: 'comercial', alias: ['Alvia']},
    {id: 'regional', name: 'Regional', fam: 'ld-md', op: 'renfe', reg: 'osp-age',
     alias: ['Media Distancia', 'Regional Exprés', 'Proximidad']},
    {id: 'cercanias', name: 'Cercanías', fam: 'metro', op: 'renfe', reg: 'osp-age', alias: ['Rodalies']},
    {id: 'lujo', name: 'Trenes turísticos de lujo', fam: 'turismo', op: 'renfe', reg: 'comercial'},
    {id: 'tematico', name: 'Trenes temáticos', fam: 'turismo', reg: 'comercial'}
  ];

  const regimen = [
    {id: 'osp-age', name: 'Servicio público del Estado', fuente: 'moncloa'},
    {id: 'osp-generalitat', name: 'Servicio público de la Generalitat', fuente: 'rd1598'},
    {id: 'osp-ccaa', name: 'Servicio público de una comunidad', fuente: 'juntaex'},
    {id: 'comercial-plazas-osp', name: 'Comercial con plazas de servicio público', fuente: 'avant'},
    {id: 'comercial', name: 'Comercial', ver: 'D'}
  ];

  const ambito = [
    {id: 'nacional', name: 'Nacional'},
    {id: 'internacional-fr', name: 'Internacional · Francia'},
    {id: 'internacional-pt', name: 'Internacional · Portugal'}
  ];

  // Núcleos de Cercanías: id del GTFS (dos primeras cifras de route_id).
  const nucleo = [
    {id: 'madrid', gtfs: '10', name: 'Madrid'},
    {id: 'asturias', gtfs: '20', name: 'Asturias'},
    {id: 'sevilla', gtfs: '30', name: 'Sevilla'},
    {id: 'cadiz', gtfs: '31', name: 'Cádiz'},
    {id: 'malaga', gtfs: '32', name: 'Málaga'},
    {id: 'valencia', gtfs: '40', name: 'València', alias: ['Valencia']},
    {id: 'murcia-alicante', gtfs: '41', name: 'Murcia–Alicante', alias: ['Murcia/Alicante']},
    {id: 'cartagena', gtfs: '45', name: 'Cartagena'},
    {id: 'ferrol', gtfs: '46', name: 'Ferrol'},
    {id: 'leon', gtfs: '47', name: 'León'},
    {id: 'rodalies', gtfs: '51', name: 'Rodalies de Catalunya', reg: 'osp-generalitat'},
    {id: 'bilbao', gtfs: '60', name: 'Bilbao'},
    {id: 'san-sebastian', gtfs: '61', name: 'San Sebastián'},
    {id: 'cantabria', gtfs: '62', name: 'Cantabria'},
    {id: 'zaragoza', gtfs: '70', name: 'Zaragoza'}
  ];

  const vigencia = [
    {id: 'vigente', name: 'Vigente'},
    {id: 'futura', name: 'Empieza más adelante'},
    {id: 'sin-oferta', name: 'Sin oferta vigente'},
    {id: 'suspendida', name: 'Suspendida por una incidencia'}
  ];

  const calidad = [
    {id: 'oficial', name: 'Horario oficial'},
    {id: 'reconstruido', name: 'Reconstruido desde el horario oficial'},
    {id: 'comunitario', name: 'GTFS de terceros, no oficial'},
    {id: 'sin-trazado', name: 'Sin trazado verificado'}
  ];

  const estado = [
    {id: 'service', name: 'En servicio', alias: ['En servicio']},
    {id: 'construction', name: 'En construcción', alias: ['En obras']},
    {id: 'project', name: 'En proyecto', alias: ['Planificado']}
  ];

  const ejeLectura = [
    {id: 'noreste', name: 'Madrid–Zaragoza–Barcelona–Francia', cnmc: ['Madrid-Barcelona']},
    {id: 'levante', name: 'Madrid–Levante', cnmc: ['Madrid-Valencia', 'Madrid-Alicante']},
    {id: 'sur', name: 'Madrid–Andalucía', cnmc: ['Madrid-Sevilla', 'Madrid-Málaga/Granada']},
    {id: 'norte', name: 'Madrid–Norte y Noroeste', cnmc: []},
    {id: 'extremadura', name: 'Madrid–Extremadura', cnmc: []},
    {id: 'mediterraneo', name: 'Corredor litoral', cnmc: []},
    {id: 'otros', name: 'Resto de la red', cnmc: []}
  ];

  // Catálogo de la RFIG: dos primeras cifras del código de línea de Adif. `lectura` = eje de lectura por defecto;
  // las excepciones por línea (litoral) se añaden en la fase 3 en `ejeLineas`.
  const ejeRfig = [
    {id: '01', name: 'Madrid Chamartín–Irún/Hendaya', lectura: 'norte'},
    {id: '02', name: 'Madrid Chamartín–Zaragoza–Lleida–Barcelona–Portbou/Cerbère', lectura: 'noreste'},
    {id: '03', name: 'Madrid Chamartín–Valencia–San Vicente de Calders', lectura: 'levante'},
    {id: '04', name: 'Alcázar de San Juan–Córdoba–Sevilla–Cádiz', lectura: 'sur'},
    {id: '05', name: 'Madrid Atocha–Cáceres–Valencia de Alcántara', lectura: 'extremadura'},
    {id: '06', name: 'Venta de Baños–León–Ourense–Vigo', lectura: 'norte'},
    {id: '08', name: 'Red de ancho métrico (excepto Cercedilla–Los Cotos)', lectura: 'norte'},
    {id: '11', name: 'Madrid Chamartín–Valladolid (AV)', lectura: 'norte'},
    {id: '12', name: 'Madrid Atocha–Barcelona–frontera francesa (AV)', lectura: 'noreste'},
    {id: '13', name: 'Madrid Atocha–Levante (AV)', lectura: 'levante'},
    {id: '14', name: 'Madrid Atocha–Toledo/Sevilla Santa Justa/Málaga María Zambrano (AV)', lectura: 'sur'},
    {id: '15', name: 'Sin identificar', lectura: null, pendiente: 'No figura en el manual. lineas-adif.json tiene 15026 (Bif. San Esteban–Bif. Casa de la Torre), 15626 (Cáceres–Bif. Peñas Blancas) y 15926 (Bif. La Isla–Bif. San Nicolás)'},
    {id: '16', name: 'Olmedo–Medina–Zamora–Ourense–Santiago de Compostela (AV)', lectura: 'norte'}
  ];
  const ejeLineas = {};

  // Relaciones con régimen distinto del de su marca. Origen y destino por nombre de ciudad, sin sentido.
  // Se aplica a toda la relación aunque solo algunos trenes lleven plazas OSP: aproximación marcada como D.
  const ospRelaciones = [
    {origen: 'Madrid', destino: 'Salamanca', regimen: 'comercial-plazas-osp', titulo: 'multiviaje', fuente: 'avant'},
    {origen: 'Madrid', destino: 'Cuenca', regimen: 'comercial-plazas-osp', titulo: 'multiviaje', fuente: 'avant'},
    {origen: 'Cuenca', destino: 'Albacete', regimen: 'comercial-plazas-osp', fuente: 'avant'},
    {origen: 'Madrid', destino: 'Albacete', regimen: 'comercial-plazas-osp', fuente: 'avant'},
    {origen: 'Cuenca', destino: 'Valencia', regimen: 'comercial-plazas-osp', fuente: 'avant'},
    {origen: 'Zaragoza', destino: 'Huesca', regimen: 'comercial-plazas-osp', fuente: 'avant'},
    {origen: 'Valladolid', destino: 'León', regimen: 'comercial-plazas-osp', fuente: 'avant'},
    {origen: 'Valladolid', destino: 'Palencia', regimen: 'comercial-plazas-osp', fuente: 'avant'},
    {origen: 'Valladolid', destino: 'Burgos', regimen: 'comercial-plazas-osp', fuente: 'avant'},
    {origen: 'Cáceres', destino: 'Valencia de Alcántara', regimen: 'osp-ccaa', titular: 'Extremadura', fuente: 'juntaex'},
    {origen: 'Llerena', destino: 'Mérida', regimen: 'osp-ccaa', titular: 'Extremadura', fuente: 'juntaex'},
    {origen: 'Plasencia', destino: 'Cáceres', regimen: 'osp-ccaa', titular: 'Extremadura', fuente: 'juntaex'},
    {origen: 'Zafra', destino: 'Mérida', regimen: 'osp-ccaa', titular: 'Extremadura', fuente: 'juntaex'},
    {origen: 'Caspe', destino: 'Fayón', regimen: 'osp-ccaa', titular: 'Aragón', fuente: 'aragon'}
  ];

  // Traducción de las clasificaciones antiguas (se retiran en la fase 6).
  const legado = {
    services: {alvia: ['intercity'], day: ['intercity'], euromed: ['ave-euromed'], highspeed: ['ave', 'avlo', 'ouigo', 'iryo'],
      'md-conventional': ['regional'], avant: ['avant'], 'commuter-metric': ['cercanias']},
    brands: {ave: ['ave'], avlo: ['avlo'], iryo: ['iryo'], ouigo: ['ouigo']},
    tourism: {multi: ['lujo'], day: ['tematico']}
  };

  const dims = {operador, familia, marca, regimen, ambito, nucleo, vigencia, calidad, estado, ejeLectura, ejeRfig};
  const index = {};
  for (const [dim, list] of Object.entries(dims)) {
    index[dim] = new Map();
    for (const item of list) {
      for (const key of [item.id, item.name, ...(item.alias || [])]) index[dim].set(normalize(key), item);
      if (item.gtfs) index[dim].set(item.gtfs, item);
    }
  }
  const get = (dim, value) => index[dim]?.get(normalize(value)) || null;
  const has = (dim, id) => dims[dim]?.some(x => x.id === id) || false;
  const familiaDe = marcaId => marca.find(m => m.id === marcaId)?.fam || null;
  const ejeRfigDe = lineaAdif => /^\d{4}[0-9A-Z]$/.test(String(lineaAdif)) ? String(lineaAdif).slice(0, 2) : null;  // 0613G: ramal con letra
  // Una relación de osp_relaciones solo cambia las marcas a las que se aplica (por defecto, las de su régimen tipo).
  const aplicaA = {'comercial-plazas-osp': ['ave', 'intercity'], 'osp-ccaa': ['regional']};
  const empieza = (station, city) => {const s = normalize(station), c = normalize(city); return s === c || s.startsWith(c + '-') || s.startsWith(c + ' ');};
  function regimenDe(marcaId, {origen, destino, nucleo: nuc} = {}) {
    const hit = ospRelaciones.find(r => (r.marcas || aplicaA[r.regimen] || []).includes(marcaId) &&
      ((empieza(origen, r.origen) && empieza(destino, r.destino)) || (empieza(origen, r.destino) && empieza(destino, r.origen))));
    if (hit) return hit.regimen;
    if (nuc && get('nucleo', nuc)?.reg) return get('nucleo', nuc).reg;
    return marca.find(m => m.id === marcaId)?.reg || null;
  }

  const api = {version: 2, normalize, fuentes, ...dims, ejeLineas, ospRelaciones, legado, get, has, familiaDe, regimenDe, ejeRfigDe};
  if (typeof module !== 'undefined') module.exports = api;
  root.AtlasTaxonomia = api;
})(typeof window === 'undefined' ? globalThis : window);
