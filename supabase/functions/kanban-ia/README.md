# kanban-ia: IA del Centro de trabajo

Propone, nunca decide: la página enseña cada propuesta y solo guarda lo que confirmes.

| Acción | Qué devuelve |
|---|---|
| `estado` | si la IA está activa y cuántas llamadas quedan hoy (no gasta) |
| `desglosar` | 3-7 pasos para una tarjeta |
| `siguiente_paso` | una acción concreta y su motivo |
| `plan_dia` | hasta tu capacidad diaria de tarjetas, con motivo (solo ids que envió la página) |
| `capturar` | texto libre → hasta 10 tarjetas (proyecto y fecha validados) |

Qué se envía a Anthropic: títulos, notas, pasos y campos de las tarjetas implicadas (y los nombres de tus proyectos al capturar). Nada más del área privada.

## Activarla

Por defecto está **desactivada** (`KB_AI_PROVIDER=off`) y la página oculta los botones de IA.

```bash
npx supabase functions deploy kanban-ia --project-ref rvizmzjkxunkbqomsvcv --no-verify-jwt --use-api
npx supabase secrets set --project-ref rvizmzjkxunkbqomsvcv KB_AI_PROVIDER=claude KB_MAX_CALLS_PER_DAY=30
```

`ANTHROPIC_API_KEY` es la misma que usa interview-intel; si ya está puesta, no hace falta repetirla.
Para probar sin coste: `KB_AI_PROVIDER=mock` (las respuestas dicen «SIMULADO»).

- Modelo: `KB_MODEL` (por defecto `claude-opus-5-5`, esfuerzo bajo, con respaldo del lado del servidor si declina).
- Tope: cada llamada cuenta aunque falle; el contador vive en `kb_ajustes` (clave `ia_uso`) y se reinicia cada día (hora de Madrid).
- Desactivarla: `KB_AI_PROVIDER=off`.

## Pruebas

```bash
deno test --allow-read supabase/functions/kanban-ia/
```
