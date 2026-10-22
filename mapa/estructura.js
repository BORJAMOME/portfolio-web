/* Generado por tools/mapa/build-mapa.mjs: no se edita a mano. */
export default {
 "huella": "54a8d35",
 "recuento": {
  "paginas": 20,
  "pestanas": 10,
  "tablas": 29,
  "funciones": 4,
  "herramientas": 14,
  "relaciones": 60
 },
 "columnas": [
  {
   "id": "col:web",
   "tipo": "columna",
   "etiqueta": "Portfolio web",
   "nota": "lo que ve cualquier visitante",
   "hijos": [
    {
     "id": "g:web:perfil",
     "tipo": "grupo",
     "etiqueta": "perfil/",
     "nota": "entrada y datos legales",
     "hijos": [
      {
       "id": "p:index",
       "tipo": "pagina",
       "etiqueta": "Inicio",
       "href": "./index.html",
       "archivo": "index.html"
      },
      {
       "id": "p:privacidad",
       "tipo": "pagina",
       "etiqueta": "Privacidad y cookies",
       "href": "./privacidad.html",
       "archivo": "privacidad.html"
      },
      {
       "id": "p:sobre-mi",
       "tipo": "pagina",
       "etiqueta": "Sobre mí",
       "href": "./sobre-mi.html",
       "archivo": "sobre-mi.html"
      }
     ]
    },
    {
     "id": "g:web:tematicas",
     "tipo": "grupo",
     "etiqueta": "temas/",
     "nota": "páginas por área de trabajo",
     "hijos": [
      {
       "id": "p:analisis-datos",
       "tipo": "pagina",
       "etiqueta": "Análisis de datos",
       "href": "./analisis-datos.html",
       "archivo": "analisis-datos.html"
      },
      {
       "id": "p:data-storytelling",
       "tipo": "pagina",
       "etiqueta": "Data Storytelling y diseño de dashboards",
       "href": "./data-storytelling.html",
       "archivo": "data-storytelling.html"
      },
      {
       "id": "p:power-bi",
       "tipo": "pagina",
       "etiqueta": "Power BI",
       "href": "./power-bi.html",
       "archivo": "power-bi.html"
      },
      {
       "id": "p:visualizacion-datos",
       "tipo": "pagina",
       "etiqueta": "Visualización de datos",
       "href": "./visualizacion-datos.html",
       "archivo": "visualizacion-datos.html"
      }
     ]
    },
    {
     "id": "g:web:casos",
     "tipo": "grupo",
     "etiqueta": "casos/",
     "nota": "plantilla común case.js",
     "hijos": [
      {
       "id": "p:airbnb-pais-vasco",
       "tipo": "pagina",
       "etiqueta": "Análisis del Mercado de Airbnb",
       "href": "./airbnb-pais-vasco.html",
       "archivo": "airbnb-pais-vasco.html"
      },
      {
       "id": "p:casa-origen",
       "tipo": "pagina",
       "etiqueta": "Casa Origen",
       "href": "./casa-origen.html",
       "archivo": "casa-origen.html"
      },
      {
       "id": "p:ibcs-ventas",
       "tipo": "pagina",
       "etiqueta": "Informe de ventas con enfoque IBCS",
       "href": "./ibcs-ventas.html",
       "archivo": "ibcs-ventas.html"
      },
      {
       "id": "p:informe-financiero",
       "tipo": "pagina",
       "etiqueta": "Informe Financiero Completo",
       "href": "./informe-financiero.html",
       "archivo": "informe-financiero.html"
      },
      {
       "id": "p:kosta-calida",
       "tipo": "pagina",
       "etiqueta": "Kosta Cálida",
       "href": "./kosta-calida.html",
       "archivo": "kosta-calida.html"
      },
      {
       "id": "p:perdidas-ganancias",
       "tipo": "pagina",
       "etiqueta": "Cuenta de Pérdidas y Ganancias",
       "href": "./perdidas-ganancias.html",
       "archivo": "perdidas-ganancias.html"
      },
      {
       "id": "p:rfm-hosteleria",
       "tipo": "pagina",
       "etiqueta": "Análisis RFM",
       "href": "./rfm-hosteleria.html",
       "archivo": "rfm-hosteleria.html"
      },
      {
       "id": "p:social-media",
       "tipo": "pagina",
       "etiqueta": "Social Media Performance 2025 vs 2024",
       "href": "./social-media.html",
       "archivo": "social-media.html"
      }
     ]
    },
    {
     "id": "g:web:manuales",
     "tipo": "grupo",
     "etiqueta": "manuales/",
     "nota": "cada manual con su propio sistema",
     "hijos": [
      {
       "id": "p:ml",
       "tipo": "carpeta",
       "etiqueta": "Manual de Machine Learning",
       "href": "./ml/",
       "archivo": "ml/"
      },
      {
       "id": "p:pbi",
       "tipo": "carpeta",
       "etiqueta": "Manual de Power BI",
       "href": "./pbi/",
       "archivo": "pbi/"
      }
     ]
    },
    {
     "id": "g:web:laboratorio",
     "tipo": "grupo",
     "etiqueta": "laboratorio/",
     "nota": "enlaza con el área privada",
     "hijos": [
      {
       "id": "p:descargas",
       "tipo": "pagina",
       "etiqueta": "Laboratorio",
       "href": "./descargas.html",
       "archivo": "descargas.html"
      },
      {
       "id": "p:dashboard/casa-origen",
       "tipo": "carpeta",
       "etiqueta": "Dashboard Casa Origen",
       "href": "./dashboard/casa-origen/",
       "archivo": "dashboard/casa-origen/"
      },
      {
       "id": "p:roma-aeterna",
       "tipo": "carpeta",
       "etiqueta": "Roma Aeterna",
       "href": "./roma-aeterna/",
       "archivo": "roma-aeterna/"
      }
     ]
    },
    {
     "id": "g:web:ingles",
     "tipo": "grupo",
     "etiqueta": "en/",
     "nota": "versión inglesa generada, no se edita",
     "hijos": [
      {
       "id": "x:en",
       "tipo": "carpeta",
       "etiqueta": "16 páginas en inglés",
       "archivo": "en/",
       "href": "./en/"
      }
     ]
    }
   ]
  },
  {
   "id": "col:privada",
   "tipo": "columna",
   "etiqueta": "Área privada",
   "nota": "con contraseña real (Supabase Auth)",
   "hijos": [
    {
     "id": "t:hoy",
     "tipo": "pestana",
     "etiqueta": "Hoy",
     "nota": "agenda y seguimiento",
     "href": "#/",
     "archivo": "area-privada-hoy.js",
     "hijos": [
      {
       "id": "m:kanban",
       "tipo": "modulo",
       "etiqueta": "Centro de trabajo",
       "nota": "tablero y capturas",
       "archivo": "area-privada-kanban.js"
      }
     ]
    },
    {
     "id": "t:studio",
     "tipo": "pestana",
     "etiqueta": "Studio",
     "nota": "proyectos, ideas y entregables",
     "href": "#/studio",
     "archivo": "area-privada-studio.js"
    },
    {
     "id": "t:calendario",
     "tipo": "pestana",
     "etiqueta": "Calendario",
     "nota": "solo lectura, desde Google",
     "href": "#/calendario",
     "archivo": "area-privada-calendario.js"
    },
    {
     "id": "t:entrevistas",
     "tipo": "pestana",
     "etiqueta": "Entrevistas",
     "nota": "procesos y análisis",
     "href": "#/entrevistas",
     "archivo": "area-privada-entrevistas.js",
     "hijos": [
      {
       "id": "m:preparacion",
       "tipo": "modulo",
       "etiqueta": "Preparación",
       "nota": "briefings automáticos",
       "archivo": "area-privada-preparacion.js"
      }
     ]
    },
    {
     "id": "t:portfolio",
     "tipo": "pestana",
     "etiqueta": "Portfolio",
     "nota": "inventario de lo publicado",
     "href": "#/portfolio",
     "archivo": "area-privada-portfolio.js"
    },
    {
     "id": "t:second-brain",
     "tipo": "pestana",
     "etiqueta": "Second Brain",
     "nota": "grafo 3D del conocimiento",
     "href": "#/second-brain",
     "archivo": "area-privada-second-brain.js",
     "hijos": [
      {
       "id": "m:visor",
       "tipo": "carpeta",
       "etiqueta": "Visor 3D",
       "archivo": "second-brain/"
      }
     ]
    },
    {
     "id": "t:mapa",
     "tipo": "pestana",
     "etiqueta": "Mapa",
     "nota": "esta misma pantalla",
     "href": "#/mapa",
     "archivo": "area-privada-mapa.js"
    },
    {
     "id": "t:archivos",
     "tipo": "pestana",
     "etiqueta": "Archivos y notas",
     "nota": "drive de carpetas y notas",
     "href": "#/archivos",
     "archivo": "area-privada.js"
    },
    {
     "id": "t:fichero",
     "tipo": "pestana",
     "etiqueta": "Fichero",
     "nota": "enlaces guardados",
     "href": "#/fichero",
     "archivo": "area-privada-fichero.js"
    },
    {
     "id": "t:configuracion",
     "tipo": "pestana",
     "etiqueta": "Configuración",
     "nota": "listas de opciones",
     "href": "#/configuracion",
     "archivo": "area-privada-configuracion.js"
    }
   ]
  },
  {
   "id": "col:datos",
   "tipo": "columna",
   "etiqueta": "Datos y servicios",
   "nota": "tablas y funciones en Supabase",
   "hijos": [
    {
     "id": "d:agenda",
     "tipo": "esquema",
     "etiqueta": "agenda.sql",
     "archivo": "supabase/agenda.sql",
     "hijos": [
      {
       "id": "q:agenda",
       "tipo": "tabla",
       "etiqueta": "agenda"
      }
     ]
    },
    {
     "id": "d:area-privada",
     "tipo": "esquema",
     "etiqueta": "area-privada.sql",
     "archivo": "supabase/area-privada.sql",
     "hijos": [
      {
       "id": "q:members",
       "tipo": "tabla",
       "etiqueta": "members"
      },
      {
       "id": "q:items",
       "tipo": "tabla",
       "etiqueta": "items"
      }
     ]
    },
    {
     "id": "d:calendario",
     "tipo": "esquema",
     "etiqueta": "calendario.sql",
     "archivo": "supabase/calendario.sql",
     "hijos": [
      {
       "id": "q:calendar_events",
       "tipo": "tabla",
       "etiqueta": "calendar_events"
      },
      {
       "id": "q:calendar_sync",
       "tipo": "tabla",
       "etiqueta": "calendar_sync"
      }
     ]
    },
    {
     "id": "d:entrevistas",
     "tipo": "esquema",
     "etiqueta": "entrevistas.sql",
     "archivo": "supabase/entrevistas.sql",
     "hijos": [
      {
       "id": "q:procesos",
       "tipo": "tabla",
       "etiqueta": "procesos"
      },
      {
       "id": "q:entrevistas",
       "tipo": "tabla",
       "etiqueta": "entrevistas"
      }
     ]
    },
    {
     "id": "d:fichero",
     "tipo": "esquema",
     "etiqueta": "fichero.sql",
     "archivo": "supabase/fichero.sql",
     "hijos": [
      {
       "id": "q:links",
       "tipo": "tabla",
       "etiqueta": "links"
      }
     ]
    },
    {
     "id": "d:interview-intel",
     "tipo": "esquema",
     "etiqueta": "interview-intel.sql",
     "archivo": "supabase/interview-intel.sql",
     "hijos": [
      {
       "id": "q:ii_interviews",
       "tipo": "tabla",
       "etiqueta": "ii_interviews"
      },
      {
       "id": "q:ii_runs",
       "tipo": "tabla",
       "etiqueta": "ii_runs"
      },
      {
       "id": "q:ii_reports",
       "tipo": "tabla",
       "etiqueta": "ii_reports"
      }
     ]
    },
    {
     "id": "d:kanban",
     "tipo": "esquema",
     "etiqueta": "kanban.sql",
     "archivo": "supabase/kanban.sql",
     "hijos": [
      {
       "id": "q:kb_proyectos",
       "tipo": "tabla",
       "etiqueta": "kb_proyectos"
      },
      {
       "id": "q:kb_tarjetas",
       "tipo": "tabla",
       "etiqueta": "kb_tarjetas"
      },
      {
       "id": "q:kb_subtareas",
       "tipo": "tabla",
       "etiqueta": "kb_subtareas"
      },
      {
       "id": "q:kb_historial",
       "tipo": "tabla",
       "etiqueta": "kb_historial"
      },
      {
       "id": "q:kb_ajustes",
       "tipo": "tabla",
       "etiqueta": "kb_ajustes"
      }
     ]
    },
    {
     "id": "d:opciones",
     "tipo": "esquema",
     "etiqueta": "opciones.sql",
     "archivo": "supabase/opciones.sql",
     "hijos": [
      {
       "id": "q:ap_opciones",
       "tipo": "tabla",
       "etiqueta": "ap_opciones"
      }
     ]
    },
    {
     "id": "d:portfolio",
     "tipo": "esquema",
     "etiqueta": "portfolio.sql",
     "archivo": "supabase/portfolio.sql",
     "hijos": [
      {
       "id": "q:portfolio",
       "tipo": "tabla",
       "etiqueta": "portfolio"
      }
     ]
    },
    {
     "id": "d:procesos-correo",
     "tipo": "esquema",
     "etiqueta": "procesos-correo.sql",
     "archivo": "supabase/procesos-correo.sql",
     "hijos": [
      {
       "id": "q:procesos_correo",
       "tipo": "tabla",
       "etiqueta": "procesos_correo"
      }
     ]
    },
    {
     "id": "d:second-brain-notas",
     "tipo": "esquema",
     "etiqueta": "second-brain-notas.sql",
     "archivo": "supabase/second-brain-notas.sql",
     "hijos": [
      {
       "id": "q:sb_notas",
       "tipo": "tabla",
       "etiqueta": "sb_notas"
      }
     ]
    },
    {
     "id": "d:second-brain",
     "tipo": "esquema",
     "etiqueta": "second-brain.sql",
     "archivo": "supabase/second-brain.sql",
     "hijos": [
      {
       "id": "q:sb_snapshots",
       "tipo": "tabla",
       "etiqueta": "sb_snapshots"
      },
      {
       "id": "q:sb_runs",
       "tipo": "tabla",
       "etiqueta": "sb_runs"
      }
     ]
    },
    {
     "id": "d:studio-ideas",
     "tipo": "esquema",
     "etiqueta": "studio-ideas.sql",
     "archivo": "supabase/studio-ideas.sql",
     "hijos": [
      {
       "id": "q:ps_ideas",
       "tipo": "tabla",
       "etiqueta": "ps_ideas"
      },
      {
       "id": "q:ps_notes",
       "tipo": "tabla",
       "etiqueta": "ps_notes"
      },
      {
       "id": "q:ps_deliverables",
       "tipo": "tabla",
       "etiqueta": "ps_deliverables"
      }
     ]
    },
    {
     "id": "d:studio",
     "tipo": "esquema",
     "etiqueta": "studio.sql",
     "archivo": "supabase/studio.sql",
     "hijos": [
      {
       "id": "q:ps_projects",
       "tipo": "tabla",
       "etiqueta": "ps_projects"
      },
      {
       "id": "q:ps_tasks",
       "tipo": "tabla",
       "etiqueta": "ps_tasks"
      },
      {
       "id": "q:ps_settings",
       "tipo": "tabla",
       "etiqueta": "ps_settings"
      },
      {
       "id": "q:ps_activity",
       "tipo": "tabla",
       "etiqueta": "ps_activity"
      }
     ]
    },
    {
     "id": "g:datos:functions",
     "tipo": "grupo",
     "etiqueta": "functions/",
     "nota": "se ejecutan en Supabase, no en el navegador",
     "hijos": [
      {
       "id": "f:calendario-sync",
       "tipo": "funcion",
       "etiqueta": "calendario-sync",
       "archivo": "supabase/functions/calendario-sync/"
      },
      {
       "id": "f:interview-intel",
       "tipo": "funcion",
       "etiqueta": "interview-intel",
       "archivo": "supabase/functions/interview-intel/"
      },
      {
       "id": "f:kanban-ia",
       "tipo": "funcion",
       "etiqueta": "kanban-ia",
       "archivo": "supabase/functions/kanban-ia/"
      },
      {
       "id": "f:procesos-sync",
       "tipo": "funcion",
       "etiqueta": "procesos-sync",
       "archivo": "supabase/functions/procesos-sync/"
      }
     ]
    }
   ]
  },
  {
   "id": "col:herramientas",
   "tipo": "columna",
   "etiqueta": "Herramientas",
   "nota": "generan y comprueban el sitio",
   "hijos": [
    {
     "id": "g:tools:generadores",
     "tipo": "grupo",
     "etiqueta": "generadores/",
     "nota": "producen archivos del sitio",
     "hijos": [
      {
       "id": "h:build-en",
       "tipo": "herramienta",
       "etiqueta": "build-en.mjs",
       "archivo": "tools/build-en.mjs"
      },
      {
       "id": "h:mapa",
       "tipo": "herramienta",
       "etiqueta": "mapa/",
       "archivo": "tools/mapa/"
      },
      {
       "id": "h:version-assets",
       "tipo": "herramienta",
       "etiqueta": "version-assets.mjs",
       "archivo": "tools/version-assets.mjs"
      }
     ]
    },
    {
     "id": "g:tools:comprobaciones",
     "tipo": "grupo",
     "etiqueta": "comprobaciones/",
     "nota": "fallan si algo se rompe",
     "hijos": [
      {
       "id": "h:check-a11y",
       "tipo": "herramienta",
       "etiqueta": "check-a11y.mjs",
       "archivo": "tools/check-a11y.mjs"
      },
      {
       "id": "h:check-briefing",
       "tipo": "herramienta",
       "etiqueta": "check-briefing.mjs",
       "archivo": "tools/check-briefing.mjs"
      },
      {
       "id": "h:check-kanban",
       "tipo": "herramienta",
       "etiqueta": "check-kanban.mjs",
       "archivo": "tools/check-kanban.mjs"
      },
      {
       "id": "h:check-links",
       "tipo": "herramienta",
       "etiqueta": "check-links.mjs",
       "archivo": "tools/check-links.mjs"
      },
      {
       "id": "h:check-studio",
       "tipo": "herramienta",
       "etiqueta": "check-studio.mjs",
       "archivo": "tools/check-studio.mjs"
      },
      {
       "id": "h:test-kanban",
       "tipo": "herramienta",
       "etiqueta": "test-kanban.mjs",
       "archivo": "tools/test-kanban.mjs"
      },
      {
       "id": "h:test-studio",
       "tipo": "herramienta",
       "etiqueta": "test-studio.mjs",
       "archivo": "tools/test-studio.mjs"
      }
     ]
    },
    {
     "id": "g:tools:motores",
     "tipo": "grupo",
     "etiqueta": "motores locales/",
     "nota": "corren en tu equipo, no en la web",
     "hijos": [
      {
       "id": "h:gmail-procesos",
       "tipo": "herramienta",
       "etiqueta": "gmail-procesos/",
       "archivo": "tools/gmail-procesos/"
      },
      {
       "id": "h:second-brain",
       "tipo": "herramienta",
       "etiqueta": "second-brain/",
       "archivo": "tools/second-brain/"
      }
     ]
    },
    {
     "id": "g:tools:ci",
     "tipo": "grupo",
     "etiqueta": "CI/",
     "nota": "GitHub Actions en cada PR",
     "hijos": [
      {
       "id": "w:checks",
       "tipo": "workflow",
       "etiqueta": "checks.yml",
       "archivo": ".github/workflows/checks.yml"
      },
      {
       "id": "w:supabase-keepalive",
       "tipo": "workflow",
       "etiqueta": "supabase-keepalive.yml",
       "archivo": ".github/workflows/supabase-keepalive.yml"
      }
     ]
    }
   ]
  }
 ],
 "relaciones": [
  {
   "de": "f:calendario-sync",
   "a": "d:area-privada",
   "tipo": "usa",
   "detalle": [
    "members"
   ]
  },
  {
   "de": "f:calendario-sync",
   "a": "d:calendario",
   "tipo": "usa",
   "detalle": [
    "calendar_replace()",
    "calendar_sync"
   ]
  },
  {
   "de": "f:interview-intel",
   "a": "d:area-privada",
   "tipo": "usa",
   "detalle": [
    "items",
    "members"
   ]
  },
  {
   "de": "f:interview-intel",
   "a": "d:calendario",
   "tipo": "usa",
   "detalle": [
    "calendar_events",
    "calendar_sync"
   ]
  },
  {
   "de": "f:interview-intel",
   "a": "d:entrevistas",
   "tipo": "usa",
   "detalle": [
    "entrevistas"
   ]
  },
  {
   "de": "f:interview-intel",
   "a": "d:interview-intel",
   "tipo": "usa",
   "detalle": [
    "ii_claim()",
    "ii_interviews",
    "ii_reports",
    "ii_runs"
   ]
  },
  {
   "de": "f:kanban-ia",
   "a": "d:area-privada",
   "tipo": "usa",
   "detalle": [
    "members"
   ]
  },
  {
   "de": "f:kanban-ia",
   "a": "d:kanban",
   "tipo": "usa",
   "detalle": [
    "kb_ajustes"
   ]
  },
  {
   "de": "f:procesos-sync",
   "a": "d:procesos-correo",
   "tipo": "usa",
   "detalle": [
    "pc_aplicar()",
    "procesos_correo"
   ]
  },
  {
   "de": "h:build-en",
   "a": "x:en",
   "tipo": "genera",
   "detalle": []
  },
  {
   "de": "h:check-briefing",
   "a": "m:preparacion",
   "tipo": "verifica",
   "detalle": []
  },
  {
   "de": "h:check-kanban",
   "a": "m:kanban",
   "tipo": "verifica",
   "detalle": []
  },
  {
   "de": "h:check-studio",
   "a": "t:studio",
   "tipo": "verifica",
   "detalle": []
  },
  {
   "de": "h:mapa",
   "a": "t:mapa",
   "tipo": "alimenta",
   "detalle": []
  },
  {
   "de": "h:second-brain",
   "a": "d:second-brain",
   "tipo": "usa",
   "detalle": [
    "sb_runs",
    "sb_snapshots"
   ]
  },
  {
   "de": "h:second-brain",
   "a": "p:descargas",
   "tipo": "lee",
   "detalle": []
  },
  {
   "de": "h:second-brain",
   "a": "t:second-brain",
   "tipo": "alimenta",
   "detalle": []
  },
  {
   "de": "h:test-kanban",
   "a": "m:kanban",
   "tipo": "verifica",
   "detalle": []
  },
  {
   "de": "h:test-studio",
   "a": "t:studio",
   "tipo": "verifica",
   "detalle": []
  },
  {
   "de": "m:kanban",
   "a": "d:kanban",
   "tipo": "usa",
   "detalle": [
    "kb_ajustes",
    "kb_historial",
    "kb_proyectos",
    "kb_subtareas",
    "kb_tarjetas"
   ]
  },
  {
   "de": "m:preparacion",
   "a": "d:entrevistas",
   "tipo": "usa",
   "detalle": [
    "entrevistas"
   ]
  },
  {
   "de": "m:preparacion",
   "a": "d:interview-intel",
   "tipo": "usa",
   "detalle": [
    "ii_action()",
    "ii_interviews",
    "ii_reports",
    "ii_runs"
   ]
  },
  {
   "de": "p:descargas",
   "a": "col:privada",
   "tipo": "enlaza",
   "detalle": []
  },
  {
   "de": "p:roma-aeterna",
   "a": "col:privada",
   "tipo": "enlaza",
   "detalle": []
  },
  {
   "de": "t:archivos",
   "a": "d:area-privada",
   "tipo": "usa",
   "detalle": [
    "item_ancestors()",
    "item_subtree_files()",
    "items"
   ]
  },
  {
   "de": "t:calendario",
   "a": "d:agenda",
   "tipo": "usa",
   "detalle": [
    "agenda"
   ]
  },
  {
   "de": "t:calendario",
   "a": "d:calendario",
   "tipo": "usa",
   "detalle": [
    "calendar_events",
    "calendar_sync"
   ]
  },
  {
   "de": "t:calendario",
   "a": "d:entrevistas",
   "tipo": "usa",
   "detalle": [
    "entrevistas"
   ]
  },
  {
   "de": "t:calendario",
   "a": "d:interview-intel",
   "tipo": "usa",
   "detalle": [
    "ii_interviews"
   ]
  },
  {
   "de": "t:calendario",
   "a": "d:opciones",
   "tipo": "usa",
   "detalle": [
    "ap_opciones"
   ]
  },
  {
   "de": "t:configuracion",
   "a": "d:agenda",
   "tipo": "usa",
   "detalle": [
    "agenda"
   ]
  },
  {
   "de": "t:configuracion",
   "a": "d:fichero",
   "tipo": "usa",
   "detalle": [
    "links"
   ]
  },
  {
   "de": "t:configuracion",
   "a": "d:opciones",
   "tipo": "usa",
   "detalle": [
    "ap_opcion_eliminar()",
    "ap_opcion_renombrar()",
    "ap_opciones"
   ]
  },
  {
   "de": "t:configuracion",
   "a": "d:portfolio",
   "tipo": "usa",
   "detalle": [
    "portfolio"
   ]
  },
  {
   "de": "t:entrevistas",
   "a": "d:calendario",
   "tipo": "usa",
   "detalle": [
    "calendar_events"
   ]
  },
  {
   "de": "t:entrevistas",
   "a": "d:entrevistas",
   "tipo": "usa",
   "detalle": [
    "entrevistas",
    "procesos"
   ]
  },
  {
   "de": "t:entrevistas",
   "a": "d:procesos-correo",
   "tipo": "usa",
   "detalle": [
    "pc_aplicar()",
    "pc_descartar()",
    "procesos_correo"
   ]
  },
  {
   "de": "t:fichero",
   "a": "d:fichero",
   "tipo": "usa",
   "detalle": [
    "links"
   ]
  },
  {
   "de": "t:fichero",
   "a": "d:opciones",
   "tipo": "usa",
   "detalle": [
    "ap_opciones"
   ]
  },
  {
   "de": "t:hoy",
   "a": "d:agenda",
   "tipo": "usa",
   "detalle": [
    "agenda"
   ]
  },
  {
   "de": "t:hoy",
   "a": "d:calendario",
   "tipo": "usa",
   "detalle": [
    "calendar_events"
   ]
  },
  {
   "de": "t:hoy",
   "a": "d:entrevistas",
   "tipo": "usa",
   "detalle": [
    "entrevistas",
    "procesos"
   ]
  },
  {
   "de": "t:hoy",
   "a": "m:kanban",
   "tipo": "compone",
   "detalle": []
  },
  {
   "de": "t:portfolio",
   "a": "d:opciones",
   "tipo": "usa",
   "detalle": [
    "ap_opciones"
   ]
  },
  {
   "de": "t:portfolio",
   "a": "d:portfolio",
   "tipo": "usa",
   "detalle": [
    "portfolio"
   ]
  },
  {
   "de": "t:second-brain",
   "a": "d:second-brain-notas",
   "tipo": "usa",
   "detalle": [
    "sb_notas"
   ]
  },
  {
   "de": "t:second-brain",
   "a": "d:second-brain",
   "tipo": "usa",
   "detalle": [
    "sb_runs",
    "sb_snapshots"
   ]
  },
  {
   "de": "t:studio",
   "a": "d:studio-ideas",
   "tipo": "usa",
   "detalle": [
    "ps_convert_idea()",
    "ps_deliverables",
    "ps_ideas",
    "ps_notes"
   ]
  },
  {
   "de": "t:studio",
   "a": "d:studio",
   "tipo": "usa",
   "detalle": [
    "ps_activity",
    "ps_projects",
    "ps_settings",
    "ps_tasks"
   ]
  },
  {
   "de": "w:checks",
   "a": "h:build-en",
   "tipo": "ejecuta",
   "detalle": []
  },
  {
   "de": "w:checks",
   "a": "h:check-a11y",
   "tipo": "ejecuta",
   "detalle": []
  },
  {
   "de": "w:checks",
   "a": "h:check-briefing",
   "tipo": "ejecuta",
   "detalle": []
  },
  {
   "de": "w:checks",
   "a": "h:check-kanban",
   "tipo": "ejecuta",
   "detalle": []
  },
  {
   "de": "w:checks",
   "a": "h:check-links",
   "tipo": "ejecuta",
   "detalle": []
  },
  {
   "de": "w:checks",
   "a": "h:check-studio",
   "tipo": "ejecuta",
   "detalle": []
  },
  {
   "de": "w:checks",
   "a": "h:mapa",
   "tipo": "ejecuta",
   "detalle": []
  },
  {
   "de": "w:checks",
   "a": "h:second-brain",
   "tipo": "ejecuta",
   "detalle": []
  },
  {
   "de": "w:checks",
   "a": "h:test-kanban",
   "tipo": "ejecuta",
   "detalle": []
  },
  {
   "de": "w:checks",
   "a": "h:test-studio",
   "tipo": "ejecuta",
   "detalle": []
  },
  {
   "de": "w:checks",
   "a": "h:version-assets",
   "tipo": "ejecuta",
   "detalle": []
  }
 ],
 "tipos": {
  "pagina": "Página",
  "carpeta": "Carpeta",
  "pestana": "Pestaña",
  "modulo": "Módulo",
  "tabla": "Tabla",
  "esquema": "Esquema SQL",
  "funcion": "Edge Function",
  "herramienta": "Herramienta",
  "workflow": "Workflow",
  "grupo": "Grupo",
  "columna": "Bloque"
 },
 "verbos": {
  "usa": {
   "verbo": "usa",
   "debil": true
  },
  "compone": {
   "verbo": "monta",
   "debil": false
  },
  "enlaza": {
   "verbo": "enlaza a",
   "debil": false
  },
  "genera": {
   "verbo": "genera",
   "debil": false
  },
  "alimenta": {
   "verbo": "alimenta a",
   "debil": false
  },
  "lee": {
   "verbo": "lee",
   "debil": false
  },
  "verifica": {
   "verbo": "comprueba",
   "debil": true
  },
  "ejecuta": {
   "verbo": "ejecuta",
   "debil": true
  }
 }
};
