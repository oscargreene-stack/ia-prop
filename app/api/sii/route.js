// app/api/sii/route.js
// Busca propiedades en DataInmobiliaria (tabla consolidado del SII)
// Endpoint: GET /api/sii?direccion=CAMINO+OTONAL+1201&comuna=LAS+CONDES&unidad=
//
// Flujo:
//  1. Normaliza calle y número
//  2. Llama a Claude con MCP DataInmobiliaria para hacer SQL sobre consolidado
//  3. Devuelve datos normalizados (m2_terreno, m2_construido, rol, avaluo, etc.)

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const MCP_URL       = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN

// Normalizar nombre de comuna para match con DataInmobiliaria (UPPER, sin tildes, sin ñ)
function normalizarComuna(nombre) {
  return (nombre || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/Ñ/g, 'N').replace(/ñ/g, 'N')
    .trim()
}

// Normalizar texto de calle para SQL LIKE
function normalizarCalle(texto) {
  return normalizarComuna(texto)
    // Expandir abreviaturas comunes del SII
    .replace(/^AV\.?\s+/,  'AV ')
    .replace(/^AVDA\.?\s+/, 'AV ')
    .replace(/^AVENIDA\s+/, 'AV ')
    .replace(/^PSJE\.?\s+/, 'PASAJE ')
    .replace(/^PJE\.?\s+/,  'PASAJE ')
    .replace(/^CALLE\s+/,   '')
    .replace(/^CAM\.?\s+/,  'CAM ')
    .trim()
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = (searchParams.get('direccion') || '').trim()
  const comuna    = (searchParams.get('comuna')    || '').trim()
  const unidad    = (searchParams.get('unidad')    || '').trim()

  if (!direccion || !comuna) {
    return Response.json({ error: 'Faltan parametros' }, { status: 400 })
  }

  // ── Detección de ROL: formato "NNNN-NN" o "NNNN-NNN" o "NNNNN-NN" ────────
  const rolMatch = direccion.match(/^(\d+)-(\d+)$/)
  if (rolMatch) {
    const codMz = parseInt(rolMatch[1], 10)
    const codPr = parseInt(rolMatch[2], 10)
    const comunaNormRol = normalizarComuna(comuna)
    try {
      console.log('[SII ROL] Calling Anthropic MCP for ROL:', codMz, codPr, 'comuna:', comunaNormRol)
      const resRol = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'mcp-client-2025-04-04',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          system: 'Run the SQL using bq_run_query and return ONLY the raw JSON array of rows. No markdown.',
          messages: [{ role: 'user', content: `Run this SQL and return only the JSON array:\nSELECT c.cod_com, c.cod_mz, c.cod_pr, c.direccion_sii, c.cod_destino, cd.descripcion_destino AS destino, c.superficie_total_terreno AS m2_terreno, c.superficie_construccion AS m2_construido, c.avaluo_fiscal_clp, c.ano_construccion, ccr.comuna AS comuna_nombre, c.latitud, c.longitud FROM datainmobiliaria.consolidado c JOIN datainmobiliaria.codigo_comuna_region ccr ON c.cod_com = ccr.cod_com JOIN datainmobiliaria.codigo_destino cd ON c.cod_destino = cd.cod_destino WHERE ccr.comuna = '${comunaNormRol}' AND c.cod_mz = ${codMz} AND c.cod_pr = ${codPr} LIMIT 5` }],
          mcp_servers: [{ type: 'url', url: MCP_URL, name: 'datainmobiliaria', ...(DATAINM_TOKEN ? { authorization_token: DATAINM_TOKEN } : {}) }],
        }),
      })
      if (resRol.ok) {
        const dataRol = await resRol.json()
        console.log('[SII ROL] Anthropic response status:', resRol.status, 'content blocks:', dataRol.content?.length)
        const textRol = (dataRol.content || [])
          .filter(b => b.type === 'mcp_tool_result' || b.type === 'text')
          .map(b => b.type === 'mcp_tool_result' ? (b.content?.[0]?.text || '') : (b.text || ''))
          .join('\n')
        const arrRol = textRol.match(/\[[\s\S]*\]/)
        if (arrRol) {
          const rows = JSON.parse(arrRol[0])
          if (rows.length > 0) {
            const UF_CLP = 40408
            const resultados = rows.map(row => ({
              direccion:         row.direccion_sii || direccion,
              rol:               `${row.cod_com}-${row.cod_mz}-${row.cod_pr}`,
              manzana:           row.cod_mz,
              predio:            row.cod_pr,
              cod_comuna:        row.cod_com,
              comuna:            row.comuna_nombre || comuna,
              destino:           row.destino || null,
              m2_terreno:        row.m2_terreno    ? parseFloat(row.m2_terreno)    : null,
              m2_construido:     row.m2_construido ? parseFloat(row.m2_construido) : null,
              avaluo_total_clp:  row.avaluo_fiscal_clp ? parseInt(row.avaluo_fiscal_clp) : null,
              avaluo_fiscal_uf:  row.avaluo_fiscal_clp ? Math.round(parseInt(row.avaluo_fiscal_clp) / UF_CLP) : null,
              anio_construccion: row.ano_construccion || null,
              latitud:           row.latitud  || null,
              longitud:          row.longitud || null,
              depto:             unidad || null,
              link_datainmobiliaria: `https://datainmobiliaria.cl/reports/detalle_propiedad?cod_com=${row.cod_com}&cod_mz=${row.cod_mz}&cod_pr=${row.cod_pr}`,
            }))
            if (resultados.length === 1) return Response.json({ multiples: false, resultados, noEncontrado: false })
            return Response.json({ multiples: true, resultados, noEncontrado: false })
          }
        }
      }
    } catch(e) {
      console.error('ROL lookup error:', e.message)
      return Response.json({ noEncontrado: true, multiples: false, resultados: [], _debug: { rol: `${codMz}-${codPr}`, error: e.message, hasAnthropicKey: !!ANTHROPIC_KEY, hasMcpToken: !!DATAINM_TOKEN } })
    }
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], _debug: { rol: `${codMz}-${codPr}`, reason: 'empty_rows', hasAnthropicKey: !!ANTHROPIC_KEY, hasMcpToken: !!DATAINM_TOKEN } })
  }

  // Parsear calle y número de la dirección
  const matchDir = direccion.match(/^(.+?)\s+(\d+)(\w*)\s*$/)
  const calleRaw = matchDir ? matchDir[1].trim() : direccion
  const numero   = matchDir ? matchDir[2] : null
  const calle    = normalizarCalle(calleRaw)
  const comunaNorm = normalizarComuna(comuna)

  // Extraer token principal del nombre de calle (la palabra más larga y distintiva)
  const tokenCalle = calle.split(/\s+/).sort((a, b) => b.length - a.length)[0] || calle

  // Construir SQL — buscar con número exacto + adyacentes ±4
  let numeroCondition = ''
  if (numero) {
    const n = parseInt(numero, 10)
    const nums = [n, n-2, n+2, n-4, n+4].filter(x => x > 0)
    // En SII el número aparece al final de direccion_sii, ej: "CAM OTONAL 1201"
    const numPatterns = nums.map(x => `c.direccion_sii LIKE '%${x}'`).join(' OR ')
    numeroCondition = `AND (${numPatterns})`
  }

  const sql = `
    SELECT
      c.cod_com, c.cod_mz, c.cod_pr,
      c.direccion_sii,
      c.cod_destino,
      cd.descripcion_destino AS destino,
      c.superficie_total_terreno  AS m2_terreno,
      c.superficie_construccion   AS m2_construido,
      c.avaluo_fiscal_clp,
      c.ano_construccion,
      ccr.comuna                   AS comuna_nombre,
      c.latitud, c.longitud
    FROM datainmobiliaria.consolidado c
    JOIN datainmobiliaria.codigo_comuna_region ccr ON c.cod_com = ccr.cod_com
    JOIN datainmobiliaria.codigo_destino       cd  ON c.cod_destino = cd.cod_destino
    WHERE ccr.comuna = '${comunaNorm}'
      AND UPPER(c.direccion_sii) LIKE '%${tokenCalle}%'
      ${numeroCondition}
    ORDER BY
      CASE
        WHEN c.superficie_construccion > 0 THEN 0
        ELSE 1
      END,
      c.avaluo_fiscal_clp DESC
    LIMIT 8
  `

  try {
    if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY no configurada')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: 'Run the SQL query using the bq_run_query tool and return ONLY the raw JSON result array. No explanation, no markdown, just the JSON array of rows.',
        messages: [{ role: 'user', content: `Run this BigQuery SQL and return only the JSON array of results:\n${sql}` }],
        mcp_servers: [{
          type: 'url',
          url: MCP_URL,
          name: 'datainmobiliaria',
          ...(DATAINM_TOKEN ? { authorization_token: DATAINM_TOKEN } : {}),
        }],
      }),
    })

    const data = await res.json()
    const text = (data.content || [])
      .filter(b => b.type === 'mcp_tool_result' || b.type === 'text')
      .map(b => {
        if (b.type === 'mcp_tool_result') return b.content?.[0]?.text || ''
        return b.text || ''
      })
      .join('\n')

    // Parsear el JSON del resultado
    let rows = []
    const arrMatch = text.match(/\[[\s\S]*\]/)
    if (arrMatch) {
      try { rows = JSON.parse(arrMatch[0]) } catch(e) {}
    }

    if (!rows.length) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
    }

    // Normalizar al formato estándar del frontend
    const UF_CLP = 40408  // valor referencia fijo
    const resultados = rows.map(row => ({
      direccion:         row.direccion_sii || direccion,
      rol:               `${row.cod_com}-${row.cod_mz}-${row.cod_pr}`,
      manzana:           row.cod_mz,
      predio:            row.cod_pr,
      cod_comuna:        row.cod_com,
      comuna:            row.comuna_nombre || comuna,
      destino:           row.destino || null,
      m2_terreno:        row.m2_terreno   ? parseFloat(row.m2_terreno)   : null,
      m2_construido:     row.m2_construido ? parseFloat(row.m2_construido) : null,
      avaluo_total_clp:  row.avaluo_fiscal_clp ? parseInt(row.avaluo_fiscal_clp) : null,
      avaluo_fiscal_uf:  row.avaluo_fiscal_clp ? Math.round(parseInt(row.avaluo_fiscal_clp) / UF_CLP) : null,
      anio_construccion: row.ano_construccion || null,
      latitud:           row.latitud  || null,
      longitud:          row.longitud || null,
      depto:             unidad || null,
      link_datainmobiliaria: `https://datainmobiliaria.cl/reports/detalle_propiedad?cod_com=${row.cod_com}&cod_mz=${row.cod_mz}&cod_pr=${row.cod_pr}`,
    }))

    if (resultados.length === 1) {
      return Response.json({ multiples: false, resultados, noEncontrado: false })
    }
    return Response.json({ multiples: true, resultados, noEncontrado: false })

  } catch (err) {
    console.error('Error DataInmobiliaria SII:', err.message)
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: err.message })
  }
}
