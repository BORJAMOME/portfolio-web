/* ══════════════════════════════════════════════════════════════
   MANUAL DE POWER BI · visuales interactivos
   Un visual por tema. Cada función recibe {body, ctrl} (los nodos
   que crea app.js dentro del marco .viz) y pinta con HTML/SVG.
   Los colores de datos usan --lab1…6 y siempre significan lo mismo:
   lab1 = valor principal, lab2 = comparación, lab3 = positivo/visible,
   lab4 = negativo, lab5 = resaltado secundario.
   ══════════════════════════════════════════════════════════════ */
var VIZ = {};
(function(){
"use strict";

/* ── utilidades ── */
function nf(n, d){ d = d || 0; return Number(n).toLocaleString("es-ES", {minimumFractionDigits:d, maximumFractionDigits:d}); }
function eur(n, d){ return nf(n, d === undefined ? 2 : d) + " €"; }
function pct(n, d){ return (n === null || !isFinite(n)) ? "(en blanco)" : nf(n * 100, d === undefined ? 1 : d) + " %"; }
function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function seg(key, opts, cur, label){
  return '<div class="seg" role="group"' + (label ? ' aria-label="' + label + '"' : "") + ' data-k="' + key + '">' + opts.map(function(o){
    var on = String(o[0]) === String(cur);
    return '<button type="button" data-v="' + o[0] + '" aria-pressed="' + on + '"' + (on ? ' class="on"' : "") + ">" + o[1] + "</button>";
  }).join("") + "</div>";
}
function onSeg(root, key, cb){
  var s = root.querySelector('.seg[data-k="' + key + '"]');
  if(!s) return;
  s.addEventListener("click", function(e){
    var b = e.target.closest("button"); if(!b) return;
    s.querySelectorAll("button").forEach(function(x){ x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); });
    b.classList.add("on"); b.setAttribute("aria-pressed", "true");
    cb(b.dataset.v);
  });
}
function open(id){ if(window.PBI) window.PBI.openTopic(id); }

/* datos de ejemplo: Tiendas AHORA */
var SALES = [
  {id:1, anio:2023, mes:"Ene", tienda:"Águilas",   prov:"Murcia",  cat:"Bebida", cant:4, precio:3.0},
  {id:2, anio:2023, mes:"Ene", tienda:"Cartagena", prov:"Murcia",  cat:"Helado", cant:3, precio:2.5},
  {id:3, anio:2023, mes:"Feb", tienda:"Mojácar",   prov:"Almería", cat:"Prensa", cant:2, precio:4.5},
  {id:4, anio:2023, mes:"Jul", tienda:"Águilas",   prov:"Murcia",  cat:"Helado", cant:6, precio:2.5},
  {id:5, anio:2023, mes:"Jul", tienda:"Mojácar",   prov:"Almería", cat:"Bebida", cant:5, precio:3.0},
  {id:6, anio:2023, mes:"Ago", tienda:"Cartagena", prov:"Murcia",  cat:"Bebida", cant:7, precio:3.0},
  {id:7, anio:2024, mes:"Ene", tienda:"Águilas",   prov:"Murcia",  cat:"Prensa", cant:3, precio:4.5},
  {id:8, anio:2024, mes:"Feb", tienda:"Cartagena", prov:"Murcia",  cat:"Bebida", cant:4, precio:3.0},
  {id:9, anio:2024, mes:"Jul", tienda:"Mojácar",   prov:"Almería", cat:"Helado", cant:8, precio:2.5},
  {id:10,anio:2024, mes:"Jul", tienda:"Águilas",   prov:"Murcia",  cat:"Bebida", cant:6, precio:3.0},
  {id:11,anio:2024, mes:"Ago", tienda:"Cartagena", prov:"Murcia",  cat:"Helado", cant:5, precio:2.5},
  {id:12,anio:2024, mes:"Ago", tienda:"Mojácar",   prov:"Almería", cat:"Prensa", cant:2, precio:4.5}
];
SALES.forEach(function(r){ r.imp = r.cant * r.precio; });
var TIENDAS = ["Águilas", "Cartagena", "Mojácar"];
var CATS = ["Bebida", "Helado", "Prensa"];
function sum(rows, f){ return rows.reduce(function(a, r){ return a + (f ? f(r) : r.imp); }, 0); }

/* serie mensual para inteligencia de tiempo (miles de €) */
var MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
var S23 = [42,38,45,50,58,72,95,98,64,52,46,60];
var GROW = [1.05,1.08,0.97,1.10,1.06,1.04,1.09,1.03,1.07,0.99,1.05,1.12];
var S24 = S23.map(function(v, i){ return Math.round(v * GROW[i] * 10) / 10; });

/* diagrama de flujo genérico (nodos HTML clicables) */
function flow(f, nodes, zones){
  var cur = 0;
  function draw(){
    var html = '<div style="display:flex;flex-wrap:wrap;align-items:stretch;gap:8px">';
    nodes.forEach(function(n, i){
      var on = i === cur;
      if(i) html += '<div aria-hidden="true" style="display:grid;place-items:center;color:var(--muted);font-size:18px;padding:0 2px">→</div>';
      html += '<button type="button" data-i="' + i + '" aria-pressed="' + on + '" style="flex:1 1 140px;min-width:120px;text-align:left;padding:12px 14px;border-radius:10px;cursor:pointer;border:' + (on ? "1.5px solid var(--accent)" : ".5px solid var(--line)") + ";background:" + (on ? "var(--accent-soft)" : "var(--card)") + ';color:var(--text)">' +
        (n.z ? '<span style="display:block;font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:var(--label);font-weight:600;margin-bottom:3px">' + n.z + "</span>" : "") +
        '<b style="display:block;font-size:14px;color:var(--ink)">' + n.t + '</b><span style="font-size:12px;color:var(--muted)">' + n.s + "</span></button>";
    });
    html += "</div>";
    var n = nodes[cur];
    html += '<div class="kpi" style="margin-top:14px"><div class="kl">' + n.t + '</div><div style="font-size:15px;line-height:1.65;margin-top:6px;color:var(--text)">' + n.d + "</div>" +
      (n.link ? '<button type="button" class="vbtn" data-open="' + n.link + '" style="margin-top:10px">Ir al tema</button>' : "") + "</div>";
    f.body.innerHTML = html;
  }
  f.body.addEventListener("click", function(e){
    var b = e.target.closest("button[data-i]"); if(b){ cur = +b.dataset.i; draw(); return; }
    var o = e.target.closest("[data-open]"); if(o) open(o.dataset.open);
  });
  draw();
}

/* ══ 1 · FUNDAMENTOS ══ */
VIZ.arquitectura = function(f){
  f.title.textContent = "La cadena de Power BI";
  flow(f, [
    {z:"Orígenes", t:"Datos", s:"SQL, Excel, CSV, web", d:"El TPV de Tiendas AHORA (SQL Server), los presupuestos (Excel) y los objetivos (CSV). Power BI nunca modifica los orígenes: solo lee.", link:"obtener"},
    {z:"Desktop", t:"Power Query", s:"Extraer, transformar, cargar", d:"Se conecta a cada origen, limpia y da forma a las tablas (hechos y dimensiones) y las carga en el modelo. Cada paso se repite en cada actualización.", link:"transformar"},
    {z:"Desktop", t:"Modelo semántico", s:"Tablas, relaciones, DAX", d:"Base de datos columnar en memoria. Aquí viven las relaciones del modelo en estrella y las medidas DAX que responden a las preguntas de negocio.", link:"estrella"},
    {z:"Desktop", t:"Informe", s:"Páginas y visuales", d:"Los visuales consultan el modelo con DAX. El informe no sabe nada del origen: si el modelo está bien, el informe es rápido y coherente.", link:"percepcion"},
    {z:"Nube", t:"Power BI Service", s:"Publicar, compartir, actualizar", d:"Al publicar, el modelo y el informe suben a un área de trabajo. Desde ahí se programan actualizaciones, se crean paneles y aplicaciones y se aplica la seguridad.", link:"service"}
  ]);
};

VIZ.bi7 = function(f){
  f.title.textContent = "El ciclo BI7";
  var P = [
    {t:"Preguntas", d:"Batería de 50-100 preguntas de negocio, priorizadas a 10-15 para el primer entregable.", l:"preguntas"},
    {t:"Diseño", d:"Modelo en estrella y bocetos de informe, en papel o PowerPoint, antes de abrir Power BI.", l:"estrella"},
    {t:"Power Query", d:"Acceder, transformar, limpiar y cargar hasta tener exactamente las tablas diseñadas.", l:"transformar"},
    {t:"Optimizar", d:"Tipos de datos, ordenaciones, formatos, jerarquías y relaciones según el bus dimensional.", l:"vertipaq"},
    {t:"DAX", d:"Las medidas que responden a cada pregunta de negocio.", l:"medidas"},
    {t:"Informes", d:"Páginas y cuadros de mando que responden a la batería de preguntas con la mejor técnica visual.", l:"storytelling"},
    {t:"Compartir", d:"Publicar en Power BI Service, dar acceso y colaborar desde una única fuente de verdad.", l:"service"}
  ];
  var cur = 0;
  function draw(){
    var cx = 210, cy = 200, R = 150, s = '<svg viewBox="0 0 420 400" role="img" aria-label="Ciclo de siete pasos del método BI7">';
    s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" style="fill:none;stroke:var(--line-2);stroke-width:1.5;stroke-dasharray:4 5"/>';
    s += '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" style="font-family:var(--serif);font-size:40px;fill:var(--ink)">BI7</text>';
    s += '<text x="' + cx + '" y="' + (cy + 20) + '" text-anchor="middle" style="font-size:12px;fill:var(--muted)">en el sentido del reloj</text>';
    P.forEach(function(p, i){
      var a = -Math.PI / 2 + i * 2 * Math.PI / 7, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a), on = i === cur;
      s += '<g data-i="' + i + '" role="button" tabindex="0" aria-label="Paso ' + (i + 1) + ": " + p.t + '" style="cursor:pointer">' +
        '<circle cx="' + x + '" cy="' + y + '" r="26" style="fill:' + (on ? "var(--accent)" : "var(--card)") + ";stroke:var(--accent);stroke-width:1.5\"/>" +
        '<text x="' + x + '" y="' + (y + 6) + '" text-anchor="middle" style="font-family:var(--serif);font-size:19px;fill:' + (on ? "var(--on-accent)" : "var(--accent-ink)") + '">' + (i + 1) + "</text>" +
        '<text x="' + x + '" y="' + (y + (y > cy ? 46 : -36)) + '" text-anchor="middle" style="font-size:12.5px;font-weight:600;fill:var(--ink)">' + p.t + "</text></g>";
    });
    s += "</svg>";
    var p = P[cur];
    f.body.innerHTML = '<div class="vsplit"><div>' + s + '</div><div class="kpi"><div class="kl">Paso ' + (cur + 1) + ' de 7</div><div class="kv">' + p.t + '</div><p style="margin:8px 0 12px;font-size:15px;line-height:1.65">' + p.d + '</p><button type="button" class="vbtn" data-open="' + p.l + '">Ir al tema</button> <button type="button" class="vbtn solid" data-next="1">Siguiente paso</button></div></div>';
  }
  f.body.addEventListener("click", function(e){
    var g = e.target.closest("g[data-i]"); if(g){ cur = +g.dataset.i; draw(); return; }
    if(e.target.closest("[data-next]")){ cur = (cur + 1) % 7; draw(); return; }
    var o = e.target.closest("[data-open]"); if(o) open(o.dataset.open);
  });
  f.body.addEventListener("keydown", function(e){ var g = e.target.closest("g[data-i]"); if(g && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); cur = +g.dataset.i; draw(); f.body.querySelector('g[data-i="' + cur + '"]').focus(); } });
  draw();
};

VIZ.preguntas = function(f){
  f.title.textContent = "Anatomía de una pregunta";
  var Q = [
    {q:"¿Cuánto he vendido de Bebidas en Águilas en mayo de 2019?", m:"Importe vendido", fl:["Categoría = Bebidas","Tienda = Águilas","Mes = mayo 2019"], g:[], t:["Ventas","Producto","Tienda","Fecha"]},
    {q:"¿Qué productos me dejan más margen en cada tienda?", m:"Beneficio (venta − coste)", fl:[], g:["Producto","Tienda"], t:["Ventas","Producto","Tienda"]},
    {q:"¿Cumplo los objetivos de cada tienda mes a mes?", m:"Ventas frente a presupuesto", fl:[], g:["Tienda","Mes"], t:["Ventas","Presupuesto","Tienda","Fecha"]},
    {q:"¿Cuál es el ticket medio por tienda en verano?", m:"Ventas / nº de tickets", fl:["Temporada = verano"], g:["Tienda"], t:["Ventas","Tienda","Fecha"]},
    {q:"¿Qué empleados venden más helados en fin de semana?", m:"Importe vendido", fl:["Categoría = Helados","Día = fin de semana"], g:["Empleado"], t:["Ventas","Producto","Fecha","Empleado"]}
  ];
  var ALL = ["Ventas","Presupuesto","Fecha","Tienda","Producto","Cliente","Empleado"];
  var cur = 0;
  f.ctrl.innerHTML = '<label class="vlab">Pregunta <select class="vsel" data-q>' + Q.map(function(q, i){ return '<option value="' + i + '">' + (i + 1) + ". " + q.q.slice(0, 44) + "…</option>"; }).join("") + "</select></label>";
  function draw(){
    var q = Q[cur];
    function box(k, items, cls){ return '<div class="kpi"><div class="kl">' + k + '</div><div class="pill-row" style="margin-top:8px">' + (items.length ? items.map(function(x){ return '<span class="pill ' + (cls || "") + '">' + x + "</span>"; }).join("") : '<span style="font-size:13px;color:var(--muted)">Ninguno</span>') + "</div></div>"; }
    f.body.innerHTML = '<p style="font-family:var(--serif);font-size:21px;color:var(--ink);margin-bottom:14px">' + q.q + '</p><div class="vgrid">' + box("Algo que medir (hechos)", [q.m], "on") + box("Filtrar por (dimensiones)", q.fl) + box("Agrupar por (dimensiones)", q.g) + "</div>" +
      '<div class="kpi" style="margin-top:14px"><div class="kl">Tablas del modelo que intervienen</div><div class="pill-row" style="margin-top:8px">' + ALL.map(function(t){ return '<span class="pill' + (q.t.indexOf(t) > -1 ? " on" : "") + '">' + t + "</span>"; }).join("") + "</div></div>";
  }
  f.ctrl.querySelector("[data-q]").addEventListener("change", function(e){ cur = +e.target.value; draw(); });
  draw();
};

