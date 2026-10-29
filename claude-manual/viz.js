/* Un visual interactivo por tema: VIZ.<id> = function(f){ … }  (módulo ES)
   f.title (span), f.ctrl (contenedor de controles), f.body (lienzo), f.data (vizData del tema), f.env = {topics, search, reltypes}.
   Reglas: HTML/SVG puro, colores y trazos solo con clases (la CSP del área privada no admite atributos style)
   y variables de css/claude-manual.css; var(--lab1…6) para series. Estilo dinámico: element.style.x = …

   Este archivo es PÚBLICO (se sirve con la web), así que no lleva contenido de cursos. Los temas reales usan los visuales
   genéricos de abajo (escala, pestanas, precedencia), que se rellenan con el campo vizData de la ficha, guardado en la base.
   Los visuales «guia-…» son los de la ficha de prueba de tools/claude-academy/fixtures/; sirven para las pruebas. */
export const VIZ = {};

function vzEsc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function vzPress(ctrl, cur){ Array.prototype.forEach.call(ctrl.querySelectorAll("button"), function(b, i){ b.setAttribute("aria-pressed", i === cur ? "true" : "false"); b.classList.toggle("on", i === cur); }); }

/* ══ Visuales genéricos: el contenido llega en f.data (texto plano: se escapa siempre) ══ */

/* escala · una escala de niveles (p. ej. low … max): pulsas un nivel y ves su descripción y cuánto sube cada dimensión.
   data = {titulo?, nota?, marca?, max: 5, dims: ["…"], niveles: [{n: "low", d: "descripción", m: [1, 1, 1, 0]}]}  (m: un valor 0…max por dimensión) */
VIZ.escala = function(f){
  var D = f.data, MAX = D.max || 5, L = D.niveles || [], cur = 0;
  f.title.textContent = D.titulo || "La escala";
  if(!L.length){ f.body.textContent = "Este visual no tiene datos."; return; }
  f.ctrl.innerHTML = L.map(function(l, i){ return '<button type="button" class="vbtn" data-i="' + i + '" aria-pressed="' + (i === 0) + '">' + vzEsc(l.n) + "</button>"; }).join("");
  f.body.innerHTML = (D.marca ? '<p class="vz-note">' + vzEsc(D.marca) + "</p>" : "") + '<div class="vz-card" id="vz-c" aria-live="polite"></div><div class="vz-dims" id="vz-dm"></div>' + (D.nota ? '<p class="vz-note">' + vzEsc(D.nota) + "</p>" : "");
  function draw(){
    var l = L[cur];
    f.body.querySelector("#vz-c").innerHTML = '<div class="vz-k">Cómo suele verse</div><h4 class="vz-h">' + vzEsc(l.n) + "</h4><p>" + vzEsc(l.d) + "</p>";
    f.body.querySelector("#vz-dm").innerHTML = (D.dims || []).map(function(n, j){
      var v = Math.max(0, Math.min(MAX, +(l.m || [])[j] || 0)), seg = "";
      for(var k = 0; k < MAX; k++) seg += '<i class="' + (k < v ? "on" : "") + '"></i>';
      return '<div class="vz-dim"><span>' + vzEsc(n) + '</span><span class="vz-meter" role="img" aria-label="' + vzEsc(n) + ": " + v + " de " + MAX + '">' + seg + "</span></div>";
    }).join("");
    vzPress(f.ctrl, cur);
  }
  f.ctrl.addEventListener("click", function(e){ var b = e.target.closest("button[data-i]"); if(!b) return; cur = +b.dataset.i; draw(); });
  draw();
};

/* pestanas · varias lecturas de lo mismo, una por pestaña.
   data = {titulo?, nota?, pestanas: [{n: "nombre", t?: "subtítulo", items: ["…"], fin?: "conclusión"}]} */
