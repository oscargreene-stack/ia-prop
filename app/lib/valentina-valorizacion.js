// app/lib/valentina-valorizacion.js
// Etapa 3 — Valorización comercial: copy de Valentina + lógica de los 4 ramos.
// Se llama desde iniciarTasacion() en app/page.jsx con los datos que ya devuelve /api/tasar.

const UF_CLP = 40408 // valor UF aproximado; idealmente reemplazar por la UF del día

const nf = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })
const uf = (n) => `${nf.format(Math.round(n))} UF`
const rango = (min, max) => `${nf.format(Math.round(min))} y ${uf(max)}`

// Usa la forma que ya devuelve /api/tasar para cada comparable: { m2, precio_uf, ... }
const fmtComp = (c) => `${nf.format(Math.round(c.m2))} m² · ${uf(c.precio_uf)}`
const compsInline = (comps) => (comps || []).slice(0, 3).map(fmtComp).join(', ')

// Convierte "5.000 UF" o "$250.000.000" a UF. Devuelve null si no hay dato.
export function parseExpectativaUF(precioIdea, ufClp = UF_CLP) {
  if (!precioIdea) return null
  const s = String(precioIdea).toLowerCase()
  const digits = s.replace(/[^0-9]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  if (!n) return null
  return s.includes('uf') ? n : Math.round(n / ufClp)
}

const TOL_BAJO = 0.97
const TOL_SOBRE = 1.10

export function seleccionarRamo(expectativaUF, bandaMinUF, bandaMaxUF) {
  if (expectativaUF == null || !isFinite(expectativaUF) || expectativaUF <= 0) return 'sin_idea'
  if (expectativaUF < bandaMinUF * TOL_BAJO) return 'bajo'
  if (expectativaUF > bandaMaxUF * TOL_SOBRE) return 'sobre'
  return 'alineado'
}

function notaConfianza({ tipo, confianza }) {
  const habitacional = ['casa', 'departamento'].includes(tipo)
  if (!habitacional) {
    return 'Ten presente que para este tipo de propiedad trabajo con oferta comparable más que con un modelo cerrado, así que tómalo como una referencia inicial; la afinamos con el detalle de tu propiedad.'
  }
  if (String(confianza || '').toLowerCase() === 'baja') {
    return 'Es una primera referencia con los datos disponibles; la ajustamos con mayor precisión en la visita.'
  }
  return null
}

export function valorizacionValentina(d) {
  const {
    comuna = '', tipo = '', bandaMinUF, bandaMaxUF,
    precioSugeridoUF, comparables = [], confianza, expectativaUF,
  } = d

  const ramo = seleccionarRamo(expectativaUF, bandaMinUF, bandaMaxUF)
  const comps = compsInline(comparables)
  const tieneComps = comps.length > 0
  const bandaTxt = rango(bandaMinUF, bandaMaxUF)

  let mensajes = []

  if (ramo === 'alineado') {
    mensajes = [
      `Tienes un excelente criterio. Las ventas reales de propiedades comparables en ${comuna} sitúan hoy a la tuya entre ${bandaTxt}, y tu cifra cae precisamente dentro de ese rango. Es la posición ideal: un precio atractivo para el comprador y sólido para cerrar sin dilaciones.`,
    ]
  } else if (ramo === 'sobre') {
    mensajes = [
      'Aprecio que apuntes alto; es la actitud correcta. Permíteme mostrarte el panorama actual para definir juntos la mejor estrategia.',
      tieneComps
        ? `Estas son transacciones reales y recientes de propiedades comparables en ${comuna}: ${comps}. Sobre esa base, el mercado se mueve hoy entre ${bandaTxt}.`
        : `Según las transacciones recientes registradas en ${comuna}, el mercado se mueve hoy entre ${bandaTxt}.`,
      `Tu cifra (${uf(expectativaUF)}) se ubica por encima de ese rango. Seré franca contigo, porque es lo que corresponde: una propiedad que sale muy por sobre el mercado tiende a estancarse — el comprador la percibe cara y, cuando el precio finalmente cede, suele cerrar incluso por debajo de lo que habría alcanzado bien valorada desde el primer día. Mi recomendación es salir cerca de ${uf(precioSugeridoUF)}: despierta interés rápido y, si concurren varios interesados, son ellos quienes elevan el precio.`,
    ]
  } else if (ramo === 'bajo') {
    mensajes = [
      tieneComps
        ? `Tengo una buena noticia para ti: tu estimación es conservadora. Las ventas reales en ${comuna} — ${comps} — ubican el mercado entre ${bandaTxt}, holgadamente por sobre los ${uf(expectativaUF)} que considerabas. Podríamos salir con confianza cerca de ${uf(precioSugeridoUF)}. Y quiero ser precisa: este rango proviene de transacciones reales, no de una cifra optimista para entusiasmarte.`
        : `Tengo una buena noticia para ti: tu estimación es conservadora. El mercado en ${comuna} se ubica entre ${bandaTxt}, holgadamente por sobre los ${uf(expectativaUF)} que considerabas. Podríamos salir con confianza cerca de ${uf(precioSugeridoUF)}.`,
    ]
  } else {
    mensajes = [
      tieneComps
        ? `Permíteme orientarte con el dato concreto. Las ventas reales de propiedades comparables en ${comuna} — ${comps} — sitúan hoy el mercado entre ${bandaTxt}. Mi sugerencia para salir sería cerca de ${uf(precioSugeridoUF)}. ¿Te hace sentido?`
        : `Permíteme orientarte con el dato concreto. El mercado en ${comuna} se sitúa hoy entre ${bandaTxt}. Mi sugerencia para salir sería cerca de ${uf(precioSugeridoUF)}. ¿Te hace sentido?`,
    ]
  }

  const nota = notaConfianza({ tipo, confianza })
  if (nota) mensajes = [...mensajes, nota]

  return { ramo, mensajes }
}
