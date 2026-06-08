// app/api/tasar/route.js
// Agente Valentina — tasadora inmobiliaria experta
// FLUJO:
//  1. Requiere m2_construido real del SII (no estimado)
//  2. Obtiene comparables REALES del CBR via DataInmobiliaria BigQuery
//  3. Claude analiza y valoriza usando esos comparables reales

const COD_COMUNA = {
  'CERRILLOS':14166,'CERRO NAVIA':14156,'CONCHALI':14127,'EL BOSQUE':16165,'ESTACION CENTRAL':14157,
  'HUECHURABA':14158,'INDEPENDENCIA':13167,'LA CISTERNA':16110,'LA FLORIDA':15128,'LA GRANJA':16131,
  'LA PINTANA':16154,'LA REINA':15132,'LAS CONDES':15108,'LO BARNECHEA':15161,'LO ESPEJO':16164,
  'LO PRADO':14155,'MACUL':15151,'MAIPU':14109,'NUNOA':15105,'PEDRO AGUIRRE CERDA':16162,
  'PENALOLEN':15152,'PROVIDENCIA':15103,'PUDAHUEL':14111,'PUENTE ALTO':16301,'QUILICURA':14114,
  'QUINTA NORMAL':14107,'RECOLETA':13159,'RENCA':14113,'SAN BERNARDO':16401,'SAN JOAQUIN':16163,
  'SAN MIGUEL':16106,'SAN RAMON':16153,'SANTIAGO':13101,'VITACURA':15160,
}
function normalizaComuna(s) {
  return String(s || '').trim().toUpperCase()
    .replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U')
    .replace(/Ñ/g,'N')
}