VIZ.pestanas = function(f){
  var D = f.data, P = D.pestanas || [], cur = 0;
  f.title.textContent = D.titulo || "Compara";
  if(!P.length){ f.body.textContent = "Este visual no tiene datos."; return; }
  f.ctrl.innerHTML = P.map(function(p, i){ return '<button type="button" class="vbtn" data-i="' + i + '" aria-pressed="' + (i === 0) + '">' + vzEsc(p.n) + "</button>"; }).join("");
  f.body.innerHTML = (D.nota ? '<p class="vz-note">' + vzEsc(D.nota) + "</p>" : "") + '<div class="vz-card" id="vz-c" aria-live="polite"></div>';
  function draw(){
    var p = P[cur];
    f.body.querySelector("#vz-c").innerHTML = '<h4 class="vz-h">' + vzEsc(p.n) + "</h4>" + (p.t ? '<p class="vz-q">' + vzEsc(p.t) + "</p>" : "") +
      '<ul class="vz-ul">' + (p.items || []).map(function(x){ return "<li>" + vzEsc(x) + "</li>"; }).join("") + "</ul>" + (p.fin ? '<p class="vz-big">' + vzEsc(p.fin) + "</p>" : "");
    vzPress(f.ctrl, cur);
  }
  f.ctrl.addEventListener("click", function(e){ var b = e.target.closest("button[data-i]"); if(!b) return; cur = +b.dataset.i; draw(); });
  draw();
};

/* precedencia · capas ordenadas: gana la primera que tenga valor. Cada capa tiene un desplegable con «No establecido».
   data = {titulo?, nota?, etiqueta?: "texto antes del resultado", vacio: "valor si no hay ninguna", capas: [{t: "nombre", d: "cuándo aplica", v: ["valores posibles"], fija?: true}]}
   Una capa con fija:true siempre tiene valor (el de vacio) y cierra la lista. */
VIZ.precedencia = function(f){
  var D = f.data, C = D.capas || [], val = C.map(function(){ return ""; });
  f.title.textContent = D.titulo || "Qué gana";
  if(!C.length){ f.body.textContent = "Este visual no tiene datos."; return; }
  f.ctrl.innerHTML = '<button type="button" class="vbtn" id="vz-rs">Reiniciar</button>';
  f.body.innerHTML = (D.nota ? '<p class="vz-note">' + vzEsc(D.nota) + "</p>" : "") + '<div class="vz-lays" id="vz-ls"></div><p class="vz-big" id="vz-w" aria-live="polite"></p>';
  f.body.querySelector("#vz-ls").innerHTML = C.map(function(c, i){
    var ctl = c.fija ? '<span class="vz-s">siempre activa</span>' :
      '<select class="vz-sel" data-i="' + i + '" aria-label="' + vzEsc(c.t) + '"><option value="">No establecido</option>' + (c.v || []).map(function(v){ return '<option value="' + vzEsc(v) + '">' + vzEsc(v) + "</option>"; }).join("") + "</select>";
    return '<div class="vz-lay" data-i="' + i + '"><span class="vz-n">' + (i + 1) + '</span><span class="vz-lt"><b>' + vzEsc(c.t) + "</b><br><span>" + vzEsc(c.d) + "</span></span>" + ctl + "</div>";
  }).join("");
  function draw(){
    var w = -1;
    for(var i = 0; i < C.length; i++){ if(C[i].fija || val[i]){ w = i; break; } }
    Array.prototype.forEach.call(f.body.querySelectorAll(".vz-lay"), function(el, i){ el.classList.toggle("on", i === w); });
    var out = w < 0 ? "" : (C[w].fija ? D.vacio : val[w]);
    f.body.querySelector("#vz-w").innerHTML = w < 0 ? "" : vzEsc(D.etiqueta || "En efecto") + ": <b>" + vzEsc(out) + "</b> · lo fija la capa " + (w + 1) + " (" + vzEsc(C[w].t) + ").";
  }
  f.body.addEventListener("change", function(e){ var s = e.target.closest("select[data-i]"); if(!s) return; val[+s.dataset.i] = s.value; draw(); });
  f.ctrl.querySelector("#vz-rs").addEventListener("click", function(){ val = C.map(function(){ return ""; }); Array.prototype.forEach.call(f.body.querySelectorAll("select"), function(s){ s.value = ""; }); draw(); });
  draw();
};

