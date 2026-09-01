// test/predio.test.mjs — `npm test`
// Buscador /api/predio con el proveedor mockeado. Las filas del catastro son
// REALES (tabla consolidado de Data Inmobiliaria) para los tres casos que se
// arreglaron: busqueda por ROL, prioridad de la unidad y umbral de calle.
process.env.DATAINMOBILIARIA_TOKEN = 'test-token'
process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY = 'test-gkey'

const LB = { lat: -33.35095, lng: -70.54556 }         // condominio V. del Monasterio 2577
const PROV_CAL = { lat: -33.436961, lng: -70.605342 } // CALIFORNIA 2131
const PROV_AND = { lat: -33.436509, lng: -70.605579 } // ANDACOLLO 2131

const fila = (o) => ({
  cod_com: 15161, cod_mz: 3669, copropiedad: true, cod_destino: 'H',
  superficie_construccion: 164, superficie_total_terreno: 0, ano_construccion: 2004,
  lat: LB.lat, lng: LB.lng, ...o,
})

// Las 27 casas del condominio, tal como las devuelve el catastro (mismo punto).
const CONDOMINIO = Array.from({ length: 27 }, (_, i) =>
  fila({ cod_pr: 461 + i, direccion_sii: `AV V DEL MONASTERIO 2577 - ${i + 1} CASA ${i + 1}   ` }))

const PROVIDENCIA = [
  { cod_com: 15103, cod_mz: 2730, cod_pr: 7, direccion_sii: 'ANDACOLLO 2131   ', cod_destino: 'H',
    superficie_construccion: 140, superficie_total_terreno: 200, lat: PROV_AND.lat, lng: PROV_AND.lng },
  { cod_com: 15103, cod_mz: 3130, cod_pr: 7, direccion_sii: 'CALIFORNIA 2131  ', cod_destino: 'H',
    superficie_construccion: 157, superficie_total_terreno: 210, lat: PROV_CAL.lat, lng: PROV_CAL.lng },
  { cod_com: 15103, cod_mz: 2730, cod_pr: 17, direccion_sii: 'CALIFORNIA 2130  ', cod_destino: 'H',
    superficie_construccion: 137, superficie_total_terreno: 190, lat: -33.436649, lng: -70.605534 },
]

let mock = {}
globalThis.fetch = async (url, opts) => {
  const u = String(url)
  if (u.includes('maps.googleapis.com')) {
    return { ok: true, json: async () => ({ status: 'OK', results: [{ geometry: { location: mock.geocode } }] }) }
  }
  if (u.includes('propiedades/detalle')) {
    mock.detalleQs = u.split('?')[1]
    return { ok: !!mock.detalle, status: mock.detalle ? 200 : 404, json: async () => mock.detalle }
  }
  if (u.includes('busqueda_poligono')) {
    const page = JSON.parse(opts.body).page
    return { status: 200, text: async () => JSON.stringify({ resultados: page === 1 ? (mock.catastro || []) : [] }) }
  }
  throw new Error('fetch inesperado: ' + u)
}

const { POST } = await import('../app/api/predio/route.js')
const call = async (body, cfg = {}) => {
  mock = { geocode: LB, ...cfg }
  const req = { url: 'http://x/api/predio?debug=1', json: async () => body }
  return JSON.parse(await (await POST(req)).text())
}

let fail = 0
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '\n         ' + JSON.stringify(extra)))
  if (!cond) fail++
}

console.log('\n1) BUSQUEDA POR ROL')
// El detalle devuelve una venta cercana georreferenciada (no del mismo ROL).
const detalleVecino = {
  detalle_ventas_recientes: [
    { cod_com: 15161, cod_mz: 3669, cod_pr: 470, latitud: LB.lat, longitud: LB.lng, distancia_metros: 12, price: 9000 },
  ],
}

