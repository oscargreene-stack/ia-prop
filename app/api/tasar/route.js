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
  const rol    = siiData?.rol || null
  const anio   = siiData?.anio_construccion || null
  const avaluo = siiData?.avaluo_total_clp ? Math.round(siiData.avaluo_total_clp / 38000) : null  // convertido de CLP
  const caracts = (extras?.caracteristicas || []).filter(c => c !== 'ninguna')

  // Validar y enriquecer datos SII con DataInmobiliaria cuando hay ROL
  // BaseAPI a veces devuelve m2_terreno incorrectos — DataInmobiliaria tiene el dato real del SII
  let m2Terreno = parseFloat(siiData?.m2_terreno) || null
  let m2Construido = parseFloat(siiData?.m2_construido) || null
  let m2Util = null  // campo eliminado en nueva API, usar m2Construido

  if (rol) {
    try {
      const MCP_URL = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
      const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN
      // Parsear ROL formato "cod_com-cod_mz-cod_pr"
      const rolParts = rol.toString().split('-')
      if (rolParts.length === 3 && DATAINM_TOKEN) {
        const [codCom, codMz, codPr] = rolParts.map(Number)
        const query = `SELECT superficie_total_terreno, superficie_construccion, ano_construccion FROM datainmobiliaria.consolidado WHERE cod_com=${codCom} AND cod_mz=${codMz} AND cod_pr=${codPr} LIMIT 1`
        const bqRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'mcp-client-2025-04-04'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            system: 'Respond only with a JSON object: {"superficie_total_terreno": N, "superficie_construccion": N}. No other text.',
            messages: [{ role: 'user', content: `Run this BigQuery SQL and return the result as JSON: ${query}` }],
            mcp_servers: [{ type: 'url', url: MCP_URL, name: 'datainmobiliaria', authorization_token: DATAINM_TOKEN }]
          })
        })
        if (bqRes.ok) {
          const bqData = await bqRes.json()
          const bqText = (bqData.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
          const bqMatch = bqText.match(/\{[^}]+\}/)
          if (bqMatch) {
            const siiReal = JSON.parse(bqMatch[0])
            // Solo sobreescribir si DataInmobiliaria tiene datos más completos
            if (siiReal.superficie_total_terreno > 0) m2Terreno = siiReal.superficie_total_terreno
            if (siiReal.superficie_construccion > 0) m2Construido = siiReal.superficie_construccion
          }
        }
      }
    } catch (e) {
      console.error('DataInmobiliaria enrichment failed:', e.message)
      // Continuar con los datos que tenemos
    }
  }

  const m2 = m2Construido || m2Util || null

  const systemPrompt = `Eres Valentina, tasadora inmobiliaria experta con 20 años de experiencia en la Región Metropolitana de Chile.

REGLAS CRÍTICAS — DATOS CONFIRMADOS:
- Los datos marcados como "CONFIRMADO" o "verificado" son datos reales del SII proporcionados por el vendedor. NUNCA los modifiques ni estimes valores distintos.
- Si ves "M² terreno CONFIRMADO: 3982 m²", el terreno ES 3982 m². NO uses "estimado" ni cambies el número.
- Si ves "M² construidos CONFIRMADOS: 440 m²", la construcción ES 440 m². NO uses otro valor.
- Usa EXACTAMENTE los m² indicados en el desglose y en toda la tasación.
- Si no hay dato de terreno confirmado, ENTONCES puedes estimarlo y marcarlo como "(estimado)".

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

ANÁLISIS DE POTENCIAL DE DESARROLLO (solo para casas y terrenos con m² terreno > 800m²):
Cuando el terreno es grande, SIEMPRE incluir en el JSON el campo "potencial_desarrollo" con:
- Cuántas unidades habitacionales permite la densidad del plan regulador (densidad_max hab/ha ÷ ~3.5 personas/hogar ÷ 10000 * m2_terreno = unidades aprox)
- Si supera 2 unidades: indicar que el terreno permite subdividir y construir un condominio de casas o vender lotes
- Mencionar que esto puede multiplicar el valor del terreno significativamente
- SIEMPRE aclarar que "estos datos son referenciales y deben ser verificados con un arquitecto y la DOM de la municipalidad"
- Si densidad_max no está disponible, usar 100 hab/ha como referencia conservadora para Las Condes/Vitacura/Lo Barnechea y 150 hab/ha para otras comunas RM

Ejemplo de cálculo: terreno 3.982m², densidad 50 hab/ha → (50/10000)*3982/4 = ~5 unidades → "el terreno permitiría construir aproximadamente 5 casas en condominio"

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
      "m2_terreno": number | null,
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
  "recomendacion_precio_venta": string,
"potencial_desarrollo": {
  "aplica": boolean,
  "m2_terreno": number,
  "densidad_max_hab_ha": number,
  "unidades_estimadas": number,
  "descripcion": string,
  "advertencia": string
} | null
}

Para plan_regulador: usa tu conocimiento real de la normativa comunal vigente. Si no tienes certeza de la zona exacta, indica la zona más probable y marca confianza "Media".
Para comparables: genera 3-5 transacciones REALES representativas del mercado 2024-2025. Usa datos reales de ventas del CBR (Conservador de Bienes Raíces). Para CASAS y TERRENOS incluye SIEMPRE m2_terreno (superficie del predio, no solo construcción) — esto es fundamental para comparar propiedades de forma correcta. Para departamentos, m2_terreno puede ser null. Las fechas deben ser de 2024 o 2025 — hay abundantes transacciones en ambos años.
Para desglose: desglosa cada componente del valor (base m², ajuste remodelación, estacionamiento, bodega, terraza, etc.) con su cálculo explícito.
La recomendacion_precio_venta debe ser directa y honesta: si el mercado está bajando, dilo; si conviene esperar, explícalo.`

  const detalles = [
    `Tipo de propiedad: ${tipo}`,
    `Dirección: ${dir}`,
    `Comuna: ${comuna}`,
    rol ? `ROL SII: ${rol}` : null,
    m2Construido ? `M² construidos CONFIRMADOS: ${m2Construido} m² (dato verificado, NO modificar)` : null,
    m2Terreno ? `M² terreno CONFIRMADO: ${m2Terreno} m² (dato verificado, NO modificar)` : null,
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
        max_tokens: 3000,
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
      // 0. Replace unicode typographic quotes/apostrophes that break JSON
      let s0 = raw
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '\"') // curly double quotes -> "
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "\'") // curly single quotes -> '
        .replace(/\u2013|\u2014/g, '-')  // em/en dash -> hyphen
      // 1. Flatten all real newlines (outside or inside strings) to spaces
      let s = s0.replace(/\r?\n/g, ' ').replace(/\r/g, ' ')
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
      const parsed = JSON.parse(sanitized)

    // Calcular potencial_desarrollo en el servidor (no depender del LLM)
    // Se agrega siempre para casas/terrenos con m2_terreno > 800
    if (m2Terreno && m2Terreno > 800 && ['casa','terreno','parcela','agricola'].includes(tipo)) {
      const pr = parsed.plan_regulador
      // Densidad: usar la del plan regulador si existe, si no usar referencia por comuna
      let densidadHabHa = null
      if (pr?.densidad_max) {
        // Parsear "50 hab/ha" o "100 hab/ha" o numero directo
        const dm = String(pr.densidad_max).match(/\d+/)
        if (dm) densidadHabHa = parseInt(dm[0])
      }
      if (!densidadHabHa) {
        // Referencia conservadora por tipo de zona
        const comunaLower = comuna.toLowerCase()
        if (['vitacura','las condes','lo barnechea','la reina'].some(c => comunaLower.includes(c))) {
          densidadHabHa = 60
        } else {
          densidadHabHa = 120
        }
      }
      const personasPorHogar = 4
      const unidadesEstimadas = Math.floor((densidadHabHa / 10000) * m2Terreno / personasPorHogar)

      if (unidadesEstimadas >= 2) {
        parsed.potencial_desarrollo = {
          aplica: true,
          m2_terreno: m2Terreno,
          densidad_max_hab_ha: densidadHabHa,
          unidades_estimadas: unidadesEstimadas,
          descripcion: unidadesEstimadas >= 4
            ? "El terreno de " + m2Terreno.toLocaleString('es-CL') + " m² permite, según la densidad del plan regulador (" + densidadHabHa + " hab/ha), construir aproximadamente " + unidadesEstimadas + " casas en condominio. Esto significa que es posible demoler la construcción actual y desarrollar un proyecto de " + unidadesEstimadas + " viviendas, multiplicando significativamente el valor del terreno. Un comprador desarrollador puede valorar este predio muy por encima del valor como vivienda individual."
            : "El terreno de " + m2Terreno.toLocaleString('es-CL') + " m² permitiría subdividir y construir hasta " + unidadesEstimadas + " viviendas según la densidad del plan regulador (" + densidadHabHa + " hab/ha). Esto abre la posibilidad de vender el terreno a un desarrollador o construir una segunda vivienda, aumentando el potencial de valorización.",
          advertencia: "Cálculo referencial basado en la densidad del plan regulador. Los m² mínimos de subdivisión, la factibilidad real del proyecto y las condiciones específicas deben verificarse con un arquitecto y la Dirección de Obras Municipales (DOM) de " + comuna + "."
        }
      } else {
        parsed.potencial_desarrollo = { aplica: false }
      }
    } else if (!parsed.potencial_desarrollo) {
      parsed.potencial_desarrollo = { aplica: false }
    }

    return Response.json(parsed)
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
