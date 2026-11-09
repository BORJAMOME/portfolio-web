# Bóveda: activar Google Drive

La app vive en `boveda.html` y se abre desde Área privada → Apps → Bóveda. Usa el acceso existente del portfolio, sin ChatGPT. El código puede ser público: no contiene tu bóveda ni contraseñas reales.

## Importar el Excel en este navegador

Crea una bóveda con una contraseña maestra y abre **Ajustes → Importar Excel local**. Selecciona el archivo .xlsx, revisa las cuentas detectadas y confirma la importación. El navegador procesa el Excel y guarda la bóveda cifrada en IndexedDB. Exporta una copia KDBX para restaurarla en otro dispositivo o navegador.

## Configuración inicial de Google (una sola vez)

1. Abre https://console.cloud.google.com/ y crea o elige un proyecto propio para Bóveda.
2. En **APIs y servicios → Biblioteca**, habilita **Google Drive API**.
3. En **Google Auth Platform**, configura **Branding**, **Audience** y **Data Access**. Para uso personal puedes comenzar en modo de prueba y añadir tu cuenta de Google como usuario de prueba. Completa los datos y enlaces que Google solicite; revisa los requisitos antes de pasar a producción.
4. Añade únicamente el permiso `https://www.googleapis.com/auth/drive.appdata`. No hace falta acceso a todo Drive.
5. En **Clients**, crea un cliente de tipo **Web application**. En **Authorized JavaScript origins**, añade los orígenes exactos que utilizarás: `https://borjamora.es` y, solo si realmente lo utilizas, `https://www.borjamora.es`. Para pruebas locales puedes añadir `http://localhost:PUERTO`. Los orígenes no llevan ruta, fragmento ni barra final. El flujo utiliza una ventana de Google, no una redirección propia.
6. Copia el **Client ID** (termina en `.apps.googleusercontent.com`) en `googleClientId` de `boveda/config.js`. Ese identificador es público. **No copies el Client Secret, contraseñas ni tokens al repositorio ni al chat.**
7. Ejecuta `node tools/version-assets.mjs` y publica los cambios del portfolio mediante su proceso habitual de GitHub Pages. La integración local no modifica por sí sola la web publicada.

Referencias: https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid y https://developers.google.com/workspace/drive/api/guides/appdata

## Usar los mismos datos en ordenador e iPhone

1. Conserva una exportación `.kdbx` actualizada de la Bóveda que usas ahora.
2. En el ordenador, entra en el área privada del portfolio, abre Apps → Bóveda y pulsa **Conectar Google Drive**. Autoriza la aplicación en la ventana de Google.
3. Pulsa **Abrir archivo cifrado**, selecciona la exportación e introduce su contraseña. Solo se envía a Drive el resultado cifrado.
4. En Safari del iPhone, entra en la misma área privada y conecta **la misma cuenta de Google**, utilizando la misma aplicación OAuth. Introduce tu contraseña maestra para abrir la bóveda ya guardada. No importes otra copia si quieres usar la versión sincronizada.

El acceso al portfolio y la contraseña maestra son dos cosas distintas. Google autoriza el almacenamiento; la contraseña maestra descifra los datos en tu dispositivo. Si la olvidas, esta app no puede recuperarla.

## Guardado y recuperación

Cada guardado crea una copia KDBX nueva en la carpeta oculta `appDataFolder` de tu Google Drive. No aparece en Mi unidad ni se comparte mediante enlaces. Las versiones anteriores no se sobrescriben ni se borran automáticamente; consumen espacio. La app requiere conexión para leer y guardar en Drive. Los tokens de Google viven solo en memoria: al caducar o recargar puede ser necesario pulsar Conectar otra vez.

El historial forma una cadena de versiones. Dos guardados simultáneos conservan ambas ramas y generan un conflicto. Abre **Copias y conflictos**, descarga ambas copias y decide qué versión conservar como actual. Esta acción **no mezcla cuentas**: conserva una versión y registra las otras como antecedentes. La pantalla muestra las 50 versiones más recientes; cada consulta comprueba hasta 10.000 archivos y se detiene explícitamente si se supera el límite o falta historial.

Cada intento de guardado conserva además una copia cifrada en IndexedDB, separada por usuario del portfolio. Si una conexión falla, utiliza **Copia local de recuperación**. Mantén una exportación externa periódica: eliminar los datos de la app en Google puede borrar `appDataFolder`, y limpiar el navegador elimina su copia local. Si se pierde una respuesta después de subir un archivo, vuelve a consultar las versiones antes de repetir el guardado.

## Verificación y límites

Pruebas automáticas: `node --test tools/test-boveda.cjs` y `node tools/check-boveda.mjs`. Son datos ficticios y servicios simulados: no autorizan Google, no llaman a tu Drive ni modifican credenciales reales. La verificación real en Safari y Drive requiere configurar el cliente y que tú completes el consentimiento de Google. Se conserva el motor KDBX/Argon2 del prototipo; no se ha realizado una auditoría criptográfica independiente.

La app está aislada por permisos de Google y cifrado, pero comparte origen y código de confianza con el portfolio. Un script malicioso servido desde el mismo origen podría capturar datos al desbloquear; protege la cuenta de GitHub, los despliegues y la cuenta de Google.