/* ── Cómo recorrer el manual: estados de aprendizaje ── */
VIZ["guia-recorrer"] = function(f){
  f.title.textContent = "Simula tu progreso";
  var ts = f.env.topics.filter(function(t){ return t.b === "guia"; }), st = ts.map(function(){ return 0; }), NAMES = ["Pendiente", "En estudio", "Lo entiendo"];
  f.ctrl.innerHTML = '<button type="button" class="vbtn" id="vz-rs">Reiniciar</button>';
  f.body.innerHTML = '<p class="vz-note">Simulación: no cambia tu progreso real. Pulsa un tema para pasar de pendiente a en estudio y a entendido.</p><div class="vz-list" id="vz-ls"></div>' +
    '<div class="vz-bar"><div class="bar"><i id="vz-bi"></i></div><p id="vz-bt" class="vz-big"></p></div>';
  function draw(){
    f.body.querySelector("#vz-ls").innerHTML = ts.map(function(t, i){
      return '<button type="button" class="vz-row" data-i="' + i + '"><span class="td ' + (st[i] ? "s" + st[i] : "") + '"></span><span class="vz-t">' + t.t + '</span><span class="vz-s">' + NAMES[st[i]] + "</span></button>";
    }).join("");
    var d = st.filter(function(x){ return x === 2; }).length, p = Math.round(d / ts.length * 100);
    f.body.querySelector("#vz-bi").style.width = p + "%";
    f.body.querySelector("#vz-bt").textContent = d + " de " + ts.length + " entendidos · " + p + " %";
  }
  f.body.addEventListener("click", function(e){ var b = e.target.closest(".vz-row"); if(!b) return; var i = +b.dataset.i; st[i] = (st[i] + 1) % 3; draw(); var nb = f.body.querySelector('.vz-row[data-i="' + i + '"]'); if(nb) nb.focus(); });
  f.ctrl.querySelector("#vz-rs").addEventListener("click", function(){ st = ts.map(function(){ return 0; }); draw(); });
  draw();
};

/* ── Cómo está hecha una ficha: los seis capítulos ── */
VIZ["guia-fichas"] = function(f){
  f.title.textContent = "Los seis capítulos";
  var CH = [
    {n:"Entiéndelo", q:"¿Qué es y cómo funciona?", c:"Una frase, una analogía, los pasos, un ejemplo con números y la idea clave.", l:0},
    {n:"Míralo en acción", q:"¿Cómo se comporta si toco los controles?", c:"Un visual interactivo propio del tema.", l:0},
    {n:"Úsalo en un proyecto", q:"¿Cuándo lo uso y cuándo no?", c:"Un caso real, cuándo sí y cuándo no, y un ejercicio guiado si el tema lo permite.", l:1},
    {n:"Por dentro", q:"¿Cómo se escribe o se configura, y con qué se confunde?", c:"El código o la configuración y las confusiones habituales.", l:1},
    {n:"Ponte a prueba", q:"¿Lo he entendido?", c:"Lo que hay que recordar y una pregunta de autochequeo con su explicación.", l:-1},
    {n:"Nivel profesional", q:"¿Qué matices aparecen en proyectos reales?", c:"Matices de proyecto, dónde encaja el tema y de dónde sale la información.", l:2}
  ], LV = ["Inicial", "De aplicación", "Técnico"], cur = 0;
  f.ctrl.innerHTML = CH.map(function(c, i){ return '<button type="button" class="vbtn" data-i="' + i + '" aria-pressed="' + (i === 0) + '">' + (i + 1) + "</button>"; }).join("");
  f.body.innerHTML = '<div class="vz-card" id="vz-c"></div><div class="vz-lv" id="vz-lv" aria-label="Nivel de lectura"></div>';
  function draw(){
    var c = CH[cur];
    f.body.querySelector("#vz-c").innerHTML = '<div class="vz-k">Capítulo ' + (cur + 1) + '</div><h4 class="vz-h">' + c.n + '</h4><p class="vz-q">«' + c.q + '»</p><p>' + c.c + "</p>";
    f.body.querySelector("#vz-lv").innerHTML = LV.map(function(n, i){ return '<span class="vz-seg' + (i === c.l ? " on" : "") + '">' + n + "</span>"; }).join("") + '<span class="vz-ln">' + (c.l < 0 ? "Comprobación: sirve en cualquier nivel de lectura." : "Nivel de lectura: " + LV[c.l].toLowerCase() + ".") + "</span>";
    Array.prototype.forEach.call(f.ctrl.querySelectorAll("button"), function(b, i){ b.setAttribute("aria-pressed", i === cur ? "true" : "false"); b.classList.toggle("on", i === cur); });
  }
  f.ctrl.addEventListener("click", function(e){ var b = e.target.closest("button[data-i]"); if(!b) return; cur = +b.dataset.i; draw(); });
  draw();
};

