'use strict';
const $=s=>document.querySelector(s), el=(t,c,text)=>{const n=document.createElement(t);if(c)n.className=c;if(text!==undefined)n.textContent=text;return n};
let accessEnded=false;
let session=null,records=[],revision=0,demo=false,editing=null,selected=null,dirty=false,busy=false,activity=Date.now(),idle=5,pending=[],fileBytes=null,passwordAction='',storageOK=true,unpersisted=false,epoch=0;
const secretKeys=new Set(['password','pin','securityKey']);

const accountTypes=['Personal','Bancos y finanzas','Webs y apps','Trabajo','Redes sociales','Compras','Sin clasificar'];
const typeField='Tipo de cuenta';
function suggestedType(r){const n=normalize(r.name);if(/openbank|monzo|revolut|wise|binance|metamask|decentraland/.test(n))return 'Bancos y finanzas';if(/instagram|facebook|linkedin|twitter|^x$/.test(n))return 'Redes sociales';if(/gumroad|amazon|ebay|aliexpress/.test(n))return 'Compras';if(/dni|sim|lowi|taquilla|nhs/.test(n))return 'Personal';if(/gmail|google|apple|dropbox|spotify|ionos|notion|vitalsource|myelt|national geographic|iberia|cleanmymac/.test(n))return 'Webs y apps';return 'Sin clasificar'}
function accountType(r){const v=(r.extras||[]).find(x=>x.label===typeField)?.value;return v||suggestedType(r)}
function setAccountType(r,value){r.extras=(r.extras||[]).filter(x=>x.label!==typeField);r.extras.push({label:typeField,value,secret:false})}
function updateTypeCounts(){const current=$('#typeFilter').value;const select=$('#typeFilter');select.replaceChildren();let all=el('option','','Todos los tipos · '+records.length);all.value='';select.append(all);for(const type of accountTypes){const count=records.filter(r=>accountType(r)===type).length;let o=el('option','',type+' · '+count);o.value=type;select.append(o)}select.value=current||''}
function typeEditor(r){let label=el('label','','Tipo de cuenta');let select=el('select');select.name='accountType';for(const type of accountTypes){let option=el('option','',type);option.value=type;select.append(option)}select.value=r?accountType(r):'Sin clasificar';label.append(select);$('#fields').append(label)}
const names={name:'Cuenta',alias:'Alias',username:'Usuario',email:'Correo',password:'Contraseña',pin:'PIN',securityKey:'Clave de seguridad',url:'Web',twoFA:'2FA',manager:'Gestor',status:'Estado de revisión'};
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');setTimeout(()=>$('#toast').classList.remove('visible'),4000)}
function safeURL(v){try{let u=new URL(v);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u:null}catch{return null}}
function normalize(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function button(label,fn,cls=''){let b=el('button',cls,label);b.type='button';b.onclick=fn;return b}
function logo(r){let n=el('div','logo');let key=Object.keys(window.Logos||{}).find(k=>normalize(r.name).includes(k));if(key){let img=el('img');img.src=window.Logos[key];img.alt='';n.append(img)}else n.textContent=(r.name||'?').slice(0,1).toUpperCase();return n}
async function db(){return new Promise((res,rej)=>{const req=indexedDB.open('boveda-'+window.BovedaUser.id,1);req.onupgradeneeded=()=>req.result.createObjectStore('vault');req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})}
const localMode = !/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(window.BovedaConfig.googleClientId);
const localStore = {
  read: () => localVault(),
  async current() {
    const saved = await this.read();
    return saved ? { id: saved.revision } : null;
  },
  async append(bytes, expected) {
    BovedaDrive.validate(bytes);
    const database = await db();
    const revision = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('vault', 'readwrite');
      const store = tx.objectStore('vault');
      const read = store.get('current');
      let conflict = false;
      read.onsuccess = () => {
        if ((read.result?.revision ?? null) !== expected) {
          conflict = true;
          tx.abort();
          return;
        }
        store.put({ bytes, revision }, 'current');
      };
      tx.oncomplete = () => { database.close(); resolve(revision); };
      tx.onabort = () => { database.close(); reject(conflict ? Error('CONFLICT') : tx.error); };
    });
  },
  disconnect() {}
};
const drive = localMode ? localStore : new BovedaDrive.Drive();
async function localVault(key='current'){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('vault','readonly'),q=t.objectStore('vault').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);t.oncomplete=()=>d.close()})}
async function recovery(value){const d=await db();return new Promise((resolve,reject)=>{const t=d.transaction('vault','readwrite');t.objectStore('vault').put(value,'pendingSync');t.oncomplete=()=>{d.close();resolve()};t.onerror=t.onabort=()=>{d.close();reject(t.error)}})}
async function stored(){return drive.read()}
async function write(bytes,expected){await recovery({bytes,revision:expected,saved:Date.now(),confirmed:false});const next=await drive.append(bytes,expected||null);await recovery({bytes,revision:next,saved:Date.now(),confirmed:true}).catch(()=>{});driveMessage(localMode ? 'Guardado cifrado en este navegador.' : 'Google Drive conectado. Último guardado confirmado.');return next}
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('boveda-change-'+window.BovedaUser.id):null;
channel?.addEventListener('message',e=>{if(session&&!demo&&e.data!==revision){unpersisted=true;$('#saveState').textContent='Hay cambios en otra pestaña. Exporta tu copia antes de continuar.';toast('Conflicto entre pestañas: se ha detenido el guardado.')}});
async function persist(){if(demo){$('#saveState').textContent='Demo ficticia · los cambios se descartan al bloquear';return}if(unpersisted)throw Error('CONFLICT');const ticket=epoch;session.replace(records);const bytes=await session.save();records=session.list();if(ticket!==epoch)throw Error('LOCKED');try{revision=await write(bytes,revision);channel?.postMessage(revision);$('#saveState').textContent=(localMode ? 'Guardado en este navegador · ' : 'Sincronizado con Drive · ')+new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});storageOK=true}catch(e){storageOK=false;$('#saveState').textContent='Cambios en memoria. Descarga una copia cifrada antes de cerrar.';throw e}}
async function operation(fn){if(busy)return;busy=true;const controls=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);controls.forEach(([b])=>b.disabled=true);try{await fn()}catch(e){toast(e.message==='GOOGLE_SIGNIN'?'Vuelve a conectar Google Drive. Tus cambios siguen en la copia local de recuperación.':e.message==='CONFLICT'?'Hay versiones simultáneas. Exporta tus cambios y abre Copias y conflictos.':e.message==='LOCKED'?'La bóveda se ha bloqueado.':'No se pudo completar. Conserva la sesión y exporta una copia cifrada.')}finally{busy=false;controls.forEach(([b,disabled])=>b.disabled=disabled);if((document.hidden||accessEnded)&&session)lock();document.body.style.visibility=""}}
function openSession(s,isDemo=false){session=s;records=s.list();for(const r of records)if(!(r.extras||[]).some(x=>x.label===typeField))setAccountType(r,suggestedType(r));demo=isDemo;activity=Date.now();$('#gate').hidden=true;$('#workspace').hidden=false;$('#nav').hidden=false;$('#master').value='';$('#confirmMaster').value='';$('#modeLabel').textContent=demo?'Demo ficticia. No contiene tus cuentas.':localMode ? 'Guardado cifrado en este navegador · conserva copias de seguridad.' : 'Sincronización cifrada con Google Drive · conserva copias de seguridad.';$('#saveState').textContent=demo?'Demo ficticia · cambios temporales':'Bóveda desbloqueada';render()}
function lock(){if(busy)return;epoch++;document.querySelectorAll('dialog[open]').forEach(d=>d.close());session?.close();session=null;records=[];pending=[];fileBytes=null;$('#cards').replaceChildren();$('#detailContent').replaceChildren();$('#fields').replaceChildren();$('#extraFields').replaceChildren();$('#extraRows').replaceChildren();$('#filePassword').value='';$('#rekeyConfirm').value='';$('#reviewNames').replaceChildren();$('#search').value='';$('#workspace').hidden=true;$('#nav').hidden=true;$('#gate').hidden=false;$('#gateTitle').textContent='Vuelve a tu espacio';$('#confirmWrap').hidden=true;$('#confirmMaster').required=false;$('#master').minLength=1;$('#master').autocomplete='current-password';$('#unlockSubmit').textContent='Desbloquear';$('#gateSub').textContent='Introduce la contraseña maestra de tu bóveda.';demo=false;unpersisted=false;$('#master').focus();stored().then(current=>{if(!current){$('#gateTitle').textContent='Crea tu espacio';$('#gateSub').textContent='Elige una contraseña maestra de al menos 12 caracteres. No se puede recuperar si la olvidas.';$('#confirmWrap').hidden=false;$('#confirmMaster').required=true;$('#master').minLength=12;$('#master').autocomplete='new-password';$('#unlockSubmit').textContent='Crear bóveda'}}).catch(()=>{})}
function mask(value){return value?'••••••••••••':'Sin contraseña'}
function secretLine(value){let n=el('div','secret-row'),v=el('code','',mask(value));n.append(v);if(value){let timer;const reveal=button('◉',()=>{let show=v.textContent===mask(value);v.textContent=show?value:mask(value);reveal.setAttribute('aria-label',show?'Ocultar contraseña':'Revelar contraseña');clearTimeout(timer);if(show)timer=setTimeout(()=>v.textContent=mask(value),15000)},'icon-btn');reveal.setAttribute('aria-label','Revelar contraseña');let copy=button('⧉',()=>copySecret(value),'icon-btn');copy.setAttribute('aria-label','Copiar contraseña');n.append(reveal,copy)}return n}
async function copySecret(value){try{await navigator.clipboard.writeText(value);toast('Copiado al portapapeles')}catch{toast('No se pudo copiar. Revela el dato y selecciónalo manualmente.')}}
function render(){updateTypeCounts();let query=normalize($('#search').value);let list=records.filter(r=>[r.name,r.alias,r.username,r.email,safeURL(r.url)?.hostname].some(v=>normalize(v).includes(query))&&(!$('#favoriteFilter').ariaPressed||$('#favoriteFilter').ariaPressed==='false'||r.favorite)&&(!$('#typeFilter').value||accountType(r)===$('#typeFilter').value));list.sort($('#sort').value==='recent'?(a,b)=>(b.updated||0)-(a.updated||0):(a,b)=>(a.name||'').localeCompare(b.name||'','es'));$('#count').textContent=list.length+' '+(list.length===1?'cuenta':'cuentas');$('#cards').replaceChildren();$('#empty').hidden=list.length>0;if(!list.length){$('#empty h2').textContent=query?'No encontramos esa cuenta.':'Tu siguiente cuenta empieza aquí.';$('#empty p').textContent=query?'Prueba con otro nombre, correo o dominio.':'Añade una cuenta o importa tu Excel desde Ajustes.'}for(const r of list){const card=el('article','card'),top=el('div','card-top'),fav=button(r.favorite?'★':'☆',()=>operation(async()=>{r.favorite=!r.favorite;await persist();render()}),'fav');fav.setAttribute('aria-label','Favorita: '+r.name);fav.setAttribute('aria-pressed',!!r.favorite);top.append(logo(r),fav);const title=button(r.name+(r.alias?' · '+r.alias:''),()=>showDetail(r),'card-title');card.append(top,title,el('div','account-type',accountType(r)),el('div','card-user',r.email||r.username||'Sin usuario registrado'),secretLine(r.password||r.pin));let bottom=el('div','card-bottom'),url=safeURL(r.url);if(url){let a=el('a','',url.hostname+' ↗');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';bottom.append(a)}else bottom.append(el('span','','Sin web registrada'));bottom.append(button('Ver detalle',()=>showDetail(r),'detail-button'));card.append(bottom);$('#cards').append(card)}}
function showDetail(r){selected=r.id;$('#detailContent').replaceChildren();const heading=el('h3','',r.name);$('#detailContent').append(heading);detailField('Tipo de cuenta',accountType(r),false);for(const [key,label]of Object.entries(names)){if(key==='name'||!r[key])continue;detailField(label,r[key],secretKeys.has(key))}for(const x of r.extras||[])if(x.value&&x.label!==typeField)detailField(x.label,x.value,x.secret!==false);$('#detail').showModal()}
function detailField(label,value,secret){const n=el('div','detail-field');n.append(el('small','',label));let row=el('div','detail-value');if(secret)row.append(secretLine(String(value)));else{row.append(el('span','',String(value)));let b=button('⧉',()=>copySecret(String(value)),'icon-btn');b.setAttribute('aria-label','Copiar '+label);row.append(b)}n.append(row);$('#detailContent').append(n)}
function edit(r=null){editing=r?.id||null;dirty=false;$('#editTitle').textContent=r?'Editar cuenta':'Nueva cuenta';$('#fields').replaceChildren();$('#extraFields').replaceChildren();for(const [key,label]of Object.entries(names)){const l=el('label','',label),i=el('input');i.name=key;i.type=secretKeys.has(key)?'password':'text';i.value=r?.[key]||'';i.maxLength=10000;i.autocomplete='off';if(key==='name')i.required=true;if(key==='url')i.placeholder='https://…';l.append(i);if(secretKeys.has(key)){let b=button('Mostrar / ocultar',()=>i.type=i.type==='password'?'text':'password','subtle');l.append(b)}$('#'+(['name','alias','username','email','password','url'].includes(key)?'fields':'extraFields')).append(l)}$('#extraRows').replaceChildren();typeEditor(r);for(const x of r?.extras||[])if(x.label!==typeField)addExtra(x);$('#editor').showModal()}
$('#accountForm').addEventListener('input',()=>dirty=true);$('#accountForm').onsubmit=e=>{e.preventDefault();operation(async()=>{const form=new FormData(e.target);let r=editing?records.find(r=>r.id===editing):{id:crypto.randomUUID(),favorite:false};let values=Object.fromEntries(Object.keys(names).map(k=>[k,String(form.get(k)||'')]));values.name=values.name.trim();if(!values.name)return;if(values.url&&!safeURL(values.url)){toast('Introduce una web http o https válida, sin usuario ni contraseña.');return}if(!editing&&records.some(x=>normalize(x.name)===normalize(values.name))&&!confirm('Ya existe una cuenta con este nombre. ¿Añadir otra cuenta independiente?'))return;const extras=[...$('#extraRows').children].map(row=>({label:row.querySelector('input').value,value:row.querySelector('textarea').value,secret:true}));Object.assign(r,values,{extras,updated:Date.now()});setAccountType(r,String(form.get('accountType')||'Sin clasificar'));if(!editing)records.push(r);try{await persist();dirty=false;$('#editor').close();render();toast('Cuenta guardada')}catch(err){render();throw err}})};
$('#addBtn').onclick=$('#emptyAdd').onclick=()=>edit();$('#editBtn').onclick=()=>{let r=records.find(r=>r.id===selected);$('#detail').close();edit(r)};$('#deleteBtn').onclick=()=>operation(async()=>{let r=records.find(r=>r.id===selected);if(!confirm('¿Eliminar '+r.name+' de la bóveda?'))return;records=records.filter(x=>x.id!==selected);await persist();$('#detail').close();render();toast('Cuenta eliminada')});
$('#generateBtn').onclick=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-=?';let s='';while(s.length<24){let a=new Uint8Array(32);crypto.getRandomValues(a);for(const v of a)if(v<Math.floor(256/alphabet.length)*alphabet.length&&s.length<24)s+=alphabet[v%alphabet.length]}$('#accountForm [name=password]').value=s;dirty=true;toast('Contraseña generada · guarda la cuenta para conservarla')};
$('#search').oninput=render;$('#sort').onchange=render;$('#favoriteFilter').onclick=()=>{$('#favoriteFilter').ariaPressed=$('#favoriteFilter').ariaPressed==='true'?'false':'true';render()};$('#lockBtn').onclick=lock;$('#settingsBtn').onclick=()=>$('#settings').showModal();$('#idle').onchange=()=>idle=+$('#idle').value;
function closeDialog(d){if(d.id==='editor'&&dirty&&!confirm('¿Descartar los cambios sin guardar?'))return;d.close()}
document.querySelectorAll('.close').forEach(b=>b.onclick=()=>closeDialog(b.closest('dialog')));$('#editor').addEventListener('cancel',e=>{if(dirty&&!confirm('¿Descartar los cambios sin guardar?'))e.preventDefault()});
$('#unlockForm').onsubmit=e=>{e.preventDefault();if(!window.isSecureContext||!crypto.subtle){$('#gateError').textContent='Esta vista no permite cifrado. Descarga el HTML y ábrelo en Chrome o Edge, o usa localhost/HTTPS.';return}operation(async()=>{$('#gateError').textContent='';try{let current=await stored();if(current){const s=await VaultCore.open(current.bytes,$('#master').value);revision=current.revision;openSession(s)}else{if($('#master').value.length<12)throw Error('Elige al menos 12 caracteres.');if($('#master').value!==$('#confirmMaster').value)throw Error('Las contraseñas no coinciden.');const s=await VaultCore.create($('#master').value);revision=0;openSession(s);await persist()}}catch(err){$('#gateError').textContent=err.message.startsWith('Elige')||err.message.includes('coinciden')?err.message:'No se pudo abrir la bóveda. Comprueba la contraseña maestra y el almacenamiento.'}})};
$('#demoBtn').onclick=()=>operation(async()=>{const s=await VaultCore.create('Demo ficticia temporal 2026');s.replace([{id:crypto.randomUUID(),name:'Google',alias:'Personal',email:'borja@example.test',password:'Ejemplo-ficticio-83!',url:'https://accounts.google.com',favorite:true,extras:[]},{id:crypto.randomUUID(),name:'Revolut',alias:'Viajes',username:'usuario_demo',password:'Solo-para-demo-29!',url:'https://www.revolut.com',extras:[]},{id:crypto.randomUUID(),name:'Notion',email:'trabajo@example.test',password:'Clave-ficticia-72!',url:'https://www.notion.so',extras:[]},{id:crypto.randomUUID(),name:'GitHub',username:'demo-personal',password:'Ficticia-no-utilizar-42!',url:'https://github.com',extras:[]}]);openSession(s,true)});
async function exportVault(){if(!session)return;await operation(async()=>{session.replace(records);let bytes=await session.save();const u=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));const a=el('a');a.href=u;a.download='Boveda-'+new Date().toISOString().slice(0,10)+'.kdbx';a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);$('#backupDate').textContent='Descarga solicitada: '+new Date().toLocaleString('es-ES')+'. Verifica el archivo restaurándolo.';toast('Copia cifrada preparada. Comprueba que se ha descargado.')})}
$('#exportBtn').onclick=$('#settingsExport').onclick=exportVault;
function pick(kind){const input=$('#fileInput');input.value='';input.accept=kind==='excel'?'.xlsx':'.kdbx';input.onchange=async()=>{const f=input.files[0];if(!f)return;if(f.size>5*1024*1024){toast('El archivo supera el límite de 5 MB.');return}if(kind==='excel'){await operation(async()=>{try{pending=await ExcelImport.read(f);$('#reviewSummary').textContent=pending.length+' cuentas detectadas. Solo se muestran los nombres en esta revisión.';$('#reviewNames').replaceChildren(...pending.map(r=>el('div','',r.name)));if($('#settings').open)$('#settings').close();$('#review').showModal()}catch(e){toast('No se pudo importar. Utiliza el Excel de cuentas compatible, sin modificar su estructura.')}})}else{fileBytes=new Uint8Array(await f.arrayBuffer());passwordAction='open';$('#passwordTitle').textContent='Abrir bóveda cifrada';$('#rekeyConfirmWrap').hidden=true;$('#filePassword').minLength=1;$('#passwordError').textContent='';$('#filePassword').value='';$('#passwordDialog').showModal()}};input.click()}
$('#openVault').onclick=$('#importVault').onclick=()=>pick('vault');$('#importExcel').onclick=()=>pick('excel');$('#confirmImport').onclick=()=>operation(async()=>{const ticket=epoch;records.push(...pending.map(r=>({...r,id:crypto.randomUUID(),updated:Date.now()})));await persist();if(ticket!==epoch)return;pending=[];$('#review').close();render();toast('Cuentas importadas')});
$('#rekeyBtn').onclick=()=>{passwordAction='rekey';$('#passwordTitle').textContent='Nueva contraseña maestra';$('#rekeyConfirmWrap').hidden=false;$('#filePassword').minLength=12;$('#filePassword').value='';$('#rekeyConfirm').value='';$('#passwordError').textContent='';$('#passwordDialog').showModal()};
$('#passwordForm').onsubmit=e=>{e.preventDefault();operation(async()=>{try{if(passwordAction==='rekey'){if($('#filePassword').value!==$('#rekeyConfirm').value){$('#passwordError').textContent='Las contraseñas no coinciden.';return}session.replace(records);const bytes=await session.rekey($('#filePassword').value);try{if(!demo){revision=await write(bytes,revision);channel?.postMessage(revision)}session.commitRekey();}catch(err){session.rollbackRekey();throw err}toast('Contraseña actualizada. Exporta una nueva copia cifrada.')}else{const next=await VaultCore.open(fileBytes,$('#filePassword').value);const current=await stored();if((session||current)&&!confirm(localMode ? 'Esta copia sustituirá la bóveda de este navegador. ¿Continuar?' : 'Esta copia pasará a ser la bóveda actual en tus dispositivos. Se conserva la versión anterior. ¿Continuar?')){next.close();return}revision=current?.revision||0;const bytes=await next.save();revision=await write(bytes,revision);session?.close();unpersisted=false;openSession(next);channel?.postMessage(revision);if($('#settings').open)$('#settings').close()}$('#passwordDialog').close();$('#filePassword').value='';$('#rekeyConfirm').value='';fileBytes=null}catch(err){$('#passwordError').textContent='No se pudo completar. Contraseña incorrecta, archivo incompatible, alterado o fallo de guardado.'}})};
for(const type of ['pointerdown','keydown','input'])document.addEventListener(type,()=>activity=Date.now(),{passive:true});setInterval(()=>{if(session&&Date.now()-activity>idle*60000)lock()},1000);document.addEventListener('visibilitychange',()=>{if(document.hidden&&session){document.body.style.visibility='hidden';lock()}else document.body.style.visibility=''});window.addEventListener('focus',()=>{if(session&&Date.now()-activity>idle*60000)lock()});window.addEventListener('beforeunload',e=>{if(session&&(!storageOK||unpersisted||dirty)){e.preventDefault();e.returnValue=''}});document.addEventListener('keydown',e=>{if(e.key==='/'&&session&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();$('#search').focus()}});
$('#unlockSubmit').disabled=true;


