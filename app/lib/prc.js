// app/lib/prc.js
// Módulo COMPARTIDO de Plan Regulador (PRC) — lo usan Isidora (/api/zona) y Valentina (/api/tasar).
//
// Dado un punto (lng, lat WGS84) y la comuna, devuelve la ZONA del plan regulador y su
// normativa (predial mínimo, densidad, constructibilidad, etc.).
//
// IMPORTANTE — POR QUÉ LEE POR HTTP Y NO CON fs:
//   En Vercel/Next.js las funciones serverless NO incluyen la carpeta public/ en su bundle,
//   así que fs.readFile('public/...') falla en runtime. Los archivos SÍ se sirven por la CDN
//   (public/data/x → /data/x). Por eso este módulo los descarga por HTTP usando el origin de
//   la request (baseUrl). En local sin baseUrl, cae a fs como respaldo.
//
// Archivos (versionados, refresco ~2x/año):
//   - Zonas:     public/data/prc/zonas/<slug>.geojson   (legacy: public/data/prc_las_condes.geojson)
//                cada feature: properties.ZONA y properties.NOMBRE
//   - Números:   public/data/prc/normativa.json
//
// Devuelve null si la comuna no tiene archivo de zonas o el punto no cae en ninguna zona.

export function nfd(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n').trim()
}
function slugComuna(comuna) {
  return nfd(comuna).replace(/\s+/g, '_')
}

// Rutas HTTP (relativas a la raíz pública) a intentar, en orden.
function urlsZonas(slug) {
  const u = [`/data/prc/zonas/${slug}.geojson`]
  if (slug === 'las_condes') u.push('/data/prc_las_condes.geojson') // legacy
  return u
}

const _cache = {}
async function cargarJSON(baseUrl, rutas) {
  const key = baseUrl + '|' + rutas.join(',')
  if (key in _cache) return _cache[key]
  let data = null
  for (const ruta of rutas) {
    // 1) HTTP (serverless / producción)
    if (baseUrl) {
      try {
        const r = await fetch(baseUrl + ruta)
        if (r.ok) { data = await r.json(); break }
      } catch (e) {}
    }
    // 2) fs (respaldo local)
    try {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const txt = await fs.readFile(path.join(process.cwd(), 'public', ruta.replace(/^\//, '')), 'utf8')
      data = JSON.parse(txt); break
    } catch (e) {}
  }
  _cache[key] = data
  return data
}

// ── Punto-en-polígono (ray casting), Polygon y MultiPolygon con huecos ─────────
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
function puntoEnGeometria(lng, lat, geom) {
  if (!geom) return false
  const polys = geom.type === 'Polygon' ? [geom.coordinates]
    : geom.type === 'MultiPolygon' ? geom.coordinates : null
  if (!polys) return false
  for (const poly of polys) {
    if (!poly.length || !puntoEnAnillo(lng, lat, poly[0])) continue
    let enHueco = false
    for (let r = 1; r < poly.length; r++) { if (puntoEnAnillo(lng, lat, poly[r])) { enHueco = true; break } }
    if (!enHueco) return true
  }
  return false
}

// ── Heurística por código de zona (fallback si no hay número en la Ordenanza) ──
const PREDIAL_HEUR = {
  baja:  { 1: 500, 2: 650, 3: 800, 4: 1000, def: 700 },
  media: { 1: 300, 2: 375, 3: 450, 4: 600,  def: 400 },
  alta:  { 1: 160, 2: 200, 3: 250, 4: 350,  def: 200 },
}
const CLASE_LETRA = { a: 'alta', m: 'media', b: 'baja' }
function desdeCodigo(zona) {
  const m = String(zona || '').match(/EA([abm])\s*([0-9])?/i)
  if (!m) return { densidad: null, predial_min: null }
  const densidad = CLASE_LETRA[m[1].toLowerCase()]
  const nivel = m[2] ? parseInt(m[2], 10) : null
  const t = PREDIAL_HEUR[densidad]
  return { densidad, predial_min: (nivel && t[nivel] != null) ? t[nivel] : t.def }
}

// ── API pública ───────────────────────────────────────────────────────────────
// normativaEnPunto(lng, lat, comuna, baseUrl) → { zona, nombre, densidad, predial_min,
//   constructibilidad, altura, uso, fuente, clase, predial_min_aprox } | null
// baseUrl: origin de la request (ej. https://ia-prop.vercel.app). Sin él intenta fs (local).
export async function normativaEnPunto(lng, lat, comuna, baseUrl = '') {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !comuna) return null
  const gj = await cargarJSON(baseUrl, urlsZonas(slugComuna(comuna)))
  if (!gj || !Array.isArray(gj.features)) return null // comuna sin datos de PRC

  let zona = null, nombre = null
  for (const f of gj.features) {
    if (puntoEnGeometria(lng, lat, f.geometry)) {
      const p = f.properties || {}
      zona = p.ZONA || p.zona || null
      nombre = p.NOMBRE || p.nombre || null
      break
    }
  }
  if (!zona) return null

  const norm = (await cargarJSON(baseUrl, ['/data/prc/normativa.json'])) || {}
  const comunaKey = String(comuna || '').toUpperCase()
  const comunaData = norm[comunaKey] || {}
  // 1) override por código de zona completo, 2) por tipo de edificación (parte "EA…"
  //    del código, ej. "UV/EAb1" → "EAb1"), 3) heurística.
  let oficial = (comunaData.zonas && comunaData.zonas[zona]) || null
  if (!oficial && comunaData.por_edificacion) {
    const eaPart = String(zona).split('/').map((s) => s.trim()).find((s) => /^EA/i.test(s))
    if (eaPart && comunaData.por_edificacion[eaPart]) oficial = comunaData.por_edificacion[eaPart]
  }
  const heur = desdeCodigo(zona)

  const predial_min = (oficial && oficial.predial_min != null) ? oficial.predial_min : heur.predial_min
  const densidad = (oficial && oficial.densidad) ? oficial.densidad : heur.densidad
  const fuente = oficial ? 'ordenanza' : 'heuristica_codigo'

  return {
    zona,
    nombre,
    densidad,
    predial_min,
    constructibilidad: oficial ? (oficial.constructibilidad ?? null) : null,
    altura: oficial ? (oficial.altura ?? null) : null,
    uso: oficial ? (oficial.uso ?? null) : null,
    fuente,
    clase: densidad,                 // compat page.jsx
    predial_min_aprox: predial_min,  // compat page.jsx
  }
}