/* ══ 2 · MODELADO ══ */
VIZ.estrella = function(f){
  f.title.textContent = "Modelo en estrella de Tiendas AHORA";
  var D = [
    {n:"Cliente", q:"¿A quién he vendido?", k:"IdCliente", a:"Nombre, edad, tipo, código postal, ciudad, provincia"},
    {n:"Fecha", q:"¿Cuándo?", k:"Fecha", a:"Día, mes, trimestre, año, día de la semana, festivo, temporada"},
    {n:"Tienda", q:"¿Dónde?", k:"IdTienda", a:"Nombre, m², empleados, ciudad, provincia, tipo de tienda"},
    {n:"Producto", q:"¿Qué he vendido?", k:"IdProducto", a:"Descripción, categoría, subcategoría, tamaño, color"},
    {n:"Empleado", q:"¿Quién vendió?", k:"IdEmpleado", a:"Nombre, departamento, sección, antigüedad"}
  ];
  var GR = {linea:"Una fila por línea de ticket", ticket:"Una fila por ticket", mes:"Una fila por tienda y mes"};
  var QS = [
    {q:"Ventas por producto", ok:["linea"]},
    {q:"Ticket medio", ok:["linea","ticket"]},
    {q:"Ventas por cliente", ok:["linea","ticket"]},
    {q:"Ventas por tienda y mes", ok:["linea","ticket","mes"]},
    {q:"Ventas por empleado", ok:["linea","ticket"]}
  ];
  var cur = 2, gr = "linea";
  f.ctrl.innerHTML = '<span class="vlab">Granularidad</span>' + seg("g", [["linea","Línea"],["ticket","Ticket"],["mes","Tienda y mes"]], gr, "Granularidad de la tabla de hechos");
  onSeg(f.ctrl, "g", function(v){ gr = v; draw(); });
  function draw(){
    var cx = 260, cy = 190, R = 145, s = '<svg viewBox="0 0 520 380" role="img" aria-label="Tabla de hechos Ventas rodeada de cinco dimensiones">';
    D.forEach(function(d, i){
      var a = -Math.PI / 2 + i * 2 * Math.PI / 5, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a), on = i === cur;
      s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '" style="stroke:' + (on ? "var(--accent)" : "var(--line-2)") + ";stroke-width:" + (on ? 3 : 1.5) + '"/>';
      var ax = cx + (R - 58) * Math.cos(a), ay = cy + (R - 58) * Math.sin(a);
      s += '<text x="' + (cx + (R - 34) * Math.cos(a)) + '" y="' + (cy + (R - 34) * Math.sin(a) + 4) + '" text-anchor="middle" style="font-size:12px;font-weight:700;fill:var(--accent-ink)">1</text>';
      s += '<text x="' + ax + '" y="' + (ay + 4) + '" text-anchor="middle" style="font-size:12px;font-weight:700;fill:var(--muted)">*</text>';
    });
    s += '<rect x="' + (cx - 62) + '" y="' + (cy - 30) + '" width="124" height="60" rx="10" style="fill:var(--accent)"/><text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" style="font-family:var(--serif);font-size:20px;fill:var(--on-accent)">Ventas</text><text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" style="font-size:11px;fill:var(--on-accent);opacity:.8">hechos</text>';
    D.forEach(function(d, i){
      var a = -Math.PI / 2 + i * 2 * Math.PI / 5, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a), on = i === cur;
      s += '<g data-i="' + i + '" role="button" tabindex="0" aria-label="Dimensión ' + d.n + '" style="cursor:pointer"><rect x="' + (x - 52) + '" y="' + (y - 20) + '" width="104" height="40" rx="9" style="fill:' + (on ? "var(--accent-soft)" : "var(--card)") + ";stroke:" + (on ? "var(--accent)" : "var(--line-2)") + ';stroke-width:1.5"/><text x="' + x + '" y="' + (y + 5) + '" text-anchor="middle" style="font-size:13.5px;font-weight:600;fill:var(--ink)">' + d.n + "</text></g>";
    });
    s += "</svg>";
    var d = D[cur];
    var qs = QS.map(function(q){ var ok = q.ok.indexOf(gr) > -1; return '<li style="display:flex;gap:8px;align-items:center;font-size:14px;padding:3px 0"><span style="width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;background:' + (ok ? "var(--positive-soft);color:var(--positive-ink)" : "var(--negative-soft);color:var(--negative-ink)") + '">' + (ok ? "✓" : "×") + "</span>" + q.q + "</li>"; }).join("");
    f.body.innerHTML = '<div class="vsplit"><div>' + s + '</div><div style="display:flex;flex-direction:column;gap:12px"><div class="kpi"><div class="kl">' + d.q + '</div><div class="kv">' + d.n + '</div><div class="dax" style="margin-top:10px">Ventas[' + d.k + "]  *──1  " + d.n + "[" + d.k + "]</div><p style=\"font-size:13.5px;margin-top:8px;color:var(--muted)\">Atributos: " + d.a + '</p></div><div class="kpi"><div class="kl">' + GR[gr] + '</div><ul style="list-style:none;margin-top:8px">' + qs + "</ul></div></div></div>";
  }
  f.body.addEventListener("click", function(e){ var g = e.target.closest("g[data-i]"); if(g){ cur = +g.dataset.i; draw(); } });
  f.body.addEventListener("keydown", function(e){ var g = e.target.closest("g[data-i]"); if(g && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); cur = +g.dataset.i; draw(); f.body.querySelector('g[data-i="' + cur + '"]').focus(); } });
  draw();
};

