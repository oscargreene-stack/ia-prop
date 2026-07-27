// app/lib/tasacion-core.js
// ═══════════════════════════════════════════════════════════════════════════
// NÚCLEO COMPARTIDO DE VALORIZACIÓN — la ÚNICA fuente de la fórmula.
// Lo usan /api/zona (Isidora, comprador) y /api/tasar (Valentina, vendedora):
// misma clasificación de ventas, mismos filtros, mismo modelo aditivo de casas
// (suelo × m² terreno + costo construcción × m² construidos) y mismos costos.
// Cualquier cambio a la fórmula se hace AQUÍ, una sola vez, y aplica a ambos.
// ═══════════════════════════════════════════════════════════════════════════

// ── Costo de construcción (reposición) por estado, en UF/m² construido ──────
// Son costos de la OBRA, no precio de mercado. El terreno se suma aparte
// (modelo aditivo). El costo varía por comuna: premium (Vitacura, Las Condes,
// Lo Barnechea) > alta (Providencia, Ñuñoa, La Reina) > estándar.
export const COSTO_CONSTRUCCION_TIERS = {
  premium: {
    nueva:   { label: 'A estrenar / nueva',          min: 40, max: 55 },
    buena:   { label: 'Buen estado',                 min: 34, max: 40 },
    regular: { label: 'Estado regular',              min: 24, max: 32 },
    mala:    { label: 'A refaccionar / deteriorada', min: 16, max: 22 },
  },
  alta: {
    nueva:   { label: 'A estrenar / nueva',          min: 40, max: 50 },
    buena:   { label: 'Buen estado',                 min: 33, max: 41 },
    regular: { label: 'Estado regular',              min: 24, max: 32 },
    mala:    { label: 'A refaccionar / deteriorada', min: 16, max: 23 },
  },
  estandar: {
    nueva:   { label: 'A estrenar / nueva',          min: 38, max: 45 },
    buena:   { label: 'Buen estado',                 min: 30, max: 38 },
    regular: { label: 'Estado regular',              min: 22, max: 30 },
    mala:    { label: 'A refaccionar / deteriorada', min: 15, max: 22 },
  },
}

export const COMUNAS_PREMIUM = ['vitacura', 'las condes', 'lo barnechea']
export const COMUNAS_ALTA = ['providencia', 'nunoa', 'la reina']

// Normaliza nombre de comuna (sin acentos, minúsculas, ñ→n)
export function nfdComuna(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n').trim()
}

// Elige tier por comuna; si no hay comuna (mapa/latlng), infiere por valor de suelo.
export function elegirTierConstruccion(comuna, sueloMediana) {
  const c = nfdComuna(comuna)
  if (c) {
    if (COMUNAS_PREMIUM.includes(c)) return { tier: 'premium', motivo: `comuna premium (${comuna})` }
    if (COMUNAS_ALTA.includes(c)) return { tier: 'alta', motivo: `comuna de tramo alto (${comuna})` }
    return { tier: 'estandar', motivo: `comuna estándar (${comuna})` }
  }
  const s = parseFloat(sueloMediana) || 0
  if (s >= 12) return { tier: 'premium', motivo: `inferido por valor de suelo alto (${s} UF/m²)` }
  if (s >= 6) return { tier: 'alta', motivo: `inferido por valor de suelo medio-alto (${s} UF/m²)` }
  return { tier: 'estandar', motivo: s ? `inferido por valor de suelo (${s} UF/m²)` : 'estándar (sin dato de comuna)' }
}

// Costo medio usado para el método residual de suelo (cuando no hay ventas de sitios).
export const COSTO_CONSTR_RESIDUAL = 32 // UF/m² (≈ "buena")

// Estado de construcción de una casa específica, por antigüedad y remodelación.
// (La remodelación en UF se suma aparte; acá solo define el rango de costo.)
export function estadoConstruccion(anio, remodelacion) {
  const edad = anio ? new Date().getFullYear() - parseInt(anio, 10) : 30
  const remo = String(remodelacion || '').toLowerCase()
  if (edad <= 8) return 'nueva'
  if (edad <= 25) return 'buena'
  if (edad <= 50) return 'regular'
  return remo && remo !== 'ninguna' ? 'regular' : 'mala'
}