export async function POST(request) {
  const body = await request.json()
  const { siiData, form, answers, extras } = body

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const MCP_URL       = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
  const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN

  if (!ANTHROPIC_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  const dir       = siiData?.direccion || `${form.direccion}${form.depto ? ' '+form.depto : ''}, ${form.comuna}`
  const comuna    = form.comuna || ''
  const tipo      = extras?.tipo || 'propiedad'
  const rol       = siiData?.rol || null
  const anio      = siiData?.anio_construccion || null
  const avaluo    = siiData?.avaluo_total_clp ? Math.round(siiData.avaluo_total_clp / 40408) : null
  const caracts   = (extras?.caracteristicas || []).filter(c => c !== 'ninguna')

  // ── Superficies confirmadas del SII ──────────────────────────────────────
  const m2Construido = siiData?.m2_construido ? parseFloat(siiData.m2_construido) : null
  const m2Terreno    = siiData?.m2_terreno    ? parseFloat(siiData.m2_terreno)    : null

  // Si no hay datos SII: no tasamos
  if (!m2Construido && !m2Terreno) {
    return Response.json({
      error: 'Sin datos SII',
      mensaje: 'No se encontraron los metros cuadrados reales del SII. No es posible realizar una tasación sin esta información.'
    }, { status: 422 })
  }

  // ── 1. Obtener comparables REALES del CBR via BigQuery ──────────────────
  let comparablesReales = []
  const _dbg = {}
  try {
    if (DATAINM_TOKEN) {
      const codCom = siiData?.cod_comuna
        || (rol ? parseInt(String(rol).split('-')[0], 10) : null)
        || COD_COMUNA[normalizaComuna(comuna)]
        || null
      _dbg.codCom = codCom

      // SQL para comparables: casas/terrenos en misma comuna, últimos 18 meses, con m2 similares
      // Para casas: buscar propiedades con m2_construido similar ±40% Y m2_terreno si existe
      let sqlComparables
      const esTerreno = ['terreno', 'parcela', 'agricola'].includes(tipo)
      const esCasa    = tipo === 'casa'

      if (codCom && (m2Construido || m2Terreno)) {
        const m2Base = m2Construido || m2Terreno
        const m2Min  = Math.round(m2Base * 0.55)
        const m2Max  = Math.round(m2Base * 1.45)
        const terrenoWhere = m2Terreno && esCasa
          ? `AND c.superficie_total_terreno BETWEEN ${Math.round(m2Terreno * 0.4)} AND ${Math.round(m2Terreno * 2.5)}`
          : ''
        const copropWhere = (tipo === 'departamento' || tipo === 'oficina')
          ? 'AND c.copropiedad = TRUE'
          : tipo === 'casa' ? 'AND c.copropiedad = FALSE' : ''

        sqlComparables = `
          SELECT
            cbr.fecha_inscripcion,
            cbr.precio_uf,
            c.superficie_construccion AS m2_construido,
            c.superficie_total_terreno AS m2_terreno,
            c.direccion_sii,
            c.cod_destino,
            c.ano_construccion,
            c.cod_com, c.cod_mz, c.cod_pr
          FROM datainmobiliaria.cbr_limpio cbr
          JOIN datainmobiliaria.consolidado c
            ON cbr.cod_com = c.cod_com AND cbr.cod_mz = c.cod_mz AND cbr.cod_pr = c.cod_pr
          WHERE cbr.cod_com = ${codCom}
            AND cbr.fecha_inscripcion >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
            AND cbr.precio_uf BETWEEN 500 AND 100000
            AND c.superficie_construccion BETWEEN ${m2Min} AND ${m2Max}
            ${terrenoWhere}
            ${copropWhere}
          ORDER BY cbr.fecha_inscripcion DESC
          LIMIT 12
        `

        const bqRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'mcp-client-2025-04-04',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 3000,
            system: 'Run the SQL using bq_run_query and return ONLY the raw JSON array of rows. No markdown, no explanation.',
            messages: [{ role: 'user', content: `Run this SQL and return only the JSON array:\n${sqlComparables}` }],
            mcp_servers: [{ type: 'url', url: MCP_URL, name: 'datainmobiliaria', authorization_token: DATAINM_TOKEN }],
          }),
        })

        _dbg.bqOk = bqRes.ok
        _dbg.bqStatus = bqRes.status
        if (!bqRes.ok) { try { _dbg.bqErr = (await bqRes.text()).slice(0, 500) } catch(e) {} }
        if (bqRes.ok) {
          const bqData = await bqRes.json()
          _dbg.contentTypes = (bqData.content || []).map(b => b.type)
          // Extrae filas de forma robusta, sin depender de que el modelo
          // reescriba el JSON:
          //  1) resultado ESTRUCTURADO del tool MCP (bq_run_query => {rows:[...]})
          //  2) fallback: primer array JSON con precio_uf en cualquier bloque de texto
          let rows = []
          for (const b of (bqData.content || [])) {
            if (b.type === 'mcp_tool_result') {
              const t = b.content?.[0]?.text || ''
              try {
                const obj = JSON.parse(t)
                if (obj && Array.isArray(obj.rows)) { rows = obj.rows; break }
                if (Array.isArray(obj)) { rows = obj; break }
              } catch(e) {}
            }
          }
          if (rows.length === 0) {
            const bqText = (bqData.content || [])
              .map(b => b.type === 'mcp_tool_result' ? (b.content?.[0]?.text || '') : (b.text || ''))
              .join('\n')
            const cands = bqText.match(/\[[\s\S]*?\]/g) || []
            cands.sort((a, b) => b.length - a.length)
            for (const c of cands) {
              try {
                const arr = JSON.parse(c)
                if (Array.isArray(arr) && arr.length && arr[0] && ('precio_uf' in arr[0])) { rows = arr; break }
              } catch(e) {}
            }
          }

          _dbg.rowsFound = rows.length
          try {
            comparablesReales = rows
              .filter(r => r.precio_uf > 0 && r.m2_construido > 0)
              .map(r => ({
                direccion:    r.direccion_sii || 'Sin dirección',
                tipo:         tipo,
                m2:           Math.round(parseFloat(r.m2_construido)),
                m2_terreno:   r.m2_terreno ? Math.round(parseFloat(r.m2_terreno)) : null,
                fecha:        r.fecha_inscripcion ? r.fecha_inscripcion.toString().slice(0, 7) : 'N/D',
                precio_uf:    Math.round(parseFloat(r.precio_uf)),
                uf_m2:        parseFloat(r.m2_construido) > 0
                                ? Math.round(parseFloat(r.precio_uf) / parseFloat(r.m2_construido))
                                : null,
                ano_construccion: r.ano_construccion || null,
                mismo_edificio: false,
                similitud: calcularSimilitud(r, m2Construido, m2Terreno),
              }))
          } catch(e) {
            console.error('Error parsing comparables:', e.message)
          }
        }
      }
    }
  } catch(e) {
    _dbg.fetchErr = e.message
    console.error('Error fetching comparables:', e.message)
    // Continua sin comparables — Claude generará estimados con advertencia
  }

  function calcularSimilitud(row, m2C, m2T) {
    const dif = m2C ? Math.abs(parseFloat(row.m2_construido) - m2C) / m2C : 0
    if (dif < 0.1) return 'Muy similar'
    if (dif < 0.25) return 'Similar'
    return 'Referencial'
  }

  // ── 2. Armar prompt con datos confirmados y comparables reales ─────────
  const systemPrompt = `Eres Valentina, tasadora inmobiliaria experta con 20 años de experiencia en la Región Metropolitana de Chile.

REGLAS CRÍTICAS — DATOS CONFIRMADOS DEL SII:
- Los m² marcados como "CONFIRMADOS" son datos REALES del SII. NUNCA los modifiques, estimes ni cambies.
- USA EXACTAMENTE esos m² en todos los cálculos y el desglose.
- Si no hay un dato confirmado de m², NO lo estimes — usa solo lo que tienes.

PERFIL:
- Conoces el mercado inmobiliario chileno 2023-2025: precios reales por comuna, tendencias, factores.
- Manejas los planes reguladores comunales de la RM: zonificación, alturas, constructibilidad.
- Entiendes cómo la remodelación, piso, orientación y características impactan el valor.

PRECIOS DE REFERENCIA 2025 (UF/m² construido):
- Vitacura: 85-130 | Las Condes: 70-115 | Lo Barnechea: 60-100
- Providencia: 65-100 | Ñuñoa: 55-82 | La Reina: 50-75
- Macul, San Miguel, Quinta Normal: 35-55 | La Florida, Maipú, Pudahuel: 28-50
- Santiago Centro: 45-72 | Peñalolén, La Granja: 30-48 | Puente Alto: 25-40
- San Bernardo, El Bosque: 22-38 | Lo Prado, Renca: 25-42

AJUSTES según características:
- Piso: +2% cada 5 pisos sobre el 5to, penaliza piso 1-2 en deptos sin vista
- Orientación norte: +3-5%, sur: -3%
- Estado conservación: excelente +8%, deteriorado -10%
- Año construcción: post-2010 neutro, 2000-2010 -3%, pre-2000 -5 a -10%
- Terraza: 40-60% del precio/m² construido | Estacionamiento: 200-350 UF | Bodega: 50-100 UF
- Remodelación completa reciente: +10-18%

ANÁLISIS DE POTENCIAL DE DESARROLLO (solo casas/terrenos con m² terreno > 800m²):
- Calcular unidades: (densidad_max_hab/ha ÷ 10000 × m2_terreno) ÷ 4 personas/hogar
- Ejemplo: 3.982m², densidad 50 hab/ha → (50/10000)×3982÷4 = ~5 unidades
- Si permite 2+ unidades: incluir potencial_desarrollo

COMPARABLES: Se te proporcionan transacciones REALES del CBR (Conservador de Bienes Raíces).
El valor_uf y precio_m2 DEBEN derivarse de la MEDIANA de UF/m² de esas transacciones reales, NO de tus referencias generales: precio_m2 = mediana(UF/m² de los comparables) y valor_uf = precio_m2 × m² construidos confirmados. Tus rangos de referencia por comuna SOLO aplican si NO hay comparables. Tu análisis, factores y recomendación deben ser coherentes con ese valor anclado en transacciones reales.

RESPONDE SOLO con JSON válido en UNA SOLA LÍNEA sin saltos dentro de strings:
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
    "antejardin_m": number,
    "observaciones": string,
    "impacto_valor": string
  },
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
}`

  const comparablesTexto = comparablesReales.length > 0
    ? `\n\nTRANSACCIONES REALES CBR (datos confirmados del Conservador de Bienes Raíces):\n${JSON.stringify(comparablesReales, null, 2)}`
    : '\n\nNOTA: No se encontraron comparables reales en el CBR para este segmento. Usa tus referencias de mercado con confianza Media.'

  const detalles = [
    `Tipo de propiedad: ${tipo}`,
    `Dirección: ${dir}`,
    `Comuna: ${comuna}`,
    rol       ? `ROL SII: ${rol}` : null,
    m2Construido ? `M² construidos CONFIRMADOS (SII): ${m2Construido} m²` : null,
    m2Terreno    ? `M² terreno CONFIRMADO (SII): ${m2Terreno} m²` : null,
    anio      ? `Año construcción: ${anio}` : null,
    avaluo    ? `Avalúo fiscal: ${avaluo} UF` : null,
    siiData?.destino ? `Destino SII: ${siiData.destino}` : null,
    answers?.remodelacion && answers.remodelacion !== 'ninguna'
      ? `Remodelación: ${answers.remodelacion}${answers.tiempo_remo ? ', hace '+answers.tiempo_remo : ''}`
      : 'Sin remodelación',
    answers?.terraza_m2 > 0   ? `Terraza: ${answers.terraza_m2} m²` : null,
    answers?.estacionamientos > 0 ? `Estacionamientos: ${answers.estacionamientos}` : null,
    answers?.bodegas > 0      ? `Bodegas: ${answers.bodegas}` : null,
    extras?.piso        ? `Piso: ${extras.piso}` : null,
    extras?.orientacion ? `Orientación: ${extras.orientacion}` : null,
    extras?.jardin_m2 > 0 ? `Jardín/patio: ${extras.jardin_m2} m²` : null,
    caracts.length      ? `Características: ${caracts.join(', ')}` : null,
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
        messages: [{ role: 'user', content: `Tasa esta propiedad:\n\n${detalles}${comparablesTexto}` }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return Response.json({ error: data.error?.message || 'Error Anthropic' }, { status: 500 })

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    const clean = text.replace(/```json|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ error: 'Sin JSON en respuesta', raw: text.slice(0, 300) }, { status: 500 })

    function sanitizeJSON(raw) {
      let s = raw
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
        .replace(/\u2013|\u2014/g, '-')
        .replace(/\r?\n/g, ' ').replace(/\r/g, ' ')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
        .replace(/,\s*([\]\}])/g, '$1')
      let result = '', inString = false, escaped = false
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        if (escaped) { result += ch; escaped = false; continue }
        if (ch === '\\') { result += ch; escaped = true; continue }
        if (ch === '"') {
          if (!inString) { inString = true; result += ch; continue }
          let j = i + 1
          while (j < s.length && s[j] === ' ') j++
          const next = s[j]
          if (next === ':' || next === ',' || next === '}' || next === ']') {
            inString = false; result += ch
          } else {
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

      // Si hay comparables reales, reemplazar los del LLM con los reales
      if (comparablesReales.length > 0) {
        parsed.comparables = comparablesReales
        // Ancla determinística: valor base = mediana(UF/m2) de comparables x m2 construidos
        const ufm2List = comparablesReales.map(c => c.uf_m2).filter(x => x > 0).sort((a, b) => a - b)
        if (ufm2List.length && m2Construido) {
          const mid = Math.floor(ufm2List.length / 2)
          const medianaUfM2 = ufm2List.length % 2 ? ufm2List[mid] : Math.round((ufm2List[mid - 1] + ufm2List[mid]) / 2)
          const baseUf = Math.round(medianaUfM2 * m2Construido)
          parsed.valor_uf = baseUf
          parsed.precio_m2 = medianaUfM2
          parsed.desglose = [
            { concepto: 'Valor base por comparables CBR', calculo: `mediana ${medianaUfM2} UF/m2 x ${m2Construido} m2 (${comparablesReales.length} ventas reales)`, valor_uf: baseUf }
          ]
          parsed.confianza = comparablesReales.length >= 5 ? 'Alta' : (comparablesReales.length >= 3 ? 'Media' : 'Baja')
        }
      }

      // Calcular potencial_desarrollo en servidor
      if (m2Terreno && m2Terreno > 800 && ['casa','terreno','parcela','agricola'].includes(tipo)) {
        const pr = parsed.plan_regulador
        let densidadHabHa = null
        if (pr?.densidad_max) {
          const dm = String(pr.densidad_max).match(/\d+/)
          if (dm) densidadHabHa = parseInt(dm[0])
        }
        if (!densidadHabHa) {
          const cL = comuna.toLowerCase()
          densidadHabHa = ['vitacura','las condes','lo barnechea','la reina'].some(c => cL.includes(c)) ? 60 : 120
        }
        const unidades = Math.floor((densidadHabHa / 10000) * m2Terreno / 4)
        if (unidades >= 2) {
          parsed.potencial_desarrollo = {
            aplica: true,
            m2_terreno: m2Terreno,
            densidad_max_hab_ha: densidadHabHa,
            unidades_estimadas: unidades,
            descripcion: `El terreno de ${m2Terreno.toLocaleString('es-CL')} m² permite, según la densidad del plan regulador (${densidadHabHa} hab/ha), construir aproximadamente ${unidades} viviendas (${densidadHabHa} ÷ 10.000 × ${m2Terreno} ÷ 4 personas/hogar). ${unidades >= 4 ? 'Esto significa que es posible demoler la construcción actual y desarrollar un proyecto de ' + unidades + ' viviendas, multiplicando significativamente el valor del terreno. Un comprador desarrollador puede valorar este predio muy por encima del valor como vivienda individual.' : 'El terreno permitiría subdividir y construir hasta ' + unidades + ' viviendas adicionales, aumentando su potencial de valorización.'}`,
            advertencia: `Cálculo referencial basado en la densidad del plan regulador. Los m² mínimos de subdivisión, factibilidad real y condiciones específicas deben verificarse con un arquitecto y la DOM de ${comuna}.`
          }
        } else {
          parsed.potencial_desarrollo = { aplica: false }
        }
      } else if (!parsed.potencial_desarrollo) {
        parsed.potencial_desarrollo = { aplica: false }
      }

      parsed._debug = _dbg
      return Response.json(parsed)
    } catch(parseErr) {
      console.error('JSON parse error:', parseErr.message)
      const extract = (key) => { const m = sanitized.match(new RegExp('"' + key + '"\\s*:\\s*([\\d.]+)')); return m ? parseFloat(m[1]) : null }
      const extractStr = (key) => { const m = sanitized.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"')); return m ? m[1] : null }
      const fallback = {
        valor_uf: extract('valor_uf'), precio_m2: extract('precio_m2'),
        confianza: extractStr('confianza') || 'Baja',
        analisis: extractStr('analisis') || 'Tasación completada.',
        recomendacion_precio_venta: extractStr('recomendacion_precio_venta') || '',
        comparables: comparablesReales,
        desglose: [], factores_positivos: [], factores_negativos: [], plan_regulador: null
      }
      if (fallback.valor_uf) return Response.json(fallback)
      return Response.json({ error: 'JSON invalido: ' + parseErr.message, raw: sanitized.slice(0, 300) }, { status: 500 })
    }
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
