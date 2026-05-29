// app/api/sii/route.js
// Busca la propiedad en BigQuery (datainmobiliaria) por dirección o ROL

const MCP_URL = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'

function esRol(texto) {
  // Formatos: "1234-56", "ROL 1234-56", "15108-3818-99"
  return /^\s*(rol\s*)?[\d]{3,6}[-\s][\d]{1,4}([-\s][\d]{1,4})?\s*$/i.test(texto.trim())
}

function normalizarTexto(txt) {
  return txt.toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/Ñ/g, 'N')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSQL(direccion, comuna, unidad) {
  const dirNorm = normalizarTexto(direccion)
  const comunaNorm = normalizarTexto(comuna)

  // Extraer tokens útiles de la dirección (ignorar palabras genéricas)
  const stopwords = ['AV','AVDA','AVENIDA','CALLE','PASAJE','PSJE','VILLA','POBLACION','NUM','N','S','SUR','NTE','OTE','PTE']
  const tokens = dirNorm.split(' ').filter(t => t.length > 2 && !stopwords.includes(t))
  
  // Usar los 2 tokens más distintivos para el LIKE
  const mainTokens = tokens.slice(0, 2)
  const likeConditions = mainTokens.map(t => `UPPER(c.direccion_sii) LIKE '%${t}%'`).join(' AND ')

  const sql = `
    SELECT 
      c.cod_com, c.cod_mz, c.cod_pr,
      c.direccion_sii,
      cd.descripcion_destino AS destino,
      c.superficie_construccion AS m2_construido,
      c.superficie_total_terreno AS m2_terreno,
      c.ano_construccion AS anio_construccion,
      ROUND(c.avaluo_fiscal_clp / 40408.0, 0) AS avaluo_fiscal_uf,
      c.avaluo_fiscal_clp,
      c.latitud, c.longitud
    FROM datainmobiliaria.consolidado c
    LEFT JOIN datainmobiliaria.codigo_destino cd ON c.cod_destino = cd.cod_destino
    JOIN datainmobiliaria.codigo_comuna_region r ON c.cod_com = r.cod_com
    WHERE r.comuna = '${comunaNorm}'
      AND ${likeConditions || "UPPER(c.direccion_sii) LIKE '%' || UPPER('${dirNorm}') || '%'"}
    LIMIT 20
  `
  return sql.trim()
}