function addExtra(x={label:'',value:''}){const row=el('div','extra-editor');const label=el('label','','Nombre del campo');const input=el('input');input.value=x.label;input.required=true;label.append(input);const value=el('label','','Valor');const area=el('textarea');area.value=x.value;area.rows=3;area.spellcheck=false;value.append(area);row.append(label,value,button('Quitar campo',()=>{row.remove();dirty=true},'subtle'));$('#extraRows').append(row)}
$('#addExtra').onclick=()=>{addExtra();dirty=true};


$('#typeFilter').onchange=render;

// Connection is always initiated by a tap/click (required by Safari and Google).
function driveMessage(message){$('#driveStatus').textContent=message}
async function refreshDriveGate(){
  $('#unlockSubmit').disabled=true;
  try{
    const current=await stored();
    $('#confirmWrap').hidden=!!current;$('#confirmMaster').required=!current;
    $('#master').minLength=current?1:12;$('#master').autocomplete=current?'current-password':'new-password';
    $('#unlockSubmit').textContent=current?'Desbloquear':'Crear bóveda';
    $('#gateTitle').textContent=current?'Vuelve a tu espacio':'Empieza con tus cuentas';
    $('#gateSub').textContent=current ? 'Introduce la contraseña maestra de tu bóveda.' : 'Abre una copia .kdbx o crea una bóveda vacía para importar tu Excel desde Ajustes.';
    $('#gateError').textContent='';$('#unlockSubmit').disabled=false;
    driveMessage(localMode ? 'Modo local. Solo este navegador guarda la bóveda cifrada.' : current?'Google Drive conectado. Última versión disponible.':'Google Drive conectado. Todavía no hay una bóveda guardada.');
  }catch(e){driveMessage(e.message==='CONFLICT'?'Hay versiones simultáneas. Abre Copias y conflictos para revisarlas.':localMode ? 'No se pudo acceder al almacenamiento de este navegador.' : 'No se pudo consultar Drive. Vuelve a conectar tu cuenta.');}
}
function downloadBytes(bytes,name){const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
let googleClient=null,loadingGoogle=null;
function getGoogle(){
  if(window.google?.accounts?.oauth2)return Promise.resolve();
  if(!loadingGoogle)loadingGoogle=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=()=>{loadingGoogle=null;reject(Error('GOOGLE_LOAD'))};document.head.append(script)});
  return loadingGoogle;
}
async function prepareGoogle(){
  const id=window.BovedaConfig.googleClientId;
  if(!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)){
    driveMessage('La conexión con Google Drive todavía no está configurada. Falta el ID público de aplicación de Google.');$('#connectDrive').disabled=true;return;
  }
  try{
    await getGoogle();
    googleClient=google.accounts.oauth2.initTokenClient({client_id:id,scope:BovedaDrive.SCOPE,include_granted_scopes:false,
      callback:async response=>{
        if(response.error||!google.accounts.oauth2.hasGrantedAllScopes(response,BovedaDrive.SCOPE)){driveMessage('Google no ha autorizado la conexión. Puedes volver a intentarlo.');return}
        drive.authorize(response.access_token,response.expires_in);$('#disconnectDrive').hidden=false;
        await refreshDriveGate();
      },error_callback:()=>driveMessage('No se completó la conexión. Permite la ventana de Google y vuelve a pulsar Conectar.')});
    $('#connectDrive').disabled=false;
  }catch{driveMessage('No se pudo cargar la conexión de Google. Recarga la página para reintentar.');}
}
if (localMode) {
  $('#driveTitle').textContent = 'Almacenamiento cifrado local';
  $('#connectDrive').hidden = true;
  $('#showHistory').hidden = true;
  void refreshDriveGate();
} else {
  $('#connectDrive').disabled = true;
  void prepareGoogle();
}
$('#connectDrive').onclick=()=>{
  if(!googleClient||busy)return;
  if(session){if((dirty||!storageOK||unpersisted)&&!confirm('Hay cambios pendientes. Descarga una copia antes de cambiar de cuenta. ¿Continuar?'))return;lock()}
  drive.disconnect();revision=0;$('#unlockSubmit').disabled=true;$('#driveHistory').hidden=true;$('#historyList').replaceChildren();
  googleClient.requestAccessToken({prompt:'select_account'});
};
$('#disconnectDrive').onclick=()=>{
  if(busy)return;
  if(session&&(dirty||!storageOK||unpersisted)&&!confirm('Hay cambios pendientes. Conserva una copia cifrada antes de desconectar. ¿Continuar?'))return;
  lock();drive.disconnect();$('#unlockSubmit').disabled=true;$('#disconnectDrive').hidden=true;$('#historyList').replaceChildren();$('#driveHistory').hidden=true;driveMessage('Google Drive desconectado. Las copias guardadas en Drive se conservan.');
};
$('#recoveryCopy').onclick=()=>operation(async()=>{const p=await localVault('pendingSync');if(!p){toast('No hay una copia local de recuperación en este navegador.');return}downloadBytes(p.bytes,'Boveda-recuperacion.kdbx')});
$('#showHistory').onclick=()=>operation(async()=>{
  const versions=await drive.versions(),latest=BovedaDrive.heads(versions),latestIds=latest.map(f=>f.id);$('#historyList').replaceChildren();$('#driveHistory').hidden=false;
  if(!versions.length){$('#historyList').append(el('li','','Todavía no hay copias en Drive.'));return}
  for(const file of versions.sort((a,b)=>String(b.createdTime).localeCompare(String(a.createdTime))).slice(0,50)){
    const row=el('li');row.append(el('span','',new Date(file.createdTime).toLocaleString('es-ES')+(latestIds.includes(file.id)?' · Actual':' · Copia anterior')));
    row.append(button('Descargar copia cifrada',()=>operation(async()=>downloadBytes(await drive.download(file),'Boveda-copia.kdbx'))));
    row.append(button('Conservar como actual',()=>operation(async()=>{
      if(!confirm('Esta versión será la actual en tus dispositivos. No combina cuentas. Descarga antes las copias que necesites; las versiones anteriores se conservan. ¿Continuar?'))return;
      const bytes=await drive.download(file);await recovery({bytes,saved:Date.now(),confirmed:false});
      const id=await drive.append(bytes,file.id,latestIds);await recovery({bytes,revision:id,saved:Date.now(),confirmed:true});
      // operation owns the controls, so defer the privacy lock until it finishes.
      setTimeout(()=>{lock();refreshDriveGate()},0);toast('Versión seleccionada. Desbloquea con su contraseña maestra.');$('#driveHistory').hidden=true;
    })));
    $('#historyList').append(row);
  }
});
let checkingDrive=false;
setInterval(async()=>{
  if(checkingDrive||busy||!session||demo||unpersisted||document.hidden)return;checkingDrive=true;
  try{const latest=await drive.current();if(!latest||latest.id!==revision){if(dirty||!storageOK){unpersisted=true;$('#saveState').textContent='Hay cambios en otro dispositivo. Exporta tus cambios antes de continuar.'}else{lock();await refreshDriveGate();toast('Hay una versión nueva. Desbloquea para cargarla.')}}}
  catch(e){if(e.message==='CONFLICT'){unpersisted=true;driveMessage('Hay versiones simultáneas. Exporta tus cambios y abre Copias y conflictos.')}else driveMessage(localMode ? 'No se pudo comprobar la copia local. Exporta tus cambios.' : 'Sin sincronización confirmada. Vuelve a conectar Drive; conserva una copia de tus cambios.')}
  finally{checkingDrive=false}
},15000);
window.addEventListener('boveda-signout',()=>{accessEnded=true;drive.disconnect();epoch++;document.querySelectorAll('dialog[open]').forEach(d=>d.close());if(!busy)lock();document.getElementById('app').hidden=true;channel?.close()});
