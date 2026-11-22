/* Análisis de la oferta (cabina-analisis.html): pinta capas/analisis.json y, al llegar al mapa, capas/analisis-mapa.json
   (tools/build-cabina-analisis.mjs). No calcula horarios: todo llega precalculado; los simuladores solo reclasifican.
   Reglas (manual de Data Storytelling y Cabina): titular = conclusión sacada de los datos; énfasis solo en lo que nombra;
   cada gráfico con su tabla («Ver los datos»); sin estilos en línea (CSP): anchos con CSSOM y SVG con atributos. */
(function(){
  'use strict';
  const nf=new Intl.NumberFormat('es-ES'),pf=new Intl.NumberFormat('es-ES',{maximumFractionDigits:1}),p0=new Intl.NumberFormat('es-ES',{maximumFractionDigits:0});
  const fmt=n=>n===null||n===undefined||!Number.isFinite(n)?'—':nf.format(Math.round(n)),f1=n=>n===null||n===undefined?'—':pf.format(n);
  const $=s=>document.querySelector(s),SVGNS='http://www.w3.org/2000/svg';
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined&&text!==null)e.textContent=text;return e;}
  function svg(name,attrs={},text){const e=document.createElementNS(SVGNS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e;}
  const pad=n=>String(n).padStart(2,'0'),hm=m=>m===null||m===undefined?'—':pad(Math.floor(m/60)%24)+':'+pad(Math.round(m)%60);
  const dur=m=>{if(m===null||m===undefined)return '—';m=Math.round(m);const h=Math.floor(m/60),r=m%60;return h?h+' h'+(r?' '+pad(r):''):r+' min';};
  const mill=n=>n>=1e5?pf.format(Math.round(n/1e5)/10)+' M':fmt(n);
  const longDate=iso=>new Date(iso+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const plural=(n,a,b)=>fmt(n)+' '+(Math.round(n)===1?a:b);
  const TIPO={'Alta velocidad':'av','Mixta':'mx','Convencional':'cv'};

  const visorHash=location.hash&&location.hash.length>1?location.hash:'';
  for(const a of [$('#back'),$('#back-foot')])a.href='index.html'+visorHash;

  /* ── piezas (las mismas de la Cabina) ── */
  function card(id,title,sub){const c=document.getElementById(id);c.replaceChildren(el('h3',null,title));if(sub)c.append(el('p','sub',sub));return c;}
  const note=t=>el('p','cb-note',t);
  function hbars(items,{format=fmt,classes=[],max}={}){
    const M=max||Math.max(1,...items.map(i=>i.values.reduce((a,b)=>a+b,0))),ul=el('ul','hb');
    for(const it of items){
      const li=el('li',it.hi?'hi':it.cls||null),lab=el('span','lab',it.label);lab.title=it.label;
      const track=el('span','track');track.setAttribute('aria-hidden','true');
      it.values.forEach((v,i)=>{if(!v)return;const s=el('span','seg s'+i+(classes[i]?' '+classes[i]:'')+(it.segCls?' '+it.segCls:''));s.style.width=(100*v/M)+'%';track.append(s);});
      const val=el('span','val',format(it.shown??it.values.reduce((a,b)=>a+b,0)));if(it.extra)val.append(el('small',null,it.extra));
      li.append(lab,track,val);ul.append(li);
    }
    return ul;
  }
  function legend(entries){const ul=el('ul','legend');for(const [cls,text] of entries){const li=el('li');li.append(el('i',cls),text);ul.append(li);}return ul;}
  function table(cols,rows,{caption}={}){
    const wrap=el('div','tbl-wrap'),t=el('table');if(caption)t.append(el('caption',null,caption));
    const cls=c=>[c.n?'n':'',c.opt?'opt':''].join(' ').trim()||null;
    const tr=el('tr');for(const c of cols){const th=el('th',cls(c),c.label);th.scope='col';tr.append(th);}
    const thead=el('thead');thead.append(tr);t.append(thead);const tb=el('tbody');
    for(const r of rows){const row=el('tr');for(const c of cols){const td=el('td',cls(c)),v=c.get?c.get(r):r[c.key];td.textContent=v===null||v===undefined?'—':(c.n&&typeof v==='number'?fmt(v):v);row.append(td);}tb.append(row);}
    t.append(tb);wrap.append(t);return wrap;
  }
  function dataTable(cols,rows,caption){const d=el('details','cb-data');const box=el('div',rows.length>15?'an-scroll':null);box.append(table(cols,rows,{caption}));d.append(el('summary',null,'Ver los datos'),box);return d;}
  function responsive(container,draw,label){
    const host=el('div');host.setAttribute('role','img');host.setAttribute('aria-label',label);container.append(host);
    let w=0;const paint=(force)=>{const nw=Math.max(280,Math.floor(host.clientWidth||container.clientWidth||600));if(nw===w&&!force)return;w=nw;host.replaceChildren(draw(w));};
    new ResizeObserver(()=>paint()).observe(host);paint();
    return {repaint:()=>paint(true),setLabel:t=>host.setAttribute('aria-label',t)};
  }
  const niceMax=v=>{const p=10**Math.floor(Math.log10(v||1)),s=v/p;return (s<=1?1:s<=2?2:s<=2.5?2.5:s<=5?5:10)*p;};
  const ticks=(max,n=5)=>{const st=niceMax(max/n);const out=[];for(let v=0;v<=max+1e-9;v+=st)out.push(Math.round(v*1000)/1000);return out;};
  function range(id,{label,min,max,step,value,unit,scale}){
    const box=el('div','an-ctrl'),lab=el('label'),out=el('output');lab.htmlFor=id;out.htmlFor=id;out.id=id+'-o';
    lab.append(el('span',null,label),out);const inp=el('input');Object.assign(inp,{type:'range',id,min,max,step,value});
    inp.setAttribute('aria-describedby',id+'-o');const sc=el('div','an-scale');sc.append(el('span',null,scale[0]),el('span',null,scale[1]));
    const show=()=>{out.textContent=nf.format(+inp.value)+' '+unit;inp.setAttribute('aria-valuetext',out.textContent);};show();inp.addEventListener('input',show);
    box.append(lab,inp,sc);return {box,inp};
  }
  function setH2(id,text){const h=document.getElementById(id);if(h&&text)h.textContent=text;}

  /* ══ 1 · Simulador de capitales ══ */
  function s1(D){
    const C=D.capitales,DEF={n:10,v:120};
    const panel=$('#s1-panel');panel.replaceChildren(el('h3',null,'Simula el listón de servicio con Madrid'),
      el('p',null,'Elige cuántos trenes directos al día y a qué velocidad pides. Cada capital cae en uno de cuatro grupos según cumpla las dos condiciones, una o ninguna.'));
    const r1=range('s1-n',{label:'Trenes directos al día (mínimo)',min:1,max:50,step:1,value:DEF.n,unit:'trenes',scale:['1','50']});
    const r2=range('s1-v',{label:'Velocidad en línea recta (mínimo)',min:50,max:200,step:5,value:DEF.v,unit:'km/h',scale:['50 km/h','200 km/h']});
    const res=el('p','an-result');res.setAttribute('aria-live','polite');
    const reset=el('button','an-reset','Volver al listón inicial');reset.type='button';
    panel.append(r1.box,r2.box,res,reset,el('p','an-how','Trenes directos: los que salen de Madrid el miércoles y paran en la capital, sea o no su destino final. Velocidad en línea recta: distancia en recta entre las dos estaciones ÷ tiempo del tren directo más rápido; incluye el rodeo de la vía, así que es lo que avanza de verdad el viajero hacia su destino (y siempre es menor que la velocidad comercial).'));
    const G=[['g0','Frecuentes y rápidas'],['g1','Frecuentes, pero lentas'],['g2','Rápidas, pero con pocos trenes'],['g3','Ni frecuentes ni rápidas']];
    const c=card('s1-chart','Capitales de provincia según el listón','Número de capitales en cada grupo y su población (INE). Madrid no cuenta: es el origen.');
    const totals=el('div','an-totals'),bars=el('div'),groups=el('div','an-groups'),extra=el('div');c.append(totals,bars,groups,extra);
    const sinDirecto=C.filter(x=>!x.trenes||x.kmh_recta===null);
    extra.append(note(sinDirecto.length?('Sin tren directo desde Madrid un laborable: '+sinDirecto.map(x=>x.n).join(', ')+'. No entra en ningún grupo.'):''),
      dataTable([{label:'Capital',key:'n'},{label:'Trenes desde Madrid',key:'trenes',n:true},{label:'Más rápido',get:r=>dur(r.min)},{label:'En recta (km)',key:'recta',n:true,opt:true},{label:'Velocidad en recta (km/h)',key:'kmh_recta',n:true},{label:'Comercial (km/h)',key:'kmh',n:true,opt:true},{label:'Población',key:'pob',n:true,opt:true}],C,'Trenes directos del miércoles y tren más rápido entre Madrid y cada capital'));
    const draw=()=>{
      const n=+r1.inp.value,v=+r2.inp.value,with_=C.filter(x=>x.trenes&&x.kmh_recta!==null);
      const g=x=>(x.trenes>=n?0:2)+(x.kmh_recta>=v?0:1);   // 0 las dos · 1 solo frecuencia · 2 solo velocidad · 3 ninguna
      const by=G.map((_,i)=>with_.filter(x=>g(x)===i).sort((a,b)=>b.pob-a.pob));
      totals.replaceChildren(...G.map(([cls,t],i)=>{const b=el('div','an-total'+(i===0?' hi':''));b.append(el('span',null,t),el('strong',null,fmt(by[i].length)),el('span',null,mill(by[i].reduce((a,x)=>a+x.pob,0))+' hab.'));return b;}));
      bars.replaceChildren(legend(G.map(([cls,t])=>['c-'+cls,t])),hbars(G.map(([cls,t],i)=>({label:t,values:[by[i].length],segCls:'c-'+cls,extra:mill(by[i].reduce((a,x)=>a+x.pob,0))+' hab.'})),{max:with_.length}));
      groups.replaceChildren(...G.flatMap(([,t],i)=>{const h=el('h4',null,t+' ('+by[i].length+')'),p=el('p',null,by[i].length?by[i].map(x=>x.n+' ('+x.trenes+' · '+x.kmh_recta+')').join(', '):'Ninguna');const d=el('div');d.append(h,p);return [d];}));
      const pob0=by[0].reduce((a,x)=>a+x.pob,0),pobAll=with_.reduce((a,x)=>a+x.pob,0);
      res.replaceChildren('Con al menos ',el('strong',null,plural(n,'tren','trenes')),' al día y ',el('strong',null,v+' km/h'),' en línea recta, cumplen ',el('strong',null,by[0].length+' de '+with_.length),' capitales con tren directo ('+p0.format(100*pob0/pobAll)+' % de su población).');
    };
    for(const r of [r1,r2])r.inp.addEventListener('input',draw);
    reset.onclick=()=>{r1.inp.value=DEF.n;r2.inp.value=DEF.v;for(const r of [r1,r2])r.inp.dispatchEvent(new Event('input'));};
    draw();
    const ok=C.filter(x=>x.trenes>=DEF.n&&x.kmh_recta>=DEF.v).length,tot=C.filter(x=>x.trenes&&x.kmh_recta!==null).length;
    setH2('capitales-t',`Con 10 trenes directos al día y 120 km/h en línea recta como listón, ${ok} de las ${tot} capitales con tren directo tienen buen servicio con Madrid`);
    groups.before(note('Entre paréntesis: trenes directos al día y velocidad en línea recta (km/h).'));
  }

  /* ══ 2 · Simulador de velocidad objetivo ══ */
  function s2(D){
    const V=D.velocidad,R=V.rutas,DEF=120;
    const panel=$('#s2-panel');panel.replaceChildren(el('h3',null,'Simula una velocidad objetivo'),
      el('p',null,'Sube el listón y mira qué rutas lo alcanzan hoy y cuáles no, según el tipo de vía por el que circulan. La línea discontinua del gráfico marca el tiempo que tendría una ruta a esa velocidad.'));
    const r=range('s2-v',{label:'Velocidad comercial objetivo',min:40,max:250,step:5,value:DEF,unit:'km/h',scale:['40 km/h','250 km/h']});
    const res=el('p','an-result');res.setAttribute('aria-live','polite');
    panel.append(r.box,res,el('p','an-how','Velocidad comercial = km del trazado IGN ÷ duración mediana del miércoles (paradas incluidas). Tipo de vía: alta velocidad si al menos el 80 % de los km lo son, mixta entre el 20 y el 80 % y convencional por debajo. Una fila por relación y marca, en un solo sentido; quedan fuera '+plural(V.sin_trazado,'relación','relaciones')+' sin trazado completo.'));
    const c=card('s2-chart','Duración frente a distancia de cada ruta','Cada punto es una relación (origen → destino y marca). Por debajo de la línea, rutas que ya van más rápido que el objetivo; las que no llegan salen atenuadas.');
    c.append(legend([['c-av','Alta velocidad'],['c-mx','Mixta'],['c-cv','Convencional'],['lg-goal','Tiempo a la velocidad objetivo']]));
    const xmax=Math.ceil(Math.max(...R.map(x=>x.km))/250)*250,ymax=Math.ceil(Math.max(...R.map(x=>x.min))/120)*120;
    let goal=DEF;
    const chart=responsive(c,w=>{
      const H=Math.min(360,Math.max(240,w*.5)),L=44,Rm=12,T=10,B=34,X=v=>L+(w-L-Rm)*v/xmax,Y=v=>H-B-(H-T-B)*v/ymax;
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      for(let t=0;t<=ymax;t+=ymax>720?240:120){s.append(svg('line',{x1:L,x2:w-Rm,y1:Y(t),y2:Y(t),class:t?'grid':'axis'}),svg('text',{x:L-6,y:Y(t)+4,'text-anchor':'end'},t?(t/60)+' h':'0'));}
      for(let t=0;t<=xmax;t+=w<480?500:250)s.append(svg('text',{x:X(t),y:H-B+16,'text-anchor':'middle'},fmt(t)));
      s.append(svg('text',{x:w-Rm,y:H-4,'text-anchor':'end'},'km por la vía'));
      // zona «más rápido que el objetivo» bajo la línea
      const yEnd=Math.min(ymax,xmax/goal*60),xEnd=yEnd*goal/60;
      s.append(svg('path',{d:`M${X(0)},${Y(0)} L${X(xEnd)},${Y(yEnd)} L${X(xmax)},${Y(Math.min(ymax,xmax/goal*60))} L${X(xmax)},${Y(0)} Z`,class:'goal-zone'}));
      s.append(svg('line',{x1:X(0),y1:Y(0),x2:X(xEnd),y2:Y(yEnd),class:'goal'}));
      for(const p of R){const ok=p.kmh>=goal,ci=svg('circle',{cx:X(p.km).toFixed(1),cy:Y(p.min).toFixed(1),r:w<480?3:4,class:'pt-'+TIPO[p.tipo]+(ok?'':' out')});ci.append(svg('title',{},`${p.n} (${p.marca}) · ${fmt(p.km)} km en ${dur(p.min)} · ${p.kmh} km/h · ${p.tipo}`));s.append(ci);}
      return s;
    },'Dispersión de la duración frente a los km de cada ruta, por tipo de vía');
    const types=el('div','an-types');c.append(types);
    c.append(dataTable([{label:'Relación',key:'n'},{label:'Marca',key:'marca',opt:true},{label:'Tipo de vía',key:'tipo'},{label:'km',key:'km',n:true},{label:'Duración',get:x=>dur(x.min),opt:true},{label:'km/h',key:'kmh',n:true},{label:'Trenes al día',key:'trenes',n:true,opt:true}],R,'Velocidad comercial de cada relación (un sentido)'));
    const draw=()=>{
      goal=+r.inp.value;chart.repaint();
      const parts=[];
      types.replaceChildren(...V.tipos.map(t=>{
        const rows=R.filter(x=>x.tipo===t.tipo),ok=rows.filter(x=>x.kmh>=goal),k=TIPO[t.tipo],share=rows.length?100*ok.length/rows.length:0;
        const miss=rows.filter(x=>x.kmh<goal).map(x=>x.min-x.km/goal*60).sort((a,b)=>a-b),medMiss=miss.length?miss[Math.floor(miss.length/2)]:0;
        const box=el('div','an-type'),nm=el('span','nm');const dot=el('i','c-'+k);nm.append(dot,t.tipo);
        const tr=el('span','track'),fill=el('span','c-'+k);fill.style.width=share+'%';tr.append(fill);tr.setAttribute('aria-hidden','true');
        const v=el('span','v',p0.format(share)+' % · '+ok.length+' de '+rows.length);
        const noteTxt=t.max<goal?`Ninguna llega hoy: la más rápida de este tipo va a ${t.max} km/h (mediana ${t.mediana}).`:
          miss.length?`Mediana actual ${t.mediana} km/h. A las ${miss.length} que no llegan les sobran de media ${dur(medMiss)} por viaje.`:`Todas llegan. Mediana actual ${t.mediana} km/h.`;
        box.append(nm,tr,v,el('span','note',noteTxt));
        parts.push(`${t.tipo.toLowerCase()} ${p0.format(share)} %`);
        return box;}));
      res.replaceChildren('A ',el('strong',null,goal+' km/h'),' llegan hoy: '+parts.join(' · ')+' de las rutas de cada tipo de vía.');
    };
    r.inp.addEventListener('input',draw);draw();
    const T=Object.fromEntries(V.tipos.map(t=>[t.tipo,t]));
    setH2('velocidad-t',`La vía decide la velocidad: una ruta típica va a ${T['Alta velocidad'].mediana} km/h en alta velocidad, a ${T['Mixta'].mediana} en vía mixta y a ${T['Convencional'].mediana} en convencional, que no pasa de ${T['Convencional'].max}`);
  }

  /* ══ 3 · Rodeos ══ */
  function rodeo(D){
    const Rd=D.rodeo,c=card('c-rodeo','Km por la vía frente a la línea recta entre origen y destino','Barra = km que recorre el tren: la parte oscura es la distancia en línea recta y la clara, el rodeo. Cifra = % de más sobre la recta. Rutas con al menos '+Rd.minimo_recta_km+' km en recta.');
    const chk=el('label','an-check'),inp=el('input');inp.type='checkbox';chk.append(inp,'Incluir rutas con menos de '+Rd.minimo_trenes+' trenes al día');
    c.append(chk,legend([['c-navy','Distancia en línea recta'],['c-soft','Rodeo (km de más por la vía)']]));
    const two=el('div','an-two');c.append(two);
    const T=Object.fromEntries(Rd.tipos.map(t=>[t.tipo,t]));
    c.append(note(`Mediana de las ${Rd.rutas} rutas: un ${Rd.mediana} % más que la recta (alta velocidad ${T['Alta velocidad'].mediana} %, mixta ${T['Mixta'].mediana} %, convencional ${T['Convencional'].mediana} %). Hasta un 2 % es imprecisión de coordenadas y cuenta como 0 %. Un rodeo grande no es un error: suele ser un tren que pasa por otra ciudad (Albacete → Toledo va por Madrid).`));
    const list=rows=>hbars(rows.map(x=>({label:x.n+' · '+x.marca,values:[x.recta,Math.max(0,x.km-x.recta)],shown:x.exceso,extra:fmt(x.km)+' / '+fmt(x.recta)+' km · '+plural(x.trenes,'tren','trenes')})),{format:v=>'+'+fmt(v)+' %',classes:['c-navy','c-soft']});
    const draw=()=>{const all=inp.checked;
      const a=el('div'),b=el('div');a.append(el('h4',null,'Más rodeo'),list(all?Rd.mas_todas:Rd.mas));b.append(el('h4',null,'Más directas'),list(all?Rd.menos_todas:Rd.menos));two.replaceChildren(a,b);};
    inp.addEventListener('change',draw);draw();
    c.append(dataTable([{label:'Relación',key:'n'},{label:'Marca',key:'marca',opt:true},{label:'km por la vía',key:'km',n:true},{label:'km en recta',key:'recta',n:true},{label:'Exceso %',key:'exceso',n:true},{label:'Trenes al día',key:'trenes',n:true,opt:true}],[...Rd.mas_todas,...Rd.menos_todas],'Rutas con más y menos rodeo'));
    const top=Rd.mas[0];setH2('rodeo-t',`Una ruta típica recorre un ${Rd.mediana} % más que la línea recta; ${top.n.replace(' → ',' → ')} (${top.marca}), un ${top.exceso} % más`);
  }

  /* ══ 4 · Lo que cuesta cada parada ══ */
  function paradas(D){
    const P=D.paradas,fam=Object.fromEntries(P.familias.map(f=>[f.fam,f]));
    const q=card('c-paradas-que','Cómo se calcula y por qué importa');
    const ol=el('ol','an-explain');[
      'Se toma una relación concreta (mismo origen, destino y marca) donde conviven trenes con distinto número de paradas: unos van directos y otros paran más.',
      'Para cada tren del miércoles se anotan sus paradas intermedias y sus minutos de viaje.',
      'La pendiente de la recta que mejor une esos puntos dice cuántos minutos añade, de media, cada parada más. Recoge la frenada, el tiempo en el andén y la arrancada.',
      'Por servicio, la cifra es la mediana de todas sus relaciones (y la caja, el 50 % central).'
    ].forEach((t,i)=>{const li=el('li',null,t);li.dataset.n=String(i+1);ol.append(li);});
    q.append(ol,note('Por qué importa: cada parada acerca el tren a más gente pero alarga el viaje de todos los que ya van dentro. Es el equilibrio que decide si un servicio es directo o «para en todas». Límite: comparar trenes de la misma relación aísla casi todo, pero un tren con más paradas también puede ir por otra vía o a otra hora.'));
    const fc=card('c-paradas-fam','Minutos que añade cada parada intermedia, por servicio','Mediana de las relaciones de cada servicio · caja: del percentil 25 al 75');
    const rows=P.familias,min=Math.min(0,...rows.map(f=>f.p25)),max=niceMax(Math.max(...rows.map(f=>f.p75)));
    fc.append(legend([['lg-range','50 % central de las relaciones'],['lg-dot','Mediana']]));
    responsive(fc,w=>{
      const rh=34,H=rows.length*rh+30,L=Math.min(150,w*.36),Rm=58,X=v=>L+(w-L-Rm)*(v-min)/(max-min);
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      for(const t of ticks(max,w<520?2:4)){s.append(svg('line',{x1:X(t),x2:X(t),y1:4,y2:H-22,class:t?'grid':'axis'}),svg('text',{x:X(t),y:H-6,'text-anchor':'middle'},t+' min'));}
      rows.forEach((f,i)=>{const y=8+i*rh+rh/2;
        s.append(svg('text',{x:L-8,y:y+4,'text-anchor':'end',class:'lab'},f.fam+(f.relaciones<5?' *':'')));
        s.append(svg('rect',{x:X(Math.min(f.p25,f.p75)),y:y-7,width:Math.max(2,X(f.p75)-X(f.p25)),height:14,rx:3,class:'box'}));
        const ci=svg('circle',{cx:X(f.mediana),cy:y,r:6,class:'dot'});ci.append(svg('title',{},`${f.fam}: ${f1(f.mediana)} min por parada (${f.relaciones} relaciones)`));s.append(ci);
        s.append(svg('text',{x:w-Rm+8,y:y+4,class:'v'},f1(f.mediana)+' min'));});
      return s;
    },'Minutos por parada intermedia según el servicio');
    fc.append(note('* Pocos casos (menos de 5 relaciones con trenes de distinto número de paradas): tómalo como orientativo.'),
      dataTable([{label:'Servicio',key:'fam'},{label:'Relaciones',key:'relaciones',n:true},{label:'Min/parada (mediana)',get:f=>f1(f.mediana)},{label:'P25',get:f=>f1(f.p25),opt:true},{label:'P75',get:f=>f1(f.p75),opt:true}],rows,'Minutos por parada intermedia'));
    // Ideas que salen de los datos
    const top=['Alta velocidad','Intercity','Regional'].map(f=>P.relaciones.find(r=>r.n===P.ejemplo[f]&&r.fam===f)).filter(Boolean);
    const ins=el('div','an-insights'),ul=el('ul');ins.append(el('h4',null,'Qué dicen los datos'),ul);
    if(fam['Alta velocidad']&&fam['Cercanías'])ul.append(el('li',null,`En alta velocidad, cada parada intermedia cuesta unos ${f1(fam['Alta velocidad'].mediana)} min; en Regional, ${f1(fam.Regional?.mediana)}, y en Cercanías, ${f1(fam['Cercanías'].mediana)}. Parar un tren rápido sale caro: frena y arranca desde mucha más velocidad.`));
    for(const r of top)ul.append(el('li',null,`${r.n} (${r.marca}): el tren más directo (${r.min_paradas} paradas) tarda ${dur(r.min_directo)} y el que más para (${r.max_paradas}), ${dur(r.min_parador)}: ${dur(r.min_parador-r.min_directo)} más.`));
    ul.append(el('li',null,'Para quien viaja de extremo a extremo, elegir el tren directo es la forma más barata de ganar tiempo: no hace falta vía nueva, solo otro horario.'));
    fc.append(ins);
    // Ejemplo con selector
    const ec=card('c-paradas-ej','Ejemplo: cada tren de una relación','Un punto = un tren del miércoles. Eje horizontal: paradas intermedias; vertical: minutos de viaje. La recta es la tendencia (su pendiente, los minutos por parada).');
    const tools=el('div','an-tools'),lab=el('label',null,'Relación'),sel=el('select');sel.id='p-sel';lab.htmlFor='p-sel';
    for(const f of ['Alta velocidad','Avant','Intercity','Regional','Cercanías']){const g=el('optgroup');g.label=f;
      P.relaciones.filter(r=>r.fam===f).sort((a,b)=>b.trenes-a.trenes).forEach(r=>{const o=el('option',null,`${r.n} · ${r.marca} (${r.trenes} trenes)`);o.value=P.relaciones.indexOf(r);g.append(o);});if(g.children.length)sel.append(g);}
    const first=P.relaciones.findIndex(r=>r.n===P.ejemplo['Alta velocidad']);if(first>=0)sel.value=String(first);
    tools.append(lab,sel);ec.append(tools,legend([['lg-dot','Un tren'],['lg-fit','Tendencia']]));
    const read=el('p','an-read');read.setAttribute('aria-live','polite');
    let cur=P.relaciones[+sel.value];
    const ch=responsive(ec,w=>{
      const r=cur,pts=r.puntos,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
      const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.floor(Math.min(...ys)*0.95/10)*10,y1=Math.ceil(Math.max(...ys)*1.03/10)*10;
      const H=260,L=56,Rm=16,T=10,B=34,X=v=>L+(w-L-Rm)*(x1===x0?.5:(v-x0+.5)/(x1-x0+1)),Y=v=>H-B-(H-T-B)*(v-y0)/(y1-y0||1);
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      const yt=ticks(y1-y0,4).map(t=>y0+t);for(const t of yt)if(t<=y1)s.append(svg('line',{x1:L,x2:w-Rm,y1:Y(t),y2:Y(t),class:'grid'}),svg('text',{x:L-6,y:Y(t)+4,'text-anchor':'end'},dur(t)));
      for(let k=x0;k<=x1;k++)s.append(svg('text',{x:X(k),y:H-B+16,'text-anchor':'middle'},String(k)));
      s.append(svg('text',{x:w-Rm,y:H-4,'text-anchor':'end'},'paradas intermedias'));
      // recta de tendencia (mínimos cuadrados, la misma pendiente que la tabla)
      const n=pts.length,mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;
      s.append(svg('line',{x1:X(x0),y1:Y(my+r.por_parada*(x0-mx)),x2:X(x1),y2:Y(my+r.por_parada*(x1-mx)),class:'fit'}));
      const seen=new Map();for(const [k,v] of pts){const key=k+'|'+v,i=seen.get(key)||0;seen.set(key,i+1);
        const ci=svg('circle',{cx:(X(k)+(i%2?1:-1)*Math.ceil(i/2)*5).toFixed(1),cy:Y(v).toFixed(1),r:5,class:'dot'});ci.append(svg('title',{},`${k} paradas · ${dur(v)}`));s.append(ci);}
      return s;
    },'Minutos de viaje de cada tren según sus paradas');
    const paint=()=>{cur=P.relaciones[+sel.value];ch.repaint();
      read.replaceChildren('El tren más directo (',el('strong',null,cur.min_paradas+' paradas'),') tarda ',el('strong',null,dur(cur.min_directo)),'; el que más para (',el('strong',null,String(cur.max_paradas)),'), ',el('strong',null,dur(cur.min_parador)),'. Tendencia: ',el('strong',null,f1(cur.por_parada)+' min por parada'),' ('+cur.trenes+' trenes).');};
    sel.addEventListener('change',paint);ec.append(read);paint();
    ec.append(dataTable([{label:'Relación',key:'n'},{label:'Marca',key:'marca',opt:true},{label:'Servicio',key:'fam',opt:true},{label:'Trenes',key:'trenes',n:true,opt:true},{label:'Paradas (mín.–máx.)',get:r=>r.min_paradas+'–'+r.max_paradas},{label:'Directo',get:r=>dur(r.min_directo)},{label:'El que más para',get:r=>dur(r.min_parador)},{label:'Min/parada',get:r=>f1(r.por_parada)}],P.relaciones,'Relaciones con trenes de distinto número de paradas'));
    setH2('paradas-t',`En alta velocidad cada parada intermedia añade unos ${p0.format(fam['Alta velocidad'].mediana)} minutos al viaje; en Cercanías, uno`);
  }

  /* ══ 5 · Espera media en Cercanías ══ */
  function espera(D){
    const E=D.espera,c=card('c-espera','Minutos de espera media en la estación principal de cada línea',`Hora punta ${hm(E.punta[0])}–${hm(E.punta[1])} · hora valle ${hm(E.valle[0])}–${hm(E.valle[1])} · miércoles · estación con más trenes de la línea, en el sentido con más salidas`);
    const nucs=[...new Set(E.lineas.map(l=>l.nuc))].sort((a,b)=>a.localeCompare(b,'es'));
    const tools=el('div','an-tools'),lab=el('label',null,'Núcleo'),sel=el('select');sel.id='e-nuc';lab.htmlFor='e-nuc';
    sel.append(new Option('Todos (las 15 de menor espera en punta)',''),new Option('Todos (las '+E.lineas.length+' líneas)','*'));for(const n of nucs)sel.append(new Option(n,n));
    tools.append(lab,sel);c.append(tools,legend([['lg-dot','Hora punta'],['lg-ring','Hora valle']]));
    let rows=[];
    const ch=responsive(c,w=>{
      const rh=24,H=rows.length*rh+30,L=Math.min(260,w*.45),Rm=78,max=niceMax(Math.max(10,...rows.flatMap(l=>[l.punta.espera||0,l.valle.espera||0]))),X=v=>L+(w-L-Rm)*v/max;
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      for(const t of ticks(max,w<520?2:4))s.append(svg('line',{x1:X(t),x2:X(t),y1:2,y2:H-22,class:t?'grid':'axis'}),svg('text',{x:X(t),y:H-6,'text-anchor':'middle'},t+' min'));
      rows.forEach((l,i)=>{const y=6+i*rh+rh/2,p=l.punta.espera,v=l.valle.espera;
        s.append(svg('text',{x:L-8,y:y+4,'text-anchor':'end',class:'lab'},(l.linea+' · '+l.nuc).slice(0,Math.floor(L/6.6))));
        if(p!==null&&v!==null)s.append(svg('line',{x1:X(p),x2:X(v),y1:y,y2:y,class:'rng-whisk'}));
        if(v!==null){const c2=svg('circle',{cx:X(v),cy:y,r:5,class:'d-valle'});c2.append(svg('title',{},`${l.linea} ${l.nuc} en ${l.desde} · valle: ${f1(v)} min (${l.valle.trenes} trenes)`));s.append(c2);}
        if(p!==null){const c1=svg('circle',{cx:X(p),cy:y,r:5,class:'d-punta'});c1.append(svg('title',{},`${l.linea} ${l.nuc} en ${l.desde} · punta: ${f1(p)} min (${l.punta.trenes} trenes)`));s.append(c1);}
        s.append(svg('text',{x:w-Rm+8,y:y+4,class:'v'},(p===null?'—':f1(p))+' / '+(v===null?'—':f1(v))));});
      return s;
    },'Espera media por línea de Cercanías en hora punta y valle');
    c.append(note('Espera media de quien llega al andén sin mirar el horario = Σ intervalo² ÷ (2 × Σ intervalo). Con trenes regulares es la mitad del intervalo; con huecos irregulares sale más, porque es más probable llegar dentro de un hueco largo. «—»: menos de 2 trenes en esa franja. Se mide en la estación con más trenes de la línea y en el sentido con más salidas, porque en una cabecera secundaria (Reinosa en la C1 de Cantabria) saldrían muchos menos trenes que los que ve la mayoría. Solo vale para servicios en los que se va a la estación sin planificar (Cercanías); en larga distancia se compra con horario.'));
    const draw=()=>{const v=sel.value;rows=v===''?E.lineas.filter(l=>l.punta.espera!==null).slice(0,15):v==='*'?E.lineas:E.lineas.filter(l=>l.nuc===v);ch.repaint();};
    sel.addEventListener('change',draw);draw();
    c.append(dataTable([{label:'Línea',key:'linea'},{label:'Núcleo',key:'nuc'},{label:'Estación',key:'desde',opt:true},{label:'Hacia',key:'hacia',opt:true},{label:'Punta (min)',get:l=>f1(l.punta.espera)},{label:'Intervalo punta',get:l=>f1(l.punta.intervalo),opt:true},{label:'Valle (min)',get:l=>f1(l.valle.espera)},{label:'Intervalo valle',get:l=>f1(l.valle.intervalo),opt:true}],E.lineas,'Espera media por línea'));
    const best=E.lineas[0],both=E.lineas.filter(l=>l.punta.espera!==null&&l.valle.espera!==null),up=both.filter(l=>l.valle.espera>l.punta.espera).length;
    const worst=Math.max(...E.lineas.map(l=>l.punta.espera??0));
    setH2('espera-t',`En hora punta se espera de media ${f1(best.punta.espera)} min en la ${best.linea} de ${best.nuc} (${best.desde}) y hasta ${p0.format(worst)} en las líneas con menos trenes; en hora valle la espera sube en ${up} de ${both.length} líneas`);
  }

  /* ══ 6 · Fin de semana ══ */
  function finde(D){
    const F=D.finde,c=card('c-finde','Trenes del sábado y del domingo, en % de un laborable','Suma de trenes de cada servicio · laborable = miércoles = 100 %');
    const seg=el('div','an-seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Ver por');
    const b1=el('button',null,'Por servicio'),b2=el('button',null,'Cercanías por núcleo');for(const b of [b1,b2])b.type='button';seg.append(b1,b2);
    c.append(seg,legend([['lg-dot','Sábado'],['lg-ring','Domingo'],['lg-goal','Laborable (100 %)']]));
    let rows=[];
    const ch=responsive(c,w=>{
      const rh=30,H=rows.length*rh+30,L=Math.min(190,w*.4),Rm=88,X=v=>L+(w-L-Rm)*v/110;
      const s=svg('svg',{viewBox:`0 0 ${w} ${H}`,width:w,height:H,class:'svgchart','aria-hidden':'true'});
      for(const t of (w<520?[0,50,100]:[0,25,50,75,100]))s.append(svg('line',{x1:X(t),x2:X(t),y1:2,y2:H-22,class:t===100?'hundred':t?'grid':'axis'}),svg('text',{x:X(t),y:H-6,'text-anchor':'middle'},t+' %'));
      rows.forEach((r,i)=>{const y=6+i*rh+rh/2;
        s.append(svg('text',{x:L-8,y:y+4,'text-anchor':'end',class:'lab'},r.label));
        s.append(svg('line',{x1:X(r.sab),x2:X(r.dom),y1:y,y2:y,class:'rng-whisk'}));
        const a=svg('circle',{cx:X(r.sab),cy:y,r:6,class:'d-sab'});a.append(svg('title',{},`${r.label} · sábado ${r.sab} %`));
        const b=svg('circle',{cx:X(r.dom),cy:y,r:6,class:'d-dom'});b.append(svg('title',{},`${r.label} · domingo ${r.dom} %`));s.append(a,b);
        s.append(svg('text',{x:w-Rm+8,y:y+4,class:'v'},r.sab+' / '+r.dom+' %'));});
      return s;
    },'Trenes de sábado y domingo en porcentaje del laborable');
    const tbl=el('div');c.append(tbl);
    const set=mode=>{b1.setAttribute('aria-pressed',String(mode===0));b2.setAttribute('aria-pressed',String(mode===1));
      rows=mode===0?F.familias.map(f=>({label:f.fam,sab:f.sab,dom:f.dom,n:f.lab})):F.nucleos.map(n=>({label:n.nuc,sab:n.sab,dom:n.dom,n:n.lab}));ch.repaint();
      tbl.replaceChildren(dataTable([{label:mode?'Núcleo':'Servicio',key:'label'},{label:'Trenes un laborable',key:'n',n:true},{label:'Sábado %',key:'sab',n:true},{label:'Domingo %',key:'dom',n:true}],rows,'Servicio de fin de semana'));};
    b1.onclick=()=>set(0);b2.onclick=()=>set(1);set(0);
    const t=F.total;c.append(note(`Todos los servicios: ${fmt(t.lab)} trenes un laborable, ${fmt(t.sab)} el sábado (${p0.format(100*t.sab/t.lab)} %) y ${fmt(t.dom)} el domingo (${p0.format(100*t.dom/t.lab)} %).`));
    const k=card('c-finde-caidas','Rutas de media y larga distancia que más servicio pierden el domingo','Rutas con 10 trenes o más un laborable (un sentido) · trenes del domingo en % del laborable');
    const cz=F.caidas.filter(r=>r.fam!=='Cercanías');
    k.append(hbars(cz.slice(0,10).map(r=>({label:r.n+' · '+r.marca,values:[r.pct_dom||0],shown:r.pct_dom,extra:r.dom+' de '+r.lab})),{format:v=>fmt(v)+' %',max:100}),
      note('Cercanías se compara por núcleo (gráfico de la izquierda) y no por línea: algunas líneas cambian de nombre el fin de semana (la R2 de Rodalies circula como R2N y R2S) o tienen variantes solo laborables (C5a de Asturias), y por línea parecería que pierden casi todo el servicio.'),
      dataTable([{label:'Ruta',key:'n'},{label:'Marca',key:'marca',opt:true},{label:'Laborable',key:'lab',n:true},{label:'Sábado',key:'sab',n:true},{label:'Domingo',key:'dom',n:true},{label:'Domingo %',key:'pct_dom',n:true}],cz,'Rutas con mayor caída el domingo'));
    const worst=[...F.familias].sort((a,b)=>Math.min(a.sab,a.dom)-Math.min(b.sab,b.dom))[0];
    const ps=p0.format(100*t.sab/t.lab),pd=p0.format(100*t.dom/t.lab);
    setH2('finde-t',(ps===pd?`El sábado y el domingo circula el ${ps} % de los trenes de un laborable`:`El sábado circula el ${ps} % de los trenes de un laborable y el domingo, el ${pd} %`)+`; ${worst.fam} es el servicio que más recorta (${Math.min(worst.sab,worst.dom)} %)`);
  }

  /* ══ 7 · Horas de servicio ══ */
  function horas(D){
    const H=D.horas,rows=H.familias.filter(f=>f.rutas),c=card('c-horas','De la primera a la última salida del día, por servicio','Miércoles · una ruta típica de cada servicio (mediana de sus rutas con 2 trenes o más) · línea fina: del 10 % de rutas que empiezan antes al 10 % que acaban después');
    c.append(legend([['lg-range','Ventana de una ruta típica'],['lg-whisk','Rutas que empiezan antes y acaban después (10 % de cada extremo)']]));
    responsive(c,w=>{
      const rh=40,Hh=rows.length*rh+34,L=Math.min(130,w*.3),Rm=w<520?64:150,X=m=>L+(w-L-Rm)*Math.min(m,1500)/1500;
      const s=svg('svg',{viewBox:`0 0 ${w} ${Hh}`,width:w,height:Hh,class:'svgchart','aria-hidden':'true'});
      for(let h=0;h<=24;h+=w<520?6:3)s.append(svg('line',{x1:X(h*60),x2:X(h*60),y1:2,y2:Hh-22,class:h?'grid':'axis'}),svg('text',{x:X(h*60),y:Hh-6,'text-anchor':'middle'},pad(h%24)+':00'));
      rows.forEach((f,i)=>{const y=6+i*rh+rh/2;
        s.append(svg('text',{x:L-8,y:y+4,'text-anchor':'end',class:'lab'},f.fam));
        s.append(svg('line',{x1:X(f.pri_p10),x2:X(f.ult_p90),y1:y,y2:y,class:'rng-whisk'}));
        const r=svg('rect',{x:X(f.pri),y:y-8,width:Math.max(2,X(f.ult)-X(f.pri)),height:16,rx:3,class:'rng-bar'});r.append(svg('title',{},`${f.fam}: ${hm(f.pri)}–${hm(f.ult)} (${f1(f.horas)} h) · ${f.rutas} rutas`));s.append(r);
        s.append(svg('text',{x:w-Rm+8,y:y+4,class:'v'},f1(f.horas)+' h'+(w<520?'':' · '+hm(f.pri)+'–'+hm(f.ult))));});
      return s;
    },'Ventana de servicio de cada tipo de tren');
    c.append(note('Horas de servicio = de la primera a la última salida del miércoles en cada ruta (origen → destino y marca; en Cercanías, la línea en los dos sentidos). Mide cuánto dura el día de servicio, no cuántos trenes hay: un Avant con 6 trenes repartidos de 6:00 a 22:00 da 16 h. Una fila por relación y marca.'),
      dataTable([{label:'Ruta',key:'n'},{label:'Marca',key:'marca',opt:true},{label:'Servicio',key:'fam',opt:true},{label:'Primera',get:r=>hm(r.pri)},{label:'Última',get:r=>hm(r.ult)},{label:'Horas',get:r=>f1(r.horas)},{label:'Trenes',key:'trenes',n:true,opt:true}],H.rutas,'Horas de servicio por ruta'));
    const F=Object.fromEntries(rows.map(f=>[f.fam,f]));
    setH2('horas-t',`Una línea de Cercanías típica tiene trenes durante ${p0.format(F['Cercanías'].horas)} horas al día; una ruta de alta velocidad, ${p0.format(F['Alta velocidad'].horas)}, y una regional, ${p0.format(F.Regional.horas)}`);
  }

  /* ══ 8 · Mapa de trenes por tramo (carga diferida) ══ */
  const Q=[10,30,60,120,250],qOf=n=>n<=Q[0]?1:n<=Q[1]?2:n<=Q[2]?3:n<=Q[3]?4:n<=Q[4]?5:6,WIDTH=[0,1,1.6,2.4,3.4,4.6,6];
  function mapaShell(D){
    const M=D.mapa,c=card('c-mapa','Trenes programados al día en cada tramo de vía, en los dos sentidos','Miércoles · grosor y color = trenes al día · elige qué trenes sumar');
    const seg=el('div','an-seg');seg.setAttribute('role','group');seg.setAttribute('aria-label','Qué trenes sumar');
    const MODES=[['total','Todos los trenes'],['ld','Media y larga distancia'],['cer','Cercanías']];
    const btns=MODES.map(([k,t])=>{const b=el('button',null,t);b.type='button';b.dataset.mode=k;seg.append(b);return b;});
    c.append(seg,legend(['1–10','11–30','31–60','61–120','121–250','Más de 250'].map((t,i)=>['q'+(i+1)+' qw',t])));
    c.querySelectorAll('.legend i.qw').forEach((i,k)=>i.style.setProperty('--w',Math.max(3,WIDTH[k+1]*2)+'px'));
    const box=el('div','an-map');box.append(el('p','an-hint','Cargando el mapa…'));c.append(box);
    setH2('mapa-t',`Los tramos más cargados ven pasar hasta ${fmt(M.max_total)} trenes al día; en media y larga distancia, hasta ${fmt(M.max_ld)}`);
    c.append(note(`Media y larga distancia: cada fila de la tabla de rutas (origen → destino y marca) suma sus trenes en todos los tramos de su recorrido, porque todos lo hacen completo; ${plural(M.filas_parcial,'ruta','rutas')} con el trazado incompleto (${fmt(M.trenes_parcial)} trenes) suman en los tramos que sí se conocen y ${plural(M.filas_sin_trazado,'ruta','rutas')} sin trazado (${fmt(M.trenes_sin_trazado)} trenes) no se dibujan. Cercanías: los trenes de cada trozo de línea (ida y vuelta) se asignan al eje IGN por el que circulan (el más cercano, a menos de 35 m, en paralelo y sin ancho estándar); casa el ${f1(M.cobertura_cer)} % de su longitud y el resto (${fmt(M.km_cer_sin_casar)} km) se dibuja con su trazado propio. Las líneas que comparten vía se suman. En las estaciones grandes, un tramo puede recoger todas las líneas que entran en ella.`));
    const side=card('c-mapa-top','Tramos con más trenes','El más cargado de cada zona · entorno: estación más cercana a los extremos del tramo');
    let loaded=false;
    const io=new IntersectionObserver(es=>{if(loaded||!es.some(e=>e.isIntersecting))return;loaded=true;io.disconnect();
      fetch('capas/analisis-mapa.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(m=>mapa(m,box,side,btns))
        .catch(()=>{box.replaceChildren(el('p','an-hint','No se ha podido cargar el mapa. Recarga la página para reintentar.'));});},{rootMargin:'300px'});
    io.observe(c);
  }
  function mapa(m,box,side,btns){
    const W=1000,kx=Math.cos(40*Math.PI/180),k=W/((3.45+9.45)*kx),X=lon=>(lon+9.45)*kx*k,Y=lat=>(43.95-lat)*k,H=Math.ceil(Y(35.9));
    const s=svg('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Mapa de la España peninsular con el número de trenes al día de cada tramo'});
    const g=svg('g');s.append(g);
    const path=pts=>pts.map((p,i)=>(i?'L':'M')+X(p[0]).toFixed(1)+','+Y(p[1]).toFixed(1)).join('');
    g.append(svg('path',{d:m.regiones.map(r=>r.map(ring=>path(ring)+'Z').join('')).join(''),class:'land','fill-rule':'evenodd'}));
    const lay=svg('g');g.append(lay);
    for(const [name,lon,lat] of [['Madrid',-3.69,40.42],['Barcelona',2.17,41.39],['València',-0.38,39.47],['Sevilla',-5.98,37.39],['Zaragoza',-0.88,41.65],['Bilbao',-2.93,43.26],['Málaga',-4.42,36.72],['A Coruña',-8.41,43.36],['Valladolid',-4.72,41.65]])
      g.append(svg('circle',{cx:X(lon),cy:Y(lat),r:3.5,class:'city'}),svg('text',{x:X(lon)+6,y:Y(lat)-6,class:'place'},name));
    let mode='total',z=1,cx=W/2,cy=H/2;
    // Valor de cada elemento según la vista: [media y larga distancia, Cercanías, geometría] o [Cercanías sin casar, geometría]
    const items=()=>{const out=[];for(const [l,c,pts] of m.ign){const n=mode==='total'?l+c:mode==='ld'?l:c;if(n>0)out.push([n,pts]);}
      if(mode!=='ld')for(const [n,pts] of m.cer_extra)out.push([n,pts]);return out;};
    const draw=()=>{const by=[[],[],[],[],[],[],[]];for(const [n,pts] of items())by[qOf(n)].push(path(pts));
      lay.replaceChildren();for(let q=1;q<=6;q++)if(by[q].length)lay.append(svg('path',{d:by[q].join(''),class:'seg q'+q,'stroke-width':(WIDTH[q]/Math.sqrt(z)).toFixed(2)}));};
    const tip=el('div','an-tip');tip.hidden=true;
    const zoom=el('div','an-zoom'),zi=el('button',null,'+'),zo=el('button',null,'−'),zr=el('button',null,'⟲');
    zi.setAttribute('aria-label','Acercar');zo.setAttribute('aria-label','Alejar');zr.setAttribute('aria-label','Ver toda la península');for(const b of [zi,zo,zr])b.type='button';zoom.append(zi,zo,zr);
    box.replaceChildren(s,zoom,tip);
    box.after(el('p','an-hint','Usa + y − para acercar, arrastra para moverte y pulsa sobre una vía para ver sus trenes.'));
    const apply=()=>{const w=W/z,h=H/z;cx=Math.max(w/2,Math.min(W-w/2,cx));cy=Math.max(h/2,Math.min(H-h/2,cy));s.setAttribute('viewBox',`${(cx-w/2).toFixed(1)} ${(cy-h/2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
      lay.querySelectorAll('path.seg').forEach(p=>p.setAttribute('stroke-width',(WIDTH[+p.getAttribute('class').slice(-1)]/Math.sqrt(z)).toFixed(2)));};   // el grosor no crece con el zoom
    zi.onclick=()=>{z=Math.min(16,z*1.6);apply();};zo.onclick=()=>{z=Math.max(1,z/1.6);apply();};zr.onclick=()=>{z=1;cx=W/2;cy=H/2;apply();};
    let drag=null;
    s.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,cx,cy,moved:false};s.setPointerCapture(e.pointerId);});
    s.addEventListener('pointermove',e=>{if(!drag)return;const kk=W/z/s.clientWidth,dx=(e.clientX-drag.x)*kk,dy=(e.clientY-drag.y)*kk;if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;cx=drag.cx-dx;cy=drag.cy-dy;apply();});
    s.addEventListener('pointerup',e=>{const d=drag;drag=null;if(d&&!d.moved)pick(e);});
    const pick=e=>{const pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(s.getScreenCTM().inverse());let best=null,bd=(8/z)**2;
      // Distancia al segmento (no solo a los vértices: los tramos simplificados tienen vértices muy separados).
      const seg2=(ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy,t=L?Math.max(0,Math.min(1,((pt.x-ax)*dx+(pt.y-ay)*dy)/L)):0;return (ax+t*dx-pt.x)**2+(ay+t*dy-pt.y)**2;};
      const scan=(rows,val)=>{for(const r of rows){const pts=r.at(-1),n=val(r);if(!(n>0))continue;for(let i=1;i<pts.length;i++){const d=seg2(X(pts[i-1][0]),Y(pts[i-1][1]),X(pts[i][0]),Y(pts[i][1]));if(d<bd||(d===bd&&best&&n>best.n)){bd=d;best={n,r};}}}};
      scan(m.ign,r=>mode==='total'?r[0]+r[1]:mode==='ld'?r[0]:r[1]);if(mode!=='ld')scan(m.cer_extra,r=>r[0]);
      if(!best){tip.hidden=true;return;}const r=box.getBoundingClientRect(),row=best.r;
      tip.textContent=fmt(best.n)+' trenes al día'+(row.length===3&&mode==='total'&&row[0]&&row[1]?' ('+fmt(row[0])+' de media y larga distancia y '+fmt(row[1])+' de Cercanías)':'');
      tip.style.left=(e.clientX-r.left)+'px';tip.style.top=(e.clientY-r.top)+'px';tip.hidden=false;};
    const list=(rows,withBrands)=>table([{label:'Trenes',key:'trenes',n:true},{label:'Entorno',key:'entre'},...(withBrands?[{label:'Marcas',get:r=>r.marcas.join(', ')||'—',opt:true}]:[{label:'De ellos, Cercanías',key:'cer',n:true,opt:true}])],rows);
    const sideBody=el('div');side.append(sideBody);
    const setMode=k=>{mode=k;btns.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===k)));tip.hidden=true;draw();
      sideBody.replaceChildren(list(m.top[k],k==='ld'));};
    btns.forEach(b=>b.onclick=()=>setMode(b.dataset.mode));setMode('total');
    const [t1,t2]=m.top.total,l1=m.top.ld[0];
    const cer=t=>t.cer>t.ld;
    if(t1&&t2&&l1)setH2('mapa-t',`Los tramos con más trenes son ${t1.entre} (${fmt(t1.trenes)} al día) y ${t2.entre} (${fmt(t2.trenes)})${cer(t1)&&cer(t2)?', los dos de Cercanías':''}; en media y larga distancia, el máximo está en el entorno de ${l1.entre} (${fmt(l1.trenes)})`);
  }

  /* ══ 9 · Electrificación ══ */
  function elec(D){
    const E=D.electrificacion,c=card('c-elec','Qué parte del servicio circula bajo catenaria','% de trenes·km del miércoles (trenes × km de cada ruta) por vía electrificada · sin Cercanías, que no tienen el dato en su trazado');
    c.append(legend([['c-navy','Electrificada'],['c-ctx','Sin electrificar'],['c-soft','Sin dato']]),
      hbars([...E.familias.map(f=>({label:f.fam,values:[f.si,f.no,f.sin_dato],shown:f.si,extra:fmt(f.trenkm)+' tren·km'})),{label:'Total',values:[E.total.si,E.total.no,E.total.sin_dato],shown:E.total.si,extra:fmt(E.total.trenkm)+' tren·km',hi:true}],{format:v=>f1(v)+' %',classes:['c-navy','c-ctx','c-soft'],max:100}),
      note('Ponderar por trenes·km mide el servicio, no la red: una línea sin catenaria con un tren al día pesa poco. En la red (km de vía), sin electrificar queda un tercio; en el servicio, mucho menos, porque los trenes se concentran en las líneas electrificadas.'),
      dataTable([{label:'Servicio',key:'fam'},{label:'Rutas',key:'rutas',n:true},{label:'Trenes·km',key:'trenkm',n:true},{label:'Electrificada %',get:f=>f1(f.si)},{label:'Sin electrificar %',get:f=>f1(f.no)},{label:'Sin dato %',get:f=>f1(f.sin_dato)}],E.familias,'Electrificación del servicio'));
    const k=card('c-elec-diesel','Rutas con más servicio por vía sin electrificar','Rutas con menos de la mitad de sus km electrificados, ordenadas por trenes·km');
    k.append(table([{label:'Ruta',get:r=>r.n+' · '+r.marca},{label:'Trenes·km',get:r=>fmt(r.trenes*r.km),n:true},{label:'% electr.',key:'el',n:true},{label:'Trenes',key:'trenes',n:true,opt:true}],E.diesel.slice(0,8)),
      note('Trenes·km = trenes al día × km de la ruta. Son relaciones largas que pasan por tramos sin catenaria aunque parte de su recorrido esté electrificado.'));
    const R=Object.fromEntries(E.familias.map(f=>[f.fam,f]));
    setH2('electrificacion-t',`El ${p0.format(E.total.si)} % del servicio de media y larga distancia circula bajo catenaria; en Regional, el ${p0.format(R.Regional.si)} %`);
  }

  /* ══ 10 · Densidad de red ══ */
  function densidad(D){
    const Dn=D.densidad,rows=Dn.comunidades,c=card('c-densidad','Densidad de red por comunidad autónoma','España peninsular · km de vía de los ejes IGN con atributos ('+fmt(Dn.total.km)+' km), asignados por su punto medio · población INE '+Dn.fecha_poblacion+(Dn.provisional?' (provisional)':''));
    const two=el('div','an-two');c.append(two);
    const maxA=Math.max(...rows.map(r=>r.m_km2)),maxB=Math.max(...rows.map(r=>r.km_100k));
    const a=el('div'),b=el('div');
    a.append(el('h4',null,'Metros de vía por km² (media peninsular: '+fmt(Dn.total.m_km2)+')'),hbars(rows.map(r=>({label:r.n,values:[r.m_km2],hi:r.m_km2===maxA})),{format:v=>fmt(v)+' m'}));
    b.append(el('h4',null,'Km de vía por cada 100.000 habitantes (media: '+f1(Dn.total.km_100k)+')'),hbars(rows.map(r=>({label:r.n,values:[r.km_100k],hi:r.km_100k===maxB})),{format:v=>f1(v)+' km'}));
    two.append(a,b);
    c.append(note('Mismo orden en los dos gráficos (por superficie), para leer cada comunidad de lado a lado: las más densas por km² suelen ser las más pobladas, y las de mucha superficie y poca población salen arriba por habitante. Es red, no servicio: un km de vía cuenta igual con 2 trenes al día que con 200.'),
      dataTable([{label:'Comunidad',key:'n'},{label:'km de vía',key:'km',n:true},{label:'Superficie (km²)',key:'area',n:true,opt:true},{label:'Población',key:'pob',n:true,opt:true},{label:'m/km²',key:'m_km2',n:true},{label:'km/100.000 hab.',get:r=>f1(r.km_100k)}],rows,'Densidad de red por comunidad'));
    const A=rows[0],B=[...rows].sort((x,y)=>y.km_100k-x.km_100k)[0];
    const art=n=>({'Comunidad de Madrid':'La Comunidad de Madrid','Principado de Asturias':'El Principado de Asturias','Región de Murcia':'La Región de Murcia','Comunitat Valenciana':'La Comunitat Valenciana','Comunidad Foral de Navarra':'La Comunidad Foral de Navarra','País Vasco/Euskadi':'El País Vasco'})[n]||n;
    setH2('densidad-t',`${art(A.n)} tiene ${fmt(A.m_km2)} metros de vía por km², ${p0.format(A.m_km2/Dn.total.m_km2)} veces la media; por habitante, ${B.n} encabeza con ${f1(B.km_100k)} km por cada 100.000`);
  }

  /* ══ Método ══ */
  function metodo(D){
    const def=$('#m-def .cb-more-body'),fix=$('#m-fix .cb-more-body'),src=$('#m-src .cb-more-body');
    const dl=(pairs)=>{const d=el('dl','src');for(const [t,x] of pairs)d.append(el('dt',null,t),el('dd',null,x));return d;};
    def.append(dl([
      ['1 · Simulador de capitales','Trenes directos Madrid → capital el miércoles (cualquier tren que pare en las dos; estación de la capital a ≤ 12 km). Velocidad en línea recta = distancia en recta entre estaciones ÷ tiempo del tren directo más rápido.'],
      ['2 · Simulador de velocidad','Velocidad comercial = km del trazado IGN ÷ duración mediana. Tipo de vía por el % de km de alta velocidad (≥ 80 %, 20–80 %, < 20 %).'],
      ['3 · Rodeo','Exceso de recorrido = (km por la vía − km en recta) ÷ km en recta. Solo rutas con al menos 50 km en recta.'],
      ['4 · Coste de una parada','Pendiente (mínimos cuadrados) de los minutos de viaje frente a las paradas intermedias, dentro de una misma relación y marca; mediana por servicio.'],
      ['5 · Espera media','Σ intervalo² ÷ (2 × Σ intervalo) con las salidas de la estación con más trenes de cada línea de Cercanías, en el sentido con más salidas, en punta (7:00–9:30) y valle (10:00–13:00).'],
      ['6 · Fin de semana','Trenes del sábado y del domingo ÷ trenes del miércoles, por servicio y por núcleo.'],
      ['7 · Horas de servicio','Última salida − primera salida del miércoles en cada ruta; mediana por servicio.'],
      ['8 · Trenes por tramo','Suma de los trenes del miércoles que pasan por cada eje IGN (dos sentidos): las rutas de media y larga distancia por su recorrido y Cercanías casada con el eje por el que circula.'],
      ['9 · Electrificación','% de trenes·km (trenes × km de la ruta) por vía electrificada.'],
      ['10 · Densidad','km de vía ÷ superficie (m/km²) y ÷ población (km por 100.000 habitantes).']]));
    fix.append(el('p','cb-note','Antes de calcular se revisaron los datos. Esto se ha corregido en origen:'),dl([
      ['Duración de las líneas de Cercanías (rutas.json)','La mediana y el tren más rápido mezclaban trenes que solo hacen un trozo de la línea: la C5 de Madrid salía con un «tren más rápido» de 3 minutos. Ahora se calculan solo con los trenes que van de un extremo al otro (C5: 60 y 59 min). Lo usan también la tabla de rutas y la Cabina.'],
      ['Polígonos de comunidades y provincias (demografia.json)','En 13 territorios los anillos llegaban mal anidados: un contorno aparecía como «agujero» de un islote. En Cataluña era el contorno principal, así que un punto de Barcelona quedaba fuera de la comunidad: 195 estaciones y 2.155 km de vía no caían en ninguna comunidad. En el resto (Galicia, Girona, Tarragona…) eran islotes y no cambiaban ningún cálculo, pero se reparan igual. Con tools/repair-demografia.mjs ya no queda ninguna estación fuera, y las áreas cuadran con las del INE (Cataluña 32.739 frente a 32.118 km², con proyección aproximada).'],
      ['Doble conteo por sentido','La tabla de rutas tiene una fila por sentido. Aquí cada relación y marca cuenta una vez (el sentido con más trenes).'],
      ['Velocidad de 12 capitales','Su tren más rápido pasa por tramos con el trazado incompleto y no tiene km medibles. El simulador usa la velocidad en línea recta, medible en todas.'],
      ['Rodeo negativo','Una ruta no puede ser más corta que la recta: hasta un −2 % es imprecisión de coordenadas y cuenta como 0 %.'],
      ['Cercanías en el mapa','El GTFS trae un dibujo por sentido y no comparte geometría con la red IGN. Se suman ida y vuelta y cada punto se asigna al eje IGN más cercano por el que puede circular; asignarlo a todos los ejes cercanos sumaba Cercanías a la vía de alta velocidad paralela (230 km; ahora 14, que son vías de ancho ibérico preparadas para alta velocidad y compartidas).'],
      ['Rutas con el trazado incompleto','Antes no se dibujaban; ahora suman sus trenes en los tramos conocidos de su recorrido.']]),
      el('p','cb-note','Comprobado y no es un error: el lunes de la semana de referencia tiene más trenes en Madrid porque Renfe publica para ese día un plan propio (292 viajes en la C5, sin duplicados); Vigo → Ourense da un rodeo real (ese regional va por Pontevedra y Santiago), y algunas líneas no tienen trenes el domingo porque solo circulan los laborables (C5a de Asturias, RG1 de Girona, C1a de Cádiz).'));
    const ref=D.referencia;
    src.append(dl([
      ['Horarios','Renfe (GTFS de alta velocidad, larga y media distancia y Cercanías, CC BY 4.0), OUIGO (PDF oficial) e iryo (GTFS comunitario, no oficial). Semana del '+ref.semana+'; día de referencia, el miércoles '+ref.laborable+'.'],
      ['Red','IGN (ejes ferroviarios) con las correcciones del visor (ancho y electrificación de Adif).'],
      ['Población','INE: capitales a 1-1-2025 y comunidades a '+D.densidad.fecha_poblacion+(D.densidad.provisional?' (provisional)':'')+'.'],
      ['Qué no responde','Viajeros por ruta, estación o tren (no hay fuente pública), puntualidad (sin histórico) ni tiempo real de acceso a la estación. Mes y año serían estimaciones con semana tipo: aquí solo se usa el miércoles, salvo en el fin de semana.']]));
  }

  function fail(msg){const a=$('#alert');a.hidden=false;a.textContent=msg;}
  fetch('capas/analisis.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(D=>{
    $('#ref').textContent='Día de referencia: '+longDate(D.referencia.laborable)+'. Todos los trenes de viajeros con horario público (Renfe, también Cercanías, OUIGO e iryo).';
    for(const [f,n] of [[s1,'simulador de capitales'],[s2,'simulador de velocidad'],[rodeo,'rodeos'],[paradas,'paradas'],[espera,'espera'],[finde,'fin de semana'],[horas,'horas de servicio'],[mapaShell,'mapa'],[elec,'electrificación'],[densidad,'densidad'],[metodo,'método']]){
      try{f(D);}catch(e){console.error(n,e);fail('No se ha podido pintar «'+n+'». El resto de la página funciona.');}
    }
  }).catch(()=>fail('No se han podido cargar los datos del análisis (capas/analisis.json). Recarga la página para reintentar.'));
})();
