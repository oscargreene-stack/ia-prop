'use client'
import { useState, useEffect, useRef } from 'react'

// ─── Estilos ─────────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a08;
    --surface: #131310;
    --surface2: #1c1c18;
    --border: #272722;
    --border2: #333330;
    --gold: #c8a96e;
    --gold-light: #e8cc9a;
    --gold-dim: #6b5a38;
    --gold-glow: rgba(200,169,110,0.12);
    --text: #f2ede4;
    --text2: #9e9888;
    --text3: #5a5650;
    --green: #5ab87a;
    --green-dim: #1a3325;
    --red: #d9604c;
    --red-dim: #391a16;
    --blue: #5a9fd4;
    --blue-dim: #152535;
    --chat-agent: #1a1a16;
    --chat-user: #1e1e1a;
  }

  html, body { height: 100%; }
  body {
    background: var(--bg);
    font-family: 'Outfit', sans-serif;
    color: var(--text);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* ── Landing ── */
  .landing {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    position: relative;
    overflow: hidden;
  }
  .landing::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 80% 60% at 50% 0%, rgba(200,169,110,0.07) 0%, transparent 70%);
    pointer-events: none;
  }
  .landing-logo {
    font-family: 'Playfair Display', serif;
    font-size: clamp(48px, 10vw, 80px);
    font-weight: 400;
    letter-spacing: -1px;
    line-height: 1;
    margin-bottom: 12px;
    text-align: center;
  }
  .landing-logo em { font-style: italic; color: var(--gold); }
  .landing-tagline {
    font-size: 14px;
    color: var(--text3);
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 64px;
    text-align: center;
  }
  .landing-cards {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    justify-content: center;
    max-width: 700px;
  }
  .landing-card {
    flex: 1;
    min-width: 260px;
    max-width: 320px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 36px 32px;
    cursor: pointer;
    transition: all 0.25s ease;
    text-align: left;
    position: relative;
    overflow: hidden;
  }
  .landing-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold-dim), transparent);
    opacity: 0;
    transition: opacity 0.25s;
  }
  .landing-card:hover { border-color: var(--gold-dim); transform: translateY(-3px); box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
  .landing-card:hover::before { opacity: 1; }
  .landing-card-icon { font-size: 32px; margin-bottom: 16px; }
  .landing-card-title {
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 400;
    color: var(--text);
    margin-bottom: 8px;
  }
  .landing-card-desc { font-size: 13px; color: var(--text3); line-height: 1.6; }
  .landing-card.disabled { opacity: 0.4; cursor: default; }
  .landing-card.disabled:hover { transform: none; border-color: var(--border); box-shadow: none; }
  .coming-soon {
    position: absolute;
    top: 16px; right: 16px;
    font-size: 9px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text3);
    background: var(--surface2);
    border: 1px solid var(--border);
    padding: 3px 8px;
    border-radius: 20px;
  }
  .landing-footer {
    position: absolute;
    bottom: 24px;
    font-size: 11px;
    color: var(--text3);
    letter-spacing: 1px;
  }

  /* ── Chat container ── */
  .chat-app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-width: 760px;
    margin: 0 auto;
  }

  /* ── Chat header ── */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .back-btn {
    width: 32px; height: 32px;
    border-radius: 50%;
    border: 1px solid var(--border2);
    background: transparent;
    color: var(--text2);
    font-size: 16px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .back-btn:hover { border-color: var(--gold-dim); color: var(--gold); }
  .agent-avatar {
    width: 40px; height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, #2a2520, #1a1810);
    border: 1px solid var(--gold-dim);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .agent-info {}
  .agent-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }
  .agent-status {
    font-size: 11px;
    color: var(--green);
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .status-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--green);
    animation: pulse 2s infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .chat-header-logo {
    margin-left: auto;
    font-family: 'Playfair Display', serif;
    font-size: 16px;
    color: var(--text3);
  }
  .chat-header-logo em { font-style: italic; color: var(--gold-dim); }

  /* ── Messages ── */
  .messages-area {
    flex: 1;
    overflow-y: auto;
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    scroll-behavior: smooth;
  }
  .messages-area::-webkit-scrollbar { width: 4px; }
  .messages-area::-webkit-scrollbar-track { background: transparent; }
  .messages-area::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

  /* ── Bubble ── */
  .msg {
    display: flex;
    gap: 10px;
    max-width: 85%;
    animation: fadeUp 0.3s ease;
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .msg.agent { align-self: flex-start; }
  .msg.user  { align-self: flex-end; flex-direction: row-reverse; }

  .msg-avatar {
    width: 30px; height: 30px;
    border-radius: 50%;
    background: linear-gradient(135deg, #2a2520, #1a1810);
    border: 1px solid var(--gold-dim);
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .bubble {
    padding: 13px 16px;
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.65;
    color: var(--text);
  }
  .msg.agent .bubble {
    background: var(--chat-agent);
    border: 1px solid var(--border);
    border-top-left-radius: 4px;
  }
  .msg.user .bubble {
    background: var(--gold-dim);
    border: 1px solid transparent;
    border-top-right-radius: 4px;
    color: var(--gold-light);
  }

  /* ── Typing indicator ── */
  .typing-dots {
    display: flex;
    gap: 4px;
    padding: 14px 18px;
    align-items: center;
  }
  .typing-dots span {
    width: 6px; height: 6px;
    background: var(--text3);
    border-radius: 50%;
    animation: bounce 1.2s infinite;
  }
  .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes bounce {
    0%,60%,100% { transform: translateY(0); }
    30% { transform: translateY(-6px); }
  }

  /* ── Opciones / respuestas rápidas ── */
  .options-area {
    padding: 12px 20px 20px;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
  .options-hint {
    font-size: 10px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--text3);
    margin-bottom: 10px;
  }
  .options-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .opt {
    padding: 9px 16px;
    border-radius: 24px;
    border: 1px solid var(--border2);
    background: var(--surface);
    color: var(--text2);
    font-size: 13px;
    font-family: 'Outfit', sans-serif;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .opt:hover { border-color: var(--gold-dim); color: var(--text); background: var(--surface2); }
  .opt.selected { background: var(--gold-dim); border-color: var(--gold); color: var(--gold-light); }
  .opt-icon { font-size: 16px; }

  /* ── Input de texto ── */
  .text-input-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }
  .chat-input {
    flex: 1;
    background: var(--surface2);
    border: 1px solid var(--border2);
    border-radius: 12px;
    padding: 12px 16px;
    color: var(--text);
    font-family: 'Outfit', sans-serif;
    font-size: 14px;
    outline: none;
    resize: none;
    min-height: 46px;
    max-height: 120px;
    line-height: 1.5;
    transition: border-color 0.15s;
  }
  .chat-input:focus { border-color: var(--gold-dim); }
  .chat-input::placeholder { color: var(--text3); }
  .send-btn {
    width: 46px; height: 46px;
    border-radius: 12px;
    border: none;
    background: var(--gold);
    color: var(--bg);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .send-btn:hover { background: var(--gold-light); }
  .send-btn:disabled { background: var(--gold-dim); cursor: not-allowed; }

  /* ── Tasación resultado ── */
  .tasacion-card {
    background: linear-gradient(135deg, #161410 0%, #1e1c16 100%);
    border: 1px solid var(--gold-dim);
    border-radius: 14px;
    padding: 22px;
    margin-top: 6px;
  }
  .tasacion-label {
    font-size: 9px;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: var(--gold-dim);
    margin-bottom: 6px;
  }
  .tasacion-valor {
    font-family: 'Playfair Display', serif;
    font-size: 38px;
    font-weight: 400;
    color: var(--gold-light);
    line-height: 1;
    margin-bottom: 4px;
  }
  .tasacion-rango { font-size: 12px; color: var(--text3); margin-bottom: 16px; }
  .tasacion-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
    margin-bottom: 14px;
  }
  .tasacion-item { background: rgba(255,255,255,0.03); border-radius: 8px; padding: 10px 12px; }
  .tasacion-item-label { font-size: 10px; color: var(--text3); margin-bottom: 3px; }
  .tasacion-item-val { font-size: 13px; color: var(--text); font-weight: 500; }
  .tasacion-item-val.pos { color: var(--green); }
  .tasacion-item-val.neg { color: var(--red); }
  .conf-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 12px;
  }
  .conf-alta { background: var(--green-dim); color: var(--green); border: 1px solid var(--green); }
  .conf-media { background: #2a2010; color: #d4a844; border: 1px solid #7a6020; }
  .conf-baja { background: var(--red-dim); color: var(--red); border: 1px solid var(--red); }
  .analisis-text {
    font-size: 12px;
    color: var(--text2);
    line-height: 1.7;
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .comp-mini { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
  .comp-mini-item {
    display: flex; justify-content: space-between; align-items: center;
    background: rgba(255,255,255,0.025);
    border-radius: 7px;
    padding: 8px 12px;
    font-size: 12px;
  }
  .comp-mini-addr { color: var(--text2); flex: 1; }
  .comp-mini-uf { color: var(--text); font-weight: 600; text-align: right; }
  .comp-mini-m2 { font-size: 10px; color: var(--text3); text-align: right; }

  /* ── SII card en chat ── */
  .sii-bubble {
    background: var(--blue-dim);
    border: 1px solid rgba(90,159,212,0.3);
    border-radius: 12px;
    padding: 14px 16px;
    margin-top: 6px;
  }
  .sii-bubble-tag {
    font-size: 9px;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: var(--blue);
    margin-bottom: 6px;
  }
  .sii-bubble-addr { font-size: 13px; color: var(--text); font-weight: 500; margin-bottom: 10px; }
  .sii-bubble-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .sii-bubble-item { background: rgba(255,255,255,0.04); border-radius: 6px; padding: 6px 10px; }
  .sii-bubble-label { font-size: 9px; color: var(--text3); margin-bottom: 1px; }
  .sii-bubble-val { font-size: 13px; color: var(--text); font-weight: 500; }

  /* ── Loader en bubble ── */
  .bubble-loader {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 0;
    font-size: 13px;
    color: var(--text3);
  }
  .bubble-spinner {
    width: 16px; height: 16px;
    border: 2px solid var(--border2);
    border-top-color: var(--gold);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Número + ── */
  .num-row { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
  .num-btn {
    width: 30px; height: 30px;
    border-radius: 50%;
    border: 1px solid var(--border2);
    background: var(--surface2);
    color: var(--text);
    font-size: 16px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
  }
  .num-btn:hover { border-color: var(--gold-dim); }
  .num-val { font-size: 18px; font-weight: 600; color: var(--text); min-width: 24px; text-align: center; }
  .num-unit { font-size: 12px; color: var(--text3); }

  @media (max-width: 600px) {
    .chat-app { height: 100dvh; }
    .landing-cards { flex-direction: column; align-items: center; }
    .tasacion-valor { font-size: 28px; }
  }
`

// ─── Ajustes ─────────────────────────────────────────────────────────────────
const AJUSTE_REMO = { alta: 20, media: 14, baja: 7, ninguna: 0 }
const AJUSTE_TIEMPO_REMO = { reciente: 1.0, hace3: 0.85, hace5: 0.7 }
const AJUSTE_PISCINA = 300
const AJUSTE_QUINCHO = 120
const AJUSTE_VISTA = 150
const AJUSTE_OTRO = 80

const fmtUF = (n) => n ? `${Number(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} UF` : '—'

// ─── Datos de flujo de conversación ──────────────────────────────────────────
const TIPOS_PROPIEDAD = [
  { id: 'casa',        label: 'Casa',        icon: '🏡' },
  { id: 'departamento',label: 'Departamento',icon: '🏢' },
  { id: 'oficina',     label: 'Oficina',     icon: '🏛️', disabled: true },
  { id: 'terreno',     label: 'Terreno',     icon: '🌿', disabled: true },
  { id: 'parcela',     label: 'Parcela',     icon: '🌄', disabled: true },
  { id: 'comercial',   label: 'Comercial',   icon: '🏪', disabled: true },
]

const COMUNAS_RM = [
  'Cerrillos','Cerro Navia','Conchalí','El Bosque','Estación Central',
  'Huechuraba','Independencia','La Cisterna','La Florida','La Granja',
  'La Pintana','La Reina','Las Condes','Lo Barnechea','Lo Espejo','Lo Prado',
  'Macul','Maipú','Ñuñoa','Peñalolén','Providencia','Pudahuel','Puente Alto',
  'Quilicura','Quinta Normal','Recoleta','Renca','San Bernardo','San Joaquín',
  'San Miguel','San Ramón','Santiago','Vitacura',
]

// ─── Componentes de mensajes ──────────────────────────────────────────────────
function AgentBubble({ children, typing }) {
  return (
    <div className="msg agent">
      <div className="msg-avatar">🤵</div>
      <div className="bubble">
        {typing
          ? <div className="typing-dots"><span /><span /><span /></div>
          : children}
      </div>
    </div>
  )
}

function UserBubble({ children }) {
  return (
    <div className="msg user">
      <div className="bubble">{children}</div>
    </div>
  )
}

// ─── Chat principal ───────────────────────────────────────────────────────────
function ChatVendedor({ onBack }) {
  const [messages, setMessages] = useState([])
  const [typing, setTyping] = useState(false)
  const [stage, setStage] = useState('greeting') // greeting > tipo > direccion > comuna > confirmar_sii > remodelacion > tiempo_remo > caracteristicas > precio_idea > tasando > resultado
  const [data, setData] = useState({
    tipo: null, direccion: null, comuna: 'Las Condes',
    siiData: null, remodelacion: null, tiempo_remo: null,
    caracteristicas: [], precio_idea: null,
    resultado: null,
  })
  const [inputVal, setInputVal] = useState('')
  const [inputMode, setInputMode] = useState(null) // 'text' | 'options' | 'multiselect' | null
  const [options, setOptions] = useState([])
  const [multiSelected, setMultiSelected] = useState([])
  const [showComuna, setShowComuna] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  const addAgent = (content, delay = 600) => new Promise(res => {
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      setMessages(m => [...m, { role: 'agent', content }])
      res()
    }, delay)
  })

  const addUser = (text) => {
    setMessages(m => [...m, { role: 'user', content: text }])
  }

  // ── Iniciar saludo ────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      await addAgent('¡Hola! ¿Cómo estás? Soy Valentina, tu agente inmobiliaria. 👋\n\nEstoy aquí para ayudarte a vender tu propiedad al mejor precio posible.\n\n¿Qué tipo de propiedad quieres vender?', 800)
      setInputMode('options')
      setOptions(TIPOS_PROPIEDAD)
      setStage('tipo')
    }
    init()
  }, [])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleOption = async (opt) => {
    if (opt.disabled) return
    addUser(opt.label)
    setInputMode(null)
    setOptions([])

    if (stage === 'tipo') {
      setData(d => ({ ...d, tipo: opt.id }))
      await addAgent(`Perfecto, una ${opt.label.toLowerCase()}. Excelente elección de propiedad para el mercado actual.\n\nPrimero necesito que me des la dirección exacta:`, 700)
      setInputMode('text')
      setInputVal('')
      setStage('direccion')

    } else if (stage === 'confirmar_sii') {
      if (opt.id === 'si') {
        await addAgent('Datos confirmados ✓\n\n¿Tu propiedad tiene alguna remodelación?', 600)
        setInputMode('options')
        setOptions([
          { id: 'alta', label: 'Sí — alta calidad', icon: '⭐' },
          { id: 'media', label: 'Sí — calidad media', icon: '✨' },
          { id: 'baja', label: 'Sí — terminaciones básicas', icon: '🔧' },
          { id: 'ninguna', label: 'No tiene remodelación', icon: '—' },
        ])
        setStage('remodelacion')
      } else {
        await addAgent('Sin problema. Dame la dirección correcta y la busco de nuevo:', 500)
        setInputMode('text')
        setInputVal(data.direccion || '')
        setStage('direccion')
      }

    } else if (stage === 'remodelacion') {
      setData(d => ({ ...d, remodelacion: opt.id }))
      if (opt.id !== 'ninguna') {
        addUser(opt.label)
        await addAgent('¿Hace cuánto tiempo fue la remodelación?', 600)
        setInputMode('options')
        setOptions([
          { id: 'reciente', label: 'Menos de 3 años', icon: '🆕' },
          { id: 'hace3', label: 'Entre 3 y 5 años', icon: '📅' },
          { id: 'hace5', label: 'Más de 5 años', icon: '⏳' },
        ])
        setStage('tiempo_remo')
      } else {
        await addAgent('Entendido.\n\n¿Tiene alguna característica especial que la haga destacar? Selecciona todo lo que aplique:', 600)
        setInputMode('multiselect')
        setMultiSelected([])
        setOptions([
          { id: 'piscina', label: 'Piscina', icon: '🏊' },
          { id: 'quincho', label: 'Quincho / BBQ', icon: '🔥' },
          { id: 'vista', label: 'Vista panorámica', icon: '🏔️' },
          { id: 'jardin', label: 'Jardín amplio', icon: '🌳' },
          { id: 'doble', label: 'Doble altura', icon: '⬆️' },
          { id: 'seguridad', label: 'Seguridad 24/7', icon: '🔐' },
          { id: 'ninguna', label: 'Ninguna en especial', icon: '—' },
        ])
        setStage('caracteristicas')
      }

    } else if (stage === 'tiempo_remo') {
      setData(d => ({ ...d, tiempo_remo: opt.id }))
      await addAgent('Anotado.\n\n¿Tiene alguna característica especial que la haga destacar? Selecciona todo lo que aplique:', 600)
      setInputMode('multiselect')
      setMultiSelected([])
      setOptions([
        { id: 'piscina', label: 'Piscina', icon: '🏊' },
        { id: 'quincho', label: 'Quincho / BBQ', icon: '🔥' },
        { id: 'vista', label: 'Vista panorámica', icon: '🏔️' },
        { id: 'jardin', label: 'Jardín amplio', icon: '🌳' },
        { id: 'doble', label: 'Doble altura', icon: '⬆️' },
        { id: 'seguridad', label: 'Seguridad 24/7', icon: '🔐' },
        { id: 'ninguna', label: 'Ninguna en especial', icon: '—' },
      ])
      setStage('caracteristicas')

    } else if (stage === 'precio_idea') {
      if (opt.id === 'tasar') {
        setData(d => ({ ...d, precio_idea: null }))
        await iniciarTasacion({ ...data, precio_idea: null })
      } else {
        setInputMode('text')
        setInputVal('')
        setStage('precio_idea_monto')
        await addAgent('¿Cuánto tienes en mente? (en UF o en pesos, como prefieras):', 400)
      }
    }
  }

  const handleMultiConfirm = async () => {
    const selected = multiSelected
    addUser(selected.length > 0 ? selected.map(s => options.find(o => o.id === s)?.label).join(', ') : 'Ninguna en especial')
    setInputMode(null)
    setData(d => ({ ...d, caracteristicas: selected }))

    await addAgent('Perfecto, ya tengo una buena imagen de tu propiedad.\n\n¿Tienes alguna idea del precio al que quisieras venderla? Si no, te ofrezco una **tasación gratuita** con datos reales del mercado.', 700)
    setInputMode('options')
    setOptions([
      { id: 'tasar', label: 'Sí, quiero una tasación gratuita', icon: '📊' },
      { id: 'tengo', label: 'Tengo un precio en mente', icon: '💭' },
    ])
    setStage('precio_idea')
  }

  const handleSend = async () => {
    const val = inputVal.trim()
    if (!val) return
    setInputVal('')
    setInputMode(null)

    if (stage === 'direccion') {
      addUser(val)
      setData(d => ({ ...d, direccion: val }))
      setShowComuna(true)
      await addAgent('¿En qué comuna?', 400)
      setInputMode('comuna')
      setStage('comuna')

    } else if (stage === 'comuna') {
      addUser(val)
      setData(d => ({ ...d, comuna: val }))
      setShowComuna(false)
      await fetchSII(data.direccion || '', val)

    } else if (stage === 'precio_idea_monto') {
      addUser(val)
      setData(d => ({ ...d, precio_idea: val }))
      await iniciarTasacion({ ...data, precio_idea: val })
    }
  }

  const fetchSII = async (dir, comuna) => {
    setMessages(m => [...m, {
      role: 'agent',
      content: { type: 'loading', text: 'Buscando tu propiedad en el SII y catastro…' }
    }])
    try {
      const q = encodeURIComponent(dir)
      const res = await fetch(`/api/sii?direccion=${q}&comuna=${encodeURIComponent(comuna)}`)
      const json = await res.json()
      const sii = json.resultados?.[0] || json

      setData(d => ({ ...d, siiData: sii }))
      setMessages(m => m.filter(msg => !(msg.role === 'agent' && msg.content?.type === 'loading')))

      setMessages(m => [...m, {
        role: 'agent',
        content: { type: 'sii', data: sii }
      }])

      await addAgent('¿Estos datos son correctos?', 400)
      setInputMode('options')
      setOptions([
        { id: 'si', label: 'Sí, son correctos', icon: '✅' },
        { id: 'no', label: 'No, quiero corregir', icon: '✏️' },
      ])
      setStage('confirmar_sii')

    } catch {
      setMessages(m => m.filter(msg => !(msg.role === 'agent' && msg.content?.type === 'loading')))
      const fallbackSii = { direccion: `${dir}, ${comuna}` }
      setData(d => ({ ...d, siiData: fallbackSii }))
      await addAgent('No pude conectarme al SII en este momento. Continuamos con la información que tengo.\n\n¿Tu propiedad tiene alguna remodelación?', 600)
      setInputMode('options')
      setOptions([
        { id: 'alta', label: 'Sí — alta calidad', icon: '⭐' },
        { id: 'media', label: 'Sí — calidad media', icon: '✨' },
        { id: 'baja', label: 'Sí — terminaciones básicas', icon: '🔧' },
        { id: 'ninguna', label: 'No tiene remodelación', icon: '—' },
      ])
      setStage('remodelacion')
    }
  }

  const iniciarTasacion = async (finalData) => {
    await addAgent('¡Excelente! Voy a calcular la tasación de tu propiedad ahora mismo. Dame un momento...', 500)
    setMessages(m => [...m, {
      role: 'agent',
      content: { type: 'loading', text: 'Consultando precios de venta reales en el CBR, analizando comparables y el plan regulador de la zona…' }
    }])
    setStage('tasando')

    try {
      const res = await fetch('/api/tasar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siiData: finalData.siiData,
          form: { direccion: finalData.direccion, depto: '', comuna: finalData.comuna },
          answers: {
            remodelacion: finalData.remodelacion || 'ninguna',
            conservacion: 'bueno',
            terraza_m2: 0,
            estacionamientos: 0,
            bodegas: 0,
          },
          extras: {
            tipo: finalData.tipo,
            caracteristicas: finalData.caracteristicas,
            tiempo_remo: finalData.tiempo_remo,
            precio_idea: finalData.precio_idea,
          }
        }),
      })
      const resultado = await res.json()
      if (resultado.error) throw new Error(resultado.error)

      setMessages(m => m.filter(msg => !(msg.role === 'agent' && msg.content?.type === 'loading')))

      // Calcular valor con ajustes
      const m2 = parseFloat(finalData.siiData?.m2_construido) || 0
      const ajRemo = (AJUSTE_REMO[finalData.remodelacion] || 0) * m2 * (AJUSTE_TIEMPO_REMO[finalData.tiempo_remo] || 1)
      const caract = finalData.caracteristicas || []
      const ajCar = (caract.includes('piscina') ? AJUSTE_PISCINA : 0)
                  + (caract.includes('quincho') ? AJUSTE_QUINCHO : 0)
                  + (caract.includes('vista') ? AJUSTE_VISTA : 0)
                  + (caract.includes('jardin') ? AJUSTE_OTRO : 0)
                  + (caract.includes('doble') ? AJUSTE_OTRO : 0)
                  + (caract.includes('seguridad') ? AJUSTE_OTRO/2 : 0)

      const valorBase = resultado.valor_uf || 0
      const ajTotal = Math.round(ajRemo + ajCar)
      const valorFinal = valorBase + ajTotal
      const rangoMin = Math.round(valorFinal * 0.93)
      const rangoMax = Math.round(valorFinal * 1.07)

      setMessages(m => [...m, {
        role: 'agent',
        content: {
          type: 'tasacion',
          resultado,
          valorFinal, rangoMin, rangoMax,
          ajRemo: Math.round(ajRemo), ajCar,
          valorBase, m2,
          tipo: finalData.tipo,
        }
      }])

      await addAgent(`La tasación está lista. El valor de mercado estimado de tu ${finalData.tipo} es **${fmtUF(valorFinal)}**.\n\nEste precio refleja las transacciones reales recientes en tu zona. Si tienes alguna pregunta sobre el resultado o quieres que ajustemos algún detalle, dime con confianza. 🏡`, 1200)

      setInputMode('options')
      setOptions([
        { id: 'nueva', label: 'Tasar otra propiedad', icon: '🔄' },
        { id: 'detalle', label: 'Quiero más detalle', icon: '🔍' },
      ])
      setStage('resultado')

    } catch (e) {
      setMessages(m => m.filter(msg => !(msg.role === 'agent' && msg.content?.type === 'loading')))
      await addAgent(`Hubo un problema al calcular la tasación: ${e.message}. ¿Intentamos de nuevo?`, 500)
      setInputMode('options')
      setOptions([
        { id: 'reintentar', label: 'Sí, intentar de nuevo', icon: '🔄' },
      ])
    }
  }

  // ── Render mensajes ───────────────────────────────────────────────────────
  const renderContent = (content) => {
    if (typeof content === 'string') {
      return content.split('\n').map((line, i) => (
        <span key={i}>
          {line.split(/\*\*(.*?)\*\*/g).map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
          {i < content.split('\n').length - 1 && <br />}
        </span>
      ))
    }
    if (content?.type === 'loading') {
      return (
        <div className="bubble-loader">
          <div className="bubble-spinner" />
          {content.text}
        </div>
      )
    }
    if (content?.type === 'sii') {
      const d = content.data
      return (
        <div className="sii-bubble">
          <div className="sii-bubble-tag">Datos SII · Verificados</div>
          <div className="sii-bubble-addr">{d.direccion}</div>
          <div className="sii-bubble-grid">
            {d.rol && <div className="sii-bubble-item"><div className="sii-bubble-label">ROL</div><div className="sii-bubble-val">{d.rol}</div></div>}
            {d.destino && <div className="sii-bubble-item"><div className="sii-bubble-label">Destino</div><div className="sii-bubble-val">{d.destino}</div></div>}
            {d.m2_construido && <div className="sii-bubble-item"><div className="sii-bubble-label">M² construidos</div><div className="sii-bubble-val">{d.m2_construido} m²</div></div>}
            {d.m2_terreno && <div className="sii-bubble-item"><div className="sii-bubble-label">M² terreno</div><div className="sii-bubble-val">{d.m2_terreno} m²</div></div>}
            {d.anio_construccion && <div className="sii-bubble-item"><div className="sii-bubble-label">Año construcción</div><div className="sii-bubble-val">{d.anio_construccion}</div></div>}
            {d.avaluo_fiscal_uf && <div className="sii-bubble-item"><div className="sii-bubble-label">Avalúo fiscal</div><div className="sii-bubble-val">{Math.round(d.avaluo_fiscal_uf).toLocaleString('es-CL')} UF</div></div>}
          </div>
        </div>
      )
    }
    if (content?.type === 'tasacion') {
      const { resultado, valorFinal, rangoMin, rangoMax, ajRemo, ajCar, valorBase } = content
      const conf = resultado.confianza?.toLowerCase()
      const confClass = conf?.includes('alta') ? 'conf-alta' : conf?.includes('media') ? 'conf-media' : 'conf-baja'
      return (
        <div className="tasacion-card">
          <div className="tasacion-label">Tasación de mercado</div>
          <div className="tasacion-valor">{fmtUF(valorFinal)}</div>
          <div className="tasacion-rango">Rango: {fmtUF(rangoMin)} — {fmtUF(rangoMax)}</div>
          <div className={`conf-badge ${confClass}`}>Confianza {resultado.confianza}</div>
          <div className="tasacion-grid">
            <div className="tasacion-item"><div className="tasacion-item-label">Base CBR</div><div className="tasacion-item-val">{fmtUF(valorBase)}</div></div>
            {ajRemo > 0 && <div className="tasacion-item"><div className="tasacion-item-label">Remodelación</div><div className="tasacion-item-val pos">+{fmtUF(ajRemo)}</div></div>}
            {ajCar > 0 && <div className="tasacion-item"><div className="tasacion-item-label">Características</div><div className="tasacion-item-val pos">+{fmtUF(ajCar)}</div></div>}
            {resultado.precio_m2 && <div className="tasacion-item"><div className="tasacion-item-label">Precio/m²</div><div className="tasacion-item-val">{resultado.precio_m2} UF/m²</div></div>}
          </div>
          {resultado.analisis && <div className="analisis-text">{resultado.analisis}</div>}
          {resultado.comparables?.length > 0 && (
            <div className="comp-mini">
              {resultado.comparables.slice(0, 3).map((c, i) => (
                <div key={i} className="comp-mini-item">
                  <div className="comp-mini-addr">{c.direccion} · {c.m2} m²</div>
                  <div>
                    <div className="comp-mini-uf">{fmtUF(c.precio_uf)}</div>
                    <div className="comp-mini-m2">{c.uf_m2} UF/m²</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <div className="chat-app">
      <div className="chat-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <div className="agent-avatar">🤵</div>
        <div className="agent-info">
          <div className="agent-name">Valentina · Agente Inmobiliaria</div>
          <div className="agent-status"><span className="status-dot" />En línea</div>
        </div>
        <div className="chat-header-logo">IA <em>Prop</em></div>
      </div>

      <div className="messages-area">
        {messages.map((msg, i) => (
          msg.role === 'agent'
            ? <AgentBubble key={i}>{renderContent(msg.content)}</AgentBubble>
            : <UserBubble key={i}>{msg.content}</UserBubble>
        ))}
        {typing && <AgentBubble typing />}
        <div ref={bottomRef} />
      </div>

      <div className="options-area">
        {inputMode === 'options' && (
          <>
            <div className="options-hint">Selecciona una opción</div>
            <div className="options-grid">
              {options.map(opt => (
                <button
                  key={opt.id}
                  className={`opt ${opt.disabled ? 'disabled' : ''}`}
                  onClick={() => !opt.disabled && handleOption(opt)}
                  disabled={opt.disabled}
                >
                  {opt.icon && <span className="opt-icon">{opt.icon}</span>}
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {inputMode === 'multiselect' && (
          <>
            <div className="options-hint">Selecciona todo lo que aplique</div>
            <div className="options-grid" style={{ marginBottom: 10 }}>
              {options.map(opt => (
                <button
                  key={opt.id}
                  className={`opt ${multiSelected.includes(opt.id) ? 'selected' : ''}`}
                  onClick={() => {
                    if (opt.id === 'ninguna') {
                      setMultiSelected(['ninguna'])
                    } else {
                      setMultiSelected(prev =>
                        prev.includes(opt.id)
                          ? prev.filter(x => x !== opt.id)
                          : [...prev.filter(x => x !== 'ninguna'), opt.id]
                      )
                    }
                  }}
                >
                  {opt.icon && <span className="opt-icon">{opt.icon}</span>}
                  {opt.label}
                </button>
              ))}
            </div>
            <button className="opt" style={{ background: 'var(--gold-dim)', borderColor: 'var(--gold)', color: 'var(--gold-light)', marginTop: 4 }} onClick={handleMultiConfirm}>
              Confirmar selección →
            </button>
          </>
        )}

        {(inputMode === 'text' || inputMode === 'comuna') && (
          <div className="text-input-row">
            {inputMode === 'comuna' ? (
              <>
                <select
                  className="chat-input"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  style={{ height: 46 }}
                >
                  <option value="">Selecciona una comuna…</option>
                  {COMUNAS_RM.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="send-btn" disabled={!inputVal} onClick={() => {
                  const val = inputVal
                  setInputVal('')
                  setInputMode(null)
                  addUser(val)
                  setData(d => ({ ...d, comuna: val }))
                  fetchSII(data.direccion || '', val)
                }}>→</button>
              </>
            ) : (
              <>
                <textarea
                  ref={inputRef}
                  className="chat-input"
                  placeholder="Escribe aquí…"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  rows={1}
                />
                <button className="send-btn" disabled={!inputVal.trim()} onClick={handleSend}>→</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Landing ──────────────────────────────────────────────────────────────────
export default function Home() {
  const [view, setView] = useState('landing') // landing | vendedor | comprador

  if (view === 'vendedor') return <><style dangerouslySetInnerHTML={{ __html: STYLES }} /><ChatVendedor onBack={() => setView('landing')} /></>

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="landing">
        <div className="landing-logo">IA <em>Prop</em></div>
        <div className="landing-tagline">Tu agente inmobiliario inteligente</div>

        <div className="landing-cards">
          <div className="landing-card" onClick={() => setView('vendedor')}>
            <div className="landing-card-icon">🏡</div>
            <div className="landing-card-title">Quiero vender</div>
            <div className="landing-card-desc">Tasa tu propiedad gratis con datos reales del mercado y recibe asesoría personalizada.</div>
          </div>

          <div className="landing-card disabled">
            <div className="coming-soon">Próximamente</div>
            <div className="landing-card-icon">🔍</div>
            <div className="landing-card-title">Quiero comprar</div>
            <div className="landing-card-desc">Cuéntanos qué buscas y te encontramos la propiedad perfecta con el mejor precio.</div>
          </div>
        </div>

        <div className="landing-footer">Región Metropolitana · Chile</div>
      </div>
    </>
  )
}
