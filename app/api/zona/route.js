// app/api/zona/route.js
// Precio real de un SECTOR para el comprador (agente Isidora).
// Reutiliza la misma maquinaria que la tasación del vendedor:
//   1) Geocodifica un punto de referencia (o usa lat/lng directos).
//   2) POST /busqueda_poligono (fuente catastro) -> ROL de una propiedad cercana.
//   3) GET /propiedades/detalle -> ventas reales del CBR -> mediana UF/m2 del sector.
// Devuelve estadisticas de precio del sector + reality check segun presupuesto.
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const API_BASE = 'https://datainmobiliaria.cl/api/v1'
const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN
const GKEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY

const COD_DESTINO = { casa: 'H', departamento: 'H', depto: 'H', oficina: 'O', comercial: 'C', terreno: 'G' }

// Geocodifica "direccion, comuna, RM, Chile" -> {lat,lng}
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

export async function POST(request) {
  const dbg = new URL(request.url).searchParams.get('debug') ? {} : null
  try {
    const body = await request.json()
    const { direccion, comuna, lat, lng, tipo, presupuesto_uf, m2_objetivo } = body || {}

    if (!DATAINM_TOKEN) return Response.json({ error: 'DATAINMOBILIARIA_TOKEN no configurada' }, { status: 500 })

    // 1) Punto: lat/lng directos o geocodificar
    let punto = lat && lng ? { lat: +lat, lng: +lng } : null
    if (!punto) {
      const texto = [direccion, comuna].filter(Boolean).join(', ')
      if (!texto) return Response.json({ error: 'Falta direccion/comuna o lat/lng' }, { status: 400 })
      punto = await geocode(texto)
      if (dbg) dbg.geocode = punto
      if (!punto) return Response.json({ _modo: 'sin_geocode', mensaje: 'No pude ubicar el sector.', ...(dbg ? { _debug: dbg } : {}) })
    }

    // 2) ROL de una propiedad cercana via busqueda_poligono (catastro), agrandando si hace falta
    let rolObj = null
    for (const radio of [400, 900, 1800]) {
      const poly = poligono(punto.lat, punto.lng, radio)
      const r = await fetch(`${API_BASE}/busqueda_poligono`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DATAINM_TOKEN },
        body: JSON.stringify({ fuente: 'catastro', polygon: poly }),
      })
      if (!r.ok) continue
      const j = await r.json()
      const res = Array.isArray(j.resultados) ? j.resultados : []
      const cand = res.find((p) => p.cod_mz && p.cod_pr) || res[0]
      if (cand) {
        rolObj = cand
        if (dbg) dbg.poligono_radio = radio
        break
      }
    }
    if (!rolObj) return Response.json({ _modo: 'sin_catastro', mensaje: 'No encontré propiedades en el catastro de ese sector.', ...(dbg ? { _debug: dbg } : {}) })

    // 3) /propiedades/detalle -> ventas reales del CBR
    const cd = COD_DESTINO[String(tipo || '').toLowerCase()] || 'H'
    const m2obj = parseFloat(m2_objetivo) || 0
    const m2Min = m2obj ? Math.round(m2obj * 0.5) : 30
    const m2Max = m2obj ? Math.round(m2obj * 1.8) : 400
    const qs = new URLSearchParams({
      cod_com: String(rolObj.cod_com),
      cod_mz: String(rolObj.cod_mz),
      cod_pr: String(rolObj.cod_pr),
      radio: '2000',
      superficie_min: String(m2Min),
      superficie_max: String(m2Max),
      cod_destino: cd,
    }).toString()
    const dRes = await fetch(`${API_BASE}/propiedades/detalle?${qs}`, { headers: { Authorization: 'Bearer ' + DATAINM_TOKEN } })
    if (!dRes.ok) return Response.json({ _modo: 'sin_detalle', mensaje: 'No pude obtener comparables del sector.', ...(dbg ? { _debug: dbg } : {}) })
    const data = await dRes.json()
    const ventas = Array.isArray(data.detalle_ventas_recientes) ? data.detalle_ventas_recientes : []
    const filtro = Array.isArray(data.comparables_filtro) ? data.comparables_filtro : []
    const fuente = filtro.length > 0 ? filtro : ventas

    const ufm2 = fuente
      .map((v) => {
        const m2 = parseFloat(v.superficie_construccion)
        const uf = parseFloat(v.price)
        return m2 > 0 && uf > 0 ? uf / m2 : null
      })
      .filter((x) => x != null)

    if (ufm2.length === 0) return Response.json({ _modo: 'sin_comparables', mensaje: 'No hay ventas recientes suficientes en ese sector.', ...(dbg ? { _debug: dbg } : {}) })

    const med = Math.round(mediana(ufm2))
    const p25 = Math.round(percentil(ufm2, 25))
    const p75 = Math.round(percentil(ufm2, 75))
    const n = ufm2.length
    const confianza = n >= 5 ? 'Alta' : n >= 3 ? 'Media' : 'Baja'

    // Reality check segun presupuesto
    const pres = parseFloat(presupuesto_uf) || 0
    let reality = null
    if (pres > 0) {
      reality = {
        m2_alcanzable_med: Math.round(pres / med),
        m2_alcanzable_min: Math.round(pres / p75),
        m2_alcanzable_max: Math.round(pres / p25),
      }
    }
    // Estimacion de precio para el m2 objetivo
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
      sector: { lat: punto.lat, lng: punto.lng, comuna: comuna || null },
      precio_sector: { uf_m2_mediana: med, uf_m2_p25: p25, uf_m2_p75: p75, n_comparables: n, confianza },
      reality,
      estimacion,
      ...(dbg ? { _debug: { ...dbg, rol: `${rolObj.cod_com}-${rolObj.cod_mz}-${rolObj.cod_pr}`, n } } : {}),
    })
  } catch (e) {
    return Response.json({ error: e.message, _modo: 'error' }, { status: 200 })
  }
}
