/* ══════════════════════════════════════════════════════════════
   MANUAL DE POWER BI · aplicación
   Vistas por hash: #  #metodo  #temas  #dax  #pl300  #glosario
   Ficha de estudio: #tema/<id>
   Progreso y respuestas se guardan en localStorage (solo en tu navegador).
   ══════════════════════════════════════════════════════════════ */
(function(){
"use strict";

var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var byId = {}; TOPICS.forEach(function(t, i){ t.i = i; byId[t.id] = t; });
var blockById = {}; BLOCKS.forEach(function(b){ blockById[b.id] = b; });
var VIEWS = ["home","metodo","temas","dax","pl300","proyectos","recursos","glosario"];
var NOTES = window.NOTES || [], EXAM = window.EXAM || [], PROJ = window.PROJ || [], RES = window.RES || [];
var notesBy = {}; NOTES.forEach(function(n){ (notesBy[n.t] = notesBy[n.t] || []).push(n); });
var examBy = {}; EXAM.forEach(function(e){ (examBy[e.t] = examBy[e.t] || []).push(e); });
function srcRoot(s){ return String(s).split(" · ")[0].replace(/\s*\(.*\)$/, ""); }
function plain(h){ return String(h).replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }
function srcList(){
  var m = {}, order = [];
  NOTES.concat(EXAM).forEach(function(n){ var r = srcRoot(n.s); if(!m[r]){ m[r] = {s:r, notes:0, exam:0, topics:{}}; order.push(r); } if(n.h) m[r].notes++; else m[r].exam++; if(n.t && n.t !== "pl300") m[r].topics[n.t] = 1; });
  return order.map(function(r){ return m[r]; });
}
function srcCount(){ return srcList().length; }
/* apuntes agrupados por fuente, como acordeón */
function notesHTML(list){
  var groups = [], gi = {};
  list.forEach(function(n){ var k = n.s; if(gi[k] === undefined){ gi[k] = groups.length; groups.push({s:k, items:[]}); } groups[gi[k]].items.push(n); });
  return '<div class="notes">' + groups.map(function(g){ return '<details class="note"><summary><span class="ns">' + g.s + '</span><span class="nc">' + g.items.length + (g.items.length === 1 ? " nota" : " notas") + '</span></summary><div class="nb dbody">' + g.items.map(function(n){ return n.h; }).join('<hr class="nsep">') + "</div></details>"; }).join("") + "</div>";
}
/* preguntas de examen con respuesta desplegable */
function examHTML(list){
  return '<div class="traps">' + list.map(function(e){ return '<details class="trap"><summary style="cursor:pointer;list-style:none"><span class="tk">' + e.k + (e.n ? " · " + e.n : "") + '</span><span class="tq">' + e.q + '</span><span class="tsrc">' + e.s + ' · Ver respuesta</span></summary><div class="ta" style="margin-top:8px">' + e.a + "</div></details>"; }).join("") + "</div>";
}
var LVL = {1:"Básico", 2:"Intermedio", 3:"Avanzado"};

/* ── almacenamiento seguro ── */
function load(k, d){ try{ var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function save(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
var PROG = load("pbi_prog", {}), QUIZ = load("pbi_quiz", {});
function setProg(id, v){ if((PROG[id] || 0) >= v && v !== 0) return; PROG[id] = v; save("pbi_prog", PROG); }

function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function lv(n){ return '<span class="lv" title="Nivel ' + LVL[n] + '">' + [1,2,3].map(function(i){ return '<i class="' + (i <= n ? "on" : "") + '"></i>'; }).join("") + "</span>"; }
function dot(id){ var p = PROG[id] || 0; return '<span class="td ' + (p ? "s" + p : "") + '" title="' + (p === 2 ? "Lo entiendo" : p === 1 ? "En estudio" : "Pendiente") + '"></span>'; }
function norm(s){ return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }

/* ── resaltado de código DAX / M ── */
var KW = /^(VAR|RETURN|let|in|each|if|then|else|TRUE|FALSE|ASC|DESC|ABS|REL|DAY|MONTH|QUARTER|YEAR|BOTH|ONEWAY|NONE|ROWS|SELECT|FROM|git)$/;
function hl(src){
  var out = "", i = 0, s = src;
  while(i < s.length){
    var r = s.slice(i), m;
    if((m = r.match(/^(--|\/\/|#)[^\n]*/)) && (m[1] !== "#" || /^#\s/.test(r))){ out += '<span class="c">' + esc(m[0]) + "</span>"; i += m[0].length; continue; }
    if((m = r.match(/^\/\*[\s\S]*?\*\//))){ out += '<span class="c">' + esc(m[0]) + "</span>"; i += m[0].length; continue; }
    if((m = r.match(/^"(?:[^"]|"")*"/))){ out += '<span class="s">' + esc(m[0]) + "</span>"; i += m[0].length; continue; }
    if((m = r.match(/^\d+(?:[.,]\d+)?/)) && !/[\w\]]/.test(s[i - 1] || "")){ out += '<span class="n">' + m[0] + "</span>"; i += m[0].length; continue; }
    if((m = r.match(/^[A-Za-zÁÉÍÓÚáéíóúñÑ_][\w.ÁÉÍÓÚáéíóúñÑ]*/))){
      var w = m[0], after = r.slice(w.length);
      if(KW.test(w)) out += '<span class="k">' + w + "</span>";
      else if(/^\s*\(/.test(after) && /^[A-Z][A-Z0-9.]*$|^[A-Z][a-z]+\.[A-Za-z.]+$/.test(w)) out += '<span class="f">' + w + "</span>";
      else out += esc(w);
      i += w.length; continue;
    }
    out += esc(s[i]); i++;
  }
  return out;
}

/* ── tema claro / oscuro ── */
function isDark(){ var t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches; }
function syncThemeBtn(){ $("#themeBtn").textContent = isDark() ? "Claro" : "Oscuro"; }
$("#themeBtn").addEventListener("click", function(){ var t = isDark() ? "light" : "dark"; document.documentElement.setAttribute("data-theme", t); try{ localStorage.setItem("pbi_theme", t); }catch(e){} syncThemeBtn(); });
syncThemeBtn();

/* ══ VISTAS ══════════════════════════════ */
function heroArt(){
  var s = '<svg viewBox="0 0 400 300" role="img" aria-label="Esquema de un modelo en estrella">', cx = 200, cy = 150, n = ["Fecha","Tienda","Producto","Cliente","Empleado"];
  n.forEach(function(d, i){ var a = -Math.PI / 2 + i * 2 * Math.PI / 5, x = cx + 118 * Math.cos(a), y = cy + 108 * Math.sin(a);
    s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '" style="stroke:var(--line-2);stroke-width:1.5"/>';
    s += '<rect x="' + (x - 44) + '" y="' + (y - 16) + '" width="88" height="32" rx="8" style="fill:var(--card);stroke:var(--line-2)"/><text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" style="font-size:12.5px;font-weight:600;fill:var(--ink)">' + d + "</text>"; });
  s += '<rect x="' + (cx - 54) + '" y="' + (cy - 24) + '" width="108" height="48" rx="10" style="fill:var(--accent)"/><text x="' + cx + '" y="' + (cy + 7) + '" text-anchor="middle" style="font-family:var(--serif);font-size:20px;fill:var(--on-accent)">Ventas</text></svg>';
  return s;
}
function blocksHTML(){
  return '<div class="blocks">' + BLOCKS.map(function(b){
    var ts = TOPICS.filter(function(t){ return t.b === b.id; }), done = ts.filter(function(t){ return PROG[t.id] === 2; }).length;
    return '<div class="bcard"><div class="bh"><span class="bn">' + b.n + '</span><div><h3>' + b.t + '</h3><p class="bs">' + b.s + '</p></div></div><ol class="bl">' +
      ts.map(function(t){ return '<li><a class="tlink" href="#tema/' + t.id + '"><span class="ti">' + b.n + "." + (ts.indexOf(t) + 1) + '</span><span class="tt">' + t.t + "</span>" + dot(t.id) + "</a></li>"; }).join("") +
      '</ol><div class="bp"><span>' + done + " de " + ts.length + ' entendidos</span><span class="bar"><i style="width:' + (done / ts.length * 100) + '%"></i></span></div></div>';
  }).join("") + "</div>";
}
function renderHome(){
  var done = TOPICS.filter(function(t){ return PROG[t.id] === 2; }).length;
  var next = TOPICS.filter(function(t){ return PROG[t.id] !== 2; })[0] || TOPICS[0];
  $("#view-home").innerHTML =
    '<div class="hero"><div><div class="eyebrow">Manual visual · edición octubre 2026</div><h1>Manual de <em>Power BI</em></h1>' +
    '<p class="lead">' + TOPICS.length + ' temas contados en el orden en que se construye una solución real: primero la pregunta de negocio, después el modelo en estrella, Power Query y DAX, y al final el informe, la publicación y la seguridad. Cada tema con su analogía, un ejemplo con números, un visual interactivo, el código y una pregunta para comprobar que lo has entendido.</p>' +
    '<div class="hero-cta"><a class="btn solid" href="#tema/' + next.id + '">' + (done ? "Seguir por «" + next.t + "»" : "Empezar por el primer tema") + ' →</a><a class="btn" href="#pl300">Preparar la PL-300</a></div>' +
    '<div class="hero-stats"><div class="hs"><div class="n">' + TOPICS.length + '</div><div class="l">Temas</div></div><div class="hs"><div class="n">' + NOTES.length + '</div><div class="l">Apuntes de Notion</div></div><div class="hs"><div class="n">' + DAXREF.length + '</div><div class="l">Funciones DAX</div></div><div class="hs"><div class="n">' + (PL300.traps.length + TOPICS.length + EXAM.length) + '</div><div class="l">Preguntas de examen</div></div></div></div>' +
    '<div class="hero-art">' + heroArt() + '<div class="ha-cap"><span>El <b>modelo en estrella</b>: la base de todo lo demás</span><span>' + done + "/" + TOPICS.length + " entendidos</span></div></div></div>" +
    '<div class="sec-h"><h2>Cómo está pensado cada tema</h2><p>La misma secuencia en las ' + TOPICS.length + " fichas, de lo intuitivo a lo técnico.</p></div>" +
    '<div class="howgrid">' + [
      ["Entiéndelo","La idea en una frase, una analogía, los pasos y un ejemplo con números de Tiendas AHORA."],
      ["Míralo en acción","Un visual interactivo propio del tema: toca los controles y fíjate en lo que cambia."],
      ["Úsalo en un proyecto","Un caso real, cuándo sí y cuándo no, y el error típico que conviene evitar."],
      ["Por dentro","El código DAX o M listo para copiar y los conceptos con los que se confunde."],
      ["Ponte a prueba","Lo que tienes que recordar y una pregunta de autochequeo con progreso guardado."],
      ["Nivel profesional","Matices de proyectos reales y las trampas que aparecen en el examen PL-300."]
      ,["Apuntes completos","Todo lo que guardé en Notion sobre ese tema, agrupado por curso, libro o masterclass, con sus preguntas de examen."]
    ].map(function(h, i){ return '<div class="how"><span class="hn">' + (i + 1) + '</span><div class="hk">' + h[0] + "</div><p>" + h[1] + "</p></div>"; }).join("") + "</div>" +
    '<div class="sec-h"><h2>Ruta de aprendizaje</h2><p>' + BLOCKS.length + ' bloques: los seis primeros en el orden del método BI7 y uno de ampliación profesional. El punto verde marca lo que ya entiendes.</p></div>' + blocksHTML() +
    '<div class="sec-h"><h2>De dónde sale este manual</h2><p>' + NOTES.length + ' apuntes de ' + srcCount() + ' cursos, libros y masterclasses, reorganizados por tema. <a href="#recursos">Ver todas las fuentes</a>.</p></div>' +
    '<div class="cards">' + [
      ["Libros","Impacta con Power BI y Modelado de datos","Salvador Ramos (método BI7, caso Tiendas AHORA y cuadros de mando) y Javier Sánchez Rivero (modelado con Power Query y DAX)."],
      ["Certificación","PL-300: Microsoft Power BI Data Analyst","Temario de Alex Ayala (NamasData), apuntes de alumnos, casos de estudio, ExamTopics y preguntas tipo Microsoft Learn."],
      ["Cursos","DAX, M, modelado y finanzas","Ana María Bisbé, Javier Sánchez Rivero, Fundamentos de M, Power Query Esencial, informes financieros, Python y Microsoft Fabric."],
      ["Masterclasses","Visualización, herramientas y método","Claudio Trombini, Paula García, Bernat Agulló, Federico Pastor, DAX Studio, Power UI y el Manual DataViz."]
    ].map(function(c){ return '<div class="card" style="cursor:default"><div class="cb">' + c[0] + "</div><h3>" + c[1] + '</h3><p class="cq">' + c[2] + "</p></div>"; }).join("") + "</div>" +
    '<div class="sec-h"><h2>Más allá de los temas</h2><p>Proyectos reales, recursos y el banco de preguntas.</p></div><div class="cards">' +
      '<a class="card" href="#proyectos" style="text-decoration:none"><div class="cb">Proyectos</div><h3>' + PROJ.length + ' dashboards propios</h3><p class="cq">Contexto, problema, modelo, decisiones de diseño y lo aprendido en cada uno.</p></a>' +
      '<a class="card" href="#pl300" style="text-decoration:none"><div class="cb">Banco de preguntas</div><h3>' + EXAM.length + ' preguntas de examen</h3><p class="cq">Filtra por categoría, fuente o palabra y comprueba la respuesta.</p></a>' +
      '<a class="card" href="#recursos" style="text-decoration:none"><div class="cb">Recursos</div><h3>' + RES.length + ' enlaces y libros</h3><p class="cq">Herramientas de diseño, perfiles a seguir, documentación, datasets y chuletas.</p></a></div>';
}

function renderMetodo(){
  var steps = [["Preguntas de negocio",["preguntas","bi","gestion"]],["Diseño del modelo",["estrella","plana","relaciones"]],["Power Query",["obtener","perfilado","transformar","m","combinar","dataflows"]],["Optimizar el modelo",["vertipaq","calendario","relaciones","herramientas"]],["Cálculos DAX",["medidas","contextos","iteradores","calculate","funtabla","logica","ti","grupos","window","consultasdax"]],["Informes",["percepcion","graficosav","interactividad","storytelling","financiero"]],["Compartir y colaborar",["service","roles","rls","git","fabric"]]];
  $("#view-metodo").innerHTML = '<div class="modehead"><div class="eyebrow">Método BI7</div><h2 class="th-title">Siete pasos, siempre en el mismo orden</h2><p class="th-sub">El ciclo de desarrollo del libro <b>Impacta con Power BI</b>. Las preguntas van antes que las respuestas y el modelo se diseña antes de abrir Power BI. Cada paso enlaza con los temas del manual que lo desarrollan.</p></div>' +
    '<div id="metodoViz"></div><div class="sec-h"><h2>Qué estudiar en cada paso</h2><p>Pulsa un tema para abrir su ficha.</p></div><div class="blocks">' +
    steps.map(function(s, i){ return '<div class="bcard"><div class="bh"><span class="bn">' + (i + 1) + '</span><div><h3>' + s[0] + '</h3></div></div><ol class="bl">' + s[1].map(function(id){ var t = byId[id]; return '<li><a class="tlink" href="#tema/' + id + '"><span class="tt">' + t.t + "</span>" + dot(id) + "</a></li>"; }).join("") + "</ol></div>"; }).join("") + "</div>";
  mountViz("bi7", $("#metodoViz"), "Pulsa cada paso del ciclo y usa «Ir al tema» para estudiarlo.");
}

var temasState = {q:"", b:"", l:""};
function renderTemas(){
  var v = $("#view-temas");
  if(!v.dataset.ready){
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Catálogo</div><h2 class="th-title">Los ' + TOPICS.length + ' temas, de un vistazo</h2><p class="th-sub">Busca por concepto o función, filtra por bloque y nivel. Localiza tu problema en <b>«La pregunta que responde»</b>: si tu caso suena así, ese es tu tema.</p></div>' +
      '<div class="toolbar"><label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><span class="sr">Buscar tema</span><input id="tq" type="search" placeholder="Buscar: CALCULATE, granularidad, RLS…"></label><span class="count" id="tcount"></span></div>' +
      '<div class="toolbar"><div class="filters" id="tfb" role="group" aria-label="Filtrar por bloque"><button class="fb on" data-b="" aria-pressed="true">Todos</button>' + BLOCKS.map(function(b){ return '<button class="fb" data-b="' + b.id + '" aria-pressed="false">' + b.t + "</button>"; }).join("") + '</div><div class="filters" id="tfl" role="group" aria-label="Filtrar por nivel"><button class="fb on" data-l="" aria-pressed="true">Todos los niveles</button>' + [1,2,3].map(function(n){ return '<button class="fb" data-l="' + n + '" aria-pressed="false">' + LVL[n] + "</button>"; }).join("") + '</div></div><div class="cards" id="tcards"></div><div class="nomatch hidden" id="tnm">Sin resultados. Prueba con otra palabra.</div>';
    $("#tq").addEventListener("input", function(e){ temasState.q = e.target.value; drawCards(); });
    [["#tfb","b"],["#tfl","l"]].forEach(function(p){ $(p[0]).addEventListener("click", function(e){ var b = e.target.closest(".fb"); if(!b) return; $$(".fb", $(p[0])).forEach(function(x){ x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); }); b.classList.add("on"); b.setAttribute("aria-pressed", "true"); temasState[p[1]] = b.dataset[p[1]]; drawCards(); }); });
    v.dataset.ready = "1";
  }
  drawCards();
}
var topicTextCache = {};
function topicText(t){ if(topicTextCache[t.id]) return topicTextCache[t.id]; return (topicTextCache[t.id] = norm([t.t, t.q, t.one, t.key, (t.code || []).map(function(c){ return c.s; }).join(" "), (t.rec || []).join(" "), (notesBy[t.id] || []).map(function(n){ return plain(n.h); }).join(" ")].join(" "))); }
function drawCards(){
  var q = norm(temasState.q.trim());
  var list = TOPICS.filter(function(t){ return (!temasState.b || t.b === temasState.b) && (!temasState.l || String(t.lvl) === temasState.l) && (!q || topicText(t).indexOf(q) > -1); });
  $("#tcards").innerHTML = list.map(function(t){ var b = blockById[t.b]; return '<a class="card" href="#tema/' + t.id + '" style="text-decoration:none"><div class="ct"><span class="cb">' + b.n + " · " + b.t + "</span>" + lv(t.lvl) + "</div><h3>" + t.t + '</h3><p class="cq">' + t.q + '</p><div class="cf"><span class="chip">' + LVL[t.lvl] + "</span>" + (PROG[t.id] === 2 ? '<span class="chip ok">Lo entiendo</span>' : PROG[t.id] === 1 ? '<span class="chip acc">En estudio</span>' : "") + (t.exam && t.exam.length ? '<span class="chip ex">PL-300</span>' : "") + (notesBy[t.id] ? '<span class="chip">' + notesBy[t.id].length + " apuntes</span>" : "") + "</div></a>"; }).join("");
  $("#tcount").textContent = list.length + " de " + TOPICS.length + " temas";
  $("#tnm").classList.toggle("hidden", list.length > 0);
}

var daxState = {q:"", c:""};
function renderDax(){
  var v = $("#view-dax");
  if(!v.dataset.ready){
    var cats = []; DAXREF.forEach(function(d){ if(cats.indexOf(d.c) < 0) cats.push(d.c); });
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Referencia DAX</div><h2 class="th-title">Las funciones que de verdad se usan</h2><p class="th-sub">' + DAXREF.length + ' funciones con su sintaxis, qué hacen en una línea y el tema del manual donde se explican con ejemplos. Para la referencia completa, <a href="https://dax.guide/" target="_blank" rel="noopener">dax.guide</a>.</p></div>' +
      '<div class="toolbar"><label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><span class="sr">Buscar función</span><input id="dq" type="search" placeholder="Buscar función o descripción…"></label><span class="count" id="dcount"></span></div>' +
      '<div class="toolbar"><div class="filters" id="dfc" role="group" aria-label="Filtrar por categoría"><button class="fb on" data-c="" aria-pressed="true">Todas</button>' + cats.map(function(c){ return '<button class="fb" data-c="' + c + '" aria-pressed="false">' + c + "</button>"; }).join("") + '</div></div><div class="tw"><table class="dxtbl"><thead><tr><th>Función</th><th>Categoría</th><th>Sintaxis y uso</th><th>Tema</th></tr></thead><tbody id="dbody"></tbody></table></div>';
    $("#dq").addEventListener("input", function(e){ daxState.q = e.target.value; drawDax(); });
    $("#dfc").addEventListener("click", function(e){ var b = e.target.closest(".fb"); if(!b) return; $$(".fb", $("#dfc")).forEach(function(x){ x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); }); b.classList.add("on"); b.setAttribute("aria-pressed", "true"); daxState.c = b.dataset.c; drawDax(); });
    v.dataset.ready = "1";
  }
  drawDax();
}
function drawDax(){
  var q = norm(daxState.q.trim());
  var list = DAXREF.filter(function(d){ return (!daxState.c || d.c === daxState.c) && (!q || norm(d.f + " " + d.c + " " + d.d + " " + d.s).indexOf(q) > -1); });
  $("#dbody").innerHTML = list.map(function(d){ return "<tr><td><code>" + esc(d.f) + '</code></td><td><span class="chip">' + d.c + '</span></td><td><div class="sx">' + esc(d.s) + '</div><div style="margin-top:4px">' + d.d + '</div></td><td class="tl"><a href="#tema/' + d.t + '">' + byId[d.t].t + "</a></td></tr>"; }).join("") || '<tr><td colspan="4" class="nomatch">Sin resultados.</td></tr>';
  $("#dcount").textContent = list.length + " de " + DAXREF.length + " funciones";
}

function renderGlosario(){
  var v = $("#view-glosario");
  if(!v.dataset.ready){
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Glosario</div><h2 class="th-title">' + GLOSS.length + ' términos en una línea</h2><p class="th-sub">Cada término enlaza con el tema donde se explica a fondo.</p></div><div class="toolbar"><label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><span class="sr">Buscar término</span><input id="gq" type="search" placeholder="Buscar término…"></label></div><dl class="gl" id="glist"></dl>';
    $("#gq").addEventListener("input", drawGloss);
    v.dataset.ready = "1";
  }
  drawGloss();
}
function drawGloss(){
  var q = norm(($("#gq") || {}).value || "");
  var list = GLOSS.slice().sort(function(a, b){ return a.k.localeCompare(b.k, "es"); }).filter(function(g){ return !q || norm(g.k + " " + g.d).indexOf(q) > -1; });
  $("#glist").innerHTML = list.map(function(g){ return "<div><dt>" + g.k + "</dt><dd>" + g.d + '<br><a href="#tema/' + g.t + '" style="font-size:13px">' + byId[g.t].t + "</a></dd></div>"; }).join("") || '<p class="nomatch">Sin resultados.</p>';
}

/* proyectos propios */
function renderProyectos(){
  var v = $("#view-proyectos"); if(v.dataset.ready) return;
  var cats = []; PROJ.forEach(function(p){ if(cats.indexOf(p.cat) < 0) cats.push(p.cat); });
  v.innerHTML = '<div class="modehead"><div class="eyebrow">Proyectos</div><h2 class="th-title">' + PROJ.length + ' dashboards construidos con Power BI</h2><p class="th-sub">Cada proyecto responde a preguntas concretas de negocio. Para cada uno: el contexto, el problema, cómo se estructuró el modelo, qué se hizo diferente y qué aprendí. Los temas del manual explican cada técnica.</p></div>' +
    cats.map(function(c){ return '<div class="sec-h"><h2>' + c + '</h2></div><div class="projs">' + PROJ.filter(function(p){ return p.cat === c; }).map(function(p){
      return '<article class="proj"><div class="ph"><h3>' + p.t + '</h3><span class="chip">' + p.tools + "</span></div>" +
        '<dl class="pdl"><dt>Contexto</dt><dd>' + p.ctx + "</dd><dt>El problema</dt><dd>" + p.prob + "</dd><dt>Modelo y enfoque</dt><dd>" + p.model + "</dd><dt>Qué hice diferente</dt><dd>" + p.diff + "</dd><dt>Qué aprendí</dt><dd>" + p.learn + "</dd></dl>" +
        (p.url ? '<a class="btn" href="' + p.url + '" target="_blank" rel="noopener">Abrir el informe interactivo →</a>' : "") + "</article>"; }).join("") + "</div>"; }).join("");
  v.dataset.ready = "1";
}

/* recursos y fuentes */
function renderRecursos(){
  var v = $("#view-recursos"); if(v.dataset.ready) return;
  var cats = []; RES.forEach(function(r){ if(cats.indexOf(r.cat) < 0) cats.push(r.cat); });
  var srcs = srcList().sort(function(a, b){ return (b.notes + b.exam) - (a.notes + a.exam); });
  v.innerHTML = '<div class="modehead"><div class="eyebrow">Recursos</div><h2 class="th-title">Enlaces, libros y fuentes</h2><p class="th-sub">Todo lo que tenía guardado en Notion para trabajar con Power BI: herramientas de diseño, perfiles a seguir, libros, documentación, datasets y chuletas. Abajo, las fuentes de los apuntes y los temas donde aparecen.</p></div>' +
    '<div class="rgrid">' + cats.map(function(c){ return '<div class="bcard"><h3 class="rh">' + c + '</h3><ul class="rl">' + RES.filter(function(r){ return r.cat === c; }).map(function(r){ return "<li>" + (r.url ? '<a href="' + r.url + '" target="_blank" rel="noopener">' + esc(r.name) + "</a>" : "<span>" + esc(r.name) + "</span>") + (r.note ? '<span class="rn">' + esc(r.note) + "</span>" : "") + "</li>"; }).join("") + "</ul></div>"; }).join("") + "</div>" +
    '<div class="sec-h"><h2>Fuentes de los apuntes</h2><p>' + srcs.length + " fuentes · " + NOTES.length + " apuntes · " + EXAM.length + ' preguntas.</p></div><div class="tw"><table class="dxtbl"><thead><tr><th>Fuente</th><th>Apuntes</th><th>Preguntas</th><th>Temas</th></tr></thead><tbody>' +
    srcs.map(function(s){ return "<tr><td>" + esc(s.s) + "</td><td>" + s.notes + "</td><td>" + s.exam + '</td><td class="tl">' + Object.keys(s.topics).filter(function(id){ return byId[id]; }).map(function(id){ return '<a href="#tema/' + id + '">' + byId[id].t + "</a>"; }).join(" · ") + "</td></tr>"; }).join("") + "</tbody></table></div>";
  v.dataset.ready = "1";
}

/* simulador PL-300 */
var exam = null;
function shuffle(a){ a = a.slice(); for(var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function renderPL300(){
  var v = $("#view-pl300");
  var answered = TOPICS.filter(function(t){ return QUIZ[t.id] !== undefined; }), ok = answered.filter(function(t){ return QUIZ[t.id]; }).length;
  v.innerHTML = '<div class="modehead"><div class="eyebrow">Certificación PL-300</div><h2 class="th-title">Microsoft Power BI Data Analyst</h2><p class="th-sub">Los cuatro dominios del examen, las trampas que más se repiten según mis apuntes de preparación y un simulador con las preguntas de autochequeo de todos los temas. El aprobado está en <b>700 sobre 1.000</b>.</p></div>' +
    '<div class="dom">' + PL300.domains.map(function(d){ return '<div><div class="dp">' + d.p + "</div><h4>" + d.t + "</h4><p>" + d.d + '</p><div class="pill-row" style="margin-top:10px">' + d.topics.map(function(id){ return '<a class="pill" href="#tema/' + id + '" style="text-decoration:none">' + byId[id].t + "</a>"; }).join("") + "</div></div>"; }).join("") + "</div>" +
    '<div class="sec-h"><h2>Trampas que se repiten</h2><p>' + PL300.traps.length + ' situaciones de examen con su respuesta.</p></div><div class="traps">' + PL300.traps.map(function(t){ return '<details class="trap"><summary style="cursor:pointer;list-style:none"><span class="tk">' + t.k + '</span><span class="tq">' + t.q + '</span><span style="font-size:12.5px;color:var(--accent-ink)">Ver respuesta</span></summary><div class="ta" style="margin-top:8px">' + t.a + "</div></details>"; }).join("") + "</div>" +
    '<div class="sec-h"><h2>Simulador</h2><p>Has respondido ' + answered.length + " de " + TOPICS.length + " preguntas de autochequeo (" + ok + ' correctas).</p></div><div id="examBox"></div>' +
    '<div class="sec-h"><h2>Banco de preguntas de mis apuntes</h2><p>' + EXAM.length + ' preguntas de exámenes de repaso, casos de estudio, ExamTopics, Microsoft Learn y cursos, con su respuesta.</p></div><div id="bankBox"></div>' +
    (notesBy.pl300 ? '<div class="sec-h"><h2>Apuntes del curso PL-300</h2><p>Especificaciones, registro de cambios, casos de estudio y testimonios. El resto de apuntes del temario está en cada tema.</p></div>' + notesHTML(notesBy.pl300) : "") +
    '<div class="sec-h"><h2>Enlaces oficiales</h2><p>Comprueba siempre la guía de estudio vigente.</p></div><ul class="pro"><li><span class="pk">Microsoft Learn</span><a href="https://learn.microsoft.com/es-es/credentials/certifications/data-analyst-associate/" target="_blank" rel="noopener">Certificación Power BI Data Analyst Associate</a></li><li><span class="pk">Práctica</span><a href="https://learn.microsoft.com/es-es/credentials/certifications/exams/pl-300/practice/assessment?assessment-type=practice&amp;assessmentId=48" target="_blank" rel="noopener">Evaluación de práctica gratuita de Microsoft</a></li><li><span class="pk">Entorno</span><a href="https://learn.microsoft.com/es-es/credentials/certifications/exam-scoring-reports" target="_blank" rel="noopener">Puntuación de los exámenes e informes de puntuación</a></li></ul>';
  drawExam();
  drawBank();
}
var bankState = {q:"", k:"", s:"", n:20};
function drawBank(){
  var box = $("#bankBox"); if(!box) return;
  if(!box.dataset.ready){
    var ks = [], ss = [];
    EXAM.forEach(function(e){ if(ks.indexOf(e.k) < 0) ks.push(e.k); var r = srcRoot(e.s); if(ss.indexOf(r) < 0) ss.push(r); });
    ks.sort(function(a, b){ return a.localeCompare(b, "es"); });
    box.innerHTML = '<div class="toolbar"><label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><span class="sr">Buscar pregunta</span><input id="bq" type="search" placeholder="Buscar: RLS, puerta de enlace, combinar…"></label>' +
      '<label class="vlab"><span class="sr">Categoría</span><select class="vsel" id="bk"><option value="">Todas las categorías</option>' + ks.map(function(k){ return '<option value="' + k + '">' + k + "</option>"; }).join("") + '</select></label>' +
      '<label class="vlab"><span class="sr">Fuente</span><select class="vsel" id="bs"><option value="">Todas las fuentes</option>' + ss.map(function(s){ return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("") + '</select></label><button type="button" class="vbtn" id="brnd">Pregunta al azar</button><span class="count" id="bcount"></span></div><div id="blist"></div><div style="margin-top:14px"><button type="button" class="btn hidden" id="bmore">Ver más preguntas</button></div>';
    $("#bq").addEventListener("input", function(e){ bankState.q = e.target.value; bankState.n = 20; drawBank(); });
    $("#bk").addEventListener("change", function(e){ bankState.k = e.target.value; bankState.n = 20; drawBank(); });
    $("#bs").addEventListener("change", function(e){ bankState.s = e.target.value; bankState.n = 20; drawBank(); });
    $("#bmore").addEventListener("click", function(){ bankState.n += 20; drawBank(); });
    $("#brnd").addEventListener("click", function(){ var l = bankList(); if(!l.length) return; var e = l[Math.floor(Math.random() * l.length)]; $("#blist").innerHTML = examHTML([e]); $("#blist .trap").open = false; $("#bmore").classList.add("hidden"); $("#bcount").textContent = "1 pregunta al azar de " + l.length; });
    $("#bq").value = bankState.q; $("#bk").value = bankState.k; $("#bs").value = bankState.s;
    box.dataset.ready = "1";
  }
  var list = bankList();
  $("#blist").innerHTML = list.length ? examHTML(list.slice(0, bankState.n)) : '<p class="nomatch">Sin resultados.</p>';
  $("#bmore").classList.toggle("hidden", list.length <= bankState.n);
  $("#bcount").textContent = Math.min(list.length, bankState.n) + " de " + list.length + " preguntas";
}
function bankList(){
  var q = norm(bankState.q.trim());
  return EXAM.filter(function(e){ return (!bankState.k || e.k === bankState.k) && (!bankState.s || srcRoot(e.s) === bankState.s) && (!q || norm(plain(e.q + " " + e.a + " " + e.k)).indexOf(q) > -1); });
}
function drawExam(){
  var box = $("#examBox"); if(!box) return;
  if(!exam){
    box.innerHTML = '<div class="quiz"><div class="qq">Diez preguntas al azar de todos los temas</div><p style="font-size:15px;margin-bottom:14px">Cada respuesta se explica al momento y queda guardada en el progreso del tema.</p><button type="button" class="btn solid" id="exStart">Empezar simulacro</button></div>';
    $("#exStart").addEventListener("click", function(){ exam = {qs:shuffle(TOPICS).slice(0, 10), i:0, ok:0, done:false}; drawExam(); });
    return;
  }
  if(exam.i >= exam.qs.length){
    var p = Math.round(exam.ok / exam.qs.length * 1000);
    box.innerHTML = '<div class="quiz"><div class="score"><div class="kpi"><div class="kl">Puntuación estimada</div><div class="kv">' + p + ' / 1.000</div></div><div class="kpi"><div class="kl">Aciertos</div><div class="kv">' + exam.ok + " de " + exam.qs.length + '</div></div></div><p style="font-size:15px;margin-bottom:14px">' + (p >= 700 ? "Por encima del aprobado. Repasa los temas fallados y repite." : "Por debajo de 700. Abre los temas fallados y vuelve a intentarlo.") + '</p><button type="button" class="btn solid" id="exAgain">Otro simulacro</button></div>';
    $("#exAgain").addEventListener("click", function(){ exam = null; drawExam(); $("#exStart").click(); });
    return;
  }
  var t = exam.qs[exam.i];
  box.innerHTML = '<div class="quiz"><div class="qmeta"><span>Pregunta ' + (exam.i + 1) + " de " + exam.qs.length + ' · <a href="#tema/' + t.id + '">' + t.t + "</a></span><span>" + exam.ok + " aciertos</span></div>" + quizInner(t, function(correct){ if(correct) exam.ok++; var nb = document.createElement("button"); nb.type = "button"; nb.className = "btn solid"; nb.style.marginTop = "14px"; nb.textContent = exam.i + 1 < exam.qs.length ? "Siguiente pregunta" : "Ver resultado"; nb.addEventListener("click", function(){ exam.i++; drawExam(); }); box.querySelector(".quiz").appendChild(nb); }) + "</div>";
  bindQuiz(box, t);
}
var quizCb = {};
function quizInner(t, cb){
  quizCb[t.id] = cb;
  return '<div class="qq">' + t.quiz.q + '</div><div class="qo" data-quiz="' + t.id + '">' + t.quiz.o.map(function(o, i){ return '<button type="button" data-o="' + i + '">' + o + "</button>"; }).join("") + "</div>";
}
function bindQuiz(root, t){
  var qo = root.querySelector('[data-quiz="' + t.id + '"]');
  qo.addEventListener("click", function(e){
    var b = e.target.closest("button[data-o]"); if(!b || qo.dataset.done) return;
    qo.dataset.done = "1";
    var i = +b.dataset.o, ok = i === t.quiz.a;
    $$("button", qo).forEach(function(x){ x.disabled = true; if(+x.dataset.o === t.quiz.a) x.classList.add("ok"); });
    if(!ok) b.classList.add("ko");
    QUIZ[t.id] = ok; save("pbi_quiz", QUIZ);
    var w = document.createElement("div"); w.className = "qw"; w.innerHTML = "<b>" + (ok ? "Correcto." : "No es esa.") + "</b> " + t.quiz.w; qo.parentNode.insertBefore(w, qo.nextSibling);
    if(quizCb[t.id]) quizCb[t.id](ok);
  });
}

/* ══ VISUAL (marco) ══════════════════════ */
function mountViz(id, host, note){
  host.innerHTML = '<div class="viz"><div class="viz-h"><span class="vt">Visual</span><div class="viz-ctrl"></div></div><div class="viz-b"></div>' + (note ? '<div class="viz-n"><b>Qué debes notar:</b> ' + note + "</div>" : "") + "</div>";
  var f = {title:$(".vt", host), ctrl:$(".viz-ctrl", host), body:$(".viz-b", host)};
  try{ if(VIZ[id]) VIZ[id](f); else f.body.textContent = "Visual no disponible."; }
  catch(err){ f.body.textContent = "No se pudo cargar el visual."; if(window.console) console.error(err); }
}

/* ══ FICHA DE ESTUDIO ════════════════════ */
var tocObs = null;
function renderTopic(id){
  var t = byId[id]; if(!t){ location.hash = "#temas"; return; }
  if(!PROG[t.id]) setProg(t.id, 1);
  var b = blockById[t.b], bt = TOPICS.filter(function(x){ return x.b === t.b; });
  var prev = TOPICS[t.i - 1], next = TOPICS[t.i + 1];
  var toc = [], body = "";
  function chap(n, k, title, inner){ return '<section class="chap" id="c' + n + '"><div class="chap-h"><span class="chap-n">' + n + '</span><div><div class="k">Capítulo ' + n + "</div><h2>" + title + "</h2></div></div>" + inner + "</section>"; }
  function blk(sid, title, inner){ toc.push([sid, title]); return '<div class="blk" id="' + sid + '"><h3>' + title + "</h3>" + inner + "</div>"; }

  toc.push(["ch", "Entiéndelo"]);
  body += chap(1, "", "Entiéndelo",
    blk("s-frase", "En una frase", '<p class="oneliner">' + t.one + "</p>") +
    blk("s-amigo", "Explicado como a un amigo", '<div class="call analog"><div class="ck">Analogía</div><div class="dbody"><p>' + t.friend + "</p></div></div>") +
    blk("s-pasos", "Cómo funciona, paso a paso", '<ol class="pasos">' + t.steps.map(function(s){ return "<li>" + s + "</li>"; }).join("") + "</ol>") +
    blk("s-ej", "Un ejemplo con números", '<div class="mini"><div class="dbody">' + t.ex + "</div></div>") +
    blk("s-clave", "La idea clave", '<div class="call good"><div class="ck">Clave</div><div class="dbody"><p>' + t.key + "</p></div></div>"));
  toc.push(["ch", "Míralo en acción"]);
  body += chap(2, "", "Míralo en acción", blk("s-viz", "Visualízalo e interactúa", '<div id="vizHost"></div>'));
  toc.push(["ch", "Úsalo en un proyecto"]);
  body += chap(3, "", "Úsalo en un proyecto",
    blk("s-caso", "Caso real", '<div class="caso"><div class="csec">' + t.caso.sec + '</div><div class="cq">' + t.caso.q + '</div><div class="dbody">' + t.caso.html + "</div></div>") +
    blk("s-cuando", "¿Cuándo sí y cuándo no?", '<div class="yesno"><div class="y"><div class="ck">Úsalo cuando</div><ul>' + t.yes.map(function(x){ return "<li>" + x + "</li>"; }).join("") + '</ul></div><div class="n"><div class="ck">Evítalo cuando</div><ul>' + t.no.map(function(x){ return "<li>" + x + "</li>"; }).join("") + "</ul></div></div>"));
  toc.push(["ch", "Por dentro"]);
  body += chap(4, "", "Por dentro",
    (t.code && t.code.length ? blk("s-code", "El código", t.code.map(function(c, i){ return '<div class="code"><div class="cl"><span>' + c.l + " · " + c.t + '</span><button type="button" data-copy="' + i + '">Copiar</button></div><pre class="dcode"><code>' + hl(c.s) + "</code></pre></div>"; }).join("")) : "") +
    blk("s-conf", "Con qué se confunde", '<div class="conf">' + t.conf.map(function(c){ return "<div><h4>" + c.t + "</h4><p>" + c.d + "</p></div>"; }).join("") + "</div>"));
  toc.push(["ch", "Ponte a prueba"]);
  body += chap(5, "", "Ponte a prueba",
    blk("s-rec", "Lo que tienes que recordar", '<div class="recall"><div class="ck">Recuerda</div><ul>' + t.rec.map(function(r){ return "<li>" + r + "</li>"; }).join("") + "</ul></div>") +
    blk("s-quiz", "Comprueba si lo has entendido", '<div class="quiz" id="topicQuiz">' + (QUIZ[t.id] !== undefined ? '<div class="qmeta"><span>Ya la respondiste: ' + (QUIZ[t.id] ? "correcta" : "fallada") + '</span><button type="button" class="vbtn" id="qRetry">Responder de nuevo</button></div>' : "") + quizInner(t, function(ok){ if(ok) setProg(t.id, 2); syncProgBtn(t); }) + "</div>"));
  toc.push(["ch", "Nivel profesional"]);
  body += chap(6, "", "Nivel profesional",
    blk("s-pro", "Para cuando ya lo tengas claro", '<ul class="pro">' + t.pro.map(function(p){ return '<li><span class="pk">' + p.k + "</span>" + p.t + "</li>"; }).join("") + (t.exam || []).map(function(e){ return '<li class="exam"><span class="pk">Examen PL-300</span>' + e + "</li>"; }).join("") + "</ul>") +
    blk("s-src", "De dónde sale", '<p class="srcs">' + t.src.join(" · ") + "</p>"));
  var tn = notesBy[t.id] || [], te = examBy[t.id] || [];
  if(tn.length || te.length){
    toc.push(["ch", "Apuntes completos"]);
    body += chap(7, "", "Apuntes completos",
      (tn.length ? blk("s-notes", "Todo lo que guardé sobre este tema", '<p class="nintro">' + tn.length + (tn.length === 1 ? " apunte" : " apuntes") + " de " + Object.keys(tn.reduce(function(m, n){ m[n.s] = 1; return m; }, {})).length + ' fuentes. Abre cada fuente para ver sus notas.</p>' + notesHTML(tn)) : "") +
      (te.length ? blk("s-bank", "Preguntas de examen sobre este tema", examHTML(te)) : ""));
  }

  var tocHTML = '<div class="tt">En este tema</div><ol>' + toc.map(function(x){ return x[0] === "ch" ? '<li class="ch">' + x[1] + "</li>" : '<li><a href="#tema/' + t.id + '" data-sec="' + x[0] + '">' + x[1] + "</a></li>"; }).join("") + '</ol><div class="tprog"><div class="l">Tu progreso: <span id="progLbl"></span></div><button type="button" class="pbtn" id="progBtn"></button></div>';

  $("#detail").innerHTML = '<div class="dtop"><a class="dback" href="#temas">← Temas</a><span class="sep">/</span><span>' + b.n + " · " + b.t + '</span><span class="sep">/</span><span>Tema ' + b.n + "." + (bt.indexOf(t) + 1) + "</span></div>" +
    '<div class="dhero"><div><h1>' + t.t + '</h1><div class="dmeta"><span class="chip acc">' + b.t + '</span><span class="chip">' + lv(t.lvl) + " " + LVL[t.lvl] + "</span>" + (t.exam && t.exam.length ? '<span class="chip ex">Sale en la PL-300</span>' : "") + '</div><p class="dhero-q">' + t.q + '</p></div><div class="dfacts"><h4>Ficha rápida</h4><dl><dt>Bloque</dt><dd>' + b.n + " · " + b.t + "</dd><dt>Nivel</dt><dd>" + LVL[t.lvl] + "</dd><dt>Código</dt><dd>" + (t.code && t.code.length ? t.code.map(function(c){ return c.l; }).filter(function(x, i, a){ return a.indexOf(x) === i; }).join(", ") : "Sin código") + "</dd><dt>Fuente</dt><dd>" + t.src[0] + "</dd></dl></div></div>" +
    '<div class="study"><nav class="stoc" aria-label="Índice del tema">' + tocHTML + '</nav><div class="smain">' + body +
    '<nav class="dnav" aria-label="Tema anterior y siguiente">' + (prev ? '<a href="#tema/' + prev.id + '"><span class="nk">← Anterior</span><span class="nt">' + prev.t + "</span></a>" : "<span></span>") + (next ? '<a class="nx" href="#tema/' + next.id + '"><span class="nk">Siguiente →</span><span class="nt">' + next.t + "</span></a>" : "") + "</nav></div></div>";

  mountViz(t.viz, $("#vizHost"), t.vizNote);
  bindQuiz($("#topicQuiz"), t);
  var rt = $("#qRetry"); if(rt) rt.addEventListener("click", function(){ var host = $("#topicQuiz"); host.innerHTML = quizInner(t, function(ok){ if(ok) setProg(t.id, 2); syncProgBtn(t); }); bindQuiz(host, t); });
  $$("[data-copy]", $("#detail")).forEach(function(bt){ bt.addEventListener("click", function(){ var src = t.code[+bt.dataset.copy].s; if(navigator.clipboard) navigator.clipboard.writeText(src).then(function(){ bt.textContent = "Copiado"; setTimeout(function(){ bt.textContent = "Copiar"; }, 1500); }); }); });
  $$(".stoc a[data-sec]").forEach(function(a){ a.addEventListener("click", function(e){ e.preventDefault(); var el = document.getElementById(a.dataset.sec); if(el) el.scrollIntoView({behavior:"smooth", block:"start"}); }); });
  $("#progBtn").addEventListener("click", function(){ PROG[t.id] = PROG[t.id] === 2 ? 1 : 2; save("pbi_prog", PROG); syncProgBtn(t); });
  syncProgBtn(t);
  if(tocObs) tocObs.disconnect();
  if("IntersectionObserver" in window){
    tocObs = new IntersectionObserver(function(ents){ ents.forEach(function(en){ if(en.isIntersecting){ $$(".stoc a").forEach(function(a){ a.classList.toggle("on", a.dataset.sec === en.target.id); }); } }); }, {rootMargin:"-90px 0px -70% 0px"});
    $$(".blk", $("#detail")).forEach(function(s){ tocObs.observe(s); });
  }
  document.title = t.t + " · Manual de Power BI";
}
function syncProgBtn(t){
  var p = PROG[t.id] || 0, b = $("#progBtn"), l = $("#progLbl"); if(!b) return;
  l.textContent = p === 2 ? "Lo entiendo" : "En estudio";
  b.textContent = p === 2 ? "Marcar como en estudio" : "Lo entiendo";
  b.classList.toggle("on", p === 2);
}

/* ══ ROUTER ══════════════════════════════ */
var TITLES = {home:"Manual de Power BI", metodo:"Método BI7 · Manual de Power BI", temas:"Temas · Manual de Power BI", dax:"Referencia DAX · Manual de Power BI", pl300:"PL-300 · Manual de Power BI", proyectos:"Proyectos · Manual de Power BI", recursos:"Recursos · Manual de Power BI", glosario:"Glosario · Manual de Power BI"};
function route(){
  var h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
  var isTopic = h.indexOf("tema/") === 0, view = isTopic ? "temas" : (VIEWS.indexOf(h) > -1 ? h : "home");
  document.body.classList.toggle("detail-open", isTopic);
  $("#detail").classList.toggle("hidden", !isTopic);
  VIEWS.forEach(function(v){ $("#view-" + v).classList.toggle("hidden", isTopic || v !== view); });
  $$(".tnb").forEach(function(a){ var on = a.dataset.v === view; a.classList.toggle("active", on); if(on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if(isTopic){ renderTopic(h.slice(5)); window.scrollTo(0, 0); $("#detail").focus({preventScroll:true}); return; }
  ({home:renderHome, metodo:renderMetodo, temas:renderTemas, dax:renderDax, pl300:renderPL300, proyectos:renderProyectos, recursos:renderRecursos, glosario:renderGlosario})[view]();
  document.title = TITLES[view];
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);
window.PBI = {openTopic:function(id){ location.hash = "#tema/" + id; }};

/* ══ BUSCADOR (Ctrl K) ═══════════════════ */
var IDX = [];
TOPICS.forEach(function(t){ IDX.push({k:"Tema", n:t.t, d:t.q, h:"#tema/" + t.id, s:topicText(t)}); });
DAXREF.forEach(function(d){ IDX.push({k:"DAX", n:d.f, d:d.d, h:"#tema/" + d.t, s:norm(d.f + " " + d.d)}); });
GLOSS.forEach(function(g){ IDX.push({k:"Glosario", n:g.k, d:g.d, h:"#tema/" + g.t, s:norm(g.k + " " + g.d)}); });
NOTES.forEach(function(n){ if(n.t === "pl300" || byId[n.t]) IDX.push({k:"Apunte", n:n.s, d:(n.t === "pl300" ? "PL-300" : byId[n.t].t) + " · " + plain(n.h).slice(0, 140), h:n.t === "pl300" ? "#pl300" : "#tema/" + n.t, s:norm(n.s + " " + plain(n.h))}); });
EXAM.forEach(function(e){ IDX.push({k:"Pregunta", n:plain(e.q).slice(0, 120), d:e.k + " · " + e.s, h:byId[e.t] ? "#tema/" + e.t : "#pl300", s:norm(plain(e.q + " " + e.a))}); });
PROJ.forEach(function(p){ IDX.push({k:"Proyecto", n:p.t, d:p.ctx, h:"#proyectos", s:norm(p.t + " " + p.ctx + " " + p.diff)}); });
RES.forEach(function(r){ IDX.push({k:"Recurso", n:r.name, d:r.cat + (r.note ? " · " + r.note : ""), h:"#recursos", s:norm(r.name + " " + r.cat + " " + r.note)}); });
[["Método BI7","#metodo"],["Referencia DAX","#dax"],["Certificación PL-300","#pl300"],["Proyectos","#proyectos"],["Recursos y fuentes","#recursos"],["Glosario","#glosario"],["Todos los temas","#temas"]].forEach(function(v){ IDX.push({k:"Sección", n:v[0], d:"Ir a la sección", h:v[1], s:norm(v[0])}); });
var qk = null, qkSel = 0, qkRes = [], qkPrev = null;
function openQk(){
  if(qk) return;
  qkPrev = document.activeElement;
  qk = document.createElement("div"); qk.className = "qk";
  qk.innerHTML = '<div class="qk-box" role="dialog" aria-modal="true" aria-label="Buscar en el manual"><input type="text" placeholder="Busca un tema, una función DAX o un término…" aria-label="Buscar" autocomplete="off"><div class="qk-res" role="listbox"></div><div class="qk-foot"><span>↑ ↓ para moverte</span><span>Intro para abrir</span><span>Esc para cerrar</span></div></div>';
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
  q = norm(q.trim());
  qkRes = q ? IDX.filter(function(x){ return x.s.indexOf(q) > -1 || norm(x.n).indexOf(q) > -1; }).sort(function(a, b){ var an = norm(a.n).indexOf(q) === 0 ? 0 : 1, bn = norm(b.n).indexOf(q) === 0 ? 0 : 1; return an - bn; }).slice(0, 30) : IDX.filter(function(x){ return x.k === "Sección" || x.k === "Tema"; }).slice(0, 12);
  $(".qk-res", qk).innerHTML = qkRes.length ? qkRes.map(function(x, i){ return '<button type="button" class="qk-it' + (i === qkSel ? " on" : "") + '" role="option" aria-selected="' + (i === qkSel) + '" data-h="' + x.h + '"><span class="qi">' + x.k + '</span><span class="qt"><span class="qn">' + esc(x.n) + '</span><span class="qd">' + esc(x.d.replace(/<[^>]+>/g, "")) + "</span></span></button>"; }).join("") : '<div class="qk-empty">Sin resultados.</div>';
  var on = $(".qk-it.on", qk); if(on) on.scrollIntoView({block:"nearest"});
}
$("#qkBtn").addEventListener("click", openQk);
document.addEventListener("keydown", function(e){
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"){ e.preventDefault(); qk ? closeQk() : openQk(); }
  else if(e.key === "/" && !qk && !/input|textarea|select/i.test(document.activeElement.tagName)){ e.preventDefault(); openQk(); }
});

route();
})();
