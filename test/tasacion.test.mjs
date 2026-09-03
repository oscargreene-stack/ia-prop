// test/tasacion.test.mjs — parte de `npm test`
// Jerarquía de métodos de valorización. Los datos son REALES: ventas CBR del
// condominio de AV V DEL MONASTERIO 2577 (cbr_limpio x consolidado, unidades
// con cod_com_bc=15161 cod_mz_bc=3669 cod_pr_bc=90461) e índice de plusvalía de
// Lo Barnechea.
import {
  valorComparativoDirecto, rangoUnidadesIdenticas, terrenoEsProrrateoBC,
  ventasGemelas, sinOutliersConjunto, factorFecha, percentilInterp,
  valorAditivoCasa, tasaApreciacionConjunto, acotaFactor, anosEntre, confianzaPorN,
  premioEstadoConjunto, factorAntiguedadRemodelacion,
  CONJUNTO, PCTL_BASE, PCTL_ESTADO,
} from '../app/lib/tasacion-core.js'

const M2 = 164
const HOY = '2026-09-01'

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

// Reproduce la cadena de /api/tasar: base comparativa -> premio de estado por
// escalón de percentil -> regla de coherencia sobre el TOTAL.
export function tasa({ remodelacion = 'ninguna', tiempo = 'reciente', serieIndice = INDICE, meses, ventas = VENTAS } = {}) {
  const c = valorComparativoDirecto({ ventas, m2Objetivo: M2, serieIndice, hoy: HOY, meses })
  const rango = rangoUnidadesIdenticas({ ventas, m2Objetivo: M2, hoy: HOY })
  if (!c) return { c: null, rango, final: null }
  const premio = premioEstadoConjunto({ comparativo: c, remodelacion, tiempo })
  const ajRemo = Math.max(0, premio ? premio.premio_uf : 0)
  const total = c.valor_uf + ajRemo
  const final = rango ? Math.min(rango.max_uf, Math.max(rango.min_uf, total)) : total
  return { c, rango, premio, ajRemo, total, final, clamp: final !== total }
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
  // El valor NUNCA puede superar el maximo NOMINAL de una unidad identica de
  // los ultimos 24 meses (18.400 UF) mas el carry acotado. Ese es el limite
  // duro que produccion violaba (daba 19.285 UF).
  const r = tasa({ remodelacion: 'ninguna' })
  const techo = tasa().rango.max_uf
  ok('sin remodelar queda bajo el maximo nominal + carry', r.final <= techo, { final: r.final, techo })
  ok('sin remodelar queda bajo el maximo nominal de 18.400 UF por si solo',
    r.final < 18400, { final: r.final })
  // Encaje del ladder de estado dentro de las ventas reales del conjunto.
  ok('sin remodelar cae en 16.200-17.000 UF', entre(r.final, 16200, 17000), { final: r.final })
}
{
  const r = tasa({ remodelacion: 'media' })
  ok('remodelacion media cae en 17.000-17.600 UF', entre(r.final, 17000, 17600), { final: r.final })
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
  // Un índice absurdo no puede duplicar la tasación: el tope es una TASA ANUAL
  // compuesta, no un factor plano, así que crece con los años transcurridos.
  const loco = [{ trimestre: '2019-06', uf_m2: 1 }, { trimestre: '2026-06', uf_m2: 900 }]
  const anos = anosEntre('2019-01-31', HOY)
  const techo = Math.pow(1 + CONJUNTO.apreciacionMaxAnual, anos)
  const f = factorFecha('2019-01-31', loco, HOY)
  ok('un indice roto queda topado en ' + (CONJUNTO.apreciacionMaxAnual * 100) + '% anual compuesto',
    Math.abs(f - techo) < 1e-9, { f, techo, anos })
  ok('y ese tope es mas estricto que el tope plano anterior', f < CONJUNTO.factorMax, { f })
}
{
  // El caso concreto que rompio produccion: la venta de 2019 a 87,5 UF/m2.
  // Con el indice pleno (13,5% anual) el factor bruto era ~2,5x -> 219 UF/m2;
  // acotado a 5% anual sobre 7,6 anos queda en 1,44x -> 126 UF/m2.
  const fPleno = factorFecha('2019-01-31', INDICE_PLENO, HOY)
  const anos = anosEntre('2019-01-31', HOY)
  ok('el indice pleno queda acotado a la tasa maxima',
    Math.abs(fPleno - Math.pow(1 + CONJUNTO.apreciacionMaxAnual, anos)) < 1e-9, { fPleno })
  ok('la venta de 2019 ya no se ajusta sobre lo que nunca existio',
    87.5 * fPleno < 130, { ajustado: Math.round(87.5 * fPleno * 10) / 10 })
}
{
  ok('acotaFactor respeta un factor dentro de la tasa maxima',
    Math.abs(acotaFactor(1.05, 2) - 1.05) < 1e-9, { f: acotaFactor(1.05, 2) })
  ok('acotaFactor es simetrico hacia abajo',
    Math.abs(acotaFactor(0.1, 2) - 1 / Math.pow(1.05, 2)) < 1e-9, { f: acotaFactor(0.1, 2) })
  ok('acotaFactor a 0 anos no mueve nada', acotaFactor(3, 0) === 1, { f: acotaFactor(3, 0) })
}

