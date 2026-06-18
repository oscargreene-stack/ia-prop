// app/api/sii/route.js
// Proxy seguro a BaseAPI — la API key nunca sale al browser

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = searchParams.get('direccion')
  const comuna = searchParams.get('comuna')

  if (!direccion || !comuna) {
    return Response.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const BASEAPI_KEY = process.env.BASEAPI_KEY
  if (!BASEAPI_KEY) {
    return Response.json({ error: 'BASEAPI_KEY no configurada' }, { status: 500 })
  }

  try {
    const q = encodeURIComponent(`${direccion}, ${comuna}`)
    const url = `https://api.baseapi.cl/sii/propiedad?direccion=${q}&comuna=${encodeURIComponent(comuna)}`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${BASEAPI_KEY}` },
    })

    const data = await res.json()
    return Response.json(data)
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
