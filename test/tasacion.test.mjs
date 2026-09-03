// test/tasacion.test.mjs — parte de `npm test`
// Jerarquía de métodos de valorización. Los datos son REALES: ventas CBR del
// condominio de AV V DEL MONASTERIO 2577 (cbr_limpio x consolidado, unidades
// con cod_com_bc=15161 cod_mz_bc=3669 cod_pr_bc=90461) e índice de plusvalía de
// Lo Barnechea.
import {
  valorComparativoDirecto, rangoUnidadesIdenticas, terrenoEsProrrateoBC,
  ventasGemelas, sinOutliersConjunto, factorFecha, percentilInterp,
  valorAditivoCasa, tasaApreciacionConjunto, acotaFactor, anosEntre, confianzaPorN,
  construirSerieMercado, CONJUNTO, PCTL_BASE,
} from '../app/lib/tasacion-core.js'

const M2 = 164
const HOY = '2026-09-01'
const REMO_UF_M2 = { ninguna: 0, baja: 5, media: 10, alta: 20 }

// Las 20 ventas CBR del condominio (consulta completa, no una muestra). El
// `rol` importa: hay unidades que se vendieron DOS veces (casas 12, 3 y 8) y
// esas ventas repetidas son la evidencia dura de cuánto se aprecia el conjunto.
export const VENTAS = [
  { casa: 12, rol: '15161-3669-472', fecha: '2025-09-10', m2: 164, uf: 18400 },
  { casa: 17, rol: '15161-3669-477', fecha: '2025-09-01', m2: 164, uf: 17400 },
  { casa: 14, rol: '15161-3669-474', fecha: '2025-01-23', m2: 164, uf: 15500 },
  { casa: 19, rol: '15161-3669-479', fecha: '2022-05-03', m2: 164, uf: 16700 },
  { casa: 24, rol: '15161-3669-484', fecha: '2021-11-25', m2: 164, uf: 7297.21 }, // entre relacionados
  { casa:  2, rol: '15161-3669-462', fecha: '2021-03-04', m2: 164, uf: 15850 },
  { casa: 22, rol: '15161-3669-482', fecha: '2020-11-23', m2: 164, uf: 14750 },
  { casa:  3, rol: '15161-3669-463', fecha: '2019-01-31', m2: 164, uf: 14350 },
  { casa:  5, rol: '15161-3669-465', fecha: '2018-11-30', m2: 164, uf: 14750 },
  { casa: 18, rol: '15161-3669-478', fecha: '2018-11-30', m2: 140, uf: 14400 }, // otra tipología
  { casa: 26, rol: '15161-3669-486', fecha: '2018-09-11', m2: 164, uf: 14000 },
  { casa:  6, rol: '15161-3669-466', fecha: '2018-01-31', m2: 164, uf: 14500 },
  { casa: 12, rol: '15161-3669-472', fecha: '2017-01-18', m2: 164, uf: 13250 }, // 2ª venta de la 12
  { casa: 25, rol: '15161-3669-485', fecha: '2016-01-29', m2: 164, uf: 8214 },  // entre relacionados
  { casa: 27, rol: '15161-3669-487', fecha: '2015-12-29', m2: 164, uf: 14200 },
  { casa:  8, rol: '15161-3669-468', fecha: '2014-10-09', m2: 164, uf: 12000 },
  { casa: 13, rol: '15161-3669-473', fecha: '2013-12-16', m2: 164, uf: 11100 },
  { casa: 10, rol: '15161-3669-470', fecha: '2013-10-29', m2: 164, uf: 11650 },
  { casa:  3, rol: '15161-3669-463', fecha: '2013-09-27', m2: 164, uf: 11350 }, // 2ª venta de la 3
  { casa:  8, rol: '15161-3669-468', fecha: '2013-01-23', m2: 164, uf: 10850 }, // 2ª venta de la 8
]