function buildRolSQL(rolStr, comunaNorm) {
  // Parsear ROL: puede ser "cod_mz-cod_pr" o "cod_com-cod_mz-cod_pr"
  const partes = rolStr.replace(/rol\s*/i,'').trim().split(/[-\s]+/).map(Number)
  
  let whereRol
  if (partes.length === 3) {
    whereRol = `c.cod_com=${partes[0]} AND c.cod_mz=${partes[1]} AND c.cod_pr=${partes[2]}`
  } else if (partes.length === 2 && comunaNorm) {
    whereRol = `c.cod_mz=${partes[0]} AND c.cod_pr=${partes[1]}`
  } else {
    return null
  }

  const comunaFilter = comunaNorm ? `AND r.comuna = '${comunaNorm}'` : ''

  return `
    SELECT 
      c.cod_com, c.cod_mz, c.cod_pr,
      c.direccion_sii,
      cd.descripcion_destino AS destino,
      c.superficie_construccion AS m2_construido,
      c.superficie_total_terreno AS m2_terreno,
      c.ano_construccion AS anio_construccion,
      ROUND(c.avaluo_fiscal_clp / 40408.0, 0) AS avaluo_fiscal_uf,
      c.avaluo_fiscal_clp,
      c.latitud, c.longitud
    FROM datainmobiliaria.consolidado c
    LEFT JOIN datainmobiliaria.codigo_destino cd ON c.cod_destino = cd.cod_destino
    JOIN datainmobiliaria.codigo_comuna_region r ON c.cod_com = r.cod_com
    WHERE ${whereRol} ${comunaFilter}
    LIMIT 5
  `.trim()
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = (searchParams.get('direccion') || '').trim()
  const comuna    = (searchParams.get('comuna')    || '').trim()
  const unidad    = (searchParams.get('unidad')    || '').trim()

  console.log('[SII] Buscando:', direccion, '| Comuna:', comuna, '| Unidad:', unidad)

  if (!direccion) return Response.json({ error: 'Falta dirección o ROL' }, { status: 400 })

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  const comunaNorm = normalizarTexto(comuna)
  const esBusquedaRol = esRol(direccion)

  const sql = esBusquedaRol
    ? buildRolSQL(direccion, comunaNorm)
    : buildSQL(direccion, comunaNorm, unidad)

  if (!sql) {
    return Response.json({ error: 'ROL inválido', multiples: false, resultados: [] }, { status: 400 })
  }

  console.log('[SII] SQL:', sql.replace(/\s+/g, ' '))

  const systemPrompt = `Eres un asistente que ejecuta queries SQL en BigQuery usando la herramienta bq_run_query del MCP de DataInmobiliaria.
Responde SOLO con un JSON válido, sin texto adicional, sin backticks, sin markdown.
Estructura esperada:
{
  "filas": [
    {
      "cod_com": number,
      "cod_mz": number,
      "cod_pr": number,
      "direccion_sii": string,
      "destino": string,
      "m2_construido": number | null,
      "m2_terreno": number | null,
      "anio_construccion": number | null,
      "avaluo_fiscal_uf": number | null,
      "avaluo_fiscal_clp": number | null
    }
  ],
  "total": number
}
Si la query no devuelve filas, devuelve { "filas": [], "total": 0 }.`

  const userPrompt = `Ejecuta esta query SQL con bq_run_query y devuelve el resultado como JSON:

${sql}`

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
        messages: [{ role: 'user', content: userPrompt }],
        mcp_servers: [{ type: 'url', url: MCP_URL, name: 'datainmobiliaria' }],
      }),
    })

    const data = await res.json()
    console.log('[SII] Anthropic status:', res.status)

    if (!res.ok) {
      console.error('[SII] Error Anthropic:', JSON.stringify(data.error))
      return Response.json({ error: data.error?.message, multiples: false, resultados: [] }, { status: 500 })
    }

    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    console.log('[SII] Respuesta (400c):', textBlocks.slice(0, 400))

    const match = textBlocks.replace(/```json|```/g, '').trim().match(/\{[\s\S]*\}/)
    if (!match) {
      return Response.json({ multiples: false, resultados: [], noEncontrado: true })
    }

    const parsed = JSON.parse(match[0])
    const filas = parsed.filas || []
    console.log('[SII] Filas encontradas:', filas.length)

    if (!filas.length) {
      return Response.json({ multiples: false, resultados: [], noEncontrado: true })
    }

    // Filtrar por unidad si viene
    let resultado = filas
    if (unidad && filas.length > 1) {
      const uNorm = normalizarTexto(unidad)
      const filtrado = filas.filter(f =>
        normalizarTexto(f.direccion_sii || '').includes(uNorm)
      )
      if (filtrado.length > 0) resultado = filtrado
    }

    const normalizadas = resultado.map(f => ({
      direccion:         f.direccion_sii || '',
      rol:               `${f.cod_com}-${f.cod_mz}-${f.cod_pr}`,
      cod_com:           f.cod_com,
      cod_mz:            f.cod_mz,
      cod_pr:            f.cod_pr,
      destino:           f.destino || '',
      m2_construido:     f.m2_construido,
      m2_terreno:        f.m2_terreno,
      anio_construccion: f.anio_construccion,
      avaluo_fiscal_uf:  f.avaluo_fiscal_uf,
      avaluo_fiscal_clp: f.avaluo_fiscal_clp,
    }))

    return Response.json({
      multiples: normalizadas.length > 1,
      resultados: normalizadas,
    })

  } catch (err) {
    console.error('[SII] Error:', err.message)
    return Response.json({ error: err.message, multiples: false, resultados: [] }, { status: 500 })
  }
}
