// test/sendero-mirador.test.mjs — parte de `npm test`
// Caso SENDERO DEL MIRADOR 6781, Vitacura (ROL 3295-18): casa de 761 m²
// construidos (1999) en 2.000 m² de sitio. El informe del 30-oct-2026 entregó
// 57.288 UF (75 UF/m²) con un suelo de 17,8 UF/m² tomado de la mediana GENERAL
// del sector (14 casas, mayoría en sitios chicos), mientras sus propios
// comparables de tamaño similar (601–783 m²) cerraron a 52–57 UF/m². Oscar lo
// validó: valor razonable 47.000–52.000 UF.
//
// Datos REALES del informe (ventas CBR, sección 8), fechas 2025-02 a 2026-04.
import {
  puntosSuelo, resumenSuelo, sueloPorTramo, sueloDeTramo, sueloParaSitio,
  sueloPorBandaSitio, sueloResidualComparables, comparativoCasas, valorAditivoCasa, costoResidualDe,
  controlRentabilidad, COMPARATIVO_CASA, MIN_REFS_SUELO,
} from '../app/lib/tasacion-core.js'

const M2 = 761, TERRENO = 2000, ANIO = 1999, TIER = 'premium'
const COSTO = 28 // premium / regular (1999) — igual que el informe

// Ventas CBR del sector tal como las listó el informe (shape del comparable).
const COMPARABLES = [
  { direccion: 'C AGUA DEL PADRE 6815',        fecha: '2025-08', m2: 649, m2_terreno: 1291, precio_uf: 16851, distancia_m: 147 }, // mismo conjunto, 26 UF/m²
  { direccion: 'RAIMAPU 6645',                 fecha: '2026-03', m2: 583, m2_terreno: 1019, precio_uf: 33000, distancia_m: 459 },
  { direccion: 'PARQUE ANTONIO RABAT 6573',    fecha: '2026-04', m2: 781, m2_terreno: 1839, precio_uf: 44000, distancia_m: 625 },
  { direccion: 'ANTILHUE 6594',                fecha: '2025-02', m2: 601, m2_terreno: 1123, precio_uf: 31000, distancia_m: 646 },
  { direccion: 'CAM EL FAISAN 8174 LT 97',     fecha: '2025-10', m2: 783, m2_terreno: 4072, precio_uf: 69709, distancia_m: 797 },
]

// Las mismas ventas en el shape crudo del CBR (para el suelo residual), más
// 12 ventas REALES del barrio (CBR, <600 m): casas de 300-450 m² en sitios de
// ~1.000 m² que dominan el pool del polígono y dan residual de 18-22 UF/m².
// Son las que, en el preview del 30-oct, mantenían el suelo en 17,8 aunque se
// acotara por tamaño de sitio con una banda que bajaba a 0,5× (1.000 m²).
const cbr = (c, ano) => ({ price: c.precio_uf, superficie_construccion: c.m2, superficie_total_terreno: c.m2_terreno, ano_construccion: ano, date_inscripcion: c.fecha + '-15', unit: 'UF', cod_destino: 'H', copropiedad: false })
const CASAS_GRANDES = COMPARABLES.map((c, i) => cbr(c, [1991, 2005, 1983, 1990, 1994][i]))
const CASAS_MIL = [
  // [m2 constr, m2 sitio, año, UF] — ventas CBR reales 2023-2026
  [326, 1003, 1987, 21000], [358, 1071, 1989, 29000], [460, 1007, 1987, 31000], [324, 1002, 1985, 27700],
  [336, 1003, 1983, 27000], [319, 1002, 1987, 31000], [356, 1003, 2001, 31873], [377, 1000, 1983, 24424],
  [385, 1002, 1984, 29450], [404, 1005, 1983, 31000], [403, 1028, 1992, 31450], [375, 1001, 1986, 27500],
].map(([m2, t, ano, uf]) => ({ price: uf, superficie_construccion: m2, superficie_total_terreno: t, ano_construccion: ano, date_inscripcion: '2025-06-15', unit: 'UF', cod_destino: 'H', copropiedad: false }))
const TODAS = [...CASAS_GRANDES, ...CASAS_MIL]

