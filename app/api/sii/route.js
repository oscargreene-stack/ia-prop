// app/api/sii/route.js  v4
// Llama DIRECTAMENTE al MCP server de DataInmobiliaria via JSON-RPC (sin Anthropic como proxy)
// Endpoint: GET /api/sii?direccion=...&comuna=...&unidad=...

const MCP_URL       = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN
const UF_CLP        = 40408

// ─── Llamada directa al MCP via JSON-RPC ────────────────────────────────────
async function bqQuery(sql) {
  const headers = { 'Content-Type': 'application/json' }
  if (DATAINM_TOKEN) headers['Authorization'] = `Bearer ${DATAINM_TOKEN}`

  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'bq_run_query',
      arguments: { sql },
    },
  })

  const res = await fetch(MCP_URL, { method: 'POST', headers, body })
  if (!res.ok) throw new Error(`MCP HTTP error: ${res.status}`)

  const data = await res.json()

  // JSON-RPC result — DataInmobiliaria devuelve { result: { content: [...] } }
  const content = data?.result?.content || data?.content || []
  for (const block of content) {
    const txt = block?.text || ''
    if (!txt) continue
    // Intenta JSON directo
    try {
      const parsed = JSON.parse(txt)
      if (parsed?.rows)              return parsed.rows
      if (Array.isArray(parsed))     return parsed
      if (parsed?.data)              return parsed.data
    } catch(e) {}
    // Extrae array del texto
    const m = txt.match(/\[[\s\S]*\]/)
    if (m) { try { return JSON.parse(m[0]) } catch(e) {} }
  }
  return []
}

// ─── Normalización ──────────────────────────────────────────────────────────
function norm(s) {
  return (s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // tildes
    .replace(/Ñ/g, 'N').replace(/ñ/g, 'N')
    .trim()
}

function normCalle(s) {
  return norm(s)
    .replace(/^AV(DA)?\.?\s+/, 'AV ')
    .replace(/^AVENIDA\s+/, 'AV ')
    .replace(/^(PSJE|PJE)\.?\s+/, 'PASAJE ')
    .replace(/^CALLE\s+/, '')
    .replace(/^CAM\.?\s+/, 'CAM ')
    .trim()
}

function buildResultado(row, comunaInput, unidad) {
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

const SELECT_COLS = `
  c.cod_com, c.cod_mz, c.cod_pr,
  c.direccion_sii,
  c.cod_destino,
  cd.descripcion_destino            AS destino,
  c.superficie_total_terreno        AS m2_terreno,
  c.superficie_construccion         AS m2_construido,
  c.avaluo_fiscal_clp,
  c.ano_construccion,
  ccr.comuna                        AS comuna_nombre,
  c.latitud,
  c.longitud
FROM datainmobiliaria.consolidado c
JOIN datainmobiliaria.codigo_comuna_region ccr ON c.cod_com = ccr.cod_com
JOIN datainmobiliaria.codigo_destino       cd  ON c.cod_destino = cd.cod_destino`

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = (searchParams.get('direccion') || '').trim()
  const comuna    = (searchParams.get('comuna')    || '').trim()
  const unidad    = (searchParams.get('unidad')    || '').trim()

  if (!direccion || !comuna) {
    return Response.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const comunaNorm = norm(comuna)

  // ── 1. Detectar ROL: formato NNNN-NN ────────────────────────────────────
  const rolMatch = direccion.match(/^(\d+)-(\d+)$/)
  if (rolMatch) {
    const codMz = parseInt(rolMatch[1], 10)
    const codPr = parseInt(rolMatch[2], 10)
    try {
      const sql = `SELECT ${SELECT_COLS}
        WHERE ccr.comuna = '${comunaNorm}' AND c.cod_mz = ${codMz} AND c.cod_pr = ${codPr}
        LIMIT 5`
      const rows = await bqQuery(sql)
      if (rows.length > 0) {
        const resultados = rows.map(r => buildResultado(r, comuna, unidad))
        return Response.json({ multiples: resultados.length > 1, resultados, noEncontrado: false })
      }
    } catch(e) {
      console.error('[SII] ROL lookup error:', e.message)
      return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: e.message })
    }
    return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
  }

  // ── 2. Búsqueda por dirección ────────────────────────────────────────────
  const matchDir = direccion.match(/^(.+?)\s+(\d+)(\w*)\s*$/)
  const calleRaw = matchDir ? matchDir[1].trim() : direccion
  const numero   = matchDir ? matchDir[2] : null
  const calle    = normCalle(calleRaw)

  // Token más largo y distintivo (evita tokens cortos como "AV")
  const tokens   = calle.split(/\s+/).filter(t => t.length >= 4)
  const token    = tokens.sort((a, b) => b.length - a.length)[0] || calle

  let numCondition = ''
  if (numero) {
    const n = parseInt(numero, 10)
    const nums = [n, n-2, n+2, n-4, n+4].filter(x => x > 0)
    numCondition = `AND (${nums.map(x => `c.direccion_sii LIKE '% ${x}'`).join(' OR ')} OR c.direccion_sii LIKE '%${numero}')`
  }

  try {
    const sql = `SELECT ${SELECT_COLS}
      WHERE ccr.comuna = '${comunaNorm}'
        AND UPPER(c.direccion_sii) LIKE '%${token}%'
        ${numCondition}
      ORDER BY
        CASE WHEN c.superficie_construccion > 0 THEN 0 ELSE 1 END,
        c.avaluo_fiscal_clp DESC
      LIMIT 10`

    const rows = await bqQuery(sql)
    if (!rows.length) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
    }

    let filas = rows
    // Si hay departamento, filtrar por unidad
    if (unidad && filas.length > 1) {
      const uNorm = norm(unidad).replace(/^(DP|DEPTO|DEPARTAMENTO|OF|OFICINA)\s*/, '')
      const filtrado = filas.filter(f => norm(f.direccion_sii || '').includes(uNorm))
      if (filtrado.length > 0) filas = filtrado
    }

    const resultados = filas.map(r => buildResultado(r, comuna, unidad))
    const multiples  = resultados.length > 1

    return Response.json({ multiples, resultados, noEncontrado: false })

  } catch(e) {
    console.error('[SII] address lookup error:', e.message)
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: e.message })
  }
}
