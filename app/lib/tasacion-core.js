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

// FIX 15-oct (caso La Llavería 1779, Vitacura — 10.228 UF entregado, ventas
// del sector ~12.000 UF): el residual restaba 32 UF/m² ("buena") a TODAS las
// casas vendidas, pero a la casa tasada le sumaba su construcción según su
// antigüedad (19 UF/m², "a refaccionar"). En un barrio de casas de los 60-70
// eso deprime el suelo y castiga la antigüedad dos veces. Ahora a cada venta
// se le descuenta la construcción con LA MISMA tabla (tier de la comuna +
// estado por su año) que se usa para la propiedad tasada. Sin año conocido:
// "regular". Sin tier (llamadas antiguas): COSTO_CONSTR_RESIDUAL, como antes.
export function costoResidualDe(v, tier) {
  const tabla = tier ? COSTO_CONSTRUCCION_TIERS[tier] : null
  if (!tabla) return COSTO_CONSTR_RESIDUAL
  const y = parseInt(v?.ano_construccion ?? v?.anio_construccion ?? v?.ano ?? '', 10)
  const anioValido = y >= 1850 && y <= new Date().getFullYear() + 1
  const cfg = tabla[anioValido ? estadoConstruccion(y, null) : 'regular']
  return Math.round((cfg.min + cfg.max) / 2)
}

// Mínimo de referencias para usar un subconjunto del suelo (misma zona PRC o
// tramo de tamaño de sitio). Con 3 ventas bastaba que fueran las 3 más baratas
// del barrio para hundir el valor del terreno (La Llavería 1779: 27,6 UF/m²
// con 3 ventas vs ~30-34 con las 8-9 casas del sector).
export const MIN_REFS_SUELO = 6

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
//     suelo = (precio_hoy − COSTO_CONSTR_RESIDUAL × m²constr) / m²terreno.
// FIX 16-sep: ambas ramas llevan el precio NOMINAL a hoy con la variación
// real del mercado (factorFecha/serieIndice, mismo mecanismo que gemelasAjustadas)
// antes de restar el costo de construcción o dividir por el terreno. Sin esto,
// ventas de hasta MAX_ANOS_VENTA (5) años quedaban sin ajustar y además se les
// restaba COSTO_CONSTR_RESIDUAL (costo de HOY) de un precio de AYER, deprimiendo
// el suelo dos veces en un mercado al alza — caso detectado en Caribes 2238,
// Vitacura (13.973 UF entregado vs. ~18.000 UF esperado por Oscar).
export function puntosSuelo(ventas, casas, { serieIndice, hoy, tier } = {}) {
  const conIndice = serieUtilizable(serieIndice)
  const aHoy = (v) => {
    const uf = parseFloat(v.price)
    if (!(uf > 0)) return null
    const f = conIndice ? factorFecha(v.date_inscripcion || v.fecha, serieIndice, hoy) : 1
    return uf * f
  }
  const sitios = (ventas || []).filter((v) => clasificaTipo(v) === 'terreno' && String(v.unit || '').toUpperCase() === 'UF')
  const deSitios = sitios
    .map((v) => {
      const t = terrenoDe(v), uf = aHoy(v)
      if (!(t > 0) || !(uf > 0)) return null
      const r = uf / t
      if (r < 0.3 || r > 250) return null
      return { r, lot: t }
    })
    .filter((x) => x != null)
  const residual = (casas || [])
    .map((v) => {
      const t = terrenoDe(v), c = parseFloat(v.superficie_construccion), uf = aHoy(v)
      if (!(t > 0) || !(c > 0) || !(uf > 0)) return null
      const land = (uf - costoResidualDe(v, tier) * c) / t
      if (land < 0.3 || land > 250) return null
      return { r: land, lot: t }
    })
    .filter((x) => x != null)
  const usarVentas = deSitios.length >= 3
  return { pts: usarVentas ? deSitios : residual, fuente: usarVentas ? 'ventas_terreno' : 'residual_casas' }
}

// Resumen estadístico del suelo (null si hay menos de 3 puntos).
// FIX 05-oct: se descartan outliers (misma regla de tasador que el resto del
// núcleo: sinOutliers) antes de calcular mediana/percentiles de suelo, tanto
// a nivel global (resumenSuelo) como dentro de cada tramo (sueloPorTramo).
// Sin esto, una o dos ventas de terreno atípicas podían distorsionar el
// valor de suelo reportado, igual que ocurría en la mediana sectorial de
// comparables (ver fix en route.js).
export function resumenSuelo(pts, fuente) {
  const ptsFiltrados = sinOutliers(pts || [], (p) => p.r)
  const list = ptsFiltrados.map((p) => p.r)
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
    const valsRaw = (pts || []).filter((p) => p.lot >= tr.min && p.lot < tr.max).map((p) => p.r)
    const vals = sinOutliers(valsRaw, (x) => x)
    if (vals.length < 3) return null
    return { rango: tr.label, uf_m2_mediana: r1(mediana(vals)), uf_m2_p25: r1(percentil(vals, 25)), uf_m2_p75: r1(percentil(vals, 75)), n: vals.length }
  }).filter(Boolean)
}

// Devuelve el resumen del tramo que corresponde a un tamaño de sitio dado.
export function sueloDeTramo(tramos, lotM2) {
  if (!(lotM2 > 0)) return null
  const tr = TRAMOS_SITIO.find((t) => lotM2 >= t.min && lotM2 < t.max)
  if (!tr) return null
  const hit = (tramos || []).find((s) => s.rango === tr.label) || null
  // FIX 15-oct: un tramo con pocas ventas no manda; se usa el suelo general.
  return hit && hit.n >= MIN_REFS_SUELO ? hit : null
}

