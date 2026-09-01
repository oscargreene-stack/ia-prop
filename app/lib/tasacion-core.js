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

// Percentil INTERPOLADO. `percentil` usa rango cercano, que con muestras chicas
// salta escalones enteros (con 6 ventas, el p32 cae en el 3er valor = p40 real).
// Para elegir dónde se ubica una unidad dentro del rango de sus gemelas hay que
// interpolar, si no el estado declarado deja de mover el valor de forma pareja.
export function percentilInterp(arr, p) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  if (s.length === 1) return s[0]
  const pos = Math.min(s.length - 1, Math.max(0, (p / 100) * (s.length - 1)))
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return lo === hi ? s[lo] : s[lo] + (pos - lo) * (s[hi] - s[lo])
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

// ═══════════════════════════════════════════════════════════════════════════
// MÉTODO COMPARATIVO DIRECTO — unidades GEMELAS del mismo conjunto
// ═══════════════════════════════════════════════════════════════════════════
// Cuando la propiedad es una unidad de un conjunto de unidades idénticas (las
// 27 casas iguales de un condominio, las plantas repetidas de un edificio), el
// mercado ya la tasó: hay ventas reales de la misma tipología, en el mismo
// lugar, con los mismos bienes comunes. Esas ventas MANDAN sobre cualquier
// modelo. El aditivo (suelo × m² terreno + costo × m² construidos) queda solo
// como respaldo, para cuando no hay gemelas suficientes.
//
// Caso que lo motivó: AV V DEL MONASTERIO 2577 casa 21 (ROL 15161-3669-481).
// El aditivo daba 11.404 UF prorrateando 368 m² de terreno común a 14,5 UF/m²,
// mientras 8 ventas CBR de casas gemelas del mismo condominio iban de 14.350 a
// 18.400 UF. Ninguna venta real bajó de 14.350.

export const CONJUNTO = {
  // Ventana de comparables directos. 8 años y no 5-6 porque un conjunto chico
  // rota lento: 27 casas venden ~1 al año, y con 6 años quedan 6 gemelas — muy
  // poco para leer un percentil. El ajuste por fecha es el que hace utilizable
  // una venta vieja; sin él habría que acortar la ventana.
  mesesMax: 96,
  tolM2: 0.10,          // misma tipología: ±10% de m² construidos
  minVentas: 3,         // desde 3 gemelas manda el comparativo directo
  outlierMin: 0.60,     // fuera: bajo el 60% de la mediana del conjunto
  outlierMax: 1.40,     // fuera: sobre el 140% (relacionados, herencias, mal cargadas)
  mesesCoherencia: 24,  // rango infranqueable: unidades idénticas de 24 meses
  minCoherencia: 2,     // con UNA venta el rango es un punto: clavaría el valor
  factorMin: 0.7,       // topes absolutos del ajuste por fecha: un índice roto
  factorMax: 1.6,       // no puede mover la tasación al doble
  // Techo del ajuste por fecha, en tasa ANUAL COMPUESTA. El índice del sector
  // mezcla tipologías (en Lo Barnechea, 56% "otro") y llega a marcar 13,5%
  // anual: aplicado a 8 años lleva una venta de 87,5 UF/m² (2019) a 148 UF/m²,
  // un valor que NUNCA existió en el conjunto. Las ventas repetidas reales de
  // este condominio (misma casa vendida dos veces) marcan 3,9%-6,1% anual:
  //   casa 12  13.250 UF (2017-01) -> 18.400 UF (2025-09) = 3,9% anual
  //   casa  3  11.350 UF (2013-09) -> 14.350 UF (2019-01) = 4,5% anual
  //   casa  8  10.850 UF (2013-01) -> 12.000 UF (2014-10) = 6,1% anual
  // 5% es el techo: acota el índice sectorial sin negar la plusvalía real.
  apreciacionMaxAnual: 0.05,
  mesesRecientes: 24,   // "reciente" para el percentil de estado y para el carry
  minRecientes: 3,      // con 3 ventas recientes las antiguas no entran al percentil
  anosMinCalibrar: 1.5, // separación mínima entre cohortes para leer una tasa
  minPorCohorte: 2,     // ventas mínimas a cada lado para calibrar con el conjunto
}

