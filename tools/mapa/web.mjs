/* ═══════════════════════════════════════════════
   tools/mapa/web.mjs: análisis del portfolio web público (lo usa build-mapa.mjs)
   ─────────────────────────────────────────────────
   Responde a «qué páginas hay, qué proyectos enseña cada una y cómo se relacionan» leyendo
   solo el HTML publicado, sin ejecutar nada:

     páginas ........ *.html de la raíz y carpetas con index.html
     enlaces ........ solo los del contenido (se quitan <nav>, <header> y <footer>, que repiten
                      el menú en todas las páginas), más los «siguiente caso» del pie
     proyectos ...... JSON-LD de cada página (CreativeWork / DataDownload), comentarios
                      «<!-- CARD ML-1: título -->», tarjetas de gráficos y de posts de Power BI,
                      array ITEMS de descargas.html y los casos de estudio (JSON-LD + catalog.mjs)
     dónde viven .... el dominio de cada enlace (GitHub, Streamlit, Power BI Service, Behance…)

   Las relaciones salen de coincidencias de URL y de enlaces reales: nada se declara a mano.
   Lo que se enlaza y no se reconoce queda en `sinExplicar` (se imprime y se muestra en la pestaña).
   Sin dependencias: solo Node.
   ═══════════════════════════════════════════════ */
import { readCatalog } from '../second-brain/catalog.mjs';

const uniq = (l) => [...new Set(l)];
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/* El contenido de una página sin lo que se repite en todas (menú, cabecera, pie) */
const mainOf = (raw) => raw
  .replace(/<head[\s\S]*?<\/head>/i, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<(nav|header|footer)\b[\s\S]*?<\/\1>/gi, '');

/* URL → clave comparable: sin protocolo, www, barra final ni parámetros de seguimiento.
   Los informes de Power BI se distinguen por su parámetro r (o por el id de /links/…). */
export function canon(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'app.powerbi.com') return `powerbi:${u.searchParams.get('r') || u.pathname}`;
  return host + u.pathname.replace(/\/+$/, '').toLowerCase();
}
const reportKey = (raw) => { try { return new URL(raw).searchParams.get('r') || null; } catch { return null; } };

