// app/api/sii/route.js

function normalizarPropiedad(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    direccion:         raw.direccion          || raw.address           || raw.dir               || raw.Direccion || '',
    rol:               raw.rol                || raw.rol_sii           || raw.id_rol            || raw.Rol || raw.ROL || '',
    destino:           raw.destino            || raw.uso               || raw.tipo              || raw.Destino || raw.TipoPropiedad || '',
    m2_construido:     raw.m2_construido      || raw.metros_construidos || raw.sup_construida   || raw.m2c || raw.SuperficieConstruida || raw.superficie_construida || null,
    m2_terreno:        raw.m2_terreno         || raw.metros_terreno    || raw.sup_terreno       || raw.m2t || raw.SuperficieTerreno || raw.superficie_terreno || null,
    anio_construccion: raw.anio_construccion  || raw.ano_construccion  || raw.year              || raw.AnioConstruccion || null,
    avaluo_fiscal_uf:  raw.avaluo_fiscal_uf   || raw.avaluo_uf         || raw.avaluo            || raw.AvaluoFiscalUF || null,
    avaluo_fiscal_clp: raw.avaluo_fiscal_clp  || raw.avaluo_clp        || raw.AvaluoFiscalCLP   || null,
  }
}

function esRol(texto) {
  return /^\s*(rol\s*)?[\d]{3,6}[-\s][\d]{1,4}\s*$/i.test(texto.trim())
}

function limpiarRol(texto) {
  return texto.replace(/rol\s*/i, '').replace(/\s+/g, '-').replace(/[^0-9-]/g, '').trim()
}

function procesarRespuesta(data) {
  console.log('[SII] Raw response keys:', Object.keys(data))
  console.log('[SII] Raw response (first 500 chars):', JSON.stringify(data).slice(0, 500))

  if (Array.isArray(data)) {
    const results = data.map(normalizarPropiedad).filter(Boolean)
    console.log('[SII] Array format, results:', results.length)
    return { multiples: results.length > 1, resultados: results }
  }
  if (data.resultados && Array.isArray(data.resultados)) {
    const results = data.resultados.map(normalizarPropiedad).filter(Boolean)
    console.log('[SII] resultados array, results:', results.length)
    return { multiples: results.length > 1, resultados: results }
  }
  if (data.data && Array.isArray(data.data)) {
    const results = data.data.map(normalizarPropiedad).filter(Boolean)
    console.log('[SII] data array, results:', results.length)
    return { multiples: results.length > 1, resultados: results }
  }
  if (data.propiedades && Array.isArray(data.propiedades)) {
    const results = data.propiedades.map(normalizarPropiedad).filter(Boolean)
    console.log('[SII] propiedades array, results:', results.length)
    return { multiples: results.length > 1, resultados: results }
  }
  // Objeto único con cualquier campo conocido
  const campos = ['rol','Rol','ROL','direccion','Direccion','address','destino','Destino',
                   'm2_construido','SuperficieConstruida','superficie_construida']
  if (campos.some(c => data[c])) {
    console.log('[SII] Single object format')
    return { multiples: false, resultados: [normalizarPropiedad(data)] }
  }
  console.log('[SII] No data found, raw:', JSON.stringify(data).slice(0, 300))
  return { multiples: false, resultados: [], noEncontrado: true, _raw: data }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const busqueda = searchParams.get('direccion') || ''
  const comuna   = searchParams.get('comuna')    || ''

  console.log('[SII] Buscando:', busqueda, '| Comuna:', comuna)

  if (!busqueda) {
    return Response.json({ error: 'Falta la dirección o ROL' }, { status: 400 })
  }

  const BASEAPI_KEY = process.env.BASEAPI_KEY
  if (!BASEAPI_KEY) {
    return Response.json({ error: 'BASEAPI_KEY no configurada' }, { status: 500 })
  }

  try {
    let url
    if (esRol(busqueda)) {
      const rol = limpiarRol(busqueda)
      url = `https://api.baseapi.cl/sii/propiedad?rol=${encodeURIComponent(rol)}`
      if (comuna) url += `&comuna=${encodeURIComponent(comuna)}`
      console.log('[SII] ROL search URL:', url)
    } else {
      const query = `${busqueda}${comuna ? ', ' + comuna : ''}`
      url = `https://api.baseapi.cl/sii/propiedad?direccion=${encodeURIComponent(query)}&comuna=${encodeURIComponent(comuna)}`
      console.log('[SII] Direccion search URL:', url)
    }

    const res  = await fetch(url, { headers: { Authorization: `Bearer ${BASEAPI_KEY}` } })
    console.log('[SII] BaseAPI status:', res.status)

    const text = await res.text()
    console.log('[SII] BaseAPI raw text (500 chars):', text.slice(0, 500))

    let data
    try { data = JSON.parse(text) }
    catch { return Response.json({ error: 'BaseAPI no devolvió JSON', raw: text.slice(0, 200), multiples: false, resultados: [] }) }

    const resultado = procesarRespuesta(data)
    console.log('[SII] Final resultado:', JSON.stringify(resultado).slice(0, 300))
    return Response.json(resultado)

  } catch (err) {
    console.error('[SII] Error:', err.message)
    return Response.json({ error: err.message, multiples: false, resultados: [] }, { status: 500 })
  }
}