// Percentil del rango de gemelas que representa la unidad EN ESTADO BASE, sin
// remodelar. Las gemelas se vendieron en estados distintos: la mediana del
// rango incluye a las remodeladas, así que tomarla como base y encima sumar el
// premio de remodelación contaría lo mismo dos veces. El estado declarado se
// paga UNA sola vez, con la tarifa de AJUSTES_CONFIG.remodelacion (5/10/20
// UF/m² para baja/media/alta), que es editable desde /admin.
export const PCTL_BASE = 32

const mesDe = (f) => String(f || '').slice(0, 7)

const ANIO_DIAS = 365.25
const DIA_MS = 86400000

// Fecha 'YYYY-MM-DD' (o 'YYYY-MM') a Date UTC. null si no parsea.
function aFecha(f) {
  let t = String(f || '').slice(0, 10)
  if (/^\d{4}-\d{2}$/.test(t)) t += '-01'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const d = new Date(t + 'T00:00:00Z')
  return isNaN(d.getTime()) ? null : d
}

// Años (con decimales) entre dos fechas. `hasta` null = hoy.
export function anosEntre(desde, hasta = null) {
  const a = aFecha(desde)
  const b = hasta ? aFecha(hasta) : new Date()
  if (!a || !b) return null
  return (b.getTime() - a.getTime()) / (DIA_MS * ANIO_DIAS)
}

// Fecha de corte 'YYYY-MM-DD' a `meses` hacia atrás desde `hoy` (o desde ahora).
export function corteMeses(hoy, meses) {
  const d = hoy ? aFecha(hoy) : new Date()
  const base = d || new Date()
  const c = new Date(base.getTime())
  c.setUTCMonth(c.getUTCMonth() - meses)
  return c.toISOString().slice(0, 10)
}

// Mediana de una lista de fechas 'YYYY-MM-DD' (par: punto medio de las dos centrales).
export function medianaFecha(fechas) {
  const ts = (fechas || []).map(aFecha).filter(Boolean).map((d) => d.getTime()).sort((a, b) => a - b)
  if (!ts.length) return null
  const m = Math.floor(ts.length / 2)
  const t = ts.length % 2 ? ts[m] : (ts[m - 1] + ts[m]) / 2
  return new Date(t).toISOString().slice(0, 10)
}

// Acota un factor de ajuste por fecha a una tasa anual compuesta máxima.
// Un factor bruto de 1,69 sobre 7,6 años (lo que daba el índice del sector con
// la casa 3) equivale a 7,2% anual: acotado a 5% queda en 1,44. El tope es
// simétrico: un índice que se desploma tampoco puede hundir una venta vieja.
export function acotaFactor(bruto, anos, tasaMax = CONJUNTO.apreciacionMaxAnual) {
  if (!(bruto > 0)) return 1
  const y = Math.max(0, anos || 0)
  const techo = Math.pow(1 + tasaMax, y)
  const piso = 1 / techo
  const acotado = Math.min(techo, Math.max(piso, bruto))
  return Math.min(CONJUNTO.factorMax, Math.max(CONJUNTO.factorMin, acotado))
}

// Factor de una tasa anual compuesta aplicada a los años transcurridos.
export function factorPorTasa(fecha, tasa, hoy = null) {
  const anos = Math.max(0, anosEntre(fecha, hoy) || 0)
  return acotaFactor(Math.pow(1 + (tasa || 0), anos), anos)
}

// Factor para llevar un UF/m² desde su fecha hasta hoy con el índice del sector
// (la serie de medianas trimestrales que ya calculamos). Sin serie utilizable
// devuelve 1: mejor no ajustar que ajustar con ruido. El resultado va SIEMPRE
// acotado a CONJUNTO.apreciacionMaxAnual: el índice sectorial mezcla tipologías
// y no representa a un conjunto de casas idénticas (ver CONJUNTO).
export function factorFecha(fecha, serie, hoy = null) {
  const pts = (serie || [])
    .filter((p) => p && p.uf_m2 > 0 && p.trimestre)
    .sort((a, b) => (a.trimestre < b.trimestre ? -1 : 1))
  if (pts.length < 2) return 1
  const mesHoy = hoy ? mesDe(hoy) : pts[pts.length - 1].trimestre
  // Nivel de hoy: el último punto de la serie (ya viene suavizado a 3 meses).
  const nivelHoy = pts[pts.length - 1].uf_m2
  const m = mesDe(fecha)
  if (!m || m > mesHoy) return 1
  // Último punto en o antes de la venta; si la venta es anterior a la serie se
  // usa el punto más antiguo (subajusta, nunca inventa plusvalía).
  let nivelEntonces = null
  for (const p of pts) { if (p.trimestre <= m) nivelEntonces = p.uf_m2 }
  if (nivelEntonces == null) nivelEntonces = pts[0].uf_m2
  if (!(nivelEntonces > 0) || !(nivelHoy > 0)) return 1
  return acotaFactor(nivelHoy / nivelEntonces, anosEntre(fecha, hoy))
}