console.log('\n7b) CALIBRACION CON EL PROPIO CONJUNTO')
{
  const t = tasaApreciacionConjunto({ ventas: VENTAS, m2Objetivo: M2, hoy: HOY })
  ok('el conjunto calibra su propia apreciacion', t != null && t.tasa > 0, { t })
  ok('y da una tasa realista (1%-5% anual), no el 13,5% del sector',
    t.tasa > 0.01 && t.tasa <= CONJUNTO.apreciacionMaxAnual, { tasa_pct: t.tasa_pct })
  ok('usa ventas recientes contra antiguas del propio conjunto',
    t.n_recientes >= CONJUNTO.minPorCohorte && t.n_antiguas >= CONJUNTO.minPorCohorte, { t })
  // La prueba de fuego: con la tasa propia del conjunto, el indice del sector
  // deja de importar. Mismo resultado con un indice de 13,5% y sin indice.
  const conPleno = tasa({ serieIndice: INDICE_PLENO }).final
  const conPlano = tasa({ serieIndice: INDICE }).final
  const sinIndice = tasa({ serieIndice: null }).final
  ok('la tasacion es INMUNE al indice del sector cuando el conjunto se calibra solo',
    conPleno === conPlano && conPlano === sinIndice, { conPleno, conPlano, sinIndice })
}
{
  // Sin ventas antiguas no se puede calibrar: manda el indice, ya acotado.
  const soloRecientes = VENTAS.slice(0, 3)
  ok('sin cohorte antigua no hay calibracion propia',
    tasaApreciacionConjunto({ ventas: soloRecientes, m2Objetivo: M2, hoy: HOY }) === null)
}

