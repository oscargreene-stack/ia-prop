// app/api/predio/route.js
// Búsqueda de propiedad en el catastro SII vía BaseAPI (REST), desde el servidor.
// Base: https://api.baseapi.cl/api/v1   Auth: header x-api-key
//   GET /sii/avaluo/regiones                          -> códigos de comuna (5 dígitos)
//   GET /sii/avaluo/buscar?comuna=&calle=&numero=      -> roles que coinciden
//   GET /sii/avaluo/predio/{comuna}/{manzana}/{predio} -> avalúo, superficies, destino
// Devuelve `candidatos` (rol, direccion, comuna, m2_construido, m2_terreno,
// ano_construccion, destino, es_copropiedad, terreno_origen) que el frontend ya espera.
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const API_BASE = 'https://api.baseapi.cl/api/v1'
const KEY = process.env.BASEAPI_KEY
const HEADERS = { 'x-api-key': KEY || '', 'Accept': 'application/json' }

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'N')
    .toUpperCase().trim()
}
const toNum = (...vals) => {
  for (const v of vals) { const n = parseFloat(v); if (isFinite(n)) return Math.round(n) }
  return null
}
const pick = (o, ...keys) => {
  for (const k of keys) { if (o && o[k] != null && o[k] !== '') return o[k] }
  return null
}
function pickArray(j) {
  if (Array.isArray(j)) return j
  if (!j || typeof j !== 'object') return []
  for (const k of ['resultados', 'results', 'data', 'roles', 'propiedades', 'items', 'predios', 'rows', 'comunas']) {
    if (Array.isArray(j[k])) return j[k]
  }
  if (j.data && typeof j.data === 'object') {
    for (const k of ['resultados', 'results', 'roles', 'predios', 'items', 'comunas']) {
      if (Array.isArray(j.data[k])) return j.data[k]
    }
  }
  return []
}

// Recolecta todos los objetos planos de un JSON (para mapear regiones->comunas anidadas)
function flatten(j) {
  const out = []
  const walk = (x) => {
    if (Array.isArray(x)) x.forEach(walk)
    else if (x && typeof x === 'object') {
      out.push(x)
      for (const v of Object.values(x)) if (v && typeof v === 'object') walk(v)
    }
  }
  walk(j)
  return out
}

// Cache del mapa nombre_comuna -> codigo (en memoria del server)
let COMUNA_MAP = null
async function getComunaCode(nombre, dbg) {
  const target = norm(nombre)
  if (!COMUNA_MAP) {
    COMUNA_MAP = {}
    try {
      const res = await fetch(`${API_BASE}/sii/avaluo/regiones`, { headers: HEADERS })
      const txt = await res.text()
      let j = null; try { j = JSON.parse(txt) } catch (e) {}
      if (dbg) dbg.regiones = { status: res.status, sample: txt.slice(0, 500) }
      for (const o of flatten(j)) {
        const nm = pick(o, 'comuna', 'nombre', 'name', 'nombre_comuna')
        const cd = pick(o, 'codigo', 'cod_comuna', 'cod_com', 'code', 'cod', 'id')
        if (nm && cd != null && /^\d{3,6}$/.test(String(cd))) COMUNA_MAP[norm(nm)] = String(cd)
      }
      if (dbg) dbg.comunasCargadas = Object.keys(COMUNA_MAP).length
    } catch (e) {
      if (dbg) dbg.regionesErr = String((e && e.message) || e)
      COMUNA_MAP = null
    }
  }
  if (!COMUNA_MAP) return null
  if (COMUNA_MAP[target]) return COMUNA_MAP[target]
  // match parcial
  const hit = Object.keys(COMUNA_MAP).find(k => k.includes(target) || target.includes(k))
  return hit ? COMUNA_MAP[hit] : null
}

async function getPredio(comuna, manzana, predio, dbg) {
  try {
    const res = await fetch(`${API_BASE}/sii/avaluo/predio/${comuna}/${manzana}/${predio}`, { headers: HEADERS })
    const txt = await res.text()
    let j = null; try { j = JSON.parse(txt) } catch (e) {}
    if (dbg && !dbg.predioSample) dbg.predioSample = { status: res.status, sample: txt.slice(0, 500) }
    return (j && (j.data || j)) || null
  } catch (e) { return null }
}

const DESTINO_HABIT = ['CASA', 'DEPARTAMENTO', 'HABITACIONAL']

