# inspiracion-meta

Datos de un enlace para **Color Studio · Inspiración** (`#/color/inspiracion`). Opcional: sin ella, la página
guarda el enlace igualmente y pide la imagen a mano.

| Acción | Entrada | Salida |
|---|---|---|
| `meta` | `{ action: "meta", url }` | `{ title, siteName, image, published, description, url }` (Open Graph, Twitter y `<title>`) |
| `image` | `{ action: "image", url }` | Los bytes de la imagen (solo JPEG, PNG o WebP, ≤ 10 MB) |

## Por qué existe

El navegador no puede leer otras webs (CORS) y la CSP del área privada no deja mostrar imágenes remotas
(`img-src 'self' data: blob:`). Esta función lee **solo la URL que pegas**, una vez, y devuelve los datos.
La imagen la reduce el navegador (sin EXIF) y se guarda en el bucket privado `armario`: no se enlaza a la web original.

## Seguridad

- Solo miembros del área privada (mismo `isMember` que `kanban-ia`). Se despliega con `--no-verify-jwt` porque la comprobación la hace ella.
- Solo `http(s)`, puertos 80/443, sin credenciales en la URL. Se rechazan `localhost`, `.local`, `.internal` y cualquier IP
  privada, de bucle, enlace local o reservada (también si el DNS del dominio apunta a ellas).
- Cada redirección (máx. 4) se vuelve a comprobar. Límite de tiempo 8 s, 1,5 MB de HTML y 10 MB de imagen.
- No guarda nada, no recorre enlaces y no usa servicios de pago ni claves de terceros.
- Límite conocido: entre la comprobación del DNS y la conexión, un dominio malicioso podría cambiar de IP (*DNS rebinding*).
  El riesgo es bajo porque solo la usan los miembros y la función no tiene acceso a nada interno más allá de la red de Supabase.

## Despliegue

```bash
supabase functions deploy inspiracion-meta --no-verify-jwt
```

No necesita secretos: `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase.

## Qué esperar

Funciona con la mayoría de blogs, revistas y tiendas que publican Open Graph. Instagram, Pinterest, TikTok y otras redes
suelen bloquear estas lecturas o pedir sesión: la página lo dice («No se ha podido leer la página») y deja subir la imagen
desde el dispositivo (o pegarla con Ctrl/⌘+V). Respeta las condiciones de cada sitio: es para guardar referencias personales, no para recopilar contenido.

## Pruebas

```bash
deno test --allow-read supabase/functions/
```

Sin red: `fetch` y el DNS están simulados (`inspiracion_meta.test.ts`).
