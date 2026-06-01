// app/api/sii/route.js
// Consulta datos reales del SII via BaseAPI

const BASEAPI_KEY = process.env.BASEAPI_KEY || "sk_e6c42f75862f399286099e1459461f01"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = (searchParams.get('direccion') || '').trim()
  const comuna    = (searchParams.get('comuna')    || '').trim()
  const unidad    = (searchParams.get('unidad')    || '').trim()

  if (!direccion || !comuna) {
    return Response.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const q = `${direccion}${unidad ? ' ' + unidad : ''}, ${comuna}`

  try {
    const res = await fetch(
      `https://api.baseapi.cl/v1/sii/search?q=${encodeURIComponent(q)}&limit=5`,
      { headers: { Authorization: `Bearer ${BASEAPI_KEY}` } }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('BaseAPI error:', res.status, err)
      return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
    }

    const data = await res.json()
    const items = data?.data || data?.results || data?.items || []

    if (!items.length) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
    }

    // Normalizar campos al formato que espera el frontend
    const resultados = items.map(item => ({
      direccion:          item.direccion || item.address || q,
      rol:                item.rol || item.role || null,
      m2_construido:      parseFloat(item.superficie_construida || item.m2_construido || item.m2_total || item.superficie_util || item.m2_util || item.superficie || 0) || null,
      m2_util:            parseFloat(item.superficie_util || item.m2_util || item.superficie || 0) || null,
      m2_terreno:         parseFloat(item.superficie_terreno || item.m2_terreno || 0) || null,
      destino:            item.destino || null,
      avaluo_fiscal_uf:   item.avaluo_fiscal || item.avaluo || null,
      anio_construccion:  item.anio_construccion || item.year || null,
      piso:               item.piso || null,
      depto:              item.depto || unidad || null,
      comuna:             item.comuna || comuna,
    }))

    if (resultados.length === 1) {
      return Response.json({ multiples: false, resultados, noEncontrado: false })
    }

    return Response.json({ multiples: true, resultados, noEncontrado: false })

  } catch (err) {
    console.error('Error SII:', err)
    return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
  }
}
