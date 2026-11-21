/* Cabina: pinta los indicadores del atlas desde capas/cabina.json (tools/build-cabina.mjs). No calcula horarios en el
   navegador: todo llega precalculado y los titulares ya vienen escritos en el HTML.
   Universo de la oferta: todos los trenes de viajeros con horario público (también Cercanías de ancho ibérico e iryo).
   Reglas de diseño (manual de Data Storytelling): titular = conclusión; color de énfasis solo en lo que nombra el
   titular; cada gráfico con su tabla de datos («Ver los datos»); tablas de 10 filas con «ver todas».
   Sin estilos en línea (CSP): barras HTML con CSSOM y gráficos SVG con atributos. */
(function(){
  'use strict';
  const CFG=window.AtlasConfig;
  const nf=new Intl.NumberFormat('es-ES'),pf=new Intl.NumberFormat('es-ES',{maximumFractionDigits:1});
  const fmt=n=>n===null||n===undefined?'—':nf.format(Math.round(n)),pct=(a,b)=>b?pf.format(100*a/b)+' %':'—';
  const $=s=>document.querySelector(s);
  const SVGNS='http://www.w3.org/2000/svg';
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined&&text!==null)e.textContent=text;return e;}
  function svg(name,attrs={},text){const e=document.createElementNS(SVGNS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
  const date=iso=>iso?new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'}).replace('.',''):'—';
  const longDate=iso=>new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const pad=n=>String(n).padStart(2,'0'),hm=m=>m===null||m===undefined?'—':pad(Math.floor(m/60)%24)+':'+pad(m%60);
  const dur=m=>{const h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+pad(r):''):r+' min';};
  const km=m=>m===null||m===undefined?'—':m<1000?fmt(Math.round(m/10)*10)+' m':pf.format(Math.round(m/100)/10)+' km';

  /* ── enlaces con el visor (estado en el hash, atlas.js · readHash) ── */
  const visorHash=location.hash&&location.hash.length>1?location.hash:'';
  for(const a of [$('#back'),$('#back-foot')])a.href='index.html'+visorHash;
  const visor=state=>'index.html#'+encodeURIComponent(JSON.stringify(state));
  const cam=(c,zoom=12)=>({c:[+c[0].toFixed(5),+c[1].toFixed(5),zoom,0,0],l:{rail:true,stations:true}});
  function link(href,text){const a=el('a','cb-link');a.href=href;a.append(text);
    a.insertAdjacentHTML('beforeend','<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8h9M8 4l4 4-4 4"/></svg>');return a;}
  const anchor=(text,href)=>{const a=el('a',null,text);a.href=href;return a;};

  /* ── piezas ── */
  function card(id,title,sub){const c=document.getElementById(id);c.replaceChildren(el('h3',null,title));if(sub)c.append(el('p','sub',sub));return c;}
  function body(id){const d=document.getElementById(id),b=d.querySelector('.cb-more-body');b.replaceChildren();return b;}
  const note=t=>el('p','cb-note',t);
  // Barras horizontales: el énfasis (hi) lo decide quien llama, según el titular; no el máximo.
  function hbars(items,{format=fmt,classes=[],extra}={}){
    const max=Math.max(1,...items.map(i=>i.values.reduce((a,b)=>a+b,0))),ul=el('ul','hb');
    for(const it of items){
      const li=el('li',it.hi?'hi':null),lab=it.href?el('a','lab',it.label):el('span','lab',it.label);if(it.href)lab.href=it.href;lab.title=it.label;
      const track=el('span','track');track.setAttribute('aria-hidden','true');
      it.values.forEach((v,i)=>{if(!v)return;const s=el('span','seg s'+i+(classes[i]?' '+classes[i]:''));s.style.width=(100*v/max)+'%';track.append(s);});
      const val=el('span','val',format(it.shown??it.values.reduce((a,b)=>a+b,0)));const x=extra?extra(it):it.extra;if(x)val.append(el('small',null,x));
      li.append(lab,track,val);ul.append(li);
    }
    return ul;
  }
  function legend(entries){const ul=el('ul','legend');for(const [cls,text] of entries){const li=el('li');li.append(el('i',cls),text);ul.append(li);}return ul;}
  function table(cols,rows,{caption,bar}={}){
    const wrap=el('div','tbl-wrap'),t=el('table');if(caption)t.append(el('caption',null,caption));
    const cls=c=>[c.n?'n':'',c.opt?'opt':''].join(' ').trim()||null;   // opt: columna secundaria, oculta en móvil
    const tr=el('tr');for(const c of cols){const th=el('th',cls(c),c.label);th.scope='col';tr.append(th);}
    const thead=el('thead');thead.append(tr);t.append(thead);
    const tb=el('tbody'),max=bar?Math.max(1,...rows.map(r=>r[bar]||0)):0;
    for(const r of rows){const row=el('tr');
      for(const c of cols){const td=el('td',[cls(c),c.muted?'muted':''].join(' ').trim()||null),v=c.get?c.get(r):r[c.key];
        if(v instanceof Node)td.append(v);else td.textContent=v===null||v===undefined?'—':(c.n&&typeof v==='number'?fmt(v):v);
        if(bar&&c.key===bar&&r[bar]){const b=el('span','db');b.style.width=(100*r[bar]/max)+'%';td.append(b);}
        row.append(td);}
      tb.append(row);}
    t.append(tb);wrap.append(t);return wrap;
  }
  // Tabla de 10 filas y el resto en un plegable «Ver las N».
  function shortTable(cols,rows,opts={},n=10){
    const box=el('div');box.append(table(cols,rows.slice(0,n),opts));
    if(rows.length>n){const d=el('details','cb-data'),s=el('summary',null,'Ver las '+fmt(rows.length));d.append(s,table(cols,rows,opts));box.append(d);}
    return box;
  }
  // «Ver los datos»: tabla alternativa de cada gráfico (accesible y copiable).
  function dataTable(cols,rows,caption){const d=el('details','cb-data');d.append(el('summary',null,'Ver los datos'),table(cols,rows,{caption}));return d;}

  /* Gráficos SVG dibujados al ancho real del contenedor (el texto queda siempre a 12 px). */
  function responsive(container,draw,label){
    const host=el('div');host.setAttribute('role','img');host.setAttribute('aria-label',label);container.append(host);
    let w=0;const paint=()=>{const nw=Math.max(260,Math.floor(host.clientWidth||container.clientWidth||600));if(nw===w)return;w=nw;host.replaceChildren(draw(w));};
    new ResizeObserver(paint).observe(host);paint();return host;
  }
  function columns(data,{hi=[],h=150,labelEvery=1,format=fmt,top}={}){
    return w=>{
      const L=4,R=4,T=16,B=20,H=h,max=top??Math.max(1,...data.map(d=>d.value)),bw=(w-L-R)/data.length;
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      data.forEach((d,i)=>{const bh=d.value?Math.max(1.5,(H-T-B)*d.value/max):0,gap=Math.min(6,bw*.18),x=L+i*bw+gap,cw=bw-2*gap;
        const r=svg('rect',{x:x.toFixed(1),y:(H-B-bh).toFixed(1),width:Math.max(1,cw).toFixed(1),height:bh.toFixed(1),class:'col'+(hi.includes(i)?' hi':'')});
        r.append(svg('title',{},d.label+': '+format(d.value)));s.append(r);
        if(hi.includes(i))s.append(svg('text',{x:(x+cw/2).toFixed(1),y:(H-B-bh-4).toFixed(1),'text-anchor':'middle',class:'v'},format(d.value)));
        if(i%labelEvery===0)s.append(svg('text',{x:(x+cw/2).toFixed(1),y:H-5,'text-anchor':'middle'},d.tick??d.label));});
      s.append(svg('line',{x1:L,x2:w-R,y1:H-B+.5,y2:H-B+.5,class:'axis'}));return s;
    };
  }
  /* Curvas (eje X numérico, opcionalmente logarítmico; eje Y en %). series: {name, cls, pts:[[x,y]]}; marks: {x,y,text}. */
  function curves(series,{log=false,xTicks=[],xFmt=x=>x,h=230,marks=[],yMax=100}={}){
    return w=>{
      const L=40,R=16,T=12,B=26,H=h,xs=series.flatMap(s=>s.pts.map(p=>p[0])),x0=Math.min(...xs),x1=Math.max(...xs);
      const tx=v=>log?Math.log(v):v,X=v=>L+(w-L-R)*(tx(v)-tx(x0))/(tx(x1)-tx(x0)),Y=v=>H-B-(H-T-B)*v/yMax;
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      for(let v=0;v<=yMax;v+=25){s.append(svg('line',{x1:L,x2:w-R,y1:Y(v),y2:Y(v),class:v?'grid':'axis'}));s.append(svg('text',{x:L-6,y:Y(v)+4,'text-anchor':'end'},v+' %'));}
      for(const t of xTicks)s.append(svg('text',{x:X(t),y:H-8,'text-anchor':'middle'},xFmt(t)));
      for(const sr of series){s.append(svg('polyline',{points:sr.pts.map(p=>X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join(' '),class:'ln '+sr.cls}));
      }
      for(const m of marks){s.append(svg('circle',{cx:X(m.x),cy:Y(m.y),r:4,class:'pt'}));
        if(w<520)continue;   // en móvil el texto se cruza con las líneas: la cifra ya está en el titular y en la nota
        const right=X(m.x)<w*.6;s.append(svg('text',{x:X(m.x)+(right?8:-8),y:Y(m.y)+(m.dy??-8),'text-anchor':right?'start':'end',class:'ann'},m.text));}
      return s;
    };
  }

  /* ── KPI: etiqueta, valor, definición, referencia, fuente y fecha, y enlace con destino concreto ── */
  function kpi({label,value,unit,def,ref,src,href,linkText}){
    const k=el('div','kpi');k.append(el('span','kpi-label',label));
    const v=el('span','kpi-value',value);if(unit)v.append(el('small',null,unit));
    k.append(v,el('span','kpi-def',def),el('span','kpi-ref',ref),el('span','kpi-src',src));
    if(href){const a=el('a',null,linkText);a.href=href;k.append(a);}return k;
  }
  function renderKpis(J){
    const C=J.cobertura,O=J.oferta,R=J.red,elec=R.electrificacion.find(x=>x.id==='yes')?.km||0,ref=date(O.referencia.laborable);
    const cer=O.familias.find(f=>f.nombre==='Cercanías')?.lab||0;
    $('#kpis').replaceChildren(
      kpi({label:'Población servida',value:pf.format(C.kpi.n10_5),unit:'%',def:'vive a ≤ 5 km de una estación con ≥ 10 trenes al día',
        ref:'Con ≥ 1 tren: '+pf.format(C.kpi.n1_5)+' %; con ≥ 30: '+pf.format(C.kpi.n30_5)+' %',src:'INE '+date(C.fecha)+' · horarios '+ref,href:'#cobertura',linkText:'Ver la curva'}),
      kpi({label:'Huecos',value:fmt(C.huecos.length),unit:'municipios',def:'de más de 20.000 habitantes sin esa estación a ≤ 10 km',
        ref:fmt(C.huecos_pob)+' habitantes ('+pct(C.huecos_pob,C.poblacion)+')',src:'INE '+date(C.fecha)+' · horarios '+ref,href:'#c-huecos',linkText:'Ver cuáles'}),
      kpi({label:'Trenes un laborable',value:fmt(O.trenes.lab),def:'trenes de viajeros con horario público',
        ref:'Sábado '+fmt(O.trenes.sab)+' ('+pf.format(100*(O.trenes.sab/O.trenes.lab-1))+' %); Cercanías, '+pct(cer,O.trenes.lab),src:'GTFS Renfe, iryo · PDF OUIGO · '+ref,href:'cabina-rutas.html',linkText:'Ver por ruta'}),
      kpi({label:'Concentración',value:pf.format(O.pareto.p50),unit:'%',def:'de las estaciones suma la mitad de las paradas',
        ref:fmt(O.pareto.n50)+' de '+fmt(O.estaciones_con_tren)+' estaciones · Gini '+pf.format(O.pareto.gini),src:'Horarios '+ref,href:'#c-pareto',linkText:'Ver el Pareto'}),
      kpi({label:'Red electrificada',value:pf.format(100*elec/R.km),unit:'%',def:'de '+fmt(R.km)+' km de vía (ejes IGN con atributos)',
        ref:'Ancho conocido en el '+pct(R.km-(R.ancho.find(x=>x.id==='unknown')?.km||0),R.km).replace(' %','')+' % de los km',src:'IGN + Adif · nov 2026',href:'#red',linkText:'Ver la red'})
    );
  }

  /* ════════ 1 · Cobertura ════════ */
  function renderCobertura(J){
    const C=J.cobertura,NS=C.umbrales;
    let c=card('c-curva','Población con una estación a menos de X km que tiene al menos N trenes al día','% de la población peninsular (INE, '+date(C.fecha)+') según el umbral de trenes; línea principal, 5 km');
    const series=C.distancias.map((d,k)=>({name:d+' km',cls:d===5?'main':'alt',pts:NS.map((n,i)=>[n,C.curva[k][i]])}));
    responsive(c,curves(series,{log:true,xTicks:[1,2,5,10,30,100,300],xFmt:x=>'≥ '+x,marks:[{x:10,y:C.kpi.n10_5,text:pf.format(C.kpi.n10_5)+' % con ≥ 10 trenes a 5 km',dy:22}]}),
      'Curva de población servida: '+C.distancias.map((d,k)=>'a '+d+' km, '+pf.format(C.curva[k][NS.indexOf(10)])+' % con al menos 10 trenes al día').join('; '));
    c.append(legend([['lg-main','Hasta 5 km'],['lg-alt','Hasta 10 km (arriba) y 2 km (abajo)']]),note('Punto: '+pf.format(C.kpi.n10_5)+' % con al menos 10 trenes a 5 km. Eje horizontal: trenes al día que paran en la mejor estación cercana (escala logarítmica). Distancia en línea recta: 0 si la estación está dentro del término municipal y, si no, desde el centroide del municipio.'),
      dataTable([{label:'Trenes al día',key:'n'},...C.distancias.map((d,k)=>({label:'≤ '+d+' km',key:'d'+k,n:1}))],NS.map((n,i)=>({n:'≥ '+n,...Object.fromEntries(C.distancias.map((d,k)=>['d'+k,pf.format(C.curva[k][i])+' %']))})),'Población servida (%)'));
    c=card('c-huecos','Municipios de más de 20.000 habitantes sin estación con 10 trenes al día a 10 km','Ordenados por población · estación con ≥ 10 trenes más cercana');
    c.append(shortTable([{label:'Municipio',get:r=>anchor(r.n,visor(cam(r.c,11)))},{label:'Habitantes',key:'pob',n:1},{label:'Estación útil más cercana',get:r=>r.cerca?r.cerca.n+' · '+pf.format(r.cerca.km)+' km':'—',muted:1}],C.huecos,{bar:'pob'},7),
      note('Distancias en línea recta. Un municipio sale aquí aunque tenga estación propia si en ella paran menos de 10 trenes al día. Metro y tranvía no cuentan.'));
  }

  /* ════════ 2 · Servicio ════════ */
  function renderServicio(J){
    const O=J.oferta,ref=longDate(O.referencia.laborable);
    let c=card('c-familia','Trenes por servicio un laborable',ref+' · un tren cuenta una vez al día');
    const fams=[...O.familias].sort((a,b)=>b.lab-a.lab);
    c.append(hbars(fams.map(f=>({label:f.nombre,values:[f.lab],hi:f.nombre==='Cercanías',extra:pct(f.lab,O.trenes.lab)}))),
      note('Alta velocidad = AVE, AVE Euromed, Avlo, iryo y OUIGO (servicios comerciales). Avant (media distancia por vía de alta velocidad) va aparte: juntos suman '+fmt((fams.find(f=>f.nombre==='Alta velocidad')?.lab||0)+(fams.find(f=>f.nombre==='Avant')?.lab||0))+' trenes. Sábado: '+fmt(O.trenes.sab)+'; domingo: '+fmt(O.trenes.dom)+'.'),
      dataTable([{label:'Servicio',key:'nombre'},{label:'Laborable',key:'lab',n:1},{label:'Sábado',key:'sab',n:1},{label:'Domingo',key:'dom',n:1}],fams,'Trenes por día'));
    const P=O.pareto;
    c=card('c-pareto','La mitad de las paradas se concentra en el '+pf.format(P.p50)+' % de las estaciones',fmt(O.estaciones_con_tren)+' estaciones con tren, de más a menos trenes · '+fmt(O.paradas)+' paradas en un laborable');
    responsive(c,curves([{name:'',cls:'ref',pts:[[0,0],[100,100]]},{name:'',cls:'main',pts:P.puntos}],{xTicks:[0,25,50,75,100],xFmt:x=>x+' %',marks:[{x:P.p50,y:50,text:fmt(P.n50)+' estaciones = 50 % de las paradas',dy:-10},{x:P.p80,y:80,text:pf.format(P.p80)+' % de las estaciones = 80 %',dy:16}]}),
      'Curva de Pareto: el '+pf.format(P.p50)+' % de las estaciones suma el 50 % de las paradas y el '+pf.format(P.p80)+' %, el 80 %. Gini '+pf.format(P.gini));
    c.append(note('Eje horizontal: % de estaciones (de más a menos trenes); vertical: % acumulado de paradas. La diagonal sería un reparto igual. Gini: '+pf.format(P.gini)+'.'),
      dataTable([{label:'Trenes al día',key:'label'},{label:'Estaciones',key:'n',n:1}],O.tramos,'Estaciones según los trenes que paran'));
    c=card('c-top-ld','Estaciones con más trenes de media y larga distancia','Sin Cercanías · trenes con parada en un laborable');
    c.append(shortTable([{label:'Estación',get:r=>anchor(r.n,visor(cam(r.c,13.5)))},{label:'Trenes',key:'v',n:1},{label:'AV y Avant',key:'av',n:1,opt:1},{label:'Destinos directos',key:'dest',n:1}],O.top_ld,{bar:'v'},5));
    c=card('c-top-cer','Estaciones con más trenes de Cercanías','Todos los núcleos, ancho ibérico y métrico');
    c.append(shortTable([{label:'Estación',get:r=>anchor(r.n,visor(cam(r.c,13.5)))},{label:'Cercanías',key:'v',n:1},{label:'Todos los trenes',key:'total',n:1}],O.top_cer,{bar:'v'},5));
    // Velocidad comercial: desde Madrid a cada capital, y todas las relaciones en la tabla.
    const fromMad=O.velocidad.filter(v=>/(^| – )Madrid( – |$)/.test(v.rel));
    c=card('c-velocidad','Velocidad comercial del tren directo más rápido desde Madrid','Las 10 capitales mejor conectadas de '+fromMad.length+' · km del trazado IGN entre las dos estaciones ÷ tiempo programado · '+ref);
    c.append(hbars(fromMad.slice(0,10).map(v=>({label:v.rel.replace(/ – Madrid$|^Madrid – /,''),values:[v.kmh],extra:'km/h · '+dur(v.min)+' · '+v.marca}))),
      note('Velocidad media entre las dos estaciones, paradas incluidas; no es la velocidad máxima. Solo capitales con tren directo cuyo recorrido se puede medir sobre la red.'),
      el('p','cb-note','Las más lentas desde Madrid: '+fromMad.slice(-3).reverse().map(v=>v.rel.replace(/ – Madrid$|^Madrid – /,'')+' ('+v.kmh+' km/h, '+v.marca+')').join(', ')+'.'),
      dataTable([{label:'Relación',key:'rel'},{label:'Desde',key:'de',muted:1},{label:'Hasta',key:'a',muted:1},{label:'Servicio',key:'marca'},{label:'Km',key:'km',n:1},{label:'Minutos',key:'min',n:1},{label:'Km/h',key:'kmh',n:1}],O.velocidad,'Las '+O.velocidad.length+' relaciones directas entre capitales'));
    const H=Array.from({length:24},(_,h)=>O.familias.reduce((a,f)=>a+f.horas[h],0)),peak=H.indexOf(Math.max(...H));
    c=document.getElementById('c-familia');const dh=el('details','cb-data');dh.append(el('summary',null,'Salidas por hora (pico entre las '+peak+' y las '+(peak+1)+' h)'));c.append(dh);c=dh;
    responsive(c,columns(H.map((v,h)=>({label:h+'–'+(h+1)+' h',tick:h+'h',value:v})),{hi:[peak],h:140,labelEvery:3}),'Salidas por hora: máximo de '+fmt(H[peak])+' entre las '+peak+' y las '+(peak+1)+' h');
    c.append(dataTable([{label:'Hora',key:'h'},...O.familias.map((f,i)=>({label:f.nombre,key:'f'+i,n:1})),{label:'Total',key:'t',n:1}],H.map((t,h)=>({h:h+'–'+(h+1)+' h',t,...Object.fromEntries(O.familias.map((f,i)=>['f'+i,f.horas[h]]))})),'Salidas por hora y servicio'));
  }

  /* ════════ 3 · Competencia ════════ */
  /* Viajeros, ocupación y precio de la alta velocidad (CNMC, capas/cnmc.json → cabina.json · cnmc). */
  const OPS=[['Renfe','c-ave','Renfe'],['OUIGO','c-ouigo','OUIGO'],['iryo','c-iryo','iryo']];
  const PRICE=[['Renfe-AVE','d-ave','AVE'],['Renfe-AVLO','d-avlo','Avlo'],['Iryo','d-iryo','iryo'],['OUIGO','d-ouigo','OUIGO']];
  const pc=v=>v===null||v===undefined?'—':pf.format(v)+' %',eur=v=>v===null||v===undefined?'—':pf.format(Math.round(v*10)/10)+' €';
  /* Puntos por fila (precio por trayecto y operador): rango en gris y un punto por operador. */
  function dots(rows,keys){
    return w=>{
      const L=w<520?92:122,R=14,T=6,row=30,B=22,H=T+rows.length*row+B,vals=rows.flatMap(r=>keys.map(k=>r[k[0]]).filter(v=>v!=null));
      const x0=Math.floor(Math.min(...vals)/10)*10,x1=Math.ceil(Math.max(...vals)/10)*10,X=v=>L+(w-L-R)*(v-x0)/(x1-x0);
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      for(let v=x0;v<=x1;v+=10){s.append(svg('line',{x1:X(v),x2:X(v),y1:T,y2:H-B,class:'grid'}));s.append(svg('text',{x:X(v),y:H-6,'text-anchor':'middle'},v+' €'));}
      rows.forEach((r,i)=>{const y=T+i*row+row/2,vs=keys.map(k=>r[k[0]]).filter(v=>v!=null);
        s.append(svg('text',{x:L-8,y:y+4,'text-anchor':'end',class:'v'},r.trayecto.replace('Madrid-','Madrid–')));
        s.append(svg('line',{x1:X(Math.min(...vs)),x2:X(Math.max(...vs)),y1:y,y2:y,class:'rng'}));
        for(const [k,cls,name] of keys){if(r[k]==null)continue;const c=svg('circle',{cx:X(r[k]),cy:y,r:6,class:cls});c.append(svg('title',{},name+': '+eur(r[k])));s.append(c);}});
      return s;
    };
  }
  function renderViajerosAV(J){
    const C=J.cnmc,ids=['c-cuota','c-cuota-t','c-ocupacion','c-precio'];
    if(!C){for(const id of ids)document.getElementById(id)?.remove();return;}
    // Cuota de viajeros por corredor (barras 100 % apiladas, ordenadas por la cuota de Renfe).
    const rows=[...C.corredores].sort((a,b)=>a.op.Renfe.cuota-b.op.Renfe.cuota),rc=rows.map(x=>x.op.Renfe.cuota);
    let c=card('c-cuota',`Renfe tiene entre el ${Math.round(Math.min(...rc))} % y el ${Math.round(Math.max(...rc))} % de los viajeros de cada corredor`,'Cuota de viajeros por operador · 2025 · CNMC');
    c.append(legend(OPS.map(([,cls,n])=>[cls,n])),
      hbars(rows.map(x=>({label:x.corredor.replace('Madrid-','Madrid–'),values:OPS.map(([k])=>x.op[k]?.cuota||0),shown:x.op.Renfe.cuota})),{classes:OPS.map(o=>o[1]),format:pc,extra:it=>'Renfe'}),
      note('Barras al 100 %: la longitud es la cuota, no el número de viajeros. Los viajeros del corredor incluyen trayectos intermedios (Madrid–Zaragoza cuenta en Madrid–Barcelona).'),
      dataTable([{label:'Corredor',key:'n'},{label:'Viajeros 2025 (millones)',key:'v'},...OPS.map(([k,,n])=>({label:n+' (%)',key:k}))],
        rows.map(x=>({n:x.corredor,v:pf.format(x.viajeros),...Object.fromEntries(OPS.map(([k])=>[k,pf.format(x.op[k]?.cuota??0)]))})),'Cuota de viajeros por corredor, 2025'));
    // Cuota de Renfe en el tiempo.
    const S=C.serie,ticks=S.map((s,i)=>[i,s[0]]).filter(([,t])=>/T1$/.test(t)&&+t.slice(0,4)%2===0).map(([i])=>i);
    c=card('c-cuota-t',`Desde 2023, Renfe se mantiene en torno al ${Math.round(C.renfe_desde_2023)} % de los viajeros; hasta 2021 tenía el 100 %`,'Cuota trimestral de Renfe en los cinco corredores · CNMC, hasta '+C.ultimo_trimestre.replace('T',' T'));
    responsive(c,curves([{name:'Renfe',cls:'main',pts:S.map((s,i)=>[i,s[1]])}],{xTicks:ticks,xFmt:i=>S[i][0].slice(0,4),h:200,marks:[{x:S.length-1,y:S.at(-1)[1],text:pc(S.at(-1)[1])}]}),
      'Cuota de Renfe por trimestre: 100 % hasta 2021 y en torno al '+Math.round(C.renfe_desde_2023)+' % desde 2023');
    c.append(note('Coincide con la llegada de OUIGO (2021) e iryo (2022); la serie muestra el cambio, no prueba su causa.'),
      dataTable([{label:'Trimestre',key:'t'},{label:'Cuota de Renfe (%)',key:'r'}],S.map(s=>({t:s[0],r:pf.format(s[1])})),'Cuota trimestral de Renfe'));
    // Ocupación: viajeros-km ÷ plazas-km.
    const O5=C.ocupacion_5,ord=OPS.map(o=>o[0]).sort((a,b)=>O5[b]-O5[a]),mb=C.corredores.find(x=>x.corredor==='Madrid-Barcelona');
    c=card('c-ocupacion',`${ord[0]} llena el ${Math.round(O5[ord[0]])} % de sus plazas; ${ord[1]}, el ${Math.round(O5[ord[1]])} %, e ${ord[2]}, el ${Math.round(O5[ord[2]])} %`,'Ocupación en 2025 · los cinco corredores juntos · CNMC');
    c.append(hbars(ord.map((k,i)=>({label:k,values:[O5[k]],hi:i===0})),{format:pc}),
      note('Ocupación = viajeros-km ÷ plazas-km (dividir viajeros entre plazas da cifras falsas por los trayectos intermedios).'+(mb?' Solo Madrid–Barcelona: '+ord.map(k=>k+' '+pc(mb.op[k]?.ocupacion)).join(', ')+'.':'')),
      dataTable([{label:'Operador',key:'k'},{label:'Cinco corredores (%)',key:'a'},...C.corredores.map(x=>({label:x.corredor.replace('Madrid-',''),key:x.corredor}))],
        OPS.map(([k])=>({k,a:pf.format(O5[k]),...Object.fromEntries(C.corredores.map(x=>[x.corredor,pc(x.op[k]?.ocupacion)]))})),'Ocupación por operador y corredor, 2025'));
    // Precio medio 2025 (año completo: la CNMC cambió el método en el 1T 2026).
    const P=[...C.precio_2025].sort((a,b)=>b['Renfe-AVE']-a['Renfe-AVE']);
    const ratio=P.map(r=>r['Renfe-AVE']/Math.min(...PRICE.slice(1).map(k=>r[k[0]]).filter(v=>v!=null)));
    const lo=pf.format(Math.round(Math.min(...ratio)*10)/10),hi=pf.format(Math.round(Math.max(...ratio)*10)/10);
    c=card('c-precio',`El AVE cuesta ${lo===hi?lo:'entre '+lo+' y '+hi} veces la opción más barata de cada corredor`,'Precio medio por viaje, 2025 (año completo) · CNMC');
    c.append(legend(PRICE.map(([,cls,n])=>[cls.replace('d-','c-'),n])));
    responsive(c,dots(P,PRICE),'Precio medio por viaje y operador en 2025. '+P.map(r=>r.trayecto+': AVE '+eur(r['Renfe-AVE'])).join('; '));
    c.append(note('Sin IVA, media de todas las tarifas vendidas. En 2025 no hubo Avlo en Madrid–Barcelona. Los meses de 2026 no se comparan: la CNMC cambió el método de cálculo en el primer trimestre.'),
      dataTable([{label:'Trayecto',key:'t'},...PRICE.map(([k,,n])=>({label:n,key:k})),{label:'Media',key:'Total'}],P.map(r=>({t:r.trayecto,...Object.fromEntries([...PRICE.map(([k])=>[k,eur(r[k])]),['Total',eur(r.Total)]])})),'Precio medio por viaje, 2025'));
  }
  function renderCompetencia(J){
    const O=J.oferta,list=O.competencia.slice(0,8);
    const c=card('c-competencia','Trenes de alta velocidad por estación y operador','Estaciones donde paran iryo u OUIGO · '+longDate(O.referencia.laborable)+' · Avant aparte');
    c.append(legend([['c-ave','AVE y AVE Euromed (Renfe)'],['c-avlo','Avlo (Renfe)'],['c-ouigo','OUIGO'],['c-iryo','iryo']]),
      hbars(list.map(x=>({label:x.n,values:[x.ave,x.avlo,x.ouigo,x.iryo],href:visor(cam(x.c,13.5))})),{classes:['c-ave','c-avlo','c-ouigo','c-iryo'],
        extra:it=>'iryo y OUIGO '+pct(it.values[2]+it.values[3],it.values.reduce((a,b)=>a+b,0))}),
      note('Oferta programada (trenes con parada), no viajeros ni cuota de mercado. iryo sale de un GTFS comunitario, no oficial, compilado con los horarios de iryo.eu.'),
      dataTable([{label:'Estación',key:'n'},{label:'AVE',key:'ave',n:1},{label:'Avlo',key:'avlo',n:1},{label:'OUIGO',key:'ouigo',n:1},{label:'iryo',key:'iryo',n:1},{label:'Avant',key:'avant',n:1}],O.competencia,'Trenes con parada por operador'));
  }

  /* ════════ 3 · Uso: viajeros (INE), comparación con la UE (Eurostat) y mercancías (CNMC) ════════ */
  const month=ym=>{const [y,m]=ym.split('-').map(Number);return new Date(y,m-1,15).toLocaleDateString('es-ES',{month:'long',year:'numeric'});};
  const signed=v=>(v>0?'+':'')+pf.format(v)+' %';
  /* Línea de tendencia con escala común entre paneles (small multiples, IBCS): pts = [[i, índice]], base 100 marcada. */
  function trend(pts,{cls='ctxl',yMin,yMax,ticks=[],h=120}={}){
    return w=>{
      const L=30,R=6,T=8,B=20,n=pts.length-1,X=i=>L+(w-L-R)*i/n,Y=v=>h-B-(h-T-B)*(v-yMin)/(yMax-yMin);
      const s=svg('svg',{viewBox:`0 0 ${w} ${h}`,width:w,height:h,class:'svgchart','aria-hidden':'true'});
      for(const v of [50,100,150,200].filter(v=>v>=yMin&&v<=yMax)){s.append(svg('line',{x1:L,x2:w-R,y1:Y(v),y2:Y(v),class:v===100?'ref-line':'grid'}));s.append(svg('text',{x:L-5,y:Y(v)+4,'text-anchor':'end'},v));}
      for(const [i,lab] of ticks)s.append(svg('text',{x:X(i),y:h-5,'text-anchor':'middle'},lab));
      s.append(svg('polyline',{points:pts.map(([i,v])=>X(i).toFixed(1)+','+Y(v).toFixed(1)).join(' '),class:'ln '+cls}));
      const [li,lv]=pts.at(-1);s.append(svg('circle',{cx:X(li),cy:Y(lv),r:3,class:cls==='main'?'pt':'pt ctx'}));
      return s;
    };
  }
  function renderUso(J){
    const M=J.mercado;if(!M){$('#uso').hidden=true;document.querySelector('a[href="#uso"]')?.remove();return;}
    const V=M.viajeros,S=V.series,R=V.resumen,ORDER=['av','media','cercanias','resto_ld'];
    // Índice 2019 = 100 sobre la suma móvil de 12 meses: quita la estacionalidad y compara con el último año normal.
    const idx={};
    for(const k of ORDER){const m=S[k].meses,y19=m.filter(([d])=>d.startsWith('2019-')).reduce((a,[,v])=>a+v,0),pts=[];
      for(let i=11;i<m.length;i++){let sum=0;for(let j=i-11;j<=i;j++)sum+=m[j][1];pts.push([i-11,100*sum/y19,m[i][0]]);}
      idx[k]=pts;}
    const all=ORDER.flatMap(k=>idx[k].map(p=>p[1])),yMin=Math.floor(Math.min(...all)/25)*25,yMax=Math.ceil(Math.max(...all)/25)*25;
    const ticks=idx.av.map((p,i)=>[i,p[2]]).filter(([,d])=>/-01$/.test(d)&&+d.slice(0,4)%3===0).map(([i,d])=>[i,d.slice(0,4)]);
    let c=card('c-demanda','Viajeros por tipo de servicio, frente a 2019','Suma de los últimos 12 meses, 2019 = 100 · misma escala en los cuatro paneles · INE, hasta '+month(V.ultimo));
    const grid=el('div','sm-grid');
    for(const k of ORDER){const box=el('div','sm'+(k==='av'?' hi':''));
      box.append(el('h4',null,S[k].nombre),el('p','sm-v',signed(R[k].vs2019)),el('p','sm-s',fmt(R[k].m12/1000)+' millones en 12 meses · '+signed(R[k].var12)+' frente al año anterior'));
      responsive(box,trend(idx[k].map(p=>[p[0],p[1]]),{cls:k==='av'?'main':'ctxl',yMin,yMax,ticks}),S[k].nombre+': '+signed(R[k].vs2019)+' frente a 2019');
      grid.append(box);}
    const ch=V.choque_av;
    c.append(grid,
      note(`La alta velocidad ya es el ${pf.format(V.av_peso_ld.ultimos12)} % de los viajeros de larga distancia (${pf.format(V.av_peso_ld['2017'])} % en 2017). En enero y febrero de 2026 cayó un ${pf.format(-ch.ene_feb_2026)} % frente a 2025 y de mayo a ${month(ch.hasta)} sigue un ${pf.format(-ch.may_ult_2026)} % por debajo.`));
    if(ch.corredores_1t&&ch.evento){
      // Dónde se concentra la caída (CNMC por corredor) y el hecho oficial que coincide en fecha y lugar. La causa no se calcula: se cita.
      const p=note(`Por corredor, en el primer trimestre de 2026 frente al de 2025 (CNMC): ${ch.corredores_1t.map(x=>x.corredor+' '+signed(x.var)).join(', ')}. La caída se concentra en Andalucía y coincide con el ${ch.evento.nombre} del ${date(ch.evento.fecha)}, ${ch.evento.consecuencia} (`);
      p.append(anchor(ch.evento.fuente,ch.evento.url),'). Ni el INE ni la CNMC atribuyen la caída a una causa.');
      c.append(p);
    }
    c.append(
      dataTable([{label:'Servicio',key:'n'},{label:'Viajeros, 12 meses (miles)',key:'m12',n:1},{label:'Frente al año anterior',key:'v12'},{label:'Frente a 2019',key:'v19'}],
        ORDER.map(k=>({n:S[k].nombre,m12:R[k].m12,v12:signed(R[k].var12),v19:signed(R[k].vs2019)})),'Viajeros por tipo de servicio, hasta '+month(V.ultimo)));
    // Comparación con la UE: cuota del tren en el transporte por tierra, último año disponible.
    const U=M.ue,NAME={ES:'España',EU27_2020:'UE-27',FR:'Francia',DE:'Alemania',IT:'Italia',PT:'Portugal'},last=U.viajeros.anios.length-1,yr=U.viajeros.anios[last];
    const bars=D=>hbars(Object.keys(NAME).map(g=>({label:NAME[g],values:[D.pais[g][last]],hi:g==='ES'})).sort((a,b)=>b.values[0]-a.values[0]),{format:v=>pf.format(v)+' %'});
    c=card('c-ue','Cuota del tren en el transporte por tierra, '+yr,'Viajeros-km y toneladas-km por tierra (tren, carretera y vías navegables) · Eurostat');
    c.append(el('h4',null,'Viajeros'),bars(U.viajeros),el('h4',null,'Mercancías'),bars(U.mercancias),
      note('En viajeros, España está en la media europea; en mercancías, el tren mueve en España cuatro veces menos que en la UE.'.replace('cuatro veces',pf.format(Math.round(U.mercancias.pais.EU27_2020[last]/U.mercancias.pais.ES[last]))+' veces')),
      dataTable([{label:'País',key:'n'},{label:'Viajeros (%)',key:'v'},{label:'Mercancías (%)',key:'m'}],Object.keys(NAME).map(g=>({n:NAME[g],v:pf.format(U.viajeros.pais[g][last]),m:pf.format(U.mercancias.pais[g][last])})),'Cuota del tren por tierra, '+yr));
    // Mercancías: cuota de Renfe por año (lo que más cambia) y el total como contexto.
    const A=M.mercancias.anual,f0=A[0],fl=A.at(-1);
    c=card('c-mercancias','Renfe Mercancías: del '+pf.format(f0.renfe_pct)+' % al '+pf.format(fl.renfe_pct)+' % de las toneladas-km','Cuota de Renfe por año · el total se mantiene en torno a '+pf.format(Math.round(A.reduce((a,x)=>a+x.tkm_mm,0)/A.length))+' mil millones de t-km · CNMC');
    responsive(c,columns(A.map((x,i)=>({label:String(x.anio),value:x.renfe_pct,tick:"'"+String(x.anio).slice(2)})),{hi:[A.length-1],h:150}),'Cuota de Renfe en las toneladas-km por año: de '+pf.format(f0.renfe_pct)+' % en '+f0.anio+' a '+pf.format(fl.renfe_pct)+' % en '+fl.anio);
    c.append(note(`${fl.anio}: ${pf.format(fl.tkm_mm)} mil millones de t-km netas; el ${pf.format(fl.intermodal_pct)} % en vagón intermodal (contenedores). El resto lo mueven Medway, Captrain, Continental Rail, Transervi y otras.`),
      dataTable([{label:'Año',key:'anio'},{label:'t-km netas (miles de millones)',key:'t'},{label:'Renfe (%)',key:'r'},{label:'Intermodal (%)',key:'i'}],A.map(x=>({anio:String(x.anio),t:pf.format(x.tkm_mm),r:pf.format(x.renfe_pct),i:x.intermodal_pct===null?'—':pf.format(x.intermodal_pct)})),'Mercancías por ferrocarril'));
  }

  /* Seguridad (INE): accidentes significativos por millón de tren-km. Pocos accidentes al año: la tasa oscila mucho. */
  function renderSeguridad(J){
    const S=J.mercado?.seguridad;if(!S){$('#c-seguridad').hidden=true;return;}
    const A=S.anual,l=A.at(-1),f2=new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}),f3=v=>f2.format(v);
    const c=card('c-seguridad','Accidentes significativos por millón de tren-km: '+f3(l.tasa)+' en '+l.anio,'Viajeros y mercancías · media 2014–2019: '+f3(S.ref_2014_2019)+' · INE');
    responsive(c,columns(A.map((x,i)=>({label:String(x.anio),value:x.tasa,tick:"'"+String(x.anio).slice(2)})),{hi:[A.length-1],h:140,format:f3,top:Math.max(...A.map(x=>x.tasa))}),'Accidentes significativos por millón de tren-km por año, de '+f3(A[0].tasa)+' en '+A[0].anio+' a '+f3(l.tasa)+' en '+l.anio);
    c.append(note(`${l.anio}: ${fmt(l.accidentes)} accidentes significativos en ${pf.format(l.trenkm_mill)} millones de tren-km; ${fmt(l.tipos.arrollamientos)} fueron arrollamientos de personas y ${fmt(l.tipos.pasos_a_nivel)}, en pasos a nivel. Con tan pocos casos al año, un año aislado no marca tendencia. ${l.anio<2026?'El accidente de Adamuz (enero de 2026) entrará en la serie de '+(l.anio+1)+'.':''}`),
      dataTable([{label:'Año',key:'a'},{label:'Accidentes',key:'n',n:1},{label:'Tren-km (millones)',key:'t'},{label:'Por millón de tren-km',key:'r'}],A.map(x=>({a:String(x.anio),n:x.accidentes,t:pf.format(x.trenkm_mill),r:f3(x.tasa)})),'Accidentes ferroviarios significativos'));
  }

  /* ════════ 4 · Red ════════ */
  const GAUGE={'1668':'Ibérico · 1.668 mm','1435':'Estándar · 1.435 mm','1000':'Métrico · 1.000 mm','mixed':'Mixto','unknown':'Sin determinar'};
  const GAUGE_CLS={'1668':'c-navy','1435':'c-ouigo','1000':'c-iryo','mixed':'c-avlo','unknown':'c-soft'};
  const ORIGIN={ign:'IGN: ancho nominal del tramo',fix_adif:'Adif: tramos en servicio',linea:'Adif: ancho de la línea',fix_ign:'IGN: ancho mixto',fix_net:'Inferido: red de ancho métrico',fix_topo:'Inferido por la red (tramos vecinos)',none:'Sin determinar'};
  function renderRed(J){
    const R=J.red,kmOf=(l,id)=>l.find(x=>x.id===id)?.km||0;
    let c=card('c-ancho','Km por ancho de vía','Sobre la misma base que el resto de la red: '+fmt(R.km)+' km');
    const bar=el('div','bar100');bar.setAttribute('aria-hidden','true');
    for(const a of R.ancho){if(!a.km)continue;const s=el('span',GAUGE_CLS[a.id]||'c-ctx');s.style.width=(100*a.km/R.km)+'%';s.title=(GAUGE[a.id]||a.id)+': '+fmt(a.km)+' km';bar.append(s);}
    c.append(bar,legend(R.ancho.filter(a=>a.km).map(a=>[GAUGE_CLS[a.id]||'c-ctx',(GAUGE[a.id]||a.id)+' · '+fmt(a.km)+' km ('+pct(a.km,R.km)+')'])));
    c.append(el('p','cb-sub2','De dónde sale el ancho de cada km'),
      hbars(R.ancho_origen.filter(o=>o.km).map(o=>({label:ORIGIN[o.id]||o.id,values:[o.km],hi:o.id==='ign',extra:pct(o.km,R.km)}))),
      note('El IGN solo publica el ancho de una parte de la red; el resto se completa con Adif y, donde falta, se infiere por la red métrica o por los tramos vecinos (capas/ancho.json). La capa del visor suma 23.692 km porque incluye ejes esquemáticos que aquí no cuentan.'));
    c.append(link(visor({t:'all',d:'gauge'}),'Ver los anchos en el mapa'));
    c=card('c-electrica','Electrificación y prestaciones','Km de la red; electrificación completada con la línea de Adif donde el IGN no la da');
    const EL={yes:'Electrificada',no:'Sin electrificar',unknown:'Sin dato'},TR={'1':'Vía única','2':'Vía doble','3':'Tres vías','4':'Cuatro vías',unknown:'Sin dato'};
    const G=J.glosario.km_av,PN={hs:'Alta velocidad',conv:'Convencional',none:'Sin determinar'};
    c.append(hbars(R.electrificacion.filter(v=>v.km).map(v=>({label:EL[v.id]||v.id,values:[v.km],hi:v.id==='no',extra:pct(v.km,R.km)}))),el('p','cb-sub2','Prestaciones de la vía'),
      hbars(R.prestaciones.map(p=>({label:PN[p.id]||p.id,values:[p.km],hi:p.id==='hs',extra:pct(p.km,R.km)}))),
      note('Km de alta velocidad: '+fmt(G.prestaciones)+' (clasificación del atlas). Los '+fmt(G.corredores)+' km de corredores Hermes y los '+fmt(G.adifav)+' km de Adif AV miden otra cosa: ver el glosario.'),
      link(visor({t:'all',d:'perf'}),'Ver las prestaciones en el mapa'));
    const cor=[...J.corredores.por_corredor].sort((a,b)=>(b.service+b.construction+b.project)-(a.service+a.construction+a.project)),T=J.corredores.total;
    const VF=J.corredores.verificado;
    c=card('c-corredores','Corredores de alta velocidad: en servicio, en obras y en proyecto','Hermes (Ministerio de Transportes), '+date(J.corredores.fecha)+(VF?' · estado contrastado el '+date(VF.fecha):'')+' · km por corredor');
    c.append(legend([['c-navy','En servicio'],['c-ctx','En construcción'],['c-soft','En proyecto']]),
      hbars(cor.map(x=>({label:x.nombre,values:[x.service,x.construction,x.project],shown:x.service,href:visor({t:'corridors',k:x.id,st:'service,construction,project'})})),{classes:['c-navy','c-ctx','c-soft'],extra:()=>'km en servicio'}),
      note('La cifra es el tramo en servicio; la barra incluye las obras y los proyectos. Total: '+fmt(T.service)+' km en servicio, '+fmt(T.construction)+' en construcción y '+fmt(T.project)+' en proyecto. '+(VF?'Datos de Hermes de febrero de 2024, contrastados el '+date(VF.fecha)+': '+VF.nota:'Datos de febrero de 2024: pueden haber cambiado.')),
      link(visor({t:'corridors',k:CFG.corridors.map(x=>x.id).join(','),st:'service,construction,project'}),'Ver los corredores en el mapa'));
    // Detalle plegado
    const b=body('c-red-mas'),netName=id=>CFG.classifications.net.items.find(i=>i.id===id)?.name||id;
    b.append(el('p','cb-sub2','Número de vías'),hbars(R.vias.filter(v=>v.km).map(v=>({label:TR[v.id]||v.id,values:[v.km],extra:pct(v.km,R.km)}))));
    b.append(el('p','cb-sub2','Km por titularidad y gestión'),hbars(R.titularidad.filter(t=>t.km>=1).sort((a,b)=>b.km-a.km).map(t=>({label:netName(t.id),values:[t.km],extra:pct(t.km,R.km)}))));
    const rows=R.net_perf.map(r=>({...r,name:netName(r.id),total:r.hs+r.conv+r.none})).sort((a,b)=>b.total-a.total);
    b.append(el('p','cb-sub2','Titularidad frente a prestaciones (km)'),table([{label:'Titularidad',key:'name'},{label:'Alta velocidad',key:'hs',n:1},{label:'Convencional',key:'conv',n:1},{label:'Sin determinar',key:'none',n:1},{label:'Total',key:'total',n:1}],rows,{bar:'total'}));
    const TT=J.tenT;
    b.append(el('p','cb-sub2','Red transeuropea TEN-T (Hermes, '+date(TT.fecha)+')'),legend([['c-navy','En servicio'],['c-ctx','En construcción'],['c-soft','Planificado']]),
      hbars(TT.por_corredor.map(x=>({label:x.nombre,values:[x['En servicio'],x['En construcción'],x['Planificado']],shown:x['En servicio'],href:visor({t:'tent',ls:[x.id]})})),{classes:['c-navy','c-ctx','c-soft'],extra:()=>'km en servicio'}),
      note('Incluye red convencional; un tramo de los dos corredores cuenta en cada uno.'));
    const ST=J.corredores.servicio_sin_trenes,agg=new Map();
    for(const x of ST){const name=x.nombre.replace(/\s*\(high speed\)/i,' (alta velocidad)').replace(/\bhigh speed\b/i,'alta velocidad'),k=name+'|'+x.corredor;const a=agg.get(k)||{nombre:name,corredor:CFG.corridors.find(c=>c.id===x.corredor)?.name||x.corredor,km:0,n:0};a.km+=x.km;a.n++;agg.set(k,a);}
    b.append(el('p','cb-sub2','Tramos «en servicio» sin trenes de alta velocidad en los horarios'),table([{label:'Tramo',key:'nombre'},{label:'Corredor',key:'corredor',muted:1},{label:'Km',get:r=>pf.format(r.km),n:1}],[...agg.values()].sort((a,b)=>b.km-a.km)),
      note('Suelen ser enlaces o accesos. No significa vía sin uso: puede haber trenes a Francia o de mercancías que no están en los horarios integrados.'));
  }

  /* ════════ 5 · Método y límites ════════ */
  function renderMetodo(J){
    const G=J.glosario,O=J.oferta;
    let c=body('c-glosario');
    const dl=el('dl','src'),row=(k,v)=>dl.append(el('dt',null,k),el('dd',null,v));
    row('Universo de la oferta',O.universo+' Las fichas del visor todavía no incluyen Cercanías de ancho ibérico ni iryo: sus cifras por estación pueden ser menores.');
    row('Tren',' Cada circulación programada del día, contada una vez en cada estación donde para. OUIGO se reconstruye uniendo los trayectos de su PDF (mismo tren si coincide estación, hora y sentido).');
    row('Día de referencia','Miércoles de la primera semana completa (lunes a domingo) que cubren todas las fuentes: '+longDate(O.referencia.laborable)+'.');
    row('Km de alta velocidad',fmt(G.km_av.prestaciones)+' km (prestaciones de la vía, clasificación del atlas sobre el IGN). No confundir con '+fmt(G.km_av.corredores)+' km de corredores Hermes en servicio ni con '+fmt(G.km_av.adifav)+' km gestionados por Adif AV.');
    row('Alta velocidad (trenes)','AVE, AVE Euromed, Avlo, iryo y OUIGO: '+fmt(G.av.comercial)+' trenes un laborable. Avant ('+fmt(G.av.avant)+') es media distancia por vía de alta velocidad y va aparte.');
    row('Estaciones',fmt(G.estaciones.con_tren)+' con tren el día de referencia, de '+fmt(G.estaciones.horario)+' en los horarios. El catálogo de Renfe tiene '+fmt(G.estaciones.catalogo)+' (no incluye todas las de Cercanías) y el catálogo de servicios del visor, '+fmt(G.estaciones.variantes)+'.');
    row('Red',fmt(J.red.km)+' km: ejes IGN con atributos en la España peninsular. Es longitud de ejes, no de líneas oficiales de Adif; se excluyen '+fmt(J.red.tramos_sin_atributos)+' tramos sin atributos (duplicados esquemáticos).');
    row('Población servida','Población municipal (INE, '+date(J.cobertura.fecha)+') con una estación a ≤ X km en línea recta: 0 si está dentro del término municipal; si no, desde su centroide.');
    c.append(dl);
    c=body('c-no');
    const ul=el('ul','plain');
    for(const t of ['Viajeros por estación, por línea o por tren: el INE solo da totales nacionales por tipo de servicio, y la CNMC, los cinco corredores de alta velocidad con competencia.','Puntualidad y retrasos: los horarios son oferta programada, no circulaciones reales.',
      'Ingresos por operador y plazas por tren: la CNMC no publica los ingresos de cada empresa.','Operadores autonómicos (FGC, Euskotren, FGV): sus horarios están en el Punto de Acceso Nacional, con registro.','Mercancías por tramo o por terminal, obras y cortes de vía: las mercancías solo llegan como total nacional por operador.',
      'Acceso real a la estación: las distancias son en línea recta.'])ul.append(el('li',null,t));
    c.append(ul,note('Por eso no hay ratios de trenes por habitante ni comparaciones de calidad entre territorios más allá de la oferta programada.'));
    c=body('c-fuentes');
    const fl=el('dl','src');
    for(const s of Object.values(O.fuentes))fl.append(el('dt',null,s.label),el('dd',null,'Horarios publicados del '+date(s.from)+' al '+date(s.to)+(s.official===false?' · no oficial':'')+'.'));
    for(const [k,v] of [['Red',J.fuentes.red],['Población',J.fuentes.poblacion],['Corredores y TEN-T','Hermes (Ministerio de Transportes), '+date(J.corredores.fecha)]])fl.append(el('dt',null,k),el('dd',null,v));
    if(J.mercado){const F=J.mercado.fuentes;
      fl.append(el('dt',null,'Viajeros'),el('dd',null,F.ine.label+', hasta '+month(F.ine.hasta)+'.'),
        el('dt',null,'Mercancías'),el('dd',null,F.cnmc_mercancias.label+', años completos hasta '+F.cnmc_mercancias.hasta+'.'),
        el('dt',null,'Comparación con la UE'),el('dd',null,F.eurostat.label+', actualizado el '+date(F.eurostat.actualizado)+'.'));}
    c.append(fl,note('Todo se regenera con «node tools/build-rutas.mjs --download» y «node tools/build-cabina.mjs». Origen de los datos de horarios: Renfe Operadora (CC BY 4.0); iryo: Clément Desouche (CC BY 4.0).'));
  }

  /* ════════ Anexo ════════ */
  function renderAnexo(J){
    const I=J.intermodal;let b=body('a-intermodal');
    const inter=(list,name)=>shortTable([{label:'Nombre',get:r=>anchor(name(r),visor({...cam(r.coord,11.5),tp:r.iata?'a':'p'}))},{label:'Estación con tren más cercana',get:r=>r.cerca?r.cerca.n:'Ninguna a ≤ 15 km',muted:1},{label:'Distancia',get:r=>r.cerca?km(r.cerca.m):'—',n:1},{label:'Trenes',get:r=>r.cerca?r.cerca.lab:0,n:1}],
      [...list].sort((a,b)=>(b.cerca?.m??1e9)-(a.cerca?.m??1e9)));
    b.append(el('p','cb-sub2','Puertos de interés general · '+list15(I.puertos)),inter(I.puertos,r=>r.nombre),el('p','cb-sub2','Aeropuertos de interés general · '+list15(I.aeropuertos)),inter(I.aeropuertos,r=>r.nombre+(r.iata?' ('+r.iata+')':'')),
      note('Los peor conectados primero. Distancia en línea recta; trenes que paran en esa estación un laborable.'));
    const Tu=J.turismo,est={current:'Vigente',unconfirmed:'Sin confirmar',historical:'Histórico'};b=body('a-turismo');
    b.append(table([{label:'Tren',get:r=>anchor(r.nombre,visor({t:'tourism',k:r.tipo,x:r.id}))},{label:'Tipo',get:r=>r.tipo==='multi'?'Varios días':'Excursión'},{label:'Duración',key:'dias',muted:1},{label:'Estado',get:r=>est[r.estado]||r.estado}],
      [...Tu.lista].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'))),note('Fuentes oficiales consultadas el '+date(Tu.fecha)+'.'));
    b=body('a-marcas');const S=J.servicios,n=re=>S.por_marca.filter(m=>re.test(m.marca)).reduce((a,m)=>a+m.rutas,0);
    const g=el('div','brands');
    for(const [name,items] of [['Alta velocidad',[['AVE','Incluye AVE Euromed (antes Euromed)'],['Avlo','Alta velocidad de bajo coste'],['Avant','Media distancia en alta velocidad']]],
      ['Distancia larga y media',[['Intercity','Antes Alvia e Intercity'],['Regional','Antes Media Distancia, Regional, Regional Exprés y Proximidad']]],['Movilidad metropolitana',[['Cercanías','Rodalies de Catalunya mantiene su identidad']]]]){
      const f=el('div','brand-fam');f.append(el('h4',null,name));const dl=el('dl');for(const [k,v] of items)dl.append(el('dt',null,k),el('dd',null,v));f.append(dl);g.append(f);}
    b.append(g,note('trenes.renfe.com, consultado el 20-11-2026. Implantación desde el 13-11-2026; Rodalies de Catalunya y Lottu conservan su marca.'));
    const U=J.urbano,modo={cercanias:'Cercanías',metro:'Metro','metro-ligero':'Metro ligero','tram-train':'Tren-tranvía'};b=body('a-urbano');
    b.append(hbars(U.por_red.map(r=>({label:(modo[r.modo]||r.modo)+' · '+r.nombre,values:[r.lineas]}))),link(visor({t:'transit'}),'Ver las redes en el mapa'));
    const E=J.estaciones;b=body('a-catalogo');
    b.append(el('p','cb-sub2','Estaciones del catálogo de Renfe por provincia ('+fmt(E.total)+')'),shortTable([{label:'Provincia',key:'provincia'},{label:'Estaciones',key:'estaciones',n:1}],E.provincias,{bar:'estaciones'}),
      el('p','cb-sub2','Recorridos del catálogo de servicios del visor ('+fmt(S.variantes)+')'),hbars([...S.por_servicio].sort((a,b)=>b.rutas-a.rutas).map(s=>({label:s.nombre,values:[s.rutas],href:visor({t:'services',k:s.id})}))),
      note('Un recorrido es cada combinación distinta de paradas; las rutas comerciales (origen → destino por marca) están en la tabla de rutas.'),link('cabina-rutas.html','Abrir la tabla de rutas'));
  }
  const list15=list=>fmt(list.filter(x=>x.cerca).length)+' de '+fmt(list.length)+' con estación con tren a ≤ 15 km';

  /* ── índice: capítulo visible ── */
  function tocSpy(){
    const links=[...document.querySelectorAll('.cb-toc a[href^="#"]')],map=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]));
    const io=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){links.forEach(a=>a.removeAttribute('aria-current'));map.get(e.target.id)?.setAttribute('aria-current','true');}},{rootMargin:'-30% 0px -65% 0px'});
    document.querySelectorAll('.cb-section').forEach(s=>io.observe(s));
  }

  async function start(){
    tocSpy();let J;
    try{const r=await fetch('capas/cabina.json',{cache:'no-cache'});if(!r.ok)throw new Error(r.status);J=await r.json();}
    catch{const a=$('#alert');a.hidden=false;a.textContent='No se han podido cargar los gráficos. Los titulares de cada capítulo siguen siendo válidos; recarga la página.';return;}
    // Cada bloque falla por separado: un error no deja la página en blanco.
    for(const [name,fn] of [['indicadores',renderKpis],['cobertura',renderCobertura],['servicio',renderServicio],['uso',renderUso],['alta velocidad · viajeros',renderViajerosAV],['competencia',renderCompetencia],['red',renderRed],['seguridad',renderSeguridad],['método',renderMetodo],['anexo',renderAnexo]]){
      try{fn(J);}catch(e){console.error(name,e);const a=$('#alert');a.hidden=false;a.textContent='No se ha podido pintar el bloque «'+name+'». El resto de la página sigue disponible.';}
    }
  }
  start();
})();
