# IA Prop — Etapa 3 (Valorización) · Notas de avance

> Handoff de continuidad. Última actualización: 2026-06-09.
> Rama de trabajo: `etapa3-valorizacion` · `main` intacto.
> Preview: https://ia-prop-git-etapa3-valorizacion-oscariaprop.vercel.app

## Estado actual

### ✅ Resuelto: comparables CBR reales de punta a punta
La tasación de Valentina ahora ancla en transacciones reales del CBR. Antes
devolvía 0 comparables y el precio salía de referencias inventadas por el LLM.

**Qué se hizo** — se reescribió el bloque de comparables en `app/api/tasar/route.js`:
- **Antes:** Anthropic + MCP con token estático → fallaba en silencio (el MCP de
  DataInmobiliaria es OAuth interactivo, no sirve desde un backend; y el token de
  organización está limitado por el plan Individual).
- **Ahora:** llamada directa a la API REST `GET /api/v1/propiedades/detalle`
  (host DataInmobiliaria) con `Authorization: Bearer ${process.env.BASEAPI_KEY}`.
- Se parsea `detalle_ventas_recientes`, se filtra por superficie (0.6–1.5×) y
  `cod_destino`, se ordena por `distancia_metros`, se mapea al shape de comparable
  y se corta a 12. Sin MCP, sin Haiku, sin cambiar de plan.

**Verificado** (fixture Las Condes, ROL 15108-202-66, 80 m²):
`6.320 UF` · `CONFIANZA ALTA` · desglose *"Valor base por comparables CBR —
mediana 79 UF/m² × 80 m² (12 ventas reales)"* · 6 comparables reales en la tarjeta.

**Ya commiteado en la rama:** la reescritura REST + la remoción de la
instrumentación `_debug` de `tasar/route.js`.

## Pendiente

1. **Borrar `app/api/resttest/route.js`** — ruta temporal de diagnóstico.
   En GitHub: abrir el archivo → *More file actions* (…) → *Delete file* → commit.
2. **Fix #3 — ajustes determinísticos:** mover remodelación / piso / orientación
   fuera del prompt del LLM a código determinístico; y alinear la narrativa del LLM
   con los números determinísticos (hoy la prosa puede decir "77 / 6.160" cuando el
   titular es "79 / 6.320").
3. **Fix #4 — back-office editable** de ajustes (persistido; el LLM solo narra).
   Requiere decisiones: persistencia (Vercel KV / Postgres) + auth de admin.
4. **Merge `etapa3-valorizacion` → `main`:** solo al final, con todo limpio
   (incluido `resttest` borrado) y OK explícito.

## Notas técnicas

- Endpoint REST de comparables: `GET /api/v1/propiedades/detalle`
  con params `cod_com, cod_mz, cod_pr, radio, superficie_min, superficie_max, cod_destino`
  (auth Bearer). Campos útiles de `detalle_ventas_recientes[]`: `price` (UF),
  `superficie_construccion`, `fecha`, `direccion_sii`, `distancia_metros`, `cod_mz`.
- El ROL se separa en `cod_com-cod_mz-cod_pr`.
- Credencial que funciona para la API REST: variable de entorno `BASEAPI_KEY`
  (configurada en Vercel, Prod + Preview).

## Seguridad (pendiente — detalle en la conversación, no acá)
- Revisar credenciales expuestas y rotar lo que corresponda.
- Restringir las API keys públicas por dominio/referrer.

---
*Handoff de continuidad. Para el contexto completo, ver el historial de la
conversación con Claude.*