// Índice de plusvalía del sector (mediana UF/m² anual, Lo Barnechea): plano.
export const INDICE = [
  ['2015-06', 76.3], ['2016-06', 74.6], ['2017-06', 79.2], ['2018-06', 81.8],
  ['2019-06', 85.5], ['2020-06', 84.7], ['2021-06', 90.7], ['2022-06', 92.3],
  ['2023-06', 91.7], ['2024-06', 90.1], ['2025-06', 91.4], ['2026-06', 87.6],
].map(([trimestre, uf_m2]) => ({ trimestre, uf_m2 }))

// El índice que rompió producción: 13,5% anual compuesto. Es el que sale de
// `detalle_mercado` cuando el sector mezcla tipologías (56% "otro"). Aplicado a
// 8 años llevaba la venta de 2019 (87,5 UF/m²) a ~148 UF/m² — un valor que
// nunca existió en el conjunto — y la tasación a 19.285 UF, sobre TODAS las
// ventas nominales del condominio (máximo real: 18.400 UF).
export const INDICE_PLENO = Array.from({ length: 12 }, (_, i) => ({
  trimestre: (2015 + i) + '-06',
  uf_m2: Math.round(60 * Math.pow(1.135, i) * 10) / 10,
}))

// Reproduce la cadena de /api/tasar: base comparativa -> premio de
// remodelación -> regla de coherencia sobre el TOTAL. Igual que la ruta, la
// coherencia usa el MISMO índice real que el ajuste por fecha.
export function tasa({ remodelacion = 'ninguna', serieIndice = INDICE, meses, ventas = VENTAS } = {}) {
  const c = valorComparativoDirecto({ ventas, m2Objetivo: M2, serieIndice, hoy: HOY, meses })
  const rango = rangoUnidadesIdenticas({ ventas, m2Objetivo: M2, hoy: HOY, serieIndice })
  if (!c) return { c: null, rango, final: null }
  const ajRemo = Math.round((REMO_UF_M2[remodelacion] || 0) * M2)
  const total = c.valor_uf + ajRemo
  const final = rango ? Math.min(rango.max_uf, Math.max(rango.min_uf, total)) : total
  return { c, rango, ajRemo, total, final, clamp: final !== total }
}

let fail = 0
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '\n         ' + JSON.stringify(extra)))
  if (!cond) fail++
}
const entre = (x, lo, hi) => x >= lo && x <= hi

console.log('\n4) JERARQUIA DE METODOS — casa 21 de V. del Monasterio 2577')
{
  // El caso reportado: 11.404 UF contra ventas reales que nunca bajaron de 14.350.
  const viejo = valorAditivoCasa({ sueloUfM2: 14.5, m2Terreno: 368, costoUfM2: 37, m2Construido: M2 })
  ok('el aditivo con terreno prorrateado daba 11.404 UF', viejo.total_uf === 11404, { viejo })
}
{
  // El valor NUNCA puede superar el maximo de una unidad identica de los
  // ultimos 24 meses llevado a hoy con la variacion REAL del mercado. Ese es
  // el limite duro que produccion violaba (daba 19.285 UF).
  const r = tasa({ remodelacion: 'ninguna' })
  const techo = tasa().rango.max_uf
  ok('sin remodelar queda bajo el maximo de identicas llevado a hoy', r.final <= techo, { final: r.final, techo })
  ok('sin remodelar queda bajo el maximo nominal de 18.400 UF por si solo',
    r.final < 18400, { final: r.final })
  // Encaje del ladder dentro de la realidad que describio el dueño del caso:
  // "las casas no remodeladas cuestan entre 14 y 15 mil, las remodeladas
  // desde 15 a 17". Con el ajuste por indice REAL el modelo cae ahi solo.
  ok('sin remodelar cae en 14.500-15.500 UF', entre(r.final, 14500, 15500), { final: r.final })
}
{
  const r = tasa({ remodelacion: 'media' })
  ok('remodelacion media cae en 16.000-17.000 UF', entre(r.final, 16000, 17000), { final: r.final })
}
{
  // Monotonía: más remodelación nunca puede valer menos.
  const v = ['ninguna', 'baja', 'media', 'alta'].map((e) => tasa({ remodelacion: e }).final)
  ok('el valor no baja al subir la calidad de la remodelacion',
    v.every((x, i) => i === 0 || x >= v[i - 1]), { v })
}
{
  const r = tasa({ remodelacion: 'ninguna' })
  ok('la base usa el percentil ' + PCTL_BASE + ' del rango de gemelas',
    r.c.percentil_usado === PCTL_BASE && r.c.valor_uf === Math.round(r.c.uf_m2 * M2),
    { pctl: r.c.percentil_usado, uf_m2: r.c.uf_m2, valor: r.c.valor_uf })
}

