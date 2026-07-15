// app/api/tasar/route.js
// Agente Valentina — tasadora inmobiliaria experta
// FLUJO:
//  1. Requiere m2_construido real del SII (no estimado)
//  2. Obtiene comparables REALES del CBR via DataInmobiliaria (REST)
//  3. Calcula el valor DE FORMA DETERMINÍSTICA (mediana CBR + ajustes)
//  4. Claude SOLO narra: análisis, factores, plan regulador y recomendación,
//     coherentes con el valor determinístico (no recalcula valor)

import { normativaEnPunto, zonaLocalEnPunto } from '../../lib/prc.js'
// Fórmula compartida con /api/zona (Isidora): núcleo único de valorización.
import {
  COSTO_CONSTRUCCION_TIERS, elegirTierConstruccion, estadoConstruccion,
  poligono, distanciaM, mediana, percentil,
  clasificaTipo, TIPO_OBJETIVO, cutoffVentasStr, esVentaReciente, enBandaM2,
  UFM2_MIN, UFM2_MAX, puntosSuelo, resumenSuelo, sueloPorTramo, sueloDeTramo,
  valorAditivoCasa, confianzaPorN, buscarVentasPoligono, COSTO_CONSTR_RESIDUAL, BANDA_M2, terrenoDe, sinOutliers,
} from '../../lib/tasacion-core.js'

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

  // Punto geocodificado de la propiedad: se usa para los comparables por polígono
  // (misma fuente que /api/zona) y para la zona del Plan Regulador.
  const punto = await geocodeDireccion(`${form.direccion || ''}, ${comuna}`)

  // ── 1. Comparables REALES del CBR — MISMA FUENTE que /api/zona (polígono) ──
  // Ventas reales alrededor de la propiedad, clasificadas por tipo real. De esta
  // única fuente salen: el valor de la tasación, la lista y el mapa.
  let comparablesReales = []
  let ventasMapa = []
  let sectorComposicion = null
  let ventasConjunto = []
  let historialPropiedad = []
  let indiceSector = null
  let plusvalia12m = null
  let arriendoMediana = null
  let arriendoN = 0
  let sueloInfo = null
  let ufm2SectorList = []
  let diag = null
  let proveedorBloqueado = false // 402/403 de DataInmobiliaria (plan expirado)
  let valorEstacionamientoUf = null // mediana de ventas reales de estacionamientos del edificio
  let valorBodegaUf = null          // ídem bodegas
  const tipoObjetivo = TIPO_OBJETIVO[String(tipo || '').toLowerCase()] || null
  try {
    if (punto && DATAINM_TOKEN) {
      const polys = [poligono(punto.lat, punto.lng, 800), poligono(punto.lat, punto.lng, 1600), poligono(punto.lat, punto.lng, 3200)]
      // Búsqueda compartida del núcleo (doble pasada: sin filtro + property_type)
      const busq = await buscarVentasPoligono({ token: DATAINM_TOKEN, polys, objetivo: tipoObjetivo })
      const ventas = busq.ventas
      if (busq.bloqueado) proveedorBloqueado = true

      // Corte de 5 años, sanidad UF/m² y banda de superficie: núcleo compartido
      // (idénticos a los de /api/zona / Isidora).
      const _cutoffStr = cutoffVentasStr()
      const base = ventas.filter(v => {
        if (tipoObjetivo && clasificaTipo(v) !== tipoObjetivo) return false
        if (String(v.unit || '').toUpperCase() !== 'UF') return false
        if (!esVentaReciente(v, _cutoffStr)) return false
        const m2 = parseFloat(v.superficie_construccion), uf = parseFloat(v.price)
        if (!(m2 > 0) || !(uf > 0)) return false
        const ufm2 = uf / m2
        return ufm2 >= UFM2_MIN && ufm2 <= UFM2_MAX
      })

      let similares = base.filter(v => enBandaM2(parseFloat(v.superficie_construccion), m2Construido))
      if (similares.length < 3) similares = base
      // UF/m² del universo comparable completo (misma mediana que vería Isidora)
      ufm2SectorList = similares.map(v => parseFloat(v.price) / parseFloat(v.superficie_construccion)).filter(x => x > 0)

      // Ordenadas por cercanía a la propiedad
      const rolParts = String(rol || '').split('-')
      const mzProp = rolParts.length >= 2 ? `${rolParts[0]}-${rolParts[1]}` : null
      const conDist = similares.map(v => {
        const la = parseFloat(v.lat), ln = parseFloat(v.lng)
        const d = (Number.isFinite(la) && Number.isFinite(ln)) ? distanciaM(punto.lat, punto.lng, la, ln) : null
        return { v, d }
      }).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9))

      // Las 12 más cercanas alimentan el cálculo del valor (mediana UF/m²)
      comparablesReales = conDist.slice(0, 12).map(({ v, d }) => {
        const m2 = Math.round(parseFloat(v.superficie_construccion))
        const uf = Math.round(parseFloat(v.price))
        const terr = parseFloat(v.superficie_total_terreno) || 0
        const mzV = String(v.rol || '').split('-').slice(0, 2).join('-')
        return {
          direccion: (v.direccion_sii || 'Sin direccion').toString().replace(/\s+/g, ' ').trim(),
          tipo: tipoObjetivo || tipo,
          m2,
          m2_terreno: terr > 0 ? Math.round(terr) : null,
          fecha: (v.date_inscripcion || v.fecha || 'N/D').toString().slice(0, 7),
          precio_uf: uf,
          uf_m2: m2 > 0 ? Math.round(uf / m2) : null,
          ano_construccion: v.ano_construccion ? String(v.ano_construccion) : null,
          mismo_edificio: !!(mzProp && mzV && mzV === mzProp),
          distancia_m: d != null ? Math.round(d) : null,
          similitud: calcularSimilitud({ m2_construido: v.superficie_construccion }, m2Construido, m2Terreno),
        }
      })

      // Lista + mapa del frontend: LAS MISMAS ventas que respaldan el valor
      ventasMapa = conDist.slice(0, 150).map(({ v }) => {
        const la = parseFloat(v.lat), ln = parseFloat(v.lng), uf = Math.round(parseFloat(v.price))
        if (!Number.isFinite(la) || !Number.isFinite(ln) || !(uf > 0)) return null
        const m2c = Math.round(parseFloat(v.superficie_construccion))
        const ter = parseFloat(v.superficie_total_terreno)
        const av = parseFloat(v.avaluo_fiscal_clp)
        const co = parseFloat(v.contribuciones_clp)
        return {
          lat: la, lng: ln, uf,
          m2: m2c > 0 ? m2c : null,
          uf_m2: m2c > 0 ? Math.round(uf / m2c) : null,
          fecha: String(v.date_inscripcion || v.fecha || '').slice(0, 10),
          dir: String(v.direccion_sii || '').replace(/\s+/g, ' ').trim() || null,
          m2_terreno: ter > 0 ? Math.round(ter) : null,
          ano: v.ano_construccion ? String(v.ano_construccion) : null,
          destino: v.cod_destino || null,
          avaluo_clp: av > 0 ? Math.round(av) : null,
          contrib_clp: co > 0 ? Math.round(co) : null,
          rol: v.rol || null,
        }
      }).filter(Boolean)

      // ── Datos extra para el informe (sobre las mismas ventas del polígono) ──
      // Composición del sector por tipo de propiedad
      const compCount = {}
      ventas.forEach(v => { const t = clasificaTipo(v); compCount[t] = (compCount[t] || 0) + 1 })
      const compTot = Object.values(compCount).reduce((a, b) => a + b, 0)
      if (compTot >= 10) {
        sectorComposicion = Object.entries(compCount).sort((a, b) => b[1] - a[1])
          .map(([t, n]) => ({ tipo: t, n, pct: Math.round((n * 100) / compTot) }))
      }

      const filaVenta = (v) => {
        const m2f = Math.round(parseFloat(v.superficie_construccion)) || null
        const uff = Math.round(parseFloat(v.price))
        return {
          direccion: String(v.direccion_sii || '').replace(/\s+/g, ' ').trim() || null,
          rol: v.rol || null,
          fecha: String(v.date_inscripcion || v.fecha || '').slice(0, 10),
          m2: m2f, uf: uff, uf_m2: m2f && uff ? Math.round(uff / m2f) : null,
        }
      }

      // Ventas en el mismo edificio / conjunto (misma manzana del ROL, mismo tipo)
      if (mzProp) {
        ventasConjunto = ventas
          .filter(v => String(v.rol || '').split('-').slice(0, 2).join('-') === mzProp)
          .filter(v => (!tipoObjetivo || clasificaTipo(v) === tipoObjetivo) && String(v.unit || '').toUpperCase() === 'UF' && parseFloat(v.price) > 0)
          .map(filaVenta)
          .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
          .slice(0, 16)
      }

      // Historial de ventas de ESTA propiedad (mismo ROL exacto)
      if (rol) {
        historialPropiedad = ventas
          .filter(v => String(v.rol || '') === String(rol) && String(v.unit || '').toUpperCase() === 'UF' && parseFloat(v.price) > 0)
          .map(filaVenta)
          .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
          .slice(0, 6)
      }

      // Índice UF/m² del sector por trimestre + plusvalía 12 meses (mismo tipo)
      const serie = base
        .map(v => ({ f: String(v.date_inscripcion || v.fecha || '').slice(0, 10), r: parseFloat(v.price) / parseFloat(v.superficie_construccion) }))
        .filter(x => x.f.length === 10 && x.r > 0)
      const porTrim = {}
      serie.forEach(({ f, r }) => { const q = f.slice(0, 4) + ' T' + (Math.floor((+f.slice(5, 7) - 1) / 3) + 1); (porTrim[q] = porTrim[q] || []).push(r) })
      const trims = Object.keys(porTrim).sort()
        .map(q => ({ trimestre: q, uf_m2: Math.round(mediana(porTrim[q]) * 10) / 10, n: porTrim[q].length }))
        .filter(x => x.n >= 3)
      if (trims.length >= 2) indiceSector = trims.slice(-8)
      const hoyD = new Date()
      const d12 = new Date(hoyD); d12.setFullYear(hoyD.getFullYear() - 1)
      const d24 = new Date(hoyD); d24.setFullYear(hoyD.getFullYear() - 2)
      const s12 = serie.filter(x => x.f >= d12.toISOString().slice(0, 10)).map(x => x.r)
      const s24 = serie.filter(x => x.f >= d24.toISOString().slice(0, 10) && x.f < d12.toISOString().slice(0, 10)).map(x => x.r)
      if (s12.length >= 3 && s24.length >= 3) plusvalia12m = Math.round((mediana(s12) / mediana(s24) - 1) * 1000) / 10

      // ── Valor de SUELO del sector (solo casas) — núcleo compartido ──
      // FILTRO REGULATORIO: si la comuna tiene zonas PRC cargadas, el suelo se
      // calcula SOLO con ventas de la MISMA zona (misma normativa) que la
      // propiedad. Si esa zona tiene <3 referencias, se usa el sector completo.
      if (tipoObjetivo === 'casa') {
        let sueloPts = [], fuenteSuelo = '', notaZona = ''
        try {
          let bu = ''
          try { bu = new URL(request.url).origin } catch (e) {}
          if (!bu && process.env.VERCEL_URL) bu = 'https://' + process.env.VERCEL_URL
          const zonaPRC = comuna ? await zonaLocalEnPunto(punto.lng, punto.lat, comuna, bu) : null
          if (zonaPRC) {
            const mismaZona = []
            for (const v of ventas) {
              const t = clasificaTipo(v)
              if (t !== 'terreno' && t !== 'casa') continue
              const zv = await zonaLocalEnPunto(parseFloat(v.lng), parseFloat(v.lat), comuna, bu)
              if (zv && String(zv) === String(zonaPRC)) mismaZona.push(v)
            }
            const rz = puntosSuelo(mismaZona, mismaZona.filter(v => base.includes(v)))
            if (rz.pts.length >= 3) { sueloPts = rz.pts; fuenteSuelo = rz.fuente; notaZona = ', misma zona PRC ' + zonaPRC }
          }
        } catch (e) {}
        if (sueloPts.length < 3) {
          const rg = puntosSuelo(ventas, base)
          sueloPts = rg.pts; fuenteSuelo = rg.fuente
        }
        const general = resumenSuelo(sueloPts, fuenteSuelo)
        if (general) {
          const tramos = sueloPorTramo(sueloPts)
          const delTramo = m2Terreno > 0 ? sueloDeTramo(tramos, m2Terreno) : null
          const usar = delTramo || general
          sueloInfo = {
            uf_m2: usar.uf_m2_mediana,
            n: delTramo ? delTramo.n : general.n_comparables,
            fuente: (fuenteSuelo === 'ventas_terreno' ? 'ventas reales de sitios' : 'residual sobre ventas de casas') + notaZona,
            tramo: delTramo ? delTramo.rango : 'todos los tamaños de sitio',
          }
        }
      }

      diag = { n_ventas_sector: ventas.length, n_mismo_tipo: base.length, n_comparables: comparablesReales.length, n_suelo: sueloInfo ? sueloInfo.n : 0 }
    }
  } catch (e) {
    console.error('Error comparables (polígono):', e.message)
  }

  // ── 1b. FUENTE PRINCIPAL (estilo DataInmobiliaria): detalle por ROL ─────────
  // El mismo servicio que alimenta el reporte "Detalle de Propiedad" de
  // datainmobiliaria.cl: ventas recientes por radio desde el ROL (tabla
  // "Mercado"), historial del ROL, ventas del mismo edificio y evolución UF/m².
  let diagRest = null
  {
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
      const cd = (tipo === 'oficina') ? 'O' : 'H'
      const _cutoffStr = cutoffVentasStr()
      // RADIO CORTO primero (las cuadras cercanas, como la tabla "Mercado" del
      // reporte de DataInmobiliaria) y banda de superficie AJUSTADA (0.7–1.4×):
      // una casa de 35.000 UF no debe compararse con casas chicas de 6.000 UF.
      // Solo si no alcanzan los comparables del tipo se amplía radio y banda.
      let data = null, filtradosRest = []
      for (const intento of [{ radio: '800', bmin: 0.7, bmax: 1.4 }, { radio: '2000', bmin: BANDA_M2.min, bmax: BANDA_M2.max }]) {
        const qs = new URLSearchParams({
          cod_com: String(ccom), cod_mz: String(cmz), cod_pr: String(cpr),
          radio: intento.radio,
          superficie_min: String(Math.round(m2Construido * intento.bmin)),
          superficie_max: String(Math.round(m2Construido * intento.bmax)),
          cod_destino: cd,
        }).toString()
        const restRes = await fetch('https://datainmobiliaria.cl/api/v1/propiedades/detalle?' + qs, { headers: { Authorization: 'Bearer ' + DATAINM_TOKEN }, signal: AbortSignal.timeout(20000) })
        diagRest = { status: restRes.status, radio: intento.radio, banda: intento.bmin + '-' + intento.bmax }
        if (restRes.status === 402 || restRes.status === 403) { proveedorBloqueado = true; break }
        if (!restRes.ok) break
        data = await restRes.json()
        const ventasR = Array.isArray(data.detalle_ventas_recientes) ? data.detalle_ventas_recientes : []
        const filtroR = Array.isArray(data.comparables_filtro) ? data.comparables_filtro : []
        const fuente = filtroR.length > 0 ? filtroR : ventasR
        diagRest.n_ventas = ventasR.length
        diagRest.n_filtro = filtroR.length
        filtradosRest = fuente
          .filter(v => parseFloat(v.superficie_construccion) > 0 && parseFloat(v.price) > 0 && (v.unit === 'UF' || !v.unit))
          .filter(v => !tipoObjetivo || clasificaTipo(v) === tipoObjetivo)
          .filter(v => esVentaReciente(v, _cutoffStr))
        diagRest.n_antes_outliers = filtradosRest.length
        // Sin outliers: ventas a <50% o >190% de la mediana solo confunden
        filtradosRest = sinOutliers(filtradosRest, v => parseFloat(v.price))
        diagRest.n_del_tipo = filtradosRest.length
        if (filtradosRest.length >= 5) break
      }
      if (data) {
        // Prioridad sobre el polígono cuando hay suficientes: son las ventas MÁS
        // CERCANAS al ROL (las mismas de la tabla "Mercado" de DataInmobiliaria).
        if (filtradosRest.length >= 3 || comparablesReales.length === 0) {
        // Estos rows traen latitud/longitud: alimentan también el mapa y el cuadro
        ventasMapa = filtradosRest.map(v => {
          const la = parseFloat(v.latitud), ln = parseFloat(v.longitud), uf = Math.round(parseFloat(v.price))
          if (!Number.isFinite(la) || !Number.isFinite(ln) || !(uf > 0)) return null
          const m2c = Math.round(parseFloat(v.superficie_construccion))
          return {
            lat: la, lng: ln, uf,
            m2: m2c > 0 ? m2c : null,
            uf_m2: m2c > 0 ? Math.round(uf / m2c) : null,
            fecha: String(v.fecha || '').slice(0, 10),
            dir: String(v.direccion_sii || '').replace(/\s+/g, ' ').trim() || null,
            m2_terreno: null, ano: null,
            destino: v.cod_destino || null,
            rol: [v.cod_com, v.cod_mz, v.cod_pr].filter(x => x != null).join('-') || null,
          }
        }).filter(Boolean).slice(0, 150)
        // El universo comparable completo para la mediana (como DataInmobiliaria)
        ufm2SectorList = filtradosRest.map(v => parseFloat(v.price) / parseFloat(v.superficie_construccion)).filter(x => x > 0)
        comparablesReales = filtradosRest
          .map(v => {
            const m2 = Math.round(parseFloat(v.superficie_construccion))
            const uf = Math.round(parseFloat(v.price))
            return {
              direccion: (v.direccion_sii || 'Sin direccion').toString().trim(),
              rol: [v.cod_com, v.cod_mz, v.cod_pr].filter(x => x != null).join('-') || null,
              lat: parseFloat(v.latitud) || null,
              lng: parseFloat(v.longitud) || null,
              tipo: tipoObjetivo || tipo,
              m2: m2,
              m2_terreno: (parseFloat(v.superficie_total_terreno) > 0) ? Math.round(parseFloat(v.superficie_total_terreno)) : null,
              fecha: (v.fecha || 'N/D').toString().slice(0, 7),
              precio_uf: uf,
              uf_m2: m2 > 0 ? Math.round(uf / m2) : null,
              ano_construccion: null,
              mismo_edificio: cmz !== '' && String(v.cod_mz) === String(cmz),
              distancia_m: v.distancia_metros != null ? Math.round(v.distancia_metros) : null,
              similitud: calcularSimilitud({ m2_construido: v.superficie_construccion }, m2Construido, m2Terreno),
            }
          })
          .filter(c => c.uf_m2 && c.uf_m2 >= UFM2_MIN && c.uf_m2 <= UFM2_MAX)
          .sort((a, b) => (a.distancia_m != null && b.distancia_m != null) ? (a.distancia_m - b.distancia_m) : 0)
          .slice(0, 12)
        } // fin prioridad comparables del detalle

        // ── Extras del detalle (los mismos datos del reporte de DataInmobiliaria) ──
        const filaRest = (v) => {
          const m2f = Math.round(parseFloat(v.superficie_construccion)) || null
          const uff = Math.round(parseFloat(v.price))
          return {
            direccion: String(v.direccion_sii || '').replace(/\s+/g, ' ').trim() || null,
            rol: [v.cod_com, v.cod_mz, v.cod_pr].filter(x => x != null).join('-') || null,
            fecha: String(v.fecha || '').slice(0, 10),
            m2: m2f, uf: uff, uf_m2: m2f && uff ? Math.round((uff / m2f) * 10) / 10 : null,
          }
        }
        // Ventas históricas de ESTA propiedad (ROL exacto)
        const obs = Array.isArray(data.ventas_propiedad_observada) ? data.ventas_propiedad_observada : []
        if (obs.length) {
          historialPropiedad = obs
            .filter(v => parseFloat(v.price) > 0 && (v.unit === 'UF' || !v.unit))
            .map(filaRest)
            .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
            .slice(0, 8)
        }
        // Ventas del MISMO edificio/copropiedad: habitacionales para el cuadro,
        // estacionamientos y bodegas para valorizarlos con ventas reales.
        const copro = Array.isArray(data.ventas_otras_copropiedades) ? data.ventas_otras_copropiedades : []
        if (copro.length) {
          const validas = copro.filter(v => parseFloat(v.price) > 0 && (v.unit === 'UF' || !v.unit))
          const habit = validas.filter(v => {
            const tp = clasificaTipo(v)
            return (tp === 'casa' || tp === 'departamento') && parseFloat(v.superficie_construccion) > 20
          })
          if (habit.length) {
            ventasConjunto = habit.map(filaRest).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 16)
          }
          const preciosDe = (cond) => validas.filter(cond).map(v => parseFloat(v.price)).filter(x => x >= 50 && x <= 3000)
          const dirDe = (v) => ' ' + String(v.direccion_sii || '').toUpperCase() + ' '
          const pEst = preciosDe(v => String(v.cod_destino || '').toUpperCase().startsWith('Z') && !/ BD | BOD /.test(dirDe(v)))
          const pBod = preciosDe(v => / BD | BOD /.test(dirDe(v)))
          if (pEst.length >= 2) valorEstacionamientoUf = Math.round(mediana(pEst))
          if (pBod.length >= 2) valorBodegaUf = Math.round(mediana(pBod))
        }
        // Evolución UF/m² del sector (serie mensual del reporte) + plusvalía 12m
        const merc = Array.isArray(data.detalle_mercado) ? data.detalle_mercado : []
        if (merc.length >= 4) {
          const serieM = merc
            .filter(x => parseFloat(x.promedio_precio_m2_3m) > 0)
            .map(x => ({ trimestre: String(x.mes || '').slice(0, 7), uf_m2: Math.round(parseFloat(x.promedio_precio_m2_3m) * 10) / 10, n: parseInt(x.recuento_3m) || 0 }))
          if (serieM.length >= 4) {
            indiceSector = serieM.slice(-8)
            const ult = serieM[serieM.length - 1]
            const hace12 = serieM[Math.max(0, serieM.length - 13)]
            if (ult && hace12 && hace12.uf_m2 > 0) plusvalia12m = Math.round((ult.uf_m2 / hace12.uf_m2 - 1) * 1000) / 10
          }
        }
        diagRest.extras = { historial: historialPropiedad.length, conjunto: ventasConjunto.length, mercado_meses: merc.length, estacionamiento_uf: valorEstacionamientoUf, bodega_uf: valorBodegaUf }
      }
    }
    } catch (e) {
      console.error('Error fetching comparables (REST):', e.message)
    }
  }

  // ── 1b-ter. TERRENO de cada comparable de casa, desde el CATASTRO ──────────
  // Las ventas del detalle no traen m² de terreno; el catastro sí (es lo que
  // muestra el mapa de DataInmobiliaria en cada predio). Una consulta chica
  // alrededor de cada comparable y cruce por ROL. Habilita además el suelo
  // residual real y la columna m² terreno del informe.
  if (tipoObjetivo === 'casa' && comparablesReales.length >= 1 && DATAINM_TOKEN) {
    try {
      const objetivos = comparablesReales.filter(c => c.lat && c.lng && c.rol && !c.m2_terreno).slice(0, 10)
      const lotes = await Promise.allSettled(objetivos.map(async (c) => {
        const r = await fetch('https://datainmobiliaria.cl/api/v1/busqueda_poligono', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DATAINM_TOKEN },
          body: JSON.stringify({ fuente: 'catastro', polygon: poligono(c.lat, c.lng, 40) }),
          signal: AbortSignal.timeout(10000),
        })
        if (!r.ok) return null
        const j = await r.json()
        const rows = j.resultados || j.data || []
        const propio = rows.find(x => [x.cod_com, x.cod_mz, x.cod_pr].filter(y => y != null).join('-') === c.rol)
        return propio ? { c, row: propio } : null
      }))
      const porRol = {}
      for (const l of lotes) {
        if (l.status === 'fulfilled' && l.value) {
          const { c, row } = l.value
          const terr = terrenoDe(row)
          if (terr > 0) { c.m2_terreno = Math.round(terr); porRol[c.rol] = c.m2_terreno }
          if (!c.ano_construccion && row.ano_construccion) c.ano_construccion = String(row.ano_construccion)
        }
      }
      for (const v of ventasMapa) { if (v.rol && porRol[v.rol] && !v.m2_terreno) v.m2_terreno = porRol[v.rol] }
      if (diagRest) diagRest.terrenos_enriquecidos = Object.keys(porRol).length
    } catch (e) { console.error('Enriquecer terrenos catastro:', e.message) }
  }

  // ── 1b-bis. Suelo residual desde los comparables REST (casas sin polígono) ──
  // busqueda_poligono hoy solo georreferencia unidades en copropiedad, así que
  // las casas llegan por el REST por ROL. Con esas mismas casas se estima el
  // suelo (método residual) para no perder el desglose terreno + construcción.
  if (tipoObjetivo === 'casa' && !sueloInfo && comparablesReales.length >= 3) {
    const pts = comparablesReales.map(c => {
      const tt = parseFloat(c.m2_terreno), m2c = parseFloat(c.m2), uf = parseFloat(c.precio_uf)
      if (!(tt > 0) || !(m2c > 0) || !(uf > 0)) return null
      const rr = (uf - COSTO_CONSTR_RESIDUAL * m2c) / tt
      return (rr >= 0.3 && rr <= 250) ? { r: rr, lot: tt } : null
    }).filter(Boolean)
    const general = resumenSuelo(pts, 'residual_casas')
    if (general) {
      const tramos = sueloPorTramo(pts)
      const delTramo = m2Terreno > 0 ? sueloDeTramo(tramos, m2Terreno) : null
      const usar = delTramo || general
      sueloInfo = {
        uf_m2: usar.uf_m2_mediana,
        n: delTramo ? delTramo.n : general.n_comparables,
        fuente: 'residual sobre ventas de casas cercanas (búsqueda por ROL)',
        tramo: delTramo ? delTramo.rango : 'todos los tamaños de sitio',
      }
    }
  }

  // Proveedor de datos bloqueado (plan expirado) y sin ningún dato: error claro,
  // NO seguir a la estimación del LLM (daría un número inventado sin respaldo).
  if (proveedorBloqueado && comparablesReales.length === 0 && !sueloInfo) {
    return Response.json({
      error: 'El servicio de datos de mercado no está disponible en este momento (plan del proveedor de datos). Intenta nuevamente en unos minutos',
    }, { status: 503 })
  }

  // ── 1c. Ofertas REALES del sector (portales): venta y arriendo ─────────────
  // Listas para el informe + medianas de referencia. CLP→UF con UF_CLP.
  const UF_CLP = 40408
  async function fetchOfertas(tx) {
    if (!punto || !DATAINM_TOKEN || !tipoObjetivo || !['departamento', 'casa', 'oficina'].includes(tipoObjetivo)) return []
    const polyArr = poligono(punto.lat, punto.lng, 1200)
    let raw = []
    for (let page = 1; page <= 2; page++) {
      const r = await fetch('https://datainmobiliaria.cl/api/v1/busqueda_poligono', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DATAINM_TOKEN },
        body: JSON.stringify({ fuente: 'oferta', polygon: polyArr, page, property_type: [tipoObjetivo], transaction_type: tx, active_publications: 'true' }),
        signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) break
      const j = await r.json()
      raw = raw.concat(Array.isArray(j.resultados) ? j.resultados : [])
      if (!j.has_more || raw.length >= 100) break
    }
    return raw
  }
  // Texto útil de un aviso: descarta "N/A", "S/D", "-" y similares.
  const limpiaTxt = (x) => {
    const t = String(x || '').replace(/\s+/g, ' ').trim()
    return (!t || /^(n\/?a|s\/?d|sin ?dato s?|-+)$/i.test(t)) ? null : t
  }
  const enUF = (v) => {
    const pr = parseFloat(v.price)
    if (!(pr > 0)) return null
    const mon = String(v.moneda || '').toUpperCase()
    if (mon.includes('CLP') || mon.includes('PESO')) return pr / UF_CLP
    return pr
  }
  let ofertasVenta = [], ofertasArriendo = [], ofertaVentaMediana = null
  try {
    const lista = (await fetchOfertas('venta')).map(v => {
      let uf = enUF(v); if (uf == null) return null
      if (uf > 200000) uf = uf / UF_CLP // vino en pesos sin moneda declarada
      const m2o = parseFloat(v.superficie_util) > 0 ? Math.round(parseFloat(v.superficie_util)) : null
      if (m2o && m2Construido && !enBandaM2(m2o, m2Construido)) return null
      if (uf < 500 || uf > 200000) return null
      return { dir: limpiaTxt(v.direccion) || limpiaTxt(v.titulo) || null, m2: m2o, uf: Math.round(uf), uf_m2: m2o ? Math.round(uf / m2o) : null, fecha: String(v.fecha_publicacion || '').slice(0, 10) || null, url: v.url || null }
    }).filter(Boolean).sort((a, b) => ((a.fecha || '') < (b.fecha || '') ? 1 : -1))
    ofertasVenta = lista.slice(0, 12)
    const medV = mediana(lista.map(o => o.uf).filter(x => x > 0))
    if (lista.length >= 3 && medV) ofertaVentaMediana = Math.round(medV)
  } catch (e) { console.error('Ofertas venta tasar:', e.message) }
  try {
    const lista = (await fetchOfertas('arriendo')).map(v => {
      let pm = enUF(v); if (pm == null) return null
      if (pm > 3000) pm = pm / UF_CLP // arriendo publicado en pesos sin moneda
      const m2o = parseFloat(v.superficie_util) > 0 ? Math.round(parseFloat(v.superficie_util)) : null
      if (m2o && m2Construido && !enBandaM2(m2o, m2Construido)) return null
      if (pm < 3 || pm > 400) return null
      return { dir: limpiaTxt(v.direccion) || limpiaTxt(v.titulo) || null, m2: m2o, uf_mes: Math.round(pm * 10) / 10, fecha: String(v.fecha_publicacion || '').slice(0, 10) || null, url: v.url || null }
    }).filter(Boolean).sort((a, b) => ((a.fecha || '') < (b.fecha || '') ? 1 : -1))
    ofertasArriendo = lista.slice(0, 12)
    if (lista.length >= 3) {
      arriendoMediana = Math.round(mediana(lista.map(o => o.uf_mes)) * 10) / 10
      arriendoN = lista.length
    }
  } catch (e) { console.error('Arriendo tasar:', e.message) }

  // ── 2. VALOR DETERMINÍSTICO ───────────────────────────────────────────────
  // Se calcula ANTES del LLM para poder pasárselo como dato autoritativo.
  const ajustesCfg = await getAjustesConfig()
  let valorDet = null      // { valor_uf, precio_m2, confianza, desglose[] }
  let precioM2Base = null  // precio por m² base (mediana CBR), para el jardín

  // ── CASAS: modelo ADITIVO (suelo × m² terreno + construcción × m² construidos) ──
  // El UF/m² construido de otras casas arrastra el valor de SUS terrenos: aplicarlo
  // directo sobrevalora las casas con sitio chico y subvalora las de sitio grande.
  if (tipoObjetivo === 'casa' && sueloInfo && m2Terreno > 0 && m2Construido) {
    const { tier } = elegirTierConstruccion(comuna, sueloInfo.uf_m2)
    const estado = estadoConstruccion(anio, answers?.remodelacion)
    const cfgCosto = COSTO_CONSTRUCCION_TIERS[tier][estado]
    const costoUfM2 = Math.round((cfgCosto.min + cfgCosto.max) / 2)
    const { terreno_uf, construccion_uf, total_uf } = valorAditivoCasa({ sueloUfM2: sueloInfo.uf_m2, m2Terreno, costoUfM2, m2Construido })
    precioM2Base = Math.round(total_uf / m2Construido)
    const { finalUf, lineas } = aplicarAjustes({ baseUf: total_uf, tipo, extras, answers, cfg: ajustesCfg })
    valorDet = {
      valor_uf: finalUf,
      precio_m2: Math.round(finalUf / m2Construido),
      confianza: confianzaPorN(sueloInfo.n),
      metodo: 'aditivo: suelo + construcción (núcleo compartido con Isidora)',
      desglose: [
        { concepto: 'Valor del terreno', calculo: sueloInfo.uf_m2 + ' UF/m² de suelo x ' + m2Terreno + ' m² (' + sueloInfo.fuente + ', ' + sueloInfo.n + ' referencias, ' + sueloInfo.tramo + ')', valor_uf: terreno_uf },
        { concepto: 'Valor de la construcción', calculo: costoUfM2 + ' UF/m² (' + cfgCosto.label.toLowerCase() + ') x ' + m2Construido + ' m² construidos', valor_uf: construccion_uf },
        ...lineas,
      ],
    }
    } else if (comparablesReales.length > 0 && m2Construido) {
    // Mediana sobre TODO el universo comparable del sector (la misma que ve
    // Isidora en /api/zona), no solo sobre las 12 más cercanas que se muestran.
    const ufm2List = (ufm2SectorList.length >= 3 ? ufm2SectorList : comparablesReales.map(c => c.uf_m2)).filter(x => x > 0)
    if (ufm2List.length) {
      const medianaUfM2 = Math.round(mediana(ufm2List))
      const baseUf = Math.round(medianaUfM2 * m2Construido)
      precioM2Base = medianaUfM2

      const { finalUf, lineas } = aplicarAjustes({ baseUf, tipo, extras, answers, cfg: ajustesCfg })

      const desglose = [
        { concepto: 'Valor base por comparables CBR', calculo: `mediana ${medianaUfM2} UF/m2 x ${m2Construido} m2 (${ufm2List.length} ventas reales del sector)`, valor_uf: baseUf },
        ...lineas,
      ]
      valorDet = {
        valor_uf: finalUf,
        precio_m2: Math.round(finalUf / m2Construido),
        confianza: confianzaPorN(ufm2List.length),
        desglose,
      }
    }
  }

  // Estacionamientos y bodegas con ventas REALES del mismo edificio (estilo
  // DataInmobiliaria/Propiteq: cada unidad se suma con su valor de mercado).
  if (valorDet && (valorEstacionamientoUf || valorBodegaUf)) {
    const nEst = parseInt(answers?.estacionamientos) || 0
    const nBod = parseInt(answers?.bodegas) || 0
    let extraUf = 0
    if (nEst > 0 && valorEstacionamientoUf) {
      const v = nEst * valorEstacionamientoUf
      extraUf += v
      valorDet.desglose.push({ concepto: nEst > 1 ? 'Estacionamientos' : 'Estacionamiento', calculo: nEst + ' × ' + valorEstacionamientoUf + ' UF (mediana de ventas reales del edificio)', valor_uf: v })
    }
    if (nBod > 0 && valorBodegaUf) {
      const v = nBod * valorBodegaUf
      extraUf += v
      valorDet.desglose.push({ concepto: nBod > 1 ? 'Bodegas' : 'Bodega', calculo: nBod + ' × ' + valorBodegaUf + ' UF (mediana de ventas reales del edificio)', valor_uf: v })
    }
    if (extraUf > 0) {
      valorDet.valor_uf += extraUf
      if (m2Construido) valorDet.precio_m2 = Math.round((valorDet.valor_uf / m2Construido) * 10) / 10
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
    if (punto) prcZona = await normativaEnPunto(punto.lng, punto.lat, comuna, baseUrl)
  } catch (e) { console.error('PRC tasar:', e.message) }
  const esSubMinimo = !!(prcZona && prcZona.predial_min && m2Terreno && m2Terreno < prcZona.predial_min)
  const notaPredial = esSubMinimo
    ? `\nNOTA OBLIGATORIA: el terreno (${m2Terreno} m²) es menor al predial mínimo (${prcZona.predial_min} m²), pero el predio YA está subdividido e inscrito: SÍ puede demolerse y construirse una vivienda nueva. Menciona solo que no es apto para proyecto inmobiliario (subdividir o más de una vivienda). NO digas que no se puede demoler o reconstruir.`
    : ''
  const normativaTexto = prcZona
    ? `\n\nNORMATIVA OFICIAL DEL PLAN REGULADOR (AUTORITATIVA — úsala tal cual en plan_regulador y en tu análisis, NO la inventes):\n${JSON.stringify({ zona: prcZona.zona, nombre_zona: prcZona.nombre, uso_suelo: prcZona.uso, densidad: prcZona.densidad, superficie_predial_minima_m2: prcZona.predial_min, constructibilidad: prcZona.constructibilidad, fuente: prcZona.fuente }, null, 2)}${notaPredial}`
    : ''

  // Datos reales del sector para que la narración los use (no los invente)
  const sectorTexto = (plusvalia12m != null || arriendoMediana || ofertaVentaMediana)
    ? '\n\nDATOS REALES DEL SECTOR (úsalos en tu análisis):'
      + (plusvalia12m != null ? '\n- Plusvalía del sector últimos 12 meses (mediana UF/m²): ' + plusvalia12m + '%' : '')
      + (arriendoMediana ? '\n- Arriendo de referencia para esta tipología: ' + arriendoMediana + ' UF/mes (' + arriendoN + ' ofertas vigentes del sector)' : '')
      + (ofertaVentaMediana ? '\n- Mediana de OFERTAS de venta activas de tipología similar en el sector: ' + ofertaVentaMediana + ' UF (los precios de oferta suelen estar 5-10% sobre el cierre)' : '')
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
- Si NO se te entrega un valor determinístico (no hubo datos suficientes del sector): entrega valor_uf y precio_m2 con tus rangos de referencia por comuna, SIEMPRE con confianza "Baja", y el desglose debe contener UNA SOLA línea: { "concepto": "Estimación referencial (sin ventas suficientes en el sector)", "calculo": "rango de mercado de la comuna", "valor_uf": <el valor> }. PROHIBIDO inventar líneas de valor de terreno, UF/m² de suelo, factores de depreciación, ajustes de ubicación o descuentos: esos números SOLO pueden venir del sistema.

PLAN REGULADOR:
- Si se te entrega una "NORMATIVA OFICIAL DEL PLAN REGULADOR", úsala EXACTAMENTE (zona, nombre, uso de suelo, predial mínimo). NO inventes una zona distinta.
- Si NO se te entrega, recién ahí estima la zonificación con tu conocimiento, y acláralo como referencial.
- SUPERFICIE PREDIAL MÍNIMA — regla OBLIGATORIA: rige solo para NUEVAS subdivisiones y para proyectos de más de una vivienda. Un predio YA subdividido e inscrito con superficie menor MANTIENE sus derechos: SÍ se puede demoler la casa y construir una vivienda nueva. NUNCA digas que no se puede demoler, reconstruir, que el predio queda "congelado", "no conforme" o que pierde valor por no cumplir el predial mínimo. Si el terreno es menor al predial mínimo, di ÚNICAMENTE que no es apto para proyecto inmobiliario (subdividir o construir más de una vivienda), y nada más.

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
        messages: [{ role: 'user', content: `Tasa esta propiedad:\n\n${detalles}${comparablesTexto}${valorTexto}${normativaTexto}${sectorTexto}` }],
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
        // Predio menor al predial mínimo: el mínimo rige para NUEVAS subdivisiones.
        // Un predio ya inscrito mantiene sus derechos (demoler y reponer UNA vivienda);
        // solo queda inhabilitado para proyecto inmobiliario. Texto fijo, sin dramatismo.
        const obsBase = `Superficie predial mínima ~${prcZona.predial_min} m² · fuente: Plan Regulador${prcZona.fuente === 'ordenanza' ? ' (Ordenanza)' : ''}.`
        parsed.plan_regulador = {
          ...(parsed.plan_regulador || {}),
          zona: prcZona.zona,
          nombre_zona: prcZona.nombre,
          uso_suelo: prcZona.uso || (parsed.plan_regulador && parsed.plan_regulador.uso_suelo) || null,
          ...(prcZona.constructibilidad != null ? { coef_constructibilidad: prcZona.constructibilidad } : {}),
          superficie_predial_minima_m2: prcZona.predial_min,
          observaciones: esSubMinimo
            ? `${obsBase} El mínimo rige para nuevas subdivisiones: este predio ya está subdividido e inscrito, por lo que puede demolerse y construirse una vivienda nueva. No es apto para proyecto inmobiliario (subdivisión o más de una vivienda).`
            : `${obsBase} ${prevObs}`.trim(),
        }
        if (esSubMinimo) {
          const canon = 'Terreno bajo el predial mínimo: apto para reponer una vivienda, no para proyecto inmobiliario.'
          const reAlarma = /predial|demol|reconstru|subdivi|no conforme|congelad/i
          parsed.factores_negativos = [...(Array.isArray(parsed.factores_negativos) ? parsed.factores_negativos : []).filter(f => !reAlarma.test(String(f))), canon]
          if (parsed.plan_regulador && reAlarma.test(String(parsed.plan_regulador.impacto_valor || ''))) parsed.plan_regulador.impacto_valor = canon
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
      parsed.ventas_mapa = ventasMapa
      parsed.punto = punto ? { lat: punto.lat, lng: punto.lng } : null
      parsed.sector = { composicion: sectorComposicion, indice_uf_m2: indiceSector, plusvalia_12m_pct: plusvalia12m }
      parsed.ventas_conjunto = ventasConjunto
      parsed.historial_propiedad = historialPropiedad
      parsed.ofertas_venta = ofertasVenta
      parsed.ofertas_arriendo = ofertasArriendo
      parsed._diag = { ...(diag || {}), rest: diagRest, n_comparables: comparablesReales.length, n_suelo: sueloInfo ? sueloInfo.n : 0, metodo: valorDet ? (valorDet.metodo || 'mediana sector') : 'SIN valor determinístico (estimación referencial del LLM)' }
      const _valorRef = parsed.valor_uf || null
      parsed.arriendo = arriendoMediana ? {
        uf_mes: arriendoMediana,
        n_ofertas: arriendoN,
        rentabilidad_pct: _valorRef ? Math.round(((arriendoMediana * 12) / _valorRef) * 1000) / 10 : null,
        retorno_anos: _valorRef ? Math.round(_valorRef / (arriendoMediana * 12)) : null,
      } : null
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
        ventas_mapa: ventasMapa,
        punto: punto ? { lat: punto.lat, lng: punto.lng } : null,
        sector: { composicion: sectorComposicion, indice_uf_m2: indiceSector, plusvalia_12m_pct: plusvalia12m },
        ventas_conjunto: ventasConjunto,
        historial_propiedad: historialPropiedad,
        ofertas_venta: ofertasVenta,
        ofertas_arriendo: ofertasArriendo,
        arriendo: arriendoMediana ? { uf_mes: arriendoMediana, n_ofertas: arriendoN, rentabilidad_pct: null, retorno_anos: null } : null,
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
