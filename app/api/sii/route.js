// app/api/sii/route.js

function normalizarPropiedad(raw) {
  if (!raw || typeof raw !== 'object') return null
  return {
    direccion:         raw.direccion          || raw.address           || raw.dir               || '',
    rol:               raw.rol                || raw.rol_sii           || raw.id_rol            || '',
    destino:           raw.destino            || raw.uso               || raw.tipo              || '',
    m2_construido:     raw.m2_construido      || raw.metros_construidos || raw.sup_construida   || raw.m2c || null,
    m2_terreno:        raw.m2_terreno         || raw.metros_terreno    || raw.sup_terreno       || raw.m2t || null,
    anio_construccion: raw.anio_construccion  || raw.ano_construccion  || raw.year              || null,
    avaluo_fiscal_uf:  raw.avaluo_fiscal_uf   || raw.avaluo_uf         || raw.avaluo            || null,
    avaluo_fiscal_clp: raw.avaluo_fiscal_clp  || raw.avaluo_clp        || null,
  }
}

function esRol(texto) {
  // Formatos válidos: "1234-56", "ROL 1234-56", "1234 56", "123456-7"
  return /^\s*(rol\s*)?[\d]{3,6}[-\s][\d]{1,4}\s*$/i.test(texto.trim())
}

function limpiarRol(texto) {
  return texto.replace(/rol\s*/i, '').replace(/\s+/, '-').replace(/[^0-9-]/g, '').trim()
}

function procesarRespuesta(data) {
  if (Array.isArray(data)) {
    const results = data.map(normalizarPropiedad).filter(Boolean)
    return { multiples: results.length > 1, resultados: results }
  }
  if (data.resultados && Array.isArray(data.resultados)) {
    const results = data.resultados.map(normalizarPropiedad).filter(Boolean)
    return { multiples: results.length > 1, resultados: results }
  }
  if (data.data || data.propiedades) {
    const arr = data.data || data.propiedades
    if (Array.isArray(arr)) {
      const results = arr.map(normalizarPropiedad).filter(Boolean)
      return { multiples: results.length > 1, resultados: results }
    }
  }
  if (data.rol || data.direccion || data.destino || data.m2_construido) {
    return { multiples: false, resultados: [normalizarPropiedad(data)] }
  }
  return { multiples: false, resultados: [], noEncontrado: true }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const busqueda = searchParams.get('direccion') || ''
  const comuna   = searchParams.get('comuna')    || ''

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
      // ── Búsqueda por ROL ─────────────────────────────────────────────────
      const rol = limpiarRol(busqueda)
      url = `https://api.baseapi.cl/sii/propiedad?rol=${encodeURIComponent(rol)}`
      if (comuna) url += `&comuna=${encodeURIComponent(comuna)}`
    } else {
      // ── Búsqueda por dirección ───────────────────────────────────────────
      const q = encodeURIComponent(`${busqueda}${comuna ? ', ' + comuna : ''}`)
      url = `https://api.baseapi.cl/sii/propiedad?direccion=${q}`
      if (comuna) url += `&comuna=${encodeURIComponent(comuna)}`
    }

    const res  = await fetch(url, { headers: { Authorization: `Bearer ${BASEAPI_KEY}` } })
    const data = await res.json()
    return Response.json(procesarRespuesta(data))

  } catch (err) {
    return Response.json({ error: err.message, multiples: false, resultados: [] }, { status: 500 })
  }
}