// ── SUELO HOMOLOGADO POR TAMAÑO DE SITIO (FIX 30-oct) ───────────────────────
// Caso Sendero del Mirador 6781, Vitacura (2.000 m² de sitio, 761 m² constr.):
// el tramo ">1.200 m²" no llegaba a MIN_REFS_SUELO y el suelo caía a la
// mediana GENERAL del sector (17,8 UF/m² sobre 14 casas, la mayoría en sitios
// de 500-1.000 m²). El UF/m² de suelo BAJA con el tamaño del sitio (un sitio
// de 2.000 m² no vale lo mismo por m² que uno de 600), así que aplicar la
// mediana general a un sitio grande lo sobrevalora: 35.600 UF de terreno
// cuando las propias ventas de casas en sitios de 1.000-4.000 m² del informe
// daban 12-16 UF/m². Resultado: 57.288 UF para una casa cuyos comparables
// directos (601-783 m²) cerraron a 52-57 UF/m² (≈ 40.000-44.000 UF).
//
// Regla de tasador: el suelo se lee de referencias de sitios de tamaño
// COMPARABLE al tasado. Si el tramo fijo no tiene masa suficiente, se usa una
// banda alrededor del sitio (0,5×–2,5×); si tampoco, una banda ancha
// (0,33×–4×); y si el sitio es más grande que todas las referencias, las
// referencias más grandes disponibles (tercio superior). Solo si nada de eso
// reúne MIN_REFS_BANDA_SUELO referencias se vuelve a la mediana general.
export const BANDA_SUELO = { min: 0.5, max: 2.5, minAncha: 0.33, maxAncha: 4, minRefs: 4 }
export const MIN_REFS_BANDA_SUELO = BANDA_SUELO.minRefs

function resumenDeLista(valsRaw, rango, fuenteBanda) {
  const vals = sinOutliers(valsRaw, (x) => x)
  if (vals.length < MIN_REFS_BANDA_SUELO) return null
  return { rango, uf_m2_mediana: r1(mediana(vals)), uf_m2_p25: r1(percentil(vals, 25)), uf_m2_p75: r1(percentil(vals, 75)), n: vals.length, banda: fuenteBanda }
}

export function sueloPorBandaSitio(pts, lotM2) {
  if (!(lotM2 > 0) || !(pts || []).length) return null
  const lista = (pts || []).filter((p) => p && p.lot > 0 && p.r > 0)
  if (!lista.length) return null
  const fmtM2 = (x) => Math.round(x).toLocaleString('es-CL')
  const enBanda = (lo, hi) => lista.filter((p) => p.lot >= lotM2 * lo && p.lot <= lotM2 * hi).map((p) => p.r)
  // 1) banda estrecha alrededor del sitio tasado
  const estrecha = resumenDeLista(enBanda(BANDA_SUELO.min, BANDA_SUELO.max),
    `sitios de ${fmtM2(lotM2 * BANDA_SUELO.min)}–${fmtM2(lotM2 * BANDA_SUELO.max)} m² (tamaño comparable al tasado)`, 'estrecha')
  if (estrecha) return estrecha
  // 2) banda ancha
  const ancha = resumenDeLista(enBanda(BANDA_SUELO.minAncha, BANDA_SUELO.maxAncha),
    `sitios de ${fmtM2(lotM2 * BANDA_SUELO.minAncha)}–${fmtM2(lotM2 * BANDA_SUELO.maxAncha)} m²`, 'ancha')
  if (ancha) return ancha
  // 3) sitio más grande que (casi) todas las referencias: mandan las más grandes
  const lotMediana = mediana(lista.map((p) => p.lot))
  if (lotM2 > lotMediana * 1.5) {
    const porTamano = [...lista].sort((a, b) => b.lot - a.lot)
    const top = porTamano.slice(0, Math.max(MIN_REFS_BANDA_SUELO, Math.ceil(porTamano.length / 3)))
    const minLot = top[top.length - 1].lot
    const grandes = resumenDeLista(top.map((p) => p.r), `los ${top.length} sitios más grandes del sector (≥ ${fmtM2(minLot)} m²)`, 'mayores')
    if (grandes) return grandes
  }
  return null
}

// Suelo a usar para un sitio dado: tramo fijo (≥ MIN_REFS_SUELO) → banda
// alrededor del sitio → mediana general. Devuelve el resumen y de dónde salió.
export function sueloParaSitio({ pts, lotM2, general }) {
  const tramos = sueloPorTramo(pts)
  const delTramo = lotM2 > 0 ? sueloDeTramo(tramos, lotM2) : null
  if (delTramo) return { usar: delTramo, tramo: delTramo.rango, n: delTramo.n, origen: 'tramo' }
  const banda = sueloPorBandaSitio(pts, lotM2)
  if (banda) return { usar: banda, tramo: banda.rango, n: banda.n, origen: 'banda' }
  if (!general) return null
  return { usar: general, tramo: 'todos los tamaños de sitio', n: general.n_comparables, origen: 'general' }
}

