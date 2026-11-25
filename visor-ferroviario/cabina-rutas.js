/* Cabina · Rutas: tabla filtrable de todas las rutas ferroviarias de viajeros de España.
   Datos ya agregados en capas/rutas.json (tools/build-rutas.mjs); aquí solo se filtra, ordena y pinta.
   Sin estilos en línea (CSP): las barras de datos se dimensionan con CSSOM. Estado de los filtros en el hash de la URL. */
(function(){
  'use strict';
  const $=s=>document.querySelector(s);
  const nf=new Intl.NumberFormat('es-ES'),fmt=n=>n===null||n===undefined?'—':nf.format(Math.round(n));
  const pad=n=>String(n).padStart(2,'0'),hm=m=>m===null||m===undefined?'—':pad(Math.floor(m/60)%24)+':'+pad(m%60);
  const dur=m=>{if(m===null||m===undefined)return '—';const h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+pad(r):''):r+' min';};
  const date=iso=>iso?new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'}).replace('.',''):'—';
  const longDate=iso=>new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const norm=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined&&text!==null)e.textContent=text;return e;}
  const visor=state=>'index.html#'+encodeURIComponent(JSON.stringify(state));
  const PAGE=50,FAM_ORDER=['Alta velocidad','Avant','Intercity','Regional','Cercanías'];
  const FAM_CLS={'Alta velocidad':'rt-fam-av','Avant':'rt-fam-avant','Intercity':'rt-fam-ic','Regional':'rt-fam-reg','Cercanías':'rt-fam-cer'};
  // Logo y color de fila por operador. Avlo es una marca de Renfe, pero lleva su propio logo y color.
  const OP_KEY={Renfe:'renfe',iryo:'iryo',OUIGO:'ouigo'},OP_ALT={renfe:'Renfe',avlo:'Renfe · Avlo',iryo:'iryo',ouigo:'OUIGO'};
  const opKey=r=>r.marca==='Avlo'?'avlo':OP_KEY[r.op]||null;

  let R,ST,CORTES=new Map(),rows=[],view=[],shown=PAGE,sort={key:'sem',dir:-1};
  const open=new Set(),cmp=new Set();

  /* ── columnas: clave, cabecera, valor, número, clase para ocultar en móvil ── */
  const COLS=[
    {key:'ruta',label:'Ruta',val:r=>r._name},
    {key:'marca',label:'Servicio',val:r=>r.fam+' '+r.marca,cls:'rt-c-srv'},
    {key:'op',label:'Operador',val:r=>r.op,cls:'rt-c-op'},
    // Bloque de tiempo: días sueltos | semana, mes y año. Las líneas divisorias van en rt-t-ini, rt-t-mid y rt-t-fin.
    {key:'lab',label:'Laborable',n:1,val:r=>r.lab,cls:'rt-t-ini',title:'Trenes el miércoles de referencia'},
    {key:'sab',label:'Sábado',n:1,val:r=>r.sab,cls:'rt-c-sab'},
    {key:'dom',label:'Domingo',n:1,val:r=>r.dom,cls:'rt-c-dom'},
    {key:'sem',label:'Semana',n:1,val:r=>r.sem,cls:'rt-t-mid',title:'Trenes de lunes a domingo de la semana de referencia'},
    {key:'mes',label:'Mes*',n:1,val:r=>r.mes,cls:'rt-c-mes',title:'Estimación: semana × 4,35'},
    {key:'anio',label:'Año*',n:1,val:r=>r.anio,cls:'rt-c-anio rt-t-fin',title:'Estimación: semana × 52'},
    {key:'pri',label:'Primero – último',val:r=>r.pri,cls:'rt-c-hor'},
    {key:'dur',label:'Duración',n:1,val:r=>r.dur,cls:'rt-c-dur',title:'Mediana de los trenes del día'},
    {key:'par',label:'Paradas',n:1,val:r=>r.par,cls:'rt-c-par'},
    {key:'km',label:'Km',n:1,val:r=>r.via?.km??null,cls:'rt-c-km',title:'Km del trazado (red IGN; en Cercanías, dibujo del GTFS)'},
    {key:'vel',label:'Km/h',n:1,val:r=>r.via?.vel??null,cls:'rt-c-vel',title:'Velocidad media: km ÷ duración mediana'},
    {key:'canc',label:'Canc. %',n:1,val:r=>incPct(r,'canc'),cls:'rt-c-inc',title:'Trenes cancelados según el tiempo real de Renfe, últimos 30 días: cancelados ÷ (vistos + cancelados). «—»: sin tiempo real o con menos de 10 trenes con dato'},
    {key:'ret',label:'Retr. %',n:1,val:r=>incPct(r,'ret15'),cls:'rt-c-inc',title:'Trenes con 15 min o más de retraso según el tiempo real de Renfe, últimos 30 días: con retraso ÷ vistos'},
    {key:'ocu',label:'Ocup. %',n:1,val:r=>r._cnmc?.ocupacion??null,cls:'rt-c-ocu',title:'Ocupación del operador en su corredor (CNMC, últimos 4 trimestres): viajeros-km ÷ plazas-km'},
    {key:'cmp',label:'Comparar',cls:'rt-c-cmp',nosort:1}
  ];

  /* ── filtros ── */
  const F={q:$('#f-q'),op:$('#f-op'),emp:$('#f-emp'),fam:$('#f-fam'),marca:$('#f-marca'),nuc:$('#f-nuc'),ca:$('#f-ca'),pr:$('#f-pr'),via:$('#f-via'),ancho:$('#f-ancho'),elec:$('#f-elec'),cor:$('#f-cor'),min:$('#f-min'),activas:$('#f-activas')};
  // Categorías de vía de cada ruta (de r.via, calculado en tools/build-rutas.mjs).
  const ANCHO={'1668':'Ibérico','1435':'Estándar','1000':'Métrico','mixed':'Mixto','varios':'Varios anchos','unknown':'Sin determinar'};
  const viaTipo=r=>r.via?.tipo||(r.via?.km?'Sin dato (Cercanías)':'Sin trazado');
  const viaAncho=r=>r.via?.ancho?ANCHO[r.via.ancho]||r.via.ancho:'Sin trazado';
  const viaElec=r=>{const v=r.via;if(!v?.km)return 'Sin trazado';if(v.el===null||v.el===undefined)return 'Sin dato';
    if(v.elSin>=50)return 'Sin dato';if(v.el>=95)return 'Electrificada';if(v.el<=5)return 'Sin electrificar';return 'Parcialmente';};
  function fillSelect(sel,values,keep){const cur=keep??sel.value;sel.length=1;for(const v of values){const o=el('option',null,v);o.value=v;sel.append(o);}sel.value=values.includes(cur)?cur:'';}
  const uniq=a=>[...new Set(a.filter(Boolean))].sort((x,y)=>x.localeCompare(y,'es'));
  function state(){return {q:F.q.value.trim(),op:F.op.value,emp:F.emp.value,fam:F.fam.value,marca:F.marca.value,nuc:F.nuc.value,ca:F.ca.value,pr:F.pr.value,via:F.via.value,ancho:F.ancho.value,elec:F.elec.value,cor:F.cor.value,min:F.min.value,activas:F.activas.checked?'':'0',
    s:sort.key+(sort.dir<0?'-':'+')};}
  function writeHash(){const s=state(),p=new URLSearchParams();for(const [k,v] of Object.entries(s))if(v&&!(k==='s'&&v==='sem-'))p.set(k,v);
    const h=p.toString();history.replaceState(null,'',h?'#'+h:location.pathname+location.search);}
  function readHash(){const p=new URLSearchParams(location.hash.slice(1));return Object.fromEntries(p);}
  function dependentOptions(){
    // Marca según servicio; provincia según comunidad.
    const fam=F.fam.value;fillSelect(F.marca,uniq(rows.filter(r=>!fam||r.fam===fam).map(r=>r.marca)));
    const ca=F.ca.value;fillSelect(F.pr,uniq(ST.filter(s=>!ca||s.ca===ca).map(s=>s.pr)));
  }

  function apply(){
    const s=state(),terms=norm(s.q).split(/[\s,;→>–-]+/).filter(Boolean),min=+s.min||0,caSet=s.ca?new Set(ST.map((x,i)=>x.ca===s.ca?i:-1).filter(i=>i>=0)):null,prSet=s.pr?new Set(ST.map((x,i)=>x.pr===s.pr?i:-1).filter(i=>i>=0)):null;
    view=rows.filter(r=>(!s.op||r.op===s.op)&&(!s.emp||r.emp===s.emp)&&(!s.fam||r.fam===s.fam)&&(!s.marca||r.marca===s.marca)&&(!s.nuc||r.nuc===s.nuc)
      &&(!s.cor||r._cnmc?.corredor===s.cor)&&(!s.via||viaTipo(r)===s.via)&&(!s.ancho||viaAncho(r)===s.ancho)&&(!s.elec||viaElec(r)===s.elec)
      &&(s.activas==='0'||r.sem>0)&&r.lab>=min&&(!caSet||r.est.some(i=>caSet.has(i)))&&(!prSet||r.est.some(i=>prSet.has(i)))&&terms.every(t=>r._search.includes(t)));   // cada palabra por separado: «atocha sants» encuentra Atocha → Sants
    const c=COLS.find(x=>x.key===sort.key)||COLS[6],dir=sort.dir;
    view.sort((a,b)=>{const x=c.val(a),y=c.val(b);if(x===y)return b.sem-a.sem;if(x===null||x===undefined)return 1;if(y===null||y===undefined)return -1;
      return (typeof x==='string'?x.localeCompare(y,'es'):x-y)*dir;});
    shown=PAGE;writeHash();renderKpis();renderTable();
    window.RutasHeatmapSelection={rows:view,stations:ST,reference:R.referencia,filters:s};
    window.dispatchEvent(new Event('rutas-selection'));
  }

  /* ── resumen de la selección ── */
  function kpi(label,value,ref){const k=el('div','kpi');k.append(el('span','kpi-label',label),el('span','kpi-value',value),el('span','kpi-ref',ref));return k;}
  // KPI con barra a la derecha: qué parte del total representa la selección.
  function kpiShare(label,n,total,ref){
    const k=el('div','kpi rt-kpi-share'),p=total?100*n/total:0,row=el('div','rt-share'),bar=el('div','rt-share-bar'),fill=el('span');
    fill.style.width=p+'%';bar.append(fill);bar.setAttribute('aria-hidden','true');
    const pc=el('span','rt-share-pc',(p>0&&p<1?'< 1':fmt(p))+' %');
    const side=el('div','rt-share-side');side.append(pc,bar);row.append(el('span','kpi-value',fmt(n)),side);
    k.append(el('span','kpi-label',label),row,el('span','kpi-ref',ref));return k;
  }
  const shortDate=iso=>new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long'});
  function renderKpis(){
    const supWd=view.reduce((a,r)=>a+(r.sup?r.sup[2]:0),0),lab=view.reduce((a,r)=>a+r.lab,0),sem=view.reduce((a,r)=>a+r.sem,0),st=new Set();for(const r of view)for(const i of r.est)st.add(i);
    const ref=R.referencia,wd=new Date(ref.laborable+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long'});
    $('#kpis').replaceChildren(
      kpiShare('Rutas',view.length,rows.length,'de '+fmt(rows.length)+' en total'),
      kpi('Trenes en un día laborable',fmt(lab),'Suma de estas rutas el '+wd+' '+shortDate(ref.laborable)+', día tipo de la semana de referencia'+(supWd?'; sin los '+fmt(supWd)+' programados que no circulan por cortes de la vía':'')),
      kpi('Trenes en una semana',fmt(sem),'De lunes a domingo ('+shortDate(ref.semana)+' – '+shortDate(ref.domingo)+'). Al año, unos '+fmt(sem*52)),
      kpi('Estaciones servidas',fmt(st.size),'con al menos una parada de estas rutas'));
    $('#count').textContent=view.length===rows.length?fmt(view.length)+' rutas':fmt(view.length)+' de '+fmt(rows.length)+' rutas con estos filtros';
  }

  /* ── tabla ── */
  function renderHead(){
    const tr=$('#thead');tr.replaceChildren();
    for(const c of COLS){const th=el('th',[c.n?'n':'',c.cls||''].join(' ').trim()||null);th.scope='col';
      if(c.nosort){th.append(el('span',null,c.label));}
      else{const b=el('button',null,c.label);b.type='button';if(c.title)b.title=c.title;
        b.onclick=()=>{sort=sort.key===c.key?{key:c.key,dir:-sort.dir}:{key:c.key,dir:c.n?-1:1};apply();};th.append(b);
        if(sort.key===c.key)th.setAttribute('aria-sort',sort.dir<0?'descending':'ascending');}
      tr.append(th);}
  }
  function cell(r,c){
    const td=el('td',[c.n?'n':'',c.cls||''].join(' ').trim()||null);
    if(c.key==='ruta'){
      const w=el('div','rt-route'),b=el('button','rt-exp');b.type='button';b.setAttribute('aria-expanded',String(open.has(r.id)));
      b.setAttribute('aria-label',(open.has(r.id)?'Ocultar':'Ver')+' horarios de '+r._name);
      b.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="m6 3 5 5-5 5"/></svg>';
      b.onclick=()=>{open.has(r.id)?open.delete(r.id):open.add(r.id);renderTable();document.querySelector('[data-exp="'+CSS.escape(r.id)+'"]')?.focus();};
      b.dataset.exp=r.id;
      const n=el('div','rt-name');const t=el('b',null,r._title);n.append(t);if(r._sub)n.append(el('small',null,r._sub));
      const sup=r.sup?r.sup.reduce((a,x)=>a+x,0):0;
      if(sup)t.append(el('span','rt-tag rt-tag-corte',r.sem?'corte: '+fmt(sup)+' sin circular':'suspendida por corte'));
      else if(!r.sem){const z=el('span','rt-tag','sin trenes esta semana');t.append(z);}
      w.append(b,n);td.append(w);
    }else if(c.key==='marca'){const ch=el('span','rt-chip '+(FAM_CLS[r.fam]||''));ch.append(el('i'),r.marca);td.append(ch);
      if(r.fam==='Cercanías'&&r.nuc)td.append(el('small','rt-nuc',r.nuc));   // el núcleo va aquí, debajo de la línea
      if(r.fam!=='Cercanías'&&r.marca!==r.fam)td.title=r.fam;}
    else if(c.key==='op'){const k=opKey(r);
      if(k){const w=el('span','rt-op'),img=el('img','rt-logo rt-logo-'+k);img.src='img/operadores/'+k+'.svg';img.alt=OP_ALT[k];img.title=OP_ALT[k];img.decoding='async';w.append(img);td.append(w);}
      else td.textContent=r.op;
      if(r.src==='iryo')td.append(el('span','rt-tag','no oficial'));}
    else if(c.key==='pri')td.textContent=r.pri===null?'—':hm(r.pri)+' – '+hm(r.ult);
    else if(c.key==='dur')td.textContent=dur(r.dur);
    else if(c.key==='canc'||c.key==='ret'){const v=c.val(r);td.textContent=v===null?'—':pct1(v);if(v===null)td.classList.add('rt-zero');}
    else if(c.key==='cmp'){const l=el('label','rt-cmp'),i=el('input');i.type='checkbox';i.checked=cmp.has(r.id);i.disabled=!cmp.has(r.id)&&cmp.size>=3;
      i.setAttribute('aria-label','Comparar '+r._name);i.onchange=()=>{i.checked?cmp.add(r.id):cmp.delete(r.id);renderTable();renderCompare();};l.append(i);td.append(l);}
    else{const v=c.val(r);td.textContent=fmt(v);if(!v)td.classList.add('rt-zero');}
    return td;
  }
  function detail(r){
    const tr=el('tr','rt-detail'),td=el('td');td.colSpan=COLS.length;const g=el('div','rt-dgrid');
    const left=el('div');left.append(el('h3',null,'Salidas el '+longDate(R.referencia.laborable)));
    if(!r.sal.length)left.append(el('p','cb-note','Ningún tren ese miércoles.'+(r.sem?' Circula otros días de la semana.':'')));
    const byOrigin=new Map();for(const [m,o] of r.sal){if(!byOrigin.has(o))byOrigin.set(o,[]);byOrigin.get(o).push(m);}
    for(const [o,ms] of byOrigin){if(byOrigin.size>1||r.fam==='Cercanías')left.append(el('p','rt-from','Desde '+(ST[o]?.n||'—')+' · '+ms.length+(ms.length===1?' tren':' trenes')));
      const ul=el('ul','rt-times');for(const m of ms)ul.append(el('li',null,hm(m)));left.append(ul);}
    left.append(el('h3',null,'Trenes por día, semana de referencia'));
    const wk=el('div','rt-week');['L','M','X','J','V','S','D'].forEach((d,i)=>{const c=el('div');c.append(el('b',null,d),el('span',null,fmt(r.dias[i])));wk.append(c);});left.append(wk);
    const right=el('div'),dl=el('dl','rt-dl'),row=(k,v)=>{if(v===null||v===undefined||v==='')return;dl.append(el('dt',null,k));const dd=el('dd');v instanceof Node?dd.append(v):dd.textContent=v;dl.append(dd);};
    row('Servicio',r.fam+' · '+r.marca+(r.nuc?' · núcleo de '+r.nuc:''));
    row('Operador',r.op+' · empresa '+(r.emp.startsWith('Pública')?'pública':'privada'));
    if(r.linea)row('Nombre oficial de la línea',r.linea);
    // En Cercanías hay trenes que solo hacen un tramo de la línea: el mínimo es el trayecto más corto, no el tren más rápido.
    row('Duración',r.dur===null?null:dur(r.dur)+' (mediana de los trenes) · '+(r.fam==='Cercanías'?'trayecto más corto, ':'el más rápido, ')+dur(r.durMin));
    row('Paradas',r.par===null?null:fmt(r.par)+' (mediana, origen y destino incluidos)');
    if(r.via?.km){const v=r.via,parts=[fmt(v.km)+' km'];
      if(v.fuente==='ign'){parts.push(fmt(v.av)+' % de alta velocidad',fmt(v.el)+' % electrificado'+(v.elSin?' ('+fmt(v.elSin)+' % sin dato)':''));
        const an=Object.entries(v.anchos||{}).filter(([,p])=>p>=1).map(([k,p])=>(ANCHO[k]||k).toLowerCase()+' '+fmt(p)+' %').join(', ');if(an)parts.push('ancho: '+an);}
      else parts.push('ancho '+(ANCHO[v.ancho]||'').toLowerCase());
      row('Vía',parts.join(' · ')+(v.fuente==='gtfs'?'. Km sobre el dibujo de la línea del GTFS, entre las paradas extremas.':'. Trazado inferido sobre la red IGN.'));
      if(v.vel)row('Velocidad media',fmt(v.vel)+' km/h'+(v.velMax?' · el tren más rápido, '+fmt(v.velMax)+' km/h':'')+' (paradas incluidas)');}
    else if(r.via?.incompleto)row('Vía','Trazado inferido incompleto: sin km ni velocidad para no dar una cifra falsa.');
    if(r._cnmc){const c=r._cnmc;
      row('Corredor según la CNMC',c.corredor+' · '+r.op+': '+fmt2(c.viajeros)+' M de viajeros en los últimos 4 trimestres ('+CN.ultimos_4.join('–')+'), '+fmt(c.cuota)+' % del corredor; ocupación '+fmt(c.ocupacion)+' %'+(c.precio?'; precio medio de '+c.producto+' en 2025, '+eur(c.precio):'')+'.');
      row('Ojo','Cifras del operador en todo el corredor (incluye los trayectos intermedios), no de esta ruta. Datos derivados de CNMC Data, CC BY-SA 4.0.');}
    if(r.cortes){const sup=r.sup.reduce((a,x)=>a+x,0);
      for(const id of r.cortes){const c=CORTES.get(id);if(!c)continue;const p=el('span');
        p.append((sup?fmt(sup)+(sup===1?' tren programado no circula':' trenes programados no circulan')+' esta semana (L–D: '+r.sup.map(fmt).join(' · ')+'): ':'')+c.tramo+', desde el '+date(c.desde)+(c.hasta?' hasta el '+date(c.hasta)+' (previsto)':' (sin fecha de reapertura)')+'. '+(c.hasta_nota||'')+' ');
        const f=c.fuentes[0];if(f){const a=el('a','cb-link','Fuente: '+f.t.split(' · ')[0]);a.href=f.url;a.rel='noopener';p.append(a);}
        row('Corte de la vía',p);}}
    row('Horarios publicados',r.desde?date(r.desde)+' – '+date(r.hasta):'ninguno: todos sus trenes quedan dentro del corte');
    if(r.num.length)row('Números de tren',r.num.slice(0,24).join(', ')+(r.num.length>24?' y '+(r.num.length-24)+' más':''));
    row('Estaciones ('+r.est.length+')',el('span','rt-stops',r.est.map(i=>ST[i].n).join(' · ')));
    row('Fuente',R.fuentes[r.src]?.label);
    const a=el('a','cb-link','Ver en el visor');a.href=visorLink(r);row('Mapa',a);
    right.append(dl);g.append(left,right);td.append(g);
    const ih=el('h3',null,'Incidencias en tiempo real');const iw=el('div','rt-inc-wrap');iw.append(ih,incBlock(r));td.append(iw);tr.append(td);return tr;
  }
  function visorLink(r){
    if(r.fam==='Cercanías'){const [n,l]=r.id.split('|').slice(1);return visor({t:'transit',ls:['renfe-'+n+'-'+l.toLowerCase()]});}
    const o=ST[r.o],d=ST[r.d];return o&&d?visor({t:'services',r:'c:'+o.k+'>c:'+d.k}):visor({});
  }
  function renderTable(){
    renderHead();const tb=$('#tbody'),frag=document.createDocumentFragment();
    const max=Math.max(1,...view.map(r=>r.sem));
    for(const r of view.slice(0,shown)){const k=opKey(r),tr=el('tr','rt-row'+(k?' rt-op-'+k:''));for(const c of COLS){const td=cell(r,c);
        if(c.key==='sem'&&r.sem){const b=el('span','db');b.style.width=(100*r.sem/max)+'%';td.append(b);}tr.append(td);}
      frag.append(tr);if(open.has(r.id))frag.append(detail(r));}
    if(!view.length){const tr=el('tr'),td=el('td');td.colSpan=COLS.length;td.append(el('p','cb-empty','Ninguna ruta cumple estos filtros. Prueba a quitar alguno o a buscar otra estación.'));tr.append(td);frag.append(tr);}
    tb.replaceChildren(frag);
    const more=$('#more');more.hidden=view.length<=shown;more.textContent='Mostrar '+fmt(Math.min(PAGE,view.length-shown))+' rutas más';
  }

  /* ── comparar (hasta 3) ── */
  function renderCompare(){
    const box=$('#compare'),body=$('#compare-body'),list=rows.filter(r=>cmp.has(r.id));
    box.hidden=!list.length;if(!list.length)return;
    $('#compare-t').textContent='Comparar rutas ('+list.length+' de 3)';
    const t=el('table'),head=el('tr');head.append(el('th',null,'Indicador'));for(const r of list){const th=el('th',null,r._name);th.scope='col';head.append(th);}
    const thead=el('thead');thead.append(head);t.append(thead);const tb=el('tbody');
    const lines=[['Servicio',r=>r.fam+' · '+r.marca],['Operador',r=>r.op],['Laborable',r=>fmt(r.lab)],['Sábado',r=>fmt(r.sab)],['Domingo',r=>fmt(r.dom)],['Semana',r=>fmt(r.sem)],
      ['Mes (estimado)',r=>fmt(r.mes)],['Año (estimado)',r=>fmt(r.anio)],['Primero – último',r=>r.pri===null?'—':hm(r.pri)+' – '+hm(r.ult)],['Duración (mediana)',r=>dur(r.dur)],
      ['Más rápido o más corto',r=>dur(r.durMin)],['Paradas (mediana)',r=>fmt(r.par)],['Km del trazado',r=>fmt(r.via?.km)],['Velocidad media',r=>r.via?.vel?fmt(r.via.vel)+' km/h':'—'],['Tipo de vía',viaTipo],['Cancelados, 30 días (tiempo real)',r=>pct1(incPct(r,'canc'))],['Retraso ≥ 15 min, 30 días (tiempo real)',r=>pct1(incPct(r,'ret15'))],['Ocupación en el corredor (CNMC)',r=>r._cnmc?fmt(r._cnmc.ocupacion)+' %':'—'],['Precio medio 2025 (CNMC)',r=>r._cnmc?.precio?eur(r._cnmc.precio):'—'],['Estaciones servidas',r=>fmt(r.est.length)]];
    for(const [k,f] of lines){const tr=el('tr'),th=el('th',null,k);th.scope='row';tr.append(th);for(const r of list)tr.append(el('td',null,f(r)));tb.append(tr);}
    t.append(tb);const w=el('div','tbl-wrap');w.append(t);body.replaceChildren(w);
  }
  $('#compare-toggle').onclick=e=>{const b=e.currentTarget,o=b.getAttribute('aria-expanded')!=='true';b.setAttribute('aria-expanded',String(o));b.textContent=o?'Ocultar comparación':'Ver comparación';$('#compare-body').hidden=!o;};
  $('#compare-clear').onclick=()=>{cmp.clear();renderTable();renderCompare();};

  /* ── CSV de la selección (UTF-8 con BOM y «;», para Excel en español) ── */
  $('#csv').onclick=()=>{
    const esc=v=>{const s=String(v??'');return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
    const head=['Origen','Destino','Línea','Núcleo','Servicio','Marca','Operador','Tipo de empresa','Trenes laborable','Trenes sábado','Trenes domingo','Trenes semana','Trenes mes (estimado)','Trenes año (estimado)','Primera salida','Última salida','Duración mediana (min)','Duración mínima (min)','Paradas (mediana)','Estaciones','Horarios desde','Horarios hasta','Km','Velocidad media (km/h)','Tipo de vía','Ancho','Electrificación','Corredor CNMC','Cuota del operador en el corredor (%)','Ocupación del operador en el corredor (%)','Precio medio 2025 del producto (€)','Trenes suprimidos por corte (semana)','Corte de la vía','Programados 30 días (tiempo real)','Con dato 30 días','Cancelados 30 días','Retraso ≥ 15 min 30 días','Fuente'];
    const lines=[head.join(';')];
    for(const r of view)lines.push([r.o!==null?ST[r.o].n:'',r.d!==null?ST[r.d].n:'',r.fam==='Cercanías'?r.marca:'',r.nuc||'',r.fam,r.marca,r.op,r.emp,r.lab,r.sab,r.dom,r.sem,r.mes,r.anio,
      r.pri===null?'':hm(r.pri),r.ult===null?'':hm(r.ult),r.dur??'',r.durMin??'',r.par??'',r.est.length,r.desde,r.hasta,r.via?.km??'',r.via?.vel??'',viaTipo(r),viaAncho(r),viaElec(r),r._cnmc?.corredor??'',r._cnmc?.cuota??'',r._cnmc?.ocupacion??'',r._cnmc?.precio??'',r.sup?r.sup.reduce((a,x)=>a+x,0):'',(r.cortes||[]).map(id=>CORTES.get(id)?.tramo).join(' | '),...(a=>a?[a.v[0],a.v[1]+a.v[2],a.v[2],a.v[5]]:['','','',''])(incOf(r)),R.fuentes[r.src]?.label].map(esc).join(';'));
    lines.push('');if(CN)lines.push(esc('Columnas CNMC: datos derivados de CNMC Data (catalogodatos.cnmc.es), licencia CC BY-SA 4.0; se comparten con la misma licencia.'));lines.push(esc('Semana de referencia '+R.referencia.semana+' (laborable '+R.referencia.laborable+'). Mes y año: estimaciones con semana tipo (× 4,35 y × 52). Fuentes y licencias en la página.'));
    const blob=new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download='rutas-ferroviarias-'+R.referencia.semana+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  $('#more').onclick=()=>{shown+=PAGE;renderTable();};

  /* ── notas ── */
  function renderNotes(){
    const m=$('#c-metodo');m.replaceChildren(el('h3',null,'Qué es una ruta y qué se cuenta'));
    const ul=el('ul','plain');
    for(const t of ['Una ruta es una relación origen → destino de una marca (AVE, Avlo, Intercity, Regional, iryo, OUIGO…), en cada sentido. En Cercanías, una línea de un núcleo con sus dos sentidos; sus extremos son el recorrido más frecuente del día, no el nombre oficial.',
      'Un tren cuenta una vez por día en su ruta, desde su origen hasta su destino. Los que solo hacen parte del recorrido de una línea de Cercanías también cuentan.',
      'Laborable, sábado y domingo son los días de la semana de referencia ('+date(R.referencia.semana)+' a '+date(R.referencia.domingo)+'): la primera semana completa que cubren todas las fuentes.',
      'Mes y año (*) son estimaciones con esa semana tipo: semana × 4,35 y × 52. No recogen festivos, verano ni cambios de horario.',
      'Duración: mediana de los trenes del día. Paradas: mediana del número de paradas, origen y destino incluidos.',
      'Provincia según el catálogo de estaciones de Renfe o, si la estación no está en él, la del municipio del INE donde está; comunidad, la de su provincia.'])ul.append(el('li',null,t));
    m.append(ul);for(const n of R.notas)m.append(el('p','cb-note',n));
    m.append(el('p','cb-note','Horarios programados, no circulaciones reales: no incluyen retrasos ni cancelaciones del día.'));
    if(R.cortes?.length){m.append(el('h3',null,'Cortes de la vía'));
      m.append(el('p',null,'Los horarios publicados no siempre recogen los cortes: el GTFS de Renfe sigue programando trenes por tramos cerrados y mete como trenes algunos autobuses del plan alternativo. Esos trenes se quitan de los recuentos en las fechas del corte y se indican en cada ruta. Solo se aplica un corte con fuente oficial o de prensa y confirmado en el tiempo real de Renfe (ningún tren de esas rutas visto del 14 al 20 de noviembre de 2026).'));
      const cu=el('ul','plain');for(const c of R.cortes){const li=el('li');li.append(el('b',null,c.tramo),'. '+date(c.desde)+' – '+(c.hasta?date(c.hasta)+' (previsto)':'sin fecha')+'. '+c.efecto+' '+fmt(c.lab)+' trenes menos el laborable de referencia. ');
        c.fuentes.forEach((f,i)=>{const a=el('a',null,f.t.split(' · ')[0]+' ('+date(f.fecha)+')');a.href=f.url;a.rel='noopener';if(i)li.append(', ');li.append(a);});cu.append(li);}
      m.append(cu);}
    const f=$('#c-fuentes');f.replaceChildren(el('h3',null,'Fuentes y licencias'));const dl=el('dl','src');
    for(const [k,s] of Object.entries(R.fuentes)){dl.append(el('dt',null,s.label));
      const dd=el('dd',null,s.licence+'. '+(s.from?'Horarios del '+date(s.from)+' al '+date(s.to)+'. ':'')+(s.excluidos||''));
      if(s.url){const a=el('a',null,' Descarga');a.href=s.url;a.rel='noopener';dd.append(a);}dl.append(dd);}
    if(INC){dl.append(el('dt',null,INC.fuente.label));dl.append(el('dd',null,INC.fuente.licence+'. Archivo propio cada 5 minutos'+(INC.primero?', del '+date(INC.primero)+' al '+date(INC.ultimo):'; aún sin días cerrados')+'. Un día cuenta si tiene '+INC.definiciones.dia_valido+'. Sin tiempo real: iryo y OUIGO.'));}
    if(CN){dl.append(el('dt',null,'CNMC Data · viajeros, plazas, ocupación y precio por corredor'));const dd=el('dd',null,CN.licencia+' Último trimestre: '+CN.ultimo_trimestre+'. '+CN.notas.join(' '));dl.append(dd);}
    f.append(dl,el('p','cb-note','Sin datos todavía: FGC, Euskotren y FGV (necesitan acceso al Punto de Acceso Nacional), viajeros por ruta (la CNMC solo los da por corredor) y puntualidad oficial (Renfe no la publica en datos abiertos).'));
  }

  /* ── CNMC: cada ruta de alta velocidad comercial con Madrid en un extremo, a su corredor (capas/cnmc.json) ── */
  let CN=null;
  /* ── incidencias (capas/incidencias-rt.json, tools/rutas/incidencias.mjs): vector [prog, vistos, canc, contra, ret5, ret15, sup] ── */
  let INC=null;
  const INC_MIN=10,incOf=(r,k='d30')=>INC?.rutas?.[r.id]?.[k]||null;
  function incPct(r,what,k='d30'){const a=incOf(r,k);if(!a)return null;const [,vis,canc,,ret5,ret15]=a.v;
    if(what==='canc')return vis+canc>=INC_MIN?100*canc/(vis+canc):null;
    return vis>=INC_MIN?100*(what==='ret5'?ret5:ret15)/vis:null;}
  const pct1=x=>x===null||x===undefined?'—':new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}).format(x)+' %';
  function incBlock(r){
    const box=el('div','rt-inc');
    if(r.src==='iryo'||r.src==='ouigo'){box.append(el('p','cb-note',(r.src==='iryo'?'iryo':'OUIGO')+' no publica tiempo real: no hay datos de cancelaciones ni retrasos.'));return box;}
    if(!INC?.ultimo){box.append(el('p','cb-note','El tiempo real de Renfe se archiva cada 5 minutos; aún no hay ningún día cerrado. Los datos aparecen aquí al día siguiente del primer día completo.'));return box;}
    const t=el('table','rt-inc-t'),hd=el('tr');for(const h of ['Periodo','Programados','Con dato','Cancelados','Retraso ≥ 15 min','Sin dato']){const th=el('th',null,h);th.scope='col';hd.append(th);}
    const th_=el('thead');th_.append(hd);t.append(th_);const tb=el('tbody');
    for(const [k,lab] of [['d1','Último día ('+date(INC.ultimo)+')'],['d7','7 días'],['d30','30 días'],['d365','365 días']]){
      const a=incOf(r,k),tr=el('tr'),th=el('th',null,lab);th.scope='row';tr.append(th);
      if(!a){tr.append(el('td',null,'—'),el('td',null,'—'),el('td',null,'—'),el('td',null,'—'),el('td',null,'—'));tb.append(tr);continue;}
      const [prog,vis,canc,,,ret15]=a.v,dato=vis+canc,dias=INC.cobertura?.[r.src==='cercanias'?'cer':'ld']?.[k];
      th.append(el('small',null,' · '+fmt(a.dias)+(a.dias===1?' día válido':' días válidos')+(dias&&dias.dias>dias.validos?' de '+fmt(dias.dias):'')));
      tr.append(el('td','n',fmt(prog)),el('td','n',fmt(dato)+(prog?' ('+pct1(100*dato/prog)+')':'')),
        el('td','n',fmt(canc)+(dato>=INC_MIN?' ('+pct1(100*canc/dato)+')':'')),el('td','n',fmt(ret15)+(vis>=INC_MIN?' ('+pct1(100*ret15/vis)+')':'')),el('td','n',fmt(prog-dato)));tb.append(tr);}
    t.append(tb);const w=el('div','tbl-wrap');w.append(t);box.append(w);
    box.append(el('p','cb-note','Tiempo real de Renfe (GTFS-RT, CC BY 4.0). «Sin dato»: trenes programados que el feed nunca informa; no son cancelaciones (el feed solo cubre una parte de los trenes). Los porcentajes de cancelados y de retraso se calculan sobre los trenes con dato, y solo con 10 o más. Retraso: el último que informa el feed mientras se ve el tren. No incluye los trenes de los cortes de la vía, que se cuentan aparte.'));
    return box;
  }
  const fmt2=n=>n===null||n===undefined?'—':new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(n);
  const eur=n=>new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(n);
  const PRODUCTO={'AVE':'Renfe-AVE','AVE Euromed':'Renfe-AVE','Avlo':'Renfe-AVLO','iryo':'Iryo','OUIGO':'OUIGO'};
  // Orden: Málaga/Granada antes que Sevilla (Córdoba está en los dos; manda el otro extremo de la ruta).
  const COR_ORDER=['Madrid-Málaga/Granada','Madrid-Alicante','Madrid-Valencia','Madrid-Barcelona','Madrid-Sevilla'];
  function cnmcOf(r){
    if(!CN||r.fam!=='Alta velocidad'||r.o===null||r.d===null)return null;
    const o=ST[r.o].n,d=ST[r.d].n,mad=/^Madrid/.test(o)?d:/^Madrid/.test(d)?o:null;if(!mad||/^Madrid/.test(mad))return null;
    const cor=COR_ORDER.find(k=>CN.corredor_regex[k]&&new RegExp(CN.corredor_regex[k],'i').test(mad));if(!cor)return null;
    const c=CN.corredores.find(x=>x.corredor===cor),opd=c?.ult4.operadores[r.op];if(!opd)return null;
    const prod=PRODUCTO[r.marca],tr=CN.trayecto_de[cor],pr=CN.precio_2025.find(x=>x.trayecto===tr);
    return {corredor:cor,viajeros:opd.viajeros,cuota:opd.cuota,ocupacion:opd.ocupacion,producto:prod?.replace('Renfe-',''),precio:prod&&pr?pr[prod]:null};
  }

  /* ── arranque ── */
  async function start(){
    try{const r=await fetch('capas/rutas.json',{cache:'no-cache'});if(!r.ok)throw new Error(r.status);R=await r.json();}
    catch{$('#ref').textContent='No se han podido cargar las rutas.';$('#tbody').replaceChildren();const p=el('p','cb-empty','No se han podido cargar los datos de las rutas. Recarga la página.');$('#tabla').append(p);return;}
    ST=R.estaciones;CORTES=new Map((R.cortes||[]).map(c=>[c.id,c]));
    try{const c=await fetch('capas/cnmc.json',{cache:'no-cache'});if(c.ok)CN=await c.json();}catch{CN=null;}
    try{const c=await fetch('capas/incidencias-rt.json',{cache:'no-cache'});if(c.ok)INC=await c.json();}catch{INC=null;}
    // En Cercanías la línea (C1, R2…) ya está en la columna Servicio: el título solo lleva los extremos, para que quepa en una línea.
    rows=R.rutas.map(r=>{const o=ST[r.o]?.n,d=ST[r.d]?.n;const title=r.fam==='Cercanías'?(o&&d?o+' – '+d:r.linea):o+' → '+d;
      return {...r,_title:title,_name:r.fam==='Cercanías'?r.marca+' '+r.nuc:o+' → '+d+' ('+r.marca+')',_sub:r.fam==='Cercanías'?r.marca+' · Cercanías '+r.nuc:r.marca+' · '+r.op,
        _search:norm([title,r.marca,r.nuc,r.linea,r.op,...r.num,...r.est.map(i=>ST[i].n)].join(' ')),_cnmc:cnmcOf(r)};});
    fillSelect(F.cor,CN?CN.corredores.map(c=>c.corredor):[]);
    $('#ref').replaceChildren('Semana de referencia: ',el('strong',null,date(R.referencia.semana)+' – '+date(R.referencia.domingo)),'. Laborable: '+longDate(R.referencia.laborable)+'. Datos generados el '+date(R.generado)+'.');
    fillSelect(F.op,uniq(rows.map(r=>r.op)));fillSelect(F.emp,uniq(rows.map(r=>r.emp)));
    fillSelect(F.fam,FAM_ORDER.filter(f=>rows.some(r=>r.fam===f)));fillSelect(F.nuc,uniq(rows.map(r=>r.nuc)));
    fillSelect(F.via,['Alta velocidad','Mixta','Convencional','Sin dato (Cercanías)','Sin trazado'].filter(v=>rows.some(r=>viaTipo(r)===v)));
    fillSelect(F.ancho,['Ibérico','Estándar','Métrico','Mixto','Varios anchos','Sin determinar','Sin trazado'].filter(v=>rows.some(r=>viaAncho(r)===v)));
    fillSelect(F.elec,['Electrificada','Parcialmente','Sin electrificar','Sin dato','Sin trazado'].filter(v=>rows.some(r=>viaElec(r)===v)));fillSelect(F.ca,uniq(ST.map(s=>s.ca)));
    // Estado desde el hash (enlace compartido).
    const h=readHash();
    for(const k of ['op','emp','fam','nuc','ca','via','ancho','elec','cor'])if(h[k])F[k].value=h[k];
    dependentOptions();if(h.marca)F.marca.value=h.marca;if(h.pr)F.pr.value=h.pr;
    if(h.q)F.q.value=h.q;if(h.min)F.min.value=h.min;if(h.activas==='0')F.activas.checked=false;
    if(h.s){const m=/^(\w+)([+-])$/.exec(h.s);if(m&&COLS.some(c=>c.key===m[1]&&!c.nosort))sort={key:m[1],dir:m[2]==='-'?-1:1};}
    let t;F.q.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(apply,150);});
    for(const k of ['op','emp','marca','nuc','pr','via','ancho','elec','cor','min','activas'])F[k].addEventListener('change',apply);
    F.fam.addEventListener('change',()=>{dependentOptions();apply();});F.ca.addEventListener('change',()=>{dependentOptions();apply();});
    $('#filters').addEventListener('submit',e=>e.preventDefault());
    $('#filters').addEventListener('reset',()=>setTimeout(()=>{F.activas.checked=true;sort={key:'sem',dir:-1};dependentOptions();apply();}));
    renderNotes();apply();
  }
  start();
})();
