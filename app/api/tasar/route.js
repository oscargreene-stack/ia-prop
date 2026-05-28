// app/api/tasar/route.js
// Llama a Claude con MCP DataInmobiliaria — API keys solo en servidor

export async function POST(request) {
  const body = await request.json()
  const { siiData, form, answers } = body

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const MCP_URL = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'

  if (!ANTHROPIC_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })
  }

  const m2 = parseFloat(siiData?.m2_construido) || null
  const rol = siiData?.rol || null
  const dir = siiData?.direccion || `${form.direccion}, ${form.comuna}`
  const comuna = form.comuna

  const systemPrompt = `Eres un agente experto en tasación inmobiliaria del mercado chileno.
Usas el MCP de DataInmobiliaria para buscar comparables reales del CBR.
Siempre respondes SOLO con un JSON válido, sin texto adicional, sin backticks, sin markdown.

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

  const userPrompt = `Tasa esta propiedad:
- Dirección: ${dir}
- Comuna: ${comuna}
- ROL SII: ${rol || 'no disponible'}
- M² útiles (SII): ${m2 || 'no disponible'}
- Destino: ${siiData?.destino || 'no disponible'}
- Año construcción: ${siiData?.anio_construccion || 'no disponible'}
- Estado: remodelación ${answers.remodelacion}, conservación ${answers.conservacion}
${form.depto ? `- Unidad: ${form.depto}` : ''}

Instrucciones:
1. Usa tasacion_automatica con la dirección y ROL si está disponible
2. Busca comparables CBR en radio de 500m a 1km, propiedades similares (mismo tipo y rango de m²)
3. Prioriza comparables del mismo edificio si los hay
4. Para el plan regulador, consulta los datos de zonificación de ${comuna}
5. El valor_uf debe ser el valor de mercado base SOLO de comparables (sin ajustes)
6. Marca mismo_edificio: true solo para unidades en el mismo edificio/condominio
7. Incluye entre 3 y 8 comparables ordenados por relevancia`

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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        mcp_servers: [
          { type: 'url', url: MCP_URL, name: 'datainmobiliaria' },
        ],
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      return Response.json({ error: data.error?.message || 'Error Anthropic' }, { status: 500 })
    }

    // Extraer texto de los bloques de contenido
    const textBlocks = (data.content || []).filter((b) => b.type === 'text')
    const jsonText = textBlocks.map((b) => b.text).join('\n')
    const clean = jsonText.replace(/```json|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)

    if (!match) {
      return Response.json({ error: 'Respuesta sin JSON válido', raw: jsonText }, { status: 500 })
    }

    const parsed = JSON.parse(match[0])
    return Response.json(parsed)
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
