// app/api/zona/route.js
// Precio real de un SECTOR para el comprador (agente Isidora), SEPARANDO casa vs depto.
// Acepta el sector de 3 formas: (a) comuna/direccion -> geocodifica, (b) lat/lng,
// (c) polygon dibujado en el mapa ([{lat,lng}, ...], min 3 puntos).
// Flujo: ventas reales del CBR dentro del area (fuente "ventas") -> clasifica casa/depto
//        por copropiedad + superficie de terreno -> mediana UF/m2 SOLO del tipo pedido.
// IMPORTANTE: nunca se mezclan casas y departamentos en la misma mediana.
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const API_BASE = 'https://datainmobiliaria.cl/api/v1'
const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN
const GKEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY

async function geocode(texto) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(texto + ', Región Metropolitana, Chile')}&key=${GKEY}`
  const r = await fetch(url)
  const j = await r.json()
  if (j.status !== 'OK' || !j.results || !j.results.length) return null
  const loc = j.results[0].geometry.location
  return { lat: loc.lat, lng: loc.lng, status: j.status }
}

// Poligono cuadrado de ~radioM metros alrededor de {lat,lng}
function poligono(lat, lng, radioM) {
  const dLat = radioM / 111320
  const dLng = radioM / (111320 * Math.cos((lat * Math.PI) / 180))
  return [
    { lat: lat + dLat, lng: lng - dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng - dLng },
  ]
}

function centroide(poly) {
  const n = poly.length
  let lat = 0, lng = 0
  for (const p of poly) { lat += p.lat; lng += p.lng }
  return { lat: lat / n, lng: lng / n }
}

function mediana(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function percentil(arr, p) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))
  return s[idx]
}

// Clasifica una venta del CBR en casa / departamento / oficina / comercial / otro
function clasificaTipo(v) {
  const dest = String(v.cod_destino || '').toUpperCase()
  if (dest === 'O') return 'oficina'
  if (dest === 'C') return 'comercial'
  if (dest !== 'H') return 'otro'
  const terreno = parseFloat(v.superficie_total_terreno || 0) || 0
  return terreno > 0 ? 'casa' : 'departamento'
}

const TIPO_OBJETIVO = {
  casa: 'casa',
  departamento: 'departamento',
  depto: 'departamento',
  oficina: 'oficina',
  comercial: 'comercial',
}

export async function POST(request) {
  const dbg = new URL(request.url).searchParams.get('debug') ? {} : null
  try {
    const body = await request.json()
    const { direccion, comuna, lat, lng, polygon, tipo, presupuesto_uf, m2_objetivo } = body || {}
    if (!DATAINM_TOKEN) return Response.json({ error: 'DATAINMOBILIARIA_TOKEN no configurada' }, { status: 500 })

    // Sector: polygon dibujado / lat-lng / geocode de comuna-direccion
    const userPoly =
      Array.isArray(polygon) && polygon.length >= 3
        ? polygon.map((p) => ({ lat: +p.lat, lng: +p.lng })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        : null

    let punto = null
    if (userPoly && userPoly.length >= 3) {
      punto = centroide(userPoly)
      if (dbg) dbg.fuente_sector = 'polygon'
    } else if (lat && lng) {
      punto = { lat: +lat, lng: +lng }
      if (dbg) dbg.fuente_sector = 'latlng'
    } else {
      const texto = [direccion, comuna].filter(Boolean).join(', ')
      if (!texto) return Response.json({ error: 'Falta comuna/direccion, lat/lng o polygon' }, { status: 400 })
      punto = await geocode(texto)
      if (dbg) { dbg.fuente_sector = 'geocode'; dbg.geocode = punto }
      if (!punto) return Response.json({ _modo: 'sin_geocode', mensaje: 'No pude ubicar el sector.', ...(dbg ? { _debug: dbg } : {}) })
    }

    const objetivo = TIPO_OBJETIVO[String(tipo || '').toLowerCase()] || 'casa'
    const m2obj = parseFloat(m2_objetivo) || 0

    // Lista de poligonos a consultar: el dibujado (tal cual) o cuadrados expansivos
    const polys = userPoly ? [userPoly] : [poligono(punto.lat, punto.lng, 800), poligono(punto.lat, punto.lng, 1600)]

    let ventas = []
    let paginasUsadas = 0
    for (const poly of polys) {
      let acc = []
      for (let page = 1; page <= 3; page++) {
        const r = await fetch(`${API_BASE}/busqueda_poligono`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DATAINM_TOKEN },
          body: JSON.stringify({ fuente: 'ventas', polygon: poly, page }),
        })
        paginasUsadas++
        if (!r.ok) break
        const j = await r.json()
        const arr = Array.isArray(j.resultados) ? j.resultados : []
        acc = acc.concat(arr)
        const delTipo = acc.filter((v) => clasificaTipo(v) === objetivo).length
        if (delTipo >= 15 || !j.has_more) break
      }
      ventas = acc
      const delTipo = ventas.filter((v) => clasificaTipo(v) === objetivo).length
      if (delTipo >= 12) break
    }

    const filtradas = ventas.filter((v) => {
      if (clasificaTipo(v) !== objetivo) return false
      if (String(v.unit || '').toUpperCase() !== 'UF') return false
      const m2 = parseFloat(v.superficie_construccion)
      const uf = parseFloat(v.price)
      if (!(m2 > 0) || !(uf > 0)) return false
      const ufm2 = uf / m2
      if (ufm2 < 3 || ufm2 > 500) return false
      if (m2obj > 0 && (m2 < m2obj * 0.4 || m2 > m2obj * 2.2)) return false
      return true
    })

    const ufm2List = filtradas.map((v) => parseFloat(v.price) / parseFloat(v.superficie_construccion))

    if (dbg) {
      const counts = {}
      ventas.forEach((v) => { const t = clasificaTipo(v); counts[t] = (counts[t] || 0) + 1 })
      dbg.paginas = paginasUsadas
      dbg.objetivo = objetivo
      dbg.counts_por_tipo = counts
      dbg.n_total_ventas = ventas.length
      dbg.n_filtradas = filtradas.length
    }

    if (ufm2List.length < 3) {
      return Response.json({
        _modo: 'pocos_comparables',
        tipo: objetivo,
        mensaje: `Hay muy pocas ventas de ${objetivo} en ese sector para una estimación confiable.`,
        n: ufm2List.length,
        ...(dbg ? { _debug: dbg } : {}),
      })
    }

    const med = Math.round(mediana(ufm2List))
    const p25 = Math.round(percentil(ufm2List, 25))
    const p75 = Math.round(percentil(ufm2List, 75))
    const n = ufm2List.length
    const confianza = n >= 8 ? 'Alta' : n >= 4 ? 'Media' : 'Baja'

    const pres = parseFloat(presupuesto_uf) || 0
    let reality = null
    if (pres > 0) {
      reality = {
        m2_alcanzable_med: Math.round(pres / med),
        m2_alcanzable_min: Math.round(pres / p75),
        m2_alcanzable_max: Math.round(pres / p25),
      }
    }
    let estimacion = null
    if (m2obj > 0) {
      estimacion = {
        uf_min: Math.round(p25 * m2obj),
        uf_med: Math.round(med * m2obj),
        uf_max: Math.round(p75 * m2obj),
      }
    }

    return Response.json({
      _modo: 'real',
      tipo: objetivo,
      sector: { lat: punto.lat, lng: punto.lng, comuna: comuna || null, por_mapa: !!userPoly },
      precio_sector: { uf_m2_mediana: med, uf_m2_p25: p25, uf_m2_p75: p75, n_comparables: n, confianza },
      reality,
      estimacion,
      ...(dbg ? { _debug: dbg } : {}),
    })
  } catch (e) {
    return Response.json({ error: e.message, _modo: 'error' }, { status: 200 })
  }
}