console.log('\n5) OUTLIERS DEL CONJUNTO')
{
  const g = ventasGemelas({ ventas: VENTAS, m2Objetivo: M2, hoy: HOY })
  const { limpias, descartadas } = sinOutliersConjunto(g)
  ok('descarta la venta entre relacionados (7.297 UF / 44,5 UF/m2)',
    descartadas.length === 1 && descartadas[0].casa === 24, { descartadas: descartadas.map(d => d.casa) })
  ok('no descarta ninguna venta de mercado', limpias.length === g.length - 1, { n: limpias.length, g: g.length })
}
{
  // Sin muestra suficiente no se filtra nada: 2 ventas no definen una mediana.
  const dos = VENTAS.slice(0, 2)
  const { descartadas } = sinOutliersConjunto(ventasGemelas({ ventas: dos, m2Objetivo: M2, hoy: HOY }))
  ok('con menos de 3 ventas no descarta nada', descartadas.length === 0, { descartadas })
}

console.log('\n6) TIPOLOGIA Y VENTANA')
{
  const g = ventasGemelas({ ventas: VENTAS, m2Objetivo: M2, hoy: HOY })
  ok('excluye la casa 18 (140 m2, fuera del +-10%)', !g.some((x) => x.casa === 18), { casas: g.map(x => x.casa) })
  ok('excluye la venta de 2014 (fuera de los ' + CONJUNTO.mesesMax + ' meses)',
    !g.some((x) => x.casa === 8), { casas: g.map(x => x.casa) })
  ok('conserva las 10 ventas de 164 m2 de la ventana', g.length === 10, { n: g.length })
}