console.log('\n8) REGLA DE COHERENCIA (TECHO NOMINAL)')
{
  // Con la escalera de percentil ningun estado se sale del conjunto: el maximo
  // de la escalera es el p75 de ventas que existieron, no una tarifa sumada
  // encima. La regla de coherencia deja de ser la que decide el valor.
  const r = tasa({ remodelacion: 'alta' })
  ok('remodelacion alta ya no necesita topearse: cae dentro del rango sola',
    !r.clamp && r.final === r.total && r.final < r.rango.max_uf,
    { total: r.total, final: r.final, max: r.rango.max_uf })
  ok('ningun estado queda fuera del rango de las identicas',
    ['ninguna', 'baja', 'media', 'alta'].every((e) => {
      const t = tasa({ remodelacion: e })
      return !t.clamp && t.final >= t.rango.min_uf && t.final <= t.rango.max_uf
    }))
}
{
  const r = tasa()
  ok('el rango de coherencia sale de ventas de 24 meses', r.rango.meses === 24 && r.rango.n === 3, { rango: r.rango })
  ok('ningun resultado queda bajo el minimo de las identicas',
    ['ninguna', 'baja', 'media', 'alta'].every((e) => tasa({ remodelacion: e }).final >= r.rango.min_uf),
    { min: r.rango.min_uf })
  // EL PUNTO DEL FIX: el techo se construye sobre PRECIOS NOMINALES (lo que de
  // verdad se pago) mas un carry acotado, nunca sobre valores inflados por el
  // indice del sector.
  ok('el maximo nominal es la venta real de 18.400 UF', r.rango.max_nominal_uf === 18400, { rango: r.rango })
  ok('el minimo nominal es la venta real de 15.500 UF', r.rango.min_nominal_uf === 15500, { rango: r.rango })
  const carryMax = Math.pow(1 + CONJUNTO.apreciacionMaxAnual, anosEntre('2025-09-10', HOY))
  ok('el techo es el nominal mas carry acotado, y nada mas',
    r.rango.max_uf <= Math.round(18400 * carryMax) && r.rango.max_uf >= 18400,
    { max: r.rango.max_uf, tope: Math.round(18400 * carryMax) })
  ok('el carry del techo nunca supera el ' + (CONJUNTO.apreciacionMaxAnual * 100) + '% anual',
    r.rango.carry_pct <= CONJUNTO.apreciacionMaxAnual * 100, { carry_pct: r.rango.carry_pct })
}
{
  // El techo NO se mueve aunque el indice del sector se vuelva loco: es la
  // diferencia entre contener la tasacion y empujarla hacia arriba.
  const a = rangoUnidadesIdenticas({ ventas: VENTAS, m2Objetivo: M2, hoy: HOY })
  ok('el techo no depende del indice del sector', a.max_uf < 19500, { max: a.max_uf })
  ok('ninguna corrida puede pasar de 18.400 UF + carry acotado',
    ['ninguna', 'baja', 'media', 'alta'].every((e) =>
      [INDICE, INDICE_PLENO, null].every((ix) => tasa({ remodelacion: e, serieIndice: ix }).final <= a.max_uf)),
    { max: a.max_uf })
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

console.log('\n8c) MUESTRA DEL PERCENTIL DE ESTADO - 24 MESES')
{
  const c = valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: M2, serieIndice: INDICE, hoy: HOY })
  ok('el percentil de estado se lee sobre 24 meses',
    CONJUNTO.mesesPercentil === 24 && c.ventana_percentil_meses === 24,
    { ventana: c.ventana_percentil_meses })
  ok('son las 3 ventas de los ultimos 24 meses, de 9 gemelas encontradas',
    c.n === 3 && c.n_total === 9 && c.muestra_recortada, { n: c.n, n_total: c.n_total })
  ok('ninguna venta del percentil es anterior al corte de 24 meses',
    c.ventas.every((g) => g.fecha >= '2024-09-01'), { fechas: c.ventas.map((g) => g.fecha) })
  ok('son las ventas reales de 15.500, 17.400 y 18.400 UF',
    c.ventas.map((g) => g.uf).sort((a, b) => a - b).join() === '15500,17400,18400',
    { ufs: c.ventas.map((g) => g.uf) })
  // EL PUNTO DEL FIX: con 8 anos, la venta de 2018 ajustada 8 anos hacia
  // adelante SUPERA a las de 2025 y engorda el extremo alto de la muestra, de
  // modo que el percentil sube sin que el mercado de hoy lo respalde.
  const vieja = c.ventas_todas.find((g) => g.fecha === '2018-09-11')
  const reciente = c.ventas_todas.find((g) => g.fecha === '2025-01-23')
  ok('la venta de 2018 ajustada supera a la de 2025 (por eso no puede fijar el nivel)',
    vieja.uf_m2 < reciente.uf_m2 && vieja.uf_m2_ajustado > reciente.uf_m2_ajustado,
    { v2018: [vieja.uf_m2, Math.round(vieja.uf_m2_ajustado * 10) / 10],
      v2025: [reciente.uf_m2, Math.round(reciente.uf_m2_ajustado * 10) / 10] })
  const con8anos = Math.round(percentilInterp(c.ventas_todas.map((g) => g.uf_m2_ajustado), PCTL_BASE) * M2)
  ok('la muestra de 8 anos daba un percentil MAS ALTO que la de 24 meses',
    con8anos > tasa().final, { con8anos, con24meses: tasa().final })
  ok('sin remodelar cae en 16.200-17.400 UF, no en los ~17.800 de la muestra de 8 anos',
    entre(tasa().final, 16200, 17400) && con8anos > 17400,
    { final: tasa().final, con8anos })
  // La confianza sigue leyendo la muestra COMPLETA: son 9 gemelas las que
  // respaldan la tasacion (y las que calibran la apreciacion del conjunto),
  // aunque el nivel de hoy lo fijen las 3 ventas recientes.
  ok('la confianza se lee sobre las 9 gemelas, no sobre las 3 del percentil',
    confianzaPorN(c.n_total) === 'Alta', { n_total: c.n_total })
}
{
  // La ventana del percentil nunca puede dejar la muestra bajo el minimo: si en
  // 24 meses no hay 3 ventas se usan todas las gemelas, antes que quedarse sin
  // comparables.
  const pocas = [VENTAS[0], ...VENTAS.slice(3)]
  const c = valorComparativoDirecto({ ventas: pocas, m2Objetivo: M2, serieIndice: INDICE, hoy: HOY })
  ok('con menos de 3 ventas en 24 meses se usan todas las gemelas',
    c.n === c.n_total && c.n > 3, { n: c.n, n_total: c.n_total })
}

