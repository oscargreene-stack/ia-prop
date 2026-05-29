// app/api/sii/route.js
// Busca propiedad via MCP DataInmobiliaria con token de autenticación Bearer

const MCP_URL = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'

function normalizarTexto(txt) {
  return (txt || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/Ñ/g, 'N').replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function esRol(texto) {
  return /^\s*(rol\s*)?[\d]{3,6}[-\s][\d]{1,4}([-\s][\d]{1,4})?\s*$/i.test(texto.trim())
}

function buildDirSQL(direccion, comunaNorm, unidad) {
  const stopwords = ['AV','AVDA','AVENIDA','CALLE','PASAJE','PSJE','VILLA','POBLACION']
  const tokens = normalizarTexto(direccion).split(' ')
    .filter(t => t.length > 2 && !stopwords.includes(t) && !/^\d{1,2}$/.test(t))
  const mainTokens = tokens.slice(0, 2)
  const likes = mainTokens.length > 0
    ? mainTokens.map(t => `UPPER(c.direccion_sii) LIKE '%${t}%'`).join('\n      AND ')
    : `UPPER(c.direccion_sii) LIKE '%${normalizarTexto(direccion)}%'`

  return `SELECT c.cod_com, c.cod_mz, c.cod_pr, c.direccion_sii,
  cd.descripcion_destino AS destino,
  c.superficie_construccion AS m2_construido,
  c.superficie_total_terreno AS m2_terreno,
  c.ano_construccion,
  ROUND(c.avaluo_fiscal_clp / 40408.0, 0) AS avaluo_fiscal_uf
FROM datainmobiliaria.consolidado c
LEFT JOIN datainmobiliaria.codigo_destino cd ON c.cod_destino = cd.cod_destino
JOIN datainmobiliaria.codigo_comuna_region r ON c.cod_com = r.cod_com
WHERE r.comuna = '${comunaNorm}'
  AND ${likes}
LIMIT 20`
}

function buildRolSQL(rolStr, comunaNorm) {
  const partes = rolStr.replace(/rol\s*/i,'').trim().split(/[-\s]+/).map(Number)
  let whereRol
  if (partes.length === 3) {
    whereRol = `c.cod_com=${partes[0]} AND c.cod_mz=${partes[1]} AND c.cod_pr=${partes[2]}`
  } else {
    whereRol = `c.cod_mz=${partes[0]} AND c.cod_pr=${partes[1]}`
  }
  const comunaFilter = comunaNorm ? `AND r.comuna = '${comunaNorm}'` : ''
  return `SELECT c.cod_com, c.cod_mz, c.cod_pr, c.direccion_sii,
  cd.descripcion_destino AS destino,
  c.superficie_construccion AS m2_construido,
  c.superficie_total_terreno AS m2_terreno,
  c.ano_construccion,
  ROUND(c.avaluo_fiscal_clp / 40408.0, 0) AS avaluo_fiscal_uf
FROM datainmobiliaria.consolidado c
LEFT JOIN datainmobiliaria.codigo_destino cd ON c.cod_destino = cd.cod_destino
JOIN datainmobiliaria.codigo_comuna_region r ON c.cod_com = r.cod_com
WHERE ${whereRol} ${comunaFilter}
LIMIT 10`
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = (searchParams.get('direccion') || '').trim()
  const comuna    = (searchParams.get('comuna')    || '').trim()
  const unidad    = (searchParams.get('unidad')    || '').trim()

  console.log('[SII] Buscando:', direccion, '| Comuna:', comuna, '| Unidad:', unidad)

  if (!direccion) return Response.json({ error: 'Falta dirección o ROL' }, { status: 400 })

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const DI_TOKEN      = process.env.DATAINMOBILIARIA_TOKEN
  if (!ANTHROPIC_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })
  if (!DI_TOKEN)      return Response.json({ error: 'DATAINMOBILIARIA_TOKEN no configurado' }, { status: 500 })

  const comunaNorm   = normalizarTexto(comuna)
  const busquedaRol  = esRol(direccion)
  const sql          = busquedaRol ? buildRolSQL(direccion, comunaNorm) : buildDirSQL(direccion, comunaNorm, unidad)

  console.log('[SII] SQL:', sql.replace(/\s+/g, ' ').slice(0, 200))

  const systemPrompt = `Eres un asistente que ejecuta queries SQL en BigQuery via MCP DataInmobiliaria.
PASOS OBLIGATORIOS: 1) llama data_catalog, 2) llama bq_run_query con el SQL dado, 3) devuelve resultado.
Responde SOLO con JSON válido, sin texto, sin backticks.
Formato: { "filas": [ { "cod_com": number, "cod_mz": number, "cod_pr": number, "direccion_sii": string, "destino": string, "m2_construido": number|null, "m2_terreno": number|null, "ano_construccion": number|null, "avaluo_fiscal_uf": number|null } ] }`

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
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Ejecuta este SQL y devuelve el resultado como JSON:\n\n${sql}` }],
        mcp_servers: [{
          type: 'url',
          url: MCP_URL,
          name: 'datainmobiliaria',
          authorization_token: DI_TOKEN,
        }],
      }),
    })

    const data = await res.json()
    console.log('[SII] Anthropic status:', res.status)

    if (!res.ok) {
      console.error('[SII] Error:', JSON.stringify(data.error).slice(0, 300))
      return Response.json({ error: data.error?.message, multiples: false, resultados: [] }, { status: 500 })
    }

    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    console.log('[SII] Respuesta:', textBlocks.slice(0, 500))

    const match = textBlocks.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ multiples: false, resultados: [], noEncontrado: true })

    const parsed = JSON.parse(match[0])
    let filas = parsed.filas || []
    console.log('[SII] Filas encontradas:', filas.length)

    if (!filas.length) return Response.json({ multiples: false, resultados: [], noEncontrado: true })

    // Filtrar por unidad si hay muchos resultados
    if (unidad && filas.length > 1) {
      const uNorm = normalizarTexto(unidad).replace(/^(DP|DEPTO|DEPARTAMENTO|OF|OFICINA)\s*/, '')
      const filtrado = filas.filter(f => normalizarTexto(f.direccion_sii || '').includes(uNorm))
      if (filtrado.length > 0) filas = filtrado
    }

    return Response.json({
      multiples: filas.length > 1,
      resultados: filas.map(f => ({
        direccion:         f.direccion_sii || '',
        rol:               `${f.cod_com}-${f.cod_mz}-${f.cod_pr}`,
        cod_com:           f.cod_com,
        cod_mz:            f.cod_mz,
        cod_pr:            f.cod_pr,
        destino:           f.destino || '',
        m2_construido:     f.m2_construido,
        m2_terreno:        f.m2_terreno,
        anio_construccion: f.ano_construccion,
        avaluo_fiscal_uf:  f.avaluo_fiscal_uf,
      })),
    })

  } catch (err) {
    console.error('[SII] Error:', err.message)
    return Response.json({ error: err.message, multiples: false, resultados: [] }, { status: 500 })
  }
}
