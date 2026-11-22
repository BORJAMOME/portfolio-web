/* Cabina: pinta los indicadores del atlas desde capas/cabina.json (tools/build-cabina.mjs). No calcula horarios en el
   navegador: todo llega precalculado y los titulares ya vienen escritos en el HTML.
   Universo de la oferta: todos los trenes de viajeros con horario público (también Cercanías de ancho ibérico e iryo).
   Reglas de diseño (manual de Data Storytelling): titular = conclusión; color de énfasis solo en lo que nombra el
   titular, salvo en los bloques de operador, que usan el color de cada marca; cada gráfico con su tabla de datos
   («Ver los datos») y con lectura al pasar el ratón (tooltip). Sin estilos en línea (CSP): CSSOM y atributos SVG. */
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
  const dayShort=iso=>new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{weekday:'short',day:'numeric'}).replace(/[.,]/g,'');
  const pad=n=>String(n).padStart(2,'0');
  const dur=m=>{const h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+pad(r):''):r+' min';};
  const km=m=>m===null||m===undefined?'—':m<1000?fmt(Math.round(m/10)*10)+' m':pf.format(Math.round(m/100)/10)+' km';
  const pc=v=>v===null||v===undefined?'—':pf.format(v)+' %',eur=v=>v===null||v===undefined?'—':pf.format(Math.round(v*10)/10)+' €';
  const signed=v=>(v>0?'+':v<0?'−':'')+pf.format(Math.abs(v))+' %';

  /* ── enlaces con el visor (estado en el hash, atlas.js · readHash) ── */
  const visorHash=location.hash&&location.hash.length>1?location.hash:'';
  for(const a of [$('#back'),$('#back-foot')])a.href='index.html'+visorHash;
  const visor=state=>'index.html#'+encodeURIComponent(JSON.stringify(state));
  const cam=(c,zoom=12)=>({c:[+c[0].toFixed(5),+c[1].toFixed(5),zoom,0,0],l:{rail:true,stations:true}});
  function link(href,text){const a=el('a','cb-link');a.href=href;a.append(text);
    a.insertAdjacentHTML('beforeend','<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8h9M8 4l4 4-4 4"/></svg>');return a;}
  const anchor=(text,href)=>{const a=el('a',null,text);a.href=href;return a;};

  /* ── marcas: logo (img/marcas, Wikimedia Commons) y color de operador ── */
  const LOGO={'Cercanías':'cercanias','Regional':'regional','Intercity':'intercity','Avant':'avant','AVE':'ave','Avlo':'avlo','OUIGO':'ouigo','iryo':'iryo'};
  function logo(name){const f=LOGO[name];if(!f)return null;const i=el('img','logo logo-'+f);i.src='img/marcas/'+f+'.svg';i.alt='';i.loading='lazy';i.decoding='async';
    i.addEventListener('error',()=>i.remove(),{once:true});return i;}
  const BRAND={AVE:'b-ave',Avlo:'b-avlo',OUIGO:'b-ouigo',iryo:'b-iryo',Renfe:'b-renfe'};

  /* ── tooltip único: lectura de los datos al pasar el ratón (o al tocar) ── */
  const TIP=(()=>{
    const t=el('div','cb-tip');t.setAttribute('role','tooltip');t.hidden=true;document.body.append(t);
    return {
      show(x,y,lines){
        t.replaceChildren(...lines.filter(Boolean).map((l,i)=>{
          if(l instanceof Node)return l;
          if(Array.isArray(l)){const r=el('span','tip-row');if(l[0])r.append(el('i','sw '+l[0]));r.append(el('span',null,l[1]));if(l[2]!==undefined)r.append(el('b',null,l[2]));return r;}
          return el(i===0?'strong':'span',i===0?null:'tip-row',l);}));
        t.hidden=false;const r=t.getBoundingClientRect();let L=x+16,T=y+16;
        if(L+r.width>innerWidth-8)L=x-r.width-16;if(T+r.height>innerHeight-8)T=y-r.height-16;
        t.style.left=Math.max(8,L)+'px';t.style.top=Math.max(8,T)+'px';
      },
      hide(){t.hidden=true;}
    };
  })();
  function hover(node,fn){
    node.addEventListener('pointermove',e=>{const l=fn(e);if(l)TIP.show(e.clientX,e.clientY,l);else TIP.hide();});
    node.addEventListener('pointerleave',()=>TIP.hide());
    node.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'){const l=fn(e);if(l)TIP.show(e.clientX,e.clientY,l);}});
  }
  addEventListener('scroll',()=>TIP.hide(),{passive:true});

  /* ── piezas ── */
  function card(id,title,sub){const c=document.getElementById(id);c.replaceChildren(el('h3',null,title));if(sub)c.append(el('p','sub',sub));return c;}
  function body(id){const d=document.getElementById(id),b=d.querySelector('.cb-more-body');b.replaceChildren();return b;}
  const note=t=>el('p','cb-note',t);
  // Barras horizontales: el énfasis (hi) lo decide quien llama, según el titular; no el máximo.
  function hbars(items,{format=fmt,classes=[],extra,tip,max:fixedMax}={}){
    const max=fixedMax??Math.max(1,...items.map(i=>i.values.reduce((a,b)=>a+b,0))),ul=el('ul','hb');
    for(const it of items){
      const li=el('li',[it.hi?'hi':'',it.sub?'sub':'',it.sel?'sel':''].join(' ').trim()||null);
      const lab=it.href?el('a','lab'):el('span','lab');if(it.href)lab.href=it.href;lab.title=it.label;
      const lg=it.logo?logo(it.logo):null;if(lg)lab.append(lg);lab.append(el('span','lab-t',it.label));
      const track=el('span','track');track.setAttribute('aria-hidden','true');
      it.values.forEach((v,i)=>{if(!v)return;const s=el('span','seg s'+i+(classes[i]?' '+classes[i]:''));s.style.width=(100*v/max)+'%';track.append(s);
        if(tip)hover(s,()=>tip(it,i));});
      if(tip&&!it.values.some(Boolean))hover(track,()=>tip(it,0));
      const val=el('span','val',format(it.shown??it.values.reduce((a,b)=>a+b,0)));const x=extra?extra(it):it.extra;if(x)val.append(el('small',null,x));
      if(it.onClick){for(const n of [lab,track,val]){n.classList.add('pick');n.addEventListener('click',()=>it.onClick());}}
      li.append(lab,track,val);ul.append(li);
    }
    return ul;
  }
  function legend(entries){const ul=el('ul','legend');for(const [cls,text,lg] of entries){const li=el('li');li.append(el('i',cls));const l=lg?logo(lg):null;if(l)li.append(l);li.append(text);ul.append(li);}return ul;}
  function table(cols,rows,{caption,bar,cls:tcls}={}){
    const wrap=el('div','tbl-wrap'),t=el('table',tcls||null);if(caption)t.append(el('caption',null,caption));
    const cls=c=>[c.n?'n':'',c.opt?'opt':'',c.nw?'nw':''].join(' ').trim()||null;   // opt: columna secundaria, oculta en móvil
    const tr=el('tr');for(const c of cols){const th=el('th',cls(c),c.label);th.scope='col';tr.append(th);}
    const thead=el('thead');thead.append(tr);t.append(thead);
    const tb=el('tbody'),max=bar?Math.max(1,...rows.map(r=>r[bar]||0)):0;
    for(const r of rows){const row=el('tr',r._cls||null);
      for(const c of cols){const td=el('td',[cls(c),c.muted?'muted':''].join(' ').trim()||null),v=c.get?c.get(r):r[c.key];
        if(v instanceof Node)td.append(v);else td.textContent=v===null||v===undefined?'—':(c.n&&typeof v==='number'?fmt(v):v);
        if(bar&&c.key===bar&&r[bar]){const b=el('span','db');b.style.width=(100*r[bar]/max)+'%';td.append(b);}
        row.append(td);}
      tb.append(row);}
    t.append(tb);wrap.append(t);return wrap;
  }
  // Tabla de n filas y el resto en un plegable «Ver las N».
  function shortTable(cols,rows,opts={},n=10){
    const box=el('div');box.append(table(cols,rows.slice(0,n),opts));
    if(rows.length>n){const d=el('details','cb-data'),s=el('summary',null,'Ver las '+fmt(rows.length));d.append(s,table(cols,rows,opts));box.append(d);}
    return box;
  }
  // «Ver los datos»: tabla alternativa de cada gráfico (accesible y copiable).
  function dataTable(cols,rows,caption,opts={}){const d=el('details','cb-data');d.append(el('summary',null,opts.summary||'Ver los datos'),table(cols,rows,{caption,...opts}));return d;}
  function dataBox(summary){const d=el('details','cb-data');d.append(el('summary',null,summary||'Ver los datos'));return d;}
  // Control segmentado (botones con aria-pressed).
  function segmented(options,value,onChange,label){
    const g=el('div','seg-ctl');g.setAttribute('role','group');if(label)g.setAttribute('aria-label',label);
    const bs=options.map(([v,text])=>{const b=el('button',null,text);b.type='button';b.setAttribute('aria-pressed',String(v===value));
      b.addEventListener('click',()=>{for(const x of bs)x.setAttribute('aria-pressed',String(x===b));onChange(v);});g.append(b);return b;});
    g.set=v=>bs.forEach((b,i)=>b.setAttribute('aria-pressed',String(options[i][0]===v)));
    return g;
  }
  function select(label,options,value,onChange){
    const w=el('label','sel');w.append(el('span',null,label));const s=el('select');
    const fill=(opts,v)=>{s.replaceChildren(...opts.map(([val,text])=>{const o=el('option',null,text);o.value=val;if(val===v)o.selected=true;return o;}));};
    fill(options,value);s.addEventListener('change',()=>onChange(s.value));w.append(s);w.fill=fill;w.sel=s;return w;
  }
  // Ventana emergente (splash) para la información complementaria.
  function dialog(title,content){
    const d=$('#cb-dialog');d.querySelector('h2').textContent=title;d.querySelector('.cb-dialog-body').replaceChildren(...content);
    if(!d.dataset.ready){d.dataset.ready='1';d.querySelector('.cb-dialog-x').addEventListener('click',()=>d.close());
      d.addEventListener('click',e=>{if(e.target===d)d.close();});}
    d.showModal();
  }

  /* Gráficos SVG dibujados al ancho real del contenedor (el texto queda siempre a 12 px). host.repaint() redibuja. */
  function responsive(container,draw,label){
    const host=el('div','chart-host');host.setAttribute('role','img');host.setAttribute('aria-label',label);container.append(host);
    let w=0;const paint=()=>{const nw=Math.max(260,Math.floor(host.clientWidth||container.clientWidth||600));if(nw===w)return;w=nw;host.replaceChildren(draw(w));};
    new ResizeObserver(paint).observe(host);paint();host.repaint=()=>{w=0;paint();};host.relabel=t=>host.setAttribute('aria-label',t);return host;
  }
  function columns(data,{hi=[],h=150,labelEvery=1,format=fmt,top,tip}={}){
    return w=>{
      const L=4,R=4,T=16,B=20,H=h,max=top??Math.max(1,...data.map(d=>d.value)),bw=(w-L-R)/data.length;
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      data.forEach((d,i)=>{const bh=d.value?Math.max(1.5,(H-T-B)*d.value/max):0,gap=Math.min(6,bw*.18),x=L+i*bw+gap,cw=bw-2*gap;
        const r=svg('rect',{x:x.toFixed(1),y:(H-B-bh).toFixed(1),width:Math.max(1,cw).toFixed(1),height:bh.toFixed(1),class:'col'+(hi.includes(i)?' hi':'')});
        s.append(r);
        if(tip){const hit=svg('rect',{x:(L+i*bw).toFixed(1),y:T,width:bw.toFixed(1),height:H-T-B,class:'hit'});hover(hit,()=>{r.classList.add('on');return tip(d,i);});hit.addEventListener('pointerleave',()=>r.classList.remove('on'));s.append(hit);}
        else r.append(svg('title',{},d.label+': '+format(d.value)));
        if(hi.includes(i))s.append(svg('text',{x:(x+cw/2).toFixed(1),y:(H-B-bh-4).toFixed(1),'text-anchor':'middle',class:'v'},format(d.value)));
        if(i%labelEvery===0)s.append(svg('text',{x:(x+cw/2).toFixed(1),y:H-5,'text-anchor':'middle'},d.tick??d.label));});
      s.append(svg('line',{x1:L,x2:w-R,y1:H-B+.5,y2:H-B+.5,class:'axis'}));return s;
    };
  }
  /* Líneas con lectura al pasar el ratón. series: {name, cls, get(x) → y | null}; xs: valores de x en los que se ajusta
     la guía; tip(x, i) → líneas del tooltip; onPick(x) al hacer clic; picked(x) marca los puntos elegidos. */
  function lineChart({series,xs,log=false,yMin=0,yMax=100,yStep=25,yFmt=v=>v+' %',xTicks=[],xFmt=x=>x,h=240,marks=[],tip,onPick,picked=()=>false,L=44,dense=false}){
    return w=>{
      const R=16,T=12,B=26,H=h,x0=Math.min(...xs),x1=Math.max(...xs);
      const tx=v=>log?Math.log(v):v,X=v=>L+(w-L-R)*(tx(v)-tx(x0))/((tx(x1)-tx(x0))||1),Y=v=>H-B-(H-T-B)*(v-yMin)/(yMax-yMin);
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart'+(onPick?' pickable':''),'aria-hidden':'true'});
      for(let v=yMin;v<=yMax+1e-9;v+=yStep){s.append(svg('line',{x1:L,x2:w-R,y1:Y(v),y2:Y(v),class:v===yMin?'axis':'grid'}));s.append(svg('text',{x:L-6,y:Y(v)+4,'text-anchor':'end'},yFmt(v)));}
      for(const t of xTicks)s.append(svg('text',{x:X(t),y:H-8,'text-anchor':'middle'},xFmt(t)));
      for(const sr of series){
        const segs=[];let cur=[];
        for(const x of (dense?xs:xs)){const y=sr.get(x);if(y===null||y===undefined){if(cur.length)segs.push(cur);cur=[];continue;}cur.push(X(x).toFixed(1)+','+Y(y).toFixed(1));}
        if(cur.length)segs.push(cur);
        for(const p of segs)s.append(svg('polyline',{points:p.join(' '),class:'ln '+sr.cls}));
      }
      for(const x of xs)if(picked(x)){s.append(svg('line',{x1:X(x),x2:X(x),y1:T,y2:H-B,class:'pickline'}));
        for(const sr of series){const y=sr.get(x);if(y!=null)s.append(svg('circle',{cx:X(x),cy:Y(y),r:4.5,class:'pickpt '+sr.cls}));}}
      for(const m of marks){s.append(svg('circle',{cx:X(m.x),cy:Y(m.y),r:4,class:'pt'}));
        if(w<520)continue;   // en móvil el texto se cruza con las líneas: la cifra ya está en el titular y en la nota
        const right=X(m.x)<w*.6;s.append(svg('text',{x:X(m.x)+(right?8:-8),y:Y(m.y)+(m.dy??-8),'text-anchor':right?'start':'end',class:'ann'},m.text));}
      const guide=svg('line',{x1:0,x2:0,y1:T,y2:H-B,class:'guide',visibility:'hidden'}),dots=svg('g',{class:'hdots'});s.append(guide,dots);
      const hit=svg('rect',{x:L,y:0,width:Math.max(1,w-L-R),height:H-B,class:'hit'});s.append(hit);
      const px=xs.map(X),near=e=>{const r=s.getBoundingClientRect(),x=(e.clientX-r.left)*w/r.width;let bi=0,bd=Infinity;px.forEach((p,i)=>{const d=Math.abs(p-x);if(d<bd){bd=d;bi=i;}});return bi;};
      hover(hit,e=>{const i=near(e),x=xs[i];guide.setAttribute('x1',px[i]);guide.setAttribute('x2',px[i]);guide.setAttribute('visibility','visible');
        dots.replaceChildren(...series.map(sr=>{const y=sr.get(x);return y==null?null:svg('circle',{cx:px[i],cy:Y(y),r:4,class:'hdot '+sr.cls});}).filter(Boolean));
        return tip?tip(x,i):null;});
      hit.addEventListener('pointerleave',()=>{guide.setAttribute('visibility','hidden');dots.replaceChildren();});
      if(onPick)hit.addEventListener('click',e=>onPick(xs[near(e)]));
      return s;
    };
  }
  /* Puntos por fila (precio u ocupación por trayecto y operador): rango en gris y un punto por operador. */
  function dots(rows,keys,{label=r=>r.trayecto.replace('Madrid-','Madrid–'),fmtv=eur,unit=' €',step=10,tip}={}){
    return w=>{
      const L=w<520?92:132,R=16,T=6,row=32,B=22,H=T+rows.length*row+B,vals=rows.flatMap(r=>keys.map(k=>r[k[0]]).filter(v=>v!=null));
      const x0=Math.floor(Math.min(...vals)/step)*step,x1=Math.ceil(Math.max(...vals)/step)*step,X=v=>L+(w-L-R)*(v-x0)/((x1-x0)||1);
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      for(let v=x0;v<=x1;v+=step){s.append(svg('line',{x1:X(v),x2:X(v),y1:T,y2:H-B,class:'grid'}));s.append(svg('text',{x:X(v),y:H-6,'text-anchor':'middle'},v+unit));}
      rows.forEach((r,i)=>{const y=T+i*row+row/2,vs=keys.map(k=>r[k[0]]).filter(v=>v!=null);
        s.append(svg('text',{x:L-10,y:y+4,'text-anchor':'end',class:'v'},label(r)));
        s.append(svg('line',{x1:X(Math.min(...vs)),x2:X(Math.max(...vs)),y1:y,y2:y,class:'rng'}));
        for(const [k,cls,name] of keys){if(r[k]==null)continue;const c=svg('circle',{cx:X(r[k]),cy:y,r:7,class:'dot '+cls});
          hover(c,()=>tip?tip(r,k,name,cls):[label(r),[cls,name,fmtv(r[k])]]);s.append(c);}});
      return s;
    };
  }

  /* ── KPI: etiqueta, valor, una pieza visual mínima y la definición y la fuente en el botón «i» ── */
  let kpiN=0;
  function kpi({label,value,unit,info,href,extra}){
    const k=el('div','kpi'),id='kpi-i-'+(++kpiN);
    const head=el('div','kpi-head');head.append(el('span','kpi-label',label));
    const b=el('button','kpi-i','i');b.type='button';b.setAttribute('aria-label','Qué mide y fuente: '+label);b.setAttribute('aria-describedby',id);
    const pop=el('span','kpi-pop');pop.id=id;pop.setAttribute('role','tooltip');for(const [t,c] of info)pop.append(el('span',c||null,t));
    const wrap=el('span','kpi-iw');wrap.append(b,pop);head.append(wrap);
    b.addEventListener('click',()=>wrap.classList.toggle('open'));b.addEventListener('blur',()=>wrap.classList.remove('open'));
    const v=el(href?'a':'span','kpi-value');if(href)v.href=href;v.append(value);if(unit)v.append(el('small',null,unit));
    k.append(head,v);if(extra)k.append(extra);return k;
  }
  // Mini barras de un KPI: [etiqueta, valor %, ¿énfasis?]
  function kpiBars(rows){const ul=el('ul','kpi-bars');for(const [t,v,hi] of rows){const li=el('li',hi?'hi':null);li.append(el('span','kb-t',t));
    const tr=el('span','kb-track');const f=el('span','kb-fill');f.style.width=Math.max(0,Math.min(100,v))+'%';tr.append(f);li.append(tr,el('span','kb-v',pf.format(v)+' %'));ul.append(li);}return ul;}
  function renderKpis(J){
    const C=J.cobertura,O=J.oferta,R=J.red,elec=R.electrificacion.find(x=>x.id==='yes')?.km||0,ref=date(O.referencia.laborable);
    const ine='INE '+date(C.fecha)+' · horarios '+ref,pobH=C.huecos_pob;
    const delta=(v,t)=>{const s=el('span','kpi-delta'+(v<0?' down':''),signed(v));const w=el('span','kpi-sub');w.append(s,' '+t);return w;};
    const sub=t=>el('span','kpi-sub',t);
    const list=[
      kpi({label:'Población con buen tren cerca',value:pf.format(C.kpi.n10_5),unit:'%',href:'#cobertura',
        info:[['Población que vive a 5 km o menos de una estación con 10 trenes al día o más.'],[ine,'src']],
        extra:kpiBars([['≥ 1 tren',C.kpi.n1_5],['≥ 10',C.kpi.n10_5,1],['≥ 30',C.kpi.n30_5]])}),
      kpi({label:'Municipios grandes sin tren útil',value:fmt(C.huecos.length),href:'#c-huecos',
        info:[['Municipios de más de 20.000 habitantes sin una estación con 10 trenes al día a 10 km o menos.'],[ine,'src']],
        extra:(()=>{const w=el('div');w.append(sub(pf.format(pobH/1e6)+' M de habitantes'),kpiBars([['población',100*pobH/C.poblacion,1]]));return w;})()}),
      kpi({label:'Trenes un laborable',value:fmt(O.trenes.lab),href:'cabina-rutas.html',
        info:[['Trenes de viajeros con horario público el miércoles de referencia. Un tren cuenta una vez al día.'],['GTFS Renfe, iryo · PDF OUIGO · '+ref,'src']],
        extra:delta(100*(O.trenes.sab/O.trenes.lab-1),'el sábado')}),
      kpi({label:'Estaciones con la mitad de las paradas',value:pf.format(O.pareto.p50),unit:'%',href:'#c-pareto',
        info:[[fmt(O.pareto.n50)+' de '+fmt(O.estaciones_con_tren)+' estaciones suman el 50 % de las paradas de un laborable. Gini '+pf.format(O.pareto.gini)+'.'],['Horarios '+ref,'src']],
        extra:sub(fmt(O.pareto.n50)+' de '+fmt(O.estaciones_con_tren)+' estaciones')}),
      kpi({label:'Red electrificada',value:pf.format(100*elec/R.km),unit:'%',href:'#red',
        info:[['Km electrificados sobre '+fmt(R.km)+' km de vía (ejes IGN con atributos).'],['IGN + Adif · nov 2026','src']],
        extra:kpiBars([['de la red',100*elec/R.km,1]])})
    ];
    const T=J.mercado?.viajeros?.total12;
    if(T)list.push(kpi({label:'Viajeros en 12 meses',value:pf.format(Math.round(T.m12/100)/10),unit:'M',href:'#c-demanda',
      info:[['Viajeros de todos los servicios de tren (Cercanías, media distancia, alta velocidad y resto de larga distancia) en los últimos 12 meses, frente a los 12 anteriores.'],['INE, hasta '+month(J.mercado.viajeros.ultimo),'src']],
      extra:delta(T.var12,'interanual')}));
    $('#kpis').replaceChildren(...list);
  }

  /* ════════ 1 · Cobertura ════════ */
  function renderCobertura(J){
    const C=J.cobertura,NS=C.umbrales,D=C.distancias,K5=D.indexOf(5);
    const c=card('c-curva','Población con una estación a menos de X km que tiene al menos N trenes al día','% de la población peninsular (INE, '+date(C.fecha)+') · pasa el ratón para leer cada umbral y pulsa para elegirlo');
    const picked=new Set([10]);
    const CLS=d=>d===5?'main':d===10?'alt':'alt2';
    const series=D.map((d,k)=>({name:d+' km',cls:CLS(d),get:x=>C.curva[k][NS.indexOf(x)]}));
    const tipAt=x=>{const i=NS.indexOf(x);return ['≥ '+x+' trenes al día',...[...D].reverse().map(d=>{const k=D.indexOf(d);return ['lg-'+CLS(d),'a ≤ '+d+' km',pf.format(C.curva[k][i])+' % · '+pf.format(C.curva_pob[k][i]/1e6)+' M']}),'Pulsa para añadirlo a la tabla'];};
    const host=responsive(c,lineChart({series,xs:NS,log:true,xTicks:[1,2,5,10,30,100,300],xFmt:x=>'≥ '+x,tip:tipAt,picked:x=>picked.has(x),onPick:x=>toggle(x)}),
      'Curva de población servida: '+D.map((d,k)=>'a '+d+' km, '+pf.format(C.curva[k][NS.indexOf(10)])+' % con al menos 10 trenes al día').join('; '));
    c.append(legend([['lg-main','Hasta 5 km'],['lg-alt','Hasta 10 km'],['lg-alt2','Hasta 2 km']]));
    // Selección accesible (mismo estado que el clic en el gráfico).
    const chips=el('div','chips');chips.setAttribute('role','group');chips.setAttribute('aria-label','Umbrales elegidos para la tabla');
    const chipB=NS.map(n=>{const b=el('button',null,'≥ '+n);b.type='button';b.addEventListener('click',()=>toggle(n));chips.append(b);return b;});
    const box=dataBox('Ver los datos de los umbrales elegidos'),out=el('div');box.append(out);
    function toggle(n){picked.has(n)?picked.delete(n):picked.add(n);sync();}
    function sync(){chipB.forEach((b,i)=>b.setAttribute('aria-pressed',String(picked.has(NS[i]))));host.repaint();
      const rows=NS.filter(n=>picked.has(n)).map(n=>{const i=NS.indexOf(n);return {n:'≥ '+n,...Object.fromEntries(D.flatMap((d,k)=>[['p'+k,pf.format(C.curva[k][i])+' %'],['h'+k,C.curva_pob[k][i]]]))};});
      out.replaceChildren(rows.length?table([{label:'Trenes al día',key:'n',nw:1},...D.flatMap((d,k)=>[{label:'≤ '+d+' km',key:'p'+k,n:1},{label:'Habitantes',key:'h'+k,n:1,opt:1}])],rows,{caption:'Población servida en los umbrales elegidos ('+rows.length+')'}):note('Pulsa en el gráfico o en los botones de umbral para elegir uno o varios.'));
      if(rows.length&&!box.open)box.open=true;}
    const more=el('button','btn-ghost','Tabla completa de población servida');more.type='button';
    more.addEventListener('click',()=>dialog('Población servida: todos los umbrales',[
      table([{label:'Trenes al día',key:'n',nw:1},...D.flatMap((d,k)=>[{label:'≤ '+d+' km',key:'p'+k,n:1},{label:'Habitantes',key:'h'+k,n:1}])],
        NS.map((n,i)=>({n:'≥ '+n,...Object.fromEntries(D.flatMap((d,k)=>[['p'+k,pf.format(C.curva[k][i])+' %'],['h'+k,C.curva_pob[k][i]]]))})),{caption:'% y habitantes de la población peninsular ('+fmt(C.poblacion)+' hab., '+fmt(C.municipios)+' municipios, INE '+date(C.fecha)+')'}),
      note('Comprobado: cada fila baja al exigir más trenes y cada columna sube al ampliar la distancia; % = habitantes ÷ población peninsular. Distancia en línea recta: 0 si la estación está dentro del término municipal y, si no, desde el centroide del municipio. Metro y tranvía no cuentan.')]));
    const tools=el('div','card-tools');tools.append(chips,more);
    c.append(tools,note('Eje horizontal: trenes al día en la mejor estación cercana (escala logarítmica). A 5 km, el '+pf.format(C.kpi.n10_5)+' % tiene al menos 10 trenes.'),box);
    sync();box.open=false;
    const h=card('c-huecos','Municipios de más de 20.000 habitantes sin estación con 10 trenes al día a 10 km','Ordenados por población · estación con ≥ 10 trenes más cercana');
    h.append(shortTable([{label:'Municipio',get:r=>anchor(r.n,visor(cam(r.c,11))),nw:1},{label:'Habitantes',key:'pob',n:1},{label:'Estación útil más cercana',get:r=>r.cerca?r.cerca.n+' · '+pf.format(r.cerca.km)+' km':'—',muted:1}],C.huecos,{bar:'pob'},7),
      note('Distancias en línea recta. Un municipio sale aquí aunque tenga estación propia si en ella paran menos de 10 trenes al día. Metro y tranvía no cuentan.'));
  }

  /* ════════ 2 · Servicio ════════ */
  const FAMS=['Alta velocidad','Avant','Intercity','Regional','Cercanías'];
  function renderServicio(J){
    const O=J.oferta,DAYS=[['lab','Laborable'],['sab','Sábado'],['dom','Domingo']],DAYDATE={lab:O.referencia.laborable,sab:O.referencia.sabado,dom:O.referencia.domingo};
    const HK={lab:'horas',sab:'horas_sab',dom:'horas_dom'};
    let day='lab';const ctls=[];
    const setDay=v=>{day=v;ctls.forEach(c=>c.set(v));drawFam();drawHoras();};
    // Trenes por servicio, con logo de cada marca y las cuatro marcas de alta velocidad.
    const cf=card('c-familia','Trenes por servicio','Un tren cuenta una vez al día');
    const ctlF=segmented(DAYS,day,setDay,'Día');ctls.push(ctlF);cf.append(ctlF);
    const famBox=el('div');cf.append(famBox);
    function drawFam(){
      const tot=O.trenes[day],fams=[...O.familias].sort((a,b)=>b.lab-a.lab),items=[];
      for(const f of fams){items.push({label:f.nombre,logo:f.nombre,values:[f[day]],hi:f.nombre==='Cercanías',extra:pct(f[day],tot)});
        if(f.nombre==='Alta velocidad')for(const m of O.marcas_av)items.push({label:m.nombre,logo:m.nombre,values:[m[day]],sub:1,extra:pct(m[day],f[day])+' de AV'});}
      famBox.replaceChildren(hbars(items,{max:Math.max(...O.familias.map(f=>f[day])),tip:it=>[it.label,'Trenes: '+fmt(it.values[0]),it.extra?(it.sub?it.extra:it.extra+' del total'):null,longDate(DAYDATE[day])]}),
        note(longDate(DAYDATE[day])+': '+fmt(tot)+' trenes. Alta velocidad = AVE (con AVE Euromed), Avlo, OUIGO e iryo; Avant (media distancia por vía de alta velocidad) va aparte.'));
    }
    const W=O.semana||[];
    const weekRows=[...O.familias].sort((a,b)=>b.lab-a.lab).flatMap(f=>[{s:f.nombre,...Object.fromEntries((f.dias||[]).map((v,i)=>['d'+i,v]))},
      ...(f.nombre==='Alta velocidad'?O.marcas_av.map(m=>({s:'· '+m.nombre,_cls:'sub',...Object.fromEntries(m.dias.map((v,i)=>['d'+i,v]))})):[])]);
    weekRows.push({s:'Total',_cls:'tot',...Object.fromEntries(W.map((d,i)=>['d'+i,O.familias.reduce((a,f)=>a+(f.dias?.[i]||0),0)]))});
    cf.append(famBox,dataTable([{label:'Servicio',key:'s',nw:1},...W.map((d,i)=>({label:dayShort(d),key:'d'+i,n:1}))],weekRows,'Trenes por día, semana del '+date(W[0])+' al '+date(W[6]),{cls:'compact'}));
    // Salidas por hora: lectura al pasar el ratón y mapa de calor en «Ver los datos».
    const ch=card('c-horas','Salidas por hora','Trenes que salen de su origen en cada hora · todos los servicios');
    const ctlH=segmented(DAYS,day,setDay,'Día');ctls.push(ctlH);ch.append(ctlH);
    const hBox=el('div'),heat=dataBox('Ver los datos: mapa de calor por servicio y hora'),heatBody=el('div');heat.append(heatBody);ch.append(hBox,heat);
    let scale='row';
    function drawHoras(){
      const F=O.familias,H=Array.from({length:24},(_,h)=>F.reduce((a,f)=>a+(f[HK[day]]||f.horas)[h],0)),peak=H.indexOf(Math.max(...H));
      ch.querySelector('.sub').textContent='Trenes que salen de su origen en cada hora · '+longDate(DAYDATE[day])+' · pico entre las '+peak+' y las '+(peak+1)+' h';
      hBox.replaceChildren();
      responsive(hBox,columns(H.map((v,h)=>({label:h+'–'+(h+1)+' h',tick:h+'h',value:v,h})),{hi:[peak],h:170,labelEvery:3,
        tip:d=>[d.label+' · '+fmt(d.value)+' salidas',...F.map(f=>['fam-'+FAMS.indexOf(f.nombre),f.nombre,fmt((f[HK[day]]||f.horas)[d.h])])]}),
        'Salidas por hora: máximo de '+fmt(H[peak])+' entre las '+peak+' y las '+(peak+1)+' h');
      heatBody.replaceChildren();
      const sc=segmented([['row','Escala por servicio'],['all','Escala común']],scale,v=>{scale=v;drawHoras();heat.open=true;},'Escala del mapa de calor');
      heatBody.append(sc);
      responsive(heatBody,heatmap(F.map(f=>({name:f.nombre,vals:(f[HK[day]]||f.horas)})),{scale}),'Mapa de calor de salidas por hora y servicio');
      heatBody.append(note((scale==='row'?'Cada fila con su propia escala: muestra las horas punta de cada servicio.':'Misma escala para todas las filas: Cercanías domina.')+' Más oscuro = más salidas; pasa el ratón por una celda para ver el número.'));
    }
    drawFam();drawHoras();
    renderPareto(O);renderEstaciones(O);renderVelocidad(O);
  }
  /* Mapa de calor (servicio × hora). En pantallas estrechas se gira: horas en filas. */
  function heatmap(rows,{scale='row'}={}){
    return w=>{
      const narrow=w<620,gmax=Math.max(1,...rows.flatMap(r=>r.vals));
      const lvl=(v,r)=>v/(scale==='row'?Math.max(1,...r.vals):gmax);
      const s=svg('svg',{class:'svgchart heat','aria-hidden':'true'});
      if(!narrow){
        const L=104,T=18,cw=(w-L)/24,ch=26,H=T+rows.length*ch+4;s.setAttribute('viewBox',`0 0 ${w} ${H}`);s.setAttribute('width',w);s.setAttribute('height',H);
        for(let h=0;h<24;h+=cw<22?3:1)s.append(svg('text',{x:L+h*cw+cw/2,y:12,'text-anchor':'middle'},h+'h'));
        rows.forEach((r,j)=>{const y=T+j*ch;s.append(svg('text',{x:L-8,y:y+ch/2+4,'text-anchor':'end',class:'v'},r.name));
          r.vals.forEach((v,h)=>{const q=lvl(v,r),cell=svg('rect',{x:L+h*cw+1,y:y+1,width:Math.max(1,cw-2),height:ch-2,rx:2,class:'cell','fill-opacity':(v?.08+.92*q:0).toFixed(3)});
            hover(cell,()=>[r.name+' · '+h+'–'+(h+1)+' h',fmt(v)+' salidas']);s.append(cell);
            if(v&&cw>=22)s.append(svg('text',{x:L+h*cw+cw/2,y:y+ch/2+4,'text-anchor':'middle',class:'cv'+(q>.55?' inv':'')},fmt(v)));});});
      }else{
        const L=40,T=34,cw=(w-L)/rows.length,ch=20,H=T+24*ch+4;s.setAttribute('viewBox',`0 0 ${w} ${H}`);s.setAttribute('width',w);s.setAttribute('height',H);
        rows.forEach((r,j)=>{const short=r.name.replace('Alta velocidad','AV').replace('Cercanías','Cerc.').replace('Intercity','IC').replace('Regional','Reg.');
          s.append(svg('text',{x:L+j*cw+cw/2,y:22,'text-anchor':'middle',class:'v'},short));
          r.vals.forEach((v,h)=>{const q=lvl(v,r),y=T+h*ch,cell=svg('rect',{x:L+j*cw+1,y:y+1,width:Math.max(1,cw-2),height:ch-2,rx:2,class:'cell','fill-opacity':(v?.08+.92*q:0).toFixed(3)});
            hover(cell,()=>[r.name+' · '+h+'–'+(h+1)+' h',fmt(v)+' salidas']);s.append(cell);
            if(v)s.append(svg('text',{x:L+j*cw+cw/2,y:y+ch/2+4,'text-anchor':'middle',class:'cv'+(q>.55?' inv':'')},fmt(v)));});});
        for(let h=0;h<24;h++)s.append(svg('text',{x:L-6,y:T+h*ch+ch/2+4,'text-anchor':'end'},h+'h'));
      }
      return s;
    };
  }
  /* Pareto: curva calculada aquí desde la lista de estaciones, con la estación que hay en cada punto. */
  function renderPareto(O){
    const P=O.pareto,E=O.estaciones,n=E.length,tot=E.reduce((a,s)=>a+s[5],0),cum=[0];for(const s of E)cum.push(cum.at(-1)+s[5]);
    const c=card('c-pareto','La mitad de las paradas se concentra en el '+pf.format(P.p50)+' % de las estaciones',fmt(n)+' estaciones con tren, de más a menos trenes · '+fmt(tot)+' paradas en un laborable · pasa el ratón por la curva');
    const xs=Array.from({length:n+1},(_,i)=>i),Y=i=>100*cum[i]/tot;
    responsive(c,lineChart({series:[{cls:'ref',get:i=>100*i/n},{cls:'main',get:Y}],xs,xTicks:[0,.25,.5,.75,1].map(f=>Math.round(f*n)),xFmt:i=>Math.round(100*i/n)+' %',h:260,
      marks:[{x:P.n50,y:50,text:fmt(P.n50)+' estaciones = 50 % de las paradas',dy:-10},{x:Math.round(P.p80*n/100),y:80,text:pf.format(P.p80)+' % de las estaciones = 80 %',dy:16}],
      tip:i=>i?['Las '+fmt(i)+' estaciones con más trenes ('+pf.format(100*i/n)+' %)',['lg-main','suman',pf.format(Y(i))+' % de las paradas'],'Nº '+fmt(i)+': '+E[i-1][0]+' · '+fmt(E[i-1][5])+' trenes']:['Ninguna estación']}),
      'Curva de Pareto: el '+pf.format(P.p50)+' % de las estaciones suma el 50 % de las paradas y el '+pf.format(P.p80)+' %, el 80 %. Gini '+pf.format(P.gini));
    c.append(note('Eje horizontal: % de estaciones (de más a menos trenes); vertical: % acumulado de paradas. La diagonal sería un reparto igual. Gini: '+pf.format(P.gini)+'.'));
    const rows=E.map((s,i)=>({r:i+1,n:s[0],c:s[1],pr:s[3],m:s[4],v:s[5],acc:pf.format(100*cum[i+1]/tot)+' %'}));
    const d=dataBox('Ver los datos: paradas por estación');
    d.append(shortTable([{label:'Nº',key:'r',n:1},{label:'Estación',get:r=>anchor(r.n,visor(cam(r.c,13.5))),nw:1},{label:'Provincia',key:'pr',muted:1,opt:1},{label:'Trenes',key:'v',n:1},{label:'% acumulado',key:'acc',n:1}],rows,{bar:'v'},15));
    c.append(d);
  }
  /* Estaciones con más trenes: un solo ranking filtrable por servicio, comunidad, provincia y municipio. */
  function renderEstaciones(O){
    const E=O.estaciones,c=card('c-estaciones','Estaciones con más trenes','Trenes con parada en un laborable ('+longDate(O.referencia.laborable)+') · filtra por servicio y territorio');
    const TYPES=[['all','Todos'],['4','Cercanías'],['3','Regional'],['0','Alta velocidad'],['1','Avant'],['2','Intercity']];
    const st={t:'all',ca:'',pr:'',m:''},val=s=>st.t==='all'?s[5]:s[6][+st.t];
    const uniq=(arr)=>[...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
    const filters=el('div','filters');
    const fType=segmented(TYPES,st.t,v=>{st.t=v;draw();},'Servicio');
    const fCa=select('Comunidad autónoma',[['','Todas'],...uniq(E.map(s=>s[2])).map(x=>[x,x])],'',v=>{st.ca=v;st.pr='';st.m='';refill();draw();});
    const fPr=select('Provincia',[['','Todas']],'',v=>{st.pr=v;st.m='';refill();draw();});
    const fM=select('Ciudad (municipio)',[['','Todas']],'',v=>{st.m=v;draw();});
    function refill(){const a=E.filter(s=>!st.ca||s[2]===st.ca);fPr.fill([['','Todas'],...uniq(a.map(s=>s[3])).map(x=>[x,x])],st.pr);
      const b=a.filter(s=>!st.pr||s[3]===st.pr);fM.fill([['','Todos'],...uniq(b.map(s=>s[4])).map(x=>[x,x])],st.m);}
    filters.append(fType);const sels=el('div','sels');sels.append(fCa,fPr,fM);filters.append(sels);refill();
    const out=el('div','est-out');c.append(filters,out);
    function draw(){
      const rows=E.filter(s=>(!st.ca||s[2]===st.ca)&&(!st.pr||s[3]===st.pr)&&(!st.m||s[4]===st.m)&&val(s)>0).sort((a,b)=>val(b)-val(a));
      const tname=TYPES.find(t=>t[0]===st.t)[1],sum=rows.reduce((a,s)=>a+val(s),0);
      out.replaceChildren();
      if(!rows.length){out.append(el('p','cb-empty','Ninguna estación con trenes de '+tname.toLowerCase()+' con estos filtros.'));return;}
      out.append(el('p','est-sum',fmt(rows.length)+' estaciones · '+fmt(sum)+' paradas'+(st.t==='all'?'':' de '+tname)));
      out.append(hbars(rows.slice(0,10).map(s=>({label:s[0],values:st.t==='all'?s[6].slice().reverse():[val(s)],href:visor(cam(s[1],13.5)),extra:st.t==='all'?null:'de '+fmt(s[5])})),
        {classes:st.t==='all'?['fam-4','fam-3','fam-2','fam-1','fam-0']:['fam-'+st.t],
          tip:(it,i)=>{const s=rows.find(r=>r[0]===it.label);return [s[0],(s[4]||'')+(s[3]?' · '+s[3]:''),...FAMS.map((f,k)=>s[6][k]?['fam-'+k,f,fmt(s[6][k])]:null),'Total: '+fmt(s[5])+' trenes'];}}));
      if(st.t==='all')out.append(legend(FAMS.map((f,k)=>['fam-'+k,f]).reverse()));
      const d=dataBox('Ver los datos: las '+fmt(rows.length)+' estaciones');
      d.append(shortTable([{label:'Estación',get:r=>anchor(r[0],visor(cam(r[1],13.5))),nw:1},{label:'Municipio',get:r=>r[4]||'—',muted:1},{label:'Provincia',get:r=>r[3],muted:1,opt:1},
        {label:st.t==='all'?'Trenes':tname,get:r=>val(r),n:1},...(st.t==='all'?FAMS.map((f,k)=>({label:f,get:r=>r[6][k]||'—',n:1,opt:1})):[{label:'Todos',get:r=>r[5],n:1}])],rows,{cls:'compact'},15));
      out.append(d);
    }
    draw();
  }
  /* Velocidad comercial entre dos capitales elegidas (origen y destino). */
  function renderVelocidad(O){
    const V=O.velocidad,ends=v=>v.rel.split(' – '),caps=[...new Set(V.flatMap(ends))].sort((a,b)=>a.localeCompare(b,'es'));
    const c=card('c-velocidad','Velocidad comercial del tren directo más rápido','Elige origen y destino · km del trazado IGN entre las dos estaciones ÷ tiempo programado · '+longDate(O.referencia.laborable));
    const st={o:caps.includes('Madrid')?'Madrid':caps[0],d:''};
    const pairs=o=>V.filter(v=>ends(v).includes(o)).map(v=>({...v,other:ends(v).find(x=>x!==o)})).sort((a,b)=>b.kmh-a.kmh);
    const fO=select('Origen',caps.map(x=>[x,x]),st.o,v=>{st.o=v;st.d='';refill();draw();});
    const fD=select('Destino',[],'',v=>{st.d=v;draw();});
    const swap=el('button','btn-ghost swap','⇄');swap.type='button';swap.setAttribute('aria-label','Intercambiar origen y destino');
    swap.addEventListener('click',()=>{if(!st.d)return;[st.o,st.d]=[st.d,st.o];fO.sel.value=st.o;refill();draw();});
    function refill(){const p=pairs(st.o);if(!p.some(x=>x.other===st.d))st.d=p[0]?.other||'';fD.fill(p.map(x=>[x.other,x.other]).sort((a,b)=>a[1].localeCompare(b[1],'es')),st.d);}
    const f=el('div','filters od');f.append(fO,swap,fD);const out=el('div');c.append(f,out);
    function draw(){
      const p=pairs(st.o),sel=p.find(x=>x.other===st.d);out.replaceChildren();
      if(sel){const r=el('div','od-read');
        const big=el('p','od-kmh');big.append(fmt(sel.kmh),el('small',null,' km/h'));
        r.append(big,el('p','od-det',st.o+' → '+st.d+' · '+dur(sel.min)+' · '+fmt(sel.km)+' km · '+sel.marca),el('p','od-st',sel.de+' – '+sel.a));
        const lg=logo(sel.marca==='AVE Euromed'?'AVE':sel.marca);if(lg)r.prepend(lg);out.append(r);}
      const lim=st.all?p.length:10,shown=p.slice(0,lim);if(sel&&!shown.includes(sel))shown.push(sel);
      out.append(el('p','cb-sub2','Capitales con tren directo desde '+st.o+' ('+p.length+'), de más a menos rápida'),
        hbars(shown.map(x=>({label:x.other,values:[x.kmh],hi:x.other===st.d,sel:x.other===st.d,extra:'km/h · '+dur(x.min),onClick:()=>{st.d=x.other;fD.sel.value=x.other;draw();}})),
          {tip:it=>{const x=p.find(q=>q.other===it.label);return [st.o+' – '+x.other,'Velocidad: '+fmt(x.kmh)+' km/h','Tiempo: '+dur(x.min)+' · '+fmt(x.km)+' km','Servicio: '+x.marca,x.de+' – '+x.a];}}));
      if(p.length>10){const b=el('button','btn-ghost',st.all?'Ver solo las 10 más rápidas':'Ver las '+p.length);b.type='button';b.addEventListener('click',()=>{st.all=!st.all;draw();});out.append(b);}
    }
    refill();draw();
    c.append(note('Velocidad media entre las dos estaciones, paradas incluidas; no es la velocidad máxima. Solo capitales con tren directo cuyo recorrido se puede medir sobre la red. Pulsa una barra para verla arriba.'),
      dataTable([{label:'Relación',key:'rel',nw:1},{label:'Desde',key:'de',muted:1,opt:1},{label:'Hasta',key:'a',muted:1,opt:1},{label:'Servicio',key:'marca'},{label:'Km',key:'km',n:1},{label:'Minutos',key:'min',n:1},{label:'Km/h',key:'kmh',n:1}],V,'Las '+V.length+' relaciones directas entre capitales'));
  }

  /* ════════ 3 · Uso: viajeros por tipo de servicio (INE), mes a mes y año contra año ════════ */
  const month=ym=>{const [y,m]=ym.split('-').map(Number);return new Date(y,m-1,15).toLocaleDateString('es-ES',{month:'long',year:'numeric'});};
  const MES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  function renderUso(J){
    const M=J.mercado;if(!M){$('#uso').hidden=true;document.querySelector('a[href="#uso"]')?.remove();return;}
    const V=M.viajeros,S=V.series,ORDER=['total','av','cercanias','media','resto_ld'];
    // Serie total = suma de los cuatro tipos en los meses que tienen todos.
    const byKey={};for(const k of Object.keys(S))byKey[k]=new Map(S[k].meses);
    const allM=S.av.meses.map(([d])=>d).filter(d=>Object.keys(S).every(k=>byKey[k].has(d)));
    byKey.total=new Map(allM.map(d=>[d,Object.keys(S).reduce((a,k)=>a+byKey[k].get(d),0)]));
    const NAME={total:'Todos los servicios',...Object.fromEntries(Object.keys(S).map(k=>[k,S[k].nombre]))};
    const c=card('c-demanda','Viajeros por tipo de servicio, mes a mes','Miles de viajeros al mes · cada línea es un año (2019 y desde 2022; 2020 y 2021 están en la tabla) · INE, hasta '+month(V.ultimo)+' · se actualiza cada mes');
    let k='total';
    const ctl=segmented(ORDER.filter(x=>x==='total'||S[x]).map(x=>[x,NAME[x].replace('Larga distancia (sin alta velocidad)','Resto larga distancia')]),k,v=>{k=v;draw();},'Tipo de servicio');
    const read=el('div','yoy-read'),chart=el('div'),leg=el('div'),tbl=el('div');c.append(ctl,read,chart,leg);
    function draw(){
      const m=byKey[k],last=[...m.keys()].at(-1),ly=+last.slice(0,4),years=[...new Set([...m.keys()].map(d=>+d.slice(0,4)))].filter(y=>y===2019||y>=2022);   // 2020 y 2021 (pandemia) aplastan la escala: van en la tabla
      const val=(y,mo)=>m.get(y+'-'+pad(mo))??null,lm=+last.slice(5,7);
      const yoy=(y,mo)=>{const a=val(y,mo),b=val(y-1,mo);return a!=null&&b?100*(a/b-1):null;};
      const cls=y=>y===ly?'yr-cur':y===ly-1?'yr-prev':y===2019?'yr-ref':'yr-old';
      const ytd=(y)=>{let s=0;for(let mo=1;mo<=lm;mo++)s+=val(y,mo)||0;return s;};
      const ytdVar=100*(ytd(ly)/ytd(ly-1)-1);
      read.replaceChildren();
      for(const [t,v,d] of [[month(last),fmt(val(ly,lm))+' mil',yoy(ly,lm)],['Enero–'+MES[lm-1]+' '+ly,pf.format(Math.round(ytd(ly)/100)/10)+' M',ytdVar],['Frente a '+MES[lm-1]+' 2019',null,val(2019,lm)?100*(val(ly,lm)/val(2019,lm)-1):null]]){
        const b=el('div','yoy-k');b.append(el('span','yoy-t',t));if(v)b.append(el('span','yoy-v',v));if(d!=null){const s=el('span','kpi-delta'+(d<0?' down':''),signed(d));b.append(s);}read.append(b);}
      const vals=years.flatMap(y=>Array.from({length:12},(_,i)=>val(y,i+1))).filter(v=>v!=null),hi=Math.max(...vals),lo=Math.min(...vals);
      const step=hi>20000?5000:hi>5000?1000:hi>2000?500:250,yMin=Math.max(0,Math.floor(lo*.9/step)*step),yMax=Math.ceil(hi*1.04/step)*step;
      chart.replaceChildren();
      responsive(chart,lineChart({series:years.map(y=>({name:String(y),cls:'ln-yr '+cls(y),get:mo=>val(y,mo)})).sort((a,b)=>(a.cls.includes('cur')?1:0)-(b.cls.includes('cur')?1:0)),
        xs:Array.from({length:12},(_,i)=>i+1),xTicks:Array.from({length:12},(_,i)=>i+1),xFmt:mo=>MES[mo-1],yMin,yMax,yStep:step,yFmt:v=>fmt(v),L:52,h:260,
        tip:mo=>[MES[mo-1].toUpperCase()+' · '+NAME[k]+' (miles)',...[...years].reverse().map(y=>{const v=val(y,mo);if(v==null)return null;const d=yoy(y,mo);return ['sw-'+cls(y),String(y),fmt(v)+(d!=null?'  ('+signed(d)+')':'')];})]}),
        NAME[k]+': '+fmt(val(ly,lm))+' mil viajeros en '+month(last)+', '+(yoy(ly,lm)!=null?signed(yoy(ly,lm)):'')+' frente al mismo mes del año anterior');
      leg.replaceChildren(legend([['sw-yr-cur',String(ly)],['sw-yr-prev',String(ly-1)],['sw-yr-ref','2019 (antes de la pandemia)'],['sw-yr-old','Otros años']]));
      // Tabla de lectura con todos los meses.
      const rows=[...m.keys()].reverse().map(d=>{const y=+d.slice(0,4),mo=+d.slice(5,7),v=m.get(d),p=val(y-1,mo),r=val(2019,mo);
        return {d:month(d),v,p:p??null,y:p?signed(100*(v/p-1)):'—',r:r&&y>2019?signed(100*(v/r-1)):'—'};});
      tbl.replaceChildren(dataTable([{label:'Mes',key:'d',nw:1},{label:'Viajeros (miles)',key:'v',n:1},{label:'Mismo mes, año anterior',key:'p',n:1,opt:1},{label:'Interanual',key:'y',n:1},{label:'Frente a 2019',key:'r',n:1,opt:1}],rows,NAME[k]+': todos los meses desde '+month([...m.keys()][0]),{cls:'compact',summary:'Ver los datos: todos los meses ('+rows.length+')'}));
    }
    draw();
    const ch=V.choque_av;
    c.append(note(`La alta velocidad ya es el ${pf.format(V.av_peso_ld.ultimos12)} % de los viajeros de larga distancia (${pf.format(V.av_peso_ld['2017'])} % en 2017). En enero y febrero de 2026 cayó un ${pf.format(-ch.ene_feb_2026)} % frente a 2025 y de mayo a ${month(ch.hasta)} sigue un ${pf.format(-ch.may_ult_2026)} % por debajo.`));
    if(ch.corredores_1t&&ch.evento){
      const p=note(`Por corredor, en el primer trimestre de 2026 frente al de 2025 (CNMC): ${ch.corredores_1t.map(x=>x.corredor+' '+signed(x.var)).join(', ')}. La caída se concentra en Andalucía y coincide con el ${ch.evento.nombre} del ${date(ch.evento.fecha)}, ${ch.evento.consecuencia} (`);
      p.append(anchor(ch.evento.fuente,ch.evento.url),'). Ni el INE ni la CNMC atribuyen la caída a una causa.');
      c.append(p);
    }
    c.append(tbl);
  }

  /* ════════ 4 · Competencia: viajeros, ocupación y precio (CNMC) y oferta por estación ════════ */
  const OPS=[['Renfe','b-renfe','Renfe'],['OUIGO','b-ouigo','OUIGO'],['iryo','b-iryo','iryo']];
  const PRICE=[['Renfe-AVE','b-ave','AVE'],['Renfe-AVLO','b-avlo','Avlo'],['Iryo','b-iryo','iryo'],['OUIGO','b-ouigo','OUIGO']];
  function renderViajerosAV(J){
    const C=J.cnmc,ids=['c-cuota','c-cuota-t','c-ocupacion','c-precio'];
    if(!C){for(const id of ids)document.getElementById(id)?.remove();return;}
    const corr=x=>x.replace('Madrid-','Madrid–');
    // Cuota de viajeros por corredor (barras 100 % apiladas, color de cada operador).
    const rows=[...C.corredores].sort((a,b)=>a.op.Renfe.cuota-b.op.Renfe.cuota),rc=rows.map(x=>x.op.Renfe.cuota);
    let c=card('c-cuota',`Renfe tiene entre el ${Math.round(Math.min(...rc))} % y el ${Math.round(Math.max(...rc))} % de los viajeros de cada corredor`,'Cuota de viajeros por operador · 2025 · CNMC · pasa el ratón por cada tramo');
    c.append(legend(OPS.map(([,cls,n])=>[cls,n])),
      hbars(rows.map(x=>({label:corr(x.corredor),values:OPS.map(([k])=>x.op[k]?.cuota||0),shown:x.op.Renfe.cuota,x})),{classes:OPS.map(o=>o[1]),format:pc,extra:()=>'Renfe',max:100,
        tip:(it,i)=>[it.label+' · '+pf.format(it.x.viajeros)+' M de viajeros',...OPS.map(([k,cls,n],j)=>it.x.op[k]?[cls,n+(j===i?' ◂':''),pc(it.x.op[k].cuota)+' · '+pf.format(it.x.viajeros*it.x.op[k].cuota/100)+' M']:null)]}),
      note('Barras al 100 %: la longitud es la cuota, no el número de viajeros. Los viajeros del corredor incluyen trayectos intermedios (Madrid–Zaragoza cuenta en Madrid–Barcelona).'),
      dataTable([{label:'Corredor',key:'n',nw:1},{label:'Viajeros 2025 (millones)',key:'v',n:1},...OPS.map(([k,,n])=>({label:n+' (%)',key:k,n:1}))],
        rows.map(x=>({n:x.corredor,v:pf.format(x.viajeros),...Object.fromEntries(OPS.map(([k])=>[k,pf.format(x.op[k]?.cuota??0)]))})),'Cuota de viajeros por corredor, 2025'));
    // Cuota de Renfe en el tiempo.
    const S=C.serie,ticks=S.map((s,i)=>[i,s[0]]).filter(([,t])=>/T1$/.test(t)&&+t.slice(0,4)%2===0).map(([i])=>i);
    c=card('c-cuota-t',`Desde 2023, Renfe se mantiene en torno al ${Math.round(C.renfe_desde_2023)} % de los viajeros; hasta 2021 tenía el 100 %`,'Cuota trimestral de Renfe en los cinco corredores · CNMC, hasta '+C.ultimo_trimestre.replace('T',' T'));
    responsive(c,lineChart({series:[{cls:'b-renfe-ln',get:i=>S[i][1]}],xs:S.map((s,i)=>i),xTicks:ticks,xFmt:i=>S[i][0].slice(0,4),h:220,yMin:0,yMax:100,
      marks:[{x:S.length-1,y:S.at(-1)[1],text:pc(S.at(-1)[1])}],tip:i=>[S[i][0].replace('T',' · T'),['b-renfe','Renfe',pc(S[i][1])],['b-ctx','OUIGO e iryo',pc(100-S[i][1])]]}),
      'Cuota de Renfe por trimestre: 100 % hasta 2021 y en torno al '+Math.round(C.renfe_desde_2023)+' % desde 2023');
    c.append(note('Coincide con la llegada de OUIGO (2021) e iryo (2022); la serie muestra el cambio, no prueba su causa.'),
      dataTable([{label:'Trimestre',key:'t'},{label:'Cuota de Renfe (%)',key:'r',n:1}],S.map(s=>({t:s[0],r:pf.format(s[1])})),'Cuota trimestral de Renfe'));
    renderOcupacion(C,corr);
    // Precio medio 2025 (año completo: la CNMC cambió el método en el 1T 2026).
    const P=[...C.precio_2025].sort((a,b)=>b['Renfe-AVE']-a['Renfe-AVE']);
    const ratio=P.map(r=>r['Renfe-AVE']/Math.min(...PRICE.slice(1).map(k=>r[k[0]]).filter(v=>v!=null)));
    const lo=pf.format(Math.round(Math.min(...ratio)*10)/10),hi=pf.format(Math.round(Math.max(...ratio)*10)/10);
    c=card('c-precio',`El AVE cuesta ${lo===hi?lo:'entre '+lo+' y '+hi} veces la opción más barata de cada corredor`,'Precio medio por viaje, 2025 (año completo) · CNMC · pasa el ratón por cada punto');
    c.append(legend(PRICE.map(([,cls,n])=>[cls,n,n])));
    responsive(c,dots(P,PRICE,{tip:(r,k,name,cls)=>{const cheap=Math.min(...PRICE.map(q=>r[q[0]]).filter(v=>v!=null));
      return [corr(r.trayecto),[cls,name,eur(r[k])],r[k]===cheap?'La opción más barata':'× '+pf.format(Math.round(r[k]/cheap*100)/100)+' la más barata','Media del corredor: '+eur(r.Total)];}}),
      'Precio medio por viaje y operador en 2025. '+P.map(r=>r.trayecto+': AVE '+eur(r['Renfe-AVE'])).join('; '));
    c.append(note('Sin IVA, media de todas las tarifas vendidas. En 2025 no hubo Avlo en Madrid–Barcelona. Los meses de 2026 no se comparan: la CNMC cambió el método de cálculo en el primer trimestre.'),
      dataTable([{label:'Trayecto',key:'t',nw:1},...PRICE.map(([k,,n])=>({label:n,key:k,n:1})),{label:'Media',key:'Total',n:1}],P.map(r=>({t:r.trayecto,...Object.fromEntries([...PRICE.map(([k])=>[k,eur(r[k])]),['Total',eur(r.Total)]])})),'Precio medio por viaje, 2025'));
  }
  /* Ocupación: resumen por operador (cinco corredores) y detalle por corredor, con cuota y viajeros en el tooltip. */
  function renderOcupacion(C,corr){
    const O5=C.ocupacion_5,ord=OPS.map(o=>o[0]).sort((a,b)=>O5[b]-O5[a]),cls=k=>OPS.find(o=>o[0]===k)[1];
    const c=card('c-ocupacion',`${ord[0]} llena el ${Math.round(O5[ord[0]])} % de sus plazas; ${ord[1]}, el ${Math.round(O5[ord[1]])} %, e ${ord[2]}, el ${Math.round(O5[ord[2]])} %`,'Ocupación en 2025 = viajeros-km ÷ plazas-km · CNMC');
    const grid=el('div','occ');
    // Resumen: una ficha por operador con su ocupación y la cuota de viajeros que tiene.
    const tot=op=>C.corredores.reduce((a,x)=>a+(x.op[op]?x.viajeros*x.op[op].cuota/100:0),0),all=OPS.reduce((a,[k])=>a+tot(k),0);
    const tiles=el('div','occ-tiles');
    for(const k of ord){const t=el('div','occ-tile');const lg=logo(k);
      const top=el('div','occ-top');if(lg)top.append(lg);else top.append(el('span','occ-name',k));
      const v=el('p','occ-v');v.append(pf.format(Math.round(O5[k])),el('small',null,' %'));
      const bar=el('span','occ-bar');const f=el('span','occ-fill '+cls(k));f.style.width=O5[k]+'%';bar.append(f);
      t.append(top,v,bar,el('p','occ-s','de las plazas ocupadas · '+pf.format(100*tot(k)/all)+' % de los viajeros'));tiles.append(t);}
    // Detalle por corredor: puntos por operador sobre la misma escala.
    const rows=C.corredores.map(x=>({trayecto:x.corredor,x,...Object.fromEntries(OPS.map(([k])=>[k,x.op[k]?.ocupacion??null]))})).sort((a,b)=>(b.Renfe??0)-(a.Renfe??0));
    const det=el('div','occ-det');det.append(el('p','cb-sub2','Por corredor'),legend(OPS.map(([,cl,n])=>[cl,n])));
    responsive(det,dots(rows,OPS,{fmtv:pc,unit:' %',step:10,tip:(r,k,name,cl)=>{const o=r.x.op[k];const best=OPS.map(q=>[q[2],r[q[0]]]).filter(q=>q[1]!=null).sort((a,b)=>b[1]-a[1])[0];
      return [corr(r.trayecto),[cl,name,pc(o.ocupacion)],'Cuota de viajeros: '+pc(o.cuota),'≈ '+pf.format(r.x.viajeros*o.cuota/100)+' M de viajeros en 2025',best[0]===name?'La más alta del corredor':'La más alta: '+best[0]+' ('+pc(best[1])+')'];}}),
      'Ocupación por corredor y operador en 2025');
    grid.append(tiles,det);c.append(grid);
    const mb=C.corredores.find(x=>x.corredor==='Madrid-Barcelona');
    c.append(note('Dividir viajeros entre plazas da cifras falsas por los trayectos intermedios: por eso se usan viajeros-km y plazas-km. Más ocupación no es más viajeros: OUIGO llena más sus trenes, pero Renfe lleva '+pf.format(100*tot('Renfe')/all)+' de cada 100 viajeros.'+(mb?' Solo Madrid–Barcelona: '+ord.map(k=>k+' '+pc(mb.op[k]?.ocupacion)).join(', ')+'.':'')),
      dataTable([{label:'Operador',key:'k'},{label:'Cinco corredores (%)',key:'a',n:1},...C.corredores.map(x=>({label:x.corredor.replace('Madrid-',''),key:x.corredor,n:1}))],
        OPS.map(([k])=>({k,a:pf.format(O5[k]),...Object.fromEntries(C.corredores.map(x=>[x.corredor,pc(x.op[k]?.ocupacion)]))})),'Ocupación por operador y corredor, 2025',{cls:'compact'}));
  }
  function renderCompetencia(J){
    const O=J.oferta,all=O.competencia,K=[['ave','b-ave','AVE y AVE Euromed'],['avlo','b-avlo','Avlo'],['ouigo','b-ouigo','OUIGO'],['iryo','b-iryo','iryo']];
    const c=card('c-competencia','Trenes de alta velocidad por estación y operador','Estaciones donde paran iryo u OUIGO · '+longDate(O.referencia.laborable)+' · Avant aparte · pasa el ratón por cada tramo');
    let mode='n',n=8;
    const ctl=segmented([['n','Trenes'],['p','% de la estación']],mode,v=>{mode=v;draw();},'Medida');
    const box=el('div');c.append(ctl,legend(K.map(([,cls,name])=>[cls,name,name.split(' ')[0]])),box);
    function draw(){
      const list=all.slice(0,n),tot=x=>K.reduce((a,[k])=>a+x[k],0);
      box.replaceChildren(hbars(list.map(x=>({label:x.n,values:K.map(([k])=>mode==='n'?x[k]:100*x[k]/tot(x)),shown:mode==='n'?tot(x):100*(x.ouigo+x.iryo)/tot(x),href:visor(cam(x.c,13.5)),x})),
        {classes:K.map(k=>k[1]),max:mode==='p'?100:undefined,format:mode==='n'?fmt:v=>pf.format(v)+' %',extra:()=>mode==='n'?'trenes':'OUIGO + iryo',
          tip:(it,i)=>[it.x.n,...K.map(([k,cls,name],j)=>[cls,name+(j===i?' ◂':''),fmt(it.x[k])+' · '+pct(it.x[k],tot(it.x))]),'Total: '+fmt(tot(it.x))+' trenes'+(it.x.avant?' · Avant aparte: '+fmt(it.x.avant):'')]}));
      if(all.length>n){const b=el('button','btn-ghost','Ver las '+all.length+' estaciones');b.type='button';b.addEventListener('click',()=>{n=all.length;draw();});box.append(b);}
    }
    draw();
    c.append(note('Oferta programada (trenes con parada), no viajeros ni cuota de mercado. iryo sale de un GTFS comunitario, no oficial, compilado con los horarios de iryo.eu.'),
      dataTable([{label:'Estación',key:'n',nw:1},{label:'AVE',key:'ave',n:1},{label:'Avlo',key:'avlo',n:1},{label:'OUIGO',key:'ouigo',n:1},{label:'iryo',key:'iryo',n:1},{label:'Avant',key:'avant',n:1}],all,'Trenes con parada por operador',{cls:'compact'}));
  }

  /* Seguridad (INE): accidentes significativos por millón de tren-km. Pocos accidentes al año: la tasa oscila mucho. */
  function renderSeguridad(J){
    const S=J.mercado?.seguridad;if(!S){$('#c-seguridad').hidden=true;return;}
    const A=S.anual,l=A.at(-1),f2=new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}),f3=v=>f2.format(v);
    const c=card('c-seguridad','Accidentes significativos por millón de tren-km: '+f3(l.tasa)+' en '+l.anio,'Viajeros y mercancías · media 2014–2019: '+f3(S.ref_2014_2019)+' · INE');
    responsive(c,columns(A.map(x=>({label:String(x.anio),value:x.tasa,tick:"'"+String(x.anio).slice(2),x})),{hi:[A.length-1],h:140,format:f3,top:Math.max(...A.map(x=>x.tasa)),
      tip:d=>[d.label,'Tasa: '+f3(d.value),fmt(d.x.accidentes)+' accidentes · '+pf.format(d.x.trenkm_mill)+' M tren-km']}),'Accidentes significativos por millón de tren-km por año, de '+f3(A[0].tasa)+' en '+A[0].anio+' a '+f3(l.tasa)+' en '+l.anio);
    c.append(note(`${l.anio}: ${fmt(l.accidentes)} accidentes significativos en ${pf.format(l.trenkm_mill)} millones de tren-km; ${fmt(l.tipos.arrollamientos)} fueron arrollamientos de personas y ${fmt(l.tipos.pasos_a_nivel)}, en pasos a nivel. Con tan pocos casos al año, un año aislado no marca tendencia. ${l.anio<2026?'El accidente de Adamuz (enero de 2026) entrará en la serie de '+(l.anio+1)+'.':''}`),
      dataTable([{label:'Año',key:'a'},{label:'Accidentes',key:'n',n:1},{label:'Tren-km (millones)',key:'t',n:1},{label:'Por millón de tren-km',key:'r',n:1}],A.map(x=>({a:String(x.anio),n:x.accidentes,t:pf.format(x.trenkm_mill),r:f3(x.tasa)})),'Accidentes ferroviarios significativos'));
  }

  /* ════════ 5 · Red ════════ */
  const GAUGE={'1668':'Ibérico · 1.668 mm','1435':'Estándar · 1.435 mm','1000':'Métrico · 1.000 mm','mixed':'Mixto','unknown':'Sin determinar'};
  const GAUGE_CLS={'1668':'c-navy','1435':'g-std','1000':'g-met','mixed':'g-mix','unknown':'c-soft'};
  const ORIGIN={ign:'IGN: ancho nominal del tramo',fix_adif:'Adif: tramos en servicio',linea:'Adif: ancho de la línea',fix_ign:'IGN: ancho mixto',fix_net:'Inferido: red de ancho métrico',fix_topo:'Inferido por la red (tramos vecinos)',none:'Sin determinar'};
  function renderRed(J){
    const R=J.red;
    let c=card('c-ancho','Km por ancho de vía','Sobre la misma base que el resto de la red: '+fmt(R.km)+' km');
    const bar=el('div','bar100');bar.setAttribute('aria-hidden','true');
    for(const a of R.ancho){if(!a.km)continue;const s=el('span',GAUGE_CLS[a.id]||'c-ctx');s.style.width=(100*a.km/R.km)+'%';hover(s,()=>[GAUGE[a.id]||a.id,fmt(a.km)+' km · '+pct(a.km,R.km)]);bar.append(s);}
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
      hbars(cor.map(x=>({label:x.nombre,values:[x.service,x.construction,x.project],shown:x.service,href:visor({t:'corridors',k:x.id,st:'service,construction,project'})})),{classes:['c-navy','c-ctx','c-soft'],extra:()=>'km en servicio',
        tip:it=>[it.label,['c-navy','En servicio',fmt(it.values[0])+' km'],['c-ctx','En construcción',fmt(it.values[1])+' km'],['c-soft','En proyecto',fmt(it.values[2])+' km']]}),
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

  /* ════════ 6 · Método y límites ════════ */
  function renderMetodo(J){
    const G=J.glosario,O=J.oferta;
    let c=body('c-glosario');
    const dl=el('dl','src'),row=(k,v)=>dl.append(el('dt',null,k),el('dd',null,v));
    row('Universo de la oferta',O.universo+' Las fichas del visor todavía no incluyen Cercanías de ancho ibérico ni iryo: sus cifras por estación pueden ser menores.');
    row('Tren',' Cada circulación programada del día, contada una vez en cada estación donde para. OUIGO se reconstruye uniendo los trayectos de su PDF (mismo tren si coincide estación, hora y sentido).');
    row('Día de referencia','Miércoles de la primera semana completa (lunes a domingo) que cubren todas las fuentes: '+longDate(O.referencia.laborable)+'. Los horarios se regeneran cada lunes'+(O.actualizacion?' (próxima: '+longDate(O.actualizacion.proxima)+')':'')+'.');
    row('Km de alta velocidad',fmt(G.km_av.prestaciones)+' km (prestaciones de la vía, clasificación del atlas sobre el IGN). No confundir con '+fmt(G.km_av.corredores)+' km de corredores Hermes en servicio ni con '+fmt(G.km_av.adifav)+' km gestionados por Adif AV.');
    row('Alta velocidad (trenes)','AVE, AVE Euromed, Avlo, iryo y OUIGO: '+fmt(G.av.comercial)+' trenes un laborable. Avant ('+fmt(G.av.avant)+') es media distancia por vía de alta velocidad y va aparte.');
    row('Estaciones',fmt(G.estaciones.con_tren)+' con tren el día de referencia, de '+fmt(G.estaciones.horario)+' en los horarios. El catálogo de Renfe tiene '+fmt(G.estaciones.catalogo)+' (no incluye todas las de Cercanías) y el catálogo de servicios del visor, '+fmt(G.estaciones.variantes)+'. El municipio de cada estación es el término municipal (INE) que la contiene.');
    row('Red',fmt(J.red.km)+' km: ejes IGN con atributos en la España peninsular. Es longitud de ejes, no de líneas oficiales de Adif; se excluyen '+fmt(J.red.tramos_sin_atributos)+' tramos sin atributos (duplicados esquemáticos).');
    row('Población servida','Población municipal (INE, '+date(J.cobertura.fecha)+') con una estación a ≤ X km en línea recta: 0 si está dentro del término municipal; si no, desde su centroide.');
    row('Logos','Wikimedia Commons (dominio público). Solo identifican la marca de cada servicio.');
    c.append(dl);
    c=body('c-no');
    const ul=el('ul','plain');
    for(const t of ['Viajeros por estación, por línea o por tren: el INE solo da totales nacionales por tipo de servicio, y la CNMC, los cinco corredores de alta velocidad con competencia.','Puntualidad y retrasos: los horarios son oferta programada, no circulaciones reales. Los avisos de Cercanías se consultan una vez por semana en su capítulo, sin cubrir toda la red.',
      'Ingresos por operador y plazas por tren: la CNMC no publica los ingresos de cada empresa.','Operadores autonómicos (FGC, Euskotren, FGV): sus horarios están en el Punto de Acceso Nacional, con registro.','Mercancías por tramo o por terminal, obras y cortes de vía: las mercancías solo llegan como total nacional por operador.',
      'Acceso real a la estación: las distancias son en línea recta.'])ul.append(el('li',null,t));
    c.append(ul,note('Por eso no hay ratios de trenes por habitante ni comparaciones de calidad entre territorios más allá de la oferta programada.'));
    c=body('c-fuentes');
    const fl=el('dl','src');
    for(const s of Object.values(O.fuentes))fl.append(el('dt',null,s.label),el('dd',null,'Horarios publicados del '+date(s.from)+' al '+date(s.to)+(s.official===false?' · no oficial':'')+'.'));
    for(const [k,v] of [['Red',J.fuentes.red],['Población',J.fuentes.poblacion],['Corredores y TEN-T','Hermes (Ministerio de Transportes), '+date(J.corredores.fecha)]])fl.append(el('dt',null,k),el('dd',null,v));
    if(J.mercado){const F=J.mercado.fuentes;
      fl.append(el('dt',null,'Viajeros'),el('dd',null,F.ine.label+', hasta '+month(F.ine.hasta)+'. Se descarga cada semana; el INE publica un mes nuevo cada mes.'));}
    c.append(fl,note('Todo se regenera cada lunes con «node tools/build-rutas.mjs --download», «node tools/build-cabina-mercado.mjs» y «node tools/build-cabina.mjs» (.github/workflows/rutas-semanal.yml). Origen de los datos de horarios: Renfe Operadora (CC BY 4.0); iryo: Clément Desouche (CC BY 4.0).'));
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
    b=body('a-marcas');const S=J.servicios;
    const g=el('div','brands');
    for(const [name,items] of [['Alta velocidad',[['AVE','Incluye AVE Euromed (antes Euromed)'],['Avlo','Alta velocidad de bajo coste'],['Avant','Media distancia en alta velocidad']]],
      ['Distancia larga y media',[['Intercity','Antes Alvia e Intercity'],['Regional','Antes Media Distancia, Regional, Regional Exprés y Proximidad']]],['Movilidad metropolitana',[['Cercanías','Rodalies de Catalunya mantiene su identidad']]]]){
      const f=el('div','brand-fam');f.append(el('h4',null,name));const dl=el('dl');for(const [k,v] of items){const dt=el('dt');const lg=logo(k);if(lg)dt.append(lg);dt.append(k);dl.append(dt,el('dd',null,v));}f.append(dl);g.append(f);}
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