console.log('\n7) AJUSTE POR FECHA — LA VARIACION REAL DEL MERCADO, EN AMBAS DIRECCIONES')
{
  ok('sin serie utilizable el factor es 1', factorFecha('2019-01-31', null) === 1)
  // El contrato pedido por el dueño del producto: "si el mercado subio un 3%
  // desde que se compro la propiedad, esta sube un 3%; si bajo un 1%, baja un
  // 1%". El factor es el nivel actual del indice sobre el nivel a la fecha de
  // la venta (interpolado), SIN tasa fija ni tope de tasa anual.
  const f2019 = factorFecha('2019-01-31', INDICE, HOY)
  ok('una venta vieja sube exactamente lo que subio el mercado (2019: +4,3%)',
    entre(f2019, 1.03, 1.06), { f: f2019 })
  const f2509 = factorFecha('2025-09-10', INDICE, HOY)
  ok('una venta reciente BAJA si el mercado bajo desde entonces (sep-25: -3,2%)',
    entre(f2509, 0.95, 0.99), { f: f2509 })
  const f2022 = factorFecha('2022-05-03', INDICE, HOY)
  ok('el mercado cayo desde el peak 2022: esa venta se ajusta hacia ABAJO',
    f2022 < 1, { f: f2022 })
  ok('una venta futura no se ajusta', factorFecha('2027-01-01', INDICE) === 1)
  ok('una venta anterior al inicio de la serie usa el primer punto (subajusta)',
    Math.abs(factorFecha('2010-01-01', INDICE, HOY) - factorFecha('2015-01-01', INDICE, HOY)) < 1e-9)
}
{
  // Guardas ABSOLUTAS: un indice roto no puede duplicar ni demoler una
  // tasacion. Son el unico tope — el tope del ajuste normal ES la realidad
  // del indice. La proteccion contra el indice de tipologias MEZCLADAS
  // (13,5% anual) es estructural: /api/tasar solo pasa series del mismo tipo.
  const disparado = [{ trimestre: '2019-06', uf_m2: 1 }, { trimestre: '2026-06', uf_m2: 900 }]
  ok('un indice disparado queda en el tope absoluto (' + CONJUNTO.factorMax + 'x)',
    factorFecha('2019-01-31', disparado, HOY) === CONJUNTO.factorMax)
  const desplomado = [{ trimestre: '2019-06', uf_m2: 900 }, { trimestre: '2026-06', uf_m2: 1 }]
  ok('un indice desplomado queda en el piso absoluto (' + CONJUNTO.factorMin + 'x)',
    factorFecha('2019-01-31', desplomado, HOY) === CONJUNTO.factorMin)
  const fPleno = factorFecha('2019-01-31', INDICE_PLENO, HOY)
  ok('el indice pleno (13,5% anual) no pasa del tope absoluto',
    fPleno === CONJUNTO.factorMax, { fPleno })
}
{
  // acotaFactor sigue vigente para el RESPALDO (carry por tasa del conjunto).
  ok('acotaFactor respeta un factor dentro de la tasa maxima',
    Math.abs(acotaFactor(1.05, 2) - 1.05) < 1e-9, { f: acotaFactor(1.05, 2) })
  ok('acotaFactor es simetrico hacia abajo',
    Math.abs(acotaFactor(0.1, 2) - 1 / Math.pow(1.05, 2)) < 1e-9, { f: acotaFactor(0.1, 2) })
  ok('acotaFactor a 0 anos no mueve nada', acotaFactor(3, 0) === 1, { f: acotaFactor(3, 0) })
}

console.log('\n7b) PRIORIDAD DEL AJUSTE: INDICE REAL PRIMERO, CONJUNTO DE RESPALDO')
{
  // Con una serie utilizable manda el INDICE REAL, no una tasa fija: la
  // tasacion sigue al mercado (el rechazo del "3% anual" fijo fue explicito).
  const conIndice = valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: M2, serieIndice: INDICE, hoy: HOY })
  ok('con serie utilizable la fuente del ajuste es el indice del mercado',
    conIndice.fuente_ajuste === 'indice_mercado', { fuente: conIndice.fuente_ajuste })
  ok('cada gemela declara su ajuste real en %',
    conIndice.ventas.every((g) => typeof g.ajuste_pct === 'number'), {})
  ok('hay ajustes hacia ARRIBA (ventas viejas) y hacia ABAJO (mercado cayo desde 2022)',
    conIndice.ajuste_min_pct < 0 && conIndice.ajuste_max_pct > 0,
    { min: conIndice.ajuste_min_pct, max: conIndice.ajuste_max_pct })
}
{
  // RESPALDO: sin serie utilizable, el conjunto calibra su propia apreciacion.
  const t = tasaApreciacionConjunto({ ventas: VENTAS, m2Objetivo: M2, hoy: HOY })
  ok('el conjunto calibra su propia apreciacion', t != null && t.tasa > 0, { t })
  ok('y da una tasa realista (1%-5% anual), no el 13,5% del sector',
    t.tasa > 0.01 && t.tasa <= CONJUNTO.apreciacionMaxAnual, { tasa_pct: t.tasa_pct })
  ok('usa ventas recientes contra antiguas del propio conjunto',
    t.n_recientes >= CONJUNTO.minPorCohorte && t.n_antiguas >= CONJUNTO.minPorCohorte, { t })
  const sinSerie = valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: M2, serieIndice: null, hoy: HOY })
  ok('sin serie la fuente del ajuste es la tasa del conjunto',
    sinSerie.fuente_ajuste === 'tasa_conjunto', { fuente: sinSerie.fuente_ajuste })
}
{
  // Sin ventas antiguas no se puede calibrar el respaldo.
  const soloRecientes = VENTAS.slice(0, 3)
  ok('sin cohorte antigua no hay calibracion propia',
    tasaApreciacionConjunto({ ventas: soloRecientes, m2Objetivo: M2, hoy: HOY }) === null)
}

