(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 function waitMap(map){return new Promise((resolve,reject)=>{
   let errors=[];const error=e=>errors.push(e.error?.message||'Error de capa');
   const timer=setTimeout(()=>finish(new Error('Las capas no han terminado de cargar. Reintenta cuando la conexión esté disponible.')),60000);
   function finish(e){clearTimeout(timer);map.off('idle',idle);map.off('error',error);e?reject(e):resolve();}
   function idle(){finish(errors.length?new Error(errors[0]):null);}
   map.on('error',error);map.once('idle',idle);map.triggerRepaint();
 });}
 function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 async function run({map,dataset,filters,filtered,label,terrainEnabled,legendItems,themeName}){
   const button=$('export-map'),message=$('action-message');button.disabled=true;message.textContent='Preparando cartografía y etiquetas…';
   let clone,host;
   try{
     if(!map?.isStyleLoaded())throw new Error('Espera a que termine de cargar el mapa.');
     if(legendItems&&legendItems.length>12)throw new Error('Selecciona hasta 12 líneas para obtener una leyenda completa y legible.');
     const format=$('export-format').value, paper=$('export-paper').value,orientation=$('export-orientation').value;
     const dpi=Number($('export-quality').value),long=paper==='A3'?420:297,short=paper==='A3'?297:210;
     const mmW=orientation==='landscape'?long:short,mmH=orientation==='landscape'?short:long;
     const W=Math.round(mmW*dpi/25.4),H=Math.round(mmH*dpi/25.4),margin=Math.round(12*dpi/25.4);
     const original=map.getCanvas(),ratio=original.width/original.height;
     const areaW=W-2*margin,areaH=H-2*margin- Math.round(70*dpi/25.4);
     const width=Math.min(areaW,areaH*ratio),height=width/ratio;
     host=document.createElement('div');Object.assign(host.style,{position:'fixed',left:'-20000px',top:'0',width:map.getContainer().clientWidth+'px',height:map.getContainer().clientHeight+'px'});document.body.append(host);
     const pixelRatio=width/map.getContainer().clientWidth;
     clone=new maplibregl.Map({container:host,style:map.getStyle(),center:map.getCenter(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch(),interactive:false,attributionControl:false,pixelRatio,canvasContextAttributes:{preserveDrawingBuffer:true}});
     clone.on('styleimagemissing',event=>{const original=map.getImage(event.id);if(original&&!clone.hasImage(event.id))clone.addImage(event.id,original.data,{pixelRatio:original.pixelRatio,stretchX:original.stretchX,stretchY:original.stretchY,content:original.content});});
     await waitMap(clone);
     // Feature state is not serialized with the style.
     for(const f of filtered){if(map.getFeatureState({source:'rail',id:f.id}).selected)clone.setFeatureState({source:'rail',id:f.id},{selected:true});}
     await new Promise(resolve=>{clone.once('render',resolve);clone.triggerRepaint();});
     const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');
     const scale=dpi/25.4, mapX=(W-width)/2,mapY=margin+15*scale;
     ctx.fillStyle='#FBFBFB';ctx.fillRect(0,0,W,H);ctx.fillStyle='#1D2638';ctx.font=`600 ${5*scale}px sans-serif`;
     const title=$('export-title').value.trim()||'Red ferroviaria de España';ctx.fillText(title,margin,margin+5*scale,W-2*margin);
     ctx.font=`${2.5*scale}px sans-serif`;ctx.fillText(new Date().toLocaleDateString('es-ES')+' · '+(terrainEnabled?'Relieve 3D':'Vista 2D'),margin,margin+10*scale);
     ctx.drawImage(clone.getCanvas(),mapX,mapY,width,height);
     let y=mapY+height+6*scale;const legend=[];const themeMode=legendItems?'theme':'gauge';
     if($('export-legend').checked&&themeMode==='gauge'){for(const value of new Set(filtered.map(f=>AtlasFilters.value(f,'gauge')))){const style=AtlasCartography.style(value);legend.push(style);}}
     if($('export-legend').checked&&themeMode!=='gauge'){for(const item of legendItems){legend.push(item);}}
     let x=margin;ctx.font=`${2.6*scale}px sans-serif`;
     for(const item of legend){const length=ctx.measureText(item.name).width+13*scale;if(x+length>W-margin){x=margin;y+=5*scale;}ctx.strokeStyle=item.color;ctx.lineWidth=1*scale;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+7*scale,y);ctx.stroke();ctx.fillStyle='#1D2638';ctx.fillText(item.name,x+9*scale,y+scale);x+=length;}
     const metrics=AtlasCartography.metrics(filtered);y+=7*scale;
     const query=themeMode!=='gauge'?(themeName||'Tema')+' · '+legendItems.map(i=>i.name).join(', '):Object.entries(filters).filter(([,v])=>v.length).map(([d,v])=>v.map(a=>label(d,a)).join(' / ')).join(' · ')||'Todos los tramos';
     function wrap(text,fontSize=2.5){ctx.font=`${fontSize*scale}px sans-serif`;let line='';for(const word of text.split(' ')){if(ctx.measureText(line+' '+word).width>W-2*margin){ctx.fillText(line,margin,y);y+=4*scale;line=word;}else line+=(line?' ':'')+word;}ctx.fillText(line,margin,y);y+=5*scale;}
     if($('export-metrics').checked){wrap(query);if(themeMode==='gauge')wrap(`${metrics.sections.toLocaleString('es')} tramos en consulta · ${Math.round(metrics.km).toLocaleString('es')} km de ejes IGN con atributos (no es la longitud oficial)`);}
     wrap('© IGN/SCNE CC BY 4.0 · Renfe Operadora CC BY 4.0 · EuroGeographics / Eurostat GISCO · Natural Earth',2.2);
     const activeSources=new Set(map.getStyle().layers.filter(l=>l.layout?.visibility!=='none').map(l=>l.source));if(map.getTerrain()?.source)activeSources.add(map.getTerrain().source);const credits=[...new Set(Object.entries(map.getStyle().sources).filter(([id])=>activeSources.has(id)).map(([,s])=>s.attribution).filter(Boolean))].map(t=>{const el=document.createElement('span');el.innerHTML=t;return el.textContent;}).join(' · ');
     wrap(credits,2);
     if(y>H-margin)throw new Error('La composición excede el papel. Elige A3 o desactiva el resumen de consulta.');
     // North arrow follows map bearing. A tilted map has no uniform metric scale.
     ctx.save();ctx.translate(mapX+width-8*scale,mapY+10*scale);ctx.rotate(-map.getBearing()*Math.PI/180);ctx.strokeStyle='#1D2638';ctx.lineWidth=.5*scale;ctx.beginPath();ctx.moveTo(0,5*scale);ctx.lineTo(0,-3*scale);ctx.lineTo(-1.5*scale,0);ctx.moveTo(0,-3*scale);ctx.lineTo(1.5*scale,0);ctx.stroke();ctx.font=`${2.6*scale}px sans-serif`;ctx.fillText('N',-scale,-5*scale);ctx.restore();
     let scaleLabel='',scaleLength=0;
     if(!terrainEnabled){const center=map.getCenter();const metersPerPixel=40075016.686*Math.cos(center.lat*Math.PI/180)/(512*2**map.getZoom());const target=metersPerPixel*map.getContainer().clientWidth*.15;const power=10**Math.floor(Math.log10(target));const distance=[5,2,1].map(n=>n*power).find(n=>n<=target)||power/2;const length=distance/metersPerPixel*pixelRatio;scaleLength=length/scale;scaleLabel=distance>=1000?distance/1000+' km':distance+' m';ctx.strokeStyle='#1D2638';ctx.lineWidth=.5*scale;ctx.beginPath();ctx.moveTo(mapX+5*scale,mapY+height-6*scale);ctx.lineTo(mapX+5*scale+length,mapY+height-6*scale);ctx.stroke();ctx.font=`${2.3*scale}px sans-serif`;ctx.fillText(distance>=1000?distance/1000+' km':distance+' m',mapX+5*scale,mapY+height-8*scale);}
     if(format==='PDF'){
       const pdf=new jspdf.jsPDF({orientation,unit:'mm',format:paper.toLowerCase(),compress:true});
       pdf.setFillColor('#FBFBFB');pdf.rect(0,0,mmW,mmH,'F');pdf.setTextColor('#1D2638');
       pdf.setFont('helvetica','bold');pdf.setFontSize(15);pdf.text(pdf.splitTextToSize(title,mmW-24),12,17);
       pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.text(new Date().toLocaleDateString('es-ES')+' · '+(terrainEnabled?'Relieve 3D':'Vista 2D'),12,23);
       pdf.addImage(clone.getCanvas().toDataURL('image/png'),'PNG',mapX/scale,mapY/scale,width/scale,height/scale);
       if(scaleLabel){pdf.setDrawColor('#1D2638');pdf.setLineWidth(.5);pdf.line(mapX/scale+5,(mapY+height)/scale-6,mapX/scale+5+scaleLength,(mapY+height)/scale-6);pdf.setFontSize(7);pdf.text(scaleLabel,mapX/scale+5,(mapY+height)/scale-8);}
       pdf.setFontSize(8);pdf.text('N', (mapX+width)/scale-8,mapY/scale+8);
       let py=(mapY+height)/scale+6,px=12;pdf.setFontSize(8);
       for(const item of legend){const len=pdf.getTextWidth(item.name)+13;if(px+len>mmW-12){px=12;py+=5;}pdf.setDrawColor(item.color);pdf.setLineWidth(.8);pdf.line(px,py-1,px+7,py-1);pdf.text(item.name,px+9,py);px+=len;}
       py+=7;
       for(const text of [$('export-metrics').checked?query:'',$('export-metrics').checked&&themeMode==='gauge'?`${metrics.sections} tramos · ${Math.round(metrics.km)} km geométricos estimados (no longitud oficial)`:'',credits]){if(!text)continue;const lines=pdf.splitTextToSize(text,mmW-24);pdf.text(lines,12,py);py+=lines.length*3.5+3;}
       if(py>mmH-12)throw new Error('La composición PDF excede el papel; selecciona A3.');
       pdf.setFontSize(8);pdf.text('Norte: '+Math.round(map.getBearing())+'° · '+(terrainEnabled?'Escala variable por perspectiva 3D':'Escala cartográfica en la imagen de vista'),12,mmH-8);
       pdf.setProperties({title,subject:query,creator:'Atlas ferroviario de España'});pdf.save('atlas-ferroviario.pdf');
     }else{const blob=await new Promise(resolve=>canvas.toBlob(resolve,format==='PNG'?'image/png':'image/jpeg',.95));if(!blob)throw new Error('No se pudo codificar la imagen');download(blob,'atlas-ferroviario.'+format.toLowerCase());}
     message.textContent=`${format} generado · ${W} × ${H} px. `+(terrainEnabled?'La perspectiva 3D no tiene escala uniforme.':'');
   }catch(error){message.textContent='No se ha exportado: '+error.message;console.error(error);}
   finally{clone?.remove();host?.remove();button.disabled=false;}
 }
 root.AtlasExport={run};
})(window);
