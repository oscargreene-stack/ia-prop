// test/monasterio-21.mjs — `npm run caso:monasterio`
// Caso real que motivó la jerarquía de métodos: AV V DEL MONASTERIO 2577
// casa 21, Lo Barnechea (ROL 15161-3669-481, 164 m², condominio de 27 casas
// idénticas). Primero el aditivo daba 11.404 UF contra ventas reales de
// 14.350+; después el ajuste por fecha con el índice del sector lo mandó a
// 19.285 UF, POR ENCIMA de todas las ventas nominales del condominio.
//
// Ventas: cbr_limpio x consolidado, unidades con cod_*_bc = 15161-3669-90461.
import {
  valorComparativoDirecto, rangoUnidadesIdenticas, terrenoEsProrrateoBC,
  valorAditivoCasa, tasaApreciacionConjunto, anosEntre, CONJUNTO, PCTL_BASE,
} from '../app/lib/tasacion-core.js'

const M2 = 164
const HOY = '2026-09-01'

// Tarifa de remodelación de AJUSTES_CONFIG (editable desde /admin), sobre m²
// útiles y multiplicada por la antigüedad de la remodelación.
const REMO_UF_M2 = { ninguna: 0, baja: 5, media: 10, alta: 20 }
const REMO_TIEMPO = { reciente: 1.0, hace3: 0.85, hace5: 0.7 }

// Las 20 ventas CBR del condominio. Las casas 12, 3 y 8 aparecen DOS veces:
// esas ventas repetidas son la evidencia dura de la plusvalía del conjunto.
const VENTAS = [
  { casa: 12, rol: '15161-3669-472', fecha: '2025-09-10', m2: 164, uf: 18400 },
  { casa: 17, rol: '15161-3669-477', fecha: '2025-09-01', m2: 164, uf: 17400 },
  { casa: 14, rol: '15161-3669-474', fecha: '2025-01-23', m2: 164, uf: 15500 },
  { casa: 19, rol: '15161-3669-479', fecha: '2022-05-03', m2: 164, uf: 16700 },
  { casa: 24, rol: '15161-3669-484', fecha: '2021-11-25', m2: 164, uf: 7297.21 }, // entre relacionados
  { casa:  2, rol: '15161-3669-462', fecha: '2021-03-04', m2: 164, uf: 15850 },
  { casa: 22, rol: '15161-3669-482', fecha: '2020-11-23', m2: 164, uf: 14750 },
  { casa:  3, rol: '15161-3669-463', fecha: '2019-01-31', m2: 164, uf: 14350 },
  { casa:  5, rol: '15161-3669-465', fecha: '2018-11-30', m2: 164, uf: 14750 },
  { casa: 18, rol: '15161-3669-478', fecha: '2018-11-30', m2: 140, uf: 14400 }, // otra tipología (140 m²)
  { casa: 26, rol: '15161-3669-486', fecha: '2018-09-11', m2: 164, uf: 14000 },
  { casa:  6, rol: '15161-3669-466', fecha: '2018-01-31', m2: 164, uf: 14500 },
  { casa: 12, rol: '15161-3669-472', fecha: '2017-01-18', m2: 164, uf: 13250 },
  { casa: 25, rol: '15161-3669-485', fecha: '2016-01-29', m2: 164, uf: 8214 },  // entre relacionados
  { casa: 27, rol: '15161-3669-487', fecha: '2015-12-29', m2: 164, uf: 14200 },
  { casa:  8, rol: '15161-3669-468', fecha: '2014-10-09', m2: 164, uf: 12000 },
  { casa: 13, rol: '15161-3669-473', fecha: '2013-12-16', m2: 164, uf: 11100 },
  { casa: 10, rol: '15161-3669-470', fecha: '2013-10-29', m2: 164, uf: 11650 },
  { casa:  3, rol: '15161-3669-463', fecha: '2013-09-27', m2: 164, uf: 11350 },
  { casa:  8, rol: '15161-3669-468', fecha: '2013-01-23', m2: 164, uf: 10850 },
]