console.log('\n8) REGLA DE COHERENCIA (PRECIOS REALES LLEVADOS A HOY CON EL MERCADO)')
{
  const r = tasa({ remodelacion: 'alta' })
  ok('remodelacion alta se topa en el maximo de las identicas de 24 meses',
    r.clamp && r.final === r.rango.max_uf && r.total > r.rango.max_uf,
    { total: r.total, final: r.final, max: r.rango.max_uf })
}
{
  const r = tasa()
  ok('el rango de coherencia sale de ventas de 24 meses', r.rango.meses === 24 && r.rango.n === 3, { rango: r.rango })
  ok('ningun resultado queda bajo el minimo de las identicas',
    ['ninguna', 'baja', 'media', 'alta'].every((e) => tasa({ remodelacion: e }).final >= r.rango.min_uf),
    { min: r.rango.min_uf })
  // El techo se construye sobre PRECIOS NOMINALES (lo que de verdad se pago)
  // llevados a hoy con la variacion REAL del mercado — que desde sep-2025
  // BAJO, asi que el techo queda BAJO la venta de 18.400 UF. Un indice de
  // tipologias mezcladas jamas vuelve a inflarlo: la ruta no se lo pasa.
  ok('el maximo nominal es la venta real de 18.400 UF', r.rango.max_nominal_uf === 18400, { rango: r.rango })
  ok('el minimo nominal es la venta real de 15.500 UF', r.rango.min_nominal_uf === 15500, { rango: r.rango })
  ok('el mercado bajo desde sep-2025: el techo queda BAJO el nominal',
    r.rango.max_uf < 18400 && r.rango.max_uf > 17000, { max: r.rango.max_uf })
  ok('la fuente del carry es la variacion real del mercado',
    r.rango.carry_pct === null && /variación real/.test(r.rango.carry_fuente), { rango: r.rango })
}
{
  // RESPALDO sin serie: nominal mas carry por la tasa del conjunto, acotada.
  const a = rangoUnidadesIdenticas({ ventas: VENTAS, m2Objetivo: M2, hoy: HOY })
  const carryMax = Math.pow(1 + CONJUNTO.apreciacionMaxAnual, anosEntre('2025-09-10', HOY))
  ok('sin serie, el techo es el nominal mas carry acotado, y nada mas',
    a.max_uf <= Math.round(18400 * carryMax) && a.max_uf >= 18400,
    { max: a.max_uf, tope: Math.round(18400 * carryMax) })
  ok('sin serie, el carry nunca supera el ' + (CONJUNTO.apreciacionMaxAnual * 100) + '% anual',
    a.carry_pct <= CONJUNTO.apreciacionMaxAnual * 100, { carry_pct: a.carry_pct })
  ok('ninguna corrida puede pasar del techo de su propio rango',
    ['ninguna', 'baja', 'media', 'alta'].every((e) =>
      [INDICE, INDICE_PLENO, null].every((ix) => {
        const t = tasa({ remodelacion: e, serieIndice: ix })
        return t.final <= t.rango.max_uf
      })), {})
}
{
  // Con UNA sola venta reciente min === max: acotar ahi clavaria la tasacion en
  // ese precio exacto y borraria remodelacion y caracteristicas.
  const unaSola = [VENTAS[0], ...VENTAS.slice(3)] // deja 1 venta dentro de 24 meses
  const rango = rangoUnidadesIdenticas({ ventas: unaSola, m2Objetivo: M2, hoy: HOY })
  ok('con una sola venta identica no se aplica la regla de coherencia', rango === null, { rango })
  const r = tasa({ remodelacion: 'alta', ventas: unaSola })
  ok('y el valor entonces no queda topado', !r.clamp && r.final === r.total, { final: r.final, total: r.total })
}

