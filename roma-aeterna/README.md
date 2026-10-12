# Roma Aeterna (borjamora.es/roma-aeterna/)

Caesar III en el iPhone: app web instalable (PWA) dentro del área privada.

- **Motor:** [Augustus](https://github.com/Keriew/augustus) (fork de [Julius](https://github.com/bvschaik/julius)) compilado a WebAssembly con Emscripten: zoom con dos dedos y controles táctiles. Cambios para la web en `augustus-web-ios.patch`.
- **Importación:** el instalador de GOG (`.exe`) se desempaqueta en el propio navegador con [innoextract](https://constexpr.org/innoextract/) compilado a WebAssembly (`extract-worker.js`, cambios en `innoextract-web.patch`). También acepta un ZIP de la carpeta del juego.
- **Datos:** los archivos del juego y las partidas viven en IndexedDB del dispositivo. Aquí no hay ningún archivo del juego original.
- **Acceso:** `acceso.js` pide la contraseña del área privada (Supabase Auth), cierra esa sesión al momento y deja el dispositivo desbloqueado 90 días. Es una puerta de conveniencia: el motor es código abierto y GitHub Pages lo sirve a quien conozca la ruta.
- **Táctil (`touch.js`):** los toques en el mapa van directos al motor; los de la barra superior, el panel derecho y las ventanas se convierten en clics precisos, con lupa al mantener e imán hacia la barra superior. El motor expone `ra_*` (`augustus.c`) para saber qué es mapa y qué es interfaz. Centro de mando con atajos de teclado del juego (consejeros, capas, guardar, marcadores…).
- **Sin conexión:** `sw.js` guarda la app (ámbito: solo esta carpeta).

Página aparte del resto del sitio: no pasa por `build-en`, `version-assets` ni la comprobación de accesibilidad, y está fuera del sitemap (`noindex`).

Licencias: Augustus/Julius AGPL-3.0 (`LICENSE-augustus.txt`), innoextract zlib (`LICENSE-innoextract.txt`).
