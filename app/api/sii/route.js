// app/api/sii/route.js

function normalizarPropiedad(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    direccion:         raw.direccion          || raw.address            || raw.dir              || raw.Direccion        || '',
    rol:               raw.rol                || raw.rol_sii            || raw.id_rol           || raw.Rol || raw.ROL   || '',
    destino:           raw.destino            || raw.uso                || raw.tipo             || raw.Destino          || raw.TipoPropiedad || '',
    m2_construido:     raw.m2_construido      || raw.metros_construidos || raw.sup_construida   || raw.m2c              || raw.SuperficieConstruida || raw.superficie_construida || null,
    m2_terreno:        raw.m2_terreno         || raw.metros_terreno     || raw.sup_terreno      || raw.m2t              || raw.SuperficieTerreno || raw.superficie_terreno || null,
    anio_construccion: raw.anio_construccion  || raw.ano_construccion   || raw.year             || raw.AnioConstruccion || null,
    avaluo_fiscal_uf:  raw.avaluo_fiscal_uf   || raw.avaluo_uf          || raw.avaluo           || raw.AvaluoFiscalUF   || null,
    avaluo_fiscal_clp: raw.avaluo_fiscal_clp  || raw.avaluo_clp         || raw.AvaluoFiscalCLP  || null,
  }
}

function esRol(texto) {
  return /^\s*(rol\s*)?[\d]{3,6}[-\s][\d]{1,4}\s*$/i.test(texto.trim())
}

function limpiarRol(texto) {
  return texto.replace(/rol\s*/i, '').replace(/\s+/g, '-').replace(/[^0-9-]/g, '').trim()
}

// Intenta hacer match entre el nº de unidad y la dirección registrada en SII
function matchUnidad(propiedad, unidad) {
  if (!unidad) return false
  const dir = (propiedad.direccion || '').toLowerCase()
  const u   = unidad.toLowerCase().replace(/^(dp|dpto|depto|of|ofic|oficina)[\s.]*/i, '').trim()
  return dir.includes(u)
}

function procesarRespuesta(data, unidad) {
  let resultados = []

  if (Array.isArray(data)) {
    resultados = data.map(normalizarPropiedad).filter(Boolean)
  } else if (data.resultados && Array.isArray(data.resultados)) {
    resultados = data.resultados.map(normalizarPropiedad).filter(Boolean)
  } else if (data.data && Array.isArray(data.data)) {
    resultados = data.data.map(normalizarPropiedad).filter(Boolean)
  } else if (data.propiedades && Array.isArray(data.propiedades)) {
    resultados = data.propiedades.map(normalizarPropiedad).filter(Boolean)
  } else {
    const campos = ['rol','Rol','ROL','direccion','Direccion','address','destino','Destino','m2_construido','SuperficieConstruida']
    if (campos.some(c => data[c])) {
      resultados = [normalizarPropiedad(data)]
    }
  }

  console.log('[SII] Total resultados antes de filtrar:', resultados.length)

  // Si viene unidad, intentar filtrar por ella
  if (unidad && resultados.length > 1) {
    const filtrados = resultados.filter(r => matchUnidad(r, unidad))
    console.log('[SII] Filtrados por unidad', unidad, ':', filtrados.length)
    if (filtrados.length > 0) resultados = filtrados
  }

  if (resultados.length === 0) {
    console.log('[SII] Sin resultados. Raw:', JSON.stringify(data).slice(0, 400))
    return { multiples: false, resultados: [], noEncontrado: true, _raw: data }
  }

  return { multiples: resultados.length > 1, resultados }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const busqueda = (searchParams.get('direccion') || '').trim()
  const comuna   = (searchParams.get('comuna')    || '').trim()
  const unidad   = (searchParams.get('unidad')    || '').trim() // nº depto/oficina separado

  console.log('[SII] Buscando:', busqueda, '| Comuna:', comuna, '| Unidad:', unidad)

  if (!busqueda) return Response.json({ error: 'Falta la dirección o ROL' }, { status: 400 })

  const BASEAPI_KEY = process.env.BASEAPI_KEY
  if (!BASEAPI_KEY) return Response.json({ error: 'BASEAPI_KEY no configurada' }, { status: 500 })

  try {
    let url

    if (esRol(busqueda)) {
      const rol = limpiarRol(busqueda)
      url = `https://api.baseapi.cl/sii/propiedad?rol=${encodeURIComponent(rol)}`
      if (comuna) url += `&comuna=${encodeURIComponent(comuna)}`
    } else {
      // Buscar SOLO con la dirección base (sin unidad) para obtener todos los dptos del edificio
      const query = `${busqueda}${comuna ? ', ' + comuna : ''}`
      url = `https://api.baseapi.cl/sii/propiedad?direccion=${encodeURIComponent(query)}&comuna=${encodeURIComponent(comuna)}`
    }

    console.log('[SII] URL:', url)

    const res  = await fetch(url, { headers: { Authorization: `Bearer ${BASEAPI_KEY}` } })
    console.log('[SII] Status:', res.status)

    const text = await res.text()
    console.log('[SII] Raw (600 chars):', text.slice(0, 600))

    let data
    try { data = JSON.parse(text) }
    catch { return Response.json({ error: 'BaseAPI error: ' + text.slice(0, 100), multiples: false, resultados: [] }) }

    const resultado = procesarRespuesta(data, unidad)
    console.log('[SII] Resultado final:', JSON.stringify(resultado).slice(0, 400))
    return Response.json(resultado)

  } catch (err) {
    console.error('[SII] Error:', err.message)
    return Response.json({ error: err.message, multiples: false, resultados: [] }, { status: 500 })
  }
}
