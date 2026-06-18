// app/lib/prc.js
// Módulo COMPARTIDO de Plan Regulador (PRC) — lo usan Isidora (/api/zona) y Valentina (/api/tasar).
//
// Dado un punto (lng, lat WGS84) y la comuna, devuelve la ZONA del plan regulador y su
// normativa (predial mínimo, densidad, constructibilidad, etc.).
//
// Fuente de datos (archivos locales, versionados, refresco ~2x/año):
//   - Polígonos de zonas:  public/data/prc/zonas/<slug>.geojson
//        (legacy soportado:  public/data/prc_las_condes.geojson)
//        Cada feature trae la zona en properties.ZONA y el nombre en properties.NOMBRE.
//   - Números de la Ordenanza:  public/data/prc/normativa.json
//        { "LAS CONDES": { "zonas": { "UV/EAb4": { predial_min, densidad, constructibilidad, altura, uso } } } }
//
// Si una zona no está en normativa.json, se deriva un predial aproximado desde el código de
// zona (heurística EAb/EAm/EAa) y se marca fuente='heuristica_codigo'.
//
// Devuelve null si la comuna no tiene archivo de zonas o el punto no cae en ninguna zona.

import fs from 'node:fs/promises'
import path from 'node:path'

export function nfd(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n').trim()
}
function slugComuna(comuna) {
  return nfd(comuna).replace(/\s+/g, '_')
}

function rutasZonas(slug) {
  const base = process.cwd()
  const rutas = [path.join(base, 'public', 'data', 'prc', 'zonas', `${slug}.geojson`)]
  if (slug === 'las_condes') rutas.push(path.join(base, 'public', 'data', 'prc_las_condes.geojson')) // legacy
  return rutas
}

const _zonasCache = {}
async function cargarZonas(slug) {
  if (slug in _zonasCache) return _zonasCache[slug]
  let gj = null
  for (const ruta of rutasZonas(slug)) {
    try { gj = JSON.parse(await fs.readFile(ruta, 'utf8')); break } catch (e) {}
  }
  _zonasCache[slug] = gj
  return gj
}

let _normativaCache
async function cargarNormativa() {
  if (_normativaCache !== undefined) return _normativaCache
  try {
    _normativaCache = JSON.parse(await fs.readFile(path.join(process.cwd(), 'public', 'data', 'prc', 'normativa.json'), 'utf8'))
  } catch (e) { _normativaCache = {} }
  return _normativaCache
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
// EAa = Edificación Aislada Alta densidad (sitios chicos), EAm = Media, EAb = Baja (sitios grandes).
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
// normativaEnPunto(lng, lat, comuna) → { zona, nombre, densidad, predial_min,
//   constructibilidad, altura, uso, fuente, ... } | null
export async function normativaEnPunto(lng, lat, comuna) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !comuna) return null
  const gj = await cargarZonas(slugComuna(comuna))
  if (!gj || !Array.isArray(gj.features)) return null // comuna sin datos de PRC cargados

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

  const norm = await cargarNormativa()
  const comunaKey = String(comuna || '').toUpperCase()
  const oficial = (norm[comunaKey] && norm[comunaKey].zonas && norm[comunaKey].zonas[zona]) || null
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
    // compatibilidad con el frontend actual (page.jsx lee clase / predial_min_aprox):
    clase: densidad,
    predial_min_aprox: predial_min,
  }
}
