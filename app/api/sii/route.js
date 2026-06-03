// app/api/sii/route.js  v7
// Estrategia:
//   1. ROL (NNNN-NN) + comuna → DataInmobiliaria REST API /propiedades/detalle
//   2. Dirección + comuna    → BaseAPI /sii/avaluo/buscar (server-side)
// Ambas llamadas son server-side (Route Handler Next.js), la key nunca llega al browser.

const BASEAPI_KEY  = process.env.BASEAPI_KEY
const DATAINM_KEY  = process.env.DATAINMOBILIARIA_TOKEN   // token REST API de datainmobiliaria
const UF_CLP       = 40408

// Mapa de communes de la RM: nombre normalizado → cod_com SII
const COD_COM = {
  'CERRILLOS':15101,'CERRO NAVIA':15102,'CONCHALI':15103,'EL BOSQUE':15104,
  'ESTACION CENTRAL':15105,'HUECHURABA':15106,'INDEPENDENCIA':15107,'LAS CONDES':15108,
  'LA CISTERNA':15109,'LA FLORIDA':15110,'LA GRANJA':15111,'LA PINTANA':15112,
  'LA REINA':15113,'LO BARNECHEA':15114,'LO ESPEJO':15115,'LO PRADO':15116,
  'MACUL':15117,'MAIPU':15118,'NUNOA':15119,'PEDRO AGUIRRE CERDA':15120,
  'PENALOLEN':15121,'PROVIDENCIA':15122,'PUDAHUEL':15123,'QUILICURA':15124,
  'QUINTA NORMAL':15125,'RECOLETA':15126,'RENCA':15127,'SAN JOAQUIN':15128,
  'SAN MIGUEL':15129,'SAN RAMON':15130,'SANTIAGO':15131,'VITACURA':15132,
  'PUENTE ALTO':13401,'SAN BERNARDO':13403,'BUIN':13402,'CALERA DE TANGO':13404,
  'PAINE':13405,'COLINA':13301,'LAMPA':13302,'TIL TIL':13303,
  'SAN JOSE DE MAIPO':13201,'MELIPILLA':13501,'ALHUE':13502,'CURACAVI':13503,
  'MARIA PINTO':13504,'SAN PEDRO':13505,'EL MONTE':13601,'ISLA DE MAIPO':13602,
  'PADRE HURTADO':13603,'PENAFLOR':13604,'TALAGANTE':13605,
}

function norm(s) {
  return (s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00D1/g,'N').replace(/\u00F1/g,'N')  // Ñ/ñ → N
    .trim()
}

function getCodCom(comunaNombre) {
  return COD_COM[norm(comunaNombre)] || null
}

function buildResultado(item, comunaInput, unidad) {
  const m2T = item.m2_terreno    ? parseFloat(item.m2_terreno)    : null
  const m2C = item.m2_construido ? parseFloat(item.m2_construido) : null
  const av  = item.avaluo_total_clp ? parseInt(item.avaluo_total_clp) : null
  const cCom = item.cod_com || null
  const cMz  = item.cod_mz  || null
  const cPr  = item.cod_pr  || null
  return {
    direccion:         item.direccion || '',
    rol:               item.rol || (cCom && cMz && cPr ? `${cCom}-${cMz}-${cPr}` : null),
    cod_comuna:        cCom,
    manzana:           cMz,
    predio:            cPr,
    comuna:            item.comuna || comunaInput,
    destino:           item.destino || null,
    m2_terreno:        m2T,
    m2_construido:     m2C,
    avaluo_total_clp:  av,
    avaluo_fiscal_uf:  av ? Math.round(av / UF_CLP) : null,
    anio_construccion: item.ano_construccion || null,
    latitud:           item.latitud  || null,
    longitud:          item.longitud || null,
    depto:             unidad || item.depto || null,
    link_datainmobiliaria: cCom && cMz && cPr
      ? `https://datainmobiliaria.cl/reports/detalle_propiedad?cod_com=${cCom}&cod_mz=${cMz}&cod_pr=${cPr}`
      : null,
  }
}

