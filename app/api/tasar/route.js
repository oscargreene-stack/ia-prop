<<<<<<< Updated upstream
// app/api/tasar/route.js
// Agente Valentina — tasadora inmobiliaria experta
// FLUJO:
//  1. Requiere m2_construido real del SII (no estimado)
//  2. Obtiene comparables REALES del CBR via DataInmobiliaria (REST)
//  3. Calcula el valor DE FORMA DETERMINÍSTICA (mediana CBR + ajustes)
//  4. Claude SOLO narra: análisis, factores, plan regulador y recomendación,
//     coherentes con el valor determinístico (no recalcula valor)

import { normativaEnPunto } from '../../lib/prc.js'

export const maxDuration = 60

const COD_COMUNA = {
  'CERRILLOS':14166,'CERRO NAVIA':14156,'CONCHALI':14127,'EL BOSQUE':16165,'ESTACION CENTRAL':14157,
  'HUECHURABA':14158,'INDEPENDENCIA':13167,'LA CISTERNA':16110,'LA FLORIDA':15128,'LA GRANJA':16131,
  'LA PINTANA':16154,'LA REINA':15132,'LAS CONDES':15108,'LO BARNECHEA':15161,'LO ESPEJO':16164,
  'LO PRADO':14155,'MACUL':15151,'MAIPU':14109,'NUNOA':15105,'PEDRO AGUIRRE CERDA':16162,
  'PENALOLEN':15152,'PROVIDENCIA':15103,'PUDAHUEL':14111,'PUENTE ALTO':16301,'QUILICURA':14114,
  'QUINTA NORMAL':14107,'RECOLETA':13159,'RENCA':14113,'SAN BERNARDO':16401,'SAN JOAQUIN':16163,
  'SAN MIGUEL':16106,'SAN RAMON':16153,'SANTIAGO':13101,'VITACURA':15160,
}

function normalizaComuna(s) {
  return String(s || '').trim().toUpperCase()
    .replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U')
    .replace(/Ñ/g,'N')
}

// Geocodifica una dirección a {lat,lng} (mismo enfoque que /api/zona). Sirve para ubicar
// la propiedad en su zona del Plan Regulador.
const GKEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
async function geocodeDireccion(texto) {
  try {
    if (!GKEY || !texto || !texto.replace(/[, ]/g, '')) return null
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(texto + ', Región Metropolitana, Chile')}&key=${GKEY}`
    const r = await fetch(url)
    const j = await r.json()
    if (j.status !== 'OK' || !j.results || !j.results.length) return null
    const loc = j.results[0].geometry.location
    return { lat: loc.lat, lng: loc.lng }
  } catch (e) { return null }
}

// ── AJUSTES DETERMINÍSTICOS (editables desde /admin vía Edge Config) ───────────
// Estos son los valores de RESPALDO; los efectivos se leen de Edge Config.
const AJUSTES_CONFIG = {
  // Piso y orientación: % sobre el valor base (van DENTRO de valor_uf).
  piso: {
    tiposAplica: ['departamento', 'depto', 'oficina'],
    pctPorCada5SobreEl5: 0.02,   // +2% por cada 5 pisos completos por encima del 5º
    pisoBajoUmbral: 2,           // pisos 1–2
    pctPisoBajo: -0.02,          // -2% en pisos bajos
  },
  orientacion: {
    norte: 0.04, sur: -0.03, oriente: 0.02, poniente: -0.02,
  },
  // Remodelación: UF/m² sobre m² útiles, multiplicado por antigüedad.
  remodelacion: {
    baja: 5, media: 10, alta: 20,
    tiempo: { reciente: 1.0, hace3: 0.85, hace5: 0.7 },
    // 'ninguna' → 0
  },
  // Jardín: cada m² de jardín vale (factor) × precio por m² real de la propiedad.
  jardin: { factor: 0.3333 },
  // Características: UF que suma cada una.
  caracteristicas: {
    piscina:300, quincho:120, vista:150, jardin:80, doble_altura:100, seguridad:40,
    vista_despejada:100, piscina_edificio:80, gimnasio:40, conserje:30, calefaccion:50,
    terraza_of:80, sala_reuniones:60, rio_lago:200, arboles:60, construccion:150,
    rio:150, galpones:100, luz:80, si_canal:300, si_pozo:200, si_multiple:400,
    bodega:80, galpon:120, camara_frio:200, riego_tecnificado:300, acceso_camion:150,
    anden:100, frigorificos:200, tres_fase:100,
  },
}

// Fix #4: lee los ajustes desde Vercel Edge Config (editables por el admin),
// con AJUSTES_CONFIG como respaldo si el store está vacío o no responde.
// Usa la connection string EDGE_CONFIG que Vercel inyecta; sin dependencias extra.
async function getAjustesConfig() {
  try {
    const ec = process.env.EDGE_CONFIG
    if (!ec) return AJUSTES_CONFIG
    const u = new URL(ec)
    const id = u.pathname.split('/').filter(Boolean)[0]
    const token = u.searchParams.get('token')
    if (!id || !token) return AJUSTES_CONFIG
    const res = await fetch(`https://edge-config.vercel.com/${id}/item/ajustes?token=${token}`)
    if (!res.ok) return AJUSTES_CONFIG
    const stored = await res.json()
    if (!stored || typeof stored !== 'object') return AJUSTES_CONFIG
    // Overlay de los valores guardados sobre el respaldo (claves faltantes caen al default)
    return {
      piso: { ...AJUSTES_CONFIG.piso, ...(stored.piso || {}) },
      orientacion: { ...AJUSTES_CONFIG.orientacion, ...(stored.orientacion || {}) },
      remodelacion: {
        ...AJUSTES_CONFIG.remodelacion, ...(stored.remodelacion || {}),
        tiempo: { ...AJUSTES_CONFIG.remodelacion.tiempo, ...((stored.remodelacion && stored.remodelacion.tiempo) || {}) },
      },
      jardin: { ...AJUSTES_CONFIG.jardin, ...(stored.jardin || {}) },
      caracteristicas: { ...AJUSTES_CONFIG.caracteristicas, ...(stored.caracteristicas || {}) },
    }
  } catch (e) {
    return AJUSTES_CONFIG
  }
}

