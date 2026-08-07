# Memoria de sesión — 7 agosto 2026

## Cambios aplicados al Home (index.html)

Rewrite completo del copy del home con input de 32 especialistas (equipo-borja-empleo + consejo-expertos-bootcamp + humanizer-es).

### Decisiones clave
- **Dual targeting**: la home funciona para Data Analyst Y Power BI Developer
- **Sin metáforas arquitectónicas** (excepto tagline del footer), sin referencias a hostelería
- **Copy anti-IA**: personalidad real, sin clichés ("me apasiona", "siempre aprendiendo")
- **Hero**: "Analizo datos. Diseño cómo se leen." — responde quién/qué/por qué en 2-7 segundos

### Ediciones realizadas (todas en index.html)
1. **Hero**: nuevo H1, subtítulo, credenciales (PL-300 · Madrid · Disponible), botones CTA
2. **Dashboard mockup**: label "SIMULACIÓN · DATOS FICTICIOS"
3. **Cómo Trabajo**: "Cuatro fases. Una decisión." + 4 pasos accordion (Investigar → Preparar → Analizar → Comunicar)
4. **Proyectos header**: "Seis problemas reales. Seis respuestas con datos."
5. **ML divider**: "PYTHON · ANÁLISIS AVANZADO"
6. **ML cards**: categorías renombradas (Predicción de demanda, Segmentación de perfiles, Predicción de abandono)
7. **Star Project**: ELIMINADO
8. **Community**: ELIMINADO
9. **About**: ELIMINADO
10. **CTA final**: nuevo copy — "Puedo analizar tus datos, diseñar cómo se presentan..."
11. **Meta/OG/Twitter tags**: actualizados con nuevo posicionamiento
12. **Dot-nav**: reducido a 5 items (hero, approach, projects, stack, cta)
13. **Stack Técnico**: nueva fila Machine Learning, bootcamp Neoland (jun-jul 2026)
14. **JS**: eliminado observer de Community

### Estado del deploy
- Commit pusheado a origin/main ✅
- GitHub Pages deploy PENDIENTE — caída global de GitHub Actions/Pages el 6-7 agosto 2026
- Se desplegará automáticamente cuando GitHub se recupere
- No hay que hacer nada más — el código está correcto

### Configuración GitHub Pages
- Source: Deploy from branch → main → / (root)
- Custom domain: borjamora.es (DNS check successful)
- HTTPS enforced ✅

### Tech stack del portfolio
- Vanilla HTML/CSS/JS, archivo único index.html
- Fonts: Plus Jakarta Sans + JetBrains Mono
- Paleta: #7a7bff (morado) / negro / blanco
- Repo: github.com/BORJAMOME/portfolio-web
