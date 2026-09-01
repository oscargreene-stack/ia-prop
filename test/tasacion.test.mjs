// test/tasacion.test.mjs — parte de `npm test`
// Jerarquía de métodos de valorización. Los datos son REALES: ventas CBR del
// condominio de AV V DEL MONASTERIO 2577 (cbr_limpio x consolidado,
// cod_com=15161 cod_mz=3669 cod_pr 461..487) e índice de plusvalía de
// Lo Barnechea (mediana anual UF/m², casas 100-300 m²).
import {
  valorComparativoDirecto, rangoUnidadesIdenticas, terrenoEsProrrateoBC,
  ventasGemelas, sinOutliersConjunto, factorFecha, percentilInterp,
  valorAditivoCasa, CONJUNTO, PCTL_BASE,
} from '../app/lib/tasacion-core.js'

const M2 = 164
const HOY = '2026-09-01'
const REMO_UF_M2 = { ninguna: 0, baja: 5, media: 10, alta: 20 }

export const VENTAS = [
  { casa: 12, fecha: '2025-09-10', m2: 164, uf: 18400 },
  { casa: 17, fecha: '2025-09-01', m2: 164, uf: 17400 },
  { casa: 14, fecha: '2025-01-23', m2: 164, uf: 15500 },
  { casa: 19, fecha: '2022-05-03', m2: 164, uf: 16700 },
  { casa: 24, fecha: '2021-11-25', m2: 164, uf: 7297.21 }, // entre relacionados
  { casa:  2, fecha: '2021-03-04', m2: 164, uf: 15850 },
  { casa: 22, fecha: '2020-11-23', m2: 164, uf: 14750 },
  { casa:  3, fecha: '2019-01-31', m2: 164, uf: 14350 },
  { casa:  5, fecha: '2018-11-30', m2: 164, uf: 14750 },
  { casa: 18, fecha: '2018-11-30', m2: 140, uf: 14400 }, // otra tipología
  { casa: 26, fecha: '2018-09-11', m2: 164, uf: 14000 },
  { casa:  8, fecha: '2014-10-09', m2: 164, uf: 12000 }, // fuera de ventana
]

export const INDICE = [
  ['2015-06', 76.3], ['2016-06', 74.6], ['2017-06', 79.2], ['2018-06', 81.8],
  ['2019-06', 85.5], ['2020-06', 84.7], ['2021-06', 90.7], ['2022-06', 92.3],
  ['2023-06', 91.7], ['2024-06', 90.1], ['2025-06', 91.4], ['2026-06', 87.6],
].map(([trimestre, uf_m2]) => ({ trimestre, uf_m2 }))

// Reproduce la cadena de /api/tasar: base comparativa -> premio de
// remodelación -> regla de coherencia sobre el TOTAL.
export function tasa({ remodelacion = 'ninguna', serieIndice = INDICE, meses, ventas = VENTAS } = {}) {
  const c = valorComparativoDirecto({ ventas, m2Objetivo: M2, serieIndice, hoy: HOY, meses })
  const rango = rangoUnidadesIdenticas({ ventas, m2Objetivo: M2, serieIndice, hoy: HOY })
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
  const r = tasa({ remodelacion: 'ninguna' })
  ok('sin remodelar cae en 14.500-15.500 UF', entre(r.final, 14500, 15500), { final: r.final })
}
{
  const r = tasa({ remodelacion: 'media' })
  ok('remodelacion media cae en 16.000-17.500 UF', entre(r.final, 16000, 17500), { final: r.final })
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

console.log('\n7) AJUSTE POR FECHA')
{
  ok('sin serie utilizable el factor es 1', factorFecha('2019-01-31', null) === 1)
  ok('una venta vieja se ajusta hacia arriba', factorFecha('2019-01-31', INDICE) > 1,
    { f: factorFecha('2019-01-31', INDICE) })
  ok('una venta reciente sobre el nivel actual se ajusta hacia abajo',
    factorFecha('2025-09-10', INDICE) < 1, { f: factorFecha('2025-09-10', INDICE) })
  ok('una venta futura no se ajusta', factorFecha('2027-01-01', INDICE) === 1)
  // Un índice absurdo no puede duplicar la tasación.
  const loco = [{ trimestre: '2019-06', uf_m2: 1 }, { trimestre: '2026-06', uf_m2: 900 }]
  ok('un indice roto queda topado en x' + CONJUNTO.factorMax,
    factorFecha('2019-01-31', loco) === CONJUNTO.factorMax, { f: factorFecha('2019-01-31', loco) })
}

console.log('\n8) REGLA DE COHERENCIA')
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
}
{
  // Con UNA sola venta reciente min === max: acotar ahi clavaria la tasacion en
  // ese precio exacto y borraria remodelacion y caracteristicas.
  const unaSola = [VENTAS[0], ...VENTAS.slice(3)] // deja 1 venta dentro de 24 meses
  const rango = rangoUnidadesIdenticas({ ventas: unaSola, m2Objetivo: M2, serieIndice: INDICE, hoy: HOY })
  ok('con una sola venta identica no se aplica la regla de coherencia', rango === null, { rango })
  const r = tasa({ remodelacion: 'alta', ventas: unaSola })
  ok('y el valor entonces no queda topado', !r.clamp && r.final === r.total, { final: r.final, total: r.total })
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
