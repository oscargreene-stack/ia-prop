// app/admin/page.jsx
// Panel de administración de ajustes de valorización (Fix #4).
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
  orientacion: { norte: 0.04, sur: -0.03 },
  remodelacion: { completa: 0.14, parcial: 0.07 },
}
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
      remodelacion: { ...DEFAULTS.remodelacion, ...(s.remodelacion || {}) },
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

  const pct = (k) => {
    const v = parseFloat(formData.get(k))
    return isFinite(v) ? Math.max(-90, Math.min(90, v)) / 100 : null
  }
  const intg = (k) => {
    const v = parseInt(formData.get(k), 10)
    return Number.isInteger(v) ? Math.max(1, Math.min(50, v)) : null
  }

  const value = {
    piso: {
      pctPorCada5SobreEl5: pct('pisoPorCada5') ?? DEFAULTS.piso.pctPorCada5SobreEl5,
      pisoBajoUmbral: intg('pisoBajoUmbral') ?? DEFAULTS.piso.pisoBajoUmbral,
      pctPisoBajo: pct('pisoBajoPct') ?? DEFAULTS.piso.pctPisoBajo,
    },
    orientacion: {
      norte: pct('norte') ?? DEFAULTS.orientacion.norte,
      sur: pct('sur') ?? DEFAULTS.orientacion.sur,
    },
    remodelacion: {
      completa: pct('remodCompleta') ?? DEFAULTS.remodelacion.completa,
      parcial: pct('remodParcial') ?? DEFAULTS.remodelacion.parcial,
    },
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
  page: { maxWidth: 640, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', color: '#1a1a1a' },
  h1: { fontSize: 24, fontWeight: 700, margin: '0 0 4px' },
  sub: { color: '#666', fontSize: 14, margin: '0 0 28px' },
  card: { border: '1px solid #e5e5e5', borderRadius: 12, padding: 20, marginBottom: 18, background: '#fff' },
  cardTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 14px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid #f2f2f2' },
  label: { fontSize: 14, fontWeight: 500 },
  hint: { fontSize: 12, color: '#888', marginTop: 2 },
  input: { width: 90, padding: '8px 10px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14, textAlign: 'right' },
  unit: { color: '#888', fontSize: 13, marginLeft: 6 },
  passWrap: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 },
  passInput: { flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 },
  btn: { padding: '11px 22px', borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' },
  banner: (bg, fg) => ({ background: bg, color: fg, padding: '12px 16px', borderRadius: 10, marginBottom: 22, fontSize: 14, fontWeight: 500 }),
}

function Banner({ estado }) {
  if (estado === 'ok') return <div style={S.banner('#e7f7ec', '#15803d')}>✅ Cambios guardados. Ya están activos en las próximas tasaciones.</div>
  if (estado === 'clave') return <div style={S.banner('#fdeaea', '#b91c1c')}>❌ Contraseña incorrecta. Los cambios no se guardaron.</div>
  if (estado === 'sintoken') return <div style={S.banner('#fff4e5', '#b45309')}>⚠️ Falta configurar la clave de acceso de Vercel en el servidor (VERCEL_API_TOKEN).</div>
  if (estado === 'error') return <div style={S.banner('#fdeaea', '#b91c1c')}>❌ No se pudo guardar (error al escribir en Vercel). Revisá la clave de acceso e intentá de nuevo.</div>
  return null
}

function Campo({ label, hint, name, defaultValue, unit = '%', step = '0.5' }) {
  return (
    <div style={S.row}>
      <div>
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
      <p style={S.sub}>Estos porcentajes ajustan el valor base (mediana de comparables del CBR) según las características de la propiedad. Cambialos cuando lo necesites y guardá.</p>

      <Banner estado={sp.estado} />

      <form action={guardar}>
        <div style={S.card}>
          <h2 style={S.cardTitle}>Piso (departamentos y oficinas)</h2>
          <Campo label="Bonificación por altura" hint="Se suma este % por cada 5 pisos completos por encima del 5º." name="pisoPorCada5" defaultValue={pc(a.piso.pctPorCada5SobreEl5)} />
          <Campo label="Penalización piso bajo" hint="Ajuste para los pisos bajos (normalmente negativo)." name="pisoBajoPct" defaultValue={pc(a.piso.pctPisoBajo)} />
          <Campo label="Hasta qué piso se considera 'bajo'" hint="Pisos 1 hasta este número reciben la penalización." name="pisoBajoUmbral" defaultValue={a.piso.pisoBajoUmbral} unit="piso" step="1" />
        </div>

        <div style={S.card}>
          <h2 style={S.cardTitle}>Orientación</h2>
          <Campo label="Orientación norte" hint="Ajuste para propiedades orientadas al norte." name="norte" defaultValue={pc(a.orientacion.norte)} />
          <Campo label="Orientación sur" hint="Ajuste para propiedades orientadas al sur (normalmente negativo)." name="sur" defaultValue={pc(a.orientacion.sur)} />
        </div>

        <div style={S.card}>
          <h2 style={S.cardTitle}>Remodelación</h2>
          <Campo label="Remodelación completa" hint="Ajuste cuando la propiedad fue remodelada por completo y reciente." name="remodCompleta" defaultValue={pc(a.remodelacion.completa)} />
          <Campo label="Remodelación parcial" hint="Ajuste para remodelaciones parciales." name="remodParcial" defaultValue={pc(a.remodelacion.parcial)} />
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