// Índice del sector, plano (mediana UF/m² anual de casas 100-300 m²).
const INDICE = [
  ['2015-06', 76.3], ['2016-06', 74.6], ['2017-06', 79.2], ['2018-06', 81.8],
  ['2019-06', 85.5], ['2020-06', 84.7], ['2021-06', 90.7], ['2022-06', 92.3],
  ['2023-06', 91.7], ['2024-06', 90.1], ['2025-06', 91.4], ['2026-06', 87.6],
].map(([trimestre, uf_m2]) => ({ trimestre, uf_m2 }))

// El índice que rompió producción: 13,5% anual compuesto (detalle_mercado con
// tipologías mezcladas). Con el fix, la tasación ya no depende de él.
const INDICE_PLENO = Array.from({ length: 12 }, (_, i) => ({
  trimestre: (2015 + i) + '-06',
  uf_m2: Math.round(60 * Math.pow(1.135, i) * 10) / 10,
}))

const uf = (x) => x == null ? 'n/d' : Math.round(x).toLocaleString('es-CL') + ' UF'

// Reproduce la cadena de la ruta: base comparativa -> premio de remodelación
// -> regla de coherencia sobre el TOTAL.
function corre({ remodelacion = 'ninguna', tiempo = 'reciente', serieIndice = INDICE, meses } = {}) {
  const c = valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: M2, serieIndice, hoy: HOY, meses })
  const rango = rangoUnidadesIdenticas({ ventas: VENTAS, m2Objetivo: M2, hoy: HOY })
  if (!c) return { c: null, rango, final: null }
  const ajRemo = Math.round((REMO_UF_M2[remodelacion] || 0) * M2 * (REMO_TIEMPO[tiempo] || 1))
  const total = c.valor_uf + ajRemo
  const final = rango ? Math.min(rango.max_uf, Math.max(rango.min_uf, total)) : total
  return { c, rango, ajRemo, total, final, clamp: final !== total }
}

console.log('\n════ AV V DEL MONASTERIO 2577 CASA 21 — ROL 15161-3669-481 ════')
console.log('164 m² construidos · condominio de 27 casas idénticas · copropiedad\n')

const aditivo = valorAditivoCasa({ sueloUfM2: 14.5, m2Terreno: 368, costoUfM2: 37, m2Construido: M2 })
console.log('MODELO ANTERIOR (aditivo con terreno prorrateado del bien común)')
console.log(`  terreno 14,5 UF/m² x 368 m² = ${uf(aditivo.terreno_uf)}`)
console.log(`  construcción 37 UF/m² x 164 m² = ${uf(aditivo.construccion_uf)}`)
console.log(`  TOTAL = ${uf(aditivo.total_uf)}   <- el valor equivocado`)
console.log('  ya no corre: terrenoEsProrrateoBC(copropiedad + bien_comun) = '
  + terrenoEsProrrateoBC({ es_copropiedad: true, terreno_origen: 'bien_comun' }) + '\n')

const base = corre()
console.log(`GEMELAS (mismo conjunto, ±10% de ${M2} m², últimos ${CONJUNTO.mesesMax} meses)`)
for (const g of base.c.ventas) {
  console.log(`  casa ${String(g.casa).padStart(2)} · ${g.fecha} · ${uf(g.uf).padStart(10)}`
    + ` · ${g.uf_m2.toFixed(1)} UF/m² x${g.factor_fecha} -> ${g.uf_m2_ajustado.toFixed(1)} UF/m²`)
}
console.log(`  descartadas por outlier (fuera del 60-140% de la mediana): ${base.c.n_descartadas}`)
console.log(`  rango ajustado ${base.c.uf_m2_min}–${base.c.uf_m2_max} UF/m² · mediana ${base.c.uf_m2_mediana}`)
console.log(`  base en estado sin remodelar = percentil ${PCTL_BASE} = ${base.c.uf_m2} UF/m² = ${uf(base.c.valor_uf)}`)
console.log(`  coherencia NOMINAL (idénticas, ${base.rango.meses} meses, n=${base.rango.n}): `
  + `${uf(base.rango.min_nominal_uf)} – ${uf(base.rango.max_nominal_uf)} pagadas`
  + ` -> con carry de ${base.rango.carry_pct}% anual: ${uf(base.rango.min_uf)} – ${uf(base.rango.max_uf)}`)