for (const [entrada, comuna] of [['3669-481', 'Lo Barnechea'], ['03669-481', 'Lo Barnechea'],
                                 ['15161-3669-481', ''], [' 15161 - 3669 - 481 ', 'Lo Barnechea']]) {
  const r = await call({ direccion: entrada, comuna }, { detalle: detalleVecino, catastro: CONDOMINIO })
  ok(`"${entrada}" -> ROL 15161-3669-481`,
    r._modo === 'real_rol' && r.total === 1 && r.candidatos[0].rol === '15161-3669-481'
    && r.candidatos[0].direccion === 'AV V DEL MONASTERIO 2577 - 21 CASA 21',
    { modo: r._modo, cands: r.candidatos })
}
{
  const r = await call({ direccion: '3669-481' }, { detalle: detalleVecino, catastro: CONDOMINIO })
  ok('ROL parcial SIN comuna -> pide la comuna, no geocodifica',
    r._modo === 'rol_sin_comuna' && /comuna/i.test(r.mensaje), { modo: r._modo, msg: r.mensaje })
}
{
  const r = await call({ direccion: '3669-481', comuna: 'Vina del Mar' }, { detalle: detalleVecino, catastro: CONDOMINIO })
  ok('ROL con comuna fuera del mapa -> pide la comuna', r._modo === 'rol_sin_comuna', { modo: r._modo })
}
{
  // El proveedor cae: la respuesta debe llevar cabeceras CORS (los clientes C2C
  // llaman desde el navegador), no un 500 pelado.
  const prevFetch = globalThis.fetch
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('busqueda_poligono')) throw new Error('socket hang up')
    return prevFetch(url, opts)
  }
  mock = { geocode: LB, detalle: detalleVecino }
  const res = await POST({ url: 'http://x/api/predio', json: async () => ({ direccion: '3669-481', comuna: 'Lo Barnechea' }) })
  const j = JSON.parse(await res.text())
  globalThis.fetch = prevFetch
  ok('error de red en la ruta ROL -> JSON con CORS, no 500',
    j._modo === 'servicio_no_disponible' && res.headers.get('Access-Control-Allow-Origin') === '*',
    { modo: j._modo, cors: res.headers.get('Access-Control-Allow-Origin') })
}
{
  // Ancla lejana: el cuadrado se dimensiona con distancia_metros + holgura.
  const lejos = { detalle_ventas_recientes: [
    { cod_com: 15161, cod_mz: 3669, cod_pr: 470, latitud: LB.lat, longitud: LB.lng, distancia_metros: 240, price: 9000 },
  ] }
  const r = await call({ direccion: '3669-481', comuna: 'Lo Barnechea' }, { detalle: lejos, catastro: CONDOMINIO })
  ok('ancla lejana: igual encuentra el ROL', r._modo === 'real_rol' && r.total === 1, { modo: r._modo })
}
{
  const r = await call({ direccion: '3669-99999', comuna: 'Lo Barnechea' }, { detalle: detalleVecino, catastro: CONDOMINIO })
  ok('ROL inexistente -> mensaje claro, no candidato equivocado',
    r._modo === 'rol_no_encontrado' && r.total === 0, { modo: r._modo, total: r.total })
}
{
  const r = await call({ direccion: '3669-481', comuna: 'Lo Barnechea', lat: LB.lat, lng: LB.lng },
    { detalle: null, catastro: CONDOMINIO })
  ok('con lat/lng del payload no llama al detalle', r._modo === 'real_rol' && mock.detalleQs === undefined,
    { modo: r._modo, qs: mock.detalleQs })
}
{
  const r = await call({ direccion: 'Los Militares 5001', comuna: 'Las Condes' },
    { catastro: [{ cod_com: 15108, cod_mz: 1, cod_pr: 1, direccion_sii: 'AV LOS MILITARES 5001', superficie_construccion: 120, lat: LB.lat, lng: LB.lng }] })
  ok('una direccion normal NO se toma por ROL', r._modo === 'real', { modo: r._modo })
}

console.log('\n2) PRIORIZAR LA UNIDAD')
{
  const r = await call({ direccion: 'Valle del Monasterio 2577', comuna: 'Lo Barnechea', depto: '21' },
    { catastro: CONDOMINIO })
  ok('casa 21 sale primera (y unica)', r.candidatos[0]?.direccion.includes('CASA 21') && r.total === 1,
    { total: r.total, dirs: r.candidatos.map(c => c.direccion) })
}
{
  const r = await call({ direccion: 'Valle del Monasterio 2577 casa 21', comuna: 'Lo Barnechea' },
    { catastro: CONDOMINIO })
  ok('unidad escrita en la direccion ("casa 21")', r.candidatos[0]?.direccion.includes('CASA 21'),
    { dirs: r.candidatos.map(c => c.direccion) })
}
{
  const r = await call({ direccion: 'Valle del Monasterio 2577 - 21', comuna: 'Lo Barnechea' },
    { catastro: CONDOMINIO })
  ok('unidad escrita con guion ("- 21")', r.candidatos[0]?.direccion.includes('CASA 21'),
    { dirs: r.candidatos.map(c => c.direccion) })
}
{
  const r = await call({ direccion: 'Valle del Monasterio 2577', comuna: 'Lo Barnechea' },
    { catastro: CONDOMINIO })
  ok('sin unidad: sigue devolviendo el selector de 8', r.total === 8, { total: r.total })
}
{
  // Edificio: la unidad va con prefijo DP, como en Luis Carrera 2870.
  const edificio = Array.from({ length: 20 }, (_, i) => fila({
    cod_pr: 42 + i, direccion_sii: `AV VALLE MONASTERIO 2298 DP ${101 + i} - 10  `,
  }))
  const r = await call({ direccion: 'Valle Monasterio 2298', comuna: 'Lo Barnechea', depto: 'Depto 115' },
    { catastro: edificio })
  ok('depto con prefijo sigue funcionando (DP 115)',
    r.total === 1 && r.candidatos[0].direccion.includes('DP 115'),
    { total: r.total, dirs: r.candidatos.map(c => c.direccion) })
}

