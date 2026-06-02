// app/api/sii/route.js
// Busca predios SII via BaseAPI (server-side, key segura)
// Flujo: buscar por dirección → obtener rol + datos completos (superficie, avalúo, destino)
// Documentación BaseAPI: https://api.baseapi.cl/docs/client#tag/sii-mapas-aval%C3%BAos

const BASEAPI_KEY = process.env.BASEAPI_KEY || "sk_e6c42f75862f399286099e1459461f01"
const BASE = "https://api.baseapi.cl"

// Códigos SII de comunas RM y principales ciudades
const CODIGOS_COMUNA = {"ARICA": 15101, "CAMARONES": 15102, "PUTRE": 15201, "GENERAL LAGOS": 15202, "IQUIQUE": 1101, "ALTO HOSPICIO": 1107, "POZO ALMONTE": 1401, "ANTOFAGASTA": 2101, "MEJILLONES": 2102, "SIERRA GORDA": 2103, "TALTAL": 2104, "CALAMA": 2201, "TOCOPILLA": 2301, "ATACAMA": 3101, "COPIAPO": 3101, "TIERRA AMARILLA": 3102, "CALDERA": 3103, "VALLENAR": 3301, "LA SERENA": 4101, "COQUIMBO": 4102, "VALPARAISO": 5101, "CASABLANCA": 5102, "VINA DEL MAR": 5109, "QUILLOTA": 5301, "SAN ANTONIO": 5601, "RANCAGUA": 6101, "TALCA": 7101, "CONCEPCION": 8101, "CHILLAN": 8201, "LOS ANGELES": 8301, "TEMUCO": 9101, "VALDIVIA": 14101, "OSORNO": 10301, "PUERTO MONTT": 10101, "COYHAIQUE": 11101, "PUNTA ARENAS": 12101, "CERRILLOS": 13102, "CERRO NAVIA": 13103, "CONCHALI": 13104, "EL BOSQUE": 13105, "ESTACION CENTRAL": 13106, "HUECHURABA": 13107, "INDEPENDENCIA": 13108, "LA CISTERNA": 13109, "LA FLORIDA": 13110, "LA GRANJA": 13111, "LA PINTANA": 13112, "LA REINA": 13113, "LAS CONDES": 13114, "LO BARNECHEA": 13115, "LO ESPEJO": 13116, "LO PRADO": 13117, "MACUL": 13118, "MAIPU": 13119, "NUNOA": 13120, "PEDRO AGUIRRE CERDA": 13121, "PENALOLEN": 13122, "PROVIDENCIA": 13123, "PUDAHUEL": 13124, "QUILICURA": 13125, "QUINTA NORMAL": 13126, "RECOLETA": 13127, "RENCA": 13128, "SAN JOAQUIN": 13129, "SAN MIGUEL": 13130, "SAN RAMON": 13131, "SANTIAGO": 13101, "VITACURA": 13132, "PUENTE ALTO": 13201, "SAN BERNARDO": 13401}

function codigoComunaSII(nombreComuna) {
  const key = (nombreComuna || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .trim()
  return CODIGOS_COMUNA[key] || null
}

async function fetchBaseAPI(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'x-api-key': BASEAPI_KEY }
  })
  if (!res.ok) return null
  return res.json()
}

function normalizarPredio(p, unidad) {
  // Mapeo exacto del schema de BaseAPI
  const comunaNombre = p.comuna?.nombre || ''
  const rolCompleto = p.manzana && p.predio
    ? `${p.comunaCodigo || p.comuna?.codigo || ''}-${p.manzana}-${p.predio}`
    : (p.rol || null)
  const rolCorto = p.rol || (p.manzana && p.predio ? `${p.manzana}-${p.predio}` : null)

  return {
    direccion:         p.direccion || null,
    rol:               rolCompleto,
    rol_sii:           rolCorto,          // formato SII "manzana-predio"
    manzana:           p.manzana || null,
    predio:            p.predio || null,
    cod_comuna:        p.comuna?.codigo || null,
    comuna:            comunaNombre,
    destino:           p.destino || null,
    ubicacion:         p.ubicacion || null,
    m2_terreno:        p.superficie?.terreno ?? null,
    m2_construido:     p.superficie?.construida ?? null,
    m2_construido_3l:  p.superficie?.construidaTresLados ?? null,
    avaluo_total_clp:  p.avaluo?.total ?? null,
    avaluo_afecto_clp: p.avaluo?.afecto ?? null,
    avaluo_exento_clp: p.avaluo?.exento ?? null,
    area_homogenea:    p.areaHomogenea || null,
    reavaluo_eac:      p.reavaluo?.eac || null,
    reavaluo_ano:      p.reavaluo?.ano || null,
    latitud:           p.coordenadas?.latitud || null,
    longitud:          p.coordenadas?.longitud || null,
    periodo:           p.periodo || null,
    depto:             unidad || null,
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

  const codComuna = codigoComunaSII(comuna)
  if (!codComuna) {
    return Response.json({ error: `Comuna "${comuna}" no reconocida`, noEncontrado: true, multiples: false, resultados: [] })
  }

  // Parsear calle y número
  const matchDir = direccion.match(/^(.+?)\s+(\d+)(\w*)\s*$/)
  const calle    = matchDir ? matchDir[1].trim() : direccion
  const numBase  = matchDir ? parseInt(matchDir[2], 10) : null
  const sufijo   = matchDir ? matchDir[3] : ''

  try {
    // Buscar con número exacto + adyacentes ±2 (mismo lado par/impar)
    const numerosAbuscar = numBase
      ? [...new Set([numBase, numBase-2, numBase+2, numBase-4, numBase+4].filter(n => n > 0))]
      : [null]

    const todasBusquedas = await Promise.all(
      numerosAbuscar.map(async (n) => {
        const q = new URLSearchParams({ comuna: codComuna, calle })
        if (n) q.set('numero', String(n) + sufijo)
        const data = await fetchBaseAPI(`/api/v1/sii/avaluo/buscar?${q}`)
        return data?.predios || []
      })
    )

    const todosItems = todasBusquedas.flat()

    // Deduplicar por rol único (manzana-predio)
    const vistos = new Set()
    const unicos = todosItems.filter(p => {
      const key = `${p.manzana}-${p.predio}`
      if (vistos.has(key)) return false
      vistos.add(key)
      return true
    })

    if (!unicos.length) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
    }

    const resultados = unicos.map(p => normalizarPredio(p, unidad))

    // Ordenar: primero propiedades con construcción (no sitios eriazos)
    resultados.sort((a, b) => {
      const aM = (a.m2_construido || 0)
      const bM = (b.m2_construido || 0)
      return bM - aM
    })

    if (resultados.length === 1) {
      return Response.json({ multiples: false, resultados, noEncontrado: false })
    }
    return Response.json({ multiples: true, resultados, noEncontrado: false })

  } catch (err) {
    console.error('Error SII:', err)
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: err.message })
  }
}
