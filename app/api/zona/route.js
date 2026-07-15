// app/api/zona/route.js
// Precio real de un SECTOR para el comprador (agente Isidora), SEPARANDO casa vs depto.
// Acepta el sector de 3 formas: (a) comuna/direccion -> geocodifica, (b) lat/lng,
// (c) polygon dibujado en el mapa ([{lat,lng}, ...], min 3 puntos).
//
// >>> MODELO ADITIVO DE TASACIÓN PARA CASAS (suelo + construcción):
//     Una casa NO se valoriza con un solo UF/m². Se valoriza así:
//        TOTAL = (UF/m² de TERRENO del sector  ×  m² de terreno)
//              + (UF/m² de CONSTRUCCIÓN según estado  ×  m² construidos)
//     - El UF/m² de terreno (valor de suelo) se saca de ventas reales del sector:
//       primero de ventas de SITIOS (terreno sin construcción); si no hay suficientes,
//       se estima por método residual a partir de las ventas de casas.
//     - El UF/m² de construcción es un COSTO de reposición por estado/calidad
//       (tabla COSTO_CONSTRUCCION_UF_M2, ~15 a 45 UF/m²), editable.
//     Para departamentos/oficinas/comercial se mantiene el UF/m² construido de mercado.
import { NextResponse } from 'next/server'
import { normativaEnPunto, zonaLocalEnPunto } from '../../lib/prc.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const API_BASE = 'https://datainmobiliaria.cl/api/v1'
const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN
const GKEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY

// Fórmula compartida con /api/tasar (Valentina): núcleo único de valorización.
import {
  COSTO_CONSTRUCCION_TIERS, elegirTierConstruccion,
  poligono, centroide, mediana, percentil, r1,
  clasificaTipo, TIPO_OBJETIVO, cutoffVentasStr, esVentaReciente, enBandaM2,
  UFM2_MIN, UFM2_MAX, puntosSuelo, resumenSuelo, sueloPorTramo, sueloDeTramo,
  confianzaPorN, buscarVentasPoligono, terrenoDe, sinOutliers,
} from '../../lib/tasacion-core.js'

