/* Un visual interactivo por tema: VIZ.<id> = function(f){ … }
   f.title (span), f.ctrl (contenedor de controles), f.body (lienzo).
   Reglas: HTML/SVG puro, colores solo con var(--…) y var(--lab1…6) para series.
   Los visuales de la Guía son simulaciones: no tocan tu progreso real. */
var VIZ = {};

function vzEsc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/* ── Cómo recorrer el manual: estados de aprendizaje ── */
VIZ["guia-recorrer"] = function(f){
  f.title.textContent = "Simula tu progreso";
  var ts = TOPICS.filter(function(t){ return t.b === "guia"; }), st = ts.map(function(){ return 0; }), NAMES = ["Pendiente", "En estudio", "Lo entiendo"];
  f.ctrl.innerHTML = '<button type="button" class="vbtn" id="vz-rs">Reiniciar</button>';
  f.body.innerHTML = '<p class="vz-note">Simulación: no cambia tu progreso real. Pulsa un tema para pasar de pendiente a en estudio y a entendido.</p><div class="vz-list" id="vz-ls"></div>' +
    '<div class="vz-bar"><div class="bar"><i id="vz-bi" style="width:0%"></i></div><p id="vz-bt" class="vz-big"></p></div>';
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
    var res = CA.search(v);
    r.innerHTML = '<p class="vz-big">' + res.length + (res.length === 1 ? " resultado" : " resultados") + (res.length > 6 ? " (se muestran 6)" : "") + "</p>" + res.slice(0, 6).map(function(x){
      return '<a class="vz-row" href="' + vzEsc(x.h) + '"><span class="chip">' + x.k + '</span><span class="vz-t">' + vzEsc(x.n) + "</span></a>"; }).join("");
  }
  q.addEventListener("input", draw); draw();
};

/* ── Cómo leer el mapa mental: tipos de relación ── */
VIZ["guia-mapa"] = function(f){
  f.title.textContent = "Tipos de relación";
  var KEYS = Object.keys(RELTYPES), cur = 0;
  var NOTE = {
    necesita:"Marca un orden de estudio: lo que se necesita conocer va primero.",
    tipo:"La idea general y sus variedades: lo específico es un caso de lo general.",
    integra:"Dos piezas que trabajan juntas. No marca orden: puedes aprenderlas en cualquiera.",
    sirve:"Un medio y su objetivo: para qué se usa algo.",
    alternativa:"Dos maneras de resolver el mismo problema. Conviene saber cuándo elegir cada una.",
    usa:"Una pieza que se emplea dentro de otra."
  };
  f.ctrl.innerHTML = KEYS.map(function(k, i){ return '<button type="button" class="vbtn" data-i="' + i + '" aria-pressed="' + (i === 0) + '">' + RELTYPES[k].l + "</button>"; }).join("");
  f.body.innerHTML = '<p class="vz-note">Ejemplo genérico con dos temas, A y B.</p><div id="vz-s"></div><p class="vz-big" id="vz-a"></p><p class="vz-big" id="vz-b"></p><p id="vz-n"></p>';
  function draw(){
    var k = KEYS[cur], t = RELTYPES[k];
    f.body.querySelector("#vz-s").innerHTML = '<svg viewBox="0 0 400 90" role="img" aria-label="Dos temas, A y B, unidos por una línea ' + (t.d ? "discontinua" : "continua") + (t.s ? "" : " con flecha hacia B") + '" style="width:100%;max-width:520px">' +
      '<defs><marker id="vz-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 1 L9 5 L0 9 z" style="fill:var(--accent-2)"/></marker></defs>' +
      '<circle cx="60" cy="45" r="22" style="fill:var(--card);stroke:var(--line-2);stroke-width:2"/><text x="60" y="51" text-anchor="middle" style="font-family:var(--serif);font-size:20px;fill:var(--ink)">A</text>' +
      '<circle cx="340" cy="45" r="22" style="fill:var(--card);stroke:var(--line-2);stroke-width:2"/><text x="340" y="51" text-anchor="middle" style="font-family:var(--serif);font-size:20px;fill:var(--ink)">B</text>' +
      '<path d="M86 45 H' + (t.s ? 314 : 308) + '" style="fill:none;stroke:var(--accent-2);stroke-width:2"' + (t.d ? ' stroke-dasharray="' + t.d + '"' : "") + (t.s ? "" : ' marker-end="url(#vz-ar)"') + "/></svg>";
    f.body.querySelector("#vz-a").innerHTML = "<b>A</b> " + t.l + " <b>B</b>.";
    f.body.querySelector("#vz-b").innerHTML = t.s ? "Se lee igual en los dos sentidos." : "<b>B</b> " + t.i + " <b>A</b>.";
    f.body.querySelector("#vz-n").textContent = NOTE[KEYS[cur]] || "";
    Array.prototype.forEach.call(f.ctrl.querySelectorAll("button"), function(b, i){ b.setAttribute("aria-pressed", i === cur ? "true" : "false"); b.classList.toggle("on", i === cur); });
  }
  f.ctrl.addEventListener("click", function(e){ var b = e.target.closest("button[data-i]"); if(!b) return; cur = +b.dataset.i; draw(); });
  draw();
};
