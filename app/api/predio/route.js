// app/api/predio/route.js
// Búsqueda de propiedad en el catastro REAL (SII/DataInmobiliaria).
// Consulta la tabla `consolidado` vía el MCP de DataInmobiliaria (tool bq_run_query)
// por dirección + comuna, o por ROL. Devuelve `candidatos` en la forma que el
// frontend ya espera (rol, direccion, comuna, m2_construido, m2_terreno,
// ano_construccion, destino, es_copropiedad, terreno_origen).
//   - 1 candidato  -> el chat lo usa directo
//   - >1 candidato -> el chat muestra opciones
//   - 0 candidatos -> el chat pide los m² a mano
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MCP_URL = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
const MCP_TOKEN = process.env.DATAINMOBILIARIA_TOKEN

// MAYÚSCULAS, sin tildes, sin ñ (igual que las tablas de referencia)
function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'N').replace(/Ñ/g, 'N')
    .toUpperCase().trim()
}
// solo deja A-Z 0-9 y espacios -> seguro para inyectar en SQL
function sqlSafe(s) {
  return norm(s).replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

const DESTINO_LABEL = {
  H: 'Habitacional', C: 'Comercial', O: 'Oficina', L: 'Bodega', I: 'Industrial',
  Z: 'Estacionamiento', W: 'Sitio eriazo', K: 'Bienes comunes', A: 'Agrícola',
  B: 'Agrícola', F: 'Forestal', G: 'Galpón', P: 'Estacionamiento', S: 'Salud',
}

// ── Cliente MCP mínimo (Streamable HTTP / JSON-RPC) ────────────────────────────
async function mcpBigQuery(sql, dbg) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': 'Bearer ' + MCP_TOKEN,
  }
  const parse = async (res) => {
    const txt = await res.text()
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('text/event-stream')) {
      const datas = txt.split('\n')
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).trim())
        .filter(Boolean)
      for (let i = datas.length - 1; i >= 0; i--) {
        try { return JSON.parse(datas[i]) } catch (e) {}
      }
      return null
    }
    try { return JSON.parse(txt) } catch (e) { return { _raw: txt.slice(0, 300) } }
  }

  // 1) initialize
  const initRes = await fetch(MCP_URL, {
    method: 'POST', headers,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'ia-prop', version: '1.0' } },
    }),
  })
  const sessionId = initRes.headers.get('mcp-session-id') || initRes.headers.get('Mcp-Session-Id')
  const initJson = await parse(initRes)
  if (dbg) dbg.init = { status: initRes.status, sessionId: sessionId || null, sample: JSON.stringify(initJson).slice(0, 200) }

  const h2 = sessionId ? { ...headers, 'Mcp-Session-Id': sessionId } : headers

  // 2) notifications/initialized
  try {
    await fetch(MCP_URL, {
      method: 'POST', headers: h2,
      body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
    })
  } catch (e) {}

  // 3) tools/call -> bq_run_query
  const callRes = await fetch(MCP_URL, {
    method: 'POST', headers: h2,
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'bq_run_query', arguments: { sql } },
    }),
  })
  const callJson = await parse(callRes)
  if (dbg) dbg.call = { status: callRes.status, sample: JSON.stringify(callJson).slice(0, 300) }
  return callJson
}