console.log('\n8c) MUESTRA DEL PERCENTIL DE ESTADO — 8 ANOS')
{
  const c = valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: M2, serieIndice: INDICE, hoy: HOY })
  ok('la muestra del percentil es de ' + (CONJUNTO.mesesPercentil / 12) + ' anos',
    CONJUNTO.mesesPercentil === 96 && c.ventana_percentil_meses === 96,
    { ventana: c.ventana_percentil_meses })
  ok('usa las 9 gemelas de la ventana, no solo las 3 recientes',
    c.n === 9 && c.n === c.n_total && !c.muestra_recortada, { n: c.n, n_total: c.n_total })
  ok('con 9 comparables la confianza es Alta, no Baja', confianzaPorN(c.n) === 'Alta', { n: c.n })
  ok('entran ventas de mas de 24 meses atras',
    c.ventas.some((g) => g.fecha < '2024-09-01'), { n: c.n })
  // Con el indice REAL cada venta entra en moneda de hoy: la de 2018 sube lo
  // que el mercado subio desde 2018 (+6%) y la de sep-2025 baja lo que el
  // mercado bajo desde entonces (-3%). Las ajustadas convergen al nivel
  // actual del mercado en vez de apilarse en el extremo alto.
  const vieja = c.ventas.find((g) => g.fecha === '2018-09-11')
  const reciente = c.ventas.find((g) => g.fecha === '2025-01-23')
  ok('la venta de 2018 sube y la de ene-2025 baja: ambas quedan en niveles comparables',
    vieja.uf_m2_ajustado > vieja.uf_m2 && reciente.uf_m2_ajustado < reciente.uf_m2
      && Math.abs(vieja.uf_m2_ajustado - reciente.uf_m2_ajustado) < 5,
    { v2018: [vieja.uf_m2, Math.round(vieja.uf_m2_ajustado * 10) / 10],
      v2025: [reciente.uf_m2, Math.round(reciente.uf_m2_ajustado * 10) / 10] })
}
{
  // La ventana del percentil nunca puede dejar la muestra bajo el minimo.
  const pocas = [VENTAS[0], ...VENTAS.slice(3)]
  const c = valorComparativoDirecto({ ventas: pocas, m2Objetivo: M2, serieIndice: INDICE, hoy: HOY })
  ok('con muestra corta se usan todas las gemelas', c.n === c.n_total, { n: c.n, n_total: c.n_total })
}

console.log('\n8b) DEDUPLICACION DEL POOL')
{
  // El pool junta dos listas del detalle: una misma inscripcion no puede pesar doble.
  const dup = [...VENTAS, { ...VENTAS[0] }, { ...VENTAS[1] }]
  const a = ventasGemelas({ ventas: VENTAS, m2Objetivo: M2, hoy: HOY })
  const b = ventasGemelas({ ventas: dup, m2Objetivo: M2, hoy: HOY })
  ok('las ventas repetidas se cuentan una sola vez', a.length === b.length, { a: a.length, b: b.length })
  ok('y el valor no se mueve',
    tasa({ ventas: VENTAS }).final === tasa({ ventas: dup }).final,
    { sin: tasa({ ventas: VENTAS }).final, con: tasa({ ventas: dup }).final })
}

console.log('\n9) COPROPIEDAD SIN TERRENO PROPIO')
{
  ok('terreno de bien comun -> no aplica el aditivo',
    terrenoEsProrrateoBC({ es_copropiedad: true, terreno_origen: 'bien_comun' }) === true)
  ok('casa con terreno propio -> si aplica el aditivo',
    terrenoEsProrrateoBC({ es_copropiedad: false, terreno_origen: 'sii' }) === false)
  ok('copropiedad con terreno propio del rol -> si aplica',
    terrenoEsProrrateoBC({ es_copropiedad: true, terreno_origen: 'sii' }) === false)
  ok('sin terreno_origen, la copropiedad manda',
    terrenoEsProrrateoBC({ es_copropiedad: true }) === true)
}