// ── Geometría y estadística ──────────────────────────────────────────────────
export function poligono(lat, lng, radioM) {
  const dLat = radioM / 111320
  const dLng = radioM / (111320 * Math.cos((lat * Math.PI) / 180))
  return [
    { lat: lat + dLat, lng: lng - dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng - dLng },
  ]
}

export function centroide(poly) {
  const n = poly.length
  let lat = 0, lng = 0
  for (const p of poly) { lat += p.lat; lng += p.lng }
  return { lat: lat / n, lng: lng / n }
}

// Distancia en metros entre dos puntos (haversine)
export function distanciaM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function mediana(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function percentil(arr, p) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))
  return s[idx]
}

export const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10) // 1 decimal

// ── Clasificación de una venta del CBR por su TIPO REAL ─────────────────────
// Robusto a los formatos de la fuente: copropiedad puede venir como boolean
// (true/false), 't'/'f', 'true', '1'; el destino como letra ('H') o palabra
// ('HABITACIONAL'); el terreno con distintos nombres de campo.

// ¿La unidad está en copropiedad (edificio/condominio)?
export function esCopropiedad(v) {
  const c = v && v.copropiedad
  if (c === true) return true
  if (c === false || c == null) return false
  const t = String(c).trim().toLowerCase()
  return t === 't' || t === 'true' || t === '1' || t === 's' || t === 'si' || t === 'sí' || t === 'verdadero'
}

// Superficie de terreno de la venta, tolerante al nombre del campo.
export function terrenoDe(v) {
  return parseFloat(v?.superficie_total_terreno ?? v?.superficie_terreno ?? v?.terreno ?? 0) || 0
}

// Tipo inferido desde el sufijo de unidad de la dirección SII (para fuentes
// que no traen copropiedad ni terreno, como el endpoint detalle por ROL):
// "... DP 1101" = departamento, "... OF 502" = oficina, "... LC 3" = local,
// "... BOD/EST" = bodega/estacionamiento; sin sufijo (o "CS") = casa/predio.
export function tipoDesdeDireccionSII(dir) {
  const d = ' ' + String(dir || '').toUpperCase().replace(/\s+/g, ' ').trim() + ' '
  if (!d.trim()) return 'otro'
  if (/ (DP|DEPTO|DEPT|DPTO) /.test(d) || / D \d/.test(d)) return 'departamento'
  if (/ (OF|OFIC|OFICINA) /.test(d)) return 'oficina'
  if (/ (LC|LOC|LOCAL) /.test(d)) return 'comercial'
  if (/ (BD|BOD|BODEGA|EST|ESTAC) /.test(d)) return 'otro'
  return 'casa'
}

export function clasificaTipo(v) {
  const dest = String(v.cod_destino || '').trim().toUpperCase()
  const d0 = dest.charAt(0) // 'H'/'HABITACIONAL' → H; 'O'/'OFICINA' → O; 'C'/'COMERCIO' → C
  const constr = parseFloat(v.superficie_construccion || 0) || 0
  const terreno = terrenoDe(v)
  // Sitio eriazo (destino W) o terreno sin construcción: valor de suelo puro
  if (d0 === 'W') return 'terreno'
  if (constr <= 5 && terreno > 0) return 'terreno'
  if (d0 === 'O') return 'oficina'
  if (d0 === 'C') return 'comercial'
  if (d0 && d0 !== 'H') return 'otro'
  // Fila sin copropiedad NI terreno (p.ej. endpoint detalle por ROL): inferir
  // por la dirección SII — es el único dato disponible para separar casa/depto.
  if (v.copropiedad == null && v.superficie_total_terreno == null) {
    return tipoDesdeDireccionSII(v.direccion_sii)
  }
  // Copropiedad (unidad en edificio) => departamento, aunque el registro traiga
  // terreno (el del lote del edificio). Evita mezclar casas y departamentos.
  if (esCopropiedad(v)) return 'departamento'
  return terreno > 0 ? 'casa' : 'departamento'
}

export const TIPO_OBJETIVO = {
  casa: 'casa',
  departamento: 'departamento',
  depto: 'departamento',
  oficina: 'oficina',
  comercial: 'comercial',
}

