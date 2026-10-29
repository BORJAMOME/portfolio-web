/* ══════════════════════════════════════════════════════════════
   Mapa mental (vista #mapa) y miniatura de la portada.
   Solo dibuja: las posiciones y las relaciones salen de grafo.js (CAGrafo) y, por tanto, de las fichas.
   Dos presentaciones de los mismos datos: mapa SVG (zoom, desplazamiento, resaltado) y lista por ramas
   (pantallas pequeñas y lectores de pantalla). El detalle de cada nodo vive en un panel común.
   Necesita: CAGrafo (grafo.js). Se monta desde app.js con CAMapa.render(host, ctx).
   ══════════════════════════════════════════════════════════════ */
(function(){
"use strict";

var ST = ["Pendiente", "En estudio", "Entendido"];
var R_TOPIC = 12, R_BLOCK = 27;

function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function plain(h){ return String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function short(s, n){ s = plain(s); return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; }
/* Parte un rótulo en dos líneas como máximo; recorta con «…» si no cabe */
function wrap(s, n){
  var w = plain(s).split(" "), l1 = "", l2 = "", i = 0;
  while(i < w.length && (l1 ? l1 + " " + w[i] : w[i]).length <= n){ l1 = l1 ? l1 + " " + w[i] : w[i]; i++; }
  if(!l1){ l1 = w[0].slice(0, n); i = 1; }
  l2 = w.slice(i).join(" ");
  return l2 ? [l1, short(l2, n)] : [l1];
}
/* Punto a distancia d de p, en dirección a q */
function toward(p, q, d){ var dx = q.x - p.x, dy = q.y - p.y, l = Math.sqrt(dx * dx + dy * dy) || 1; return {x:p.x + dx / l * d, y:p.y + dy / l * d}; }
function fmtDate(d){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ""); if(!m) return d || "";
  return +m[3] + " de " + ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][+m[2] - 1] + " de " + m[1];
}

/* ── miniatura de la portada: los mismos nodos, sin interacción ── */
function miniature(G, title, centerLabel){
  var L = CAGrafo.layout(G), W = 400, H = 300, P = 34, b = L.bounds;
  var k = Math.min((W - 2 * P) / (b.w - 220), (H - 2 * P) / (b.h - 220));
  var cx = W / 2 - (b.x + b.w / 2) * k, cy = H / 2 - (b.y + b.h / 2) * k;
  function X(p){ return (cx + p.x * k).toFixed(1); } function Y(p){ return (cy + p.y * k).toFixed(1); }
  var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(title) + '">', pos = L.pos;
  G.blocks.forEach(function(bl){
    s += '<line x1="' + X(pos.center) + '" y1="' + Y(pos.center) + '" x2="' + X(pos[bl.id]) + '" y2="' + Y(pos[bl.id]) + '" style="stroke:var(--line-2);stroke-width:1.2"/>';
    G.topics.forEach(function(t){ if(t.b === bl.id && pos[t.id]) s += '<line x1="' + X(pos[bl.id]) + '" y1="' + Y(pos[bl.id]) + '" x2="' + X(pos[t.id]) + '" y2="' + Y(pos[t.id]) + '" style="stroke:var(--line);stroke-width:.8"/>'; });
  });
  G.edges.forEach(function(e){ if(pos[e.from] && pos[e.to]) s += '<line x1="' + X(pos[e.from]) + '" y1="' + Y(pos[e.from]) + '" x2="' + X(pos[e.to]) + '" y2="' + Y(pos[e.to]) + '" style="stroke:var(--accent-2);stroke-width:1.1;opacity:.6"/>'; });
  G.topics.forEach(function(t){ if(pos[t.id]) s += '<circle cx="' + X(pos[t.id]) + '" cy="' + Y(pos[t.id]) + '" r="4.5" style="fill:var(--card);stroke:var(--accent-2);stroke-width:1.5"/>'; });
  G.blocks.forEach(function(bl){
    s += '<circle cx="' + X(pos[bl.id]) + '" cy="' + Y(pos[bl.id]) + '" r="13" style="fill:var(--accent)"/><text x="' + X(pos[bl.id]) + '" y="' + (+Y(pos[bl.id]) + 5) + '" text-anchor="middle" style="font-family:var(--serif);font-size:15px;fill:var(--on-accent)">' + bl.n + "</text>";
  });
  var lines = wrap(centerLabel, 12), ph = 22 + lines.length * 15, pw = 112;
  s += '<rect x="' + (+X(pos.center) - pw / 2) + '" y="' + (+Y(pos.center) - ph / 2) + '" width="' + pw + '" height="' + ph + '" rx="9" style="fill:var(--accent)"/>';
  lines.forEach(function(l, i){ s += '<text x="' + X(pos.center) + '" y="' + (+Y(pos.center) - ph / 2 + 22 + i * 15) + '" text-anchor="middle" style="font-family:var(--serif);font-size:14px;fill:var(--on-accent)">' + esc(l) + "</text>"; });
  return s + "</svg>";
}

/* ── vista del mapa ── */
var S = {sel:null, q:"", fb:"", fs:"", mode:null, expanded:null, courses:false};   // sobrevive entre visitas a la vista

function render(host, ctx){
  var G = ctx.G, M = ctx.MANUAL, vb = null, base = null, zoom = 1, drag = null, dragged = false, pts = {}, pinch = 0, L = null, svg = null;
  if(ctx.sel !== undefined) S.sel = ctx.sel && (G.topic[ctx.sel] || G.block[ctx.sel] || G.course[ctx.sel]) ? ctx.sel : null;
  if(!S.expanded || ctx.reset) S.expanded = CAGrafo.defaultExpanded(G);
  if(S.mode === null) S.mode = window.matchMedia && window.matchMedia("(max-width: 759px)").matches ? "lista" : "mapa";
  var collapsible = G.topics.length > CAGrafo.MAX_ALL;

  function title(id){ return G.topic[id] ? G.topic[id].t : G.block[id] ? G.block[id].t : G.course[id] ? G.course[id].t : id; }
  function kind(id){ return G.topic[id] ? "topic" : G.block[id] ? "block" : G.course[id] ? "course" : "center"; }
  function st(id){ return ctx.prog(id) || 0; }
  function filterOn(){ return !!(S.q.trim() || S.fb || S.fs !== ""); }
  function topicMatch(t){
    if(S.fb && t.b !== S.fb) return false;
    if(S.fs !== "" && String(st(t.id)) !== S.fs) return false;
    if(S.q.trim() && !ctx.matches(t, S.q)) return false;
    return true;
  }
  function matchSet(){
    var m = {}, n = 0;
    G.topics.forEach(function(t){ if(topicMatch(t)){ m[t.id] = true; n++; } });
    G.blocks.forEach(function(b){ if(G.topics.some(function(t){ return t.b === b.id && m[t.id]; }) || (S.fb === b.id && !S.q.trim() && S.fs === "")) m[b.id] = true; });
    G.courses.forEach(function(c){ if((G.courseTopics[c.id] || []).some(function(id){ return m[id]; })) m[c.id] = true; });
    m.__n = n; return m;
  }

  /* ── armazón ── */
  host.innerHTML =
    '<div class="modehead"><div class="eyebrow">Mapa mental</div><h2 class="th-title">' + esc(M.mapCenter) + '</h2>' +
    '<p class="th-sub">Cada punto es un tema; cada línea, una relación con nombre. Pulsa un punto para ver su resumen, sus conexiones y la <b>ruta de aprendizaje</b> hasta él.</p></div>' +
    '<div class="toolbar"><label class="search"><span class="sr">Buscar un concepto en el mapa</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input id="ca-q" type="search" placeholder="Buscar un concepto…" autocomplete="off"></label>' +
    '<span class="count" id="ca-status" role="status"></span></div>' +
    '<div class="toolbar ca-filters"><div class="filters" id="ca-fb" role="group" aria-label="Filtrar por bloque"><button type="button" class="fb" data-v="" aria-pressed="false">Todos los bloques</button>' + G.blocks.map(function(b){ return '<button type="button" class="fb" data-v="' + b.id + '" aria-pressed="false">' + b.n + " · " + esc(b.t) + "</button>"; }).join("") + "</div>" +
    '<div class="filters" id="ca-fs" role="group" aria-label="Filtrar por tu estado"><button type="button" class="fb" data-v="" aria-pressed="false">Todos</button>' + ST.map(function(x, i){ return '<button type="button" class="fb" data-v="' + i + '" aria-pressed="false">' + (i === 0 ? "Pendientes" : i === 1 ? "En estudio" : "Entendidos") + "</button>"; }).join("") + "</div>" +
    '<div class="filters ca-view" id="ca-mode" role="group" aria-label="Forma de verlo"><button type="button" class="fb" data-v="mapa" aria-pressed="false">Mapa</button><button type="button" class="fb" data-v="lista" aria-pressed="false">Lista</button>' +
    '<button type="button" class="fb" id="ca-courses" aria-pressed="false"' + (G.courses.length ? "" : " disabled") + ' title="' + (G.courses.length ? "Mostrar los cursos de origen" : "Todavía no hay cursos incorporados") + '">Cursos</button></div></div>' +
    '<div class="ca-wrap"><div class="ca-main">' +
      '<div class="ca-stage" id="ca-stage"><div class="ca-zoom" role="group" aria-label="Zoom del mapa"><button type="button" class="iconbtn" data-z="in" aria-label="Acercar">+</button><button type="button" class="iconbtn" data-z="out" aria-label="Alejar">−</button><button type="button" class="iconbtn" data-z="fit" aria-label="Ver todo el mapa">Ver todo</button></div>' +
      '<div id="ca-svg"></div><p class="ca-hint">Arrastra para moverte · <kbd>Ctrl</kbd> + rueda o los botones para acercar · doble clic en un punto abre su ficha</p></div>' +
      '<div class="ca-list" id="ca-list"></div>' +
      '<div class="ca-legend" aria-label="Leyenda"></div></div>' +
    '<aside class="ca-panel" id="ca-panel" aria-live="polite" aria-label="Detalle del nodo seleccionado"></aside></div>';

  /* ── dibujo ── */
  function nodeEl(id){ return host.querySelector('[data-n="' + id + '"]'); }
  function stateMark(s){
    return s === 2 ? '<path d="M-5 0.5 L-1.5 4 L5 -3.5" class="ca-ck"/>' : s === 1 ? '<circle r="4" class="ca-half"/>' : "";
  }
  function build(){
    L = CAGrafo.layout(G, {expanded:S.expanded});
    base = {x:L.bounds.x, y:L.bounds.y, w:L.bounds.w, h:L.bounds.h};
    if(!vb) vb = {x:base.x, y:base.y, w:base.w, h:base.h};
    var pos = L.pos, s = "", edges = "", nodes = "", hier = "";
    function vis(id){ return !!pos[id]; }
    /* jerarquía: centro → bloque → tema */
    G.blocks.forEach(function(b){
      hier += '<line class="ca-h" data-e="h:' + b.id + '" x1="0" y1="0" x2="' + pos[b.id].x.toFixed(1) + '" y2="' + pos[b.id].y.toFixed(1) + '"/>';
      G.topics.forEach(function(t){ if(t.b === b.id && vis(t.id)) hier += '<line class="ca-h" data-e="h:' + t.id + '" x1="' + pos[b.id].x.toFixed(1) + '" y1="' + pos[b.id].y.toFixed(1) + '" x2="' + pos[t.id].x.toFixed(1) + '" y2="' + pos[t.id].y.toFixed(1) + '"/>'; });
    });
    /* relaciones entre temas (curvas hacia el centro para que no se pisen) */
    G.edges.forEach(function(e, i){
      if(!vis(e.from) || !vis(e.to)) return;
      var a = pos[e.from], b = pos[e.to], mx = (a.x + b.x) / 2 * 0.78, my = (a.y + b.y) / 2 * 0.78, rt = G.types[e.t];
      var c = {x:mx, y:my}, s0 = toward(a, c, R_TOPIC + 2), e0 = toward(b, c, R_TOPIC + 4);
      var sx = s0.x, sy = s0.y, ex = e0.x, ey = e0.y;
      var lx = 0.25 * sx + 0.5 * mx + 0.25 * ex, ly = 0.25 * sy + 0.5 * my + 0.25 * ey;
      edges += '<g class="ca-e" data-e="' + e.from + ">" + e.to + '" data-a="' + e.from + '" data-b="' + e.to + '"><path d="M' + sx.toFixed(1) + " " + sy.toFixed(1) + " Q" + mx.toFixed(1) + " " + my.toFixed(1) + " " + ex.toFixed(1) + " " + ey.toFixed(1) + '"' + (rt.d ? ' stroke-dasharray="' + rt.d + '"' : "") + (rt.s ? "" : ' marker-end="url(#ca-arr)"') + "/>" +
        '<text class="ca-el" x="' + lx.toFixed(1) + '" y="' + (ly - 5).toFixed(1) + '" text-anchor="middle">' + esc(rt.l) + "</text></g>";
    });
    /* temas ↔ cursos */
    if(S.courses) G.courses.forEach(function(c){
      (G.courseTopics[c.id] || []).forEach(function(id){ if(vis(id) && vis(c.id)) edges += '<line class="ca-ec" data-a="' + id + '" data-b="' + c.id + '" x1="' + pos[id].x.toFixed(1) + '" y1="' + pos[id].y.toFixed(1) + '" x2="' + pos[c.id].x.toFixed(1) + '" y2="' + pos[c.id].y.toFixed(1) + '"/>'; });
    });
    /* nodos */
    var lines = wrap(M.mapCenter, 12), ph = 24 + lines.length * 17;
    nodes += '<g class="ca-n ca-center" data-k="center" role="img" aria-label="' + esc(M.mapCenter) + '"><rect x="-62" y="' + (-ph / 2) + '" width="124" height="' + ph + '" rx="11"/>' +
      lines.map(function(l, i){ return '<text y="' + (-ph / 2 + 24 + i * 17) + '" text-anchor="middle">' + esc(l) + "</text>"; }).join("") + "</g>";
    /* El elemento interactivo (círculo o cuadrado) va aparte de su rótulo: el nombre accesible lleva el estado y las
       relaciones, y el rótulo visible se oculta a los lectores para que no se lea dos veces (WCAG 2.5.3). */
    function tspans(lb, y0, dy){ return lb.map(function(l, i){ return '<tspan x="0" y="' + (y0 + i * dy) + '">' + esc(l) + (i < lb.length - 1 ? " " : "") + "</tspan>"; }).join(""); }
    G.blocks.forEach(function(b){
      var p = pos[b.id], lb = wrap(b.t, 16), open = S.expanded[b.id], n = G.topics.filter(function(t){ return t.b === b.id; }).length;
      nodes += '<g class="ca-n ca-block" data-n="' + b.id + '" data-k="block" transform="translate(' + p.x.toFixed(1) + " " + p.y.toFixed(1) + ')">' +
        '<circle r="' + R_BLOCK + '" tabindex="0" role="button" aria-pressed="false" aria-label="' + esc(plain(b.t)) + ". Bloque " + b.n + ", " + n + (n === 1 ? " tema" : " temas") + (collapsible ? (open ? ", desplegado" : ", plegado") : "") + '"/>' +
        '<text class="ca-num" y="7" text-anchor="middle" aria-hidden="true">' + b.n + "</text>" +
        '<text class="ca-bl" text-anchor="middle" aria-hidden="true">' + tspans(lb, R_BLOCK + 20, 15) + "</text>" +
        (collapsible ? '<text class="ca-pm" y="' + (-R_BLOCK - 8) + '" text-anchor="middle" aria-hidden="true">' + (open ? "−" : "+ " + n) + "</text>" : "") + "</g>";
    });
    G.topics.forEach(function(t){
      if(!vis(t.id)) return;
      var p = pos[t.id], s = st(t.id), lb = wrap(t.t, 16), d = G.degree(t.id);
      nodes += '<g class="ca-n ca-topic ca-s' + s + '" data-n="' + t.id + '" data-k="topic" transform="translate(' + p.x.toFixed(1) + " " + p.y.toFixed(1) + ')">' +
        '<circle r="' + R_TOPIC + '" tabindex="0" role="button" aria-pressed="false" aria-label="' + esc(plain(t.t)) + ". Tema, " + ST[s].toLowerCase() + ", " + d + (d === 1 ? " relación" : " relaciones") + '"/>' + stateMark(s) +
        '<text class="ca-lb" text-anchor="middle" aria-hidden="true">' + tspans(lb, R_TOPIC + 17, 14) + "</text></g>";
    });
    if(S.courses) G.courses.forEach(function(c){
      if(!vis(c.id)) return;
      var p = pos[c.id], lb = wrap(c.t, 20);
      nodes += '<g class="ca-n ca-course" data-n="' + c.id + '" data-k="course" transform="translate(' + p.x.toFixed(1) + " " + p.y.toFixed(1) + ')">' +
        '<rect x="-12" y="-12" width="24" height="24" rx="6" tabindex="0" role="button" aria-pressed="false" aria-label="' + esc(plain(c.t)) + '. Curso"/><text class="ca-cl" y="5" text-anchor="middle" aria-hidden="true">C</text>' +
        '<text class="ca-lb" text-anchor="middle" aria-hidden="true">' + tspans(lb, 28, 14) + "</text></g>";
    });
    s = '<svg id="ca-map" viewBox="' + vb.x + " " + vb.y + " " + vb.w + " " + vb.h + '" role="group" aria-label="Mapa mental de ' + esc(M.mapCenter) + '. Hay una lista equivalente en la opción Lista." preserveAspectRatio="xMidYMid meet">' +
      '<defs><marker id="ca-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" class="ca-ah"/></marker></defs>' +
      '<g class="ca-g-h">' + hier + '</g><g class="ca-g-e">' + edges + '</g><g class="ca-g-n">' + nodes + "</g></svg>";
    $1("#ca-svg").innerHTML = s;
    svg = $1("#ca-map");
    bindSvg();
    applyFocus(); applyView();
  }
  function $1(s){ return host.querySelector(s); }

  /* ── resaltado: selección, vecinos y filtros (sin volver a dibujar) ── */
  function neighbours(id){
    var nb = {};
    if(G.topic[id]){
      G.edges.forEach(function(e){ if(e.from === id) nb[e.to] = true; else if(e.to === id) nb[e.from] = true; });
      nb[G.topic[id].b] = true;
      G.coursesOf(id).forEach(function(c){ nb[c] = true; });
    }else if(G.block[id]){
      G.topics.forEach(function(t){ if(t.b === id) nb[t.id] = true; });
    }else if(G.course[id]){
      (G.courseTopics[id] || []).forEach(function(t){ nb[t] = true; });
    }
    return nb;
  }
  function applyFocus(){
    if(!svg) return;
    var m = matchSet(), on = filterOn(), sel = S.sel, nb = sel ? neighbours(sel) : {};
    var n = m.__n; var stt = $1("#ca-status");
    stt.textContent = on ? (n === 1 ? "1 tema coincide" : n + " temas coinciden") + " de " + G.topics.length : G.topics.length + (G.topics.length === 1 ? " tema" : " temas");
    Array.prototype.forEach.call(svg.querySelectorAll(".ca-n[data-n]"), function(g){
      var id = g.getAttribute("data-n"), dim = (on && !m[id]) || (sel && id !== sel && !nb[id]);
      g.classList.toggle("ca-dim", !!dim); g.classList.toggle("ca-sel", id === sel); g.classList.toggle("ca-nb", !!(sel && nb[id]));
      var bt = g.querySelector("[role=button]"); if(bt) bt.setAttribute("aria-pressed", id === sel ? "true" : "false");
    });
    Array.prototype.forEach.call(svg.querySelectorAll(".ca-e, .ca-ec"), function(g){
      var a = g.getAttribute("data-a"), b = g.getAttribute("data-b");
      g.classList.toggle("ca-on", !!sel && (a === sel || b === sel));
      g.classList.toggle("ca-dim", (!!sel && a !== sel && b !== sel) || (on && !(m[a] && m[b])));
    });
    Array.prototype.forEach.call(svg.querySelectorAll(".ca-h"), function(l){
      var id = l.getAttribute("data-e").slice(2);
      l.classList.toggle("ca-dim", (on && !m[id]) || (!!sel && id !== sel && !nb[id] && sel !== "center"));
    });
    drawList(m); drawPanel();
  }
  function applyView(){
    if(!svg) return;
    var shown = Object.keys(L.pos).length;
    svg.classList.toggle("ca-dense", shown > 45);
    svg.classList.toggle("ca-zoomed", base.w / vb.w >= 1.5);
  }
  function setVB(){ svg.setAttribute("viewBox", vb.x.toFixed(1) + " " + vb.y.toFixed(1) + " " + vb.w.toFixed(1) + " " + vb.h.toFixed(1)); applyView(); }
  function toSvg(cx, cy){
    var r = svg.getBoundingClientRect(), sc = Math.min(r.width / vb.w, r.height / vb.h), ox = (r.width - vb.w * sc) / 2, oy = (r.height - vb.h * sc) / 2;
    return {x:vb.x + (cx - r.left - ox) / sc, y:vb.y + (cy - r.top - oy) / sc, sc:sc};
  }
  function zoomBy(f, cx, cy){
    var w = Math.min(base.w * 2.5, Math.max(base.w / 6, vb.w / f)), real = w / vb.w;
    var c = (cx === undefined) ? {x:vb.x + vb.w / 2, y:vb.y + vb.h / 2} : toSvg(cx, cy);
    vb = {x:c.x - (c.x - vb.x) * real, y:c.y - (c.y - vb.y) * real, w:w, h:vb.h * real}; setVB();
  }
  function fit(){ vb = {x:base.x, y:base.y, w:base.w, h:base.h}; setVB(); }
  function focusOn(id){
    var p = L.pos[id]; if(!p) return;
    var w = Math.min(vb.w, base.w / 1.6), h = w * base.h / base.w; vb = {x:p.x - w / 2, y:p.y - h / 2, w:w, h:h}; setVB();
  }
  /* Encuadra un bloque con todos sus temas visibles */
  function focusBranch(id){
    var ids = [id].concat(G.topics.filter(function(t){ return t.b === id && L.pos[t.id]; }).map(function(t){ return t.id; }));
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, pad = 90;
    ids.forEach(function(k){ var p = L.pos[k]; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
    var w = Math.max(x1 - x0 + 2 * pad, 260), h = Math.max(y1 - y0 + 2 * pad, 260), ar = base.w / base.h;
    if(w / h < ar) w = h * ar; else h = w / ar;
    vb = {x:(x0 + x1) / 2 - w / 2, y:(y0 + y1) / 2 - h / 2, w:w, h:h}; setVB();
  }

  /* ── interacción del mapa ── */
  /* opts.keep: no deseleccionar si ya estaba · opts.noToggle: pulsar un bloque no pliega ni despliega (lista y panel) */
  function select(id, opts){
    opts = opts || {};
    var toggles = collapsible && G.block[id] && !opts.noToggle;
    S.sel = (id === S.sel && !opts.keep && !toggles) ? null : id;
    if(S.sel && toggles){ S.expanded[S.sel] = !S.expanded[S.sel]; build(); if(S.expanded[S.sel]) focusBranch(S.sel); }
    else if(S.sel && G.topic[S.sel] && !L.pos[S.sel]){ S.expanded[G.topic[S.sel].b] = true; build(); focusOn(S.sel); }
    else applyFocus();
    ctx.onSelect(S.sel);
    if(S.sel && opts.focusMap){ var el = nodeEl(S.sel), bt = el && el.querySelector("[role=button]"); if(bt) bt.focus({preventScroll:true}); }
  }
  function bindSvg(){
    svg.addEventListener("click", function(e){
      if(dragged){ dragged = false; return; }
      var g = e.target.closest(".ca-n[data-n]");
      if(g) select(g.getAttribute("data-n"));
      else if(S.sel && !e.target.closest(".ca-n")) select(S.sel);
    });
    svg.addEventListener("dblclick", function(e){ var g = e.target.closest(".ca-topic[data-n]"); if(g){ e.preventDefault(); ctx.open(g.getAttribute("data-n")); } });
    svg.addEventListener("keydown", function(e){
      var g = e.target.closest(".ca-n[data-n]"); if(!g) return;
      if(e.key === "Enter" || e.key === " "){ e.preventDefault(); var id = g.getAttribute("data-n"); if(e.key === "Enter" && id === S.sel && G.topic[id]) ctx.open(id); else select(id, {focusMap:true}); }
    });
    svg.addEventListener("wheel", function(e){ if(e.ctrlKey || e.metaKey){ e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY); } }, {passive:false});
    svg.addEventListener("pointerdown", function(e){
      pts[e.pointerId] = {x:e.clientX, y:e.clientY};
      var ids = Object.keys(pts);
      if(ids.length === 2){ var a = pts[ids[0]], b = pts[ids[1]]; pinch = Math.hypot(a.x - b.x, a.y - b.y); drag = null; return; }
      if(e.target.closest(".ca-n")) return;
      drag = {x:e.clientX, y:e.clientY, vx:vb.x, vy:vb.y, moved:false}; try{ svg.setPointerCapture(e.pointerId); }catch(err){}
    });
    svg.addEventListener("pointermove", function(e){
      if(pts[e.pointerId]) pts[e.pointerId] = {x:e.clientX, y:e.clientY};
      var ids = Object.keys(pts);
      if(ids.length === 2 && pinch){ var a = pts[ids[0]], b = pts[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y); zoomBy(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch = d; dragged = true; return; }
      if(!drag) return;
      var r = svg.getBoundingClientRect(), sc = Math.min(r.width / vb.w, r.height / vb.h), dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if(Math.abs(dx) + Math.abs(dy) > 4){ drag.moved = true; dragged = true; }
      vb.x = drag.vx - dx / sc; vb.y = drag.vy - dy / sc; setVB();
    });
    function up(e){ delete pts[e.pointerId]; if(Object.keys(pts).length < 2) pinch = 0; if(drag && !Object.keys(pts).length){ drag = null; setTimeout(function(){ dragged = false; }, 0); } }
    svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  }
  $1("#ca-stage").addEventListener("click", function(e){
    var z = e.target.closest("[data-z]"); if(!z) return;
    var k = z.getAttribute("data-z"); if(k === "in") zoomBy(1.3); else if(k === "out") zoomBy(1 / 1.3); else fit();
  });
  $1("#ca-stage").addEventListener("keydown", function(e){
    if(e.target.tagName === "INPUT") return;
    if(e.key === "+" || e.key === "=") zoomBy(1.3); else if(e.key === "-") zoomBy(1 / 1.3); else if(e.key === "0") fit();
  });

  /* ── filtros y modo ── */
  function syncPressed(sel, val){
    Array.prototype.forEach.call(host.querySelectorAll(sel + " .fb"), function(b){ var on = b.getAttribute("data-v") === val; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false"); });
  }
  function syncControls(){
    syncPressed("#ca-fb", S.fb); syncPressed("#ca-fs", S.fs); syncPressed("#ca-mode", S.mode);
    var c = $1("#ca-courses"); c.classList.toggle("on", S.courses && !c.disabled); c.setAttribute("aria-pressed", S.courses && !c.disabled ? "true" : "false");
    $1(".ca-wrap").setAttribute("data-mode", S.mode);
    $1("#ca-q").value = S.q;
  }
  $1("#ca-q").addEventListener("input", function(e){ S.q = e.target.value; applyFocus(); });
  $1("#ca-fb").addEventListener("click", function(e){ var b = e.target.closest(".fb"); if(!b) return; S.fb = b.getAttribute("data-v"); if(S.fb && collapsible) S.expanded[S.fb] = true; syncControls(); if(collapsible) build(); else applyFocus(); });
  $1("#ca-fs").addEventListener("click", function(e){ var b = e.target.closest(".fb"); if(!b) return; S.fs = b.getAttribute("data-v"); syncControls(); applyFocus(); });
  $1("#ca-mode").addEventListener("click", function(e){
    var b = e.target.closest(".fb"); if(!b || b.disabled) return;
    if(b.id === "ca-courses"){ S.courses = !S.courses; syncControls(); build(); return; }
    S.mode = b.getAttribute("data-v"); syncControls();
  });

  /* ── lista por ramas (misma información, sin dibujo) ── */
  function dotHTML(id){ var s = st(id); return '<span class="td s' + s + '" title="' + ST[s] + '"></span>'; }
  function drawList(m){
    var on = filterOn(), h = "";
    G.blocks.forEach(function(b){
      var ts = G.topics.filter(function(t){ return t.b === b.id && (!on || m[t.id]); });
      if(on && !ts.length) return;
      var all = G.topics.filter(function(t){ return t.b === b.id; }), done = all.filter(function(t){ return st(t.id) === 2; }).length;
      h += '<section class="ca-lb-s"><h3><button type="button" class="ca-go' + (S.sel === b.id ? " on" : "") + '" data-go="' + b.id + '"><span class="ca-bn">' + b.n + "</span>" + esc(b.t) + '</button><span class="ca-cnt">' + done + " de " + all.length + " entendidos</span></h3><ul>" +
        ts.map(function(t){ return '<li><button type="button" class="ca-go' + (S.sel === t.id ? " on" : "") + '" data-go="' + t.id + '">' + dotHTML(t.id) + '<span class="ca-tt">' + t.t + '</span><span class="ca-cnt">' + G.degree(t.id) + (G.degree(t.id) === 1 ? " relación" : " relaciones") + "</span></button></li>"; }).join("") + "</ul></section>";
    });
    if(G.courses.length) h += '<section class="ca-lb-s"><h3><span class="ca-bn">C</span>Cursos</h3><ul>' + G.courses.map(function(c){ return '<li><button type="button" class="ca-go' + (S.sel === c.id ? " on" : "") + '" data-go="' + c.id + '"><span class="ca-tt">' + c.t + '</span><span class="ca-cnt">' + (G.courseTopics[c.id] || []).length + " temas</span></button></li>"; }).join("") + "</ul></section>";
    $1("#ca-list").innerHTML = h || '<p class="lead">Ningún tema coincide con los filtros.</p>';
  }

  /* ── panel de detalle ── */
  function linkTo(id, extra){ return '<button type="button" class="ca-lk" data-go="' + id + '">' + (G.topic[id] ? dotHTML(id) : "") + title(id) + "</button>" + (extra ? ' <span class="ca-w">' + extra + "</span>" : ""); }
  function drawPanel(){
    var id = S.sel, h = "", p = $1("#ca-panel");
    if(!id){
      h = '<h3>Selecciona un punto</h3><p class="ca-p">Verás aquí su resumen, sus relaciones y, si necesita conocimientos previos, la ruta de aprendizaje para llegar a él.</p>' +
        '<p class="ca-p">' + G.topics.length + (G.topics.length === 1 ? " tema" : " temas") + " en " + G.blocks.length + (G.blocks.length === 1 ? " bloque" : " bloques") + ", " + G.edges.length + (G.edges.length === 1 ? " relación" : " relaciones") + (G.courses.length ? ", " + G.courses.length + (G.courses.length === 1 ? " curso" : " cursos") : ", todavía ningún curso incorporado") + ".</p>";
    }else if(G.topic[id]){
      var t = G.topic[id], b = G.block[t.b], s = st(id), rt = G.route(id), gs = G.groups(id), dep = G.dependents(id);
      h = '<div class="ca-ph"><span class="chip acc">' + b.n + " · " + esc(b.t) + '</span><span class="chip">' + ST[s] + "</span>" + ctx.lv(t.lvl) + "</div><h3>" + t.t + '</h3><p class="ca-p">' + t.one + "</p>" +
        '<div class="ca-act"><a class="btn solid" href="#tema/' + t.id + '">Abrir ficha →</a></div>' +
        '<h4>Ruta de aprendizaje</h4>' + (rt.length ? '<ol class="ca-route">' + rt.map(function(x){ return "<li>" + linkTo(x) + "</li>"; }).join("") + '<li class="ca-cur">' + dotHTML(id) + '<b>' + t.t + "</b></li></ol>" : '<p class="ca-p">No necesita conocimientos previos del manual: puedes empezar por aquí.</p>') +
        (dep.length ? '<p class="ca-p">Después de este tema: ' + dep.map(function(x){ return linkTo(x); }).join(" · ") + ".</p>" : "") +
        '<h4>Relaciones</h4>' + (gs.length ? gs.map(function(g){ return '<div class="ca-grp"><div class="ca-gl">' + esc(g.label) + "</div><ul>" + g.items.map(function(x){ return "<li>" + linkTo(x.id, x.w) + "</li>"; }).join("") + "</ul></div>"; }).join("") : '<p class="ca-p">Todavía no tiene relaciones declaradas.</p>');
      var cs = G.coursesOf(id);
      if(cs.length) h += "<h4>Cursos de origen</h4><ul class=\"ca-ul\">" + cs.map(function(c){ return "<li>" + linkTo(c) + "</li>"; }).join("") + "</ul>";
    }else if(G.block[id]){
      var bl = G.block[id], ts = G.topics.filter(function(t){ return t.b === id; }), dn = ts.filter(function(t){ return st(t.id) === 2; }).length;
      h = '<div class="ca-ph"><span class="chip acc">Bloque ' + bl.n + "</span></div><h3>" + esc(bl.t) + '</h3><p class="ca-p">' + bl.s + '</p><p class="ca-p">' + dn + " de " + ts.length + " temas entendidos.</p>" +
        '<h4>Temas</h4><ul class="ca-ul">' + ts.map(function(t){ return "<li>" + linkTo(t.id) + "</li>"; }).join("") + "</ul>" +
        (collapsible ? '<p class="ca-p">' + (S.expanded[id] ? "Pulsa de nuevo el bloque para plegar sus temas." : "Pulsa de nuevo el bloque para desplegar sus temas.") + "</p>" : "");
    }else if(G.course[id]){
      var c = G.course[id];
      h = '<div class="ca-ph"><span class="chip ex">Curso</span></div><h3>' + c.t + '</h3><p class="ca-p">' + ((ctx.kinds || {})[c.k] || "") + (c.d ? " · consultado el " + fmtDate(c.d) : "") + "</p>" +
        (c.u ? '<div class="ca-act"><a class="btn" href="' + esc(c.u) + '" target="_blank" rel="noopener noreferrer">Abrir el curso original ↗</a></div>' : "") +
        '<h4>Temas que aporta</h4><ul class="ca-ul">' + (G.courseTopics[id] || []).map(function(x){ return "<li>" + linkTo(x) + "</li>"; }).join("") + "</ul>";
    }
    p.innerHTML = h;
  }
  $1(".ca-wrap").addEventListener("click", function(e){
    var g = e.target.closest("[data-go]"); if(!g) return;
    var id = g.getAttribute("data-go");
    if(g.closest("#ca-panel")){ select(id, {keep:true, noToggle:true}); if(S.mode === "mapa" && L.pos[id]) focusOn(id); }
    else select(id, {noToggle:true});
  });

  /* ── leyenda ── */
  function legend(){
    var h = '<div class="ca-lg"><b>Tu estado</b>' + ST.map(function(x, i){ return '<span class="ca-li"><svg width="22" height="22" viewBox="-12 -12 24 24" aria-hidden="true" class="ca-s' + i + '"><circle r="9"/>' + stateMark(i) + "</svg>" + x + "</span>"; }).join("") + "</div>" +
      '<div class="ca-lg"><b>Relaciones</b>' + Object.keys(G.types).map(function(k){ var t = G.types[k];
        return '<span class="ca-li"><svg width="34" height="12" viewBox="0 0 34 12" aria-hidden="true"><path d="M1 6 H' + (t.s ? 33 : 28) + '" class="ca-lp"' + (t.d ? ' stroke-dasharray="' + t.d + '"' : "") + "/>" + (t.s ? "" : '<path d="M27 2 L33 6 L27 10 z" class="ca-ah"/>') + "</svg>" + t.l + "</span>"; }).join("") + "</div>";
    $1(".ca-legend").innerHTML = h;
  }

  syncControls(); legend(); build();
  if(S.sel && S.mode === "mapa" && L.pos[S.sel] && collapsible) focusOn(S.sel);
}

window.CAMapa = {render:render, miniature:miniature};
})();
