// app/api/sii/route.js  v8  — FINAL
// BaseAPI (server-side): { success, data: { total, predios: [...] } }
// Predio: { rol, manzana, predio, direccion, destino, superficie: { terreno, construida }, avaluo: { total }, periodo, ubicacion: { latitud, longitud } }

const BASEAPI_KEY  = process.env.BASEAPI_KEY
const DATAINM_KEY  = process.env.DATAINMOBILIARIA_TOKEN
const UF_CLP       = 40408

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
    .trim()
}

function getCodCom(comunaNombre) {
  return COD_COM[norm(comunaNombre)] || null
}

// Convierte un predio de BaseAPI al formato interno
function prediToResultado(p, comunaInput, unidad) {
  const sup  = p.superficie || {}
  const av   = p.avaluo     || {}
  const ubi  = p.ubicacion  || {}
  const com  = p.comuna     || {}
  const codCom = com.codigo || getCodCom(comunaInput)
  const codMz  = p.manzana
  const codPr  = p.predio
  const m2C = sup.construida ? parseFloat(sup.construida) : null
  const m2T = sup.terreno    ? parseFloat(sup.terreno)    : null
  const avCLP = av.total && av.total > 0 ? parseInt(av.total) : null
  return {
    direccion:         p.direccion || '',
    rol:               p.rol || (codCom && codMz && codPr ? `${codCom}-${codMz}-${codPr}` : null),
    cod_comuna:        codCom,
    manzana:           codMz || null,
    predio:            codPr || null,
    comuna:            com.nombre || comunaInput,
    destino:           p.destino || null,
    m2_terreno:        m2T,
    m2_construido:     m2C,
    avaluo_total_clp:  avCLP,
    avaluo_fiscal_uf:  avCLP ? Math.round(avCLP / UF_CLP) : null,
    anio_construccion: p.ano_construccion || null,
    latitud:           ubi.latitud  || null,
    longitud:          ubi.longitud || null,
    depto:             unidad || null,
    link_datainmobiliaria: codCom && codMz && codPr
      ? `https://datainmobiliaria.cl/reports/detalle_propiedad?cod_com=${codCom}&cod_mz=${codMz}&cod_pr=${codPr}`
      : null,
  }
}

// ── BaseAPI: buscar por dirección ─────────────────────────────────────────────
async function baseapiSearch(calle, numero, codCom, unidad) {
  const params = { calle, comuna: codCom }
  if (numero)  params.numero = numero
  if (unidad)  params.depto  = unidad
  const qs  = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([,v]) => v != null && v !== ''))
  ).toString()
  const res = await fetch(`https://api.baseapi.cl/api/v1/sii/avaluo/buscar?${qs}`, {
    headers: { 'X-API-Key': BASEAPI_KEY, 'Accept': 'application/json' },
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`BaseAPI ${res.status}: ${txt.slice(0, 300)}`)
  }
  const json = await res.json()
  // BaseAPI: { success: true, data: { total: N, predios: [...] } }
  return json?.data?.predios || []
}