// ── Ventanas y bandas de comparación (mismas para ambos agentes) ────────────
export const MAX_ANOS_VENTA = 5
export function cutoffVentasStr() {
  const d = new Date(); d.setFullYear(d.getFullYear() - MAX_ANOS_VENTA)
  return d.toISOString().slice(0, 10)
}
export function esVentaReciente(v, cutoffStr) {
  const f = String(v.date_inscripcion || v.fecha || '').slice(0, 10)
  return !f || f >= cutoffStr
}

// Banda de superficie construida comparable en torno a los m² objetivo.
export const BANDA_M2 = { min: 0.4, max: 2.2 }
export function enBandaM2(m2, m2obj) {
  if (!(m2obj > 0)) return true
  return m2 >= m2obj * BANDA_M2.min && m2 <= m2obj * BANDA_M2.max
}

// Sanidad de UF/m² construido de mercado
export const UFM2_MIN = 3
export const UFM2_MAX = 500

// ── Valor de SUELO (modelo aditivo de casas) ────────────────────────────────
export const TRAMOS_SITIO = [
  { id: '<500',     label: 'Sitios <500 m²',      min: 0,    max: 500 },
  { id: '500-800',  label: 'Sitios 500–800 m²',   min: 500,  max: 800 },
  { id: '800-1200', label: 'Sitios 800–1.200 m²', min: 800,  max: 1200 },
  { id: '>1200',    label: 'Sitios >1.200 m²',    min: 1200, max: Infinity },
]

// Puntos de valor de suelo {r: UF/m² terreno, lot: m² sitio}:
// (1) ventas de SITIOS (terreno sin construcción) del sector;
// (2) si hay menos de 3, método residual sobre las ventas de casas:
//     suelo = (precio − COSTO_CONSTR_RESIDUAL × m²constr) / m²terreno.
export function puntosSuelo(ventas, casas) {
  const sitios = (ventas || []).filter((v) => clasificaTipo(v) === 'terreno' && String(v.unit || '').toUpperCase() === 'UF')
  const deSitios = sitios
    .map((v) => {
      const t = terrenoDe(v), uf = parseFloat(v.price)
      if (!(t > 0) || !(uf > 0)) return null
      const r = uf / t
      if (r < 0.3 || r > 250) return null
      return { r, lot: t }
    })
    .filter((x) => x != null)
  const residual = (casas || [])
    .map((v) => {
      const t = terrenoDe(v), c = parseFloat(v.superficie_construccion), uf = parseFloat(v.price)
      if (!(t > 0) || !(c > 0) || !(uf > 0)) return null
      const land = (uf - COSTO_CONSTR_RESIDUAL * c) / t
      if (land < 0.3 || land > 250) return null
      return { r: land, lot: t }
    })
    .filter((x) => x != null)
  const usarVentas = deSitios.length >= 3
  return { pts: usarVentas ? deSitios : residual, fuente: usarVentas ? 'ventas_terreno' : 'residual_casas' }
}

// Resumen estadístico del suelo (null si hay menos de 3 puntos).
export function resumenSuelo(pts, fuente) {
  const list = (pts || []).map((p) => p.r)
  if (list.length < 3) return null
  return {
    uf_m2_mediana: r1(mediana(list)),
    uf_m2_p25: r1(percentil(list, 25)),
    uf_m2_p75: r1(percentil(list, 75)),
    n_comparables: list.length,
    fuente,
  }
}

// UF/m² de suelo por tramo de tamaño de sitio (proxy de la normativa del sector).
export function sueloPorTramo(pts) {
  return TRAMOS_SITIO.map((tr) => {
    const vals = (pts || []).filter((p) => p.lot >= tr.min && p.lot < tr.max).map((p) => p.r)
    if (vals.length < 3) return null
    return { rango: tr.label, uf_m2_mediana: r1(mediana(vals)), uf_m2_p25: r1(percentil(vals, 25)), uf_m2_p75: r1(percentil(vals, 75)), n: vals.length }
  }).filter(Boolean)
}

// Devuelve el resumen del tramo que corresponde a un tamaño de sitio dado.
export function sueloDeTramo(tramos, lotM2) {
  if (!(lotM2 > 0)) return null
  const tr = TRAMOS_SITIO.find((t) => lotM2 >= t.min && lotM2 < t.max)
  if (!tr) return null
  return (tramos || []).find((s) => s.rango === tr.label) || null
}