// ── MÉTODO COMPARATIVO HOMOLOGADO PARA CASAS (FIX 15-oct, v2) ──────────────
// El aditivo (suelo + construcción) pierde la MICROLOCALIZACIÓN: el suelo sale
// de la mediana de un sector de ~1 km y todas las ventas pesan igual. Caso La
// Llavería 1779 (Vitacura): las 2 casas similares más cercanas (121 y 376 m),
// homologadas a su terreno y m², valen ~13.900 UF; las de 600-700 m, ~10.500.
// El aditivo daba ~10.700 UF; un corredor del sector la valora en 11.500-12.500.
//
// Método de tasador: (1) casas similares (±30% m² construidos y terreno),
// precio llevado a hoy con el índice; (2) HOMOLOGACIÓN: a cada una se le suma
// o resta la diferencia de terreno (× UF/m² de suelo) y de m² construidos
// (× costo de construcción) respecto de la propiedad; (3) sin atípicas;
// (4) promedio PONDERADO POR CERCANÍA con peso 1/√distancia (suave: la venta
// a 100 m pesa ~2,6× la de 700 m, no 7×; distancia mínima 100 m).
// Con ≥4 casas manda este valor; el aditivo queda como respaldo y referencia.
//
// FIX 30-oct (caso Sendero del Mirador 6781, Vitacura: 761 m² en 2.000 m²):
// (a) Con ±30% de TERRENO además de ±30% de m² construidos, una casa grande
//     casi nunca junta 4 similares (de 5 ventas CBR del informe solo 1
//     cumplía) y el valor caía al aditivo con suelo sobrevalorado. La
//     homologación existe justamente para absorber diferencias de terreno,
//     así que el terreno se tolera en dos pasos: primero la banda estrecha
//     (±30%, igual que antes — si junta minN, nada cambia respecto de los
//     casos ya validados); si no alcanza, banda ancha con la homologación
//     por suelo. Se descarta la venta cuya homologación (terreno +
//     construcción) supera el 50% de su precio: ya no es comparable.
// (b) Antes de homologar se descartan las ventas ATÍPICAS EN BRUTO: UF/m²
//     construido fuera del 60–175% de la mediana del grupo (desde 4 ventas,
//     conservando 3). La venta del mismo conjunto a 26 UF/m² (Agua del Padre
//     6815: 16.851 UF por 649 m², un tercio del sector) pasaba el filtro de
//     homologadas (0,64 de la mediana) y, por estar a 147 m, habría pesado
//     un tercio del promedio. Las descartadas se devuelven para explicarlas.
export const COMPARATIVO_CASA = {
  tol: 0.30, minN: 4, distMinM: 100,
  terrenoAnchoMin: 0.4, terrenoAnchoMax: 2.5, // banda de terreno del 2º paso
  maxHomologacionPct: 0.50,                   // tope del ajuste total / precio
  atipicaMin: 0.60, atipicaMax: 1.75, minParaAtipicas: 4, conservar: 3,
}
export function comparativoCasas({ comparables, m2Construido, m2Terreno, sueloUfM2, costoUfM2, serieIndice, hoy }) {
  if (!(m2Construido > 0) || !(m2Terreno > 0) || !(sueloUfM2 > 0) || !(costoUfM2 > 0)) return null
  const { tol, minN, distMinM, terrenoAnchoMin, terrenoAnchoMax, maxHomologacionPct, atipicaMin, atipicaMax, minParaAtipicas, conservar } = COMPARATIVO_CASA
  const cerca = (x, obj) => x >= obj * (1 - tol) && x <= obj * (1 + tol)
  const conIndice = serieUtilizable(serieIndice)
  const candidatas = (comparables || [])
    .map((c) => {
      const m2 = parseFloat(c.m2), t = parseFloat(c.m2_terreno), uf = parseFloat(c.precio_uf)
      if (!(m2 > 0) || !(t > 0) || !(uf > 0)) return null
      if (!cerca(m2, m2Construido)) return null
      const d = parseFloat(c.distancia_m)
      return { c, m2, t, uf, uf_m2: uf / m2, distancia_m: d >= 0 ? Math.round(d) : null, terrenoEstrecho: cerca(t, m2Terreno) }
    })
    .filter(Boolean)
    .filter((x) => x.t >= m2Terreno * terrenoAnchoMin && x.t <= m2Terreno * terrenoAnchoMax)
  if (!candidatas.length) return null
  // (b) atípicas en bruto (UF/m² construido vs mediana del grupo)
  let base = candidatas, descartadas = []
  if (candidatas.length >= minParaAtipicas) {
    const med = mediana(candidatas.map((x) => x.uf_m2))
    const ok = candidatas.filter((x) => x.uf_m2 >= med * atipicaMin && x.uf_m2 <= med * atipicaMax)
    if (ok.length >= conservar && ok.length < candidatas.length) {
      base = ok
      descartadas = candidatas.filter((x) => !ok.includes(x)).map((x) => ({
        direccion: x.c.direccion, uf: Math.round(x.uf), uf_m2: Math.round(x.uf_m2), motivo: 'atipica',
        detalle: `${Math.round(x.uf_m2)} UF/m² frente a ${Math.round(med)} UF/m² de mediana del grupo`,
      }))
    }
  }
  // (a) terreno en dos pasos: estrecho (±30%) si junta minN; si no, banda ancha
  const estrechas = base.filter((x) => x.terrenoEstrecho)
  const pool = estrechas.length >= minN ? estrechas : base
  const bandaTerreno = estrechas.length >= minN ? 'estrecha' : 'ancha'
  const homologar = (x) => {
    const f = conIndice ? factorFecha(x.c.fecha, serieIndice, hoy) : 1
    const ufHoy = x.uf * f
    const ajTerreno = (m2Terreno - x.t) * sueloUfM2
    const ajConstr = (m2Construido - x.m2) * costoUfM2
    if (Math.abs(ajTerreno) + Math.abs(ajConstr) > ufHoy * maxHomologacionPct) return null
    return {
      direccion: x.c.direccion,
      distancia_m: x.distancia_m,
      m2: x.m2, m2_terreno: x.t,
      uf_hoy: Math.round(ufHoy),
      aj_terreno: Math.round(ajTerreno),
      aj_constr: Math.round(ajConstr),
      uf_homologado: Math.round(ufHoy + ajTerreno + ajConstr),
    }
  }
  const lista = pool.map(homologar).filter(Boolean)
  const limpias = sinOutliers(lista, (x) => x.uf_homologado)
  if (limpias.length < minN) return null
  const pesos = limpias.map((x) => 1 / Math.sqrt(Math.max(distMinM, x.distancia_m ?? 1000)))
  const sumP = pesos.reduce((a, b) => a + b, 0)
  const ponderado = limpias.reduce((acc, x, i) => acc + x.uf_homologado * pesos[i], 0) / sumP
  const ufs = limpias.map((x) => x.uf_homologado)
  return {
    valor_uf: Math.round(ponderado),
    mediana: Math.round(mediana(ufs)),
    min: Math.min(...ufs),
    max: Math.max(...ufs),
    n: limpias.length,
    banda_terreno: bandaTerreno,
    descartadas,
    n_descartadas: descartadas.length,
    detalle: limpias.map((x, i) => ({ ...x, peso_pct: Math.round((pesos[i] / sumP) * 100) })),
  }
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
  // Tope del ajuste por fecha SOLO PARA EL RESPALDO (tasa implícita del
  // conjunto / carry sin calibración), en tasa ANUAL COMPUESTA. El ajuste
  // principal ya NO usa este tope: usa la variación REAL del mercado del
  // período (índice del sector del MISMO TIPO, construido con ventas reales),
  // que sube o baja según lo que el mercado efectivamente hizo. Un índice que
  // mezcla tipologías (en Lo Barnechea, 56% "otro", 13,5% anual) NUNCA debe
  // alimentar el ajuste: esa protección hoy vive en /api/tasar, que solo
  // pasa series del mismo tipo, más los topes absolutos factorMin/factorMax.
  apreciacionMaxAnual: 0.05,
  // Calidad mínima de la serie de mercado del mismo tipo para que el índice
  // real reemplace al respaldo: puntos anuales con ventas suficientes, un
  // tramo de historia razonable y un último punto que no esté vencido.
  serieMinPorPunto: 2,    // ventas mínimas por punto anual de la serie
  seriePuntosMin: 4,      // puntos mínimos de la serie
  serieAnosMin: 3,        // historia mínima que debe cubrir (años)
  serieMesesFrescura: 30, // el último punto no puede ser más viejo que esto
  mesesRecientes: 24,   // "reciente": cohortes de calibración y carry del techo
  // Ventana de la MUESTRA con que se lee el percentil de estado. 8 años, la
  // misma ventana de gemelas: un conjunto chico rota lento (27 casas venden ~1
  // al año) y con 24 meses quedaban 3 ventas — de las que no se puede leer un
  // percentil (el p32 cae entre la 1ª y la 2ª) y dejan la confianza en "Baja".
  // Con 8 años la muestra es de 9 ventas y la confianza sube a "Alta".
  // Con el ajuste por índice REAL cada venta entra en moneda de hoy — la de
  // 2018 sube lo que el mercado subió desde 2018, la de 2025 baja si el
  // mercado bajó desde entonces — así que la ventana larga solo agrega masa
  // estadística, no sesgo. Quien controla el nivel es el ajuste por fecha.
  mesesPercentil: 96,
  anosMinCalibrar: 1.5, // separación mínima entre cohortes para leer una tasa
  minPorCohorte: 2,     // ventas mínimas a cada lado para calibrar con el conjunto
  // FIX 14-oct (caso Refugios del Arrayán PC 3, ROL 15-3044-4): la casa PC-80
  // se vendió en 23.989 UF (feb-25) y en 16.123 UF (dic-25): -33% en 10 meses.
  // Una de las dos no es de mercado (derechos, relacionados) y con 4 gemelas
  // arrastraba la tasación a 16.914 UF, bajo el avalúo fiscal.
  reventaMeses: 18,     // misma unidad vendida dos veces dentro de esta ventana...
  reventaDifMax: 0.25,  // ...con más de 25% de diferencia: se descarta la sospechosa
  // Con pocas gemelas el p32 cae entre las dos más bajas: se usa la mediana.
  minParaPercentil: 6,
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

// Mes 'YYYY-MM' a tiempo numérico en años (mitad del mes) para interpolar.
function tNum(ym) {
  const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''))
  if (!m) return null
  return parseInt(m[1], 10) + (parseInt(m[2], 10) - 0.5) / 12
}

