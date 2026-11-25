'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Drive,heads}=require('../boveda/drive.js');
const sample=n=>{const b=new Uint8Array(150);b.set([3,217,162,154,103,251,75,181,0,0,4,0]);b[120]=n;return b};
function service(){
 const files=[];let seq=0,offline=false;
 const transport=async(url,options)=>{
  if(offline)throw Error('OFFLINE');assert.equal(options.credentials,'omit');assert.ok(options.headers.Authorization.startsWith('Bearer '));
  const u=new URL(url);
  if(options.method==='POST'){
   assert.equal(u.searchParams.get('uploadType'),'multipart');const b=Buffer.from(await options.body.arrayBuffer()),boundary=options.body.type.split('boundary=')[1];
   const first=b.indexOf('\r\n\r\n')+4,last=b.indexOf('\r\n--'+boundary,first),metadata=JSON.parse(b.subarray(first,last).toString());
   const start=b.indexOf('\r\n\r\n',last)+4,end=b.indexOf('\r\n--'+boundary,start);
   assert.deepEqual(metadata.parents,['appDataFolder']);assert.equal(metadata.mimeType,'application/octet-stream');
   const file={id:'file-'+(++seq),createdTime:new Date().toISOString(),appProperties:metadata.appProperties,bytes:new Uint8Array(b.subarray(start,end))};file.size=String(file.bytes.length);files.push(file);
   return Response.json({id:file.id});
  }
  assert.ok(!options.method||options.method==='GET','no se sobrescriben ni borran versiones');
  if(u.searchParams.get('alt')==='media'){const file=files.find(f=>f.id===u.pathname.split('/').pop());return new Response(file.bytes)}
  assert.equal(u.searchParams.get('spaces'),'appDataFolder');return Response.json({files:files.map(({bytes,...f})=>f)});
 };
 return {files,transport,offline:()=>offline=true};
}
const connect=s=>{const d=new Drive({fetch:s.transport});d.authorize('synthetic-token',3600);return d};
test('dos dispositivos comparten ciphertext; cada guardado conserva la copia anterior',async()=>{const s=service(),a=connect(s),b=connect(s);assert.equal(await a.read(),null);const id=await a.append(sample(1),null);assert.deepEqual((await b.read()).bytes,sample(1));await b.append(sample(2),id);assert.equal(s.files.length,2);assert.deepEqual(s.files[0].bytes,sample(1));assert.deepEqual((await a.read()).bytes,sample(2))});
test('una versión antigua no sobrescribe datos',async()=>{const s=service(),a=connect(s);const id=await a.append(sample(1),null);await a.append(sample(2),id);await assert.rejects(a.append(sample(3),id),/CONFLICT/);assert.equal(s.files.length,2)});
test('guardados simultáneos conservan las dos ramas; selección une el historial sin borrar',async()=>{const s=service(),a=connect(s),b=connect(s);const first=await a.append(sample(1),null);const result=await Promise.allSettled([a.append(sample(2),first),b.append(sample(3),first)]);assert.ok(result.some(r=>r.status==='rejected'));assert.equal(s.files.length,3);await assert.rejects(a.current(),/CONFLICT/);const latest=heads(await a.versions());assert.equal(latest.length,2);await a.append(await a.download(latest[0]),latest[0].id,latest.map(f=>f.id));assert.equal(s.files.length,4);assert.equal(heads(await a.versions()).length,1)});
test('no se suben datos inválidos ni se opera con tokens caducados',async()=>{const s=service(),d=connect(s);await assert.rejects(d.append(new Uint8Array(120),null),/INVALID_KDBX/);d.disconnect();await assert.rejects(d.read(),/GOOGLE_SIGNIN/);assert.equal(s.files.length,0)});
test('historial incompleto se detiene; una caída de red no borra copias',async()=>{assert.throws(()=>heads([{id:'a',appProperties:{previous:'missing'}}]),/HISTORY_INCOMPLETE/);const s=service(),d=connect(s);const id=await d.append(sample(1),null);s.offline();await assert.rejects(d.append(sample(2),id),/OFFLINE/);assert.equal(s.files.length,1)});
test('cambio de cuenta durante una petición invalida la respuesta anterior',async()=>{let complete;const d=new Drive({fetch:()=>new Promise(r=>complete=r)});d.authorize('account-one',3600);const pending=d.current();d.disconnect();d.authorize('account-two',3600);complete(Response.json({files:[]}));await assert.rejects(pending,/GOOGLE_SIGNIN/)});
