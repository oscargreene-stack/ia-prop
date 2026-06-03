// app/api/sii/route.js  v6
// Usa BaseAPI desde el servidor (server-side) — nunca expone la key al browser
// BaseAPI endpoint: https://api.baseapi.cl/api/v1/sii/avaluo/buscar
// La llamada se hace desde el Route Handler de Next.js (servidor), no desde el frontend

const BASEAPI_KEY = process.env.BASEAPI_KEY
const UF_CLP      = 40408

function norm(s) {
  return (s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function buildResultado(item, comunaInput, unidad) {
  // BaseAPI devuelve: rol, direccion, m2_terreno, m2_construido, avaluo_total_clp,
  //                   destino, ano_construccion, latitud, longitud, etc.
  const m2T = item.m2_terreno    ? parseFloat(item.m2_terreno)    : null
  const m2C = item.m2_construido ? parseFloat(item.m2_construido) : null
  const av  = item.avaluo_total_clp ? parseInt(item.avaluo_total_clp) : null
  return {
    direccion:         item.direccion || '',
    rol:               item.rol || null,
    cod_comuna:        item.cod_com || null,
    manzana:           item.cod_mz  || null,
    predio:            item.cod_pr  || null,
    comuna:            item.comuna  || comunaInput,
    destino:           item.destino || null,
    m2_terreno:        m2T,
    m2_construido:     m2C,
    avaluo_total_clp:  av,
    avaluo_fiscal_uf:  av ? Math.round(av / UF_CLP) : null,
    anio_construccion: item.ano_construccion || null,
    latitud:           item.latitud  || null,
    longitud:          item.longitud || null,
    depto:             unidad || item.depto || null,
    link_datainmobiliaria: item.cod_com && item.cod_mz && item.cod_pr
      ? `https://datainmobiliaria.cl/reports/detalle_propiedad?cod_com=${item.cod_com}&cod_mz=${item.cod_mz}&cod_pr=${item.cod_pr}`
      : null,
  }
}

async function baseapiSearch(params) {
  const qs = new URLSearchParams(params).toString()
  const url = `https://api.baseapi.cl/api/v1/sii/avaluo/buscar?${qs}`
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${BASEAPI_KEY}`,
      'Accept': 'application/json',
    },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`BaseAPI ${res.status}: ${txt.slice(0, 200)}`)
  }
  return res.json()
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = (searchParams.get('direccion') || '').trim()
  const comuna    = (searchParams.get('comuna')    || '').trim()
  const unidad    = (searchParams.get('unidad')    || '').trim()

  if (!direccion || !comuna) {
    return Response.json({ error: 'Faltan parámetros' }, { status: 400 })
  }
  if (!BASEAPI_KEY) {
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: 'BASEAPI_KEY no configurada' })
  }

  const comunaNorm = norm(comuna)

  try {
    // BaseAPI busca por dirección + comuna
    const data = await baseapiSearch({
      direccion: direccion,
      comuna:    comunaNorm,
      ...(unidad ? { depto: unidad } : {}),
    })

    // BaseAPI puede devolver: { resultados: [...] } o { resultado: {...} } o array directo
    let items = []
    if (Array.isArray(data))                 items = data
    else if (Array.isArray(data.resultados)) items = data.resultados
    else if (data.resultado)                 items = [data.resultado]
    else if (data.rol || data.direccion)     items = [data]

    // Filtrar resultados sin datos útiles
    items = items.filter(i => i && (i.rol || i.direccion || i.m2_construido))

    if (!items.length) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
    }

    // Si hay unidad/depto, filtrar por ella
    if (unidad && items.length > 1) {
      const uNorm = norm(unidad).replace(/^(DP|DEPTO|DEPARTAMENTO|OF|OFICINA)\s*/, '')
      const filtrado = items.filter(i => norm(i.direccion || '').includes(uNorm) || norm(i.depto || '').includes(uNorm))
      if (filtrado.length) items = filtrado
    }

    const resultados = items.map(i => buildResultado(i, comuna, unidad))
    return Response.json({
      multiples:    resultados.length > 1,
      resultados,
      noEncontrado: false,
    })

  } catch(e) {
    console.error('[SII BaseAPI]', e.message)
    return Response.json({
      noEncontrado: true,
      multiples:    false,
      resultados:   [],
      error:        e.message,
    })
  }
}