console.log('\n8d) EL ESTADO ES UN ESCALON DE PERCENTIL DEL PROPIO CONJUNTO')
{
  const c = valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: M2, serieIndice: INDICE, hoy: HOY })
  ok('el nivel se lee sobre precios NOMINALES, no ajustados', c.nivel_nominal === true, { nivel_nominal: c.nivel_nominal })
  ok('y por eso el rango de la muestra son los UF/m2 pagados (94,5-112,2)',
    c.uf_m2_min === 94.5 && c.uf_m2_max === 112.2, { min: c.uf_m2_min, max: c.uf_m2_max })
  ok('el informe no anuncia un ajuste por fecha que el nivel no uso',
    c.hubo_ajuste_fecha === false, { hubo: c.hubo_ajuste_fecha })
  ok('la escalera cubre los cuatro estados',
    ['ninguna', 'baja', 'media', 'alta'].every((e) => c.escalera[e] && c.escalera[e].valor_uf > 0),
    { escalera: c.escalera })
  ok('sin remodelar es el percentil ' + PCTL_BASE + ' y media es la mediana',
    c.escalera.ninguna.percentil === PCTL_BASE && c.escalera.media.percentil === 50,
    { pctls: Object.values(PCTL_ESTADO) })
  ok('alta es p70-80, arriba pero sin llegar al maximo del conjunto',
    entre(PCTL_ESTADO.alta, 70, 80) && c.escalera.alta.valor_uf < Math.round(c.uf_m2_max * M2),
    { alta: c.escalera.alta, max: Math.round(c.uf_m2_max * M2) })
  // Las cuatro bandas TIENEN que separarse: si media y alta dan el mismo numero,
  // la tasacion dejo de distinguir una casa remodelada de una impecable.
  const v = ['ninguna', 'baja', 'media', 'alta'].map((e) => tasa({ remodelacion: e }).final)
  ok('las cuatro bandas son estrictamente crecientes', v.every((x, i) => i === 0 || x > v[i - 1]), { v })
  ok('y ninguna se topa contra el techo', ['ninguna', 'baja', 'media', 'alta'].every((e) => !tasa({ remodelacion: e }).clamp), { v })
  // La escalera no puede pasarse del conjunto por construccion: su techo es un
  // percentil de ventas que existieron, no una tarifa sumada encima.
  ok('el premio de alta es menor que el que daba la tarifa de 20 UF/m2',
    tasa({ remodelacion: 'alta' }).ajRemo < 20 * M2, { premio: tasa({ remodelacion: 'alta' }).ajRemo })
  ok('sin remodelar no paga premio', tasa({ remodelacion: 'ninguna' }).ajRemo === 0)
}
{
  // El premio se mide contra el escalon BASE y se suma sobre valor_uf: si el
  // percentil publicado cambia, los dos tienen que seguir hablando del mismo
  // numero. Con pctl 60 y el escalon base clavado en p32, alta terminaba 885 UF
  // por encima de su propio p75.
  const c60 = valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: M2, serieIndice: INDICE, hoy: HOY, pctl: 60 })
  const p60 = premioEstadoConjunto({ comparativo: c60, remodelacion: 'alta' })
  ok('con otro percentil base, base + premio cae EXACTO en el percentil del estado',
    c60.valor_uf + p60.premio_uf === c60.escalera.alta.valor_uf,
    { base: c60.valor_uf, premio: p60.premio_uf, p75: c60.escalera.alta.valor_uf })
}
{
  // Un conjunto sin dispersion (proyecto nuevo que vendio todo al mismo precio
  // de lista) no tiene escala de estados que leer: el premio da 0 y la ruta
  // vuelve a la tarifa en UF/m², o una casa a refaccionar y una remodelada a
  // nuevo se tasarian iguales.
  const uniforme = [1, 2, 3].map((i) => ({ rol: 'r' + i, fecha: '2025-0' + i + '-01', m2: M2, uf: 16000 }))
  const cu = valorComparativoDirecto({ ventas: uniforme, m2Objetivo: M2, serieIndice: null, hoy: HOY })
  ok('sin dispersion en el conjunto el escalon no paga nada (la ruta cae a la tarifa)',
    premioEstadoConjunto({ comparativo: cu, remodelacion: 'alta' }).premio_uf === 0,
    { premio: premioEstadoConjunto({ comparativo: cu, remodelacion: 'alta' }).premio_uf })
}
{
  // Sin gemelas no hay escalera que leer: manda la tarifa en UF/m2 del aditivo.
  ok('sin comparativo no hay premio por escalon',
    premioEstadoConjunto({ comparativo: null, remodelacion: 'alta' }) === null)
  ok('un estado desconocido cae al estado base',
    premioEstadoConjunto({
      comparativo: valorComparativoDirecto({ ventas: VENTAS, m2Objetivo: M2, serieIndice: INDICE, hoy: HOY }),
      remodelacion: 'lo-que-sea',
    }).premio_uf === 0)
}

