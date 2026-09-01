// app/api/predio/route.js
// Búsqueda de propiedad por dirección o ROL usando SOLO Data Inmobiliaria.
// Flujo:
//   0) Si el input ES un ROL ("3669-481", "15161-3669-481"), se resuelve por
//      (cod_com, cod_mz, cod_pr) — sin match difuso de texto.
//   1) Si no, obtener coordenadas de la dirección (las manda el frontend, o se
//      geocodifica con Google).
//   2) POST /busqueda_poligono (fuente=catastro) con un polígono chico alrededor del punto.
//   3) Devolver `candidatos` en la forma que el frontend ya espera (rol, direccion, comuna,
//      m2_construido, m2_terreno, ano_construccion, destino, es_copropiedad, terreno_origen).
import { COD_COMUNA, normalizaComuna } from '../../lib/comunas.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// La ruta del ROL encadena dos llamadas al proveedor (detalle + polígono).
export const maxDuration = 60

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

const MSG_BLOQUEADO = 'El servicio de datos está temporalmente no disponible. Intenta en unos minutos, o continúa ingresando los m² a mano.'

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim()
}
const toNum = (...vals) => {
  for (const v of vals) { const n = parseFloat(v); if (isFinite(n)) return Math.round(n) }
  return null
}
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// ── ROL ─────────────────────────────────────────────────────────────────────
// El usuario lo escribe completo ("15161-3669-481"), parcial + comuna aparte
// ("3669-481", "03669-481") y con ceros a la izquierda. Solo se acepta si TODO
// el input es el ROL: una dirección real nunca calza porque lleva letras.
const RE_ROL = /^\s*(\d{1,6})\s*-\s*(\d{1,6})(?:\s*-\s*(\d{1,6}))?\s*$/

// Devuelve el ROL, o `{ sinComuna: true }` cuando el input SÍ es un ROL pero la
// comuna no está en el mapa: eso es un error del usuario, no una dirección — hay
// que decírselo, no mandar "3669-481" al geocodificador.
function parseRol(texto, comuna) {
  const m = RE_ROL.exec(String(texto || ''))
  if (!m) return null
  const [, a, b, c] = m
  const codCom = c ? parseInt(a, 10) : COD_COMUNA[normalizaComuna(comuna)]
  const codMz = parseInt(c ? b : a, 10)
  const codPr = parseInt(c || b, 10)
  if (!Number.isFinite(codMz) || !Number.isFinite(codPr)) return null
  if (!Number.isFinite(codCom)) return { sinComuna: true }
  return { cod_com: codCom, cod_mz: codMz, cod_pr: codPr }
}

const rolTexto = (r) => `${r.cod_com}-${r.cod_mz}-${r.cod_pr}`

// Las filas del proveedor traen el ROL partido (cod_com/cod_mz/cod_pr) o junto
// (`rol`), según el endpoint.
function rolDeFila(r) {
  const p = [r.cod_com, r.cod_mz, r.cod_pr]
  if (p.every(x => x != null && isFinite(parseInt(x, 10)))) {
    return { cod_com: parseInt(p[0], 10), cod_mz: parseInt(p[1], 10), cod_pr: parseInt(p[2], 10) }
  }
  const q = String(r.rol || '').split('-').map(x => parseInt(x, 10))
  return q.length === 3 && q.every(isFinite) ? { cod_com: q[0], cod_mz: q[1], cod_pr: q[2] } : null
}
function esMismoRol(fila, rol) {
  const x = rolDeFila(fila)
  return !!x && x.cod_com === rol.cod_com && x.cod_mz === rol.cod_mz && x.cod_pr === rol.cod_pr
}

// ── Nombre de calle ─────────────────────────────────────────────────────────
// El número solo no basta para identificar la calle: a ~50 m de "CALIFORNIA
// 2131" (Providencia) hay un "ANDACOLLO 2131", y el catastro devolvía ese.
// Genéricas de 4+ letras: las de 1–3 ("AV", "CAM", "DEL", "LOS") ya se caen por largo.
const CALLE_GENERICAS = new Set(['AVDA', 'AVENIDA', 'CALLE', 'PSJE', 'PASAJE', 'CAMINO', 'LOTE', 'SITIO', 'PARCELA'])

// Palabras distintivas del nombre de calle: lo que va ANTES del número.
function palabrasCalle(txt) {
  return norm(txt).split(/\d/)[0]
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !CALLE_GENERICAS.has(w))
}

