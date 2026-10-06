-- ═══════════════════════════════════════════════
-- supabase/portfolio.sql — pestaña «Portfolio» del área privada
-- ───────────────────────────────────────────────
-- Inventario de todo lo construido para el portfolio: manuales, proyectos de Power BI,
-- gráficos, apps de Streamlit, repositorios y visualizaciones.
-- Requiere area-privada.sql (is_member), entrevistas.sql (touch_updated_at) y opciones.sql (los tipos son el grupo
-- «portfolio.tipo» de public.ap_opciones y se gestionan en la pestaña «Configuración»).
-- Se ejecuta UNA vez en Supabase → SQL Editor. Es idempotente: la carga inicial no
-- duplica elementos que ya existan con el mismo título.
-- ═══════════════════════════════════════════════

create table if not exists public.portfolio (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null check (char_length(titulo) between 1 and 200),
  tipo        text check (char_length(tipo) <= 60),
  estado      text not null default 'publicado' check (estado in ('publicado', 'en_curso', 'idea', 'archivado')),
  url         text check (url ~* '^https?://' and char_length(url) <= 2000),          -- dónde se ve: web, informe, app…
  repo_url    text check (repo_url ~* '^https?://' and char_length(repo_url) <= 2000),
  pagina_url  text check (pagina_url ~* '^https?://' and char_length(pagina_url) <= 2000), -- página del portfolio que lo presenta
  descripcion text check (char_length(descripcion) <= 1000),
  tecnologias text[] not null default '{}',
  destacado   boolean not null default false,
  notas       text check (char_length(notas) <= 4000),                                 -- privadas: no salen de aquí
  posicion    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists portfolio_tipo_idx on public.portfolio (tipo);

drop trigger if exists portfolio_touch on public.portfolio;
create trigger portfolio_touch before update on public.portfolio
  for each row execute function public.touch_updated_at();   -- definida en entrevistas.sql

alter table public.portfolio enable row level security;
revoke all on public.portfolio from anon;
drop policy if exists "portfolio: leer"   on public.portfolio;
drop policy if exists "portfolio: crear"  on public.portfolio;
drop policy if exists "portfolio: editar" on public.portfolio;
drop policy if exists "portfolio: borrar" on public.portfolio;
create policy "portfolio: leer"   on public.portfolio for select to authenticated using (public.is_member());
create policy "portfolio: crear"  on public.portfolio for insert to authenticated with check (public.is_member());
create policy "portfolio: editar" on public.portfolio for update to authenticated using (public.is_member()) with check (public.is_member());
create policy "portfolio: borrar" on public.portfolio for delete to authenticated using (public.is_member());

-- ─── Tipos (configurables en «Configuración») ───
insert into public.ap_opciones (grupo, valor, posicion)
select 'portfolio.tipo', v, ord from unnest(array['Manual', 'Proyecto Power BI', 'Gráfico Power BI', 'App Streamlit', 'Repositorio', 'Visualización']) with ordinality as t(v, ord)
on conflict do nothing;

-- ─── Carga inicial: lo publicado en borjamora.es (generada a partir de las páginas del sitio) ───
insert into public.portfolio (titulo, tipo, estado, url, repo_url, pagina_url, descripcion, tecnologias, destacado, notas, posicion)
select v.* from (values
  ('Data Storytelling y diseño de dashboards', 'Manual', 'publicado', 'https://borjamora.es/data-storytelling.html', null, null, 'Manual interactivo: percepción, ruido, atención, visuales, composición y narrativa sobre un dashboard real.', array['Data Storytelling', 'UX/UI']::text[], true, null, 1),
  ('Manual de Machine Learning', 'Manual', 'publicado', 'https://borjamora.es/ml/', null, null, '63 modelos explicados en sencillo, con ejemplos de negocio y visualizaciones interactivas.', array['Machine Learning', 'Python']::text[], true, null, 2),
  ('Manual de Power BI', 'Manual', 'en_curso', 'https://borjamora.es/pbi/', null, null, 'Del método BI7 y el modelo en estrella a Power Query, DAX, visualización y Power BI Service.', array['Power BI', 'DAX', 'Power Query']::text[], false, 'De momento solo en la rama manual-ml-rediseno; el enlace funcionará al publicarlo.', 3),
  ('Casa Origen · BI para una cafetería de especialidad', 'Proyecto Power BI', 'publicado', 'https://app.powerbi.com/links/-sDd_7khMP?ctid=b8af2870-2d50-46ba-ab75-c78fa4736fb7&pbi_source=linkShare', 'https://github.com/BORJAMOME/casa-origen-analytics', 'https://borjamora.es/casa-origen.html', 'Sistema de BI completo: Power BI, DAX, SQL Server, Python y Machine Learning.', array['Power BI', 'DAX', 'SQL Server', 'Python']::text[], true, null, 4),
  ('Informe financiero completo', 'Proyecto Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiNDgzZjBmY2MtMDhhMy00MGIzLTlmYmItODlkMmY2NDg3ZDdmIiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=a961ceadc15fe4dcfcfb', null, 'https://borjamora.es/informe-financiero.html', '216.858 apuntes de tres empresas: Balance, PyG y Cash Flow con drill-through hasta el asiento.', array['Power BI', 'DAX', 'Finanzas']::text[], true, null, 5),
  ('Cuenta de Pérdidas y Ganancias', 'Proyecto Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiM2Y3MzMxNTQtMGMzOS00ZDhlLTljYWYtMmU5N2E5ZTA3MjU2IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=41273635f861390cd9fd', null, 'https://borjamora.es/perdidas-ganancias.html', 'P&L que cuadra con cualquier filtro: subtotales contables, signos y Real vs Presupuesto.', array['Power BI', 'DAX', 'Finanzas']::text[], false, null, 6),
  ('Informe de ventas IBCS', 'Proyecto Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiYWFhNjA5YmQtNjEyYS00YTA3LWIxMzktYWQxOTYzMmZkYzIyIiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9', null, 'https://borjamora.es/ibcs-ventas.html', 'Volumen y variación absoluta y porcentual en un visual, con el estándar IBCS sin custom visuals.', array['Power BI', 'DAX', 'IBCS']::text[], true, null, 7),
  ('Kosta Cálida · reporting de red de tiendas', 'Proyecto Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiMzhlYjliYTAtMWUzMS00YzE1LTgyNGEtZmZmNDVhNjQ1ZDY3IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=03634c064fb23f65778f', null, 'https://borjamora.es/kosta-calida.html', 'Modelo en estrella, tablas desconectadas y drill-down hasta el ticket.', array['Power BI', 'DAX', 'Power Query']::text[], false, null, 8),
  ('Análisis RFM · distribuidora B2B de hostelería', 'Proyecto Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiNGQ1OWZhNmEtY2I3Ni00N2M5LTk1NWYtMTEwZTA3NWI3NmYwIiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9', null, 'https://borjamora.es/rfm-hosteleria.html', 'Segmentación RFM con más de 198.000 € de revenue en riesgo identificados.', array['Power BI', 'DAX', 'RFM']::text[], false, null, 9),
  ('Mercado de Airbnb en el País Vasco', 'Proyecto Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiOTA2ZDExNjktYzE4Ny00Y2UzLThmM2YtMjI5Y2FmNDg1MzM5IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=9c4b9193b627b78a0e01', null, 'https://borjamora.es/airbnb-pais-vasco.html', '6.030 anuncios y 213 localizaciones: mapas y DAX con líneas de referencia.', array['Power BI', 'DAX', 'Mapas']::text[], false, null, 10),
  ('Social Media Performance 2025 vs 2024', 'Proyecto Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiMzNlYjcwN2YtNWE0Yy00NTk2LThlNmUtZjVmMThkZTQ0YzZjIiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9', null, 'https://borjamora.es/social-media.html', 'Impresiones −12,8 % y gasto −26,3 %: la eficiencia mejora aunque baje el volumen.', array['Power BI', 'DAX', 'Marketing']::text[], false, null, 11),
  ('Gráfico de Pareto', 'Gráfico Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiYWY3ZjRlNzItNzZlNC00ZjgwLWFjYTItMGM2NjhlYzQ3MjdjIiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9', null, 'https://borjamora.es/power-bi.html', 'Principio 80/20 aplicado a datos de negocio para encontrar los factores con más impacto.', array['Power BI', 'DAX']::text[], false, null, 12),
  ('Selección de periodos dinámico', 'Gráfico Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiNjRlYTQzNWEtNzliNS00M2QxLWE1MWQtNGJiNjc0MmQ3Zjg2IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9', null, 'https://borjamora.es/power-bi.html', 'Selector de rango temporal sin segmentadores estándar.', array['Power BI', 'DAX']::text[], false, null, 13),
  ('Small Multiples de barras', 'Gráfico Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiOGJjY2VjOGQtNWRkZi00N2VjLWIwNTktZDY3NjI2OTFjYWY0IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=ab8db569d0c613296a15', null, 'https://borjamora.es/power-bi.html', 'Gráficos de barras sincronizados para comparar categorías con la misma escala.', array['Power BI', 'DAX']::text[], false, null, 14),
  ('Perímetros temporales dinámicos', 'Gráfico Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiYWJmYzZkZTktOTYzNS00NDFkLWJiYWMtY2ZlNzM2NmEzNjBkIiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=808c33f3347a1aeb147d', null, 'https://borjamora.es/power-bi.html', 'Ventanas de tiempo variables en DAX que se adaptan al contexto del filtro.', array['Power BI', 'DAX']::text[], false, null, 15),
  ('Análisis visual de Delta', 'Gráfico Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiMDQ1ZGQxM2UtMTk2Ni00NTBlLWJkMzItOGYyN2U4YjFhYTNmIiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=19113f5bd05395d09644', null, 'https://borjamora.es/power-bi.html', 'Variaciones absolutas y relativas entre periodos con indicadores direccionales.', array['Power BI', 'DAX']::text[], false, null, 16),
  ('Columnas agrupadas', 'Gráfico Power BI', 'publicado', 'https://app.powerbi.com/view?r=eyJrIjoiODI3YmJiMWYtNWQyYy00NzIyLWFhZTUtNjQwNWY0Mzc0YmI5IiwidCI6ImI4YWYyODcwLTJkNTAtNDZiYS1hYjc1LWM3OGZhNDczNmZiNyJ9&pageName=6ec6a3ff0e01c9a1a92f', null, 'https://borjamora.es/power-bi.html', 'Comparativa multidimensional en un único visual, con control de orden y jerarquía.', array['Power BI', 'DAX']::text[], false, null, 17),
  ('Segmentación de clientes retail', 'App Streamlit', 'publicado', 'https://segmentacion-retail.streamlit.app', 'https://github.com/BORJAMOME/Data-Analytics-Portfolio/tree/main/03-Machine-Learning', 'https://borjamora.es/analisis-datos.html', '¿Todos tus clientes merecen la misma oferta? 6.000 clientes y 26 variables de una cadena de electrónica.', array['Python', 'Streamlit', 'Clustering']::text[], true, null, 18),
  ('Forecast de ventas con eventos', 'App Streamlit', 'publicado', 'https://forecast-ventas-retail-app-w5msdvcsbuxas94qjcdore.streamlit.app', 'https://github.com/BORJAMOME/Data-Analytics-Portfolio/tree/main/03-Machine-Learning', 'https://borjamora.es/analisis-datos.html', '¿Qué pasa con las ventas cuando ocurre algo inesperado? Promociones, huelgas y problemas logísticos.', array['Python', 'Streamlit', 'Forecasting']::text[], true, null, 19),
  ('Comparativa de modelos · pasajeros de aerolínea', 'App Streamlit', 'publicado', 'https://comparativa-modelos-aerolinea.streamlit.app', 'https://github.com/BORJAMOME/Data-Analytics-Portfolio/tree/main/03-Machine-Learning', 'https://borjamora.es/analisis-datos.html', '¿A quién estamos a punto de perder? Clasificación de pasajeros más allá de reglas fijas.', array['Python', 'Streamlit', 'Clasificación']::text[], false, null, 20),
  ('Previsión semanal de ventas (SARIMA)', 'App Streamlit', 'publicado', 'https://sarima-ventas-retail.streamlit.app/', 'https://github.com/BORJAMOME/Data-Analytics-Portfolio/tree/main/03-Machine-Learning', 'https://borjamora.es/analisis-datos.html', '¿Cuánto venderemos la próxima semana? Inventario y personal planificados con series temporales.', array['Python', 'Streamlit', 'SARIMA']::text[], false, null, 21),
  ('Preferencias de vuelo (análisis conjoint)', 'App Streamlit', 'publicado', 'https://preferencias-vuelos.streamlit.app/', 'https://github.com/BORJAMOME/Data-Analytics-Portfolio/tree/main/03-Machine-Learning', 'https://borjamora.es/analisis-datos.html', '¿Qué hace que un cliente elija un vuelo? Peso del precio, las escalas, el equipaje y la flexibilidad.', array['Python', 'Streamlit', 'Conjoint']::text[], false, null, 22),
  ('Data-Analytics-Portfolio', 'Repositorio', 'publicado', 'https://github.com/BORJAMOME/Data-Analytics-Portfolio', null, 'https://borjamora.es/analisis-datos.html', 'Proyectos de SQL, Python (análisis exploratorio) y Machine Learning.', array['SQL', 'Python', 'Machine Learning']::text[], false, null, 23),
  ('DAX-LAB', 'Repositorio', 'publicado', 'https://github.com/BORJAMOME/DAX-LAB', null, 'https://borjamora.es/power-bi.html', 'Patrones de DAX: time intelligence, rankings y control de acceso a páginas.', array['DAX', 'Power BI']::text[], false, null, 24),
  ('El skyline oculto de Madrid', 'Visualización', 'publicado', 'https://www.behance.net/gallery/213119763/URBAN-ELEVATION-MAP', null, 'https://borjamora.es/visualizacion-datos.html', 'Exploración 3D de la altura de los edificios que revela patrones urbanos.', array['Mapas 3D', 'Diseño de la información']::text[], false, null, 25),
  ('DANA en Valencia', 'Visualización', 'publicado', 'https://www.behance.net/gallery/212501517/DANA-in-Valencia-3D-Map', null, 'https://borjamora.es/visualizacion-datos.html', 'Visualización 3D del impacto real de la DANA y sus zonas más vulnerables.', array['Mapas 3D', 'Diseño de la información']::text[], false, null, 26),
  ('Geología en tres dimensiones', 'Visualización', 'publicado', 'https://www.behance.net/gallery/212640571/Geological-Map-of-Spain-and-Portugal-3D', null, 'https://borjamora.es/visualizacion-datos.html', 'Recreación 3D del mapa geológico de España y Portugal.', array['Mapas 3D', 'Diseño de la información']::text[], false, null, 27),
  ('100 municipios, un índice y una pregunta incómoda', 'Visualización', 'publicado', 'https://www.behance.net/gallery/211492633/Where-does-happiness-reside', null, 'https://borjamora.es/visualizacion-datos.html', 'Población, renta e índice de felicidad en los municipios más poblados de España.', array['Mapas 3D', 'Diseño de la información']::text[], false, null, 28),
  ('Redibujando el Metro desde el peatón', 'Visualización', 'publicado', 'https://www.behance.net/gallery/209226133/Metro-Walking-Map', null, 'https://borjamora.es/visualizacion-datos.html', 'Plano del Metro con distancias reales a pie entre estaciones.', array['Mapas 3D', 'Diseño de la información']::text[], false, null, 29),
  ('Comunidades Autónomas en tres dimensiones', 'Visualización', 'publicado', 'https://www.behance.net/gallery/213663039/Cartography-of-the-Spanish-Regions-3D', null, 'https://borjamora.es/visualizacion-datos.html', 'Colección de mapas 3D de las comunidades autónomas.', array['Mapas 3D', 'Diseño de la información']::text[], false, null, 30)
) as v(titulo, tipo, estado, url, repo_url, pagina_url, descripcion, tecnologias, destacado, notas, posicion)
where not exists (select 1 from public.portfolio p where lower(p.titulo) = lower(v.titulo));
