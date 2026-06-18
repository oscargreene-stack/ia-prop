'use client'
import { useState, useEffect, useRef } from 'react'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtUF  = (n) => n ? `${Number(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} UF` : '—'
const fmtM2  = (n) => n ? `${Number(n).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m²` : '—'

// ─── Ajustes de tasación ──────────────────────────────────────────────────────
const AJUSTE_REMODELACION    = { alta: 20, media: 14, ninguna: 0 }
const AJUSTE_TERRAZA_FACTOR  = 0.4
const AJUSTE_ESTACIONAMIENTO = 250
const AJUSTE_BODEGA          = 80

// ─── Comunas RM ───────────────────────────────────────────────────────────────
const COMUNAS = [
  'Cerrillos','Cerro Navia','Conchalí','El Bosque','Estación Central',
  'Huechuraba','Independencia','La Cisterna','La Florida','La Granja',
  'La Pintana','La Reina','Las Condes','Lo Barnechea','Lo Espejo',
  'Lo Prado','Macul','Maipú','Ñuñoa','Peñalolén','Providencia',
  'Pudahuel','Puente Alto','Quilicura','Quinta Normal','Recoleta',
  'Renca','San Bernardo','San Joaquín','San Miguel','San Ramón',
  'Santiago','Vitacura',
]

