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
    var two = f.chart.clientWidth >= 640, W = two ? Math.max(340, Math.min(480, Math.floor((f.chart.clientWidth - 24) / 2))) : cw(f, 420), H = 250, s1 = svgBox(W, H, "Coste total de los escenarios A y B separado en fijo y variable"); box.appendChild(s1);
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
    var W = cw(f, 980), H = 240, s = svgBox(W, H, "Pago total según el uso con la tarifa en dos partes y con la tarifa única");
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
  /* Segmentos inspirados en los servicios reales (AVE como Madrid–Barcelona, servicios OSP de Renfe, mercancías frente al camión);
     tráficos, costes y elasticidades son inventados: no hay cifras oficiales públicas de elasticidad por segmento. */
  var SEG0 = [{n:"AVE comercial (como Madrid–Barcelona)", s:"AVE", q:60, c:2.0, e:-0.4}, {n:"Media Distancia y Cercanías (OSP)", s:"Media Distancia", q:90, c:1.2, e:-0.9}, {n:"Mercancías (compite con el camión)", s:"Mercancías", q:30, c:1.0, e:-1.8}], R0 = 120;
  var f = frame(root, {note:"Modelo didáctico con tres segmentos y cifras inventadas: demanda de elasticidad constante, Q = Q₀·(p/c)^e, donde c es el coste marginal (canon básico) y Q₀ el tráfico si solo se cobrara c. La regla de Ramsey fija (p − c)/p = λ/|e| y busca el λ mínimo que alcanza la recaudación. En la realidad hay más restricciones: la Directiva exige no expulsar a quien cubre su coste directo y los cánones los informa la CNMC."});
  var gR = group(f.ctrl, "Objetivo"), gE = group(f.ctrl, "Elasticidad de cada segmento");
  var sR = slider({label:"Costes fijos que hay que recuperar", unit:"M€/año", min:0, max:300, step:5, value:R0, help:"además del canon básico"}, draw);
  gR.appendChild(sR.el);
  var sE = SEG0.map(function(s){ var c = slider({label:s.n, unit:"", min:-3, max:-0.1, step:0.1, value:s.e, help:"elasticidad · tráfico " + s.q + " M tren·km · coste marginal " + nf(s.c, 1) + " €"}, draw); gE.appendChild(c.el); return c; });
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
    var W = cw(f, 980), nar = W < 520, RH = nar ? 92 : 74, H = 70 + SEG0.length * RH, s = svgBox(W, H, "Recargo por tren·km de cada segmento con la regla de Ramsey y con un recargo igual para todos");
    var mx = niceMax(Math.max.apply(null, ra.seg.map(function(x){ return x.m; }).concat(un.seg.map(function(x){ return x.m; }))) * 1.1);
    var x0 = nar ? 8 : 170, x1 = W - (nar ? 150 : 70), X = function(v){ return x0 + v / mx * (x1 - x0); };
    txt(s, 8, 18, nar ? "Recargo (€/tren·km) y tráfico que queda" : "Recargo sobre el coste marginal (€ por tren·km) y tráfico que se conserva", "sv-axl");
    sv("rect", {x:8, y:28, width:10, height:10, "class":"sv-f1"}, s); txt(s, 22, 37, "Ramsey", "sv-tick");
    sv("rect", {x:88, y:28, width:10, height:10, "class":"sv-f3"}, s); txt(s, 102, 37, "recargo igual para todos", "sv-tick");
    SEG0.forEach(function(sg, i){
      var y = 56 + i * RH;
      if(nar){ txt(s, 8, y + 12, sg.s + " · elasticidad " + nf(es[i], 1), "sv-lab"); y += 22; }
      else { txt(s, 8, y + 16, sg.s, "sv-lab"); txt(s, 8, y + 34, "elasticidad " + nf(es[i], 1), "sv-tick"); }
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
    var W = cw(f, 980), H = 260, s = svgBox(W, H, "Precio frente a viajeros: punto inicial y punto nuevo");
    var qm = niceMax(Math.max(q0, q1, 10) * 1.15), pm = niceMax(Math.max(p0, p1) * 1.2);
    var ax = axes(s, {w:W, h:H, l:56, r:20, t:24, b:38, x0:0, x1:qm, y0:0, y1:pm, xt:[0, qm / 4, qm / 2, 3 * qm / 4, qm], xl:"viajeros (cantidad demandada)", yl:"precio (€)", fy:function(v){ return nf(v, pm < 10 ? 1 : 0); }});
    sv("path", {d:path([[ax.X(q0), ax.Y(p0)], [ax.X(q1), ax.Y(p1)]]), "class":"sv-l1"}, s);
    sv("line", {x1:ax.X(q0), x2:ax.X(q0), y1:ax.Y(0), y2:ax.Y(p0), "class":"sv-dash"}, s);
    sv("line", {x1:ax.X(q1), x2:ax.X(q1), y1:ax.Y(0), y2:ax.Y(p1), "class":"sv-dash"}, s);
    /* etiquetas con los datos de cada punto; si el punto está a la derecha, el texto va a su izquierda para no salirse */
    function lab(q, p, s1, dy, cls){ var right = ax.X(q) + 12 + s1.length * 7 > W - 4; txt(s, ax.X(q) + (right ? -12 : 12), ax.Y(p) + dy, s1, cls, right ? "end" : "start"); }
    sv("circle", {cx:ax.X(q0), cy:ax.Y(p0), r:7, "class":"sv-pA"}, s);
    sv("circle", {cx:ax.X(q1), cy:ax.Y(p1), r:7, "class":"sv-pB"}, s);
    var up = p0 >= p1 ? [-10, 20] : [20, -10];
    var nar = W < 520;   /* en el móvil, etiqueta corta para que no se salga del gráfico */
    lab(q0, p0, (nar ? "" : "inicial: ") + eur(p0, p0 < 10 ? 2 : 0) + " · " + nf(q0) + (nar ? "" : " viajeros"), up[0], "sv-val");
    lab(q1, p1, (nar ? "" : "nuevo: ") + eur(p1, p1 < 10 ? 2 : 0) + " · " + nf(q1) + (nar ? "" : " viajeros"), up[1], "sv-val");
    f.chart.appendChild(s);
    /* la cuenta paso a paso con los números del lector */
    var ok = !same && isFinite(Em), dd = function(v){ return v < 10 ? 2 : 0; }, sp = function(x){ return (x > 0 ? "+" : "") + pct(x); };
    var steps = [
      ["1", "Cuánto cambia el precio", "(" + eur(p1, dd(p1)) + " − " + eur(p0, dd(p0)) + ") ÷ " + eur((p0 + p1) / 2, 2) + " (la media)", same ? "0 %" : sp(dPm)],
      ["2", "Cuánto cambian los viajeros", "(" + nf(q1) + " − " + nf(q0) + ") ÷ " + nf((q0 + q1) / 2, 0) + " (la media)", isFinite(dQm) ? sp(dQm) : "—"],
      ["3", "Divide el paso 2 entre el paso 1", ok ? sp(dQm) + " ÷ " + sp(dPm) : "—", ok ? "<b>" + nf(Em, 2) + "</b>" : "no calculable"],
      ["4", "Quita el signo y compara con 1", ok ? nf(Math.abs(Em), 2) + (Math.abs(Em) > 1 ? " es mayor que 1" : Math.abs(Em) < 1 ? " es menor que 1" : " es igual a 1") : "—", ok ? "<b>" + kind(Em) + "</b>" : "—"]
    ];
    f.chart.insertAdjacentHTML("beforeend", '<p class="sim-st">La cuenta paso a paso (método del punto medio)</p><div class="tw"><table class="dxtbl sim-tbl sim-steps"><thead><tr><th>Paso</th><th>Qué haces</th><th>Cuenta</th><th>Resultado</th></tr></thead><tbody>' +
      steps.map(function(r){ return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td><td>" + r[3] + "</td></tr>"; }).join("") + "</tbody></table></div>");
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
    var W = cw(f, 980), H = 270, s = svgBox(W, H, "Flujos anuales descontados de beneficios y costes y VAN acumulado año a año");
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

/* ══ Aprovechamiento: mismo A, trenes distintos (A = Av × Ah) ══ */
function aprov(root){
  /* Presets ILUSTRATIVOS. Tramo: [nombre de la estación de salida, km, viajeros a bordo]. La última estación va en «fin». */
  var PRE = [
    {l:"Madrid→Valencia (ida)", P:300, fin:"Valencia", t:[["Madrid", 250, 150], ["Cuenca", 250, 150]],
     txt:"Ejemplo del material: 150 viajeros hacen todo el recorrido."},
    {l:"Valencia→Madrid (vuelta)", P:300, fin:"Madrid", t:[["Valencia", 250, 300], ["Cuenca", 250, 0]],
     txt:"Ejemplo del material: 300 aficionados llenan el tren hasta Cuenca y el resto va vacío."},
    {l:"Cercanías hacia la ciudad", P:900, fin:"Centro", t:[["Cabecera", 12, 160], ["Pueblo B", 9, 420], ["Pueblo C", 7, 690], ["Periferia D", 6, 880]],
     txt:"El tren se va llenando al acercarse a la metrópoli."},
    {l:"Larga distancia con descarga", P:300, fin:"Destino", t:[["Origen grande", 300, 290], ["Ciudad B", 250, 205], ["Ciudad C", 200, 130], ["Ciudad D", 180, 60]],
     txt:"Sale lleno de la estación grande y se va vaciando en las paradas."},
    {l:"Personalizado", P:300, fin:"E", t:[["A", 100, 200], ["B", 100, 250], ["C", 100, 180], ["D", 100, 120]], edit:true,
     txt:"Mueve viajeros y kilómetros de cada tramo."}
  ];
  var cur = PRE[0], sP, rows = [];
  var f = frame(root, {note:"Cifras ilustrativas. El caso Madrid-Cuenca-Valencia es el ejemplo didáctico del material (2 × 250 km): la distancia real por la línea de alta velocidad es otra. Huecos verticales = plazas por encima de la carga máxima (Vx) en todo el recorrido; huecos horizontales = plazas entre la carga de cada tramo y Vx."});
  seg(f.ctrl, "Elige un tren", PRE, function(o){ cur = o; build(); });
  var holder = el("div", "aprov-ctl"); f.ctrl.appendChild(holder);

  function build(){
    holder.innerHTML = ""; rows = [];
    holder.appendChild(el("p", "aprov-hint", esc(cur.txt)));
    var g0 = group(holder, "Oferta del tren");
    sP = slider({label:"Plazas del tren (P)", min:50, max:1200, step:10, value:cur.P, help:"igual en todo el recorrido"}, draw);
    g0.appendChild(sP.el);
    var g1 = group(holder, "Viajeros a bordo en cada tramo");
    cur.t.forEach(function(t, i){
      var nx = i + 1 < cur.t.length ? cur.t[i + 1][0] : cur.fin;
      var sv1 = slider({label:t[0] + " → " + nx, unit:"viajeros", min:0, max:1200, step:5, value:t[2]}, draw);
      g1.appendChild(sv1.el);
      var sk = null;
      if(cur.edit){ sk = slider({label:"Longitud del tramo " + t[0] + "-" + nx, unit:"km", min:5, max:400, step:5, value:t[1]}, draw); g1.appendChild(sk.el); }
      rows.push({a:t[0], b:nx, v:sv1, k:sk, km0:t[1]});
    });
    resetBtn(holder, function(){ build(); });
    draw();
  }

  function calc(){
    var P = sP.get(), L = 0, vkm = 0, Vx = 0, over = false;
    var tr = rows.map(function(r){
      var km = r.k ? r.k.get() : r.km0, v = r.v.get();
      if(v > P){ over = true; v = P; }
      L += km; vkm += v * km; Vx = Math.max(Vx, v);
      return {a:r.a, b:r.b, km:km, v:v};
    });
    var pkm = P * L, Vm = L ? vkm / L : 0;
    return {P:P, L:L, vkm:vkm, pkm:pkm, Vx:Vx, Vm:Vm, A:pkm ? vkm / pkm : 0, Av:P ? Vx / P : 0, Ah:Vx ? Vm / Vx : 0,
      gv:(P - Vx) * L, gh:Vx * L - vkm, tr:tr, over:over};
  }

  function draw(){
    var c = calc();
    kpis(f.kpis, [
      {l:"Aprovechamiento total (A)", v:pct(c.A), s:nf(c.vkm) + " v·km ÷ " + nf(c.pkm) + " p·km", cls:"sim-k-acc"},
      {l:"Vertical (Av = Vx ÷ P)", v:pct(c.Av), s:"Vx = " + nf(c.Vx) + " de " + nf(c.P) + " plazas"},
      {l:"Horizontal (Ah = Vm ÷ Vx)", v:c.Vx ? pct(c.Ah) : "—", s:"Vm = " + nf(c.Vm, 1) + " viajeros medios"},
      {l:"Comprobación", v:"A = Av × Ah", s:pct(c.Av) + " × " + (c.Vx ? pct(c.Ah) : "—") + " = " + pct(c.Av * c.Ah)}
    ]);
    clear(f.chart);
    var W = cw(f, 640), H = 290, padL = 48, padR = 74, padT = 22, padB = 58, lastLab = -1e9;
    var leg = el("div", "aprov-leg", '<span><i class="aprov-sw aprov-sw-o"></i>ocupado</span><span><i class="aprov-sw aprov-sw-h"></i>hueco horizontal</span><span><i class="aprov-sw aprov-sw-v"></i>hueco vertical</span><span><i class="aprov-sw aprov-sw-x"></i>Vx (carga máxima)</span>');
    f.chart.appendChild(leg);
    var s = svgBox(W, H, "El tren como un rectángulo: plazas en vertical y kilómetros en horizontal. Área ocupada " + pct(c.A) + ", hueco vertical " + pct(c.pkm ? c.gv / c.pkm : 0) + " y hueco horizontal " + pct(c.pkm ? c.gh / c.pkm : 0) + " de las plazas·km.");
    var ymax = c.P * 1.06, X = function(km){ return padL + km / (c.L || 1) * (W - padL - padR); }, Y = function(v){ return H - padB - v / ymax * (H - padT - padB); };
    /* rejilla y eje Y */
    var g = sv("g", {"class":"sv-ax"}, s);
    for(var i = 0; i <= 4; i++){ var v = c.P * i / 4, y = Y(v); sv("line", {x1:padL, x2:W - padR, y1:y, y2:y, "class":i ? "sv-grid" : "sv-base"}, g); txt(g, padL - 6, y + 4, nf(v), "sv-tick", "end"); }
    txt(g, padL, padT - 10, "plazas / viajeros a bordo", "sv-axl", "start");
    /* hueco vertical (P − Vx, todo el recorrido) */
    if(c.P > c.Vx) sv("rect", {x:X(0), y:Y(c.P), width:X(c.L) - X(0), height:Y(c.Vx) - Y(c.P), "class":"aprov-gv"}, s);
    /* tramos: ocupado + hueco horizontal */
    var x0 = 0;
    c.tr.forEach(function(t, k){
      var xa = X(x0), xb = X(x0 + t.km);
      if(c.Vx > t.v) sv("rect", {x:xa, y:Y(c.Vx), width:xb - xa, height:Y(t.v) - Y(c.Vx), "class":"aprov-gh"}, s);
      if(t.v > 0) sv("rect", {x:xa, y:Y(t.v), width:Math.max(0, xb - xa - 1), height:Y(0) - Y(t.v), "class":"sv-f1"}, s);
      if(xb - xa > 34) txt(s, (xa + xb) / 2, t.v > 0 && Y(0) - Y(t.v) > 22 ? Y(t.v) + 17 : Y(t.v) - 6, nf(t.v), t.v > 0 && Y(0) - Y(t.v) > 22 ? "sv-val aprov-in" : "sv-val", "middle");
      sv("line", {x1:xa, x2:xa, y1:Y(0), y2:Y(0) + 6, "class":"sv-base"}, s);
      var lw = t.a.length * 6.4;
      if(k === 0 || (xa - lw / 2 > lastLab + 8 && xa + lw / 2 < X(c.L) - cur.fin.length * 6.4 - 8)){ txt(s, xa, H - padB + 18, t.a, "sv-tick", k === 0 ? "start" : "middle"); lastLab = k === 0 ? xa + lw : xa + lw / 2; }
      if(xb - xa > 46) txt(s, (xa + xb) / 2, H - padB + 34, nf(t.km) + " km", "sv-tick", "middle");
      x0 += t.km;
    });
    txt(s, X(c.L), H - padB + 18, c.tr.length ? (cur.fin) : "", "sv-tick", "end");
    /* contorno de la oferta y líneas de referencia */
    sv("rect", {x:X(0), y:Y(c.P), width:X(c.L) - X(0), height:Y(0) - Y(c.P), "class":"aprov-cap"}, s);
    txt(s, X(c.L) + 6, Y(c.P) + 4, "P = " + nf(c.P), "sv-val", "start");
    var yVx = Y(c.Vx) + 4;
    if(c.Vx > 0 && c.Vx < c.P){ sv("line", {x1:X(0), x2:X(c.L), y1:Y(c.Vx), y2:Y(c.Vx), "class":"aprov-vx"}, s); yVx = Math.max(Y(c.Vx) + 4, Y(c.P) + 18); txt(s, X(c.L) + 6, yVx, "Vx = " + nf(c.Vx), "sv-val", "start"); }
    if(c.Vm > 0 && Math.abs(c.Vm - c.Vx) > 0.5){ sv("line", {x1:X(0), x2:X(c.L), y1:Y(c.Vm), y2:Y(c.Vm), "class":"sv-dash"}, s); txt(s, X(c.L) + 6, Math.max(Y(c.Vm) + 4, yVx + 15), "Vm = " + nf(c.Vm, 0), "sv-tick", "start"); }
    f.chart.appendChild(s);
    /* barra de reparto de las plazas·km */
    var Wb = W, Hb = 64, sb = svgBox(Wb, Hb, "Reparto de las plazas·km ofertadas: ocupadas, vacías horizontales y vacías verticales");
    var parts = [[c.vkm, "sv-f1", "ocupadas"], [c.gh, "aprov-gh", "vacías horizontales"], [c.gv, "aprov-gv", "vacías verticales"]], bx = padL;
    var bw = Wb - padL - padR;
    txt(sb, padL, 12, "¿En qué se van las " + nf(c.pkm) + " plazas·km?", "sv-axl", "start");
    parts.forEach(function(p){
      var w = c.pkm ? p[0] / c.pkm * bw : 0; if(w <= 0) return;
      sv("rect", {x:bx, y:20, width:w, height:20, "class":p[1]}, sb);
      if(w > 44) txt(sb, bx + w / 2, 55, pct(p[0] / c.pkm, 0), "sv-val", "middle");
      bx += w;
    });
    sv("rect", {x:padL, y:20, width:bw, height:20, "class":"aprov-cap"}, sb);
    f.chart.appendChild(sb);
    /* interpretación */
    var m = [], fh = c.pkm ? c.gh / c.pkm : 0, fv = c.pkm ? c.gv / c.pkm : 0;
    if(c.over) m.push("<b>Ojo:</b> en algún tramo has puesto más viajeros que plazas. Un tren no puede llevar más de lo que ofrece: se cuentan como " + nf(c.P) + " y el resto es <b>demanda rechazada</b>.");
    m.push("De cada 100 plazas·km se ocupan <b>" + nf(c.A * 100, 0) + "</b>. Se pierden " + nf(fv * 100, 0) + " por el lado <b>vertical</b> (el tren va con asientos libres incluso donde más gente lleva) y " + nf(fh * 100, 0) + " por el lado <b>horizontal</b> (unos tramos van más cargados que otros).");
    if(c.A === 0) m.push("El tren va vacío: no hay nada que aprovechar.");
    else if(fv >= fh && fv > 0.05) m.push("Tu tren pierde sobre todo por el lado <b>vertical</b>: es grande para su demanda. Lo que tocaría: un tren o una composición más pequeños (o acoplables), vender las plazas que van a salir vacías más baratas (<i>revenue management</i>) y mejorar la previsión de demanda.");
    else if(fh > 0.05) m.push("Tu tren pierde sobre todo por el lado <b>horizontal</b>: va lleno en unos tramos y flojo en otros. Lo que tocaría: reforzar solo el tramo cargado (más frecuencias parciales o más coches desde una parada), tarifas atractivas en los tramos flojos, controlar la venta por tramos o, con poca frecuencia, revisar la parada que lo provoca.");
    else m.push("Apenas pierde plazas·km: el tren está muy bien dimensionado. Cuidado: tan cerca del lleno probablemente se está <b>rechazando demanda</b> los días fuertes.");
    if(cur === PRE[0] || cur === PRE[1]) m.push("Compara la <b>ida</b> y la <b>vuelta</b>: las dos dan A = 50 %, pero la ida tiene Av = 50 % y Ah = 100 % (pocos viajeros todo el recorrido: bastaría un tren de 150 plazas) y la vuelta Av = 100 % y Ah = 50 % (tren lleno solo hasta Cuenca: haría falta un tren de 300 plazas, pero solo en ese tramo). El mismo número esconde dos problemas distintos.");
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  build(); onResize(draw);
}

/* ══ Ejemplo 2 interactivo: operador en el corredor Madrid-Zaragoza-Barcelona (demanda, oferta, costes y margen) ══ */
function corredor(root){
  var KM = {mz:310, mb:625, zb:315}, DIAS = 365;
  var D0 = {mz:1.70, mb:4.90, zb:1.85, pmz:40, pmb:70, pzb:35, f:28, dob:15, pl:360, C:409};
  var f = frame(root, {note:"Valores de partida: ejemplo 2 del material didáctico (cifras ilustrativas, no son las cuentas de ningún operador real). Billetes medios netos de IVA. Distancias fijas: Madrid-Zaragoza 310 km, Zaragoza-Barcelona 315 km, Madrid-Barcelona 625 km. Todos los trenes hacen el recorrido completo y paran en Zaragoza."});
  var g1 = group(f.ctrl, "Demanda: viajeros al año (ambos sentidos)"), g2 = group(f.ctrl, "Billete medio sin IVA"), g3 = group(f.ctrl, "Oferta y costes");
  var S = {
    mz:slider({label:"Madrid ↔ Zaragoza", unit:"M viaj.", min:0, max:8, step:0.05, value:D0.mz}, draw),
    mb:slider({label:"Madrid ↔ Barcelona", unit:"M viaj.", min:0, max:12, step:0.05, value:D0.mb}, draw),
    zb:slider({label:"Zaragoza ↔ Barcelona", unit:"M viaj.", min:0, max:8, step:0.05, value:D0.zb}, draw),
    pmz:slider({label:"Madrid-Zaragoza", unit:"€", min:5, max:150, step:1, value:D0.pmz}, draw),
    pmb:slider({label:"Madrid-Barcelona", unit:"€", min:5, max:200, step:1, value:D0.pmb}, draw),
    pzb:slider({label:"Zaragoza-Barcelona", unit:"€", min:5, max:150, step:1, value:D0.pzb}, draw),
    f:slider({label:"Servicios por sentido y día", unit:"trenes", min:1, max:60, step:1, value:D0.f}, draw),
    dob:slider({label:"Servicios en doble composición", unit:"%", min:0, max:100, step:1, value:D0.dob}, draw),
    pl:slider({label:"Plazas por composición", unit:"plazas", min:100, max:700, step:5, value:D0.pl}, draw),
    C:slider({label:"Costes anuales de operación", unit:"M€", min:50, max:1200, step:1, value:D0.C, help:"incluye cánones, energía, personal, mantenimiento y trenes"}, draw)
  };
  ["mz", "mb", "zb"].forEach(function(k){ g1.appendChild(S[k].el); });
  ["pmz", "pmb", "pzb"].forEach(function(k){ g2.appendChild(S[k].el); });
  ["f", "dob", "pl", "C"].forEach(function(k){ g3.appendChild(S[k].el); });
  resetBtn(f.ctrl, function(){ for(var k in S) S[k].set(D0[k]); draw(); });

  function draw(){
    var v = {}; for(var k in S) v[k] = S[k].get();
    /* demanda e ingresos */
    var V = v.mz + v.mb + v.zb;                                   /* M viajeros */
    var VKM = v.mz * KM.mz + v.mb * KM.mb + v.zb * KM.zb;        /* M v·km */
    var I = v.mz * v.pmz + v.mb * v.pmb + v.zb * v.pzb;          /* M€ */
    var BM = V ? I / V : NaN, RV = V ? VKM / V : NaN, PM = VKM ? I / VKM * 100 : NaN;   /* €/v, km, c€/v·km */
    /* oferta, producción y costes */
    var T = v.f * 2 * DIAS, ref = 1 + v.dob / 100, PLT = ref * v.pl;
    var TKM = T * KM.mb / 1e6, COMP = T * ref, P = COMP * v.pl / 1e6, PKM = P * KM.mb;   /* M tren·km, composiciones, M plazas, M p·km */
    var CT = v.C * 1e6 / T, CTK = v.C / TKM, CP = v.C / P, CPK = v.C / PKM * 100;        /* €/tren, €/tren·km, €/plaza, c€/p·km */
    /* relación oferta-demanda */
    var U = V / P, A = VKM / PKM, M = I - v.C, MPK = M / PKM * 100, AE = isFinite(PM) && PM > 0 ? CPK / PM : NaN;
    /* viajeros por tren y tramo (un sentido): viajeros de la OD al año ÷ 2 sentidos ÷ trenes por sentido al año */
    var TS = v.f * DIAS, q = {mz:v.mz * 1e6 / 2 / TS, mb:v.mb * 1e6 / 2 / TS, zb:v.zb * 1e6 / 2 / TS};
    var t1 = q.mz + q.mb, t2 = q.zb + q.mb, VX = Math.max(t1, t2), VM = (t1 * KM.mz + t2 * KM.zb) / KM.mb;
    var AV = VX / PLT, AH = VX ? VM / VX : NaN;
    var pos = M >= 0;
    kpis(f.kpis, [
      {l:"Aprovechamiento (A)", v:pct(A), s:"v·km ÷ p·km", cls:"sim-k-acc"},
      {l:"Vertical × horizontal", v:pct(AV) + " × " + (isFinite(AH) ? pct(AH) : "—"), s:"Av = Vx ÷ plazas · Ah = Vm ÷ Vx"},
      {l:"Percepción media", v:isFinite(PM) ? nf(PM, 2) + " c€" : "—", s:"por viajero·km (ingreso)"},
      {l:"Coste por plaza·km", v:nf(CPK, 2) + " c€", s:"por plaza·km (coste)"},
      {l:"Aprov. de equilibrio", v:isFinite(AE) ? pct(AE) : "—", s:"coste/p·km ÷ percepción", cls:isFinite(AE) && A >= AE ? "sim-k-pos" : "sim-k-neg"},
      {l:"Margen", v:meur(M, 2), s:nf(MPK, 2) + " c€ por plaza·km", cls:pos ? "sim-k-pos" : "sim-k-neg"}
    ]);

    /* figura: viajeros por tren en cada tramo, apilados por relación, frente a las plazas medias del tren */
    clear(f.chart);
    var W = cw(f, 980), H = 290, nar = W < 560;
    var s = svgBox(W, H, "Viajeros por tren en cada tramo: Madrid-Zaragoza " + nf(t1, 0) + " y Zaragoza-Barcelona " + nf(t2, 0) + ", frente a " + nf(PLT, 0) + " plazas medias por tren");
    var ym = niceMax(Math.max(PLT, VX, 10) * 1.12);
    var ax = axes(s, {w:W, h:H, l:50, r:nar ? 12 : 120, t:26, b:40, x0:0, x1:KM.mb, y0:0, y1:ym, xt:[0, KM.mz, KM.mb], xl:"kilómetro desde Madrid", yl:"viajeros por tren (un sentido)", fx:function(x){ return nar ? (x === 0 ? "Madrid" : x === KM.mz ? "Zaragoza" : "Bcn") : x === 0 ? "Madrid" : x === KM.mz ? "Zaragoza · 310" : "Barcelona · 625"; }});
    sv("rect", {x:ax.X(0), y:ax.Y(PLT), width:ax.X(KM.mb) - ax.X(0), height:ax.Y(0) - ax.Y(PLT), "class":"corredor-cap"}, s);
    function stack(x0, x1, parts){
      var y = 0;
      parts.forEach(function(p){
        if(p.v <= 0) return;
        var r = sv("rect", {x:ax.X(x0) + 1, y:ax.Y(y + p.v), width:Math.max(0, ax.X(x1) - ax.X(x0) - 2), height:ax.Y(y) - ax.Y(y + p.v), "class":p.c}, s);
        if(ax.Y(y) - ax.Y(y + p.v) > 16) txt(s, (ax.X(x0) + ax.X(x1)) / 2, (ax.Y(y) + ax.Y(y + p.v)) / 2 + 4, nf(p.v, 0) + (nar ? "" : " · " + p.l), "corredor-in", "middle");
        y += p.v;
      });
      txt(s, (ax.X(x0) + ax.X(x1)) / 2, ax.Y(y) - 6, nf(y, 0) + " a bordo", "sv-val", "middle");
    }
    stack(0, KM.mz, [{v:q.mb, l:"Mad-Bar", c:"sv-f1"}, {v:q.mz, l:"Mad-Zar", c:"sv-f2"}]);
    stack(KM.mz, KM.mb, [{v:q.mb, l:"Mad-Bar", c:"sv-f1"}, {v:q.zb, l:"Zar-Bar", c:"sv-f3"}]);
    sv("line", {x1:ax.X(0), x2:ax.X(KM.mb), y1:ax.Y(PLT), y2:ax.Y(PLT), "class":"corredor-pl"}, s);
    sv("line", {x1:ax.X(0), x2:ax.X(KM.mb), y1:ax.Y(VM), y2:ax.Y(VM), "class":"sv-l2"}, s);
    var lx = nar ? ax.X(KM.mb) - 4 : ax.X(KM.mb) + 6, la = nar ? "end" : "start";
    txt(s, lx, ax.Y(PLT) - 5, "plazas/tren " + nf(PLT, 0), "sv-tick", la);
    if(!nar) txt(s, lx, ax.Y(VM) + (Math.abs(ax.Y(VM) - ax.Y(PLT)) < 16 ? 14 : 4), "Vm " + nf(VM, 0), "sv-val", la);
    f.chart.appendChild(s);
    f.chart.appendChild(el("p", "corredor-leg", '<span class="corredor-sw corredor-sw1"></span>Madrid-Barcelona <span class="corredor-sw corredor-sw2"></span>Madrid-Zaragoza <span class="corredor-sw corredor-sw3"></span>Zaragoza-Barcelona <span class="corredor-sw corredor-sw4"></span>plazas medias por tren <span class="corredor-sw corredor-sw5"></span>viajeros medios (Vm = ' + nf(VM, 0) + ')'));

    /* la cascada de magnitudes: demanda → ingresos y oferta → costes */
    function row(a, b, c){ return "<tr><td>" + a + "</td><td>" + b + "</td><td>" + c + "</td></tr>"; }
    var dem = row("Viajeros", nf(v.mz, 2) + " + " + nf(v.mb, 2) + " + " + nf(v.zb, 2), "<b>" + nf(V, 2) + " M</b>") +
      row("Viajeros·km", nf(v.mz, 2) + "×310 + " + nf(v.mb, 2) + "×625 + " + nf(v.zb, 2) + "×315", "<b>" + nf(VKM, 2) + " M</b>") +
      row("Recorrido medio", "v·km ÷ viajeros", nf(RV, 2) + " km") +
      row("Ingresos de tráfico", nf(v.mz, 2) + "×" + nf(v.pmz) + " + " + nf(v.mb, 2) + "×" + nf(v.pmb) + " + " + nf(v.zb, 2) + "×" + nf(v.pzb), "<b>" + meur(I, 2) + "</b>") +
      row("Billete medio", "ingresos ÷ viajeros", eur(BM, 2)) +
      row("Percepción media", "ingresos ÷ v·km", nf(PM, 2) + " c€/v·km");
    var ofe = row("Trenes (expediciones)", nf(v.f) + " × 2 sentidos × 365", "<b>" + nf(T) + "</b>") +
      row("Trenes·km", nf(T) + " × 625", "<b>" + nf(TKM, 3) + " M</b>") +
      row("Plazas por tren", nf(ref, 2) + " comp. × " + nf(v.pl), nf(PLT, 0)) +
      row("Plazas ofertadas", nf(T) + " × " + nf(PLT, 0), "<b>" + nf(P, 3) + " M</b>") +
      row("Plazas·km", nf(P, 3) + " M × 625", "<b>" + nf(PKM, 0) + " M</b>") +
      row("Coste por tren · por tren·km", meur(v.C, 0) + " ÷ trenes · ÷ trenes·km", eur(CT, 0) + " · " + eur(CTK, 2)) +
      row("Coste por plaza · por plaza·km", meur(v.C, 0) + " ÷ plazas · ÷ plazas·km", eur(CP, 2) + " · " + nf(CPK, 2) + " c€");
    var mar = row("Utilización (U)", "viajeros ÷ plazas", nf(U, 3)) +
      row("Aprovechamiento (A)", nf(VKM, 0) + " ÷ " + nf(PKM, 0), "<b>" + nf(A, 3) + "</b>") +
      row("Margen", meur(I, 2) + " − " + meur(v.C, 0), "<b>" + meur(M, 2) + "</b>") +
      row("Margen por plaza·km", "A × percepción − coste/p·km = " + nf(A, 3) + " × " + nf(PM, 2) + " − " + nf(CPK, 2), "<b>" + nf(MPK, 2) + " c€</b>") +
      row("Aprovechamiento de equilibrio", nf(CPK, 2) + " ÷ " + nf(PM, 2), "<b>" + (isFinite(AE) ? nf(AE, 3) : "—") + "</b>");
    function tbl(t, body){ return '<div><p class="sim-st">' + t + '</p><div class="tw"><table class="dxtbl sim-tbl sim-steps corredor-tbl"><thead><tr><th>Magnitud</th><th>Cuenta</th><th>Resultado</th></tr></thead><tbody>' + body + "</tbody></table></div></div>"; }
    f.chart.insertAdjacentHTML("beforeend", tbl("1 · Demanda e ingresos (año)", dem) + tbl("2 · Oferta, producción y costes (año)", ofe) + tbl("3 · Oferta frente a demanda y margen", mar));

    var m = [];
    m.push("La «ocupación» U = " + nf(U, 2) + " dice que vendes casi tantos billetes como plazas ofreces, pero eso no significa trenes llenos: como cada plaza se puede vender dos veces (Madrid-Zaragoza y Zaragoza-Barcelona), el dato que cuenta es el aprovechamiento, <b>" + pct(A) + "</b>.");
    if(isFinite(AE)) m.push(A >= AE ? "El tren gana dinero porque llena más (" + pct(A) + ") de lo que necesita para cubrir costes (" + pct(AE) + "): cada plaza·km deja " + nf(MPK, 2) + " c€ de margen." : "El tren pierde dinero: para cubrir costes necesitaría un aprovechamiento del " + pct(AE) + " y solo llega al " + pct(A) + ". Sube precios, baja costes o ajusta la oferta.");
    if(VX > PLT) m.push("<b>Ojo:</b> en el tramo más cargado van más viajeros por tren (" + nf(VX, 0) + ") que plazas (" + nf(PLT, 0) + "): con esta oferta esos viajeros no caben. Aumenta servicios o la doble composición.");
    else m.push("El tramo más cargado es " + (t2 >= t1 ? "Zaragoza-Barcelona" : "Madrid-Zaragoza") + " (" + nf(VX, 0) + " viajeros por tren de " + nf(PLT, 0) + " plazas): ahí se mide el aprovechamiento vertical (" + pct(AV) + ")." + (AH > 0.95 ? " Los dos tramos van casi igual de cargados, por eso el horizontal es tan alto (" + pct(AH) + ")." : " Un tramo va bastante más vacío que el otro: el horizontal baja al " + (isFinite(AH) ? pct(AH) : "—") + "."));
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  draw(); onResize(draw);
}

/* ══ Aprovechamiento de equilibrio: ¿con qué ocupación empieza a ganar dinero el tren? ══ */
function equilibrio(root){
  /* PM = percepción media (c€/v·km), CF = costes no ligados a los viajeros (c€/plaza·km),
     cv = costes ligados a los viajeros (c€ por v·km), A = aprovechamiento real (%). Todos ILUSTRATIVOS salvo el ejemplo 2. */
  var PRE = [
    {l:"AVE típico", PM:9, CF:5.5, cv:0.6, A:75, txt:"Tren grande y rápido: muchas plazas para repartir los costes."},
    {l:"Tren pequeño (tipo Alaris)", PM:10, CF:8, cv:0.8, A:78, txt:"Pocas plazas por tren: cada plaza·km sale cara aunque el tren vaya bastante lleno."},
    {l:"Trenhotel", PM:9, CF:7.4, cv:1.2, A:80, txt:"Camas y literas: pocas plazas por coche, mucho personal y muchas horas de tren por viajero."},
    {l:"Ejemplo 2 del material", PM:11.4, CF:7.73, cv:0, A:79, txt:"Operador Madrid-Zaragoza-Barcelona del material: coste 7,73 c€/p·km y percepción 11,40 c€/v·km."}
  ];
  var cur = PRE[0];
  var f = frame(root, {note:"Valores ilustrativos salvo «Ejemplo 2 del material» (coste por plaza·km y percepción media del ejemplo resuelto). Ingresos y costes se expresan por plaza·km ofertada: así el ingreso es A × percepción media y el coste fijo es una línea horizontal. Con costes ligados a los viajeros, Ae = CF ÷ (PM − cv); si todos los costes van por plaza·km (cv = 0), Ae = coste por plaza·km ÷ percepción media."});
  seg(f.ctrl, "Elige un caso", PRE, function(o){ cur = o; set(); });
  var hint = el("p", "aprov-hint", ""); f.ctrl.appendChild(hint);
  var g1 = group(f.ctrl, "Ingreso"), g2 = group(f.ctrl, "Costes"), g3 = group(f.ctrl, "Cómo va el tren");
  var sPM = slider({label:"Percepción media", unit:"c€/v·km", min:2, max:25, step:0.1, value:cur.PM, help:"lo que ingresa por llevar a un viajero 1 km"}, draw);
  var sCF = slider({label:"Costes no ligados a los viajeros", unit:"c€/p·km", min:0.5, max:20, step:0.01, value:cur.CF, help:"tren, personal, energía, canon: existen aunque vaya vacío"}, draw);
  var scv = slider({label:"Costes ligados a los viajeros", unit:"c€/v·km", min:0, max:5, step:0.1, value:cur.cv, help:"venta, servicio a bordo, seguros del viajero"}, draw);
  var sA = slider({label:"Aprovechamiento real", unit:"%", min:0, max:100, step:1, value:cur.A}, draw);
  g1.appendChild(sPM.el); g2.appendChild(sCF.el); g2.appendChild(scv.el); g3.appendChild(sA.el);
  resetBtn(f.ctrl, function(){ set(); });
  function set(){ sPM.set(cur.PM); sCF.set(cur.CF); scv.set(cur.cv); sA.set(cur.A); draw(); }

  function draw(){
    hint.textContent = cur.txt;
    var PM = sPM.get(), CF = sCF.get(), cv = scv.get(), A = sA.get() / 100;
    var unit = PM - cv, Ae = unit > 0 ? CF / unit : Infinity;
    var ing = A * PM, cost = CF + A * cv, mg = ing - cost;
    kpis(f.kpis, [
      {l:"Aprovechamiento de equilibrio", v:isFinite(Ae) ? (Ae <= 1 ? pct(Ae) : "> 100 %") : "no existe", s:isFinite(Ae) ? nf(CF, 2) + " ÷ (" + nf(PM, 2) + " − " + nf(cv, 2) + ")" : "cada viajero cuesta más de lo que paga", cls:"sim-k-acc"},
      {l:"Aprovechamiento real", v:pct(A, 0), s:isFinite(Ae) && Ae <= 1 ? (A >= Ae ? "por encima del equilibrio" : "por debajo del equilibrio") : "nunca llega"},
      {l:"Margen por plaza·km", v:(mg >= 0 ? "+" : "") + nf(mg, 2) + " c€", s:"ingreso " + nf(ing, 2) + " − coste " + nf(cost, 2), cls:mg >= 0 ? "sim-k-pos" : "sim-k-neg"},
      {l:"Colchón", v:isFinite(Ae) && Ae <= 1 ? (A - Ae >= 0 ? "+" : "−") + nf(Math.abs(A - Ae) * 100, 1) + " puntos" : "—", s:"A real − A de equilibrio"}
    ]);
    clear(f.chart);
    var W = cw(f, 640), H = 320, vmax = Math.max(PM, CF + cv, 1) * 1.08, st = [1, 2, 2.5, 5, 10].filter(function(x){ return vmax / x <= 6; })[0] || 10, top = Math.ceil(vmax / st) * st;
    var s = svgBox(W, H, "Ingresos y costes por plaza·km según el aprovechamiento. Se cruzan en el aprovechamiento de equilibrio, " + (isFinite(Ae) && Ae <= 1 ? pct(Ae) : "que aquí no se alcanza ni con el tren lleno") + ".");
    var ax = axes(s, {w:W, h:H, l:46, r:16, t:30, b:44, x0:0, x1:1, y0:0, y1:top, ny:Math.round(top / st), xt:[0, 0.25, 0.5, 0.75, 1], fx:function(v){ return nf(v * 100) + " %"; }, fy:function(v){ return nf(v, Math.abs(v - Math.round(v)) > 1e-9 ? 1 : 0); }, yl:"c€ por plaza·km ofertada", xl:"aprovechamiento (v·km ÷ p·km)"});
    /* zonas de pérdida y de beneficio entre las dos rectas */
    var lim = Math.min(1, isFinite(Ae) ? Ae : 1);
    var Ci = function(a){ return CF + a * cv; }, Ii = function(a){ return a * PM; };
    sv("path", {d:path([[ax.X(0), ax.Y(Ci(0))], [ax.X(lim), ax.Y(Ci(lim))], [ax.X(lim), ax.Y(Ii(lim))], [ax.X(0), ax.Y(0)]]) + "Z", "class":"eq-loss"}, s);
    if(lim < 1) sv("path", {d:path([[ax.X(lim), ax.Y(Ci(lim))], [ax.X(1), ax.Y(Ci(1))], [ax.X(1), ax.Y(Ii(1))]]) + "Z", "class":"eq-gain"}, s);
    /* rectas */
    sv("line", {x1:ax.X(0), x2:ax.X(1), y1:ax.Y(CF), y2:ax.Y(CF), "class":"sv-dash"}, s);
    sv("line", {x1:ax.X(0), x2:ax.X(1), y1:ax.Y(Ci(0)), y2:ax.Y(Ci(1)), "class":"sv-l2"}, s);
    sv("line", {x1:ax.X(0), x2:ax.X(1), y1:ax.Y(0), y2:ax.Y(Ii(1)), "class":"sv-l1"}, s);
    var yc = ax.Y(Ci(1)), yi = ax.Y(Ii(1)), iUp = yi <= yc;
    txt(s, ax.X(1) - 4, iUp ? yi - 8 : yi + 18, "ingresos", "sv-val sv-c1", "end");
    txt(s, ax.X(1) - 4, iUp ? yc + 18 : yc - 8, "costes totales", "sv-val sv-c2", "end");
    txt(s, ax.X(0) + 6, ax.Y(CF) + (ax.Y(CF) > H - 70 ? -6 : 16), "costes no ligados a los viajeros", "sv-tick", "start");
    /* punto de equilibrio */
    if(isFinite(Ae) && Ae <= 1){
      sv("line", {x1:ax.X(Ae), x2:ax.X(Ae), y1:ax.Y(0), y2:ax.Y(Ii(Ae)), "class":"eq-ae"}, s);
      sv("circle", {cx:ax.X(Ae), cy:ax.Y(Ii(Ae)), r:6, "class":"sv-pA"}, s);
      txt(s, ax.X(Ae) + (Ae > 0.8 ? -6 : 6), ax.Y(0) - 8, "Ae = " + pct(Ae, 0), "sv-val", Ae > 0.8 ? "end" : "start");
    }
    /* aprovechamiento real: el margen es la distancia entre las rectas */
    sv("line", {x1:ax.X(A), x2:ax.X(A), y1:ax.Y(Ii(A)), y2:ax.Y(Ci(A)), "class":mg >= 0 ? "eq-mg-p" : "eq-mg-n"}, s);
    sv("circle", {cx:ax.X(A), cy:ax.Y(Ii(A)), r:5, "class":"sv-pB"}, s);
    var yM = Math.min(ax.Y(Ii(A)), ax.Y(Ci(A))) - 10;
    txt(s, ax.X(A) + (A > 0.5 ? -8 : 8), yM, "A real · margen " + (mg >= 0 ? "+" : "") + nf(mg, 2), "sv-val", A > 0.5 ? "end" : "start");
    f.chart.appendChild(s);
    /* lectura */
    var m = [];
    if(!isFinite(Ae)) m.push("Cada viajero cuesta (" + nf(cv, 2) + " c€/v·km) más de lo que paga (" + nf(PM, 2) + "): <b>cuanto más se llena el tren, más pierde</b>. Antes que la ocupación hay que revisar el precio o los costes por viajero.");
    else if(Ae > 1) m.push("El equilibrio estaría en un " + pct(Ae, 0) + ": <b>ni con el tren lleno todo el recorrido cubre costes</b>. Es el caso de trenes con pocas plazas o muy caros de producir: el problema no es la ocupación, es el coste por plaza·km (o el precio).");
    else {
      m.push("Con estos números, el tren cubre costes a partir de un <b>" + pct(Ae, 0) + "</b> de aprovechamiento. Es su «punto muerto»: por debajo cada plaza·km pierde dinero; por encima, gana.");
      m.push(A >= Ae ? "Va al " + pct(A, 0) + ": <b>" + nf((A - Ae) * 100, 1) + " puntos por encima</b> del equilibrio y gana " + nf(mg, 2) + " c€ por cada plaza·km que ofrece." : "Va al " + pct(A, 0) + ": le faltan <b>" + nf((Ae - A) * 100, 1) + " puntos</b> para cubrir costes y pierde " + nf(-mg, 2) + " c€ por plaza·km, aunque la ocupación parezca alta.");
    }
    if(cur === PRE[1] || cur === PRE[2]) m.push("Por eso un tren pequeño o un Trenhotel pueden ir «bastante llenos» y perder dinero: su aprovechamiento de equilibrio está muy arriba. El aprovechamiento solo dice algo comparado con su propio equilibrio.");
    if(cur === PRE[3]) m.push("En el ejemplo del material: 7,73 ÷ 11,40 = 0,68. Con un aprovechamiento real de 0,79, con el aprovechamiento sin redondear (4.172 ÷ 5.289 = 0,789), el margen es 0,789 × 11,40 − 7,73 ≈ <b>1,26 c€ por plaza·km</b>, la cifra del material. Con A redondeado a 0,79 saldría 1,28.");
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  draw(); onResize(draw);
}

/* ══ Estacionalidad: reparte la demanda del año por meses y días tipo (tablas 5 y 6, García Álvarez et al., 1998) ══ */
function estacional(root){
  var MES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  var MESL = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  var DIAS = [31,28,31,30,31,30,31,31,30,31,30,31];
  var DS = ["L","M","X","J","V","S","D"], DSL = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"];
  /* Coeficientes mensuales (tanto por uno sobre la media mensual del año) y semanales (sobre la media diaria de la semana) */
  var CM = {t:[1.01,1.11,1.19,0.97,1.14,1.19,0.81,0.41,0.96,1.29,1.15,0.77],
            v:[0.64,0.20,0.43,1.59,0.67,0.86,1.95,2.55,1.29,1.20,0.23,0.39],
            f:[1.13,0.78,0.84,1.14,0.97,0.89,1.12,1.09,0.99,0.95,0.70,1.40]};
  var CW = {t:[1.31,1.20,1.31,1.27,1.30,0.41,0.19], v:[0.93,0.84,0.93,1.03,1.12,1.12,1.03], f:[1.03,0.71,0.77,1.03,1.28,1.03,1.16]};
  /* INE, Estadística de Transporte de Viajeros, tabla 49359: viajeros de 2025 (miles) → coeficiente = mes ÷ media mensual */
  var INE = {
    av:{l:"INE 2025 · alta velocidad", v:[3121,3190,3717,3729,3885,4051,4131,3661,3754,3719,3405,3422]},
    ce:{l:"INE 2025 · Cercanías", v:[48539,50431,53369,48848,53895,52922,44934,36675,49594,56677,51699,47661]}
  };
  Object.keys(INE).forEach(function(k){ var s = INE[k].v.reduce(function(a, b){ return a + b; }, 0) / 12; INE[k].c = INE[k].v.map(function(x){ return x / s; }); });
  var PRE = [{l:"Negocios", t:70, v:15, h:"tipo Madrid-Barcelona"}, {l:"Ocio", t:15, v:65, h:"tipo Madrid-Alicante"}, {l:"Mixta", t:40, v:35, h:"mezcla equilibrada"}];
  var real = "", mesSel = 7;

  var f = frame(root, {note:"Coeficientes mensuales y por día de la semana calculados por García Álvarez et al. (1998) sobre series españolas de 1995 y 1996, ya sin tendencia: sirven de orientación, no son datos de una línea concreta. La tabla de días de la semana se ha reconstruido a partir del texto (cada fila suma 7). Los viajeros, la mezcla y las plazas son ilustrativos. Las curvas «INE 2025» son datos reales: Estadística de Transporte de Viajeros del INE, tabla 49359, viajeros de todo 2025 en España (consultada el 24-11-2026). Simplificación: cada día de la semana aparece días/7 veces en el mes."});
  var g1 = group(f.ctrl, "La relación"), g2 = group(f.ctrl, "Por qué viaja la gente"), g3 = group(f.ctrl, "Comparar con datos reales");
  var sY = slider({label:"Viajeros al año", unit:"miles", min:100, max:6000, step:50, value:1200, help:"demanda anual en la relación (dos sentidos)"}, draw);
  var sC = slider({label:"Plazas ofertadas al día", unit:"plazas", min:500, max:20000, step:100, value:3800, help:"capacidad diaria, igual todo el año"}, draw);
  g1.appendChild(sY.el); g1.appendChild(sC.el);
  seg(g2, "Mezcla de motivos de ejemplo", PRE.map(function(p){ return {l:p.l, p:p}; }), function(o){ sT.set(o.p.t); sV.set(o.p.v); draw(); });
  var sT = slider({label:"Trabajo o negocio", unit:"%", min:0, max:100, step:5, value:PRE[0].t}, function(){ fix("t"); });
  var sV = slider({label:"Vacaciones u ocio", unit:"%", min:0, max:100, step:5, value:PRE[0].v}, function(){ fix("v"); });
  g2.appendChild(sT.el); g2.appendChild(sV.el);
  var fam = el("p", "estacional-rest"); g2.appendChild(fam);
  seg(g3, "Curva real para comparar", [{l:"Ninguna", k:""}, {l:"AV 2025", k:"av"}, {l:"Cercanías 2025", k:"ce"}], function(o){ real = o.k; draw(); });
  resetBtn(f.ctrl, function(){ sY.set(1200); sC.set(3800); sT.set(PRE[0].t); sV.set(PRE[0].v); draw(); });
  function fix(who){
    var t = sT.get(), v = sV.get();
    if(t + v > 100){ if(who === "t") sV.set(100 - t); else sT.set(100 - v); }
    draw();
  }

  /* bloque de días: título + botones de mes + gráfico (fuera del gráfico principal para que el botón no se redibuje) */
  var c1 = el("div"), c2 = el("div"), c3 = el("div");
  f.chart.appendChild(c1); f.chart.appendChild(c2); f.chart.appendChild(c3);
  var head3 = el("div", "estacional-dh"), mb = el("div", "sim-seg estacional-ms"), c3c = el("div");
  mb.setAttribute("role", "group"); mb.setAttribute("aria-label", "Mes que ves por días de la semana");
  MES.forEach(function(m, i){
    var b = el("button", i === mesSel ? "on" : "", m); b.type = "button"; b.setAttribute("aria-pressed", i === mesSel ? "true" : "false"); b.setAttribute("aria-label", MESL[i]);
    b.addEventListener("click", function(){ mesSel = i; Array.prototype.forEach.call(mb.children, function(x, j){ x.classList.toggle("on", j === i); x.setAttribute("aria-pressed", j === i ? "true" : "false"); }); draw(); });
    mb.appendChild(b);
  });
  c3.appendChild(head3); c3.appendChild(mb); c3.appendChild(c3c);

  function calc(){
    var Y = sY.get() * 1000, cap = sC.get(), w = {t:sT.get() / 100, v:sV.get() / 100};
    w.f = Math.max(0, 1 - w.t - w.v);
    var mixC = [], month = [], days = [], over = 0, empty = 0, rej = 0, offered = 0;
    for(var m = 0; m < 12; m++){
      var per = {}, tot = 0;
      ["t","v","f"].forEach(function(k){ per[k] = Y * w[k] / 12 * CM[k][m]; tot += per[k]; });
      mixC.push(tot / (Y / 12)); month.push(tot);
      var dd = [];
      for(var d = 0; d < 7; d++){
        var v = 0; ["t","v","f"].forEach(function(k){ v += per[k] / DIAS[m] * CW[k][d]; });
        dd.push(v);
        var n = DIAS[m] / 7;
        if(v > cap){ over++; rej += (v - cap) * n; } else empty += (cap - v) * n;
        offered += cap * n;
      }
      days.push(dd);
    }
    return {Y:Y, cap:cap, w:w, mixC:mixC, month:month, days:days, over:over, empty:empty, rej:rej, offered:offered};
  }

  function legend(svg, x, y, items){
    var g = sv("g", {}, svg), cx = x;
    items.forEach(function(it){
      sv("line", {x1:cx, x2:cx + 18, y1:y, y2:y, "class":it.c}, g);
      var t = txt(g, cx + 23, y + 4, it.l, "sv-tick"); cx += 30 + it.l.length * 6.4;
    });
  }

  function draw(){
    var R = calc(), W = cw(f, 660), small = W < 480;
    fam.innerHTML = "Familiares, gestiones y otros: <b>" + nf(R.w.f * 100) + " %</b> (el resto hasta 100)";
    var pk = 0, vl = 0;
    R.mixC.forEach(function(c, i){ if(c > R.mixC[pk]) pk = i; if(c < R.mixC[vl]) vl = i; });
    kpis(f.kpis, [
      {l:"Mes punta", v:MESL[pk], s:"coeficiente " + nf(R.mixC[pk], 2), cls:"sim-k-acc"},
      {l:"Mes valle", v:MESL[vl], s:"coeficiente " + nf(R.mixC[vl], 2)},
      {l:"Punta ÷ valle", v:nf(R.mixC[pk] / R.mixC[vl], 2) + " veces", s:"viajeros del mes punta frente al valle"},
      {l:"Días tipo sin sitio", v:R.over + " de 84", s:"demanda por encima de las plazas", cls:R.over ? "sim-k-neg" : "sim-k-pos"},
      {l:"Plazas vacías en el año", v:pct(R.empty / R.offered, 0), s:nf(R.empty / 1000, 0) + " mil plazas sin vender"},
      {l:"Viajeros rechazados", v:nf(R.rej / 1000, 1) + " mil", s:pct(R.rej / R.Y, 1) + " de la demanda", cls:R.rej ? "sim-k-neg" : ""}
    ]);

    /* 1 · coeficientes mensuales */
    clear(c1);
    c1.appendChild(el("p", "sim-st", "1 · Cómo se reparte el año según el motivo (1 = mes medio)"));
    var H = 270, s1 = svgBox(W, H, "Coeficientes mensuales por motivo de viaje: trabajo con valle en agosto, vacaciones con punta en agosto y familiares casi plano; y la curva de tu mezcla" + (real ? " frente a " + INE[real].l : ""));
    var A = axes(s1, {w:W, h:H, l:38, r:12, t:46, b:26, x0:-0.5, x1:11.5, y0:0, y1:2.8, ny:4, fy:function(v){ return nf(v, 1); }, xt:[0,1,2,3,4,5,6,7,8,9,10,11], fx:function(v){ return small ? MES[v].charAt(0) : MES[v]; }});
    sv("line", {x1:A.X(-0.5), x2:A.X(11.5), y1:A.Y(1), y2:A.Y(1), "class":"sv-dash"}, s1);
    function line(arr, cls){ sv("path", {d:path(arr.map(function(c, i){ return [A.X(i), A.Y(c)]; })), "class":cls}, s1); }
    line(CM.t, "estacional-lt"); line(CM.v, "estacional-lv"); line(CM.f, "estacional-lf");
    if(real) line(INE[real].c, "estacional-lr");
    line(R.mixC, "estacional-lm");
    R.mixC.forEach(function(c, i){ sv("circle", {cx:A.X(i), cy:A.Y(c), r:3.2, "class":"estacional-dm"}, s1); });
    var it = [{c:"estacional-lt", l:"Trabajo"}, {c:"estacional-lv", l:"Vacaciones"}, {c:"estacional-lf", l:"Familiares"}, {c:"estacional-lm", l:"Tu mezcla"}];
    if(real) it.push({c:"estacional-lr", l:small ? "INE" : INE[real].l});
    if(small){ legend(s1, 38, 12, it.slice(0, 3)); legend(s1, 38, 30, it.slice(3)); } else legend(s1, 38, 16, it);
    c1.appendChild(s1);

    /* 2 · viajeros por mes frente a la capacidad del mes */
    clear(c2);
    c2.appendChild(el("p", "sim-st", "2 · Viajeros que querrían viajar cada mes frente a las plazas del mes"));
    var H2 = 250, mx = 0;
    R.month.forEach(function(v, i){ mx = Math.max(mx, v, R.cap * DIAS[i]); });
    var yM = niceMax(mx / 1000);
    var s2 = svgBox(W, H2, "Barras de viajeros por mes y escalón de plazas ofertadas en cada mes; en rojo, la parte de la demanda que no cabe");
    var B = axes(s2, {w:W, h:H2, l:44, r:12, t:small ? 42 : 22, b:26, x0:-0.5, x1:11.5, y0:0, y1:yM, ny:4, fy:function(v){ return nf(v); }, yl:"miles de viajeros", xt:[0,1,2,3,4,5,6,7,8,9,10,11], fx:function(v){ return small ? MES[v].charAt(0) : MES[v]; }});
    var bw = (B.X(1) - B.X(0)) * 0.62;
    R.month.forEach(function(v, i){
      var capM = R.cap * DIAS[i] / 1000, d = v / 1000, x = B.X(i) - bw / 2, ok = Math.min(d, capM);
      sv("rect", {x:x, y:B.Y(ok), width:bw, height:Math.max(0, B.Y(0) - B.Y(ok)), "class":"estacional-bok"}, s2);
      if(d > capM) sv("rect", {x:x, y:B.Y(d), width:bw, height:B.Y(capM) - B.Y(d), "class":"estacional-bko"}, s2);
      sv("line", {x1:x - 3, x2:x + bw + 3, y1:B.Y(capM), y2:B.Y(capM), "class":"estacional-cap"}, s2);
    });
    var lg = sv("g", {}, s2), lx = small ? 44 : W - 330;
    sv("rect", {x:lx, y:4, width:10, height:10, "class":"estacional-bok"}, lg); txt(lg, lx + 14, 13, "transportados", "sv-tick");
    sv("rect", {x:lx + 102, y:4, width:10, height:10, "class":"estacional-bko"}, lg); txt(lg, lx + 116, 13, "no caben", "sv-tick");
    sv("line", {x1:lx + 178, x2:lx + 196, y1:9, y2:9, "class":"estacional-cap"}, lg); txt(lg, lx + 201, 13, small ? "plazas" : "plazas del mes", "sv-tick");
    c2.appendChild(s2);

    /* 3 · días tipo del mes elegido */
    head3.innerHTML = '<p class="sim-st">3 · Los 7 días tipo de ' + MESL[mesSel] + ' (elige otro mes)</p>';
    clear(c3c);
    var dd = R.days[mesSel], mx3 = Math.max.apply(null, dd.concat([R.cap])), yM3 = niceMax(mx3);
    var H3 = 230, s3 = svgBox(W, H3, "Viajeros que querrían viajar cada día de la semana en " + MESL[mesSel] + " frente a las plazas diarias");
    var C = axes(s3, {w:W, h:H3, l:50, r:12, t:22, b:26, x0:-0.5, x1:6.5, y0:0, y1:yM3, ny:4, fy:function(v){ return nf(v); }, yl:"viajeros al día", xt:[0,1,2,3,4,5,6], fx:function(v){ return small ? DS[v] : DSL[v]; }});
    var bw3 = (C.X(1) - C.X(0)) * 0.56;
    dd.forEach(function(v, i){
      var x = C.X(i) - bw3 / 2;
      sv("rect", {x:x, y:C.Y(v), width:bw3, height:C.Y(0) - C.Y(v), "class":v > R.cap ? "estacional-bko" : "estacional-bok"}, s3);
      txt(s3, C.X(i), C.Y(v) - 5, nf(v), "sv-val", "middle");
    });
    sv("line", {x1:C.X(-0.5), x2:C.X(6.5), y1:C.Y(R.cap), y2:C.Y(R.cap), "class":"estacional-cap"}, s3);
    txt(s3, C.X(6.5) - 2, C.Y(R.cap) - 6, nf(R.cap) + " plazas", "sv-tick", "end");
    c3c.appendChild(s3);

    /* lectura */
    var m = [], dom = R.w.t >= R.w.v && R.w.t >= R.w.f ? "t" : R.w.v >= R.w.f ? "v" : "f";
    var sd = Math.sqrt(R.mixC.reduce(function(a, c){ return a + (c - 1) * (c - 1); }, 0) / 11);
    m.push("Con esta mezcla domina el motivo <b>" + {t:"trabajo", v:"vacaciones", f:"familiar"}[dom] + "</b>: el mes punta es <b>" + MESL[pk] + "</b> (" + nf(R.mixC[pk], 2) + " veces el mes medio) y el valle, <b>" + MESL[vl] + "</b> (" + nf(R.mixC[vl], 2) + "). Agosto queda en " + nf(R.mixC[7], 2) + (R.mixC[7] > 1.15 ? ": es mes punta porque pesan las vacaciones." : R.mixC[7] < 0.9 ? ": baja porque en agosto no se viaja por trabajo, y las vacaciones no lo compensan." : ": las vacaciones compensan casi del todo la caída del trabajo.") + " La desviación típica de los coeficientes es " + nf(sd, 2) + " (trabajo 0,24; vacaciones 0,74; familiares 0,19).");
    if(R.over) m.push("Con " + nf(R.cap) + " plazas al día, en <b>" + R.over + " de los 84 días tipo</b> no cabe todo el mundo y se quedan fuera unos " + nf(R.rej / 1000, 1) + " mil viajeros al año. Ojo: esos viajeros no aparecerían en las estadísticas de tráfico del año siguiente; la demanda real es mayor que la transportada.");
    else m.push("Con " + nf(R.cap) + " plazas al día cabe toda la demanda, pero el " + pct(R.empty / R.offered, 0) + " de las plazas del año va vacío: es el coste de dimensionar para la punta.");
    if(real){
      var r = INE[real].c, rpk = r.indexOf(Math.max.apply(null, r)), rvl = r.indexOf(Math.min.apply(null, r));
      m.push("La curva real (" + INE[real].l + ") va de " + nf(r[rvl], 2) + " en " + MESL[rvl] + " a " + nf(r[rpk], 2) + " en " + MESL[rpk] + ": mucho más plana que cualquier motivo puro, porque suma todas las rutas y todos los motivos de España y unos compensan a otros.");
    }
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  draw(); onResize(draw);
}

/* ══ Análisis de la frecuencia: ¿cuántas salidas son útiles para el viajero? (tema 11.E) ══
   Regla del material: una salida es frecuencia útil si dista del tren útil anterior más de un umbral
   (por defecto, el 25 % del periodo medio), y no lo es si un tren que sale después llega antes (adelantado).
   Segundo gráfico: coeficiente de atractivo por frecuencia de Hernanz Ayuso (1990), c(f) = e^(1,51527·(1 − e^(−0,12·f))). */
function frecuencia(root){
  function hm(m){ var h = Math.floor(m / 60), mm = Math.round(m - h * 60); if(mm === 60){ h++; mm = 0; } return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm; }
  function dur(m){ m = Math.round(m); var h = Math.floor(m / 60), r = m % 60; return h ? h + " h" + (r ? " " + r + " min" : "") : r + " min"; }
  function T(s){ var p = s.split(":"); return +p[0] * 60 + +p[1]; }
  function mk(list, d){ return list.map(function(x){ var p = x.split("/"); return {d:T(p[0]), a:p[1] ? T(p[0]) + +p[1] : (d ? T(p[0]) + d : null), o:p[2] || ""}; }); }
  /* Salidas reales Madrid-Puerta de Atocha → Barcelona-Sants del miércoles 25-11-2026 (R = Renfe, I = iryo, O = OUIGO).
     Fuente: capas/rutas.json del visor ferroviario (generado el 23-11-2026 con los GTFS de Renfe, el GTFS comunitario de iryo y el PDF de OUIGO). */
  var REAL = "06:09/I 06:16/R 06:27/R 06:40/O 06:57/R 07:22/I 07:27/R 07:27/R 07:57/R 08:22/I 08:27/R 08:49/O 08:50/I 08:57/R 09:12/I 09:27/R 09:27/R 10:27/R 10:32/O 11:22/I 11:27/R 12:22/I 12:27/R 12:50/R 12:50/R 13:57/R 14:27/R 14:27/R 14:57/R 15:20/O 15:27/R 15:52/I 15:57/R 16:27/R 16:27/R 16:32/O 16:37/I 16:57/R 17:22/I 17:27/R 17:57/R 17:57/R 18:27/R 18:32/I 18:57/R 19:23/O 19:34/R 20:30/R"
    .split(" ").map(function(x){ var p = x.split("/"); return {d:T(p[0]), a:null, o:{R:"Renfe", I:"iryo", O:"OUIGO"}[p[1]]}; });
  var PRE = [
    {l:"Cadenciado", k:"cad", t:mk(["06:30","07:30","08:30","09:30","10:30","11:30","12:30","13:30","14:30","15:30","16:30","17:30","18:30","19:30","20:30"], 170),
     txt:"15 trenes, uno cada hora a la misma hora y minuto: el horario que el viajero se aprende de memoria."},
    {l:"Apelotonado", k:"pel", t:mk(["07:00","07:05","07:15","08:00","08:10","09:00","13:00","13:05","14:00","17:00","17:05","17:15","18:00","18:10","19:00"], 170),
     txt:"Los mismos 15 trenes, pero amontonados en tres franjas: hay salidas casi a la vez y huecos de cuatro horas."},
    {l:"Con adelantamientos", k:"ade", t:mk(["06:20/190","06:30/150","07:30/150","08:00/190","08:30/150","09:30/150","10:30/150","11:00/190","12:30/150","13:30/150","14:15/190","15:30/150","16:25/190","16:30/150","17:30/150","18:05/190","18:30/150","19:30/150","19:35/190","20:30/150"]),
     txt:"20 trenes: 13 directos (2 h 30 min) y 7 con paradas (3 h 10 min). Algunos de los que paran salen antes que un directo y llegan después: el viajero espera al directo."},
    {l:"Real: Madrid → Barcelona", k:"real", t:REAL,
     txt:"Todas las salidas de Madrid-Puerta de Atocha hacia Barcelona-Sants del miércoles 25-11-2026 (Renfe, iryo y OUIGO). Solo se conocen las salidas: los adelantamientos no se pueden ver."}
  ];
  var cur = PRE[0];
  var f = frame(root, {note:"Los tres primeros horarios son ilustrativos. El real sale del visor ferroviario de este portfolio (capas/rutas.json, generado el 23-11-2026): GTFS oficial de Renfe (CC BY 4.0), PDF oficial «Horarios OUIGO 2026-2027» y GTFS comunitario de iryo (no oficial). Regla de la frecuencia útil y coeficiente de Hernanz Ayuso (1990): material del tema."});
  var gH = group(f.ctrl, "Horario"); seg(gH, "Horario", PRE, function(o){ cur = o; draw(); });
  var desc = el("p", "frecuencia-desc"); gH.appendChild(desc);
  var gR = group(f.ctrl, "Criterio de frecuencia útil");
  var sU = slider({label:"Umbral de diferenciación", unit:"% del periodo", min:0, max:60, step:5, value:25, help:"una salida más cercana a la anterior no aporta un horario nuevo"}, draw);
  gR.appendChild(sU.el);
  var chk = el("label", "sim-chk", '<input type="checkbox" checked> Los trenes adelantados (salen antes y llegan después que otro) no cuentan como útiles');
  gR.appendChild(chk); var cb = chk.querySelector("input"); cb.addEventListener("change", draw);
  resetBtn(f.ctrl, function(){ sU.set(25); cb.checked = true; draw(); });
  var hold1 = el("div"), list = el("div", "frecuencia-list"), hold2 = el("div");
  f.chart.appendChild(hold1); f.chart.appendChild(list); f.chart.appendChild(hold2);

  function hz(x){ return Math.exp(1.51527 * (1 - Math.exp(-0.12 * x))); }
  function analyse(){
    var t = cur.t.map(function(x, i){ return {d:x.d, a:x.a, o:x.o, i:i}; }).sort(function(a, b){ return a.d - b.d || a.i - b.i; });
    var n = t.length, span = n > 1 ? t[n - 1].d - t[0].d : 0, per = n > 1 ? span / (n - 1) : 0, thr = per * sU.get() / 100;
    t.forEach(function(x){
      x.st = "ok"; x.why = "";
      if(cb.checked && x.a != null) t.forEach(function(y){ if(y !== x && y.a != null && y.d > x.d && y.a <= x.a && !x.by){ x.by = y; } });
      if(cb.checked && x.by){ x.st = "ad"; x.why = "le adelanta el de las " + hm(x.by.d) + ", que llega a las " + hm(x.by.a) + " (este llega a las " + hm(x.a) + ")"; }
    });
    var last = null;
    t.forEach(function(x){
      if(x.st !== "ok") return;
      if(last && x.d - last.d <= thr){ x.st = "no"; x.why = (x.d === last.d ? "sale a la misma hora que el de las " : "sale solo " + Math.round(x.d - last.d) + " min después del de las ") + hm(last.d) + " (umbral: " + nf(thr, 0) + " min)"; }
      else last = x;
    });
    var useful = t.filter(function(x){ return x.st === "ok"; });
    var gaps = []; for(var i = 1; i < useful.length; i++) gaps.push(useful[i].d - useful[i - 1].d);
    var sg = gaps.reduce(function(s, g){ return s + g; }, 0), sg2 = gaps.reduce(function(s, g){ return s + g * g; }, 0);
    var wait = sg ? sg2 / (2 * sg) : NaN, waitReg = sg && gaps.length ? sg / gaps.length / 2 : NaN;
    return {t:t, n:n, per:per, thr:thr, u:useful.length, wait:wait, waitReg:waitReg};
  }
  function cls(n){ return n <= 3 ? "baja" : n <= 6 ? "media" : n < 14 ? "alta" : "muy alta"; }

  function draw(){
    desc.textContent = cur.txt;
    var A = analyse(), prod = A.n ? A.u / A.n : 0;
    kpis(f.kpis, [
      {l:"Frecuencia absoluta", v:nf(A.n) + " salidas", s:"lo que anuncia el operador"},
      {l:"Frecuencia útil", v:nf(A.u) + " salidas", s:"horarios distintos para el viajero", cls:"sim-k-acc"},
      {l:"Productividad", v:pct(prod, 0), s:"útil ÷ absoluta", cls:prod >= 0.85 ? "sim-k-pos" : prod < 0.7 ? "sim-k-neg" : ""},
      {l:"Periodo medio", v:A.n > 1 ? dur(A.per) : "—", s:"(última − primera) ÷ (salidas − 1)"},
      {l:"Umbral", v:A.n > 1 ? nf(A.thr, 0) + " min" : "—", s:sU.get() + " % del periodo medio"},
      {l:"Espera media", v:isFinite(A.wait) ? dur(A.wait) : "—", s:isFinite(A.waitReg) ? "con salidas regulares: " + dur(A.waitReg) : "si llegas a la estación al azar"}
    ]);
    drawTimeline(A); drawList(A); drawHz(A);
    var m = [];
    m.push("De " + nf(A.n) + " salidas, <b>" + nf(A.u) + " son frecuencia útil</b> (productividad del " + pct(prod, 0) + "). " +
      (A.n - A.u ? "Las otras " + nf(A.n - A.u) + " cuestan lo mismo de producir (tren, maquinista, canon) pero no dan al viajero un horario nuevo." : "Todas aportan un horario distinto: nada de lo que se produce se pierde."));
    if(isFinite(A.wait) && isFinite(A.waitReg) && A.wait - A.waitReg > 4) m.push("La espera media (" + dur(A.wait) + ") es mayor que la que habría con el mismo número de trenes repartidos por igual (" + dur(A.waitReg) + "): <b>los huecos grandes pesan más que los pequeños</b>, porque es más probable llegar a la estación durante un hueco grande.");
    if(cur.k === "real") m.push("En el horario real coinciden varias salidas al mismo minuto y otras de distintas empresas salen con muy poca diferencia. Para quien compara las tres empresas, son una sola oportunidad de viaje; para quien solo viaja con una de ellas (por precio o por tarjeta de fidelización), su frecuencia útil es la de esa empresa.");
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }

  function drawTimeline(A){
    clear(hold1);
    var W = cw(f, 760), arr = A.t.some(function(x){ return x.a != null; });
    var L = 64, R = 14, t0 = 6 * 60, t1 = 24 * 60;
    var X = function(m){ return L + (m - t0) / (t1 - t0) * (W - L - R); };
    /* altura de cada punto: los trenes muy juntos se apilan hacia arriba para que se vean todos */
    var lev = [], lv = {};
    A.t.forEach(function(x){ var px = X(x.d), k = 0; while(lev[k] != null && px - lev[k] < 10) k++; lev[k] = px; lv[x.i] = k; });
    var yD = 40 + (lev.length - 1) * 11, yA = yD + 108, H = arr ? yA + 46 : yD + 50;
    var s = svgBox(W, H, "Línea de tiempo del horario «" + cur.l + "»: " + A.n + " salidas, " + A.u + " útiles" + (arr ? ", con la hora de llegada de cada tren" : ""));
    var g = sv("g", {"class":"sv-ax"}, s), step = W < 520 ? 180 : 120;
    for(var m = t0; m <= t1; m += 60){
      sv("line", {x1:X(m), x2:X(m), y1:24, y2:arr ? yA + 10 : yD + 12, "class":(m - t0) % step ? "sv-grid frecuencia-hgrid" : "sv-grid"}, g);
      if(!((m - t0) % step)) txt(g, X(m), H - 6, hm(m).replace(/^0/, ""), "sv-tick", "middle");
    }
    txt(s, L - 8, yD + 4, "Sale", "sv-axl", "end");
    if(arr) txt(s, L - 8, yA + 4, "Llega", "sv-axl", "end");
    sv("line", {x1:L, x2:W - R, y1:yD, y2:yD, "class":"sv-base"}, s);
    if(arr) sv("line", {x1:L, x2:W - R, y1:yA, y2:yA, "class":"sv-base"}, s);
    /* trenes de la misma hora: se apilan hacia arriba para que se vean todos */
    A.t.forEach(function(x){
      var y = yD - lv[x.i] * 11;
      if(arr && x.a != null) sv("line", {x1:X(x.d), y1:yD, x2:X(x.a), y2:yA, "class":"frecuencia-run frecuencia-" + x.st}, s);
      var c = sv("circle", {cx:X(x.d), cy:y, r:5.5, "class":"frecuencia-pt frecuencia-" + x.st}, s);
      var tt = sv("title", {}, c); tt.textContent = hm(x.d) + (x.o ? " · " + x.o : "") + (x.a != null ? " → llega " + hm(x.a) : "") + (x.why ? " · no es útil: " + x.why : " · frecuencia útil");
      if(arr && x.a != null) sv("circle", {cx:X(x.a), cy:yA, r:3.5, "class":"frecuencia-pt frecuencia-" + x.st}, s);
    });
    var lg = sv("g", {}, s), lx = L, items = W < 520 ? [["ok", "útil"], ["no", "muy cerca de otra"], ["ad", "adelantado"]] : [["ok", "útil"], ["no", "demasiado cerca de otra"], ["ad", "adelantado por otro tren"]];
    items.forEach(function(it){ sv("circle", {cx:lx + 6, cy:10, r:5, "class":"frecuencia-pt frecuencia-" + it[0]}, lg); txt(lg, lx + 15, 14, it[1], "sv-tick"); lx += 22 + it[1].length * 6.4; });
    hold1.appendChild(s);
  }

  function drawList(A){
    var bad = A.t.filter(function(x){ return x.st !== "ok"; });
    list.innerHTML = bad.length ? '<details class="frecuencia-det"><summary>Por qué no cuentan ' + nf(bad.length) + (bad.length === 1 ? " salida" : " salidas") + '</summary><ul>' +
      bad.map(function(x){ return "<li><b>" + hm(x.d) + "</b>" + (x.o ? " (" + esc(x.o) + ")" : "") + ": " + esc(x.why) + ".</li>"; }).join("") + "</ul></details>" :
      '<p class="frecuencia-ok-msg">Todas las salidas son frecuencia útil con este criterio.</p>';
  }

  function drawHz(A){
    clear(hold2);
    hold2.appendChild(el("p", "sim-st", "Cuánto atrae la frecuencia: coeficiente de Hernanz Ayuso (1990)"));
    var W = cw(f, 760), H = 250, fm = 40;
    var s = svgBox(W, H, "Curva del coeficiente de atractivo por frecuencia: crece deprisa con los primeros trenes y casi nada a partir de unos 25 al día");
    var ax = axes(s, {w:W, h:H, l:48, r:16, t:26, b:40, x0:0, x1:fm, y0:0, y1:5, ny:5, xt:[0, 5, 10, 15, 20, 25, 30, 35, 40], xl:"trenes al día por sentido (f)", yl:"coeficiente c(f)", fy:function(v){ return nf(v, 0); }});
    [[0, 3.5, "baja"], [3.5, 6.5, "media"], [6.5, 13.5, "alta"], [13.5, fm, "muy alta"]].forEach(function(z, i){
      sv("rect", {x:ax.X(z[0]), y:ax.Y(5), width:ax.X(z[1]) - ax.X(z[0]), height:ax.Y(0) - ax.Y(5), "class":"frecuencia-z" + (i % 2)}, s);
      if(W >= 520 || i !== 1) txt(s, (ax.X(z[0]) + ax.X(z[1])) / 2, ax.Y(0) - 8, z[2], "sv-tick", "middle");
    });
    var pts = []; for(var x = 0; x <= fm; x += 0.25) pts.push([ax.X(x), ax.Y(hz(x))]);
    sv("path", {d:path(pts), "class":"sv-l1"}, s);
    sv("line", {x1:ax.X(0), x2:ax.X(fm), y1:ax.Y(hz(1e9)), y2:ax.Y(hz(1e9)), "class":"sv-dash"}, s);
    txt(s, ax.X(fm) - 4, ax.Y(hz(1e9)) - 7, W < 520 ? "máx. 4,55" : "máximo 4,55 (coche: frecuencia infinita)", "sv-tick", "end");
    var fa = Math.min(A.n, fm), fu = Math.min(A.u, fm);
    sv("circle", {cx:ax.X(fa), cy:ax.Y(hz(fa)), r:7, "class":"sv-pA"}, s);
    sv("circle", {cx:ax.X(fu), cy:ax.Y(hz(fu)), r:7, "class":"sv-pB"}, s);
    var near = Math.abs(ax.X(fa) - ax.X(fu)) < 60, lowA = ax.Y(hz(fa)) - 12 < ax.Y(hz(1e9)) + 4;
    txt(s, ax.X(fu), ax.Y(hz(fu)) + 22, "útil " + nf(A.u), "sv-val", "middle");
    if(fa !== fu) txt(s, ax.X(fa) + (near ? 10 : 0), lowA ? ax.Y(hz(fa)) + 22 : ax.Y(hz(fa)) - 12, "anunciada " + nf(A.n), "sv-val", near ? "start" : "middle");
    hold2.appendChild(s);
    var gain = hz(A.u + 1) / hz(A.u) - 1, cA = hz(A.n), cU = hz(A.u);
    hold2.appendChild(el("p", "frecuencia-hz", "Con " + nf(A.u) + " trenes útiles (frecuencia <b>" + cls(A.u) + "</b>) el coeficiente vale <b>" + nf(cU, 2) + "</b>" +
      (A.n !== A.u ? "; con las " + nf(A.n) + " salidas anunciadas valdría " + nf(cA, 2) + ", pero el viajero no percibe esa diferencia" : "") +
      ". Añadir un tren útil más lo multiplica por " + nf(1 + gain, 3) + " (<b>+" + nf(gain * 100, 1) + " %</b>)" + (A.u >= 25 ? ": casi nada, la curva ya está plana." : A.u <= 3 ? ": mucho, porque los primeros trenes son los que más atraen." : ".")));
  }
  draw(); onResize(draw);
}

/* ══ Perfil de carga del tren: la forma de la carga a lo largo del recorrido ══ */
function perfil(root){
  /* st: [nombre, km, suben, bajan]. Kilómetros aproximados (ver nota); viajeros ilustrativos. */
  var SV = [
    {l:"Directo sin paradas", p:404, st:[["Madrid", 0, 350, 0], ["Barcelona", 621, 0, 350]],
     t:"Todos suben en el origen y bajan en el destino: el perfil es un rectángulo. Vx = Vm y Ah = 100 %."},
    {l:"AVE con parada en Zaragoza", p:404, st:[["Madrid", 0, 330, 0], ["Zaragoza", 307, 60, 70], ["Barcelona", 621, 0, 320]],
     t:"Una parada intermedia con un tráfico parecido en los dos sentidos: casi tantos suben como bajan y el perfil sigue casi plano."},
    {l:"AVE con 4 paradas intermedias", p:404, st:[["Madrid", 0, 300, 0], ["Calatayud", 221, 10, 20], ["Zaragoza", 307, 70, 80], ["Lleida", 442, 40, 50], ["Camp de Tarragona", 521, 30, 50], ["Barcelona", 621, 0, 250]],
     t:"Muchas paradas no significan por sí mismas un perfil malo: si en cada una suben casi tantos como bajan, la carga apenas cae."},
    {l:"Larga distancia que descarga", p:300, st:[["Barcelona", 0, 300, 0], ["Lleida", 180, 15, 20], ["Zaragoza", 315, 30, 60], ["Pamplona", 490, 15, 50], ["Vitoria", 590, 10, 45], ["Burgos", 710, 10, 45], ["León", 890, 10, 55], ["Ponferrada", 1010, 5, 35], ["Ourense", 1170, 5, 40], ["Vigo", 1270, 0, 50]],
     t:"Sale lleno de una gran ciudad y en cada parada bajan más de los que suben: perfil decreciente. Al final del recorrido lleva muchas plazas vacías."},
    {l:"Cercanías hacia la ciudad", p:900, st:[["Cabecera", 0, 60, 0], ["Pueblo 2", 6, 120, 2], ["Pueblo 3", 11, 180, 8], ["Pueblo 4", 17, 220, 15], ["Periferia", 22, 150, 40], ["Ciudad 1", 28, 10, 260], ["Centro", 32, 0, 415]],
     t:"Por la mañana el tren se va llenando en cada pueblo hasta entrar en la ciudad, donde se vacía: perfil creciente y luego caída brusca. Por la tarde, al revés."}
  ];
  var S = SV[0];
  var f = frame(root, {note:"Viajeros ilustrativos, no son datos reales de ningún tren. Kilómetros aproximados: LAV Madrid-Barcelona según los puntos kilométricos de las estaciones (redondeados); el recorrido «tipo Barcelona-Vigo» sigue las paradas de ese servicio con distancias aproximadas; el cercanías es genérico. Plazas: 404 (tren de alta velocidad de una composición), 300 (tren de larga distancia) y 900 (cercanías, contando plazas de pie)."});
  var g1 = group(f.ctrl, "Elige un servicio");
  var sel = el("select", "perfil-sel"); sel.setAttribute("aria-label", "Servicio");
  sel.innerHTML = SV.map(function(s, i){ return '<option value="' + i + '">' + esc(s.l) + "</option>"; }).join("");
  g1.appendChild(sel);
  var g2 = group(f.ctrl, "Tamaño frente a forma");
  var sK = slider({label:"Escalar la demanda", unit:"%", min:30, max:120, step:5, value:100, help:"multiplica todos los que suben y bajan"}, draw);
  g2.appendChild(sK.el);
  var cb = el("label", "sim-chk", '<input type="checkbox"> Ver solo la forma (carga en % de los viajeros máximos)');
  g2.appendChild(cb); var chk = cb.querySelector("input"); chk.addEventListener("change", draw);
  resetBtn(f.ctrl, function(){ sK.set(100); chk.checked = false; draw(); });
  sel.addEventListener("change", function(){ S = SV[+sel.value]; draw(); });

  function calc(){
    var k = sK.get() / 100, st = S.st.map(function(r){ return {n:r[0], km:r[1], up:Math.round(r[2] * k), dn:Math.round(r[3] * k)}; });
    /* que lo que baja cuadre con lo que sube (redondeos) */
    var on = 0; st.forEach(function(r, i){ if(i === st.length - 1) r.dn = on; else { r.dn = Math.min(r.dn, on); on += r.up - r.dn; } r.load = on; });
    var L = st[st.length - 1].km, seg = [], vkm = 0, Vx = 0, Ve = 0;
    for(var i = 0; i < st.length - 1; i++){ var d = st[i + 1].km - st[i].km; seg.push({a:st[i].km, b:st[i + 1].km, v:st[i].load}); vkm += st[i].load * d; Vx = Math.max(Vx, st[i].load); }
    st.forEach(function(r){ Ve += r.up; });
    var Vm = vkm / L;
    return {st:st, seg:seg, L:L, vkm:vkm, Vx:Vx, Vm:Vm, Ve:Ve, Ah:Vx ? Vm / Vx : NaN, IS:Vm ? Vx / Vm : NaN, A:vkm / (S.p * L)};
  }
  function draw(){
    var c = calc(), norm = chk.checked;
    kpis(f.kpis, [
      {l:"Viajeros máximos (Vx)", v:nf(c.Vx), s:"el tramo más cargado"},
      {l:"Viajeros medios (Vm)", v:nf(c.Vm, 1), s:"v·km ÷ km del tren"},
      {l:"Aprovechamiento horizontal", v:pct(c.Ah), s:"Ah = Vm ÷ Vx", cls:c.Ah >= 0.85 ? "sim-k-pos" : c.Ah < 0.65 ? "sim-k-neg" : "sim-k-acc"},
      {l:"Saturación (IS)", v:nf(c.IS, 2), s:"Vx ÷ Vm"},
      {l:"Viajeros·km", v:nf(c.vkm), s:"área bajo el perfil · " + nf(c.L) + " km"}
    ]);
    clear(f.chart);
    var W = cw(f, 660), sc = (W - 64) / c.L, many = c.st.some(function(r, i){ var q = c.st[i + 1]; return q && (q.km - r.km) * sc < (r.n.length + q.n.length) * 3.6 + 10; }), H1 = 250, H2 = 96, lab = many ? 78 : 30, H = H1 + lab + H2 + 14;
    var s = svgBox(W, H, "Perfil de carga del servicio " + S.l + ": viajeros a bordo en cada tramo y, debajo, viajeros que suben y bajan en cada estación"); f.chart.appendChild(s);
    var yMax = norm ? 1 : niceMax(Math.max(S.p, c.Vx) * 1.05);
    var ax = axes(s, {w:W, h:H1, l:50, r:14, t:28, b:10, x0:0, x1:c.L, y0:0, y1:yMax, ny:4, yl:norm ? "% de Vx a bordo" : "viajeros a bordo", fy:function(v){ return norm ? nf(v * 100) + " %" : nf(v); }});
    var Y = function(v){ return ax.Y(norm ? v / c.Vx : v); };
    /* hueco hasta el techo Vx = desaprovechamiento horizontal */
    sv("rect", {x:ax.X(0), y:Y(c.Vx), width:ax.X(c.L) - ax.X(0), height:ax.Y(0) - Y(c.Vx), "class":"perfil-gap"}, s);
    var pts = [[ax.X(0), ax.Y(0)]];
    c.seg.forEach(function(g){ pts.push([ax.X(g.a), Y(g.v)]); pts.push([ax.X(g.b), Y(g.v)]); });
    pts.push([ax.X(c.L), ax.Y(0)]);
    sv("path", {d:path(pts) + "Z", "class":"perfil-under"}, s);
    sv("path", {d:path(pts) + "Z", "class":"perfil-area"}, s);
    sv("path", {d:path(pts.slice(1, -1)), "class":"sv-l1"}, s);
    sv("line", {x1:ax.X(0), x2:ax.X(c.L), y1:Y(c.Vx), y2:Y(c.Vx), "class":"sv-dash"}, s);
    txt(s, ax.X(c.L) - 4, Y(c.Vx) - 6, "techo: Vx = " + nf(c.Vx), "sv-tick", "end");
    sv("line", {x1:ax.X(0), x2:ax.X(c.L), y1:Y(c.Vm), y2:Y(c.Vm), "class":"sv-l2"}, s);
    txt(s, ax.X(0) + 4, Y(c.Vm) + 15, "media: Vm = " + nf(c.Vm, 0), "sv-tick sv-c2", "start");
    if(!norm && S.p <= yMax){ sv("line", {x1:ax.X(0), x2:ax.X(c.L), y1:ax.Y(S.p), y2:ax.Y(S.p), "class":"perfil-cap"}, s); var near = Math.abs(ax.Y(S.p) - Y(c.Vx)) < 16; txt(s, near ? ax.X(0) + 4 : ax.X(c.L) - 4, ax.Y(S.p) - 5, "plazas: " + nf(S.p), "sv-tick", near ? "start" : "end"); }
    /* estaciones */
    c.st.forEach(function(r){
      var x = ax.X(r.km);
      sv("line", {x1:x, x2:x, y1:28, y2:H1 - 10, "class":"sv-grid"}, s);
      if(many) txt(s, x, H1 + 4, r.n, "sv-tick", "end").setAttribute("transform", "rotate(-45 " + x.toFixed(1) + " " + (H1 + 4) + ")");
      else txt(s, x, H1 + 8, r.n, "sv-tick", r.km === 0 ? "start" : r.km === c.L ? "end" : "middle");
    });
    /* suben y bajan */
    var y0 = H1 + lab + H2 / 2, mB = Math.max.apply(null, c.st.map(function(r){ return Math.max(r.up, r.dn); })) || 1, bw = Math.max(6, Math.min(18, (W - 70) / c.st.length / 3));
    sv("line", {x1:ax.X(0) - 6, x2:ax.X(c.L) + 6, y1:y0, y2:y0, "class":"sv-base"}, s);
    txt(s, 4, y0 - 20, "suben", "sv-tick sv-c3", "start"); txt(s, 4, y0 + 28, "bajan", "sv-tick sv-c2", "start");
    c.st.forEach(function(r){
      var x = ax.X(r.km), hu = (H2 / 2 - 6) * r.up / mB, hd = (H2 / 2 - 6) * r.dn / mB;
      if(r.up) sv("rect", {x:x - bw / 2, y:y0 - hu, width:bw, height:hu, "class":"sv-f3"}, s);
      if(r.dn) sv("rect", {x:x - bw / 2, y:y0, width:bw, height:hd, "class":"sv-f2"}, s);
    });
    var m = [S.t];
    m.push("Ah = " + nf(c.Vm, 0) + " ÷ " + nf(c.Vx) + " = <b>" + pct(c.Ah) + "</b>: el hueco sombreado entre el perfil y el techo (" + pct(1 - c.Ah) + " del rectángulo) son plazas·km que el tren lleva vacías <b>por culpa de las paradas</b>, aunque fuese lleno en su tramo punta.");
    if(sK.get() !== 100) m.push("Has escalado la demanda al " + sK.get() + " %: cambian los viajeros y los v·km, pero <b>Ah e IS no se mueven</b>. Eso es el perfil: la forma, no el tamaño.");
    if(c.Vx > S.p) m.push("<b>Ojo:</b> con esta demanda el tramo punta lleva " + nf(c.Vx) + " viajeros para " + nf(S.p) + " plazas. Habría que reforzar ese tramo (o rechazar viajeros).");
    else if(c.Ah < 0.65) m.push("Con un perfil así, las medidas típicas son ofrecer más capacidad solo en el tramo cargado (acoplar o segregar coches en ruta, servicios parciales) o vender mejor los tramos que van vacíos.");
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  draw(); onResize(draw);
}

/* ══ Simetría del tráfico: ¿cuadran los que van con los que vuelven? ══ */
function simetria(root){
  /* Ruta entre dos ciudades con dos estaciones cada una. N = viajeros que realmente van de A a B en el ciclo (y los mismos vuelven).
     pS / pL: % de los viajeros de A que SALEN desde Centro / que LLEGAN (vuelven) a Centro. qS / qL: lo mismo en B para Central.
     x: viajeros que el registro pierde (según el escenario). */
  var SC = [
    {l:"Datos limpios", N:100000, pS:60, pL:60, qS:65, qL:65, x:0, xl:null,
     dx:"Cada estación ve salir a tantos viajeros como ve llegar: es lo que se espera cuando se mira el ciclo completo."},
    {l:"Suben en cabecera, bajan cerca de casa", N:100000, pS:70, pL:54, qS:72, qL:58, x:0, xl:null,
     dx:"Al salir, muchos van a la estación de cabecera (más trenes, plaza asegurada); al volver, bajan en la que les queda más cerca. Estación a estación parece asimétrico; la ciudad cuadra."},
    {l:"Billete a la última estación", N:100000, pS:60, pL:0, qS:100, qL:65, x:0, xl:null,
     dx:"Con el mismo precio a todas las estaciones de una ciudad, el billete de llegada se emite a la última (Norte en A, Central en B) aunque el viajero baje antes. El sistema registra llegadas en una sola estación."},
    {l:"Falta un producto", N:100000, pS:60, pL:60, qS:65, qL:65, x:6, xl:"Vuelven en otro producto u operador",
     dx:"Solo se analiza un producto (o un operador). Parte de los viajeros vuelve en otro tren (Media Distancia, otra empresa) que no está en los datos: la vuelta parece más pequeña."},
    {l:"Venta a bordo sin asignar", N:100000, pS:60, pL:60, qS:65, qL:65, x:4, xl:"Ida vendida a bordo sin estación",
     dx:"En una estación sin venta, el billete se cobra a bordo y no siempre se asigna a su origen: esos viajeros desaparecen de la ida."},
    {l:"Frontera", N:100000, pS:60, pL:60, qS:65, qL:65, x:8, xl:"Vuelta internacional mal asignada",
     dx:"Una de las estaciones es de frontera: parte del tráfico internacional se reparte con otra empresa o se asigna a otra relación, y un sentido sale corto."}
  ];
  var S = SC[0];
  var f = frame(root, {note:"Ruta y cifras ilustrativas: dos ciudades con dos estaciones cada una. En todos los escenarios viajan de verdad los mismos viajeros en los dos sentidos; lo que cambia es cómo los registra el sistema. Umbral normal del coeficiente de simetría: 1,02 (García Álvarez)."});
  var gS = group(f.ctrl, "Qué le pasa a los datos");
  var sel = el("select", "simetria-sel"); sel.setAttribute("aria-label", "Escenario de datos");
  sel.innerHTML = SC.map(function(s, i){ return '<option value="' + i + '">' + esc(s.l) + "</option>"; }).join("");
  gS.appendChild(sel);
  var gP = group(f.ctrl, "Ajusta el escenario");
  var sN = slider({label:"Viajeros reales por sentido", unit:"miles", min:10, max:500, step:10, value:S.N / 1000, help:"en el ciclo completo (un año, por ejemplo)"}, draw);
  var sPS = slider({label:"Ciudad A · salen desde Centro", unit:"%", min:0, max:100, step:1, value:S.pS, help:"el resto sale desde Norte"}, draw);
  var sPL = slider({label:"Ciudad A · llegan a Centro", unit:"%", min:0, max:100, step:1, value:S.pL, help:"el resto llega a Norte"}, draw);
  var sX = slider({label:"Viajeros que el registro pierde", unit:"%", min:0, max:30, step:1, value:S.x}, draw);
  gP.appendChild(sN.el); gP.appendChild(sPS.el); gP.appendChild(sPL.el); gP.appendChild(sX.el);
  resetBtn(f.ctrl, function(){ apply(S); });
  sel.addEventListener("change", function(){ S = SC[+sel.value]; apply(S); });
  function apply(s){
    sN.set(s.N / 1000); sPS.set(s.pS); sPL.set(s.pL); sX.set(s.x);
    sX.el.classList.toggle("simetria-off", !s.xl);
    sX.el.querySelector(".sim-cl").textContent = s.xl || "Viajeros que el registro pierde";
    draw();
  }
  function cs(a, b){ var mx = Math.max(a, b), mn = Math.min(a, b); return mn > 0 ? mx / mn : (mx > 0 ? Infinity : NaN); }
  function fcs(v){ return !isFinite(v) ? (isNaN(v) ? "—" : "solo un sentido") : nf(v, 3); }
  function lvl(v){ return !(v <= 1.02) ? (v <= 1.10 ? "w" : "b") : "o"; }
  function draw(){
    var N = sN.get() * 1000, pS = sPS.get() / 100, pL = sPL.get() / 100, x = S.xl ? sX.get() / 100 : 0;
    var ida = N, vue = N, kind = S.l;
    if(S === SC[3] || S === SC[5]) vue = N * (1 - x);
    if(S === SC[4]) ida = N * (1 - x);
    /* filas: estación, salen (hacia la otra ciudad), llegan (desde la otra ciudad) */
    var rows = [
      {n:"A · Centro", s:ida * pS, l:vue * pL},
      {n:"A · Norte", s:ida * (1 - pS), l:vue * (1 - pL)},
      {n:"Ciudad A", s:ida, l:vue, city:true},
      {n:"B · Central", s:vue * S.qL / 100, l:ida * S.qS / 100},
      {n:"B · Aeropuerto", s:vue * (1 - S.qL / 100), l:ida * (1 - S.qS / 100)},
      {n:"Ciudad B", s:vue, l:ida, city:true}
    ];
    rows.forEach(function(r){ r.c = cs(r.s, r.l); });
    var route = cs(ida, vue), worst = rows.filter(function(r){ return !r.city; }).reduce(function(m, r){ return (isNaN(m.c) || r.c > m.c || (!isFinite(r.c) && !isNaN(r.c))) ? r : m; }, {c:NaN});
    kpis(f.kpis, [
      {l:"Cs de la ruta (por ciudades)", v:fcs(route), s:route <= 1.02 ? "dentro de lo normal (≤ 1,02)" : "por encima de 1,02: revisa", cls:route <= 1.02 ? "sim-k-pos" : "sim-k-neg"},
      {l:"Peor estación", v:fcs(worst.c), s:worst.n || "—", cls:worst.c <= 1.02 ? "" : "sim-k-acc"},
      {l:"Registrados A → B", v:nf(ida), s:"viajeros de ida"},
      {l:"Registrados B → A", v:nf(vue), s:"viajeros de vuelta"}
    ]);
    clear(f.chart);
    var W = cw(f, 640), nar = W < 460, rh = nar ? 50 : 40, top = 44, H = top + rows.length * rh + 34;
    var s = svgBox(W, H, "Pirámide de viajeros que salen y llegan en cada estación y ciudad, con su coeficiente de simetría"); f.chart.appendChild(s);
    var LW = nar ? 6 : 124, RW = nar ? 62 : 104, c = LW + (W - LW - RW) / 2, half = (W - LW - RW) / 2 - 6;
    var mx = Math.max.apply(null, rows.map(function(r){ return Math.max(r.s, r.l); })) || 1;
    txt(s, c - 6, 16, nar ? "← salen" : "← salen hacia la otra ciudad", "sv-axl", "end");
    txt(s, c + 6, 16, nar ? "llegan →" : "llegan desde la otra ciudad →", "sv-axl", "start");
    txt(s, W - RW / 2, 34, "Cs", "sv-axl", "middle");
    rows.forEach(function(r, i){
      var y = top + i * rh, bh = r.city ? 20 : 16, yb = nar ? y + 20 + (rh - 22 - bh) / 2 : y + (rh - bh) / 2, yc = yb + bh / 2;
      if(r.city) sv("rect", {x:0, y:y + 1, width:W, height:rh - 2, rx:6, "class":"simetria-city"}, s);
      txt(s, 8, nar ? y + 15 : y + rh / 2 + 4, r.n, r.city ? "sv-lab" : "sv-t", "start");
      var wl = half * r.s / mx, wr = half * r.l / mx;
      sv("rect", {x:c - wl, y:yb, width:wl, height:bh, rx:2, "class":"sv-f1"}, s);
      sv("rect", {x:c, y:yb, width:wr, height:bh, rx:2, "class":"sv-f2"}, s);
      var vl = nf(r.s), vr = nf(r.l), inL = wl > vl.length * 7 + 10, inR = wr > vr.length * 7 + 10;
      txt(s, inL ? c - wl + 5 : c - wl - 4, yc + 4, vl, inL ? "simetria-in" : "sv-tick", inL ? "start" : "end");
      txt(s, inR ? c + wr - 5 : c + wr + 4, yc + 4, vr, inR ? "simetria-in" : "sv-tick", inR ? "end" : "start");
      var L = isNaN(r.c) ? "o" : lvl(r.c), cx = W - RW + 12;
      sv("circle", {cx:cx, cy:yc, r:7, "class":"simetria-d simetria-" + L}, s);
      txt(s, cx, yc + 4, L === "o" ? "✓" : "!", "simetria-dt", "middle");
      txt(s, cx + 12, yc + 4, isFinite(r.c) ? nf(r.c, 2) : (isNaN(r.c) ? "—" : "∞"), r.city ? "sv-val" : "sv-tick", "start");
    });
    sv("line", {x1:c, x2:c, y1:top - 4, y2:top + rows.length * rh + 2, "class":"sv-base"}, s);
    var ly = H - 12;
    sv("circle", {cx:12, cy:ly - 4, r:6, "class":"simetria-d simetria-o"}, s); txt(s, 22, ly, "≤ 1,02 normal", "sv-tick");
    sv("circle", {cx:W < 460 ? 112 : 132, cy:ly - 4, r:6, "class":"simetria-d simetria-w"}, s); txt(s, (W < 460 ? 112 : 132) + 10, ly, "≤ 1,10", "sv-tick");
    sv("circle", {cx:W < 460 ? 182 : 222, cy:ly - 4, r:6, "class":"simetria-d simetria-b"}, s); txt(s, (W < 460 ? 182 : 222) + 10, ly, "> 1,10 investiga", "sv-tick");
    var m = ["<b>" + esc(kind) + ".</b> " + S.dx];
    var stOK = rows.filter(function(r){ return !r.city; }).every(function(r){ return r.c <= 1.02; });
    if(route <= 1.02 && !stOK) m.push("Por ciudades, Cs = <b>" + fcs(route) + "</b>: la ruta es simétrica. La asimetría está solo en las estaciones (peor: " + esc(worst.n) + ", " + fcs(worst.c) + "). <b>Diagnóstico:</b> no es un problema de datos, sino de cómo se reparte la ciudad. Agrupa todas sus estaciones antes de calcular Cs.");
    else if(route <= 1.02) m.push("Cs = <b>" + fcs(route) + "</b> por ciudades y todas las estaciones por debajo de 1,02: los datos pasan el test y puedes seguir con el análisis.");
    else {
      var gap = Math.abs(ida - vue);
      m.push("Por ciudades, Cs = <b>" + fcs(route) + "</b>: faltan " + nf(gap) + " viajeros en el sentido " + (ida < vue ? "A → B" : "B → A") + ". Agrupar estaciones <b>no</b> lo arregla, porque el hueco está en el total.");
      m.push(S === SC[3] ? "<b>Diagnóstico probable:</b> el análisis mira un solo producto u operador. Suma todos los trenes de la relación (y, si puedes, los de otros operadores) antes de sacar conclusiones." :
             S === SC[4] ? "<b>Diagnóstico probable:</b> ventas a bordo o en estaciones sin taquilla que no se asignan a su origen. Revisa los billetes «sin estación» del sistema de venta." :
             S === SC[5] ? "<b>Diagnóstico probable:</b> estación de frontera. Comprueba cómo se reparten los billetes internacionales entre empresas y a qué relación se imputan." :
             "Busca la causa: un producto que falta, ventas sin asignar, transbordos o una estación de frontera.");
    }
    f.msg.innerHTML = m.map(function(p){ return "<p>" + p + "</p>"; }).join("");
  }
  apply(S); onResize(draw);
}

/* Tope de eje «redondo» sin desperdiciar media escala: múltiplo de una décima parte del valor «bonito» superior (divisible en cuartos). */
function unidades_top(x){ var q = niceMax(x) / 20; return Math.ceil(x / (q * 4)) * q * 4; }
/* ══ De los viajeros al margen: los dos «ladrillos» (ingresos y costes) ══ */
function unidades(root){
  var P = [
    {l:"Corredor del ejemplo 2", v:8.45, rv:493.76, pm:11.40, p:8.46, rp:625, c:7.73,
     n:"Corredor Madrid-Zaragoza-Barcelona del ejemplo 2 (capítulo 11.G): todas las cifras salen de sus datos."},
    {l:"Renfe 2006 · AV y LD", v:18.2, rv:465.27, pm:8.09, p:28, rp:465, c:4.8,
     n:"Ingresos de alta velocidad y larga distancia de Renfe en 2006 (viajeros, recorrido y percepción del material). Plazas, recorrido de la plaza y coste por plaza·km son ILUSTRATIVOS: el material no los da."},
    {l:"Renfe 2006 · Cercanías y MD", v:498.1, rv:23.67, pm:4.65, p:1123, rp:30, c:2.5,
     n:"Ingresos de cercanías y media distancia de Renfe en 2006 (percepción recalculada: 548 M€ ÷ 11.792 Mv·km = 4,65 c€). Plazas, recorrido de la plaza y coste por plaza·km son ILUSTRATIVOS: el material no los da."}
  ];
  var cur = P[0];
  var f = frame(root, {note:cur.n});
  seg(f.ctrl, "Caso de partida", P, function(o){ cur = o; load(o); });
  var g1 = group(f.ctrl, "Ingresos: lo que se mueve"), g2 = group(f.ctrl, "Costes: lo que se ofrece");
  var sV = slider({label:"Viajeros", unit:"M", min:0.1, max:600, step:0.01, value:cur.v}, draw);
  var sRv = slider({label:"Recorrido medio del viajero", unit:"km", min:1, max:900, step:0.01, value:cur.rv}, draw);
  var sPm = slider({label:"Percepción media", unit:"c€/v·km", min:0.5, max:30, step:0.01, value:cur.pm, help:"ingreso sin IVA por km de viajero"}, draw);
  var sP = slider({label:"Plazas ofertadas", unit:"M", min:0.1, max:1500, step:0.01, value:cur.p}, draw);
  var sRp = slider({label:"Recorrido medio de la plaza", unit:"km", min:1, max:900, step:0.01, value:cur.rp, help:"= recorrido medio del tren"}, draw);
  var sC = slider({label:"Coste por plaza·km", unit:"c€", min:0.5, max:30, step:0.01, value:cur.c}, draw);
  g1.appendChild(sV.el); g1.appendChild(sRv.el); g1.appendChild(sPm.el);
  g2.appendChild(sP.el); g2.appendChild(sRp.el); g2.appendChild(sC.el);
  resetBtn(f.ctrl, function(){ load(cur); });
  var note = root.querySelector(".sim-note");
  function load(o){ sV.set(o.v); sRv.set(o.rv); sPm.set(o.pm); sP.set(o.p); sRp.set(o.rp); sC.set(o.c); note.textContent = o.n; draw(); }
  function mv(x){ return nf(x, x < 100 ? 1 : 0); }
  function draw(){
    var v = sV.get(), rv = sRv.get(), pm = sPm.get(), p = sP.get(), rp = sRp.get(), c = sC.get();
    var vkm = v * rv, pkm = p * rp, I = vkm * pm / 100, C = pkm * c / 100, M = I - C, A = pkm ? vkm / pkm : NaN;
    var mp = A * pm - c, imposible = A > 1.0001;
    kpis(f.kpis, [
      {l:"Viajeros·km", v:mv(vkm) + " M", s:nf(v, 2) + " M v × " + nf(rv, 1) + " km"},
      {l:"Ingresos de tráfico", v:meur(I, I < 100 ? 1 : 0), s:"v·km × " + nf(pm, 2) + " c€"},
      {l:"Plazas·km", v:mv(pkm) + " M", s:nf(p, 2) + " M plazas × " + nf(rp, 0) + " km"},
      {l:"Costes", v:meur(C, C < 100 ? 1 : 0), s:"plazas·km × " + nf(c, 2) + " c€"},
      {l:"Aprovechamiento", v:isFinite(A) ? nf(A, 3) : "—", s:"v·km ÷ plazas·km", cls:imposible ? "sim-k-neg" : "sim-k-acc"},
      {l:"Margen", v:meur(M, Math.abs(M) < 100 ? 1 : 0), s:nf(mp, 2) + " c€ por plaza·km", cls:M >= 0 ? "sim-k-pos" : "sim-k-neg"}
    ]);
    clear(f.chart);
    var box = el("div", "unidades-st"); f.chart.appendChild(box);
    var W = cw(f, 640), H = 250;
    /* 1. Áreas: plazas·km (rectángulo exterior) y viajeros·km (interior). La proporción de áreas es el aprovechamiento. */
    var s1 = svgBox(W, H, "Rectángulo de plazas·km (plazas por recorrido de la plaza) con el de viajeros·km dentro; la parte llena es el aprovechamiento, " + (isFinite(A) ? pct(A) : "sin dato")); box.appendChild(s1);
    var xm = unidades_top(Math.max(rv, rp) * 1.05), ym = unidades_top(Math.max(v, p) * 1.12);
    var ax = axes(s1, {w:W, h:H, l:50, r:14, t:30, b:40, x0:0, x1:xm, y0:0, y1:ym, ny:4, xt:[0, xm / 4, xm / 2, xm * 3 / 4, xm], fy:function(t){ return nf(t, t % 1 ? 1 : 0); }, fx:function(t){ return nf(t, t % 1 ? 1 : 0); }, yl:"millones (plazas, viajeros)", xl:"km de recorrido medio"});
    var x0 = ax.X(0), y0 = ax.Y(0);
    sv("rect", {x:x0, y:ax.Y(p), width:Math.max(0, ax.X(rp) - x0), height:Math.max(0, y0 - ax.Y(p)), "class":"unidades-of"}, s1);
    sv("rect", {x:x0, y:ax.Y(v), width:Math.max(0, ax.X(rv) - x0), height:Math.max(0, y0 - ax.Y(v)), "class":imposible ? "unidades-bad" : "unidades-tr"}, s1);
    var lx = x0 + 6;
    txt(s1, ax.X(rp) - 6, ax.Y(p) - 7 < 40 ? ax.Y(p) + 16 : ax.Y(p) - 7, "plazas·km " + mv(pkm) + " M", "sv-val unidades-lof", "end");
    if(ax.X(rv) - x0 > 120 && y0 - ax.Y(v) > 34){
      txt(s1, lx, ax.Y(v) + 18, "viajeros·km " + mv(vkm) + " M", "sv-val unidades-ltr");
      txt(s1, lx, ax.Y(v) + 34, "aprovechamiento " + (isFinite(A) ? pct(A, 0) : "—"), "sv-tick unidades-ltr");
    } else {
      txt(s1, x0 + 4, ax.Y(v) - 6, "viajeros·km " + mv(vkm) + " M", "sv-val");
    }
    /* 2. Barras: ingresos, costes y margen en M€ */
    var s2 = svgBox(W, 190, "Barras de ingresos y costes en millones de euros y el margen como diferencia: " + meur(M, 1)); box.appendChild(s2);
    var top = unidades_top(Math.max(I, C) * 1.08 || 1);
    var H2 = 190, L = 78, R = 16, T = 14, B = 40, bw = W - L - R, X = function(val){ return L + val / top * bw; };
    var g = sv("g", {"class":"sv-ax"}, s2);
    for(var i = 0; i <= 4; i++){ var xv = top * i / 4; sv("line", {x1:X(xv), x2:X(xv), y1:T - 6, y2:H2 - B, "class":i ? "sv-grid" : "sv-base"}, g); txt(g, X(xv), H2 - B + 16, nf(xv), "sv-tick", "middle"); }
    txt(g, L + bw / 2, H2 - 6, "M€ al año", "sv-axl", "middle");
    var rows = [
      {k:"Ingresos", a:0, b:I, cls:"sv-f1", t:meur(I, 1)},
      {k:"Costes", a:0, b:C, cls:"sv-f2", t:meur(C, 1)},
      {k:"Margen", a:Math.min(I, C), b:Math.max(I, C), cls:M >= 0 ? "unidades-pos" : "unidades-neg", t:(M >= 0 ? "+" : "") + meur(M, 1)}
    ];
    var rh = 30, gap = (H2 - T - B - 3 * rh) / 3;
    rows.forEach(function(r, j){
      var y = T + j * (rh + gap) + gap / 2;
      txt(s2, L - 8, y + rh / 2 + 4, r.k, "sv-lab", "end");
      var xa = X(r.a), xb = X(r.b);
      sv("rect", {x:xa, y:y, width:Math.max(1, xb - xa), height:rh, rx:3, "class":r.cls}, s2);
      var inside = xb - xa > 96, right = xb + 80 <= W - R;
      if(inside) txt(s2, xb - 6, y + rh / 2 + 4, r.t, "sv-val unidades-in", "end");
      else txt(s2, right ? xb + 6 : xa - 6, y + rh / 2 + 4, r.t, "sv-val", right ? "start" : "end");
    });
    if(M !== 0){
      var yA = T + gap / 2 + rh, yM = T + 2 * (rh + gap) + gap / 2;
      sv("line", {x1:X(Math.min(I, C)), x2:X(Math.min(I, C)), y1:yA, y2:yM, "class":"sv-dash"}, s2);
      sv("line", {x1:X(Math.max(I, C)), x2:X(Math.max(I, C)), y1:yA - rh, y2:yM, "class":"sv-dash"}, s2);
    }
    /* mensaje */
    var m = [], aEq = pm ? c / pm : NaN, pmEq = A ? c / A : NaN;
    if(imposible){ m.push("<b>Combinación imposible:</b> salen más viajeros·km (" + mv(vkm) + " M) que plazas·km (" + mv(pkm) + " M). Un tren no puede llevar más kilómetros de viajero que kilómetros de asiento: el aprovechamiento nunca pasa de 1. Sube las plazas o su recorrido."); }
    m.push("Cada plaza·km cuesta <b>" + nf(c, 2) + " c€</b>. Cada viajero·km paga <b>" + nf(pm, 2) + " c€</b>, pero solo se llena el " + (isFinite(A) ? pct(A, 1) : "—") + " de lo ofrecido, así que cada plaza·km ingresa de media " + nf(A, 3) + " × " + nf(pm, 2) + " = <b>" + nf(A * pm, 2) + " c€</b>. Margen por plaza·km: " + nf(A * pm, 2) + " − " + nf(c, 2) + " = <b>" + nf(mp, 2) + " c€</b>.");
    if(pm <= c) m.push("La percepción media no supera el coste por plaza·km: <b>no hay aprovechamiento que salve las cuentas</b>, ni con el tren lleno todo el recorrido. Hay que subir precios, bajar costes o buscar otra financiación (en cercanías, el contrato de servicio público).");
    else m.push(M >= 0 ? "Hay margen. Las cuentas se equilibrarían con un aprovechamiento de " + pct(aEq, 1) + " (coste ÷ percepción) o, con este aprovechamiento, con una percepción de " + nf(pmEq, 2) + " c€/v·km." : "Hay pérdidas. Para cubrir costes harían falta un aprovechamiento de <b>" + pct(aEq, 1) + "</b> (coste ÷ percepción) o, con el aprovechamiento actual, una percepción de <b>" + nf(pmEq, 2) + " c€/v·km</b>.");
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  draw(); onResize(draw);
}

/* ══ Ejemplo 1 interactivo: parámetros de utilización de un tren (Ve, Vx, Vm, v·km, p·km, Rv, Rvx, IS, IR, U, A, Av, Ah) ══ */
function utiliza(root){
  var PRE = [
    {l:"Datos del ejemplo", P:300, km:[0, 200, 300, 350], up:[250, 25, 10], dn:[50, 100]},
    {l:"Variante: más rotación en B", P:300, km:[0, 200, 300, 350], up:[250, 125, 10], dn:[150, 100]},
    {l:"Tren sin paradas", P:300, km:[0, 200, 300, 350], up:[250, 0, 0], dn:[0, 0]}
  ];
  var NAMES = ["A", "B", "C", "D"];
  var f = frame(root, {note:"Datos del ejemplo 1 del material didáctico (un tren inventado de 300 plazas y cuatro estaciones). Cambia cualquier cifra: si en una estación bajan más viajeros de los que van a bordo, el simulador lo limita; en la estación final bajan todos."});
  seg(f.ctrl, "Casos", PRE, function(o){ set(o); draw(); });
  var g1 = group(f.ctrl, "El tren");
  var sP = slider({label:"Plazas ofertadas (P)", unit:"plazas", min:50, max:700, step:10, value:300, help:"la composición no cambia en todo el recorrido"}, draw);
  g1.appendChild(sP.el);
  var g2 = group(f.ctrl, "Estaciones");
  var tw = el("div", "utiliza-tw");
  var rows = NAMES.map(function(n, i){
    return '<tr><th scope="row">' + n + '</th>' +
      '<td><input type="number" inputmode="numeric" data-c="km" data-i="' + i + '" min="0" max="2000" step="1" aria-label="Kilómetro de la estación ' + n + '"' + (i === 0 ? " disabled" : "") + '></td>' +
      '<td><input type="number" inputmode="numeric" data-c="up" data-i="' + i + '" min="0" max="2000" step="1" aria-label="Viajeros que suben en ' + n + '"' + (i === 3 ? " disabled" : "") + '></td>' +
      '<td><input type="number" inputmode="numeric" data-c="dn" data-i="' + i + '" min="0" max="2000" step="1" aria-label="Viajeros que bajan en ' + n + '"' + (i === 0 || i === 3 ? " disabled" : "") + '></td>' +
      '<td class="utiliza-ob" data-ob="' + i + '"></td></tr>';
  }).join("");
  tw.innerHTML = '<table class="utiliza-tbl"><thead><tr><th scope="col">Est.</th><th scope="col">km</th><th scope="col">Suben</th><th scope="col">Bajan</th><th scope="col">A bordo al salir</th></tr></thead><tbody>' + rows + "</tbody></table>";
  g2.appendChild(tw);
  var fix = el("p", "utiliza-fix"); fix.setAttribute("aria-live", "polite"); g2.appendChild(fix);
  resetBtn(f.ctrl, function(){ set(PRE[0]); segOn(0); draw(); });
  function segOn(i){ Array.prototype.forEach.call(f.ctrl.querySelectorAll(".sim-seg button"), function(b, j){ b.classList.toggle("on", i === j); b.setAttribute("aria-pressed", i === j ? "true" : "false"); }); }
  function inp(c, i){ return tw.querySelector('input[data-c="' + c + '"][data-i="' + i + '"]'); }
  function set(o){
    sP.set(o.P);
    for(var i = 0; i < 4; i++){
      inp("km", i).value = o.km[i];
      inp("up", i).value = i < 3 ? o.up[i] : 0;
      inp("dn", i).value = i === 0 ? 0 : i < 3 ? o.dn[i - 1] : 0;
    }
  }
  tw.addEventListener("input", function(e){ if(e.target.tagName === "INPUT" && e.target.value !== "") draw(); });
  tw.addEventListener("change", function(e){ if(e.target.tagName === "INPUT") draw(); });
  set(PRE[0]);

  function read(){
    var km = [], up = [], dn = [], ob = [], a = 0, notes = [];
    for(var i = 0; i < 4; i++){
      var k = i === 0 ? 0 : Math.max(0, Math.round(+inp("km", i).value || 0));
      if(i > 0 && k <= km[i - 1]){ k = km[i - 1] + 1; notes.push("El kilómetro de " + NAMES[i] + " tiene que ser mayor que el de " + NAMES[i - 1] + ": se ha corregido a " + nf(k) + "."); inp("km", i).value = k; }
      km.push(k);
      var u = i === 3 ? 0 : Math.max(0, Math.round(+inp("up", i).value || 0));
      var d = i === 0 ? 0 : i === 3 ? a : Math.max(0, Math.round(+inp("dn", i).value || 0));
      if(d > a){ notes.push("En " + NAMES[i] + " no pueden bajar " + nf(d) + " viajeros si solo van " + nf(a) + " a bordo: se ha limitado a " + nf(a) + "."); d = a; inp("dn", i).value = d; }
      if(i === 3) inp("dn", i).value = d;
      a = a - d + u;
      up.push(u); dn.push(d); ob.push(a);
    }
    return {km:km, up:up, dn:dn, ob:ob, notes:notes};
  }

  function draw(){
    var r = read(), P = sP.get(), L = r.km[3];
    for(var i = 0; i < 4; i++) tw.querySelector('[data-ob="' + i + '"]').textContent = i < 3 ? nf(r.ob[i]) : "0";
    fix.textContent = r.notes.join(" ");
    var seg3 = [0, 1, 2].map(function(i){ return {a:r.km[i], b:r.km[i + 1], v:r.ob[i], d:r.km[i + 1] - r.km[i]}; });
    var Ve = r.up[0] + r.up[1] + r.up[2];
    var Vx = Math.max(seg3[0].v, seg3[1].v, seg3[2].v);
    var vkm = seg3.reduce(function(s, x){ return s + x.v * x.d; }, 0), pkm = P * L;
    var Vm = vkm / L, Rv = Ve ? vkm / Ve : NaN, Rvx = Vx ? vkm / Vx : NaN;
    var IS = Vm ? Vx / Vm : NaN, IR = Ve ? Vx / Ve : NaN, U = Ve / P, A = vkm / pkm, Av = Vx / P, Ah = Vx ? Vm / Vx : NaN;
    var over = Vx > P;
    var d3 = function(x){ return isFinite(x) ? nf(x, 3) : "—"; };
    kpis(f.kpis, [
      {l:"Aprovechamiento (A)", v:pct(A), s:"v·km ÷ p·km", cls:over ? "sim-k-neg" : "sim-k-acc"},
      {l:"Vertical (Av)", v:pct(Av), s:"Vx ÷ plazas"},
      {l:"Horizontal (Ah)", v:isFinite(Ah) ? pct(Ah) : "—", s:"Vm ÷ Vx"},
      {l:"Saturación (IS)", v:d3(IS), s:"Vx ÷ Vm"},
      {l:"Rotación (IR)", v:d3(IR), s:"Vx ÷ Ve"},
      {l:"Utilización (U)", v:nf(U, 2), s:"Ve ÷ plazas"}
    ]);

    /* perfil de carga: escalones por tramo frente a las plazas, con Vx y Vm marcados */
    clear(f.chart);
    var W = cw(f, 980), H = 280, nar = W < 520;
    var s = svgBox(W, H, "Perfil de carga del tren: viajeros a bordo en cada tramo frente a las " + nf(P) + " plazas; viajeros máximos " + nf(Vx) + " y viajeros medios " + nf(Vm, 1));
    var ym = niceMax(Math.max(P, Vx, 10) * 1.12);
    var ax = axes(s, {w:W, h:H, l:50, r:nar ? 12 : 64, t:26, b:40, x0:0, x1:L, y0:0, y1:ym, xt:r.km, xl:"estación y kilómetro del recorrido", yl:"viajeros a bordo", fx:function(v){ var i = r.km.indexOf(v); return nar ? NAMES[i] : NAMES[i] + " · " + nf(v); }});
    sv("rect", {x:ax.X(0), y:ax.Y(P), width:ax.X(L) - ax.X(0), height:ax.Y(0) - ax.Y(P), "class":"utiliza-cap"}, s);
    seg3.forEach(function(x, i){
      if(x.v > 0) sv("rect", {x:ax.X(x.a), y:ax.Y(x.v), width:Math.max(0, ax.X(x.b) - ax.X(x.a) - 1), height:ax.Y(0) - ax.Y(x.v), "class":x.v > P ? "utiliza-ov" : "sv-f1"}, s);
      if(ax.X(x.b) - ax.X(x.a) > 34) txt(s, (ax.X(x.a) + ax.X(x.b)) / 2, ax.Y(x.v) - 6, nf(x.v), "sv-val", "middle");
    });
    sv("line", {x1:ax.X(0), x2:ax.X(L), y1:ax.Y(P), y2:ax.Y(P), "class":"utiliza-pl"}, s);
    sv("line", {x1:ax.X(0), x2:ax.X(L), y1:ax.Y(Vm), y2:ax.Y(Vm), "class":"sv-l2"}, s);
    var lx = nar ? ax.X(L) - 4 : ax.X(L) + 6, la = nar ? "end" : "start";
    txt(s, lx, ax.Y(P) - 5, "plazas " + nf(P), "sv-tick", la);
    if(!nar) txt(s, lx, ax.Y(Vm) + (Math.abs(ax.Y(Vm) - ax.Y(P)) < 16 ? 14 : -5), "Vm " + nf(Vm, 1), "sv-val", la);
    f.chart.appendChild(s);
    var leg = el("p", "utiliza-leg", '<span class="utiliza-sw utiliza-sw1"></span>viajeros a bordo en cada tramo (su área son los v·km) <span class="utiliza-sw utiliza-sw2"></span>plazas ofertadas (el rectángulo son los p·km) <span class="utiliza-sw utiliza-sw3"></span>viajeros medios (Vm = ' + nf(Vm, 1) + ')');
    f.chart.appendChild(leg);

    /* cuenta paso a paso */
    var tr = seg3.map(function(x, i){ return nf(x.v) + " × " + nf(x.d); }).join(" + ");
    var steps = [
      ["Ve", "Viajeros evolucionados: todos los que suben", nf(r.up[0]) + " + " + nf(r.up[1]) + " + " + nf(r.up[2]), "<b>" + nf(Ve) + "</b> viajeros"],
      ["Vx", "Viajeros máximos: el tramo más cargado", "máx(" + seg3.map(function(x){ return nf(x.v); }).join(", ") + ")", "<b>" + nf(Vx) + "</b> viajeros"],
      ["v·km", "Viajeros·km: a bordo × km de cada tramo", tr, "<b>" + nf(vkm) + "</b> v·km"],
      ["p·km", "Plazas·km: plazas × recorrido del tren", nf(P) + " × " + nf(L), "<b>" + nf(pkm) + "</b> p·km"],
      ["Vm", "Viajeros medios: v·km ÷ km del tren", nf(vkm) + " ÷ " + nf(L), "<b>" + nf(Vm, 2) + "</b> viajeros"],
      ["Rv", "Recorrido medio del viajero: v·km ÷ Ve", nf(vkm) + " ÷ " + nf(Ve), "<b>" + (isFinite(Rv) ? nf(Rv, 2) : "—") + "</b> km"],
      ["Rvx", "Recorrido medio del viajero máximo: v·km ÷ Vx", nf(vkm) + " ÷ " + nf(Vx), "<b>" + (isFinite(Rvx) ? nf(Rvx, 2) : "—") + "</b> km"],
      ["IS", "Saturación: Vx ÷ Vm", nf(Vx) + " ÷ " + nf(Vm, 2), "<b>" + d3(IS) + "</b>"],
      ["IR", "Rotación: Vx ÷ Ve", nf(Vx) + " ÷ " + nf(Ve), "<b>" + d3(IR) + "</b>"],
      ["U", "Utilización: Ve ÷ plazas", nf(Ve) + " ÷ " + nf(P), "<b>" + nf(U, 3) + "</b>"],
      ["A", "Aprovechamiento: v·km ÷ p·km", nf(vkm) + " ÷ " + nf(pkm), "<b>" + nf(A, 3) + "</b> (" + pct(A) + ")"],
      ["Av", "Aprovechamiento vertical: Vx ÷ plazas", nf(Vx) + " ÷ " + nf(P), "<b>" + nf(Av, 3) + "</b>"],
      ["Ah", "Aprovechamiento horizontal: Vm ÷ Vx (= Rvx ÷ km del tren)", nf(Vm, 2) + " ÷ " + nf(Vx) + " = " + (isFinite(Rvx) ? nf(Rvx, 1) : "—") + " ÷ " + nf(L), "<b>" + d3(Ah) + "</b>"],
      ["✓", "Comprobación: Av × Ah = A", nf(Av, 3) + " × " + d3(Ah), "<b>" + (isFinite(Ah) ? nf(Av * Ah, 3) : "—") + "</b>"]
    ];
    f.chart.insertAdjacentHTML("beforeend", '<p class="sim-st">La cuenta paso a paso</p><div class="tw"><table class="dxtbl sim-tbl sim-steps utiliza-steps"><thead><tr><th>Ind.</th><th>Qué calculas</th><th>Cuenta</th><th>Resultado</th></tr></thead><tbody>' +
      steps.map(function(x){ return "<tr><td>" + x[0] + "</td><td>" + x[1] + "</td><td>" + x[2] + "</td><td>" + x[3] + "</td></tr>"; }).join("") + "</tbody></table></div>");

    var m = [];
    if(Ve === 0){ m.push("No sube nadie: no hay nada que medir."); f.msg.innerHTML = "<p>" + m[0] + "</p>"; return; }
    if(over) m.push("<b>Ojo:</b> en algún tramo van más viajeros (" + nf(Vx) + ") que plazas (" + nf(P) + "). Con plazas sentadas eso no es posible: sube las plazas o baja los viajeros.");
    m.push("De cada 100 plazas·km que ofrece el tren se ocupan <b>" + nf(A * 100, 1) + "</b>. Se explica en dos partes: en el tramo más lleno va ocupado el " + pct(Av) + " de los asientos (vertical) y, de media, los viajeros llenan ese máximo durante el " + (isFinite(Ah) ? pct(Ah) : "—") + " del recorrido (horizontal).");
    if(Ve === Vx && Math.abs(Vx - Vm) < 1e-9) m.push("Sin subidas ni bajadas intermedias, <b>Ve = Vx = Vm</b>: los tres indicadores de viajeros coinciden y el aprovechamiento horizontal es del 100 %.");
    else if(IR < 0.75) m.push("La rotación es baja (IR = " + d3(IR) + "): muchas plazas que se vacían en ruta se vuelven a vender. Fíjate en que los viajeros evolucionados suben mucho, pero el aprovechamiento no cambia: lo que pesa son los v·km.");
    else m.push("Por cada viajero que sube, el tren lleva de media " + (isFinite(Rv) ? nf(Rv, 0) : "—") + " km; el tramo más cargado lleva un " + pct(IS - 1) + " más de viajeros que la media (IS = " + d3(IS) + ").");
    f.msg.innerHTML = m.map(function(x){ return "<p>" + x + "</p>"; }).join("");
  }
  draw(); onResize(draw);
}

var KINDS = {aprov:aprov, corredor:corredor, equilibrio:equilibrio, estacional:estacional, frecuencia:frecuencia, perfil:perfil, simetria:simetria, unidades:unidades, utiliza:utiliza, costes:costes, dospartes:dospartes, ramsey:ramsey, elasticidad:elasticidad, acb:acb, organigrama:organigrama};
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
