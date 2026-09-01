// test/monasterio-21.mjs — `npm run caso:monasterio`
// Caso real que motivó la jerarquía de métodos: AV V DEL MONASTERIO 2577
// casa 21, Lo Barnechea (ROL 15161-3669-481, 164 m², condominio de 27 casas
// idénticas). El modelo aditivo daba 11.404 UF contra ventas reales de 14.350+.
//
// Ventas: cbr_limpio x consolidado, cod_com=15161 cod_mz=3669 cod_pr 461..487.
// Índice: mediana anual UF/m² de casas 100-300 m² de la comuna (cbr_limpio).
import {
  valorComparativoDirecto, rangoUnidadesIdenticas, terrenoEsProrrateoBC,
  valorAditivoCasa, CONJUNTO, PCTL_BASE,
} from '../app/lib/tasacion-core.js'

const M2 = 164
const HOY = '2026-09-01'

// Tarifa de remodelación de AJUSTES_CONFIG (editable desde /admin), sobre m²
// útiles y multiplicada por la antigüedad de la remodelación.
const REMO_UF_M2 = { ninguna: 0, baja: 5, media: 10, alta: 20 }
const REMO_TIEMPO = { reciente: 1.0, hace3: 0.85, hace5: 0.7 }

// Ventas CBR reales del condominio (las 27 casas comparten dirección y m²).
const VENTAS = [
  { casa: 12, fecha: '2025-09-10', m2: 164, uf: 18400 },
  { casa: 17, fecha: '2025-09-01', m2: 164, uf: 17400 },
  { casa: 14, fecha: '2025-01-23', m2: 164, uf: 15500 },
  { casa: 19, fecha: '2022-05-03', m2: 164, uf: 16700 },
  { casa: 24, fecha: '2021-11-25', m2: 164, uf: 7297.21 }, // entre relacionados
  { casa:  2, fecha: '2021-03-04', m2: 164, uf: 15850 },
  { casa: 22, fecha: '2020-11-23', m2: 164, uf: 14750 },
  { casa:  3, fecha: '2019-01-31', m2: 164, uf: 14350 },
  { casa:  5, fecha: '2018-11-30', m2: 164, uf: 14750 },
  { casa: 18, fecha: '2018-11-30', m2: 140, uf: 14400 }, // otra tipología (140 m²)
  { casa: 26, fecha: '2018-09-11', m2: 164, uf: 14000 },
]

// Índice de plusvalía del sector: mediana UF/m² por año, casas 100-300 m²,
// Lo Barnechea. En producción esto viene de detalle_mercado (media móvil 3m).
const INDICE = [
  ['2015-06', 76.3], ['2016-06', 74.6], ['2017-06', 79.2], ['2018-06', 81.8],
  ['2019-06', 85.5], ['2020-06', 84.7], ['2021-06', 90.7], ['2022-06', 92.3],
  ['2023-06', 91.7], ['2024-06', 90.1], ['2025-06', 91.4], ['2026-06', 87.6],
].map(([trimestre, uf_m2]) => ({ trimestre, uf_m2 }))

const uf = (x) => x == null ? 'n/d' : Math.round(x).toLocaleString('es-CL') + ' UF'

// Reproduce la cadena de la ruta: base comparativa -> premio de remodelación
// -> regla de coherencia sobre el TOTAL.
function corre({ remodelacion = 'ninguna', tiempo = 'reciente', serieIndice = INDICE, meses } = {}) {
  const c = valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: M2, serieIndice, hoy: HOY, meses })
  const rango = rangoUnidadesIdenticas({ ventas: VENTAS, m2Objetivo: M2, serieIndice, hoy: HOY })
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
console.log(`  coherencia (idénticas, ${base.rango.meses} meses, n=${base.rango.n}): `
  + `${uf(base.rango.min_uf)} – ${uf(base.rango.max_uf)}\n`)

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

console.log('\nSENSIBILIDAD — ventana de comparables (decisión pendiente)')
for (const meses of [72, 96]) {
  const a = corre({ remodelacion: 'ninguna', meses })
  const b = corre({ remodelacion: 'media', meses })
  console.log(`  ${String(meses).padStart(2)} meses · n=${a.c.n} gemelas · sin remodelar ${uf(a.final).padStart(10)}`
    + ` · media ${uf(b.final).padStart(10)}`)
}

console.log('\nSENSIBILIDAD — sin índice del sector (sin ajuste por fecha)')
for (const estado of ['ninguna', 'media']) {
  const r = corre({ remodelacion: estado, serieIndice: null })
  console.log(`  ${estado.padEnd(8)} ${uf(r.final)}` + (r.clamp ? '  (techo por coherencia)' : ''))
}
console.log('')
