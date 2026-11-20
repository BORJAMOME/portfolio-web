/* Perfil de elevación de una ruta.
   Lee las cotas del MDT del IGN (teselas Terrarium de terrain-ign/, las mismas del relieve 3D) a lo largo del trazado
   y dibuja un perfil en SVG sincronizado con el mapa: al recorrer el perfil se marca el punto en el mapa, y al pasar
   el cursor por la ruta en el mapa se marca en el perfil. Es el relieve bajo el trazado, no la cota de la vía. */
(function(root){
  'use strict';
  const SVGNS='http://www.w3.org/2000/svg';
  const nf=new Intl.NumberFormat('es-ES');
  const nf1=new Intl.NumberFormat('es-ES',{maximumFractionDigits:1,minimumFractionDigits:1});
  const manifest=root.IGN_TERRAIN_MANIFEST;
  const available=new Set(manifest?.tiles||[]);
  const maxZoom=manifest?.maxzoom??12;

  /* ── cotas ── */
  const tiles=new Map();
  function tile(key){
    if(tiles.has(key)){const cached=tiles.get(key);tiles.delete(key);tiles.set(key,cached);return cached;}
    const p=(async()=>{
      const response=await fetch('terrain-ign/'+key+'.png');
      if(!response.ok)throw new Error('MDT no disponible');
      const bitmap=await createImageBitmap(await response.blob());
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);bitmap.close?.();
      const rgba=ctx.getImageData(0,0,256,256).data,out=new Float32Array(65536);
      for(let i=0;i<65536;i++)out[i]=rgba[i*4]*256+rgba[i*4+1]+rgba[i*4+2]/256-32768;
      return out;
    })();
    tiles.set(key,p);
    // Un perfil largo no debe retener indefinidamente todos los DEM visitados.
    if(tiles.size>48)tiles.delete(tiles.keys().next().value);
    p.catch(()=>{if(tiles.get(key)===p)tiles.delete(key);});
    return p;
  }
  // Posición en píxeles de Web Mercator para un zoom dado.
  function pixel(lng,lat,z){
    const n=256*2**z,s=Math.sin(lat*Math.PI/180);
    return [(lng+180)/360*n,(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n];
  }
  // Mayor zoom con tesela propia en ese punto (z12 en Guadarrama, z8 en el resto).
  function zoomAt(lng,lat){
    for(let z=maxZoom;z>=0;z--){const [px,py]=pixel(lng,lat,z);if(available.has(z+'/'+Math.floor(px/256)+'/'+Math.floor(py/256)))return z;}
    return -1;
  }
  async function heights(points){
    const zooms=points.map(([lng,lat])=>zoomAt(lng,lat));
    const keys=new Set();
    const pos=points.map(([lng,lat],i)=>{
      const z=zooms[i];if(z<0)return null;
      const [px,py]=pixel(lng,lat,z),x=px-0.5,y=py-0.5,ix=Math.floor(x),iy=Math.floor(y);
      const corners=[[ix,iy],[ix+1,iy],[ix,iy+1],[ix+1,iy+1]].map(([cx,cy])=>{
        const key=z+'/'+Math.floor(cx/256)+'/'+Math.floor(cy/256);
        // Si la tesela vecina no existe, se usa el píxel del borde de la propia.
        if(!available.has(key)){const own=z+'/'+Math.floor(px/256)+'/'+Math.floor(py/256);return [own,Math.min(255,Math.max(0,cx-Math.floor(px/256)*256)),Math.min(255,Math.max(0,cy-Math.floor(py/256)*256))];}
        return [key,((cx%256)+256)%256,((cy%256)+256)%256];
      });
      corners.forEach(c=>keys.add(c[0]));
      return {corners,fx:x-ix,fy:y-iy};
    });
    const data=new Map();
    await Promise.all([...keys].map(k=>tile(k).then(d=>data.set(k,d),()=>{})));
    return pos.map(p=>{
      if(!p)return null;
      const v=p.corners.map(([k,cx,cy])=>data.get(k)?.[cy*256+cx]);
      if(v.some(x=>x===undefined))return null;
      return (v[0]*(1-p.fx)+v[1]*p.fx)*(1-p.fy)+(v[2]*(1-p.fx)+v[3]*p.fx)*p.fy;
    });
  }

  /* ── muestreo a lo largo del trazado ── */
  function metres(a,b){const k=Math.cos((a[1]+b[1])/2*Math.PI/180);return Math.hypot((a[0]-b[0])*k,a[1]-b[1])*111320;}
  // parts: [{coords:[[lng,lat],…], gap:true|false}]. Los tramos «gap» (cambio de estación por la ciudad) cuentan
  // distancia pero no se dibujan.
  function sample(parts){
    const total=parts.reduce((s,p)=>s+p.coords.slice(1).reduce((t,c,i)=>t+metres(p.coords[i],c),0),0);
    const step=Math.max(60,total/420);
    const out=[];let d=0;
    for(const part of parts){
      const cs=part.coords;if(cs.length<2)continue;
      let next=0;
      out.push({d,c:cs[0],gap:part.gap,start:true});
      for(let i=1;i<cs.length;i++){
        const seg=metres(cs[i-1],cs[i]);
        while(next+step<seg){next+=step;const t=next/seg;out.push({d:d+next,c:[cs[i-1][0]+(cs[i][0]-cs[i-1][0])*t,cs[i-1][1]+(cs[i][1]-cs[i-1][1])*t],gap:part.gap});}
        d+=seg;next-=seg;
      }
      out.push({d,c:cs.at(-1),gap:part.gap});
    }
    return {samples:out,total:d};
  }
  async function build(parts,marks=[]){
    const {samples,total}=sample(parts);
    if(!Number.isFinite(total)||total<=0||samples.length<2)return null;
    const h=await heights(samples.map(s=>s.c));
    samples.forEach((s,i)=>{s.h=s.gap?null:h[i];s.z=zoomAt(s.c[0],s.c[1]);});
    const valid=samples.filter(s=>s.h!==null&&s.h!==undefined);
    if(valid.length<2)return null;
    const top=valid.reduce((a,b)=>b.h>a.h?b:a),low=valid.reduce((a,b)=>b.h<a.h?b:a);
    // Cada marca (estación) se sitúa en la muestra más próxima.
    const placed=marks.map(m=>{let best=null,bm=Infinity;for(const s of samples){const x=metres(s.c,m.c);if(x<bm){bm=x;best=s;}}return best&&bm<3000?{...m,d:best.d}:null;}).filter(Boolean);
    const detail=valid.filter(s=>s.z>=12).length/valid.length;
    return {samples,total,top,low,marks:placed,detail};
  }

  /* ── marcador en el mapa ── */
  let mapRef=null,current=null,setCursorRef=null,disposeActive=null,requestRevision=0;
  function ensureMarker(map){
    if(map.getSource('profile-cursor'))return;
    map.addSource('profile-cursor',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'profile-cursor',type:'circle',source:'profile-cursor',paint:{'circle-radius':7,'circle-color':'#1d2638','circle-stroke-color':'#fbfbfb','circle-stroke-width':3,'circle-pitch-alignment':'viewport'}});
  }
  function mark(c){
    if(!mapRef?.getSource('profile-cursor'))return;
    mapRef.getSource('profile-cursor').setData(c?{type:'Feature',properties:{},geometry:{type:'Point',coordinates:c}}:{type:'FeatureCollection',features:[]});
  }
  function onMapMove(event){
    if(!current||!setCursorRef||!mapRef.getLayer('route-line'))return;
    const hit=mapRef.queryRenderedFeatures(event.point,{layers:['route-line']});
    if(!hit.length){setCursorRef(-1,false);return;}
    const ll=[event.lngLat.lng,event.lngLat.lat];
    let best=-1,bm=Infinity;current.samples.forEach((s,i)=>{if(s.h==null)return;const m=metres(s.c,ll);if(m<bm){bm=m;best=i;}});
    if(best>=0)setCursorRef(best,false);
  }
  function attach(map){
    if(mapRef===map)return;
    mapRef?.off('mousemove',onMapMove);
    mapRef=map;
    map.on('mousemove',onMapMove);
  }

  /* ── gráfico ── */
  function svg(name,attrs={}){const e=document.createElementNS(SVGNS,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;}
  function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  const km=m=>m<10000?nf1.format(m/1000)+' km':nf.format(Math.round(m/1000))+' km';
  const alt=h=>nf.format(Math.round(h))+' m';
  function niceStep(range,count=3){const raw=range/count,p=10**Math.floor(Math.log10(raw)),n=raw/p;return (n<1.5?1:n<3.5?2:n<7.5?5:10)*p;}
  function nearestMark(profile,d){let best=null,bm=Infinity;for(const m of profile.marks){const x=Math.abs(m.d-d);if(x<bm){bm=x;best=m;}}return best&&bm<Math.max(4000,profile.total*0.03)?best:null;}

  function render(profile,{title='Perfil de elevación'}={}){
    const samples=profile.samples;
    const idx=samples.map((s,i)=>s.h!=null?i:-1).filter(i=>i>=0);
    const box=el('section','profile');
    const head=el('div','profile-head');head.append(el('h3',null,title));
    box.append(head);
    const facts=el('p','profile-facts');
    // Sin desnivel acumulado: sumaría el relieve sobre túneles y valles, no lo que sube el tren.
    const ends=idx.length?[samples[idx[0]],samples[idx.at(-1)]]:[];
    const first=profile.marks[0],last=profile.marks.at(-1);
    const topNear=nearestMark(profile,profile.top.d);
    facts.textContent=(first&&last?'Terreno cerca de '+first.name+': '+alt(ends[0].h)+' · cerca de '+last.name+': '+alt(ends[1].h)+'. ':'')+
      'El terreno sobre el trazado llega a '+alt(profile.top.h)+(topNear?' cerca de '+topNear.name:'')+'.';
    box.append(facts);
    const wrap=el('div','profile-chart');
    const readout=el('p','profile-readout');readout.setAttribute('aria-live','polite');
    box.append(wrap,readout);
    // MDT detallado (~30 m) en Guadarrama, Pajares, Despeñaperros y Contreras; ~470 m en el resto.
    const res=profile.detail>0.9?'unos 30 m (MDT detallado de este corredor)':profile.detail>0.05?'unos 30 m en los puertos de montaña con MDT detallado y unos 470 m en el resto':'unos 470 m entre puntos del modelo';
    box.append(el('p','muted profile-note','Relieve del terreno bajo el trazado (MDT del IGN), no la cota de la vía: en túneles y viaductos la vía pasa por debajo o por encima del terreno, y las pendientes del perfil no son las de la línea. Muestreo horizontal aproximado: '+res+'; no indica precisión altimétrica. Las teselas históricas no distinguen NoData de altitud cero. Escala vertical exagerada.'));

    let cursor=-1,svgEl,geom,disposed=false;
    function draw(){
      if(disposed)return;
      const W=Math.max(220,Math.round(wrap.clientWidth||280)),H=W<300?132:150,L=40,R=8,T=10,B=24;
      let lo=Math.min(...idx.map(i=>samples[i].h)),hi=Math.max(...idx.map(i=>samples[i].h));
      const pad=Math.max(40,(hi-lo)*0.12);lo=Math.max(lo<0?lo:0,Math.floor((lo-pad)/50)*50);hi=Math.ceil((hi+pad)/50)*50;
      const X=d=>L+(W-L-R)*d/profile.total,Y=h=>T+(H-T-B)*(1-(h-lo)/(hi-lo));
      geom={X,Y,W,H,L,R,T,B};
      svgEl=svg('svg',{viewBox:`0 0 ${W} ${H}`,width:W,height:H,class:'profile-svg',tabindex:'0',role:'slider',
        'aria-label':'Perfil de elevación: recorre el perfil con las flechas','aria-valuemin':'0','aria-valuemax':String(Math.round(profile.total/1000))});
      const gAxes=svg('g',{class:'pf-axes'});
      const ys=niceStep(hi-lo);
      for(let v=Math.ceil(lo/ys)*ys;v<=hi;v+=ys){
        gAxes.append(svg('line',{x1:L,x2:W-R,y1:Y(v),y2:Y(v),class:'pf-grid'}));
        const t=svg('text',{x:L-6,y:Y(v)+4,'text-anchor':'end',class:'pf-tick'});t.textContent=nf.format(v);gAxes.append(t);
      }
      // Una etiqueta de km cada ~70 px; la primera lleva la unidad y la última no se pinta si choca con la anterior.
      const xs=niceStep(profile.total/1000,Math.max(2,Math.floor((W-L-R)/70)))*1000;
      for(let v=0;v<=profile.total+1;v+=xs){
        const last=v+xs>profile.total+1,x=X(v);
        if(last&&v>0&&W-R-x<10&&X(v)-X(v-xs)<56)continue;
        const t=svg('text',{x,y:H-6,'text-anchor':v===0?'start':x>W-R-24?'end':'middle',class:'pf-tick'});t.textContent=v===0?'0 km':nf.format(Math.round(v/1000));gAxes.append(t);
      }
      const unit=svg('text',{x:4,y:T+4,class:'pf-tick'});unit.textContent='m';gAxes.append(unit);
      svgEl.append(gAxes);
      // Área y línea, cortadas en los cambios de estación por la ciudad.
      const runs=[];let run=[];
      samples.forEach(s=>{if(s.h==null||(s.start&&run.length)){if(run.length>1)runs.push(run);run=[];}if(s.h!=null)run.push(s);});
      if(run.length>1)runs.push(run);
      for(const r of runs){
        const line=r.map((s,i)=>(i?'L':'M')+X(s.d).toFixed(1)+' '+Y(s.h).toFixed(1)).join('');
        svgEl.append(svg('path',{d:line+`L${X(r.at(-1).d).toFixed(1)} ${H-B}L${X(r[0].d).toFixed(1)} ${H-B}Z`,class:'pf-area'}));
        svgEl.append(svg('path',{d:line,class:'pf-line'}));
      }
      // Estaciones: origen, transbordos y destino con nombre; paradas intermedias como marcas.
      for(const m of profile.marks){
        const x=X(m.d);
        svgEl.append(svg('line',{x1:x,x2:x,y1:H-B,y2:H-B+(m.major?6:3),class:m.major?'pf-mark major':'pf-mark'}));
        if(m.major)svgEl.append(svg('circle',{cx:x,cy:H-B,r:3,class:'pf-dot'}));
      }
      const g=svg('g',{class:'pf-cursor'});g.append(svg('line',{class:'pf-cline'}),svg('circle',{r:4.5,class:'pf-cdot'}));
      g.setAttribute('visibility','hidden');svgEl.append(g);
      wrap.replaceChildren(svgEl);
      svgEl.addEventListener('pointermove',e=>{const r=svgEl.getBoundingClientRect();pick((e.clientX-r.left)*W/r.width);});
      svgEl.addEventListener('pointerdown',e=>{const r=svgEl.getBoundingClientRect();pick((e.clientX-r.left)*W/r.width);});
      svgEl.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')clear();});
      svgEl.addEventListener('keydown',e=>{
        const n=idx.length,pos=Math.max(0,idx.indexOf(cursor)),big=Math.max(1,Math.round(n/10)),small=Math.max(1,Math.round(n/100));
        const to={ArrowRight:pos+small,ArrowUp:pos+small,ArrowLeft:pos-small,ArrowDown:pos-small,PageUp:pos+big,PageDown:pos-big,Home:0,End:n-1}[e.key];
        if(to===undefined)return;e.preventDefault();set(idx[Math.max(0,Math.min(n-1,to))],true);
      });
      svgEl.addEventListener('focus',()=>{if(cursor<0)set(idx[0],true);});
      if(cursor>=0)set(cursor,false);
    }
    function pick(x){
      const d=(x-geom.L)/(geom.W-geom.L-geom.R)*profile.total;
      let best=idx[0];for(const i of idx)if(Math.abs(samples[i].d-d)<Math.abs(samples[best].d-d))best=i;
      set(best,true);
    }
    function set(i,toMap){
      if(disposed)return;
      if(i<0){clear();return;}
      cursor=i;const s=samples[i];if(!s||!svgEl)return;
      const g=svgEl.querySelector('.pf-cursor'),x=geom.X(s.d),y=geom.Y(s.h);
      const l=g.querySelector('line');l.setAttribute('x1',x);l.setAttribute('x2',x);l.setAttribute('y1',geom.T);l.setAttribute('y2',geom.H-geom.B);
      const c=g.querySelector('circle');c.setAttribute('cx',x);c.setAttribute('cy',y);g.setAttribute('visibility','visible');
      const near=nearestMark(profile,s.d);
      const text='Km '+nf1.format(s.d/1000)+' · '+alt(s.h)+(near?' · cerca de '+near.name:'');
      readout.textContent=text;svgEl.setAttribute('aria-valuenow',String(Math.round(s.d/1000)));svgEl.setAttribute('aria-valuetext',text);
      mark(s.c);
    }
    function clear(){cursor=-1;svgEl?.querySelector('.pf-cursor')?.setAttribute('visibility','hidden');readout.textContent='';mark(null);}
    readout.textContent='';
    // El ancho real solo se conoce cuando la ficha está en pantalla.
    const ro=new ResizeObserver(()=>{const w=Math.round(wrap.clientWidth);if(w&&w!==geom?.W)draw();});
    ro.observe(wrap);
    requestAnimationFrame(draw);
    current=profile;setCursorRef=(i,toMap)=>set(i,toMap);
    const dispose=()=>{
      if(disposed)return;disposed=true;ro.disconnect();
      if(disposeActive===dispose){current=null;setCursorRef=null;disposeActive=null;mark(null);}
    };
    disposeActive=dispose;
    box.addEventListener('profile-dispose',dispose,{once:true});
    return box;
  }

  /* API: crea el perfil de una ruta y devuelve el bloque para la ficha (o null si no hay relieve). */
  async function forRoute(map,parts,marks,opts){
    if(!available.size)return null;
    const revision=++requestRevision;
    attach(map);
    const profile=await build(parts,marks);
    if(!profile||revision!==requestRevision||opts?.isCurrent&&!opts.isCurrent())return null;
    disposeActive?.();
    // Después de dibujar la ruta, para que el marcador quede por encima de su trazo.
    ensureMarker(map);map.moveLayer('profile-cursor');
    return render(profile,opts);
  }
  function clear(){requestRevision++;disposeActive?.();current=null;setCursorRef=null;mark(null);mapRef?.off('mousemove',onMapMove);mapRef=null;}
  root.AtlasProfile={forRoute,clear,build};
})(window);