// Ventas de unidades GEMELAS: misma tipología (±10% de m² construidos) dentro
// de la ventana y con UF/m² sano. Acepta filas del detalle ({fecha, m2, uf}) y
// del CBR crudo ({date_inscripcion, superficie_construccion, price}).
// Deduplica por (rol, fecha, precio): el pool se arma juntando dos listas del
// detalle y una misma inscripción podría venir en las dos.
export function ventasGemelas({ ventas, m2Objetivo, meses = CONJUNTO.mesesMax, hoy = null }) {
  if (!(m2Objetivo > 0)) return []
  const vistas = new Set()
  const corteStr = corteMeses(hoy, meses)
  return (ventas || [])
    .map((v) => {
      const m2 = parseFloat(v.m2 ?? v.superficie_construccion)
      const uf = parseFloat(v.uf ?? v.precio_uf ?? v.price)
      const fecha = String(v.fecha || v.date_inscripcion || '').slice(0, 10)
      if (!(m2 > 0) || !(uf > 0) || !fecha || fecha < corteStr) return null
      if (Math.abs(m2 - m2Objetivo) / m2Objetivo > CONJUNTO.tolM2) return null
      const ufM2 = uf / m2
      if (ufM2 < UFM2_MIN || ufM2 > UFM2_MAX) return null
      const clave = [v.rol ?? '', fecha, uf].join('|')
      if (vistas.has(clave)) return null
      vistas.add(clave)
      return { ...v, m2, uf, fecha, uf_m2: ufM2 }
    })
    .filter(Boolean)
}

// Descarta las que no son de mercado: bajo el 60% o sobre el 140% de la mediana
// del propio conjunto. Devuelve las descartadas para poder explicarlas.
export function sinOutliersConjunto(gemelas) {
  const vals = (gemelas || []).map((g) => g.uf_m2).filter((x) => x > 0)
  if (vals.length < 3) return { limpias: gemelas || [], descartadas: [] }
  const med = mediana(vals)
  if (!(med > 0)) return { limpias: gemelas || [], descartadas: [] }
  const lo = med * CONJUNTO.outlierMin, hi = med * CONJUNTO.outlierMax
  const limpias = [], descartadas = []
  for (const g of gemelas) (g.uf_m2 >= lo && g.uf_m2 <= hi ? limpias : descartadas).push(g)
  return limpias.length >= CONJUNTO.minVentas ? { limpias, descartadas } : { limpias: gemelas, descartadas: [] }
}

