/* Navegación del panel «Capas y filtros»: barra lateral por categorías, contadores de capas
   activas y acción de grupo. Solo interfaz: las capas siguen gobernadas por atlas.js, poblacion.js
   y transporte.js a través de los mismos controles (se les envía el evento change). */
(function(root){
  'use strict';
  const $=s=>document.querySelector(s),$$=(s,el=document)=>[...el.querySelectorAll(s)];
  const tools=$('#tools'),rail=$('#rail'),head=$('.tools-head'),title=$('#tools-title');
  if(!tools||!rail)return;
  const CATS={
    activas:{title:'Capas activas'},
    vias:{title:'Vías'},
    estaciones:{title:'Estaciones y transporte',group:true},
    demografia:{title:'Demografía',group:true},
    infraestructuras:{title:'Infraestructuras',group:true},
    territorio:{title:'Territorio',group:true},
    relieve:{title:'Perspectiva y relieve'},
    exportar:{title:'Consultas y exportación'}
  };
  const compact=matchMedia('(max-width: 760px), (max-height: 520px)');
  let current=tools.dataset.cat||'vias',opener=null,pending=false;

  const section=cat=>tools.querySelector('.cat[data-cat="'+cat+'"]');
  const switches=cat=>$$('input[role=switch]',section(cat));
  const nameOf=input=>input.closest('.layer').querySelector('.layer-name').textContent.trim();
  const button=cat=>rail.querySelector('button[data-cat="'+cat+'"]');

  function show(cat,{focus,open=true}={}){
    if(!CATS[cat])cat='vias';
    current=cat;tools.dataset.cat=cat;
    for(const s of $$('.cat',tools))s.hidden=s.dataset.cat!==cat;
    title.textContent=CATS[cat].title;
    if(open&&tools.hidden){tools.hidden=false;$('#toggle-panel')?.setAttribute('aria-expanded','true');}
    tools.querySelector('.tools-body').scrollTop=0;
    sync();
    if(focus)title.focus({preventScroll:true});
  }
  function close(){
    tools.hidden=true;$('#toggle-panel')?.setAttribute('aria-expanded','false');sync();
    const back=compact.matches?$('#toggle-panel'):(opener&&rail.contains(opener)?opener:button(current));
    back?.focus();opener=null;
  }
  function turnOff(input){input.checked=false;input.dispatchEvent(new Event('change',{bubbles:true}));}

  /* «Activas»: tema elegido y capas combinables encendidas, con su categoría. */
  function renderActive(){
    const list=$('#active-list');list.replaceChildren();
    const theme=root.AtlasCapas?.current?.(),name=root.AtlasConfig?.themes?.[theme]?.name;
    if(name){
      const li=document.createElement('li');li.className='active-theme';
      const text=document.createElement('span');text.className='layer-text';
      const n=document.createElement('span');n.className='layer-name';n.textContent=name;
      const s=document.createElement('small');s.textContent='Tema de las vías · uno a la vez';
      const b=document.createElement('button');b.type='button';b.className='ghost';b.textContent='Cambiar';b.onclick=()=>show('vias',{focus:true});
      text.append(n,s);li.append(text,b);list.append(li);
    }
    let n=0;
    for(const cat of Object.keys(CATS).filter(c=>CATS[c].group))for(const input of switches(cat).filter(i=>i.checked)){
      n++;
      const li=document.createElement('li'),label=document.createElement('label'),sw=document.createElement('input'),text=document.createElement('span'),nm=document.createElement('span'),sm=document.createElement('small');
      label.className='layer-main';sw.type='checkbox';sw.setAttribute('role','switch');sw.checked=true;
      sw.onchange=()=>{if(!sw.checked)turnOff(input);};
      text.className='layer-text';nm.className='layer-name';nm.textContent=nameOf(input);sm.textContent=CATS[cat].title;
      text.append(nm,sm);label.append(sw,text);li.className='layer is-on';li.append(label);list.append(li);
    }
    if(!n){const li=document.createElement('li');li.className='active-empty';li.textContent='No hay capas activas.';list.append(li);}
  }

  function sync(){
    pending=false;
    const open=!tools.hidden;
    let total=0;
    for(const cat of Object.keys(CATS).filter(c=>CATS[c].group)){
      const on=switches(cat).filter(i=>i.checked).length;total+=on;
      const badge=rail.querySelector('[data-count="'+cat+'"]');badge.hidden=!on;badge.textContent=on;
    }
    const all=rail.querySelector('[data-count="activas"]');all.hidden=!total;all.textContent=total;
    for(const b of $$('button[data-cat]',rail)){
      const sel=open&&b.dataset.cat===current;
      b.setAttribute('aria-expanded',String(sel));b.classList.toggle('is-selected',sel);
      const count=rail.querySelector('[data-count="'+b.dataset.cat+'"]');
      // Nombre accesible desde el contenido (sin aria-label, para que coincida con el texto visible · WCAG 2.5.3):
      // el número de la insignia se oculta a los lectores y se lee completo en un texto oculto tras la etiqueta.
      b.removeAttribute('aria-label');
      if(count)count.setAttribute('aria-hidden','true');
      let sr=b.querySelector('.rail-sr');if(!sr){sr=document.createElement('span');sr.className='rail-sr visually-hidden';b.querySelector('.rail-label').after(sr);}
      sr.textContent=count&&!count.hidden?', '+count.textContent+(count.textContent==='1'?' capa activa':' capas activas'):'';
    }
    // Resumen y acción de grupo (solo capas conmutables; las facetas y el tema no cuentan).
    const summary=$('#tools-summary'),text=$('#tools-count'),off=$('#tools-off');
    if(CATS[current].group){
      const list=switches(current),on=list.filter(i=>i.checked).length;
      text.textContent=on+' de '+list.length+(list.length===1?' capa activa':' capas activas');off.hidden=!on;summary.hidden=false;
    }else if(current==='activas'){
      text.textContent=total?(total===1?'1 capa activa':total+' capas activas'):'Ninguna capa activa';off.hidden=!total;summary.hidden=false;
    }else if(current==='vias'){
      const name=root.AtlasConfig?.themes?.[root.AtlasCapas?.current?.()]?.name;
      text.textContent=name?'Tema: '+name:'Elige un tema';off.hidden=true;summary.hidden=false;
    }else summary.hidden=true;
    for(const l of $$('.layer',tools))l.classList.toggle('is-on',!!l.querySelector('input[role=switch]')?.checked);
    // Chevrón de Población: solo con la capa encendida.
    const more=$('.layer-more'),pop=$('#population-toggle');
    if(more){more.hidden=!pop.checked;$('#population-more').hidden=pop.checked&&more.getAttribute('aria-expanded')==='false';}
    if(current==='activas')renderActive();
  }
  const later=()=>{if(!pending){pending=true;setTimeout(sync,0);}};

  $('#tools-off').onclick=()=>{
    const cats=current==='activas'?Object.keys(CATS).filter(c=>CATS[c].group):[current];
    for(const cat of cats)for(const i of switches(cat).filter(i=>i.checked))turnOff(i);
    sync();
  };
  $('.layer-more')?.addEventListener('click',e=>{
    const b=e.currentTarget,open=b.getAttribute('aria-expanded')!=='true';
    b.setAttribute('aria-expanded',String(open));$('#population-more').hidden=!open;
  });
  rail.addEventListener('click',e=>{
    const b=e.target.closest('button[data-cat]');if(!b)return;
    if(!tools.hidden&&current===b.dataset.cat&&!compact.matches){opener=b;close();return;}
    opener=b;show(b.dataset.cat,{focus:!compact.matches});
  });
  $('#tools-close').onclick=close;
  tools.addEventListener('change',later);
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||e.defaultPrevented||compact.matches||tools.hidden||!$('#info').hidden)return;
    if(tools.contains(document.activeElement)||rail.contains(document.activeElement)){e.preventDefault();close();}
  });
  // Cualquier código que pliegue o despliegue el panel (ficha en móvil, botón «Capas») actualiza la barra.
  new MutationObserver(()=>{later();root.AtlasRenderLegend?.();}).observe(tools,{attributes:true,attributeFilter:['hidden']});

  // En móvil la barra pasa a ser una banda horizontal dentro del panel.
  function place(){
    if(compact.matches){if(rail.parentElement!==tools)head.after(rail);}
    else if(rail.parentElement===tools)tools.before(rail);
  }
  compact.addEventListener?.('change',place);place();
  show(current,{open:false});

  root.AtlasPanel={sync:later,show};
})(window);
