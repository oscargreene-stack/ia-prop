// app/api/tasar/route.js
// Agente Valentina — experta tasadora inmobiliaria chilena
// Entrega tasación fundamentada + plan regulador por comuna

export async function POST(request) {
  const body = await request.json()
  const { siiData, form, answers, extras } = body

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  const dir    = siiData?.direccion || `${form.direccion}${form.depto ? ' '+form.depto : ''}, ${form.comuna}`
  const comuna = form.comuna || ''
  const tipo   = extras?.tipo || 'propiedad'
  const m2     = siiData?.m2_construido || siiData?.m2_util || null
  const m2Util = siiData?.m2_util || null
  const rol    = siiData?.rol || null
  const anio   = siiData?.anio_construccion || null
  const avaluo = siiData?.avaluo_fiscal_uf || null
  const caracts = (extras?.caracteristicas || []).filter(c => c !== 'ninguna')

  const systemPrompt = `Eres Valentina, tasadora inmobiliaria experta con 20 años de experiencia en la Región Metropolitana de Chile.

PERFIL:
- Conoces en profundidad el mercado inmobiliario chileno 2024-2025: precios reales por comuna, tendencias, factores que mueven el mercado.
- Manejas los planes reguladores comunales de la RM: zonificación, usos de suelo permitidos, alturas máximas, coeficientes de constructibilidad y ocupación.
- Sabes cómo afectan las normativas al valor: una zona con mayor constructibilidad vale más, una zona de conservación histórica tiene restricciones, etc.
- Conoces los valores de estacionamientos, bodegas, terrazas y jardines en cada mercado.
- Entiendes cómo la remodelación impacta el valor según calidad y antigüedad.

PRECIOS DE REFERENCIA 2025 (UF/m² construido):
- Vitacura: 85-130 | Las Condes: 70-115 | Lo Barnechea: 60-100
- Providencia: 65-100 | Ñuñoa: 55-82 | La Reina: 50-75
- Macul, San Miguel, Quinta Normal: 35-55 | La Florida, Maipú, Pudahuel: 28-50
- Santiago Centro: 45-72 | Peñalolén, La Granja: 30-48 | Puente Alto: 25-40
- San Bernardo, El Bosque: 22-38 | Lo Prado, Renca: 25-42

AJUSTA según:
- Piso: +2% cada 5 pisos sobre el 5to, penaliza piso 1-2 en deptos sin vista
- Orientación norte: +3-5%, sur: -3%
- Estado conservación: excelente +8%, deteriorado -10%
- Año construcción: post-2010 neutro, 2000-2010 -3%, pre-2000 -5 a -10%
- Terraza: 40-60% del precio/m² construido
- Estacionamiento: 200-350 UF según comuna y demanda
- Bodega: 50-100 UF
- Remodelación completa reciente: +10-18% sobre base

RESPONDE SOLO con JSON válido en UNA SOLA LÍNEA (sin saltos de línea dentro de strings), sin texto adicional, sin backticks. Todos los strings deben estar en una sola línea. NO uses \n dentro de valores de strings:
{
  "valor_uf": number,
  "precio_m2": number,
  "confianza": "Alta" | "Media" | "Baja",
  "plan_regulador": {
    "zona": string,
    "nombre_zona": string,
    "uso_suelo": string,
    "altura_max_pisos": number,
    "altura_max_m": number,
    "coef_constructibilidad": string,
    "coef_ocupacion_suelo": string,
    "densidad_max": string,
    "adosamiento": string,
    "antejardín_m": number,
    "observaciones": string,
    "impacto_valor": string
  },
  "comparables": [
    {
      "direccion": string,
      "tipo": string,
      "m2": number,
      "fecha": string,
      "precio_uf": number,
      "uf_m2": number,
      "similitud": string,
      "mismo_edificio": false
    }
  ],
  "desglose": [
    { "concepto": string, "calculo": string, "valor_uf": number }
  ],
  "analisis": string,
  "factores_positivos": [string],
  "factores_negativos": [string],
  "recomendacion_precio_venta": string
}

Para plan_regulador: usa tu conocimiento real de la normativa comunal vigente. Si no tienes certeza de la zona exacta, indica la zona más probable y marca confianza "Media".
Para comparables: genera 3-5 transacciones representativas del mercado real reciente (últimos 12 meses), realistas en precio y ubicación.
Para desglose: desglosa cada componente del valor (base m², ajuste remodelación, estacionamiento, bodega, terraza, etc.) con su cálculo explícito.
La recomendacion_precio_venta debe ser directa y honesta: si el mercado está bajando, dilo; si conviene esperar, explícalo.`

  const detalles = [
    `Tipo de propiedad: ${tipo}`,
    `Dirección: ${dir}`,
    `Comuna: ${comuna}`,
    rol ? `ROL SII: ${rol}` : null,
    m2Util ? `M² útiles: ${m2Util}` : null,
    m2 ? `M² construidos/totales: ${m2}` : null,
    siiData?.m2_terreno ? `M² terreno: ${siiData.m2_terreno}` : null,
    anio ? `Año construcción: ${anio}` : null,
    avaluo ? `Avalúo fiscal: ${avaluo} UF` : null,
    siiData?.destino ? `Destino SII: ${siiData.destino}` : null,
    answers?.remodelacion && answers.remodelacion !== 'ninguna' ? `Remodelación: ${answers.remodelacion}${answers.tiempo_remo ? ', hace '+answers.tiempo_remo : ''}` : 'Sin remodelación',
    answers?.terraza_m2 > 0 ? `Terraza: ${answers.terraza_m2} m²` : null,
    answers?.estacionamientos > 0 ? `Estacionamientos: ${answers.estacionamientos}` : null,
    answers?.bodegas > 0 ? `Bodegas: ${answers.bodegas}` : null,
    extras?.piso ? `Piso: ${extras.piso}` : null,
    extras?.orientacion ? `Orientación: ${extras.orientacion}` : null,
    extras?.jardin_m2 > 0 ? `Jardín/patio: ${extras.jardin_m2} m²` : null,
    caracts.length ? `Características: ${caracts.join(', ')}` : null,
    extras?.precio_idea ? `Precio esperado por vendedor: ${extras.precio_idea}` : null,
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
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Tasa esta propiedad y entrega el plan regulador:\n\n${detalles}` }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return Response.json({ error: data.error?.message || 'Error Anthropic' }, { status: 500 })

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    const clean = text.replace(/```json|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ error: 'Sin JSON en respuesta', raw: text.slice(0, 300) }, { status: 500 })

    // Robust JSON sanitizer: fix common issues from LLM output
    function sanitizeJSON(raw) {
      // 1. Flatten all real newlines (outside or inside strings) to spaces
      let s = raw.replace(/\r?\n/g, ' ').replace(/\r/g, ' ')
      // 2. Remove other control chars except tab
      s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
      // 3. Remove trailing commas before ] or }
      s = s.replace(/,\s*([\]\}])/g, '$1')
      // 4. Fix unescaped quotes inside string values using a state machine
      let result = ''
      let inString = false
      let escaped = false
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        if (escaped) { result += ch; escaped = false; continue }
        if (ch === '\\') { result += ch; escaped = true; continue }
        if (ch === '"') {
          if (!inString) { inString = true; result += ch; continue }
          // Peek: if next non-space char is : , } ] then this closes the string
          let j = i + 1
          while (j < s.length && s[j] === ' ') j++
          const next = s[j]
          if (next === ':' || next === ',' || next === '}' || next === ']') {
            inString = false; result += ch
          } else {
            // Unescaped quote inside string — escape it
            result += '\\"'
          }
          continue
        }
        result += ch
      }
      return result
    }

    const sanitized = sanitizeJSON(match[0])
    try {
      return Response.json(JSON.parse(sanitized))
    } catch(parseErr) {
      console.error('JSON parse error:', parseErr.message)
      // Last resort: extract fields individually with regex
      const extract = (key) => {
        const m = sanitized.match(new RegExp('"' + key + '"\\s*:\\s*([\\d.]+)'))
        return m ? parseFloat(m[1]) : null
      }
      const extractStr = (key) => {
        const m = sanitized.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"'))
        return m ? m[1] : null
      }
      const fallback = {
        valor_uf: extract('valor_uf'),
        precio_m2: extract('precio_m2'),
        confianza: extractStr('confianza') || 'Baja',
        analisis: extractStr('analisis') || 'Tasación completada con datos disponibles.',
        recomendacion_precio_venta: extractStr('recomendacion_precio_venta') || '',
        desglose: [], comparables: [], factores_positivos: [], factores_negativos: [], plan_regulador: null
      }
      if (fallback.valor_uf) return Response.json(fallback)
      return Response.json({ error: 'JSON invalido: ' + parseErr.message, raw: sanitized.slice(0, 300) }, { status: 500 })
    }
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