// ── APRECIACIÓN IMPLÍCITA DEL PROPIO CONJUNTO ───────────────────────────────
// El índice del sector no sirve para ajustar por fecha las ventas de un
// conjunto de unidades idénticas: mezcla tipologías (56% "otro" en el caso que
// lo motivó) y marca 13,5% anual donde las casas suben 2-4%. Si el conjunto
// tiene ventas propias repartidas en el tiempo, ÉL mismo dice cuánto se apreció:
// mediana UF/m² de las ventas recientes contra la de las antiguas, anualizada
// entre las fechas medianas de cada cohorte. Devuelve null si no hay material
// suficiente — ahí manda el índice del sector, ya acotado a 5% anual.
export function tasaApreciacionConjunto({ ventas, m2Objetivo, hoy = null, meses = CONJUNTO.mesesMax }) {
  const { limpias } = sinOutliersConjunto(ventasGemelas({ ventas, m2Objetivo, meses, hoy }))
  if (limpias.length < CONJUNTO.minVentas) return null
  const corte = corteMeses(hoy, CONJUNTO.mesesRecientes)
  const recientes = limpias.filter((g) => g.fecha >= corte)
  const antiguas = limpias.filter((g) => g.fecha < corte)
  if (recientes.length < CONJUNTO.minPorCohorte || antiguas.length < CONJUNTO.minPorCohorte) return null
  const nivelR = mediana(recientes.map((g) => g.uf_m2))
  const nivelA = mediana(antiguas.map((g) => g.uf_m2))
  const fechaR = medianaFecha(recientes.map((g) => g.fecha))
  const fechaA = medianaFecha(antiguas.map((g) => g.fecha))
  const dt = anosEntre(fechaA, fechaR)
  if (!(nivelR > 0) || !(nivelA > 0) || !(dt >= CONJUNTO.anosMinCalibrar)) return null
  const bruta = Math.pow(nivelR / nivelA, 1 / dt) - 1
  if (!isFinite(bruta)) return null
  const cap = CONJUNTO.apreciacionMaxAnual
  const tasa = Math.min(cap, Math.max(-cap, bruta))
  return {
    tasa,
    tasa_pct: Math.round(tasa * 1000) / 10,
    tasa_bruta_pct: Math.round(bruta * 1000) / 10,
    acotada: Math.abs(bruta) > cap,
    n_recientes: recientes.length,
    n_antiguas: antiguas.length,
    anos: Math.round(dt * 100) / 100,
    fuente: 'ventas del propio conjunto',
  }
}

// Gemelas con su UF/m² llevado a hoy. Prioridad del ajuste por fecha:
//   1º la apreciación implícita del PROPIO conjunto (si se puede calcular);
//   2º el índice del sector, acotado a CONJUNTO.apreciacionMaxAnual.
// `tasaConjunto` permite inyectar la tasa ya calculada (o null para forzar el
// índice); si no se pasa, se calcula aquí.
export function gemelasAjustadas({ ventas, m2Objetivo, serieIndice, meses, hoy, tasaConjunto }) {
  const { limpias, descartadas } = sinOutliersConjunto(ventasGemelas({ ventas, m2Objetivo, meses, hoy }))
  // La calibración se hace SIEMPRE sobre la ventana completa: llamadas con una
  // ventana corta (la regla de coherencia usa 24 meses) no tienen ventas
  // antiguas con que calibrar y no deben perder la tasa por eso.
  const cal = tasaConjunto === undefined
    ? tasaApreciacionConjunto({ ventas, m2Objetivo, hoy })
    : (tasaConjunto == null ? null : tasaConjunto)
  return {
    tasa_conjunto: cal,
    ajustadas: limpias.map((g) => {
      const f = cal ? factorPorTasa(g.fecha, cal.tasa, hoy) : factorFecha(g.fecha, serieIndice, hoy)
      return { ...g, factor_fecha: Math.round(f * 1000) / 1000, uf_m2_ajustado: g.uf_m2 * f }
    }),
    descartadas,
  }
}

// Rango [min, max] en UF de unidades IDÉNTICAS de los últimos `meses`. Es la
// regla de coherencia: el valor final no puede quedar fuera.
//
// Se construye sobre precios NOMINALES (lo que realmente se pagó, normalizado a
// los m² del objetivo) más un carry ACOTADO desde la fecha de venta — nunca
// sobre valores inflados por el índice del sector. Es la diferencia entre un
// techo que existió de verdad y uno inventado: con el índice pleno el techo del
// caso V. del Monasterio subía de 18.400 UF a ~21.000 UF, y el PISO subía a
// ~19.000 UF, de modo que la regla que debía contener la tasación era la que la
// empujaba hacia arriba.
export function rangoUnidadesIdenticas({ ventas, m2Objetivo, meses = CONJUNTO.mesesCoherencia, hoy, tasaConjunto }) {
  if (!(m2Objetivo > 0)) return null
  const { limpias } = sinOutliersConjunto(ventasGemelas({ ventas, m2Objetivo, meses, hoy }))
  if (limpias.length < CONJUNTO.minCoherencia) return null
  const cal = tasaConjunto === undefined
    ? tasaApreciacionConjunto({ ventas, m2Objetivo, hoy })
    : (tasaConjunto == null ? null : tasaConjunto)
  // Sin tasa propia del conjunto se usa el techo (5% anual): el carry más
  // permisivo posible, para que la regla acote sin estrangular.
  const cap = CONJUNTO.apreciacionMaxAnual
  const tasa = cal ? Math.min(cap, Math.max(-cap, cal.tasa)) : cap
  const ufs = limpias
    .map((g) => g.uf_m2 * m2Objetivo * factorPorTasa(g.fecha, tasa, hoy))
    .filter((x) => x > 0)
  // Con una sola venta min === max: en vez de acotar, clavaría la tasación en
  // ese precio y borraría remodelación y características. Mejor no acotar.
  if (ufs.length < CONJUNTO.minCoherencia) return null
  const nominales = limpias.map((g) => g.uf_m2 * m2Objetivo).filter((x) => x > 0)
  return {
    min_uf: Math.round(Math.min(...ufs)),
    max_uf: Math.round(Math.max(...ufs)),
    max_nominal_uf: Math.round(Math.max(...nominales)),
    min_nominal_uf: Math.round(Math.min(...nominales)),
    carry_pct: Math.round(tasa * 1000) / 10,
    carry_fuente: cal ? cal.fuente : 'tope de ' + Math.round(cap * 100) + '% anual (sin ventas propias para calibrar)',
    n: ufs.length,
    meses,
  }
}