// ── Total aditivo de una casa (terreno + construcción) ──────────────────────
export function valorAditivoCasa({ sueloUfM2, m2Terreno, costoUfM2, m2Construido }) {
  const terreno_uf = Math.round(sueloUfM2 * m2Terreno)
  const construccion_uf = Math.round(costoUfM2 * m2Construido)
  return { terreno_uf, construccion_uf, total_uf: terreno_uf + construccion_uf }
}

// ── Búsqueda de ventas por polígono (compartida por ambos agentes) ──────────
// Pasada 1: sin filtro (sirve para composición del sector y tipos abundantes).
// Pasada 2: si el tipo objetivo quedó corto (ej. casas diluidas entre miles de
// registros de deptos/estacionamientos), se pide a la API SOLO ese tipo con
// property_type. Si la API ignora el filtro, el dedup deja todo igual; si lo
// soporta, trae las ventas que faltaban.
export async function buscarVentasPoligono({ token, polys, objetivo, apiBase = 'https://datainmobiliaria.cl/api/v1' }) {
  const delTipo = (arr) => arr.filter((v) => !objetivo || clasificaTipo(v) === objetivo).length
  let paginas = 0
  let bloqueado = false // 402/403 del proveedor (plan expirado / sin permiso)
  const fetchPoly = async (poly, conFiltro) => {
    let acc = []
    for (let page = 1; page <= 3; page++) {
      const body = { fuente: 'ventas', polygon: poly, page }
      if (conFiltro && objetivo) body.property_type = [objetivo]
      let r
      try {
        r = await fetch(apiBase + '/busqueda_poligono', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000), // proveedor colgado: cortar y seguir
        })
      } catch (e) { break }
      paginas++
      if (r.status === 402 || r.status === 403) bloqueado = true
      if (!r.ok) break
      const j = await r.json()
      acc = acc.concat(Array.isArray(j.resultados) ? j.resultados : [])
      if (delTipo(acc) >= 15 || !j.has_more) break
    }
    return acc
  }
  let ventas = []
  for (const poly of polys) {
    ventas = await fetchPoly(poly, false)
    if (delTipo(ventas) >= 12) break
  }
  if (objetivo && delTipo(ventas) < 12) {
    const key = (v) => [v.rol, v.date_inscripcion || v.fecha, v.price].join('|')
    const vistos = new Set(ventas.map(key))
    // Solo el polígono MÁS GRANDE (cubre a los menores): la segunda pasada no
    // puede costar otros 9 requests — el presupuesto de tiempo es de 60 s.
    const extra = await fetchPoly(polys[polys.length - 1], true)
    for (const v of extra) { const k = key(v); if (!vistos.has(k)) { vistos.add(k); ventas.push(v) } }
  }
  return { ventas, paginas, bloqueado }
}

// ── Dotación TÍPICA de un departamento por segmento de comuna ───────────────
// Los comparables del sector se venden CON su dotación normal (estacionamientos,
// bodega, terraza): la mediana ya la incluye. Por eso NO se suma por tenerla —
// solo se ajusta la DESVIACIÓN respecto de lo típico del segmento.
export const DOTACION_TIPICA_DEPTO = {
  premium:  { est: 2, bod: 1 },
  alta:     { est: 2, bod: 1 },
  estandar: { est: 1, bod: 1 },
}

// ── Filtro de OUTLIERS (regla de tasador) ───────────────────────────────────
// Una venta a menos de la mitad o a casi el doble de la mediana del grupo NO es
// comparable (herencias, ventas entre relacionados, datos mal cargados): solo
// confunde. Se filtra únicamente si hay muestra suficiente (≥6) y se conserva
// un mínimo de 5 comparables.
export function sinOutliers(items, valorDe, { min = 0.6, max = 1.75, minimo = 5 } = {}) {
  const vals = (items || []).map(valorDe).filter((x) => x > 0)
  if (vals.length < 6) return items
  const med = mediana(vals)
  if (!(med > 0)) return items
  const filtrados = items.filter((it) => { const v = valorDe(it); return v >= med * min && v <= med * max })
  return filtrados.length >= minimo ? filtrados : items
}

// Confianza según número de referencias (mismos umbrales para ambos agentes).
export function confianzaPorN(n) {
  return n >= 8 ? 'Alta' : n >= 4 ? 'Media' : 'Baja'
}
