// test/indice-mercado.test.mjs — parte de `npm test`
// Índice REAL de mercado por comuna x tipo x banda de tamaño (Data
// Inmobiliaria/BigQuery, embebido en indice-mercado-data.js). Es la fuente
// PRINCIPAL del ajuste por fecha del comparativo directo.
import { indiceMercado } from '../app/lib/indice-mercado.js'
import { factorFecha } from '../app/lib/tasacion-core.js'

const HOY = '2026-09-09'
let fail = 0
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '\n         ' + JSON.stringify(extra)))
  if (!cond) fail++
}

console.log('\n12) INDICE DE MERCADO COMUNAL (comuna x tipo x banda)')
{
  // El caso que motivó todo: casa 21 de V. del Monasterio (Lo Barnechea, 164 m²).
  const i = indiceMercado({ codCom: 15161, tipo: 'casa', m2: 164 }, HOY)
  ok('Lo Barnechea casa 164 m2 -> banda media (120-250 m2)',
    i != null && i.banda === 'm', { i: i && { banda: i.banda } })
  ok('el indice tiene masa estadistica real (miles de ventas)',
    i.n_ventas > 1000, { n: i.n_ventas })
  ok('cubre 2012 a hoy con ultimo punto fresco (ultimos 12 meses)',
    i.desde <= '2013-01' && i.hasta >= '2025-06', { desde: i.desde, hasta: i.hasta })
  // La realidad del mercado de casas medianas de Lo Barnechea: subio hasta el
  // peak 2022 y cayo despues. El ajuste sigue esa realidad en AMBAS direcciones.
  const fPeak = factorFecha('2022-06-15', i.puntos, HOY)
  const f2018 = factorFecha('2018-06-15', i.puntos, HOY)
  ok('una venta del peak 2022 se ajusta hacia ABAJO (el mercado cayo desde entonces)',
    fPeak < 1, { fPeak })
  ok('una venta de 2018 se ajusta hacia ARRIBA (el mercado subio desde entonces)',
    f2018 > 1, { f2018 })
}
{
  // La banda importa: la mediana "todas las casas" de una comuna heterogenea
  // mezcla barrios y tamaños; la banda de la propiedad es el mercado que le
  // corresponde. Con 164 m2 la banda media difiere de "todas".
  const banda = indiceMercado({ codCom: 15161, tipo: 'casa', m2: 164 }, HOY)
  const todas = indiceMercado({ codCom: 15161, tipo: 'casa', m2: 0 }, HOY)
  ok('sin m2 usa la serie "todas" como respaldo', todas != null && todas.banda === 't', { banda: todas && todas.banda })
  ok('la banda de la propiedad NO es la serie "todas"', banda.banda !== todas.banda, {})
}
{
  ok('comuna sin datos -> null (manda el respaldo del modelo)',
    indiceMercado({ codCom: 99999, tipo: 'casa', m2: 100 }, HOY) === null)
  ok('tipo sin datos -> null',
    indiceMercado({ codCom: 15161, tipo: 'oficina', m2: 100 }, HOY) === null)
  // Santiago centro casas: la serie termina en 2019 (quedan pocas casas):
  // esta VENCIDA y no puede dar el "nivel de hoy" -> null.
  ok('serie vencida -> null (Santiago centro casas termina en 2019)',
    indiceMercado({ codCom: 13101, tipo: 'casa', m2: 150 }, HOY) === null)
  ok('la frescura tambien vence con el paso del tiempo',
    indiceMercado({ codCom: 15161, tipo: 'casa', m2: 164 }, '2028-06-01') === null)
  ok('departamentos tambien tienen indice (Las Condes 80 m2)',
    indiceMercado({ codCom: 15108, tipo: 'departamento', m2: 80 }, HOY) != null)
}

console.log('\n' + (fail ? `${fail} FALLARON` : 'TODOS LOS TESTS DEL INDICE PASARON'))
if (fail) process.exitCode = 1
