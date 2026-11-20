/* Cabina: pinta los indicadores del atlas.
   · Lo estático (red IGN, corredores, territorio, turismo…) viene precalculado en capas/cabina.json (tools/build-cabina.mjs).
   · La oferta de trenes se calcula aquí con oferta.js (las mismas reglas y el mismo día de referencia que las fichas del visor).
   Sin estilos en línea (CSP): las barras HTML se dimensionan con CSSOM y los gráficos SVG con atributos. */
(function(){
  'use strict';
  const CFG=window.AtlasConfig,O=window.AtlasOffer,CD=window.CabinaDatos;
  const nf=new Intl.NumberFormat('es-ES'),pf=new Intl.NumberFormat('es-ES',{maximumFractionDigits:1});
  const fmt=n=>nf.format(Math.round(n)),pct=(a,b)=>b?pf.format(100*a/b)+' %':'—';
  const $=s=>document.querySelector(s);
  const SVGNS='http://www.w3.org/2000/svg';
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined&&text!==null)e.textContent=text;return e;}
  function svg(name,attrs={},text){const e=document.createElementNS(SVGNS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
  const dayLabel=iso=>new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const shortDate=iso=>new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'}).replace('.','');

  /* ── enlaces con el visor: el estado del visor va en el hash como JSON (atlas.js · readHash) ── */
  const visorHash=location.hash&&location.hash.length>1?location.hash:'';
  for(const a of [$('#back'),$('#back-foot')])a.href='index.html'+visorHash;
  const visor=state=>'index.html#'+encodeURIComponent(JSON.stringify(state));
  const cam=(coord,zoom=12.5)=>({c:[+coord[0].toFixed(5),+coord[1].toFixed(5),zoom,0,0],l:{rail:true,stations:true}});
  function link(state,text='Ver en el visor'){
    const a=el('a','cb-link');a.href=visor(state);a.append(text);
    a.insertAdjacentHTML('beforeend','<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8h9M8 4l4 4-4 4"/></svg>');
    return a;
  }

  /* ── piezas ── */
  function card(id,title,sub){
    const c=document.getElementById(id);c.replaceChildren(el('h3',null,title));
    if(sub)c.append(el('p','sub',sub));return c;
  }
  const note=t=>el('p','cb-note',t);
  function empty(c,text,retry){const p=el('p','cb-empty',text);if(retry){const b=el('button',null,'Reintentar');b.type='button';b.onclick=retry;p.append(b);}c.append(p);}

  /* Barras horizontales (comparar categorías y rankings con nombres largos · cap. 06).
     items: {label, values:[…], href?, hi?, extra?}. Base cero y orden por valor salvo que el orden tenga significado. */
  function hbars(items,{format=fmt,classes=[],extra}={}){
    const max=Math.max(1,...items.map(i=>i.values.reduce((a,b)=>a+b,0)));
    const ul=el('ul','hb');
    for(const it of items){
      const li=el('li',it.hi?'hi':null);
      const lab=it.href?el('a','lab',it.label):el('span','lab',it.label);if(it.href)lab.href=it.href;lab.title=it.label;
      const track=el('span','track');track.setAttribute('aria-hidden','true');
      it.values.forEach((v,i)=>{if(!v)return;const s=el('span','seg s'+i+(classes[i]?' '+classes[i]:''));s.style.width=(100*v/max)+'%';track.append(s);});
      const total=it.values.reduce((a,b)=>a+b,0),val=el('span','val',format(total));
      const x=extra?extra(it):it.extra;if(x)val.append(el('small',null,x));
      li.append(lab,track,val);ul.append(li);
    }
    return ul;
  }
  function legend(entries){const ul=el('ul','legend');for(const [cls,text] of entries){const li=el('li');li.append(el('i',cls),text);ul.append(li);}return ul;}

  /* Tabla (valores exactos · cap. 06), con barra de datos en una columna numérica. */
  function table(cols,rows,{caption,bar,foot}={}){
    const wrap=el('div','tbl-wrap'),t=el('table');
    if(caption)t.append(el('caption',null,caption));
    const tr=el('tr');for(const c of cols){const th=el('th',c.n?'n':null,c.label);th.scope='col';tr.append(th);}
    const thead=el('thead');thead.append(tr);t.append(thead);
    const tb=el('tbody'),max=bar?Math.max(1,...rows.map(r=>r[bar]||0)):0;
    for(const r of rows){const row=el('tr');
      for(const c of cols){const td=el('td',c.n?'n':(c.muted?'muted':null));const v=c.get?c.get(r):r[c.key];
        if(v instanceof Node)td.append(v);else td.textContent=v===null||v===undefined?'—':(c.n&&typeof v==='number'?fmt(v):v);
        if(bar&&c.key===bar&&r[bar]){const b=el('span','db');b.style.width=(100*r[bar]/max)+'%';td.append(b);}
        row.append(td);}
      tb.append(row);}
    t.append(tb);
    if(foot){const tf=el('tfoot'),fr=el('tr');for(const c of cols)fr.append(el('td',c.n?'n':null,foot[c.key]===undefined?'':(typeof foot[c.key]==='number'?fmt(foot[c.key]):foot[c.key])));tf.append(fr);t.append(tf);}
    wrap.append(t);return wrap;
  }
  const anchor=(text,href)=>{const a=el('a',null,text);a.href=href;return a;};

  /* Gráficos SVG que se vuelven a dibujar al ancho real del contenedor (el texto queda siempre a 12 px). */
  function responsive(container,draw,label){
    const host=el('div');host.setAttribute('role','img');host.setAttribute('aria-label',label);container.append(host);
    let w=0;const paint=()=>{const nw=Math.max(260,Math.floor(host.clientWidth||container.clientWidth||600));if(nw===w)return;w=nw;host.replaceChildren(draw(w));};
    new ResizeObserver(paint).observe(host);paint();
    return host;
  }
  /* Columnas (pocas categorías o periodos cortos; lo que importa, destacado · cap. 06). */
  function columns(data,{hi=[],h=150,labelEvery=1,valueLabels=true}={}){
    return w=>{
      const L=4,R=4,T=valueLabels?16:6,B=20,H=h,max=Math.max(1,...data.map(d=>d.value)),bw=(w-L-R)/data.length;
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      data.forEach((d,i)=>{
        const bh=d.value?Math.max(1.5,(H-T-B)*d.value/max):0,x=L+i*bw+Math.min(6,bw*.18),cw=bw-2*Math.min(6,bw*.18);
        const r=svg('rect',{x:x.toFixed(1),y:(H-B-bh).toFixed(1),width:Math.max(1,cw).toFixed(1),height:bh.toFixed(1),class:'col'+(hi.includes(i)?' hi':'')});
        r.append(svg('title',{},d.label+': '+fmt(d.value)));s.append(r);
        if(valueLabels&&(hi.includes(i)||data.length<=8))s.append(svg('text',{x:(x+cw/2).toFixed(1),y:(H-B-bh-4).toFixed(1),'text-anchor':'middle',class:'v'},fmt(d.value)));
        if(i%labelEvery===0||hi.includes(i))s.append(svg('text',{x:(x+cw/2).toFixed(1),y:H-5,'text-anchor':'middle'},d.tick??d.label));
      });
      s.append(svg('line',{x1:L,x2:w-R,y1:H-B+.5,y2:H-B+.5,class:'axis'}));
      return s;
    };
  }
  /* Línea (tendencia con muchas fechas; la serie importante en color · cap. 06), con anotaciones punto + línea + frase (cap. 08). */
  function lineChart(series,dates,{marks=[],h=210}={}){
    return w=>{
      const L=40,R=12,T=44,B=24,H=h,n=dates.length,max=Math.max(1,...series.flatMap(s=>s.values));
      const stepY=max>2000?500:max>800?250:100,top=Math.ceil(max/stepY)*stepY,x=i=>L+(w-L-R)*i/(n-1),y=v=>H-B-(H-T-B)*v/top;
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      for(let v=0;v<=top;v+=stepY){s.append(svg('line',{x1:L,x2:w-R,y1:y(v),y2:y(v),class:v?'grid':'axis'}));s.append(svg('text',{x:L-6,y:y(v)+4,'text-anchor':'end'},fmt(v)));}
      let lastMonth='';const step=w<520?3:1;let mi=0;
      dates.forEach((d,i)=>{const m=d.slice(0,7);if(m!==lastMonth){lastMonth=m;if(mi++%step===0)s.append(svg('text',{x:x(i),y:H-6,'text-anchor':'start'},new Date(d+'T12:00:00').toLocaleDateString('es-ES',{month:'short'}).replace('.','')+(m.endsWith('-01')||i===0?' '+m.slice(2,4):'')));}});
      for(const sr of series){const pts=sr.values.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ');s.append(svg('polyline',{points:pts,class:'ln '+sr.cls}));
        // Etiqueta directa al final del tramo con datos (en lugar de leyenda · cap. 08).
        let lv=-1;sr.values.forEach((v,i)=>{if(v>0)lv=i;});
        if(lv>=0){const end=x(lv)>w*.8;s.append(svg('text',{x:x(lv)+(end?-4:6),y:y(sr.values[lv])+(sr.values[lv]<top*.1?-6:4),'text-anchor':end?'end':'start',class:'ann'},sr.name));}}
      marks.forEach(m=>{if(m.i<0||m.i>=n)return;const X=x(m.i),Y=12+(m.row||0)*13;s.append(svg('line',{x1:X,x2:X,y1:Y-9,y2:H-B,class:'mark'}));
        const anchorEnd=X>w*.62;s.append(svg('text',{x:X+(anchorEnd?-4:4),y:Y,'text-anchor':anchorEnd?'end':'start',class:m.cls||'ann'},m.text));});
      return s;
    };
  }

  /* ── KPI: etiqueta, valor con unidad y referencia explícita (frente a qué) ── */
  function kpi(label,value,unit,ref,state){
    const k=el('div','kpi');k.append(el('span','kpi-label',label));
    const v=el('span','kpi-value',value);if(unit)v.append(el('small',null,unit));k.append(v,el('span','kpi-ref',ref));
    if(state){const a=el('a',null,'Ver en el visor');a.href=visor(state);k.append(a);}
    return k;
  }

  /* ════════ parte estática ════════ */
  function renderStatic(J){
    const R=J.red,perfKm=id=>R.prestaciones.find(x=>x.id===id)?.km||0,el2=id=>R.electrificacion.find(x=>x.id===id)?.km||0;
    const corT={s:J.corredores.total.service,c:J.corredores.total.construction,p:J.corredores.total.project};

    /* KPIs estáticos (los de oferta se añaden cuando se calculan) */
    $('#kpis').replaceChildren(
      kpi('Red ferroviaria',fmt(R.km),'km',fmt(R.tramos)+' tramos IGN peninsulares; longitud de ejes, no de líneas oficiales',{t:'all',d:'perf'}),
      kpi('Alta velocidad',fmt(perfKm('hs')),'km',pct(perfKm('hs'),R.km)+' de la red (prestaciones)',{t:'all',d:'perf'}),
      kpi('Electrificada',pf.format(100*el2('yes')/R.km),'%',fmt(el2('yes'))+' km; '+fmt(el2('unknown'))+' km sin dato',{electric:['yes']}),
      kpi('Trenes un laborable','…','','Calculando con los horarios…',null),
      kpi('Estaciones con tren','…','','Calculando…',null),
      kpi('Corredores AV en servicio',fmt(corT.s),'km',fmt(corT.c)+' km en construcción · '+fmt(corT.p)+' en proyecto',{t:'corridors',k:CFG.corridors.map(c=>c.id).join(','),st:'service,construction,project'})
    );

    /* Red */
    const perfName=id=>CFG.classifications.perf.items.find(i=>i.id===id)?.name||id;
    const noEl=el2('no');
    $('#red-t').textContent=`Uno de cada ${Math.round(R.km/perfKm('hs'))} km de la red es de alta velocidad y un tercio (${fmt(noEl)} km) sigue sin electrificar`;
    let c=card('c-prestaciones','Km por prestaciones','Clasificación propia del atlas sobre la red IGN');
    c.append(hbars(R.prestaciones.map(p=>({label:perfName(p.id),values:[p.km],hi:p.id==='hs',extra:pct(p.km,R.km)}))),link({t:'all',d:'perf'}));
    const gName=id=>CFG.classifications.gauge.items.find(i=>i.id===id)?.name||id;
    c=card('c-ancho','Km por ancho de vía',`Ancho informado en el ${pf.format(R.cobertura_ancho)} % de los tramos (misma cifra que el visor)`);
    c.append(hbars(R.ancho.filter(a=>a.km).sort((a,b)=>b.km-a.km).map(a=>({label:gName(a.id),values:[a.km],hi:a.id==='1435',extra:pct(a.km,R.km)}))),
      note('El IGN no publica el ancho de la red métrica: aparece como «estrecho». El IGN tampoco distingue el ancho mixto.'),link({t:'all',d:'gauge'}));
    const netName=id=>CFG.classifications.net.items.find(i=>i.id===id)?.name||id;
    c=card('c-titularidad','Km por titularidad y gestión','Adif y Adif AV suman la red estatal (RFIG)');
    c.append(hbars(R.titularidad.filter(t=>t.km>=1).sort((a,b)=>b.km-a.km).map(t=>({label:netName(t.id),values:[t.km],hi:t.id==='adif'||t.id==='adifav',extra:pct(t.km,R.km)}))),link({t:'all',d:'net'}));
    c=card('c-vias','Vías y electrificación','Km según el número de vías y si la línea está electrificada');
    const trName={'1':'Vía única','2':'Vía doble','3':'Tres vías','4':'Cuatro vías',unknown:'Sin dato'},elName={yes:'Electrificada',no:'Sin electrificar',unknown:'Sin dato'};
    c.append(hbars(R.vias.filter(v=>v.km).map(v=>({label:trName[v.id]||v.id,values:[v.km],hi:v.id==='1',extra:pct(v.km,R.km)}))));
    const sep=el('div');sep.className='cb-note';c.append(sep);
    c.append(hbars(R.electrificacion.filter(v=>v.km).map(v=>({label:elName[v.id]||v.id,values:[v.km],hi:v.id==='no',extra:pct(v.km,R.km)}))),link({t:'gauge'}));
    c=card('c-cruce','Titularidad frente a prestaciones (km)','«Adif AV» no siempre es vía de alta velocidad: incluye tramos convencionales que gestiona Adif AV');
    const rows=R.net_perf.map(r=>({...r,name:netName(r.id),total:r.hs+r.conv+r.none})).sort((a,b)=>b.total-a.total);
    c.append(table([{label:'Titularidad',key:'name'},{label:'Alta velocidad',key:'hs',n:1},{label:'Convencional',key:'conv',n:1},{label:'Sin determinar',key:'none',n:1},{label:'Total',key:'total',n:1}],rows,
      {bar:'total',foot:{name:'Total',hs:rows.reduce((a,r)=>a+r.hs,0),conv:rows.reduce((a,r)=>a+r.conv,0),none:rows.reduce((a,r)=>a+r.none,0),total:rows.reduce((a,r)=>a+r.total,0)}}));
    const pe=R.perf_electric.find(x=>x.id==='conv');
    c.append(note(`De la red convencional, ${fmt(pe.no)} km (${pct(pe.no,pe.yes+pe.no+pe.unknown)}) no están electrificados. Clasificaciones propias del atlas, no la Declaración sobre la Red de Adif. Se excluyen ${fmt(R.tramos_sin_atributos)} tramos IGN sin atributos (duplicados esquemáticos en nudos).`));

    /* Corredores */
    const cor=[...J.corredores.por_corredor].sort((a,b)=>(b.service+b.construction+b.project)-(a.service+a.construction+a.project));
    const most=[...cor].sort((a,b)=>b.construction/(b.service+b.construction+b.project||1)-a.construction/(a.service+a.construction+a.project||1))[0];
    $('#corredores-t').textContent=`${fmt(corT.s)} km de alta velocidad en servicio y ${fmt(corT.c)} en obras; el ${most.nombre.toLowerCase().replace(/^corredor /,'corredor ')} tiene más km en construcción (${fmt(most.construction)}) que en servicio (${fmt(most.service)})`;
    if(most.construction<=most.service)$('#corredores-t').textContent=`${fmt(corT.s)} km de alta velocidad en servicio y ${fmt(corT.c)} en obras; ${most.nombre} es el corredor con más obra pendiente`;
    c=card('c-corredores','Km por corredor y estado','Corredores de alta velocidad del visor (Hermes, '+shortDate(J.corredores.fecha)+')');
    c.append(legend([['c-navy','En servicio'],['c-ctx','En construcción'],['c-soft','En proyecto']]),
      hbars(cor.map(x=>({label:x.nombre,values:[x.service,x.construction,x.project],href:visor({t:'corridors',k:x.id,st:'service,construction,project'})})),
        {classes:['c-navy','c-ctx','c-soft'],extra:it=>fmt(it.values[0])+' en servicio'}),
      note('Solo el primer tramo de cada barra (en servicio) se compara con base común.'),
      link({t:'corridors',k:CFG.corridors.map(x=>x.id).join(','),st:'service,construction,project'}));
    const T=J.tenT;
    c=card('c-tent','Red transeuropea TEN-T','Km por puntos kilométricos de Hermes ('+shortDate(T.fecha)+')');
    c.append(legend([['c-navy','En servicio'],['c-ctx','En construcción'],['c-soft','Planificado']]),
      hbars(T.por_corredor.map(x=>({label:x.nombre,values:[x['En servicio'],x['En construcción'],x['Planificado']],href:visor({t:'tent',ls:[x.id]})})),{classes:['c-navy','c-ctx','c-soft'],extra:it=>fmt(it.values[0])+' en servicio'}),
      note(`Un tramo de los dos corredores cuenta en cada uno; sin duplicar: ${fmt(T.total['En servicio'])} km en servicio, ${fmt(T.total['En construcción'])} en construcción y ${fmt(T.total['Planificado'])} planificados.`),
      link({t:'tent',ls:['ten-t-atlantico','ten-t-mediterraneo']}));
    const st=J.corredores.servicio_sin_trenes,corName=id=>CFG.corridors.find(x=>x.id===id)?.name||id;
    c=card('c-sintrenes',`${st.length} tramos en servicio (${pf.format(st.reduce((a,x)=>a+x.km,0))} km) sin trenes de alta velocidad en los horarios`,'Tramos marcados «en servicio» por los que no pasa ningún tren AV integrado (regla de 150 m del visor)');
    c.append(table([{label:'Tramo',key:'nombre'},{label:'Corredor',get:r=>corName(r.corredor)},{label:'Km',key:'km',n:1,get:r=>pf.format(r.km)}],st),
      note('Suelen ser enlaces, ramales o accesos. No implica que la vía esté sin uso: puede haber trenes no integrados (iryo) o de mercancías.'));

    /* Territorio (lo que no depende de la oferta) */
    const E=J.estaciones;
    c=card('c-provincias','Estaciones del catálogo de Renfe por provincia',fmt(E.total)+' estaciones; '+fmt(E.cercanias)+' de Cercanías y '+fmt(E.ancho_metrico)+' de ancho métrico');
    c.append(hbars(E.provincias.slice(0,15).map((p,i)=>({label:p.provincia,values:[p.estaciones],hi:i===0}))),
      note('Catálogo de estaciones de Renfe (datos abiertos). No es lo mismo que las estaciones con trenes de los horarios.'),link({l:{rail:true,stations:true}}));
    const S=J.servicios;
    c=card('c-catalogo','Rutas del catálogo por tipo de servicio',fmt(S.variantes)+' rutas (recorridos con las mismas paradas) en '+fmt(S.estaciones)+' estaciones; corte '+shortDate(S.fecha));
    c.append(hbars([...S.por_servicio].sort((a,b)=>b.rutas-a.rutas).map((s,i)=>({label:s.nombre,values:[s.rutas],hi:i===0,href:visor({t:'services',k:s.id})}))),link({t:'services'}));

    /* Intermodalidad estática: redes urbanas */
    const U=J.urbano,modo={cercanias:'Cercanías','metro':'Metro','metro-ligero':'Metro ligero','tram-train':'Tren-tranvía'};
    c=card('c-urbano','Líneas urbanas y de Cercanías por red',fmt(U.lineas)+' líneas en '+fmt(U.redes)+' redes (GTFS); incluye Cercanías de ancho ibérico, que no entran en el recuento de trenes');
    c.append(hbars(U.por_red.map((r,i)=>({label:(modo[r.modo]||r.modo)+' · '+r.nombre,values:[r.lineas],hi:i===0}))),link({t:'transit'}));

    /* Turismo */
    const Tu=J.turismo,sum=k=>Tu.por_tipo.reduce((a,t)=>a+(t[k]||0),0);
    $('#turismo-t').textContent=`${sum('current')} de ${Tu.total} trenes turísticos tienen temporada vigente; ${sum('unconfirmed')} están pendientes de confirmar`;
    c=card('c-turismo','Por tipo y estado','Fuentes oficiales consultadas el '+shortDate(Tu.fecha));
    c.append(legend([['c-navy','Vigente'],['c-ctx','Sin confirmar'],['c-soft','Histórico']]),
      hbars(Tu.por_tipo.map(t=>({label:t.nombre,values:[t.current,t.unconfirmed,t.historical],href:visor({t:'tourism',k:t.id})})),{classes:['c-navy','c-ctx','c-soft'],extra:it=>fmt(it.values[0])+' vigentes'}),link({t:'tourism'}));
    const est={current:['Vigente',''],unconfirmed:['Sin confirmar','warn'],historical:['Histórico','']};
    c=card('c-turismo-lista','Catálogo de trenes turísticos','Abre cada uno en el visor para ver su recorrido');
    c.append(table([{label:'Tren',get:r=>anchor(r.nombre,visor({t:'tourism',k:r.tipo,x:r.id}))},{label:'Tipo',get:r=>r.tipo==='multi'?'Varios días':'Excursión'},{label:'Duración',key:'dias',muted:1},
      {label:'Estado',get:r=>{const s=el('span','tag '+(est[r.estado]?.[1]||''),est[r.estado]?.[0]||r.estado);return s;}}],
      [...Tu.lista].sort((a,b)=>({current:0,unconfirmed:1,historical:2}[a.estado]-{current:0,unconfirmed:1,historical:2}[b.estado])||a.nombre.localeCompare(b.nombre,'es'))));

    renderBrands(S);
    renderLimits(J);
  }

  /* Nueva arquitectura de marcas (trenes.renfe.com, consultado el 20-11-2026) con las rutas del catálogo de cada una. */
  function renderBrands(S){
    const n=name=>S.por_marca.filter(m=>name.test(m.marca)).reduce((a,m)=>a+m.rutas,0);
    const fam=[['Alta velocidad',[['AVE','Incluye AVE Euromed (antes Euromed)',n(/^AVE( Euromed)?$/)],['Avlo','Alta velocidad de bajo coste',n(/^AVLO$/)],['Avant','Media distancia en alta velocidad',n(/^AVANT/)]]],
      ['Distancia larga y media',[['Intercity','Antes Alvia e Intercity',n(/^Intercity$/)],['Regional','Antes Media Distancia, Regional, Regional Exprés y Proximidad',n(/^Regional$/)]]],
      ['Movilidad metropolitana',[['Cercanías','Rodalies de Catalunya mantiene su identidad',n(/^C\d/)]]]];
    const c=card('c-marcas','Familias, servicios y rutas del catálogo del atlas','Implantación desde el 13 de noviembre de 2026; Rodalies de Catalunya y Lottu conservan su marca');
    const g=el('div','brands');
    for(const [name,items] of fam){const f=el('div','brand-fam');f.append(el('h4',null,name));const dl=el('dl');
      for(const [b,d,r] of items){dl.append(el('dt',null,b));const dd=el('dd',null,d+(r?' · '+fmt(r)+' rutas en el atlas':' · sin rutas integradas'));dl.append(dd);}
      f.append(dl);g.append(f);}
    c.append(g,note('Cercanías: solo las de ancho métrico tienen horarios integrados (C1–C9). trenes.renfe.com presenta la nueva identidad de marca; no publica fichas de material rodante (series, plazas o unidades), así que la Cabina no incluye indicadores de flota.'));
    const a=el('a','cb-link','Fuente: trenes.renfe.com');a.href='https://trenes.renfe.com/';a.target='_blank';a.rel='noopener';c.append(a);
  }

  function renderLimits(J){
    let c=card('c-no','No responde','Faltan datos en las fuentes abiertas integradas');
    const ul=el('ul','plain');
    for(const t of ['Viajeros, ocupación y cuota de mercado.','Puntualidad, retrasos e incidencias (el GTFS es oferta programada, no circulaciones reales).',
      'Ingresos, tarifas y plazas ofertadas.','Oferta de iryo: solo se conocen sus relaciones, sin horarios por tren.',
      'Oferta de Cercanías de ancho ibérico (Madrid, Rodalies, València, Sevilla, Málaga…): están sus líneas, no sus horarios.',
      'Mercancías, obras y cortes de vía.','Material rodante y flota: series, unidades o plazas.'])ul.append(el('li',null,t));
    c.append(ul,note('Por eso no hay ratios de trenes por habitante: con Cercanías ibérico fuera, penalizarían a las áreas con más Cercanías.'));
    c=card('c-fuentes','Fuentes y fechas de corte');
    const dl=el('dl','src');
    for(const [k,v] of [['Red ferroviaria',J.fuentes.red+'. Clasificaciones de prestaciones y titularidad propias del atlas.'],
      ['Horarios',J.fuentes.horarios+'. Día de referencia: el mismo que las fichas del visor (miércoles, sábado y domingo de la semana actual o, si ya no tiene horarios publicados de todas las fuentes, de la última semana completa que los tiene).'],
      ['Catálogo de servicios','Corte '+shortDate(J.servicios.fecha)+'. Trazados inferidos sobre la red IGN.'],
      ['Corredores y TEN-T','Hermes (Ministerio de Transportes), '+shortDate(J.corredores.fecha)+'.'],
      ['Población',J.fuentes.poblacion+'. Distancias en línea recta: 15 km en grandes áreas, 5 km en capitales.'],
      ['Puertos y aeropuertos','Ley de Puertos (anexo I) y red de Aena; corte '+shortDate(J.intermodal.fecha)+'.'],
      ['Marcas','trenes.renfe.com, consultado el 20 nov 2026.']]){dl.append(el('dt',null,k),el('dd',null,v));}
    c.append(dl,note('Los indicadores estáticos se regeneran con «node tools/build-cabina.mjs», que aplica las mismas reglas que el visor.'));
  }

  /* ════════ oferta (horarios) ════════ */
  async function renderOffer(J){
    const D=await O.load();D.core=O.core;
    const days=O.core.refDays(D),k=O.core.dayIndex(D,days.weekday);
    const wd=CD.trainsOn(D,k,CFG,true),sa=CD.trainsOn(D,O.core.dayIndex(D,days.saturday),CFG,false),su=CD.trainsOn(D,O.core.dayIndex(D,days.sunday),CFG,false);
    const ranked=CD.stations(D,days.weekday),cal=CD.calendar(D,CFG),allGroups=O.core.groups(D).length;
    const renfe=wd.operator.get('Renfe')||0,ouigo=wd.operator.get('OUIGO')||0;
    $('#ref').replaceChildren('Día de referencia: ',el('strong',null,dayLabel(days.weekday)),(days.clamped?'. Última semana con horarios publicados (la misma que las fichas del visor); fin de semana: ':'. Es la misma semana que usan las fichas del visor; fin de semana: ')+dayLabel(days.saturday).replace(/ de \d{4}$/,'')+' y '+dayLabel(days.sunday).replace(/ de \d{4}$/,'')+'.');

    // Si la semana actual ya no tiene horarios de todas las fuentes, oferta.js usa la última semana completa con datos.
    if(days.clamped){const a=$('#alert');a.hidden=false;a.textContent='Los horarios publicados de todas las fuentes llegan hasta el '+dayLabel(days.until)+'. La Cabina y las fichas del visor muestran la última semana completa con datos, no la actual, hasta que se actualicen los GTFS.';}

    // KPIs de oferta
    const kp=$('#kpis').children;
    kp[3].replaceWith(kpi('Trenes un laborable',fmt(wd.trains),'',fmt(renfe)+' de Renfe y unos '+fmt(ouigo)+' de OUIGO; sin iryo ni Cercanías ibérico',{t:'services'}));
    kp[4].replaceWith(kpi('Estaciones con tren',fmt(ranked.length),'','de '+fmt(allGroups)+' estaciones de los horarios integrados',{l:{rail:true,stations:true}}));

    // Oferta: título-conclusión
    const fams=CD.FAMILY_ORDER.map(f=>({f,n:wd.family.get(f)||0})).filter(x=>x.n).sort((a,b)=>b.n-a.n);
    const hs=wd.family.get('Alta velocidad comercial')||0;
    $('#oferta-t').textContent=`${fams[0].f} es la familia con más trenes: ${Math.round(100*fams[0].n/wd.trains)} % de los ${fmt(wd.trains)} de un laborable, frente al ${Math.round(100*hs/wd.trains)} % de la alta velocidad`;
    let c=card('c-familia','Trenes por familia de servicio','Un tren cuenta una vez al día, salga de donde salga · '+dayLabel(days.weekday));
    c.append(hbars(fams.map((x,i)=>({label:x.f,values:[x.n],hi:i===0,extra:pct(x.n,wd.trains)}))),
      note('Familias de la nueva arquitectura de Renfe: Intercity agrupa Alvia e Intercity; Regional, la antigua Media Distancia. OUIGO cuenta en alta velocidad.'),link({t:'services'}));
    c=card('c-semana','Laborable frente a fin de semana','Trenes en circulación cada día de referencia');
    responsive(c,columns([{label:'Miércoles',value:wd.trains},{label:'Sábado',value:sa.trains},{label:'Domingo',value:su.trains}],{hi:[0],h:170}),
      `Miércoles ${fmt(wd.trains)} trenes, sábado ${fmt(sa.trains)} y domingo ${fmt(su.trains)}`);
    c.append(note(`El sábado circula el ${pct(sa.trains,wd.trains)} de los trenes de un laborable y el domingo, el ${pct(su.trains,wd.trains)}.`));
    const peak=wd.hours.indexOf(Math.max(...wd.hours));
    c=card('c-horas','Salidas por hora',`Hora de salida desde el origen de cada tren · pico entre las ${peak} y las ${peak+1} h con ${fmt(wd.hours[peak])} salidas`);
    responsive(c,columns(wd.hours.map((v,h)=>({label:h+'–'+(h+1)+' h',tick:h+'h',value:v})),{hi:[peak],h:160,labelEvery:3,valueLabels:true}),
      `Salidas por hora: máximo de ${wd.hours[peak]} entre las ${peak} y las ${peak+1} h`);

    // Estaciones
    c=card('c-estaciones','Las 15 estaciones con más trenes','Trenes con parada un laborable; abre cada una en el visor y haz clic en ella para su ficha');
    c.append(table([{label:'Estación',get:r=>anchor(r.name,visor(cam(r.coords,13.5)))},{label:'Trenes',key:'trains',n:1},{label:'Primero – último',get:r=>r.day.first!==null?O.hm(r.day.first)+' – '+O.hm(r.day.last):'—',muted:1},{label:'Destinos directos',key:'dests',n:1}],
      ranked.slice(0,15).map(r=>({...r,trains:r.day.trains,dests:r.day.dests.length})),{bar:'trains'}));
    const buckets=[['1–2',1,2],['3–10',3,10],['11–50',11,50],['51–150',51,150],['más de 150',151,1e9]].map(([label,a,b])=>({label,value:ranked.filter(r=>r.day.trains>=a&&r.day.trains<=b).length}));
    c=card('c-distrib','Estaciones según los trenes que paran','Número de estaciones por tramo de trenes al día');
    const small=buckets[0].value+buckets[1].value;
    responsive(c,columns(buckets,{hi:[1],h:170}),buckets.map(b=>b.label+' trenes: '+b.value+' estaciones').join('; '));
    c.append(note(`${fmt(small)} de ${fmt(ranked.length)} estaciones (${pct(small,ranked.length)}) ven pasar como mucho 10 trenes al día; solo ${fmt(buckets[4].value)} superan los 150.`));

    // Cobertura temporal de los horarios
    const W=cal.weekly,refWeek=W.findIndex(w=>w.week<=days.weekday&&days.weekday<new Date(+new Date(w.week+'T00:00:00Z')+7*864e5).toISOString().slice(0,10));
    const at=iso=>W.findIndex(w=>w.week>iso)-1;
    c=card('c-calendario','Los horarios publicados se vacían a partir de diciembre: la serie mide la cobertura de los datos, no la evolución de la oferta','Media de trenes al día por semana, toda la vigencia de los ficheros');
    const marks=[{i:refWeek,text:days.clamped?'Semana de referencia (última con datos)':'Semana de referencia',cls:'today',row:0}];
    if(cal.last.commuter)marks.push({i:at(cal.last.commuter),text:'Fin Cercanías métricas · '+shortDate(cal.last.commuter),row:1});
    if(cal.last.national)marks.push({i:at(cal.last.national),text:'Fin Renfe AV/LD/MD · '+shortDate(cal.last.national),row:2});
    if(cal.last.ouigo)marks.push({i:at(cal.last.ouigo),text:'Fin OUIGO · '+shortDate(cal.last.ouigo),row:0});
    responsive(c,lineChart([{name:'Renfe',cls:'renfe',values:W.map(w=>w.renfe)},{name:'OUIGO',cls:'ouigo',values:W.map(w=>w.ouigo)}],W.map(w=>w.week),{marks,h:240}),
      `Media semanal de trenes al día: Renfe ${fmt(W[0]?.renfe||0)} la primera semana y 0 desde el ${cal.last.national?shortDate(cal.last.national):'—'}; OUIGO hasta el ${cal.last.ouigo?shortDate(cal.last.ouigo):'—'}.`);
    c.append(note('Los GTFS de Renfe se publican con vigencias cortas y se renuevan: que la línea caiga no significa que se supriman trenes. Mientras no se actualicen, las fichas del visor también se quedarán sin trenes en esas fechas.'));

    // Competencia
    const comp=CD.competition(D,ranked,k,CFG);
    const share=comp.map(x=>({...x,tot:x.ave+x.avlo+x.ouigo,sh:x.ouigo/(x.ave+x.avlo+x.ouigo)}));
    const maxSh=share.reduce((a,b)=>b.sh>a.sh?b:a,share[0]||{sh:0});
    $('#competencia-t').textContent=share.length?`OUIGO para en ${share.length} estaciones y en ninguna llega a la mitad de los trenes de alta velocidad: su máximo es ${maxSh.name} (${pct(maxSh.ouigo,maxSh.tot)})`:'Sin trenes de OUIGO el día de referencia';
    c=card('c-competencia','Trenes de alta velocidad por estación y operador','Estaciones con OUIGO el '+dayLabel(days.weekday)+' · iryo no tiene horarios integrados');
    c.append(legend([['c-ave','AVE (incl. Euromed)'],['c-avlo','Avlo'],['c-ouigo','OUIGO']]),
      hbars(share.map(x=>({label:x.name,values:[x.ave,x.avlo,x.ouigo],href:visor(cam(D.S.stations[x.sid].coordinates,13.5))})),{classes:['c-ave','c-avlo','c-ouigo'],extra:it=>'OUIGO '+pct(it.values[2],it.values[0]+it.values[1]+it.values[2])}),
      note('Madrid–Andalucía: OUIGO e iryo lo tienen suspendido tras el accidente de Urda (28-10-2026), pero el GTFS de Renfe sigue programando trenes ese día. Los horarios pueden no reflejar las incidencias.'),
      link({t:'brands',k:'ave,avlo,iryo,ouigo'}));
    c=card('c-iryo','iryo: relaciones sin horarios','Del buscador de iryo.eu y sus notas de prensa');
    c.append(table([{label:'Relación',get:r=>r.origin+' – '+r.destination},{label:'Paradas citadas',get:r=>r.listed_stops.join(', ')||'—',muted:1}],D.S.meta.iryo||[]),
      note('Sin GTFS público: no se puede contar trenes ni calcular cuotas frente a Renfe y OUIGO.'),link({t:'brands',k:'iryo'}));

    // Territorio
    const metres=O.core.metres;
    const areas=CD.coverage(J.territorio.areas,ranked,15000,metres),caps=CD.coverage(J.territorio.capitales,ranked,5000,metres);
    const noSt=areas.filter(a=>!a.stations),capsOk=caps.filter(a=>a.stations).length,popTot=areas.reduce((a,x)=>a+x.poblacion,0),popNo=noSt.reduce((a,x)=>a+x.poblacion,0);
    $('#territorio-t').textContent=`${noSt.length} de ${areas.length} grandes áreas urbanas (${pct(popNo,popTot)} de su población) no tienen estación con trenes integrados a menos de 15 km; ${capsOk===caps.length?'todas las':capsOk+' de '+caps.length} capitales sí`;
    c=card('c-areas','Las 15 grandes áreas urbanas más pobladas','Estaciones con tren a ≤ 15 km, paradas de tren al día y destinos sin transbordo (como la ficha de población del visor)');
    c.append(table([{label:'Área',get:r=>anchor(r.nombre,visor({p:{on:true,view:'area',sel:r.id}}))},{label:'Habitantes',key:'poblacion',n:1},{label:'Estaciones',key:'stations',n:1},{label:'Paradas',key:'trains',n:1},{label:'Destinos',key:'dests',n:1}],
      areas.slice(0,15),{bar:'dests'}));
    c.append(note('Paradas: un tren que para en dos estaciones del área cuenta dos veces. Población INE a 1-1-2025.'));
    c=card('c-huecos','Grandes áreas sin estación con trenes integrados','A ≤ 15 km del municipio ancla, día de referencia');
    c.append(table([{label:'Área',get:r=>anchor(r.nombre,visor({p:{on:true,view:'area',sel:r.id}}))},{label:'Habitantes',key:'poblacion',n:1}],noSt,{bar:'poblacion',foot:{nombre:'Total',poblacion:popNo}}),
      note('No equivale a «sin tren»: Gandía o la Costa del Sol tienen Cercanías de ancho ibérico, que no está en los horarios integrados.'),link({p:{on:true,view:'area'}}));

    // Intermodalidad
    const ports=CD.nearestStation(J.intermodal.puertos,ranked,15000,metres),airs=CD.nearestStation(J.intermodal.aeropuertos,ranked,15000,metres);
    const okP=ports.filter(p=>p.station).length,okA=airs.filter(p=>p.station).length;
    $('#intermodal-t').textContent=`${okP} de ${ports.length} puertos y ${okA} de ${airs.length} aeropuertos de interés general tienen una estación con trenes a menos de 15 km`;
    const median=a=>{const v=a.filter(x=>x.metres!==null).map(x=>x.metres).sort((x,y)=>x-y);return v.length?v[Math.floor(v.length/2)]:null;};
    const km=m=>m===null?'—':m<1000?fmt(Math.round(m/10)*10)+' m':pf.format(Math.round(m/100)/10)+' km';
    const interCard=(id,title,list,state,nameOf)=>{
      const cc=card(id,title,'Estación con tren más próxima en línea recta · mediana '+km(median(list)));
      const rows=[...list].sort((a,b)=>(b.metres??1e9)-(a.metres??1e9));
      cc.append(table([{label:'Nombre',get:r=>anchor(nameOf(r),visor({...cam(r.coord,11.5),tp:state}))},{label:'Estación más próxima',get:r=>r.station||'Ninguna a ≤ 15 km',muted:1},{label:'Distancia',get:r=>km(r.metres),n:1},{label:'Trenes',key:'trains',n:1}],rows.slice(0,10)),
        note('Los 10 peor conectados primero. Trenes: los que paran en esa estación un laborable.'),link({tp:state}));
    };
    interCard('c-puertos','Puertos de interés general',ports,'p',r=>r.nombre);
    interCard('c-aeropuertos','Aeropuertos de interés general',airs,'a',r=>r.nombre+(r.iata?' ('+r.iata+')':''));
  }

  /* ── índice: sección visible ── */
  function tocSpy(){
    const links=[...document.querySelectorAll('.cb-toc a')],map=new Map(links.map(a=>[a.getAttribute('href').slice(1),a]));
    const io=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting){links.forEach(a=>a.removeAttribute('aria-current'));map.get(e.target.id)?.setAttribute('aria-current','true');}},{rootMargin:'-30% 0px -65% 0px'});
    document.querySelectorAll('.cb-section').forEach(s=>io.observe(s));
  }

  /* ── arranque: cada bloque falla por separado ── */
  const OFFER_CARDS=['c-familia','c-semana','c-horas','c-estaciones','c-distrib','c-calendario','c-competencia','c-iryo','c-areas','c-huecos','c-puertos','c-aeropuertos'];
  async function start(){
    tocSpy();
    let J;
    try{const r=await fetch('capas/cabina.json',{cache:'no-cache'});if(!r.ok)throw new Error();J=await r.json();}
    catch{$('#kpis').replaceChildren();empty($('#kpis'),'No se han podido cargar los indicadores.',()=>location.reload());return;}
    for(const id of OFFER_CARDS)document.getElementById(id).replaceChildren(el('p','cb-note','Calculando con los horarios…'));
    try{renderStatic(J);}catch(e){console.error(e);$('#alert').hidden=false;$('#alert').textContent='Parte de los indicadores no se ha podido pintar. Recarga la página; si persiste, regenera capas/cabina.json.';}
    const offer=async()=>{
      try{await renderOffer(J);}
      catch(e){console.error(e);$('#ref').textContent='No se han podido cargar los horarios.';
        for(const id of OFFER_CARDS){const c=document.getElementById(id);c.replaceChildren();empty(c,'No se han podido cargar los horarios. Las demás secciones siguen disponibles.',()=>{for(const i of OFFER_CARDS)document.getElementById(i).replaceChildren();offer();});}}
    };
    offer();
  }
  // oferta.js solo necesita de AtlasCapas la carga del catálogo de servicios.
  window.AtlasCapas??={loadServices:(()=>{let p;return ()=>p??=fetch('capas/servicios.json').then(r=>{if(!r.ok)throw new Error('servicios');return r.json();}).catch(e=>{p=null;throw e;});})()};
  start();
})();