let fail = 0
const ok = (name, cond, extra) => {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond ? '' : '\n         ' + JSON.stringify(extra)))
  if (!cond) fail++
}
const entre = (x, lo, hi) => x >= lo && x <= hi

console.log('\n1) SUELO — mediana general vs homologada por tamaño de sitio')
const { pts, fuente } = puntosSuelo(TODAS, TODAS, { tier: TIER })
const general = resumenSuelo(pts, fuente)
ok('16 referencias residuales (Agua del Padre queda fuera: suelo negativo)', pts.length === 16, { n: pts.length })
ok('la mediana general del sector es alta (≈17–21 UF/m²: dominan los sitios de 1.000)', entre(general.uf_m2_mediana, 16, 22), general)
const delTramo = sueloDeTramo(sueloPorTramo(pts), TERRENO)
ok('el tramo >1.200 m² no reúne ' + MIN_REFS_SUELO + ' referencias (antes caía a la general)', delTramo == null, delTramo)
const banda = sueloPorBandaSitio(pts, TERRENO)
ok('la banda 0,7×–2× (1.400–4.000 m²) no junta 4 ni los "≥1.400"; manda el tercio de sitios más grandes', banda && banda.banda === 'mayores', banda)
ok('ese suelo NO repite el 17,8 de los sitios de 1.000 (queda ≤ 14)', banda && banda.uf_m2_mediana <= 14, banda)
const sel = sueloParaSitio({ pts, lotM2: TERRENO, general })
ok('sueloParaSitio prefiere la banda a la general', sel.origen === 'banda' && sel.usar.uf_m2_mediana === banda.uf_m2_mediana, sel)
const selMil = sueloParaSitio({ pts, lotM2: 1000, general })
ok('un sitio de 1.000 m² lee el tramo 800–1.200 (12 refs, ≈18–22 UF/m²)', selMil.origen === 'tramo' && entre(selMil.usar.uf_m2_mediana, 17, 23), selMil)
const sc = sueloResidualComparables({ comparables: COMPARABLES, m2Terreno: TERRENO, tier: TIER })
ok('suelo residual sobre las 4 casas comparables (Agua del Padre fuera): 11–14 UF/m²', sc && sc.n === 4 && entre(sc.uf_m2_mediana, 11, 14), sc)

console.log('\n2) COMPARATIVO DE CASAS SIMILARES')
const SUELO = sc.uf_m2_mediana // el que usa la ruta: residual sobre los propios comparables
const compViejo = (() => {
  // Con ±30% de terreno (regla anterior) solo Parque A. Rabat calificaba.
  const n = COMPARABLES.filter(c => c.m2 >= M2 * 0.7 && c.m2 <= M2 * 1.3 && c.m2_terreno >= TERRENO * 0.7 && c.m2_terreno <= TERRENO * 1.3).length
  return n
})()
ok('con la banda de terreno antigua (±30%) solo 1 comparable calificaba', compViejo === 1, { compViejo })
const comp = comparativoCasas({ comparables: COMPARABLES, m2Construido: M2, m2Terreno: TERRENO, sueloUfM2: SUELO, costoUfM2: COSTO })
ok('ahora el comparativo se arma (banda de terreno ancha)', comp && comp.banda_terreno === 'ancha', comp)
ok('Agua del Padre 6815 (26 UF/m²) se descarta como atípica en bruto', comp && comp.n_descartadas === 1 && /AGUA DEL PADRE/.test(comp.descartadas[0].direccion), comp && comp.descartadas)
ok('quedan las 4 ventas de mercado (Raimapu, Rabat, Antilhue, El Faisán)', comp && comp.n === 4, comp && comp.detalle.map(d => d.direccion))
ok('ninguna homologación supera el 60% del precio', comp && comp.detalle.every(d => Math.abs(d.aj_terreno) + Math.abs(d.aj_constr) <= d.uf_hoy * COMPARATIVO_CASA.maxHomologacionPct), comp && comp.detalle)
ok('valor comparativo 44.000–50.000 UF (58–66 UF/m²)', comp && entre(comp.valor_uf, 44000, 50000), comp)

