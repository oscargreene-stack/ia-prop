# IA Prop — Agente Tasador Inmobiliario

Agente de valorización de propiedades para el mercado chileno (RM).

## Stack
- **Next.js 14** (App Router)
- **DataInmobiliaria MCP** — comparables CBR + plan regulador
- **BaseAPI** — datos SII (ROL, m², avalúo fiscal)
- **Anthropic API** — claude-sonnet-4

Las API keys viven en el servidor (rutas `/api/*`), nunca en el browser.

---

## Opción A — Subir a Vercel (recomendado, gratis)

1. Crea cuenta en [vercel.com](https://vercel.com) con tu Gmail
2. Instala Vercel CLI:
   ```
   npm install -g vercel
   ```
3. Dentro de la carpeta del proyecto:
   ```
   vercel
   ```
4. Sigue las instrucciones (acepta todo por defecto)
5. En el dashboard de Vercel → Settings → Environment Variables, agrega:
   - `ANTHROPIC_API_KEY` = tu key de https://console.anthropic.com
   - `BASEAPI_KEY` = sk_e6c42f75c71c26dfaabb3ceab35d2e57948c
   - `MCP_URL` = https://mcp.datainmobiliaria.cl/mcp
6. Haz un `vercel --prod` para republicar con las variables

---

## Opción B — Correr localmente

```bash
# 1. Instalar dependencias
npm install

# 2. Crear archivo de variables
cp .env.example .env.local
# Editar .env.local y pegar tu ANTHROPIC_API_KEY

# 3. Correr en desarrollo
npm run dev
# Abre http://localhost:3000
```

---

## Estructura
```
app/
  page.jsx          ← UI completa del agente tasador
  layout.js         ← Layout raíz
  api/
    sii/route.js    ← Proxy a BaseAPI (datos SII)
    tasar/route.js  ← Proxy a Anthropic + MCP DataInmobiliaria
.env.example        ← Plantilla de variables de entorno
```

## Próximos pasos
- [ ] Agente comprador
- [ ] Base de datos de propiedades en venta
- [ ] Migrar a API REST DataInmobiliaria para producción