// El SII abrevia y trunca ("Valle del Monasterio" → "AV VALLE DEL MONAST" o
// "AV V DEL MONASTERIO"), así que se compara por prefijo y basta con que calce
// la MITAD de las palabras distintivas. Con una sola palabra ("California")
// eso exige el match completo, que es justo lo que evita cruzar de calle.
function coincideCalle(palabras, dirSii) {
  if (!palabras.length) return true
  const wsii = palabrasCalle(dirSii)
  if (!wsii.length) return false
  const hits = palabras.filter(p => wsii.some(w => p.startsWith(w) || w.startsWith(p))).length
  return hits / palabras.length >= 0.5
}

// ── Unidad ("Depto 403", "Casa 21", "- 21") ─────────────────────────────────
const RE_UNIDAD_PREFIJO = /\b(?:depto\.?|dpto\.?|dept\.?|dp|departamento|of\.?|oficina|casa|cs|local|lc)\s*(?:n[°º]?|#|\.|-)?\s*([a-z]?\d+[a-z]?)\s*$/i
// "Valle del Monasterio 2577 - 21": así separa el SII la unidad del número de
// calle. Se exige un dígito antes del guión para no comerse el número.
const RE_UNIDAD_GUION = /(\d)\s*-\s*([a-z]?\d+[a-z]?)\s*$/i

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

// Catastro dentro de un cuadrado de `metros` alrededor del punto.
// El proveedor pagina (~300 filas): en zonas densas o edificios grandes una
// sola página deja unidades fuera (p.ej. DP 403 de Luis Carrera 2870).
async function buscarPoligono(punto, metros, dbg, { maxPaginas = 4, msPrimera = 30000, msResto = 15000 } = {}) {
  const polygon = polygonAround(punto.lat, punto.lng, metros)
  let filas = []
  for (let page = 1; page <= maxPaginas; page++) {
    const res = await fetch(`${API_BASE}/busqueda_poligono`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ fuente: 'catastro', polygon, page }),
      signal: AbortSignal.timeout(page === 1 ? msPrimera : msResto), // proveedor degradado: tolerar respuestas lentas
    })
    const txt = await res.text()
    let j = null; try { j = JSON.parse(txt) } catch (e) {}
    if (dbg && page === 1) dbg.poligono = { status: res.status, metros, total: (j && (j.resultados || j.data) || []).length, sample: txt.slice(0, 400) }
    // Plan del proveedor expirado / sin permiso: avisar claro, no "no encontré"
    if (res.status === 402 || res.status === 403) return { bloqueado: true, filas }
    const pagina = (j && (j.resultados || j.data)) || []
    // Dedupe defensivo: si el proveedor ignora `page` devolvería lo mismo.
    const vistos = new Set(filas.map(r => String(r.rol || (r.cod_com + '-' + r.cod_mz + '-' + r.cod_pr))))
    const nuevas = pagina.filter(r => !vistos.has(String(r.rol || (r.cod_com + '-' + r.cod_mz + '-' + r.cod_pr))))
    filas = filas.concat(nuevas)
    if (pagina.length < 300 || nuevas.length === 0) break
  }
  if (dbg) dbg.paginas_total = filas.length
  return { bloqueado: false, filas }
}

// Ubica un ROL. El proveedor no expone "buscar por ROL", pero
// `propiedades/detalle` SÍ lo recibe y responde con filas georreferenciadas
// (`latitud`/`longitud`/`distancia_metros`). Con esa coordenada se ancla el
// polígono del catastro, del que después se saca la fila exacta.
async function anclarRol(rol, dbg) {
  const qs = new URLSearchParams({
    cod_com: String(rol.cod_com), cod_mz: String(rol.cod_mz), cod_pr: String(rol.cod_pr),
    radio: '250', superficie_min: '1', superficie_max: '100000',
  }).toString()
  const res = await fetch(`${API_BASE}/propiedades/detalle?${qs}`, {
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  })
  if (dbg) dbg.rol_detalle = { status: res.status }
  if (res.status === 402 || res.status === 403) return { bloqueado: true }
  if (!res.ok) return null
  const j = await res.json().catch(() => null)
  // El detalle reparte las filas en varias listas (`ventas_propiedad_observada`,
  // `detalle_ventas_recientes`, `comparables_filtro`, …): se recorren todas.
  const filas = []
  for (const v of Object.values(j || {})) if (Array.isArray(v)) filas.push(...v)
  const conCoord = filas.filter(v => isFinite(parseFloat(v.latitud)) && isFinite(parseFloat(v.longitud)))
  if (!conCoord.length) return null
  // Una fila del MISMO ROL da el punto exacto; si no hay, la venta más cercana.
  const propia = conCoord.find(v => esMismoRol(v, rol))
  const ancla = propia || conCoord.reduce((a, b) =>
    ((parseFloat(a.distancia_metros) || 9e9) <= (parseFloat(b.distancia_metros) || 9e9) ? a : b))
  const dist = propia ? 0 : (parseFloat(ancla.distancia_metros) || 250)
  if (dbg) dbg.rol_ancla = { n_filas: conCoord.length, exacto: !!propia, dist }
  return { lat: parseFloat(ancla.latitud), lng: parseFloat(ancla.longitud), exacto: !!propia, dist }
}

