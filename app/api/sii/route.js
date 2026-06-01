// app/api/sii/route.js
// Proxy seguro para BaseAPI — la key nunca sale al browser
// Busca con numero exacto + adyacentes (±2) para capturar predios con numeracion SII distinta

const BASEAPI_KEY = process.env.BASEAPI_KEY || "sk_e6c42f75862f399286099e1459461f01"

async function buscarEnBaseAPI(calle, numero, comuna) {
  const url = `https://api.baseapi.cl/api/v1/sii/avaluo/buscar?comuna=${encodeURIComponent(comuna)}&calle=${encodeURIComponent(calle)}&numero=${encodeURIComponent(numero)}`
  const res = await fetch(url, {
    headers: { 'x-api-key': BASEAPI_KEY, 'Content-Type': 'application/json' },
  })
  if (!res.ok) return []
  const data = await res.json()
  const items = Array.isArray(data)
    ? data
    : (data?.data || data?.results || data?.items || (data && !data.error ? [data] : []))
  return items || []
}

function normalizar(item, fallback, unidad, comuna) {
  return {
    direccion:         item.direccion || item.address || fallback,
    rol:               item.rol || item.role || null,
    m2_construido:     parseFloat(item.superficie_construida || item.m2_construido || item.m2_total || item.superficie_util || item.m2_util || item.superficie || 0) || null,
    m2_util:           parseFloat(item.superficie_util || item.m2_util || item.superficie || 0) || null,
    m2_terreno:        parseFloat(item.superficie_terreno || item.m2_terreno || 0) || null,
    destino:           item.destino || null,
    avaluo_fiscal_uf:  item.avaluo_fiscal || item.avaluo || null,
    anio_construccion: item.anio_construccion || item.year || null,
    piso:              item.piso || null,
    depto:             item.depto || unidad || null,
    comuna:            item.comuna || comuna,
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = (searchParams.get('direccion') || '').trim()
  const comuna    = (searchParams.get('comuna')    || '').trim()
  const unidad    = (searchParams.get('unidad')    || '').trim()

  if (!direccion || !comuna) {
    return Response.json({ error: 'Faltan parametros' }, { status: 400 })
  }

  // Parsear calle y numero
  const matchDir = direccion.match(/^(.+?)\s+(\d+)(\w*)\s*$/)
  const calle    = matchDir ? matchDir[1].trim() : direccion
  const numeroBase = matchDir ? parseInt(matchDir[2], 10) : null
  const sufijo   = matchDir ? matchDir[3] : ''

  try {
    let todosItems = []

    if (numeroBase) {
      // Buscar numero exacto + adyacentes ±2 en paralelo (par/impar segun el original)
      const esImpar = numeroBase % 2 !== 0
      const candidatos = [numeroBase]
      // Agregar adyacentes del mismo lado de la calle (par o impar)
      for (let delta = 2; delta <= 4; delta += 2) {
        candidatos.push(numeroBase - delta)
        candidatos.push(numeroBase + delta)
      }
      // Filtrar negativos
      const numerosValidos = [...new Set(candidatos.filter(n => n > 0))]

      const resultados = await Promise.all(
        numerosValidos.map(n => buscarEnBaseAPI(calle, String(n) + sufijo, comuna))
      )
      todosItems = resultados.flat()
    } else {
      // Sin numero, buscar solo por calle
      todosItems = await buscarEnBaseAPI(calle, '', comuna)
    }

    // Deduplicar por ROL (si viene) o por direccion
    const vistos = new Set()
    const unicos = todosItems.filter(item => {
      const key = item.rol || item.role || item.direccion || item.address || JSON.stringify(item)
      if (vistos.has(key)) return false
      vistos.add(key)
      return true
    })

    if (!unicos.length) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
    }

    const q = `${direccion}${unidad ? ' ' + unidad : ''}, ${comuna}`
    const resultados = unicos.map(item => normalizar(item, q, unidad, comuna))

    // Ordenar: primero los que tienen construccion (casas reales), luego sitios eriazos
    resultados.sort((a, b) => {
      const aConst = (a.m2_construido || 0) + (a.m2_util || 0)
      const bConst = (b.m2_construido || 0) + (b.m2_util || 0)
      return bConst - aConst
    })

    if (resultados.length === 1) {
      return Response.json({ multiples: false, resultados, noEncontrado: false })
    }
    return Response.json({ multiples: true, resultados, noEncontrado: false })

  } catch (err) {
    console.error('Error SII:', err)
    return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
  }
}