console.log('\n10) FALLBACK CUANDO NO HAY GEMELAS')
{
  const dos = [VENTAS[0], VENTAS[1]]
  ok('con menos de ' + CONJUNTO.minVentas + ' gemelas no hay comparativo directo',
    valorComparativoDirecto({ ventas: dos, m2Objetivo: M2, serieIndice: INDICE, hoy: HOY }) === null)
  ok('sin ventas del conjunto tampoco',
    valorComparativoDirecto({ ventas: [], m2Objetivo: M2, serieIndice: INDICE, hoy: HOY }) === null)
  ok('sin m2 construidos tampoco',
    valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: 0, serieIndice: INDICE, hoy: HOY }) === null)
}

console.log('\n10b) SERIE DE MERCADO DEL MISMO TIPO (construirSerieMercado)')
{
  // Ventas sinteticas: mercado que sube 2013-2022 y baja 2022-2026 (como el
  // real de Lo Barnechea). 3 ventas por año alrededor del nivel del año.
  const niveles = { 2018: 82, 2019: 85, 2020: 85, 2021: 90, 2022: 92, 2023: 92, 2024: 90, 2025: 91, 2026: 88 }
  const sint = Object.entries(niveles).flatMap(([ano, nv]) => [0.94, 1.0, 1.08].map((k, i) => ({
    rol: ano + '-' + i, fecha: `${ano}-0${3 + i * 2}-15`, m2: 100, uf: Math.round(nv * 100 * k),
  })))
  const s = construirSerieMercado({ ventas: sint, hoy: '2026-09-01' })
  ok('construye un punto anual con la mediana de UF/m2',
    s != null && s.puntos.length === 9 && Math.abs(s.puntos[0].uf_m2 - 82) < 1, { s })
  ok('reporta la variacion total real del periodo',
    Math.abs(s.variacion_total_pct - Math.round((88 / 82 - 1) * 1000) / 10) < 0.2, { v: s.variacion_total_pct })
  ok('con la serie, una venta del peak 2022 se ajusta hacia ABAJO',
    factorFecha('2022-06-15', s.puntos, '2026-09-01') < 1, { f: factorFecha('2022-06-15', s.puntos, '2026-09-01') })
}
{
  // Guardas de calidad: sin material no hay serie (manda el respaldo).
  ok('con pocas ventas no hay serie', construirSerieMercado({ ventas: VENTAS.slice(0, 4), hoy: HOY }) === null)
  const viejas = VENTAS.filter((v) => v.fecha < '2020-01-01')
  ok('con el ultimo punto vencido no hay serie', construirSerieMercado({ ventas: viejas, hoy: HOY }) === null)
  // Un punto anual de 2 ventas contaminado por una venta entre relacionados
  // (7.297 UF contra 15.850 UF el mismo año) se descarta, no se promedia.
  const s = construirSerieMercado({ ventas: VENTAS, hoy: HOY })
  ok('el año 2021 (venta relacionada + venta real) no genera punto',
    s === null || !s.puntos.some((p) => p.trimestre.startsWith('2021')), { s })
}

console.log('\n11) PERCENTIL INTERPOLADO')
{
  ok('interpola entre valores', percentilInterp([10, 20], 50) === 15, { v: percentilInterp([10, 20], 50) })
  ok('p0 es el minimo y p100 el maximo',
    percentilInterp([10, 20, 30], 0) === 10 && percentilInterp([10, 20, 30], 100) === 30)
  ok('con un solo valor devuelve ese valor', percentilInterp([7], 32) === 7)
  ok('lista vacia devuelve null', percentilInterp([], 50) === null)
}

console.log('\n' + (fail ? `${fail} FALLARON` : 'TODOS LOS TESTS DE TASACION PASARON'))
if (fail) process.exitCode = 1
