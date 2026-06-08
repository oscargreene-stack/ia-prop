// app/api/resttest/route.js  — DIAGNÓSTICO TEMPORAL (borrar antes de merge)
// Prueba server-side el endpoint REST de DataInmobiliaria con los tokens del entorno.
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const rol = searchParams.get('rol') || '15108-202-66'
  const parts = String(rol).split('-')
  const cc = parts[0], cm = parts[1], cp = parts[2]
  const base = 'https://datainmobiliaria.cl/api/v1/propiedades/detalle'
  const qs = 'cod_com=' + cc + '&cod_mz=' + cm + '&cod_pr=' + cp + '&radio=1500&superficie_min=44&superficie_max=116'
  const url = base + '?' + qs
  const tokens = {
    DATAINMOBILIARIA_TOKEN: process.env.DATAINMOBILIARIA_TOKEN,
    BASEAPI_KEY: process.env.BASEAPI_KEY,
  }
  const results = {}
  for (const name of Object.keys(tokens)) {
    const tok = tokens[name]
    if (!tok) { results[name] = { skip: 'sin valor en env' }; continue }
    try {
      const rr = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } })
      const txt = await rr.text()
      let struct = null
      try {
        const j = JSON.parse(txt)
        const cf = j.comparables_filtro || []
        const vr = j.detalle_ventas_recientes || []
        struct = {
          keys: Object.keys(j),
          comparables_filtro_count: Array.isArray(cf) ? cf.length : null,
          comparables_filtro_0: Array.isArray(cf) && cf[0] ? cf[0] : null,
          ventas_recientes_count: Array.isArray(vr) ? vr.length : null,
          ventas_recientes_0: Array.isArray(vr) && vr[0] ? vr[0] : null,
          detalle_mercado: j.detalle_mercado || null
        }
      } catch (e) { struct = { parseErr: String(e).slice(0,120) } }
      results[name] = { status: rr.status, struct, bodyLen: txt.length }
    } catch (e) {
      results[name] = { err: String(e).slice(0, 200) }
    }
  }
  return Response.json({ rol, results })
}
