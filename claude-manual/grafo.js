/* ══════════════════════════════════════════════════════════════
   Grafo del conocimiento: lógica pura (sin DOM), compartida por la ficha, el mapa y las comprobaciones.
   Entrada: los datos de content.js y temas/*.js (TOPICS, BLOCKS, COURSES, RELTYPES).
   Las relaciones salen SOLO de TOPICS[].rel y de TOPICS[].src[].c: no hay un segundo mapa que mantener.
   Módulo ES: lo importan el módulo del área privada (import()) y las comprobaciones de Node.
   ══════════════════════════════════════════════════════════════ */
"use strict";

var MAX_ALL = 40;      // hasta aquí el mapa muestra todos los temas; por encima, las ramas parten plegadas
var MAX_FAN = 2.4;     // ángulo máximo (rad, unos 137°) del abanico de temas de un bloque

function build(D){
  var T = D.TOPICS, B = D.BLOCKS, C = D.COURSES || [], R = D.RELTYPES;
  var topic = {}, block = {}, course = {}, out = {}, inn = {}, edges = [], ct = {};
  T.forEach(function(t, i){ t.i = i; topic[t.id] = t; out[t.id] = []; inn[t.id] = []; });
  B.forEach(function(b){ block[b.id] = b; });
  C.forEach(function(c){ course[c.id] = c; ct[c.id] = []; });
  T.forEach(function(t){
    (t.rel || []).forEach(function(r){
      if(!topic[r.a] || !R[r.t]) return;
      var e = {t:r.t, from:t.id, to:r.a, w:r.w || ""};
      edges.push(e); out[t.id].push(e); inn[r.a].push(e);
    });
    (t.src || []).forEach(function(s){
      if(s && typeof s === "object" && s.c && ct[s.c] && ct[s.c].indexOf(t.id) < 0) ct[s.c].push(t.id);
    });
  });

  function prereqs(id){ return (out[id] || []).filter(function(e){ return e.t === "necesita"; }).map(function(e){ return e.to; }); }
  function dependents(id){ return (inn[id] || []).filter(function(e){ return e.t === "necesita"; }).map(function(e){ return e.from; }); }

  /* Prerrequisitos transitivos en orden de estudio (los más básicos primero). Tolera ciclos. */
  function route(id){
    var done = {}, onst = {}, res = [];
    (function visit(x){
      if(done[x] || onst[x]) return;
      onst[x] = 1; prereqs(x).forEach(visit); onst[x] = 0; done[x] = 1;
      if(x !== id) res.push(x);
    })(id);
    return res;
  }

  /* Ciclos en «necesita conocer»: devuelve los ids que forman parte de alguno. */
  function cycles(){
    var color = {}, bad = {};
    function dfs(x, path){
      color[x] = 1; path.push(x);
      prereqs(x).forEach(function(p){
        if(color[p] === 1){ path.slice(path.indexOf(p)).forEach(function(q){ bad[q] = 1; }); }
        else if(!color[p]) dfs(p, path);
      });
      path.pop(); color[x] = 2;
    }
    T.forEach(function(t){ if(!color[t.id]) dfs(t.id, []); });
    return Object.keys(bad);
  }

  /* Relaciones de un tema agrupadas para mostrarlas: [{k, label, items:[{id, w}]}] (las simétricas, sin duplicar) */
  function groups(id){
    var g = [];
    Object.keys(R).forEach(function(k){
      var rt = R[k];
      var fwd = out[id].filter(function(e){ return e.t === k; }).map(function(e){ return {id:e.to, w:e.w}; });
      var back = inn[id].filter(function(e){ return e.t === k; }).map(function(e){ return {id:e.from, w:e.w}; });
      if(rt.s){
        var seen = {}, all = fwd.concat(back).filter(function(x){ return seen[x.id] ? false : (seen[x.id] = 1); });
        if(all.length) g.push({k:k, label:rt.l, items:all});
      }else{
        if(fwd.length) g.push({k:k, dir:"out", label:rt.l, items:fwd});
        if(back.length) g.push({k:k, dir:"in", label:rt.i, items:back});
      }
    });
    return g;
  }

  /* Cursos (con título) a los que remiten las fuentes de un tema */
  function coursesOf(id){
    var res = [];
    (topic[id].src || []).forEach(function(s){ if(s && typeof s === "object" && s.c && course[s.c] && res.indexOf(s.c) < 0) res.push(s.c); });
    return res;
  }

  return {topics:T, blocks:B, courses:C, types:R, topic:topic, block:block, course:course, out:out, inn:inn, edges:edges,
    courseTopics:ct, prereqs:prereqs, dependents:dependents, route:route, cycles:cycles, groups:groups, coursesOf:coursesOf,
    degree:function(id){ return (out[id] ? out[id].length : 0) + (inn[id] ? inn[id].length : 0); }};
}

