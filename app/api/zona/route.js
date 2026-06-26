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
import { normativaEnPunto } from '../../lib/prc.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const API_BASE = 'https://datainmobiliaria.cl/api/v1'
const DATAINM_TOKEN = process.env.DATAINMOBILIARIA_TOKEN
const GKEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY

// ── Costo de construcción (reposición) por estado, en UF/m² construido ──────────
// Son costos de la OBRA, no precio de mercado. Editables según realidad de obra.
// El terreno se suma aparte (modelo aditivo). El costo VARÍA POR COMUNA: en comunas
// premium (Vitacura, Las Condes, Lo Barnechea) el tope es más alto por terminaciones
// de lujo; en comunas de tramo alto (Providencia, Ñuñoa, La Reina) es intermedio.
const COSTO_CONSTRUCCION_TIERS = {
  premium: {
    nueva:   { label: 'A estrenar / nueva',          min: 40, max: 55 },
    buena:   { label: 'Buen estado',                 min: 34, max: 40 },
    regular: { label: 'Estado regular',              min: 24, max: 32 },
    mala:    { label: 'A refaccionar / deteriorada', min: 16, max: 22 },
  },
  alta: {
    nueva:   { label: 'A estrenar / nueva',          min: 40, max: 50 },
    buena:   { label: 'Buen estado',                 min: 33, max: 41 },
    regular: { label: 'Estado regular',              min: 24, max: 32 },
    mala:    { label: 'A refaccionar / deteriorada', min: 16, max: 23 },
  },
  estandar: {
    nueva:   { label: 'A estrenar / nueva',          min: 38, max: 45 },
    buena:   { label: 'Buen estado',                 min: 30, max: 38 },
    regular: { label: 'Estado regular',              min: 22, max: 30 },
    mala:    { label: 'A refaccionar / deteriorada', min: 15, max: 22 },
  },
}
// Clasificación de comunas por nivel de terminaciones de construcción.
const COMUNAS_PREMIUM = ['vitacura', 'las condes', 'lo barnechea']
const COMUNAS_ALTA = ['providencia', 'nunoa', 'la reina']
// Normaliza nombre de comuna (sin acentos, minúsculas, ñ→n)
function nfdComuna(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ñ/g, 'n').trim()
}
// Elige tier por comuna; si no hay comuna (mapa/latlng), infiere por valor de suelo.
function elegirTierConstruccion(comuna, sueloMediana) {
  const c = nfdComuna(comuna)
  if (c) {
    if (COMUNAS_PREMIUM.includes(c)) return { tier: 'premium', motivo: `comuna premium (${comuna})` }
    if (COMUNAS_ALTA.includes(c)) return { tier: 'alta', motivo: `comuna de tramo alto (${comuna})` }
    return { tier: 'estandar', motivo: `comuna estándar (${comuna})` }
  }
  // Sin comuna: inferir desde el valor de suelo del sector
  const s = parseFloat(sueloMediana) || 0
  if (s >= 12) return { tier: 'premium', motivo: `inferido por valor de suelo alto (${s} UF/m²)` }
  if (s >= 6) return { tier: 'alta', motivo: `inferido por valor de suelo medio-alto (${s} UF/m²)` }
  return { tier: 'estandar', motivo: s ? `inferido por valor de suelo (${s} UF/m²)` : 'estándar (sin dato de comuna)' }
}
// Costo medio usado para el método residual de suelo (cuando no hay ventas de sitios).
const COSTO_CONSTR_RESIDUAL = 32 // UF/m² (≈ "buena")