// Devuelve { factor, lineas[] } a partir del baseUf.
// lineas[] son items de desglose ya calculados en UF.
function aplicarAjustes({ baseUf, tipo, extras, answers, cfg }) {
  const lineas = []
  let acumUf = baseUf

  const addPct = (concepto, pct, detalle) => {
    if (!pct) return
    const delta = Math.round(acumUf * pct)
    if (delta === 0) return
    const signo = pct > 0 ? '+' : ''
    lineas.push({ concepto, calculo: `${detalle} (${signo}${Math.round(pct * 100)}%)`, valor_uf: delta })
    acumUf += delta
  }

  // Piso (solo deptos/oficinas)
  const tipoNorm = String(tipo || '').toLowerCase()
  const piso = extras?.piso != null ? parseInt(String(extras.piso).match(/-?\d+/)?.[0] ?? '', 10) : null
  if (cfg.piso.tiposAplica.includes(tipoNorm) && Number.isFinite(piso)) {
    if (piso >= 5) {
      const tramos = Math.floor((piso - 5) / 5)
      if (tramos > 0) addPct('Ajuste por piso', tramos * cfg.piso.pctPorCada5SobreEl5, `piso ${piso}`)
    } else if (piso >= 1 && piso <= cfg.piso.pisoBajoUmbral) {
      addPct('Ajuste por piso', cfg.piso.pctPisoBajo, `piso bajo (${piso})`)
    }
  }

  // Orientación (norte / sur / oriente / poniente)
  const ori = String(extras?.orientacion || '').toLowerCase()
  if (ori.includes('norte')) addPct('Ajuste por orientación', cfg.orientacion.norte, 'orientación norte')
  else if (ori.includes('sur')) addPct('Ajuste por orientación', cfg.orientacion.sur, 'orientación sur')
  else if (ori.includes('oriente')) addPct('Ajuste por orientación', cfg.orientacion.oriente, 'orientación oriente')
  else if (ori.includes('poniente')) addPct('Ajuste por orientación', cfg.orientacion.poniente, 'orientación poniente')

  // (Remodelación, jardín y características NO van acá: se devuelven aparte como
  //  ajustes que el frontend suma sobre el valor base — ver calcAjustesExtra.)

  return { finalUf: acumUf, lineas }
}

// Ajustes que se devuelven aparte (el frontend los suma sobre el valor base):
// remodelación (UF/m² × m² útiles × antigüedad), características (UF c/u) y
// jardín (factor × precio real por m²). Todo desde la config editable.
function calcAjustesExtra({ cfg, answers, extras, m2Util, precioM2 }) {
  const remoKey = String(answers?.remodelacion || '').toLowerCase()
  const remoUfM2 = (typeof cfg.remodelacion[remoKey] === 'number') ? cfg.remodelacion[remoKey] : 0
  const tiempoKey = String(answers?.tiempo_remo || '').toLowerCase()
  const tiempoMult = (cfg.remodelacion.tiempo && typeof cfg.remodelacion.tiempo[tiempoKey] === 'number') ? cfg.remodelacion.tiempo[tiempoKey] : 1
  const ajRemo = Math.round(remoUfM2 * (m2Util || 0) * tiempoMult)

  const lista = [
    ...(Array.isArray(extras?.caracteristicas) ? extras.caracteristicas : []),
    extras?.derechos_agua || answers?.derechos_agua || '',
    extras?.infraestructura || answers?.infraestructura || '',
  ].flat().filter(c => c && c !== 'ninguna')
  const ajCar = lista.reduce((s, c) => s + (cfg.caracteristicas[c] || 0), 0)

  const jardinM2 = parseFloat(extras?.jardin_m2) || 0
  const factor = (cfg.jardin && typeof cfg.jardin.factor === 'number') ? cfg.jardin.factor : 0
  const ajJardin = (jardinM2 > 0 && precioM2 > 0) ? Math.round(jardinM2 * precioM2 * factor) : 0

  return { ajRemo, ajCar, ajJardin, remoUfM2 }
}