async function geocode(texto) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(texto + ', Región Metropolitana, Chile')}&key=${GKEY}`
  const r = await fetch(url)
  const j = await r.json()
  if (j.status !== 'OK' || !j.results || !j.results.length) return null
  const loc = j.results[0].geometry.location
  return { lat: loc.lat, lng: loc.lng, status: j.status }
}

export async function POST(request) {
  const dbg = new URL(request.url).searchParams.get('debug') ? {} : null
  try {
    const body = await request.json()
    const { direccion, comuna, lat, lng, polygon, tipo, presupuesto_uf, m2_objetivo, m2_terreno } = body || {}
    if (!DATAINM_TOKEN) return Response.json({ error: 'DATAINMOBILIARIA_TOKEN no configurada' }, { status: 500 })

    const userPoly =
      Array.isArray(polygon) && polygon.length >= 3
        ? polygon.map((p) => ({ lat: +p.lat, lng: +p.lng })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        : null

    let punto = null
    if (userPoly && userPoly.length >= 3) {
      punto = centroide(userPoly)
      if (dbg) dbg.fuente_sector = 'polygon'
    } else if (lat && lng) {
      punto = { lat: +lat, lng: +lng }
      if (dbg) dbg.fuente_sector = 'latlng'
    } else {
      const texto = [direccion, comuna].filter(Boolean).join(', ')
      if (!texto) return Response.json({ error: 'Falta comuna/direccion, lat/lng o polygon' }, { status: 400 })
      punto = await geocode(texto)
      if (dbg) { dbg.fuente_sector = 'geocode'; dbg.geocode = punto }
      if (!punto) return Response.json({ _modo: 'sin_geocode', mensaje: 'No pude ubicar el sector.', ...(dbg ? { _debug: dbg } : {}) })
    }

    const objetivo = TIPO_OBJETIVO[String(tipo || '').toLowerCase()] || 'casa'
    const m2obj = parseFloat(m2_objetivo) || 0
    const m2terrInput = parseFloat(m2_terreno) || 0
    const esCasa = objetivo === 'casa'

    const polys = userPoly ? [userPoly] : [poligono(punto.lat, punto.lng, 800), poligono(punto.lat, punto.lng, 1600), poligono(punto.lat, punto.lng, 3200)]

    // Búsqueda compartida del núcleo (doble pasada: sin filtro + property_type)
    const busq = await buscarVentasPoligono({ token: DATAINM_TOKEN, polys, objetivo })
    let ventas = busq.ventas
    const paginasUsadas = busq.paginas
    if (busq.bloqueado && !ventas.length) {
      return Response.json({
        _modo: 'servicio_no_disponible',
        mensaje: 'El servicio de datos de mercado no está disponible en este momento. Intenta nuevamente en unos minutos.',
        ...(dbg ? { _debug: dbg } : {}),
      })
    }

    // Solo ventas de los últimos 5 años (ventana compartida del núcleo).
    const _cutoffStr = cutoffVentasStr()
    ventas = ventas.filter((v) => esVentaReciente(v, _cutoffStr))

    // Debug temprano: visible incluso si termina en pocos_comparables
    if (dbg) {
      dbg.n_ventas_crudas = ventas.length
      const counts0 = {}
      ventas.forEach((v) => { const t = clasificaTipo(v); counts0[t] = (counts0[t] || 0) + 1 })
      dbg.counts_por_tipo = counts0
      dbg.campos = ventas[0] ? Object.keys(ventas[0]) : []
      dbg.muestra_clasificacion = ventas.slice(0, 10).map((v) => ({ dest: v.cod_destino, copro: v.copropiedad, terr: v.superficie_total_terreno, constr: v.superficie_construccion, unit: v.unit, tipo: clasificaTipo(v) }))
      dbg.muestra_raw = ventas.slice(0, 2)
    }

    // ── Comparables del tipo objetivo (mercado, UF/m² construido) ────────────────
    let filtradas = ventas.filter((v) => {
      if (clasificaTipo(v) !== objetivo) return false
      if (String(v.unit || '').toUpperCase() !== 'UF') return false
      const m2 = parseFloat(v.superficie_construccion)
      const uf = parseFloat(v.price)
      if (!(m2 > 0) || !(uf > 0)) return false
      const ufm2 = uf / m2
      if (ufm2 < UFM2_MIN || ufm2 > UFM2_MAX) return false
      if (!enBandaM2(m2, m2obj)) return false
      return true
    })

    // #2: para CASAS, restringir comparables a la MISMA zona del PRC (misma normativa),
    // cuando la comuna tiene GeoJSON de zonas (lookup barato por punto). Si quedan pocas,
    // se mantiene el set por proximidad (fallback).
    if (esCasa && comuna) {
      let bu = ''
      try { bu = new URL(request.url).origin } catch (e) {}
      if (!bu && process.env.VERCEL_URL) bu = `https://${process.env.VERCEL_URL}`
      const zonaTarget = await zonaLocalEnPunto(punto.lng, punto.lat, comuna, bu)
      if (zonaTarget) {
        const conZona = []
        for (const v of filtradas) {
          const zv = await zonaLocalEnPunto(parseFloat(v.lng), parseFloat(v.lat), comuna, bu)
          if (zv && String(zv) === String(zonaTarget)) conZona.push(v)
        }
        if (conZona.length >= 3) filtradas = conZona
        if (dbg) dbg.zona_filtro = { zona: zonaTarget, n_en_zona: conZona.length, aplicado: conZona.length >= 3 }
      }
    }

    // Sin outliers de precio (regla compartida del núcleo)
    filtradas = sinOutliers(filtradas, (v) => parseFloat(v.price))
    let ufm2List = filtradas.map((v) => parseFloat(v.price) / parseFloat(v.superficie_construccion))

    // ── Respaldo estilo Valentina: detalle por ROL ancla ─────────────────────
    // busqueda_poligono no georreferencia predios sin copropiedad (casas), así
    // que si el polígono no trajo el tipo, se ancla en un ROL del catastro
    // cercano y se usan las "ventas recientes por radio" del detalle — la misma
    // fuente del reporte Detalle de Propiedad de DataInmobiliaria.
    if (ufm2List.length < 3) {
      try {
        const catRes = await fetch(`${API_BASE}/busqueda_poligono`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DATAINM_TOKEN },
          body: JSON.stringify({ fuente: 'catastro', polygon: poligono(punto.lat, punto.lng, 200) }),
          signal: AbortSignal.timeout(15000),
        })
        if (catRes.ok) {
          const catJ = await catRes.json()
          const predios = (catJ.resultados || catJ.data || [])
          // Para casas: un predio con terreno propio; para otros tipos, del mismo tipo
          const ancla = predios.find((r) => objetivo === 'casa' ? (terrenoDe(r) > 0 && clasificaTipo(r) === 'casa') : clasificaTipo(r) === objetivo) || predios[0]
          if (ancla && ancla.cod_com != null) {
            // Radio corto y banda ajustada primero; ampliar solo si faltan
            let filt2 = []
            for (const it of [{ radio: '800', bmin: 0.7, bmax: 1.4 }, { radio: '2000', bmin: 0.4, bmax: 2.2 }]) {
              const m2Min = m2obj > 0 ? Math.round(m2obj * it.bmin) : 20
              const m2Max = m2obj > 0 ? Math.round(m2obj * it.bmax) : 100000
              const qs = new URLSearchParams({
                cod_com: String(ancla.cod_com), cod_mz: String(ancla.cod_mz ?? ''), cod_pr: String(ancla.cod_pr ?? ''),
                radio: it.radio, superficie_min: String(m2Min), superficie_max: String(m2Max), cod_destino: 'H',
              }).toString()
              const detRes = await fetch(`${API_BASE}/propiedades/detalle?` + qs, { headers: { Authorization: 'Bearer ' + DATAINM_TOKEN }, signal: AbortSignal.timeout(15000) })
              if (!detRes.ok) break
              const det = await detRes.json()
              const recientes = Array.isArray(det.detalle_ventas_recientes) ? det.detalle_ventas_recientes : []
              filt2 = recientes
                .filter((v) => parseFloat(v.superficie_construccion) > 0 && parseFloat(v.price) > 0 && (v.unit === 'UF' || !v.unit))
                .filter((v) => clasificaTipo(v) === objetivo)
                .filter((v) => esVentaReciente(v, _cutoffStr))
                .filter((v) => { const ufm2 = parseFloat(v.price) / parseFloat(v.superficie_construccion); return ufm2 >= UFM2_MIN && ufm2 <= UFM2_MAX })
              if (dbg) dbg.respaldo_detalle = { ancla: [ancla.cod_com, ancla.cod_mz, ancla.cod_pr].join('-'), radio: it.radio, n_recientes: recientes.length, n_del_tipo: filt2.length }
              if (filt2.length >= 5) break
            }
            filt2 = sinOutliers(filt2, (v) => parseFloat(v.price))
            if (filt2.length >= 3) {
              filtradas = filt2
              ufm2List = filt2.map((v) => parseFloat(v.price) / parseFloat(v.superficie_construccion))
            }
          }
        }
      } catch (e) { if (dbg) dbg.respaldo_detalle_err = String((e && e.message) || e) }
    }

    if (ufm2List.length < 3) {
      if (dbg) { dbg.n_filtradas = filtradas.length; dbg.objetivo = objetivo }
      return Response.json({
        _modo: 'pocos_comparables',
        tipo: objetivo,
        mensaje: `Hay muy pocas ventas de ${objetivo} en ese sector para una estimación confiable.`,
        n: ufm2List.length,
        ...(dbg ? { _debug: dbg } : {}),
      })
    }

    const med = Math.round(mediana(ufm2List))
    const p25 = Math.round(percentil(ufm2List, 25))
    const p75 = Math.round(percentil(ufm2List, 75))
    const n = ufm2List.length
    const confianza = confianzaPorN(n)

    // ── MODELO ADITIVO (solo casas): valor de suelo + costo construcción ─────────
    let valorizacion = null
    if (esCasa) {
      // Tamaños "tipo" del sector (medianas de las casas comparables)
      const terrenoTipo = Math.round(mediana(filtradas.map((v) => parseFloat(v.superficie_total_terreno)).filter((x) => x > 0)) || 0)
      const construidoTipo = Math.round(mediana(filtradas.map((v) => parseFloat(v.superficie_construccion)).filter((x) => x > 0)) || 0)

      // (1)+(2) Puntos de valor de suelo desde el núcleo compartido:
      // ventas de sitios o, si no alcanzan, método residual sobre las casas.
      const { pts: sueloPts, fuente: fuenteSuelo } = puntosSuelo(ventas, filtradas)
      const suelo = resumenSuelo(sueloPts, fuenteSuelo)

      // Suelo por TRAMO de tamaño de sitio (núcleo compartido): sitios grandes
      // (normativa de baja densidad) → menor UF/m²; sitios chicos → mayor UF/m².
      const suelo_por_tramo = sueloPorTramo(sueloPts)

      // Tier de costo de construcción según comuna (o inferido por valor de suelo)
      const { tier, motivo } = elegirTierConstruccion(comuna, suelo ? suelo.uf_m2_mediana : null)
      const costoConstr = COSTO_CONSTRUCCION_TIERS[tier]

      // (3) Total aditivo de ejemplo para una "casa tipo" del sector (o m² pedidos).
      //     Si conocemos el tamaño del sitio, usa el UF/m² del TRAMO correspondiente
      //     (microzona por normativa), no el promedio general de la comuna.
      let total_ejemplo = null
      if (suelo) {
        const cM2 = m2obj > 0 ? m2obj : construidoTipo
        const tM2 = m2terrInput > 0 ? m2terrInput : terrenoTipo
        const sueloUsar = (m2terrInput > 0 ? sueloDeTramo(suelo_por_tramo, m2terrInput) : null) || suelo
        if (cM2 > 0 && tM2 > 0) {
          const por_estado = {}
          for (const [k, cfg] of Object.entries(costoConstr)) {
            const min = Math.round(sueloUsar.uf_m2_p25 * tM2 + cfg.min * cM2)
            const max = Math.round(sueloUsar.uf_m2_p75 * tM2 + cfg.max * cM2)
            const med2 = Math.round(sueloUsar.uf_m2_mediana * tM2 + ((cfg.min + cfg.max) / 2) * cM2)
            por_estado[k] = { label: cfg.label, uf_min: min, uf_med: med2, uf_max: max }
          }
          total_ejemplo = { terreno_m2: tM2, construido_m2: cM2, suelo_uf_m2_usado: sueloUsar.uf_m2_mediana, por_estado }
        }
      }

      // Normativa REAL del PRC vía módulo compartido (mismo que usa Valentina).
      // Devuelve null si la comuna no tiene archivo de zonas cargado (hoy: Las Condes).
      // baseUrl = origin de la request: el módulo lee los GeoJSON por HTTP (public/ no
      // está disponible vía fs en serverless).
      let prc_zona = null
      if (comuna) {
        let baseUrl = ''
        try { baseUrl = new URL(request.url).origin } catch (e) {}
        if (!baseUrl && process.env.VERCEL_URL) baseUrl = `https://${process.env.VERCEL_URL}`
        prc_zona = await normativaEnPunto(punto.lng, punto.lat, comuna, baseUrl)
      }

      valorizacion = {
        metodo: 'aditivo: valor_suelo × m²_terreno + costo_construcción × m²_construido',
        casa_tipo: { terreno_m2: terrenoTipo, construido_m2: construidoTipo },
        suelo,                                   // UF/m² de terreno del sector (rango, promedio)
        suelo_por_tramo,                         // UF/m² de suelo por tamaño de sitio (normativa)
        prc_zona,                                // zona real del PRC + predial mínimo aprox (piloto Las Condes)
        construccion_tier: tier,                 // premium / alta / estandar
        construccion_tier_motivo: motivo,        // por qué se eligió ese tier
        construccion_costo_uf_m2: costoConstr,   // por estado, ya según comuna
        total_ejemplo,                           // total ya sumado, por estado
        validacion_uf_m2_construido_mercado: med, // cross-check: total/m²c debería parecerse a esto
      }
    }

    if (dbg) {
      const counts = {}
      ventas.forEach((v) => { const t = clasificaTipo(v); counts[t] = (counts[t] || 0) + 1 })
      // Muestra cruda: para ver los NOMBRES DE CAMPO reales que entrega la API
      dbg.muestra_raw = ventas.slice(0, 2)
      dbg.muestra_clasificacion = ventas.slice(0, 8).map((v) => ({ dest: v.cod_destino, copro: v.copropiedad, terr: v.superficie_total_terreno, constr: v.superficie_construccion, tipo: clasificaTipo(v) }))
      dbg.paginas = paginasUsadas
      dbg.objetivo = objetivo
      dbg.counts_por_tipo = counts
      dbg.n_total_ventas = ventas.length
      dbg.n_filtradas = filtradas.length
    }

    const pres = parseFloat(presupuesto_uf) || 0
    let reality = null
    if (pres > 0) {
      reality = {
        m2_alcanzable_med: Math.round(pres / med),
        m2_alcanzable_min: Math.round(pres / p75),
        m2_alcanzable_max: Math.round(pres / p25),
      }
    }
    let estimacion = null
    if (m2obj > 0) {
      estimacion = {
        uf_min: Math.round(p25 * m2obj),
        uf_med: Math.round(med * m2obj),
        uf_max: Math.round(p75 * m2obj),
      }
    }

    // Ventas similares para el mapa del comprador (mismas comparables: tipo + m² parecidos).
    const ventas_mapa = filtradas
      .map((v) => {
        const la = parseFloat(v.lat ?? v.latitud), ln = parseFloat(v.lng ?? v.longitud), uf = Math.round(parseFloat(v.price))
        const m2c = Math.round(parseFloat(v.superficie_construccion))
        if (!Number.isFinite(la) || !Number.isFinite(ln) || !(uf > 0)) return null
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
      })
      .filter(Boolean)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
      .slice(0, 150)

    return Response.json({
      _modo: 'real',
      tipo: objetivo,
      ventas_mapa,
      sector: { lat: punto.lat, lng: punto.lng, comuna: comuna || null, por_mapa: !!userPoly },
      // Mercado (UF/m² construido). Para depto/oficina/comercial es la métrica principal.
      precio_sector: { uf_m2_mediana: med, uf_m2_p25: p25, uf_m2_p75: p75, n_comparables: n, confianza },
      // Solo casas: desglose aditivo suelo + construcción = total.
      valorizacion,
      reality,
      estimacion,
      ...(dbg ? { _debug: dbg } : {}),
    })
  } catch (e) {
    return Response.json({ error: e.message, _modo: 'error' }, { status: 200 })
  }
}
