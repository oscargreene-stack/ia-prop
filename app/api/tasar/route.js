// app/api/tasar/route.js
// Tasación usando Claude con conocimiento del mercado inmobiliario chileno
// Sin MCP (DataInmobiliaria MCP requiere OAuth Google, no funciona desde Vercel)

export async function POST(request) {
  const body = await request.json()
  const { siiData, form, answers, extras } = body

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  const dir    = siiData?.direccion || `${form.direccion}${form.depto ? ' '+form.depto : ''}, ${form.comuna}`
  const comuna = form.comuna || ''
  const tipo   = extras?.tipo || 'propiedad'
  const m2     = siiData?.m2_construido || null
  const caracts = (extras?.caracteristicas || []).filter(c => c !== 'ninguna')

  const systemPrompt = `Eres un experto tasador inmobiliario del mercado chileno con 20 años de experiencia en la Región Metropolitana.
Conoces a fondo los precios de mercado por comunas: Vitacura, Las Condes, Lo Barnechea, Providencia, Ñuñoa, La Reina, La Florida, Maipú, Santiago, etc.
Respondes SOLO con un JSON válido, sin texto adicional, sin backticks, sin markdown.

Estructura de respuesta:
{
  "valor_uf": number (estimación del valor de mercado total en UF),
  "precio_m2": number (UF por m² construido),
  "confianza": "Alta" | "Media" | "Baja",
  "plan_regulador": {
    "zona": string,
    "uso_suelo": string,
    "altura_max": string,
    "coeficiente_constructibilidad": string,
    "densidad_max": string
  },
  "analisis": string (2-3 oraciones sobre el mercado actual en esa zona y el valor estimado),
  "comparables": [
    {
      "direccion": string (inventa una dirección cercana realista),
      "m2": number,
      "fecha": string (últimos 12 meses),
      "precio_uf": number,
      "uf_m2": number,
      "mismo_edificio": false
    }
  ]
}

Para la estimación usa tu conocimiento de precios de mercado reales en Chile 2024-2025.
Rangos de referencia por comuna (UF/m²):
- Vitacura: 80-120 UF/m²
- Las Condes: 70-110 UF/m²
- Lo Barnechea: 60-95 UF/m²
- Providencia: 65-100 UF/m²
- Ñuñoa: 55-80 UF/m²
- La Reina: 50-75 UF/m²
- Macul, San Miguel: 35-55 UF/m²
- La Florida, Maipú: 30-50 UF/m²
- Santiago Centro: 45-70 UF/m²
Ajusta según tipo de propiedad, características y condición.
Genera 3-5 comparables ficticios pero realistas basados en el mercado real.`

  const detalles = [
    `Tipo: ${tipo}`,
    `Dirección: ${dir}`,
    `Comuna: ${comuna}`,
    m2 ? `M² construidos: ${m2}` : null,
    siiData?.m2_terreno ? `M² terreno: ${siiData.m2_terreno}` : null,
    siiData?.anio_construccion ? `Año construcción: ${siiData.anio_construccion}` : null,
    siiData?.avaluo_fiscal_uf ? `Avalúo fiscal: ${siiData.avaluo_fiscal_uf} UF` : null,
    `Remodelación: ${answers?.remodelacion || 'ninguna'}`,
    answers?.conservacion ? `Conservación: ${answers.conservacion}` : null,
    caracts.length ? `Características: ${caracts.join(', ')}` : null,
    extras?.tiempo_remo ? `Tiempo remodelación: ${extras.tiempo_remo}` : null,
    extras?.precio_idea ? `Precio ideal vendedor: ${extras.precio_idea}` : null,
    // Datos específicos por tipo
    extras?.piso ? `Piso: ${extras.piso}` : null,
    extras?.orientacion ? `Orientación: ${extras.orientacion}` : null,
    extras?.terraza_m2 && extras.terraza_m2 > 0 ? `Terraza: ${extras.terraza_m2} m²` : null,
    extras?.jardin_m2 && parseFloat(extras.jardin_m2) > 0 ? `Jardín/patio privado: ${extras.jardin_m2} m²` : null,
    extras?.estacionamientos && extras.estacionamientos > 0 ? `Estacionamientos: ${extras.estacionamientos}` : null,
    extras?.bodega && extras.bodega > 0 ? `Bodegas: ${extras.bodega}` : null,
    extras?.superficie_ha ? `Hectáreas: ${extras.superficie_ha}` : null,
    extras?.derechos_agua ? `Derechos de agua: ${extras.derechos_agua}` : null,
    extras?.plantacion ? `Plantación: ${extras.plantacion}` : null,
  ].filter(Boolean).join('\n')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Tasa esta propiedad con los siguientes datos:\n\n${detalles}\n\nProporciona una tasación profesional basada en el mercado actual de ${comuna}.`
        }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return Response.json({ error: data.error?.message || 'Error Anthropic' }, { status: 500 })

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    const match = text.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ error: 'Sin JSON en respuesta' }, { status: 500 })

    return Response.json(JSON.parse(match[0]))
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