// Factor para llevar un UF/m² desde su fecha hasta hoy con la VARIACIÓN REAL
// DEL MERCADO del período: nivel actual del índice dividido por el nivel a la
// fecha de la venta (interpolado entre puntos). Si el mercado subió 3% desde
// la venta, la venta sube 3%; si bajó 1%, baja 1%. NO lleva tope de tasa
// anual: el tope ES la realidad del índice. La única guarda son los topes
// absolutos factorMin/factorMax (0,7–1,6): un índice roto no puede duplicar ni
// demoler una tasación. La responsabilidad de que la serie sea del MISMO TIPO
// (nunca la mezcla de tipologías que marcaba 13,5% anual) es de quien la pasa:
// /api/tasar la construye con construirSerieMercado sobre ventas reales.
// Sin serie utilizable devuelve 1: mejor no ajustar que ajustar con ruido.
// Una venta anterior al inicio de la serie usa el primer punto (subajusta,
// nunca inventa plusvalía); una posterior al último punto no se ajusta.
export function factorFecha(fecha, serie, hoy = null) {
  const pts = (serie || [])
    .filter((p) => p && p.uf_m2 > 0 && p.trimestre)
    .map((p) => ({ t: tNum(p.trimestre), uf_m2: p.uf_m2 }))
    .filter((p) => p.t != null)
    .sort((a, b) => a.t - b.t)
  if (pts.length < 2) return 1
  const t = tNum(mesDe(fecha))
  if (t == null) return 1
  // Nivel del índice a un instante t, interpolando linealmente entre puntos y
  // sin extrapolar fuera de la serie.
  const nivel = (tt) => {
    if (tt <= pts[0].t) return pts[0].uf_m2
    const ult = pts[pts.length - 1]
    if (tt >= ult.t) return ult.uf_m2
    for (let i = 1; i < pts.length; i++) {
      if (tt <= pts[i].t) {
        const a = pts[i - 1], b = pts[i]
        return a.uf_m2 + (b.uf_m2 - a.uf_m2) * ((tt - a.t) / (b.t - a.t))
      }
    }
    return ult.uf_m2
  }
  const nivelHoy = pts[pts.length - 1].uf_m2
  const nivelEntonces = nivel(t)
  if (!(nivelEntonces > 0) || !(nivelHoy > 0)) return 1
  return Math.min(CONJUNTO.factorMax, Math.max(CONJUNTO.factorMin, nivelHoy / nivelEntonces))
}

