// app/api/sii/route.js

function normalizarPropiedad(raw) {
  if (!raw || typeof raw !== 'object') return null
  // Mapear distintos formatos posibles que devuelve BaseAPI
  return {
    direccion:        raw.direccion       || raw.address      || raw.dir          || '',
    rol:              raw.rol             || raw.rol_sii       || raw.id_rol       || '',
    destino:          raw.destino         || raw.uso           || raw.tipo         || '',
    m2_construido:    raw.m2_construido   || raw.metros_construidos || raw.sup_construida || raw.m2c || null,
    m2_terreno:       raw.m2_terreno      || raw.metros_terreno     || raw.sup_terreno    || raw.m2t || null,
    anio_construccion:raw.anio_construccion || raw.ano_construccion  || raw.year          || null,
    avaluo_fiscal_uf: raw.avaluo_fiscal_uf || raw.avaluo_uf   || raw.avaluo        || null,
    avaluo_fiscal_clp:raw.avaluo_fiscal_clp || raw.avaluo_clp || null,
    _raw: raw, // guardamos el raw por si acaso
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = searchParams.get('direccion')
  const comuna    = searchParams.get('comuna')

  if (!direccion || !comuna) {
    return Response.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const BASEAPI_KEY = process.env.BASEAPI_KEY
  if (!BASEAPI_KEY) {
    return Response.json({ error: 'BASEAPI_KEY no configurada' }, { status: 500 })
  }

  try {
    const q   = encodeURIComponent(`${direccion}, ${comuna}`)
    const url = `https://api.baseapi.cl/sii/propiedad?direccion=${q}&comuna=${encodeURIComponent(comuna)}`

    const res  = await fetch(url, { headers: { Authorization: `Bearer ${BASEAPI_KEY}` } })
    const data = await res.json()

    // Caso 1: array de resultados → múltiples candidatos
    if (Array.isArray(data)) {
      return Response.json({
        multiples: data.length > 1,
        resultados: data.map(normalizarPropiedad).filter(Boolean),
      })
    }

    // Caso 2: objeto con clave "resultados"
    if (data.resultados && Array.isArray(data.resultados)) {
      const results = data.resultados.map(normalizarPropiedad).filter(Boolean)
      return Response.json({
        multiples: results.length > 1,
        resultados: results,
      })
    }

    // Caso 3: objeto con clave "data" o "propiedades"
    if (data.data || data.propiedades) {
      const arr = data.data || data.propiedades
      if (Array.isArray(arr)) {
        const results = arr.map(normalizarPropiedad).filter(Boolean)
        return Response.json({ multiples: results.length > 1, resultados: results })
      }
    }

    // Caso 4: objeto único (una sola propiedad)
    if (data.rol || data.direccion || data.destino || data.m2_construido) {
      return Response.json({ multiples: false, resultados: [normalizarPropiedad(data)] })
    }

    // Caso 5: no encontrado / sin datos
    return Response.json({ multiples: false, resultados: [], noEncontrado: true, raw: data })

  } catch (err) {
    return Response.json({ error: err.message, multiples: false, resultados: [] }, { status: 500 })
  }
}
