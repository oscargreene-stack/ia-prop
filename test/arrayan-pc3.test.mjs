// test/arrayan-pc3.test.mjs — parte de `npm test`
// Caso REFUGIOS DEL ARRAYAN 19000 PC 3, Lo Barnechea (ROL 3044-4), 571 m²
// construidos, 6.000 m² de terreno, avalúo fiscal 20.867 UF. El informe del
// 14-oct-2026 dio 16.914 UF (bajo el avalúo) y una "plusvalía 12 meses" de
// +64,7%. Ventas CBR reales del conjunto tomadas de ese informe; los `rol`
// son etiquetas por parcela (lo que importa es que PC-80 se repite).
import {
  valorComparativoDirecto, sinOutliersConjunto, ventasGemelas, descartarReventasSospechosas,
  plusvaliaSerie, plusvaliaVentas, plusvaliaContradiceIndice, controlAvaluoFiscal, bajarConfianza,
  CONJUNTO,
} from '../app/lib/tasacion-core.js'
import { indiceMercado } from '../app/lib/indice-mercado.js'
import { COD_COMUNA, normalizaComuna } from '../app/lib/comunas.js'

const HOY = '2026-10-14'
const M2 = 571
const AVALUO_UF = 20867
const VENTAS = [
  { rol: 'PC-80', fecha: '2025-12-12', m2: 560, uf: 16123 },
  { rol: 'PC-80', fecha: '2025-02-06', m2: 560, uf: 23989 },
  { rol: 'PC-67', fecha: '2024-10-16', m2: 561, uf: 18700 },
  { rol: 'PC-3',  fecha: '2020-09-30', m2: 571, uf: 28000 },
  { rol: 'PC-19', fecha: '2021-02-09', m2: 469, uf: 17900 }, // otra tipología (fuera de ±10%)
]
// Serie del proveedor tal como salió en el informe (puntos sueltos, n bajo)
const SERIE_INFORME = [
  { trimestre: '2024-10', uf_m2: 34, n: 1 }, { trimestre: '2025-02', uf_m2: 39, n: 2 },
  { trimestre: '2025-04', uf_m2: 41, n: 4 }, { trimestre: '2025-05', uf_m2: 44, n: 4 },
  { trimestre: '2025-09', uf_m2: 60, n: 5 }, { trimestre: '2025-12', uf_m2: 56, n: 4 },
]

let fail = 0
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '\n         ' + JSON.stringify(extra)))
  if (!cond) fail++
}

console.log('\n5) CASO REFUGIOS DEL ARRAYAN PC 3 (fixes 14-oct)')

// ── Fix 1: plusvalía ──
ok('plusvalía del informe (serie suelta, dato vencido) -> null', plusvaliaSerie(SERIE_INFORME, HOY) === null, plusvaliaSerie(SERIE_INFORME, HOY))
ok('aun con dato fresco, sin punto con n>=3 a 9-15 meses -> null',
  plusvaliaSerie(SERIE_INFORME, '2026-01-15') === null, plusvaliaSerie(SERIE_INFORME, '2026-01-15'))
const sana = [
  { trimestre: '2025-09', uf_m2: 50, n: 8 }, { trimestre: '2026-03', uf_m2: 51, n: 7 }, { trimestre: '2026-09', uf_m2: 52, n: 9 },
]
ok('serie sana -> +4%', plusvaliaSerie(sana, HOY) === 4, plusvaliaSerie(sana, HOY))
const loca = sana.map((p, i) => ({ ...p, uf_m2: i === 2 ? 80 : p.uf_m2 }))
ok('variación >25% -> null (no creíble)', plusvaliaSerie(loca, HOY) === null, plusvaliaSerie(loca, HOY))
const vts = [
  ...['2025-11-01', '2026-02-01', '2026-08-01'].map((f) => ({ f, r: 52 })),
  ...['2024-11-01', '2025-03-01', '2025-06-01'].map((f) => ({ f, r: 50 })),
]
ok('plusvaliaVentas sana -> +4%', plusvaliaVentas(vts, HOY) === 4, plusvaliaVentas(vts, HOY))
ok('plusvaliaVentas con última venta vencida -> null',
  plusvaliaVentas(vts.map((v) => ({ ...v, f: v.f.replace('2026-08', '2025-12').replace('2026-02', '2025-11') })), HOY) === null)