// Fila del catastro -> candidato en la forma que espera el frontend.
function aCandidato(r, comuna, punto) {
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
    // En copropiedad el rol de la unidad trae terreno 0: lo que el dueño conoce
    // es su prorrateo del bien común. Marcarlo importa porque ese suelo no se
    // vende por separado y no puede entrar al modelo aditivo de la tasación.
    terreno_origen: (r.copropiedad && !(toNum(r.superficie_total_terreno) > 0)) ? 'bien_comun' : 'sii',
    avaluo_total_clp: toNum(r.avaluo_fiscal_clp),
    contribuciones_clp: toNum(r.contribuciones_clp ?? r.contribuciones_trimestrales),
    material: r.material_predominante || r.material || null,
    propietario: r.propietario || null,
    _dist: distM(punto, parseFloat(r.lat ?? r.latitud), parseFloat(r.lng ?? r.longitud)),
  }
}

// Búsqueda por ROL: devuelve UNA propiedad (la del ROL) o nada. No hay
// candidatos que elegir — el ROL ya identifica la propiedad de forma única.
async function buscarPorRol(rol, { comuna, punto: puntoIn, dbg }) {
  const fin = (obj) => cjson({ ...obj, ...(dbg ? { _debug: dbg } : {}) })
  let punto = puntoIn
  // Cuánto puede estar el predio del punto que tenemos. 0 = el punto es suyo.
  let margen = 0
  if (!punto) {
    let ancla = null
    try { ancla = await anclarRol(rol, dbg) }
    catch (e) { if (dbg) dbg.rolErr = String((e && e.message) || e) }
    if (ancla && ancla.bloqueado) return fin({ candidatos: [], total: 0, _modo: 'servicio_no_disponible', mensaje: MSG_BLOQUEADO })
    if (ancla) { punto = { lat: ancla.lat, lng: ancla.lng }; margen = ancla.dist }
  }
  if (!punto) {
    return fin({ candidatos: [], total: 0, _modo: 'rol_no_ubicado', rol: rolTexto(rol),
      mensaje: `No pude ubicar el ROL ${rolTexto(rol)}. Búscala por dirección, o ingresa los m2 a mano.` })
  }

  // El cuadrado se dimensiona con la distancia real del ancla (+150 m de holgura):
  // más chico que eso deja el predio fuera, y más grande satura las páginas del
  // proveedor. Menos páginas y timeouts más cortos que la ruta de dirección,
  // porque ya se gastó una llamada al detalle y todo debe caber en maxDuration.
  let resPoly
  try {
    resPoly = await buscarPoligono(punto, Math.min(700, Math.max(200, Math.round(margen) + 150)), dbg,
      { maxPaginas: 3, msPrimera: 20000, msResto: 10000 })
  } catch (e) {
    if (dbg) dbg.poligonoErr = String((e && e.message) || e)
    return fin({ candidatos: [], total: 0, _modo: 'servicio_no_disponible', mensaje: MSG_BLOQUEADO })
  }
  const { bloqueado, filas } = resPoly
  if (bloqueado) return fin({ candidatos: [], total: 0, _modo: 'servicio_no_disponible', mensaje: MSG_BLOQUEADO })

  const fila = filas.find(f => esMismoRol(f, rol))
  if (!fila) {
    return fin({ candidatos: [], total: 0, _modo: 'rol_no_encontrado', rol: rolTexto(rol), punto,
      mensaje: `No encontré el ROL ${rolTexto(rol)} en el catastro. Revisa el número o búscala por dirección.` })
  }
  const { _dist, ...cand } = aCandidato(fila, comuna, punto)
  return fin({ candidatos: [cand], total: 1, _modo: 'real_rol', rol: rolTexto(rol), punto })
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

  const puntoIn = (isFinite(latIn) && isFinite(lngIn)) ? { lat: latIn, lng: lngIn } : null

  // 0) ¿El input es un ROL? Entonces se resuelve por código, no por texto.
  const rol = parseRol(direccion, comuna)
  if (rol && rol.sinComuna) {
    return cjson({ candidatos: [], total: 0, _modo: 'rol_sin_comuna',
      mensaje: 'Para buscar por ROL necesito la comuna. Elígela, o escribe el ROL completo (ej: 15161-3669-481).',
      ...(dbg ? { _debug: dbg } : {}) })
  }
  if (rol) {
    if (dbg) dbg.rol = rolTexto(rol)
    return buscarPorRol(rol, { comuna, punto: puntoIn, dbg })
  }

  // Limpieza defensiva: quitar la unidad ("Depto 202", "Casa 21", "- 21",
  // "Of 501") y el texto tras la coma (comuna repetida) — ensucian el geocoding
  // y el match del catastro. La unidad se guarda para priorizarla después.
  const dirSinComa = direccion.split(',')[0] || ''
  let dirCorte = dirSinComa
  let unidadDir = ''
  const mPref = dirSinComa.match(RE_UNIDAD_PREFIJO)
  if (mPref) {
    unidadDir = mPref[1]
    dirCorte = dirSinComa.slice(0, mPref.index)
  } else {
    const mGuion = dirSinComa.match(RE_UNIDAD_GUION)
    if (mGuion) {
      unidadDir = mGuion[2]
      dirCorte = dirSinComa.slice(0, mGuion.index + 1) // +1: conserva el número de calle
    }
  }
  const dirLimpia = dirCorte.trim() || direccion
  // Unidad pedida ("403" de "Depto 403"): del campo depto del front, o de la dirección.
  const unidad = deptoIn.replace(/^[a-z°º#.\s-]*/i, '').trim() || unidadDir

  // 1) Coordenadas: del frontend si vienen, si no geocodificamos
  let punto = puntoIn
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
    const { bloqueado, filas } = await buscarPoligono(punto, 120, dbg)
    if (bloqueado) {
      return cjson({
        candidatos: [], total: 0, _modo: 'servicio_no_disponible', mensaje: MSG_BLOQUEADO,
        ...(dbg ? { _debug: dbg } : {}),
      })
    }
    resultados = filas
  } catch (e) {
    if (dbg) dbg.poligonoErr = String((e && e.message) || e)
  }

  // 3) Mapear -> candidatos, ordenar por cercanía, priorizar calle / número / unidad
  const palabras = palabrasCalle(dirLimpia)
  const numero = (norm(dirLimpia).match(/(\d{2,6})/) || [])[1] || ''
  let cands = resultados.map(r => aCandidato(r, comuna, punto)).filter(c => c.m2_construido && c.m2_construido > 0)

  // La CALLE manda sobre el número: si hay predios del nombre pedido, el resto
  // se descarta. Si NINGUNO calza (SII con abreviatura rara) se deja pasar todo
  // en vez de responder "no encontré".
  if (palabras.length) {
    const mismaCalle = cands.filter(c => coincideCalle(palabras, c.direccion))
    if (dbg) dbg.calle = { palabras, matches: mismaCalle.length, de: cands.length }
    if (mismaCalle.length) cands = mismaCalle
  }
  if (numero) {
    const re = new RegExp('\\b0*' + numero + '\\b')
    const exactos = cands.filter(c => re.test(c.direccion))
    if (exactos.length) cands = exactos
  }
  cands.sort((a, b) => a._dist - b._dist)

  // Si el usuario indicó la unidad (Depto/Of/Local/Casa N), esa va PRIMERO.
  // Hay que rankear ANTES de cortar en 8: en un condominio todas las casas
  // comparten el mismo punto, así que ordenar por distancia es un empate y la
  // unidad pedida quedaba fuera del corte (caso real: casa 21 de V. del
  // Monasterio 2577, donde salían la 18, 12, 27, 15, 8, 5, 11 y 26).
  if (unidad) {
    const u = escRe(unidad)
    // Con prefijo explícito ("DP 403", "CASA 21", "OF 12") el match es fuerte:
    // si lo hay, devolvemos solo esa (el flujo sigue directo, sin selector).
    const reFuerte = new RegExp('\\b(?:DP|DEPTO|DPTO|DEPT|D|OF|OFIC|OFICINA|LC|LOC|LOCAL|CS|CASA)\\.?\\s*0*' + u + '\\b', 'i')
    // El SII también la escribe sin prefijo ("2577 - 21"): sirve para rankear,
    // no para descartar (ese guión a veces es el número de la copropiedad).
    const reDebil = new RegExp('-\\s*0*' + u + '\\b', 'i')
    for (const c of cands) c._u = reFuerte.test(c.direccion) ? 2 : (reDebil.test(c.direccion) ? 1 : 0)
    const fuertes = cands.filter(c => c._u === 2)
    if (dbg) dbg.unidad = { pedida: unidad, fuertes: fuertes.length, debiles: cands.filter(c => c._u === 1).length }
    if (fuertes.length) cands = fuertes
    else cands.sort((a, b) => (b._u - a._u) || (a._dist - b._dist))
  }
  cands = cands.slice(0, 8).map(({ _dist, _u, ...c }) => c)

  const resp = { candidatos: cands, total: cands.length, _modo: 'real', punto }
  if (!cands.length) resp.mensaje = 'No encontré la propiedad. Ingresa los m2 a mano.'
  if (dbg) resp._debug = dbg
  return cjson(resp)
}