console.log('\n3) VALOR FINAL — misma cadena que /api/tasar (aditivo de referencia + comparativo)')
const aditivo = valorAditivoCasa({ sueloUfM2: SUELO, m2Terreno: TERRENO, costoUfM2: COSTO, m2Construido: M2 })
ok('aditivo con suelo homologado 42.000–53.000 UF (antes 56.908 con 17,8 UF/m²)', entre(aditivo.total_uf, 42000, 53000), aditivo)
const total = comp.valor_uf + 380 // + características (piscina/jardín) que suma el frontend
ok('total al cliente 44.000–52.000 UF (rango validado por Oscar: 47.000–52.000)', entre(total, 44000, 52000), { total, antes: 57288 })
ok('la corrección baja la tasación al menos 10% respecto del informe', total <= 57288 * 0.9, { total })

console.log('\n4) CONTROL POR RENTABILIDAD (110 UF/mes de arriendo de referencia)')
const cAntes = controlRentabilidad({ valorUf: 57288, arriendoUfMes: 110, tipo: 'casa' })
ok('el informe original (2,3%) dispara la alerta de rentabilidad', cAntes.revisar && cAntes.rentabilidad_pct < 2.5, cAntes)
const cAhora = controlRentabilidad({ valorUf: total, arriendoUfMes: 110, tipo: 'casa' })
ok('el valor corregido queda dentro del rango típico de casas (≥2,5%)', !cAhora.revisar, cAhora)

console.log('\n5) CASOS YA VALIDADOS — la banda estrecha no cambia cuando junta 4 similares')
const CUATRO_ESTRECHAS = [
  { direccion: 'A', fecha: '2026-01', m2: 200, m2_terreno: 520, precio_uf: 12000, distancia_m: 120 },
  { direccion: 'B', fecha: '2026-02', m2: 210, m2_terreno: 480, precio_uf: 12600, distancia_m: 380 },
  { direccion: 'C', fecha: '2025-11', m2: 190, m2_terreno: 550, precio_uf: 11500, distancia_m: 600 },
  { direccion: 'D', fecha: '2025-09', m2: 205, m2_terreno: 500, precio_uf: 12200, distancia_m: 700 },
  { direccion: 'E lejos y grande', fecha: '2025-09', m2: 220, m2_terreno: 900, precio_uf: 15800, distancia_m: 300 },
]
const c5 = comparativoCasas({ comparables: CUATRO_ESTRECHAS, m2Construido: 200, m2Terreno: 500, sueloUfM2: 14, costoUfM2: 30 })
ok('con 4 similares en ±30% de terreno manda la banda estrecha (E queda fuera)', c5 && c5.banda_terreno === 'estrecha' && c5.n === 4 && !c5.detalle.some(d => /E lejos/.test(d.direccion)), c5)

console.log('\n6) SITIO MÁS GRANDE QUE TODAS LAS REFERENCIAS')
const selEnorme = sueloParaSitio({ pts, lotM2: 12000, general })
ok('un sitio de 12.000 m² lee las referencias más grandes, no la mediana general', selEnorme.origen === 'banda' && selEnorme.usar.banda === 'mayores' && selEnorme.usar.uf_m2_mediana < general.uf_m2_mediana, selEnorme)

console.log('\n7) POR QUÉ EL SUELO DEBE SALIR DE LOS COMPARABLES')
const comp178 = comparativoCasas({ comparables: COMPARABLES, m2Construido: M2, m2Terreno: TERRENO, sueloUfM2: 17.8, costoUfM2: COSTO })
ok('con el suelo del pool (17,8) la homologación supera el 60% del precio y el comparativo NO se arma', comp178 == null, comp178)

console.log('')
if (fail) { console.log(`${fail} TEST(S) DE SENDERO DEL MIRADOR FALLARON`); process.exit(1) }
console.log('TODOS LOS TESTS DE SENDERO DEL MIRADOR PASARON')