const cal = tasaApreciacionConjunto({ ventas: VENTAS, m2Objetivo: M2, hoy: HOY })
console.log(`\nAJUSTE POR FECHA — calibrado con el PROPIO conjunto`)
console.log(`  ${cal.n_recientes} ventas recientes vs ${cal.n_antiguas} antiguas, separadas ${cal.anos} años`)
console.log(`  -> apreciación implícita del conjunto: ${cal.tasa_pct}% anual (tope: ${CONJUNTO.apreciacionMaxAnual * 100}%)`)
console.log('  contraste con las ventas REPETIDAS reales (misma casa, dos veces):')
for (const [casa, f1, u1, f2, u2] of [[12, '2017-01-18', 13250, '2025-09-10', 18400],
                                      [3, '2013-09-27', 11350, '2019-01-31', 14350],
                                      [8, '2013-01-23', 10850, '2014-10-09', 12000]]) {
  const y = anosEntre(f1, f2)
  const r = (Math.pow(u2 / u1, 1 / y) - 1) * 100
  console.log(`    casa ${String(casa).padStart(2)}: ${uf(u1)} (${f1.slice(0, 7)}) -> ${uf(u2)} (${f2.slice(0, 7)}) = ${r.toFixed(1)}% anual`)
}
console.log(`  el índice del sector marcaba 13,5% anual: 3x la plusvalía real de estas casas\n`)

console.log('RESULTADOS — remodelación reciente, tarifa 5/10/20 UF/m² sobre 164 m²')
for (const estado of ['ninguna', 'baja', 'media', 'alta']) {
  const r = corre({ remodelacion: estado })
  console.log(`  ${estado.padEnd(8)} base ${uf(r.c.valor_uf).padStart(10)}`
    + ` + remodelación ${uf(r.ajRemo).padStart(9)} = ${uf(r.total).padStart(10)}`
    + ` -> ${uf(r.final).padStart(10)}` + (r.clamp ? '  (techo por coherencia)' : ''))
}

console.log('\nEFECTO DE LA ANTIGÜEDAD DE LA REMODELACIÓN (calidad media)')
for (const t of ['reciente', 'hace3', 'hace5']) {
  const r = corre({ remodelacion: 'media', tiempo: t })
  console.log(`  ${t.padEnd(9)} + ${uf(r.ajRemo).padStart(9)} = ${uf(r.final)}`)
}

console.log('\nSENSIBILIDAD — el indice del sector ya NO mueve la tasacion')
console.log('  (esta era la causa raiz: el indice de 13,5% anual inflaba las ventas viejas)')
for (const [nombre, serie] of [['plano (1,3% anual)', INDICE], ['PLENO (13,5% anual)', INDICE_PLENO], ['sin indice', null]]) {
  const a = corre({ remodelacion: 'ninguna', serieIndice: serie })
  const b = corre({ remodelacion: 'media', serieIndice: serie })
  console.log(`  ${nombre.padEnd(20)} sin remodelar ${uf(a.final).padStart(10)} · media ${uf(b.final).padStart(10)}`)
}

console.log('\nSENSIBILIDAD — ventana de comparables')
for (const meses of [72, 96]) {
  const a = corre({ remodelacion: 'ninguna', meses })
  const b = corre({ remodelacion: 'media', meses })
  console.log(`  ${String(meses).padStart(2)} meses · n=${a.c.n} en el percentil · sin remodelar ${uf(a.final).padStart(10)}`
    + ` · media ${uf(b.final).padStart(10)}`)
}
console.log('')
