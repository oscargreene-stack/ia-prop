// app/api/predio/route.js
// Búsqueda de propiedad en el catastro SII vía BaseAPI (REST), llamada DESDE EL SERVIDOR.
// Endpoint: GET https://datainmobiliaria.cl/api/v1/sii/avaluo/buscar  (Authorization: Bearer BASEAPI_KEY)
// Devuelve `candidatos` en la forma que el frontend ya espera:
//   rol, direccion, comuna, m2_construido, m2_terreno, ano_construccion, destino, es_copropiedad, terreno_origen
//   - 1 candidato  -> el chat lo usa directo
//   - >1 candidato -> el chat muestra opciones
//   - 0 candidatos -> el chat pide los m² a mano
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const API_BASE = 'https://datainmobiliaria.cl/api/v1'
const KEY = process.env.BASEAPI_KEY

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'N')
    .toUpperCase().trim()
}

const DESTINO_LABEL = {
  H: 'Habitacional', C: 'Comercial', O: 'Oficina', L: 'Bodega', I: 'Industrial',
  Z: 'Estacionamiento', W: 'Sitio eriazo', K: 'Bienes comunes', A: 'Agrícola',
  B: 'Agrícola', F: 'Forestal', G: 'Galpón', S: 'Salud',
}

// Encuentra el array de resultados dentro de una respuesta de forma flexible
function pickArray(j) {
  if (Array.isArray(j)) return j
  if (!j || typeof j !== 'object') return []
  for (const k of ['resultados', 'results', 'data', 'propiedades', 'items', 'candidatos', 'avaluos', 'rows', 'predios']) {
    if (Array.isArray(j[k])) return j[k]
  }
  if (j.data && typeof j.data === 'object') {
    for (const k of ['resultados', 'results', 'propiedades', 'items', 'rows', 'predios']) {
      if (Array.isArray(j.data[k])) return j.data[k]
    }
  }
  return []
}

const toNum = (...vals) => {
  for (const v of vals) { const n = parseFloat(v); if (isFinite(n)) return Math.round(n) }
  return null
}
const pick = (o, ...keys) => {
  for (const k of keys) { if (o && o[k] != null && o[k] !== '') return o[k] }
  return null
}

function mapRow(r, comunaIn) {
  const cc = pick(r, 'cod_com', 'cod_comuna', 'codCom')
  const cmz = pick(r, 'cod_mz', 'codMz')
  const cpr = pick(r, 'cod_pr', 'codPr')
  const rolStr = pick(r, 'rol', 'rol_sii') ||
    ((cc != null && cmz != null && cpr != null) ? `${cc}-${cmz}-${cpr}` : null)
  const dest = pick(r, 'cod_destino', 'destino')
  return {
    rol: rolStr,
    cod_comuna: cc != null ? Number(cc) : null,
    comuna: comunaIn || pick(r, 'comuna') || null,
    direccion: String(pick(r, 'direccion_sii', 'direccion', 'address') || '').replace(/\s+/g, ' ').trim(),
    m2_construido: toNum(pick(r, 'superficie_construccion', 'm2_construido', 'sup_construccion', 'superficie_construida', 'metros_construidos')),
    m2_terreno: toNum(pick(r, 'superficie_total_terreno', 'superficie_terreno', 'm2_terreno', 'sup_terreno')),
    ano_construccion: toNum(pick(r, 'ano_construccion', 'anio_construccion')),
    destino: DESTINO_LABEL[dest] || dest || null,
    es_copropiedad: !!pick(r, 'copropiedad', 'es_copropiedad'),
    terreno_origen: 'sii',
    avaluo_total_clp: toNum(pick(r, 'avaluo_fiscal_clp', 'avaluo_fiscal', 'avaluo_total_clp', 'avaluo')),
  }
}

export async function POST(request) {
  let body = {}
  try { body = await request.json() } catch (e) {}
  const direccion = body.direccion || ''
  const comuna = body.comuna || ''
  const rol = body.rol || ''

  const wantDebug = (() => { try { return new URL(request.url).searchParams.get('debug') === '1' } catch (e) { return false } })()
  const dbg = wantDebug ? { intentos: [] } : null

  if (!KEY) {
    return Response.json({ candidatos: [], total: 0, mensaje: 'No encontré la propiedad. Ingresa los m2 a mano.', _modo: 'sin_key' })
  }

  const numero = (norm(direccion).match(/(\d{1,6})/) || [])[1] || ''

  // Variantes de parámetros a probar contra /sii/avaluo/buscar
  const variants = []
  if (rol) variants.push({ rol })
  if (direccion) {
    variants.push({ direccion, comuna })
    variants.push({ q: direccion, comuna })
    variants.push({ direccion })
  }
  if (!variants.length) {
    return Response.json({ candidatos: [], total: 0, mensaje: 'Ingresa una dirección o un ROL.', _modo: 'sin_input' })
  }

  let rows = []
  for (const params of variants) {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    const qs = new URLSearchParams(clean).toString()
    const url = `${API_BASE}/sii/avaluo/buscar?${qs}`
    try {
      const res = await fetch(url, { headers: { Authorization: 'Bearer ' + KEY, Accept: 'application/json' } })
      const txt = await res.text()
      let j = null
      try { j = JSON.parse(txt) } catch (e) {}
      if (dbg) dbg.intentos.push({ params: clean, status: res.status, sample: txt.slice(0, 500) })
      if (res.ok && j) {
        const arr = pickArray(j)
        if (arr.length) { rows = arr; break }
      }
    } catch (e) {
      if (dbg) dbg.intentos.push({ params: clean, err: String((e && e.message) || e) })
    }
  }

  // Mapear y priorizar coincidencia exacta de número
  let candidatos = rows.map(r => mapRow(r, comuna)).filter(c => c.m2_construido && c.m2_construido > 0)
  if (numero && candidatos.length) {
    const re = new RegExp('\\b' + numero + '\\b')
    const exactos = candidatos.filter(c => re.test(c.direccion))
    candidatos = exactos.length ? exactos.slice(0, 6) : candidatos.slice(0, 8)
  } else {
    candidatos = candidatos.slice(0, 8)
  }

  const resp = { candidatos, total: candidatos.length, _modo: 'real' }
  if (!candidatos.length) resp.mensaje = 'No encontré la propiedad. Ingresa los m2 a mano.'
  if (dbg) resp._debug = dbg
  return Response.json(resp)
}
