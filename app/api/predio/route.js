// app/api/predio/route.js
// Búsqueda de propiedad por dirección usando SOLO Data Inmobiliaria.
// Flujo:
//   1) Obtener coordenadas de la dirección (las manda el frontend, o se geocodifica con Google).
//   2) POST /busqueda_poligono (fuente=catastro) con un polígono chico alrededor del punto.
//   3) Devolver `candidatos` en la forma que el frontend ya espera (rol, direccion, comuna,
//      m2_construido, m2_terreno, ano_construccion, destino, es_copropiedad, terreno_origen).
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const API_BASE = 'https://datainmobiliaria.cl/api/v1'
const TOKEN = process.env.DATAINMOBILIARIA_TOKEN
const GKEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
// CORS: este endpoint lo consumen también las apps del ecosistema C2C
// (vender.c2cprops.com / c2cprops.com) directamente desde el navegador.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
const cjson = (obj) => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS_HEADERS }) }

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
}
const toNum = (...vals) => {
  for (const v of vals) { const n = parseFloat(v); if (isFinite(n)) return Math.round(n) }
  return null
}

// Geocodifica "direccion, comuna, RM, Chile" -> {lat,lng} con la API de Google
async function geocode(direccion, comuna, dbg) {
  if (!GKEY) { if (dbg) dbg.geocode = { err: 'sin_google_key' }; return null }
  const q = [direccion, comuna, 'Región Metropolitana', 'Chile'].filter(Boolean).join(', ')
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&region=cl&key=${GKEY}`
  const r = await fetch(url)
  const j = await r.json()
  if (dbg) dbg.geocode = { status: j.status, n: (j.results || []).length, err: j.error_message }
  const loc = j.results && j.results[0] && j.results[0].geometry && j.results[0].geometry.location
  return loc ? { lat: loc.lat, lng: loc.lng } : null
}

// Polígono cuadrado de ~`m` metros de lado alrededor del punto
function polygonAround(lat, lng, m) {
  const dLat = m / 111320
  const dLng = m / (111320 * Math.cos(lat * Math.PI / 180))
  return [
    { lat: lat + dLat, lng: lng - dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng - dLng },
  ]
}

function distM(p, lat, lng) {
  if (!isFinite(lat) || !isFinite(lng)) return 999999
  const dy = (p.lat - lat) * 111320
  const dx = (p.lng - lng) * 111320 * Math.cos(p.lat * Math.PI / 180)
  return Math.sqrt(dx * dx + dy * dy)
}

export async function POST(request) {
  let body = {}
  try { body = await request.json() } catch (e) {}
  const direccion = body.direccion || ''
  const comuna = body.comuna || ''
  const deptoIn = String(body.depto || '').trim()
  const latIn = parseFloat(body.lat)
  const lngIn = parseFloat(body.lng)

  const wantDebug = (() => { try { return new URL(request.url).searchParams.get('debug') === '1' } catch (e) { return false } })()
  const dbg = wantDebug ? {} : null

  if (!TOKEN) {
    return cjson({ candidatos: [], total: 0, mensaje: 'No encontré la propiedad. Ingresa los m2 a mano.', _modo: 'sin_token' })
  }
  if (!direccion && !(isFinite(latIn) && isFinite(lngIn))) {
    return cjson({ candidatos: [], total: 0, mensaje: 'Ingresa una dirección.', _modo: 'sin_input' })
  }

  // Limpieza defensiva: quitar unidad ("Depto 202", "Of 501") y texto tras la
  // coma (comuna repetida) — ensucian el geocoding y el match del catastro.
  const dirLimpia = (direccion.split(',')[0] || '')
    .replace(/\b(?:depto\.?|dpto\.?|dept\.?|dp|departamento|of\.?|oficina|casa|cs|local|lc)\s*(?:n[°º]?|#|\.|-)?\s*[a-z]?\d+[a-z]?\s*$/i, '')
    .trim() || direccion
  // Unidad pedida ("403" de "Depto 403"): del campo depto del front, o del final de la dirección.
  const unidad = deptoIn.replace(/^[a-z°º#.\s-]*/i, '').trim() ||
    (((direccion.split(',')[0] || '').match(/\b(?:depto\.?|dpto\.?|dept\.?|dp|departamento|of\.?|oficina|local|lc)\s*(?:n[°º]?|#|\.|-)?\s*([a-z]?\d+[a-z]?)\s*$/i) || [])[1] || '')

  // 1) Coordenadas: del frontend si vienen, si no geocodificamos
  let punto = (isFinite(latIn) && isFinite(lngIn)) ? { lat: latIn, lng: lngIn } : null
  if (!punto) {
    try { punto = await geocode(dirLimpia, comuna, dbg) }
    catch (e) { if (dbg) dbg.geocodeErr = String((e && e.message) || e) }
  }
  if (!punto) {
    return cjson({ candidatos: [], total: 0, mensaje: 'No pude ubicar la dirección. Ingresa los m2 a mano.', _modo: 'sin_geocode', ...(dbg ? { _debug: dbg } : {}) })
  }
  if (dbg) dbg.punto = punto

  // 2) Búsqueda por polígono (catastro)
  let resultados = []
  try {
    const polygon = polygonAround(punto.lat, punto.lng, 120)
    // El proveedor pagina (~300 filas): en zonas densas o edificios grandes una
    // sola página deja unidades fuera (p.ej. DP 403 de Luis Carrera 2870).
    for (let page = 1; page <= 4; page++) {
      const res = await fetch(`${API_BASE}/busqueda_poligono`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ fuente: 'catastro', polygon, page }),
        signal: AbortSignal.timeout(page === 1 ? 30000 : 15000), // proveedor degradado: tolerar respuestas lentas
      })
      const txt = await res.text()
      let j = null; try { j = JSON.parse(txt) } catch (e) {}
      if (dbg && page === 1) dbg.poligono = { status: res.status, total: (j && (j.resultados || j.data) || []).length, sample: txt.slice(0, 400) }
      // Plan del proveedor expirado / sin permiso: avisar claro, no "no encontré"
      if (res.status === 402 || res.status === 403) {
        return cjson({
          candidatos: [], total: 0, _modo: 'servicio_no_disponible',
          mensaje: 'El servicio de datos está temporalmente no disponible. Intenta en unos minutos, o continúa ingresando los m² a mano.',
          ...(dbg ? { _debug: dbg } : {}),
        })
      }
      const filas = (j && (j.resultados || j.data)) || []
      // Dedupe defensivo: si el proveedor ignora `page` devolvería lo mismo.
      const vistos = new Set(resultados.map(r => String(r.rol || (r.cod_com + '-' + r.cod_mz + '-' + r.cod_pr))))
      const nuevas = filas.filter(r => !vistos.has(String(r.rol || (r.cod_com + '-' + r.cod_mz + '-' + r.cod_pr))))
      resultados = resultados.concat(nuevas)
      if (filas.length < 300 || nuevas.length === 0) break
    }
    if (dbg) dbg.paginas_total = resultados.length
  } catch (e) {
    if (dbg) dbg.poligonoErr = String((e && e.message) || e)
  }

  // 3) Mapear -> candidatos, ordenar por cercanía, priorizar coincidencia de número
  const numero = (norm(dirLimpia).match(/(\d{2,6})/) || [])[1] || ''
  let cands = resultados.map(r => {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lng)
    return {
      rol: r.rol || [r.cod_com, r.cod_mz, r.cod_pr].filter(x => x != null).join('-'),
      cod_comuna: r.cod_com != null ? parseInt(r.cod_com) : null,
      comuna: comuna || null,
      direccion: String(r.direccion_sii || '').replace(/\s+/g, ' ').trim(),
      m2_construido: toNum(r.superficie_construccion),
      m2_terreno: toNum(r.superficie_total_terreno),
      ano_construccion: toNum(r.ano_construccion),
      destino: r.cod_destino || null,
      es_copropiedad: !!r.copropiedad,
      terreno_origen: 'sii',
      avaluo_total_clp: toNum(r.avaluo_fiscal_clp),
      contribuciones_clp: toNum(r.contribuciones_clp ?? r.contribuciones_trimestrales),
      material: r.material_predominante || r.material || null,
      propietario: r.propietario || null,
      _dist: distM(punto, lat, lng),
    }
  }).filter(c => c.m2_construido && c.m2_construido > 0)

  if (numero) {
    const re = new RegExp('\\b' + numero + '\\b')
    const exactos = cands.filter(c => re.test(c.direccion))
    if (exactos.length) cands = exactos
  }
  cands.sort((a, b) => a._dist - b._dist)
  // Si el usuario indicó la unidad (Depto/Of/Local N), esa va PRIMERO; si hay
  // match exacto devolvemos solo esa (el flujo sigue directo, sin selector).
  if (unidad) {
    const reU = new RegExp('\\b(?:DP|DEPTO|DPTO|DEPT|D|OF|OFIC|OFICINA|LC|LOC|LOCAL|CS)\\.?\\s*0*' + unidad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
    const uMatch = cands.filter(c => reU.test(c.direccion))
    if (dbg) dbg.unidad = { pedida: unidad, matches: uMatch.length }
    if (uMatch.length) cands = uMatch
  }
  cands = cands.slice(0, 8).map(({ _dist, ...c }) => c)

  const resp = { candidatos: cands, total: cands.length, _modo: 'real', punto }
  if (!cands.length) resp.mensaje = 'No encontré la propiedad. Ingresa los m2 a mano.'
  if (dbg) resp._debug = dbg
  return cjson(resp)
}
