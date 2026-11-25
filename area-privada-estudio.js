/* ═══════════════════════════════════════════════
   area-privada-estudio.js: «Manual de estudio» dentro del área privada (#/estudio, desde Portfolio)
   ─────────────────────────────────────────────────
   Manual de libro: cada capítulo con su texto completo y recuadros «En sencillo», más indicadores y glosario.
   Solo el MOTOR es público. El contenido (título incluido) vive en la tabla public.me_docs de Supabase
   (supabase/manual-estudio.sql, RLS) y se lee tras iniciar sesión. Se publica con tools/manual-estudio/publish.mjs
   desde una carpeta local que no está en el repositorio.
   · Rutas (arg del módulo): «» inicio · temas · indicadores · indicadores/<id> · glosario · tema/<id> · tema/<id>/<ancla>.
   · Se pinta dentro de un Shadow DOM con css/claude-manual.css (sistema de diseño de los manuales) y css/manual-estudio.css.
   · CSP estricta: sin atributos style ni scripts en línea (los anchos de las barras van por CSSOM).
   · Todo el HTML del contenido pasa por clean() (lista blanca de etiquetas, atributos y enlaces).
   · Progreso y tema claro/oscuro: localStorage (bm_me_*).
   ═══════════════════════════════════════════════ */
window.APEstudio = (function () {
  'use strict';

  var P = 'bm_me_', TTL = 5 * 60 * 1000;
  var ctx = null, cache = null, D = null;
  var host = null, root = null, lastArg = null;
  var PROG = {};
  var temasState = { q: '' }, glosState = { q: '', f: '' }, indState = { q: '', f: '', m: 'fichas' };
  var tocObs = null, qk = null, qkSel = 0, qkRes = [], qkPrev = null, listening = false;
  var nf = new Intl.NumberFormat('es-ES');

  /* ── utilidades ── */
  function $(s, r) { return (r || root).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function plain(h) { return String(h == null ? '' : h).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
  function nb(s) { return String(s).replace(/(\d) (%|€|km\b|h\b|min\b)/g, '$1&nbsp;$2'); }
  function R(path) { return '#/estudio' + (path ? '/' + path : ''); }
  function NUM(t) { return t.lab || t.num; }   // etiqueta visible del capítulo («11.A»); num solo ordena
  function lsGet(k, d) { try { var v = localStorage.getItem(P + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: funciona igual, sin recordar */ } }
  function assetUrl(name, fallback) {
    var l = document.querySelector('link[data-ap-asset="' + name + '"]');
    return new URL(l ? l.getAttribute('href') : fallback, document.baseURI).href;
  }
  function setProg(id, v) { if ((PROG[id] || 0) >= v && v !== 0) return; PROG[id] = v; lsSet('prog', PROG); }
  function setWidths(el) { $$('[data-w]', el).forEach(function (n) { n.style.width = n.getAttribute('data-w') + '%'; }); }   // CSSOM: la CSP no admite atributos de estilo
  function dot(id) { var p = PROG[id] || 0; return '<span class="td ' + (p ? 's' + p : '') + '" title="' + (p === 2 ? 'Entendido' : p === 1 ? 'En estudio' : 'Pendiente') + '"></span>'; }

  /* ── Marcas y notas, barra fija, botón de subir, visor de explicaciones y visor de redes con mapa base
     (mismo código que estudio.js del manual local; se pinta dentro del Shadow DOM) ── */
  var Marcas = (function () {

  var KEY = "", chap = "", root = null, notesBtn = null, countEl = null;
  var recs = [], cur = null, pend = null, noteOpen = false, panelOpen = false, saved = true;
  var card = null, panel = null, mounted = false, timer = null, raf = 0, selTimer = null, HOST = null;
  var MAXQ = 3000;

  function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function find(id){ for(var i = 0; i < recs.length; i++) if(recs[i].id === id) return recs[i]; return null; }
  function small(){ return window.matchMedia("(max-width:720px)").matches; }

  /* ── selección (también dentro de un Shadow DOM) ── */
  function shadowOf(){ var rn = root && root.getRootNode ? root.getRootNode() : null; return rn && rn.host ? rn : null; }
  function currentRange(){
    var sh = shadowOf(), s;
    if(sh && typeof sh.getSelection === "function") s = sh.getSelection();
    else s = window.getSelection();
    if(!s) return null;
    if(sh && typeof sh.getSelection !== "function" && typeof s.getComposedRanges === "function"){
      var sr = s.getComposedRanges({shadowRoots:[sh]})[0];
      if(!sr || sr.collapsed) return null;
      var r = document.createRange(); r.setStart(sr.startContainer, sr.startOffset); r.setEnd(sr.endContainer, sr.endOffset); return r;
    }
    if(!s.rangeCount || s.isCollapsed) return null;
    return s.getRangeAt(0);
  }
  function clearSelection(){
    try{ var sh = shadowOf(); (sh && typeof sh.getSelection === "function" ? sh.getSelection() : window.getSelection()).removeAllRanges(); }catch(e){}
  }

  /* ── persistencia ── */
  function readAll(){ try{ return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }catch(e){ return {}; } }
  function persist(){
    try{
      var all = readAll();
      var keep = recs.filter(function(r){ return r.hl || r.b || r.i || r.u || plainNote(r.note); }).map(function(r){ return {id:r.id, s:r.s, q:r.q, p:r.p, n:r.n, hl:r.hl, b:r.b, i:r.i, u:r.u, note:r.note, t:r.t}; });
      if(keep.length) all[chap] = keep; else delete all[chap];
      localStorage.setItem(KEY, JSON.stringify(all)); saved = true;
    }catch(e){ saved = false; }
  }
  function plainNote(h){ return String(h || "").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim(); }

  /* ── texto plano del capítulo y posiciones ── */
  function textNodes(){
    var out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {acceptNode:function(n){
      var p = n.parentNode; return p && p.closest && p.closest(".est-skip") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }}), n;
    while((n = w.nextNode())) out.push(n);
    return out;
  }
  function flatText(){ return textNodes().map(function(n){ return n.nodeValue; }).join(""); }
  function off(node, o){
    var r = document.createRange(); r.setStart(root, 0); r.setEnd(node, o);
    var total = 0;
    textNodes().forEach(function(n){
      if(!r.intersectsNode(n)) return;
      total += n === r.endContainer ? r.endOffset : n.nodeValue.length;
    });
    return total;
  }
  function common(a, b, fromEnd){
    var n = 0, la = a.length, lb = b.length;
    while(n < la && n < lb && (fromEnd ? a[la - 1 - n] === b[lb - 1 - n] : a[n] === b[n])) n++;
    return n;
  }
  function locate(rec, flat){
    var q = rec.q, best = -1, bs = -1, i = -1;
    while((i = flat.indexOf(q, i + 1)) > -1){
      var pre = flat.slice(Math.max(0, i - rec.p.length), i), suf = flat.slice(i + q.length, i + q.length + rec.n.length);
      var sc = common(pre, rec.p, true) + common(suf, rec.n, false) - Math.min(Math.abs(i - rec.s), 1e6) / 1e6;
      if(sc > bs){ bs = sc; best = i; }
    }
    return best;
  }

  /* ── pintar y despintar ── */
  function cls(r){ return "est" + (r.hl ? " est-hl" : "") + (r.b ? " est-b" : "") + (r.i ? " est-i" : "") + (r.u ? " est-u" : "") + (plainNote(r.note) ? " est-n" : ""); }
  function unwrapAll(){
    Array.prototype.slice.call(root.querySelectorAll("mark.est")).forEach(function(m){
      var p = m.parentNode; while(m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m);
    });
    root.normalize();
  }
  function wrap(rec){
    var flat = flatText(), pos = locate(rec, flat);
    if(pos < 0){ rec.lost = true; return; }
    rec.lost = false; rec.s = pos;
    var e = pos + rec.q.length, acc = 0, pieces = [];
    textNodes().forEach(function(n){
      var L = n.nodeValue.length, a = acc, b = acc + L; acc = b;
      if(b <= pos || a >= e) return;
      var ls = Math.max(pos, a) - a, le = Math.min(e, b) - a;
      if(n.nodeValue.slice(ls, le).trim()) pieces.push([n, ls, le]);
    });
    pieces.forEach(function(p, k){
      var n = p[0], ls = p[1], le = p[2];
      if(le < n.nodeValue.length) n.splitText(le);
      var mid = ls > 0 ? n.splitText(ls) : n, m = document.createElement("mark");
      m.className = cls(rec) + (k === pieces.length - 1 ? " est-end" : ""); m.dataset.id = rec.id;
      mid.parentNode.insertBefore(m, mid); m.appendChild(mid);
    });
  }
  function render(){
    if(!root) return;
    unwrapAll();
    recs.forEach(wrap);
    updateCount();
    if(panelOpen) drawPanel();
  }
  function updateCount(){
    var n = recs.filter(function(r){ return r.hl || r.b || r.i || r.u || plainNote(r.note); }).length;
    if(countEl) countEl.textContent = n ? String(n) : "";
    if(notesBtn) notesBtn.setAttribute("aria-label", "Mis marcas y notas" + (n ? " (" + n + ")" : ""));
  }

  /* ── notas: HTML saneado (solo N, K, S, saltos y bloques) ── */
  function clean(html){
    var t = document.createElement("template"); t.innerHTML = html;
    function walk(n){
      var out = "";
      n.childNodes.forEach(function(c){
        if(c.nodeType === 3){ out += esc(c.nodeValue); return; }
        if(c.nodeType !== 1) return;
        var tg = c.tagName.toLowerCase(), inner = walk(c);
        if(tg === "b" || tg === "strong") out += "<b>" + inner + "</b>";
        else if(tg === "i" || tg === "em") out += "<i>" + inner + "</i>";
        else if(tg === "u") out += "<u>" + inner + "</u>";
        else if(tg === "br") out += "<br>";
        else if(tg === "div" || tg === "p") out += "<div>" + inner + "</div>";
        else out += inner;
      });
      return out;
    }
    return walk(t.content);
  }

  /* ── altas y bajas ── */
  function addRec(sel){
    var flat = flatText(), s = sel.s, e = sel.e;
    while(s < e && /\s/.test(flat[s])) s++;
    while(e > s && /\s/.test(flat[e - 1])) e--;
    if(e <= s) return null;
    if(e - s > MAXQ){ flash("Selecciona un fragmento más corto (máximo " + MAXQ.toLocaleString("es-ES") + " caracteres)."); return null; }
    var rec = {id:"m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), s:s, q:flat.slice(s, e), p:flat.slice(Math.max(0, s - 30), s), n:flat.slice(e, e + 30), hl:0, b:0, i:0, u:0, note:"", t:Date.now()};
    recs.push(rec); return rec;
  }
  function ensureRec(){
    var rec = cur && find(cur);
    if(rec) return rec;
    if(!pend) return null;
    rec = addRec(pend); if(!rec) return null;
    cur = rec.id; pend = null;
    clearSelection();
    return rec;
  }
  function removeRec(id){
    recs = recs.filter(function(r){ return r.id !== id; });
    persist(); render(); closeCard(true);
  }
  function toggle(k){
    var rec = ensureRec(); if(!rec) return;
    rec[k] = rec[k] ? 0 : 1;
    persist(); render(); drawCard();
  }
  function setNote(html){
    var rec = cur && find(cur); if(!rec) return;
    rec.note = clean(html);
    clearTimeout(timer); timer = setTimeout(function(){ persist(); }, 250);
  }

  /* ── tarjeta flotante ── */
  function ensureCard(){
    if(card) return card;
    card = document.createElement("div"); card.className = "est-ui est-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-label", "Subrayado, formato y nota");
    card.hidden = true; (HOST || document.body).appendChild(card);
    card.addEventListener("pointerdown", function(e){ if(!e.target.closest(".est-note")) e.preventDefault(); });
    card.addEventListener("click", onCardClick);
    card.addEventListener("keydown", function(e){ if(e.key === "Escape"){ closeCard(); } });
    return card;
  }
  function btn(act, label, pressed, extra, title){
    return '<button type="button" class="est-btn' + (extra ? " " + extra : "") + '" data-act="' + act + '"' + (pressed !== null ? ' aria-pressed="' + (pressed ? "true" : "false") + '"' : "") + ' aria-label="' + (title || label) + '" title="' + (title || label) + '">' + label + "</button>";
  }
  function drawCard(){
    ensureCard();
    var rec = cur && find(cur), has = !!rec;
    var h = '<div class="est-row">' +
      btn("hl", "Subrayar", has && rec.hl, "est-hlb", "Subrayar el fragmento") +
      btn("b", "<b>N</b>", has && rec.b, "est-fmt", "Negrita (formato personal)") +
      btn("i", "<i>K</i>", has && rec.i, "est-fmt", "Cursiva (formato personal)") +
      btn("u", "<u>S</u>", has && rec.u, "est-fmt", "Subrayado de texto (formato personal)") +
      btn("note", "Nota", noteOpen || (has && !!plainNote(rec.note)), "est-notebtn", "Anotación vinculada al fragmento") +
      (has ? btn("del", "Quitar", null, "est-del", "Quitar subrayado, formato y nota") : "") +
      "</div>";
    if(noteOpen && has){
      h += '<div class="est-nw"><div class="est-row est-mini">' +
        '<button type="button" class="est-btn est-fmt" data-fmt="bold" aria-label="Negrita en la nota" title="Negrita en la nota"><b>N</b></button>' +
        '<button type="button" class="est-btn est-fmt" data-fmt="italic" aria-label="Cursiva en la nota" title="Cursiva en la nota"><i>K</i></button>' +
        '<button type="button" class="est-btn est-fmt" data-fmt="underline" aria-label="Subrayado en la nota" title="Subrayado en la nota"><u>S</u></button>' +
        (plainNote(rec.note) ? '<button type="button" class="est-btn est-del" data-act="delnote">Borrar nota</button>' : "") +
        '</div><div class="est-note" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Anotación" data-ph="Escribe tu anotación…">' + (rec.note || "") + "</div></div>";
    }
    if(rec) h += '<p class="est-q"><span>Fragmento</span> «' + esc(rec.q.length > 110 ? rec.q.slice(0, 110) + "…" : rec.q) + "»</p>";
    if(!saved) h += '<p class="est-warn">Este navegador no permite guardar: las marcas se perderán al cerrar.</p>';
    card.innerHTML = h; card.hidden = false;
    var ed = card.querySelector(".est-note");
    if(ed){
      ed.addEventListener("input", function(){ setNote(ed.innerHTML); });
      ed.addEventListener("blur", function(){ persist(); updateCount(); var r = cur && find(cur); if(r) refreshNoteMark(r); if(panelOpen) drawPanel(); });
      ed.addEventListener("paste", function(e){ e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData("text"); document.execCommand("insertText", false, t); });
    }
    place();
  }
  function refreshNoteMark(rec){
    Array.prototype.slice.call(root.querySelectorAll('mark.est[data-id="' + rec.id + '"]')).forEach(function(m){
      var end = m.classList.contains("est-end"); m.className = cls(rec) + (end ? " est-end" : "");
    });
  }
  function anchorRect(){
    var rec = cur && find(cur);
    if(rec){
      var ms = root.querySelectorAll('mark.est[data-id="' + rec.id + '"]');
      if(ms.length){ var a = ms[0].getBoundingClientRect(), z = ms[ms.length - 1].getBoundingClientRect(); return {top:Math.min(a.top, z.top), bottom:Math.max(a.bottom, z.bottom), left:Math.min(a.left, z.left), right:Math.max(a.right, z.right)}; }
    }
    var cr = currentRange();
    if(cr){ return cr.getBoundingClientRect(); }
    return lastRect;
  }
  var lastRect = null;
  function place(){
    if(!card || card.hidden) return;
    var r = anchorRect(); if(r) lastRect = r;
    if(small()){ card.classList.add("est-sheet"); card.style.left = card.style.top = ""; return; }
    card.classList.remove("est-sheet");
    if(!r) return;
    var w = card.offsetWidth, h = card.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var top = r.top - h - 10; if(top < 72) top = r.bottom + 10;
    if(top + h > vh - 8) top = Math.max(72, vh - h - 8);
    var left = Math.min(Math.max(8, (r.left + r.right) / 2 - w / 2), vw - w - 8);
    card.style.left = left + "px"; card.style.top = top + "px";
  }
  function closeCard(skipClean){
    var rec = cur && find(cur);
    if(rec && !skipClean){
      if(!(rec.hl || rec.b || rec.i || rec.u || plainNote(rec.note))) recs = recs.filter(function(r){ return r !== rec; });
      persist(); render();
    }
    cur = null; pend = null; noteOpen = false;
    if(card) card.hidden = true;
  }
  function onCardClick(e){
    var f = e.target.closest("[data-fmt]");
    if(f){ var ed = card.querySelector(".est-note"); if(ed){ ed.focus(); document.execCommand(f.dataset.fmt, false, null); setNote(ed.innerHTML); } return; }
    var b = e.target.closest("[data-act]"); if(!b) return;
    var a = b.dataset.act;
    if(a === "hl" || a === "b" || a === "i" || a === "u") toggle(a);
    else if(a === "note"){
      if(!ensureRec()) return;
      noteOpen = !noteOpen; drawCard();
      if(noteOpen){ var ed2 = card.querySelector(".est-note"); if(ed2) ed2.focus(); }
    }
    else if(a === "delnote"){ var r = cur && find(cur); if(r){ r.note = ""; persist(); render(); noteOpen = false; drawCard(); } }
    else if(a === "del"){ if(cur) removeRec(cur); }
  }

  /* ── selección (ratón y táctil) y clic sobre una marca ── */
  function onSel(){
    if(!mounted) return;
    if(root && !root.isConnected){ unmount(); return; }
    var r = currentRange();
    if(!r) return;
    if(!root.contains(r.commonAncestorContainer)) return;
    var anc = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode;
    if(anc && anc.closest && anc.closest(".est-skip")) return;
    var so, eo; try{ so = off(r.startContainer, r.startOffset); eo = off(r.endContainer, r.endOffset); }catch(e){ return; }
    if(eo - so < 1) return;
    var rect = r.getBoundingClientRect(); lastRect = rect;
    cur = null; pend = {s:so, e:eo}; noteOpen = false;
    drawCard();
  }
  function onClick(e){
    if(currentRange()) return;
    var m = e.target.closest && e.target.closest("mark.est"); if(!m || e.target.closest("a")) return;
    cur = m.dataset.id; pend = null; var rec = find(cur); noteOpen = !!(rec && plainNote(rec.note));
    drawCard();
  }
  function onDocPointer(e){
    if(root && !root.isConnected){ unmount(); return; }
    if(!card || card.hidden) return;
    var path = e.composedPath ? e.composedPath() : [e.target];
    if(path.indexOf(card) > -1 || (panel && path.indexOf(panel) > -1)) return;
    if(path.some(function(n){ return n.nodeType === 1 && n.matches && n.matches("mark.est"); })) return;
    closeCard();
  }
  function onKey(e){ if(e.key === "Escape"){ if(card && !card.hidden) closeCard(); else if(panelOpen) togglePanel(false); } }
  function onScroll(){ if(raf) return; raf = requestAnimationFrame(function(){ raf = 0; place(); }); }
  function onSelChange(){ clearTimeout(selTimer); selTimer = setTimeout(onSel, 220); }

  /* ── panel «Mis notas» ── */
  function ensurePanel(){
    if(panel) return panel;
    panel = document.createElement("aside"); panel.className = "est-ui est-panel"; panel.setAttribute("aria-label", "Mis marcas y notas"); panel.hidden = true;
    (HOST || document.body).appendChild(panel);
    panel.addEventListener("click", function(e){
      var c = e.target.closest("[data-pa]"); if(!c){ return; }
      var id = c.closest("[data-id]") ? c.closest("[data-id]").dataset.id : "";
      var a = c.dataset.pa;
      if(a === "close") togglePanel(false);
      else if(a === "go") goTo(id);
      else if(a === "edit"){ goTo(id, true); }
      else if(a === "del"){ if(confirm("¿Quitar esta marca y su nota?")) removeRec(id); }
    });
    return panel;
  }
  function drawPanel(){
    ensurePanel();
    var list = recs.filter(function(r){ return r.hl || r.b || r.i || r.u || plainNote(r.note); }).sort(function(a, b){ return a.s - b.s; });
    var h = '<div class="est-ph"><h2>Mis marcas y notas</h2><button type="button" class="est-btn" data-pa="close" aria-label="Cerrar el panel">Cerrar</button></div>';
    if(!list.length) h += '<p class="est-empty">Aún no has marcado nada en este capítulo. Selecciona un fragmento del texto para subrayarlo, darle formato o añadir una nota.</p>';
    else h += '<ol class="est-list">' + list.map(function(r){
      var fl = [r.hl ? "subrayado" : "", r.b ? "negrita" : "", r.i ? "cursiva" : "", r.u ? "subrayado de texto" : ""].filter(Boolean).join(", ");
      return '<li data-id="' + r.id + '"' + (r.lost ? ' class="est-lost"' : "") + '><button type="button" class="est-go" data-pa="go"><span class="est-qq ' + cls(r).replace("est ", "").replace("est-n", "") + '">' + esc(r.q.length > 140 ? r.q.slice(0, 140) + "…" : r.q) + "</span>" +
        (fl ? '<span class="est-fl">' + fl + "</span>" : "") + (r.lost ? '<span class="est-fl">No localizado: el texto ha cambiado</span>' : "") + "</button>" +
        (plainNote(r.note) ? '<div class="est-nt">' + r.note + "</div>" : "") +
        '<div class="est-ac"><button type="button" class="est-btn" data-pa="edit">Editar</button><button type="button" class="est-btn est-del" data-pa="del">Quitar</button></div></li>';
    }).join("") + "</ol>";
    if(!saved) h += '<p class="est-warn">Este navegador no permite guardar: las marcas se perderán al cerrar.</p>';
    panel.innerHTML = h;
  }
  function togglePanel(on){
    panelOpen = on === undefined ? !panelOpen : on;
    ensurePanel(); panel.hidden = !panelOpen;
    if(notesBtn) notesBtn.setAttribute("aria-expanded", panelOpen ? "true" : "false");
    if(panelOpen){ drawPanel(); closeCard(); }
  }
  function goTo(id, edit){
    var ms = root.querySelectorAll('mark.est[data-id="' + id + '"]');
    if(!ms.length) return;
    var d = ms[0].closest("details"); if(d) d.open = true;
    if(small()) togglePanel(false);
    ms[0].scrollIntoView({block:"center", behavior:"smooth"});
    Array.prototype.forEach.call(ms, function(m){ m.classList.add("est-flash"); });
    setTimeout(function(){ Array.prototype.forEach.call(ms, function(m){ m.classList.remove("est-flash"); }); }, 1800);
    if(edit){ setTimeout(function(){ cur = id; pend = null; var r = find(id); noteOpen = true; lastRect = null; drawCard(); var ed = card.querySelector(".est-note"); if(ed) ed.focus(); }, 450); }
  }
  function flash(msg){
    ensureCard(); lastRect = lastRect || {top:120, bottom:140, left:20, right:200};
    card.innerHTML = '<p class="est-warn">' + esc(msg) + "</p>"; card.hidden = false; place();
    setTimeout(function(){ if(!cur && !pend && card) card.hidden = true; }, 2600);
  }

  /* ── ciclo de vida ── */
  function onNotesBtn(){ togglePanel(); }
  function mount(o){
    unmount();
    KEY = o.key; chap = o.chapter; root = o.root; HOST = o.host || null; notesBtn = o.notesBtn || null; countEl = o.countEl || null;
    var all = readAll(); recs = (all[chap] || []).map(function(r){ return Object.assign({hl:0, b:0, i:0, u:0, note:""}, r); });
    cur = pend = null; noteOpen = false; panelOpen = false; saved = true;
    mounted = true;
    render();
    root.addEventListener("click", onClick);
    document.addEventListener("selectionchange", onSelChange);
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, {passive:true});
    window.addEventListener("resize", onScroll);
    if(notesBtn){ notesBtn.addEventListener("click", onNotesBtn); notesBtn.setAttribute("aria-expanded", "false"); }
  }
  function unmount(){
    if(!mounted) return;
    mounted = false;
    clearTimeout(timer); clearTimeout(selTimer);
    if(root) root.removeEventListener("click", onClick);
    document.removeEventListener("selectionchange", onSelChange);
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    if(notesBtn) notesBtn.removeEventListener("click", onNotesBtn);
    if(card){ card.remove(); card = null; }
    if(panel){ panel.remove(); panel = null; }
    root = null; notesBtn = null; countEl = null; HOST = null; recs = []; cur = pend = null; noteOpen = panelOpen = false;
  }

  /* ── barra del capítulo siempre visible (fija bajo la cabecera aunque un contenedor rompa el «sticky») ── */
  var pinState = null;
  function pinBar(bar, appbar){
    unpinBar();
    var ph = document.createElement("div"); ph.className = "sbar-ph"; bar.parentNode.insertBefore(ph, bar);
    function upd(){
      if(!bar.isConnected){ unpinBar(); return; }
      var top = appbar && appbar.isConnected ? Math.max(0, appbar.getBoundingClientRect().bottom) : 0;
      var r = ph.getBoundingClientRect();
      if(r.top < top){
        if(!bar.classList.contains("pinned")){ ph.style.height = bar.offsetHeight + "px"; bar.classList.add("pinned"); }
        bar.style.top = top + "px"; bar.style.left = r.left + "px"; bar.style.width = r.width + "px";
      }else if(bar.classList.contains("pinned")){
        bar.classList.remove("pinned"); ph.style.height = ""; bar.style.top = ""; bar.style.left = ""; bar.style.width = "";
      }
    }
    var f = 0; function sched(){ if(f) return; f = requestAnimationFrame(function(){ f = 0; upd(); }); }
    document.addEventListener("scroll", sched, true); window.addEventListener("resize", sched);
    pinState = {sched:sched}; upd();
  }
  function unpinBar(){ if(!pinState) return; document.removeEventListener("scroll", pinState.sched, true); window.removeEventListener("resize", pinState.sched); pinState = null; }

  /* ── botón «subir al principio» (abajo a la derecha) ── */
  var topState = null;
  function backTop(target, host){
    removeTop();
    var b = document.createElement("button");
    b.type = "button"; b.className = "est-ui btop"; b.hidden = true;
    b.setAttribute("aria-label", "Subir al principio del capítulo"); b.title = "Subir al principio";
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    (host || document.body).appendChild(b);
    b.addEventListener("click", function(){
      var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({block:"start", behavior:still ? "auto" : "smooth"});
      var f = target.querySelector("h1"); if(f){ f.setAttribute("tabindex", "-1"); f.focus({preventScroll:true}); }
    });
    function upd(){ if(!target.isConnected){ removeTop(); return; } b.hidden = target.getBoundingClientRect().top > -600; }
    var f = 0; function sched(){ if(f) return; f = requestAnimationFrame(function(){ f = 0; upd(); }); }
    document.addEventListener("scroll", sched, true);
    topState = {b:b, sched:sched}; upd();
  }
  function removeTop(){ if(!topState) return; document.removeEventListener("scroll", topState.sched, true); topState.b.remove(); topState = null; }

  /* ── visor de explicaciones visuales: modal con X arriba a la derecha; se cierra con la X, con Esc o pulsando fuera ── */
  function viewer(o){
    var d = document.createElement("dialog");
    d.className = "est-ui vv"; d.setAttribute("aria-label", "Explicación visual: " + o.title);
    d.innerHTML = '<div class="vv-box"><div class="vv-h"><div><span class="vv-k">Explicación visual</span><h2>' + esc(o.title) + '</h2></div>' +
      '<button type="button" class="vv-x" aria-label="Cerrar la explicación visual" title="Cerrar">×</button></div>' +
      (o.text ? '<p class="vv-t">' + esc(o.text) + "</p>" : "") + '<div class="vv-b">' + o.html + "</div></div>";
    (o.host || document.body).appendChild(d);
    d.addEventListener("close", function(){ d.remove(); if(o.ret && o.ret.isConnected) o.ret.focus(); });
    d.addEventListener("click", function(e){ if(e.target === d) d.close(); });
    d.querySelector(".vv-x").addEventListener("click", function(){ d.close(); });
    if(typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    d.querySelector(".vv-x").focus();
    return d;
  }

  /* ── visor de redes: líneas y estaciones a partir de GTFS (datos en un <div class="visor-data"> con JSON) ── */
  var SVGNS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs, parent){ var e = document.createElementNS(SVGNS, tag); for(var k in attrs) e.setAttribute(k, attrs[k]); if(parent) parent.appendChild(e); return e; }
  function visor(el){
    var dn = el.querySelector(".visor-data"); if(!dn) return;
    var data; try{ data = JSON.parse(dn.textContent); }catch(e){ return; }
    el.textContent = "";
    var tabs = data.tabs || [];
    var bar = document.createElement("div"); bar.className = "vz-tabs"; bar.setAttribute("role", "tablist"); bar.setAttribute("aria-label", "Redes");
    var panel = document.createElement("div"); panel.className = "vz-panel"; panel.setAttribute("role", "tabpanel");
    el.appendChild(bar); el.appendChild(panel);
    tabs.forEach(function(t, i){
      var b = document.createElement("button"); b.type = "button"; b.className = "vz-tab"; b.setAttribute("role", "tab");
      b.innerHTML = "<b>" + esc(t.t) + "</b><span>" + esc(t.sub || "") + "</span>";
      b.addEventListener("click", function(){ show(i); });
      bar.appendChild(b);
    });
    function show(i){
      Array.prototype.forEach.call(bar.children, function(b, k){ b.setAttribute("aria-selected", k === i ? "true" : "false"); b.tabIndex = k === i ? 0 : -1; });
      var cur = bar.children[i]; if(cur && bar.scrollWidth > bar.clientWidth){ var l = cur.offsetLeft - bar.offsetLeft, r = l + cur.offsetWidth; if(l < bar.scrollLeft || r > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = Math.max(0, l - 24); }
      panel.textContent = "";
      var t = tabs[i];
      if(t.pending){
        panel.innerHTML = '<p class="vz-pend">' + esc(t.pending) + (t.link ? ' <a href="' + esc(t.link[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(t.link[0]) + " ↗</a>" : "") + "</p>";
        return;
      }
      drawNet(panel, t);
    }
    bar.addEventListener("keydown", function(e){
      var bs = Array.prototype.slice.call(bar.children), k = bs.indexOf(document.activeElement && document.activeElement.closest ? document.activeElement.closest(".vz-tab") : null);
      var sh = el.getRootNode && el.getRootNode().activeElement; if(k < 0 && sh) k = bs.indexOf(sh);
      if(k < 0) return;
      if(e.key === "ArrowRight" || e.key === "ArrowLeft"){ e.preventDefault(); var n = (k + (e.key === "ArrowRight" ? 1 : bs.length - 1)) % bs.length; bs[n].focus(); bs[n].click(); }
    });
    show(0);
  }
  function drawNet(panel, t){
    var W = 1000, pad = 28, all = [];
    t.lines.forEach(function(L){ L.p.forEach(function(p){ p.g.forEach(function(q){ all.push(q); }); }); });
    t.stops.forEach(function(q){ all.push(q); });
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    all.forEach(function(q){ minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); });
    var k = Math.cos((minY + maxY) / 2 * Math.PI / 180), ex = Math.max((maxX - minX) * k, 1e-6), ey = Math.max(maxY - minY, 1e-6);
    var s = (W - 2 * pad) / ex, H = ey * s + 2 * pad;
    if(H > 720){ s = (720 - 2 * pad) / ey; H = 720; W = Math.max(520, ex * s + 2 * pad); }
    if(H < 360){ H = 360; }
    var offX = (W - ex * s) / 2, offY = (H - ey * s) / 2;
    function P(q){ return [offX + (q[0] - minX) * k * s, offY + (maxY - q[1]) * s]; }
    var byStop = {};
    t.lines.forEach(function(L, li){ L.p.forEach(function(p){ p.s.forEach(function(si){ (byStop[si] = byStop[si] || []); if(byStop[si].indexOf(li) < 0) byStop[si].push(li); }); }); });

    var nSt = t.stops.length;
    panel.innerHTML = '<div class="vz-meta"><span>' + esc(t.sub || "") + "</span><span>" + t.lines.length + (t.lines.length === 1 ? " línea" : " líneas") + " · " + nSt + " estaciones</span></div>" +
      '<div class="vz-chips" role="group" aria-label="Líneas"></div>' +
      '<div class="vz-body"><div class="vz-map"><div class="vz-zoom"><button type="button" data-z="in" aria-label="Acercar">+</button><button type="button" data-z="out" aria-label="Alejar">−</button><button type="button" data-z="reset" aria-label="Ver toda la red">⤢</button></div></div>' +
      '<div class="vz-list" aria-live="polite"></div></div>' +
      '<p class="vz-src">Fuente: GTFS de ' + esc(t.src.o) + ' (<a href="' + esc(t.src.u) + '" target="_blank" rel="noopener noreferrer">descarga oficial ↗</a>), descargado el ' + esc(t.src.d) + (t.src.v ? "; válido del " + esc(t.src.v) : "") +
      ". Trazados del GTFS simplificados." + (t.bm ? ' Mapa base: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">' + esc(t.bm.atrib) + " ↗</a>." : "") + (t.missing && t.missing.length ? " El GTFS no trae recorridos de: " + t.missing.map(esc).join(", ") + "." : "") + (t.note ? " " + esc(t.note) : "") + "</p>";
    var chips = panel.querySelector(".vz-chips"), mapBox = panel.querySelector(".vz-map"), list = panel.querySelector(".vz-list");
    var svg = sv("svg", {viewBox:"0 0 " + W + " " + H, role:"img", "aria-label":"Esquema de la red " + t.t + " con sus líneas y estaciones", class:"vz-svg"});
    mapBox.insertBefore(svg, mapBox.firstChild);
    var gB = sv("g", {class:"vz-bm"}, svg), gP = sv("g", {}, svg), gL = sv("g", {}, svg), gS = sv("g", {}, svg), gT = sv("g", {}, svg);
    var bm = t.bm;
    function G(ix, iy){ return P([bm.b[0] + ix / bm.n * bm.b[2], bm.b[1] + iy / bm.n * bm.b[3]]); }
    if(bm){
      var c0 = G(0, 0), c1 = G(bm.n, bm.n);
      sv("rect", {x:c0[0].toFixed(1), y:c1[1].toFixed(1), width:(c1[0] - c0[0]).toFixed(1), height:(c0[1] - c1[1]).toFixed(1), class:bm.mar ? "vz-mar" : "vz-tierra"}, gB);
      var dec = function(a, close){ var x = 0, y = 0, d = ""; for(var i = 0; i < a.length; i += 2){ x += a[i]; y += a[i + 1]; var q = G(x, y); d += (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); } return d + (close ? "Z" : ""); };
      [["tierra", 1], ["parque", 1], ["agua", 1], ["rio", 0], ["lim", 0], ["via2", 0], ["via", 0]].forEach(function(c){
        var arr = bm[c[0]]; if(!arr || !arr.length) return;
        sv("path", {d:arr.map(function(a){ return dec(a, c[1]); }).join(""), class:"vz-" + c[0], "vector-effect":"non-scaling-stroke"}, gB);
      });
    }
    var lineEls = [];
    t.lines.forEach(function(L){
      var els = [];
      L.p.forEach(function(p){
        var pts = p.g.map(function(q){ var a = P(q); return a[0].toFixed(1) + "," + a[1].toFixed(1); }).join(" ");
        var cas = sv("polyline", {points:pts, class:"vz-cas", "stroke-width":"7", "vector-effect":"non-scaling-stroke"}, gL);
        var ln = sv("polyline", {points:pts, fill:"none", stroke:L.c, "stroke-width":"4", "stroke-linecap":"round", "stroke-linejoin":"round", "vector-effect":"non-scaling-stroke"}, gL);
        ln._cas = cas; els.push(ln);
      });
      lineEls.push(els);
    });
    function places(){
      gP.textContent = "";
      if(!bm || !bm.lug) return;
      var sc = scale(), z = W / vb.w, maxR = z >= 2.5 ? 3 : 2, boxes = [];
      bm.lug.forEach(function(L){
        if(L[3] > maxR) return;
        var q = G(L[0], L[1]);
        var fs = (L[3] === 0 ? 13 : L[3] === 1 ? 11.5 : 10.5) * sc, w = L[2].length * fs * 0.56;
        var bx = [q[0] - w / 2 - 3 * sc, q[1] - fs, q[0] + w / 2 + 3 * sc, q[1] + 3 * sc];
        if(bx[0] < vb.x || bx[2] > vb.x + vb.w || bx[1] < vb.y || bx[3] > vb.y + vb.h) return;  // sin nombres cortados en el borde
        if(boxes.some(function(o){ return bx[0] < o[2] && bx[2] > o[0] && bx[1] < o[3] && bx[3] > o[1]; })) return;
        boxes.push(bx);
        sv("text", {x:q[0].toFixed(1), y:q[1].toFixed(1), "font-size":fs.toFixed(2), "text-anchor":"middle", class:"vz-plc r" + L[3], "stroke-width":(3 * sc).toFixed(2)}, gP).textContent = L[2];
      });
    }
    var stopEls = t.stops.map(function(q, i){
      var a = P(q), c = sv("circle", {cx:a[0].toFixed(1), cy:a[1].toFixed(1), r:"3.4", fill:"#FFFFFF", stroke:"#1D2638", "stroke-width":"1.4", "vector-effect":"non-scaling-stroke", tabindex:"-1", class:"vz-st"}, gS);
      sv("title", {}, c).textContent = q[2];
      c.addEventListener("click", function(e){ e.stopPropagation(); pick(i); });
      return c;
    });
    var vb = {x:0, y:0, w:W, h:H}, state = {line:-1, stop:-1};
    function scale(){ var r = svg.getBoundingClientRect(); return r.width ? vb.w / r.width : 1; }
    function applyVB(){ svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h); refresh(); }
    function label(i, strong){
      var a = P(t.stops[i]), sc = scale(), tx = sv("text", {x:(a[0] + 7 * sc).toFixed(1), y:(a[1] - 6 * sc).toFixed(1), "font-size":(12.5 * sc).toFixed(2), "font-weight":strong ? "700" : "600", fill:"#1D2638", stroke:"#FFFFFF", "stroke-width":(3.2 * sc).toFixed(2), "paint-order":"stroke", "stroke-linejoin":"round"}, gT);
      tx.textContent = t.stops[i][2];
    }
    function refresh(){
      var sc = scale(), sel = state.line;
      lineEls.forEach(function(els, li){ els.forEach(function(e){ var on = sel < 0 || sel === li; e.setAttribute("stroke-opacity", on ? "1" : "0.18"); e.setAttribute("stroke-width", sel === li ? "6" : "4"); e._cas.setAttribute("stroke-opacity", on ? "0.9" : "0"); e._cas.setAttribute("stroke-width", sel === li ? "9" : "7"); }); });
      if(sel >= 0) lineEls[sel].forEach(function(e){ gL.appendChild(e._cas); gL.appendChild(e); });
      places();
      var inLine = {};
      if(sel >= 0) t.lines[sel].p.forEach(function(p){ p.s.forEach(function(si){ inLine[si] = 1; }); });
      stopEls.forEach(function(c, i){
        var on = sel < 0 || inLine[i];
        c.setAttribute("r", ((state.stop === i ? 6.5 : on && sel >= 0 ? 4.6 : 3.4) * sc).toFixed(2));
        c.setAttribute("opacity", on ? "1" : "0.25");
        c.setAttribute("stroke", state.stop === i ? "#C8602F" : sel >= 0 && inLine[i] ? t.lines[sel].c : "#1D2638");
        c.setAttribute("stroke-width", state.stop === i ? "3" : sel >= 0 && inLine[i] ? "2.4" : "1.4");
      });
      gT.textContent = "";
      if(sel >= 0) t.lines[sel].p.forEach(function(p){ label(p.s[0]); label(p.s[p.s.length - 1]); });
      if(state.stop >= 0) label(state.stop, true);
    }
    function chip(label, color, idx){
      var b = document.createElement("button"); b.type = "button"; b.className = "vz-chip";
      b.innerHTML = (color ? '<i class="vz-sw" data-c="' + esc(color) + '"></i>' : "") + esc(label);
      if(color) b.querySelector(".vz-sw").style.background = color;
      b.addEventListener("click", function(){ state.line = idx; state.stop = -1; syncChips(); drawList(); refresh(); });
      chips.appendChild(b); return b;
    }
    var chipEls = [chip("Todas", "", -1)];
    t.lines.forEach(function(L, li){ chipEls.push(chip(L.n, L.c, li)); });
    function syncChips(){ chipEls.forEach(function(b, i){ b.setAttribute("aria-pressed", (i - 1) === state.line ? "true" : "false"); }); }
    function stName(i){ return t.stops[i][2]; }
    function drawList(){
      if(state.line < 0){
        list.innerHTML = '<p class="vz-lh">Elige una línea para ver sus estaciones en orden. Pulsa una estación del esquema para ver su nombre.</p><ul class="vz-ls">' + t.lines.map(function(L, li){
          var n = {}; L.p.forEach(function(p){ p.s.forEach(function(si){ n[si] = 1; }); });
          return '<li><button type="button" data-l="' + li + '"><i class="vz-sw"></i><b>' + esc(L.n) + "</b><span>" + esc(L.d || "") + " · " + Object.keys(n).length + " est. · " + esc(L.k) + "</span></button></li>";
        }).join("") + "</ul>" + (state.stop >= 0 ? stopInfo() : "");
        Array.prototype.forEach.call(list.querySelectorAll("[data-l]"), function(b){ var L = t.lines[+b.dataset.l]; b.querySelector(".vz-sw").style.background = L.c; b.addEventListener("click", function(){ state.line = +b.dataset.l; state.stop = -1; syncChips(); drawList(); refresh(); }); });
        return;
      }
      var L = t.lines[state.line];
      list.innerHTML = '<div class="vz-lt"><i class="vz-sw"></i><div><b>Línea ' + esc(L.n) + "</b><span>" + esc(L.d || "") + " · " + esc(L.k) + "</span></div></div>" +
        L.p.map(function(p, pi){
          return (L.p.length > 1 ? '<p class="vz-rec">Recorrido ' + (pi + 1) + ": " + esc(stName(p.s[0])) + " – " + esc(stName(p.s[p.s.length - 1])) + " · " + p.s.length + " estaciones</p>" : '<p class="vz-rec">' + p.s.length + " estaciones</p>") +
            '<ol class="vz-ol">' + p.s.map(function(si){ return '<li><button type="button" data-s="' + si + '"' + (si === state.stop ? ' aria-current="true"' : "") + ">" + esc(stName(si)) + ((byStop[si] || []).length > 1 ? ' <small>' + byStop[si].filter(function(x){ return x !== state.line; }).map(function(x){ return esc(t.lines[x].n); }).join(" · ") + "</small>" : "") + "</button></li>"; }).join("") + "</ol>";
        }).join("");
      list.querySelector(".vz-sw").style.background = L.c;
      Array.prototype.forEach.call(list.querySelectorAll("[data-s]"), function(b){ b.addEventListener("click", function(){ pick(+b.dataset.s, true); }); });
    }
    function stopInfo(){
      var i = state.stop; return '<p class="vz-stinfo"><b>' + esc(stName(i)) + "</b> · líneas: " + (byStop[i] || []).map(function(x){ return esc(t.lines[x].n); }).join(", ") + "</p>";
    }
    function pick(i, center){
      state.stop = i;
      if(center){ var a = P(t.stops[i]); if(a[0] < vb.x || a[0] > vb.x + vb.w || a[1] < vb.y || a[1] > vb.y + vb.h){ vb.x = a[0] - vb.w / 2; vb.y = a[1] - vb.h / 2; applyVB(); } }
      if(state.line >= 0){ Array.prototype.forEach.call(list.querySelectorAll("[data-s]"), function(b){ if(+b.dataset.s === i) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); }); }
      else drawList();
      refresh();
    }
    function zoom(f, cx, cy){
      var nw = Math.min(W, Math.max(W / 12, vb.w * f)), nh = nw * H / W;
      if(cx === undefined){ cx = vb.x + vb.w / 2; cy = vb.y + vb.h / 2; }
      vb.x = cx - (cx - vb.x) * nw / vb.w; vb.y = cy - (cy - vb.y) * nh / vb.h; vb.w = nw; vb.h = nh;
      if(nw >= W){ vb.x = 0; vb.y = 0; }
      applyVB();
    }
    mapBox.querySelector(".vz-zoom").addEventListener("click", function(e){
      var b = e.target.closest("button"); if(!b) return;
      if(b.dataset.z === "in") zoom(0.6); else if(b.dataset.z === "out") zoom(1 / 0.6); else { vb = {x:0, y:0, w:W, h:H}; applyVB(); }
    });
    var drag = null;
    svg.addEventListener("pointerdown", function(e){ if(e.target.closest && e.target.closest(".vz-st")) return; drag = {x:e.clientX, y:e.clientY, vx:vb.x, vy:vb.y}; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener("pointermove", function(e){ if(!drag) return; var sc = scale(); vb.x = drag.vx - (e.clientX - drag.x) * sc; vb.y = drag.vy - (e.clientY - drag.y) * sc; svg.setAttribute("viewBox", vb.x + " " + vb.y + " " + vb.w + " " + vb.h); });
    svg.addEventListener("pointerup", function(){ if(drag){ drag = null; refresh(); } });
    svg.addEventListener("pointercancel", function(){ drag = null; });
    svg.addEventListener("dblclick", function(e){ var r = svg.getBoundingClientRect(), sc = scale(); zoom(0.6, vb.x + (e.clientX - r.left) * sc, vb.y + (e.clientY - r.top) * sc); });
    syncChips(); drawList();
    requestAnimationFrame(refresh);
    if("ResizeObserver" in window) new ResizeObserver(function(){ refresh(); }).observe(svg);
  }
  return {mount:mount, unmount:unmount, visor:visor, pinBar:pinBar, unpinBar:unpinBar, backTop:backTop, removeTop:removeTop, viewer:viewer};
  })();

  /* ── saneado del HTML del contenido: lista blanca de etiquetas, atributos y enlaces ── */
  var ALLOW = { b: 1, strong: 1, i: 1, em: 1, u: 1, code: 1, p: 1, br: 1, ul: 1, ol: 1, li: 1, sub: 1, sup: 1, blockquote: 1, h3: 1, h4: 1, h5: 1, h6: 1,
    table: 1, thead: 1, tbody: 1, tr: 1, th: 1, td: 1, a: 1, div: 1, span: 1, mark: 1, details: 1, summary: 1,
    figure: 1, figcaption: 1, article: 1, header: 1, footer: 1, dl: 1, dt: 1, dd: 1 };
  var DROP = { script: 1, style: 1, iframe: 1, object: 1, embed: 1, svg: 1, math: 1, template: 1, noscript: 1, link: 1, meta: 1, form: 1, input: 1, button: 1, textarea: 1, select: 1, img: 1, video: 1, audio: 1 };
  var ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  function safeHref(href) {
    if (/^https:\/\//i.test(href)) return href;
    var m = /^#(indicadores|tema|glosario|temas)(\/[A-Za-z0-9\/-]*)?$/.exec(href);   // enlaces internos del manual → rutas del área privada
    return m ? R(m[1] + (m[2] || '')) : null;
  }
  function copyClean(src, dst) {
    Array.prototype.forEach.call(src.childNodes, function (n) {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase();
      if (tag === 'img' && n.getAttribute('class') === 'rail-visual') {
        var png = n.getAttribute('src') || '';
        if (png.length <= 150000 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(png)) {
          var picture = document.createElement('img');
          picture.src = png;
          picture.alt = (n.getAttribute('alt') || '').slice(0, 500);
          picture.className = 'rail-visual';   // el ancho va por CSS: un atributo style (aunque sea de CSSOM) acaba en el innerHTML y la CSP lo bloquea
          picture.loading = 'lazy';
          dst.appendChild(picture);
        }
        return;
      }
      if (tag === 'img' && n.getAttribute('class') === 'fig-img') {   // figuras SVG autónomas (data:image/svg+xml): una imagen no ejecuta scripts
        var uri = n.getAttribute('src') || '';
        if (uri.length <= 260000 && /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/.test(uri)) {
          var fig = document.createElement('img');
          fig.className = 'fig-img'; fig.src = uri; fig.alt = (n.getAttribute('alt') || '').slice(0, 600); fig.loading = 'lazy'; fig.decoding = 'async';
          dst.appendChild(fig);
        }
        return;
      }
      if (DROP[tag]) return;
      if (!ALLOW[tag]) { copyClean(n, dst); return; }
      var e = document.createElement(tag);
      var cls = (n.getAttribute('class') || '').split(/\s+/).filter(function (c) { return /^[a-z0-9-]{1,30}$/.test(c); });
      if (cls.length) e.setAttribute('class', cls.join(' '));
      var id = n.getAttribute('id'); if (id && ID.test(id)) e.setAttribute('id', id);
      if (tag === 'mark' && n.getAttribute('title')) e.setAttribute('title', n.getAttribute('title').slice(0, 200));
      if (tag === 'a') {
        var href = safeHref(n.getAttribute('href') || '');
        if (href) { e.setAttribute('href', href); if (/^https:/i.test(href)) { e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener noreferrer'); } }
      }
      dst.appendChild(e); copyClean(n, e);
    });
  }
  function clean(html) {
    if (html == null) return '';
    var doc = new DOMParser().parseFromString('<!doctype html><body>' + String(html), 'text/html');
    var out = document.createElement('div'); copyClean(doc.body, out); return out.innerHTML;
  }

  /* ── datos ── */
  function load() {
    if (cache && Date.now() - cache.at < TTL) { D = cache.data; return Promise.resolve(); }
    return ctx.api('/rest/v1/me_docs?select=kind,pos,data&order=pos.asc&limit=10000').then(function (rows) {
      rows = (rows || []).filter(function (x) { return x && x.data && typeof x.data === 'object'; });
      function of(kind) { return rows.filter(function (x) { return x.kind === kind; }).map(function (x) { return x.data; }); }
      var meta = of('meta')[0] || {};
      var TOPICS = of('topic').filter(function (t) { return ID.test(String(t.id)); }).sort(function (a, b) { return (a.num || 0) - (b.num || 0); });
      var BOOK = {};
      TOPICS.forEach(function (t) { BOOK[t.id] = { html: '', secs: [] }; });
      of('chunk').filter(function (c) { return BOOK[c.t]; }).sort(function (a, b) { return a.i - b.i; }).forEach(function (c) {
        BOOK[c.t].html += String(c.html || '');
        (c.secs || []).forEach(function (s) { if (s && ID.test(String(s.id))) BOOK[c.t].secs.push(s); });
      });
      var data = {
        M: meta, TOPICS: TOPICS, BOOK: BOOK,
        BLOCKS: of('block').filter(function (b) { return ID.test(String(b.id)); }),
        GLOSS: of('gloss').filter(function (g) { return g.k && ID.test(String(g.t)); }),
        INDFAM: of('fam').filter(function (f) { return ID.test(String(f.id)); }),
        INDIC: of('indic').filter(function (x) { return ID.test(String(x.id)) && ID.test(String(x.fam)); }),
        /* glosario completo (opcional: solo si el manual publica glosario.js) */
        GTERMS: of('gterm').filter(function (g) { return g.k && ID.test(String(g.id)) && ID.test(String(g.fam)); }),
        GFAM: of('gfam').filter(function (f) { return ID.test(String(f.id)); }),
        SIGLAS: of('gsig').filter(function (r) { return r.s && r.d; }),
        GCONF: of('gconf')[0] || {},
        GVIS: {}
      };
      of('gvis').forEach(function (x) { if (ID.test(String(x.id))) data.GVIS[x.id] = x; });

      data.byId = {}; TOPICS.forEach(function (t, i) { t._i = i; data.byId[t.id] = t; });
      data.blockById = {}; data.BLOCKS.forEach(function (b) { data.blockById[b.id] = b; });
      data.famById = {}; data.INDFAM.forEach(function (f) { data.famById[f.id] = f; });
      data.ALLG = buildGloss(data);
      cache = { at: Date.now(), data: data };
      D = data;
      D.IDX = buildIndex(D);
    });
  }

  /* glosario completo: conceptos de los capítulos → siglas y términos del libro → vocabulario básico (sin repetir) */
  var GCAT = { s: 'Sigla', l: 'Término del libro', m: 'Concepto del capítulo', v: 'Vocabulario básico' };
  function gcat(g) { return g.c || (g.v ? 'v' : 'm'); }
  function buildGloss(d) {
    if (d.GTERMS.length) return buildFullGloss(d);
    var all = [], seen = {};
    function add(o) { var k = String(o.k).toLowerCase(); if (seen[k]) return; seen[k] = 1; all.push(o); }
    d.GLOSS.forEach(function (g) { add({ k: g.k, d: g.d, t: g.t, a: g.a }); });
    d.TOPICS.forEach(function (t) { (t.entries || []).forEach(function (e) { if (e.c === 's' || e.c === 'l') add({ k: e.k, d: e.d, t: t.id, a: e.a, c: e.c }); }); });
    d.TOPICS.forEach(function (t) { (t.vocab || []).forEach(function (v) { if (v && v[0]) add({ k: v[0], d: v[1], t: t.id, a: 's-vocab', v: true }); }); });
    return all;
  }
  /* Glosario completo (manuales con glosario.js): entradas por familias + fichas de capítulo y vocabulario.
     Una ficha cuyo término coincide con el término o un alias de una entrada se fusiona con ella
     (solo aporta su enlace «En el manual»). Mismas reglas que la web local (GMERGE). */
  function gkey(s) { return norm(String(s)).trim(); }
  function buildFullGloss(d) {
    var c = d.GCONF, famT = c.famT || {}, famK = c.famK || {}, dup = c.dup || {}, alias = {}, all = [];
    d.GBY = {};
    d.GTERMS.forEach(function (g) { g.m = (g.m || []).slice(); d.GBY[g.id] = g; all.push(g); [g.k].concat(g.al || []).forEach(function (a) { alias[gkey(a)] = g.id; }); });
    function addCap(k, txt, t, a, kind, more) {
      if (!ID.test(String(t))) return;
      var id = alias[gkey(k)] || (dup[k] && alias[gkey(dup[k])]);
      if (id) { var g = d.GBY[id]; if (!g.m.some(function (x) { return x[0] === t && x[1] === a; })) g.m.push([t, a]); return; }
      var nid = gkey(k).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 't'; while (d.GBY[nid]) nid += '-b';
      var e = { id: nid, k: k, fam: famK[k] || famT[t] || (d.GFAM[0] || {}).id, d: esc(txt), m: [[t, a]], kind: kind };
      if (more && typeof more === 'object') { if (more.c) e.c = String(more.c); if (more.e) e.e = String(more.e); if (Array.isArray(more.r)) e.r = more.r.filter(function (x) { return ID.test(String(x)); }); }
      d.GBY[nid] = e; alias[gkey(k)] = nid; all.push(e);
    }
    d.GLOSS.forEach(function (g) { addCap(g.k, g.d, g.t, g.a, 'cap', g); });
    d.TOPICS.forEach(function (t) { (t.vocab || []).forEach(function (v) { if (v && v[0]) addCap(v[0], v[1], t.id, 's-vocab', 'vocab', vctx(v)); }); });
    return all;
  }
  /* contexto ampliado de una entrada del vocabulario: 5.º campo (o el 3.º en datos publicados antes, cuando era un objeto) */
  function vctx(v) { return v[4] && typeof v[4] === 'object' ? v[4] : (v[2] && typeof v[2] === 'object' ? v[2] : null); }
  function gHref(g) { return g.id && D.GBY ? R('glosario/' + g.id) : R('tema/' + g.t + (g.a && ID.test(g.a) ? '/' + g.a : '')); }
  function gText(g) { return g._s || (g._s = norm([g.k].concat(g.al || []).join(' ') + ' ' + plain(g.d) + ' ' + plain(g.x || '') + ' ' + plain(g.c || ''))); }

  /* ── búsqueda ── */
  function topicText(t) { return t._tx || (t._tx = norm([t.t, t.q, t.one, (t.rec || []).join(' '), (D.BOOK[t.id].secs || []).map(function (s) { return s.t; }).join(' ')].join(' '))); }
  function indText(x) { return x._s || (x._s = norm([x.n, x.q, plain(x.d), plain(x.ej), x.u, (D.famById[x.fam] || {}).n].join(' '))); }
  var RANK = { 'Sección': 0, 'Indicador': 1, 'Capítulo': 2, 'Sigla': 3, 'Glosario': 3, 'Apartado': 4 };
  function buildIndex(d) {
    var idx = [];
    d.TOPICS.forEach(function (t) {
      idx.push({ k: 'Capítulo', n: t.t, d: t.q, h: R('tema/' + t.id), s: topicText(t), txt: '' });
      d.BOOK[t.id].secs.forEach(function (s) { idx.push({ k: 'Apartado', n: s.t, d: 'Cap. ' + NUM(t) + ' · ' + t.t, h: R('tema/' + t.id + '/' + s.id), s: norm(s.t + ' ' + (s.txt || '')), txt: s.txt || '' }); });
    });
    d.INDIC.forEach(function (x) { idx.push({ k: 'Indicador', n: x.n, d: x.q, h: R('indicadores/' + x.id), s: indText(x), txt: '' }); });
    d.ALLG.forEach(function (g) { idx.push({ k: 'Glosario', n: g.k, d: plain(g.d), h: gHref(g), s: d.GBY ? gText(g) : norm(g.k + ' ' + g.d), txt: '' }); });
    if (d.GBY) d.SIGLAS.forEach(function (r) { idx.push({ k: 'Sigla', n: r.s, d: r.d, h: R('glosario/' + (r.g && d.GBY[r.g] ? r.g : 'siglas')), s: norm(r.s + ' ' + r.d), txt: '' }); });
    [['Inicio', ''], ['Todos los capítulos', 'temas'], ['Indicadores', 'indicadores'], ['Glosario', 'glosario']].forEach(function (v) { idx.push({ k: 'Sección', n: v[0], d: 'Ir a la sección', h: R(v[1]), s: norm(v[0]), txt: '' }); });
    return idx;
  }

  /* ═══════════ Entrada del módulo ═══════════ */
  function render(c) {
    ctx = c;
    PROG = lsGet('prog', {});
    return load().then(function () { return D.TOPICS.length ? paint : paintEmpty; }, function (err) {
      if (err && err.auth) throw err;
      if (err && (err.status === 404 || err.code === 'PGRST205' || err.code === '42P01')) return paintSetup;
      throw err;
    });
  }
  function paintMsg(title, text) {
    ctx.view.textContent = '';
    ctx.view.appendChild(ctx.h('div', { class: 'ap-empty' }, [ctx.h('p', { class: 'ap-empty-title', text: title }), ctx.h('p', { text: text })]));
  }
  function paintSetup() { paintMsg('El manual aún no está creado', 'Ejecuta supabase/manual-estudio.sql en el SQL Editor de Supabase y publica el contenido con node tools/manual-estudio/publish.mjs desde tu terminal.'); }
  function paintEmpty() { paintMsg('El manual todavía no tiene contenido', 'La tabla existe pero está vacía. Publica el contenido con node tools/manual-estudio/publish.mjs desde tu terminal.'); }

  function shell() {
    var title = esc(D.M.title || 'Manual de estudio');
    return '<a class="skip-link" href="#" data-skip>Saltar al contenido</a>' +
      '<header class="appbar"><div class="appbar-in"><a class="brand" href="' + R('') + '" aria-label="' + title + ', ir al inicio">' + title + '</a>' +
      '<nav class="topnav" aria-label="Secciones del manual"><a class="tnb" href="' + R('') + '" data-v="home">Inicio</a><a class="tnb" href="' + R('temas') + '" data-v="temas">Capítulos</a><a class="tnb" href="' + R('indicadores') + '" data-v="indicadores">Indicadores</a><a class="tnb" href="' + R('glosario') + '" data-v="glosario">Glosario</a></nav>' +
      '<div class="appbar-r"><a class="iconbtn" href="#/portfolio">Portfolio</a>' +
      '<button class="iconbtn" id="qkBtn" type="button" aria-label="Buscar Ctrl K, un capítulo, un indicador o un término"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><span class="qk-l">Buscar</span> <kbd>Ctrl K</kbd></button>' +
      '<button class="iconbtn" id="themeBtn" type="button" aria-label="Cambiar entre tema claro y oscuro">Oscuro</button></div></div></header>' +
      '<main id="main" tabindex="-1"><section id="view"></section></main><article id="detail" class="hidden" tabindex="-1"></article>' +
      '<footer class="foot"><span>' + title + ' · notas de estudio · edición ' + esc(D.M.edition || '') + '</span><span>Manual privado: solo visible con tu sesión</span></footer>';
  }

  function paint() {
    Marcas.unmount(); Marcas.unpinBar(); Marcas.removeTop();
    ctx.view.textContent = '';
    host = document.createElement('div'); host.className = 'cm-host me-host'; host.hidden = true;
    root = host.attachShadow({ mode: 'open' });
    var pending = 3, show = function () { if (--pending <= 0) host.hidden = false; };
    [['cm-css', './css/claude-manual.css'], ['me-css', './css/manual-estudio.css'], ['me-sim-css', './css/manual-estudio-sim.css']].forEach(function (a) {
      var link = document.createElement('link'); link.rel = 'stylesheet'; link.href = assetUrl(a[0], a[1]);
      link.addEventListener('load', show); link.addEventListener('error', show); root.appendChild(link);
    });
    var wrap = document.createElement('div'); wrap.className = 'wrap'; wrap.innerHTML = shell(); root.appendChild(wrap);
    var th = lsGet('theme', null); if (th) host.setAttribute('data-theme', th);
    ctx.view.appendChild(host);
    syncThemeBtn();
    $('#themeBtn').addEventListener('click', function () { var n = isDark() ? 'light' : 'dark'; host.setAttribute('data-theme', n); lsSet('theme', n); syncThemeBtn(); });
    $('#qkBtn').addEventListener('click', openQk);
    gm = null; root.addEventListener('click', onLink);
    $('[data-skip]').addEventListener('click', function (e) { e.preventDefault(); $('#main').focus(); });
    if (!listening) { listening = true; document.addEventListener('keydown', onKey); }

    var parts = (ctx.arg || '').split('/'), view = parts[0] || 'home', isTopic = view === 'tema';
    host.classList.toggle('detail-open', isTopic);
    $('#detail').classList.toggle('hidden', !isTopic);
    $$('.tnb').forEach(function (a) { var on = a.dataset.v === (isTopic ? 'temas' : view); a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    var v = $('#view'), anchor = null;
    if (isTopic) anchor = renderTopic(parts[1], parts[2]);
    else if (view === 'temas') renderTemas(v);
    else if (view === 'indicadores') anchor = renderIndicadores(v, parts[1]);
    else if (view === 'glosario') anchor = renderGlosario(v, parts[1]);
    else renderHome(v);
    setWidths(root);
    if (anchor) {
      var el = root.getElementById(anchor);
      if (el) {
        var det = el.closest('details'); if (det) det.open = true;
        setTimeout(function () {
          el.scrollIntoView({ block: 'start', behavior: 'instant' });
          if (el.classList.contains('gl-entry') || el.classList.contains('ind') || el.classList.contains('gent')) { el.classList.add('hit'); setTimeout(function () { el.classList.remove('hit'); }, 2200); }
          if (el.classList.contains('gent') && view === 'glosario') openEntry(parts[1], false);
        }, 60);
      }
      lastArg = ctx.arg;
    } else if (ctx.arg !== lastArg) { window.scrollTo({ top: 0, behavior: 'instant' }); lastArg = ctx.arg; }
  }
  function isDark() { var t = host.getAttribute('data-theme'); return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; }
  function syncThemeBtn() { $('#themeBtn').textContent = isDark() ? 'Claro' : 'Oscuro'; }

  /* ══ INICIO ══════════════════════════════ */
  function blocksHTML() {
    return '<div class="blocks">' + D.BLOCKS.map(function (b) {
      var ts = D.TOPICS.filter(function (t) { return t.b === b.id; }), done = ts.filter(function (t) { return PROG[t.id] === 2; }).length;
      return '<div class="bcard"><div class="bh"><span class="bn">' + esc(b.n) + '</span><div><h3>' + esc(b.t) + '</h3><p class="bs">' + esc(b.s) + '</p></div></div><ol class="bl">' +
        ts.map(function (t) { return '<li><a class="tlink" href="' + R('tema/' + t.id) + '"><span class="ti">' + esc(NUM(t)) + '</span><span class="tt">' + esc(t.t) + '</span>' + dot(t.id) + '</a></li>'; }).join('') +
        '</ol><div class="bp"><span>' + done + ' de ' + ts.length + ' entendidos</span><span class="bar"><i data-w="' + (ts.length ? Math.round(done / ts.length * 100) : 0) + '"></i></span></div></div>';
    }).join('') + '</div>';
  }
  function renderHome(v) {
    var T = D.TOPICS, M = D.M;
    var done = T.filter(function (t) { return PROG[t.id] === 2; }).length;
    var next = T.filter(function (t) { return PROG[t.id] !== 2; })[0] || T[0];
    var nsec = T.reduce(function (a, t) { return a + (t.nsec || 0); }, 0);
    var stats = [['Capítulos', T.length], ['Apartados', nsec], ['Indicadores', D.INDIC.length], ['Términos', D.ALLG.length]];
    var tools = [
      [R('indicadores'), 'Indicadores', D.INDIC.length + ' indicadores y unidades, cada uno con su fórmula, un ejemplo con números y la trampa en la que es fácil caer.'],
      [R('glosario'), 'Glosario', D.ALLG.length + ' términos: siglas, términos del libro, conceptos de los capítulos y vocabulario básico.'],
      [R('temas'), 'Capítulos', 'El texto completo de cada capítulo con sus recuadros «En sencillo». Usa Ctrl K para buscar cualquier palabra.']
    ];
    v.innerHTML =
      '<section class="cover-hero"><div class="cover-copy"><div class="eyebrow">Manual visual · edición ' + esc(M.edition || '') + '</div><h1>' + clean(M.heroTitle || esc(M.title || '')) + '</h1>' +
      '<p class="lead">Una guía visual para entender la infraestructura, los servicios y la operación del ferrocarril en España.</p>' +
      '<div class="hero-cta"><a class="btn solid" href="' + R('tema/' + next.id) + '">' + (done ? 'Seguir por el capítulo ' : 'Empezar por el capítulo ') + esc(NUM(next)) + ' →</a><a class="btn" href="' + R('temas') + '">Explorar capítulos</a></div>' +
      '<div class="hero-stats">' + stats.map(function (s) { return '<div class="hs"><div class="n">' + s[1] + '</div><div class="l">' + s[0] + '</div></div>'; }).join('') + '</div></div>' +
      '</section>' +
      '<section class="network-section" aria-labelledby="network-title"><div class="sec-h"><h2 id="network-title">La red ferroviaria de España</h2><p>Corredores, marcas, servicios, trenes turísticos y población de la España peninsular.</p></div>' +
      '<div class="official-map"><iframe class="official-map-frame" title="Atlas ferroviario de España: corredores, marcas, servicios, trenes turísticos y población" src="visor-ferroviario/index.html" loading="lazy" allowfullscreen></iframe><div class="map-caption">Elige qué ver en las vías (corredores de alta velocidad, marcas, servicios o trenes turísticos), combínalo con la población y pulsa una línea o una estación para ver rutas y paradas. <a href="visor-ferroviario/index.html" target="_blank" rel="noopener">Abrir a pantalla completa ↗</a></div></div>' +
      '<div class="service-map-note"><p>Los recorridos de los servicios están inferidos sobre la red del IGN a partir de los horarios oficiales (corte del 16-11-2026). Para planificar un viaje, consulta los mapas del operador:</p><div class="service-map-links"><a class="btn" href="https://www.renfe.com/es/es/viajar/informacion-util/mapas-y-lineas/ave-y-larga-distancia" target="_blank" rel="noopener">AVE y Larga Distancia ↗</a><a class="btn" href="https://www.renfe.com/es/es/viajar/informacion-util/mapas-y-lineas/media-distancia-y-avant" target="_blank" rel="noopener">Media Distancia y Avant ↗</a><a class="btn" href="https://www.renfe.com/es/es/ayuda/cercanias" target="_blank" rel="noopener">Cercanías ↗</a></div><a class="official-map-source" href="https://www.adifaltavelocidad.es/sobre-adif-av/red-av/mapa" target="_blank" rel="noopener">Ver mapa en la web de Adif AV ↗</a></div></section>' +
      '<div class="sec-h"><h2>Ruta de lectura</h2><p>' + done + ' de ' + T.length + ' capítulos entendidos. El punto verde marca lo que ya dominas.</p></div>' + blocksHTML() +
      '<div class="sec-h"><h2>Para estudiar</h2><p>Herramientas que cruzan todo el manual.</p></div>' +
      '<div class="tools">' + tools.map(function (x) { return '<a class="card tool" href="' + x[0] + '"><h3>' + x[1] + ' <span aria-hidden="true">→</span></h3><p class="cq">' + x[2] + '</p></a>'; }).join('') + '</div>';
    var zoom=1;
    $$('.rail-toggle',v).forEach(function(b){b.addEventListener('click',function(){var on=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(on));$('[data-rail-layer="'+b.dataset.layer+'"]',v).classList.toggle('hidden',!on);});});
    $$('[data-zoom]',v).forEach(function(b){b.addEventListener('click',function(){zoom=b.dataset.zoom==='reset'?1:Math.max(1,Math.min(4,zoom*(b.dataset.zoom==='in'?1.4:1/1.4)));$('.rail-map',v).style.width=(zoom*100)+'%';});});

  }

  /* ══ CAPÍTULOS ═══════════════════════════ */
  function renderTemas(v) {
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Catálogo</div><h2 class="th-title">Los ' + D.TOPICS.length + ' capítulos, de un vistazo</h2><p class="th-sub">Busca por concepto o por apartado. Cada capítulo empieza con <b>«La pregunta que responde»</b>.</p></div>' +
      '<div class="toolbar"><label class="search"><span class="sr">Buscar capítulo</span><input id="tq" type="search" placeholder="Buscar un concepto…" value="' + esc(temasState.q) + '"></label><span class="count" id="tcount"></span></div><div class="cards" id="tcards"></div>';
    $('#tq', v).addEventListener('input', function (e) { temasState.q = e.target.value; drawCards(v); });
    drawCards(v);
  }
  function drawCards(v) {
    var q = norm(temasState.q.trim());
    var list = D.TOPICS.filter(function (t) { return !q || topicText(t).indexOf(q) > -1; });
    $('#tcount', v).textContent = list.length + (list.length === 1 ? ' capítulo' : ' capítulos');
    $('#tcards', v).innerHTML = list.length ? list.map(function (t) {
      return '<a class="card" href="' + R('tema/' + t.id) + '"><div class="cb">Capítulo ' + esc(NUM(t)) + '</div><h3>' + esc(t.t) + '</h3><p class="cq">' + esc(t.q) + '</p><div class="dmeta me-push">' + dot(t.id) + '</div></a>';
    }).join('') : '<p class="lead">Ningún capítulo coincide con la búsqueda.</p>';
  }

  /* ══ INDICADORES ══════════════════════════ */
  var ORIG = { libro: ['ok', 'Dato del libro'], propia: ['acc', 'Cuenta propia con datos del libro'], inventado: ['ex', 'Ejemplo inventado para entenderlo'] };
  function formulaHTML(x, big) {
    var lhs = '<span class="flhs">' + esc(x.n) + ' =</span>';
    if (x.f) return '<div class="fml' + (big ? ' big' : '') + '">' + lhs + '<span class="frac"><span class="fn">' + esc(x.f.n) + '</span><span class="fd">' + esc(x.f.d) + '</span></span></div>';
    return '<div class="fml' + (big ? ' big' : '') + '">' + lhs + '<span class="fx">' + esc(x.fx) + '</span></div>';
  }
  function indCard(x) {
    var o = ORIG[x.o] || ORIG.libro, top = D.byId[x.t], fam = D.famById[x.fam] || {};
    return '<article class="ind" id="ind-' + esc(x.id) + '"><div class="ind-h"><div class="cb">' + esc(fam.n) + '</div><h3>' + esc(x.n) + '</h3><p class="iq">' + esc(x.q) + '</p></div>' +
      '<p class="idesc">' + clean(nb(x.d)) + '</p>' +
      '<div class="ibox"><div class="ik">Fórmula</div>' + formulaHTML(x, true) + '<div class="iu"><span class="ik">Unidad</span> ' + esc(x.u) + '</div></div>' +
      '<div class="iex"><div class="iexh"><span class="ik">Ejemplo</span><span class="chip ' + o[0] + '">' + o[1] + '</span></div><p>' + clean(nb(x.ej)) + '</p></div>' +
      '<p class="itrap"><b>Ojo:</b> ' + clean(nb(x.trap)) + '</p>' +
      (x.dax ? '<details class="idax"><summary>Si lo calcularas en Power BI</summary><pre class="dcode"><code>' + esc(x.dax) + '</code></pre></details>' : '') +
      (top && ID.test(String(x.a)) ? '<a class="ilink" href="' + R('tema/' + x.t + '/' + x.a) + '">Leer en el capítulo ' + esc(NUM(top)) + ' →</a>' : '') +
      (x.g && D.GBY && D.GBY[x.g] ? '<a class="ilink" href="' + R('glosario/' + x.g) + '">Ver en el glosario →</a>' : '') + '</article>';
  }
  function renderIndicadores(v, anchor) {
    if (anchor) { indState = { q: '', f: '', m: 'fichas' }; }
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Indicadores</div><h2 class="th-title">' + D.INDIC.length + ' indicadores del manual</h2>' +
      '<p class="th-sub">Cada uno con la pregunta que responde, una explicación en llano, la fórmula, un ejemplo con números y la trampa habitual. La etiqueta del ejemplo te dice si el dato es <b>del libro</b>, una <b>cuenta propia con datos del libro</b> o un <b>ejemplo inventado</b>.</p></div>' +
      '<div class="toolbar"><label class="search"><span class="sr">Buscar indicador</span><input id="iq" type="search" placeholder="Buscar un indicador…" value="' + esc(indState.q) + '"></label><span class="count" id="icount"></span>' +
      '<div class="seg" id="imode" role="group" aria-label="Modo de vista"><button type="button" data-m="fichas">Fichas</button><button type="button" data-m="chuleta">Chuleta</button></div></div>' +
      '<div class="toolbar"><div class="filters" id="ifam" role="group" aria-label="Filtrar por familia"><button class="fb" data-f="">Todas</button>' + D.INDFAM.map(function (f) { return '<button class="fb" data-f="' + esc(f.id) + '">' + esc(f.n) + '</button>'; }).join('') + '</div></div>' +
      '<div id="ibody"></div>';
    function syncBtns() {
      $$('#ifam .fb', v).forEach(function (b) { var on = b.dataset.f === indState.f; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      $$('#imode button', v).forEach(function (b) { var on = b.dataset.m === indState.m; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    }
    $('#iq', v).addEventListener('input', function (e) { indState.q = e.target.value; drawInd(v); });
    $('#ifam', v).addEventListener('click', function (e) { var b = e.target.closest('.fb'); if (!b) return; indState.f = b.dataset.f; syncBtns(); drawInd(v); });
    $('#imode', v).addEventListener('click', function (e) { var b = e.target.closest('button[data-m]'); if (!b) return; indState.m = b.dataset.m; syncBtns(); drawInd(v); });
    syncBtns(); drawInd(v);
    return anchor && ID.test(anchor) ? 'ind-' + anchor : null;
  }
  function drawInd(v) {
    var q = norm(indState.q.trim());
    var list = D.INDIC.filter(function (x) { return (!indState.f || x.fam === indState.f) && (!q || indText(x).indexOf(q) > -1); });
    $('#icount', v).textContent = list.length + (list.length === 1 ? ' indicador' : ' indicadores');
    var body = $('#ibody', v);
    if (!list.length) { body.innerHTML = '<p class="lead">Ningún indicador coincide con la búsqueda.</p>'; return; }
    if (indState.m === 'chuleta') {
      body.innerHTML = '<p class="ichu-intro">Todos de un vistazo para repasar. Pulsa un nombre para abrir su ficha.</p><div class="tw"><table class="dxtbl ichu"><thead><tr><th>Indicador</th><th>Fórmula</th><th>Unidad</th><th>Ejemplo rápido</th></tr></thead><tbody>' +
        list.map(function (x) { return '<tr><td><a href="' + R('indicadores/' + x.id) + '">' + esc(x.n) + '</a><span class="ifamt">' + esc((D.famById[x.fam] || {}).n) + '</span></td><td>' + formulaHTML(x, false) + '</td><td>' + esc(x.u) + '</td><td>' + clean(nb(x.ej)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      return;
    }
    body.innerHTML = D.INDFAM.map(function (f) {
      var xs = list.filter(function (x) { return x.fam === f.id; }); if (!xs.length) return '';
      return '<section class="ifam"><div class="sec-h"><h2>' + esc(f.n) + '</h2><p>' + esc(f.s) + '</p></div><div class="ind-grid">' + xs.map(indCard).join('') + '</div></section>';
    }).join('');
  }

  /* ══ GLOSARIO ═════════════════════════════ */
  function renderGlosario(v, anchor) {
    if (D.GBY) return renderFullGlosario(v, anchor);
    var cnt = { s: 0, l: 0, m: 0, v: 0 };
    D.ALLG.forEach(function (g) { cnt[gcat(g)]++; });
    function fbtn(f, label) { return cnt[f] ? '<button class="fb" data-f="' + f + '">' + label + ' (' + cnt[f] + ')</button>' : ''; }
    v.innerHTML = '<div class="modehead"><div class="eyebrow">Glosario</div><h2 class="th-title">' + D.ALLG.length + ' términos</h2><p class="th-sub">Las <b>siglas</b> y los <b>términos</b> del glosario del libro, los conceptos de cada capítulo y el <b>vocabulario básico</b> que el libro da por sabido. Cada término enlaza con el sitio donde se explica.</p></div>' +
      '<div class="toolbar"><label class="search"><span class="sr">Buscar término</span><input id="gq" type="search" placeholder="Buscar una sigla o un término…" value="' + esc(glosState.q) + '"></label><span class="count" id="gcount"></span></div>' +
      '<div class="toolbar"><div class="filters" id="gf" role="group" aria-label="Filtrar términos"><button class="fb" data-f="">Todos</button>' + fbtn('s', 'Siglas') + fbtn('l', 'Términos del libro') + fbtn('m', 'Conceptos de los capítulos') + fbtn('v', 'Vocabulario básico') + '</div></div><div class="cards" id="gcards"></div>';
    function syncBtns() { $$('#gf .fb', v).forEach(function (b) { var on = b.dataset.f === glosState.f; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
    $('#gq', v).addEventListener('input', function (e) { glosState.q = e.target.value; drawGloss(v); });
    $('#gf', v).addEventListener('click', function (e) { var b = e.target.closest('.fb'); if (!b) return; glosState.f = b.dataset.f; syncBtns(); drawGloss(v); });
    syncBtns(); drawGloss(v);
  }
  function drawGloss(v) {
    var q = norm(glosState.q.trim());
    var list = D.ALLG.filter(function (g) { return (!glosState.f || gcat(g) === glosState.f) && (!q || norm(g.k + ' ' + g.d).indexOf(q) > -1); })
      .sort(function (a, b) { return a.k.localeCompare(b.k, 'es', { sensitivity: 'base' }); });
    $('#gcount', v).textContent = list.length + (list.length === 1 ? ' término' : ' términos');
    $('#gcards', v).innerHTML = list.length ? list.map(function (g) {
      return '<a class="card" href="' + gHref(g) + '"><div class="cb">' + GCAT[gcat(g)] + '</div><h3>' + esc(g.k) + '</h3><p class="cq clamp">' + esc(g.d) + '</p></a>';
    }).join('') : '<p class="lead">Ningún término coincide con la búsqueda.</p>';
  }

  /* Glosario completo: tabla de siglas y entradas por familias. Todo el texto del contenido pasa por clean();
     los esquemas son imágenes SVG en data: (no ejecutan nada) y solo se aceptan con ese formato exacto. */
  var SVG_DATA = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/;
  function gVis(id) {
    var x = D.GVIS[id]; if (!x) return '';
    var inner = x.img && x.img.length <= 300000 && SVG_DATA.test(x.img) ? '<img class="gvis-img" src="' + x.img + '" alt="' + esc(x.alt) + '" loading="lazy">' : (x.html ? clean(x.html) : '');
    if (!inner) return '';
    return '<figure class="gvis"><div class="gvis-in">' + inner + '</div><figcaption><b>' + esc(x.t) + '.</b> ' + esc(x.alt) + '</figcaption></figure>';
  }
  function gSecLabel(t, a) {
    var top = D.byId[t]; if (!top || !ID.test(String(a))) return null;
    var s = a === 's-vocab' ? 'vocabulario básico' : ((D.BOOK[t].secs.filter(function (x) { return x.id === a; })[0] || {}).t || '');
    return 'Tema ' + NUM(top) + (s ? ' · ' + s : '');
  }
  function gSiglas(g) { return (g.al || []).filter(function (a) { return a !== g.k && String(a).length <= 9 && (/[A-Z].*[A-Z]/.test(a) || /[·.\/]/.test(a)); }); }
  /* Tarjeta del listado: término, siglas y definición. El resto (contexto, ejemplo, matiz, esquema, «se confunde con»,
     relacionados, dónde se explica y fuente) se abre en una ventana sobre la página: openEntry(). */
  function gTag(g) { return g.kind === 'vocab' ? '<span class="chip">Definición general, no del libro</span>' : (g.kind === 'cap' ? '<span class="chip">Concepto de un capítulo</span>' : ''); }
  function gEntry(g) {
    var sig = gSiglas(g);
    return '<article class="gent" id="g-' + esc(g.id) + '" data-s="' + esc(gText(g)) + '">' +
      '<div class="gent-h"><h3>' + esc(g.k) + '</h3>' + (sig.length ? '<span class="gsig-l">' + sig.map(esc).join(' · ') + '</span>' : '') + gTag(g) + '</div>' +
      '<p class="gd">' + clean(g.d) + '</p>' +
      '<a class="gmore" href="' + R('glosario/' + g.id) + '">Ver la ficha completa<span class="sr"> de ' + esc(g.k) + '</span> →</a>' +
      '</article>';
  }
  function gFull(g) {
    var sig = gSiglas(g), fam = (D.GFAM.filter(function (f) { return f.id === g.fam; })[0] || {}).n;
    var m = (g.m || []).map(function (x) { var l = x[2] || gSecLabel(x[0], x[1]); return l ? '<a href="' + R('tema/' + x[0] + '/' + x[1]) + '">' + esc(l) + '</a>' : ''; }).filter(Boolean);
    var src = (g.s || []).filter(function (s) { return /^https:\/\//.test(String(s[1])); });
    var rel = (g.r || []).map(function (id) { return D.GBY[id]; }).filter(function (o) { return o && o.id !== g.id; });
    return '<div class="gm-eyebrow">' + esc(fam || 'Glosario') + '</div>' +
      '<div class="gent-h"><h2 id="gm-title" tabindex="-1">' + esc(g.k) + '</h2>' + (sig.length ? '<span class="gsig-l">' + sig.map(esc).join(' · ') + '</span>' : '') + gTag(g) + '</div>' +
      '<p class="gd">' + clean(g.d) + '</p>' +
      (g.c ? '<div class="gctx"><div class="gk">En contexto</div><p>' + esc(g.c) + '</p></div>' : '') +
      (g.e ? '<div class="gex"><div class="gk">Ejemplo</div><p>' + esc(g.e) + '</p></div>' : '') +
      (g.x ? '<div class="gxm"><div class="gk">Matiz técnico</div><p>' + clean(g.x) + '</p></div>' : '') +
      (g.n ? '<p class="gn"><b>Uso.</b> ' + clean(g.n) + '</p>' : '') +
      (g.v ? gVis(g.v) : '') +
      (g.cf && g.cf.length ? '<div class="gcf"><div class="gk">Se confunde con</div><ul>' + g.cf.map(function (c) { var o = D.GBY[c[0]]; return '<li>' + (o ? '<a href="' + R('glosario/' + o.id) + '">' + esc(o.k) + '</a>: ' : '') + clean(c[1]) + '</li>'; }).join('') + '</ul></div>' : '') +
      (rel.length ? '<div class="grel"><div class="gk">Relacionado</div><ul>' + rel.map(function (o) { return '<li><a href="' + R('glosario/' + o.id) + '">' + esc(o.k) + '</a></li>'; }).join('') + '</ul></div>' : '') +
      (m.length ? '<p class="gm"><span class="gk">En el manual</span> ' + m.join(' · ') + '</p>' : '') +
      (src.length ? '<p class="gsrc"><span class="gk">Fuente</span> ' + src.map(function (s) { return '<a href="' + esc(s[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(s[0]) + '</a>'; }).join(' · ') + '</p>' : '') +
      (g.c || g.e ? '<p class="gnote-ai">«En contexto» y «Ejemplo» son explicaciones añadidas al manual, no texto del libro.</p>' : '');
  }
  /* Ventana del glosario: dos vistas sobre la misma capa. «siglas» = tabla de siglas con su buscador;
     <id> = ficha completa de un término. Desde las siglas, «Ver entrada» abre la ficha con «← Siglas» para volver. */
  var gm = null, gmOpener = null, sigQ = '';
  function entryOf(href) {
    var m = /^#\/estudio\/glosario\/([a-z0-9-]+)$/.exec(String(href || ''));
    if (!m || !D || !D.GBY) return null;
    return m[1] === 'siglas' && D.SIGLAS.length ? 'siglas' : (D.GBY[m[1]] ? m[1] : null);
  }
  function siglaRow(r) {
    return '<li class="gsl-it" data-s="' + esc(norm(r.s + ' ' + r.d + ' ' + (r.x || ''))) + '"><span class="gsl-s">' + esc(r.s) + '</span><div class="gsl-d"><b>' + esc(r.d) + '</b>' +
      (r.x ? '<span class="gsl-x">' + esc(r.x) + '</span>' : '') + (r.n ? '<span class="gnote">' + esc(r.n) + '</span>' : '') +
      (r.g && D.GBY[r.g] ? '<a class="gto" href="' + R('glosario/' + r.g) + '">Ver entrada<span class="sr"> de ' + esc(r.s) + '</span> →</a>' : '') + '</div></li>';
  }
  function siglasView() {
    return '<div class="gm-eyebrow">Glosario</div><div class="gent-h"><h2 id="gm-title" tabindex="-1">Siglas y abreviaturas</h2></div>' +
      '<p class="gsl-lead">Siglas, acrónimos, símbolos y abreviaturas, por orden alfabético. «Ver entrada» abre la explicación completa.</p>' +
      '<label class="search gsl-q"><span class="sr">Buscar una sigla</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>' +
      '<input id="gsl-in" type="search" placeholder="Busca una sigla o su significado…" autocomplete="off" value="' + esc(sigQ) + '"></label>' +
      '<p class="count gsl-count" id="gsl-count" aria-live="polite"></p>' +
      '<ul class="gsl" id="gsl">' + D.SIGLAS.map(siglaRow).join('') + '</ul><p class="lead gsl-empty" id="gsl-empty" hidden>Ninguna sigla coincide.</p>';
  }
  function drawSiglas() {
    var q = norm(sigQ.trim()), n = 0;
    $$('.gsl-it', gm).forEach(function (li) { var on = !q || li.dataset.s.indexOf(q) > -1; li.hidden = !on; if (on) n++; });
    $('#gsl-count', gm).textContent = n + (n === 1 ? ' sigla' : ' siglas') + (q ? ' de ' + D.SIGLAS.length : '');
    $('#gsl-empty', gm).hidden = !!n;
  }
  function openEntry(id, push) {
    if (!root || !(id === 'siglas' || (D.GBY && D.GBY[id]))) return;
    var fresh = !gm, from = gm && gm.dataset.id;                   // de una vista a otra: una sola entrada de historial
    if (!gm) {
      gmOpener = root.activeElement;
      gm = document.createElement('div'); gm.className = 'gmodal';
      gm.innerHTML = '<div class="gmodal-box" role="dialog" aria-modal="true" aria-labelledby="gm-title"><button type="button" class="gmodal-x" aria-label="Cerrar">×</button><div class="gmodal-body"></div></div>';
      root.appendChild(gm);
      gm.addEventListener('click', function (e) {
        if (e.target === gm || e.target.closest('.gmodal-x')) closeEntry();
        else if (e.target.closest('.gm-back')) openEntry('siglas', true);
      });
      gm.addEventListener('input', function (e) { if (e.target.id === 'gsl-in') { sigQ = e.target.value; drawSiglas(); } });
      gm.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); if (e.target.id === 'gsl-in' && sigQ) { sigQ = e.target.value = ''; drawSiglas(); return; } closeEntry(); return; }
        if (e.key !== 'Tab') return;                               // el foco no sale de la ventana
        var f = $$('a[href],button,input', gm).filter(function (x) { return x.getClientRects().length; }); if (!f.length) return;
        var first = f[0], last = f[f.length - 1], act = root.activeElement;
        if (e.shiftKey && act === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
      });
    }
    var body = $('.gmodal-body', gm), box = $('.gmodal-box', gm);
    box.classList.toggle('gmodal-wide', id === 'siglas');
    if (id === 'siglas') { body.innerHTML = siglasView(); drawSiglas(); }
    else body.innerHTML = (from === 'siglas' || (from && gm.dataset.back) ? '<button type="button" class="gm-back">← Siglas</button>' : '') + gFull(D.GBY[id]);
    gm.dataset.back = id !== 'siglas' && (from === 'siglas' || (from && gm.dataset.back)) ? '1' : '';
    body.scrollTop = 0;
    gm.dataset.id = id;
    var href = R('glosario/' + id);
    if (push && location.hash !== href) { try { history[fresh ? 'pushState' : 'replaceState'](null, '', href); } catch (e) { /* sin historial: la ventana funciona igual */ } }
    var input = id === 'siglas' && $('#gsl-in', gm);
    if (input && matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });   // en móvil no abre el teclado solo
    else $('#gm-title', gm).focus({ preventScroll: true });
  }
  function closeEntry() {
    if (!gm) return;
    var id = gm.dataset.id; gm.remove(); gm = null;
    if (entryOf(location.hash)) { try { history.replaceState(null, '', R('glosario')); } catch (e) { /* nada */ } }
    var card = id !== 'siglas' && root && root.getElementById('g-' + id);
    if (card && card.getClientRects().length && !(gmOpener && gmOpener.closest && gmOpener.closest('.gsl-open'))) {   // vuelve a la tarjeta del listado
      card.scrollIntoView({ block: 'center', behavior: 'instant' });
      card.classList.add('hit'); setTimeout(function () { card.classList.remove('hit'); }, 1800);
    }
    if (gmOpener && gmOpener.isConnected && gmOpener.focus) gmOpener.focus({ preventScroll: true });
    gmOpener = null;
  }
  /* Enlaces internos: una ficha del glosario se abre en la ventana sin salir de la página (también desde un
     capítulo o un indicador). Un enlace a la misma ruta en la que ya estás vuelve a llevarte a su destino:
     el navegador no lanza hashchange si la dirección no cambia. */
  function onLink(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href^="#/estudio"]'); if (!a) return;
    var href = a.getAttribute('href'), id = entryOf(href);
    if (id) { e.preventDefault(); openEntry(id, true); return; }
    if (href === location.hash) { e.preventDefault(); if (gm) closeEntry(); window.dispatchEvent(new HashChangeEvent('hashchange')); }
  }
  function renderFullGlosario(v, anchor) {
    if (anchor) glosState.q = '';
    var byFam = {}; D.GFAM.forEach(function (f) { byFam[f.id] = []; });
    D.ALLG.forEach(function (g) { if (byFam[g.fam]) byFam[g.fam].push(g); });
    var nav = '<nav class="gnav" aria-label="Ir a una familia del glosario">' + D.GFAM.map(function (f) { return '<a class="fb" href="' + R('glosario/gf-' + f.id) + '">' + esc(f.n) + '</a>'; }).join('') + '</nav>';
    var fams = D.GFAM.map(function (f) {
      var xs = (byFam[f.id] || []).slice().sort(function (a, b) { return a.k.localeCompare(b.k, 'es', { sensitivity: 'base' }); });
      if (!xs.length) return '';
      return '<section class="gsec gfam" id="gf-' + esc(f.id) + '"><div class="sec-h"><h2>' + esc(f.n) + '</h2><p>' + esc(f.s) + '</p></div>' + (f.v ? gVis(f.v) : '') + '<div class="gents">' + xs.map(gEntry).join('') + '</div></section>';
    }).join('');
    var sigBtn = D.SIGLAS.length ? '<a class="gsl-open" href="' + R('glosario/siglas') + '" aria-haspopup="dialog"><span class="gsl-ic" aria-hidden="true">Aa</span><span class="gsl-l"><span class="gsl-t">Siglas y abreviaturas</span><span class="gsl-n">' + D.SIGLAS.length + ' siglas</span></span></a>' : '';
    v.innerHTML = '<div class="modehead gmh"><div class="gmh-in"><div><div class="eyebrow">Glosario</div><h2 class="th-title">Glosario</h2></div>' + sigBtn + '</div></div>' +
      '<div class="toolbar"><label class="search"><span class="sr">Buscar en el glosario</span><input id="gq" type="search" placeholder="Busca un término o una palabra de su definición…" value="' + esc(glosState.q) + '"></label><span class="count" id="gcount"></span></div>' +
      '<p class="gsl-hint" id="gsl-hint" hidden></p>' +
      nav + fams + '<p class="lead" id="gempty" hidden>Ningún término coincide con la búsqueda.</p>';
    $('#gq', v).addEventListener('input', function (e) { glosState.q = e.target.value; drawFullGloss(v); });
    $('#gsl-hint', v).addEventListener('click', function (e) { if (e.target.closest('.gsl-hint-a')) { e.preventDefault(); sigQ = glosState.q; openEntry('siglas', true); } });
    drawFullGloss(v);
    if (anchor === 'siglas') { setTimeout(function () { openEntry('siglas', false); }, 0); return null; }
    if (!anchor || !ID.test(anchor)) return null;
    return D.GBY[anchor] ? 'g-' + anchor : anchor;
  }
  function drawFullGloss(v) {
    var q = norm(glosState.q.trim()), n = 0;
    $$('.gent', v).forEach(function (a) { var on = !q || a.dataset.s.indexOf(q) > -1; a.hidden = !on; if (on) n++; });
    $$('.gfam', v).forEach(function (s) { s.hidden = !!q && !$('.gent:not([hidden])', s); });
    $('.gnav', v).hidden = !!q;
    $('#gcount', v).textContent = n + (n === 1 ? ' término' : ' términos');
    // Las siglas viven en su ventana: si la búsqueda coincide con alguna, se avisa con un acceso directo.
    var ns = q ? D.SIGLAS.filter(function (r) { return norm(r.s + ' ' + r.d + ' ' + (r.x || '')).indexOf(q) > -1; }).length : 0, hint = $('#gsl-hint', v);
    hint.hidden = !ns;
    hint.innerHTML = ns ? (ns === 1 ? '1 sigla coincide' : ns + ' siglas coinciden') + ' con la búsqueda. <a class="gsl-hint-a" href="' + R('glosario/siglas') + '">Ver en Siglas y abreviaturas →</a>' : '';
    $('#gempty', v).hidden = !!n;
  }

  /* ══ CAPÍTULO ═════════════════════════════ */
  var tocClose = null;
  function renderTopic(id, anchor) {
    var t = D.byId[id];
    if (!t) { location.hash = R('temas'); return null; }
    if (!PROG[t.id]) setProg(t.id, 1);
    var bk = D.BOOK[t.id], b = D.blockById[t.b] || { t: '' };
    var prev = D.TOPICS[t._i - 1], next = D.TOPICS[t._i + 1];
    var toc = [], body = '';
    function chap(n, k, title, inner) { return '<section class="chap" id="c' + n + '"><div class="chap-h"><span class="chap-n">' + n + '</span><div><div class="k">' + k + '</div><h2>' + title + '</h2></div></div>' + inner + '</section>'; }
    function blk(sid, title, inner) { toc.push([sid, title, 1]); return '<div class="blk" id="' + sid + '"><h3>' + title + '</h3>' + inner + '</div>'; }

    toc.push(['ch', 'Antes de leer']);
    body += chap(1, 'Parte 1', 'Antes de leer',
      blk('s-idea', 'La idea en una frase', '<p class="oneliner">' + esc(t.one) + '</p>') +
      blk('s-rec', 'Lo que te llevas de este capítulo', '<div class="recall"><div class="ck">Recuerda</div><ul>' + (t.rec || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>') +
      (t.pre ? blk('s-mapa', esc(t.pre_t || 'El mapa del capítulo'), '<div class="libro pre-libro">' + clean(t.pre) + '</div>') : '') +   // bloque previo al vocabulario (<id>.antes.md)
      (t.vocab && t.vocab.length ? blk('s-vocab', 'Vocabulario mínimo para leer el capítulo', '<p class="vintro">Palabras que el libro usa sin explicar porque las da por sabidas. Son definiciones generales, no del libro.</p><dl class="gl">' + t.vocab.map(function (v, i) { return '<div><dt>' + esc(v[0]) + '</dt><dd>' + esc(v[1]) + '</dd>' + (typeof v[3] === 'string' && v[3] ? '<dd class="vlk">Fuente oficial: ' + clean(v[3]) + '</dd>' : '') + (typeof v[2] === 'string' && v[2] ? '<dd class="vbt"><button type="button" class="vbtn" data-vf="' + i + '"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="m7 14 3-3 3 3 4-5"/></svg>Ver explicación visual</button></dd>' : '') + '</div>'; }).join('') + '</dl>') : '') +
      (t.clean ? '' : blk('s-como', 'Cómo leer el capítulo', '<div class="call analog"><div class="ck">Guía rápida</div><div class="dbody"><p>El texto del libro está <b>completo</b> y en su orden. Debajo de los apartados que lo necesitan hay un recuadro <b>«En sencillo»</b> con la idea en llano, una analogía o un ejemplo con números; las cuentas que no son del libro lo indican.</p><p>Si ves <mark class="dudoso" title="Pasaje dudoso de la transcripción">[¿?]</mark>, es un pasaje que no se leyó con seguridad: al final del capítulo tienes la lista de dudas para contrastar con el libro.</p></div></div>')));

    if (!t.clean) toc.push(['ch', 'El capítulo completo']);
    bk.secs.filter(function (s) { return s.lvl <= 2; }).forEach(function (s) { toc.push([s.id, s.t, s.lvl]); });
    body += t.clean ? '<div class="libro">' + clean(bk.html) + '</div>' : chap(2, 'Parte 2', 'El capítulo completo', '<div class="libro">' + clean(bk.html) + '</div>');

    var tocHTML = '<div class="tt">En este capítulo</div><ol>' + toc.map(function (x) {
      if (x[0] === 'ch') return '<li class="ch">' + esc(x[1]) + '</li>';
      return '<li class="' + (x[2] === 2 ? 'sub' : '') + '"><a href="' + R('tema/' + t.id + '/' + x[0]) + '" data-sec="' + esc(x[0]) + '">' + esc(x[1]) + '</a></li>';
    }).join('') + '</ol><div class="tprog"><div class="l">Tu progreso: <span id="progLbl"></span></div><button type="button" class="pbtn" id="progBtn"></button></div>';

    $('#detail').innerHTML = '<div class="dtop"><a class="dback" href="' + R('temas') + '">← Capítulos</a><span class="sep">/</span><span>' + esc(b.t) + '</span><span class="sep">/</span><span>Capítulo ' + esc(NUM(t)) + '</span></div>' +
      '<div class="dhero"><div><h1>' + esc(t.t) + '</h1><div class="dmeta"><span class="chip acc">Capítulo ' + esc(NUM(t)) + '</span><span class="chip">' + esc(t.nsec) + ' apartados</span></div><p class="dhero-q">' + esc(t.q) + '</p></div>' +
      '</div>' +
      '<div class="sbar" id="sbar"><button type="button" class="sb-btn" id="tocBtn" aria-expanded="false" aria-controls="stoc"><span aria-hidden="true">☰</span> Índice<span class="sb-now" id="tocNow"></span></button>' +
      '<button type="button" class="sb-btn" id="notesBtn" aria-expanded="false" aria-label="Mis marcas y notas">✎ Mis notas<span class="sb-n" id="notesN"></span></button>' +
      '<nav class="stoc" id="stoc" aria-label="Índice del capítulo" hidden>' + tocHTML + '</nav></div>' +
      '<div class="study"><div class="smain"><div class="sbody" id="sbody">' + body + '</div>' +
      '<nav class="dnav" aria-label="Capítulo anterior y siguiente">' + (prev ? '<a href="' + R('tema/' + prev.id) + '"><span class="nk">← Anterior</span><span class="nt">' + esc(prev.t) + '</span></a>' : '<span></span>') + (next ? '<a class="nx" href="' + R('tema/' + next.id) + '"><span class="nk">Siguiente →</span><span class="nt">' + esc(next.t) + '</span></a>' : '') + '</nav></div></div>';

    var stoc = $('#stoc'), tocBtn = $('#tocBtn');
    function setToc(on) { stoc.hidden = !on; tocBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) { var c = $('a.on', stoc); if (c) c.scrollIntoView({ block: 'nearest' }); } }
    tocBtn.addEventListener('click', function (e) { e.stopPropagation(); setToc(stoc.hidden); });
    $('#sbar').addEventListener('keydown', function (e) { if (e.key === 'Escape' && !stoc.hidden) { setToc(false); tocBtn.focus(); } });
    if (tocClose) document.removeEventListener('pointerdown', tocClose, true);
    var sbar = $('#sbar');
    tocClose = function (e) { if (!sbar.isConnected) return; if (!stoc.hidden && (e.composedPath ? e.composedPath().indexOf(sbar) < 0 : true)) setToc(false); };
    document.addEventListener('pointerdown', tocClose, true);
    $$('.stoc a[data-sec]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); var el = root.getElementById(a.dataset.sec); setToc(false); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); });
    $('#progBtn').addEventListener('click', function () { PROG[t.id] = PROG[t.id] === 2 ? 1 : 2; lsSet('prog', PROG); syncProgBtn(t); });
    syncProgBtn(t);
    if (tocObs) tocObs.disconnect();
    if ('IntersectionObserver' in window) {
      tocObs = new IntersectionObserver(function (ents) { ents.forEach(function (en) { if (en.isIntersecting) { $$('.stoc a').forEach(function (a) { var on = a.dataset.sec === en.target.id; a.classList.toggle('on', on); if (on) $('#tocNow').textContent = a.textContent; }); } }); }, { rootMargin: '-90px 0px -70% 0px' });
      $$('.blk, .libro h3[id], .libro h4[id]', $('#detail')).forEach(function (s) { tocObs.observe(s); });
    }
    $$('.visor', $('#detail')).forEach(function (v) { Marcas.visor(v); });
    Marcas.mount({ key: P + 'marcas', chapter: t.id, root: $('#sbody'), notesBtn: $('#notesBtn'), countEl: $('#notesN'), host: root });
    Marcas.pinBar($('#sbar'), $('.appbar'));
    Marcas.backTop($('#detail'), root);
    $$('.vbtn', $('#detail')).forEach(function (b) { b.addEventListener('click', function () { var v = t.vocab[+b.dataset.vf]; Marcas.viewer({ title: v[0], text: v[1], html: clean(v[2]), ret: b, host: root }); }); });
    mountSims();
    return anchor && ID.test(anchor) ? anchor : null;
  }

  /* Simuladores (<div class="sim sim-…">, dentro de .est-skip para que las marcas no los toquen): el contenido solo trae
     el hueco y, en el organigrama, sus datos JSON como texto (.sim-data). El código es público y va aparte:
     manual-estudio/simuladores.js (copia literal del simuladores.js del manual), que se carga la primera vez que hace falta. */
  var simsP = null;
  function loadSims() {
    if (window.SIMS) return Promise.resolve();
    if (!simsP) simsP = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = assetUrl('me-sims', './manual-estudio/simuladores.js');
      s.onload = function () { window.SIMS ? resolve() : reject(new Error('sin SIMS')); };
      s.onerror = function () { simsP = null; s.parentNode.removeChild(s); reject(new Error('sin red')); };
      document.head.appendChild(s);
    });
    return simsP;
  }
  function mountSims() {
    var d = $('#detail'); if (!d || !$('.sim', d)) return;
    loadSims().then(function () { if (d.isConnected) window.SIMS.mount(d); })
      .catch(function () { $$('.sim-ns', d).forEach(function (p) { p.textContent = 'No se ha podido cargar el simulador. Revisa la conexión y vuelve a abrir el capítulo.'; }); });
  }
  function syncProgBtn(t) {
    var p = PROG[t.id] || 0, bt = $('#progBtn'), l = $('#progLbl'); if (!bt) return;
    l.textContent = p === 2 ? 'Entendido' : 'En estudio';
    bt.textContent = p === 2 ? 'Marcar como en estudio' : 'Lo entiendo';
    bt.classList.toggle('on', p === 2);
  }

  /* ══ BUSCADOR (Ctrl K  o  /) ═════════════ */
  function openQk() {
    if (qk || !root) return;
    qkPrev = root.activeElement;
    qk = document.createElement('div'); qk.className = 'qk';
    qk.innerHTML = '<div class="qk-box" role="dialog" aria-modal="true" aria-label="Buscar en el manual"><input type="text" placeholder="Busca un concepto, una sigla o una palabra del texto…" aria-label="Buscar" autocomplete="off"><div class="qk-res" role="listbox"></div><div class="qk-foot"><span>↑ ↓ para moverte</span><span>Intro para abrir</span><span>Esc para cerrar</span></div></div>';
    root.appendChild(qk);
    var inp = $('input', qk);
    inp.addEventListener('input', function () { qkSel = 0; drawQk(inp.value); });
    qk.addEventListener('click', function (e) { if (e.target === qk) closeQk(); var it = e.target.closest('.qk-it'); if (it) { var h = it.dataset.h; closeQk(); goTo(h); } });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); qkSel = Math.min(qkSel + 1, qkRes.length - 1); drawQk(inp.value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); qkSel = Math.max(qkSel - 1, 0); drawQk(inp.value); }
      else if (e.key === 'Enter' && qkRes[qkSel]) { var h = qkRes[qkSel].h; closeQk(); goTo(h); }
      else if (e.key === 'Escape') { closeQk(); }
    });
    drawQk(''); inp.focus();
  }
  function goTo(h) {
    var id = entryOf(h);
    if (id) openEntry(id, true);
    else if (h === location.hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = h;
  }
  function closeQk() { if (!qk) return; qk.remove(); qk = null; if (qkPrev && qkPrev.focus) qkPrev.focus(); }
  function snippet(x, q) {
    if (!x.txt || norm(x.n).indexOf(q) > -1) return esc(plain(x.d));
    var i = norm(x.txt).indexOf(q); if (i < 0) return esc(plain(x.d));
    var a = Math.max(0, i - 50), z = Math.min(x.txt.length, i + q.length + 90);
    return (a ? '…' : '') + esc(x.txt.slice(a, i)) + '<mark>' + esc(x.txt.slice(i, i + q.length)) + '</mark>' + esc(x.txt.slice(i + q.length, z)) + (z < x.txt.length ? '…' : '');
  }
  function drawQk(raw) {
    var q = norm(raw.trim());
    if (q) {
      qkRes = D.IDX.filter(function (x) { return x.s.indexOf(q) > -1 || norm(x.n).indexOf(q) > -1; });
      qkRes.sort(function (a, b) { var ta = norm(a.n).indexOf(q) > -1 ? 0 : 1, tb = norm(b.n).indexOf(q) > -1 ? 0 : 1; return ta - tb || RANK[a.k] - RANK[b.k]; });
      qkRes = qkRes.slice(0, 30);
    } else qkRes = D.IDX.filter(function (x) { return x.k === 'Sección' || x.k === 'Capítulo'; }).slice(0, 12);
    $('.qk-res', qk).innerHTML = qkRes.length ? qkRes.map(function (x, i) { return '<button type="button" class="qk-it' + (i === qkSel ? ' on' : '') + '" role="option" aria-selected="' + (i === qkSel) + '" data-h="' + esc(x.h) + '"><span class="qi">' + esc(x.k) + '</span><span class="qt"><span class="qn">' + esc(x.n) + '</span><span class="qd">' + (q ? snippet(x, q) : esc(plain(x.d))) + '</span></span></button>'; }).join('') : '<div class="qk-empty">Sin resultados. Prueba con una palabra más corta.</div>';
  }
  function onKey(e) {
    if (!host || !host.isConnected) return;                    // otra pestaña del área privada: no es asunto del manual
    if (gm) return;                                             // con la ficha abierta, el teclado es de la ventana
    var t = (e.composedPath && e.composedPath()[0]) || e.target, typing = t && /^(input|textarea|select)$/i.test(t.tagName || '');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); qk ? closeQk() : openQk(); }
    else if (e.key === '/' && !qk && !typing) { e.preventDefault(); openQk(); }
  }

  return { render: render, _clean: clean };
})();
