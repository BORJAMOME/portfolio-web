/* ═══════════════════════════════════════════════
   tools/second-brain/catalog.mjs: catálogo de proyectos publicados en el portfolio web
   ─────────────────────────────────────────────────
   Muchos proyectos (sobre todo de Power BI) no tienen repositorio: existen como informe
   publicado o .pbix descargable y una página en borjamora.es. Este lector los recupera de
   tres sitios del portfolio, sin ejecutar nada (solo lectura de texto):

     · casos de estudio   → páginas *.html de la raíz con JSON-LD «CreativeWork» y genre
                            «Caso de estudio» (nombre, descripción, keywords, enlace al informe);
     · laboratorio .pbix  → array ITEMS de descargas.html (título, descripción, tags);
     · inventario         → supabase/portfolio.sql (gráficos de Power BI, visualizaciones,
                            manuales y proyectos) con sus tecnologías.

   Se quitan duplicados por título normalizado y por URL de la página.
   ═══════════════════════════════════════════════ */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fold } from './text.mjs';

const norm = (s) => fold(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

/* Tokenizador de una fila «( 'texto', null, array['a', 'b']::text[], true, 3 )» de SQL */
export function parseSqlRow(line) {
  const out = [];
  let i = line.indexOf('(') + 1;
  const ws = () => { while (i < line.length && /\s/.test(line[i])) i++; };
  const str = () => { let s = ''; i++; while (i < line.length) { if (line[i] === "'") { if (line[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; } s += line[i++]; } return s; };
  while (i < line.length) {
    ws();
    if (line[i] === ')') break;
    if (line[i] === "'") out.push(str());
    else if (/^array\[/i.test(line.slice(i, i + 6))) {
      i += 6; const arr = [];
      while (i < line.length) { ws(); if (line[i] === ']') { i++; break; } if (line[i] === "'") arr.push(str()); else i++; }
      const m = /^::\w+\[\]/.exec(line.slice(i)); if (m) i += m[0].length;
      out.push(arr);
    } else {
      const m = /^[^,)]+/.exec(line.slice(i)); const v = m ? m[0].trim() : ''; i += m ? m[0].length : 1;
      out.push(v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v);
    }
    ws(); if (line[i] === ',') i++;
  }
  return out;
}

function caseStudies(root) {
  const out = [];
  for (const f of readdirSync(root).filter((x) => x.endsWith('.html'))) {
    const html = read(join(root, f));
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let j; try { j = JSON.parse(m[1]); } catch { continue; }
      const items = Array.isArray(j['@graph']) ? j['@graph'] : [j];
      for (const it of items) {
        if (!it || it.genre !== 'Caso de estudio' || !it.name) continue;
        const report = (/https:\/\/app\.powerbi\.com\/(?:view|links)[^"'\s<>]*/.exec(html) || [])[0] || null;
        const repo = (/https:\/\/github\.com\/BORJAMOME\/([\w.-]+)/.exec(html) || [])[1] || null;
        out.push({ group: 'Caso de estudio', title: it.name, desc: it.description || '', techs: (it.keywords || []).map(String), url: report || it.url || null, page: it.url || null, repo, file: f, pbix: !!report });
      }
    }
  }
  return out;
}

function lab(root) {
  const html = read(join(root, 'descargas.html'));
  const out = [];
  for (const m of html.matchAll(/\{\s*n:"(\d+)",\s*cat:"([^"]*)",\s*title:"([^"]*)",\s*subtitle:"([^"]*)",\s*desc:"([^"]*)",\s*tags:\[([^\]]*)\]/g)) {
    const tags = [...m[6].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
    out.push({ group: 'Laboratorio Power BI (.pbix)', title: m[3], desc: m[4] + '. ' + m[5], techs: ['Power BI', 'DAX', ...tags], url: 'https://borjamora.es/descargas.html', page: 'https://borjamora.es/descargas.html', repo: null, file: 'descargas.html', pbix: true });
  }
  return out;
}

const SQL_TYPES = { 'Gráfico Power BI': 'Gráfico Power BI', 'Proyecto Power BI': 'Caso de estudio', 'Visualización': 'Visualización', 'Manual': 'Manual' };
function inventory(root) {
  const p = join(root, 'supabase', 'portfolio.sql');
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of read(p).split(/\r?\n/)) {
    if (!/^\s*\('/.test(line)) continue;
    const [titulo, tipo, estado, url, repoUrl, paginaUrl, descripcion, tecnologias] = parseSqlRow(line);
    if (!titulo || !SQL_TYPES[tipo] || estado === 'idea' || estado === 'archivado') continue;
    const repo = repoUrl ? (/github\.com\/[\w.-]+\/([\w.-]+)/.exec(repoUrl) || [])[1] || null : null;
    out.push({ group: SQL_TYPES[tipo], title: titulo, desc: descripcion || '', techs: Array.isArray(tecnologias) ? tecnologias : [], url: url || paginaUrl || null, page: paginaUrl || url || null, repo, file: 'supabase/portfolio.sql', pbix: tipo === 'Gráfico Power BI' || tipo === 'Proyecto Power BI' });
  }
  return out;
}

/** Devuelve las entradas del catálogo sin duplicados. */
export function readCatalog(root) {
  const all = [...caseStudies(root), ...lab(root), ...inventory(root)];
  const seen = new Map();
  for (const e of all) {
    const k = norm(e.title);
    // por página solo se fusionan casos de estudio (una página = un caso); el laboratorio, los gráficos
    // y las visualizaciones comparten página y son elementos distintos
    const dup = seen.get(k) || (e.group === 'Caso de estudio' ? [...seen.values()].find((x) => x.group === 'Caso de estudio' && x.page && x.page === e.page) : null);
    if (dup) { dup.techs = [...new Set([...dup.techs, ...e.techs])]; if (!dup.url && e.url) dup.url = e.url; continue; }
    seen.set(k, { ...e, techs: [...new Set(e.techs)] });
  }
  return [...seen.values()];
}
