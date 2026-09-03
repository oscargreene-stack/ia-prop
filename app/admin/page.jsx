// app/admin/page.jsx
// Panel de administración de ajustes de valorización.
// - Lee los valores actuales desde Vercel Edge Config (con respaldo a los defaults).
// - Guarda los cambios en Edge Config vía la API de Vercel (requiere VERCEL_API_TOKEN).
// - El guardado está protegido por contraseña (ADMIN_PASSWORD).
// Un solo archivo, sin dependencias extra.

import crypto from 'node:crypto'
import { redirect } from 'next/navigation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Defaults = mismos valores de respaldo que usa app/api/tasar/route.js
const DEFAULTS = {
  piso: { pctPorCada5SobreEl5: 0.02, pisoBajoUmbral: 2, pctPisoBajo: -0.02 },
  orientacion: { norte: 0.04, sur: -0.03, oriente: 0.02, poniente: -0.02 },
  remodelacion: { baja: 5, media: 10, alta: 20, tiempo: { reciente: 1.0, hace3: 0.75, hace5: 0.5 } },
  jardin: { factor: 0.3333 },
  caracteristicas: {
    piscina:300, quincho:120, vista:150, jardin:80, doble_altura:100, seguridad:40,
    vista_despejada:100, piscina_edificio:80, gimnasio:40, conserje:30, calefaccion:50,
    terraza_of:80, sala_reuniones:60, rio_lago:200, arboles:60, construccion:150,
    rio:150, galpones:100, luz:80, si_canal:300, si_pozo:200, si_multiple:400,
    bodega:80, galpon:120, camara_frio:200, riego_tecnificado:300, acceso_camion:150,
    anden:100, frigorificos:200, tres_fase:100,
  },
}

// Lista de características con etiqueta legible (orden de aparición en el panel)
const CARACT = [
  ['piscina','Piscina'], ['quincho','Quincho / BBQ'], ['vista','Vista panorámica'],
  ['vista_despejada','Vista despejada'], ['jardin','Jardín (característica)'], ['doble_altura','Doble altura'],
  ['seguridad','Seguridad / alarma'], ['piscina_edificio','Piscina del edificio'], ['gimnasio','Gimnasio'],
  ['conserje','Conserje'], ['calefaccion','Calefacción central'], ['terraza_of','Terraza (oficina)'],
  ['sala_reuniones','Sala de reuniones'], ['rio_lago','Río o lago'], ['rio','Río'], ['arboles','Árboles / bosque'],
  ['construccion','Construcción adicional'], ['galpones','Galpones'], ['galpon','Galpón'], ['luz','Luz / electricidad'],
  ['si_canal','Derechos de agua — canal'], ['si_pozo','Derechos de agua — pozo'], ['si_multiple','Derechos de agua — múltiple'],
  ['bodega','Bodega'], ['camara_frio','Cámara de frío'], ['frigorificos','Cámaras frigoríficas'],
  ['riego_tecnificado','Riego tecnificado'], ['acceso_camion','Acceso para camión'], ['anden','Andén de carga'],
  ['tres_fase','Corriente trifásica'],
]

const EDGE_CONFIG_ID_FALLBACK = 'ecfg_tvdlotkvqzlquv0ggoo8ef7x81tg'
const VERCEL_SLUG = 'oscariaprop'

function edgeId() {
  try {
    const ec = process.env.EDGE_CONFIG
    if (ec) {
      const id = new URL(ec).pathname.split('/').filter(Boolean)[0]
      if (id) return id
    }
  } catch (e) {}
  return EDGE_CONFIG_ID_FALLBACK
}

async function leerAjustes() {
  try {
    const ec = process.env.EDGE_CONFIG
    if (!ec) return DEFAULTS
    const u = new URL(ec)
    const id = u.pathname.split('/').filter(Boolean)[0]
    const token = u.searchParams.get('token')
    const res = await fetch(`https://edge-config.vercel.com/${id}/item/ajustes?token=${token}`, { cache: 'no-store' })
    if (!res.ok) return DEFAULTS
    const s = await res.json()
    if (!s || typeof s !== 'object') return DEFAULTS
    return {
      piso: { ...DEFAULTS.piso, ...(s.piso || {}) },
      orientacion: { ...DEFAULTS.orientacion, ...(s.orientacion || {}) },
      remodelacion: {
        ...DEFAULTS.remodelacion, ...(s.remodelacion || {}),
        tiempo: { ...DEFAULTS.remodelacion.tiempo, ...((s.remodelacion && s.remodelacion.tiempo) || {}) },
      },
      jardin: { ...DEFAULTS.jardin, ...(s.jardin || {}) },
      caracteristicas: { ...DEFAULTS.caracteristicas, ...(s.caracteristicas || {}) },
    }
  } catch (e) {
    return DEFAULTS
  }
}