// ─── Estilos globales ─────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;1,9..144,300&family=DM+Sans:wght@300;400;500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:#0f0f0d; --surface:#181815; --surface2:#211f1c; --border:#2e2c28;
    --border2:#3d3a34; --gold:#c9a84c; --gold-light:#e2c47a; --gold-dim:#7a6430;
    --text:#f0ede6; --text2:#a09a8e; --text3:#5c5750;
    --green:#4caf7d; --green-dim:#1e3b2c; --red:#e05c4b; --red-dim:#3b1e1a;
    --blue:#5b9bd5; --blue-dim:#1a2d3f;
  }
  body { background:var(--bg); font-family:'DM Sans',sans-serif; color:var(--text); min-height:100vh; }
  .app { max-width:900px; margin:0 auto; padding:32px 20px 80px; }
  .header { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:40px; padding-bottom:24px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:12px; }
  .logo-tag { font-size:10px; font-weight:500; letter-spacing:3px; text-transform:uppercase; color:var(--gold); margin-bottom:4px; }
  .logo-title { font-family:'Fraunces',serif; font-size:28px; font-weight:300; color:var(--text); line-height:1; }
  .logo-title em { font-style:italic; color:var(--gold-light); }
  .header-badge { font-size:11px; color:var(--text3); text-align:right; line-height:1.6; }
  .badge-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--green); margin-right:5px; vertical-align:middle; animation:pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .steps-bar { display:flex; margin-bottom:36px; }
  .step-item { flex:1; display:flex; align-items:center; gap:8px; padding:10px 14px; border:1px solid var(--border); border-right:none; background:var(--surface); transition:background .2s; }
  .step-item:first-child { border-radius:6px 0 0 6px; }
  .step-item:last-child { border-right:1px solid var(--border); border-radius:0 6px 6px 0; }
  .step-item.active { background:var(--surface2); border-color:var(--gold-dim); }
  .step-item.done { opacity:.6; }
  .step-num { width:20px; height:20px; border-radius:50%; border:1px solid var(--border2); display:flex; align-items:center; justify-content:center; font-size:10px; color:var(--text3); flex-shrink:0; }
  .step-item.active .step-num { border-color:var(--gold); color:var(--gold); }
  .step-item.done .step-num { border-color:var(--green); color:var(--green); background:var(--green-dim); }
  .step-label { font-size:11px; color:var(--text2); line-height:1.3; }
  .step-item.active .step-label { color:var(--text); }
  .card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:28px; margin-bottom:16px; }
  .card-title { font-family:'Fraunces',serif; font-size:18px; font-weight:300; color:var(--text); margin-bottom:6px; }
  .card-sub { font-size:12px; color:var(--text3); margin-bottom:24px; line-height:1.5; }
  .form-row { display:flex; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
  .form-group { display:flex; flex-direction:column; gap:5px; flex:1; min-width:160px; }
  .form-group.full { flex:100%; min-width:100%; }
  label { font-size:11px; color:var(--text3); letter-spacing:.5px; text-transform:uppercase; }
  input, select { background:var(--surface2); border:1px solid var(--border2); border-radius:6px; padding:10px 13px; color:var(--text); font-family:'DM Sans',sans-serif; font-size:14px; outline:none; transition:border-color .15s; }
  input:focus, select:focus { border-color:var(--gold-dim); }
  input::placeholder { color:var(--text3); }
  select option { background:#222; }
  .btn { padding:11px 24px; border-radius:6px; border:none; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; cursor:pointer; transition:all .15s; letter-spacing:.3px; }
  .btn-primary { background:var(--gold); color:#0f0f0d; }
  .btn-primary:hover { background:var(--gold-light); }
  .btn-primary:disabled { background:var(--gold-dim); color:var(--text3); cursor:not-allowed; }
  .btn-ghost { background:transparent; color:var(--text2); border:1px solid var(--border2); }
  .btn-ghost:hover { background:var(--surface2); color:var(--text); }
  .btn-row { display:flex; gap:10px; margin-top:20px; align-items:center; }
  .sii-card { background:var(--blue-dim); border:1px solid var(--blue); border-radius:8px; padding:16px 20px; margin-bottom:20px; }
  .sii-tag { font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--blue); margin-bottom:8px; font-weight:500; }
  .sii-address { font-size:14px; color:var(--text); font-weight:500; margin-bottom:12px; }
  .sii-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:8px; }
  .sii-item-label { font-size:10px; color:var(--text3); margin-bottom:2px; }
  .sii-item-val { font-size:14px; color:var(--text); font-weight:500; }
  .question-block { border:1px solid var(--border); border-radius:8px; padding:18px 20px; margin-bottom:12px; background:var(--surface2); }
  .question-title { font-size:13px; color:var(--text); font-weight:500; margin-bottom:4px; }
  .question-hint { font-size:11px; color:var(--text3); margin-bottom:14px; line-height:1.5; }
  .options-row { display:flex; gap:8px; flex-wrap:wrap; }
  .opt-btn { padding:7px 14px; border-radius:20px; border:1px solid var(--border2); background:transparent; color:var(--text2); font-size:12px; font-family:'DM Sans',sans-serif; cursor:pointer; transition:all .15s; }
  .opt-btn:hover { border-color:var(--gold-dim); color:var(--text); }
  .opt-btn.selected { background:var(--gold-dim); border-color:var(--gold); color:var(--gold-light); }
  .number-input-row { display:flex; align-items:center; gap:10px; }
  .num-btn { width:32px; height:32px; border-radius:50%; border:1px solid var(--border2); background:var(--surface); color:var(--text); font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all .15s; flex-shrink:0; }
  .num-btn:hover { border-color:var(--gold-dim); background:var(--surface2); }
  .num-val { font-size:18px; font-weight:500; color:var(--text); min-width:24px; text-align:center; }
  .num-unit { font-size:12px; color:var(--text3); }
  .loader-wrap { display:flex; flex-direction:column; align-items:center; padding:48px 0; gap:20px; }
  .loader-spinner { width:40px; height:40px; border:2px solid var(--border2); border-top-color:var(--gold); border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .loader-text { font-size:13px; color:var(--text3); }
  .loader-step { font-size:12px; color:var(--gold-dim); margin-top:4px; }
  .result-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:28px; flex-wrap:wrap; gap:16px; }
  .result-prop-name { font-family:'Fraunces',serif; font-size:22px; font-weight:300; color:var(--text); line-height:1.2; margin-bottom:4px; }
  .result-prop-meta { font-size:12px; color:var(--text3); }
  .confianza-badge { padding:5px 12px; border-radius:20px; font-size:11px; font-weight:500; letter-spacing:.5px; text-transform:uppercase; }
  .conf-alta { background:var(--green-dim); color:var(--green); border:1px solid var(--green); }
  .conf-media { background:#2a2010; color:#d4a844; border:1px solid #7a6020; }
  .conf-baja { background:var(--red-dim); color:var(--red); border:1px solid var(--red); }
  .valor-principal { background:linear-gradient(135deg,#1a1710 0%,#211f18 100%); border:1px solid var(--gold-dim); border-radius:10px; padding:28px; margin-bottom:16px; text-align:center; }
  .valor-label { font-size:11px; letter-spacing:2px; text-transform:uppercase; color:var(--gold-dim); margin-bottom:8px; }
  .valor-num { font-family:'Fraunces',serif; font-size:48px; font-weight:300; color:var(--gold-light); line-height:1; margin-bottom:6px; }
  .valor-range { font-size:13px; color:var(--text3); margin-bottom:12px; }
  .valor-m2 { font-size:14px; color:var(--text2); }
  .ajustes-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; margin-bottom:16px; }
  .ajuste-item { background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:12px 14px; }
  .ajuste-label { font-size:10px; color:var(--text3); margin-bottom:4px; text-transform:uppercase; }
  .ajuste-val { font-size:14px; color:var(--text); font-weight:500; }
  .ajuste-pos { color:var(--green); }
  .ajuste-neg { color:var(--red); }
  .plan-card { background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:18px 20px; margin-bottom:16px; }
  .plan-tag { font-size:9px; letter-spacing:2px; text-transform:uppercase; color:var(--text3); margin-bottom:10px; }
  .plan-zona { font-size:16px; color:var(--gold-light); font-weight:500; margin-bottom:10px; }
  .plan-row { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:5px; margin-bottom:5px; }
  .plan-row:last-child { border-bottom:none; padding-bottom:0; margin-bottom:0; }
  .plan-key { font-size:12px; color:var(--text3); }
  .plan-v { font-size:12px; color:var(--text); font-weight:500; }
  .comp-list { display:flex; flex-direction:column; gap:8px; }
  .comp-item { display:flex; justify-content:space-between; align-items:center; background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:12px 16px; gap:12px; }
  .comp-item.highlight { border-color:var(--gold-dim); background:#1a1810; }
  .comp-badge { font-size:10px; color:var(--gold); background:var(--gold-dim); padding:2px 8px; border-radius:10px; margin-bottom:4px; display:inline-block; }
  .comp-addr { font-size:13px; color:var(--text); }
  .comp-meta { font-size:11px; color:var(--text3); margin-top:2px; }
  .comp-uf { font-size:15px; color:var(--text); font-weight:600; text-align:right; }
  .comp-m2 { font-size:11px; color:var(--text3); text-align:right; margin-top:2px; }
  .analisis-box { background:var(--surface2); border-left:3px solid var(--gold-dim); border-radius:0 8px 8px 0; padding:16px 18px; font-size:13px; color:var(--text2); line-height:1.7; margin-bottom:16px; }
  .section-label { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:var(--text3); margin-bottom:10px; margin-top:24px; }
  .section-label:first-child { margin-top:0; }
  .error-box { background:var(--red-dim); border:1px solid var(--red); border-radius:8px; padding:14px 18px; font-size:13px; color:var(--red); }
  .reset-btn-wrap { margin-top:28px; text-align:center; }
  @media (max-width:600px) {
    .app { padding:20px 14px 60px; }
    .steps-bar { flex-direction:column; gap:4px; }
    .step-item { border-right:1px solid var(--border) !important; border-radius:6px !important; }
    .valor-num { font-size:36px; }
  }
`

// ─── Paso 1 ───────────────────────────────────────────────────────────────────
function Step1({ onNext }) {
  const [form, setForm] = useState({ direccion: '', depto: '', comuna: 'Las Condes' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="card">
      <div className="card-title">¿Cuál es la dirección de la propiedad?</div>
      <div className="card-sub">Buscamos los datos oficiales del SII para identificar y valorizar la propiedad.</div>
      <div className="form-row">
        <div className="form-group full">
          <label>Dirección</label>
          <input value={form.direccion} onChange={e => set('direccion', e.target.value)} placeholder="Ej: Av. Apoquindo 3000" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Depto / Casa / Oficina</label>
          <input value={form.depto} onChange={e => set('depto', e.target.value)} placeholder="Ej: DP 45B (opcional)" />
        </div>
        <div className="form-group">
          <label>Comuna</label>
          <select value={form.comuna} onChange={e => set('comuna', e.target.value)}>
            {COMUNAS.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="btn-row">
        <button className="btn btn-primary" disabled={!form.direccion.trim()} onClick={() => onNext(form)}>
          Buscar propiedad →
        </button>
      </div>
    </div>
  )
}

// ─── Paso 2 (selector múltiple) ───────────────────────────────────────────────
function Step2Selector({ candidatos, onSelect }) {
  return (
    <div className="card">
      <div className="card-title">Selecciona la unidad</div>
      <div className="card-sub">Se encontraron varias unidades. Elige la que corresponde.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {candidatos.map((c, i) => (
          <button key={i} className="btn btn-ghost" style={{ textAlign: 'left', padding: '12px 16px' }} onClick={() => onSelect(c)}>
            <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{c.direccion || c.rol}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
              {[c.destino, c.m2_construido && `${c.m2_construido} m²`, c.rol && `ROL ${c.rol}`].filter(Boolean).join(' · ')}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Paso 3 (preguntas) ───────────────────────────────────────────────────────
function Step3({ siiData, onNext }) {
  const esDpto = siiData?.destino?.toLowerCase().includes('depart') || siiData?.destino?.toLowerCase().includes('dpto')
  const [ans, setAns] = useState({ remodelacion: null, terraza_m2: 0, estacionamientos: 0, bodegas: 0, conservacion: null })
  const set = (k, v) => setAns(a => ({ ...a, [k]: v }))
  const ok = ans.remodelacion !== null && ans.conservacion !== null

  return (
    <div className="card">
      <div className="sii-card">
        <div className="sii-tag">Datos SII · Verificados</div>
        <div className="sii-address">{siiData?.direccion}</div>
        <div className="sii-grid">
          {siiData?.rol && <div className="sii-item"><div className="sii-item-label">ROL</div><div className="sii-item-val">{siiData.rol}</div></div>}
          {siiData?.destino && <div className="sii-item"><div className="sii-item-label">Destino</div><div className="sii-item-val">{siiData.destino}</div></div>}
          {siiData?.m2_construido && <div className="sii-item"><div className="sii-item-label">M² útiles</div><div className="sii-item-val">{siiData.m2_construido} m²</div></div>}
          {siiData?.m2_terreno && <div className="sii-item"><div className="sii-item-label">M² terreno</div><div className="sii-item-val">{siiData.m2_terreno} m²</div></div>}
          {siiData?.avaluo_fiscal_uf && <div className="sii-item"><div className="sii-item-label">Avalúo fiscal</div><div className="sii-item-val">{Math.round(siiData.avaluo_fiscal_uf).toLocaleString('es-CL')} UF</div></div>}
          {siiData?.anio_construccion && <div className="sii-item"><div className="sii-item-label">Año const.</div><div className="sii-item-val">{siiData.anio_construccion}</div></div>}
        </div>
      </div>

      <div className="card-title">Cuéntanos sobre la propiedad</div>
      <div className="card-sub">Esta información nos permite hacer una tasación más precisa que los datos del SII.</div>

      <div className="question-block">
        <div className="question-title">¿Está remodelada?</div>
        <div className="question-hint">Una remodelación de calidad puede aumentar el valor entre 10 y 20 UF/m² respecto al registro SII.</div>
        <div className="options-row">
          {[{v:'alta',l:'Sí, alta calidad (+20 UF/m²)'},{v:'media',l:'Sí, estándar (+14 UF/m²)'},{v:'ninguna',l:'No remodelada'}].map(o => (
            <button key={o.v} className={`opt-btn${ans.remodelacion===o.v?' selected':''}`} onClick={()=>set('remodelacion',o.v)}>{o.l}</button>
          ))}
        </div>
      </div>

      {esDpto && (
        <div className="question-block">
          <div className="question-title">¿Tiene terraza? ¿Cuántos m²?</div>
          <div className="question-hint">Los m² útiles del SII no incluyen terraza. Se valora a ~40% del precio/m² útil.</div>
          <div className="number-input-row">
            <button className="num-btn" onClick={()=>set('terraza_m2',Math.max(0,ans.terraza_m2-5))}>−</button>
            <span className="num-val">{ans.terraza_m2}</span>
            <span className="num-unit">m²</span>
            <button className="num-btn" onClick={()=>set('terraza_m2',ans.terraza_m2+5)}>+</button>
            {ans.terraza_m2===0&&<span style={{fontSize:12,color:'var(--text3)',marginLeft:8}}>Sin terraza</span>}
          </div>
        </div>
      )}

      {esDpto && (
        <div className="question-block">
          <div className="question-title">Estacionamientos incluidos</div>
          <div className="question-hint">Cada estacionamiento agrega aproximadamente 250 UF al valor.</div>
          <div className="number-input-row">
            <button className="num-btn" onClick={()=>set('estacionamientos',Math.max(0,ans.estacionamientos-1))}>−</button>
            <span className="num-val">{ans.estacionamientos}</span>
            <button className="num-btn" onClick={()=>set('estacionamientos',ans.estacionamientos+1)}>+</button>
            {ans.estacionamientos===0&&<span style={{fontSize:12,color:'var(--text3)',marginLeft:8}}>Sin estacionamiento</span>}
          </div>
        </div>
      )}

      {esDpto && (
        <div className="question-block">
          <div className="question-title">Bodegas incluidas</div>
          <div className="question-hint">Cada bodega agrega aproximadamente 80 UF al valor.</div>
          <div className="number-input-row">
            <button className="num-btn" onClick={()=>set('bodegas',Math.max(0,ans.bodegas-1))}>−</button>
            <span className="num-val">{ans.bodegas}</span>
            <button className="num-btn" onClick={()=>set('bodegas',ans.bodegas+1)}>+</button>
            {ans.bodegas===0&&<span style={{fontSize:12,color:'var(--text3)',marginLeft:8}}>Sin bodega</span>}
          </div>
        </div>
      )}

      <div className="question-block">
        <div className="question-title">Estado de conservación general</div>
        <div className="question-hint">Evaluación de terminaciones, instalaciones y estructura.</div>
        <div className="options-row">
          {[{v:'excelente',l:'Excelente'},{v:'bueno',l:'Bueno'},{v:'regular',l:'Regular'},{v:'deteriorado',l:'Deteriorado'}].map(o => (
            <button key={o.v} className={`opt-btn${ans.conservacion===o.v?' selected':''}`} onClick={()=>set('conservacion',o.v)}>{o.l}</button>
          ))}
        </div>
      </div>

      <div className="btn-row">
        <button className="btn btn-primary" disabled={!ok} onClick={()=>onNext(ans)}>
          Calcular tasación →
        </button>
        <span style={{fontSize:11,color:'var(--text3)'}}>{!ok?'Responde las preguntas obligatorias':'Listo para calcular'}</span>
      </div>
    </div>
  )
}

// ─── Loader ───────────────────────────────────────────────────────────────────
function Loader({ idx }) {
  const steps = ['Consultando SII y catastro…','Buscando comparables CBR…','Analizando plan regulador…','Calculando tasación final…']
  return (
    <div className="loader-wrap">
      <div className="loader-spinner" />
      <div className="loader-text">Procesando tasación</div>
      <div className="loader-step">{steps[idx % steps.length]}</div>
    </div>
  )
}

// ─── Resultado ────────────────────────────────────────────────────────────────
function Resultado({ resultado, siiData, answers, form, onReset }) {
  const conf = resultado.confianza?.toLowerCase()
  const confClass = conf?.includes('alta') ? 'conf-alta' : conf?.includes('media') ? 'conf-media' : 'conf-baja'
  const esDpto = siiData?.destino?.toLowerCase().includes('depart') || siiData?.destino?.toLowerCase().includes('dpto')
  const m2 = parseFloat(siiData?.m2_construido) || 0

  const ajRemo     = (AJUSTE_REMODELACION[answers.remodelacion] || 0) * m2
  const ajTerraza  = esDpto ? Math.round(answers.terraza_m2 * AJUSTE_TERRAZA_FACTOR * (resultado.precio_m2 || 50)) : 0
  const ajEstac    = answers.estacionamientos * AJUSTE_ESTACIONAMIENTO
  const ajBodega   = answers.bodegas * AJUSTE_BODEGA
  const ajConserv  = answers.conservacion==='deteriorado' ? -Math.round(m2*5) : answers.conservacion==='excelente' ? Math.round(m2*3) : 0

  const valorBase  = resultado.valor_uf || 0
  const ajTotal    = Math.round(ajRemo + ajTerraza + ajEstac + ajBodega + ajConserv)
  const valorFinal = valorBase + ajTotal
  const rangoMin   = Math.round(valorFinal * 0.93)
  const rangoMax   = Math.round(valorFinal * 1.07)
  const pm2Final   = m2 > 0 ? Math.round(valorFinal / m2) : null

  return (
    <div>
      <div className="result-header">
        <div>
          <div className="result-prop-name">{form.direccion}{form.depto ? `, ${form.depto}` : ''}</div>
          <div className="result-prop-meta">{form.comuna} · {siiData?.destino}{siiData?.m2_construido ? ` · ${siiData.m2_construido} m² útiles` : ''}</div>
        </div>
        <span className={`confianza-badge ${confClass}`}>{resultado.confianza || 'Media'}</span>
      </div>

      <div className="valor-principal">
        <div className="valor-label">Tasación de mercado</div>
        <div className="valor-num">{fmtUF(valorFinal)}</div>
        <div className="valor-range">Rango estimado: {fmtUF(rangoMin)} – {fmtUF(rangoMax)}</div>
        {pm2Final && <div className="valor-m2">{pm2Final.toLocaleString('es-CL')} UF/m²</div>}
      </div>

      <div className="section-label">Ajustes aplicados sobre comparables CBR</div>
      <div className="ajustes-grid">
        <div className="ajuste-item"><div className="ajuste-label">Base CBR</div><div className="ajuste-val">{fmtUF(valorBase)}</div></div>
        {ajRemo>0 && <div className="ajuste-item"><div className="ajuste-label">Remodelación</div><div className="ajuste-val ajuste-pos">+{fmtUF(Math.round(ajRemo))}</div></div>}
        {ajTerraza>0 && <div className="ajuste-item"><div className="ajuste-label">Terraza {answers.terraza_m2} m²</div><div className="ajuste-val ajuste-pos">+{fmtUF(ajTerraza)}</div></div>}
        {ajEstac>0 && <div className="ajuste-item"><div className="ajuste-label">Estac. ({answers.estacionamientos})</div><div className="ajuste-val ajuste-pos">+{fmtUF(ajEstac)}</div></div>}
        {ajBodega>0 && <div className="ajuste-item"><div className="ajuste-label">Bodegas ({answers.bodegas})</div><div className="ajuste-val ajuste-pos">+{fmtUF(ajBodega)}</div></div>}
        {ajConserv!==0 && <div className="ajuste-item"><div className="ajuste-label">Conservación</div><div className={`ajuste-val ${ajConserv>0?'ajuste-pos':'ajuste-neg'}`}>{ajConserv>0?'+':''}{fmtUF(ajConserv)}</div></div>}
        {ajTotal!==0 && <div className="ajuste-item" style={{borderColor:'var(--gold-dim)'}}><div className="ajuste-label">Total ajustes</div><div className={`ajuste-val ${ajTotal>0?'ajuste-pos':'ajuste-neg'}`}>{ajTotal>0?'+':''}{fmtUF(ajTotal)}</div></div>}
      </div>

      {resultado.plan_regulador && (
        <>
          <div className="section-label">Plan regulador · {form.comuna}</div>
          <div className="plan-card">
            <div className="plan-tag">Normativa vigente</div>
            {resultado.plan_regulador.zona && <div className="plan-zona">{resultado.plan_regulador.zona}</div>}
            <div>
              {resultado.plan_regulador.uso_suelo && <div className="plan-row"><span className="plan-key">Uso de suelo</span><span className="plan-v">{resultado.plan_regulador.uso_suelo}</span></div>}
              {resultado.plan_regulador.altura_max && <div className="plan-row"><span className="plan-key">Altura máxima</span><span className="plan-v">{resultado.plan_regulador.altura_max}</span></div>}
              {resultado.plan_regulador.coeficiente_constructibilidad && <div className="plan-row"><span className="plan-key">Coef. constructibilidad</span><span className="plan-v">{resultado.plan_regulador.coeficiente_constructibilidad}</span></div>}
              {resultado.plan_regulador.densidad_max && <div className="plan-row"><span className="plan-key">Densidad máxima</span><span className="plan-v">{resultado.plan_regulador.densidad_max}</span></div>}
            </div>
          </div>
        </>
      )}

      {resultado.analisis && (
        <>
          <div className="section-label">Análisis del agente</div>
          <div className="analisis-box">{resultado.analisis}</div>
        </>
      )}

      {resultado.comparables?.length > 0 && (
        <>
          <div className="section-label">Transacciones comparables · CBR ({resultado.comparables.length})</div>
          <div className="comp-list">
            {resultado.comparables.map((c, i) => (
              <div key={i} className={`comp-item${c.mismo_edificio?' highlight':''}`}>
                <div>
                  {c.mismo_edificio && <div className="comp-badge">★ Mismo edificio</div>}
                  <div className="comp-addr">{c.direccion}</div>
                  <div className="comp-meta">{c.m2} m² · {c.fecha}</div>
                </div>
                <div>
                  <div className="comp-uf">{fmtUF(c.precio_uf)}</div>
                  <div className="comp-m2">{c.uf_m2} UF/m²</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="reset-btn-wrap">
        <button className="btn btn-ghost" onClick={onReset}>← Tasar otra propiedad</button>
      </div>
    </div>
  )
}

// ─── App principal ─────────────────────────────────────────────────────────────
export default function IaProp() {
  const [step, setStep] = useState('direccion')
  const [form, setForm] = useState(null)
  const [siiData, setSiiData] = useState(null)
  const [candidatos, setCandidatos] = useState([])
  const [answers, setAnswers] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState(null)
  const [loaderIdx, setLoaderIdx] = useState(0)
  const timer = useRef(null)

  useEffect(() => {
    if (step === 'loading') { timer.current = setInterval(() => setLoaderIdx(i => i + 1), 1800) }
    else clearInterval(timer.current)
    return () => clearInterval(timer.current)
  }, [step])

  const stepIdx = { direccion:0, selector:0, preguntas:1, loading:2, resultado:3, error:3 }[step] ?? 0

  async function handleDireccion(f) {
    setForm(f)
    setStep('loading')
    setLoaderIdx(0)
    try {
      const q = encodeURIComponent(`${f.direccion}${f.depto ? ' ' + f.depto : ''}`)
      const res = await fetch(`/api/sii?direccion=${q}&comuna=${encodeURIComponent(f.comuna)}`)
      const data = await res.json()
      if (data.resultados?.length > 1) { setCandidatos(data.resultados); setStep('selector') }
      else { setSiiData(data.resultados?.[0] || data); setStep('preguntas') }
    } catch {
      setSiiData({ direccion: `${f.direccion}${f.depto?' '+f.depto:''}, ${f.comuna}` })
      setStep('preguntas')
    }
  }

  async function handlePreguntas(ans) {
    setAnswers(ans)
    setStep('loading')
    setLoaderIdx(0)
    try {
      const res = await fetch('/api/tasar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siiData, form, answers: ans }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResultado(data)
      setStep('resultado')
    } catch (e) {
      setError(e.message)
      setStep('error')
    }
  }

  function reset() {
    setStep('direccion'); setForm(null); setSiiData(null); setCandidatos([])
    setAnswers(null); setResultado(null); setError(null); setLoaderIdx(0)
  }

  const STEP_LABELS = [
    { n: 1, label: 'Dirección' },
    { n: 2, label: 'Detalles' },
    { n: 3, label: 'Procesando' },
    { n: 4, label: 'Tasación' },
  ]

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="app">
        <div className="header">
          <div>
            <div className="logo-tag">Agente Tasador</div>
            <div className="logo-title">IA <em>Prop</em></div>
          </div>
          <div className="header-badge">
            <span className="badge-dot" />CBR en tiempo real<br />
            Datos SII · Plan regulador
          </div>
        </div>

        <div className="steps-bar">
          {STEP_LABELS.map((s, i) => (
            <div key={s.n} className={`step-item${i===stepIdx?' active':i<stepIdx?' done':''}`}>
              <div className="step-num">{i < stepIdx ? '✓' : s.n}</div>
              <div className="step-label">{s.label}</div>
            </div>
          ))}
        </div>

        {step === 'direccion'  && <Step1 onNext={handleDireccion} />}
        {step === 'selector'   && <Step2Selector candidatos={candidatos} onSelect={s => { setSiiData(s); setStep('preguntas') }} />}
        {step === 'preguntas'  && <Step3 siiData={siiData} onNext={handlePreguntas} />}
        {step === 'loading'    && <Loader idx={loaderIdx} />}
        {step === 'resultado'  && resultado && <Resultado resultado={resultado} siiData={siiData} answers={answers} form={form} onReset={reset} />}
        {step === 'error'      && (
          <div>
            <div className="error-box">Error al calcular: {error}</div>
            <div className="reset-btn-wrap"><button className="btn btn-ghost" onClick={reset}>← Intentar nuevamente</button></div>
          </div>
        )}
      </div>
    </>
  )
}