export function analyzeWeb({ ROOT, read, exists, entries, cfg }) {
  const W = cfg.web;
  const platformOf = (host) => W.plataformas.find((p) => p.dominios.some((d) => host === d || host.endsWith('.' + d)));
  const hostOf = (raw) => { try { return new URL(raw).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
  // repositorio de GitHub: «nombre» si es propio, «propietario/nombre» si es de otra persona
  const repoOf = (url) => { const m = /github\.com\/([^/]+)\/([^/?#]+)/i.exec(url || ''); return m ? (/^borjamome$/i.test(m[1]) ? m[2] : `${m[1]}/${m[2]}`) : null; };

  /* ═══ 1 · Páginas ═══ */
  const skip = new Set(W.excluir);
  const keys = entries('.').filter((e) => e.isFile() && e.name.endsWith('.html') && !skip.has(e.name)).map((e) => e.name).sort();
  const dirs = [];
  for (const e of entries('.').filter((x) => x.isDirectory() && !x.name.startsWith('.') && !W.ignorarCarpetas.includes(x.name))) {
    if (exists(`${e.name}/index.html`)) dirs.push(e.name);
    else for (const s of entries(e.name).filter((x) => x.isDirectory())) if (exists(`${e.name}/${s.name}/index.html`)) dirs.push(`${e.name}/${s.name}`);
  }
  dirs.sort();
  const parseLd = (raw) => {
    const out = [];
    for (const m of raw.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { out.push(o); walk(o['@graph']); } })(JSON.parse(m[1])); } catch { /* bloque ilegible: se ignora */ }
    }
    return out;
  };
  const P = {};                                         // clave → página
  for (const key of [...keys, ...dirs]) {
    const file = key.endsWith('.html') ? key : `${key}/index.html`;
    const raw = read(file);
    const ld = parseLd(raw);
    const title = (/<title>([^<]*)<\/title>/.exec(raw) || [, ''])[1].trim();
    const own = ld.find((o) => /CreativeWork/.test([].concat(o['@type']).join()) && o.genre);
    const tipo = (W.tipos[key]) || (own && /caso de estudio/i.test(own.genre) ? 'caso' : 'pagina');
    P[key] = {
      key, file, dir: key.endsWith('.html') ? '' : key, raw, ld, tipo,
      main: mainOf(raw),
      id: `p:${key.replace(/\.html$/, '')}`,
      etiqueta: W.etiquetas[key] || title.split(/\s[|·]\s/)[0].split(':')[0].trim(),
      titulo: title,
      desc: (/<meta name="description" content="([^"]*)"/.exec(raw) || [, ''])[1],
      href: key.endsWith('.html') ? `./${key}` : `./${key}/`,
      archivo: key.endsWith('.html') ? key : `${key}/`,
    };
  }
  const pageList = Object.keys(P);
  const casos = readCatalog(ROOT).filter((c) => c.group === 'Caso de estudio' && P[c.file]);
  const caso = Object.fromEntries(casos.map((c) => [c.file, c]));

  /* ═══ 2 · Enlaces ═══ */
  // href relativo → clave de página (o 'area-privada.html')
  function resolve(from, href) {
    if (!/^(\.{1,2}\/|\/(?!\/))/.test(href)) return null;
    const base = from.dir ? from.dir.split('/') : [];
    const parts = href.replace(/[?#].*$/, '').startsWith('/') ? [] : base;
    const out = [...parts];
    for (const seg of href.replace(/[?#].*$/, '').split('/')) { if (seg === '..') out.pop(); else if (seg && seg !== '.') out.push(seg); }
    const path = out.join('/');
    if (path === 'area-privada.html') return path;
    if (P[path]) return path;
    if (P[path.replace(/\/index\.html$/, '')]) return path.replace(/\/index\.html$/, '');
    return null;
  }
  const anchors = (page) => [...page.main.matchAll(/<a\b([^>]*?)href="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[2], attrs: m[1] + m[3], label: text(m[4]), at: m.index }));
  const internal = {};                                   // clave → claves enlazadas desde el contenido, en orden de lectura
  const siguiente = {};
  for (const page of Object.values(P)) {
    internal[page.key] = uniq(anchors(page).map((a) => resolve(page, a.href)).filter((k) => k && k !== page.key && !W.chrome.includes(k)));
    // el «siguiente caso» vive en el pie: es una relación editorial, no el menú
    const nx = /class="case-next-main"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="case-next-main"/.exec(page.raw);
    if (nx) siguiente[page.key] = resolve(page, nx[1] || nx[2]);
  }

  /* ═══ 3 · Proyectos que enseña cada página ═══ */
  const E = {};                                         // id → entidad
  const urlTo = new Map();                              // clave de URL → { id } (página o entidad)
  const order = [];                                     // orden de aparición global
  function addEntity(e) {
    const dupe = e.urls.map((u) => urlTo.get(u)).find((x) => x && E[x.id]);
    if (dupe) { const t = E[dupe.id]; t.techs = uniq([...t.techs, ...e.techs]); e.urls.forEach((u) => !t.urls.includes(u) && t.urls.push(u)); return t; }
    let id = `e:${e.prefijo}${slug(e.etiqueta)}`.slice(0, 80), n = 2;
    while (E[id]) id = `${id.replace(/-\d+$/, '')}-${n++}`;
    E[id] = { ...e, id, dueña: e.pagina };
    e.urls.forEach((u) => urlTo.set(u, { id }));
    E[id].pos = (() => { const q = e.url ? pageMain(e.pagina).indexOf(e.url) : -1; return q >= 0 ? q : 1e9 + order.length; })();
    order.push(id);
    return E[id];
  }
  const pageMain = (key) => (P[key] ? P[key].main : '');
  const kwOf = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  const caseByTitle = (name) => Object.values(P).find((p) => p.tipo === 'caso' && (fold(p.etiqueta).includes(fold(name)) || fold(name).includes(fold(p.etiqueta)) || fold(p.titulo).startsWith(fold(name))));

  for (const page of Object.values(P)) {
    // 3a · JSON-LD: cada CreativeWork/DataDownload con ancla propia es un elemento que la página enseña
    for (const o of page.ld) {
      const id = String(o['@id'] || '');
      if (!id.includes(`${page.file}#`) && !id.includes(`${page.key}#`)) continue;
      const anchor = id.split('#')[1];
      if (!/CreativeWork/.test([].concat(o['@type']).join()) || anchor === 'caso' || !o.name) continue;     // los DataDownload del laboratorio salen de ITEMS (3d), completos
      const asCase = caseByTitle(o.name);
      if (asCase) { (asCase.muestra ??= []).push(page.key); continue; }   // el listado enseña un caso que ya tiene su página
      const url = o.url ? String(o.url) : '';
      const host = hostOf(url);
      const gh = /^github\.com$/.test(host) ? url.split('/').slice(5).join('/') : '';
      const tipo = host.endsWith('behance.net') ? 'visual' : host === 'github.com' ? 'proyecto' : 'proyecto';
      const grupo = tipo === 'visual' ? W.grupos.visual
        : /\/01-SQL\//i.test(url) ? 'SQL' : /\/02-Python\//i.test(url) ? 'Python' : /\/03-Machine/i.test(url) ? W.grupos.ml : W.grupos.proyecto;
      addEntity({ prefijo: '', tipo, etiqueta: String(o.name), urls: [canon(url)].filter(Boolean), url, techs: kwOf(o.keywords), grupo, pagina: page.key, ruta: gh });
    }
    // 3b · «<!-- CARD ML-1: título -->»: la tarjeta lleva su primer enlace externo
    const cards = [...page.raw.matchAll(/<!--\s*CARD\s+([A-Z]+)-?(\d+)\s*:\s*([^>]*?)\s*-->/g)];
    cards.forEach((m, i) => {
      const block = page.raw.slice(m.index, cards[i + 1] ? cards[i + 1].index : m.index + 6000);
      const url = (/href="(https?:\/\/[^"]+)"/.exec(block) || [, ''])[1];
      if (!url) return;
      const kind = m[1];
      const pills = [...block.matchAll(/class="cc-pill"[^>]*>([^<]+)</g)].map((x) => text(x[1]));
      const isApp = /streamlit\.app$/.test(hostOf(url));
      addEntity({
        prefijo: isApp ? 'app-' : '', tipo: isApp ? 'app' : 'proyecto', etiqueta: m[3].trim(), urls: [canon(url)].filter(Boolean), url, techs: pills,
        grupo: isApp ? W.grupos.app : ({ ML: W.grupos.ml, PY: 'Python', SQL: 'SQL' }[kind] || W.grupos.proyecto), pagina: page.key,
        ruta: /github\.com/.test(url) ? url.split('/').slice(5).join('/') : '',
      });
    });
    // 3c · tarjetas de gráficos nativos y de posts (componentes propios de power-bi.html)
    const viz = [...page.raw.matchAll(/class="nat-viz-title"[^>]*>([^<]+)</g)];
    viz.forEach((m, i) => {
      // la tarjeta entera es un enlace: su href está justo ANTES del título (si no, justo después)
      const before = page.raw.slice(viz[i - 1] ? viz[i - 1].index + 40 : Math.max(0, m.index - 2500), m.index);
      const after = page.raw.slice(m.index, viz[i + 1] ? viz[i + 1].index : m.index + 2500);
      const re = /href="(https:\/\/app\.powerbi\.com[^"]+)"/g;
      const url = ([...before.matchAll(re)].pop() || re.exec(after) || [, ''])[1];
      addEntity({ prefijo: 'grafico-', tipo: 'grafico', etiqueta: text(m[1]), urls: [canon(url)].filter(Boolean), url, techs: [], grupo: W.grupos.grafico, pagina: page.key });
    });
    for (const m of page.raw.matchAll(/<a\b[^>]*href="(https:\/\/www\.linkedin\.com\/(?:posts|feed\/update)[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const t = (/class="li-card-title"[^>]*>([\s\S]*?)<\//.exec(m[2]) || [, ''])[1];
      if (!t) continue;
      addEntity({ prefijo: 'post-', tipo: 'post', etiqueta: cut(text(t), 70), urls: [canon(m[1])].filter(Boolean), url: m[1], techs: [], grupo: W.grupos.post, pagina: page.key });
    }
  }
  // 3c-bis · carpetas de un repositorio propio enlazadas con ruta (≥ 2 niveles): un proyecto más, con el nombre de la carpeta
  for (const page of Object.values(P)) {
    for (const a of anchors(page)) {
      const m = /^https:\/\/github\.com\/BORJAMOME\/([^/]+)\/tree\/[^/]+\/(.+?)\/?$/i.exec(a.href);
      if (!m || m[2].split('/').length < 2 || urlTo.has(canon(a.href))) continue;
      const parts = decodeURIComponent(m[2]).split('/');
      addEntity({ prefijo: 'carpeta-', tipo: 'proyecto', etiqueta: parts[parts.length - 1], urls: [canon(a.href)], url: a.href, techs: [parts[0]], grupo: m[1].replace(/-/g, ' '), pagina: page.key, ruta: decodeURIComponent(m[2]) });
    }
  }
  // 3d · descargas.html: array ITEMS (.pbix del laboratorio)
  const dl = P['descargas.html'];
  if (dl) {
    const from = dl.raw.indexOf('const ITEMS = [');
    const catNames = W.etiquetasLab;
    for (const m of dl.raw.slice(from).matchAll(/\{n:"(\d+)",\s*cat:"(\w+)",\s*title:"([^"]+)"[\s\S]*?tags:\[([^\]]*)\][\s\S]*?dl:"([^"]*)"/g)) {
      addEntity({
        prefijo: 'lab-', tipo: 'lab', etiqueta: m[3], urls: [canon(m[5])].filter(Boolean), url: m[5], techs: [...m[4].matchAll(/"([^"]+)"/g)].map((x) => x[1]),
        grupo: `${W.grupos.lab} · ${catNames[m[2]] || m[2]}`, pagina: dl.key, orden: Number(m[1]),
      });
    }
  }
  // 3e · herramientas externas propias (borjamome.github.io): una app más
  for (const page of Object.values(P)) {
    for (const a of anchors(page)) {
      if (hostOf(a.href) !== 'borjamome.github.io') continue;
      addEntity({ prefijo: 'app-', tipo: 'app', etiqueta: W.etiquetasUrl[canon(a.href)] || W.etiquetasUrl[canon(a.href).replace(/\/[^/]*$/, '')] || a.label.replace(/[↗→]/g, '').trim() || 'Herramienta externa', urls: [canon(a.href)], url: a.href, techs: [], grupo: W.grupos.herramienta, pagina: page.key });
    }
  }
  // los casos de estudio también se reconocen por la URL de su informe
  for (const c of Object.values(caso)) {
    const k = canon(c.url);
    if (k) urlTo.set(k, { id: P[c.file].id, page: c.file });
    const r = reportKey(c.url);
    if (r) urlTo.set(`powerbi:${r}`, { id: P[c.file].id, page: c.file });
  }

  /* ═══ 4 · Relaciones entre páginas y proyectos ═══ */
  const showsPage = {};                                 // entidad/página → claves de página que la enseñan (además de su dueña)
  const sinExplicar = {};
  const content = Object.values(P).filter((p) => !W.chrome.includes(p.key));   // la política de privacidad enlaza a GitHub por motivos legales, no enseña nada
  for (const page of content) {
    for (const a of anchors(page)) {
      const k = canon(a.href);
      if (!k) continue;
      const hit = urlTo.get(k) || urlTo.get(`powerbi:${reportKey(a.href)}`);
      if (hit && !(hit.id.startsWith('e:') && E[hit.id].dueña === page.key)) (showsPage[hit.id] ??= []).push(page.key);
      else if (!hit) {
        const host = hostOf(a.href);
        const hp = `${host}${new URL(a.href).pathname}`.replace(/\/$/, '').toLowerCase();
        if (W.ignorarDominios.some((d) => host === d || host.endsWith('.' + d) || hp.startsWith(d))) continue;
        if (host === 'github.com' && repoOf(a.href)) continue;                      // tiene nodo propio en «Dónde vive»
        if (/^github\.com$/.test(host) && /^\/[^/]+\/?$/.test(new URL(a.href).pathname)) continue;     // el perfil
        if (/linkedin\.com\/in\//.test(a.href)) continue;
        (sinExplicar[`${host}${new URL(a.href).pathname}`.replace(/\/$/, '')] ??= []).push(page.key);
      }
    }
  }

  /* ═══ 5 · Dónde vive cada cosa ═══ */
  const repos = {};                                     // repo → { entidades }
  const plat = {};                                      // plataforma → { entidades }
  const lives = [];                                     // { de, a, detalle }
  function lived(deId, url, extra = '') {
    const host = hostOf(url);
    const r = repoOf(url);
    if (r) { (repos[r] ??= new Set()).add(deId); lives.push({ de: deId, a: `z:gh:${slug(r)}`, detalle: extra }); return; }
    const p = platformOf(host);
    if (p) { (plat[p.id] ??= new Set()).add(deId); lives.push({ de: deId, a: `z:${p.id}`, detalle: extra }); }
  }
  for (const id of order) { const e = E[id]; lived(id, e.url, e.ruta || ''); }
  for (const c of Object.values(caso)) {
    lived(P[c.file].id, c.url, 'informe publicado');
    if (c.repo) lived(P[c.file].id, `https://github.com/BORJAMOME/${c.repo}`, 'código y modelo');
  }
  // repos enlazados desde el contenido sin ser un proyecto concreto (p. ej. DAX-LAB en power-bi.html)
  for (const page of content) for (const a of anchors(page)) { const r = repoOf(a.href); if (r) { (repos[r] ??= new Set()); if (!lives.some((l) => l.a === `z:gh:${slug(r)}` && l.de === page.id)) lives.push({ de: page.id, a: `z:gh:${slug(r)}`, detalle: 'enlaza al repositorio', muestra: true }); } }
  // un gráfico comparte informe con el caso del que sale
  const derive = [];
  for (const id of order.filter((x) => E[x].tipo === 'grafico')) {
    const r = reportKey(E[id].url);
    const c = r && Object.values(caso).find((x) => reportKey(x.url) === r);
    if (c) derive.push({ de: id, a: P[c.file].id });
  }

  return { P, E, order, internal, siguiente, showsPage, caso, repos, plat, lives, derive, sinExplicar, parseLd, pageList, anchors, resolve };
}