export async function POST(request) {
  const body = await request.json()
  const { siiData, form, answers, extras } = body

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const MCP_URL = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
  const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN

  if (!ANTHROPIC_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  const dir = siiData?.direccion || `${form.direccion}${form.depto ? ' '+form.depto : ''}, ${form.comuna}`
  const comuna = form.comuna || ''
  const tipo = extras?.tipo || 'propiedad'
  const rol = siiData?.rol || null
  const anio = siiData?.anio_construccion || null
  const avaluo = siiData?.avaluo_total_clp ? Math.round(siiData.avaluo_total_clp / 40408) : null
  const caracts = (extras?.caracteristicas || []).filter(c => c !== 'ninguna')

  // ── Superficies confirmadas del SII ──────────────────────────────────────
  const m2Construido = siiData?.m2_construido ? parseFloat(siiData.m2_construido) : null
  const m2Terreno = siiData?.m2_terreno ? parseFloat(siiData.m2_terreno) : null

  // Si no hay datos SII: no tasamos
  if (!m2Construido && !m2Terreno) {
    return Response.json({
      error: 'Sin datos SII',
      mensaje: 'No se encontraron los metros cuadrados reales del SII. No es posible realizar una tasación sin esta información.'
    }, { status: 422 })
  }

  function calcularSimilitud(row, m2C, m2T) {
    const dif = m2C ? Math.abs(parseFloat(row.m2_construido) - m2C) / m2C : 0
    if (dif < 0.1) return 'Muy similar'
    if (dif < 0.25) return 'Similar'
    return 'Referencial'
  }

  // ── 1. Obtener comparables REALES del CBR via REST ──────────────────────
  let comparablesReales = []
  try {
    const codCom = siiData?.cod_comuna
      || (rol ? parseInt(String(rol).split('-')[0], 10) : null)
      || COD_COMUNA[normalizaComuna(comuna)]
      || null
    if (codCom && m2Construido && DATAINM_TOKEN) {
      const rolParts = String(rol || '').split('-')
      const ccom = rolParts[0] || String(codCom)
      const cmz = rolParts[1] || ''
      const cpr = rolParts[2] || ''
      const m2Min = Math.round(m2Construido * 0.6)
      const m2Max = Math.round(m2Construido * 1.5)
      const cd = (tipo === 'oficina') ? 'O' : 'H'
      const qs = new URLSearchParams({
        cod_com: String(ccom), cod_mz: String(cmz), cod_pr: String(cpr),
        radio: '2000', superficie_min: String(m2Min), superficie_max: String(m2Max), cod_destino: cd,
      }).toString()
      const restUrl = 'https://datainmobiliaria.cl/api/v1/propiedades/detalle?' + qs
      const restRes = await fetch(restUrl, { headers: { Authorization: 'Bearer ' + DATAINM_TOKEN } })
      if (restRes.ok) {
        const data = await restRes.json()
        const ventas = Array.isArray(data.detalle_ventas_recientes) ? data.detalle_ventas_recientes : []
        const filtro = Array.isArray(data.comparables_filtro) ? data.comparables_filtro : []
        const fuente = filtro.length > 0 ? filtro : ventas
        comparablesReales = fuente
          .filter(v => parseFloat(v.superficie_construccion) > 0 && parseFloat(v.price) > 0 && (v.unit === 'UF' || !v.unit))
          .map(v => {
            const m2 = Math.round(parseFloat(v.superficie_construccion))
            const uf = Math.round(parseFloat(v.price))
            return {
              direccion: (v.direccion_sii || 'Sin direccion').toString().trim(),
              tipo: tipo,
              m2: m2,
              m2_terreno: null,
              fecha: (v.fecha || 'N/D').toString().slice(0, 7),
              precio_uf: uf,
              uf_m2: m2 > 0 ? Math.round(uf / m2) : null,
              ano_construccion: null,
              mismo_edificio: cmz !== '' && String(v.cod_mz) === String(cmz),
              distancia_m: v.distancia_metros != null ? Math.round(v.distancia_metros) : null,
              similitud: calcularSimilitud({ m2_construido: v.superficie_construccion }, m2Construido, m2Terreno),
            }
          })
          .filter(c => c.uf_m2 && c.uf_m2 >= 20 && c.uf_m2 <= 400)
          .sort((a, b) => (a.distancia_m != null && b.distancia_m != null) ? (a.distancia_m - b.distancia_m) : 0)
          .slice(0, 12)
      }
    }
  } catch (e) {
    console.error('Error fetching comparables (REST):', e.message)
  }

  // ── 2. VALOR DETERMINÍSTICO ───────────────────────────────────────────────
  // Se calcula ANTES del LLM para poder pasárselo como dato autoritativo.
  const ajustesCfg = await getAjustesConfig()
  let valorDet = null      // { valor_uf, precio_m2, confianza, desglose[] }
  let precioM2Base = null  // precio por m² base (mediana CBR), para el jardín
  if (comparablesReales.length > 0 && m2Construido) {
    const ufm2List = comparablesReales.map(c => c.uf_m2).filter(x => x > 0).sort((a, b) => a - b)
    if (ufm2List.length) {
      const mid = Math.floor(ufm2List.length / 2)
      const medianaUfM2 = ufm2List.length % 2 ? ufm2List[mid] : Math.round((ufm2List[mid - 1] + ufm2List[mid]) / 2)
      const baseUf = Math.round(medianaUfM2 * m2Construido)
      precioM2Base = medianaUfM2

      const { finalUf, lineas } = aplicarAjustes({ baseUf, tipo, extras, answers, cfg: ajustesCfg })

      const desglose = [
        { concepto: 'Valor base por comparables CBR', calculo: `mediana ${medianaUfM2} UF/m2 x ${m2Construido} m2 (${comparablesReales.length} ventas reales)`, valor_uf: baseUf },
        ...lineas,
      ]
      valorDet = {
        valor_uf: finalUf,
        precio_m2: Math.round(finalUf / m2Construido),
        confianza: comparablesReales.length >= 5 ? 'Alta' : (comparablesReales.length >= 3 ? 'Media' : 'Baja'),
        desglose,
      }
    }
  }

  // Ajustes que el frontend suma sobre el valor base (remodelación, características,
  // jardín), calculados desde la config editable. El jardín usa el precio real por m².
  const m2UtilCalc = parseFloat(answers?.m2_util || siiData?.m2_util || m2Construido) || 60
  const ajustesExtra = calcAjustesExtra({
    cfg: ajustesCfg, answers, extras,
    m2Util: m2UtilCalc,
    precioM2: precioM2Base || 50,
  })

  // ── 2b. NORMATIVA REAL DEL PRC (módulo compartido, el mismo que usa Isidora) ──
  // Geocodifica la propiedad y obtiene su zona oficial del plan regulador. Sirve para
  // que Valentina deje de INVENTAR el plan_regulador: la zona real manda sobre el LLM.
  // Hoy resuelve donde haya GeoJSON cargado (Las Condes); para otras comunas → null.
  let prcZona = null
  try {
    let baseUrl = ''
    try { baseUrl = new URL(request.url).origin } catch (e) {}
    if (!baseUrl && process.env.VERCEL_URL) baseUrl = `https://${process.env.VERCEL_URL}`
    const punto = await geocodeDireccion(`${form.direccion || ''}, ${comuna}`)
    if (punto) prcZona = await normativaEnPunto(punto.lng, punto.lat, comuna, baseUrl)
  } catch (e) { console.error('PRC tasar:', e.message) }
  const normativaTexto = prcZona
    ? `\n\nNORMATIVA OFICIAL DEL PLAN REGULADOR (AUTORITATIVA — úsala tal cual en plan_regulador y en tu análisis, NO la inventes):\n${JSON.stringify({ zona: prcZona.zona, nombre_zona: prcZona.nombre, uso_suelo: prcZona.uso, densidad: prcZona.densidad, superficie_predial_minima_m2: prcZona.predial_min, constructibilidad: prcZona.constructibilidad, fuente: prcZona.fuente }, null, 2)}`
    : ''

  // ── 3. Armar prompt: el LLM SOLO narra ─────────────────────────────────────
  const systemPrompt = `Eres Valentina, tasadora inmobiliaria experta con 20 años de experiencia en la Región Metropolitana de Chile.

REGLAS CRÍTICAS — DATOS CONFIRMADOS DEL SII:
- Los m² marcados como "CONFIRMADOS" son datos REALES del SII. NUNCA los modifiques, estimes ni cambies.
- USA EXACTAMENTE esos m² en todos los cálculos y el desglose.
- Si no hay un dato confirmado de m², NO lo estimes — usa solo lo que tienes.

VALOR DETERMINÍSTICO (AUTORITATIVO):
- Cuando se te entregue un "VALOR FINAL" y un "DESGLOSE" calculados por el sistema, son DEFINITIVOS.
- COPIA exactamente valor_uf, precio_m2, confianza y desglose tal como se te entregan. NO los recalcules ni los modifiques.
- Tu trabajo es NARRAR: análisis, factores positivos/negativos, plan regulador y recomendación de precio, todo COHERENTE con ese valor final. La prosa NO puede contradecir el número (no menciones un valor distinto al entregado).
- Si NO se te entrega un valor determinístico (no hubo comparables), recién ahí estima tú con tus rangos de referencia por comuna y confianza Media.

PLAN REGULADOR:
- Si se te entrega una "NORMATIVA OFICIAL DEL PLAN REGULADOR", úsala EXACTAMENTE (zona, nombre, uso de suelo, predial mínimo). NO inventes una zona distinta.
- Si NO se te entrega, recién ahí estima la zonificación con tu conocimiento, y acláralo como referencial.

PERFIL:
- Conoces el mercado inmobiliario chileno 2023-2025: precios reales por comuna, tendencias, factores.
- Manejas los planes reguladores comunales de la RM: zonificación, alturas, constructibilidad.

PRECIOS DE REFERENCIA 2025 (UF/m² construido) — SOLO como respaldo si NO hay comparables:
- Vitacura: 85-130 | Las Condes: 70-115 | Lo Barnechea: 60-100
- Providencia: 65-100 | Ñuñoa: 55-82 | La Reina: 50-75
- Macul, San Miguel, Quinta Normal: 35-55 | La Florida, Maipú, Pudahuel: 28-50
- Santiago Centro: 45-72 | Peñalolén, La Granja: 30-48 | Puente Alto: 25-40
- San Bernardo, El Bosque: 22-38 | Lo Prado, Renca: 25-42

ANÁLISIS DE POTENCIAL DE DESARROLLO (solo casas/terrenos con m² terreno > 800m²):
- Calcular unidades: (densidad_max_hab/ha ÷ 10000 × m2_terreno) ÷ 4 personas/hogar
- Ejemplo: 3.982m², densidad 50 hab/ha → (50/10000)×3982÷4 = ~5 unidades
- Si permite 2+ unidades: incluir potencial_desarrollo

RESPONDE SOLO con JSON válido en UNA SOLA LÍNEA sin saltos dentro de strings:
{
  "valor_uf": number,
  "precio_m2": number,
  "confianza": "Alta" | "Media" | "Baja",
  "plan_regulador": {
    "zona": string,
    "nombre_zona": string,
    "uso_suelo": string,
    "altura_max_pisos": number,
    "altura_max_m": number,
    "coef_constructibilidad": string,
    "coef_ocupacion_suelo": string,
    "densidad_max": string,
    "adosamiento": string,
    "antejardin_m": number,
    "observaciones": string,
    "impacto_valor": string
  },
  "desglose": [
    { "concepto": string, "calculo": string, "valor_uf": number }
  ],
  "analisis": string,
  "factores_positivos": [string],
  "factores_negativos": [string],
  "recomendacion_precio_venta": string,
  "potencial_desarrollo": {
    "aplica": boolean,
    "m2_terreno": number,
    "densidad_max_hab_ha": number,
    "unidades_estimadas": number,
    "descripcion": string,
    "advertencia": string
  } | null
}`

  const comparablesTexto = comparablesReales.length > 0
    ? `\n\nTRANSACCIONES REALES CBR (datos confirmados del Conservador de Bienes Raíces):\n${JSON.stringify(comparablesReales, null, 2)}`
    : '\n\nNOTA: No se encontraron comparables reales en el CBR para este segmento. Usa tus referencias de mercado con confianza Media.'

  // Fix #3: el valor final determinístico se entrega al LLM como autoritativo.
  const valorTexto = valorDet
    ? `\n\nVALOR FINAL (AUTORITATIVO — cópialo tal cual, no recalcules):\n${JSON.stringify({
        valor_uf: valorDet.valor_uf,
        precio_m2: valorDet.precio_m2,
        confianza: valorDet.confianza,
        desglose: valorDet.desglose,
      }, null, 2)}\nTu análisis, factores y recomendación deben ser coherentes con este valor.`
    : ''

  const detalles = [
    `Tipo de propiedad: ${tipo}`,
    `Dirección: ${dir}`,
    `Comuna: ${comuna}`,
    rol ? `ROL SII: ${rol}` : null,
    m2Construido ? `M² construidos CONFIRMADOS (SII): ${m2Construido} m²` : null,
    m2Terreno ? `M² terreno CONFIRMADO (SII): ${m2Terreno} m²` : null,
    anio ? `Año construcción: ${anio}` : null,
    avaluo ? `Avalúo fiscal: ${avaluo} UF` : null,
    siiData?.destino ? `Destino SII: ${siiData.destino}` : null,
    answers?.remodelacion && answers.remodelacion !== 'ninguna'
      ? `Remodelación: ${answers.remodelacion}${answers.tiempo_remo ? ', hace '+answers.tiempo_remo : ''}`
      : 'Sin remodelación',
    answers?.terraza_m2 > 0 ? `Terraza: ${answers.terraza_m2} m²` : null,
    answers?.estacionamientos > 0 ? `Estacionamientos: ${answers.estacionamientos}` : null,
    answers?.bodegas > 0 ? `Bodegas: ${answers.bodegas}` : null,
    extras?.piso ? `Piso: ${extras.piso}` : null,
    extras?.orientacion ? `Orientación: ${extras.orientacion}` : null,
    extras?.jardin_m2 > 0 ? `Jardín/patio: ${extras.jardin_m2} m²` : null,
    caracts.length ? `Características: ${caracts.join(', ')}` : null,
    extras?.precio_idea ? `Precio esperado por vendedor: ${extras.precio_idea}` : null,
  ].filter(Boolean).join('\n')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Tasa esta propiedad:\n\n${detalles}${comparablesTexto}${valorTexto}${normativaTexto}` }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return Response.json({ error: data.error?.message || 'Error Anthropic' }, { status: 500 })

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    const clean = text.replace(/```json|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ error: 'Sin JSON en respuesta', raw: text.slice(0, 300) }, { status: 500 })

    function sanitizeJSON(raw) {
      let s = raw
        .replace(/[“”„‟″‶]/g, '"')
        .replace(/[‘’‚‛′‵]/g, "'")
        .replace(/–|—/g, '-')
        .replace(/\r?\n/g, ' ').replace(/\r/g, ' ')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
        .replace(/,\s*([\]\}])/g, '$1')
      let result = '', inString = false, escaped = false
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        if (escaped) { result += ch; escaped = false; continue }
        if (ch === '\\') { result += ch; escaped = true; continue }
        if (ch === '"') {
          if (!inString) { inString = true; result += ch; continue }
          let j = i + 1
          while (j < s.length && s[j] === ' ') j++
          const next = s[j]
          if (next === ':' || next === ',' || next === '}' || next === ']') {
            inString = false; result += ch
          } else {
            result += '\\"'
          }
          continue
        }
        result += ch
      }
      return result
    }

    const sanitized = sanitizeJSON(match[0])
    try {
      const parsed = JSON.parse(sanitized)

      // Fix #3: el valor determinístico SIEMPRE manda sobre lo que devuelva el LLM.
      if (valorDet) {
        parsed.comparables = comparablesReales
        parsed.valor_uf = valorDet.valor_uf
        parsed.precio_m2 = valorDet.precio_m2
        parsed.confianza = valorDet.confianza
        parsed.desglose = valorDet.desglose
      } else if (comparablesReales.length > 0) {
        parsed.comparables = comparablesReales
      }

      // La normativa OFICIAL del PRC manda sobre lo que invente el LLM (zona, uso, predial).
      // Se mantiene densidad_max del LLM (la usa el cálculo de potencial); el resto es oficial.
      if (prcZona) {
        const prevObs = (parsed.plan_regulador && parsed.plan_regulador.observaciones) || ''
        parsed.plan_regulador = {
          ...(parsed.plan_regulador || {}),
          zona: prcZona.zona,
          nombre_zona: prcZona.nombre,
          uso_suelo: prcZona.uso || (parsed.plan_regulador && parsed.plan_regulador.uso_suelo) || null,
          ...(prcZona.constructibilidad != null ? { coef_constructibilidad: prcZona.constructibilidad } : {}),
          superficie_predial_minima_m2: prcZona.predial_min,
          observaciones: `Superficie predial mínima ~${prcZona.predial_min} m² · fuente: Plan Regulador${prcZona.fuente === 'ordenanza' ? ' (Ordenanza)' : ''}. ${prevObs}`.trim(),
        }
      }

      // Calcular potencial_desarrollo en servidor
      if (m2Terreno && m2Terreno > 800 && ['casa','terreno','parcela','agricola'].includes(tipo)) {
        const pr = parsed.plan_regulador
        let densidadHabHa = null
        if (pr?.densidad_max) {
          const dm = String(pr.densidad_max).match(/\d+/)
          if (dm) densidadHabHa = parseInt(dm[0])
        }
        if (!densidadHabHa) {
          const cL = comuna.toLowerCase()
          densidadHabHa = ['vitacura','las condes','lo barnechea','la reina'].some(c => cL.includes(c)) ? 60 : 120
        }
        const unidades = Math.floor((densidadHabHa / 10000) * m2Terreno / 4)
        if (unidades >= 2) {
          parsed.potencial_desarrollo = {
            aplica: true,
            m2_terreno: m2Terreno,
            densidad_max_hab_ha: densidadHabHa,
            unidades_estimadas: unidades,
            descripcion: `El terreno de ${m2Terreno.toLocaleString('es-CL')} m² permite, según la densidad del plan regulador (${densidadHabHa} hab/ha), construir aproximadamente ${unidades} viviendas (${densidadHabHa} ÷ 10.000 × ${m2Terreno} ÷ 4 personas/hogar). ${unidades >= 4 ? 'Esto significa que es posible demoler la construcción actual y desarrollar un proyecto de ' + unidades + ' viviendas, multiplicando significativamente el valor del terreno. Un comprador desarrollador puede valorar este predio muy por encima del valor como vivienda individual.' : 'El terreno permitiría subdividir y construir hasta ' + unidades + ' viviendas adicionales, aumentando su potencial de valorización.'}`,
            advertencia: `Cálculo referencial basado en la densidad del plan regulador. Los m² mínimos de subdivisión, factibilidad real y condiciones específicas deben verificarse con un arquitecto y la DOM de ${comuna}.`
          }
        } else {
          parsed.potencial_desarrollo = { aplica: false }
        }
      } else if (!parsed.potencial_desarrollo) {
        parsed.potencial_desarrollo = { aplica: false }
      }

      parsed.ajustes = ajustesExtra
      return Response.json(parsed)
    } catch(parseErr) {
      console.error('JSON parse error:', parseErr.message)
      const extract = (key) => { const m = sanitized.match(new RegExp('"' + key + '"\\s*:\\s*([\\d.]+)')); return m ? parseFloat(m[1]) : null }
      const extractStr = (key) => { const m = sanitized.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"')); return m ? m[1] : null }
      const fallback = {
        valor_uf: valorDet?.valor_uf ?? extract('valor_uf'),
        precio_m2: valorDet?.precio_m2 ?? extract('precio_m2'),
        confianza: valorDet?.confianza ?? extractStr('confianza') ?? 'Baja',
        analisis: extractStr('analisis') || 'Tasación completada.',
        recomendacion_precio_venta: extractStr('recomendacion_precio_venta') || '',
        comparables: comparablesReales,
        ajustes: ajustesExtra,
        desglose: valorDet?.desglose ?? [], factores_positivos: [], factores_negativos: [], plan_regulador: null
      }
      if (fallback.valor_uf) return Response.json(fallback)
      return Response.json({ error: 'JSON invalido: ' + parseErr.message, raw: sanitized.slice(0, 300) }, { status: 500 })
    }
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
=======
// app/api/tasar/route.js
// Agente Valentina — tasadora inmobiliaria experta
// FLUJO:
//  1. Requiere m2_construido real del SII (no estimado)
//  2. Obtiene comparables REALES del CBR via DataInmobiliaria (REST)
//  3. Calcula el valor DE FORMA DETERMINÍSTICA (mediana CBR + ajustes)
//  4. Claude SOLO narra: análisis, factores, plan regulador y recomendación,
//     coherentes con el valor determinístico (no recalcula valor)

export const maxDuration = 60

const COD_COMUNA = {
  'CERRILLOS':14166,'CERRO NAVIA':14156,'CONCHALI':14127,'EL BOSQUE':16165,'ESTACION CENTRAL':14157,
  'HUECHURABA':14158,'INDEPENDENCIA':13167,'LA CISTERNA':16110,'LA FLORIDA':15128,'LA GRANJA':16131,
  'LA PINTANA':16154,'LA REINA':15132,'LAS CONDES':15108,'LO BARNECHEA':15161,'LO ESPEJO':16164,
  'LO PRADO':14155,'MACUL':15151,'MAIPU':14109,'NUNOA':15105,'PEDRO AGUIRRE CERDA':16162,
  'PENALOLEN':15152,'PROVIDENCIA':15103,'PUDAHUEL':14111,'PUENTE ALTO':16301,'QUILICURA':14114,
  'QUINTA NORMAL':14107,'RECOLETA':13159,'RENCA':14113,'SAN BERNARDO':16401,'SAN JOAQUIN':16163,
  'SAN MIGUEL':16106,'SAN RAMON':16153,'SANTIAGO':13101,'VITACURA':15160,
}

function normalizaComuna(s) {
  return String(s || '').trim().toUpperCase()
    .replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U')
    .replace(/Ñ/g,'N')
}

// ── AJUSTES DETERMINÍSTICOS (editables desde /admin vía Edge Config) ───────────
// Estos son los valores de RESPALDO; los efectivos se leen de Edge Config.
const AJUSTES_CONFIG = {
  // Piso y orientación: % sobre el valor base (van DENTRO de valor_uf).
  piso: {
    tiposAplica: ['departamento', 'depto', 'oficina'],
    pctPorCada5SobreEl5: 0.02,   // +2% por cada 5 pisos completos por encima del 5º
    pisoBajoUmbral: 2,           // pisos 1–2
    pctPisoBajo: -0.02,          // -2% en pisos bajos
  },
  orientacion: {
    norte: 0.04, sur: -0.03, oriente: 0.02, poniente: -0.02,
  },
  // Remodelación: UF/m² sobre m² útiles, multiplicado por antigüedad.
  remodelacion: {
    baja: 5, media: 10, alta: 20,
    tiempo: { reciente: 1.0, hace3: 0.85, hace5: 0.7 },
    // 'ninguna' → 0
  },
  // Jardín: cada m² de jardín vale (factor) × precio por m² real de la propiedad.
  jardin: { factor: 0.3333 },
  // Características: UF que suma cada una.
  caracteristicas: {
    piscina:300, quincho:120, vista:150, jardin:80, doble_altura:100, seguridad:40,
    vista_despejada:100, piscina_edificio:80, gimnasio:40, conserje:30, calefaccion:50,
    terraza_of:80, sala_reuniones:60, rio_lago:200, arboles:60, construccion:150,
    rio:150, galpones:100, luz:80, si_canal:300, si_pozo:200, si_multiple:400,
    bodega:80, galpon:120, camara_frio:200, riego_tecnificado:300, acceso_camion:150,
    anden:100, frigorificos:200, tres_fase:100,
  },
}

// Fix #4: lee los ajustes desde Vercel Edge Config (editables por el admin),
// con AJUSTES_CONFIG como respaldo si el store está vacío o no responde.
// Usa la connection string EDGE_CONFIG que Vercel inyecta; sin dependencias extra.
async function getAjustesConfig() {
  try {
    const ec = process.env.EDGE_CONFIG
    if (!ec) return AJUSTES_CONFIG
    const u = new URL(ec)
    const id = u.pathname.split('/').filter(Boolean)[0]
    const token = u.searchParams.get('token')
    if (!id || !token) return AJUSTES_CONFIG
    const res = await fetch(`https://edge-config.vercel.com/${id}/item/ajustes?token=${token}`)
    if (!res.ok) return AJUSTES_CONFIG
    const stored = await res.json()
    if (!stored || typeof stored !== 'object') return AJUSTES_CONFIG
    // Overlay de los valores guardados sobre el respaldo (claves faltantes caen al default)
    return {
      piso: { ...AJUSTES_CONFIG.piso, ...(stored.piso || {}) },
      orientacion: { ...AJUSTES_CONFIG.orientacion, ...(stored.orientacion || {}) },
      remodelacion: {
        ...AJUSTES_CONFIG.remodelacion, ...(stored.remodelacion || {}),
        tiempo: { ...AJUSTES_CONFIG.remodelacion.tiempo, ...((stored.remodelacion && stored.remodelacion.tiempo) || {}) },
      },
      jardin: { ...AJUSTES_CONFIG.jardin, ...(stored.jardin || {}) },
      caracteristicas: { ...AJUSTES_CONFIG.caracteristicas, ...(stored.caracteristicas || {}) },
    }
  } catch (e) {
    return AJUSTES_CONFIG
  }
}

// Devuelve { factor, lineas[] } a partir del baseUf.
// lineas[] son items de desglose ya calculados en UF.
function aplicarAjustes({ baseUf, tipo, extras, answers, cfg }) {
  const lineas = []
  let acumUf = baseUf

  const addPct = (concepto, pct, detalle) => {
    if (!pct) return
    const delta = Math.round(acumUf * pct)
    if (delta === 0) return
    const signo = pct > 0 ? '+' : ''
    lineas.push({ concepto, calculo: `${detalle} (${signo}${Math.round(pct * 100)}%)`, valor_uf: delta })
    acumUf += delta
  }

  // Piso (solo deptos/oficinas)
  const tipoNorm = String(tipo || '').toLowerCase()
  const piso = extras?.piso != null ? parseInt(String(extras.piso).match(/-?\d+/)?.[0] ?? '', 10) : null
  if (cfg.piso.tiposAplica.includes(tipoNorm) && Number.isFinite(piso)) {
    if (piso >= 5) {
      const tramos = Math.floor((piso - 5) / 5)
      if (tramos > 0) addPct('Ajuste por piso', tramos * cfg.piso.pctPorCada5SobreEl5, `piso ${piso}`)
    } else if (piso >= 1 && piso <= cfg.piso.pisoBajoUmbral) {
      addPct('Ajuste por piso', cfg.piso.pctPisoBajo, `piso bajo (${piso})`)
    }
  }

  // Orientación (norte / sur / oriente / poniente)
  const ori = String(extras?.orientacion || '').toLowerCase()
  if (ori.includes('norte')) addPct('Ajuste por orientación', cfg.orientacion.norte, 'orientación norte')
  else if (ori.includes('sur')) addPct('Ajuste por orientación', cfg.orientacion.sur, 'orientación sur')
  else if (ori.includes('oriente')) addPct('Ajuste por orientación', cfg.orientacion.oriente, 'orientación oriente')
  else if (ori.includes('poniente')) addPct('Ajuste por orientación', cfg.orientacion.poniente, 'orientación poniente')

  // (Remodelación, jardín y características NO van acá: se devuelven aparte como
  //  ajustes que el frontend suma sobre el valor base — ver calcAjustesExtra.)

  return { finalUf: acumUf, lineas }
}

// Ajustes que se devuelven aparte (el frontend los suma sobre el valor base):
// remodelación (UF/m² × m² útiles × antigüedad), características (UF c/u) y
// jardín (factor × precio real por m²). Todo desde la config editable.
function calcAjustesExtra({ cfg, answers, extras, m2Util, precioM2 }) {
  const remoKey = String(answers?.remodelacion || '').toLowerCase()
  const remoUfM2 = (typeof cfg.remodelacion[remoKey] === 'number') ? cfg.remodelacion[remoKey] : 0
  const tiempoKey = String(answers?.tiempo_remo || '').toLowerCase()
  const tiempoMult = (cfg.remodelacion.tiempo && typeof cfg.remodelacion.tiempo[tiempoKey] === 'number') ? cfg.remodelacion.tiempo[tiempoKey] : 1
  const ajRemo = Math.round(remoUfM2 * (m2Util || 0) * tiempoMult)

  const lista = [
    ...(Array.isArray(extras?.caracteristicas) ? extras.caracteristicas : []),
    extras?.derechos_agua || answers?.derechos_agua || '',
    extras?.infraestructura || answers?.infraestructura || '',
  ].flat().filter(c => c && c !== 'ninguna')
  const ajCar = lista.reduce((s, c) => s + (cfg.caracteristicas[c] || 0), 0)

  const jardinM2 = parseFloat(extras?.jardin_m2) || 0
  const factor = (cfg.jardin && typeof cfg.jardin.factor === 'number') ? cfg.jardin.factor : 0
  const ajJardin = (jardinM2 > 0 && precioM2 > 0) ? Math.round(jardinM2 * precioM2 * factor) : 0

  return { ajRemo, ajCar, ajJardin, remoUfM2 }
}

export async function POST(request) {
  const body = await request.json()
  const { siiData, form, answers, extras } = body

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
  const MCP_URL = process.env.MCP_URL || 'https://mcp.datainmobiliaria.cl/mcp'
  const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN

  if (!ANTHROPIC_KEY) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

  const dir = siiData?.direccion || `${form.direccion}${form.depto ? ' '+form.depto : ''}, ${form.comuna}`
  const comuna = form.comuna || ''
  const tipo = extras?.tipo || 'propiedad'
  const rol = siiData?.rol || null
  const anio = siiData?.anio_construccion || null
  const avaluo = siiData?.avaluo_total_clp ? Math.round(siiData.avaluo_total_clp / 40408) : null
  const caracts = (extras?.caracteristicas || []).filter(c => c !== 'ninguna')

  // ── Superficies confirmadas del SII ──────────────────────────────────────
  const m2Construido = siiData?.m2_construido ? parseFloat(siiData.m2_construido) : null
  const m2Terreno = siiData?.m2_terreno ? parseFloat(siiData.m2_terreno) : null

  // Si no hay datos SII: no tasamos
  if (!m2Construido && !m2Terreno) {
    return Response.json({
      error: 'Sin datos SII',
      mensaje: 'No se encontraron los metros cuadrados reales del SII. No es posible realizar una tasación sin esta información.'
    }, { status: 422 })
  }

  function calcularSimilitud(row, m2C, m2T) {
    const dif = m2C ? Math.abs(parseFloat(row.m2_construido) - m2C) / m2C : 0
    if (dif < 0.1) return 'Muy similar'
    if (dif < 0.25) return 'Similar'
    return 'Referencial'
  }

  // ── 1. Obtener comparables REALES del CBR via REST ──────────────────────
  let comparablesReales = []
  try {
    const codCom = siiData?.cod_comuna
      || (rol ? parseInt(String(rol).split('-')[0], 10) : null)
      || COD_COMUNA[normalizaComuna(comuna)]
      || null
    if (codCom && m2Construido && DATAINM_TOKEN) {
      const rolParts = String(rol || '').split('-')
      const ccom = rolParts[0] || String(codCom)
      const cmz = rolParts[1] || ''
      const cpr = rolParts[2] || ''
      const m2Min = Math.round(m2Construido * 0.6)
      const m2Max = Math.round(m2Construido * 1.5)
      const cd = (tipo === 'oficina') ? 'O' : 'H'
      const qs = new URLSearchParams({
        cod_com: String(ccom), cod_mz: String(cmz), cod_pr: String(cpr),
        radio: '2000', superficie_min: String(m2Min), superficie_max: String(m2Max), cod_destino: cd,
      }).toString()
      const restUrl = 'https://datainmobiliaria.cl/api/v1/propiedades/detalle?' + qs
      const restRes = await fetch(restUrl, { headers: { Authorization: 'Bearer ' + DATAINM_TOKEN } })
      if (restRes.ok) {
        const data = await restRes.json()
        const ventas = Array.isArray(data.detalle_ventas_recientes) ? data.detalle_ventas_recientes : []
        const filtro = Array.isArray(data.comparables_filtro) ? data.comparables_filtro : []
        const fuente = filtro.length > 0 ? filtro : ventas
        comparablesReales = fuente
          .filter(v => parseFloat(v.superficie_construccion) > 0 && parseFloat(v.price) > 0 && (v.unit === 'UF' || !v.unit))
          .map(v => {
            const m2 = Math.round(parseFloat(v.superficie_construccion))
            const uf = Math.round(parseFloat(v.price))
            return {
              direccion: (v.direccion_sii || 'Sin direccion').toString().trim(),
              tipo: tipo,
              m2: m2,
              m2_terreno: null,
              fecha: (v.fecha || 'N/D').toString().slice(0, 7),
              precio_uf: uf,
              uf_m2: m2 > 0 ? Math.round(uf / m2) : null,
              ano_construccion: null,
              mismo_edificio: cmz !== '' && String(v.cod_mz) === String(cmz),
              distancia_m: v.distancia_metros != null ? Math.round(v.distancia_metros) : null,
              similitud: calcularSimilitud({ m2_construido: v.superficie_construccion }, m2Construido, m2Terreno),
            }
          })
          .filter(c => c.uf_m2 && c.uf_m2 >= 20 && c.uf_m2 <= 400)
          .sort((a, b) => (a.distancia_m != null && b.distancia_m != null) ? (a.distancia_m - b.distancia_m) : 0)
          .slice(0, 12)
      }
    }
  } catch (e) {
    console.error('Error fetching comparables (REST):', e.message)
  }

  // ── 2. VALOR DETERMINÍSTICO ───────────────────────────────────────────────
  // Se calcula ANTES del LLM para poder pasárselo como dato autoritativo.
  const ajustesCfg = await getAjustesConfig()
  let valorDet = null      // { valor_uf, precio_m2, confianza, desglose[] }
  let precioM2Base = null  // precio por m² base (mediana CBR), para el jardín
  if (comparablesReales.length > 0 && m2Construido) {
    const ufm2List = comparablesReales.map(c => c.uf_m2).filter(x => x > 0).sort((a, b) => a - b)
    if (ufm2List.length) {
      const mid = Math.floor(ufm2List.length / 2)
      const medianaUfM2 = ufm2List.length % 2 ? ufm2List[mid] : Math.round((ufm2List[mid - 1] + ufm2List[mid]) / 2)
      const baseUf = Math.round(medianaUfM2 * m2Construido)
      precioM2Base = medianaUfM2

      const { finalUf, lineas } = aplicarAjustes({ baseUf, tipo, extras, answers, cfg: ajustesCfg })

      const desglose = [
        { concepto: 'Valor base por comparables CBR', calculo: `mediana ${medianaUfM2} UF/m2 x ${m2Construido} m2 (${comparablesReales.length} ventas reales)`, valor_uf: baseUf },
        ...lineas,
      ]
      valorDet = {
        valor_uf: finalUf,
        precio_m2: Math.round(finalUf / m2Construido),
        confianza: comparablesReales.length >= 5 ? 'Alta' : (comparablesReales.length >= 3 ? 'Media' : 'Baja'),
        desglose,
      }
    }
  }

  // Ajustes que el frontend suma sobre el valor base (remodelación, características,
  // jardín), calculados desde la config editable. El jardín usa el precio real por m².
  const m2UtilCalc = parseFloat(answers?.m2_util || siiData?.m2_util || m2Construido) || 60
  const ajustesExtra = calcAjustesExtra({
    cfg: ajustesCfg, answers, extras,
    m2Util: m2UtilCalc,
    precioM2: precioM2Base || 50,
  })

  // ── 3. Armar prompt: el LLM SOLO narra ─────────────────────────────────────
  const systemPrompt = `Eres Valentina, tasadora inmobiliaria experta con 20 años de experiencia en la Región Metropolitana de Chile.

REGLAS CRÍTICAS — DATOS CONFIRMADOS DEL SII:
- Los m² marcados como "CONFIRMADOS" son datos REALES del SII. NUNCA los modifiques, estimes ni cambies.
- USA EXACTAMENTE esos m² en todos los cálculos y el desglose.
- Si no hay un dato confirmado de m², NO lo estimes — usa solo lo que tienes.

VALOR DETERMINÍSTICO (AUTORITATIVO):
- Cuando se te entregue un "VALOR FINAL" y un "DESGLOSE" calculados por el sistema, son DEFINITIVOS.
- COPIA exactamente valor_uf, precio_m2, confianza y desglose tal como se te entregan. NO los recalcules ni los modifiques.
- Tu trabajo es NARRAR: análisis, factores positivos/negativos, plan regulador y recomendación de precio, todo COHERENTE con ese valor final. La prosa NO puede contradecir el número (no menciones un valor distinto al entregado).
- Si NO se te entrega un valor determinístico (no hubo comparables), recién ahí estima tú con tus rangos de referencia por comuna y confianza Media.

PERFIL:
- Conoces el mercado inmobiliario chileno 2023-2025: precios reales por comuna, tendencias, factores.
- Manejas los planes reguladores comunales de la RM: zonificación, alturas, constructibilidad.

PRECIOS DE REFERENCIA 2025 (UF/m² construido) — SOLO como respaldo si NO hay comparables:
- Vitacura: 85-130 | Las Condes: 70-115 | Lo Barnechea: 60-100
- Providencia: 65-100 | Ñuñoa: 55-82 | La Reina: 50-75
- Macul, San Miguel, Quinta Normal: 35-55 | La Florida, Maipú, Pudahuel: 28-50
- Santiago Centro: 45-72 | Peñalolén, La Granja: 30-48 | Puente Alto: 25-40
- San Bernardo, El Bosque: 22-38 | Lo Prado, Renca: 25-42

ANÁLISIS DE POTENCIAL DE DESARROLLO (solo casas/terrenos con m² terreno > 800m²):
- Calcular unidades: (densidad_max_hab/ha ÷ 10000 × m2_terreno) ÷ 4 personas/hogar
- Ejemplo: 3.982m², densidad 50 hab/ha → (50/10000)×3982÷4 = ~5 unidades
- Si permite 2+ unidades: incluir potencial_desarrollo

RESPONDE SOLO con JSON válido en UNA SOLA LÍNEA sin saltos dentro de strings:
{
  "valor_uf": number,
  "precio_m2": number,
  "confianza": "Alta" | "Media" | "Baja",
  "plan_regulador": {
    "zona": string,
    "nombre_zona": string,
    "uso_suelo": string,
    "altura_max_pisos": number,
    "altura_max_m": number,
    "coef_constructibilidad": string,
    "coef_ocupacion_suelo": string,
    "densidad_max": string,
    "adosamiento": string,
    "antejardin_m": number,
    "observaciones": string,
    "impacto_valor": string
  },
  "desglose": [
    { "concepto": string, "calculo": string, "valor_uf": number }
  ],
  "analisis": string,
  "factores_positivos": [string],
  "factores_negativos": [string],
  "recomendacion_precio_venta": string,
  "potencial_desarrollo": {
    "aplica": boolean,
    "m2_terreno": number,
    "densidad_max_hab_ha": number,
    "unidades_estimadas": number,
    "descripcion": string,
    "advertencia": string
  } | null
}`

  const comparablesTexto = comparablesReales.length > 0
    ? `\n\nTRANSACCIONES REALES CBR (datos confirmados del Conservador de Bienes Raíces):\n${JSON.stringify(comparablesReales, null, 2)}`
    : '\n\nNOTA: No se encontraron comparables reales en el CBR para este segmento. Usa tus referencias de mercado con confianza Media.'

  // Fix #3: el valor final determinístico se entrega al LLM como autoritativo.
  const valorTexto = valorDet
    ? `\n\nVALOR FINAL (AUTORITATIVO — cópialo tal cual, no recalcules):\n${JSON.stringify({
        valor_uf: valorDet.valor_uf,
        precio_m2: valorDet.precio_m2,
        confianza: valorDet.confianza,
        desglose: valorDet.desglose,
      }, null, 2)}\nTu análisis, factores y recomendación deben ser coherentes con este valor.`
    : ''

  const detalles = [
    `Tipo de propiedad: ${tipo}`,
    `Dirección: ${dir}`,
    `Comuna: ${comuna}`,
    rol ? `ROL SII: ${rol}` : null,
    m2Construido ? `M² construidos CONFIRMADOS (SII): ${m2Construido} m²` : null,
    m2Terreno ? `M² terreno CONFIRMADO (SII): ${m2Terreno} m²` : null,
    anio ? `Año construcción: ${anio}` : null,
    avaluo ? `Avalúo fiscal: ${avaluo} UF` : null,
    siiData?.destino ? `Destino SII: ${siiData.destino}` : null,
    answers?.remodelacion && answers.remodelacion !== 'ninguna'
      ? `Remodelación: ${answers.remodelacion}${answers.tiempo_remo ? ', hace '+answers.tiempo_remo : ''}`
      : 'Sin remodelación',
    answers?.terraza_m2 > 0 ? `Terraza: ${answers.terraza_m2} m²` : null,
    answers?.estacionamientos > 0 ? `Estacionamientos: ${answers.estacionamientos}` : null,
    answers?.bodegas > 0 ? `Bodegas: ${answers.bodegas}` : null,
    extras?.piso ? `Piso: ${extras.piso}` : null,
    extras?.orientacion ? `Orientación: ${extras.orientacion}` : null,
    extras?.jardin_m2 > 0 ? `Jardín/patio: ${extras.jardin_m2} m²` : null,
    caracts.length ? `Características: ${caracts.join(', ')}` : null,
    extras?.precio_idea ? `Precio esperado por vendedor: ${extras.precio_idea}` : null,
  ].filter(Boolean).join('\n')

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Tasa esta propiedad:\n\n${detalles}${comparablesTexto}${valorTexto}` }],
      }),
    })

    const data = await res.json()
    if (!res.ok) return Response.json({ error: data.error?.message || 'Error Anthropic' }, { status: 500 })

    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    const clean = text.replace(/```json|```/g, '').trim()
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ error: 'Sin JSON en respuesta', raw: text.slice(0, 300) }, { status: 500 })

    function sanitizeJSON(raw) {
      let s = raw
        .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
        .replace(/\u2013|\u2014/g, '-')
        .replace(/\r?\n/g, ' ').replace(/\r/g, ' ')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
        .replace(/,\s*([\]\}])/g, '$1')
      let result = '', inString = false, escaped = false
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        if (escaped) { result += ch; escaped = false; continue }
        if (ch === '\\') { result += ch; escaped = true; continue }
        if (ch === '"') {
          if (!inString) { inString = true; result += ch; continue }
          let j = i + 1
          while (j < s.length && s[j] === ' ') j++
          const next = s[j]
          if (next === ':' || next === ',' || next === '}' || next === ']') {
            inString = false; result += ch
          } else {
            result += '\\"'
          }
          continue
        }
        result += ch
      }
      return result
    }

    const sanitized = sanitizeJSON(match[0])
    try {
      const parsed = JSON.parse(sanitized)

      // Fix #3: el valor determinístico SIEMPRE manda sobre lo que devuelva el LLM.
      if (valorDet) {
        parsed.comparables = comparablesReales
        parsed.valor_uf = valorDet.valor_uf
        parsed.precio_m2 = valorDet.precio_m2
        parsed.confianza = valorDet.confianza
        parsed.desglose = valorDet.desglose
      } else if (comparablesReales.length > 0) {
        parsed.comparables = comparablesReales
      }

      // Calcular potencial_desarrollo en servidor
      if (m2Terreno && m2Terreno > 800 && ['casa','terreno','parcela','agricola'].includes(tipo)) {
        const pr = parsed.plan_regulador
        let densidadHabHa = null
        if (pr?.densidad_max) {
          const dm = String(pr.densidad_max).match(/\d+/)
          if (dm) densidadHabHa = parseInt(dm[0])
        }
        if (!densidadHabHa) {
          const cL = comuna.toLowerCase()
          densidadHabHa = ['vitacura','las condes','lo barnechea','la reina'].some(c => cL.includes(c)) ? 60 : 120
        }
        const unidades = Math.floor((densidadHabHa / 10000) * m2Terreno / 4)
        if (unidades >= 2) {
          parsed.potencial_desarrollo = {
            aplica: true,
            m2_terreno: m2Terreno,
            densidad_max_hab_ha: densidadHabHa,
            unidades_estimadas: unidades,
            descripcion: `El terreno de ${m2Terreno.toLocaleString('es-CL')} m² permite, según la densidad del plan regulador (${densidadHabHa} hab/ha), construir aproximadamente ${unidades} viviendas (${densidadHabHa} ÷ 10.000 × ${m2Terreno} ÷ 4 personas/hogar). ${unidades >= 4 ? 'Esto significa que es posible demoler la construcción actual y desarrollar un proyecto de ' + unidades + ' viviendas, multiplicando significativamente el valor del terreno. Un comprador desarrollador puede valorar este predio muy por encima del valor como vivienda individual.' : 'El terreno permitiría subdividir y construir hasta ' + unidades + ' viviendas adicionales, aumentando su potencial de valorización.'}`,
            advertencia: `Cálculo referencial basado en la densidad del plan regulador. Los m² mínimos de subdivisión, factibilidad real y condiciones específicas deben verificarse con un arquitecto y la DOM de ${comuna}.`
          }
        } else {
          parsed.potencial_desarrollo = { aplica: false }
        }
      } else if (!parsed.potencial_desarrollo) {
        parsed.potencial_desarrollo = { aplica: false }
      }

      parsed.ajustes = ajustesExtra
      return Response.json(parsed)
    } catch(parseErr) {
      console.error('JSON parse error:', parseErr.message)
      const extract = (key) => { const m = sanitized.match(new RegExp('"' + key + '"\\s*:\\s*([\\d.]+)')); return m ? parseFloat(m[1]) : null }
      const extractStr = (key) => { const m = sanitized.match(new RegExp('"' + key + '"\\s*:\\s*"([^"]*)"')); return m ? m[1] : null }
      const fallback = {
        valor_uf: valorDet?.valor_uf ?? extract('valor_uf'),
        precio_m2: valorDet?.precio_m2 ?? extract('precio_m2'),
        confianza: valorDet?.confianza ?? extractStr('confianza') ?? 'Baja',
        analisis: extractStr('analisis') || 'Tasación completada.',
        recomendacion_precio_venta: extractStr('recomendacion_precio_venta') || '',
        comparables: comparablesReales,
        ajustes: ajustesExtra,
        desglose: valorDet?.desglose ?? [], factores_positivos: [], factores_negativos: [], plan_regulador: null
      }
      if (fallback.valor_uf) return Response.json(fallback)
      return Response.json({ error: 'JSON invalido: ' + parseErr.message, raw: sanitized.slice(0, 300) }, { status: 500 })
    }
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
>>>>>>> Stashed changes