// ── Fallback BigQuery via Anthropic MCP ──────────────────────────────────────
async function bqFallback(calle, numero, codCom, comunaNorm) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const MCP_URL = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
  const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN
  if (!ANTHROPIC_KEY) return []

  // Token más largo y distintivo de la calle
  const tokens = calle.split(/\s+/).filter(t => t.length >= 4)
  const token = tokens.sort((a, b) => b.length - a.length)[0] || calle

  let numWhere = ''
  if (numero) {
    const n = parseInt(numero, 10)
    const ns = [n, n-2, n+2, n-4, n+4].filter(x => x > 0)
    numWhere = `AND (${ns.map(x => `c.direccion_sii LIKE '% ${x}'`).join(' OR ')} OR c.direccion_sii LIKE '%${numero}')`
  }

  const sql = `SELECT c.cod_com, c.cod_mz, c.cod_pr, c.direccion_sii,
    cd.descripcion_destino AS destino,
    c.superficie_total_terreno AS m2_terreno,
    c.superficie_construccion AS m2_construido,
    c.avaluo_fiscal_clp, c.ano_construccion,
    ccr.comuna AS comuna_nombre, c.latitud, c.longitud
  FROM datainmobiliaria.consolidado c
  JOIN datainmobiliaria.codigo_comuna_region ccr ON c.cod_com = ccr.cod_com
  JOIN datainmobiliaria.codigo_destino cd ON c.cod_destino = cd.cod_destino
  WHERE ccr.comuna = '${comunaNorm}'
    AND UPPER(c.direccion_sii) LIKE '%${token}%'
    ${numWhere}
  ORDER BY CASE WHEN c.superficie_construccion > 0 THEN 0 ELSE 1 END, c.avaluo_fiscal_clp DESC
  LIMIT 8`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: 'Run the SQL using bq_run_query and return ONLY the raw JSON array of rows. No markdown.',
        messages: [{ role: 'user', content: `Run this SQL:\n${sql}` }],
        mcp_servers: [{ type: 'url', url: MCP_URL, name: 'datainmobiliaria', authorization_token: DATAINM_TOKEN }],
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    // Extract rows from response
    for (const block of (data.content || [])) {
      if (block.type === 'mcp_tool_result') {
        for (const item of (block.content || [])) {
          if (item?.text) {
            try { const p = JSON.parse(item.text); if (Array.isArray(p) && p.length) return p } catch(e) {}
            const m = item.text.match(/\[[\s\S]*\]/)
            if (m) { try { const r = JSON.parse(m[0]); if (Array.isArray(r) && r.length) return r } catch(e) {} }
          }
        }
      }
      if (block.type === 'text' && block.text) {
        const m = block.text.match(/\[[\s\S]*\]/)
        if (m) { try { const r = JSON.parse(m[0]); if (Array.isArray(r) && r.length) return r } catch(e) {} }
      }
    }
  } catch(e) { console.error('[BQ fallback]', e.message) }
  return []
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

  const codCom = getCodCom(comuna)
  if (!codCom) {
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: `Comuna no reconocida: ${comuna}` })
  }

  // ── ROL directo: "NNNN-NN" ────────────────────────────────────────────────
  const rolMatch = direccion.match(/^(\d+)-(\d+)$/)
  if (rolMatch) {
    const codMz = parseInt(rolMatch[1], 10)
    const codPr = parseInt(rolMatch[2], 10)
    try {
      // Buscar por manzana+predio en BaseAPI para obtener datos completos incluyendo m²
      const params = { cod_manzana: codMz, cod_predio: codPr, comuna: codCom }
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([,v]) => v != null))
      ).toString()
      const res = await fetch(`https://api.baseapi.cl/api/v1/sii/avaluo/buscar?${qs}`, {
        headers: { 'X-API-Key': BASEAPI_KEY, 'Accept': 'application/json' },
      })
      if (res.ok) {
        const json = await res.json()
        const predios = json?.data?.predios || []
        const match = predios.find(p => p.manzana === codMz && p.predio === codPr) || predios[0]
        if (match) {
          return Response.json({ multiples: false, resultados: [prediToResultado(match, comuna, unidad)], noEncontrado: false })
        }
      }
    } catch(e) { console.error('[SII ROL detail]', e.message) }
    // Fallback: devolver ROL con datos mínimos — el flujo pedirá m² al usuario
    return Response.json({
      multiples: false, noEncontrado: false,
      resultados: [{
        direccion: '', rol: `${codCom}-${codMz}-${codPr}`,
        cod_comuna: codCom, manzana: codMz, predio: codPr,
        comuna, destino: null, m2_terreno: null, m2_construido: null,
        avaluo_total_clp: null, avaluo_fiscal_uf: null, anio_construccion: null,
        latitud: null, longitud: null, depto: unidad || null,
        link_datainmobiliaria: `https://datainmobiliaria.cl/reports/detalle_propiedad?cod_com=${codCom}&cod_mz=${codMz}&cod_pr=${codPr}`,
      }]
    })
  }

  // ── Búsqueda por dirección ─────────────────────────────────────────────────
  const matchDir = direccion.match(/^(.+?)\s+(\d+\w*)\s*$/)
  const calleRaw = matchDir ? matchDir[1].trim() : direccion
  const calle    = norm(calleRaw)  // BaseAPI espera mayúsculas sin tildes
  const numero   = matchDir ? matchDir[2] : ''

  try {
    let predios = await baseapiSearch(calle, numero, codCom, unidad)

    // Intento 2: sin número (número catastral puede diferir del número postal)
    if (!predios.length && numero) {
      predios = await baseapiSearch(calle, '', codCom, unidad)
    }

    // Intento 3: solo el apellido de la calle (última palabra larga)
    const palabras = calle.split(/\s+/)
    const apellido = palabras.length > 1 ? palabras[palabras.length - 1] : ''
    if (!predios.length && apellido && apellido.length >= 4) {
      predios = await baseapiSearch(apellido, numero, codCom, unidad)
      if (!predios.length) {
        predios = await baseapiSearch(apellido, '', codCom, unidad)
      }
    }

    if (!predios.length) {
      return Response.json({ noEncontrado: true, multiples: false, resultados: [] })
    }

    // Filtrar resultados que no son útiles (estacionamientos, bodegas) a menos que sean los únicos
    const habitacionales = predios.filter(p => {
      const d = (p.destino || '').toUpperCase()
      return !['ESTACIONAMIENTO','BODEGA','BIEN COMUN'].some(x => d.includes(x))
    })
    let items = habitacionales.length > 0 ? habitacionales : predios

    // Filtrar por unidad/depto si hay muchos
    if (unidad && items.length > 1) {
      const uNorm = norm(unidad).replace(/^(DP|DEPTO|DEPARTAMENTO|OF|OFICINA)\s*/, '')
      const fil = items.filter(i => norm(i.direccion || '').includes(uNorm))
      if (fil.length) items = fil
    }

    // Preferir el que tenga m2 construida > 0
    const conM2 = items.filter(i => (i.superficie?.construida || 0) > 0)
    if (conM2.length > 0 && conM2.length < items.length) items = conM2

    const resultados = items.slice(0, 5).map(p => prediToResultado(p, comuna, unidad))
    return Response.json({ multiples: resultados.length > 1, resultados, noEncontrado: false })

  } catch(e) {
    console.error('[SII dir]', e.message)
    return Response.json({ noEncontrado: true, multiples: false, resultados: [], error: e.message })
  }
}
