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
  if (slug === 'lo_barnechea') u.push('/data/prc/zonas/lobarnechea.geojson') // nombre alt
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

// ── Comunas cuya zona se consulta a una capa ArcGIS pública por punto (sin GeoJSON local) ─
//   Vitacura → capa propia (zona combina uso/edificación "U-V/E-Am5").
//   Resto RM → capas oficiales MINVU IPT (campo ZONA). El predial por zona se completa
//   en normativa.json comuna por comuna; mientras no esté, se devuelve la zona sin predial.
//   (Las Condes y Lo Barnechea usan GeoJSON local detallado, no van acá.)
function minvuLayer(svc, id) {
  return { url: `https://geoide.minvu.cl/server/rest/services/IPT/${svc}/MapServer/${id}/query`, field: 'ZONA' }
}
const _N = 'PRC_RM_Norte', _S = 'PRC_RM_Sur'
const ARCGIS_ZONA = {
  vitacura: { url: 'https://services9.arcgis.com/kKJR3Qt68ohAWuet/arcgis/rest/services/PRC_Vitacura/FeatureServer/0/query', field: 'zona' },
  // RM Norte
  nunoa: minvuLayer(_N, 17), colina: minvuLayer(_N, 2), cerro_navia: minvuLayer(_N, 4),
  conchali: minvuLayer(_N, 5), curacavi: minvuLayer(_N, 6), estacion_central: minvuLayer(_N, 7),
  huechuraba: minvuLayer(_N, 8), independencia: minvuLayer(_N, 9), la_reina: minvuLayer(_N, 10),
  lo_prado: minvuLayer(_N, 15), pudahuel: minvuLayer(_N, 19), providencia: minvuLayer(_N, 21),
  quilicura: minvuLayer(_N, 22), quinta_normal: minvuLayer(_N, 23), recoleta: minvuLayer(_N, 24),
  renca: minvuLayer(_N, 29), santiago: minvuLayer(_N, 31),
  // RM Sur
  san_ramon: minvuLayer(_S, 0), cerrillos: minvuLayer(_S, 1), el_bosque: minvuLayer(_S, 2),
  isla_de_maipo: minvuLayer(_S, 3), la_cisterna: minvuLayer(_S, 4), la_florida: minvuLayer(_S, 5),
  la_granja: minvuLayer(_S, 6), la_pintana: minvuLayer(_S, 7), lo_espejo: minvuLayer(_S, 8),
  macul: minvuLayer(_S, 9), maipu: minvuLayer(_S, 10), melipilla: minvuLayer(_S, 11),
  padre_hurtado: minvuLayer(_S, 12), paine: minvuLayer(_S, 13), pedro_aguirre_cerda: minvuLayer(_S, 15),
  penalolen: minvuLayer(_S, 16), penaflor: minvuLayer(_S, 17), pirque: minvuLayer(_S, 18),
  puente_alto: minvuLayer(_S, 20), san_bernardo: minvuLayer(_S, 21), san_miguel: minvuLayer(_S, 23),
  talagante: minvuLayer(_S, 24), san_joaquin: minvuLayer(_S, 26),
}
const _arcgisCache = {}
async function zonaArcGIS(lng, lat, cfg) {
  const key = cfg.url + '|' + lng.toFixed(5) + ',' + lat.toFixed(5)
  if (key in _arcgisCache) return _arcgisCache[key]
  const params = new URLSearchParams({
    geometry: lng + ',' + lat,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: cfg.field,
    returnGeometry: 'false',
    f: 'json',
  })
  let zona = null
  try {
    const r = await fetch(cfg.url + '?' + params.toString())
    if (r.ok) {
      const j = await r.json()
      const a = j.features && j.features[0] && j.features[0].attributes
      if (a) zona = a[cfg.field] || null
    }
  } catch (e) {}
  _arcgisCache[key] = zona
  return zona
}

// ── API pública ───────────────────────────────────────────────────────────────
// normativaEnPunto(lng, lat, comuna, baseUrl) → { zona, nombre, densidad, predial_min,
//   constructibilidad, altura, uso, fuente, clase, predial_min_aprox } | null
// baseUrl: origin de la request (ej. https://ia-prop.vercel.app). Sin él intenta fs (local).
export async function normativaEnPunto(lng, lat, comuna, baseUrl = '') {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !comuna) return null
  const slug = slugComuna(comuna)
  let zona = null, nombre = null
  if (ARCGIS_ZONA[slug]) {
    // Vitacura/Ñuñoa: zona desde la capa oficial ArcGIS en tiempo real (sin archivo local).
    zona = await zonaArcGIS(lng, lat, ARCGIS_ZONA[slug])
    nombre = zona
  } else {
    const gj = await cargarJSON(baseUrl, urlsZonas(slug))
    if (!gj || !Array.isArray(gj.features)) return null // comuna sin datos de PRC
    for (const f of gj.features) {
      if (puntoEnGeometria(lng, lat, f.geometry)) {
        const p = f.properties || {}
        zona = p.ZONA || p.zona || null
        nombre = p.NOMBRE || p.nombre || null
        break
      }
    }
  }
  if (!zona) return null

  const norm = (await cargarJSON(baseUrl, ['/data/prc/normativa.json'])) || {}
  const comunaKey = String(comuna || '').toUpperCase()
  const comunaData = norm[comunaKey] || {}
  // 1) override por código de zona completo, 2) por tipo de edificación (parte "EA…"
  //    del código, ej. "UV/EAb1" o "U-V/E-Ab1" → "EAb1"), 3) heurística.
  let oficial = (comunaData.zonas && comunaData.zonas[zona]) || null
  if (!oficial && comunaData.por_edificacion) {
    // acepta "EAb1" (Las Condes) y "E-Ab1"/"E-Am5" (Vitacura): se normaliza quitando guiones.
    const eaPart = String(zona).split('/').map((s) => s.trim()).find((s) => /^E-?A[abm]/i.test(s))
    if (eaPart) {
      const key = eaPart.replace(/-/g, '')
      if (comunaData.por_edificacion[key]) oficial = comunaData.por_edificacion[key]
    }
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