export async function POST(request) {
  let body = {}
  try { body = await request.json() } catch (e) {}
  const direccion = body.direccion || ''
  const comuna = body.comuna || ''
  const rolRaw = body.rol || ''

  const wantDebug = (() => { try { return new URL(request.url).searchParams.get('debug') === '1' } catch (e) { return false } })()
  const dbg = wantDebug ? {} : null

  if (!KEY) {
    return Response.json({ candidatos: [], total: 0, mensaje: 'No encontré la propiedad. Ingresa los m2 a mano.', _modo: 'sin_key' })
  }

  // helper: construir un candidato desde datos de predio + rol
  const buildCandidato = (rolParts, det, dirFallback) => {
    const [cc, cmz, cpr] = rolParts
    const dest = pick(det || {}, 'destino', 'cod_destino', 'descripcion_destino')
    return {
      rol: `${cc}-${cmz}-${cpr}`,
      cod_comuna: null, // se resuelve en tasar por nombre de comuna (otra base de datos)
      comuna: comuna || null,
      direccion: String(pick(det || {}, 'direccion', 'direccion_sii') || dirFallback || '').replace(/\s+/g, ' ').trim(),
      m2_construido: toNum(pick(det || {}, 'superficie_construida', 'superficie_construccion', 'sup_construida', 'm2_construido')),
      m2_terreno: toNum(pick(det || {}, 'superficie_terreno', 'superficie_total_terreno', 'sup_terreno', 'm2_terreno')),
      ano_construccion: toNum(pick(det || {}, 'ano_construccion', 'anio_construccion')),
      destino: dest || null,
      es_copropiedad: !!pick(det || {}, 'copropiedad', 'es_copropiedad'),
      terreno_origen: 'sii',
      avaluo_total_clp: toNum(pick(det || {}, 'avaluo_total', 'avaluo_total_clp', 'avaluo_fiscal', 'avaluo')),
    }
  }

  // ── ROL explícito ───────────────────────────────────────────────────────────
  const rolNums = String(rolRaw).split(/[^0-9]+/).filter(Boolean)
  if (rolNums.length >= 3) {
    const det = await getPredio(rolNums[0], rolNums[1], rolNums[2], dbg)
    const cand = det ? buildCandidato([rolNums[0], rolNums[1], rolNums[2]], det, '') : null
    const candidatos = (cand && cand.m2_construido) ? [cand] : []
    const resp = { candidatos, total: candidatos.length, _modo: 'real' }
    if (!candidatos.length) resp.mensaje = 'No encontré la propiedad. Ingresa los m2 a mano.'
    if (dbg) resp._debug = dbg
    return Response.json(resp)
  }

  // ── Dirección + comuna ────────────────────────────────────────────────────────
  if (!direccion) {
    return Response.json({ candidatos: [], total: 0, mensaje: 'Ingresa una dirección o un ROL.', _modo: 'sin_input' })
  }
  const comCode = await getComunaCode(comuna, dbg)
  if (dbg) dbg.comCode = comCode
  if (!comCode) {
    return Response.json({ candidatos: [], total: 0, mensaje: 'No pude identificar la comuna. Ingresa los m2 a mano.', _modo: 'sin_comuna', ...(dbg ? { _debug: dbg } : {}) })
  }

  const numero = (norm(direccion).match(/(\d{1,6})/) || [])[1] || ''
  const calle = norm(direccion).replace(/\d{1,6}/g, ' ').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

  // /buscar
  let roles = []
  try {
    const qsObj = { comuna: comCode, calle }
    if (numero) qsObj.numero = numero
    const qs = new URLSearchParams(qsObj).toString()
    const res = await fetch(`${API_BASE}/sii/avaluo/buscar?${qs}`, { headers: HEADERS })
    const txt = await res.text()
    let j = null; try { j = JSON.parse(txt) } catch (e) {}
    if (dbg) dbg.buscar = { qs, status: res.status, sample: txt.slice(0, 800) }
    roles = pickArray(j)
  } catch (e) {
    if (dbg) dbg.buscarErr = String((e && e.message) || e)
  }

  // Normalizar roles -> {cc,cmz,cpr,direccion}
  const normRoles = roles.map(r => {
    const cc = pick(r, 'comuna', 'cod_comuna', 'cod_com') || comCode
    const cmz = pick(r, 'manzana', 'cod_mz', 'mz')
    const cpr = pick(r, 'predio', 'cod_pr', 'pr')
    const dir = String(pick(r, 'direccion', 'direccion_sii', 'address') || '').replace(/\s+/g, ' ').trim()
    return { cc, cmz, cpr, dir }
  }).filter(r => r.cmz != null && r.cpr != null)

  // Priorizar coincidencia exacta de número
  let elegidos = normRoles
  if (numero) {
    const re = new RegExp('\\b' + numero + '\\b')
    const exactos = normRoles.filter(r => re.test(r.dir))
    elegidos = exactos.length ? exactos : normRoles
  }
  elegidos = elegidos.slice(0, 6)

  // Enriquecer con /predio (avalúo + superficies)
  const candidatos = []
  for (const r of elegidos) {
    const det = await getPredio(r.cc, r.cmz, r.cpr, dbg)
    const cand = buildCandidato([r.cc, r.cmz, r.cpr], det, r.dir)
    if (cand.m2_construido && cand.m2_construido > 0) candidatos.push(cand)
  }

  const resp = { candidatos, total: candidatos.length, _modo: 'real' }
  if (!candidatos.length) resp.mensaje = 'No encontré la propiedad. Ingresa los m2 a mano.'
  if (dbg) resp._debug = dbg
  return Response.json(resp)
}