/* ── Fuentes y fiabilidad: estados de verificación ── */
VIZ["guia-fuentes"] = function(f){
  f.title.textContent = "Lee una fuente";
  var ST = [
    {k:"verificado", chip:"ok", t:"Contrastado con la fuente", d:"El contenido se comparó con la fuente en la fecha indicada. Puedes fiarte de la idea; mira la fecha por si ha cambiado."},
    {k:"parcial", chip:"ex", t:"Contrastado en parte", d:"Una parte se comprobó y otra no. La ficha dice cuál: usa la parte comprobada y abre la fuente para el resto."},
    {k:"pendiente", chip:"ex", t:"Por verificar", d:"Todavía no se ha contrastado. Es una orientación, no un dato cerrado: abre la fuente antes de aplicarlo."}
  ], cur = 0;
  f.ctrl.innerHTML = ST.map(function(s, i){ return '<button type="button" class="vbtn" data-i="' + i + '" aria-pressed="' + (i === 0) + '">' + s.t + "</button>"; }).join("");
  f.body.innerHTML = '<p class="vz-note">Ejemplo ilustrativo: la fuente de abajo no es real.</p><ul class="ca-srcs vz-src"><li class="ca-src"><span class="chip acc">Fuente oficial</span> Título de la lección de ejemplo ↗<span class="ca-sm">Curso: Nombre del curso · Consultada el 12 de octubre de 2026</span></li></ul><p class="ca-ver" id="vz-v"></p><p class="vz-big" id="vz-d"></p>';
  function draw(){
    var s = ST[cur];
    f.body.querySelector("#vz-v").innerHTML = '<span class="chip ' + s.chip + '">' + s.t + "</span>";
    f.body.querySelector("#vz-d").textContent = s.d;
    Array.prototype.forEach.call(f.ctrl.querySelectorAll("button"), function(b, i){ b.setAttribute("aria-pressed", i === cur ? "true" : "false"); b.classList.toggle("on", i === cur); });
  }
  f.ctrl.addEventListener("click", function(e){ var b = e.target.closest("button[data-i]"); if(!b) return; cur = +b.dataset.i; draw(); });
  draw();
};

