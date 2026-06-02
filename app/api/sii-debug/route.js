// app/api/sii-debug/route.js — TEMPORAL para ver respuesta cruda BaseAPI

const BASEAPI_KEY = process.env.BASEAPI_KEY || "sk_e6c42f75862f399286099e1459461f01"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const comuna = searchParams.get('comuna') || '13114'
  const calle  = searchParams.get('calle')  || 'CAMINO OTONAL'
  const numero = searchParams.get('numero') || '1201'

  const url = `https://api.baseapi.cl/api/v1/sii/avaluo/buscar?comuna=${comuna}&calle=${encodeURIComponent(calle)}&numero=${encodeURIComponent(numero)}`
  console.log('Calling BaseAPI:', url)

  const res = await fetch(url, { headers: { 'x-api-key': BASEAPI_KEY } })
  console.log('BaseAPI status:', res.status)

  const text = await res.text()
  console.log('BaseAPI response:', text.slice(0, 500))

  return Response.json({ url, status: res.status, body: JSON.parse(text) })
}
