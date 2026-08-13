---
target: portfolio-web (sitio completo)
total_score: 21
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 2
timestamp: 2026-08-13T22-19-49Z
slug: portfolio-web-sitio-completo
---
Method: dual-agent (A: design-review agent · B: detector/browser-evidence agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | KPI counters render "0" until scroll-triggered animation fires, no placeholder |
| 2 | Match System / Real World | 3 | "Descargar CV" doesn't download a CV, opens a third-party form |
| 3 | User Control and Freedom | 3 | EN "About" link is a raw 404 dead end |
| 4 | Consistency and Standards | 3 | Inconsistent image hosting (local vs raw.githubusercontent.com); EN site has fewer pages than ES |
| 5 | Error Prevention | 2 | Mislabeled CV CTA and silent zero-state counters are unprevented failure modes |
| 6 | Recognition Rather Than Recall | 3 | Text-labeled nav, active-state indication; small 11px nav type |
| 7 | Flexibility and Efficiency | n/a | Experience-mode portfolio, no repeat-use workflow |
| 8 | Aesthetic and Minimalist Design | 3 | Disciplined visual system undercut by multi-MB unoptimized images |
| 9 | Error Recovery | 1 | EN "About" 404 is unbranded, zero navigation, no custom 404.html |
| 10 | Help and Documentation | n/a | Experience-mode portfolio |
| **Total** | | **21/32** | **Acceptable (66%)** |

## Design Specificity Verdict

Feels authored for Borja specifically: consistent problema→solución→resultado narrative with real numbers per project, a self-built tool referenced ("PBI Mockup Creator"), and non-BI visualization work (3D Madrid skyline, DANA flood mapping) that a generic template wouldn't contain. Undercut by: the flagship hero visual is labeled "SIMULACIÓN · DATOS FICTICIOS", and the detector found 44 "overused-font" (Plus Jakarta Sans hardcoded repeatedly) and 9 "side-tab accent border" hits — generic AI-UI patterns layered on top of otherwise specific content.

## Priority Issues

- **[P0] Flagship homepage project images hotlinked at multi-MB native resolution, zero optimization.** Three of six "Seis problemas reales" thumbnails load from raw.githubusercontent.com at 6-8MB each (20MB+ total), no lazy-loading, no srcset. Fix: serve locally, resize, WebP/AVIF, lazy-load. → `/impeccable optimize`
- **[P1] EN nav "About" link 404s.** `en/index.html` links to `./about.html` which doesn't exist; lands on a raw unbranded 404 with no site nav. → `/impeccable harden`
- **[P1] "Descargar CV" doesn't download a CV.** Routes through two navigations to a third-party Tally form; no PDF exists in the repo. → `/impeccable clarify`
- **[P2] KPI counters have no reduced-motion/no-JS fallback.** Hard-coded literal `0` in markup, animated via IntersectionObserver with no `prefers-reduced-motion` check. → `/impeccable harden`
- **[P2] Primary nav exceeds working-memory guidance (9 simultaneous targets).** 6 page links + 1 CTA + 2 social icons; 3 of 6 are really "projects split by tool". → `/impeccable distill`

## Persona Red Flags

- **Jordan (First-Timer):** hits the EN "About" 404 dead end; faces undefined BI jargon (RevPASH, RFM, FP-Growth) on Casa Origen; "Descargar CV" doesn't deliver a file.
- **Riley (Stress Tester):** finds the EN 404 in <10s; catches KPI counters initialized at literal 0 with no reduced-motion guard; questions hotlinked GitHub-hosted hero images.
- **Casey (Mobile):** eats 20MB+ payload for six un-lazy-loaded thumbnails on the homepage alone; hamburger (44×44) and drawer (72px rows) are well-sized for thumb use.

## Minor Observations

- ~42KB inline base64 image in sobre-mi.html (blocks parsing, uncacheable).
- Unlinked dev artifacts in public web root: `sobre-mi copy.html` (91KB duplicate), `mockup-star-box.html`, `MEMORIA-SESION-2026-08-07.md`.
- power-bi.html project card order is non-sequential (07,06,05,01,02,03…).
- Static "2.963 seguidores / 192K impresiones" social-proof numbers will read as neglected within months.
- `proyectos.html` is a client-side redirect stub to `power-bi.html` with a visible "Redirigiendo…" flash.

## Cognitive Load

3 of 8 checklist items fail: single focus (dense interactive dashboard demo competes with the homepage's actual pitch before the visitor has read who Borja is), visual hierarchy (same tension), minimal choices (9 simultaneous nav targets, above the ≤4 ideal and past the 5-7 "pushing boundary" range).

## Emotional Journey

Peak: the Casa Origen case study (quantified impact, human closing quote) — but gated behind two comparatively dry sections on the homepage. End: strong — footer closes with concrete reassurance ("Respondo en <24h", explicit work-mode options). Risk: the count-up-from-zero stat pattern sits exactly at the site's proof points; if it doesn't fire, the trust-building numbers show "0" instead.

## Deterministic Detector Findings (Assessment B)

75 findings across 15 files (scan: whole site). By antipattern: overused-font 44, layout-transition 11, side-tab 9, bounce-easing 3, dark-glow 3, codex-grid-background 2, marquee 2, em-dash-overuse 1. 73 warning / 2 advisory. 7 of 8 spot-checked findings confirmed real; 1 false positive (dark-glow at index.html:605, an ordinary offset hover shadow, not a zero-offset glow). Independently verified real bug not caught by the detector: corrupted SVG path (LinkedIn icon) in sobre-mi.html:1199, confirmed via a live console error, isolated to that one file.