/* ── Encontrar cualquier tema: el buscador real, en pequeño ── */
VIZ["guia-busqueda"] = function(f){
  f.title.textContent = "Prueba el buscador";
  f.ctrl.innerHTML = '<label class="vz-lab">Escribe aquí <input type="search" id="vz-q" placeholder="por donde empiezo" autocomplete="off"></label>';
  f.body.innerHTML = '<p class="vz-note">Usa el mismo buscador que <kbd>Ctrl K</kbd>. Prueba: <i>progreso</i>, <i>Fuentes</i>, <i>mapa mental</i>, <i>nodos</i>.</p><div id="vz-r" class="vz-list" aria-live="polite"></div>';
  var q = f.ctrl.querySelector("#vz-q"), r = f.body.querySelector("#vz-r");
  function draw(){
    var v = q.value.trim();
    if(!v){ r.innerHTML = '<p class="vz-big">Escribe algo para ver qué encuentra.</p>'; return; }
    var res = f.env.search(v);
    r.innerHTML = '<p class="vz-big">' + res.length + (res.length === 1 ? " resultado" : " resultados") + (res.length > 6 ? " (se muestran 6)" : "") + "</p>" + res.slice(0, 6).map(function(x){
      return '<a class="vz-row" href="' + vzEsc(x.h) + '"><span class="chip">' + x.k + '</span><span class="vz-t">' + vzEsc(x.n) + "</span></a>"; }).join("");
  }
  q.addEventListener("input", draw); draw();
};

/* ── Cómo leer el mapa mental: tipos de relación ── */
VIZ["guia-mapa"] = function(f){
  f.title.textContent = "Tipos de relación";
  var KEYS = Object.keys(f.env.reltypes), cur = 0;
  var NOTE = {
    necesita:"Marca un orden de estudio: lo que se necesita conocer va primero.",
    tipo:"La idea general y sus variedades: lo específico es un caso de lo general.",
    integra:"Dos piezas que trabajan juntas. No marca orden: puedes aprenderlas en cualquiera.",
    sirve:"Un medio y su objetivo: para qué se usa algo.",
    alternativa:"Dos maneras de resolver el mismo problema. Conviene saber cuándo elegir cada una.",
    usa:"Una pieza que se emplea dentro de otra."
  };
  f.ctrl.innerHTML = KEYS.map(function(k, i){ return '<button type="button" class="vbtn" data-i="' + i + '" aria-pressed="' + (i === 0) + '">' + f.env.reltypes[k].l + "</button>"; }).join("");
  f.body.innerHTML = '<p class="vz-note">Ejemplo genérico con dos temas, A y B.</p><div id="vz-s"></div><p class="vz-big" id="vz-a"></p><p class="vz-big" id="vz-b"></p><p id="vz-n"></p>';
  function draw(){
    var k = KEYS[cur], t = f.env.reltypes[k];
    f.body.querySelector("#vz-s").innerHTML = '<svg viewBox="0 0 400 90" role="img" aria-label="Dos temas, A y B, unidos por una línea ' + (t.d ? "discontinua" : "continua") + (t.s ? "" : " con flecha hacia B") + '" class="vz-svg">' +
      '<defs><marker id="vz-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 1 L9 5 L0 9 z" class="vz-ah"/></marker></defs>' +
      '<circle cx="60" cy="45" r="22" class="vz-node"/><text x="60" y="51" text-anchor="middle" class="vz-nt">A</text>' +
      '<circle cx="340" cy="45" r="22" class="vz-node"/><text x="340" y="51" text-anchor="middle" class="vz-nt">B</text>' +
      '<path d="M86 45 H' + (t.s ? 314 : 308) + '" class="vz-line"' + (t.d ? ' stroke-dasharray="' + t.d + '"' : "") + (t.s ? "" : ' marker-end="url(#vz-ar)"') + "/></svg>";
    f.body.querySelector("#vz-a").innerHTML = "<b>A</b> " + t.l + " <b>B</b>.";
    f.body.querySelector("#vz-b").innerHTML = t.s ? "Se lee igual en los dos sentidos." : "<b>B</b> " + t.i + " <b>A</b>.";
    f.body.querySelector("#vz-n").textContent = NOTE[KEYS[cur]] || "";
    Array.prototype.forEach.call(f.ctrl.querySelectorAll("button"), function(b, i){ b.setAttribute("aria-pressed", i === cur ? "true" : "false"); b.classList.toggle("on", i === cur); });
  }
  f.ctrl.addEventListener("click", function(e){ var b = e.target.closest("button[data-i]"); if(!b) return; cur = +b.dataset.i; draw(); });
  draw();
};