// ── Fix 3: reventas ──
const gem = ventasGemelas({ ventas: VENTAS, m2Objetivo: M2, hoy: HOY })
ok('4 gemelas dentro de ±10% de m²', gem.length === 4, gem.length)
const rev = descartarReventasSospechosas(gem)
ok('descarta UNA reventa de PC-80', rev.descartadas.length === 1, rev.descartadas)
ok('la descartada es la de 16.123 UF (dic-25)', rev.descartadas[0]?.uf === 16123, rev.descartadas[0])
const lim = sinOutliersConjunto(gem)
ok('sinOutliersConjunto marca motivo reventa', lim.descartadas.some((g) => g.motivo === 'reventa'), lim.descartadas)
// Monasterio: casa 12 vendida 2017 y 2025 (8 años) NO es reventa sospechosa
const mon = descartarReventasSospechosas([
  { rol: 'X', fecha: '2017-01-18', uf_m2: 80.8, uf: 13250 }, { rol: 'X', fecha: '2025-09-10', uf_m2: 112.2, uf: 18400 },
])
ok('reventa separada por 8 años no se descarta', mon.descartadas.length === 0)

// ── Fix 4: mediana con <6 gemelas ──
const codCom = COD_COMUNA[normalizaComuna('Lo Barnechea')]
const idx = indiceMercado({ codCom, tipo: 'casa', m2: M2 })
const serie = idx ? idx.puntos : null
const c = valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: M2, serieIndice: serie, hoy: HOY })
ok('comparativo existe', !!c)
ok('con <6 gemelas usa mediana (p50)', c?.percentil_usado === 50, c?.percentil_usado)
ok('informa 1 descartada por reventa', c?.n_descartadas_reventa === 1, c)
console.log('         valor comparativo:', c?.valor_uf, 'UF  (', c?.uf_m2, 'UF/m², n=', c?.n, ', ajustes', c?.ajuste_min_pct, '..', c?.ajuste_max_pct, '%)')
ok('valor ya no queda bajo el avalúo fiscal', c?.valor_uf >= AVALUO_UF, c?.valor_uf)
ok('valor dentro de 1,0x–2,0x avalúo', c?.valor_uf <= 2 * AVALUO_UF, c?.valor_uf)
const p6 = valorComparativoDirecto({
  ventas: Array.from({ length: 6 }, (_, i) => ({ rol: 'R' + i, fecha: '2025-0' + (i + 1) + '-01', m2: 571, uf: 20000 + i * 500 })),
  m2Objetivo: M2, serieIndice: serie, hoy: HOY,
})
ok('con 6 gemelas vuelve al percentil 32', p6?.percentil_usado === 32, p6?.percentil_usado)

// ── Fix 2: control avalúo ──
const ctlViejo = controlAvaluoFiscal({ valorUf: 16914, avaluoUf: AVALUO_UF })
ok('16.914 UF (informe viejo) -> revisar', ctlViejo.revisar === true, ctlViejo)
ok('33.058 UF (Data Inmobiliaria) -> dentro de 2x, no alerta', controlAvaluoFiscal({ valorUf: 33058, avaluoUf: AVALUO_UF }).revisar === false)
ok('45.000 UF -> revisar (>2x)', controlAvaluoFiscal({ valorUf: 45000, avaluoUf: AVALUO_UF }).revisar === true)
ok('bajarConfianza Alta->Media->Baja->Baja', bajarConfianza('Alta') === 'Media' && bajarConfianza('Media') === 'Baja' && bajarConfianza('Baja') === 'Baja')

// ── Fix 5: plusvalía contradictoria con el índice ──
if (serie) {
  ok('+64,7% contradice el índice de casas grandes de Lo Barnechea', plusvaliaContradiceIndice(64.7, serie, HOY) === true)
}
const plano = [{ trimestre: '2024-06', uf_m2: 50 }, { trimestre: '2025-06', uf_m2: 50 }, { trimestre: '2026-06', uf_m2: 51 }]
ok('+2% con índice plano no contradice', plusvaliaContradiceIndice(2, plano, HOY) === false)
ok('+15% con índice plano sí contradice', plusvaliaContradiceIndice(15, plano, HOY) === true)

if (fail) { console.log(`\n${fail} TEST(S) FALLARON`); process.exit(1) }
console.log('\nTODOS LOS TESTS DEL CASO ARRAYAN PASARON')
