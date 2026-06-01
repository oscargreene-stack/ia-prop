// app/api/sii/route.js
// Proxy seguro para BaseAPI — la key nunca sale al browser

const BASEAPI_KEY = process.env.BASEAPI_KEY || "sk_e6c42f75862f399286099e1459461f01"

export async function GET(request) {
    const { searchParams } = new URL(request.url)
    const direccion = (searchParams.get('direccion') || '').trim()
    const comuna    = (searchParams.get('comuna')    || '').trim()
    const unidad    = (searchParams.get('unidad')    || '').trim()

  if (!direccion || !comuna) {
        return Response.json({ error: 'Faltan parametros' }, { status: 400 })
  }

  // Parsear calle y numero de la direccion
  const match = direccion.match(/^(.+?)\s+(\d+\w*)\s*$/)
    const calle  = match ? match[1].trim() : direccion
    const numero = match ? match[2].trim() : ''

  try {
        // Endpoint correcto segun docs BaseAPI con x-api-key
      const url = `https://api.baseapi.cl/api/v1/sii/avaluo/buscar?comuna=${encodeURIComponent(comuna)}&calle=${encodeURIComponent(calle)}&numero=${encodeURIComponent(numero)}`

      const res = await fetch(url, {
              headers: {
                        'x-api-key': BASEAPI_KEY,
                        'Content-Type': 'application/json',
              },
      })

      if (!res.ok) {
              const err = await res.text()
              console.error('BaseAPI error:', res.status, err)
              return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
      }

      const data = await res.json()

      // BaseAPI puede devolver objeto directo o array
      const rawItems = Array.isArray(data)
          ? data
              : (data?.data || data?.results || data?.items || (data && !data.error ? [data] : []))

      if (!rawItems.length) {
              return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
      }

      // Normalizar al formato que espera el frontend
      const q = `${direccion}${unidad ? ' ' + unidad : ''}, ${comuna}`
        const resultados = rawItems.map(item => ({
                direccion:        item.direccion || item.address || q,
                rol:              item.rol || item.role || null,
                m2_construido:    parseFloat(item.superficie_construida || item.m2_construido || item.m2_total || item.superficie_util || item.m2_util || item.superficie || 0) || null,
                m2_util:          parseFloat(item.superficie_util || item.m2_util || item.superficie || 0) || null,
                m2_terreno:       parseFloat(item.superficie_terreno || item.m2_terreno || 0) || null,
                destino:          item.destino || null,
                avaluo_fiscal_uf: item.avaluo_fiscal || item.avaluo || null,
                anio_construccion: item.anio_construccion || item.year || null,
                piso:             item.piso || null,
                depto:            item.depto || unidad || null,
                comuna:           item.comuna || comuna,
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
