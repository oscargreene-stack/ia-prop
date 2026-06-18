// app/lib/prc-lascondes.js
// PILOTO — Normativa real del Plan Regulador Comunal (PRC) de Las Condes.
//
// Qué hace:
//   - Carga las zonas del PRC (GeoJSON con polígonos + atributo ZONA/NOMBRE).
//   - Dado un punto (lng, lat WGS84), devuelve la ZONA real del plan regulador.
//   - Interpreta el código de zona (EAa/EAm/EAb + nivel) para clasificar el sitio
//     en un TIER por normativa (sitios grandes / medios / chicos) y un predial
//     mínimo aproximado.
//
// Por qué: las zonas del PRC dividen la comuna por NORMATIVA (densidad y superficie
// predial mínima). Sitios grandes (baja densidad, ej. Santa María de Manquehue) →
// menor UF/m² de terreno; sitios chicos (alta densidad) → mayor UF/m².
//
// IMPORTANTE sobre los datos:
//   - El GeoJSON de zonas se descarga del Geoportal MINVU (capa "PRC Las Condes")
//     o del ArcGIS de la comuna, y se guarda en public/data/prc_las_condes.geojson.
//     El atributo de zona del PRC es "ZONA" y el nombre "NOMBRE".
//   - El campo ZONA del GIS NO trae la superficie predial mínima; ese número está en
//     la Ordenanza del PRC. La tabla PREDIAL_MIN_APROX de abajo es REFERENCIAL,
//     derivada de la clase de edificación, y debe confirmarse contra la Ordenanza
//     vigente de Las Condes (y con la DOM para casos límite).

// ── Predial mínimo aproximado por CLASE de edificación aislada (m²) ─────────────
// Referencial. La clase la marca el código de zona: EAb = Baja densidad (sitios
// grandes), EAm = Media, EAa = Alta densidad (sitios chicos). El "nivel" (1..4)
// afina dentro de la clase: en "Baja", a mayor número suele exigirse MÁS m².
// >>> CONFIRMAR estos valores con la Ordenanza PRC de Las Condes. <<<
const PREDIAL_MIN_APROX = {
  baja:  { 1: 500, 2: 650, 3: 800, 4: 1000, def: 700 },
  media: { 1: 300, 2: 375, 3: 450, 4: 600,  def: 400 },
  alta:  { 1: 160, 2: 200, 3: 250, 4: 350,  def: 200 },
}
// Mapa clase → tier de tamaño de sitio usado por el análisis de suelo.
const TIER_POR_CLASE = { baja: 'grande', media: 'medio', alta: 'chico' }

// Interpreta un código de zona del PRC de Las Condes (ej. "UV/EAb4", "UV1/EAm1p",
// "UVO/EAa1") → { clase, nivel, tier, predial_min_aprox }.
export function intensidadDeZona(zona) {
  const z = String(zona || '')
  const m = z.match(/EA([abm])\s*([0-9])?/i) // EAa / EAm / EAb + nivel opcional
  if (!m) return { clase: null, nivel: null, tier: null, predial_min_aprox: null }
  const letra = m[1].toLowerCase()
  const clase = letra === 'a' ? 'alta' : letra === 'm' ? 'media' : 'baja'
  const nivel = m[2] ? parseInt(m[2], 10) : null
  const tabla = PREDIAL_MIN_APROX[clase]
  const predial = (nivel && tabla[nivel] != null) ? tabla[nivel] : tabla.def
  return { clase, nivel, tier: TIER_POR_CLASE[clase], predial_min_aprox: predial }
}

// ── Punto-en-polígono (ray casting) sobre un anillo [ [lng,lat], ... ] ─────────
function puntoEnAnillo(lng, lat, ring) {
  let dentro = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    const cruza = (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi
    if (cruza) dentro = !dentro
  }
  return dentro
}

// Soporta geometrías Polygon y MultiPolygon (con anillos exteriores e interiores/huecos).
function puntoEnGeometria(lng, lat, geom) {
  if (!geom) return false
  const polys = geom.type === 'Polygon' ? [geom.coordinates]
    : geom.type === 'MultiPolygon' ? geom.coordinates
    : null
  if (!polys) return false
  for (const poly of polys) {
    if (!poly.length) continue
    if (!puntoEnAnillo(lng, lat, poly[0])) continue // fuera del anillo exterior
    let enHueco = false
    for (let r = 1; r < poly.length; r++) {
      if (puntoEnAnillo(lng, lat, poly[r])) { enHueco = true; break }
    }
    if (!enHueco) return true
  }
  return false
}

// Devuelve la zona del PRC para un punto. `geojson` es el FeatureCollection cargado.
// Retorna { zona, nombre, ...intensidad } o null si el punto no cae en ninguna zona.
export function zonaEnPunto(geojson, lng, lat) {
  if (!geojson || !Array.isArray(geojson.features)) return null
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  for (const f of geojson.features) {
    if (puntoEnGeometria(lng, lat, f.geometry)) {
      const p = f.properties || {}
      const zona = p.ZONA || p.zona || null
      const nombre = p.NOMBRE || p.nombre || null
      return { zona, nombre, ...intensidadDeZona(zona) }
    }
  }
  return null
}

// Carga perezosa del GeoJSON desde public/data (solo Node runtime). Cachea en módulo.
// Si el archivo no existe, retorna null y el llamador usa el modelo por tamaño de sitio.
let _cache = undefined
export async function cargarPRCLasCondes() {
  if (_cache !== undefined) return _cache
  try {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const file = path.join(process.cwd(), 'public', 'data', 'prc_las_condes.geojson')
    const txt = await fs.readFile(file, 'utf8')
    _cache = JSON.parse(txt)
  } catch (e) {
    _cache = null
  }
  return _cache
}

export const PRC_META = { comuna: 'LAS CONDES', PREDIAL_MIN_APROX, TIER_POR_CLASE }