// ── DataInmobiliaria REST: detalle por ROL ────────────────────────────────────
async function datainmDetalle(codCom, codMz, codPr) {
  const url = `https://datainmobiliaria.cl/api/v1/propiedades/detalle?cod_com=${codCom}&cod_mz=${codMz}&cod_pr=${codPr}`
  const res = await fetch(url, {
    headers: {
      'X-API-Key': DATAINM_KEY,
      'Accept':    'application/json',
    },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`DataInmobiliaria ${res.status}: ${txt.slice(0, 200)}`)
  }
  const data = await res.json()
  // Normalizar respuesta al formato interno
  const cat = data.catastro || data
  return {
    direccion:         cat.direccion_sii || cat.direccion || '',
    rol:               `${codCom}-${codMz}-${codPr}`,
    cod_com:           codCom,
    cod_mz:            codMz,
    cod_pr:            codPr,
    comuna:            cat.comuna || '',
    destino:           cat.destino || cat.cod_destino || null,
    m2_terreno:        cat.superficie_total_terreno || cat.m2_terreno || null,
    m2_construido:     cat.superficie_construccion  || cat.m2_construido || null,
    avaluo_total_clp:  cat.avaluo_fiscal_clp || null,
    ano_construccion:  cat.ano_construccion || null,
    latitud:           cat.latitud  || null,
    longitud:          cat.longitud || null,
  }
}

// ── BaseAPI: buscar por dirección ─────────────────────────────────────────────
async function baseapiDireccion(calle, numero, codCom, unidad) {
  const params = { calle, numero: numero || '', cod_com: codCom }
  if (unidad) params.depto = unidad
  const qs  = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v != null))
  ).toString()
  const url = `https://api.baseapi.cl/api/v1/sii/avaluo/buscar?${qs}`
  const res = await fetch(url, {
    headers: { 'X-API-Key': BASEAPI_KEY, 'Accept': 'application/json' },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`BaseAPI ${res.status}: ${txt.slice(0, 300)}`)
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

  const codCom = getCodCom(comuna)

  // ── 1. ROL directo: "NNNN-NN" ────────────────────────────────────────────
  const rolMatch = direccion.match(/^(\d+)-(\d+)$/)
  if (rolMatch) {
    if (!codCom) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [],
        error: `No se encontró cod_com para: ${comuna}` })
    }
    if (!DATAINM_KEY) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [],
        error: 'DATAINMOBILIARIA_TOKEN no configurado' })
    }
    const codMz = parseInt(rolMatch[1], 10)
    const codPr = parseInt(rolMatch[2], 10)
    try {
      const item = await datainmDetalle(codCom, codMz, codPr)
      return Response.json({ multiples: false, resultados: [buildResultado(item, comuna, unidad)], noEncontrado: false })
    } catch(e) {
      console.error('[SII ROL]', e.message)
      return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: e.message })
    }
  }

  // ── 2. Búsqueda por dirección via BaseAPI ─────────────────────────────────
  if (!BASEAPI_KEY) {
    return Response.json({ noEncontrado: true, multiples: false, resultados: [],
      error: 'BASEAPI_KEY no configurada' })
  }
  if (!codCom) {
    return Response.json({ noEncontrado: true, multiples: false, resultados: [],
      error: `Comuna no reconocida: ${comuna}` })
  }

  // Separar calle y número
  const matchDir = direccion.match(/^(.+?)\s+(\d+\w*)\s*$/)
  const calle  = matchDir ? matchDir[1].trim() : direccion
  const numero = matchDir ? matchDir[2] : ''

  try {
    const data = await baseapiDireccion(calle, numero, codCom, unidad)

    let items = []
    if (Array.isArray(data))                 items = data
    else if (Array.isArray(data.resultados)) items = data.resultados
    else if (data.resultado)                 items = [data.resultado]
    else if (data.rol || data.direccion)     items = [data]

    items = items.filter(i => i && (i.rol || i.direccion || i.m2_construido))

    if (!items.length) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
    }

    if (unidad && items.length > 1) {
      const uNorm = norm(unidad).replace(/^(DP|DEPTO|DEPARTAMENTO|OF|OFICINA)\s*/, '')
      const fil = items.filter(i => norm(i.direccion||'').includes(uNorm) || norm(i.depto||'').includes(uNorm))
      if (fil.length) items = fil
    }

    const resultados = items.map(i => buildResultado(i, comuna, unidad))
    return Response.json({ multiples: resultados.length > 1, resultados, noEncontrado: false })

  } catch(e) {
    console.error('[SII dir]', e.message)
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: e.message })
  }
}
