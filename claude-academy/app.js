/* ══════════════════════════════════════════════════════════════
   Aplicación del manual (derivada del Manual de Power BI, ampliada con relaciones, fuentes y mapa)
   Vistas por hash: #  #temas  #mapa  #mapa/<id>  #glosario     Ficha: #tema/<id>
   Progreso, quiz, tema y estado del mapa viven en localStorage (prefijo MANUAL.slug).
   Necesita: MANUAL, BLOCKS, COURSES, SRCKINDS, VERSTATES, RELTYPES, GLOSS, LOG, TOPICS (content.js, temas/*.js),
   VIZ (viz.js), CAGrafo (grafo.js) y CAMapa (mapa.js).
   ══════════════════════════════════════════════════════════════ */
(function(){
"use strict";

var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var P = MANUAL.slug + "_";
var G = CAGrafo.build({TOPICS:TOPICS, BLOCKS:BLOCKS, COURSES:COURSES, RELTYPES:RELTYPES});
var byId = G.topic, blockById = G.block;
var VIEWS = ["home", "temas", "mapa", "glosario"];
var LVL = {1:"Básico", 2:"Intermedio", 3:"Avanzado"};
var TITLES = {home:MANUAL.title, temas:"Temas · " + MANUAL.title, mapa:"Mapa mental · " + MANUAL.title, glosario:"Glosario · " + MANUAL.title};

/* ── utilidades ── */
function load(k, d){ try{ var v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(P + k, JSON.stringify(v)); }catch(e){} }
function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function norm(s){ return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
function plain(h){ return String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function fmtDate(d){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ""); if(!m) return d || "";
  return +m[3] + " de " + ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][+m[2] - 1] + " de " + m[1];
}
var PROG = load("prog", {}), QUIZ = load("quiz", {});
function setProg(id, v){ if((PROG[id] || 0) >= v && v !== 0) return; PROG[id] = v; save("prog", PROG); }
function lv(n){ return '<span class="lv" title="Nivel ' + LVL[n] + '">' + [1,2,3].map(function(i){ return '<i class="' + (i <= n ? "on" : "") + '"></i>'; }).join("") + "</span>"; }
function dot(id){ var p = PROG[id] || 0; return '<span class="td ' + (p ? "s" + p : "") + '" title="' + (p === 2 ? "Lo entiendo" : p === 1 ? "En estudio" : "Pendiente") + '"></span>'; }
function topicLink(id){ return '<a href="#tema/' + id + '">' + byId[id].t + "</a>"; }

/* ── búsqueda: sin tildes ni mayúsculas, deben aparecer todas las palabras (en cualquier orden) ── */
function tokens(q){ return norm(q).split(/\s+/).filter(Boolean); }
function hit(text, toks){ return toks.every(function(w){ return text.indexOf(w) > -1; }); }
var textCache = {};
function topicText(t){
  return textCache[t.id] || (textCache[t.id] = norm(plain([t.t, t.q, t.one, t.key, (t.rec || []).join(" "), (t.kw || []).join(" "), (t.tags || []).join(" ")].join(" "))));
}
function matches(t, q){ return hit(topicText(t), tokens(q)); }

/* ── resaltado de código genérico (comentarios, cadenas, números) ── */
function hl(src){
  var out = "", i = 0, s = src, m;
  while(i < s.length){
    var r = s.slice(i);
    if((m = r.match(/^(--|\/\/|#)[^\n]*/))){ out += '<span class="c">' + esc(m[0]) + "</span>"; i += m[0].length; continue; }
    if((m = r.match(/^\/\*[\s\S]*?\*\//))){ out += '<span class="c">' + esc(m[0]) + "</span>"; i += m[0].length; continue; }
    if((m = r.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/))){ out += '<span class="s">' + esc(m[0]) + "</span>"; i += m[0].length; continue; }
    if((m = r.match(/^\d+(?:[.,]\d+)?/)) && !/[\w]/.test(s[i - 1] || "")){ out += '<span class="n">' + m[0] + "</span>"; i += m[0].length; continue; }
    if((m = r.match(/^[A-Za-z_][\w.]*/))){ out += esc(m[0]); i += m[0].length; continue; }
    out += esc(s[i]); i++;
  }
  return out;
}

/* ── tema claro / oscuro ── */
function isDark(){ var t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches; }
function syncThemeBtn(){ $("#themeBtn").textContent = isDark() ? "Claro" : "Oscuro"; }
$("#themeBtn").addEventListener("click", function(){
  var t = isDark() ? "light" : "dark"; document.documentElement.setAttribute("data-theme", t);
  try{ localStorage.setItem(P + "theme", t); }catch(e){} syncThemeBtn();
});
syncThemeBtn();

/* ── fuentes y verificación ── */
function srcHTML(s){
  if(typeof s === "string") return "<li>" + s + "</li>";
  var c = s.c && G.course[s.c], link = /^https:\/\//.test(s.u || "") ? '<a href="' + esc(s.u) + '" target="_blank" rel="noopener noreferrer">' + esc(s.t) + " ↗</a>" : esc(s.t);
  var meta = [];
  if(c) meta.push("Curso: " + esc(c.t));
  if(s.d) meta.push("Consultada el " + fmtDate(s.d));
  return '<li class="ca-src"><span class="chip ' + (s.k === "oficial" ? "acc" : "") + '">' + (SRCKINDS[s.k] || "Fuente") + "</span> " + link +
    (s.rev ? ' <span class="chip ex">Revisar enlace</span>' : "") + (meta.length ? '<span class="ca-sm">' + meta.join(" · ") + "</span>" : "") + "</li>";
}
function srcTitle(s){ return typeof s === "string" ? plain(s) : s.t; }
function verChip(t){
  var v = t.ver || {e:"pendiente"};
  return '<span class="chip ' + (v.e === "verificado" ? "ok" : v.e === "interno" ? "acc" : "ex") + '" title="' + esc(v.n || "") + '">' + (VERSTATES[v.e] || VERSTATES.pendiente) + "</span>";
}

/* ══ INICIO ══════════════════════════════ */
function blocksHTML(){
  return '<div class="blocks">' + BLOCKS.map(function(b){
    var ts = TOPICS.filter(function(t){ return t.b === b.id; }), done = ts.filter(function(t){ return PROG[t.id] === 2; }).length;
    return '<div class="bcard"><div class="bh"><span class="bn">' + b.n + '</span><div><h3>' + b.t + '</h3><p class="bs">' + b.s + '</p></div></div><ol class="bl">' +
      ts.map(function(t, i){ return '<li><a class="tlink" href="#tema/' + t.id + '"><span class="ti">' + b.n + "." + (i + 1) + '</span><span class="tt">' + t.t + "</span>" + dot(t.id) + "</a></li>"; }).join("") +
      '</ol><div class="bp"><span>' + done + " de " + ts.length + ' entendidos</span><span class="bar"><i style="width:' + (ts.length ? done / ts.length * 100 : 0) + '%"></i></span></div></div>';
  }).join("") + "</div>";
}
function coursesHTML(){
  if(!COURSES.length) return '<div class="ca-empty"><b>Todavía no hay ningún curso incorporado.</b><p>De momento el manual solo contiene su propia guía. Cuando se incorpore el primer curso aparecerá aquí con la fecha en que se consultó y los temas que aporta, y cada tema quedará enlazado a su lección de origen.</p></div>';
  return '<div class="cards">' + COURSES.map(function(c){
    var n = (G.courseTopics[c.id] || []).length;
    return '<a class="card" href="#mapa/' + c.id + '" style="text-decoration:none"><div class="cb">' + (SRCKINDS[c.k] || "Curso") + "</div><h3>" + c.t + '</h3><p class="cq">' + (c.d ? "Consultado el " + fmtDate(c.d) + ". " : "") + n + (n === 1 ? " tema" : " temas") + '.</p></a>';
  }).join("") + "</div>";
}
function logHTML(){
  return '<details class="ca-log"><summary>Registro de cambios (' + LOG.length + ')</summary>' + LOG.slice().reverse().map(function(l){
    function ids(a){ return a.map(function(x){ return byId[x] ? topicLink(x) : esc(x); }).join(", "); }
    return '<div class="ca-lg-e"><div class="ca-lg-d">' + fmtDate(l.d) + "</div><div><b>" + l.r + "</b>" +
      (l.nuevo && l.nuevo.length ? "<p>Temas nuevos: " + ids(l.nuevo) + ".</p>" : "") + (l.mod && l.mod.length ? "<p>Temas modificados: " + ids(l.mod) + ".</p>" : "") +
      (l.mapa ? "<p>Mapa: " + l.mapa + "</p>" : "") + (l.pend && l.pend.length ? "<p>Pendiente: " + l.pend.join(" ") + "</p>" : "") + "</div></div>";
  }).join("") + "</details>";
}
function renderHome(){
  var done = TOPICS.filter(function(t){ return PROG[t.id] === 2; }).length;
  var next = TOPICS.filter(function(t){ return PROG[t.id] !== 2; })[0] || TOPICS[0];
  var started = TOPICS.some(function(t){ return PROG[t.id]; });
  var autos = {"Temas":TOPICS.length, "Bloques":BLOCKS.length, "Cursos":COURSES.length, "Relaciones":G.edges.length};
  $("#view-home").innerHTML =
    '<div class="hero"><div><div class="eyebrow">Manual visual · edición ' + MANUAL.edition + '</div><h1>' + MANUAL.heroTitle + '</h1>' +
    '<p class="lead">' + MANUAL.lead + '</p>' +
    '<div class="hero-cta"><a class="btn solid" href="#tema/' + next.id + '">' + (started ? "Seguir por «" + plain(next.t) + "»" : "Empezar por «" + plain(next.t) + "»") + ' →</a><a class="btn" href="#mapa">Ver el mapa mental</a></div>' +
    '<div class="hero-stats">' + MANUAL.stats.map(function(s){ var n = s[1] === "auto" ? (autos[s[0]] !== undefined ? autos[s[0]] : "") : s[1]; return '<div class="hs"><div class="n">' + n + '</div><div class="l">' + s[0] + "</div></div>"; }).join("") + '</div></div>' +
    '<div class="hero-art">' + CAMapa.miniature(G, "Esquema del manual: " + MANUAL.mapCenter + ", " + BLOCKS.length + " bloques y " + TOPICS.length + " temas", MANUAL.mapCenter) + '<div class="ha-cap"><span>' + esc(MANUAL.mapCenter) + '</span><span>' + done + "/" + TOPICS.length + " entendidos</span></div></div></div>" +
    '<div class="sec-h"><h2>Cómo está pensado cada tema</h2><p>La misma secuencia en las ' + TOPICS.length + " fichas, de lo intuitivo a lo técnico.</p></div>" +
    '<div class="howgrid">' + MANUAL.how.map(function(h, i){ return '<div class="how"><span class="hn">' + (i + 1) + '</span><div class="hk">' + h[0] + "</div><p>" + h[1] + "</p></div>"; }).join("") + "</div>" +
    '<div class="sec-h"><h2>Ruta de aprendizaje</h2><p>' + BLOCKS.length + (BLOCKS.length === 1 ? " bloque" : " bloques") + ' en orden. El punto verde marca lo que ya entiendes.</p></div>' + blocksHTML() +
    '<div class="sec-h"><h2>Cursos incorporados</h2><p>' + COURSES.length + "</p></div>" + coursesHTML() +
    '<div class="sec-h"><h2>De dónde sale este manual</h2></div><p class="lead" style="max-width:820px">' + MANUAL.sources + "</p>" + logHTML();
}

/* ══ TEMAS (catálogo con búsqueda y filtros) ══ */
var temasState = {q:"", b:"", l:"", c:""};
function filterGroup(id, label, key, items){
  return '<div class="filters" id="' + id + '" role="group" aria-label="' + label + '">' + items.map(function(it, i){ return '<button class="fb' + (i ? "" : " on") + '" data-k="' + key + '" data-v="' + it[0] + '" aria-pressed="' + (i ? "false" : "true") + '">' + it[1] + "</button>"; }).join("") + "</div>";
}
function renderTemas(){
  var v = $("#view-temas");
  if(!v.dataset.ready){
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Catálogo</div><h2 class="th-title">Los ' + TOPICS.length + ' temas, de un vistazo</h2><p class="th-sub">Busca por concepto o con tus palabras, y filtra por bloque y nivel. Localiza tu problema en <b>«La pregunta que responde»</b>.</p></div>' +
      '<div class="toolbar"><label class="search"><span class="sr">Buscar tema</span><input id="tq" type="search" placeholder="Buscar un concepto…"></label><span class="count" id="tcount" role="status"></span></div>' +
      '<div class="toolbar">' + filterGroup("tfb", "Filtrar por bloque", "b", [["", "Todos"]].concat(BLOCKS.map(function(b){ return [b.id, b.t]; }))) +
      filterGroup("tfl", "Filtrar por nivel", "l", [["", "Todos los niveles"]].concat([1,2,3].map(function(n){ return [String(n), LVL[n]]; }))) +
      (COURSES.length ? filterGroup("tfc", "Filtrar por curso", "c", [["", "Todos los cursos"]].concat(COURSES.map(function(c){ return [c.id, esc(plain(c.t))]; }))) : "") + '</div><div class="cards" id="tcards"></div>';
    $("#tq").addEventListener("input", function(e){ temasState.q = e.target.value; drawCards(); });
    $$(".filters", v).forEach(function(g){ g.addEventListener("click", function(e){
      var b = e.target.closest(".fb"); if(!b) return;
      $$(".fb", g).forEach(function(x){ x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
      b.classList.add("on"); b.setAttribute("aria-pressed", "true"); temasState[b.dataset.k] = b.dataset.v; drawCards();
    }); });
    v.dataset.ready = "1";
  }
  drawCards();
}
function drawCards(){
  var list = TOPICS.filter(function(t){
    return (!temasState.b || t.b === temasState.b) && (!temasState.l || String(t.lvl) === temasState.l) &&
      (!temasState.c || G.coursesOf(t.id).indexOf(temasState.c) > -1) && (!temasState.q.trim() || matches(t, temasState.q));
  });
  $("#tcount").textContent = list.length + (list.length === 1 ? " tema" : " temas");
  $("#tcards").innerHTML = list.length ? list.map(function(t){
    var b = blockById[t.b];
    return '<a class="card" href="#tema/' + t.id + '" style="text-decoration:none"><div class="cb">' + b.n + " · " + b.t + '</div><h3>' + t.t + '</h3><p class="cq">' + t.q + '</p><div class="cf">' + (t.tags || []).map(function(x){ return '<span class="chip">' + esc(x) + "</span>"; }).join("") + '</div><div class="dmeta" style="margin-top:auto;padding-top:12px">' + lv(t.lvl) + "<span>" + LVL[t.lvl] + "</span>" + dot(t.id) + "</div></a>";
  }).join("") : '<p class="lead">Ningún tema coincide con la búsqueda.</p>';
}

/* ══ MAPA MENTAL ═════════════════════════ */
function renderMapa(sel){
  CAMapa.render($("#view-mapa"), {G:G, MANUAL:MANUAL, sel:sel, kinds:SRCKINDS, lv:lv,
    prog:function(id){ return PROG[id] || 0; }, matches:matches,
    open:function(id){ location.hash = "#tema/" + id; },
    onSelect:function(id){ try{ history.replaceState(null, "", "#mapa" + (id ? "/" + id : "")); }catch(e){} }});
}

/* ══ GLOSARIO ═════════════════════════════ */
function renderGlosario(){
  $("#view-glosario").innerHTML = '<div class="modehead"><div class="eyebrow">Glosario</div><h2 class="th-title">' + GLOSS.length + ' términos</h2><p class="th-sub">Cada término enlaza con el tema donde se explica.</p></div><div class="cards">' +
    GLOSS.slice().sort(function(a, b){ return a.k.localeCompare(b.k, "es"); }).map(function(g){
      return '<a class="card" href="#tema/' + g.t + '" style="text-decoration:none"><h3>' + g.k + '</h3><p class="cq">' + g.d + "</p></a>";
    }).join("") + "</div>";
}

/* ══ QUIZ Y VISUAL ═══════════════════════ */
function quizInner(t){
  return '<div class="qq">' + t.quiz.q + '</div><div class="qo" data-quiz="' + t.id + '">' + t.quiz.o.map(function(o, i){ return '<button type="button" data-o="' + i + '">' + o + "</button>"; }).join("") + "</div>";
}
function bindQuiz(root, t, cb){
  var qo = root.querySelector('[data-quiz="' + t.id + '"]');
  qo.addEventListener("click", function(e){
    var b = e.target.closest("button[data-o]"); if(!b || qo.dataset.done) return;
    qo.dataset.done = "1";
    var i = +b.dataset.o, ok = i === t.quiz.a;
    $$("button", qo).forEach(function(x){ x.disabled = true; if(+x.dataset.o === t.quiz.a) x.classList.add("ok"); });
    if(!ok) b.classList.add("ko");
    QUIZ[t.id] = ok; save("quiz", QUIZ);
    var w = document.createElement("div"); w.className = "qw"; w.innerHTML = "<b>" + (ok ? "Correcto." : "No es esa.") + "</b> " + t.quiz.w; qo.parentNode.insertBefore(w, qo.nextSibling);
    if(cb) cb(ok);
  });
}
function mountViz(id, host, note){
  host.innerHTML = '<div class="viz"><div class="viz-h"><span class="vt">Visual</span><div class="viz-ctrl"></div></div><div class="viz-b"></div>' + (note ? '<div class="viz-n"><b>Qué debes notar:</b> ' + note + "</div>" : "") + "</div>";
  var f = {title:$(".vt", host), ctrl:$(".viz-ctrl", host), body:$(".viz-b", host)};
  try{ if(typeof VIZ !== "undefined" && VIZ[id]) VIZ[id](f); else f.body.textContent = "Visual no disponible."; }
  catch(err){ f.body.textContent = "No se pudo cargar el visual."; if(window.console) console.error(err); }
}

/* ══ FICHA DE ESTUDIO (6 capítulos fijos) ═ */
var tocObs = null;
function labHTML(l){
  function ul(a){ return "<ul>" + a.map(function(x){ return "<li>" + x + "</li>"; }).join("") + "</ul>"; }
  return '<div class="ca-lab"><dl class="ca-dl"><dt>Objetivo</dt><dd>' + l.obj + "</dd><dt>Antes de empezar</dt><dd>" + ul(l.antes || []) + "</dd></dl>" +
    '<ol class="pasos">' + (l.pasos || []).map(function(p){ return "<li>" + p.h + '<span class="ca-why"><i>Qué ocurre:</i> ' + p.w + "</span></li>"; }).join("") + "</ol>" +
    '<dl class="ca-dl"><dt>Resultado esperado</dt><dd>' + l.res + "</dd><dt>Cómo comprobarlo</dt><dd>" + l.comprobar + "</dd></dl>" +
    (l.errores && l.errores.length ? '<div class="conf">' + l.errores.map(function(c){ return "<div><h4>" + c.t + "</h4><p>" + c.d + "</p></div>"; }).join("") + "</div>" : "") +
    '<dl class="ca-dl">' + (l.variantes && l.variantes.length ? "<dt>Variantes</dt><dd>" + ul(l.variantes) + "</dd>" : "") + (l.sig ? "<dt>Siguiente paso</dt><dd>" + l.sig + "</dd>" : "") + "</dl></div>";
}
function ejerHTML(a){
  return '<div class="ca-ej">' + a.map(function(x){ return '<details><summary><span class="chip acc">' + x.n + "</span> " + x.q + '</summary><div class="dbody"><p><b>Solución explicada.</b> ' + x.sol + "</p></div></details>"; }).join("") + "</div>";
}
function fitHTML(t){
  var gs = G.groups(t.id);
  return (gs.length ? gs.map(function(g){
    return '<div class="ca-grp"><div class="ca-gl">' + esc(g.label) + "</div><ul>" + g.items.map(function(x){ return "<li>" + topicLink(x.id) + (x.w ? ' <span class="ca-w">' + x.w + "</span>" : "") + "</li>"; }).join("") + "</ul></div>";
  }).join("") : '<p class="dbody">Este tema todavía no tiene relaciones declaradas con otros.</p>') +
    '<p><a class="btn" href="#mapa/' + t.id + '">Ver en el mapa mental</a></p>';
}
function renderTopic(id){
  var t = byId[id]; if(!t){ location.hash = "#temas"; return; }
  if(!PROG[t.id]) setProg(t.id, 1);
  var b = blockById[t.b], bt = TOPICS.filter(function(x){ return x.b === t.b; });
  var prev = TOPICS[t.i - 1], next = TOPICS[t.i + 1], pre = G.prereqs(t.id);
  var toc = [], body = "";
  function list(a){ return (a || []).map(function(x){ return "<li>" + x + "</li>"; }).join(""); }
  function chap(n, title, inner){ return '<section class="chap" id="c' + n + '"><div class="chap-h"><span class="chap-n">' + n + '</span><div><div class="k">Capítulo ' + n + "</div><h2>" + title + "</h2></div></div>" + inner + "</section>"; }
  function blk(sid, title, inner){ toc.push([sid, title]); return '<div class="blk" id="' + sid + '"><h3>' + title + "</h3>" + inner + "</div>"; }

  toc.push(["ch", "Entiéndelo"]);
  body += chap(1, "Entiéndelo",
    (pre.length ? '<div class="call warn ca-pre"><div class="ck">Antes de empezar</div><div class="dbody"><p>Conviene conocer: ' + pre.map(topicLink).join(", ") + ".</p></div></div>" : "") +
    blk("s-frase", "En una frase", '<p class="oneliner">' + t.one + "</p>") +
    blk("s-amigo", "Explicado como a un amigo", '<div class="call analog"><div class="ck">Analogía</div><div class="dbody"><p>' + t.friend + "</p></div></div>") +
    blk("s-pasos", "Cómo funciona, paso a paso", '<ol class="pasos">' + list(t.steps) + "</ol>") +
    blk("s-ej", "Un ejemplo con números", '<div class="mini"><div class="dbody">' + t.ex + "</div></div>") +
    blk("s-clave", "La idea clave", '<div class="call good"><div class="ck">Clave</div><div class="dbody"><p>' + t.key + "</p></div></div>"));
  toc.push(["ch", "Míralo en acción"]);
  body += chap(2, "Míralo en acción", blk("s-viz", "Visualízalo e interactúa", '<div id="vizHost"></div>'));
  toc.push(["ch", "Úsalo en un proyecto"]);
  body += chap(3, "Úsalo en un proyecto",
    blk("s-caso", "Caso real", '<div class="caso"><div class="csec">' + t.caso.sec + '</div><div class="cq">' + t.caso.q + '</div><div class="dbody">' + t.caso.html + "</div></div>") +
    blk("s-cuando", "¿Cuándo sí y cuándo no?", '<div class="yesno"><div class="y"><div class="ck">Úsalo cuando</div><ul>' + list(t.yes) + '</ul></div><div class="n"><div class="ck">Evítalo cuando</div><ul>' + list(t.no) + "</ul></div></div>") +
    (t.lab ? blk("s-lab", "Hazlo tú, paso a paso", labHTML(t.lab)) : "") +
    (t.ejer && t.ejer.length ? blk("s-ejer", "Ejercicios", ejerHTML(t.ejer)) : ""));
  toc.push(["ch", "Por dentro"]);
  body += chap(4, "Por dentro",
    (t.code && t.code.length ? blk("s-code", "El código", t.code.map(function(c, i){ return '<div class="code"><div class="cl"><span>' + c.l + " · " + c.t + '</span><button type="button" data-copy="' + i + '">Copiar</button></div><pre class="dcode"><code>' + hl(c.s) + "</code></pre></div>"; }).join("")) : "") +
    blk("s-conf", "Con qué se confunde", '<div class="conf">' + (t.conf || []).map(function(c){ return "<div><h4>" + c.t + "</h4><p>" + c.d + "</p></div>"; }).join("") + "</div>"));
  toc.push(["ch", "Ponte a prueba"]);
  body += chap(5, "Ponte a prueba",
    blk("s-rec", "Lo que tienes que recordar", '<div class="recall"><div class="ck">Recuerda</div><ul>' + list(t.rec) + "</ul></div>") +
    blk("s-quiz", "Comprueba si lo has entendido", '<div class="quiz" id="topicQuiz">' + (QUIZ[t.id] !== undefined ? '<div class="qmeta"><span>Ya la respondiste: ' + (QUIZ[t.id] ? "correcta" : "fallada") + '</span><button type="button" class="vbtn" id="qRetry">Responder de nuevo</button></div>' : "") + quizInner(t) + "</div>"));
  toc.push(["ch", "Nivel profesional"]);
  body += chap(6, "Nivel profesional",
    blk("s-pro", "Para cuando ya lo tengas claro", '<ul class="pro">' + (t.pro || []).map(function(p){ return '<li><span class="pk">' + p.k + "</span>" + p.t + "</li>"; }).join("") + "</ul>") +
    blk("s-encaja", "Dónde encaja", fitHTML(t)) +
    blk("s-src", "De dónde sale", '<ul class="ca-srcs">' + (t.src || []).map(srcHTML).join("") + '</ul><p class="ca-ver">' + verChip(t) + (t.ver && t.ver.d ? " Contrastado el " + fmtDate(t.ver.d) + "." : "") + (t.ver && t.ver.n ? " " + esc(t.ver.n) : "") + (t.upd ? ' <span class="ca-sm">Ficha revisada el ' + fmtDate(t.upd) + ".</span>" : "") + "</p>"));

  var tocHTML = '<div class="tt">En este tema</div><ol>' + toc.map(function(x){ return x[0] === "ch" ? '<li class="ch">' + x[1] + "</li>" : '<li><a href="#tema/' + t.id + '" data-sec="' + x[0] + '">' + x[1] + "</a></li>"; }).join("") + '</ol><div class="tprog"><div class="l">Tu progreso: <span id="progLbl"></span></div><button type="button" class="pbtn" id="progBtn"></button></div>';

  $("#detail").innerHTML = '<div class="dtop"><a class="dback" href="#temas">← Temas</a><span class="sep">/</span><span>' + b.n + " · " + b.t + '</span><span class="sep">/</span><span>Tema ' + b.n + "." + (bt.indexOf(t) + 1) + "</span></div>" +
    '<div class="dhero"><div><h1>' + t.t + '</h1><div class="dmeta"><span class="chip acc">' + b.t + '</span><span class="chip">' + lv(t.lvl) + " " + LVL[t.lvl] + "</span>" + (t.tags || []).map(function(x){ return '<span class="chip">' + esc(x) + "</span>"; }).join("") + '</div><p class="dhero-q">' + t.q + '</p></div>' +
    '<div class="dfacts"><h4>Ficha rápida</h4><dl><dt>Bloque</dt><dd>' + b.n + " · " + b.t + "</dd><dt>Nivel</dt><dd>" + LVL[t.lvl] + "</dd><dt>Código</dt><dd>" + (t.code && t.code.length ? "Sí" : "Sin código") + "</dd><dt>Contenido</dt><dd>" + verChip(t) + "</dd><dt>Fuente</dt><dd>" + esc((t.src || []).length ? srcTitle(t.src[0]) : "—") + "</dd></dl></div></div>" +
    '<div class="study"><nav class="stoc" aria-label="Índice del tema">' + tocHTML + '</nav><div class="smain">' + body +
    '<nav class="dnav" aria-label="Tema anterior y siguiente">' + (prev ? '<a href="#tema/' + prev.id + '"><span class="nk">← Anterior</span><span class="nt">' + prev.t + "</span></a>" : "<span></span>") + (next ? '<a class="nx" href="#tema/' + next.id + '"><span class="nk">Siguiente →</span><span class="nt">' + next.t + "</span></a>" : "") + "</nav></div></div>";

  function onQuiz(ok){ if(ok) setProg(t.id, 2); syncProgBtn(t); }
  mountViz(t.viz, $("#vizHost"), t.vizNote);
  bindQuiz($("#topicQuiz"), t, onQuiz);
  var rt = $("#qRetry"); if(rt) rt.addEventListener("click", function(){ var host = $("#topicQuiz"); host.innerHTML = quizInner(t); bindQuiz(host, t, onQuiz); });
  $$("[data-copy]", $("#detail")).forEach(function(bt){ bt.addEventListener("click", function(){ var src = t.code[+bt.dataset.copy].s; if(navigator.clipboard) navigator.clipboard.writeText(src).then(function(){ bt.textContent = "Copiado"; setTimeout(function(){ bt.textContent = "Copiar"; }, 1500); }); }); });
  $$(".stoc a[data-sec]").forEach(function(a){ a.addEventListener("click", function(e){ e.preventDefault(); var el = document.getElementById(a.dataset.sec); if(el) el.scrollIntoView({behavior:"smooth", block:"start"}); }); });
  $("#progBtn").addEventListener("click", function(){ PROG[t.id] = PROG[t.id] === 2 ? 1 : 2; save("prog", PROG); syncProgBtn(t); });
  syncProgBtn(t);
  if(tocObs) tocObs.disconnect();
  if("IntersectionObserver" in window){
    tocObs = new IntersectionObserver(function(ents){ ents.forEach(function(en){ if(en.isIntersecting){ $$(".stoc a").forEach(function(a){ a.classList.toggle("on", a.dataset.sec === en.target.id); }); } }); }, {rootMargin:"-90px 0px -70% 0px"});
    $$(".blk", $("#detail")).forEach(function(s){ tocObs.observe(s); });
  }
  document.title = plain(t.t) + " · " + MANUAL.title;
}
function syncProgBtn(t){
  var p = PROG[t.id] || 0, bt = $("#progBtn"), l = $("#progLbl"); if(!bt) return;
  l.textContent = p === 2 ? "Lo entiendo" : "En estudio";
  bt.textContent = p === 2 ? "Marcar como en estudio" : "Lo entiendo";
  bt.classList.toggle("on", p === 2);
}

/* ══ ROUTER ══════════════════════════════ */
function route(){
  var h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  var isTopic = h.indexOf("tema/") === 0, isMap = h === "mapa" || h.indexOf("mapa/") === 0;
  var view = isTopic ? "temas" : isMap ? "mapa" : (VIEWS.indexOf(h) > -1 ? h : "home");
  document.body.classList.toggle("detail-open", isTopic);
  $("#detail").classList.toggle("hidden", !isTopic);
  VIEWS.forEach(function(v){ $("#view-" + v).classList.toggle("hidden", isTopic || v !== view); });
  $$(".tnb").forEach(function(a){ var on = a.dataset.v === view; a.classList.toggle("active", on); if(on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if(isTopic){ renderTopic(h.slice(5)); window.scrollTo(0, 0); $("#detail").focus({preventScroll:true}); return; }
  if(isMap) renderMapa(h.length > 5 ? h.slice(5) : undefined);
  else ({home:renderHome, temas:renderTemas, glosario:renderGlosario})[view]();
  document.title = TITLES[view];
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ══ BUSCADOR (Ctrl K  o  /) ═════════════ */
var IDX = [], KORD = {"Tema":0, "Curso":1, "Glosario":2, "Sección":3};
TOPICS.forEach(function(t){ IDX.push({k:"Tema", n:plain(t.t), d:t.q, h:"#tema/" + t.id, s:topicText(t)}); });
COURSES.forEach(function(c){ IDX.push({k:"Curso", n:plain(c.t), d:c.u || "", h:"#mapa/" + c.id, s:norm(plain(c.t))}); });
GLOSS.forEach(function(g){ IDX.push({k:"Glosario", n:plain(g.k), d:g.d, h:"#tema/" + g.t, s:norm(plain(g.k + " " + g.d))}); });
[["Inicio", "#"], ["Todos los temas", "#temas"], ["Mapa mental", "#mapa"], ["Glosario", "#glosario"]].forEach(function(v){ IDX.push({k:"Sección", n:v[0], d:"Ir a la sección", h:v[1], s:norm(v[0])}); });
/* Resultados ordenados: el título contiene la consulta → el título contiene todas las palabras → el resto */
function search(q){
  var toks = tokens(q), nq = norm(q.trim());
  if(!toks.length) return [];
  function rank(x){ var n = norm(x.n); return n.indexOf(nq) > -1 ? 0 : hit(n, toks) ? 1 : 2; }
  return IDX.filter(function(x){ return hit(x.s, toks) || hit(norm(x.n), toks); }).map(function(x, i){ return {x:x, r:rank(x), i:i}; })
    .sort(function(a, b){ return a.r - b.r || KORD[a.x.k] - KORD[b.x.k] || a.i - b.i; }).map(function(o){ return o.x; });
}
window.CA = {search:search};
var qk = null, qkSel = 0, qkRes = [], qkPrev = null;
function openQk(){
  if(qk) return;
  qkPrev = document.activeElement;
  qk = document.createElement("div"); qk.className = "qk";
  qk.innerHTML = '<div class="qk-box" role="dialog" aria-modal="true" aria-label="Buscar en el manual"><input type="text" placeholder="Busca un tema o dilo con tus palabras…" aria-label="Buscar" autocomplete="off"><div class="qk-res" role="listbox"></div><div class="qk-foot"><span>↑ ↓ para moverte</span><span>Intro para abrir</span><span>Esc para cerrar</span></div></div>';
  document.body.appendChild(qk);
  var inp = $("input", qk);
  inp.addEventListener("input", function(){ qkSel = 0; drawQk(inp.value); });
  qk.addEventListener("click", function(e){ if(e.target === qk) closeQk(); var it = e.target.closest(".qk-it"); if(it){ location.hash = it.dataset.h; closeQk(); } });
  inp.addEventListener("keydown", function(e){
    if(e.key === "ArrowDown"){ e.preventDefault(); qkSel = Math.min(qkSel + 1, qkRes.length - 1); drawQk(inp.value); }
    else if(e.key === "ArrowUp"){ e.preventDefault(); qkSel = Math.max(qkSel - 1, 0); drawQk(inp.value); }
    else if(e.key === "Enter" && qkRes[qkSel]){ location.hash = qkRes[qkSel].h; closeQk(); }
    else if(e.key === "Escape"){ closeQk(); }
  });
  drawQk(""); inp.focus();
}
function closeQk(){ if(!qk) return; qk.remove(); qk = null; if(qkPrev && qkPrev.focus) qkPrev.focus(); }
function drawQk(q){
  qkRes = q.trim() ? search(q).slice(0, 30) : IDX.filter(function(x){ return x.k === "Sección" || x.k === "Tema"; }).slice(0, 12);
  $(".qk-res", qk).innerHTML = qkRes.length ? qkRes.map(function(x, i){ return '<button type="button" class="qk-it' + (i === qkSel ? " on" : "") + '" role="option" aria-selected="' + (i === qkSel) + '" data-h="' + x.h + '"><span class="qi">' + x.k + '</span><span class="qt"><span class="qn">' + esc(x.n) + '</span><span class="qd">' + esc(plain(x.d)) + "</span></span></button>"; }).join("") : '<div class="qk-empty">Sin resultados. Prueba con una palabra más corta o con un sinónimo.</div>';
}
$("#qkBtn").addEventListener("click", openQk);
document.addEventListener("keydown", function(e){
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"){ e.preventDefault(); qk ? closeQk() : openQk(); }
  else if(e.key === "/" && !qk && !/input|textarea|select/i.test(document.activeElement.tagName)){ e.preventDefault(); openQk(); }
});

route();
})();