// Valor por comparación directa con las gemelas. null si no alcanzan.
//
// El percentil de ESTADO se lee sobre las ventas RECIENTES (últimos 24 meses):
// son las que describen el mercado de hoy y el abanico de estados que se está
// pagando hoy. Las antiguas ya cumplieron su papel calibrando la apreciación
// del conjunto; volver a meterlas en el percentil las cuenta dos veces, y
// además obliga a confiar en su valor ajustado. Solo entran a dar densidad
// cuando hay menos de CONJUNTO.minRecientes ventas recientes.
export function valorComparativoDirecto({ ventas, m2Objetivo, serieIndice, hoy, meses, pctl = PCTL_BASE }) {
  if (!(m2Objetivo > 0)) return null
  const { ajustadas, descartadas, tasa_conjunto } = gemelasAjustadas({ ventas, m2Objetivo, serieIndice, hoy, meses })
  if (ajustadas.length < CONJUNTO.minVentas) return null
  const corte = corteMeses(hoy, CONJUNTO.mesesRecientes)
  const recientes = ajustadas.filter((g) => g.fecha >= corte)
  const usaRecientes = recientes.length >= CONJUNTO.minRecientes
  const pool = usaRecientes ? recientes : ajustadas
  const lista = pool.map((g) => g.uf_m2_ajustado)
  // Se redondea ANTES de multiplicar: el informe muestra "percentil 32 =
  // <uf_m2> UF/m² x <m²>" y ese producto tiene que dar el valor que se publica.
  const ufM2 = r1(percentilInterp(lista, pctl))
  if (!(ufM2 > 0)) return null
  return {
    uf_m2: ufM2,
    uf_m2_mediana: r1(mediana(lista)),
    uf_m2_min: r1(Math.min(...lista)),
    uf_m2_max: r1(Math.max(...lista)),
    valor_uf: Math.round(ufM2 * m2Objetivo),
    percentil_usado: pctl,
    n: pool.length,
    n_total: ajustadas.length,
    ventana_percentil_meses: usaRecientes ? CONJUNTO.mesesRecientes : (meses || CONJUNTO.mesesMax),
    solo_recientes: usaRecientes,
    tasa_conjunto: tasa_conjunto || null,
    n_descartadas: descartadas.length,
    ventas: pool,
    ventas_todas: ajustadas,
    hubo_ajuste_fecha: pool.some((g) => g.factor_fecha !== 1),
  }
}

// ── ¿El terreno del rol es prorrateo del bien común? ────────────────────────
// En un condominio acogido a copropiedad el rol de la unidad trae
// superficie_total_terreno = 0, y el terreno que conoce el dueño es su
// prorrateo del bien común. Ese suelo NO es vendible por separado y su valor ya
// está dentro del precio de las unidades gemelas: pasarlo por el modelo aditivo
// lo cuenta a precio de sitio eriazo y hunde la tasación.
export function terrenoEsProrrateoBC(siiData) {
  const origen = String(siiData?.terreno_origen || '').toLowerCase()
  if (origen === 'bien_comun') return true
  if (origen === 'sii') return false
  return !!(siiData?.es_copropiedad ?? siiData?.copropiedad)
}
