// app/api/tasar/route.js

const MCP_URL = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'

export async function POST(request) {
  const body = await request.json()
  const { siiData, form, answers, extras } = body

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  const dir    = siiData?.direccion || `${form.direccion}, ${form.comuna}`
  const comuna = form.comuna || ''
  const m2     = siiData?.m2_construido
  const rol    = siiData?.rol || null
  const codCom = siiData?.cod_com
  const codMz  = siiData?.cod_mz
  const codPr  = siiData?.cod_pr

  const tipo     = extras?.tipo || 'propiedad'
  const caracts  = (extras?.caracteristicas || []).filter(c => c !== 'ninguna')
  const tiempoR  = extras?.tiempo_remo || null
  const precioI  = extras?.precio_idea || null

  const systemPrompt = `Eres un agente experto en tasación inmobiliaria del mercado chileno.
Tienes acceso al MCP de DataInmobiliaria con BigQuery y herramientas de tasación.
Responde SOLO con un JSON válido, sin texto adicional, sin backticks, sin markdown.

Estructura de respuesta:
{
  "valor_uf": number,
  "precio_m2": number,
  "confianza": "Alta" | "Media" | "Baja",
  "plan_regulador": {
    "zona": string,
    "uso_suelo": string,
    "altura_max": string,
    "coeficiente_constructibilidad": string,
    "densidad_max": string
  },
  "analisis": string,
  "comparables": [
    {
      "direccion": string,
      "m2": number,
      "fecha": string,
      "precio_uf": number,
      "uf_m2": number,
      "mismo_edificio": boolean
    }
  ]
}`

  const rolInfo = (codCom && codMz && codPr)
    ? `ROL numérico: cod_com=${codCom}, cod_mz=${codMz}, cod_pr=${codPr}`
    : (rol ? `ROL: ${rol}` : 'ROL no disponible')

  const userPrompt = `Tasa esta propiedad:
- Tipo: ${tipo}
- Dirección: ${dir}
- Comuna: ${comuna}
- ${rolInfo}
- M² construidos: ${m2 || 'no disponible'}
- Destino SII: ${siiData?.destino || 'no disponible'}
- Año construcción: ${siiData?.anio_construccion || 'no disponible'}
- Avalúo fiscal: ${siiData?.avaluo_fiscal_uf ? siiData.avaluo_fiscal_uf + ' UF' : 'no disponible'}
- Remodelación: ${answers?.remodelacion || 'ninguna'}
- Conservación: ${answers?.conservacion || 'bueno'}
${caracts.length ? `- Características: ${caracts.join(', ')}` : ''}
${tiempoR ? `- Tiempo remodelación: ${tiempoR}` : ''}
${answers?.terraza_m2 > 0 ? `- Terraza: ${answers.terraza_m2} m²` : ''}
${answers?.estacionamientos > 0 ? `- Estacionamientos: ${answers.estacionamientos}` : ''}
${answers?.bodegas > 0 ? `- Bodegas: ${answers.bodegas}` : ''}
${precioI ? `- Precio ideal del vendedor: ${precioI}` : ''}

Instrucciones:
1. Si tienes cod_com/cod_mz/cod_pr, usa tasacion_automatica directamente
2. Busca comparables CBR en radio de 500m con bq_run_query en cbr_limpio + consolidado
3. Prioriza comparables del mismo edificio (mismo cod_mz_bc)
4. El valor_uf debe ser el valor base de mercado SOLO de comparables (sin ajustes por remodelación/terraza)
5. Para el plan regulador, usa contexto_tasacion y bq_run_query
6. Incluye entre 3 y 6 comparables ordenados por relevancia`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        mcp_servers: [{ type: 'url', url: MCP_URL, name: 'datainmobiliaria', authorization_token: process.env.DATAINMOBILIARIA_TOKEN }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return Response.json({ error: data.error?.message || 'Error Anthropic' }, { status: 500 })

    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    const match = textBlocks.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ error: 'Sin JSON en respuesta', raw: textBlocks.slice(0, 300) }, { status: 500 })

    return Response.json(JSON.parse(match[0]))
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
