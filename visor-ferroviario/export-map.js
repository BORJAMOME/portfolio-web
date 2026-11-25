(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 function waitMap(map){return new Promise((resolve,reject)=>{
   let settled=false;const errors=new Map();
   const error=e=>{const message=String(e.error?.message||'Error de capa');if(e.error?.name==='AbortError'||/abort|Fuera de cobertura del MDT IGN/i.test(message))return;errors.set(e.sourceId||'map',message);};
   const source=e=>{if(e.sourceDataType==='content'&&e.isSourceLoaded)errors.delete(e.sourceId);};
   const timer=setTimeout(()=>finish(new Error('Las capas no han terminado de cargar. Reintenta cuando la conexión esté disponible.')),60000);
   function finish(e){if(settled)return;settled=true;clearTimeout(timer);map.off('idle',idle);map.off('error',error);map.off('sourcedata',source);e?reject(e):resolve();}
   function idle(){finish(errors.size?new Error([...errors.values()][0]):null);}
   map.on('error',error);map.on('sourcedata',source);map.once('idle',idle);map.triggerRepaint();
 });}
 // The same screen-space arrow geometry is used in raster images and vector PDF.
 function northArrow(bearing){const a=-bearing*Math.PI/180,c=Math.cos(a),s=Math.sin(a),point=(x,y)=>[x*c-y*s,x*s+y*c];return {lines:[[[0,5],[0,-3]],[[0,-3],[-1.5,0]],[[0,-3],[1.5,0]]].map(line=>line.map(([x,y])=>point(x,y))),label:point(-1,-5)};}
 const uniformScale=(terrain,pitch)=>!terrain&&Math.abs(pitch)<0.01;
 /* Leyenda de la exportación: el mismo contenido que la leyenda de pantalla.
    Líneas con su trazo (discontinuo, punteado, doble o grueso), puntos activos (estación, puerto,
    aeropuerto) y círculos de población anidados con la escala del mapa exportado. Los rellenos son
    colores sólidos ya mezclados con el papel para que el PDF y el PNG coincidan. */
 const POINTS=[['stations','#1D2638','Estación Renfe',()=>document.querySelector('[data-layer="stations"]')?.checked],
   ['ports','#0B4F6C','Puerto de interés general',()=>$('ports-toggle')?.checked],
   ['airports','#3D3A8C','Aeropuerto de interés general',()=>$('airports-toggle')?.checked]];
 const BUBBLE={fill:'#DBCFD8',stroke:'#99768F'};
 const dashOf=item=>item.pattern==='project'?[.4,1.1]:item.dash?[2,1.2]:null;
 const sampleLabel=v=>v>=1e6?(v/1e6).toLocaleString('es-ES')+(v===1e6?' millón':' millones'):v.toLocaleString('es-ES');
 function population(map,pixelRatio,scale){
   const C=root.AtlasConfig?.population;if(!C||!$('population-toggle')?.checked)return null;
   // Radio en milímetros: radio en píxeles CSS del mapa × píxeles de salida por píxel CSS ÷ píxeles por mm.
   return C.samples.map(v=>({value:v,label:sampleLabel(v),r:root.AtlasConfig.radius(v,map.getZoom())*pixelRatio/scale}));
 }
 function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 async function run({map,dataset,filters,filtered,label,terrainEnabled,legendItems,themeName}){
   const button=$('export-map'),message=$('action-message');button.disabled=true;message.textContent='Preparando cartografía y etiquetas…';
   let clone,host;
   try{
     if(!map?.isStyleLoaded())throw new Error('Espera a que termine de cargar el mapa.');
     if($('export-legend').checked&&legendItems&&legendItems.length>12)throw new Error('Selecciona hasta 12 líneas para obtener una leyenda completa y legible.');
     // Snapshot the camera: navigation while external resources load must not alter the output.
     const camera={center:map.getCenter(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()};
     const scaleIsUniform=uniformScale(terrainEnabled,camera.pitch);
     const selectedRail=filtered.filter(f=>map.getFeatureState({source:'rail',id:f.id}).selected).map(f=>f.id);
     const format=$('export-format').value, paper=$('export-paper').value,orientation=$('export-orientation').value;
     const dpi=Number($('export-quality').value),long=paper==='A3'?420:297,short=paper==='A3'?297:210;
     const mmW=orientation==='landscape'?long:short,mmH=orientation==='landscape'?short:long;
     const W=Math.round(mmW*dpi/25.4),H=Math.round(mmH*dpi/25.4),margin=Math.round(12*dpi/25.4);
     const original=map.getCanvas(),ratio=original.width/original.height;
     // Hueco para la leyenda de población: radio máximo con el ancho que tendría el mapa sin ella (cota superior).
     const popC=root.AtlasConfig?.population,popOn=$('export-legend').checked&&popC&&$('population-toggle')?.checked;
     const mapMm=Math.min(mmW-24,(mmH-24-70)*ratio);
     const popMm=popOn?2*Math.max(...popC.samples.map(v=>root.AtlasConfig.radius(v,map.getZoom())))*mapMm/map.getContainer().clientWidth+9:0;
     const areaW=W-2*margin,areaH=H-2*margin- Math.round((70+popMm)*dpi/25.4);
     const width=Math.min(areaW,areaH*ratio),height=width/ratio;
     if(!Number.isFinite(width)||width<=0||height<=0)throw new Error('No hay espacio para el mapa. Reduce el zoom de población, cambia la orientación o utiliza A3.');
     host=document.createElement('div');Object.assign(host.style,{position:'fixed',left:'-20000px',top:'0',width:map.getContainer().clientWidth+'px',height:map.getContainer().clientHeight+'px'});document.body.append(host);
     const pixelRatio=width/map.getContainer().clientWidth;
     clone=new maplibregl.Map({container:host,style:map.getStyle(),...camera,padding:map.getPadding?.(),interactive:false,attributionControl:false,pixelRatio,canvasContextAttributes:{preserveDrawingBuffer:true}});
     clone.on('styleimagemissing',event=>{const original=map.getImage(event.id);if(original&&!clone.hasImage(event.id))clone.addImage(event.id,original.data,{pixelRatio:original.pixelRatio,stretchX:original.stretchX,stretchY:original.stretchY,content:original.content});});
     await waitMap(clone);
     // Feature state is not serialized with the style.
     for(const id of selectedRail)clone.setFeatureState({source:'rail',id},{selected:true});
     await new Promise(resolve=>{clone.once('render',resolve);clone.triggerRepaint();});
     const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');
     const scale=dpi/25.4, mapX=(W-width)/2,mapY=margin+15*scale;
     ctx.fillStyle='#FBFBFB';ctx.fillRect(0,0,W,H);ctx.fillStyle='#1D2638';ctx.font=`600 ${5*scale}px sans-serif`;
     const title=$('export-title').value.trim()||'Red ferroviaria de España';ctx.fillText(title,margin,margin+5*scale,W-2*margin);
     ctx.font=`${2.5*scale}px sans-serif`;ctx.fillText(new Date().toLocaleDateString('es-ES')+' · '+(terrainEnabled?'Relieve 3D':'Vista 2D'),margin,margin+10*scale);
     ctx.drawImage(clone.getCanvas(),mapX,mapY,width,height);
     let y=mapY+height+6*scale;const legend=[];const themeMode=legendItems?'theme':'gauge';
     if($('export-legend').checked&&themeMode==='gauge'&&document.querySelector('[data-layer="rail"]')?.checked){for(const value of new Set(filtered.map(f=>AtlasFilters.value(f,'gauge')))){const style=AtlasCartography.style(value);legend.push(style);}}
     if($('export-legend').checked&&themeMode!=='gauge'){for(const item of legendItems){legend.push(item);}}
     if($('export-legend').checked)legend.push(...(root.AtlasDemography?.legendItems()||[]).map(i=>({...i,fill:i.fill!==false})),...(root.AtlasInfrastructure?.legendItems()||[]));
     const points=$('export-legend').checked?POINTS.filter(p=>p[3]()):[];
     const sizes=$('export-legend').checked?population(map,pixelRatio,scale):null;
     let x=margin;ctx.font=`${2.6*scale}px sans-serif`;
     const place=length=>{if(x+length>W-margin){x=margin;y+=5*scale;}};
     for(const item of legend){const length=ctx.measureText(item.name).width+13*scale;place(length);
       ctx.strokeStyle=item.color;ctx.setLineDash((dashOf(item)||[]).map(v=>v*scale));ctx.lineCap=item.pattern==='project'?'round':'butt';
       if(item.fill){ctx.fillStyle=item.color;ctx.fillRect(x,y-1.5*scale,7*scale,3*scale);}
       else if(item.double){ctx.lineWidth=.45*scale;for(const d of [-.6,.6]){ctx.beginPath();ctx.moveTo(x,y+d*scale);ctx.lineTo(x+7*scale,y+d*scale);ctx.stroke();}}
       else{ctx.lineWidth=(item.thick?1.8:1)*scale;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+7*scale,y);ctx.stroke();}
       ctx.setLineDash([]);ctx.lineCap='butt';ctx.fillStyle='#1D2638';ctx.fillText(item.name,x+9*scale,y+scale);x+=length;}
     for(const [,color,name] of points){const length=ctx.measureText(name).width+9*scale;place(length);
       ctx.fillStyle=color;ctx.strokeStyle='#FBFBFB';ctx.lineWidth=.35*scale;ctx.beginPath();ctx.arc(x+1.8*scale,y,1.6*scale,0,2*Math.PI);ctx.fill();ctx.stroke();
       ctx.fillStyle='#1D2638';ctx.fillText(name,x+5*scale,y+scale);x+=length;}
     if(sizes){
       const R=Math.max(...sizes.map(s=>s.r)),top=y+5*scale,base=top+(3+Math.max(2*R,9))*scale,cx=margin+R*scale,lx=margin+(2*R+5)*scale;
       ctx.fillStyle='#1D2638';ctx.font=`600 ${2.6*scale}px sans-serif`;ctx.fillText('Población (área ∝ habitantes)',margin,top);ctx.font=`${2.4*scale}px sans-serif`;
       let prev=-Infinity;
       for(const s of sizes){ctx.fillStyle=BUBBLE.fill;ctx.strokeStyle=BUBBLE.stroke;ctx.lineWidth=.25*scale;ctx.beginPath();ctx.arc(cx,base-s.r*scale,s.r*scale,0,2*Math.PI);ctx.fill();ctx.stroke();}
       for(const s of sizes){const yTop=base-2*s.r*scale,ly=Math.max(yTop+3*scale,prev+3*scale);prev=ly;
         ctx.strokeStyle='#586278';ctx.lineWidth=.15*scale;ctx.beginPath();ctx.moveTo(cx,yTop);ctx.lineTo(lx-scale,yTop);ctx.lineTo(lx-scale,ly-.8*scale);ctx.lineTo(lx,ly-.8*scale);ctx.stroke();
         ctx.fillStyle='#1D2638';ctx.fillText(s.label,lx+.5*scale,ly);}
       y=Math.max(base,prev)+2*scale;x=margin;
     }
     const metrics=AtlasCartography.metrics(filtered);y+=7*scale;
     const query=themeMode!=='gauge'?(themeName||'Tema')+' · '+legendItems.map(i=>i.name).join(', '):Object.entries(filters).filter(([,v])=>v.length).map(([d,v])=>v.map(a=>label(d,a)).join(' / ')).join(' · ')||'Todos los tramos';
     function wrap(text,fontSize=2.5){ctx.font=`${fontSize*scale}px sans-serif`;let line='';for(const word of text.split(' ')){if(ctx.measureText(line+' '+word).width>W-2*margin){ctx.fillText(line,margin,y);y+=4*scale;line=word;}else line+=(line?' ':'')+word;}ctx.fillText(line,margin,y);y+=5*scale;}
     if($('export-metrics').checked){wrap(query);if(themeMode==='gauge')wrap(`${metrics.sections.toLocaleString('es')} tramos en consulta · ${Math.round(metrics.km).toLocaleString('es')} km de ejes IGN con atributos (no es la longitud oficial)`);}
     wrap('© IGN/SCNE CC BY 4.0 · Renfe Operadora CC BY 4.0 · EuroGeographics / Eurostat GISCO · Natural Earth',2.2);
     const exportStyle=clone.getStyle(),activeSources=new Set(exportStyle.layers.filter(l=>l.layout?.visibility!=='none').map(l=>l.source));if(clone.getTerrain()?.source)activeSources.add(clone.getTerrain().source);const credits=[...new Set(Object.entries(exportStyle.sources).filter(([id])=>activeSources.has(id)).map(([,s])=>s.attribution).filter(Boolean))].map(t=>{const el=document.createElement('span');el.innerHTML=t;return el.textContent;}).join(' · ');
     wrap(credits,2);
     if(y>H-margin)throw new Error('La composición excede el papel. Elige A3 o desactiva el resumen de consulta.');
     // North arrow follows map bearing. A tilted map has no uniform metric scale.
     const arrow=northArrow(camera.bearing),arrowX=mapX+width-10*scale,arrowY=mapY+11*scale;
     ctx.save();ctx.translate(arrowX,arrowY);ctx.strokeStyle='#1D2638';ctx.lineWidth=.5*scale;ctx.beginPath();
     for(const [[x1,y1],[x2,y2]] of arrow.lines){ctx.moveTo(x1*scale,y1*scale);ctx.lineTo(x2*scale,y2*scale);}ctx.stroke();ctx.font=`${2.6*scale}px sans-serif`;ctx.fillText('N',arrow.label[0]*scale,arrow.label[1]*scale);ctx.restore();
     let scaleLabel='',scaleLength=0;
     if(scaleIsUniform){const metersPerPixel=40075016.686*Math.cos(camera.center.lat*Math.PI/180)/(512*2**camera.zoom);const target=metersPerPixel*map.getContainer().clientWidth*.15;const power=10**Math.floor(Math.log10(target));const distance=[5,2,1].map(n=>n*power).find(n=>n<=target)||power/2;const length=distance/metersPerPixel*pixelRatio;scaleLength=length/scale;scaleLabel=distance>=1000?distance/1000+' km':distance+' m';ctx.strokeStyle='#1D2638';ctx.lineWidth=.5*scale;ctx.beginPath();ctx.moveTo(mapX+5*scale,mapY+height-6*scale);ctx.lineTo(mapX+5*scale+length,mapY+height-6*scale);ctx.stroke();ctx.font=`${2.3*scale}px sans-serif`;ctx.fillText(scaleLabel,mapX+5*scale,mapY+height-8*scale);}
     else{ctx.fillStyle='#1D2638';ctx.font=`${2.3*scale}px sans-serif`;ctx.fillText('Perspectiva: escala variable',mapX+5*scale,mapY+height-6*scale);}
     if(format==='PDF'){
       const pdf=new jspdf.jsPDF({orientation,unit:'mm',format:paper.toLowerCase(),compress:true});
       pdf.setFillColor('#FBFBFB');pdf.rect(0,0,mmW,mmH,'F');pdf.setTextColor('#1D2638');
       pdf.setFont('helvetica','bold');pdf.setFontSize(15);pdf.text(pdf.splitTextToSize(title,mmW-24),12,17);
       pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.text(new Date().toLocaleDateString('es-ES')+' · '+(terrainEnabled?'Relieve 3D':'Vista 2D'),12,23);
       pdf.addImage(clone.getCanvas().toDataURL('image/png'),'PNG',mapX/scale,mapY/scale,width/scale,height/scale);
       if(scaleLabel){pdf.setDrawColor('#1D2638');pdf.setLineWidth(.5);pdf.line(mapX/scale+5,(mapY+height)/scale-6,mapX/scale+5+scaleLength,(mapY+height)/scale-6);pdf.setFontSize(7);pdf.text(scaleLabel,mapX/scale+5,(mapY+height)/scale-8);}
       pdf.setDrawColor('#1D2638');pdf.setLineWidth(.5);
       for(const [[x1,y1],[x2,y2]] of arrow.lines)pdf.line(arrowX/scale+x1,arrowY/scale+y1,arrowX/scale+x2,arrowY/scale+y2);
       pdf.setFontSize(8);pdf.text('N',arrowX/scale+arrow.label[0],arrowY/scale+arrow.label[1]);
       if(!scaleIsUniform){pdf.setFontSize(7);pdf.text('Perspectiva: escala variable',mapX/scale+5,(mapY+height)/scale-6);}
       let py=(mapY+height)/scale+6,px=12;pdf.setFontSize(8);
       const placePdf=len=>{if(px+len>mmW-12){px=12;py+=5;}};
       for(const item of legend){const len=pdf.getTextWidth(item.name)+13;placePdf(len);pdf.setDrawColor(item.color);
         pdf.setLineDashPattern(dashOf(item)||[],0);pdf.setLineCap(item.pattern==='project'?'round':'butt');
         if(item.fill){pdf.setFillColor(item.color);pdf.rect(px,py-2.5,7,3,'F');}
         else if(item.double){pdf.setLineWidth(.4);pdf.line(px,py-1.6,px+7,py-1.6);pdf.line(px,py-.4,px+7,py-.4);}
         else{pdf.setLineWidth(item.thick?1.6:.8);pdf.line(px,py-1,px+7,py-1);}
         pdf.setLineDashPattern([],0);pdf.setLineCap('butt');pdf.text(item.name,px+9,py);px+=len;}
       for(const [,color,name] of points){const len=pdf.getTextWidth(name)+9;placePdf(len);
         pdf.setFillColor(color);pdf.setDrawColor('#FBFBFB');pdf.setLineWidth(.3);pdf.circle(px+1.8,py-1,1.6,'FD');pdf.text(name,px+5,py);px+=len;}
       if(sizes){
         const R=Math.max(...sizes.map(s=>s.r)),top=py+5,base=top+3+Math.max(2*R,9),cx=12+R,lx=12+2*R+5;
         pdf.setFont('helvetica','bold');pdf.text('Población (área proporcional a los habitantes)',12,top);pdf.setFont('helvetica','normal');pdf.setFontSize(7);
         pdf.setFillColor(BUBBLE.fill);pdf.setDrawColor(BUBBLE.stroke);pdf.setLineWidth(.25);
         for(const s of sizes)pdf.circle(cx,base-s.r,s.r,'FD');
         let prev=-Infinity;pdf.setDrawColor('#586278');pdf.setLineWidth(.15);
         for(const s of sizes){const yTop=base-2*s.r,ly=Math.max(yTop+2.5,prev+3);prev=ly;pdf.line(cx,yTop,lx-1,yTop);pdf.line(lx-1,yTop,lx-1,ly-.8);pdf.line(lx-1,ly-.8,lx,ly-.8);pdf.text(s.label,lx+.5,ly);}
         pdf.setFontSize(8);py=Math.max(base,prev)+2;px=12;
       }
       py+=7;
       for(const text of [$('export-metrics').checked?query:'',$('export-metrics').checked&&themeMode==='gauge'?`${metrics.sections} tramos · ${Math.round(metrics.km)} km geométricos estimados (no longitud oficial)`:'',credits]){if(!text)continue;const lines=pdf.splitTextToSize(text,mmW-24);pdf.text(lines,12,py);py+=lines.length*3.5+3;}
       if(py>mmH-12)throw new Error('La composición PDF excede el papel; selecciona A3.');
       pdf.setFontSize(8);pdf.text('Orientación: '+Math.round(camera.bearing)+'° · '+(!scaleIsUniform?'Escala variable por perspectiva':'Escala local aproximada en el centro'),12,mmH-8);
       pdf.setProperties({title,subject:query,creator:'Atlas ferroviario de España'});pdf.save('atlas-ferroviario.pdf');
     }else{const blob=await new Promise(resolve=>canvas.toBlob(resolve,format==='PNG'?'image/png':'image/jpeg',.95));if(!blob)throw new Error('No se pudo codificar la imagen');download(blob,'atlas-ferroviario.'+format.toLowerCase());}
     message.textContent=`${format} generado · ${W} × ${H} px. `+(!scaleIsUniform?'La perspectiva no tiene escala uniforme.':'');
   }catch(error){message.textContent='No se ha exportado: '+error.message;console.error(error);}
   finally{clone?.remove();host?.remove();button.disabled=false;}
 }
 root.AtlasExport={run};
 if(typeof module!=='undefined')module.exports={northArrow,uniformScale,waitMap};
})(window);
