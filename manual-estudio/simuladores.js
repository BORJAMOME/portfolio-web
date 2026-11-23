/* Simuladores interactivos del manual (tema 9 y siguientes).
   build.py emite <figure class="sim-fig"><div class="sim sim-<tipo> est-skip">…</div></figure>; app.js llama a SIMS.mount(raíz).
   Reglas: sin estilos en línea (CSP del área privada): colores y tamaños por clases de libro.css; SVG con viewBox.
   Todas las cifras de partida son ILUSTRATIVAS salvo que el texto del simulador diga lo contrario. */
var SIMS = (function(){
"use strict";
var SVGNS = "http://www.w3.org/2000/svg", uid = 0;

/* ── utilidades ─────────────────────────────────────────── */
function el(tag, cls, html){ var e = document.createElement(tag); if(cls) e.className = cls; if(html != null) e.innerHTML = html; return e; }
function sv(tag, attrs, parent){ var e = document.createElementNS(SVGNS, tag); for(var k in attrs) if(attrs[k] != null) e.setAttribute(k, attrs[k]); if(parent) parent.appendChild(e); return e; }
function txt(parent, x, y, s, cls, anchor){ var t = sv("text", {x:x, y:y, "class":cls || "sv-t", "text-anchor":anchor || "start"}, parent); t.textContent = s; return t; }
function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
/* Formato español con punto de millar también en cifras de cuatro dígitos (2.940), como el resto del manual. */
function nf(n, d){
  if(!isFinite(n)) return "—"; d = d == null ? 0 : d;
  var s = Math.abs(n).toFixed(d).split("."), ent = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  var neg = n < 0 && +s.join(".") !== 0;
  return (neg ? "−" : "") + ent + (d ? "," + s[1] : "");
}
function eur(n, d){ return nf(n, d) + " €"; }
function meur(n, d){ return nf(n, d == null ? 1 : d) + " M€"; }
function pct(x, d){ return nf(x * 100, d == null ? 1 : d) + " %"; }
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function chg(a, b){ return a === 0 ? NaN : (b - a) / a; }
function svgBox(w, h, label){ var s = sv("svg", {viewBox:"0 0 " + w + " " + h, role:"img", "aria-label":label, "class":"sim-svg"}); return s; }
function clear(n){ while(n.firstChild) n.removeChild(n.firstChild); }
function niceMax(v){ if(!(v > 0)) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; }

/* Control deslizante + campo numérico sincronizados. cfg: {k,label,min,max,step,value,unit,help} */
function slider(cfg, onchange){
  var id = "sim-c" + (++uid), w = el("div", "sim-c");
  w.innerHTML = '<label for="' + id + '"><span class="sim-cl">' + esc(cfg.label) + '</span>' + (cfg.help ? '<span class="sim-ch">' + esc(cfg.help) + "</span>" : "") + "</label>" +
    '<div class="sim-ci"><input type="range" id="' + id + '" min="' + cfg.min + '" max="' + cfg.max + '" step="' + cfg.step + '" value="' + cfg.value + '">' +
    '<span class="sim-cn"><input type="number" min="' + cfg.min + '" max="' + cfg.max + '" step="' + cfg.step + '" value="' + cfg.value + '" aria-label="' + esc(cfg.label) + ' (valor exacto)">' +
    (cfg.unit ? '<span class="sim-cu">' + esc(cfg.unit) + "</span>" : "") + "</span></div>";
  var r = w.querySelector("input[type=range]"), n = w.querySelector("input[type=number]");
  function set(v, from){
    v = +v; if(!isFinite(v)) return;
    v = clamp(v, +cfg.min, +cfg.max);
    if(from !== r) r.value = v;
    if(from !== n) n.value = v;
    onchange();
  }
  r.addEventListener("input", function(){ set(r.value, r); });
  n.addEventListener("input", function(){ if(n.value !== "" && isFinite(+n.value)) set(n.value, n); });
  n.addEventListener("change", function(){ set(n.value === "" ? cfg.value : n.value); });
  return {el:w, get:function(){ var v = +r.value; return isFinite(v) ? v : +cfg.value; }, set:function(v){ r.value = v; n.value = v; }, cfg:cfg};
}

/* Montaje común: controles a la izquierda, resultados a la derecha. */
function frame(root, opts){
  root.innerHTML = "";
  var w = el("div", "sim-w"), c = el("div", "sim-ctrl"), o = el("div", "sim-out");
  var kp = el("div", "sim-kpis"), ch = el("div", "sim-chart"), msg = el("div", "sim-msg");
  msg.setAttribute("aria-live", "polite");
  o.appendChild(kp); o.appendChild(ch); o.appendChild(msg);
  w.appendChild(c); w.appendChild(o); root.appendChild(w);
  var note = el("p", "sim-note", opts.note || "Cifras ilustrativas, no son datos reales de ninguna línea ni empresa.");
  root.appendChild(note);
  return {ctrl:c, kpis:kp, chart:ch, msg:msg, out:o};
}
function group(parent, title){ var f = el("fieldset", "sim-g"); f.appendChild(el("legend", "", esc(title))); parent.appendChild(f); return f; }
function resetBtn(parent, fn){ var b = el("button", "sim-reset", "↺ Restablecer valores"); b.type = "button"; b.addEventListener("click", fn); parent.appendChild(b); return b; }
function kpis(box, items){
  box.innerHTML = items.map(function(k){
    return '<div class="sim-k' + (k.cls ? " " + k.cls : "") + '"><span class="sim-kl">' + esc(k.l) + '</span><strong>' + esc(k.v) + "</strong>" + (k.s ? '<span class="sim-ks">' + esc(k.s) + "</span>" : "") + "</div>";
  }).join("");
}
function seg(parent, label, options, onpick){
  var w = el("div", "sim-seg"); w.setAttribute("role", "group"); w.setAttribute("aria-label", label);
  options.forEach(function(o, i){
    var b = el("button", i === 0 ? "on" : "", esc(o.l)); b.type = "button"; b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
    b.addEventListener("click", function(){ Array.prototype.forEach.call(w.children, function(x){ x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); }); b.classList.add("on"); b.setAttribute("aria-pressed", "true"); onpick(o, i); });
    w.appendChild(b);
  });
  parent.appendChild(w); return w;
}
/* Ejes simples. Devuelve funciones de escala. */
function axes(svg, o){
  var X = function(v){ return o.l + (v - o.x0) / (o.x1 - o.x0) * (o.w - o.l - o.r); };
  var Y = function(v){ return o.h - o.b - (v - o.y0) / (o.y1 - o.y0) * (o.h - o.t - o.b); };
  var g = sv("g", {"class":"sv-ax"}, svg);
  for(var i = 0; i <= (o.ny || 4); i++){
    var v = o.y0 + (o.y1 - o.y0) * i / (o.ny || 4), y = Y(v);
    sv("line", {x1:o.l, x2:o.w - o.r, y1:y, y2:y, "class":i ? "sv-grid" : "sv-base"}, g);
    txt(g, o.l - 6, y + 4, o.fy ? o.fy(v) : nf(v), "sv-tick", "end");
  }
  (o.xt || []).forEach(function(v){ txt(g, X(v), o.h - o.b + 16, o.fx ? o.fx(v) : nf(v), "sv-tick", "middle"); });
  if(o.xl) txt(g, (o.l + o.w - o.r) / 2, o.h - 4, o.xl, "sv-axl", "middle");
  if(o.yl) txt(g, o.l, o.t - 8, o.yl, "sv-axl", "start");
  return {X:X, Y:Y};
}
/* Ancho de dibujo = ancho real del contenedor (entre 300 y el ancho de diseño), para que el texto no se encoja en móvil. */
function cw(f, def){ var w = f.chart.clientWidth || def; return Math.max(300, Math.min(def, Math.round(w))); }
var redraws = [], rzT;
function onResize(fn){ redraws.push(fn); }
window.addEventListener("resize", function(){ clearTimeout(rzT); rzT = setTimeout(function(){ redraws.forEach(function(fn){ try{ fn(); }catch(e){} }); }, 150); });
function path(pts){ return pts.map(function(p, i){ return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(""); }

/* ══ 1. Costes de la infraestructura: ¿qué pasa cuando circulan más trenes? ══ */
function costes(root){
  var D = {nA:40, nB:120, F:40, v:2, L:100, cap:180, S:15};
  var f = frame(root, {note:"Modelo ilustrativo de una línea de doble vía de 100 km: los importes no son de ninguna línea real. Coste fijo = mantenimiento, renovación y amortización que existen aunque no circule ningún tren; coste variable = desgaste por cada tren·km."});
  var g1 = group(f.ctrl, "Escenarios que comparas"), g2 = group(f.ctrl, "Hipótesis del modelo");
  var sA = slider({label:"Escenario A · trenes al día", min:0, max:250, step:1, value:D.nA}, draw);
  var sB = slider({label:"Escenario B · trenes al día", min:0, max:250, step:1, value:D.nB}, draw);
  var sF = slider({label:"Coste fijo de la línea", unit:"M€/año", min:5, max:120, step:1, value:D.F, help:"no depende del tráfico"}, draw);
  var sV = slider({label:"Desgaste por tren·km", unit:"€", min:0.5, max:15, step:0.5, value:D.v, help:"coste directamente imputable"}, draw);
  g1.appendChild(sA.el); g1.appendChild(sB.el); g2.appendChild(sF.el); g2.appendChild(sV.el);
  var cb = el("label", "sim-chk", '<input type="checkbox" checked> Escalón de capacidad: por encima de ' + D.cap + " trenes al día hay que ampliar la línea (+" + D.S + " M€/año de coste fijo)");
  g2.appendChild(cb); var chk = cb.querySelector("input"); chk.addEventListener("change", draw);
  resetBtn(f.ctrl, function(){ sA.set(D.nA); sB.set(D.nB); sF.set(D.F); sV.set(D.v); chk.checked = true; draw(); });

  function calc(n){
    var F = sF.get() + (chk.checked && n > D.cap ? D.S : 0), T = n * 365, CV = sV.get() * D.L * T / 1e6, CT = F + CV;
    return {n:n, T:T, CF:F, CV:CV, CT:CT, med:T ? CT * 1e6 / T : NaN};
  }
  function draw(){
    var a = calc(sA.get()), b = calc(sB.get()), marg = sV.get() * D.L;
    var dn = b.n - a.n, inc = dn ? (b.CT - a.CT) * 1e6 / (dn * 365) : NaN;
    kpis(f.kpis, [
      {l:"Coste total A", v:meur(a.CT), s:"fijo " + meur(a.CF) + " · variable " + meur(a.CV)},
      {l:"Coste total B", v:meur(b.CT), s:"fijo " + meur(b.CF) + " · variable " + meur(b.CV)},
      {l:"Coste medio por tren", v:(isFinite(a.med) ? eur(a.med) : "—") + " → " + (isFinite(b.med) ? eur(b.med) : "—"), s:"de A a B", cls:"sim-k-acc"},
      {l:"Coste marginal de un tren más", v:eur(marg), s:"desgaste de un tren en 100 km"},
      {l:"Coste incremental de A a B", v:isFinite(inc) ? eur(inc) + " por tren" : "—", s:"(CT B − CT A) ÷ trenes añadidos"}
    ]);
    clear(f.chart);
    var box = el("div", "sim-2c"); f.chart.appendChild(box);
    /* barras apiladas */
    var two = f.chart.clientWidth >= 640, W = two ? 340 : cw(f, 420), H = 250, s1 = svgBox(W, H, "Coste total de los escenarios A y B separado en fijo y variable"); box.appendChild(s1);
    var ymax = niceMax(Math.max(a.CT, b.CT) * 1.1), ax = axes(s1, {w:W, h:H, l:46, r:12, t:42, b:34, x0:0, x1:2, y0:0, y1:ymax, yl:"M€ al año", fy:function(v){ return nf(v); }});
    [a, b].forEach(function(s, i){
      var wB = Math.min(84, W / 4), x = ax.X(i + 0.5) - wB / 2, yF = ax.Y(s.CF), yT = ax.Y(s.CT);
      sv("rect", {x:x, y:yF, width:wB, height:Math.max(0, ax.Y(0) - yF), "class":"sv-f1"}, s1);
      sv("rect", {x:x, y:yT, width:wB, height:Math.max(0, yF - yT), "class":"sv-f2"}, s1);
      txt(s1, x + wB / 2, yT - 6, meur(s.CT), "sv-val", "middle");
      txt(s1, x + wB / 2, H - 14, (i ? "B · " : "A · ") + s.n + " trenes/día", "sv-tick", "middle");
    });
    var lg = sv("g", {}, s1); sv("rect", {x:46, y:6, width:10, height:10, "class":"sv-f1"}, lg); txt(lg, 60, 15, "fijo", "sv-tick");
    sv("rect", {x:96, y:6, width:10, height:10, "class":"sv-f2"}, lg); txt(lg, 110, 15, "variable (desgaste)", "sv-tick");
    /* curva de coste medio */
    var s2 = svgBox(W, H, "Coste medio por tren según el número de trenes al día, con los escenarios A y B marcados"); box.appendChild(s2);
    var top = Math.max(isFinite(a.med) ? a.med : 0, isFinite(b.med) ? b.med : 0, calc(20).med) * 1.15;
    var ym = niceMax(top), ax2 = axes(s2, {w:W, h:H, l:52, r:12, t:26, b:42, x0:0, x1:250, y0:0, y1:ym, xt:[0, 50, 100, 150, 200, 250], yl:"€ por tren", fy:function(v){ return nf(v); }, xl:"trenes al día"});
    var pts = []; for(var n = 2; n <= 250; n += 2){ var m = calc(n).med; if(m <= ym) pts.push([ax2.X(n), ax2.Y(m)]); }
    sv("path", {d:path(pts), "class":"sv-l1"}, s2);
    sv("line", {x1:ax2.X(0), x2:ax2.X(250), y1:ax2.Y(marg), y2:ax2.Y(marg), "class":"sv-l2"}, s2);
    txt(s2, ax2.X(250) - 2, ax2.Y(marg) - 5, "coste marginal", "sv-tick sv-c2", "end");
    [a, b].forEach(function(s, i){ if(isFinite(s.med) && s.med <= ym){ sv("circle", {cx:ax2.X(s.n), cy:ax2.Y(s.med), r:6, "class":i ? "sv-pB" : "sv-pA"}, s2); txt(s2, ax2.X(s.n) + 8, ax2.Y(s.med) - 8, i ? "B" : "A", "sv-val"); } });
    /* explicación automática */
    var m = [];
    if(a.n === 0 || b.n === 0){
      m.push("Con <b>0 trenes</b> el coste fijo sigue ahí (" + meur((a.n === 0 ? a : b).CF) + " al año), pero no hay trenes entre los que repartirlo: el coste medio por tren <b>no está definido</b>. Es la vía vacía: cuesta lo mismo y no la usa nadie.");
    }
    if(a.n === b.n) m.push("Los dos escenarios tienen el mismo tráfico: mueve uno de los dos para compararlos.");
    else if(a.n > 0 && b.n > 0){
      var up = b.n > a.n;
      m.push("Si pasamos de <b>" + a.n + " a " + b.n + " trenes al día</b>, el coste total " + (b.CT >= a.CT ? "sube" : "baja") + " un " + pct(Math.abs(chg(a.CT, b.CT))) + " (de " + meur(a.CT) + " a " + meur(b.CT) + "), pero el coste medio por tren " + (b.med <= a.med ? "baja" : "sube") + " un " + pct(Math.abs(chg(a.med, b.med))) + " (de " + eur(a.med) + " a " + eur(b.med) + "), porque los costes fijos se reparten entre " + (up ? "más" : "menos") + " servicios.");
      m.push("Cada tren " + (up ? "añadido" : "retirado") + " cuesta de media <b>" + eur(Math.abs(inc)) + "</b>, frente a un coste medio de " + eur(Math.max(a.med, b.med)) + ". Por eso cobrar a cada tren el coste medio expulsaría tráficos que sí pagan lo que desgastan.");
      if(chk.checked && (a.n > D.cap) !== (b.n > D.cap)) m.push("<b>Ojo:</b> entre A y B se cruza el límite de " + D.cap + " trenes al día. Hay que ampliar capacidad (+" + D.S + " M€/año) y el coste incremental se dispara: la infraestructura crece a saltos, la demanda no.");
      m.push("En B, el " + pct(b.CF / b.CT, 0) + " del coste es fijo.");
    }
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  draw(); onResize(draw);
}

/* ══ 2. Tarifa en dos partes ══ */
function dospartes(root){
  var MODES = [
    {l:"Viajeros (abono con cuota)", unitF:"€/mes", unitP:"€/viaje", unitN:"viajes al mes", F:30, p:3, u:8, n:10, maxF:200, maxP:30, maxU:40, maxN:60, stepP:0.5,
     prof:[["Ocasional", 2], ["Habitual", 12], ["Intensivo", 40]], who:"viajero", what:"viajes", money:eur, per:"por viaje"},
    {l:"Operadores (canon en dos partes)", unitF:"M€/año", unitP:"€/tren·km", unitN:"millones de tren·km", F:10, p:1, u:3, n:5, maxF:50, maxP:10, maxU:15, maxN:20, stepP:0.1,
     prof:[["Operador pequeño", 0.5], ["Mediano", 3], ["Grande", 10]], who:"operador", what:"millones de tren·km", money:meur, per:"por tren·km"}
  ];
  var M = MODES[0];
  var f = frame(root, {note:"Tarifas ilustrativas. El modo «Operadores» reproduce el ejemplo del libro: con una cuota fija, el operador pequeño paga mucho más por tren·km."});
  seg(f.ctrl, "Qué quieres simular", MODES, function(o){ M = o; build(); });
  var holder = el("div"); f.ctrl.appendChild(holder);
  var sF, sP, sU, sN;
  function build(){
    holder.innerHTML = "";
    var g1 = group(holder, "Tarifa en dos partes"), g2 = group(holder, "Tarifa única de comparación"), g3 = group(holder, "Tu perfil");
    sF = slider({label:"Parte fija (cuota)", unit:M.unitF, min:0, max:M.maxF, step:M.stepP, value:M.F, help:"se paga aunque no se use"}, draw);
    sP = slider({label:"Parte variable (precio por uso)", unit:M.unitP, min:0, max:M.maxP, step:M.stepP, value:M.p}, draw);
    sU = slider({label:"Precio único por uso, sin cuota", unit:M.unitP, min:0, max:M.maxU, step:M.stepP, value:M.u}, draw);
    sN = slider({label:"Uso", unit:M.unitN, min:0, max:M.maxN, step:M.who === "viajero" ? 1 : 0.1, value:M.n}, draw);
    g1.appendChild(sF.el); g1.appendChild(sP.el); g2.appendChild(sU.el); g3.appendChild(sN.el);
    resetBtn(holder, function(){ sF.set(M.F); sP.set(M.p); sU.set(M.u); sN.set(M.n); draw(); });
    draw();
  }
  function draw(){
    var F = sF.get(), p = sP.get(), u = sU.get(), money = M.money;
    var profs = M.prof.concat([["Tu perfil", sN.get()]]);
    var rows = profs.map(function(r){ var two = F + p * r[1], one = u * r[1]; return {n:r[0], q:r[1], two:two, one:one, avg:r[1] ? two / r[1] : NaN}; });
    var be = u > p ? F / (u - p) : Infinity;
    kpis(f.kpis, [
      {l:"Pagas con dos partes (tu perfil)", v:money(rows[3].two), s:isFinite(rows[3].avg) ? eur(rows[3].avg, 2) + " " + M.per : "sin uso: solo la cuota", cls:"sim-k-acc"},
      {l:"Pagarías con tarifa única", v:money(rows[3].one)},
      {l:"Punto de equilibrio", v:isFinite(be) ? nf(be, M.who === "viajero" ? 1 : 2) + " " + M.what : "no existe", s:isFinite(be) ? "a partir de ahí compensa la cuota" : "el precio por uso no es más barato que la tarifa única"}
    ]);
    clear(f.chart);
    var tbl = '<div class="tw"><table class="dxtbl sim-tbl"><thead><tr><th>Perfil</th><th>Uso</th><th>Dos partes</th><th>' + esc(M.per.charAt(0).toUpperCase() + M.per.slice(1)) + '</th><th>Tarifa única</th><th>Le conviene</th></tr></thead><tbody>' +
      rows.map(function(r){ var best = r.two < r.one ? "dos partes" : (r.two > r.one ? "tarifa única" : "igual"); return "<tr><td>" + esc(r.n) + "</td><td>" + nf(r.q, M.who === "viajero" ? 0 : 1) + "</td><td>" + money(r.two) + "</td><td>" + (isFinite(r.avg) ? eur(r.avg, 2) : "—") + "</td><td>" + money(r.one) + "</td><td>" + best + "</td></tr>"; }).join("") + "</tbody></table></div>";
    var W = cw(f, 640), H = 240, s = svgBox(W, H, "Pago total según el uso con la tarifa en dos partes y con la tarifa única");
    var xmax = M.maxN, ymax = niceMax(Math.max(F + p * xmax, u * xmax) * 1.05);
    var ax = axes(s, {w:W, h:H, l:58, r:16, t:24, b:36, x0:0, x1:xmax, y0:0, y1:ymax, xt:[0, xmax / 4, xmax / 2, 3 * xmax / 4, xmax], xl:"uso (" + M.unitN + ")", yl:"pago total (" + M.unitF.split("/")[0] + ")", fx:function(v){ return nf(v, M.who === "viajero" ? 0 : 1); }});
    sv("path", {d:path([[ax.X(0), ax.Y(F)], [ax.X(xmax), ax.Y(F + p * xmax)]]), "class":"sv-l1"}, s);
    sv("path", {d:path([[ax.X(0), ax.Y(0)], [ax.X(xmax), ax.Y(u * xmax)]]), "class":"sv-l3"}, s);
    txt(s, ax.X(xmax) - 4, ax.Y(F + p * xmax) - 6, "dos partes", "sv-tick sv-c1", "end");
    txt(s, ax.X(xmax * 0.62), ax.Y(u * xmax * 0.62) - 8, "tarifa única", "sv-tick sv-c3", "end");
    if(isFinite(be) && be <= xmax){ sv("line", {x1:ax.X(be), x2:ax.X(be), y1:ax.Y(0), y2:ax.Y(F + p * be), "class":"sv-dash"}, s); txt(s, ax.X(be) + 4, ax.Y(0) - 6, "equilibrio", "sv-tick"); }
    rows.forEach(function(r, i){ if(r.q <= xmax){ sv("circle", {cx:ax.X(r.q), cy:ax.Y(r.two), r:i === 3 ? 6 : 4, "class":i === 3 ? "sv-pB" : "sv-pA"}, s); } });
    f.chart.appendChild(s); f.chart.insertAdjacentHTML("beforeend", tbl);
    var lo = rows[0], hi = rows[2], m = [];
    if(isFinite(lo.avg) && isFinite(hi.avg)) m.push("Con la tarifa en dos partes, el perfil «" + esc(lo.n) + "» paga <b>" + eur(lo.avg, 2) + " " + M.per + "</b> y el «" + esc(hi.n) + "», <b>" + eur(hi.avg, 2) + "</b>: la cuota pesa más cuanto menos se usa.");
    if(isFinite(be)) m.push("Por debajo de " + nf(be, M.who === "viajero" ? 1 : 2) + " " + M.what + " sale más barata la tarifa única; por encima, la de dos partes. Quien más usa el servicio diluye la parte fija.");
    else m.push("Con estos valores el precio por uso no es más barato que la tarifa única, así que la cuota nunca compensa.");
    if(M.who === "operador") m.push("Es el argumento del libro: con canon en dos partes el operador grande diluye la cuota y el pequeño puede quedar fuera del mercado. Por eso solo encaja donde hay un único operador, como un servicio OSP adjudicado.");
    else m.push("La parte variable decide cuánto se usa (cada viaje cuesta solo " + money(p, 2) + "); la parte fija decide si alguien se apunta. Si la cuota es alta, los viajeros ocasionales se quedan fuera.");
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  build(); onResize(function(){ if(sF) draw(); });
}

/* ══ 3. Regla de Ramsey ══ */
function ramsey(root){
  var SEG0 = [{n:"AVE comercial", q:60, c:2.0, e:-0.4}, {n:"Regional y Cercanías", q:90, c:1.2, e:-0.9}, {n:"Mercancías", q:30, c:1.0, e:-1.8}], R0 = 120;
  var f = frame(root, {note:"Modelo didáctico con tres segmentos y cifras inventadas: demanda de elasticidad constante, Q = Q₀·(p/c)^e, donde c es el coste marginal (canon básico) y Q₀ el tráfico si solo se cobrara c. La regla de Ramsey fija (p − c)/p = λ/|e| y busca el λ mínimo que alcanza la recaudación. En la realidad hay más restricciones: la Directiva exige no expulsar a quien cubre su coste directo y los cánones los informa la CNMC."});
  var gR = group(f.ctrl, "Objetivo"), gE = group(f.ctrl, "Elasticidad de cada segmento");
  var sR = slider({label:"Costes fijos que hay que recuperar", unit:"M€/año", min:0, max:300, step:5, value:R0, help:"además del canon básico"}, draw);
  gR.appendChild(sR.el);
  var sE = SEG0.map(function(s){ var c = slider({label:s.n, unit:"e", min:-3, max:-0.1, step:0.1, value:s.e, help:"tráfico " + s.q + " M tren·km · coste marginal " + nf(s.c, 1) + " €"}, draw); gE.appendChild(c.el); return c; });
  resetBtn(f.ctrl, function(){ sR.set(R0); sE.forEach(function(c, i){ c.set(SEG0[i].e); }); draw(); });

  function demand(s, p, e){ return s.q * Math.pow(p / s.c, e); }
  function cs(s, p, e){ /* pérdida de excedente del consumidor al subir de c a p */
    return Math.abs(e + 1) < 1e-9 ? s.q * s.c * Math.log(p / s.c) : s.q * s.c / (e + 1) * (Math.pow(p / s.c, e + 1) - 1);
  }
  function evalPrices(prices, es){
    var rev = 0, q = 0, loss = 0, dcs = 0;
    var seg = SEG0.map(function(s, i){ var Q = demand(s, prices[i], es[i]); rev += (prices[i] - s.c) * Q; q += Q; dcs += cs(s, prices[i], es[i]); return {p:prices[i], m:prices[i] - s.c, Q:Q, keep:Q / s.q, rev:(prices[i] - s.c) * Q}; });
    return {seg:seg, rev:rev, Q:q, dwl:dcs - rev};
  }
  function solveRamsey(R, es){
    var best = null;
    for(var L = 0; L <= 0.95; L += 0.0005){
      var pr = SEG0.map(function(s, i){ var r = Math.min(L / Math.abs(es[i]), 0.95); return s.c / (1 - r); });
      var ev = evalPrices(pr, es); ev.L = L;
      if(ev.rev >= R - 1e-6) return ev;
      if(!best || ev.rev > best.rev) best = ev;
    }
    best.fail = true; return best;
  }
  function solveUniform(R, es){
    var best = null;
    for(var m = 0; m <= 40; m += 0.005){
      var ev = evalPrices(SEG0.map(function(s){ return s.c + m; }), es); ev.m = m;
      if(ev.rev >= R - 1e-6) return ev;
      if(!best || ev.rev > best.rev) best = ev;
    }
    best.fail = true; return best;
  }
  function draw(){
    var R = sR.get(), es = sE.map(function(c){ return c.get(); });
    var ra = solveRamsey(R, es), un = solveUniform(R, es), Q0 = SEG0.reduce(function(a, s){ return a + s.q; }, 0);
    kpis(f.kpis, [
      {l:"Tráfico perdido con Ramsey", v:ra.fail ? "inalcanzable" : pct(1 - ra.Q / Q0), s:ra.fail ? "máx. " + meur(ra.rev, 0) : nf(Q0 - ra.Q, 1) + " M tren·km", cls:"sim-k-acc"},
      {l:"Tráfico perdido con recargo igual", v:un.fail ? "inalcanzable" : pct(1 - un.Q / Q0), s:un.fail ? "máx. " + meur(un.rev, 0) : nf(Q0 - un.Q, 1) + " M tren·km"},
      {l:"Pérdida de bienestar", v:(ra.fail ? "—" : meur(ra.dwl)) + " frente a " + (un.fail ? "—" : meur(un.dwl)), s:"Ramsey frente a recargo igual"}
    ]);
    clear(f.chart);
    var W = cw(f, 640), nar = W < 520, RH = nar ? 92 : 74, H = 70 + SEG0.length * RH, s = svgBox(W, H, "Recargo por tren·km de cada segmento con la regla de Ramsey y con un recargo igual para todos");
    var mx = niceMax(Math.max.apply(null, ra.seg.map(function(x){ return x.m; }).concat(un.seg.map(function(x){ return x.m; }))) * 1.1);
    var x0 = nar ? 8 : 170, x1 = W - (nar ? 150 : 70), X = function(v){ return x0 + v / mx * (x1 - x0); };
    txt(s, 8, 18, nar ? "Recargo (€/tren·km) y tráfico que queda" : "Recargo sobre el coste marginal (€ por tren·km) y tráfico que se conserva", "sv-axl");
    sv("rect", {x:8, y:28, width:10, height:10, "class":"sv-f1"}, s); txt(s, 22, 37, "Ramsey", "sv-tick");
    sv("rect", {x:88, y:28, width:10, height:10, "class":"sv-f3"}, s); txt(s, 102, 37, "recargo igual para todos", "sv-tick");
    SEG0.forEach(function(sg, i){
      var y = 56 + i * RH;
      if(nar){ txt(s, 8, y + 12, sg.n + " · e = " + nf(es[i], 1), "sv-lab"); y += 22; }
      else { txt(s, 8, y + 16, sg.n, "sv-lab"); txt(s, 8, y + 34, "e = " + nf(es[i], 1), "sv-tick"); }
      [[ra, "sv-f1", 0], [un, "sv-f3", 26]].forEach(function(t){
        var v = t[0].seg[i];
        sv("rect", {x:x0, y:y + t[2], width:Math.max(1, X(v.m) - x0), height:20, rx:3, "class":t[1]}, s);
        txt(s, X(v.m) + 6, y + t[2] + 15, nf(v.m, 2) + " € · " + (nar ? "" : "conserva ") + pct(v.keep, 0), "sv-val");
      });
    });
    f.chart.appendChild(s);
    var tbl = '<div class="tw"><table class="dxtbl sim-tbl"><thead><tr><th>Segmento</th><th>Precio Ramsey</th><th>Aporta</th><th>Precio con recargo igual</th><th>Aporta</th></tr></thead><tbody>' +
      SEG0.map(function(sg, i){ return "<tr><td>" + esc(sg.n) + "</td><td>" + eur(ra.seg[i].p, 2) + "</td><td>" + meur(ra.seg[i].rev) + "</td><td>" + eur(un.seg[i].p, 2) + "</td><td>" + meur(un.seg[i].rev) + "</td></tr>"; }).join("") +
      "<tr><td><b>Total recaudado</b></td><td></td><td><b>" + meur(ra.rev) + "</b></td><td></td><td><b>" + meur(un.rev) + "</b></td></tr></tbody></table></div>";
    f.chart.insertAdjacentHTML("beforeend", tbl);
    var m = [];
    if(R === 0) m.push("Sin costes fijos que recuperar, todos pagan solo su coste marginal y no se pierde tráfico. Es el canon básico de la Directiva.");
    else if(ra.fail) m.push("Con estas elasticidades <b>no se pueden recaudar " + meur(R, 0) + "</b> solo con recargos: el máximo alcanzable ronda " + meur(ra.rev, 0) + ". El resto tendría que pagarlo el Estado.");
    else {
      var order = es.map(function(e, i){ return i; }).sort(function(a, b){ return ra.seg[b].m - ra.seg[a].m; });
      m.push("Para recaudar " + meur(R, 0) + ", Ramsey carga el mayor recargo a <b>" + esc(SEG0[order[0]].n) + "</b> (" + eur(ra.seg[order[0]].m, 2) + " por tren·km), el segmento con demanda menos sensible al precio, y el menor a <b>" + esc(SEG0[order[2]].n) + "</b> (" + eur(ra.seg[order[2]].m, 2) + ").");
      if(!un.fail) m.push("Con un recargo igual para todos se pierde un " + pct(1 - un.Q / Q0) + " del tráfico; con Ramsey, un " + pct(1 - ra.Q / Q0) + ". La pérdida de bienestar baja de " + meur(un.dwl) + " a " + meur(ra.dwl) + ".");
      else m.push("Un recargo igual para todos <b>no llega</b> a esa recaudación: expulsa antes a los segmentos sensibles.");
      if(ra.seg.some(function(x){ return x.keep < 0.5; })) m.push("<b>Ojo:</b> algún segmento pierde más de la mitad de su tráfico. La Directiva no permite recargos que excluyan a segmentos que cubren al menos su coste directo: en la práctica se limitaría ese recargo.");
    }
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  draw(); onResize(draw);
}

/* ══ 4. Elasticidad-precio de la demanda ══ */
function elasticidad(root){
  var PRE = [{l:"Billete de ocio", p0:50, p1:40, q0:1000, q1:1400}, {l:"Viaje de trabajo", p0:80, p1:100, q0:500, q1:470}, {l:"Café del bar", p0:1.5, p1:1.8, q0:200, q1:190}];
  var f = frame(root, {note:"Ejemplos inventados. La elasticidad mide cuánto cambia la cantidad demandada (en %) cuando cambia el precio (en %), si todo lo demás no cambia."});
  var holder = el("div");
  seg(f.ctrl, "Ejemplos", PRE, function(o){ set(o); draw(); });
  f.ctrl.appendChild(holder);
  var g1 = group(holder, "Precio del billete"), g2 = group(holder, "Viajeros");
  var sP0 = slider({label:"Precio inicial", unit:"€", min:0.5, max:150, step:0.1, value:PRE[0].p0}, draw);
  var sP1 = slider({label:"Precio nuevo", unit:"€", min:0.5, max:150, step:0.1, value:PRE[0].p1}, draw);
  var sQ0 = slider({label:"Demanda inicial", unit:"viajeros", min:0, max:3000, step:10, value:PRE[0].q0}, draw);
  var sQ1 = slider({label:"Demanda nueva", unit:"viajeros", min:0, max:3000, step:10, value:PRE[0].q1}, draw);
  g1.appendChild(sP0.el); g1.appendChild(sP1.el); g2.appendChild(sQ0.el); g2.appendChild(sQ1.el);
  function set(o){ sP0.set(o.p0); sP1.set(o.p1); sQ0.set(o.q0); sQ1.set(o.q1); }
  resetBtn(holder, function(){ set(PRE[0]); draw(); });
  function kind(E){ var a = Math.abs(E); return a < 1e-9 ? "perfectamente inelástica" : a < 1 - 1e-9 ? "inelástica" : a > 1 + 1e-9 ? "elástica" : "de elasticidad unitaria"; }
  function draw(){
    var p0 = sP0.get(), p1 = sP1.get(), q0 = sQ0.get(), q1 = sQ1.get();
    var dP = chg(p0, p1), dQ = chg(q0, q1), Es = dQ / dP;
    var dPm = (p1 - p0) / ((p1 + p0) / 2), dQm = (q1 + q0) ? (q1 - q0) / ((q1 + q0) / 2) : NaN, Em = dQm / dPm;
    var same = Math.abs(p1 - p0) < 1e-9;
    kpis(f.kpis, [
      {l:"Elasticidad (punto medio)", v:same || !isFinite(Em) ? "no calculable" : nf(Em, 2), s:same ? "el precio no cambia" : (isFinite(Em) ? "demanda " + kind(Em) : "sin viajeros"), cls:"sim-k-acc"},
      {l:"Elasticidad (% simples)", v:same || !isFinite(Es) ? "no calculable" : nf(Es, 2), s:"ΔQ " + (isFinite(dQ) ? pct(dQ) : "—") + " ÷ ΔP " + (isFinite(dP) ? pct(dP) : "—")},
      {l:"Ingresos (precio × viajeros)", v:eur(p0 * q0) + " → " + eur(p1 * q1), s:(p1 * q1 >= p0 * q0 ? "suben " : "bajan ") + (p0 * q0 ? pct(Math.abs(chg(p0 * q0, p1 * q1))) : "")}
    ]);
    clear(f.chart);
    var W = cw(f, 640), H = 260, s = svgBox(W, H, "Precio frente a viajeros: punto inicial y punto nuevo");
    var qm = niceMax(Math.max(q0, q1, 10) * 1.15), pm = niceMax(Math.max(p0, p1) * 1.2);
    var ax = axes(s, {w:W, h:H, l:56, r:20, t:24, b:38, x0:0, x1:qm, y0:0, y1:pm, xt:[0, qm / 4, qm / 2, 3 * qm / 4, qm], xl:"viajeros (cantidad demandada)", yl:"precio (€)", fy:function(v){ return nf(v, pm < 10 ? 1 : 0); }});
    sv("path", {d:path([[ax.X(q0), ax.Y(p0)], [ax.X(q1), ax.Y(p1)]]), "class":"sv-l1"}, s);
    sv("line", {x1:ax.X(q0), x2:ax.X(q0), y1:ax.Y(0), y2:ax.Y(p0), "class":"sv-dash"}, s);
    sv("line", {x1:ax.X(q1), x2:ax.X(q1), y1:ax.Y(0), y2:ax.Y(p1), "class":"sv-dash"}, s);
    sv("circle", {cx:ax.X(q0), cy:ax.Y(p0), r:7, "class":"sv-pA"}, s); txt(s, ax.X(q0) + 10, ax.Y(p0) - 8, "inicial", "sv-val");
    sv("circle", {cx:ax.X(q1), cy:ax.Y(p1), r:7, "class":"sv-pB"}, s); txt(s, ax.X(q1) + 10, ax.Y(p1) + 18, "nuevo", "sv-val");
    f.chart.appendChild(s);
    var m = [];
    if(same) m.push("El precio no ha cambiado, así que no se puede medir la reacción al precio: si los viajeros cambian, es por otra causa (horarios, competencia, temporada).");
    else if(!isFinite(Em)) m.push("Sin viajeros ni antes ni después no hay nada que medir.");
    else {
      m.push("El precio " + (p1 > p0 ? "sube" : "baja") + " un " + pct(Math.abs(dP)) + " y los viajeros " + (q1 >= q0 ? "suben" : "bajan") + " un " + (isFinite(dQ) ? pct(Math.abs(dQ)) : "—") + ". Con el método del punto medio la elasticidad es <b>" + nf(Em, 2) + "</b>: la demanda es <b>" + kind(Em) + "</b>.");
      if(Em > 0) m.push("<b>Ojo:</b> sale positiva (precio y viajeros se mueven en el mismo sentido). En la demanda de transporte suele ser negativa: si te sale positiva, seguramente ha cambiado otra cosa a la vez (una huelga, una obra, la temporada) y no puedes atribuírselo al precio.");
      else if(Math.abs(Em) < 1) m.push("Cada 1 % de cambio en el precio mueve menos de un 1 % los viajeros: subir el precio <b>aumenta</b> los ingresos y bajarlo los reduce. Es típico de quien viaja por trabajo o no tiene alternativa.");
      else if(Math.abs(Em) > 1) m.push("Los viajeros reaccionan más que el precio: bajar el precio <b>aumenta</b> los ingresos y subirlo los reduce. Es típico del viaje de ocio, que puede cambiar de fecha, de modo o no hacerse.");
      if(isFinite(Es) && Math.abs(Es - Em) > 0.05) m.push("El cálculo con porcentajes simples da " + nf(Es, 2) + ": depende de qué punto tomes como base. El punto medio da el mismo resultado si recorres el cambio al revés, por eso es el que se usa para comparar.");
    }
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  draw(); onResize(draw);
}

/* ══ 5. Análisis coste-beneficio ══ */
function acb(root){
  var D = {inv:450, obra:3, om:8, via:6, min:20, vot:15, otros:10, hor:30, r:3};
  var f = frame(root, {note:"Proyecto inventado (mejora que acorta el viaje entre dos ciudades). Inversión repartida a partes iguales en los años de obra; beneficios y costes de explotación desde el año siguiente al fin de la obra. Sin valor residual ni efectos fiscales. El valor del tiempo y la tasa de descuento oficiales los fijan las guías de evaluación (Comisión Europea, Ministerio, Adif)."});
  var g1 = group(f.ctrl, "Costes"), g2 = group(f.ctrl, "Beneficios anuales"), g3 = group(f.ctrl, "Evaluación");
  var C = {};
  [["inv", g1, {label:"Inversión inicial", unit:"M€", min:0, max:3000, step:10}], ["obra", g1, {label:"Años de obra", unit:"años", min:1, max:6, step:1}],
   ["om", g1, {label:"Explotación y mantenimiento", unit:"M€/año", min:0, max:100, step:1}],
   ["via", g2, {label:"Viajeros beneficiados", unit:"M/año", min:0, max:30, step:0.5}], ["min", g2, {label:"Ahorro de tiempo por viaje", unit:"min", min:0, max:120, step:1}],
   ["vot", g2, {label:"Valor del tiempo", unit:"€/hora", min:0, max:40, step:0.5}], ["otros", g2, {label:"Seguridad y externalidades", unit:"M€/año", min:0, max:200, step:1, help:"accidentes, CO₂, ruido evitados"}],
   ["hor", g3, {label:"Horizonte de explotación", unit:"años", min:5, max:50, step:1}], ["r", g3, {label:"Tasa de descuento", unit:"%", min:0, max:10, step:0.5}]
  ].forEach(function(x){ x[2].value = D[x[0]]; C[x[0]] = slider(x[2], draw); x[1].appendChild(C[x[0]].el); });
  resetBtn(f.ctrl, function(){ for(var k in D) C[k].set(D[k]); draw(); });

  function flows(v){
    var n = v.obra + v.hor, rows = [], bt = v.via * 1e6 * v.min / 60 * v.vot / 1e6;
    for(var t = 0; t < n; t++){
      var inv = t < v.obra ? v.inv / v.obra : 0, op = t >= v.obra;
      rows.push({t:t, c:inv + (op ? v.om : 0), b:op ? bt + v.otros : 0});
    }
    return {rows:rows, bt:bt};
  }
  function pv(rows, r, key){ return rows.reduce(function(a, x){ return a + x[key] / Math.pow(1 + r, x.t); }, 0); }
  function npv(rows, r){ return pv(rows, r, "b") - pv(rows, r, "c"); }
  function irr(rows){
    var lo = -0.9, hi = 1, flo = npv(rows, lo), fhi = npv(rows, hi);
    if(!(flo > 0 && fhi < 0)) return NaN;
    for(var i = 0; i < 100; i++){ var mid = (lo + hi) / 2, fm = npv(rows, mid); if(fm > 0) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function draw(){
    var v = {}; for(var k in C) v[k] = C[k].get();
    var r = v.r / 100, F = flows(v), rows = F.rows;
    var TC = rows.reduce(function(a, x){ return a + x.c; }, 0), TB = rows.reduce(function(a, x){ return a + x.b; }, 0);
    var VC = pv(rows, r, "c"), VB = pv(rows, r, "b"), VAN = VB - VC, BC = VC > 0 ? VB / VC : NaN, T = irr(rows);
    var cum = 0, pay = null; rows.forEach(function(x){ cum += (x.b - x.c) / Math.pow(1 + r, x.t); x.cum = cum; if(pay === null && cum >= 0 && x.t >= v.obra) pay = x.t; });
    var ok = VAN > 0 && VC > 0;
    kpis(f.kpis, [
      {l:"Costes totales (sin descontar)", v:meur(TC, 0)}, {l:"Beneficios totales (sin descontar)", v:meur(TB, 0)},
      {l:"Valor actual de los costes", v:meur(VC, 0)}, {l:"Valor actual de los beneficios", v:meur(VB, 0)},
      {l:"Valor actual neto (VAN)", v:meur(VAN, 0), cls:ok ? "sim-k-pos" : "sim-k-neg"},
      {l:"Relación beneficio/coste", v:isFinite(BC) ? nf(BC, 2) : "—", s:isFinite(T) ? "TIR económica " + pct(T) : "sin TIR"},
      {l:"Resultado", v:VC <= 0 ? "sin costes" : ok ? "Socialmente rentable" : "No rentable socialmente", s:pay !== null ? "recupera la inversión (descontada) en el año " + pay : "no recupera la inversión en el horizonte", cls:ok ? "sim-k-pos" : "sim-k-neg"}
    ]);
    clear(f.chart);
    var W = cw(f, 660), H = 270, s = svgBox(W, H, "Flujos anuales descontados de beneficios y costes y VAN acumulado año a año");
    var dv = rows.map(function(x){ var d = Math.pow(1 + r, x.t); return {t:x.t, b:x.b / d, c:x.c / d, cum:x.cum}; });
    var top = Math.max.apply(null, dv.map(function(x){ return Math.max(x.b, x.cum); }).concat([1])), bot = Math.min.apply(null, dv.map(function(x){ return Math.min(-x.c, x.cum); }).concat([-1]));
    var ymax = niceMax(top * 1.05), ymin = -niceMax(-bot * 1.05);
    var n = rows.length, step = n > 30 ? 10 : 5, xt = []; for(var i = 0; i <= n; i += step) xt.push(i);
    var ax = axes(s, {w:W, h:H, l:58, r:14, t:40, b:36, x0:0, x1:n, y0:ymin, y1:ymax, ny:4, xt:xt, xl:"año", yl:"M€ descontados", fy:function(v){ return nf(v); }});
    var bw = Math.max(1.5, (ax.X(1) - ax.X(0)) * 0.7);
    dv.forEach(function(x){
      if(x.b > 0) sv("rect", {x:ax.X(x.t + 0.5) - bw / 2, y:ax.Y(x.b), width:bw, height:Math.max(0, ax.Y(0) - ax.Y(x.b)), "class":"sv-f3"}, s);
      if(x.c > 0) sv("rect", {x:ax.X(x.t + 0.5) - bw / 2, y:ax.Y(0), width:bw, height:Math.max(0, ax.Y(-x.c) - ax.Y(0)), "class":"sv-f4"}, s);
    });
    sv("line", {x1:ax.X(0), x2:ax.X(n), y1:ax.Y(0), y2:ax.Y(0), "class":"sv-base"}, s);
    sv("path", {d:path(dv.map(function(x){ return [ax.X(x.t + 0.5), ax.Y(x.cum)]; })), "class":"sv-l1"}, s);
    var lg = sv("g", {}, s);
    sv("rect", {x:8, y:6, width:10, height:10, "class":"sv-f3"}, lg); txt(lg, 22, 15, "beneficios", "sv-tick");
    sv("rect", {x:92, y:6, width:10, height:10, "class":"sv-f4"}, lg); txt(lg, 106, 15, "costes", "sv-tick");
    sv("line", {x1:160, x2:180, y1:11, y2:11, "class":"sv-l1"}, lg); txt(lg, 184, 15, "VAN acumulado", "sv-tick");
    f.chart.appendChild(s);
    var m = [];
    m.push("Cada año el proyecto da " + meur(F.bt) + " por ahorro de tiempo (" + nf(v.via, 1) + " M de viajeros × " + v.min + " min × " + nf(v.vot, 1) + " €/h) y " + meur(v.otros, 0) + " por seguridad y externalidades, frente a " + meur(v.om, 0) + " de explotación.");
    if(VC > 0) m.push(ok ? "Descontados al " + nf(v.r, 1) + " %, los beneficios superan a los costes en " + meur(VAN, 0) + " (B/C = " + nf(BC, 2) + "): <b>la sociedad gana</b> con el proyecto aunque no ingrese un euro por billetes." : "Descontados al " + nf(v.r, 1) + " %, los costes superan a los beneficios en " + meur(-VAN, 0) + " (B/C = " + nf(BC, 2) + "): con estas hipótesis <b>el proyecto no compensa</b> a la sociedad.");
    var up = v.r + 1, vanUp = npv(rows, up / 100);
    m.push("Si la tasa de descuento subiera al " + nf(up, 1) + " %, el VAN pasaría a " + meur(vanUp, 0) + ". Al aumentar la tasa, los beneficios futuros pesan menos en la evaluación de hoy, y en el tren casi todo el coste llega al principio y el beneficio, después.");
    if(v.r === 0) m.push("Con tasa 0 un euro de dentro de 30 años vale lo mismo que uno de hoy: es el caso que más favorece a las inversiones de vida larga.");
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  draw(); onResize(draw);
}

/* ══ 6. Organigrama del sector ferroviario ══ */
function organigrama(root){
  var dataEl = root.querySelector(".sim-data"), D;
  try{ D = JSON.parse(dataEl.textContent); }catch(e){ root.innerHTML = '<p class="sim-ns">No se pudo leer el organigrama.</p>'; return; }
  /* Los datos pueden venir de una base (área privada): ids solo [a-z0-9-] y enlaces solo https */
  var okId = function(x){ return /^[a-z0-9-]{1,40}$/.test(String(x)); }, okUrl = function(u){ return /^https:\/\/[^\s"'<>]+$/.test(String(u || "")) ? u : ""; };
  D.tipos = (D.tipos || []).filter(function(r){ return okId(r.id); });
  D.nodos = (D.nodos || []).filter(function(n){ return okId(n.id); });
  D.nodos.forEach(function(n){ n.web = okUrl(n.web); n.fuente = okUrl(n.fuente); n.funciones = n.funciones || []; });
  D.preguntas = D.preguntas || []; D.niveles = D.niveles || [];
  var nid = {}, tid = {}; D.nodos.forEach(function(n){ nid[n.id] = 1; }); D.tipos.forEach(function(r){ tid[r.id] = 1; });
  D.rel = (D.rel || []).filter(function(e){ return nid[e.a] && nid[e.b] && tid[e.t]; });
  var REL = D.tipos, byId = {}, sel = null, on = {};
  D.nodos.forEach(function(n){ byId[n.id] = n; });
  REL.forEach(function(r){ on[r.id] = true; });
  root.innerHTML = "";
  var top = el("div", "org-top"), qs = el("div", "org-qs"), legend = el("div", "org-leg");
  top.appendChild(el("p", "org-hint", "Pulsa una entidad para ver su ficha y sus relaciones, o elige una pregunta."));
  var qSel = el("select", "org-q"); qSel.setAttribute("aria-label", "Preguntas sobre quién hace qué");
  qSel.innerHTML = '<option value="">¿Quién…? Elige una pregunta</option>' + D.preguntas.map(function(q, i){ return '<option value="' + i + '">' + esc(q.q) + "</option>"; }).join("");
  qs.appendChild(qSel); top.appendChild(qs);
  legend.innerHTML = '<span class="org-lt">Relaciones:</span>' + REL.map(function(r){ return '<label class="org-li"><input type="checkbox" checked data-r="' + r.id + '"><svg viewBox="0 0 28 8" aria-hidden="true"><line x1="1" y1="4" x2="27" y2="4" class="org-e org-e-' + r.id + '"/></svg>' + esc(r.l) + "</label>"; }).join("");
  top.appendChild(legend); root.appendChild(top);
  var stage = el("div", "org-stage"), lines = sv("svg", {"class":"org-lines", "aria-hidden":"true"}), tiers = el("div", "org-tiers");
  stage.appendChild(lines); stage.appendChild(tiers);
  var card = el("div", "org-card"); card.setAttribute("aria-live", "polite");
  var body = el("div", "org-body"); body.appendChild(stage); body.appendChild(card); root.appendChild(body);
  root.appendChild(el("p", "sim-note", esc(D.nota)));
  D.niveles.forEach(function(t){
    var row = el("div", "org-tier org-t-" + t.id); row.appendChild(el("div", "org-tl", esc(t.l)));
    var wrap = el("div", "org-nodes");
    D.nodos.filter(function(n){ return n.nivel === t.id; }).forEach(function(n){
      var b = el("button", "org-n org-k-" + n.clase, '<span class="org-nn">' + esc(n.corto || n.nombre) + "</span>" + (n.sub ? '<span class="org-ns">' + esc(n.sub) + "</span>" : ""));
      b.type = "button"; b.dataset.id = n.id; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function(){ pick(sel === n.id ? null : n.id); });
      wrap.appendChild(b);
    });
    row.appendChild(wrap); tiers.appendChild(row);
  });
  legend.addEventListener("change", function(e){ var r = e.target.getAttribute("data-r"); if(r){ on[r] = e.target.checked; drawLines(); } });
  qSel.addEventListener("change", function(){
    var q = D.preguntas[+qSel.value];
    if(!q){ pick(null); return; }
    pick(q.ids[0], q);
  });
  function edgesOf(id){ return D.rel.filter(function(e){ return (e.a === id || e.b === id) && on[e.t]; }); }
  function btn(id){ return tiers.querySelector('[data-id="' + id + '"]'); }
  function pick(id, q){
    sel = id;
    var rel = id ? edgesOf(id) : [], linked = {};
    rel.forEach(function(e){ linked[e.a] = 1; linked[e.b] = 1; });
    var hl = {}; (q ? q.ids : []).forEach(function(x){ hl[x] = 1; });
    Array.prototype.forEach.call(tiers.querySelectorAll(".org-n"), function(b){
      var me = b.dataset.id === id;
      b.classList.toggle("is-sel", me); b.setAttribute("aria-pressed", me ? "true" : "false");
      b.classList.toggle("is-rel", !!(id && linked[b.dataset.id] && !me));
      b.classList.toggle("is-ans", !!hl[b.dataset.id]);
      b.classList.toggle("is-dim", !!(id && !linked[b.dataset.id] && !me && !hl[b.dataset.id]));
    });
    if(!q) qSel.value = "";
    renderCard(id, q); drawLines();
  }
  function renderCard(id, q){
    if(!id){ card.innerHTML = '<div class="org-empty"><b>Cómo leerlo.</b> Arriba, Europa; abajo, quien construye trenes y obras. Las líneas solo aparecen al elegir una entidad, y su color dice qué tipo de relación es: <b>mandar</b> (dependencia orgánica) no es lo mismo que <b>supervisar</b>, <b>ser dueño</b> o <b>tener un contrato</b>.</div>'; return; }
    var n = byId[id], rel = edgesOf(id);
    var rels = rel.map(function(e){ var other = byId[e.a === id ? e.b : e.a], t = REL.filter(function(r){ return r.id === e.t; })[0];
      return '<li><span class="org-tag org-tag-' + e.t + '">' + esc(t.l) + "</span> " + (e.a === id ? "→ " : "← ") + "<b>" + esc(other.corto || other.nombre) + "</b>: " + esc(e.d) + "</li>"; }).join("");
    card.innerHTML = (q ? '<div class="org-ansb"><b>' + esc(q.q) + "</b><p>" + esc(q.r) + "</p></div>" : "") +
      "<h5>" + esc(n.nombre) + "</h5>" +
      '<dl class="org-dl"><div><dt>Naturaleza jurídica</dt><dd>' + esc(n.naturaleza) + "</dd></div>" +
      (n.depende ? "<div><dt>Depende o está adscrita a</dt><dd>" + esc(n.depende) + "</dd></div>" : "") +
      "<div><dt>Funciones principales</dt><dd><ul>" + n.funciones.map(function(x){ return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></dd></div>" +
      (n.cargos && n.cargos.length ? "<div><dt>Órganos y cargos" + (D.fecha_cargos ? " (comprobado el " + esc(D.fecha_cargos) + ")" : "") + "</dt><dd><ul>" + n.cargos.map(function(x){ return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></dd></div>" : "") +
      (rels ? "<div><dt>Relaciones</dt><dd><ul class=\"org-rels\">" + rels + "</ul></dd></div>" : "") +
      "</dl>" + (n.web ? '<p class="org-web"><a href="' + esc(n.web) + '" target="_blank" rel="noopener">Web oficial ↗</a>' + (n.fuente ? ' · <a href="' + esc(n.fuente) + '" target="_blank" rel="noopener">Norma o fuente ↗</a>' : "") + "</p>" : "");
  }
  function drawLines(){
    clear(lines);
    if(!sel) return;
    var sb = stage.getBoundingClientRect();
    lines.setAttribute("viewBox", "0 0 " + sb.width + " " + sb.height); lines.setAttribute("width", sb.width); lines.setAttribute("height", sb.height);
    var defs = sv("defs", {}, lines);
    REL.forEach(function(r){ var mk = sv("marker", {id:"org-m-" + r.id + "-" + root.dataset.u, viewBox:"0 0 10 10", refX:9, refY:5, markerWidth:7, markerHeight:7, orient:"auto-start-reverse"}, defs); sv("path", {d:"M0,0 L10,5 L0,10 z", "class":"org-mk org-mk-" + r.id}, mk); });
    edgesOf(sel).forEach(function(e){
      var A = btn(e.a), B = btn(e.b); if(!A || !B) return;
      var ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
      var ax = ra.left + ra.width / 2 - sb.left, ay = ra.top + ra.height / 2 - sb.top, bx = rb.left + rb.width / 2 - sb.left, by = rb.top + rb.height / 2 - sb.top;
      /* recortar al borde de cada caja */
      function edge(x, y, r, tx, ty){ var dx = tx - x, dy = ty - y, sx = dx ? (r.width / 2 + 3) / Math.abs(dx) : Infinity, sy = dy ? (r.height / 2 + 3) / Math.abs(dy) : Infinity, k = Math.min(sx, sy); return [x + dx * k, y + dy * k]; }
      var p1 = edge(ax, ay, ra, bx, by), p2 = edge(bx, by, rb, ax, ay);
      var mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2 - (Math.abs(p1[1] - p2[1]) < 10 ? 26 : 0);
      sv("path", {d:"M" + p1[0].toFixed(1) + "," + p1[1].toFixed(1) + " Q" + mx.toFixed(1) + "," + my.toFixed(1) + " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1), "class":"org-e org-e-" + e.t, "marker-end":"url(#org-m-" + e.t + "-" + root.dataset.u + ")"}, lines);
    });
  }
  root.dataset.u = String(++uid);
  var rt; window.addEventListener("resize", function(){ clearTimeout(rt); rt = setTimeout(drawLines, 120); });
  pick(null);
}

var KINDS = {costes:costes, dospartes:dospartes, ramsey:ramsey, elasticidad:elasticidad, acb:acb, organigrama:organigrama};
function mount(scope){
  Array.prototype.forEach.call((scope || document).querySelectorAll(".sim"), function(n){
    if(n.dataset.ok) return;
    var k = (n.className.match(/\bsim-([a-z0-9]+)\b/) || [])[1];
    if(!KINDS[k]) return;
    n.dataset.ok = "1";
    try{ KINDS[k](n); }catch(e){ n.innerHTML = '<p class="sim-ns">El simulador no ha podido cargarse.</p>'; if(window.console) console.error(e); }
  });
}
return {mount:mount, _t:{nf:nf}};
})();