console.log('\n8e) ANTIGUEDAD DE LA REMODELACION — PREMIO INTERPOLADO')
{
  ok('recien hecha paga el premio entero', factorAntiguedadRemodelacion('reciente') === 1)
  ok('a los 3 anos paga 75%', factorAntiguedadRemodelacion('hace3') === 0.75)
  ok('a los 5 anos paga 50%', factorAntiguedadRemodelacion('hace5') === 0.5)
  // Lo que se arreglo: antes eran escalones (1,0 / 0,85 / 0,7) y dos casas
  // remodeladas con un mes de diferencia saltaban 15% de premio.
  ok('a los 4 anos interpola entre 75% y 50%',
    Math.abs(factorAntiguedadRemodelacion(4) - 0.625) < 1e-9, { f: factorAntiguedadRemodelacion(4) })
  ok('a los 1,5 anos interpola entre 100% y 75%',
    Math.abs(factorAntiguedadRemodelacion(1.5) - 0.875) < 1e-9, { f: factorAntiguedadRemodelacion(1.5) })
  ok('acepta los anos como texto', factorAntiguedadRemodelacion('4') === factorAntiguedadRemodelacion(4))
  // El default silencioso sobrevalora: un texto que no empieza con numero caia
  // en 1 y pagaba el premio ENTERO.
  ok('extrae los anos de una frase, no paga el premio entero por no parsear',
    factorAntiguedadRemodelacion('hace 4 anos') === factorAntiguedadRemodelacion(4),
    { f: factorAntiguedadRemodelacion('hace 4 anos') })
  ok('y acepta la coma decimal dentro de la frase',
    factorAntiguedadRemodelacion('hace 1,5 anos') === factorAntiguedadRemodelacion(1.5))
  ok('mas alla de 5 anos no sigue cayendo', factorAntiguedadRemodelacion(30) === 0.5)
  ok('sin dato no castiga', factorAntiguedadRemodelacion('') === 1 && factorAntiguedadRemodelacion(null) === 1)
  ok('respeta la tabla editable de /admin',
    factorAntiguedadRemodelacion('hace5', { hace5: 0.9 }) === 0.9)
  // El factor amortiza el PREMIO, nunca la base.
  const base = tasa({ remodelacion: 'ninguna' }).final
  const nueva = tasa({ remodelacion: 'alta', tiempo: 'reciente' })
  const vieja = tasa({ remodelacion: 'alta', tiempo: 'hace5' })
  ok('una remodelacion alta de 5 anos vale la mitad del premio, no la mitad de la casa',
    vieja.ajRemo === Math.round(nueva.ajRemo * 0.5) && vieja.final > base,
    { nueva: nueva.ajRemo, vieja: vieja.ajRemo, base })
  ok('el premio nunca baja al bajar la antiguedad',
    ['reciente', 'hace3', 'hace5'].map((t) => tasa({ remodelacion: 'alta', tiempo: t }).ajRemo)
      .every((x, i, a) => i === 0 || x <= a[i - 1]))
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
