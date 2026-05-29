// app/api/sii/route.js
// Retorna directamente noEncontrado para que el flujo continúe sin SII
// El token de DataInmobiliaria MCP no funciona desde Vercel (requiere OAuth Google)
// Los datos del SII se piden manualmente al usuario en el chat

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const direccion = (searchParams.get('direccion') || '').trim()
  const comuna    = (searchParams.get('comuna')    || '').trim()
  const unidad    = (searchParams.get('unidad')    || '').trim()

  // Construir dirección completa para mostrar al usuario
  const dirCompleta = [direccion, unidad, comuna].filter(Boolean).join(', ')

  // Por ahora retornamos noEncontrado para que el flujo continúe sin SII
  // TODO: integrar DataInmobiliaria REST API cuando esté disponible
  return Response.json({
    multiples: false,
    resultados: [],
    noEncontrado: true,
    dirCompleta,
  })
}