/* Ramas desplegadas por defecto: todas si el manual es pequeño; ninguna (se abren al pulsarlas) si es grande */
function defaultExpanded(G){
  var ex = {};
  if(G.topics.length <= MAX_ALL) G.blocks.forEach(function(b){ ex[b.id] = true; });
  return ex;
}

/* Posiciones del mapa. Radial y determinista: centro → bloques (anillo) → temas (anillos por sector) → cursos (anillo exterior).
   opt.expanded: {bloque: true} = ramas con los temas visibles (por defecto, defaultExpanded). */
function layout(G, opt){
  opt = opt || {};
  var ex = opt.expanded || defaultExpanded(G), pos = {center:{x:0, y:0}};
  var nB = G.blocks.length, GAP_B = 150, R0 = 120, RING = 74, SPACING = 124;
  var RB = Math.max(150, nB * GAP_B / (2 * Math.PI));
  var counts = G.blocks.map(function(b){ return G.topics.filter(function(t){ return t.b === b.id; }); });
  var weights = counts.map(function(ts){ return 1.4 + Math.sqrt(ts.length); });
  var tot = weights.reduce(function(a, b){ return a + b; }, 0), a = 0, maxR = RB;
  G.blocks.forEach(function(b, bi){
    var span = Math.PI * 2 * weights[bi] / tot;
    if(bi === 0) a = -Math.PI / 2 - span / 2;
    var mid = a + span / 2;
    pos[b.id] = {x:RB * Math.cos(mid), y:RB * Math.sin(mid), a:mid, r:RB};
    if(ex[b.id]){
      var ts = counts[bi], idx = 0, ring = 0, usable = Math.min(span * 0.9, MAX_FAN);   // un bloque solo no rodea el centro: abanico junto a su rama
      while(idx < ts.length){
        var r = RB + R0 + ring * RING, cap = Math.max(1, Math.floor(r * usable / SPACING)), take = Math.min(cap, ts.length - idx);
        for(var k = 0; k < take; k++){
          var ang = mid + ((k + 0.5) / take - 0.5) * usable;
          pos[ts[idx + k].id] = {x:r * Math.cos(ang), y:r * Math.sin(ang), a:ang, r:r};
        }
        idx += take; ring++; maxR = Math.max(maxR, r);
      }
    }
    a += span;
  });
  /* cursos: anillo exterior, en el ángulo medio de sus temas visibles */
  var RC = maxR + 120, list = [];
  G.courses.forEach(function(c, ci){
    var xs = 0, ys = 0, n = 0;
    (G.courseTopics[c.id] || []).forEach(function(id){ if(pos[id]){ xs += Math.cos(pos[id].a); ys += Math.sin(pos[id].a); n++; } });
    list.push({id:c.id, a:n ? Math.atan2(ys, xs) : -Math.PI / 2 + ci * 0.5});
  });
  list.sort(function(p, q){ return p.a - q.a; });
  var gap = 120 / RC;
  for(var i = 1; i < list.length; i++) if(list[i].a - list[i - 1].a < gap) list[i].a = list[i - 1].a + gap;
  list.forEach(function(c){ pos[c.id] = {x:RC * Math.cos(c.a), y:RC * Math.sin(c.a), a:c.a, r:RC}; });
  var minx = 0, miny = 0, maxx = 0, maxy = 0;
  Object.keys(pos).forEach(function(k){ var p = pos[k]; minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); });
  var pad = 110;
  return {pos:pos, bounds:{x:minx - pad, y:miny - pad, w:maxx - minx + 2 * pad, h:maxy - miny + 2 * pad}, expanded:ex};
}

export { build, layout, defaultExpanded, MAX_ALL };
