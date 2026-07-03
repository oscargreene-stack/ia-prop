// app/api/ofertas/route.js
// Ofertas vigentes del mercado (avisos de portales) para un sector.
// Usa el MISMO servicio que las ventas (busqueda_poligono) con fuente:'oferta'.
// Acepta el sector como: polygon | lat/lng | comuna/direccion.
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
  return { lat: loc.lat, lng: loc.lng }
}
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

const PROP_TYPE = { casa: ['casa'], departamento: ['departamento'], oficina: ['oficina'] }

export async function POST(request) {
  const dbg = new URL(request.url).searchParams.get('debug') ? {} : null
  try {
    const body = await request.json()
    const { direccion, comuna, lat, lng, polygon, tipo, transaction_type } = body || {}
    if (!DATAINM_TOKEN) return Response.json({ error: 'DATAINMOBILIARIA_TOKEN no configurada' }, { status: 500 })

    const userPoly =
      Array.isArray(polygon) && polygon.length >= 3
        ? polygon.map((p) => ({ lat: +p.lat, lng: +p.lng })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        : null

    let punto = null
    if (userPoly && userPoly.length >= 3) punto = centroide(userPoly)
    else if (lat && lng) punto = { lat: +lat, lng: +lng }
    else {
      const texto = [direccion, comuna].filter(Boolean).join(', ')
      if (!texto) return Response.json({ error: 'Falta comuna/direccion, lat/lng o polygon' }, { status: 400 })
      punto = await geocode(texto)
      if (!punto) return Response.json({ _modo: 'sin_geocode', mensaje: 'No pude ubicar el sector.' })
    }

    const poly = userPoly || poligono(punto.lat, punto.lng, 1200)
    const property_type = PROP_TYPE[String(tipo || '').toLowerCase()] || ['casa', 'departamento']
    const tx = transaction_type === 'arriendo' ? 'arriendo' : 'venta'

    let raw = []
    let paginas = 0
    for (let page = 1; page <= 3; page++) {
      const r = await fetch(`${API_BASE}/busqueda_poligono`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DATAINM_TOKEN },
        body: JSON.stringify({ fuente: 'oferta', polygon: poly, page, property_type, transaction_type: tx, active_publications: 'true' }),
      })
      paginas++
      if (!r.ok) { if (dbg) dbg.http = r.status; break }
      const j = await r.json()
      const arr = Array.isArray(j.resultados) ? j.resultados : []
      raw = raw.concat(arr)
      if (!j.has_more || raw.length >= 200) break
    }

    const ofertas = raw
      .map((v) => {
        const la = parseFloat(v.lat), ln = parseFloat(v.lng)
        if (!Number.isFinite(la) || !Number.isFinite(ln)) return null
        return {
          lat: la, lng: ln,
          precio: parseFloat(v.price) > 0 ? Math.round(parseFloat(v.price)) : null,
          moneda: v.moneda || 'UF',
          dir: String(v.direccion || '').replace(/\s+/g, ' ').trim() || null,
          titulo: String(v.titulo || '').trim() || null,
          m2: parseFloat(v.superficie_util) > 0 ? Math.round(parseFloat(v.superficie_util)) : null,
          dorms: v.dormitorios != null ? Number(v.dormitorios) : null,
          banos: v.banos != null ? Number(v.banos) : null,
          tipo: v.tipo_propiedad || v.property_type || null,
          url: v.url || null,
          imagen: v.imagen || null,
          inmobiliaria: v.inmobiliaria || null,
          fecha: String(v.fecha_publicacion || '').slice(0, 10) || null,
        }
      })
      .filter(Boolean)
      .slice(0, 200)

    return Response.json({ _modo: 'ok', n: ofertas.length, transaction_type: tx, ofertas, ...(dbg ? { _debug: { paginas, raw: raw.length, ...dbg } } : {}) })
  } catch (e) {
    return Response.json({ error: e.message, _modo: 'error' }, { status: 200 })
  }
}
