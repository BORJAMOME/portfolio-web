/* ═══════════════════════════════════════════════
   tools/gmail-procesos/Codigo.gs — Gmail → Supabase (procesos de selección), en TU cuenta de Google
   ─────────────────────────────────────────────────
   Google Apps Script. Gratis y funciona con el ordenador apagado.
   Cada 15 minutos busca SOLO correos de procesos de selección (recibidos y enviados), y manda a la
   Edge Function «procesos-sync» un resumen de cada uno: remitente, destinatario, asunto, fecha y un
   extracto sin el texto citado. Allí unas reglas deciden si crean o actualizan un proceso.

   Permisos: solo LECTURA de Gmail (gmail.readonly). No marca, no etiqueta, no borra, no envía.
   Secretos: en Configuración del proyecto → Propiedades del script (nunca en este código):
     PROCESOS_SYNC_URL   https://<proyecto>.supabase.co/functions/v1/procesos-sync
     GMAIL_SYNC_SECRET   el mismo valor que el secreto de la función
   Guía paso a paso: tools/gmail-procesos/README.md
   ═══════════════════════════════════════════════ */

var BUSQUEDA = '(candidatura OR "proceso de selección" OR "proceso de seleccion" OR entrevista OR interview OR vacante ' +
  'OR "tu solicitud" OR "your application" OR "gracias por tu interés" OR "hemos recibido" OR "gracias por inscribirte" ' +
  'OR "prueba técnica" OR "caso práctico" OR assessment OR cuestionario OR "otros candidatos" OR "no podemos contar" ' +
  'OR unfortunately OR "siguiente fase" OR "queremos conocerte" OR "nos complace ofrecerte") ' +
  '-category:promotions -category:social -from:mailsuite.com -from:jobalerts-noreply@linkedin.com';
var LOTE = 50;               // correos por envío (la función acepta 50 como máximo)
var MAX_POR_EJECUCION = 200;
var SOLAPE_SEG = 3600;       // vuelve a mirar la última hora por si Gmail tarda en indexar (la función no duplica)

function propiedad_(k) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error('Falta la propiedad del script «' + k + '». Mira tools/gmail-procesos/README.md');
  return v;
}

/** Lo que ejecuta el temporizador. */
function sincronizar() {
  var props = PropertiesService.getScriptProperties();
  var ahora = Math.floor(Date.now() / 1000);
  var desde = Number(props.getProperty('ULTIMA_SINCRONIZACION')) || (ahora - 3 * 86400);   // la primera vez, 3 días
  var resumen = enviar_(buscar_(desde - SOLAPE_SEG), false);
  props.setProperty('ULTIMA_SINCRONIZACION', String(ahora));
  console.log('Sincronización: ' + JSON.stringify(resumen));
}

/** Carga inicial o recuperación: los últimos N días (ejecútala a mano desde el editor). */
function importarDias(dias) {
  var n = Number(dias) || 30;
  console.log(JSON.stringify(enviar_(buscar_(Math.floor(Date.now() / 1000) - n * 86400), false)));
}

/** Prueba sin enviar nada: muestra en el registro qué correos mandaría. */
function probar() {
  var lista = buscar_(Math.floor(Date.now() / 1000) - 7 * 86400);
  lista.forEach(function (m) { console.log(m.fecha + ' · ' + m.direccion + ' · ' + m.remitente + ' · ' + m.asunto); });
  console.log(lista.length + ' correos (últimos 7 días). No se ha enviado nada.');
}

/** Crea el temporizador de 15 minutos (borra los anteriores de esta función). */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(15).create();
  console.log('Temporizador instalado: cada 15 minutos.');
}

/** Para la automatización. */
function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t);
  });
  console.log('Temporizador eliminado.');
}

/* ─── interno ─── */
function buscar_(desdeSeg) {
  var q = BUSQUEDA + ' after:' + desdeSeg, out = [], token = null;
  do {
    var r = Gmail.Users.Messages.list('me', { q: q, maxResults: 100, pageToken: token });
    (r.messages || []).forEach(function (ref) {
      if (out.length >= MAX_POR_EJECUCION) return;
      try {
        out.push(resumir_(Gmail.Users.Messages.get('me', ref.id, { format: 'full' })));
      } catch (e) {
        console.warn('Se omite un correo que no se pudo leer (' + ref.id + '): ' + e.message);
      }
    });
    token = r.nextPageToken;
  } while (token && out.length < MAX_POR_EJECUCION);
  return out;
}

function cabecera_(m, nombre) {
  var hs = (m.payload && m.payload.headers) || [];
  for (var i = 0; i < hs.length; i++) if (hs[i].name.toLowerCase() === nombre) return hs[i].value || '';
  return '';
}

/** Gmail entrega el cuerpo en base64 «seguro para URL» y sin el relleno final: se normaliza antes de decodificar. */
function decodificar_(data) {
  try {
    var s = String(data).replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    while (s.length % 4) s += '=';
    return Utilities.newBlob(Utilities.base64Decode(s)).getDataAsString('UTF-8');
  } catch (e) {
    return '';   // una parte ilegible no debe impedir leer el resto
  }
}

function texto_(payload) {
  var plano = '', html = '';
  (function recorrer(p) {
    if (!p) return;
    var data = p.body && p.body.data;
    if (data && p.mimeType === 'text/plain' && !plano) plano = decodificar_(data);
    else if (data && p.mimeType === 'text/html' && !html) html = decodificar_(data);
    (p.parts || []).forEach(recorrer);
  })(payload);
  var t = plano || html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  // sin lo citado de mensajes anteriores
  var lineas = t.replace(/\r/g, '').split('\n'), limpio = [];
  for (var i = 0; i < lineas.length; i++) {
    var l = lineas[i];
    if (/^\s*>/.test(l)) continue;
    if (/^(El|On) .{5,120}(escribió|wrote):\s*$/i.test(l.trim())) break;
    if (/^-{2,}\s*(Original Message|Mensaje original|Forwarded message|Mensaje reenviado)/i.test(l.trim())) break;
    limpio.push(l);
  }
  return limpio.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
}

function resumir_(m) {
  return {
    message_id: m.id,
    thread_id: m.threadId,
    direccion: (m.labelIds || []).indexOf('SENT') > -1 ? 'enviado' : 'recibido',
    remitente: cabecera_(m, 'from').slice(0, 320),
    destinatario: cabecera_(m, 'to').slice(0, 320),
    asunto: cabecera_(m, 'subject').slice(0, 300),
    fecha: new Date(Number(m.internalDate)).toISOString(),
    texto: texto_(m.payload)
  };
}

function enviar_(lista, simular) {
  var total = { correos: lista.length, nuevos: 0, aplicados: 0, por_revisar: 0, ignorados: 0, repetidos: 0, invalidos: 0 };
  if (simular || !lista.length) return total;
  var url = propiedad_('PROCESOS_SYNC_URL'), secreto = propiedad_('GMAIL_SYNC_SECRET');
  for (var i = 0; i < lista.length; i += LOTE) {
    var r = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + secreto },
      payload: JSON.stringify({ messages: lista.slice(i, i + LOTE) })
    });
    if (r.getResponseCode() !== 200) throw new Error('procesos-sync respondió ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
    var d = JSON.parse(r.getContentText());
    ['nuevos', 'aplicados', 'por_revisar', 'ignorados', 'repetidos', 'invalidos'].forEach(function (k) { total[k] += d[k] || 0; });
  }
  return total;
}