console.log('\n3) UMBRAL DE CALLE')
{
  const r = await call({ direccion: 'California 2131', comuna: 'Providencia' },
    { geocode: PROV_CAL, catastro: PROVIDENCIA })
  ok('California 2131 -> CALIFORNIA 2131 (no ANDACOLLO)',
    r.total === 1 && r.candidatos[0].direccion === 'CALIFORNIA 2131', { dirs: r.candidatos.map(c => c.direccion) })
}
{
  // Geocode desviado hacia Andacollo: aun asi no debe cruzar de calle.
  const r = await call({ direccion: 'California 2131', comuna: 'Providencia' },
    { geocode: PROV_AND, catastro: PROVIDENCIA })
  ok('geocode desviado: sigue sin cruzar a ANDACOLLO',
    r.candidatos.every(c => c.direccion.startsWith('CALIFORNIA')), { dirs: r.candidatos.map(c => c.direccion) })
}
{
  // La calle correcta existe pero con OTRO numero: mejor el vecino de la misma
  // calle que el numero exacto de otra calle.
  const r = await call({ direccion: 'California 2135', comuna: 'Providencia' },
    { geocode: PROV_CAL, catastro: PROVIDENCIA })
  ok('numero inexistente: se queda en CALIFORNIA',
    r.candidatos.length > 0 && r.candidatos.every(c => c.direccion.startsWith('CALIFORNIA')),
    { dirs: r.candidatos.map(c => c.direccion) })
}
{
  // Abreviatura del SII: "AV VALLE DEL MONAST" vs "Valle del Monasterio".
  const abrev = [fila({ cod_pr: 900, direccion_sii: 'AV VALLE DEL MONAST 2577 CASA 21' })]
  const r = await call({ direccion: 'Valle del Monasterio 2577', comuna: 'Lo Barnechea' }, { catastro: abrev })
  ok('tolera la abreviatura del SII (MONAST)', r.total === 1, { total: r.total, dbg: r._debug?.calle })
}
{
  // Si NINGUN candidato calza el nombre, no se responde vacio.
  const raro = [{ cod_com: 15103, cod_mz: 1, cod_pr: 1, direccion_sii: 'XX 2131', superficie_construccion: 100, lat: PROV_CAL.lat, lng: PROV_CAL.lng }]
  const r = await call({ direccion: 'California 2131', comuna: 'Providencia' }, { geocode: PROV_CAL, catastro: raro })
  ok('sin ningun match de calle: no devuelve vacio', r.total === 1, { total: r.total })
}

console.log('\n4) COORDENADA DEL CATASTRO (zona del Plan Regulador)')
{
  // /api/tasar resuelve la zona del PRC sobre este punto. Si no viaja, cae al
  // geocoder de Google, que devuelve puntos distintos entre corridas: la casa
  // 21 de V. del Monasterio esta a 55 m del borde de su zona (ZHE-2.1) y a
  // 507 m de ZM-6a, asi que el vaiven cambiaba el predial minimo de 630 a 400.
  const r = await call({ direccion: '3669-481', comuna: 'Lo Barnechea' },
    { detalle: detalleVecino, catastro: CONDOMINIO })
  const c = r.candidatos?.[0] || r.propiedad
  ok('la propiedad viaja con la coordenada del catastro',
    c && c.latitud === LB.lat && c.longitud === LB.lng, { lat: c?.latitud, lng: c?.longitud })
}
{
  const r = await call({ direccion: 'Valle del Monasterio 2577 casa 21', comuna: 'Lo Barnechea' },
    { catastro: CONDOMINIO })
  const c = r.candidatos?.[0]
  ok('tambien por busqueda de direccion',
    c && c.latitud === LB.lat && c.longitud === LB.lng, { lat: c?.latitud, lng: c?.longitud })
}

console.log('\n' + (fail ? `${fail} FALLARON` : 'TODOS LOS TESTS PASARON'))
process.exit(fail ? 1 : 0)