VIZ.plana = function(f){
  f.title.textContent = "De tabla plana a estrella, paso a paso";
  var FLAT = [
    ["01/07/2024","Águilas","Murcia","Helado","Frigo",15],["01/07/2024","Mojácar","Almería","Bebida","Fonte",9],
    ["02/07/2024","Águilas","Murcia","Bebida","Fonte",12],["02/07/2024","Cartagena","Murcia","Helado","Frigo",10],
    ["03/07/2024","Mojácar","Almería","Helado","Frigo",20],["03/07/2024","Águilas","Murcia","Prensa","Diario",4.5]
  ];
  var tiendas = [], prods = [];
  FLAT.forEach(function(r){ var t = r[1] + "|" + r[2], p = r[3] + "|" + r[4]; if(tiendas.indexOf(t) < 0) tiendas.push(t); if(prods.indexOf(p) < 0) prods.push(p); });
  var S = [
    {t:"Tabla plana original", d:"Cada fila repite el nombre de la tienda, su provincia, el producto y el fabricante. Textos largos que se repiten en millones de filas."},
    {t:"1-3 · Duplicar y quedarse con las columnas de cada dimensión", d:"Una consulta por dimensión: Tienda (Tienda, Provincia) y Producto (Producto, Fabricante)."},
    {t:"4-5 · Quitar duplicados y añadir índice", d:"Cada dimensión queda con una fila por elemento y una clave entera pequeña."},
    {t:"6-7 · Llevar los Id a los hechos y quitar los textos", d:"Se combina Ventas con cada dimensión por las columnas de texto (mismo tipo) y se sustituyen por sus Id."},
    {t:"8 · Modelo en estrella", d:"Relaciones 1:* desde cada dimensión. Los textos se guardan una sola vez."}
  ];
  var st = 0;
  f.ctrl.innerHTML = '<button type="button" class="vbtn" data-p>Anterior</button><button type="button" class="vbtn solid" data-n>Siguiente paso</button>';
  function tbl(head, rows, hl){ return '<div class="tw"><table class="vtbl" style="min-width:0"><thead><tr>' + head.map(function(h, i){ return "<th" + (hl && hl.indexOf(i) > -1 ? ' style="color:var(--accent-ink)"' : "") + ">" + h + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.map(function(r){ return "<tr>" + r.map(function(c, i){ return "<td" + (hl && hl.indexOf(i) > -1 ? ' style="background:var(--accent-soft);color:var(--accent-ink);font-weight:600"' : "") + ">" + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>"; }
  function draw(){
    var h = '<div class="kpi" style="margin-bottom:14px"><div class="kl">Paso ' + (st + 1) + " de " + S.length + '</div><div style="font-size:16px;font-weight:600;color:var(--ink);margin-top:4px">' + S[st].t + '</div><div style="font-size:14px;margin-top:4px">' + S[st].d + "</div></div>";
    var fact;
    if(st === 0) h += tbl(["Fecha","Tienda","Provincia","Producto","Fabricante","Importe"], FLAT.map(function(r){ return r.map(function(c, i){ return i === 5 ? nf(c, 2) : c; }); }), [1,2,3,4]);
    else{
      var dt = tiendas.map(function(t, i){ var p = t.split("|"); return st >= 2 ? [i + 1].concat(p) : p; });
      var dp = prods.map(function(t, i){ var p = t.split("|"); return st >= 2 ? [i + 1].concat(p) : p; });
      if(st === 1){
        dt = FLAT.map(function(r){ return [r[1], r[2]]; }); dp = FLAT.map(function(r){ return [r[3], r[4]]; });
      }
      var tH = st >= 2 ? ["IdTienda","Tienda","Provincia"] : ["Tienda","Provincia"], pH = st >= 2 ? ["IdProducto","Producto","Fabricante"] : ["Producto","Fabricante"];
      h += '<div class="vgrid"><div><div class="kl" style="font-size:11px;font-weight:600;color:var(--label);text-transform:uppercase;letter-spacing:.8px">Tienda' + (st === 1 ? " (con duplicados)" : "") + "</div>" + tbl(tH, dt, st >= 2 ? [0] : null) + '</div><div><div class="kl" style="font-size:11px;font-weight:600;color:var(--label);text-transform:uppercase;letter-spacing:.8px">Producto' + (st === 1 ? " (con duplicados)" : "") + "</div>" + tbl(pH, dp, st >= 2 ? [0] : null) + "</div>";
      if(st >= 3){
        fact = FLAT.map(function(r){ return [r[0], tiendas.indexOf(r[1] + "|" + r[2]) + 1, prods.indexOf(r[3] + "|" + r[4]) + 1, nf(r[5], 2)]; });
        h += '<div style="grid-column:1/-1"><div class="kl" style="font-size:11px;font-weight:600;color:var(--label);text-transform:uppercase;letter-spacing:.8px">Ventas (hechos)</div>' + tbl(["Fecha","IdTienda","IdProducto","Importe"], fact, [1,2]) + "</div>";
      }
      h += "</div>";
      if(st === 4){
        var before = FLAT.reduce(function(a, r){ return a + (r[1] + r[2] + r[3] + r[4]).length; }, 0);
        var after = tiendas.join("").length + prods.join("").length + FLAT.length * 2;
        h += '<div class="vgrid" style="margin-top:12px"><div class="kpi"><div class="kl">Caracteres de texto guardados antes</div><div class="kv">' + before + '</div></div><div class="kpi"><div class="kl">Después (textos una vez + Id)</div><div class="kv">' + after + '</div><div class="ks">Con millones de filas, la diferencia es enorme.</div></div></div>';
      }
    }
    f.body.innerHTML = h;
  }
  f.ctrl.querySelector("[data-n]").addEventListener("click", function(){ st = (st + 1) % S.length; draw(); });
  f.ctrl.querySelector("[data-p]").addEventListener("click", function(){ st = (st + S.length - 1) % S.length; draw(); });
  draw();
};

VIZ.relaciones = function(f){
  f.title.textContent = "Por dónde viajan los filtros";
  var src = "Producto", bidir = false;
  f.ctrl.innerHTML = '<span class="vlab">Filtrar en</span>' + seg("s", [["Producto","Producto = Helado"],["Tienda","Tienda = Águilas"],["Ventas","Ventas: importe ≥ 15"]], src, "Tabla filtrada") +
    ' <label class="vlab"><input type="checkbox" data-b> Producto ↔ Ventas bidireccional</label>';
  onSeg(f.ctrl, "s", function(v){ src = v; draw(); });
  f.ctrl.querySelector("[data-b]").addEventListener("change", function(e){ bidir = e.target.checked; draw(); });
  function draw(){
    var rows = SALES.slice();
    if(src === "Producto") rows = rows.filter(function(r){ return r.cat === "Helado"; });
    if(src === "Tienda") rows = rows.filter(function(r){ return r.tienda === "Águilas"; });
    if(src === "Ventas") rows = rows.filter(function(r){ return r.imp >= 15; });
    var F = {Ventas:true, Producto:src === "Producto", Tienda:src === "Tienda", Fecha:false};
    var prodVis = CATS.slice(), tiendaVis = TIENDAS.slice();
    if(src === "Producto") prodVis = ["Helado"];
    if(src === "Tienda") tiendaVis = ["Águilas"];
    if(bidir && src !== "Producto"){ F.Producto = true; prodVis = CATS.filter(function(c){ return rows.some(function(r){ return r.cat === c; }); }); }
    var B = {Producto:[60,40], Ventas:[260,150], Tienda:[460,40], Fecha:[260,300]};
    function box(n, sub){ var p = B[n], on = F[n], isSrc = n === src; return '<g><rect x="' + (p[0] - 70) + '" y="' + (p[1] - 26) + '" width="140" height="52" rx="10" style="fill:' + (isSrc ? "var(--accent)" : on ? "var(--accent-soft)" : "var(--card)") + ";stroke:" + (on || isSrc ? "var(--accent)" : "var(--line-2)") + ';stroke-width:1.5"/><text x="' + p[0] + '" y="' + (p[1] - 3) + '" text-anchor="middle" style="font-size:14px;font-weight:600;fill:' + (isSrc ? "var(--on-accent)" : "var(--ink)") + '">' + n + '</text><text x="' + p[0] + '" y="' + (p[1] + 15) + '" text-anchor="middle" style="font-size:11px;fill:' + (isSrc ? "var(--on-accent)" : "var(--muted)") + '">' + sub + "</text></g>"; }
    function link(a, b, active, both, label){
      var A = B[a], Bp = B[b];
      return '<line x1="' + A[0] + '" y1="' + A[1] + '" x2="' + Bp[0] + '" y2="' + Bp[1] + '" style="stroke:' + (active ? "var(--lab2)" : "var(--line-2)") + ";stroke-width:" + (active ? 3 : 1.5) + (active ? "" : ";stroke-dasharray:5 5") + '"/>' +
        '<text x="' + ((A[0] + Bp[0]) / 2) + '" y="' + ((A[1] + Bp[1]) / 2 - 8) + '" text-anchor="middle" style="font-size:11px;fill:var(--muted)">' + label + (both ? " ↔" : " →") + "</text>";
    }
    var s = '<svg viewBox="0 0 520 340" role="img" aria-label="Diagrama de propagación de filtros">';
    s += link("Producto","Ventas", src === "Producto" || (bidir && src !== "Producto"), bidir, "1 : *");
    s += link("Tienda","Ventas", src === "Tienda", false, "1 : *");
    s += link("Fecha","Ventas", false, false, "1 : *");
    s += box("Producto", prodVis.length + " de 3 categorías") + box("Tienda", tiendaVis.length + " de 3 tiendas") + box("Ventas", rows.length + " de 12 filas") + box("Fecha", "sin filtro");
    s += "</svg>";
    var note = src === "Ventas" && !bidir ? "Un filtro en la tabla de hechos <b>no sube</b> a Producto: el segmentador de categorías seguiría mostrando las tres." :
      src === "Ventas" && bidir ? "Con la relación bidireccional el filtro de Ventas <b>sube</b> a Producto: solo quedan las categorías con alguna venta de 15 € o más." :
      src === "Tienda" && bidir ? "El filtro baja de Tienda a Ventas y, por la relación bidireccional, sube a Producto: solo las categorías vendidas en Águilas. Así se encadenan filtros que no esperabas." :
      "El filtro baja de la dimensión a los hechos por la relación 1:*. Es el comportamiento normal y el que quieres casi siempre.";
    f.body.innerHTML = '<div class="vsplit"><div>' + s + '</div><div class="kpi"><div class="kl">Resultado</div><div class="kv">' + eur(sum(rows)) + '</div><div class="ks">Ventas visibles</div><p style="margin-top:10px;font-size:14.5px;line-height:1.6">' + note + "</p></div></div>";
  }
  draw();
};

VIZ.compresion = function(f){
  f.title.textContent = "Cardinalidad y tamaño de una columna";
  var mode = "card", d = 1000;
  f.ctrl.innerHTML = seg("m", [["card","Cardinalidad"],["ticket","Dividir el ticket"],["fecha","Fecha y hora"]], mode, "Experimento");
  onSeg(f.ctrl, "m", function(v){ mode = v; draw(); });
  function bars(items, unit){
    var max = Math.max.apply(null, items.map(function(i){ return i.v; }));
    return items.map(function(i){ return '<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:4px"><span>' + i.n + '</span><b>' + i.l + '</b></div><div class="bar" style="height:14px;background:var(--card-2)"><i style="width:' + Math.max(1.5, i.v / max * 100) + "%;background:" + (i.c || "var(--lab1)") + '"></i></div></div>'; }).join("");
  }
  function draw(){
    if(mode === "card"){
      var rows = 10e6, bits = Math.max(1, Math.ceil(Math.log2(d + 1))), sz = (rows * bits / 8 + d * 12) / 1048576;
      f.body.innerHTML = '<label class="vlab" style="display:flex;gap:12px;align-items:center;margin-bottom:12px">Valores distintos en 10 millones de filas <input type="range" min="0" max="7" step="0.05" value="' + Math.log10(d) + '" data-r style="flex:1;max-width:360px"> <b style="color:var(--ink)">' + nf(d) + "</b></label>" +
        '<div class="vgrid"><div class="kpi"><div class="kl">Bits por fila (índice al diccionario)</div><div class="kv">' + bits + '</div></div><div class="kpi"><div class="kl">Tamaño aproximado</div><div class="kv">' + nf(sz, 1) + ' MB</div><div class="ks">Estimación didáctica: diccionario + índice por fila</div></div></div>' +
        bars([{n:"País (2 valores)", v:(rows * 1 / 8 + 2 * 12) / 1048576, l:nf((rows / 8 + 24) / 1048576, 1) + " MB"},{n:"Tu columna (" + nf(d) + " valores)", v:sz, l:nf(sz, 1) + " MB", c:"var(--lab2)"},{n:"Nº de ticket (10 M valores)", v:(rows * 24 / 8 + rows * 12) / 1048576, l:nf((rows * 24 / 8 + rows * 12) / 1048576, 1) + " MB", c:"var(--lab4)"}]);
      f.body.querySelector("[data-r]").addEventListener("input", function(e){ d = Math.round(Math.pow(10, +e.target.value)); draw(); f.body.querySelector("[data-r]").focus(); });
    } else if(mode === "ticket"){
      f.body.innerHTML = '<p style="font-size:14.5px;margin-bottom:6px">Tiendas AHORA: «S1-18-005-2324108» = Serie + Año + Tienda + Número. Medido con Bravo.</p>' +
        bars([{n:"Modelo con Ticket en una columna", v:23.95, l:"23,95 MB", c:"var(--lab4)"},{n:"Modelo con Ticket dividido en 4 columnas", v:8.12, l:"8,12 MB", c:"var(--lab3)"}]) +
        '<div class="vgrid" style="margin-top:8px"><div class="kpi"><div class="kl">Ticket (texto único)</div><div class="kv">17,78 MB</div></div><div class="kpi"><div class="kl">Serie + Año + Tienda</div><div class="kv">53 KB</div></div><div class="kpi"><div class="kl">Nº ticket (entero)</div><div class="kv">1,83 MB</div></div></div>';
    } else {
      f.body.innerHTML = '<p style="font-size:14.5px;margin-bottom:6px">Un año de registros con hora al segundo. Valores distintos que el motor tiene que guardar en su diccionario:</p>' +
        bars([{n:"FechaHora en una columna", v:31536000, l:nf(31536000) + " valores", c:"var(--lab4)"},{n:"Fecha (columna 1)", v:365, l:"365 valores", c:"var(--lab3)"},{n:"Hora (columna 2)", v:86400, l:nf(86400) + " valores", c:"var(--lab3)"},{n:"Hora + Minuto + Segundo (3 columnas)", v:144, l:"24 + 60 + 60 valores", c:"var(--lab3)"}]) +
        '<p style="font-size:13.5px;color:var(--muted);margin-top:6px">La escala es lineal: las barras verdes casi no se ven al lado de la roja. Ese es el ahorro.</p>';
    }
  }
  draw();
};

VIZ.calendario = function(f){
  f.title.textContent = "Generador de tabla calendario";
  var y0 = 2023, y1 = 2024, fiscal = false;
  var yrs = []; for(var y = 2018; y <= 2030; y++) yrs.push(y);
  f.ctrl.innerHTML = '<label class="vlab">Desde <select class="vsel" data-a>' + yrs.map(function(y){ return '<option' + (y === y0 ? " selected" : "") + ">" + y + "</option>"; }).join("") + '</select></label><label class="vlab">Hasta <select class="vsel" data-b>' + yrs.map(function(y){ return '<option' + (y === y1 ? " selected" : "") + ">" + y + "</option>"; }).join("") + '</select></label><label class="vlab"><input type="checkbox" data-f> Ejercicio fiscal desde septiembre</label>';
  var DN = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"], MN = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  function row(dt){
    var m = dt.getMonth(), wd = (dt.getDay() + 6) % 7 + 1, fy = fiscal ? (m >= 8 ? dt.getFullYear() + 1 : dt.getFullYear()) : null;
    var r = [dt.toLocaleDateString("es-ES"), dt.getFullYear(), m + 1, MN[m], "T" + (Math.floor(m / 3) + 1), DN[dt.getDay()], wd <= 5 ? "Laborable" : "Fin de semana"];
    if(fiscal) r.push("FY" + String(fy).slice(2));
    return r;
  }
  function draw(){
    if(y1 < y0){ var t = y0; y0 = y1; y1 = t; }
    var start = new Date(y0, 0, 1), end = new Date(y1, 11, 31), days = Math.round((end - start) / 864e5) + 1;
    var head = ["Fecha","Año","Mes","NombreMes","Trimestre","Día","Laborable"]; if(fiscal) head.push("AñoFiscal");
    var rows = [0,1,2,3,4].map(function(i){ return row(new Date(y0, 0, 1 + i)); });
    var last = row(end);
    f.body.innerHTML = '<div class="vgrid" style="margin-bottom:14px"><div class="kpi"><div class="kl">Filas generadas</div><div class="kv">' + nf(days) + '</div><div class="ks">' + (y1 - y0 + 1) + " años completos, del 1/1/" + y0 + " al 31/12/" + y1 + '</div></div><div class="kpi"><div class="kl">Comprobación</div><div style="font-size:14px;line-height:1.8;margin-top:6px">Sin huecos: sí<br>Empieza el 1 de enero: sí<br>Termina el 31 de diciembre: sí<br>Marcar como tabla de fechas: pendiente en tu modelo</div></div></div>' +
      '<div class="tw"><table class="vtbl"><thead><tr>' + head.map(function(h){ return "<th>" + h + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function(r){ return "<tr>" + r.map(function(c){ return "<td>" + c + "</td>"; }).join("") + "</tr>"; }).join("") +
      '<tr><td colspan="' + head.length + '" style="text-align:center;color:var(--muted)">… ' + nf(days - 6) + " filas más …</td></tr><tr>" + last.map(function(c){ return "<td>" + c + "</td>"; }).join("") + "</tr></tbody></table></div>";
  }
  f.ctrl.querySelector("[data-a]").addEventListener("change", function(e){ y0 = +e.target.value; draw(); });
  f.ctrl.querySelector("[data-b]").addEventListener("change", function(e){ y1 = +e.target.value; draw(); });
  f.ctrl.querySelector("[data-f]").addEventListener("change", function(e){ fiscal = e.target.checked; draw(); });
  draw();
};

/* ══ 3 · POWER QUERY ══ */
VIZ.modos = function(f){
  f.title.textContent = "¿Importar, DirectQuery o compuesto?";
  var st = {fr:"dia", vol:"mb", tr:"muchas"};
  f.ctrl.innerHTML = '<span class="vlab">Frescura</span>' + seg("fr", [["dia","Diaria"],["hora","Cada hora"],["min","Minutos"]], st.fr) +
    ' <span class="vlab">Volumen</span>' + seg("vol", [["mb","MB"],["gb","Pocos GB"],["tb","Cientos de GB"]], st.vol) +
    ' <span class="vlab">Transformaciones</span>' + seg("tr", [["pocas","Pocas"],["muchas","Muchas"]], st.tr);
  ["fr","vol","tr"].forEach(function(k){ onSeg(f.ctrl, k, function(v){ st[k] = v; draw(); }); });
  function draw(){
    var rec, why = [];
    if(st.fr === "min" && st.vol === "tb"){ rec = "Compuesto (DirectQuery + agregaciones)"; why.push("Necesitas minutos de frescura y el volumen no cabe en memoria: hechos en DirectQuery, dimensiones y agregados importados."); }
    else if(st.fr === "min"){ rec = "DirectQuery"; why.push("Con Importar, el máximo son 8 actualizaciones al día en Pro y 48 en Premium: no llegas a minutos."); }
    else if(st.vol === "tb"){ rec = "Compuesto"; why.push("Cientos de GB no caben en un modelo importado normal: importa dimensiones y deja la tabla de hechos grande en DirectQuery (o usa Direct Lake en Fabric)."); }
    else { rec = "Importar"; why.push("Es el modo más rápido y con todas las funciones de DAX y Power Query."); if(st.fr === "hora") why.push("Cada hora: programa varias actualizaciones (Pro llega a 8 al día; Premium a 48)."); }
    if(st.tr === "muchas" && rec !== "Importar") why.push("Ojo: con DirectQuery muchas transformaciones de Power Query no se pueden plegar al origen; llévalas a vistas SQL.");
    var cols = [
      {n:"Importar", p:["Máximo rendimiento","Todo el DAX y Power Query","Frescura limitada a las actualizaciones"]},
      {n:"DirectQuery", p:["Datos al momento","Cada clic consulta el origen","Limitaciones de DAX y Power Query"]},
      {n:"Compuesto", p:["Mezcla tablas importadas y DirectQuery","Agregaciones para acelerar","Más complejo de diseñar"]}
    ];
    f.body.innerHTML = '<div class="kpi" style="margin-bottom:14px"><div class="kl">Recomendación</div><div class="kv">' + rec + '</div><ul style="margin-top:8px;padding-left:18px;font-size:14.5px;line-height:1.6">' + why.map(function(w){ return "<li>" + w + "</li>"; }).join("") + '</ul></div><div class="vgrid">' +
      cols.map(function(c){ var on = rec.indexOf(c.n) === 0; return '<div class="kpi" style="' + (on ? "outline:1.5px solid var(--accent);background:var(--accent-soft)" : "") + '"><div class="kl">' + c.n + '</div><ul style="margin-top:6px;padding-left:18px;font-size:13.5px;line-height:1.6">' + c.p.map(function(p){ return "<li>" + p + "</li>"; }).join("") + "</ul></div>"; }).join("") + "</div>";
  }
  draw();
};

VIZ.unpivot = function(f){
  f.title.textContent = "Anular dinamización: de columnas a filas";
  var view = "ancha", nuevo = false, tipo = "otras";
  var W = [["Águilas",12000,11000,13500,14000],["Cartagena",9800,9400,10200,10800],["Mojácar",7600,7900,8100,8800]];
  f.ctrl.innerHTML = seg("v", [["ancha","Origen (una columna por mes)"],["larga","Tras anular dinamización"]], view, "Vista") +
    ' <label class="vlab"><input type="checkbox" data-n> El origen añade Abril</label> ' + seg("t", [["otras","De otras columnas"],["sel","Solo las seleccionadas"]], tipo, "Variante");
  onSeg(f.ctrl, "v", function(v){ view = v; draw(); });
  onSeg(f.ctrl, "t", function(v){ tipo = v; draw(); });
  f.ctrl.querySelector("[data-n]").addEventListener("change", function(e){ nuevo = e.target.checked; draw(); });
  function draw(){
    var months = ["Enero","Febrero","Marzo"].concat(nuevo ? ["Abril"] : []);
    var h;
    if(view === "ancha"){
      h = '<div class="tw"><table class="vtbl"><thead><tr><th>Tienda</th>' + months.map(function(m){ return '<th class="n">' + m + "</th>"; }).join("") + "</tr></thead><tbody>" +
        W.map(function(r){ return "<tr><td>" + r[0] + "</td>" + months.map(function(m, i){ return '<td class="n"' + (m === "Abril" ? ' style="background:var(--support-soft)"' : "") + ">" + nf(r[i + 1]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    } else {
      var use = tipo === "otras" ? months : ["Enero","Febrero","Marzo"];
      var rows = [];
      W.forEach(function(r){ use.forEach(function(m){ rows.push([r[0], m, r[["Enero","Febrero","Marzo","Abril"].indexOf(m) + 1]]); }); });
      h = '<div class="tw"><table class="vtbl"><thead><tr><th>Tienda</th><th>Mes</th><th class="n">ImportePresupuesto</th></tr></thead><tbody>' +
        rows.map(function(r){ return "<tr><td>" + r[0] + "</td><td" + (r[1] === "Abril" ? ' style="background:var(--support-soft)"' : "") + ">" + r[1] + '</td><td class="n">' + nf(r[2]) + "</td></tr>"; }).join("") + "</tbody></table></div>";
      if(nuevo && tipo === "sel") h += '<p style="margin-top:10px;font-size:14px;color:var(--negative-ink)">Abril existe en el origen pero no aparece: <code>Table.Unpivot</code> solo convierte las columnas que nombraste.</p>';
      if(nuevo && tipo === "otras") h += '<p style="margin-top:10px;font-size:14px;color:var(--positive-ink)">Abril aparece solo: <code>Table.UnpivotOtherColumns</code> fija Tienda y convierte todo lo demás.</p>';
    }
    var code = tipo === "otras" ? 'Table.UnpivotOtherColumns(Origen, {"Tienda"}, "Mes", "ImportePresupuesto")' : 'Table.Unpivot(Origen, {"Enero", "Febrero", "Marzo"}, "Mes", "ImportePresupuesto")';
    f.body.innerHTML = h + '<div class="dax" style="margin-top:12px">' + esc(code) + "</div>";
  }
  draw();
};

VIZ.joins = function(f){
  f.title.textContent = "Tipos de combinación";
  var A = ["Ana","Juan","María"], B = ["Juan","Pedro"], k = "left";
  var J = {
    left:{n:"Externa izquierda", r:function(){ return A.slice(); }, d:"Todas las filas de la primera y las coincidencias de la segunda.", sql:"LEFT OUTER JOIN"},
    right:{n:"Externa derecha", r:function(){ return B.slice(); }, d:"Todas las filas de la segunda y las coincidencias de la primera.", sql:"RIGHT OUTER JOIN"},
    full:{n:"Externa completa", r:function(){ return A.concat(B.filter(function(x){ return A.indexOf(x) < 0; })); }, d:"Todas las filas de ambas tablas.", sql:"FULL OUTER JOIN"},
    inner:{n:"Interna", r:function(){ return A.filter(function(x){ return B.indexOf(x) > -1; }); }, d:"Solo las filas que coinciden.", sql:"INNER JOIN"},
    lanti:{n:"Anti izquierda", r:function(){ return A.filter(function(x){ return B.indexOf(x) < 0; }); }, d:"Filas de la primera sin pareja en la segunda: huérfanos.", sql:"LEFT JOIN ... WHERE B.clave IS NULL"},
    ranti:{n:"Anti derecha", r:function(){ return B.filter(function(x){ return A.indexOf(x) < 0; }); }, d:"Filas de la segunda sin pareja en la primera.", sql:"RIGHT JOIN ... WHERE A.clave IS NULL"}
  };
  f.ctrl.innerHTML = seg("j", Object.keys(J).map(function(x){ return [x, J[x].n]; }), k, "Tipo de combinación");
  onSeg(f.ctrl, "j", function(v){ k = v; draw(); });
  function draw(){
    var res = J[k].r();
    function list(n, arr){ return '<div class="kpi"><div class="kl">' + n + '</div><div class="pill-row" style="margin-top:8px">' + arr.map(function(x){ var inR = res.indexOf(x) > -1; return '<span class="pill' + (inR ? " on" : " miss") + '">' + x + "</span>"; }).join("") + "</div></div>"; }
    var cx = 160, r = 70, s = '<svg viewBox="0 0 320 170" role="img" aria-label="Diagrama de Venn de la combinación">';
    var lOn = ["left","full","lanti"].indexOf(k) > -1, mOn = ["left","right","full","inner"].indexOf(k) > -1, rOn = ["right","full","ranti"].indexOf(k) > -1;
    s += '<defs><clipPath id="cpA"><circle cx="' + (cx - 40) + '" cy="85" r="' + r + '"/></clipPath></defs>';
    s += '<circle cx="' + (cx - 40) + '" cy="85" r="' + r + '" style="fill:' + (lOn ? "var(--lab1)" : "var(--card-2)") + ';opacity:.85"/>';
    s += '<circle cx="' + (cx + 40) + '" cy="85" r="' + r + '" style="fill:' + (rOn ? "var(--lab1)" : "var(--card-2)") + ';opacity:.85"/>';
    s += '<circle cx="' + (cx + 40) + '" cy="85" r="' + r + '" clip-path="url(#cpA)" style="fill:' + (mOn ? "var(--lab2)" : "var(--card)") + '"/>';
    s += '<circle cx="' + (cx - 40) + '" cy="85" r="' + r + '" style="fill:none;stroke:var(--line-2)"/><circle cx="' + (cx + 40) + '" cy="85" r="' + r + '" style="fill:none;stroke:var(--line-2)"/>';
    s += '<text x="' + (cx - 75) + '" y="90" text-anchor="middle" style="font-size:14px;font-weight:700;fill:' + (lOn ? "var(--on-accent)" : "var(--muted)") + '">A</text><text x="' + (cx + 75) + '" y="90" text-anchor="middle" style="font-size:14px;font-weight:700;fill:' + (rOn ? "var(--on-accent)" : "var(--muted)") + '">B</text></svg>';
    f.body.innerHTML = '<div class="vsplit"><div>' + s + '</div><div style="display:flex;flex-direction:column;gap:10px">' + list("Grupo A (primera consulta)", A) + list("Grupo B (segunda consulta)", B) +
      '<div class="kpi"><div class="kl">' + J[k].n + '</div><div class="kv">' + (res.join(", ") || "(vacío)") + '</div><div class="ks">' + J[k].d + " · SQL: " + J[k].sql + "</div></div></div></div>";
  }
  draw();
};

VIZ.flujo = function(f){
  f.title.textContent = "Del servidor local a los informes";
  flow(f, [
    {z:"Red local", t:"SQL Server", s:"El TPV en la oficina", d:"Los datos viven detrás del cortafuegos de la empresa. Power BI Service, que está en la nube, no puede verlos directamente."},
    {z:"Red local", t:"Puerta de enlace", s:"El puente", d:"Software instalado en un equipo de la red que establece una conexión saliente segura con Service. Sin ella, ninguna actualización programada llega a un origen local.", link:"dataflows"},
    {z:"Nube", t:"Flujo de datos", s:"Power Query en la nube", d:"Limpia y prepara Tienda, Producto y Ventas una sola vez. Se actualiza con su propia programación."},
    {z:"Nube", t:"Modelos semánticos", s:"Ventas, Márgenes, Objetivos", d:"Varios modelos leen las mismas tablas del flujo: una única definición de cada dimensión para toda la empresa.", link:"estrella"},
    {z:"Nube", t:"Informes", s:"Lo que ve el negocio", d:"Cada informe se conecta a su modelo. Si el flujo corrige un dato, todos los informes lo heredan en su siguiente actualización.", link:"service"}
  ]);
};

/* ══ 4 · DAX ══ */
VIZ.colmed = function(f){
  f.title.textContent = "Columna calculada frente a medida";
  var t = "Todas";
  var rows = SALES.slice(0, 6);
  f.ctrl.innerHTML = '<span class="vlab">Segmentador Tienda</span>' + seg("t", [["Todas","Todas"]].concat(TIENDAS.map(function(x){ return [x, x]; })), t);
  onSeg(f.ctrl, "t", function(v){ t = v; draw(); });
  var totalTabla = sum(rows);
  function draw(){
    var vis = rows.filter(function(r){ return t === "Todas" || r.tienda === t; });
    f.body.innerHTML = '<div class="tw"><table class="vtbl"><thead><tr><th>Tienda</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n" style="color:var(--accent-ink)">Importe (col. calc.)</th><th class="n" style="color:var(--negative-ink)">TotalTabla = SUM(...) (col. calc.)</th></tr></thead><tbody>' +
      rows.map(function(r){ var on = t === "Todas" || r.tienda === t; return '<tr class="' + (on ? "" : "off") + '"><td>' + r.tienda + '</td><td class="n">' + r.cant + '</td><td class="n">' + nf(r.precio, 2) + '</td><td class="n">' + nf(r.imp, 2) + '</td><td class="n">' + nf(totalTabla, 2) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<div class="vgrid" style="margin-top:14px"><div class="kpi"><div class="kl">Medida: Ventas = SUM(Ventas[Importe])</div><div class="kv">' + eur(sum(vis)) + '</div><div class="ks">Se recalcula con cada filtro (CPU)</div></div><div class="kpi"><div class="kl">Columnas calculadas</div><div class="kv">' + rows.length * 2 + ' celdas</div><div class="ks">Se calcularon al actualizar y ocupan memoria. TotalTabla ni siquiera cambia al filtrar: en una columna no hay contexto de filtro.</div></div></div>';
  }
  draw();
};

VIZ.contexto = function(f){
  f.title.textContent = "El contexto de filtro, celda a celda";
  var st = {anio:"Todos", tienda:"Todas", cat:"Todas", all:false};
  f.ctrl.innerHTML = '<label class="vlab">Año <select class="vsel" data-k="anio"><option>Todos</option><option>2023</option><option>2024</option></select></label>' +
    '<label class="vlab">Tienda <select class="vsel" data-k="tienda"><option>Todas</option>' + TIENDAS.map(function(x){ return "<option>" + x + "</option>"; }).join("") + "</select></label>" +
    '<label class="vlab">Categoría <select class="vsel" data-k="cat"><option>Todas</option>' + CATS.map(function(x){ return "<option>" + x + "</option>"; }).join("") + "</select></label>" +
    '<label class="vlab"><input type="checkbox" data-all> Medida con ALL(Tienda)</label>';
  f.ctrl.querySelectorAll("select").forEach(function(s){ s.addEventListener("change", function(){ st[s.dataset.k] = s.value; draw(); }); });
  f.ctrl.querySelector("[data-all]").addEventListener("change", function(e){ st.all = e.target.checked; draw(); });
  function pass(r, ignoreTienda){ return (st.anio === "Todos" || r.anio === +st.anio) && (ignoreTienda || st.tienda === "Todas" || r.tienda === st.tienda) && (st.cat === "Todas" || r.cat === st.cat); }
  function draw(){
    var vis = SALES.filter(function(r){ return pass(r, false); }), visAll = SALES.filter(function(r){ return pass(r, true); });
    var ctx = []; if(st.anio !== "Todos") ctx.push("Fecha[Año] = " + st.anio); if(st.tienda !== "Todas") ctx.push('Tienda[Tienda] = "' + st.tienda + '"' + (st.all ? "  ← ignorado por ALL(Tienda)" : "")); if(st.cat !== "Todas") ctx.push('Producto[Categoría] = "' + st.cat + '"');
    f.body.innerHTML = '<div class="dax" style="margin-bottom:12px">Contexto de filtro: ' + (ctx.length ? "\n  " + ctx.join("\n  ") : "(ninguno, se ven todas las filas)") + "</div>" +
      '<div class="tw"><table class="vtbl"><thead><tr><th>Año</th><th>Mes</th><th>Tienda</th><th>Categoría</th><th class="n">Importe</th></tr></thead><tbody>' +
      SALES.map(function(r){ var on = pass(r, false), onAll = st.all && pass(r, true); return '<tr class="' + (on ? "cur" : onAll ? "" : "off") + '"><td>' + r.anio + "</td><td>" + r.mes + "</td><td>" + r.tienda + "</td><td>" + r.cat + '</td><td class="n">' + nf(r.imp, 2) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<div class="vgrid" style="margin-top:14px"><div class="kpi"><div class="kl">[Ventas]</div><div class="kv">' + eur(sum(vis)) + '</div><div class="ks">' + vis.length + ' filas iluminadas</div></div>' +
      (st.all ? '<div class="kpi"><div class="kl">CALCULATE([Ventas], ALL(Tienda))</div><div class="kv">' + eur(sum(visAll)) + '</div><div class="ks">Respeta año y categoría; ignora la tienda</div></div><div class="kpi"><div class="kl">% de la tienda</div><div class="kv">' + pct(sum(visAll) ? sum(vis) / sum(visAll) : null) + "</div></div>" : "") + "</div>";
  }
  draw();
};

VIZ.sumx = function(f){
  f.title.textContent = "Así trabaja un iterador";
  var fn = "SUMX", i = -1, timer = null;
  var rows = SALES.slice(0, 6);
  f.ctrl.innerHTML = seg("f", [["SUMX","SUMX"],["MINX","MINX"],["MAXX","MAXX"],["AVERAGEX","AVERAGEX"]], fn, "Función") + ' <button type="button" class="vbtn" data-s>Siguiente fila</button><button type="button" class="vbtn solid" data-a>Ejecutar</button><button type="button" class="vbtn" data-r>Reiniciar</button>';
  onSeg(f.ctrl, "f", function(v){ fn = v; draw(); });
  function stop(){ if(timer){ clearInterval(timer); timer = null; } }
  f.ctrl.querySelector("[data-s]").addEventListener("click", function(){ stop(); if(i < rows.length) i++; draw(); });
  f.ctrl.querySelector("[data-r]").addEventListener("click", function(){ stop(); i = -1; draw(); });
  f.ctrl.querySelector("[data-a]").addEventListener("click", function(){ stop(); i = -1; draw(); timer = setInterval(function(){ i++; draw(); if(i >= rows.length) stop(); }, 650); });
  function agg(v){ if(!v.length) return null; if(fn === "SUMX") return v.reduce(function(a, b){ return a + b; }, 0); if(fn === "MINX") return Math.min.apply(null, v); if(fn === "MAXX") return Math.max.apply(null, v); return v.reduce(function(a, b){ return a + b; }, 0) / v.length; }
  function draw(){
    var done = i >= rows.length, vals = rows.slice(0, Math.min(i + 1, rows.length)).map(function(r){ return r.cant * r.precio; });
    f.body.innerHTML = '<div class="dax" style="margin-bottom:12px">' + fn + " ( Ventas, Ventas[Cantidad] * Ventas[Precio] )</div>" +
      '<div class="tw"><table class="vtbl"><thead><tr><th>Fila</th><th>Tienda</th><th class="n">Cantidad</th><th class="n">Precio</th><th class="n">Columna temporal</th></tr></thead><tbody>' +
      rows.map(function(r, k){ var cls = k === i ? "cur" : (k < i || done ? "done" : ""); return '<tr class="' + cls + '"><td>' + (k + 1) + "</td><td>" + r.tienda + '</td><td class="n">' + r.cant + '</td><td class="n">' + nf(r.precio, 2) + '</td><td class="n tmp">' + (k <= i ? nf(r.cant * r.precio, 2) : "") + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<div class="steps-v" style="margin-top:14px">' + [["Recorre la tabla fila a fila", i >= 0], ["Evalúa la expresión y la guarda en una columna temporal", i >= 0], ["Agrega con " + fn.replace("X", "") + " cuando termina", done], ["Libera la memoria de la columna temporal", done]].map(function(s, k){ return '<div class="step-v ' + (s[1] ? "on" : "") + '"><span class="sn">' + (k + 1) + '</span><span class="st">' + s[0] + "</span></div>"; }).join("") + "</div>" +
      '<div class="kpi" style="margin-top:14px"><div class="kl">Resultado de ' + fn + '</div><div class="kv">' + (done ? eur(agg(vals)) : i < 0 ? "Pulsa Siguiente fila o Ejecutar" : "Calculando… (" + (i + 1) + " de " + rows.length + ")") + "</div></div>";
  }
  draw();
};

VIZ.calculate = function(f){
  f.title.textContent = "CALCULATE paso a paso y el porcentaje del total";
  var mod = "ALLT", anio = "2024", sel = {"Águilas":true, "Cartagena":true, "Mojácar":true}, step = 4;
  f.ctrl.innerHTML = '<span class="vlab">Modificador del denominador</span>' + seg("m", [["NONE","Ninguno"],["ALLT","ALL(Tienda)"],["ALLV","ALL(Ventas)"],["ALLS","ALLSELECTED(Tienda)"]], mod) +
    ' <label class="vlab">Año <select class="vsel" data-y><option>Todos</option><option>2023</option><option selected>2024</option></select></label> <span class="vlab">Tiendas</span>' +
    TIENDAS.map(function(t){ return '<label class="vlab"><input type="checkbox" checked data-t="' + t + '"> ' + t + "</label>"; }).join(" ");
  onSeg(f.ctrl, "m", function(v){ mod = v; draw(); });
  f.ctrl.querySelector("[data-y]").addEventListener("change", function(e){ anio = e.target.value; draw(); });
  f.ctrl.querySelectorAll("[data-t]").forEach(function(c){ c.addEventListener("change", function(){ sel[c.dataset.t] = c.checked; draw(); }); });
  function vt(t, ignoreYear){ return sum(SALES.filter(function(r){ return r.tienda === t && (ignoreYear || anio === "Todos" || r.anio === +anio); })); }
  function draw(){
    var tiendas = TIENDAS.filter(function(t){ return sel[t]; });
    var den = function(t){
      if(mod === "NONE") return vt(t);
      if(mod === "ALLT") return TIENDAS.reduce(function(a, x){ return a + vt(x); }, 0);
      if(mod === "ALLV") return TIENDAS.reduce(function(a, x){ return a + vt(x, true); }, 0);
      return tiendas.reduce(function(a, x){ return a + vt(x); }, 0);
    };
    var S = [
      ["Contexto de filtro actual", "Fila de la matriz: Tienda = ‹fila› · Segmentadores: Año = " + anio + ", Tiendas = " + (tiendas.join(", ") || "ninguna")],
      ["Copia del contexto", "CALCULATE trabaja sobre una copia; el visual no cambia."],
      ["Transición de contexto", "No hay contexto de fila (es una medida en un visual): no se aplica."],
      ["Modificadores", mod === "NONE" ? "Ninguno: el denominador ve lo mismo que el numerador." : mod === "ALLT" ? "ALL(Tienda) quita el filtro de la fila y también el del segmentador de tiendas." : mod === "ALLV" ? "ALL(Ventas) quita todos los filtros que llegan a Ventas, incluido el año." : "ALLSELECTED(Tienda) quita el filtro de la fila pero respeta las tiendas marcadas."],
      ["Filtros explícitos y evaluación", "No hay filtros explícitos: se evalúa [Ventas] con el contexto resultante."]
    ];
    var tot = tiendas.reduce(function(a, x){ return a + vt(x); }, 0);
    f.body.innerHTML = '<div class="vgrid" style="align-items:start"><div><div class="steps-v">' + S.map(function(s, k){ return '<button type="button" class="step-v ' + (k === step ? "on" : k < step ? "done" : "") + '" data-st="' + k + '" style="text-align:left;cursor:pointer"><span class="sn">' + (k + 1) + '</span><span class="st"><b>' + s[0] + "</b>" + s[1] + "</span></button>"; }).join("") + '</div></div><div><div class="tw"><table class="vtbl" style="min-width:0"><thead><tr><th>Tienda</th><th class="n">Ventas</th><th class="n">Denominador</th><th class="n">%</th></tr></thead><tbody>' +
      tiendas.map(function(t){ var v = vt(t), d = den(t); return "<tr><td>" + t + '</td><td class="n">' + nf(v, 2) + '</td><td class="n">' + nf(d, 2) + '</td><td class="n"><b>' + pct(d ? v / d : null) + "</b></td></tr>"; }).join("") +
      '<tr><td><b>Total</b></td><td class="n"><b>' + nf(tot, 2) + '</b></td><td class="n">' + nf(mod === "NONE" ? tot : mod === "ALLS" ? tot : den(TIENDAS[0]), 2) + '</td><td class="n"><b>' + pct((mod === "NONE" || mod === "ALLS") ? (tot ? 1 : null) : (den(TIENDAS[0]) ? tot / den(TIENDAS[0]) : null)) + "</b></td></tr></tbody></table></div>" +
      '<div class="dax" style="margin-top:10px">% = DIVIDE ( [Ventas], CALCULATE ( [Ventas]' + (mod === "NONE" ? "" : ", " + {ALLT:"ALL ( Tienda )", ALLV:"ALL ( Ventas )", ALLS:"ALLSELECTED ( Tienda )"}[mod]) + " ) )</div></div></div>";
  }
  f.body.addEventListener("click", function(e){ var b = e.target.closest("[data-st]"); if(b){ step = +b.dataset.st; draw(); } });
  draw();
};

VIZ["switch"] = function(f){
  f.title.textContent = "SWITCH(TRUE()), variables y DIVIDE";
  var v = 72000, num = 1200, den = 0;
  function draw(){
    var br = v >= 100000 ? 0 : v >= 50000 ? 1 : 2, rate = [0.05, 0.03, 0.01][br];
    var lines = ["VentasComisiones =","VAR _Ventas = SUM ( Ventas[ImporteVenta] )   -- " + nf(v),"RETURN","    SWITCH ( TRUE (),","        _Ventas >= 100000, _Ventas * 0.05,","        _Ventas >= 50000,  _Ventas * 0.03,","        _Ventas * 0.01","    )"];
    var hl = [4, 5, 6][br];
    f.body.innerHTML = '<label class="vlab" style="display:flex;gap:12px;align-items:center;margin-bottom:12px">Ventas del comercial <input type="range" min="0" max="150000" step="1000" value="' + v + '" data-v style="flex:1;max-width:380px"> <b style="color:var(--ink)">' + eur(v, 0) + '</b></label><div class="vgrid" style="align-items:start"><div class="dax">' +
      lines.map(function(l, k){ return '<div style="' + (k === hl ? "background:color-mix(in srgb,var(--lab5) 35%,transparent);border-radius:4px" : k > 3 && k < 7 ? "opacity:.55" : "") + '">' + esc(l) + "</div>"; }).join("") + '</div><div class="kpi"><div class="kl">Comisión (' + nf(rate * 100) + ' %)</div><div class="kv">' + eur(v * rate) + '</div><div class="ks">SWITCH(TRUE()) devuelve la primera condición verdadera, en orden.</div></div></div>' +
      '<div class="vgrid" style="margin-top:16px;align-items:end"><label class="vlab" style="flex-direction:column;align-items:flex-start">Numerador <input type="number" class="vsel" value="' + num + '" data-n></label><label class="vlab" style="flex-direction:column;align-items:flex-start">Denominador <input type="number" class="vsel" value="' + den + '" data-d></label></div>' +
      '<div class="vgrid" style="margin-top:10px"><div class="kpi"><div class="kl">' + esc(num + " / " + den) + '</div><div class="kv" style="color:' + (den === 0 ? "var(--negative-ink)" : "var(--ink)") + '">' + (den === 0 ? (num === 0 ? "NaN" : "Infinito") : nf(num / den, 2)) + '</div><div class="ks">Rompe gráficos y totales</div></div><div class="kpi"><div class="kl">DIVIDE(' + num + ", " + den + ')</div><div class="kv">' + (den === 0 ? "(en blanco)" : nf(num / den, 2)) + '</div><div class="ks">El visual simplemente no pinta ese punto</div></div></div>';
    f.body.querySelector("[data-v]").addEventListener("input", function(e){ v = +e.target.value; draw(); f.body.querySelector("[data-v]").focus(); });
    f.body.querySelector("[data-n]").addEventListener("change", function(e){ num = +e.target.value || 0; draw(); });
    f.body.querySelector("[data-d]").addEventListener("change", function(e){ den = +e.target.value || 0; draw(); });
  }
  draw();
};

VIZ.ti = function(f){
  f.title.textContent = "Inteligencia de tiempo sobre 2024";
  var mode = "py", fiscal = false;
  f.ctrl.innerHTML = seg("m", [["act","Actual"],["py","Año anterior"],["yoy","Variación %"],["ytd","Acumulado anual"],["pm","Mes anterior"]], mode, "Cálculo") + ' <label class="vlab"><input type="checkbox" data-f> Ejercicio fiscal desde septiembre</label>';
  onSeg(f.ctrl, "m", function(v){ mode = v; draw(); });
  f.ctrl.querySelector("[data-f]").addEventListener("change", function(e){ fiscal = e.target.checked; draw(); });
  function draw(){
    var main = S24.slice(), comp = null, lab = "", code = "";
    if(mode === "py"){ comp = S23.slice(); lab = "SAMEPERIODLASTYEAR"; code = "CALCULATE ( [Ventas], SAMEPERIODLASTYEAR ( Fecha[Fecha] ) )"; }
    if(mode === "pm"){ comp = S24.map(function(v, i){ return i ? S24[i - 1] : S23[11]; }); lab = "DATEADD -1 MONTH"; code = "CALCULATE ( [Ventas], DATEADD ( Fecha[Fecha], -1, MONTH ) )"; }
    if(mode === "ytd"){
      /* ejercicio fiscal: de enero a agosto de 2024 arrastra septiembre-diciembre de 2023 y se reinicia en septiembre */
      var acc = fiscal ? S23.slice(8).reduce(function(a, b){ return a + b; }, 0) : 0, accP = 0;
      main = S24.map(function(v, i){ if(fiscal && i === 8) acc = 0; acc += v; return Math.round(acc * 10) / 10; });
      comp = fiscal ? null : S23.map(function(v){ accP += v; return Math.round(accP * 10) / 10; });
      lab = "Acumulado 2023"; code = fiscal ? 'CALCULATE ( [Ventas], DATESYTD ( Fecha[Fecha], "31/08" ) )' : "CALCULATE ( [Ventas], DATESYTD ( Fecha[Fecha] ) )";
    }
    if(mode === "yoy"){ main = S24.map(function(v, i){ return (v - S23[i]) / S23[i]; }); code = "DIVIDE ( [Ventas] - [Ventas PY], [Ventas PY] )"; }
    if(mode === "act") code = "SUM ( Ventas[ImporteVenta] )";
    var W = 640, H = 260, pl = 46, pb = 28, pt = 14, cw = (W - pl - 10) / 12, s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Gráfico mensual de 2024">';
    var vals = main.concat(comp || []), max, min = 0;
    if(mode === "yoy"){ max = Math.max(0.15, Math.max.apply(null, main)); min = Math.min(-0.05, Math.min.apply(null, main)); }
    else { var step = mode === "ytd" ? 200 : 20; max = Math.ceil(Math.max.apply(null, vals) * 1.04 / (step * 4)) * step * 4; }
    function Y(v){ return pt + (max - v) / (max - min) * (H - pt - pb); }
    for(var g = 0; g <= 4; g++){ var gv = min + (max - min) * g / 4; s += '<line x1="' + pl + '" x2="' + (W - 10) + '" y1="' + Y(gv) + '" y2="' + Y(gv) + '" style="stroke:var(--line);stroke-width:1"/><text x="' + (pl - 6) + '" y="' + (Y(gv) + 4) + '" text-anchor="end" style="font-size:10.5px;fill:var(--muted)">' + (mode === "yoy" ? nf(gv * 100) + "%" : nf(gv)) + "</text>"; }
    main.forEach(function(v, i){
      var x = pl + i * cw + cw * 0.18, w = cw * 0.64, y = Y(Math.max(v, 0)), h = Math.abs(Y(v) - Y(0));
      var col = mode === "yoy" ? (v >= 0 ? "var(--lab3)" : "var(--lab4)") : "var(--lab1)";
      s += '<rect x="' + x + '" y="' + (v >= 0 ? y : Y(0)) + '" width="' + w + '" height="' + Math.max(h, 1) + '" rx="3" style="fill:' + col + '"><title>' + MESES[i] + " 2024: " + (mode === "yoy" ? pct(v) : nf(v, 1) + " k€") + "</title></rect>";
      s += '<text x="' + (x + w / 2) + '" y="' + (H - 9) + '" text-anchor="middle" style="font-size:11px;fill:' + (fiscal && mode === "ytd" && i === 8 ? "var(--lab2)" : "var(--muted)") + ";font-weight:" + (fiscal && mode === "ytd" && i === 8 ? 700 : 400) + '">' + MESES[i] + "</text>";
    });
    if(comp){ s += '<polyline points="' + comp.map(function(v, i){ return (pl + i * cw + cw / 2) + "," + Y(v); }).join(" ") + '" style="fill:none;stroke:var(--lab2);stroke-width:2.5"/>' + comp.map(function(v, i){ return '<circle cx="' + (pl + i * cw + cw / 2) + '" cy="' + Y(v) + '" r="3.5" style="fill:var(--lab2)"><title>' + lab + ": " + nf(v, 1) + " k€</title></circle>"; }).join(""); }
    s += "</svg>";
    var tot = S24.reduce(function(a, b){ return a + b; }, 0), totP = S23.reduce(function(a, b){ return a + b; }, 0);
    f.body.innerHTML = s + '<div class="legend"><span><i style="background:' + (mode === "yoy" ? "var(--lab3)" : "var(--lab1)") + '"></i>' + (mode === "yoy" ? "Crecimiento frente a 2023" : mode === "ytd" ? "Acumulado 2024" : "Ventas 2024 (k€)") + "</span>" + (comp ? '<span><i style="background:var(--lab2)"></i>' + lab + "</span>" : "") + (mode === "yoy" ? '<span><i style="background:var(--lab4)"></i>Caída</span>' : "") + '</div><div class="dax" style="margin-top:12px">' + esc(code) + '</div><div class="vgrid" style="margin-top:12px"><div class="kpi"><div class="kl">Ventas 2024</div><div class="kv">' + nf(tot, 1) + ' k€</div></div><div class="kpi"><div class="kl">Ventas 2023</div><div class="kv">' + nf(totP, 1) + ' k€</div></div><div class="kpi"><div class="kl">YoY anual</div><div class="kv">' + pct((tot - totP) / totP) + "</div></div></div>";
  }
  draw();
};

VIZ.grupos = function(f){
  f.title.textContent = "Un elemento de cálculo, cualquier medida";
  var M = {Ventas:{e:"SUM ( Ventas[Importe] )", v:[98, 95.1]}, Margen:{e:"[Ventas] - [Coste]", v:[31.2, 29.4]}, Unidades:{e:"SUM ( Ventas[Cantidad] )", v:[4120, 3980]}};
  var I = {
    Actual:{c:"SELECTEDMEASURE ()", f:function(m){ return m.v[0]; }},
    PY:{c:"CALCULATE ( SELECTEDMEASURE (), SAMEPERIODLASTYEAR ( Fecha[Fecha] ) )", f:function(m){ return m.v[1]; }},
    "YoY %":{c:"VAR _PY = CALCULATE ( SELECTEDMEASURE (), SAMEPERIODLASTYEAR ( Fecha[Fecha] ) )\nRETURN DIVIDE ( SELECTEDMEASURE () - _PY, _PY )", f:function(m){ return (m.v[0] - m.v[1]) / m.v[1]; }, p:true},
    YTD:{c:"CALCULATE ( SELECTEDMEASURE (), DATESYTD ( Fecha[Fecha] ) )", f:function(m){ return m.v[0] * 6.4; }}
  };
  var m = "Ventas", it = "PY", g = 5;
  f.ctrl.innerHTML = '<span class="vlab">Medida</span>' + seg("m", Object.keys(M).map(function(k){ return [k, k]; }), m) + ' <span class="vlab">Elemento</span>' + seg("i", Object.keys(I).map(function(k){ return [k, k]; }), it);
  onSeg(f.ctrl, "m", function(v){ m = v; draw(); });
  onSeg(f.ctrl, "i", function(v){ it = v; draw(); });
  function draw(){
    var mm = M[m], ii = I[it], val = ii.f(mm), unit = m === "Unidades" ? " uds" : " k€";
    var resolved = ii.c.replace(/SELECTEDMEASURE \(\)/g, "[" + m + "]");
    var base = mm.v[0];
    f.body.innerHTML = '<div class="vgrid" style="align-items:start"><div><div class="kl" style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--label);font-weight:600;margin-bottom:6px">Elemento de cálculo «' + it + '»</div><div class="dax">' + esc(ii.c) + '</div><div class="kl" style="font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--label);font-weight:600;margin:12px 0 6px">Lo que evalúa el motor con [' + m + ']</div><div class="dax">' + esc(resolved) + '</div></div><div class="kpi"><div class="kl">' + m + " · " + it + ' · agosto 2024</div><div class="kv">' + (ii.p ? pct(val) : nf(val, m === "Unidades" ? 0 : 1) + unit) + '</div><div class="ks">' + m + " = " + esc(mm.e) + "</div></div></div>" +
      '<div class="kpi" style="margin-top:16px"><div class="kl">Parámetro numérico: ¿y si ' + m.toLowerCase() + ' cambia un…?</div><label class="vlab" style="display:flex;gap:12px;align-items:center;margin-top:8px"><input type="range" min="-20" max="20" step="1" value="' + g + '" data-g style="flex:1;max-width:380px"> <b style="color:var(--ink)">' + (g > 0 ? "+" : "") + g + ' %</b></label><div class="kv" style="margin-top:6px">' + nf(base * (1 + g / 100), m === "Unidades" ? 0 : 1) + unit + '</div><div class="ks">[' + m + " proyectadas] = [" + m + "] * ( 1 + [Valor de Crecimiento] )</div></div>";
    f.body.querySelector("[data-g]").addEventListener("input", function(e){ g = +e.target.value; draw(); f.body.querySelector("[data-g]").focus(); });
  }
  draw();
};

VIZ.window = function(f){
  f.title.textContent = "INDEX, OFFSET y WINDOW sobre una tabla ordenada";
  var P = [["España","P1",120],["España","P2",90],["España","P3",150],["Francia","P4",80],["Francia","P5",110],["Francia","P6",95]];
  var fn = "off", part = true;
  f.ctrl.innerHTML = seg("f", [["off","OFFSET(-1)"],["i1","INDEX(1)"],["il","INDEX(-1)"],["win","WINDOW acumulado"],["mov","WINDOW media móvil 2"]], fn, "Función") + ' <label class="vlab"><input type="checkbox" checked data-p> PARTITIONBY(País)</label>';
  onSeg(f.ctrl, "f", function(v){ fn = v; draw(); });
  f.ctrl.querySelector("[data-p]").addEventListener("change", function(e){ part = e.target.checked; draw(); });
  function draw(){
    var out = P.map(function(r, k){
      var grp = P.map(function(x, j){ return j; }).filter(function(j){ return !part || P[j][0] === r[0]; });
      var pos = grp.indexOf(k);
      if(fn === "off") return pos > 0 ? P[grp[pos - 1]][2] : null;
      if(fn === "i1") return P[grp[0]][2];
      if(fn === "il") return P[grp[grp.length - 1]][2];
      if(fn === "win") return grp.slice(0, pos + 1).reduce(function(a, j){ return a + P[j][2]; }, 0);
      var w = grp.slice(Math.max(0, pos - 1), pos + 1); return w.reduce(function(a, j){ return a + P[j][2]; }, 0) / w.length;
    });
    var code = {off:"OFFSET ( -1, ...", i1:"INDEX ( 1, ...", il:"INDEX ( -1, ...", win:"WINDOW ( 1, ABS, 0, REL, ...", mov:"WINDOW ( -1, REL, 0, REL, ..."}[fn];
    f.body.innerHTML = '<div class="dax" style="margin-bottom:12px">' + esc("CALCULATE ( [Importe], " + code + " ORDERBY ( Pedidos[Pedido] )" + (part ? ", PARTITIONBY ( Pedidos[País] )" : "") + " ) )") + '</div><div class="tw"><table class="vtbl"><thead><tr><th>País</th><th>Pedido</th><th class="n">Importe</th><th class="n" style="color:var(--accent-ink)">Resultado</th></tr></thead><tbody>' +
      P.map(function(r, k){ var newGrp = part && k > 0 && P[k - 1][0] !== r[0]; return "<tr" + (newGrp ? ' style="box-shadow:inset 0 2px 0 var(--accent)"' : "") + "><td>" + r[0] + "</td><td>" + r[1] + '</td><td class="n">' + r[2] + '</td><td class="n" style="background:var(--accent-soft);color:var(--accent-ink);font-weight:600">' + (out[k] === null ? '<span style="color:var(--muted);font-weight:400">(en blanco)</span>' : nf(out[k], fn === "mov" ? 1 : 0)) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<p style="font-size:13.5px;color:var(--muted);margin-top:10px">' + (part ? "La línea azul marca dónde se reinicia la partición." : "Sin partición, Francia continúa la secuencia de España: P4 mira a P3.") + "</p>";
  }
  draw();
};

/* ══ 5 · VISUALIZACIÓN ══ */
VIZ.grafico = function(f){
  f.title.textContent = "La pregunta elige el gráfico";
  var q = "rank", hl = true;
  var V = {"Águilas":[22.5,24.1,19.8,28.3], "Cartagena":[18.2,17.9,21.4,20.6], "Mojácar":[14.6,16.2,15.1,19.4], "Garrucha":[9.8,10.4,11.2,10.1], "Mazarrón":[12.1,11.6,13.9,15.2]};
  var OBJ = {"Águilas":90, "Cartagena":82, "Mojácar":60, "Garrucha":45, "Mazarrón":50};
  var Q = ["T1","T2","T3","T4"], names = Object.keys(V);
  f.ctrl.innerHTML = seg("q", [["evo","Evolución"],["rank","Ranking"],["part","Partes del total"],["obj","Real frente a objetivo"]], q, "Pregunta") + ' <label class="vlab"><input type="checkbox" checked data-h> Destacar Mojácar (color preatentivo)</label>';
  onSeg(f.ctrl, "q", function(v){ q = v; draw(); });
  f.ctrl.querySelector("[data-h]").addEventListener("change", function(e){ hl = e.target.checked; draw(); });
  function col(n, i){ if(hl) return n === "Mojácar" ? "var(--lab2)" : "var(--line-2)"; return ["var(--lab1)","var(--lab2)","var(--lab3)","var(--lab4)","var(--lab5)"][i]; }
  function draw(){
    var W = 600, H = 260, s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Gráfico recomendado">', tip = "";
    var tot = {}; names.forEach(function(n){ tot[n] = V[n].reduce(function(a, b){ return a + b; }, 0); });
    if(q === "rank"){
      var ord = names.slice().sort(function(a, b){ return tot[b] - tot[a]; }), mx = tot[ord[0]];
      ord.forEach(function(n, i){ var y = 20 + i * 46, w = (W - 190) * tot[n] / mx; s += '<text x="100" y="' + (y + 20) + '" text-anchor="end" style="font-size:13px;fill:var(--ink)">' + n + '</text><rect x="110" y="' + y + '" width="' + w + '" height="30" rx="4" style="fill:' + col(n, names.indexOf(n)) + '"/><text x="' + (116 + w) + '" y="' + (y + 20) + '" style="font-size:12px;fill:var(--muted)">' + nf(tot[n], 1) + " k€</text>"; });
      tip = "<b>Barras horizontales ordenadas</b>: el ojo compara longitudes alineadas y lee el ranking de arriba abajo. Los nombres largos caben sin girarlos.";
    } else if(q === "evo"){
      var mx2 = 30; Q.forEach(function(t, i){ s += '<text x="' + (70 + i * 160) + '" y="' + (H - 6) + '" text-anchor="middle" style="font-size:12px;fill:var(--muted)">' + t + "</text>"; });
      [0,10,20,30].forEach(function(g){ var y = 20 + (mx2 - g) / mx2 * (H - 50); s += '<line x1="40" x2="' + (W - 60) + '" y1="' + y + '" y2="' + y + '" style="stroke:var(--line)"/><text x="34" y="' + (y + 4) + '" text-anchor="end" style="font-size:10.5px;fill:var(--muted)">' + g + "</text>"; });
      names.forEach(function(n, k){ var pts = V[n].map(function(v, i){ return (70 + i * 160) + "," + (20 + (mx2 - v) / mx2 * (H - 50)); }); var on = !hl || n === "Mojácar"; s += '<polyline points="' + pts.join(" ") + '" style="fill:none;stroke:' + col(n, k) + ";stroke-width:" + (on ? 3 : 2) + '"/><text x="' + (78 + 3 * 160) + '" y="' + (24 + (mx2 - V[n][3]) / mx2 * (H - 50)) + '" style="font-size:12px;fill:' + (on ? "var(--ink)" : "var(--muted)") + '">' + n + "</text>"; });
      tip = "<b>Líneas</b>: la pendiente cuenta la historia. Con el resaltado, Mojácar destaca sin necesidad de leyenda: etiqueta directa al final de la línea.";
    } else if(q === "part"){
      var T = names.reduce(function(a, n){ return a + tot[n]; }, 0), x = 20;
      names.forEach(function(n, k){ var w = (W - 40) * tot[n] / T; s += '<rect x="' + x + '" y="70" width="' + (w - 2) + '" height="70" style="fill:' + col(n, k) + '"/><text x="' + (x + w / 2) + '" y="160" text-anchor="middle" style="font-size:12px;fill:var(--ink)">' + n + '</text><text x="' + (x + w / 2) + '" y="176" text-anchor="middle" style="font-size:11.5px;fill:var(--muted)">' + pct(tot[n] / T, 0) + "</text>"; x += w; });
      tip = "<b>Barra apilada al 100 %</b> (o barras ordenadas con la medida de ratio): con cinco partes, una tarta obligaría a comparar ángulos. Aquí se comparan longitudes sobre la misma base.";
    } else {
      names.forEach(function(n, i){ var y = 20 + i * 46, mx3 = 100, w = (W - 190) * tot[n] / mx3, wo = (W - 190) * OBJ[n] / mx3, ok = tot[n] >= OBJ[n];
        s += '<text x="100" y="' + (y + 20) + '" text-anchor="end" style="font-size:13px;fill:var(--ink)">' + n + '</text><rect x="110" y="' + (y + 4) + '" width="' + w + '" height="22" rx="3" style="fill:' + (hl ? (n === "Mojácar" ? "var(--lab2)" : "var(--line-2)") : ok ? "var(--lab3)" : "var(--lab4)") + '"/><line x1="' + (110 + wo) + '" x2="' + (110 + wo) + '" y1="' + y + '" y2="' + (y + 30) + '" style="stroke:var(--ink);stroke-width:3"/><text x="' + (118 + Math.max(w, wo)) + '" y="' + (y + 20) + '" style="font-size:12px;fill:var(--muted)">' + pct(tot[n] / OBJ[n] - 1, 0) + "</text>"; });
      tip = "<b>Barras con marca de objetivo</b> (bullet): el real es la barra y el objetivo la línea negra. Verde o rojo según cumplimiento, o un único acento si quieres destacar una tienda.";
    }
    s += "</svg>";
    f.body.innerHTML = s + '<p style="font-size:14.5px;line-height:1.6;margin-top:10px">' + tip + "</p>";
  }
  draw();
};

VIZ.interaccion = function(f){
  f.title.textContent = "Filtrar, resaltar o nada";
  var mode = "res", pick = null;
  f.ctrl.innerHTML = '<span class="vlab">Interacción del anillo sobre las barras</span>' + seg("m", [["fil","Filtrar"],["res","Resaltar"],["none","Ninguno"]], mode);
  onSeg(f.ctrl, "m", function(v){ mode = v; draw(); });
  function draw(){
    var catTot = CATS.map(function(c){ return sum(SALES.filter(function(r){ return r.cat === c; })); }), T = catTot.reduce(function(a, b){ return a + b; }, 0);
    var s1 = '<svg viewBox="0 0 220 220" role="img" aria-label="Anillo por categoría; pulsa una porción">', a0 = -Math.PI / 2, colors = ["var(--lab1)","var(--lab3)","var(--lab5)"];
    CATS.forEach(function(c, i){
      var a1 = a0 + catTot[i] / T * 2 * Math.PI, r = 90, ri = 52, cx = 110, cy = 110, lg = a1 - a0 > Math.PI ? 1 : 0;
      var d = "M" + (cx + r * Math.cos(a0)) + " " + (cy + r * Math.sin(a0)) + " A" + r + " " + r + " 0 " + lg + " 1 " + (cx + r * Math.cos(a1)) + " " + (cy + r * Math.sin(a1)) + " L" + (cx + ri * Math.cos(a1)) + " " + (cy + ri * Math.sin(a1)) + " A" + ri + " " + ri + " 0 " + lg + " 0 " + (cx + ri * Math.cos(a0)) + " " + (cy + ri * Math.sin(a0)) + "Z";
      s1 += '<path d="' + d + '" data-c="' + c + '" role="button" tabindex="0" aria-label="' + c + '" style="cursor:pointer;fill:' + colors[i] + ";opacity:" + (!pick || pick === c ? 1 : .3) + ';stroke:var(--card);stroke-width:2"/>';
      var am = (a0 + a1) / 2; s1 += '<text x="' + (110 + 72 * Math.cos(am)) + '" y="' + (114 + 72 * Math.sin(am)) + '" text-anchor="middle" style="font-size:11px;font-weight:600;fill:var(--on-accent);pointer-events:none">' + c + "</text>";
      a0 = a1;
    });
    s1 += '<text x="110" y="114" text-anchor="middle" style="font-size:12px;fill:var(--muted)">' + (pick || "Todas") + "</text></svg>";
    var W = 380, s2 = '<svg viewBox="0 0 ' + W + ' 220" role="img" aria-label="Barras por tienda">', mx = Math.max.apply(null, TIENDAS.map(function(t){ return sum(SALES.filter(function(r){ return r.tienda === t; })); }));
    TIENDAS.forEach(function(t, i){
      var all = sum(SALES.filter(function(r){ return r.tienda === t; })), part = pick ? sum(SALES.filter(function(r){ return r.tienda === t && r.cat === pick; })) : all;
      var y = 30 + i * 60, sc = W - 150, base = mode === "fil" && pick ? part : all;
      var mxx = mode === "fil" && pick ? Math.max.apply(null, TIENDAS.map(function(tt){ return sum(SALES.filter(function(r){ return r.tienda === tt && r.cat === pick; })); })) || 1 : mx;
      s2 += '<text x="86" y="' + (y + 22) + '" text-anchor="end" style="font-size:13px;fill:var(--ink)">' + t + "</text>";
      if(mode === "res" && pick){ s2 += '<rect x="96" y="' + y + '" width="' + (sc * all / mx) + '" height="32" rx="4" style="fill:var(--lab1);opacity:.25"/><rect x="96" y="' + y + '" width="' + (sc * part / mx) + '" height="32" rx="4" style="fill:var(--lab1)"/>'; s2 += '<text x="' + (102 + sc * all / mx) + '" y="' + (y + 21) + '" style="font-size:11.5px;fill:var(--muted)">' + nf(part, 1) + " de " + nf(all, 1) + "</text>"; }
      else { s2 += '<rect x="96" y="' + y + '" width="' + (sc * base / mxx) + '" height="32" rx="4" style="fill:var(--lab1)"/><text x="' + (102 + sc * base / mxx) + '" y="' + (y + 21) + '" style="font-size:11.5px;fill:var(--muted)">' + nf(base, 1) + " €</text>"; }
    });
    s2 += "</svg>";
    var msg = !pick ? "Pulsa una porción del anillo." : mode === "fil" ? "<b>Filtrar</b>: las barras solo muestran " + pick + " y se reescalan. Pierdes la referencia del total de cada tienda." : mode === "res" ? "<b>Resaltar</b>: ves la parte de " + pick + " sobre el total de cada tienda. Útil cuando la proporción importa." : "<b>Ninguno</b>: el anillo no afecta a las barras. Úsalo cuando los visuales responden a preguntas distintas.";
    f.body.innerHTML = '<div class="vgrid" style="align-items:center"><div style="max-width:260px">' + s1 + "</div><div>" + s2 + '</div></div><p style="font-size:14.5px;margin-top:8px">' + msg + (pick ? ' <button type="button" class="vbtn" data-clear>Quitar selección</button>' : "") + "</p>";
  }
  f.body.addEventListener("click", function(e){ var p = e.target.closest("[data-c]"); if(p){ pick = pick === p.dataset.c ? null : p.dataset.c; draw(); return; } if(e.target.closest("[data-clear]")){ pick = null; draw(); } });
  f.body.addEventListener("keydown", function(e){ var p = e.target.closest("[data-c]"); if(p && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); pick = pick === p.dataset.c ? null : p.dataset.c; draw(); } });
  draw();
};

VIZ.layout = function(f){
  f.title.textContent = "Jerarquía visual de una página";
  var pat = "z", aud = "dir";
  f.ctrl.innerHTML = '<span class="vlab">Patrón de lectura</span>' + seg("p", [["z","Z"],["f","F"]], pat) + ' <span class="vlab">Audiencia</span>' + seg("a", [["dir","Directivo"],["op","Operativo"]], aud);
  onSeg(f.ctrl, "p", function(v){ pat = v; draw(); });
  onSeg(f.ctrl, "a", function(v){ aud = v; draw(); });
  function draw(){
    var W = 640, H = 360, s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Boceto de página con patrón de lectura">';
    var Z = [
      {x:20,y:20,w:600,h:24,t:"Título y filtros",l:0},
      {x:20,y:56,w:140,h:70,t:"KPI ventas",l:1},{x:173,y:56,w:140,h:70,t:"KPI margen",l:1},{x:326,y:56,w:140,h:70,t:"KPI objetivo",l:1},{x:479,y:56,w:141,h:70,t:"KPI ticket",l:1},
      {x:20,y:138,w:380,h:110,t:"Evolución mensual",l:2},{x:412,y:138,w:208,h:110,t:"Por tienda",l:3},
      {x:20,y:260,w:600,h:80,t:"Detalle (tabla)",l:4}
    ];
    var dirFocus = aud === "dir" ? [0,1,2] : [0,1,2,3,4];
    Z.forEach(function(z){ var on = dirFocus.indexOf(z.l) > -1; s += '<rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" rx="8" style="fill:' + (z.l === 1 ? "var(--accent-soft)" : "var(--card-2)") + ";stroke:var(--line-2);opacity:" + (on ? 1 : .35) + '"/><text x="' + (z.x + 10) + '" y="' + (z.y + 17) + '" style="font-size:11.5px;font-weight:600;fill:var(--ink);opacity:' + (on ? 1 : .5) + '">' + z.t + "</text>"; });
    var path = pat === "z" ? "M30 70 L600 70 L40 300 L600 300" : "M30 70 L600 70 M30 70 L30 190 L380 190 M30 190 L30 300 L250 300";
    s += '<path d="' + path + '" style="fill:none;stroke:var(--lab2);stroke-width:3;stroke-dasharray:8 6;opacity:.9"/>';
    var nums = pat === "z" ? [[30,70],[600,70],[40,300],[600,300]] : [[30,70],[600,70],[380,190],[250,300]];
    nums.forEach(function(p, i){ s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="11" style="fill:var(--lab2)"/><text x="' + p[0] + '" y="' + (p[1] + 4) + '" text-anchor="middle" style="font-size:11px;font-weight:700;fill:#fff">' + (i + 1) + "</text>"; });
    s += "</svg>";
    var t = aud === "dir" ? "<b>Directivo</b>: lee el título y los KPI, mira la tendencia y decide si hace falta investigar. Todo lo que está atenuado podría ir en otra página." : "<b>Operativo</b>: recorre toda la página y termina en la tabla de detalle, donde actúa. Necesita filtros y obtener detalles.";
    f.body.innerHTML = s + '<p style="font-size:14.5px;line-height:1.6;margin-top:10px">Patrón en ' + pat.toUpperCase() + ": el ojo empieza arriba a la izquierda. " + t + "</p>";
  }
  draw();
};

/* ══ 6 · SERVICE ══ */
VIZ.service = function(f){
  f.title.textContent = "Del .pbix al usuario final";
  var ws = 1, app = 1, data = "08:00";
  function draw(){
    var nodes = [
      {t:"Power BI Desktop", s:"Ventas.pbix", d:"Donde se desarrolla todo. Al publicar se generan dos elementos en el área de trabajo."},
      {t:"Área de trabajo", s:"Modelo semántico + informe v" + ws, d:"El equipo ve los cambios al instante. Aquí se programa la actualización del modelo (última: " + data + ")."},
      {t:"Aplicación", s:"Publicada v" + app, d:"Lo que ven los usuarios. Solo cambia cuando un Administrador o Miembro pulsa Actualizar la aplicación."},
      {t:"Usuarios", s:"Audiencias", d:"Cada audiencia ve las páginas que decidas. Los datos nuevos llegan con cada actualización del modelo, sin necesidad de actualizar la app."}
    ];
    var h = '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:stretch">';
    nodes.forEach(function(n, i){ if(i) h += '<div aria-hidden="true" style="display:grid;place-items:center;color:var(--muted)">→</div>'; var warn = i === 2 && app < ws; h += '<div class="kpi" style="flex:1 1 150px;' + (warn ? "outline:1.5px solid var(--support)" : "") + '"><div class="kl">' + n.t + '</div><div style="font-weight:600;color:var(--ink);margin-top:4px">' + n.s + '</div><div style="font-size:12.5px;line-height:1.5;margin-top:4px">' + n.d + "</div></div>"; });
    h += '</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button type="button" class="vbtn" data-pub>Republicar informe corregido</button><button type="button" class="vbtn" data-ref>Actualizar el modelo (datos)</button><button type="button" class="vbtn solid" data-app>Actualizar la aplicación</button></div>';
    h += '<p style="font-size:14px;margin-top:10px;color:' + (app < ws ? "var(--support-ink)" : "var(--muted)") + '">' + (app < ws ? "El área de trabajo tiene la v" + ws + " pero los usuarios siguen en la v" + app + ": falta actualizar la aplicación." : "Área de trabajo y aplicación están sincronizadas.") + "</p>";
    f.body.innerHTML = h;
  }
  f.body.addEventListener("click", function(e){
    if(e.target.closest("[data-pub]")) ws++;
    else if(e.target.closest("[data-app]")) app = ws;
    else if(e.target.closest("[data-ref]")){ var d = new Date(); data = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
    else return;
    draw();
  });
  draw();
};

VIZ.roles = function(f){
  f.title.textContent = "¿Qué puede hacer cada rol?";
  var A = [
    ["Ver informes y paneles e interactuar", [1,1,1,1,1]],
    ["Analizar en Excel / crear informes sobre el modelo", [0,1,1,1,1]],
    ["Publicar desde Desktop, editar y eliminar contenido", [0,1,1,1,0]],
    ["Programar la actualización de datos", [0,1,1,1,0]],
    ["Añadir usuarios con permisos iguales o inferiores", [0,0,1,1,0]],
    ["Publicar o actualizar la aplicación", [0,2,1,1,0]],
    ["Eliminar el área de trabajo y gestionar administradores", [0,0,0,1,0]],
    ["Ver todas las filas aunque haya RLS", [0,1,1,1,0]]
  ];
  var R = ["Visor","Colaborador","Miembro","Administrador","Compilación (sin área)"], r = 0;
  f.ctrl.innerHTML = seg("r", R.map(function(x, i){ return [i, x]; }), r, "Rol");
  onSeg(f.ctrl, "r", function(v){ r = +v; draw(); });
  function draw(){
    f.body.innerHTML = '<ul style="list-style:none;display:flex;flex-direction:column;gap:6px">' + A.map(function(a){ var v = a[1][r]; return '<li style="display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:9px;background:' + (v === 1 ? "var(--positive-soft)" : v === 2 ? "var(--support-soft)" : "var(--card-2)") + '"><span style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;flex:none;background:var(--card);color:' + (v === 1 ? "var(--positive-ink)" : v === 2 ? "var(--support-ink)" : "var(--muted)") + '">' + (v === 1 ? "✓" : v === 2 ? "!" : "×") + '</span><span style="font-size:14px;color:' + (v ? "var(--ink)" : "var(--muted)") + '">' + a[0] + (v === 2 ? " (solo si el administrador lo permite)" : "") + "</span></li>"; }).join("") + "</ul>" +
      (r === 4 ? '<p style="font-size:13.5px;margin-top:10px;color:var(--muted)">Permiso de compilación sobre el modelo semántico: el usuario no ve el área de trabajo, pero encuentra el modelo en el catálogo de OneLake y crea sus informes con conexión dinámica.</p>' : "");
  }
  draw();
};

VIZ.rls = function(f){
  f.title.textContent = "Simulador de seguridad a nivel de fila";
  var D = [["Europa","Rojo",1200],["Europa","Azul",900],["Pacífico","Rojo",700],["Pacífico","Azul",1500],["América","Rojo",1100],["América","Azul",650]];
  var U = {
    "ana@tiendas.es":{rol:"Europa", reg:["Europa"], col:null},
    "luis@tiendas.es":{rol:"Pacífico-Azul", reg:["Pacífico"], col:"Azul"},
    "marta@tiendas.es":{rol:"Todo", reg:null, col:null}
  };
  var PERM = [["ana@tiendas.es","Europa"],["luis@tiendas.es","Pacífico"],["marta@tiendas.es","Europa"],["marta@tiendas.es","América"]];
  var u = "ana@tiendas.es", mode = "est";
  f.ctrl.innerHTML = '<span class="vlab">Usuario</span>' + seg("u", Object.keys(U).map(function(k){ return [k, k.split("@")[0]]; }), u) + ' <span class="vlab">RLS</span>' + seg("m", [["est","Estática (roles)"],["din","Dinámica (tabla de permisos)"]], mode);
  onSeg(f.ctrl, "u", function(v){ u = v; draw(); });
  onSeg(f.ctrl, "m", function(v){ mode = v; draw(); });
  function draw(){
    var vis, rule;
    if(mode === "est"){
      var cfg = U[u];
      vis = D.filter(function(r){ return (!cfg.reg || cfg.reg.indexOf(r[0]) > -1) && (!cfg.col || r[1] === cfg.col); });
      rule = "Rol «" + cfg.rol + "»:\n" + (cfg.reg ? '  Geografia: [Region] = "' + cfg.reg[0] + '"' : "  (sin filtros: acceso a todo)") + (cfg.col ? '\n  Producto:  [Color] = "' + cfg.col + '"' : "");
    } else {
      var regs = PERM.filter(function(p){ return p[0] === u; }).map(function(p){ return p[1]; });
      vis = D.filter(function(r){ return regs.indexOf(r[0]) > -1; });
      rule = 'Rol «Dinámico» (el mismo para todos):\n  Permisos: [Email] = USERPRINCIPALNAME ()\n  USERPRINCIPALNAME () = "' + u + '" → ' + regs.join(", ");
    }
    f.body.innerHTML = '<div class="dax" style="margin-bottom:12px">' + esc(rule) + '</div><div class="vgrid" style="align-items:start"><div class="tw"><table class="vtbl" style="min-width:0"><thead><tr><th>Región</th><th>Color</th><th class="n">Ventas</th></tr></thead><tbody>' +
      D.map(function(r){ var on = vis.indexOf(r) > -1; return '<tr class="' + (on ? "cur" : "off") + '"><td>' + r[0] + "</td><td>" + r[1] + '</td><td class="n">' + nf(r[2]) + "</td></tr>"; }).join("") + '</tbody></table></div><div class="kpi"><div class="kl">Total que ve ' + u.split("@")[0] + '</div><div class="kv">' + nf(sum(vis, function(r){ return r[2]; })) + ' €</div><div class="ks">' + vis.length + " de " + D.length + " filas · El total se calcula solo sobre las filas permitidas</div></div></div>" +
      (mode === "din" ? '<p style="font-size:13.5px;color:var(--muted);margin-top:10px">Tabla Permisos: ' + PERM.map(function(p){ return p[0].split("@")[0] + " → " + p[1]; }).join(" · ") + ". Dar acceso a otra región es añadir una fila, sin republicar el modelo.</p>" : "");
  }
  draw();
};

VIZ.git = function(f){
  f.title.textContent = "Ramas, commits y fusión";
  var main = [{id:"a1f3c9e", m:"Primera versión"}], dev = [], log = ["git init · git commit -m \"Primera versión\""], n = 0;
  var MSG = ["Añade medida de margen","Cambia colores del tema","Corrige total de objetivos","Nueva página de tiendas"];
  function hash(){ return Math.random().toString(16).slice(2, 9); }
  function draw(){
    var W = Math.max(640, 160 + (main.length + dev.length) * 70), H = 170, s = '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" role="img" aria-label="Diagrama de ramas main y desarrollo" style="max-width:none">';
    s += '<text x="10" y="54" style="font-size:12px;font-weight:600;fill:var(--ink)">main</text><text x="10" y="134" style="font-size:12px;font-weight:600;fill:var(--ink)">desarrollo</text>';
    s += '<line x1="90" x2="' + (W - 20) + '" y1="50" y2="50" style="stroke:var(--line-2);stroke-width:2"/>';
    if(dev.length) s += '<line x1="90" x2="' + (W - 20) + '" y1="130" y2="130" style="stroke:var(--line-2);stroke-width:2;stroke-dasharray:5 5"/>';
    var order = main.concat(dev).sort(function(a, b){ return (a.t || 0) - (b.t || 0); });
    order.forEach(function(c, i){ var x = 110 + i * 70, lane = dev.indexOf(c) > -1 ? 1 : 0, y = lane ? 130 : 50; c.x = x; c.y = y;
      if(c.mergeFrom){ s += '<line x1="' + c.mergeFrom.x + '" y1="' + c.mergeFrom.y + '" x2="' + x + '" y2="' + y + '" style="stroke:var(--lab2);stroke-width:2"/>'; }
      s += '<circle cx="' + x + '" cy="' + y + '" r="10" style="fill:' + (c.revert ? "var(--lab4)" : c.mergeFrom ? "var(--lab2)" : lane ? "var(--lab3)" : "var(--lab1)") + '"><title>' + c.id + " " + c.m + '</title></circle><text x="' + x + '" y="' + (y + (lane ? 28 : -16)) + '" text-anchor="middle" style="font-size:10px;font-family:var(--mono);fill:var(--muted)">' + c.id + "</text>";
    });
    s += "</svg>";
    f.body.innerHTML = '<div class="tw">' + s + '</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button type="button" class="vbtn" data-c>Commit en desarrollo</button><button type="button" class="vbtn solid" data-m' + (dev.some(function(c){ return !c.merged; }) ? "" : " disabled") + '>Merge a main</button><button type="button" class="vbtn" data-r' + (main.length > 1 ? "" : " disabled") + '>Revertir último commit de main</button></div><div class="dax">' + log.slice(-6).map(esc).join("\n") + "</div>";
  }
  var t = 1; main[0].t = 0;
  f.body.addEventListener("click", function(e){
    if(e.target.closest("[data-c]")){ var c = {id:hash(), m:MSG[n % MSG.length], t:t++}; n++; dev.push(c); log.push("git checkout desarrollo · git commit -m \"" + c.m + "\" → " + c.id); }
    else if(e.target.closest("[data-m]")){ var last = dev[dev.length - 1]; if(!last) return; var mc = {id:hash(), m:"Merge desarrollo", t:t++, mergeFrom:last}; dev.forEach(function(d){ d.merged = true; }); main.push(mc); log.push("git checkout main · git merge desarrollo → " + mc.id); }
    else if(e.target.closest("[data-r]")){ var prev = main[main.length - 1]; var rc = {id:hash(), m:"Revert " + prev.id, t:t++, revert:true}; main.push(rc); log.push("git revert " + prev.id + " → " + rc.id + " (main vuelve al estado anterior)"); }
    else return;
    draw();
  });
  draw();
};

})();
