// app/api/sii/route.js
// Usa Claude + DataInmobiliaria MCP para buscar datos SII — más confiable que BaseAPI directa

const MCP_URL = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = (searchParams.get('direccion') || '').trim()
  const comuna    = (searchParams.get('comuna')    || '').trim()
  const unidad    = (searchParams.get('unidad')    || '').trim()

  console.log('[SII] Buscando:', direccion, '| Comuna:', comuna, '| Unidad:', unidad)

  if (!direccion) return Response.json({ error: 'Falta la dirección' }, { status: 400 })

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  const dirCompleta = [direccion, unidad, comuna].filter(Boolean).join(' ')

  const systemPrompt = `Eres un asistente que busca información de propiedades en el SII de Chile usando el MCP de DataInmobiliaria.
Responde SOLO con un JSON válido, sin texto adicional, sin backticks, sin markdown.

Estructura esperada:
{
  "encontrado": true | false,
  "multiples": true | false,
  "propiedades": [
    {
      "direccion": string,
      "rol": string,
      "destino": string,
      "m2_construido": number | null,
      "m2_terreno": number | null,
      "anio_construccion": number | null,
      "avaluo_fiscal_uf": number | null
    }
  ]
}

Si no encuentras la propiedad, devuelve { "encontrado": false, "multiples": false, "propiedades": [] }.`

  const userPrompt = `Busca en el SII esta propiedad usando las herramientas disponibles del MCP:
- Dirección: ${direccion}
${unidad ? `- Número de unidad/departamento: ${unidad}` : ''}
- Comuna: ${comuna}

Instrucciones:
1. Usa tasacion_automatica o contribuciones_propiedad con la dirección "${dirCompleta}"
2. Extrae: dirección registrada, ROL SII, destino/uso, m² construidos, m² terreno, año construcción, avalúo fiscal en UF
3. Si hay múltiples unidades en el edificio, incluye todas en el array propiedades
4. Si hay una unidad específica (${unidad || 'ninguna'}), ponla primero en el array`

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
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        mcp_servers: [{ type: 'url', url: MCP_URL, name: 'datainmobiliaria' }],
      }),
    })

    const data = await res.json()
    console.log('[SII] Anthropic status:', res.status)

    if (!res.ok) {
      console.error('[SII] Anthropic error:', JSON.stringify(data).slice(0, 300))
      return Response.json({ error: data.error?.message || 'Error Anthropic', multiples: false, resultados: [] }, { status: 500 })
    }

    // Extraer JSON del texto
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    console.log('[SII] Claude response (500 chars):', textBlocks.slice(0, 500))

    const match = textBlocks.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (!match) {
      console.log('[SII] No JSON en respuesta')
      return Response.json({ multiples: false, resultados: [], noEncontrado: true })
    }

    const parsed = JSON.parse(match[0])
    console.log('[SII] Parsed:', JSON.stringify(parsed).slice(0, 400))

    if (!parsed.encontrado || !parsed.propiedades?.length) {
      return Response.json({ multiples: false, resultados: [], noEncontrado: true })
    }

    return Response.json({
      multiples: parsed.multiples && parsed.propiedades.length > 1,
      resultados: parsed.propiedades,
    })

  } catch (err) {
    console.error('[SII] Error:', err.message)
    return Response.json({ error: err.message, multiples: false, resultados: [] }, { status: 500 })
  }
}