// ── SERIE DE MERCADO DEL MISMO TIPO ─────────────────────────────────────────
// Construye, desde ventas REALES ya filtradas al tipo objetivo, la serie que
// alimenta factorFecha: un punto por año con la MEDIANA de UF/m² (la mediana
// anual es el suavizado: robusta a outliers y a la mezcla de estados), fechado
// en la fecha mediana de sus ventas. Es "lo que realmente dio el mercado" del
// sector para ese tipo, en ambas direcciones. Devuelve null si el material no
// alcanza para leer una trayectoria (pocos puntos, poca historia o el último
// punto vencido): en ese caso manda el respaldo (tasa implícita del conjunto).
export function construirSerieMercado({ ventas, hoy = null }) {
  const vistas = new Set()
  const filas = (ventas || [])
    .map((v) => {
      const m2 = parseFloat(v.m2 ?? v.superficie_construccion)
      const uf = parseFloat(v.uf ?? v.precio_uf ?? v.price)
      const fecha = String(v.fecha || v.date_inscripcion || '').slice(0, 10)
      if (!(m2 > 0) || !(uf > 0) || !/^\d{4}-\d{2}/.test(fecha)) return null
      const ufM2 = uf / m2
      if (ufM2 < UFM2_MIN || ufM2 > UFM2_MAX) return null
      const rol = v.rol ?? [v.cod_com, v.cod_mz, v.cod_pr].filter((x) => x != null).join('-')
      const clave = [rol || String(v.direccion_sii || v.direccion || ''), fecha, uf].join('|')
      if (vistas.has(clave)) return null
      vistas.add(clave)
      return { fecha, uf_m2: ufM2 }
    })
    .filter(Boolean)
  const porAno = {}
  for (const f of filas) (porAno[f.fecha.slice(0, 4)] = porAno[f.fecha.slice(0, 4)] || []).push(f)
  const puntos = Object.keys(porAno).sort()
    .map((ano) => {
      let fs = porAno[ano]
      // Outliers DENTRO del año (herencias, ventas entre relacionados): con 3+
      // ventas se descartan las que quedan fuera del 55–180% de la mediana del
      // año; con solo 2, si difieren en más de 1,6x el punto no es confiable.
      if (fs.length >= 3) {
        const medAno = mediana(fs.map((f) => f.uf_m2))
        const limpio = fs.filter((f) => f.uf_m2 >= medAno * 0.55 && f.uf_m2 <= medAno * 1.8)
        if (limpio.length >= CONJUNTO.serieMinPorPunto) fs = limpio
      } else if (fs.length === 2) {
        const [a, b] = fs.map((f) => f.uf_m2).sort((x, y) => x - y)
        if (b / a > 1.6) return null
      }
      if (fs.length < CONJUNTO.serieMinPorPunto) return null
      return {
        trimestre: mesDe(medianaFecha(fs.map((f) => f.fecha))),
        uf_m2: Math.round(mediana(fs.map((f) => f.uf_m2)) * 10) / 10,
        n: fs.length,
      }
    })
    .filter((p) => p && p.trimestre)
  if (puntos.length < CONJUNTO.seriePuntosMin) return null
  const desde = puntos[0].trimestre, hasta = puntos[puntos.length - 1].trimestre
  const span = anosEntre(desde + '-15', hasta + '-15')
  if (!(span >= CONJUNTO.serieAnosMin)) return null
  // Frescura: sin un punto razonablemente actual no hay "nivel de hoy" creíble.
  const edadUltimo = anosEntre(hasta + '-15', hoy)
  if (!(edadUltimo != null && edadUltimo * 12 <= CONJUNTO.serieMesesFrescura)) return null
  const n_ventas = puntos.reduce((a, p) => a + p.n, 0)
  return {
    puntos,
    n_ventas,
    desde,
    hasta,
    variacion_total_pct: Math.round((puntos[puntos.length - 1].uf_m2 / puntos[0].uf_m2 - 1) * 1000) / 10,
  }
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

// ── REVENTAS SOSPECHOSAS ────────────────────────────────────────────────────
// La misma unidad (mismo ROL) vendida dos veces en menos de
// CONJUNTO.reventaMeses con más de CONJUNTO.reventaDifMax de diferencia en
// UF/m²: una de las dos no es de mercado. Se descarta la que más se aleja de la
// mediana del RESTO de las gemelas (sin ese par); si no hay resto, la más baja.
export function descartarReventasSospechosas(gemelas) {
  const lista = gemelas || []
  const porRol = {}
  lista.forEach((g, i) => {
    const rol = String(g.rol || '').trim()
    if (rol) (porRol[rol] = porRol[rol] || []).push(i)
  })
  const fuera = new Set()
  for (const idxs of Object.values(porRol)) {
    if (idxs.length < 2) continue
    const orden = [...idxs].sort((a, b) => (lista[a].fecha < lista[b].fecha ? -1 : 1))
    for (let k = 1; k < orden.length; k++) {
      const a = orden[k - 1], b = orden[k]
      if (fuera.has(a) || fuera.has(b)) continue
      const ga = lista[a], gb = lista[b]
      const meses = anosEntre(ga.fecha, gb.fecha) * 12
      if (!(meses >= 0) || meses > CONJUNTO.reventaMeses) continue
      const hi = Math.max(ga.uf_m2, gb.uf_m2), lo = Math.min(ga.uf_m2, gb.uf_m2)
      if (!(hi > 0) || (hi - lo) / hi <= CONJUNTO.reventaDifMax) continue
      const resto = lista.filter((_, i) => i !== a && i !== b && !fuera.has(i)).map((g) => g.uf_m2).filter((x) => x > 0)
      let malo
      if (resto.length) {
        const ref = mediana(resto)
        malo = Math.abs(Math.log(ga.uf_m2 / ref)) >= Math.abs(Math.log(gb.uf_m2 / ref)) ? a : b
      } else {
        malo = ga.uf_m2 <= gb.uf_m2 ? a : b
      }
      fuera.add(malo)
    }
  }
  const limpias = [], descartadas = []
  lista.forEach((g, i) => (fuera.has(i)
    ? descartadas.push({ ...g, motivo: 'reventa' })
    : limpias.push(g)))
  return { limpias, descartadas }
}

// Descarta las que no son de mercado: primero las reventas sospechosas (misma
// unidad, <18 meses, >25% de diferencia) y luego las que caen bajo el 60% o
// sobre el 140% de la mediana del propio conjunto. Devuelve las descartadas
// (con `motivo`) para poder explicarlas.
export function sinOutliersConjunto(gemelas) {
  const rev = descartarReventasSospechosas(gemelas)
  const base = rev.limpias.length >= CONJUNTO.minVentas ? rev : { limpias: gemelas || [], descartadas: [] }
  const vals = base.limpias.map((g) => g.uf_m2).filter((x) => x > 0)
  if (vals.length < 3) return base
  const med = mediana(vals)
  if (!(med > 0)) return base
  const lo = med * CONJUNTO.outlierMin, hi = med * CONJUNTO.outlierMax
  const limpias = [], descartadas = []
  for (const g of base.limpias) (g.uf_m2 >= lo && g.uf_m2 <= hi ? limpias : descartadas).push(g)
  return limpias.length >= CONJUNTO.minVentas
    ? { limpias, descartadas: [...base.descartadas, ...descartadas.map((g) => ({ ...g, motivo: 'atipica' }))] }
    : base
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

// ¿La serie sirve para ajustar? (al menos dos puntos válidos)
export function serieUtilizable(serie) {
  return (serie || []).filter((p) => p && p.uf_m2 > 0 && p.trimestre).length >= 2
}

// Gemelas con su UF/m² llevado a hoy. Prioridad del ajuste por fecha:
//   1º la VARIACIÓN REAL DEL MERCADO del período (serieIndice: índice del
//      sector del MISMO TIPO, construido con construirSerieMercado) — sube o
//      baja según lo que el mercado efectivamente hizo, sin tasa fija;
//   2º respaldo: la apreciación implícita del PROPIO conjunto (si calibra);
//   3º sin material: no se ajusta (factor 1).
// `tasaConjunto` permite inyectar la tasa ya calculada (o null para anularla);
// si no se pasa, se calcula aquí.
export function gemelasAjustadas({ ventas, m2Objetivo, serieIndice, meses, hoy, tasaConjunto }) {
  const { limpias, descartadas } = sinOutliersConjunto(ventasGemelas({ ventas, m2Objetivo, meses, hoy }))
  // La calibración se hace SIEMPRE sobre la ventana completa: llamadas con una
  // ventana corta (la regla de coherencia usa 24 meses) no tienen ventas
  // antiguas con que calibrar y no deben perder la tasa por eso.
  const cal = tasaConjunto === undefined
    ? tasaApreciacionConjunto({ ventas, m2Objetivo, hoy })
    : (tasaConjunto == null ? null : tasaConjunto)
  const conIndice = serieUtilizable(serieIndice)
  return {
    tasa_conjunto: cal,
    fuente_ajuste: conIndice ? 'indice_mercado' : cal ? 'tasa_conjunto' : 'sin_ajuste',
    ajustadas: limpias.map((g) => {
      const f = conIndice
        ? factorFecha(g.fecha, serieIndice, hoy)
        : cal ? factorPorTasa(g.fecha, cal.tasa, hoy) : 1
      return {
        ...g,
        factor_fecha: Math.round(f * 1000) / 1000,
        ajuste_pct: Math.round((f - 1) * 1000) / 10,
        uf_m2_ajustado: g.uf_m2 * f,
      }
    }),
    descartadas,
  }
}

// Rango [min, max] en UF de unidades IDÉNTICAS de los últimos `meses`. Es la
// regla de coherencia: el valor final no puede quedar fuera.
//
// Se construye sobre precios NOMINALES (lo que realmente se pagó, normalizado a
// los m² del objetivo) llevados a hoy con la VARIACIÓN REAL del mercado del
// período (mismo índice del mismo tipo que usa el ajuste por fecha): si el
// mercado bajó desde la venta, el techo baja con él; si subió, sube lo que
// subió. Nunca con un índice de tipologías mezcladas — eso convertía la regla
// que debía contener la tasación en la que la empujaba hacia arriba (el techo
// del caso V. del Monasterio pasaba de 18.400 UF a ~21.000 UF). Como respaldo,
// sin serie utilizable, el carry usa la tasa implícita del conjunto o el tope.
export function rangoUnidadesIdenticas({ ventas, m2Objetivo, meses = CONJUNTO.mesesCoherencia, hoy, tasaConjunto, serieIndice }) {
  if (!(m2Objetivo > 0)) return null
  const { limpias } = sinOutliersConjunto(ventasGemelas({ ventas, m2Objetivo, meses, hoy }))
  if (limpias.length < CONJUNTO.minCoherencia) return null
  const conIndice = serieUtilizable(serieIndice)
  const cal = tasaConjunto === undefined
    ? tasaApreciacionConjunto({ ventas, m2Objetivo, hoy })
    : (tasaConjunto == null ? null : tasaConjunto)
  // Respaldo sin serie ni tasa propia: el tope (5% anual), el carry más
  // permisivo posible, para que la regla acote sin estrangular.
  const cap = CONJUNTO.apreciacionMaxAnual
  const tasa = cal ? Math.min(cap, Math.max(-cap, cal.tasa)) : cap
  const factorDe = (g) => conIndice
    ? factorFecha(g.fecha, serieIndice, hoy)
    : factorPorTasa(g.fecha, tasa, hoy)
  const ufs = limpias
    .map((g) => g.uf_m2 * m2Objetivo * factorDe(g))
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
    carry_pct: conIndice ? null : Math.round(tasa * 1000) / 10,
    carry_fuente: conIndice
      ? 'variación real del mercado del período (índice del sector, mismo tipo)'
      : cal ? cal.fuente : 'tope de ' + Math.round(cap * 100) + '% anual (sin ventas propias para calibrar)',
    carry_desc: conIndice
      ? 'la variación real del mercado desde cada venta'
      : `carry de ${Math.round(tasa * 1000) / 10}% anual (${cal ? cal.fuente : 'tope sin calibración'})`,
    n: ufs.length,
    meses,
  }
}

// Valor por comparación directa con las gemelas. null si no alcanzan.
//
// El percentil de ESTADO se lee sobre la muestra de CONJUNTO.mesesPercentil
// (8 años): en un conjunto chico las ventas de 24 meses se cuentan con los
// dedos de una mano y de tres puntos no sale un percentil. Las ventas ya vienen
// llevadas a hoy con la variación real del mercado del período (o el respaldo),
// así que las antiguas entran en moneda de hoy, no a su precio de entonces.
export function valorComparativoDirecto({ ventas, m2Objetivo, serieIndice, hoy, meses, pctl = PCTL_BASE }) {
  if (!(m2Objetivo > 0)) return null
  const { ajustadas, descartadas, tasa_conjunto, fuente_ajuste } = gemelasAjustadas({ ventas, m2Objetivo, serieIndice, hoy, meses })
  if (ajustadas.length < CONJUNTO.minVentas) return null
  const mesesPctl = CONJUNTO.mesesPercentil
  const corte = corteMeses(hoy, mesesPctl)
  const enVentana = ajustadas.filter((g) => g.fecha >= corte)
  // Si la ventana del percentil recorta la muestra por debajo del mínimo, se
  // usan todas las gemelas: quedarse sin comparables es peor que estirar años.
  const pool = enVentana.length >= CONJUNTO.minVentas ? enVentana : ajustadas
  const lista = pool.map((g) => g.uf_m2_ajustado)
  // FIX 14-oct: con menos de CONJUNTO.minParaPercentil gemelas el percentil de
  // estado no es legible (el p32 cae entre las dos más bajas): manda la mediana.
  if (lista.length < CONJUNTO.minParaPercentil) pctl = 50
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
    ventana_percentil_meses: pool.length === ajustadas.length ? (meses || CONJUNTO.mesesMax) : mesesPctl,
    muestra_recortada: pool.length !== ajustadas.length,
    tasa_conjunto: tasa_conjunto || null,
    fuente_ajuste,
    ajuste_min_pct: pool.length ? Math.min(...pool.map((g) => g.ajuste_pct)) : 0,
    ajuste_max_pct: pool.length ? Math.max(...pool.map((g) => g.ajuste_pct)) : 0,
    n_descartadas: descartadas.length,
    n_descartadas_reventa: descartadas.filter((g) => g.motivo === 'reventa').length,
    descartadas,
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

// ═══════════════════════════════════════════════════════════════════════════
// PLUSVALÍA 12 MESES ROBUSTA (FIX 14-oct)
// ═══════════════════════════════════════════════════════════════════════════
// Antes se comparaba el último punto de la serie con "el punto 12 posiciones
// atrás", suponiendo un dato por mes. En El Arrayán la serie tenía 6 puntos
// sueltos (oct-24…dic-25), así que comparó dic-25 (56 UF/m²) con el PRIMER
// punto, oct-24 (34 UF/m², UNA venta): +64,7% "en 12 meses" — falso, y además
// con el último dato 10 meses vencido. Reglas:
//  · fechas reales, no posiciones: el punto de comparación debe estar entre
//    9 y 15 meses antes del último (el más cercano a 12);
//  · ≥3 ventas en cada punto;
//  · el último punto no puede tener más de 6 meses respecto de hoy;
//  · si el resultado supera ±25% no es creíble en un año: no se muestra.
export const PLUSVALIA = { minN: 3, frescuraMeses: 6, ventanaMin: 9, ventanaMax: 15, topeAbs: 25 }

const mesesEntre = (a, b) => anosEntre(a, b) * 12

// serie: [{ trimestre|fecha: 'YYYY-MM[-DD]', uf_m2, n }]
export function plusvaliaSerie(serie, hoy = null) {
  const pts = (serie || [])
    .map((p) => ({ f: String(p.fecha || p.trimestre || '').slice(0, 10), uf_m2: parseFloat(p.uf_m2), n: parseInt(p.n) || 0 }))
    .filter((p) => /^\d{4}-\d{2}/.test(p.f) && p.uf_m2 > 0 && p.n >= PLUSVALIA.minN)
    .sort((a, b) => (a.f < b.f ? -1 : 1))
  if (pts.length < 2) return null
  const ult = pts[pts.length - 1]
  const hoyStr = hoy || new Date().toISOString().slice(0, 10)
  if (mesesEntre(ult.f, hoyStr) > PLUSVALIA.frescuraMeses) return null
  let mejor = null
  for (const p of pts.slice(0, -1)) {
    const m = mesesEntre(p.f, ult.f)
    if (m < PLUSVALIA.ventanaMin || m > PLUSVALIA.ventanaMax) continue
    if (!mejor || Math.abs(m - 12) < Math.abs(mesesEntre(mejor.f, ult.f) - 12)) mejor = p
  }
  if (!mejor) return null
  const pct = Math.round((ult.uf_m2 / mejor.uf_m2 - 1) * 1000) / 10
  if (!isFinite(pct) || Math.abs(pct) > PLUSVALIA.topeAbs) return null
  return pct
}

// ventas: [{ f: 'YYYY-MM-DD', r: UF/m² }] — mediana de los últimos 12 meses
// contra la de los 12 anteriores, con las mismas reglas de n, frescura y tope.
export function plusvaliaVentas(ventas, hoy = null) {
  const hoyD = hoy ? new Date(hoy + 'T00:00:00Z') : new Date()
  const iso = (d) => d.toISOString().slice(0, 10)
  const d12 = new Date(hoyD); d12.setUTCFullYear(hoyD.getUTCFullYear() - 1)
  const d24 = new Date(hoyD); d24.setUTCFullYear(hoyD.getUTCFullYear() - 2)
  const vs = (ventas || []).filter((x) => x && x.r > 0 && /^\d{4}-\d{2}-\d{2}$/.test(x.f))
  const s12 = vs.filter((x) => x.f >= iso(d12))
  const s24 = vs.filter((x) => x.f >= iso(d24) && x.f < iso(d12))
  if (s12.length < PLUSVALIA.minN || s24.length < PLUSVALIA.minN) return null
  const ultima = s12.map((x) => x.f).sort().pop()
  if (mesesEntre(ultima, iso(hoyD)) > PLUSVALIA.frescuraMeses) return null
  const pct = Math.round((mediana(s12.map((x) => x.r)) / mediana(s24.map((x) => x.r)) - 1) * 1000) / 10
  if (!isFinite(pct) || Math.abs(pct) > PLUSVALIA.topeAbs) return null
  return pct
}

// ¿La plusvalía del sector contradice el índice con que se ajustaron las
// ventas por fecha? (distinto signo con magnitud relevante, o >10 pp de
// diferencia). Si contradice, no se publica ni se narra.
export function plusvaliaContradiceIndice(plusPct, serieIndice, hoy = null) {
  if (plusPct == null || !serieUtilizable(serieIndice)) return false
  const hoyD = hoy ? new Date(hoy + 'T00:00:00Z') : new Date()
  const hace12 = new Date(hoyD); hace12.setUTCFullYear(hoyD.getUTCFullYear() - 1)
  const f = factorFecha(hace12.toISOString().slice(0, 10), serieIndice, hoy)
  if (!(f > 0)) return false
  const idxPct = (f - 1) * 100
  const signoOpuesto = Math.sign(idxPct) !== Math.sign(plusPct) && Math.abs(plusPct) >= 3 && Math.abs(idxPct) >= 1
  return signoOpuesto || Math.abs(plusPct - idxPct) > 10
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTROL CONTRA AVALÚO FISCAL (FIX 14-oct)
// ═══════════════════════════════════════════════════════════════════════════
// Valor comercial < 1,0× o > 2,0× el avalúo fiscal: la tasación se marca
// "revisar" y la confianza baja un escalón. No se corrige el valor: se avisa.
export const AVALUO = { min: 1.0, max: 2.0 }

// FIX 15-oct: en comunas premium el avalúo fiscal subvalora mucho el suelo; una
// casa antigua donde el terreno es el 80% del valor se transa normalmente a
// 2,2–2,6 veces el avalúo. El tope de 2,0 marcaba "revisar" casos sanos.
export const AVALUO_MAX_POR_TIER = { premium: 2.6, alta: 2.3, estandar: 2.0 }

export function controlAvaluoFiscal({ valorUf, avaluoUf, tier }) {
  if (!(valorUf > 0) || !(avaluoUf > 0)) return null
  const ratio = Math.round((valorUf / avaluoUf) * 100) / 100
  const maxR = AVALUO_MAX_POR_TIER[tier] || AVALUO.max
  const fueraRango = ratio < AVALUO.min || ratio > maxR
  const fmt = (x) => String(x).replace('.', ',')
  return {
    ratio,
    revisar: fueraRango,
    mensaje: !fueraRango ? null
      : ratio < AVALUO.min
        ? `El valor estimado queda bajo el avalúo fiscal (${fmt(ratio)} veces). Es poco habitual: revisar comparables antes de usarlo.`
        : `El valor estimado supera ${fmt(maxR)} veces el avalúo fiscal (${fmt(ratio)} veces). Revisar comparables antes de usarlo.`,
  }
}

export function bajarConfianza(c) {
  return c === 'Alta' ? 'Media' : 'Baja'
}

// ── CONTROL POR RENTABILIDAD DE ARRIENDO (FIX 30-oct) ───────────────────────
// Rentabilidad bruta anual típica por tipo (arriendo × 12 / valor). Fuera del
// rango, el valor merece revisión: por debajo del mínimo suele estar tasado
// alto (o el arriendo de referencia es bajo); por sobre el máximo, tasado bajo.
export const RENTABILIDAD_TIPICA = {
  casa:         { min: 2.5, max: 7.0 },
  departamento: { min: 3.5, max: 9.0 },
  oficina:      { min: 4.0, max: 10.0 },
  comercial:    { min: 4.0, max: 10.0 },
}
export function controlRentabilidad({ valorUf, arriendoUfMes, tipo }) {
  if (!(valorUf > 0) || !(arriendoUfMes > 0)) return null
  const rango = RENTABILIDAD_TIPICA[tipo] || RENTABILIDAD_TIPICA.casa
  const pct = Math.round(((arriendoUfMes * 12) / valorUf) * 1000) / 10
  const bajo = pct < rango.min, alto = pct > rango.max
  const fmt = (x) => String(x).replace('.', ',')
  const implicito = (r) => Math.round((arriendoUfMes * 12) / (r / 100)).toLocaleString('es-CL')
  return {
    rentabilidad_pct: pct,
    rango,
    valor_implicito_min_uf: Math.round((arriendoUfMes * 12) / (rango.max / 100)),
    valor_implicito_max_uf: Math.round((arriendoUfMes * 12) / (rango.min / 100)),
    revisar: bajo || alto,
    mensaje: !(bajo || alto) ? null
      : bajo
        ? `La rentabilidad por arriendo (${fmt(pct)}% bruto anual con ${fmt(arriendoUfMes)} UF/mes) queda bajo el ${fmt(rango.min)}% típico de este tipo: el valor podría estar alto (por renta, el valor sería ≤ ${implicito(rango.min)} UF). Revisar comparables antes de usarlo.`
        : `La rentabilidad por arriendo (${fmt(pct)}% bruto anual) supera el ${fmt(rango.max)}% típico: el valor podría estar bajo (por renta, ≥ ${implicito(rango.max)} UF). Revisar comparables antes de usarlo.`,
  }
}
