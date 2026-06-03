// app/api/debug/route.js  — temporal, eliminar en producción
export async function GET(request) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const MCP_URL       = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
  const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: 'Run the SQL using bq_run_query and return ONLY the raw JSON array. No markdown.',
    messages: [{ role: 'user', content: 'Run this SQL and return only the JSON array:\nSELECT 1 AS test_val' }],
    mcp_servers: [{ type: 'url', url: MCP_URL, name: 'datainmobiliaria', authorization_token: DATAINM_TOKEN }],
  })

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'mcp-client-2025-04-04',
      },
      body,
    })

    const statusCode = res.status
    const responseText = await res.text()
    let parsed
    try { parsed = JSON.parse(responseText) } catch(e) { parsed = null }

    return Response.json({
      status: statusCode,
      ok: res.ok,
      has_anthropic_key: !!ANTHROPIC_KEY,
      has_mcp_token: !!DATAINM_TOKEN,
      mcp_url: MCP_URL,
      anthropic_response: parsed || responseText.slice(0, 1000),
    })
  } catch(e) {
    return Response.json({ error: e.message })
  }
}