// Extrae el array de filas del resultado del tool MCP
function extractRows(mcp) {
  if (!mcp) return []
  // structuredContent.rows
  try {
    const sc = mcp.result && mcp.result.structuredContent
    if (sc && Array.isArray(sc.rows)) return sc.rows
  } catch (e) {}
  // content[].text -> JSON con .rows
  try {
    const content = mcp.result && mcp.result.content
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c && typeof c.text === 'string') {
          try {
            const j = JSON.parse(c.text)
            if (Array.isArray(j.rows)) return j.rows
            if (Array.isArray(j)) return j
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
  return []
}

const SELECT_COLS =
  'SELECT c.cod_com, c.cod_mz, c.cod_pr, c.direccion_sii, c.cod_destino, ' +
  'c.superficie_construccion, c.superficie_total_terreno, c.avaluo_fiscal_clp, ' +
  'c.ano_construccion, c.copropiedad FROM datainmobiliaria.consolidado c'

export async function POST(request) {
  let body = {}
  try { body = await request.json() } catch (e) {}
  const direccion = body.direccion || ''
  const comuna = body.comuna || ''
  const rolRaw = body.rol || ''

  const wantDebug = (() => { try { return new URL(request.url).searchParams.get('debug') === '1' } catch (e) { return false } })()
  const dbg = wantDebug ? {} : null

  if (!MCP_TOKEN) {
    return Response.json({ candidatos: [], total: 0, mensaje: 'No encontré la propiedad. Ingresa los m2 a mano.', _modo: 'sin_token' })
  }

  // ── Construir SQL ──────────────────────────────────────────────────────────
  let sql = null
  let numeroBuscado = ''

  // ROL explícito: cod_com-cod_mz-cod_pr
  const rolNums = String(rolRaw).split(/[^0-9]+/).map(x => parseInt(x, 10)).filter(n => Number.isInteger(n))
  if (rolNums.length >= 3) {
    sql = `${SELECT_COLS} WHERE c.cod_com=${rolNums[0]} AND c.cod_mz=${rolNums[1]} AND c.cod_pr=${rolNums[2]} LIMIT 5`
  }

  // Dirección + comuna
  if (!sql) {
    const comNorm = sqlSafe(comuna)
    if (!comNorm) {
      return Response.json({ candidatos: [], total: 0, mensaje: 'Necesito la comuna para buscar la propiedad.', _modo: 'sin_comuna' })
    }
    const dirNorm = sqlSafe(direccion)
    const numMatch = dirNorm.match(/(\d{1,6})/)
    numeroBuscado = numMatch ? numMatch[1] : ''
    const calle = dirNorm.replace(/\d{1,6}/g, ' ').replace(/\s+/g, ' ').trim()
    if (!calle) {
      return Response.json({ candidatos: [], total: 0, mensaje: 'Ingresa la calle de la propiedad (o el ROL).', _modo: 'sin_calle' })
    }
    const likeCalle = '%' + calle.replace(/ /g, '%') + '%'
    const order = numeroBuscado
      ? `ORDER BY CASE WHEN c.direccion_sii LIKE '%${numeroBuscado}%' THEN 0 ELSE 1 END, c.superficie_construccion DESC `
      : `ORDER BY c.superficie_construccion DESC `
    sql =
      `${SELECT_COLS} JOIN datainmobiliaria.codigo_comuna_region r ON c.cod_com = r.cod_com ` +
      `WHERE r.comuna = '${comNorm}' AND UPPER(c.direccion_sii) LIKE '${likeCalle}' ` +
      `AND c.cod_destino IN ('H','C','O') ${order} LIMIT 40`
  }

  if (dbg) dbg.sql = sql

  // ── Ejecutar contra el catastro ──────────────────────────────────────────────
  let rows = []
  let errInfo = null
  try {
    const mcp = await mcpBigQuery(sql, dbg)
    rows = extractRows(mcp)
    if (!rows.length && mcp && mcp.error) errInfo = mcp.error
  } catch (e) {
    errInfo = String((e && e.message) || e)
  }
  if (dbg) { dbg.rowCount = rows.length; dbg.err = errInfo }

  // ── Mapear filas -> candidatos (forma que espera el frontend) ────────────────
  const mapRow = (r) => ({
    rol: `${r.cod_com}-${r.cod_mz}-${r.cod_pr}`,
    cod_comuna: r.cod_com,
    comuna: comuna || null,
    direccion: String(r.direccion_sii || '').replace(/\s+/g, ' ').trim(),
    m2_construido: r.superficie_construccion != null ? Number(r.superficie_construccion) : null,
    m2_terreno: r.superficie_total_terreno != null ? Number(r.superficie_total_terreno) : null,
    ano_construccion: r.ano_construccion != null ? Number(r.ano_construccion) : null,
    destino: DESTINO_LABEL[r.cod_destino] || r.cod_destino || null,
    es_copropiedad: !!r.copropiedad,
    terreno_origen: 'sii',
    avaluo_total_clp: r.avaluo_fiscal_clp != null ? Number(r.avaluo_fiscal_clp) : null,
  })

  let candidatos = []
  if (rows.length) {
    const todos = rows.map(mapRow).filter(c => c.m2_construido && c.m2_construido > 0)
    if (numeroBuscado) {
      const re = new RegExp('\\b' + numeroBuscado + '\\b')
      const exactos = todos.filter(c => re.test(c.direccion))
      // Coincidencia exacta de número -> esos; si no, ofrecer los cercanos como opciones
      candidatos = exactos.length ? exactos.slice(0, 6) : todos.slice(0, 8)
    } else {
      candidatos = todos.slice(0, 8)
    }
  }

  const resp = { candidatos, total: candidatos.length, _modo: 'real' }
  if (!candidatos.length) resp.mensaje = 'No encontré la propiedad. Ingresa los m2 a mano.'
  if (dbg) resp._debug = dbg
  return Response.json(resp)
}