async function geocode(texto) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(texto + ', Región Metropolitana, Chile')}&key=${GKEY}`
  const r = await fetch(url)
  const j = await r.json()
  if (j.status !== 'OK' || !j.results || !j.results.length) return null
  const loc = j.results[0].geometry.location
  return { lat: loc.lat, lng: loc.lng, status: j.status }
}

function poligono(lat, lng, radioM) {
  const dLat = radioM / 111320
  const dLng = radioM / (111320 * Math.cos((lat * Math.PI) / 180))
  return [
    { lat: lat + dLat, lng: lng - dLng },
    { lat: lat + dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng + dLng },
    { lat: lat - dLat, lng: lng - dLng },
  ]
}
function centroide(poly) {
  const n = poly.length
  let lat = 0, lng = 0
  for (const p of poly) { lat += p.lat; lng += p.lng }
  return { lat: lat / n, lng: lng / n }
}
function mediana(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function percentil(arr, p) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))
  return s[idx]
}
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10) // 1 decimal

// Clasifica una venta del CBR
function clasificaTipo(v) {
  const dest = String(v.cod_destino || '').toUpperCase()
  const constr = parseFloat(v.superficie_construccion || 0) || 0
  const terreno = parseFloat(v.superficie_total_terreno || 0) || 0
  // Sitio / terreno sin construcción (valor de suelo puro)
  if (constr <= 5 && terreno > 0) return 'terreno'
  if (dest === 'O') return 'oficina'
  if (dest === 'C') return 'comercial'
  if (dest !== 'H') return 'otro'
  return terreno > 0 ? 'casa' : 'departamento'
}

const TIPO_OBJETIVO = {
  casa: 'casa',
  departamento: 'departamento',
  depto: 'departamento',
  oficina: 'oficina',
  comercial: 'comercial',
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

    const polys = userPoly ? [userPoly] : [poligono(punto.lat, punto.lng, 800), poligono(punto.lat, punto.lng, 1600)]

    let ventas = []
    let paginasUsadas = 0
    for (const poly of polys) {
      let acc = []
      for (let page = 1; page <= 3; page++) {
        const r = await fetch(`${API_BASE}/busqueda_poligono`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + DATAINM_TOKEN },
          body: JSON.stringify({ fuente: 'ventas', polygon: poly, page }),
        })
        paginasUsadas++
        if (!r.ok) break
        const j = await r.json()
        const arr = Array.isArray(j.resultados) ? j.resultados : []
        acc = acc.concat(arr)
        const delTipo = acc.filter((v) => clasificaTipo(v) === objetivo).length
        if (delTipo >= 15 || !j.has_more) break
      }
      ventas = acc
      const delTipo = ventas.filter((v) => clasificaTipo(v) === objetivo).length
      if (delTipo >= 12) break
    }

    // ── Comparables del tipo objetivo (mercado, UF/m² construido) ────────────────
    const filtradas = ventas.filter((v) => {
      if (clasificaTipo(v) !== objetivo) return false
      if (String(v.unit || '').toUpperCase() !== 'UF') return false
      const m2 = parseFloat(v.superficie_construccion)
      const uf = parseFloat(v.price)
      if (!(m2 > 0) || !(uf > 0)) return false
      const ufm2 = uf / m2
      if (ufm2 < 3 || ufm2 > 500) return false
      if (m2obj > 0 && (m2 < m2obj * 0.4 || m2 > m2obj * 2.2)) return false
      return true
    })
    const ufm2List = filtradas.map((v) => parseFloat(v.price) / parseFloat(v.superficie_construccion))

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
    const confianza = n >= 8 ? 'Alta' : n >= 4 ? 'Media' : 'Baja'

    // ── MODELO ADITIVO (solo casas): valor de suelo + costo construcción ─────────
    let valorizacion = null
    if (esCasa) {
      // Tamaños "tipo" del sector (medianas de las casas comparables)
      const terrenoTipo = Math.round(mediana(filtradas.map((v) => parseFloat(v.superficie_total_terreno)).filter((x) => x > 0)) || 0)
      const construidoTipo = Math.round(mediana(filtradas.map((v) => parseFloat(v.superficie_construccion)).filter((x) => x > 0)) || 0)

      // (1) Valor de suelo desde ventas de SITIOS (terreno sin construcción) en el sector.
      //     Cada punto guarda el UF/m² de terreno Y el tamaño del sitio, para poder
      //     segmentar por tamaño (que refleja la normativa del sector).
      const sitios = ventas.filter((v) => clasificaTipo(v) === 'terreno' && String(v.unit || '').toUpperCase() === 'UF')
      const sueloVentasPts = sitios
        .map((v) => {
          const t = parseFloat(v.superficie_total_terreno), uf = parseFloat(v.price)
          if (!(t > 0) || !(uf > 0)) return null
          const r = uf / t
          if (r < 0.3 || r > 250) return null
          return { r, lot: t }
        })
        .filter((x) => x != null)

      // (2) Fallback residual: suelo = (precio − costoConstr × m²c) / m²t, sobre ventas de casas
      const sueloResidualPts = filtradas
        .map((v) => {
          const t = parseFloat(v.superficie_total_terreno), c = parseFloat(v.superficie_construccion), uf = parseFloat(v.price)
          if (!(t > 0) || !(c > 0) || !(uf > 0)) return null
          const land = (uf - COSTO_CONSTR_RESIDUAL * c) / t
          if (land < 0.3 || land > 250) return null
          return { r: land, lot: t }
        })
        .filter((x) => x != null)

      const usarVentas = sueloVentasPts.length >= 3
      const sueloPts = usarVentas ? sueloVentasPts : sueloResidualPts
      const sueloList = sueloPts.map((p) => p.r)
      const fuenteSuelo = usarVentas ? 'ventas_terreno' : 'residual_casas'

      let suelo = null
      if (sueloList.length >= 3) {
        suelo = {
          uf_m2_mediana: r1(mediana(sueloList)),
          uf_m2_p25: r1(percentil(sueloList, 25)),
          uf_m2_p75: r1(percentil(sueloList, 75)),
          n_comparables: sueloList.length,
          fuente: fuenteSuelo,
        }
      }

      // Suelo por TRAMO DE TAMAÑO DE SITIO (proxy de la normativa del sector):
      // sitios grandes (normativa de baja densidad, ej. 1.000 m² como Santa María de
      // Manquehue) → MENOR UF/m²; sitios chicos (300–500 m², ej. sector Club de Polo)
      // → MAYOR UF/m². Le da a Isidora microzonas claras dentro de una misma comuna.
      const TRAMOS_SITIO = [
        { id: '<500',     label: 'Sitios <500 m²',      min: 0,    max: 500 },
        { id: '500-800',  label: 'Sitios 500–800 m²',   min: 500,  max: 800 },
        { id: '800-1200', label: 'Sitios 800–1.200 m²', min: 800,  max: 1200 },
        { id: '>1200',    label: 'Sitios >1.200 m²',    min: 1200, max: Infinity },
      ]
      const suelo_por_tramo = TRAMOS_SITIO.map((tr) => {
        const vals = sueloPts.filter((p) => p.lot >= tr.min && p.lot < tr.max).map((p) => p.r)
        if (vals.length < 3) return null
        return { rango: tr.label, uf_m2_mediana: r1(mediana(vals)), uf_m2_p25: r1(percentil(vals, 25)), uf_m2_p75: r1(percentil(vals, 75)), n: vals.length }
      }).filter(Boolean)
      // Devuelve el UF/m² del tramo que corresponde a un tamaño de sitio dado.
      const sueloDeTramo = (lotM2) => {
        if (!(lotM2 > 0)) return null
        const tr = TRAMOS_SITIO.find((t) => lotM2 >= t.min && lotM2 < t.max)
        if (!tr) return null
        return suelo_por_tramo.find((s) => s.rango === tr.label) || null
      }

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
        const sueloUsar = (m2terrInput > 0 ? sueloDeTramo(m2terrInput) : null) || suelo
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
        const la = parseFloat(v.lat), ln = parseFloat(v.lng), uf = Math.round(parseFloat(v.price))
        const m2c = Math.round(parseFloat(v.superficie_construccion))
        if (!Number.isFinite(la) || !Number.isFinite(ln) || !(uf > 0)) return null
        return {
          lat: la, lng: ln, uf,
          m2: m2c > 0 ? m2c : null,
          uf_m2: m2c > 0 ? Math.round(uf / m2c) : null,
          fecha: String(v.date_inscripcion || v.fecha || '').slice(0, 10),
          dir: String(v.direccion_sii || '').replace(/\s+/g, ' ').trim() || null,
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
