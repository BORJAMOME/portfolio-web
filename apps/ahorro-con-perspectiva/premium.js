'use strict';
let labState=FinanceLab.settings(),manualPage=0,rawRescued=false;
try{labState=FinanceLab.settings(JSON.parse(AhorroStorage.getItem('ahorro-laboratorio-v1')||'{}'))}catch{}
const labColors=['#75856a','#1a3300','#b64718'];
const labFields={labCut:'cut',labRaise:'raise',labSaveRaise:'saveRaise',labHorizon:'horizon',labTarget:'target',labStress:'stress',labExpenseView:'view',labExpenseSearch:'query',bankMetric:'metric',bankSearch:'bankQuery',bankKind:'bankKind'};
function labSave(){try{AhorroStorage.setItem('ahorro-laboratorio-v1',JSON.stringify(labState))}catch{}}
function syncLabControls(){for(const [id,key] of Object.entries(labFields))$(id).value=labState[key];labSave()}
function labTable(headers,rows){
  return '<div class="table-scroll"><table><thead><tr>'+headers.map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map((v,i)=>i?'<td>'+esc(v)+'</td>':'<th scope="row">'+esc(v)+'</th>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function labSvg(body,w,h,label){return '<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(label)+'"><title>'+esc(label)+'</title>'+body+'</svg>'}
function svgText(x,y,label,anchor='start'){return '<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'">'+esc(label)+'</text>'}
function svgLine(x1,y1,x2,y2,color='#d8dece'){return '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'"/>'}
function svgRect(x,y,w,h,color){return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+Math.max(0,h)+'" fill="'+color+'" rx="2"/>'}
function compactValues(rows,label){
  return '<ul class="ux-chart-values" aria-label="'+esc(label)+'">'+rows.map(([name,value])=>'<li><span>'+esc(name)+'</span><strong>'+precise(value)+'</strong></li>').join('')+'</ul>';
}
function labBars(rows,label){
  if(!rows.length)return '<p class="chart-empty">No hay resultados para estos filtros.</p>';
  const peak=Math.max(1,...rows.map(r=>Math.abs(r[1]))),neg=rows.some(r=>r[1]<0),zero=neg?360:220,space=neg?170:300,h=rows.length*43+32;
  let body=svgLine(zero,0,zero,h-21,labColors[1])+svgText(zero,h-3,'0 €','middle');
  rows.forEach(([name,value],i)=>{
    const y=i*43+5,len=Math.abs(value)/peak*space;
    body+=svgText(5,y+15,name.slice(0,28))+svgRect(value<0?zero-len:zero,y,len,22,value<0?labColors[2]:labColors[1])+svgText(value<0?zero+6:zero+len+6,y+15,precise(value));
  });
  return labSvg(body,640,h,label)+compactValues(rows,label);
}
function labWaterfall(c){
  const bars=[['Ingresos',0,c.totalIncome,c.totalIncome],['Gastos',c.capacity,c.totalIncome,-c.expenses],['Ahorro',c.margin,c.capacity,-c.saving],['Margen',Math.min(0,c.margin),Math.max(0,c.margin),c.margin]];
  const min=Math.min(0,c.margin),max=Math.max(1,c.totalIncome),y=v=>228-(v-min)*202/(max-min);
  let body=svgLine(62,y(0),590,y(0),labColors[1])+svgText(56,y(0)+4,'0 €','end');
  bars.forEach(([name,lo,hi,amount],i)=>{
    const x=72+i*133;
    body+=svgRect(x,y(hi),80,y(lo)-y(hi),i===3?'#b9d9a7':i===2?labColors[2]:labColors[1])+svgText(x+40,y(hi)-7,euro(amount),'middle')+svgText(x+40,255,name,'middle');
    if(i<3){const yy=y([c.totalIncome,c.capacity,c.margin][i]);body+=svgLine(x+80,yy,x+133,yy)}
  });
  $('waterfallChart').innerHTML=labSvg(body,610,275,'Cascada del presupuesto mensual, en euros')+compactValues(bars.map(r=>[r[0],r[3]]),'Resumen mensual');
  $('waterfallData').innerHTML=labTable(['Paso','Importe mensual'],bars.map(r=>[r[0],precise(r[3])]));
}
function labProjections(exp,initial){
  const h=labState.horizon,series=[BM.calculate(planBase).saving,exp.before.saving,exp.after.saving];
  const peak=Math.max(1,initial+Math.max(...series)*h),x=m=>77+450*m/h,y=v=>225-192*v/peak;
  let body='';
  for(let i=0;i<=4;i++){
    const v=peak*i/4,month=h*i/4;
    body+=svgLine(77,y(v),527,y(v))+svgText(70,y(v)+4,euro(v),'end')+svgText(x(month),246,month,'middle');
  }
  series.forEach((a,i)=>{
    body+='<path d="M'+x(0)+' '+y(initial)+' L'+x(h)+' '+y(initial+a*h)+'" fill="none" stroke="'+labColors[i]+'" stroke-width="'+(i===1?3:2)+'" '+(i===0?'stroke-dasharray="6 4"':'')+'/>';
    body+='<circle cx="'+x(h)+'" cy="'+y(initial+a*h)+'" r="4" fill="'+labColors[i]+'"/>';
  });
  $('scenarioLines').innerHTML=labSvg(body+svgText(300,271,'Meses · euros acumulados','middle'),600,285,'Ahorro acumulado de la base, el plan actual y el experimento')+compactValues(['Base','Actual','Experimento'].map((name,i)=>[name+' · mes '+h,initial+series[i]*h]),'Ahorro acumulado');
  $('scenarioData').innerHTML=labTable(['Mes','Base','Actual','Experimento'],Array.from({length:h+1},(_,i)=>[i,...series.map(v=>precise(initial+v*i))]));
  const years=h/12,annual=series.map(v=>v*12),top=Math.max(1,...annual),group=450/years;
  body='';
  for(let i=0;i<=4;i++){const yy=225-i*48;body+=svgLine(77,yy,527,yy)+svgText(70,yy+4,euro(top*i/4),'end')}
  for(let year=0;year<years;year++){
    const center=77+(year+.5)*group,w=Math.min(30,group/4);
    annual.forEach((v,i)=>{const hh=v/top*192;body+=svgRect(center+(i-1.5)*w,225-hh,w-3,hh,labColors[i])});
    body+=svgText(center,247,'Año '+(year+1),'middle');
  }
  $('annualColumns').innerHTML=labSvg(body+svgText(300,270,'Base / actual / experimento · euros aportados','middle'),600,285,'Aportaciones anuales en tres escenarios')+compactValues(['Base','Actual','Experimento'].map((name,i)=>[name+' · por año',annual[i]]),'Aportaciones anuales');
  $('annualData').innerHTML=labTable(['Año','Base','Actual','Experimento'],Array.from({length:years},(_,i)=>[i+1,...annual.map(precise)]));
}
function labExpenses(){
  const query=labState.query.toLowerCase();
  const rows=plan.expenses.filter(r=>r.enabled&&r.name.toLowerCase().includes(query)&&({all:true,essential:r.essential,flexible:!r.essential,periodic:r.period!=='monthly'}[labState.view])).map(r=>[r.name,BM.monthly(r),r.essential]).sort((a,b)=>b[1]-a[1]);
  const total=rows.reduce((sum,r)=>sum+r[1],0);
  $('expenseBars').innerHTML=labBars(rows.slice(0,8),'Gastos mensuales ordenados de mayor a menor');
  $('expenseFilterNote').textContent=rows.length+' partidas · '+precise(total)+'/mes. Gráfico de las ocho mayores y tabla completa de la vista.';
  $('expenseData').innerHTML=labTable(['Partida','Mes equivalente','Peso en la vista','Clasificación'],rows.map(([name,value,essential])=>[name,precise(value),(total?value/total*100:0).toFixed(1)+' %',essential?'Esencial':'No esencial']));
}
function labBanks(p){
  const matches=r=>(r.o.name+' '+r.o.product).toLowerCase().includes(labState.bankQuery.toLowerCase())&&({all:true,one:!r.o.term&&r.o.id!=='combo',two:r.o.id==='combo',term:r.o.term}[labState.bankKind]);
  const value=r=>FinanceLab.bankValue(r,p,labState.metric);
  const eligible=results.filter(r=>r.eligible&&matches(r)).sort((a,b)=>value(b)-value(a));
  $('bankBenefitBars').innerHTML=labBars(eligible.slice(0,6).map(r=>[r.o.name,value(r)]),'Beneficio bancario en euros con la métrica seleccionada');
  const labels={paid:'Beneficio neto abonado',accrued:'Beneficio devengado estimado',exit:'Beneficio estimado al salir'};
  $('rankingMetric').textContent=labels[labState.metric];
  const notes={paid:'Intereses e incentivos ingresados tras la retención simulada.',accrued:'Efectivo abonado más interés pendiente tras retención estimada.',exit:'Efectivo abonado menos devolución bruta orientativa. La regularización fiscal y los costes de salida dependen del contrato.'};
  const activeFilter=!!labState.bankQuery||labState.bankKind!=='all';
  $('clearBankFilters').hidden=!activeFilter;
  $('bankMetricNote').textContent=p.months+' meses · '+precise(p.monthly)+'/mes · '+labels[labState.metric]+'. '+(eligible.length?notes[labState.metric]+' '+Math.min(6,eligible.length)+' de '+eligible.length+' opciones. Las tarjetas superiores muestran efectivo abonado.':'Ninguna cuenta elegible coincide con esta vista.');
  $('bankMetricData').innerHTML=labTable(['Entidad','Abonado neto','Devengado neto estimado','Salida orientativa','Interés bruto','Incentivos brutos'],eligible.map(r=>[r.o.name,...['paid','accrued','exit'].map(m=>precise(FinanceLab.bankValue(r,p,m))),precise(r.grossInterest),precise(r.grossBonus)]));
  const rows=[...$('ranking').querySelectorAll('tr')].map(el=>({el,r:results.find(r=>r.o.id===el.querySelector('[data-detail]')?.dataset.detail)}));
  rows.forEach(({el,r})=>{if(r){el.hidden=!matches(r);const cell=el.querySelector('.net');if(cell)cell.textContent=r.eligible?precise(value(r)):'—'}});
  rows.sort((a,b)=>a.r?.eligible&&b.r?.eligible?value(b.r)-value(a.r):Number(!!b.r?.eligible)-Number(!!a.r?.eligible)).forEach(({el})=>$('ranking').appendChild(el));
}
const sourcesManual=[
 ['Finanzas para Todos · presupuesto','https://www.finanzasparatodos.es/como-elaborar-un-presupuesto'],
 ['CFPB · fondo de emergencia y automatización','https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/'],
 ['Banco de España · gestión de finanzas personales','https://www.bde.es/f/webbe/INF/MenuHorizontal/AreasActuacion/conducta/ficheros/Sesion4Gestionfinanzaspersonales.pdf'],
 ['Finanzas para Todos · objetivos y ahorro','https://www.finanzasparatodos.es/herramientas/'],
 ['Banco de España · TAE de depósito','https://clientebancario.bde.es/pcb/es/menu-horizontal/podemosayudarte/tiposinteres/guia_textual/latae/tae_deposito.html'],
 ['CFPB · estrategias de deuda','https://www.consumerfinance.gov/archive/blog/how-reduce-your-debt/']
];
const manual=[
 ['Haz visible todo tu mes','PRESUPUESTO',0,'Empieza por anotar lo que entra y lo que sale.','Revisa extractos y efectivo. Distingue obligaciones, gastos necesarios y decisiones flexibles. La regla 50/30/20 orienta, pero ajusta los porcentajes a tu vivienda, salud y prioridades.','Anota siete días de pagos. Comprueba si casa y comida ya contiene lo que vas a añadir.','El presupuesto depende de los importes que registres.','#presupuesto',c=>'Ingresan '+precise(c.totalIncome)+' y salen '+precise(c.expenses)+'. Quedan '+precise(c.capacity)+' antes de ahorrar.'],
 ['Págate primero, con margen','AHORRO AUTOMÁTICO',1,'Elige cuánto apartar en cuanto cobres.','Calcula una aportación repetible y deja dinero para variaciones normales. Programa la transferencia en tu banco cuando hayas comprobado el saldo y los recibos próximos. Revisa el importe después de dos nóminas.','Elige una fecha posterior al cobro y prueba primero con una cifra sostenible.','Si el mes tiene déficit, corrige antes el plan.','#presupuesto',c=>'Apartar '+precise(c.saving)+' deja '+precise(c.margin)+' de margen mensual y suma '+precise(c.annualSaving)+' de aportaciones anuales.'],
 ['Pon límites por sobres','CATEGORÍAS',0,'Cada sobre reserva un máximo de gasto para una categoría.','Prueba con ocio, compras o restauración. Si agotas un sobre, pospón el gasto o reasigna dinero desde otra categoría de forma consciente. Una revisión semanal te permite corregir antes del cierre.','Elige un gasto flexible y anota su límite semanal.','La app registra límites del presupuesto. Para ver lo que queda, anota también las compras reales.','#laboratorio',c=>'Tus gastos flexibles suman '+precise(c.expenses-c.essential)+'. Reducirlos un 10 % liberaría '+precise((c.expenses-c.essential)*.1)+' al mes.'],
 ['Anticípate a lo que ya sabes','PROVISIONES',0,'Un seguro anual merece su propia reserva.','Divide el importe anual entre doce. Si faltan menos meses para el próximo pago y partes de cero, divide el importe pendiente entre esos meses. Revisa regalos, vacaciones y mantenimiento.','Añade un pago anual que falte y comprueba su equivalente mensual.','El prorrateo describe un mes medio. Revisa la fecha del recibo y el saldo real antes de pagarlo.','#presupuesto',c=>'Ya reservas '+precise(c.provisions)+' al mes para gastos no mensuales. Un seguro anual de 240 € añadiría 20 € al mes si falta registrarlo.'],
 ['Construye tranquilidad líquida','FONDO DE EMERGENCIA',2,'Reserva dinero accesible para interrupciones de ingresos o gastos inesperados.','Tres a seis meses de gastos sirven de referencia inicial. Ajusta el objetivo a tus cargas, la estabilidad laboral y tu red de apoyo. Un primer mes cubierto permite medir el avance.','Revisa tus esenciales y prueba una avería en el laboratorio.','La disponibilidad importa. Comprueba los plazos y condiciones de retirada.','#colchon',c=>'Tus esenciales son '+precise(c.essential)+' al mes. Tres meses son '+precise(c.essential*3)+' y seis son '+precise(c.essential*6)+'.'],
 ['Compra tiempo para decidir','HÁBITOS',3,'Una pausa te permite valorar una compra antes de pagarla.','Anota qué resuelve y calcula el coste total. Revisa suscripciones con poco uso y renegocia tarifas cuando tenga sentido. Si cancelas un gasto, asigna conscientemente lo liberado al ahorro o a una prioridad.','Elige un gasto recurrente. Compara su coste anual con lo que te aporta.','Un recorte simulado se convierte en ahorro cuando puedes mantenerlo.','#laboratorio',c=>'Liberar 15 € mensuales añade 180 € de aportaciones al año frente a tu plan de '+precise(c.annualSaving)+'.'],
 ['Que la subida también te cuide','REPARTO DEL AUMENTO',3,'Decide qué parte de una subida quieres conservar.','Simula una parte para ahorro y otra para margen. Un reparto al 50 % permite empezar a explorar. Ajústalo si tienes necesidades pendientes o gastos que van a crecer.','Prueba una subida neta y conserva el resultado como escenario hasta conocer el cobro real.','Con 14 pagas, el simulador trabaja con un equivalente medio.','#laboratorio',()=> 'Una subida de 100 € en '+plan.pays+' pagas equivale a '+precise(100*plan.pays/12)+' mensuales en promedio. La mitad añade '+precise(50*plan.pays/12)+' al ahorro.'],
 ['Compara el euro, no el titular','RENTABILIDAD Y LIQUIDEZ',4,'Lee el capital remunerado y el plazo antes de comparar porcentajes.','Contrasta TAE, comisiones, importe máximo y requisitos. Separa aportaciones, intereses e incentivos. Una promoción de pocos meses y un compromiso largo pueden producir resultados muy distintos al salir.','Compara dos ofertas con el mismo horizonte y tus requisitos reales.','El catálogo conserva la fecha de consulta. Confirma las condiciones y la vigencia con el banco.','#comparar',c=>'De '+precise(c.annualSaving)+' aportados al año, el rendimiento bancario es la parte adicional que ves en el comparador.'],
 ['Si aparece deuda, cambia el orden','COSTE FINANCIERO',5,'Incluye las cuotas y revisa cuánto te cuesta cada deuda.','Cumple los mínimos. Priorizar la deuda con mayor interés busca reducir el coste. Empezar por el saldo menor puede ayudar a sostener el hábito. Considera comisiones de amortización y dinero disponible.','Si tienes deuda, registra saldo, coste, cuota y posibles comisiones. Añade la cuota mensual que falte.','El planificador integra cuotas como gasto. La amortización exacta depende del contrato.','#presupuesto',()=> 'Una cuota mensual de 50 € reduciría la capacidad anual en 600 € si todavía no figura en el presupuesto.'],
 ['Convierte una meta en una revisión','OBJETIVOS',3,'Pon una cifra y una fecha revisable a tu siguiente objetivo.','Prueba primero el resultado de tus aportaciones. Si la fecha queda lejos, ajusta el plazo, el objetivo o el presupuesto. Vivienda y jubilación requieren horizontes y supuestos distintos.','Elige un objetivo, guarda tu base y revisa los importes tras el próximo cobro.','El objetivo utiliza la misma bolsa de ahorro que el colchón. Separa las metas cuando vayas a asignar dinero a cada una.','#laboratorio',c=>'Para reunir '+precise(labState.target)+', el laboratorio calcula el plazo a partir del capital inicial y de '+precise(c.saving)+' de aportación mensual.']
];
function labManual(){
  const [title,tag,src,intro,body,task,limit,destination,example]=manual[manualPage],source=sourcesManual[src],read=labState.read.includes(manualPage);
  const link=manualPage===3?'#addExpense':destination==='#colchon'?'#reserveMonth':destination;
  $('manualIndex').innerHTML=manual.map((ch,i)=>'<button data-manual="'+i+'" '+(i===manualPage?'aria-current="page"':'')+'><span>'+String(i+1).padStart(2,'0')+'</span><strong>'+esc(ch[0])+'</strong><small>'+(labState.read.includes(i)?'Leído ✓':i===manualPage?'Leyendo':'Explorar')+'</small></button>').join('');
  $('manualArticle').innerHTML='<p class="eyebrow">CAPÍTULO '+(manualPage+1)+' / '+tag+'</p><h3>'+esc(title)+'</h3><p class="manual-intro">'+esc(intro)+'</p><p>'+esc(body)+'</p><aside class="worked-example"><span class="eyebrow">CON TUS NÚMEROS</span><p>'+esc(example(BM.calculate(plan)))+'</p></aside><h4>Una acción esta semana</h4><p>'+esc(task)+'</p><a class="manual-action" href="'+link+'">→ '+esc(({ "#reserveMonth":"Calcular mi colchón","#addExpense":"Revisar mis gastos anuales","#presupuesto":"Revisar mi presupuesto","#laboratorio":"Probar cambios","#comparar":"Comparar cuentas"})[link]||'Probar con mi plan')+'</a><p class="manual-limit">'+esc(limit)+'</p><p class="source-note"><a href="'+source[1]+'" target="_blank" rel="noopener">'+esc(source[0])+' ↗</a></p><div class="manual-footer"><button id="markRead" class="quiet" aria-pressed="'+read+'">'+(read?'✓ Leído · desmarcar':'Marcar como leído')+'</button><button id="nextChapter" class="planner-primary">'+(manualPage<9?'Siguiente capítulo →':'Volver al comienzo ↺')+'</button></div>';
  $('manualProgress').textContent=labState.read.length+' / 10 capítulos marcados';
  $('manualProgressFill').style.width=labState.read.length*10+'%';
}
function drawSculpture(){
  const s=reserveState(),covered=s.goal?s.amount/(s.goal/3):0;
  $('reserveSculpture').innerHTML='<div class="milestone-cubes">'+Array.from({length:6},(_,i)=>'<div class="milestone-cube '+(covered>=i+1?'filled':'')+'" style="--i:'+i+'"><span>'+(i+1)+'</span></div>').join('')+'</div><p>'+precise(s.amount)+' aportados · '+num(covered)+' meses de esenciales.</p><small>Cada bloque lleno representa un mes completo. Se ilustran hasta seis meses.</small>';
  $('reserveSculpture').hidden=labState.flat;
  $('reserveScene').hidden=!labState.flat;
  $('cubeUnit').textContent=labState.flat?'CADA FICHA = '+euro(s.unit):'CADA BLOQUE = 1 MES ESENCIAL';
  $('reserveDepth').textContent=labState.flat?'Vista ilustrativa 3D':'Volver a la vista plana';
  $('reserveDepth').setAttribute('aria-pressed',!labState.flat);
}
function showRecovery(){$('recoveryNotice').hidden=!recoveryBlocked;$('acceptFresh').disabled=!rawRescued}
function updatePremium(){
  $('heroDataState').textContent=recoveryBlocked?'Ejemplo editable':JSON.stringify(plan)!==JSON.stringify(BM.initial)||savedScenarios.length?'Tu presupuesto guardado':'Ejemplo editable';
  const exp=FinanceLab.experiment(plan,labState),c=exp.before,p=profile(),initial=p.initial;
  $('labVerdict').innerHTML=c.margin<0?'Faltan <strong>'+precise(-c.margin)+'</strong> al mes para financiar este plan.':'Quedan <strong>'+precise(c.capacity)+'</strong> antes de ahorrar. Apartas <strong>'+precise(c.saving)+'</strong> y conservas <strong>'+precise(c.margin)+'</strong> de margen.';
  $('labCutValue').textContent=labState.cut+' %';$('labRaiseValue').textContent=precise(labState.raise);$('labSaveRaiseValue').textContent=labState.saveRaise+' %';
  $('experimentNumbers').innerHTML='<div><span>AHORRO DEL EXPERIMENTO</span><strong>'+euro(exp.after.saving)+'<small>/mes</small></strong></div><div><span>DIFERENCIA VS. ACTUAL</span><strong>'+(exp.extra>=0?'+':'−')+euro(Math.abs(exp.extra*12))+'<small>/año</small></strong></div>';
  $('experimentNarrative').textContent='El recorte libera '+precise(exp.cut)+'/mes. De la subida mensual equivalente de '+precise(exp.rise)+', destinas '+precise(exp.savedRise)+' al ahorro. Quedarían '+precise(exp.after.margin)+' de margen. '+(c.margin<0?'La línea actual representa una aportación que el presupuesto todavía no financia. ':'')+'Las tres líneas usan el mismo capital inicial y proyectan aportaciones sin intereses.';
  const when=n=>!Number.isFinite(n)?'Sin fecha':n===0?'Ya cubierto':n+' meses';
  const a=when(FinanceLab.monthsTo(labState.target,initial,c.saving)),b=when(FinanceLab.monthsTo(labState.target,initial,exp.after.saving)),shock=initial+exp.after.saving*12-labState.stress;
  $('goalReading').innerHTML='<p><span>Plan actual</span><strong>'+a+'</strong></p><p><span>Experimento</span><strong>'+b+'</strong></p><p><span>Saldo tras 12 meses y un imprevisto de '+euro(labState.stress)+'</span><strong>'+precise(shock)+'</strong></p>'+(shock<0?'<p class="helper">El gasto supera el saldo disponible en esta prueba.</p>':'');
  $('experimentPreview').textContent='Ahorro: '+precise(c.saving)+' → '+precise(exp.after.saving)+'/mes. Margen: '+precise(c.margin)+' → '+precise(exp.after.margin)+'/mes. Al aplicar, la aportación quedará fija en '+precise(exp.after.saving)+'/mes hasta que la cambies o actives el cálculo automático.';
  $('applyExperiment').disabled=recoveryBlocked||exp.after.margin<0;
  labWaterfall(c);labExpenses();labProjections(exp,initial);labBanks(p);labManual();drawSculpture();showRecovery();
}
for(const [id,key] of Object.entries(labFields))$(id).addEventListener('input',e=>{labState=FinanceLab.settings({...labState,[key]:e.target.value});labSave();updatePremium()});
$('applyExperiment').onclick=()=>{
  if(recoveryBlocked)return;
  const before=fullSnapshot(),beforeLab=BM.clone(labState);
  const exp=FinanceLab.experiment(plan,labState);
  if(exp.after.margin<0)return;
  plan=exp.plan;labState.cut=0;labState.raise=0;syncLabControls();renderPlanControls();schedulePlan();
  $('undoExperiment').hidden=false;
  setUndo('Experimento aplicado. El nuevo ahorro se ha fijado en modo manual.',()=>{labState=beforeLab;syncLabControls();restoreSnapshot(before)});
};
$('clearBankFilters').onclick=()=>{labState.bankQuery='';labState.bankKind='all';syncLabControls();updatePremium();$('bankSearch').focus()};
$('saveExperiment').onclick=()=>{
  if(recoveryBlocked)return;
  const draft=FinanceLab.experiment(plan,labState);
  if(draft.after.margin<0)return setUndo('El escenario tiene un déficit mensual.',null);
  if(savedScenarios.length>=8)return setUndo('Ya tienes ocho escenarios. Elimina uno antes de guardar otro.',null);
  const before=fullSnapshot();
  savedScenarios.push({id:idNew(),name:'Experimento · '+euro(draft.after.saving)+'/mes',plan:BM.clone(draft.plan)});
  schedulePlan();
  setUndo('Escenario guardado. Tu presupuesto actual sigue activo.',()=>restoreSnapshot(before));
};
$('undoExperiment').onclick=()=>$('plannerUndo').click();
$('manualArticle').addEventListener('click',event=>{
  const action=event.target.closest('a.manual-action');
  if(!action)return;
  const target=document.querySelector(action.hash);
  if(!target)return;
  document.getElementById('manualReturn')?.remove();
  const back=document.createElement('a');
  back.id='manualReturn';
  back.href='#manualArticle';
  back.className='quiet ux-return';
  back.textContent='← Volver al capítulo';
  const chapter=manualPage;
  back.onclick=()=>openManualPage(chapter);
  target.insertAdjacentElement(target.matches('input,button')?'afterend':'afterbegin',back);
});
function openManualPage(i){manualPage=i;labManual();$('manualArticle').tabIndex=-1;$('manualArticle').focus()}
$('manualIndex').onclick=e=>{const b=e.target.closest('[data-manual]');if(b)openManualPage(+b.dataset.manual)};
$('manualArticle').onclick=e=>{
  if(e.target.closest('#markRead')){labState.read=labState.read.includes(manualPage)?labState.read.filter(i=>i!==manualPage):[...labState.read,manualPage];labSave();labManual();$('markRead').focus()}
  if(e.target.closest('#nextChapter'))openManualPage((manualPage+1)%manual.length);
};
$('reserveDepth').onclick=()=>{labState.flat=!labState.flat;labSave();drawSculpture()};
window.addEventListener('reserve-state',drawSculpture);
$('rescueRaw').onclick=()=>{
  const url=URL.createObjectURL(new Blob([rejectedPlanRaw||'Copia local ilegible.'],{type:'text/plain'})),link=document.createElement('a');
  link.href=url;link.download='rescate-presupuesto-original.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  rawRescued=true;showRecovery();
};
$('acceptFresh').onclick=()=>{if(rawRescued){recoveryBlocked=false;rejectedPlanRaw=null;persistPlan();updatePremium();setUndo('Nuevo presupuesto guardado tras exportar el rescate.',null)}};
syncLabControls();updatePremium();
