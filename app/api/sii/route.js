// app/api/sii/route.js  v8 — FINAL
// Busca propiedades en DataInmobiliaria BigQuery usando el token de la dirección
// La dirección ya viene validada por Google Places (nombre normalizado)
// Endpoint: GET /api/sii?calle=CAROLINA+RABAT&numero=767&comuna=VITACURA&comunaNorm=VITACURA

const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY
const MCP_URL        = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
const DATAINM_TOKEN  = process.env.DATAINMOBILIARIA_TOKEN
const UF_CLP         = 40408

function norm(s) {
  return (s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function extractRows(content) {
  for (const block of (content || [])) {
    if (block.type === 'mcp_tool_result') {
      for (const item of (block.content || [])) {
        if (item?.text) {
          try { const p = JSON.parse(item.text); if (Array.isArray(p) && p.length) return p } catch(e) {}
          const m = item.text.match(/\[[\s\S]*\]/)
          if (m) { try { const r = JSON.parse(m[0]); if (Array.isArray(r) && r.length) return r } catch(e) {} }
        }
      }
    }
    if (block.type === 'text' && block.text) {
      const m = block.text.match(/\[[\s\S]*\]/)
      if (m) { try { const r = JSON.parse(m[0]); if (Array.isArray(r) && r.length) return r } catch(e) {} }
    }
  }
  return []
}

async function bqQuery(sql) {
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
      system: 'Run the SQL using bq_run_query and return ONLY the raw JSON array of rows. No markdown, no explanation.',
      messages: [{ role: 'user', content: `Run this SQL:\n${sql}` }],
      mcp_servers: [{ type: 'url', url: MCP_URL, name: 'datainmobiliaria', authorization_token: DATAINM_TOKEN }],
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}`)
  const data = await res.json()
  return extractRows(data.content)
}

function buildResultado(row, comunaInput, unidad) {
  const cCom = row.cod_com, cMz = row.cod_mz, cPr = row.cod_pr
  const m2T = row.m2_terreno    ? parseFloat(row.m2_terreno)    : null
  const m2C = row.m2_construido ? parseFloat(row.m2_construido) : null
  const av  = row.avaluo_fiscal_clp ? parseInt(row.avaluo_fiscal_clp) : null
  return {
    direccion:         row.direccion_sii || '',
    rol:               cCom && cMz && cPr ? `${cCom}-${cMz}-${cPr}` : null,
    cod_comuna:        cCom || null,
    manzana:           cMz  || null,
    predio:            cPr  || null,
    comuna:            row.comuna_nombre || comunaInput,
    destino:           row.destino || null,
    m2_terreno:        m2T,
    m2_construido:     m2C,
    avaluo_total_clp:  av,
    avaluo_fiscal_uf:  av ? Math.round(av / UF_CLP) : null,
    anio_construccion: row.ano_construccion || null,
    latitud:           row.latitud  || null,
    longitud:          row.longitud || null,
    depto:             unidad || null,
    link_datainmobiliaria: cCom && cMz && cPr
      ? `https://datainmobiliaria.cl/reports/detalle_propiedad?cod_com=${cCom}&cod_mz=${cMz}&cod_pr=${cPr}`
      : null,
  }
}

const COLS = `c.cod_com, c.cod_mz, c.cod_pr, c.direccion_sii,
  cd.descripcion_destino AS destino,
  c.superficie_total_terreno AS m2_terreno,
  c.superficie_construccion  AS m2_construido,
  c.avaluo_fiscal_clp, c.ano_construccion,
  ccr.comuna AS comuna_nombre, c.latitud, c.longitud
FROM datainmobiliaria.consolidado c
JOIN datainmobiliaria.codigo_comuna_region ccr ON c.cod_com = ccr.cod_com
JOIN datainmobiliaria.codigo_destino       cd  ON c.cod_destino = cd.cod_destino`

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  // Acepta tanto ?direccion=...&comuna=... (legacy) como ?calle=...&numero=...&comunaNorm=...
  const calleParam    = searchParams.get('calle')    || ''
  const numeroParam   = searchParams.get('numero')   || ''
  const comunaNorm    = searchParams.get('comunaNorm') || norm(searchParams.get('comuna') || '')
  const direccionRaw  = searchParams.get('direccion') || ''
  const unidad        = searchParams.get('unidad')   || ''

  if (!comunaNorm) return Response.json({ error: 'Falta comunaNorm' }, { status: 400 })
  if (!ANTHROPIC_KEY) return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: 'API key faltante' })

  // Resolver calle y número
  let calle  = calleParam ? norm(calleParam) : ''
  let numero = numeroParam

  if (!calle && direccionRaw) {
    const m = direccionRaw.match(/^(.+?)\s+(\d+)\w*\s*$/)
    calle  = m ? norm(m[1]) : norm(direccionRaw)
    numero = m ? m[2] : ''
  }

  if (!calle) return Response.json({ error: 'Falta calle' }, { status: 400 })

  // Token más largo de la calle (apellido, más distintivo)
  const tokens = calle.split(/\s+/).filter(t => t.length >= 4)
  const token  = tokens.sort((a, b) => b.length - a.length)[0] || calle

  let numWhere = ''
  if (numero) {
    const n = parseInt(numero, 10)
    const ns = [n, n-2, n+2, n-4, n+4].filter(x => x > 0)
    numWhere = `AND (${ns.map(x => `c.direccion_sii LIKE '% ${x}'`).join(' OR ')} OR c.direccion_sii LIKE '%${numero}')`
  }

  try {
    const sql = `SELECT ${COLS}
      WHERE ccr.comuna = '${comunaNorm}'
        AND UPPER(c.direccion_sii) LIKE '%${token}%'
        ${numWhere}
      ORDER BY CASE WHEN c.superficie_construccion > 0 THEN 0 ELSE 1 END, c.avaluo_fiscal_clp DESC
      LIMIT 8`

    const rows = await bqQuery(sql)

    if (!rows.length) return Response.json({ noEncontrado: true, multiples: false, resultados: [] })

    let filas = rows
    if (unidad && filas.length > 1) {
      const uNorm = norm(unidad).replace(/^(DP|DEPTO|DEPARTAMENTO|OF|OFICINA)\s*/, '')
      const fil = filas.filter(f => norm(f.direccion_sii || '').includes(uNorm))
      if (fil.length) filas = fil
    }
    // Filtrar estacionamientos y bodegas si hay habitacionales
    const habit = filas.filter(f => { const d = (f.destino||'').toUpperCase(); return !['ESTACIONAMIENTO','BODEGA','BIEN COMUN'].some(x=>d.includes(x)) })
    if (habit.length) filas = habit

    const resultados = filas.slice(0, 5).map(r => buildResultado(r, comunaNorm, unidad))
    return Response.json({ multiples: resultados.length > 1, resultados, noEncontrado: false })

  } catch(e) {
    console.error('[SII BigQuery]', e.message)
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: e.message })
  }
}
