/* Pruebas aisladas: Supabase y Google Drive simulados; ningún dato real. */
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync} from 'node:fs';
import {dirname,join,extname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),AXE=readFileSync(require.resolve('axe-core/axe.min.js'),'utf8');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{const path=resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]));if(!path.startsWith(ROOT)||!existsSync(path)||!statSync(path).isFile()){res.writeHead(404);res.end();return}res.setHeader('Content-Type',MIME[extname(path)]||'application/octet-stream');res.end(readFileSync(path))}).listen(0);
const BASE='http://localhost:'+server.address().port,uid='aaaaaaaa-0000-4000-8000-000000000001';
const files=[];let sequence=0;
const browser=await chromium.launch();
const config=JSON.parse(readFileSync(join(ROOT,'boveda/config.js'),'utf8').match(/Object.freeze\(([\s\S]*?)\);/)[1]);
let violations=[],errors=[];
async function context({auth=true,configured=true,width=390}={}){
 const ctx=await browser.newContext({viewport:{width,height:844}});
 await ctx.addInitScript(({auth,uid})=>{if(auth)sessionStorage.setItem('bm_ap_session',JSON.stringify({access_token:'synthetic-portfolio-token',refresh_token:'synthetic-refresh',expires_at:Math.floor(Date.now()/1000)+3600}));document.addEventListener('securitypolicyviolation',e=>{if(e.blockedURI!=='inline')console.error('CSP: '+e.blockedURI)})},{auth,uid});
 await ctx.route('**/boveda/config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.BovedaConfig='+JSON.stringify({...config,googleClientId:configured?'12345-synthetic.apps.googleusercontent.com':''})}));
 await ctx.route('https://*.supabase.co/**',route=>{const url=route.request().url();if(url.endsWith('/rpc/is_member'))return route.fulfill({json:true});if(url.endsWith('/auth/v1/user'))return route.fulfill({json:{id:uid}});throw Error('Unexpected Supabase request')});
 await ctx.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'text/javascript',body:`window.google={accounts:{oauth2:{hasGrantedAllScopes:()=>true,initTokenClient:options=>({requestAccessToken:()=>options.callback({access_token:'synthetic-google-token',expires_in:3600,scope:'https://www.googleapis.com/auth/drive.appdata'})})}}};`}));
 await ctx.route('https://www.googleapis.com/**',async route=>{
  const request=route.request(),u=new URL(request.url());assert.equal(request.headers().authorization,'Bearer synthetic-google-token');
  if(request.method()==='POST'){
   const body=request.postDataBuffer(),boundary=request.headers()['content-type'].split('boundary=')[1],first=body.indexOf('\r\n\r\n')+4,last=body.indexOf('\r\n--'+boundary,first),metadata=JSON.parse(body.subarray(first,last).toString());
   const start=body.indexOf('\r\n\r\n',last)+4,end=body.indexOf('\r\n--'+boundary,start);
   const file={id:'fake-'+(++sequence),createdTime:new Date().toISOString(),appProperties:metadata.appProperties,bytes:body.subarray(start,end)};file.size=String(file.bytes.length);files.push(file);return route.fulfill({json:{id:file.id}});
  }
  if(u.searchParams.get('alt')==='media'){const f=files.find(f=>f.id===u.pathname.split('/').pop());return route.fulfill({body:f.bytes,contentType:'application/octet-stream'})}
  return route.fulfill({json:{files:files.map(({bytes,...f})=>f)}});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&m.text().startsWith('CSP:'))errors.push(m.text())});await page.goto(BASE+'/boveda.html');return {ctx,page};
}
try{
 const unauth=await context({auth:false});await unauth.page.waitForFunction(()=>document.querySelector('#accessStatus').textContent.includes('Entra'));assert.equal(await unauth.page.locator('#app').isVisible(),false);await unauth.ctx.close();console.log('✓ Acceso existente del portfolio; sin sesión no se inicia Bóveda');
 const local=await context({configured:false});
 await local.page.waitForFunction(()=>!document.querySelector('#unlockSubmit').disabled);
 assert.equal(await local.page.locator('#connectDrive').isVisible(),false);
 await local.page.locator('#master').fill('Synthetic-local-vault-2026!');
 await local.page.locator('#confirmMaster').fill('Synthetic-local-vault-2026!');
 await local.page.locator('#unlockSubmit').click();
 await local.page.getByText('Guardado en este navegador ·', {exact:false}).waitFor();
 await local.page.reload();
 await local.page.waitForFunction(()=>!document.querySelector('#unlockSubmit').disabled);
 await local.page.locator('#master').fill('Synthetic-local-vault-2026!');
 await local.page.locator('#unlockSubmit').click();
 await local.page.waitForSelector('#workspace:visible');
 assert.equal(files.length,0);
 await local.ctx.close();
 console.log('✓ Bóveda local cifrada: persiste tras recargar sin enviar archivos a Drive');
 const a=await context();await a.page.locator('#connectDrive').click();await a.page.waitForFunction(()=>!document.querySelector('#unlockSubmit').disabled);
 await a.page.locator('#master').fill('Synthetic-vault-test-2026!');await a.page.locator('#confirmMaster').fill('Synthetic-vault-test-2026!');await a.page.locator('#unlockSubmit').click();
 await a.page.waitForFunction(()=>document.querySelector('#saveState').textContent.includes('Sincronizado con Drive'));
 assert.equal(files.length,1);assert.ok(!files[0].bytes.includes(Buffer.from('Synthetic-vault-test-2026!')));console.log('✓ Creación real KDBX y guardado cifrado en Drive simulado');
 await a.page.locator('#lockBtn').click();await a.page.locator('#showHistory').click();await a.page.waitForSelector('#historyList li');assert.equal(await a.page.locator('#historyList li').count(),1);
 await a.ctx.route('**/__test_axe.js',route=>route.fulfill({contentType:'text/javascript',body:AXE}));await a.page.addScriptTag({url:BASE+'/__test_axe.js'});const ax=await a.page.evaluate(async()=>{const r=await axe.run({runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,target:v.nodes[0].target,help:v.help}))});violations.push(...ax);
 assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth),390);console.log('✓ Historial disponible y diseño móvil sin scroll horizontal');
 if(process.env.BOVEDA_SHOTS){mkdirSync(process.env.BOVEDA_SHOTS,{recursive:true});await a.page.screenshot({path:join(process.env.BOVEDA_SHOTS,'boveda-iphone.png'),fullPage:true})}
 const b=await context({width:1280});await b.page.locator('#connectDrive').click();await b.page.waitForFunction(()=>!document.querySelector('#unlockSubmit').disabled);assert.equal(await b.page.locator('#confirmWrap').isVisible(),false);
 await b.page.locator('#master').fill('Incorrect-synthetic-password');await b.page.locator('#unlockSubmit').click();await b.page.waitForFunction(()=>document.querySelector('#gateError').textContent.length>0);assert.equal(await b.page.locator('#workspace').isVisible(),false);
 await b.page.locator('#master').fill('Synthetic-vault-test-2026!');await b.page.locator('#unlockSubmit').click();await b.page.waitForSelector('#workspace:visible');assert.equal(files.length,1);console.log('✓ Segundo dispositivo abre la misma bóveda; contraseña incorrecta rechazada');
 await b.page.locator('#disconnectDrive').click();await b.page.waitForFunction(()=>document.querySelector('#driveStatus').textContent.includes('desconectado'));assert.equal(await b.page.locator('#workspace').isVisible(),false);assert.equal(files.length,1);console.log('✓ Desconexión bloquea la vista y conserva los datos');
 assert.deepEqual(errors,[]);assert.deepEqual(violations,[]);await a.ctx.close();await b.ctx.close();
 console.log('✓ Bóveda: flujos, móvil, CSP y WCAG sin errores. Ninguna conexión real a Google o Supabase.');
}finally{await browser.close();server.close()}
