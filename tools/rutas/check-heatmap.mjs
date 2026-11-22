/* Prueba de interfaz local: modos, filtros, vacío, móvil y CSP real. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../',import.meta.url));
fs.mkdirSync(path.join(root,'.cache'),{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8');res.end(fs.readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],violations=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.addEventListener('securitypolicyviolation',e=>{if(e.blockedURI!=='https://fonts.googleapis.com')console.error('CSP:',e.violatedDirective);});});
  page.on('console',m=>{if(m.text().startsWith('CSP:'))violations.push(m.text());});
  await page.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/visor-ferroviario/cabina-rutas.html`);
  await page.waitForFunction(()=>window.RutasHeatmapSelection?.rows.length>0);
  const initialCount=await page.evaluate(()=>window.RutasHeatmapSelection.rows.length);
  await page.click('#rh-load');await page.waitForFunction(()=>window.RutasHeatmapData?.mode==='routes',null,{timeout:60000});
  assert(await page.locator('.rh-line').count()>0);
  for(const mode of ['frequency','connectivity','coverage','potential','reliability','routes']){
    await page.selectOption('#rh-mode',mode);
    assert((await page.locator('#rh-method').textContent()).length>50);
    if(mode==='reliability')assert(await page.locator('#rh-layout').isHidden());
    else {assert(await page.locator('#rh-tbody tr button').count()>0,mode);assert(await page.evaluate(()=>window.RutasHeatmapData.items.some(i=>i.value>0)),mode+' debe contener valores reales');}
    console.log(mode,await page.locator('#rh-status').textContent());
  }
  // Regresión geográfica: estación existente y territorio sin red se distinguen.
  await page.selectOption('#rh-mode','coverage');
  const geo=await page.evaluate(()=>({canary:window.RutasHeatmapData.items.some(i=>['Las Palmas','Palmas, Las','Santa Cruz de Tenerife'].includes(i.province)),galicia:window.RutasHeatmapData.items.filter(i=>['Coruña, A','Lugo','Ourense','Pontevedra'].includes(i.province)&&i.stationCount>0).map(i=>({label:i.label,value:i.value,served:i.servedCount}))}));
  assert.equal(geo.canary,false);assert(geo.galicia.length>20);assert(geo.galicia.filter(i=>i.served>0).every(i=>i.value===0));
  console.log('Galicia: municipios con estación',geo.galicia.length);
  await page.selectOption('#rh-mode','routes');
  await page.locator('#rh-tbody button').first().click();
  assert(await page.locator('#rh-detail details').count()>0);
  assert(await page.locator('.rh-selection-line').count()>0);
  await page.click('#rh-home');
  await page.locator('.rh-line').first().dispatchEvent('click',{clientX:400,clientY:500});
  assert((await page.locator('#rh-detail').textContent()).includes('Rutas asociadas'));
  await page.fill('#rh-search','no-hay-ningun-tramo');assert.equal(await page.locator('#rh-tbody button').count(),0);await page.fill('#rh-search','');
  const downloadPromise=page.waitForEvent('download');await page.click('#rh-csv');const download=await downloadPromise;assert(download.suggestedFilename().startsWith('mapa-routes-'));
  await page.selectOption('#rh-mode','frequency');
  await page.selectOption('#f-op','OUIGO');
  assert((await page.locator('#rh-status').textContent()).includes((await page.evaluate(()=>window.RutasHeatmapSelection.rows.length))+' rutas seleccionadas'));
  assert(await page.evaluate(()=>window.RutasHeatmapSelection.rows.every(r=>r.op==='OUIGO')));
  await page.selectOption('#rh-day','5');
  assert((await page.locator('#rh-status').textContent()).includes('2026-11-28'));
  await page.fill('#f-q','no-existe-esta-estacion');await page.waitForFunction(()=>window.RutasHeatmapSelection.rows.length===0);
  assert.equal(await page.locator('.rh-point').count(),0);
  await page.selectOption('#rh-mode','coverage');
  assert(await page.evaluate(()=>window.RutasHeatmapData.items.every(i=>i.value===null)));
  await page.click('#f-reset');await page.waitForFunction(n=>window.RutasHeatmapSelection.rows.length===n,initialCount);
  await page.selectOption('#f-ca','País Vasco');await page.selectOption('#f-pr','Álava');
  await page.selectOption('#rh-mode','coverage');assert(await page.locator('#rh-tbody tr button').count()>0,'Equivalencia Álava / Araba');
  await page.selectOption('#rh-mode','potential');assert.equal(await page.locator('#rh-tbody tr button').count(),1);
  await page.click('#f-reset');await page.waitForFunction(n=>window.RutasHeatmapSelection.rows.length===n,initialCount);
  await page.selectOption('#rh-mode','routes');
  await page.click('#rh-in');assert.notEqual(await page.locator('#rh-map').getAttribute('viewBox'),'0 0 1000 670');
  await page.click('#rh-home');assert.equal(await page.locator('#rh-map').getAttribute('viewBox'),'0 0 1000 670');
  await page.locator('.rh-panel').screenshot({path:path.join(root,'.cache','heatmap-desktop.png')});
  await page.selectOption('#rh-mode','coverage');await page.locator('.rh-panel').screenshot({path:path.join(root,'.cache','heatmap-coverage.png')});
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desbordamiento móvil');
  await page.locator('.rh-panel').screenshot({path:path.join(root,'.cache','heatmap-mobile.png')});
  // axe se inyecta solo en contexto de prueba, con CSP desactivada para la auditoría.
  const context=await browser.newContext({bypassCSP:true});const audit=await context.newPage();
  await audit.goto(page.url());await audit.waitForFunction(()=>window.RutasHeatmapSelection?.rows.length>0);
  await audit.click('#rh-load');await audit.waitForFunction(()=>window.RutasHeatmapData?.mode==='routes');
  const require=createRequire(import.meta.url);await audit.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const axe=await audit.evaluate(async()=>window.axe.run('.rh-panel',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
  assert.deepEqual(axe.violations.map(x=>({id:x.id,nodes:x.nodes.map(n=>n.target)})),[]);
  assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);
  console.log('OK: seis modos, día, filtros, provincias bilingües, vacío, zoom, móvil, CSP y accesibilidad del panel.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
