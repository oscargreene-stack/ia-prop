// app/lib/indice-mercado.js
// ═══════════════════════════════════════════════════════════════════════════
// ÍNDICE REAL DE MERCADO por comuna x tipo x banda de tamaño.
//
// Es "lo que realmente dio el mercado" (la instrucción del producto): mediana
// anual de UF/m² de TODAS las ventas reales CBR de la comuna para ese tipo y
// tamaño de propiedad, calculada sobre los datos duros de Data Inmobiliaria
// (decenas a cientos de ventas por punto — nada de muestras locales de 5
// ventas al año que inventan subidas o bajadas que nunca existieron).
//
// La banda de tamaño importa: la mediana comunal "todas las casas" mezcla
// casas de 60 m² con casas de 400 m² y sus barrios, y un año con más ventas
// baratas parece una caída de mercado. Comparar la propiedad contra SU banda
// (casa de 164 m² -> casas de 120-250 m²) elimina la mayor parte de ese ruido
// de composición. El último punto de cada serie son los últimos 12 meses.
//
// Los datos viven en indice-mercado-data.js (generado — ver scripts/).
// ═══════════════════════════════════════════════════════════════════════════
import { INDICE_MERCADO, INDICE_GENERADO } from './indice-mercado-data.js'

const BANDAS = {
  casa: [['c', 0, 120], ['m', 120, 250], ['g', 250, Infinity]],
  departamento: [['c', 0, 60], ['m', 60, 120], ['g', 120, Infinity]],
}

const ETIQUETA_BANDA = {
  casa: { c: 'hasta 120 m²', m: 'de 120 a 250 m²', g: 'de más de 250 m²' },
  departamento: { c: 'hasta 60 m²', m: 'de 60 a 120 m²', g: 'de más de 120 m²' },
}

function mesesDesde(ym, hoy = null) {
  const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''))
  if (!m) return null
  const h = hoy ? new Date(String(hoy).slice(0, 10) + 'T00:00:00Z') : new Date()
  return (h.getUTCFullYear() - parseInt(m[1], 10)) * 12 + (h.getUTCMonth() + 1 - parseInt(m[2], 10))
}

// Serie del índice para una propiedad: comuna (código SII), tipo y m².
// Devuelve { puntos, n_ventas, desde, hasta, banda, banda_label, fuente } o
// null si no hay serie utilizable (comuna sin datos, serie corta o vencida).
export function indiceMercado({ codCom, tipo, m2 }, hoy = null) {
  const com = INDICE_MERCADO[String(parseInt(codCom, 10))]
  if (!com) return null
  const tp = String(tipo || '').toLowerCase() === 'departamento' ? 'departamento' : String(tipo || '').toLowerCase()
  const porBanda = com[tp]
  if (!porBanda) return null
  // Banda por m²; si esa banda no tiene serie (comuna chica), 'todas'.
  let banda = 't'
  if (m2 > 0 && BANDAS[tp]) {
    const b = BANDAS[tp].find(([, lo, hi]) => m2 >= lo && m2 < hi)
    if (b && porBanda[b[0]]) banda = b[0]
  }
  const puntos = porBanda[banda] || porBanda.t
  if (!puntos || puntos.length < 4) return null
  // Frescura: el último punto (últimos 12 meses de ventas) no puede estar
  // vencido — sin nivel actual creíble no hay ajuste que valga.
  const edad = mesesDesde(puntos[puntos.length - 1].trimestre, hoy)
  if (edad == null || edad > 18) return null
  return {
    puntos,
    n_ventas: puntos.reduce((a, p) => a + p.n, 0),
    desde: puntos[0].trimestre,
    hasta: puntos[puntos.length - 1].trimestre,
    banda: puntos === porBanda.t ? 't' : banda,
    banda_label: puntos === porBanda.t ? 'de todos los tamaños' : (ETIQUETA_BANDA[tp] || {})[banda] || '',
    generado: INDICE_GENERADO,
    fuente: 'indice_comunal_tipo_banda',
  }
}
