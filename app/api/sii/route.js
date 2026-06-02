// app/api/sii/route.js
// Busca propiedades en DataInmobiliaria (tabla consolidado del SII)
// Soporta: búsqueda por ROL (NNNN-NN), búsqueda por dirección
// Endpoint: GET /api/sii?direccion=...&comuna=...&unidad=...

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const MCP_URL       = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN

function normalizarComuna(nombre) {
  return (nombre || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/N/g, 'N').replace(/n/g, 'N')  // ñ→N already handled by NFD
    .trim()
}

function normalizarCalle(texto) {
  return normalizarComuna(texto)
    .replace(/^AV\.?\s+/, 'AV ')
    .replace(/^AVDA\.?\s+/, 'AV ')
    .replace(/^AVENIDA\s+/, 'AV ')
    .replace(/^PSJE\.?\s+/, 'PASAJE ')
    .replace(/^PJE\.?\s+/, 'PASAJE ')
    .replace(/^CALLE\s+/, '')
    .replace(/^CAM\.?\s+/, 'CAM ')
    .trim()
}

// Extract rows from Anthropic+MCP response
function extractRows(content) {
  for (const block of (content || [])) {
    if (block.type === 'mcp_tool_result') {
      for (const item of (block.content || [])) {
        if (item?.json) {
          const j = item.json
          if (Array.isArray(j)) return j
          if (j?.rows) return j.rows
          if (j?.data) return j.data
        }
        if (item?.text) {
          try { const p = JSON.parse(item.text); if (Array.isArray(p)) return p; if (p?.rows) return p.rows } catch(e) {}
          const m = item.text.match(/\[[\s\S]*\]/)
          if (m) { try { return JSON.parse(m[0]) } catch(e) {} }
        }
      }
    } else if (block.type === 'text' && block.text) {
      const m = block.text.match(/\[[\s\S]*\]/)
      if (m) { try { const r = JSON.parse(m[0]); if (Array.isArray(r) && r.length > 0) return r } catch(e) {} }
    }
  }
  return []
}

function buildResultado(row, comunaInput, unidad) {
  const UF_CLP = 40408
  return {
    direccion:         row.direccion_sii || '',
    rol:               `${row.cod_com}-${row.cod_mz}-${row.cod_pr}`,
    manzana:           row.cod_mz,
    predio:            row.cod_pr,
    cod_comuna:        row.cod_com,
    comuna:            row.comuna_nombre || comunaInput,
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
  }
}

async function mcpQuery(sql) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'mcp-client-2025-04-04',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2000,
      system: 'Run the SQL using bq_run_query and return ONLY the raw JSON array of rows. No markdown, no explanation.',
      messages: [{ role: 'user', content: `Run this SQL and return only the JSON array of results:\n${sql}` }],
      mcp_servers: [{ type: 'url', url: MCP_URL, name: 'datainmobiliaria', authorization_token: DATAINM_TOKEN }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`)
  const data = await res.json()
  return extractRows(data.content)
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = (searchParams.get('direccion') || '').trim()
  const comuna    = (searchParams.get('comuna')    || '').trim()
  const unidad    = (searchParams.get('unidad')    || '').trim()

  if (!direccion || !comuna) {
    return Response.json({ error: 'Faltan parametros' }, { status: 400 })
  }

  if (!ANTHROPIC_KEY) {
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: 'API key no configurada' })
  }

  const comunaNorm = normalizarComuna(comuna)

  // ── ROL detection: formato NNNN-NN or NNNNN-NNN ──────────────────────────
  const rolMatch = direccion.match(/^(\d+)-(\d+)$/)
  if (rolMatch) {
    const codMz = parseInt(rolMatch[1], 10)
    const codPr = parseInt(rolMatch[2], 10)
    try {
      const sql = `SELECT c.cod_com, c.cod_mz, c.cod_pr, c.direccion_sii, c.cod_destino, cd.descripcion_destino AS destino, c.superficie_total_terreno AS m2_terreno, c.superficie_construccion AS m2_construido, c.avaluo_fiscal_clp, c.ano_construccion, ccr.comuna AS comuna_nombre, c.latitud, c.longitud FROM datainmobiliaria.consolidado c JOIN datainmobiliaria.codigo_comuna_region ccr ON c.cod_com = ccr.cod_com JOIN datainmobiliaria.codigo_destino cd ON c.cod_destino = cd.cod_destino WHERE ccr.comuna = '${comunaNorm}' AND c.cod_mz = ${codMz} AND c.cod_pr = ${codPr} LIMIT 5`
      const rows = await mcpQuery(sql)
      if (rows.length > 0) {
        const resultados = rows.map(r => buildResultado(r, comuna, unidad))
        return Response.json({ multiples: resultados.length > 1, resultados, noEncontrado: false })
      }
    } catch(e) {
      console.error('ROL lookup error:', e.message)
    }
    return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
  }

  // ── Address search ───────────────────────────────────────────────────────
  const matchDir = direccion.match(/^(.+?)\s+(\d+)(\w*)\s*$/)
  const calleRaw = matchDir ? matchDir[1].trim() : direccion
  const numero   = matchDir ? matchDir[2] : null
  const calle    = normalizarCalle(calleRaw)
  const tokenCalle = calle.split(/\s+/).sort((a, b) => b.length - a.length)[0] || calle

  let numeroCondition = ''
  if (numero) {
    const n = parseInt(numero, 10)
    const nums = [n, n-2, n+2, n-4, n+4].filter(x => x > 0)
    const numPatterns = nums.map(x => `c.direccion_sii LIKE '%${x}'`).join(' OR ')
    numeroCondition = `AND (${numPatterns})`
  }

  const sql = `SELECT c.cod_com, c.cod_mz, c.cod_pr, c.direccion_sii, c.cod_destino, cd.descripcion_destino AS destino, c.superficie_total_terreno AS m2_terreno, c.superficie_construccion AS m2_construido, c.avaluo_fiscal_clp, c.ano_construccion, ccr.comuna AS comuna_nombre, c.latitud, c.longitud FROM datainmobiliaria.consolidado c JOIN datainmobiliaria.codigo_comuna_region ccr ON c.cod_com = ccr.cod_com JOIN datainmobiliaria.codigo_destino cd ON c.cod_destino = cd.cod_destino WHERE ccr.comuna = '${comunaNorm}' AND UPPER(c.direccion_sii) LIKE '%${tokenCalle}%' ${numeroCondition} ORDER BY CASE WHEN c.superficie_construccion > 0 THEN 0 ELSE 1 END, c.avaluo_fiscal_clp DESC LIMIT 8`

  try {
    const rows = await mcpQuery(sql)
    if (!rows.length) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
    }
    // Filter by unit if multiple results
    let filas = rows
    if (unidad && filas.length > 1) {
      const uNorm = normalizarComuna(unidad).replace(/^(DP|DEPTO|DEPARTAMENTO|OF|OFICINA)\s*/, '')
      const filtrado = filas.filter(f => normalizarComuna(f.direccion_sii || '').includes(uNorm))
      if (filtrado.length > 0) filas = filtrado
    }
    const resultados = filas.map(r => buildResultado(r, comuna, unidad))
    return Response.json({ multiples: resultados.length > 1, resultados, noEncontrado: false })
  } catch(e) {
    console.error('Address lookup error:', e.message)
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: e.message })
  }
}