function passOk(input) {
  const expected = process.env.ADMIN_PASSWORD || ''
  if (!expected) return false
  const a = crypto.createHash('sha256').update(String(input || '')).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

// ── Server action: guardar cambios ────────────────────────────────────────────
async function guardar(formData) {
  'use server'
  if (!passOk(formData.get('password'))) redirect('/admin?estado=clave')

  const token = process.env.VERCEL_API_TOKEN
  if (!token) redirect('/admin?estado=sintoken')

  // % (mostrado) -> fracción (guardada)
  const frac = (k, def) => {
    const v = parseFloat(formData.get(k))
    return isFinite(v) ? Math.max(-90, Math.min(200, v)) / 100 : def
  }
  const intg = (k, def) => {
    const v = parseInt(formData.get(k), 10)
    return Number.isInteger(v) ? Math.max(1, Math.min(50, v)) : def
  }
  const uf = (k, def) => {
    const v = parseFloat(formData.get(k))
    return isFinite(v) ? Math.max(0, Math.min(5000, v)) : def
  }

  const caracteristicas = {}
  for (const [key] of CARACT) caracteristicas[key] = uf('car_' + key, DEFAULTS.caracteristicas[key])

  const value = {
    piso: {
      pctPorCada5SobreEl5: frac('piso_porCada5', DEFAULTS.piso.pctPorCada5SobreEl5),
      pisoBajoUmbral: intg('piso_umbral', DEFAULTS.piso.pisoBajoUmbral),
      pctPisoBajo: frac('piso_bajo', DEFAULTS.piso.pctPisoBajo),
    },
    orientacion: {
      norte: frac('ori_norte', DEFAULTS.orientacion.norte),
      sur: frac('ori_sur', DEFAULTS.orientacion.sur),
      oriente: frac('ori_oriente', DEFAULTS.orientacion.oriente),
      poniente: frac('ori_poniente', DEFAULTS.orientacion.poniente),
    },
    remodelacion: {
      baja: uf('remo_baja', DEFAULTS.remodelacion.baja),
      media: uf('remo_media', DEFAULTS.remodelacion.media),
      alta: uf('remo_alta', DEFAULTS.remodelacion.alta),
      tiempo: {
        reciente: frac('remo_t_reciente', DEFAULTS.remodelacion.tiempo.reciente),
        hace3: frac('remo_t_hace3', DEFAULTS.remodelacion.tiempo.hace3),
        hace5: frac('remo_t_hace5', DEFAULTS.remodelacion.tiempo.hace5),
      },
    },
    jardin: { factor: frac('jardin_factor', DEFAULTS.jardin.factor) },
    caracteristicas,
  }

  let res
  try {
    res = await fetch(`https://api.vercel.com/v1/edge-config/${edgeId()}/items?slug=${VERCEL_SLUG}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ operation: 'upsert', key: 'ajustes', value }] }),
    })
  } catch (e) {
    redirect('/admin?estado=error')
  }
  if (!res.ok) redirect('/admin?estado=error')
  redirect('/admin?estado=ok')
}

// ── UI ────────────────────────────────────────────────────────────────────────
const S = {
  page: { maxWidth: 720, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#1a1a1a' },
  h1: { fontSize: 24, fontWeight: 700, margin: '0 0 4px' },
  sub: { color: '#666', fontSize: 14, margin: '0 0 28px' },
  card: { border: '1px solid #e5e5e5', borderRadius: 12, padding: 20, marginBottom: 18, background: '#fff' },
  cardTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 4px' },
  cardNote: { fontSize: 12, color: '#888', margin: '0 0 12px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid #f2f2f2' },
  label: { fontSize: 14, fontWeight: 500 },
  hint: { fontSize: 12, color: '#888', marginTop: 2 },
  input: { width: 90, padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14, textAlign: 'right' },
  unit: { color: '#888', fontSize: 13, marginLeft: 6, display: 'inline-block', width: 46 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' },
  passWrap: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 },
  passInput: { flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 },
  btn: { padding: '11px 22px', borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  banner: (bg, fg) => ({ background: bg, color: fg, padding: '12px 16px', borderRadius: 10, marginBottom: 22, fontSize: 14, fontWeight: 500 }),
}

function Banner({ estado }) {
  if (estado === 'ok') return <div style={S.banner('#e7f7ec', '#15803d')}>✅ Cambios guardados. Ya están activos en las próximas tasaciones.</div>
  if (estado === 'clave') return <div style={S.banner('#fdeaea', '#b91c1c')}>❌ Contraseña incorrecta. Los cambios no se guardaron.</div>
  if (estado === 'sintoken') return <div style={S.banner('#fff4e5', '#b45309')}>⚠️ Falta configurar la clave de acceso de Vercel en el servidor (VERCEL_API_TOKEN).</div>
  if (estado === 'error') return <div style={S.banner('#fdeaea', '#b91c1c')}>❌ No se pudo guardar (error al escribir en Vercel). Revisá la clave de acceso e intentá de nuevo.</div>
  return null
}

function Campo({ label, hint, name, defaultValue, unit = '%', step = '0.5', wide = true }) {
  return (
    <div style={S.row}>
      <div style={{ minWidth: 0 }}>
        <div style={S.label}>{label}</div>
        {hint ? <div style={S.hint}>{hint}</div> : null}
      </div>
      <div style={{ whiteSpace: 'nowrap' }}>
        <input style={S.input} type="number" name={name} defaultValue={defaultValue} step={step} />
        <span style={S.unit}>{unit}</span>
      </div>
    </div>
  )
}

export default async function AdminPage({ searchParams }) {
  const sp = (await searchParams) || {}
  const a = await leerAjustes()
  const pc = (x) => Number((x * 100).toFixed(2)) // fracción -> %

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Ajustes de valorización</h1>
      <p style={S.sub}>Estos valores ajustan el precio final de una propiedad. Cambialos cuando lo necesites y guardá al final con tu contraseña.</p>

      <Banner estado={sp.estado} />

      <form action={guardar}>
        <div style={S.card}>
          <h2 style={S.cardTitle}>Orientación</h2>
          <p style={S.cardNote}>Ajuste en % sobre el valor base, según la orientación.</p>
          <Campo label="Norte" name="ori_norte" defaultValue={pc(a.orientacion.norte)} />
          <Campo label="Sur" name="ori_sur" defaultValue={pc(a.orientacion.sur)} />
          <Campo label="Oriente" name="ori_oriente" defaultValue={pc(a.orientacion.oriente)} />
          <Campo label="Poniente" name="ori_poniente" defaultValue={pc(a.orientacion.poniente)} />
        </div>

        <div style={S.card}>
          <h2 style={S.cardTitle}>Piso (departamentos y oficinas)</h2>
          <p style={S.cardNote}>Ajuste en % según la altura del piso.</p>
          <Campo label="Bonificación por altura" hint="Se suma este % por cada 5 pisos completos por encima del 5º." name="piso_porCada5" defaultValue={pc(a.piso.pctPorCada5SobreEl5)} />
          <Campo label="Penalización piso bajo" hint="Ajuste para los pisos bajos (normalmente negativo)." name="piso_bajo" defaultValue={pc(a.piso.pctPisoBajo)} />
          <Campo label="Hasta qué piso se considera 'bajo'" hint="Pisos 1 hasta este número reciben la penalización." name="piso_umbral" defaultValue={a.piso.pisoBajoUmbral} unit="piso" step="1" />
        </div>

        <div style={S.card}>
          <h2 style={S.cardTitle}>Remodelación</h2>
          <p style={S.cardNote}>Valor en UF por cada m² útil, según el nivel de remodelación.</p>
          <Campo label="Nivel bajo (terminaciones básicas)" name="remo_baja" defaultValue={a.remodelacion.baja} unit="UF/m²" step="0.5" />
          <Campo label="Nivel medio (calidad media)" name="remo_media" defaultValue={a.remodelacion.media} unit="UF/m²" step="0.5" />
          <Campo label="Nivel alto (alta calidad)" name="remo_alta" defaultValue={a.remodelacion.alta} unit="UF/m²" step="0.5" />
          <p style={{ ...S.cardNote, marginTop: 16 }}>Cuánto del valor de la remodelación se mantiene según su antigüedad.</p>
          <Campo label="Reciente (menos de 3 años)" name="remo_t_reciente" defaultValue={pc(a.remodelacion.tiempo.reciente)} />
          <Campo label="3 a 5 años" name="remo_t_hace3" defaultValue={pc(a.remodelacion.tiempo.hace3)} />
          <Campo label="Más de 5 años" name="remo_t_hace5" defaultValue={pc(a.remodelacion.tiempo.hace5)} />
        </div>

        <div style={S.card}>
          <h2 style={S.cardTitle}>Jardín</h2>
          <p style={S.cardNote}>Cada m² de jardín se valoriza como un porcentaje del precio por m² de la propiedad.</p>
          <Campo label="Valor del m² de jardín" hint="% del precio por m² del depto (ej: 33,33% = un tercio)." name="jardin_factor" defaultValue={pc(a.jardin.factor)} step="0.5" />
        </div>

        <div style={S.card}>
          <h2 style={S.cardTitle}>Características</h2>
          <p style={S.cardNote}>UF que suma cada característica al valor final.</p>
          <div style={S.grid}>
            {CARACT.map(([key, label]) => (
              <Campo key={key} label={label} name={'car_' + key} defaultValue={a.caracteristicas[key]} unit="UF" step="5" />
            ))}
          </div>
        </div>

        <div style={S.card}>
          <h2 style={S.cardTitle}>Confirmar</h2>
          <div style={S.label}>Contraseña de administrador</div>
          <div style={S.passWrap}>
            <input style={S.passInput} type="password" name="password" placeholder="Tu contraseña" autoComplete="off" required />
            <button style={S.btn} type="submit">Guardar</button>
          </div>
        </div>
      </form>
    </div>
  )
}
