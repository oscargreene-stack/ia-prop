'use client'
import { useState, useEffect, useRef } from 'react'
import { valorizacionValentina, parseExpectativaUF } from './lib/valentina-valorizacion'

const fmtUF = (n) => n ? `${Number(n).toLocaleString('es-CL', {minimumFractionDigits:0,maximumFractionDigits:0})} UF` : '—'

// ─── Tipos de propiedad ─────────────────────────────────────────────────────
// v2 — agente comprador activo──
const TIPOS = [
  { id:'casa',         label:'Casa',         icon:'🏡' },
  { id:'departamento', label:'Departamento', icon:'🏢' },
  { id:'oficina',      label:'Oficina',      icon:'🏛️' },
  { id:'terreno',      label:'Terreno',      icon:'🌿' },
  { id:'parcela',      label:'Parcela',      icon:'🌄' },
  { id:'agricola',     label:'Agrícola',     icon:'🌾' },
  { id:'comercial',    label:'Comercial',    icon:'🏪' },
]

const COMUNAS_RM = ['Cerrillos','Cerro Navia','Conchalí','El Bosque','Estación Central','Huechuraba','Independencia','La Cisterna','La Florida','La Granja','La Pintana','La Reina','Las Condes','Lo Barnechea','Lo Espejo','Lo Prado','Macul','Maipú','Ñuñoa','Peñalolén','Providencia','Pudahuel','Puente Alto','Quilicura','Quinta Normal','Recoleta','Renca','San Bernardo','San Joaquín','San Miguel','San Ramón','Santiago','Vitacura']

// ─── Flujos por tipo ─────────────────────────────────────────────────────────
const FLUJOS = {
  casa: [
    { id:'remodelacion', msg:'¿Tu casa tiene alguna remodelación?', tipo:'options', opts:[
      {id:'alta',label:'Sí — alta calidad',icon:'⭐'},{id:'media',label:'Sí — calidad media',icon:'✨'},
      {id:'baja',label:'Sí — terminaciones básicas',icon:'🔧'},{id:'ninguna',label:'No tiene',icon:'—'}]},
    { id:'tiempo_remo', msg:'¿Hace cuánto fue la remodelación?', tipo:'options', condicional:'remodelacion!ninguna', opts:[
      {id:'reciente',label:'Menos de 3 años',icon:'🆕'},{id:'hace3',label:'3 a 5 años',icon:'📅'},{id:'hace5',label:'Más de 5 años',icon:'⏳'}]},
    { id:'caracteristicas', msg:'¿Tiene alguna característica especial? Selecciona todo lo que aplique:', tipo:'multi', opts:[
      {id:'piscina',label:'Piscina',icon:'🏊'},{id:'quincho',label:'Quincho / BBQ',icon:'🔥'},
      {id:'vista',label:'Vista panorámica',icon:'🏔️'},{id:'jardin',label:'Jardín grande',icon:'🌳'},
      {id:'doble_altura',label:'Doble altura',icon:'⬆️'},{id:'seguridad',label:'Seguridad 24/7',icon:'🔐'},
      {id:'ninguna',label:'Ninguna en especial',icon:'—'}]},
  ],
  departamento: [
    { id:'piso', msg:'¿En qué piso está el departamento?', tipo:'options', opts:[
      {id:'1_4',label:'Piso 1 al 4',icon:'🔽'},{id:'5_10',label:'Piso 5 al 10',icon:'🏙️'},
      {id:'11_20',label:'Piso 11 al 20',icon:'🌆'},{id:'21+',label:'Piso 21 o más',icon:'🌇'}]},
    { id:'orientacion', msg:'¿Cuál es la orientación principal?', tipo:'options', opts:[
      {id:'norte',label:'Norte',icon:'☀️'},{id:'sur',label:'Sur',icon:'🌤️'},
      {id:'oriente',label:'Oriente',icon:'🌅'},{id:'poniente',label:'Poniente',icon:'🌄'},{id:'mixta',label:'Mixta / No sé',icon:'🧭'}]},
    { id:'terraza_m2', msg:'¿Tiene terraza? ¿Cuántos m² tiene? (escribe 0 si no tiene)', tipo:'text', placeholder:'Ej: 0 / 8 / 12 / 20'},
    { id:'estacionamientos', msg:'¿Cuántos estacionamientos incluye?', tipo:'text', placeholder:'Ej: 0 / 1 / 2'},
    { id:'bodega', msg:'¿Cuántas bodegas incluye?', tipo:'text', placeholder:'Ej: 0 / 1 / 2'},
    { id:'jardin_m2', msg:'¿Tiene jardín o patio privado? ¿Cuántos m² tiene? (escribe 0 si no tiene)', tipo:'text', placeholder:'Ej: 0 / 15 / 30 / 50'},
    { id:'remodelacion', msg:'¿El departamento tiene alguna remodelación?', tipo:'options', opts:[
      {id:'alta',label:'Sí — alta calidad',icon:'⭐'},{id:'media',label:'Sí — calidad media',icon:'✨'},
      {id:'baja',label:'Sí — básica',icon:'🔧'},{id:'ninguna',label:'No tiene',icon:'—'}]},
    { id:'caracteristicas', msg:'¿Tiene alguna de estas características?', tipo:'multi', opts:[
      {id:'vista_despejada',label:'Vista despejada',icon:'👁️'},{id:'piscina_edificio',label:'Piscina edificio',icon:'🏊'},
      {id:'gimnasio',label:'Gimnasio',icon:'💪'},{id:'conserje',label:'Conserje 24/7',icon:'🔐'},
      {id:'calefaccion',label:'Calefacción central',icon:'🔥'},{id:'ninguna',label:'Ninguna',icon:'—'}]},
  ],
  oficina: [
    { id:'estado', msg:'¿Cuál es el estado actual de la oficina?', tipo:'options', opts:[
      {id:'nuevo',label:'A estrenar / Nueva',icon:'✨'},{id:'bueno',label:'Buen estado',icon:'👍'},
      {id:'regular',label:'Estado regular',icon:'🔧'},{id:'deteriorado',label:'Necesita renovación',icon:'⚠️'}]},
    { id:'division', msg:'¿Cómo está organizado el espacio?', tipo:'options', opts:[
      {id:'abierta',label:'Open space / Abierta',icon:'🏞️'},{id:'dividida',label:'Oficinas divididas',icon:'🚪'},
      {id:'mixta',label:'Mixta',icon:'🔀'}]},
    { id:'acceso', msg:'¿Qué tipo de acceso tiene el edificio?', tipo:'options', opts:[
      {id:'recepcion',label:'Recepción y conserje',icon:'🤵'},{id:'conserje',label:'Solo conserje',icon:'🔑'},
      {id:'libre',label:'Acceso libre',icon:'🚪'}]},
    { id:'estacionamientos', msg:'¿Cuántos estacionamientos incluye?', tipo:'options', opts:[
      {id:'0',label:'Sin estacionamiento',icon:'—'},{id:'1_2',label:'1 a 2',icon:'🚗'},
      {id:'3_5',label:'3 a 5',icon:'🅿️'},{id:'6+',label:'6 o más',icon:'🏢'}]},
    { id:'caracteristicas', msg:'¿Tiene alguna de estas características?', tipo:'multi', opts:[
      {id:'terraza',label:'Terraza',icon:'🌿'},{id:'sala_reuniones',label:'Sala de reuniones',icon:'📋'},
      {id:'datacenter',label:'Sala de servidores',icon:'💻'},{id:'cafeteria',label:'Cafetería en edificio',icon:'☕'},
      {id:'certificacion',label:'Certificación LEED/CES',icon:'🌱'},{id:'ninguna',label:'Ninguna',icon:'—'}]},
  ],
  terreno: [
    { id:'superficie', msg:'¿Cuál es la superficie aproximada del terreno?', tipo:'options', opts:[
      {id:'<500',label:'Menos de 500 m²',icon:'📐'},{id:'500_1000',label:'500 a 1.000 m²',icon:'📏'},
      {id:'1000_2000',label:'1.000 a 2.000 m²',icon:'🗺️'},{id:'2000_5000',label:'2.000 a 5.000 m²',icon:'🌿'},
      {id:'>5000',label:'Más de 5.000 m²',icon:'🏞️'}]},
    { id:'topografia', msg:'¿Cuál es la topografía del terreno?', tipo:'options', opts:[
      {id:'plano',label:'Plano',icon:'➖'},{id:'leve',label:'Leve pendiente',icon:'📐'},
      {id:'pronunciado',label:'Pendiente pronunciada',icon:'⛰️'},{id:'irregular',label:'Topografía irregular',icon:'🌄'}]},
    { id:'orientacion', msg:'¿Cuál es la orientación predominante?', tipo:'options', opts:[
      {id:'norte',label:'Norte',icon:'☀️'},{id:'sur',label:'Sur',icon:'🌤️'},
      {id:'oriente',label:'Oriente',icon:'🌅'},{id:'poniente',label:'Poniente',icon:'🌄'},{id:'no_se',label:'No sé',icon:'🧭'}]},
    { id:'urbanizado', msg:'¿El terreno está urbanizado? (Servicios básicos)', tipo:'options', opts:[
      {id:'completo',label:'Sí — agua, luz y alcantarillado',icon:'✅'},{id:'parcial',label:'Parcialmente urbanizado',icon:'⚡'},
      {id:'no',label:'Sin urbanizar',icon:'🌿'}]},
    { id:'acceso', msg:'¿Cómo es el acceso al terreno?', tipo:'options', opts:[
      {id:'pavimentado',label:'Calle pavimentada',icon:'🛣️'},{id:'ripio',label:'Camino de ripio',icon:'🪨'},
      {id:'tierra',label:'Camino de tierra',icon:'🌱'}]},
    { id:'uso_suelo', msg:'¿Cuál es el uso de suelo autorizado?', tipo:'options', opts:[
      {id:'residencial',label:'Residencial',icon:'🏡'},{id:'comercial',label:'Comercial',icon:'🏪'},
      {id:'industrial',label:'Industrial',icon:'🏭'},{id:'mixto',label:'Mixto',icon:'🔀'},
      {id:'no_se',label:'No sé / Sin info',icon:'❓'}]},
    { id:'caracteristicas', msg:'¿Tiene alguna característica especial?', tipo:'multi', opts:[
      {id:'vista',label:'Vista panorámica',icon:'🏔️'},{id:'rio_lago',label:'Río / Lago / Laguna',icon:'💧'},
      {id:'arboles',label:'Arbolado / Vegetación',icon:'🌳'},{id:'construccion',label:'Construcción existente',icon:'🏚️'},
      {id:'cerco',label:'Cerco / Muralla',icon:'🧱'},{id:'ninguna',label:'Sin características',icon:'—'}]},
  ],
  parcela: [
    { id:'superficie_ha', msg:'¿Cuántas hectáreas tiene la parcela?', tipo:'options', opts:[
      {id:'<0.5',label:'Menos de 0,5 ha',icon:'📐'},{id:'0.5_1',label:'0,5 a 1 ha',icon:'🌿'},
      {id:'1_3',label:'1 a 3 ha',icon:'🌾'},{id:'3_10',label:'3 a 10 ha',icon:'🏞️'},{id:'>10',label:'Más de 10 ha',icon:'🗺️'}]},
    { id:'tiene_casa', msg:'¿La parcela tiene casa o construcción habitada?', tipo:'options', opts:[
      {id:'si_nueva',label:'Sí, casa nueva / buena',icon:'🏡'},{id:'si_regular',label:'Sí, casa en estado regular',icon:'🏠'},
      {id:'no',label:'Sin construcción',icon:'🌿'}]},
    { id:'agua', msg:'¿Cuál es la fuente de agua?', tipo:'options', opts:[
      {id:'red',label:'Red de agua potable',icon:'🚰'},{id:'pozo',label:'Pozo / Noria',icon:'⛏️'},
      {id:'acequia',label:'Acequia / Canal',icon:'💧'},{id:'multiple',label:'Más de una fuente',icon:'✅'},
      {id:'sin_agua',label:'Sin agua',icon:'❌'}]},
    { id:'topografia', msg:'¿Cómo es el terreno?', tipo:'options', opts:[
      {id:'plano',label:'Plano',icon:'➖'},{id:'leve',label:'Suave pendiente',icon:'📐'},
      {id:'cerros',label:'Cerros / Quebradas',icon:'⛰️'},{id:'mixto',label:'Mixto',icon:'🌄'}]},
    { id:'vegetacion', msg:'¿Qué vegetación tiene?', tipo:'options', opts:[
      {id:'sin',label:'Sin vegetación',icon:'🌵'},{id:'pastizal',label:'Pastizal / Prado',icon:'🌿'},
      {id:'frutales',label:'Frutales',icon:'🍎'},{id:'nativo',label:'Bosque nativo',icon:'🌳'},
      {id:'eucaliptus',label:'Eucaliptus / Pino',icon:'🌲'}]},
    { id:'acceso', msg:'¿Cómo es el acceso a la parcela?', tipo:'options', opts:[
      {id:'pavimentado',label:'Camino pavimentado',icon:'🛣️'},{id:'ripio',label:'Camino de ripio',icon:'🪨'},
      {id:'tierra',label:'Camino de tierra',icon:'🌱'}]},
    { id:'caracteristicas', msg:'¿Tiene algún elemento de valor especial?', tipo:'multi', opts:[
      {id:'vista',label:'Vista panorámica / cordillera',icon:'🏔️'},{id:'rio',label:'Río / Estero',icon:'🏞️'},
      {id:'luz',label:'Luz eléctrica',icon:'⚡'},{id:'cerco',label:'Cerco perimetral',icon:'🧱'},
      {id:'galpones',label:'Galpones / Bodegas',icon:'🏚️'},{id:'piscina',label:'Piscina / Estanque',icon:'💦'},
      {id:'ninguna',label:'Ninguna',icon:'—'}]},
  ],
  agricola: [
    { id:'superficie_ha', msg:'¿Cuántas hectáreas tiene la propiedad agrícola?', tipo:'options', opts:[
      {id:'<5',label:'Menos de 5 ha',icon:'🌱'},{id:'5_20',label:'5 a 20 ha',icon:'🌾'},
      {id:'20_50',label:'20 a 50 ha',icon:'🏞️'},{id:'50_200',label:'50 a 200 ha',icon:'🗺️'},
      {id:'>200',label:'Más de 200 ha',icon:'🌍'}]},
    { id:'clase_suelo', msg:'¿Conoces la clase de suelo? (capacidad productiva)', tipo:'options', opts:[
      {id:'ri_rii',label:'Clase I y II — Alta productividad',icon:'⭐'},{id:'riii_riv',label:'Clase III y IV — Media productividad',icon:'✨'},
      {id:'rv_rvi',label:'Clase V y VI — Baja productividad',icon:'🌿'},{id:'no_se',label:'No sé / Sin clasificación',icon:'❓'}]},
    { id:'derechos_agua', msg:'¿Tiene derechos de agua?', tipo:'options', opts:[
      {id:'si_canal',label:'Sí — Canal de regadío',icon:'💧'},{id:'si_pozo',label:'Sí — Pozo profundo',icon:'⛏️'},
      {id:'si_multiple',label:'Sí — Canal + Pozo',icon:'✅'},{id:'lluvia',label:'Solo agua de lluvia (secano)',icon:'🌧️'},
      {id:'no',label:'Sin derechos de agua',icon:'❌'}]},
    { id:'litros_seg', msg:'¿Cuántos litros por segundo tiene asegurados?', tipo:'options', condicional:'derechos_agua!lluvia,no', opts:[
      {id:'<5',label:'Menos de 5 l/s',icon:'💧'},{id:'5_20',label:'5 a 20 l/s',icon:'💦'},
      {id:'20_50',label:'20 a 50 l/s',icon:'🌊'},{id:'>50',label:'Más de 50 l/s',icon:'🏞️'}]},
    { id:'plantacion', msg:'¿Qué tipo de plantación o cultivo tiene actualmente?', tipo:'options', opts:[
      {id:'sin',label:'Sin plantación / Barbecho',icon:'🌵'},{id:'frutales',label:'Frutales',icon:'🍎'},
      {id:'vinas',label:'Viñas / Parrones',icon:'🍇'},{id:'cereales',label:'Cereales / Hortalizas',icon:'🌾'},
      {id:'forestal',label:'Forestal (eucaliptus/pino)',icon:'🌲'},{id:'ganadero',label:'Ganadería / Praderas',icon:'🐄'}]},
    { id:'variedad_edad', msg:'¿Qué variedad y edad tienen aproximadamente las plantaciones?', tipo:'text', condicional:'plantacion!sin', placeholder:'Ej: Manzanos Fuji de 15 años, uvas Cabernet de 8 años...'},
    { id:'infraestructura', msg:'¿Qué infraestructura tiene la propiedad?', tipo:'multi', opts:[
      {id:'casa',label:'Casa habitación',icon:'🏡'},{id:'bodega',label:'Bodega / Packing',icon:'🏚️'},
      {id:'galpon',label:'Galpón maquinaria',icon:'🔧'},{id:'camara_frio',label:'Cámara de frío',icon:'❄️'},
      {id:'riego_tecnificado',label:'Riego tecnificado (goteo/microjet)',icon:'💧'},
      {id:'sin_inf',label:'Sin infraestructura relevante',icon:'—'}]},
    { id:'acceso', msg:'¿Cómo es el acceso a la propiedad?', tipo:'options', opts:[
      {id:'pavimentado',label:'Pavimentado hasta el ingreso',icon:'🛣️'},{id:'ripio',label:'Camino de ripio',icon:'🪨'},
      {id:'tierra',label:'Camino de tierra',icon:'🌱'}]},
  ],
  comercial: [
    { id:'subtipo', msg:'¿Qué tipo de propiedad comercial es?', tipo:'options', opts:[
      {id:'local',label:'Local comercial',icon:'🏪'},{id:'bodega',label:'Bodega / Galpón',icon:'🏭'},
      {id:'strip_center',label:'Strip center / Mall strip',icon:'🏬'},{id:'edificio',label:'Edificio completo',icon:'🏢'},
      {id:'nave',label:'Nave industrial',icon:'🏗️'}]},
    { id:'estado', msg:'¿Cuál es el estado actual?', tipo:'options', opts:[
      {id:'nuevo',label:'A estrenar',icon:'✨'},{id:'bueno',label:'Buen estado',icon:'👍'},
      {id:'regular',label:'Estado regular',icon:'🔧'},{id:'remodelacion',label:'Requiere remodelación',icon:'⚠️'}]},
    { id:'arrendado', msg:'¿La propiedad está arrendada actualmente?', tipo:'options', opts:[
      {id:'si',label:'Sí, está arrendada',icon:'✅'},{id:'no',label:'No está arrendada',icon:'—'}]},
    { id:'renta_mensual', msg:'¿Cuánto recibe de arriendo mensual (en UF o $)?', tipo:'text', condicional:'arrendado!no', placeholder:'Ej: 50 UF mensuales / $800.000 mensual'},
    { id:'estacionamientos', msg:'¿Cuántos estacionamientos tiene?', tipo:'options', opts:[
      {id:'0',label:'Sin estacionamiento',icon:'—'},{id:'1_5',label:'1 a 5',icon:'🚗'},
      {id:'6_20',label:'6 a 20',icon:'🅿️'},{id:'>20',label:'Más de 20',icon:'🏢'}]},
    { id:'caracteristicas', msg:'¿Tiene alguna de estas características?', tipo:'multi', opts:[
      {id:'acceso_camion',label:'Acceso para camiones',icon:'🚛'},{id:'anden',label:'Andén de carga',icon:'🏗️'},
      {id:'frigorificos',label:'Cámaras frigoríficas',icon:'❄️'},{id:'oficinas',label:'Oficinas integradas',icon:'🖥️'},
      {id:'tres_fase',label:'Corriente trifásica',icon:'⚡'},{id:'ninguna',label:'Ninguna',icon:'—'}]},
  ],
}

// ─── Ajustes de tasación ──────────────────────────────────────────────────────
const AJUSTE_REMO = { alta:15, media:10, baja:5, ninguna:0 } // UF/m² sobre m² útiles
const AJUSTE_JARDIN_POR_M2 = 0.35 // Factor sobre precio/m² útil — jardín vale ~35% del precio/m² construido
const AJUSTE_TIEMPO = { reciente:1.0, hace3:0.85, hace5:0.7 }
const AJUSTES_CARACT = {
  piscina:300, quincho:120, vista:150, jardin:80, doble_altura:100, seguridad:40,
  vista_despejada:100, piscina_edificio:80, gimnasio:40, conserje:30, calefaccion:50,
  terraza_of:80, sala_reuniones:60,
  rio_lago:200, arboles:60, construccion:150,
  rio:150, galpones:100, luz:80,
  si_canal:300, si_pozo:200, si_multiple:400,
  bodega:80, galpon:120, camara_frio:200, riego_tecnificado:300,
  acceso_camion:150, anden:100, frigorificos:200, tres_fase:100,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calcAjustes(data) {
  // Usar m² útiles para remodelación (lo que el dueño remodeló), m² construidos para base
  const m2Util  = parseFloat(data.siiData?.m2_util || data.siiData?.m2_construido) || 60
  const m2Total = parseFloat(data.siiData?.m2_construido) || m2Util
  const ajRemo = (AJUSTE_REMO[data.remodelacion] || 0) * m2Util * (AJUSTE_TIEMPO[data.tiempo_remo] || 1)
  const caract = [
    ...(data.caracteristicas || []),
    data.derechos_agua || '',
    data.infraestructura || '',
  ].flat()
  const ajCar = caract.reduce((s, c) => s + (AJUSTES_CARACT[c] || 0), 0)
  // Jardín: valorizado a 35% del precio/m² útil estimado (default 50 UF/m²)
  const jardınM2 = parseFloat(data.jardin_m2) || 0
  const precioM2Ref = 50 // UF/m² de referencia si no hay datos SII
  const ajJardin = jardınM2 > 0 ? Math.round(jardınM2 * precioM2Ref * AJUSTE_JARDIN_POR_M2) : 0
  return { ajRemo: Math.round(ajRemo), ajCar, ajJardin }
}

// ─── Componentes de mensajes ──────────────────────────────────────────────────
function AgentBubble({ children, typing }) {
  return (
    <div className="msg agent">
      <div className="msg-avatar">🤵</div>
      <div className="bubble">
        {typing ? <div className="typing-dots"><span/><span/><span/></div> : children}
      </div>
    </div>
  )
}
function UserBubble({ children }) {
  return <div className="msg user"><div className="bubble">{children}</div></div>
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
function ChatVendedor({ onBack }) {
  const [messages, setMessages] = useState([])
  const [typing, setTyping] = useState(false)
  const [stage, setStage] = useState('greeting')
  const [data, setData] = useState({})
  const [flujoIdx, setFlujoIdx] = useState(0)
  const [inputMode, setInputMode] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [options, setOptions] = useState([])
  const [multiSel, setMultiSel] = useState([])
  const [deptoVal, setDeptoVal] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const [searchTab, setSearchTab] = useState('direccion')
  const [placesResult, setPlacesResult] = useState(null) // {calle, numero, comunaNorm, fullAddress}
  const [comunaForm, setComunaForm] = useState('')
  const [ventasTasacion, setVentasTasacion] = useState(null)
  const [ofertasTasacion, setOfertasTasacion] = useState(null)
  const [vistaTas, setVistaTas] = useState('ventas')
  const [ofTasLoading, setOfTasLoading] = useState(false)
  const [tasBody, setTasBody] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, typing])

  // Google Places Autocomplete para campo de dirección
  useEffect(() => {
    if (stage !== 'direccion' || searchTab !== 'direccion') return
    const GKEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
    if (!GKEY || typeof window === 'undefined') return
    function initAC() {
      const input = document.getElementById('places-input')
      if (!input || input._acInit) return
      input._acInit = true
      const ac = new window.google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: 'cl' },
        fields: ['address_components', 'formatted_address'],
        types: ['address'],
      })
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (!place.address_components) return
        let streetName = '', streetNumber = '', comunaLong = ''
        for (const c of place.address_components) {
          if (c.types.includes('route'))            streetName   = c.long_name
          if (c.types.includes('street_number'))    streetNumber = c.long_name
          if (c.types.includes('locality') || c.types.includes('administrative_area_level_3'))
            comunaLong = c.long_name
        }
        const nfd = s => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/Ñ/g,'N').replace(/ñ/g,'N').trim()
        setPlacesResult({ calle: nfd(streetName), numero: streetNumber, comunaNorm: nfd(comunaLong), fullAddress: place.formatted_address })
        const calleNumero = [streetName, streetNumber].filter(Boolean).join(' ').trim(); setInputVal(calleNumero || place.formatted_address); const comunaMatch = COMUNAS_RM.find(c => nfd(c) === nfd(comunaLong)); if (comunaMatch) setComunaForm(comunaMatch);
      })
    }
    if (window.google?.maps?.places) { initAC(); return }
    // Usar el loader único (places + drawing). Cargar Google Maps con
    // distintos sets de librerías rompe la API ("included multiple times").
    fcLoadGmaps().then(() => { if (window.google?.maps?.places) initAC() })
  }, [stage, searchTab])

  const addAgent = (content, delay=600) => new Promise(res => {
    setTyping(true)
    setTimeout(() => { setTyping(false); setMessages(m => [...m, { role:'agent', content }]); res() }, delay)
  })
  const addUser = (text) => setMessages(m => [...m, { role:'user', content:text }])

  // Inicio
  useEffect(() => {
    const init = async () => {
      await addAgent('¡Hola! ¿Cómo estás? Soy Valentina, tu agente inmobiliaria 👋\n\nEstoy aquí para ayudarte a vender tu propiedad al mejor precio posible.\n\n¿Qué tipo de propiedad quieres vender?', 800)
      setInputMode('options')
      setOptions(TIPOS)
      setStage('tipo')
    }
    init()
  }, [])

  // Avanzar al siguiente paso del flujo
  const nextStep = async (currentData, idx) => {
    const tipo = currentData.tipo
    const flujo = FLUJOS[tipo] || []

    // Buscar siguiente paso válido (respetando condicionales)
    let nextIdx = idx
    while (nextIdx < flujo.length) {
      const paso = flujo[nextIdx]
      if (paso.condicional) {
        const [field, valStr] = paso.condicional.split('!')
        const validos = valStr.split(',')
        const val = currentData[field]
        if (validos.includes(val)) { nextIdx++; continue } // saltar
      }
      break
    }

    if (nextIdx >= flujo.length) {
      // Fin del flujo → precio idea
      await addAgent('Ya tengo una buena imagen de tu propiedad.\n\n¿Tienes alguna idea del precio al que quisieras venderla? Si no, te ofrezco una **tasación gratuita** con datos reales del mercado.', 700)
      setInputMode('options')
      setOptions([
        {id:'tasar',label:'Quiero una tasación gratuita',icon:'📊'},
        {id:'tengo',label:'Tengo un precio en mente',icon:'💭'},
      ])
      setStage('precio_idea')
      return
    }

    const paso = flujo[nextIdx]
    setFlujoIdx(nextIdx + 1)
    await addAgent(paso.msg, 600)

    if (paso.tipo === 'options') {
      setInputMode('options')
      setOptions(paso.opts)
      setStage(`flujo_${paso.id}`)
    } else if (paso.tipo === 'multi') {
      setInputMode('multi')
      setMultiSel([])
      setOptions(paso.opts)
      setStage(`flujo_${paso.id}`)
    } else if (paso.tipo === 'text') {
      setInputMode('text')
      setPlaceholder(paso.placeholder || 'Escribe aquí…')
      setStage(`flujo_${paso.id}`)
    }
  }

  // Handler opciones
  const handleOption = async (opt) => {
    if (opt.disabled) return
    addUser(opt.label)
    setInputMode(null)

    if (stage === 'tipo') {
      const newData = { ...data, tipo: opt.id }
      setData(newData)
      const nombre = opt.label.toLowerCase()
      await addAgent(`Perfecto, ${({casa:'una',departamento:'un',oficina:'una',terreno:'un',parcela:'una',agricola:'una',comercial:'una'})[opt.id] || 'una'} ${({agricola:'propiedad agrícola',comercial:'propiedad comercial'})[opt.id] || nombre}. Voy a hacerte algunas preguntas para conocerla bien.\n\nIngresa la dirección o el ROL SII de tu propiedad:`, 700)
      setSearchTab('direccion')
      setInputVal(''); setDeptoVal('')
      setInputMode('search_form')
      setStage('direccion')

    } else if (stage === 'elegir_unidad') {
      let sii = opt._sii || data._candidatos?.[parseInt(opt.id)]

      // Si el predio no tiene m², hacer llamada de detalle por ROL
      if (sii && (!sii.m2_construido && !sii.m2_terreno) && sii.manzana && sii.predio && sii.cod_comuna) {
        const rolStr = `${sii.manzana}-${sii.predio}`
        const comunaStr = sii.comuna || data.comuna || ''
        try {
          const detRes = await fetch(`/api/sii?direccion=${encodeURIComponent(rolStr)}&comuna=${encodeURIComponent(comunaStr)}`)
          if (detRes.ok) {
            const detJson = await detRes.json()
            const detalle = detJson.resultados?.[0]
            if (detalle && (detalle.m2_construido || detalle.m2_terreno)) {
              sii = { ...sii, ...detalle }
            }
          }
        } catch(e) { console.error('detalle fetch', e) }
      }

      const newData = { ...data, siiData: sii }
      setData(newData)
      setMessages(m => [...m, { role:'agent', content:{ type:'sii', data:sii }}])
      await addAgent('¿Estos datos son correctos?', 400)
      setInputMode('options')
      setOptions([{id:'si',label:'Sí, son correctos',icon:'✅'},{id:'no',label:'No, quiero corregir',icon:'✏️'}])
      setStage('confirmar_sii')

    } else if (stage === 'sii_no_encontrado') {
      if (opt.id === 'intentar_rol') {
        await addAgent('Ingresa el ROL SII de la propiedad:', 500)
        setSearchTab('rol'); setInputVal(''); setDeptoVal('')
        setInputMode('search_form')
      } else if (opt.id === 'intentar_otra') {
        await addAgent('Intenta nuevamente con la dirección completa:', 500)
        setSearchTab('direccion'); setInputVal(''); setDeptoVal('')
        setInputMode('search_form')
      } else {
        const d = data._pendingData || data
        const newData = { ...d, siiData:{ direccion:`${d.direccion}, ${d.comuna || ''}` } }
        setData(newData)
        await addAgent('Sin problema, continuamos. Te haré las preguntas directamente para poder tasarla.', 500)
        await nextStep(newData, 0)
      }

    } else if (stage === 'confirmar_sii') {
      if (opt.id === 'si') {
        await addAgent('Perfecto, datos confirmados ✓', 400)
        // Para casas y terrenos, pedir confirmación de m² de terreno antes de continuar
        const tipoActual = data.tipo
        const terrenoSII = parseFloat(data.siiData?.m2_terreno) || 0
        if (['casa', 'terreno', 'parcela'].includes(tipoActual)) {
          // El terreno del SII ya se muestra y confirma en la ficha de arriba: no repreguntar.
          if (terrenoSII > 0) {
            const m2C = parseFloat(data.siiData?.m2_construido) || 0
            if (!m2C && ['casa', 'departamento'].includes(tipoActual)) {
              await addAgent('¿Cuántos **m² construidos** tiene la propiedad? (superficie total construida)', 400)
              setInputMode('text'); setPlaceholder('Ej: 440')
              setStage('ingresar_m2_construido')
            } else {
              await nextStep(data, 0)
            }
          } else {
            await addAgent('¿Cuántos m² de terreno tiene la propiedad? (el SII no registra este dato para esta propiedad)', 500)
            setInputMode('text')
            setPlaceholder('Ej: 3982')
            setStage('ingresar_terreno')
          }
        } else {
          await nextStep(data, 0)
        }
      } else {
        await addAgent('Sin problema. Dame la dirección correcta:', 400)
        setInputMode('text')
        setPlaceholder('Escribe la dirección correcta…')
        setStage('direccion')
      }

    } else if (stage === 'precio_idea') {
      if (opt.id === 'tasar') {
        await iniciarTasacion(data)
      } else {
        await addAgent('¿Cuánto tienes en mente? (en UF o en pesos)', 400)
        setInputMode('text')
        setPlaceholder('Ej: 5.000 UF / $250.000.000')
        setStage('precio_monto')
      }

    } else if (stage === 'confirmar_terreno') {
      if (opt.id === 'si_terreno') {
        await addAgent('Perfecto ✓', 300)
        const m2C = parseFloat(data.siiData?.m2_construido) || 0
        if (!m2C && ['casa','departamento'].includes(data.tipo)) {
          await addAgent('¿Cuántos **m² construidos** tiene la propiedad? (superficie total construida)', 400)
          setInputMode('text'); setPlaceholder('Ej: 440')
          setStage('ingresar_m2_construido'); return
        }
        await nextStep(data, 0)
      } else {
        await addAgent('¿Cuántos m² de terreno tiene realmente la propiedad?', 400)
        setInputMode('text')
        setPlaceholder('Ej: 3982')
        setStage('ingresar_terreno')
      }

    } else if (stage.startsWith('flujo_')) {
      const campo = stage.replace('flujo_', '')
      const newData = { ...data, [campo]: opt.id }
      setData(newData)
      await nextStep(newData, flujoIdx)
    }
  }

  // Handler multiselect
  const handleMultiConfirm = async () => {
    const campo = stage.replace('flujo_', '')
    const labels = multiSel.map(s => options.find(o => o.id === s)?.label).filter(Boolean)
    addUser(labels.length ? labels.join(', ') : 'Ninguna en especial')
    setInputMode(null)
    const newData = { ...data, [campo]: multiSel }
    setData(newData)
    await nextStep(newData, flujoIdx)
  }

  // Handler texto
  const handleSend = async () => {
    const val = inputVal.trim()
    if (!val) return
    setInputVal('')
    setInputMode(null)

    if (stage === 'direccion') {
      // Fallback por si se llega por texto libre (ej: corrección manual)
      addUser(val)
      const newData = { ...data, direccion: val }
      setData(newData)
      await addAgent('¿En qué comuna está?', 400)
      setInputMode('text')
      setPlaceholder('Escribe la comuna…')
      setStage('comuna')

    } else if (stage === 'comuna') {
      addUser(val)
      const newData = { ...data, comuna: val }
      setData(newData)
      await fetchSII(newData)

    } else if (stage === 'ingresar_m2_construido') {
      const m2C = parseFloat(val.replace(/[^0-9.]/g, ''))
      if (!m2C || m2C <= 0) {
        await addAgent('Por favor ingresa un número válido de m² construidos (ej: 180).', 300)
        setInputMode('text'); return
      }
      addUser(`${m2C.toLocaleString('es-CL')} m² construidos`)
      const siiConM2 = { ...data.siiData, m2_construido: m2C }
      const nd = { ...data, siiData: siiConM2 }; setData(nd)
      // Solo pedir terreno si no fue ingresado antes
      const terrenoYa = parseFloat(siiConM2.m2_terreno) || 0
      if (!terrenoYa && ['casa','terreno','parcela'].includes(data.tipo)) {
        await addAgent('¿Y cuántos **m² de terreno** tiene? (superficie total del sitio, ej: 500)', 400)
        setInputMode('text'); setStage('ingresar_terreno'); return
      }
      await nextStep(nd, 0); return

    } else if (stage === 'ingresar_terreno') {
      const m2Corregido = parseFloat(val.replace(/[^0-9.]/g, ''))
      if (m2Corregido > 0) {
        addUser(`${m2Corregido.toLocaleString('es-CL')} m²`)
        const newSiiData = { ...data.siiData, m2_terreno: m2Corregido }
        const newData = { ...data, siiData: newSiiData }
        setData(newData)
        await addAgent(`Anotado: **${m2Corregido.toLocaleString('es-CL')} m² de terreno** ✓`, 300)
        const m2C = parseFloat(newData.siiData?.m2_construido) || 0
        if (!m2C && ['casa','departamento'].includes(newData.tipo)) {
          await addAgent('¿Cuántos **m² construidos** tiene la propiedad? (superficie total construida)', 400)
          setInputMode('text'); setPlaceholder('Ej: 440')
          setStage('ingresar_m2_construido'); return
        }
        await nextStep(newData, 0)
      } else {
        await addAgent('Ingresa un número válido (ej: 3982)', 300)
        setInputMode('text')
        setPlaceholder('Ej: 3982')
        setStage('ingresar_terreno')
      }

    } else if (stage === 'precio_monto') {
      addUser(val)
      await iniciarTasacion({ ...data, precio_idea: val })

    } else if (stage.startsWith('flujo_')) {
      addUser(val)
      const campo = stage.replace('flujo_', '')
      const newData = { ...data, [campo]: val }
      setData(newData)
      await nextStep(newData, flujoIdx)
    }
  }

  const fetchSII = async (d) => {
    setMessages(m => [...m, { role:'agent', content:{ type:'loading', text:'Buscando tu propiedad en el catastro…' }}])
    try {
      // Catastro vía DataInmobiliaria (reemplaza BaseAPI). Con dirección + comuna basta.
      const res = await fetch('/api/predio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direccion: d.direccion || '', comuna: d.comuna || '' }),
      })
      setMessages(m => m.filter(x => !(x.role==='agent' && x.content?.type==='loading')))

      if (!res.ok) {
        await addAgent('No pude consultar el catastro ahora, pero continuamos sin problema.', 400)
        const fallback = { ...d, siiData:{ direccion:`${d.direccion}${d.depto ? ' '+d.depto : ''}, ${d.comuna}` } }
        setData(fallback)
        await nextStep(fallback, 0)
        return
      }

      const json = await res.json()
      // Mapear candidatos de /api/predio a la forma que ya usa el flujo
      const resultados = (json.candidatos || []).map(c => ({
        rol: c.rol,
        direccion: c.direccion,
        destino: c.destino || 'Habitacional',
        m2_construido: c.m2_construido,
        m2_terreno: c.m2_terreno,
        es_copropiedad: c.es_copropiedad,
        terreno_origen: c.terreno_origen,
        ano_construccion: c.ano_construccion,
        anio_construccion: c.ano_construccion,
      }))

      // Multiples resultados -> selector
      if (resultados.length > 1) {
        await addAgent(`Encontré ${resultados.length} propiedades en esa dirección. ¿Cuál es la tuya?`, 500)
        setInputMode('options')
        setOptions(resultados.map((r, i) => ({
          id: String(i),
          label: [r.direccion, r.destino, r.m2_construido && `${r.m2_construido} m²`, r.rol && `ROL ${r.rol}`].filter(Boolean).join(' · '),
          icon: '🏠',
          _sii: r,
        })))
        setData(prev => ({ ...prev, _candidatos: resultados, _pendingData: d }))
        setStage('elegir_unidad')
        return
      }

      // No encontrado -> pedir m2
      if (!resultados.length) {
        const newData = { ...d, siiData:{ direccion:`${d.direccion}${d.depto ? ' '+d.depto : ''}, ${d.comuna}` } }
        setData(newData)
        await addAgent(`No encontré esta propiedad en el catastro con esa dirección. Para una tasación precisa necesito los metros cuadrados reales.\n\n¿Cuántos **m² construidos** tiene la propiedad? (ej: 180)`, 400)
        setInputMode('text')
        setStage('ingresar_m2_construido')
        return
      }

      // Un solo resultado
      const sii = resultados[0]
      const newData = { ...d, siiData: sii }
      setData(newData)
      setMessages(m => [...m, { role:'agent', content:{ type:'sii', data:sii }}])
      const terrenoTxt = sii.terreno_origen === 'bien_comun' ? ' (el terreno corresponde al bien común del edificio)' : ''
      await addAgent(`¿Estos datos son correctos?${terrenoTxt}`, 400)
      setInputMode('options')
      setOptions([{id:'si',label:'Sí, son correctos',icon:'✅'},{id:'no',label:'No, quiero corregir',icon:'✏️'}])
      setStage('confirmar_sii')

    } catch(err) {
      console.error('fetchSII catch:', err.name, err.message)
      setMessages(m => m.filter(x => !(x.role==='agent' && x.content?.type==='loading')))
      await addAgent('Tuve un problema conectándome al catastro. No te preocupes, continuamos con lo que me cuentes directamente.', 600)
      const newData = { ...d, siiData:{ direccion:`${d.direccion}, ${d.comuna}` } }
      setData(newData)
      await nextStep(newData, 0)
    }
  }

  const verOfertasTas = async () => {
    setVistaTas('ofertas')
    if (ofertasTasacion !== null || !tasBody) return
    setOfTasLoading(true)
    try {
      const r = await fetch('/api/ofertas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tasBody) })
      const j = await r.json()
      setOfertasTasacion(Array.isArray(j.ofertas) ? j.ofertas : [])
    } catch (e) { setOfertasTasacion([]) }
    setOfTasLoading(false)
  }

  const iniciarTasacion = async (finalData) => {
    setVentasTasacion(null); setOfertasTasacion(null); setVistaTas('ventas')
    await addAgent('¡Perfecto! Calculando la tasación con datos reales del mercado…', 500)
    setMessages(m => [...m, { role:'agent', content:{ type:'loading', text:'Consultando transacciones reales del CBR, comparables y plan regulador…' }}])
    setStage('tasando')
    try {
      const res = await fetch('/api/tasar', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          siiData: finalData.siiData,
          form:{ direccion: finalData.direccion, depto:'', comuna: finalData.comuna || '' },
          answers:{ remodelacion: finalData.remodelacion || 'ninguna', tiempo_remo: finalData.tiempo_remo || 'reciente', conservacion:'bueno', terraza_m2: parseInt(finalData.terraza_m2)||0, estacionamientos: parseInt(finalData.estacionamientos)||0, bodegas: parseInt(finalData.bodega)||0, m2_util: finalData.siiData?.m2_util || null },
          extras: { ...finalData, tipo: finalData.tipo, piso: finalData.piso, orientacion: finalData.orientacion, jardin_m2: finalData.jardin_m2, precio_idea: finalData.precio_idea },
        })
      })
      const resultado = await res.json()
      if (resultado.error) throw new Error(resultado.error)
      setMessages(m => m.filter(x => !(x.role==='agent' && x.content?.type==='loading')))
      const { ajRemo, ajCar, ajJardin } = resultado.ajustes || calcAjustes(finalData)
      const m2Util = parseFloat(finalData.siiData?.m2_util || finalData.siiData?.m2_construido) || 60
      const valorBase = resultado.valor_uf || 0
      const valorFinal = valorBase + ajRemo + ajCar + ajJardin
      const rangoMin = Math.round(valorFinal * 0.93)
      const rangoMax = Math.round(valorFinal * 1.07)
      setMessages(m => [...m, { role:'agent', content:{ type:'tasacion', resultado, valorFinal, rangoMin, rangoMax, ajRemo, ajCar, ajJardin, valorBase, remoInfo:{ tipo: finalData.remodelacion, m2: m2Util, ufM2: AJUSTE_REMO[finalData.remodelacion]||0, tiempo: finalData.tiempo_remo } }}])
      // Lista + mapa: LAS MISMAS ventas que respaldan el valor (vienen de /api/tasar).
      try {
        const m2Built = parseFloat(finalData.siiData?.m2_construido || finalData.siiData?.m2_util || m2Util) || null
        setTasBody({ tipo: finalData.tipo, m2_objetivo: m2Built, direccion: finalData.direccion, comuna: finalData.comuna || '' })
        setVentasTasacion(Array.isArray(resultado.ventas_mapa) && resultado.ventas_mapa.length ? resultado.ventas_mapa : null)
      } catch (e) {}
      const expectativaUF = parseExpectativaUF(finalData.precio_idea)
      const { mensajes } = valorizacionValentina({
        comuna: finalData.comuna || '',
        tipo: finalData.tipo,
        bandaMinUF: rangoMin,
        bandaMaxUF: rangoMax,
        precioSugeridoUF: rangoMax,
        comparables: resultado.comparables || [],
        confianza: resultado.confianza,
        expectativaUF,
      })
      for (const msg of mensajes) {
        await addAgent(msg, 900)
      }
      setInputMode('options')
      setOptions([{id:'detalle',label:'Quiero más detalle',icon:'🔍'}])
      setStage('resultado')
    } catch(e) {
      setMessages(m => m.filter(x => !(x.role==='agent' && x.content?.type==='loading')))
      await addAgent(`Hubo un problema: ${e.message}. ¿Reintentamos?`, 500)
      setInputMode('options')
      setOptions([{id:'retry',label:'Sí, reintentar',icon:'🔄'}])
    }
  }

  const renderContent = (content) => {
    if (typeof content === 'string') return content.split('\n').map((l, i) => (
      <span key={i}>{l.split(/\*\*(.*?)\*\*/g).map((p,j) => j%2===1 ? <strong key={j}>{p}</strong> : p)}{i < content.split('\n').length-1 && <br/>}</span>
    ))
    if (content?.type === 'loading') return <div className="bubble-loader"><div className="bubble-spinner"/>{content.text}</div>
    if (content?.type === 'sii') {
      const d = content.data
      return (
        <div className="sii-bubble">
          <div className="sii-bubble-tag">Datos SII · Verificados</div>
          <div className="sii-bubble-addr">{d.direccion}</div>
          <div className="sii-bubble-grid">
            {d.rol && <div className="sii-bubble-item"><div className="sii-bubble-label">ROL</div><div className="sii-bubble-val rol">{d.rol}</div></div>}
            {d.destino && <div className="sii-bubble-item"><div className="sii-bubble-label">Destino</div><div className="sii-bubble-val">{d.destino}</div></div>}
            {d.m2_construido && <div className="sii-bubble-item"><div className="sii-bubble-label">M² construidos</div><div className="sii-bubble-val green">{d.m2_construido} m²</div></div>}
            
            {d.m2_terreno && <div className="sii-bubble-item"><div className="sii-bubble-label">M² terreno</div><div className="sii-bubble-val">{d.m2_terreno} m²</div></div>}
            {(d.anio_construccion || d.ano_construccion) && <div className="sii-bubble-item"><div className="sii-bubble-label">Año const.</div><div className="sii-bubble-val">{(d.anio_construccion || d.ano_construccion)}</div></div>}
            {d.avaluo_fiscal_uf && <div className="sii-bubble-item"><div className="sii-bubble-label">Avalúo fiscal</div><div className="sii-bubble-val">{Math.round(d.avaluo_fiscal_uf).toLocaleString('es-CL')} UF</div></div>}
          </div>
        </div>
      )
    }
    if (content?.type === 'tasacion') {
      const { resultado, valorFinal, rangoMin, rangoMax, ajRemo, ajCar, ajJardin=0, valorBase } = content
      const conf = resultado.confianza?.toLowerCase()
      const cc = conf?.includes('alta') ? 'conf-alta' : conf?.includes('media') ? 'conf-media' : 'conf-baja'
      const pr = resultado.plan_regulador
      return (
        <div className="tasacion-card">
          {/* Valor principal */}
          <div className="tasacion-label">Tasación de mercado</div>
          <div className="tasacion-valor">{fmtUF(valorFinal)}</div>
          <div className="tasacion-rango">Rango estimado: {fmtUF(rangoMin)} — {fmtUF(rangoMax)}</div>
          <div className={`conf-badge ${cc}`}>Confianza {resultado.confianza}</div>
          {content.siiData?.rol && (
            <div className="tasacion-rol">ROL SII: {content.siiData.rol}</div>
          )}

          {/* Desglose detallado */}
          {resultado.desglose?.length > 0 ? (
            <div className="tas-section">
              <div className="tas-section-title">Desglose del valor</div>
              {resultado.desglose.map((it, i) => (
                <div key={i} className="tas-row">
                  <div>
                    <div className="tas-row-label">{it.concepto}</div>
                    {it.calculo && <div className="tas-row-calc">{it.calculo}</div>}
                  </div>
                  <div className={it.valor_uf >= 0 ? 'tas-row-val pos' : 'tas-row-val neg'}>
                    {it.valor_uf >= 0 ? '+' : ''}{fmtUF(it.valor_uf)}
                  </div>
                </div>
              ))}
              <div className="tas-row tas-row-total">
                <div className="tas-row-label">Total estimado</div>
                <div className="tas-row-val">{fmtUF(valorFinal)}</div>
              </div>
            </div>
          ) : (
            <div className="tasacion-grid">
              <div className="tasacion-item"><div className="tasacion-item-label">Base CBR</div><div className="tasacion-item-val">{fmtUF(valorBase)}</div></div>
              {ajRemo>0 && <div className="tasacion-item"><div className="tasacion-item-label">Remodelación</div><div className="tasacion-item-val pos">+{fmtUF(ajRemo)}</div></div>}
              {ajCar>0 && <div className="tasacion-item"><div className="tasacion-item-label">Características</div><div className="tasacion-item-val pos">+{fmtUF(ajCar)}</div></div>}
              {ajJardin>0 && <div className="tasacion-item"><div className="tasacion-item-label">Jardín / Patio</div><div className="tasacion-item-val pos">+{fmtUF(ajJardin)}</div></div>}
              {resultado.precio_m2 && <div className="tasacion-item"><div className="tasacion-item-label">Precio/m²</div><div className="tasacion-item-val">{resultado.precio_m2} UF/m²</div></div>}
            </div>
          )}

          {/* Plan Regulador */}
          {pr && (
            <div className="tas-section">
              <div className="tas-section-title">📋 Plan Regulador — {pr.zona || ''} {pr.nombre_zona || ''}</div>
              <div className="plan-grid">
                {pr.uso_suelo && <div className="plan-item"><div className="plan-label">Uso de suelo</div><div className="plan-val">{pr.uso_suelo}</div></div>}
                {pr.altura_max_pisos && <div className="plan-item"><div className="plan-label">Altura máx.</div><div className="plan-val">{pr.altura_max_pisos} pisos{pr.altura_max_m ? ` / ${pr.altura_max_m}m` : ''}</div></div>}
                {pr.coef_constructibilidad && <div className="plan-item"><div className="plan-label">Constructibilidad</div><div className="plan-val">{pr.coef_constructibilidad}</div></div>}
                {pr.coef_ocupacion_suelo && <div className="plan-item"><div className="plan-label">Ocup. suelo</div><div className="plan-val">{pr.coef_ocupacion_suelo}</div></div>}
                {pr.densidad_max && <div className="plan-item"><div className="plan-label">Densidad máx.</div><div className="plan-val">{pr.densidad_max}</div></div>}
                {pr.antejardín_m > 0 && <div className="plan-item"><div className="plan-label">Antejardín</div><div className="plan-val">{pr.antejardín_m} m</div></div>}
              </div>
              {pr.impacto_valor && <div className="plan-impacto">{pr.impacto_valor}</div>}
              {pr.observaciones && <div className="plan-obs">{pr.observaciones}</div>}
            </div>
          )}

          {/* Factores + / - */}
          {(resultado.factores_positivos?.length > 0 || resultado.factores_negativos?.length > 0) && (
            <div className="tas-section">
              <div className="tas-section-title">Factores de valor</div>
              <div className="factores-grid">
                {resultado.factores_positivos?.map((f,i) => <div key={i} className="factor pos">✓ {f}</div>)}
                {resultado.factores_negativos?.map((f,i) => <div key={i} className="factor neg">✗ {f}</div>)}
              </div>
            </div>
          )}

          {/* Análisis */}
          {resultado.analisis && <div className="analisis-text">{resultado.analisis}</div>}

          {/* Recomendación */}
          {resultado.recomendacion_precio_venta && (
            <div className="tas-recomendacion">
              <div className="tas-reco-title">💡 Recomendación</div>
              <div className="tas-reco-text">{resultado.recomendacion_precio_venta}</div>
            </div>
          )}

          {/* Potencial de Desarrollo */}
          {resultado.potencial_desarrollo?.aplica && (
            <div className="tas-section potencial-dev">
              <div className="tas-section-title">🏗️ Potencial de Desarrollo del Terreno</div>
              <div className="potencial-highlight">
                <div className="potencial-numero">~{resultado.potencial_desarrollo.unidades_estimadas}</div>
                <div className="potencial-label">casas posibles según plan regulador</div>
              </div>
              <div className="potencial-desc">{resultado.potencial_desarrollo.descripcion}</div>
              <div className="potencial-advertencia">⚠️ {resultado.potencial_desarrollo.advertencia}</div>
            </div>
          )}

        </div>
      )
    }
    return null
  }

  const handleSearchForm = async () => {
    const busqueda = inputVal.trim()
    if (!busqueda || !comunaForm) return
    const conDepto = deptoVal.trim()
    const label = data.tipo === 'oficina' ? 'Of.' : data.tipo === 'departamento' ? 'Depto' : ''
    const resumen = conDepto ? `${busqueda} ${label} ${conDepto}, ${comunaForm}` : `${busqueda}, ${comunaForm}`
    addUser(resumen)
    setInputVal(''); setDeptoVal(''); setComunaForm(''); setInputMode(null)
    const newData = { ...data, direccion: busqueda, depto: conDepto, comuna: placesResult?.comunaNorm || comunaForm, placesResult: placesResult || null }
    setData(newData)
    await fetchSII(newData)
  }

  const handleBannerSend = async () => {
    const dir = inputVal.trim()
    if (!dir) return
    const label = data.tipo === 'oficina' ? 'Oficina' : 'Depto'
    const resumen = deptoVal.trim() ? `${dir} — ${label} ${deptoVal.trim()}` : dir
    addUser(resumen)
    setInputVal(''); setDeptoVal(''); setInputMode(null)
    const newData = { ...data, direccion: dir, depto: deptoVal.trim() }
    setData(newData)
    await addAgent('¿En qué comuna está?', 400)
    setInputMode('comuna_depto')
    setStage('comuna')
  }

  return (
    <div className="chat-app">
      <div className="chat-header">
        <a className="back-btn" href="https://greatdeal-platform.vercel.app" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',textDecoration:'none'}}>←</a>
        <div className="agent-avatar">🤵</div>
        <div>
          <div className="agent-name">Valentina · Agente Inmobiliaria</div>
          <div className="agent-status"><span className="status-dot"/>En línea</div>
        </div>
        <div className="chat-header-logo">IA <em>Prop</em></div>
      </div>

      <div className="messages-area">
        {messages.map((msg, i) => msg.role==='agent'
          ? <AgentBubble key={i}>{renderContent(msg.content)}</AgentBubble>
          : <UserBubble key={i}>{msg.content}</UserBubble>
        )}
        {typing && <AgentBubble typing/>}
        {ventasTasacion && ventasTasacion.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(202,161,90,0.25)', display: 'flex', gap: 8 }}>
            <button onClick={() => setVistaTas('ventas')} style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid ' + (vistaTas === 'ventas' ? 'var(--gold)' : 'rgba(255,255,255,0.18)'), background: vistaTas === 'ventas' ? 'var(--gold-dim)' : 'transparent', color: vistaTas === 'ventas' ? 'var(--gold-light)' : '#cfcfcf', cursor: 'pointer', fontSize: 13 }}>🏠 Ventas registradas</button>
            <button onClick={verOfertasTas} style={{ padding: '6px 12px', borderRadius: 20, border: '1px solid ' + (vistaTas === 'ofertas' ? 'var(--gold)' : 'rgba(255,255,255,0.18)'), background: vistaTas === 'ofertas' ? 'var(--gold-dim)' : 'transparent', color: vistaTas === 'ofertas' ? 'var(--gold-light)' : '#cfcfcf', cursor: 'pointer', fontSize: 13 }}>🏷️ Ofertas en venta</button>
          </div>
        )}
        {vistaTas === 'ventas'
          ? <VentasMapa ventas={ventasTasacion} titulo="Ventas comparables que respaldan la tasación" />
          : ofTasLoading
            ? <div style={{ marginTop: 14, color: '#8a8a8a', fontSize: 14 }}>Buscando ofertas vigentes en el sector…</div>
            : <OfertasMapa ofertas={ofertasTasacion} />}
        <div ref={bottomRef}/>
      </div>

      <div className="options-area">
        {inputMode === 'options' && (
          <>
            <div className="options-hint">Selecciona una opción</div>
            <div className="options-grid">
              {options.map(opt => (
                <button key={opt.id} className={`opt${opt.disabled?' disabled':''}`} onClick={() => !opt.disabled && handleOption(opt)} disabled={opt.disabled}>
                  {opt.icon && <span className="opt-icon">{opt.icon}</span>}{opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {inputMode === 'multi_comuna' && (
          <>
            <div className="options-hint">Selecciona una o más comunas</div>
            <div className="comunas-grid">
              {options.map(opt => (
                <button key={opt.id} className={`comuna-btn${multiSel.includes(opt.id)?' selected':''}`}
                  onClick={() => setMultiSel(p => p.includes(opt.id) ? p.filter(x=>x!==opt.id) : [...p, opt.id])}>
                  {opt.label}
                </button>
              ))}
            </div>
            <button className="opt" style={{background:'var(--gold-dim)',borderColor:'var(--gold)',color:'var(--gold-light)',marginTop:8}} onClick={handleMultiConfirm}>
              Confirmar →
            </button>
          </>
        )}

        {inputMode === 'multi' && (
          <>
            <div className="options-hint">Selecciona todo lo que aplique</div>
            <div className="options-grid" style={{marginBottom:10}}>
              {options.map(opt => (
                <button key={opt.id} className={`opt${multiSel.includes(opt.id)?' selected':''}`}
                  onClick={() => {
                    if (opt.id==='ninguna') setMultiSel(['ninguna'])
                    else setMultiSel(p => p.includes(opt.id) ? p.filter(x=>x!==opt.id) : [...p.filter(x=>x!=='ninguna'),opt.id])
                  }}>
                  {opt.icon && <span className="opt-icon">{opt.icon}</span>}{opt.label}
                </button>
              ))}
            </div>
            <button className="opt" style={{background:'var(--gold-dim)',borderColor:'var(--gold)',color:'var(--gold-light)'}} onClick={handleMultiConfirm}>
              Confirmar →
            </button>
          </>
        )}

        {inputMode === 'search_form' && (
          <div className="search-form">
            <div className="search-tabs">
              <button className={`search-tab${searchTab==='direccion'?' active':''}`} onClick={() => { setSearchTab('direccion'); setInputVal('') }}>
                Buscar por Dirección
              </button>
              <button className={`search-tab${searchTab==='rol'?' active':''}`} onClick={() => { setSearchTab('rol'); setInputVal('') }}>
                Buscar por ROL
              </button>
            </div>
            <div className="search-fields">
              {searchTab === 'direccion' ? (
                <div className="search-row">
                  <div className="search-field" style={{flex:1}}>
                    <div className="search-field-label">Dirección Completa<span>*</span></div>
                    <input id="places-input" value={inputVal} onChange={e => { setInputVal(e.target.value); setPlacesResult(null) }}
                      placeholder="Ej. Lo Fontecilla 267" autoFocus
                      onKeyDown={e => { if (e.key==='Enter') handleSearchForm() }} />
                  </div>
                  {['departamento','oficina'].includes(data.tipo) && (
                    <div className="search-field unit">
                      <div className="search-field-label">Nº {data.tipo==='oficina'?'Oficina':'Unidad'}</div>
                      <input value={deptoVal} onChange={e => setDeptoVal(e.target.value)}
                        placeholder="204 A (Opcional)"
                        onKeyDown={e => { if (e.key==='Enter') handleSearchForm() }} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="search-row">
                  <div className="search-field" style={{flex:1}}>
                    <div className="search-field-label">ROL SII<span>*</span></div>
                    <input value={inputVal} onChange={e => setInputVal(e.target.value)}
                      placeholder="Ej. 1234-56" autoFocus
                      onKeyDown={e => { if (e.key==='Enter') handleSearchForm() }} />
                  </div>
                </div>
              )}
              <div className="search-row" style={{marginBottom:0}}>
                <div className="search-field" style={{flex:1}}>
                  <div className="search-field-label">Comuna<span>*</span></div>
                  <select value={comunaForm} onChange={e => setComunaForm(e.target.value)}>
                    <option value="">Selecciona una Comuna</option>
                    {COMUNAS_RM.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="search-actions">
              <button className="btn-buscar" disabled={!inputVal.trim() || !comunaForm} onClick={handleSearchForm}>
                Siguiente →
              </button>
            </div>
          </div>
        )}

        {(inputMode === 'text' || inputMode === 'comuna') && (
          <div className="text-input-row">
            {inputMode === 'comuna' ? (
              <>
                <select className="chat-input" value={inputVal} onChange={e => setInputVal(e.target.value)} style={{height:46}}>
                  <option value="">Selecciona una comuna…</option>
                  {COMUNAS_RM.map(c => <option key={c}>{c}</option>)}
                </select>
                <button className="send-btn" disabled={!inputVal} onClick={() => {
                  const val = inputVal; setInputVal(''); setInputMode(null)
                  addUser(val)
                  const nd = { ...data, comuna: val }; setData(nd)
                  fetchSII(nd)
                }}>→</button>
              </>
            ) : (
              <>
                <textarea ref={inputRef} className="chat-input" placeholder={placeholder || 'Escribe aquí…'} value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }}}
                  rows={1}/>
                <button className="send-btn" disabled={!inputVal.trim()} onClick={handleSend}>→</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// ─── Flujo de preguntas comprador ────────────────────────────────────────────
const FLUJOS_COMPRADOR = {
  departamento: [
    { id:'presupuesto', msg:'¿Cuál es tu presupuesto aproximado?', tipo:'options', opts:[
      {id:'hasta_3000',label:'Hasta 3.000 UF',icon:'💚'},{id:'3000_5000',label:'3.000 – 5.000 UF',icon:'💛'},
      {id:'5000_8000',label:'5.000 – 8.000 UF',icon:'🟠'},{id:'8000_12000',label:'8.000 – 12.000 UF',icon:'🔴'},
      {id:'12000_20000',label:'12.000 – 20.000 UF',icon:'🟣'},{id:'mas_20000',label:'Más de 20.000 UF',icon:'⭐'}]},
    { id:'dormitorios', msg:'¿Cuántos dormitorios necesitas?', tipo:'options', opts:[
      {id:'1',label:'1 dormitorio',icon:'🛏️'},{id:'2',label:'2 dormitorios',icon:'🛏️🛏️'},
      {id:'3',label:'3 dormitorios',icon:'🏠'},{id:'4+',label:'4 o más',icon:'🏡'}]},
    { id:'zona', msg:'¿En qué comunas te interesa buscar? Puedes seleccionar más de una.', tipo:'multi_comuna', opts:[
      {id:'cerrillos',label:'Cerrillos',icon:'📍'},
      {id:'cerro_navia',label:'Cerro Navia',icon:'📍'},
      {id:'conchalí',label:'Conchalí',icon:'📍'},
      {id:'el_bosque',label:'El Bosque',icon:'📍'},
      {id:'estación_central',label:'Estación Central',icon:'📍'},
      {id:'huechuraba',label:'Huechuraba',icon:'📍'},
      {id:'independencia',label:'Independencia',icon:'📍'},
      {id:'la_cisterna',label:'La Cisterna',icon:'📍'},
      {id:'la_florida',label:'La Florida',icon:'📍'},
      {id:'la_granja',label:'La Granja',icon:'📍'},
      {id:'la_pintana',label:'La Pintana',icon:'📍'},
      {id:'la_reina',label:'La Reina',icon:'📍'},
      {id:'las_condes',label:'Las Condes',icon:'📍'},
      {id:'lo_barnechea',label:'Lo Barnechea',icon:'📍'},
      {id:'lo_espejo',label:'Lo Espejo',icon:'📍'},
      {id:'lo_prado',label:'Lo Prado',icon:'📍'},
      {id:'macul',label:'Macul',icon:'📍'},
      {id:'maipú',label:'Maipú',icon:'📍'},
      {id:'nunoa',label:'Ñuñoa',icon:'📍'},
      {id:'penalolén',label:'Peñalolén',icon:'📍'},
      {id:'providencia',label:'Providencia',icon:'📍'},
      {id:'pudahuel',label:'Pudahuel',icon:'📍'},
      {id:'puente_alto',label:'Puente Alto',icon:'📍'},
      {id:'quilicura',label:'Quilicura',icon:'📍'},
      {id:'quinta_normal',label:'Quinta Normal',icon:'📍'},
      {id:'recoleta',label:'Recoleta',icon:'📍'},
      {id:'renca',label:'Renca',icon:'📍'},
      {id:'san_bernardo',label:'San Bernardo',icon:'📍'},
      {id:'san_joaquín',label:'San Joaquín',icon:'📍'},
      {id:'san_miguel',label:'San Miguel',icon:'📍'},
      {id:'san_ramón',label:'San Ramón',icon:'📍'},
      {id:'santiago',label:'Santiago',icon:'📍'},
      {id:'vitacura',label:'Vitacura',icon:'📍'},
    ]},
    { id:'uso', msg:'¿Para qué es el departamento?', tipo:'options', opts:[
      {id:'vivir',label:'Para vivir yo / mi familia',icon:'🏠'},{id:'invertir',label:'Para arrendar / inversión',icon:'💰'},
      {id:'ambos',label:'Vivir ahora, arrendar después',icon:'🔄'}]},
    { id:'caracteristicas', msg:'¿Qué características son imprescindibles?', tipo:'multi', opts:[
      {id:'estacionamiento',label:'Estacionamiento',icon:'🚗'},{id:'bodega',label:'Bodega',icon:'📦'},
      {id:'terraza',label:'Terraza o balcón',icon:'🌿'},{id:'piscina_edificio',label:'Piscina en edificio',icon:'🏊'},
      {id:'gimnasio',label:'Gimnasio',icon:'💪'},{id:'conserje',label:'Conserje 24/7',icon:'🔐'},
      {id:'ninguna',label:'Solo el departamento',icon:'—'}]},
    { id:'urgencia', msg:'¿Cuándo necesitas comprar?', tipo:'options', opts:[
      {id:'inmediato',label:'Lo antes posible',icon:'⚡'},{id:'3_meses',label:'En los próximos 3 meses',icon:'📅'},
      {id:'6_meses',label:'En 6 meses',icon:'🗓️'},{id:'sin_prisa',label:'Sin apuro, buscando la ideal',icon:'🔍'}]},
  ],
  casa: [
    { id:'presupuesto', msg:'¿Cuál es tu presupuesto?', tipo:'options', opts:[
      {id:'hasta_5000',label:'Hasta 5.000 UF',icon:'💚'},{id:'5000_10000',label:'5.000 – 10.000 UF',icon:'💛'},
      {id:'10000_20000',label:'10.000 – 20.000 UF',icon:'🟠'},{id:'20000_40000',label:'20.000 – 40.000 UF',icon:'🔴'},
      {id:'mas_40000',label:'Más de 40.000 UF',icon:'⭐'}]},
    { id:'terreno_min', msg:'¿Cuánto terreno mínimo necesitas?', tipo:'options', opts:[
      {id:'cualquiera',label:'No tengo requisito de terreno',icon:'—'},{id:'200_500',label:'200 – 500 m²',icon:'🌱'},
      {id:'500_1000',label:'500 – 1.000 m²',icon:'🌿'},{id:'1000_3000',label:'1.000 – 3.000 m²',icon:'🌳'},
      {id:'mas_3000',label:'Más de 3.000 m²',icon:'🏞️'}]},
    { id:'dormitorios', msg:'¿Cuántos dormitorios necesitas?', tipo:'options', opts:[
      {id:'3',label:'3 dormitorios',icon:'🏠'},{id:'4',label:'4 dormitorios',icon:'🏡'},
      {id:'5+',label:'5 o más',icon:'🏰'}]},
    { id:'zona', msg:'¿En qué comunas te interesa buscar? Puedes seleccionar más de una.', tipo:'multi_comuna', opts:[
      {id:'cerrillos',label:'Cerrillos',icon:'📍'},
      {id:'cerro_navia',label:'Cerro Navia',icon:'📍'},
      {id:'conchalí',label:'Conchalí',icon:'📍'},
      {id:'el_bosque',label:'El Bosque',icon:'📍'},
      {id:'estación_central',label:'Estación Central',icon:'📍'},
      {id:'huechuraba',label:'Huechuraba',icon:'📍'},
      {id:'independencia',label:'Independencia',icon:'📍'},
      {id:'la_cisterna',label:'La Cisterna',icon:'📍'},
      {id:'la_florida',label:'La Florida',icon:'📍'},
      {id:'la_granja',label:'La Granja',icon:'📍'},
      {id:'la_pintana',label:'La Pintana',icon:'📍'},
      {id:'la_reina',label:'La Reina',icon:'📍'},
      {id:'las_condes',label:'Las Condes',icon:'📍'},
      {id:'lo_barnechea',label:'Lo Barnechea',icon:'📍'},
      {id:'lo_espejo',label:'Lo Espejo',icon:'📍'},
      {id:'lo_prado',label:'Lo Prado',icon:'📍'},
      {id:'macul',label:'Macul',icon:'📍'},
      {id:'maipú',label:'Maipú',icon:'📍'},
      {id:'nunoa',label:'Ñuñoa',icon:'📍'},
      {id:'penalolén',label:'Peñalolén',icon:'📍'},
      {id:'providencia',label:'Providencia',icon:'📍'},
      {id:'pudahuel',label:'Pudahuel',icon:'📍'},
      {id:'puente_alto',label:'Puente Alto',icon:'📍'},
      {id:'quilicura',label:'Quilicura',icon:'📍'},
      {id:'quinta_normal',label:'Quinta Normal',icon:'📍'},
      {id:'recoleta',label:'Recoleta',icon:'📍'},
      {id:'renca',label:'Renca',icon:'📍'},
      {id:'san_bernardo',label:'San Bernardo',icon:'📍'},
      {id:'san_joaquín',label:'San Joaquín',icon:'📍'},
      {id:'san_miguel',label:'San Miguel',icon:'📍'},
      {id:'san_ramón',label:'San Ramón',icon:'📍'},
      {id:'santiago',label:'Santiago',icon:'📍'},
      {id:'vitacura',label:'Vitacura',icon:'📍'},
    ]},
    { id:'caracteristicas', msg:'¿Qué necesita tener la casa?', tipo:'multi', opts:[
      {id:'piscina',label:'Piscina',icon:'🏊'},{id:'jardin_grande',label:'Jardín grande',icon:'🌳'},
      {id:'quincho',label:'Quincho / BBQ',icon:'🔥'},{id:'estacionamiento',label:'Estacionamiento cubierto',icon:'🚗'},
      {id:'condominio',label:'En condominio cerrado',icon:'🔐'},{id:'sin_requisitos',label:'Sin requisito especial',icon:'—'}]},
    { id:'uso', msg:'¿Para qué es la casa?', tipo:'options', opts:[
      {id:'vivir',label:'Para vivir',icon:'🏠'},{id:'invertir',label:'Inversión / arrendar',icon:'💰'},
      {id:'desarrollar',label:'Desarrollar / subdividir',icon:'🏗️'}]},
    { id:'urgencia', msg:'¿Cuándo necesitas comprar?', tipo:'options', opts:[
      {id:'inmediato',label:'Lo antes posible',icon:'⚡'},{id:'3_meses',label:'En 3 meses',icon:'📅'},
      {id:'6_meses',label:'En 6 meses',icon:'🗓️'},{id:'sin_prisa',label:'Sin apuro',icon:'🔍'}]},
  ],
  oficina: [
    { id:'presupuesto', msg:'¿Cuál es tu presupuesto?', tipo:'options', opts:[
      {id:'hasta_3000',label:'Hasta 3.000 UF',icon:'💚'},{id:'3000_6000',label:'3.000 – 6.000 UF',icon:'💛'},
      {id:'6000_15000',label:'6.000 – 15.000 UF',icon:'🟠'},{id:'mas_15000',label:'Más de 15.000 UF',icon:'⭐'}]},
    { id:'superficie', msg:'¿Cuántos m² necesitas?', tipo:'options', opts:[
      {id:'hasta_50',label:'Hasta 50 m²',icon:'🏢'},{id:'50_100',label:'50 – 100 m²',icon:'🏢'},
      {id:'100_300',label:'100 – 300 m²',icon:'🏬'},{id:'mas_300',label:'Más de 300 m²',icon:'🏦'}]},
    { id:'zona', msg:'¿En qué comunas te interesa buscar? Puedes seleccionar más de una.', tipo:'multi_comuna', opts:[
      {id:'cerrillos',label:'Cerrillos',icon:'📍'},
      {id:'cerro_navia',label:'Cerro Navia',icon:'📍'},
      {id:'conchalí',label:'Conchalí',icon:'📍'},
      {id:'el_bosque',label:'El Bosque',icon:'📍'},
      {id:'estación_central',label:'Estación Central',icon:'📍'},
      {id:'huechuraba',label:'Huechuraba',icon:'📍'},
      {id:'independencia',label:'Independencia',icon:'📍'},
      {id:'la_cisterna',label:'La Cisterna',icon:'📍'},
      {id:'la_florida',label:'La Florida',icon:'📍'},
      {id:'la_granja',label:'La Granja',icon:'📍'},
      {id:'la_pintana',label:'La Pintana',icon:'📍'},
      {id:'la_reina',label:'La Reina',icon:'📍'},
      {id:'las_condes',label:'Las Condes',icon:'📍'},
      {id:'lo_barnechea',label:'Lo Barnechea',icon:'📍'},
      {id:'lo_espejo',label:'Lo Espejo',icon:'📍'},
      {id:'lo_prado',label:'Lo Prado',icon:'📍'},
      {id:'macul',label:'Macul',icon:'📍'},
      {id:'maipú',label:'Maipú',icon:'📍'},
      {id:'nunoa',label:'Ñuñoa',icon:'📍'},
      {id:'penalolén',label:'Peñalolén',icon:'📍'},
      {id:'providencia',label:'Providencia',icon:'📍'},
      {id:'pudahuel',label:'Pudahuel',icon:'📍'},
      {id:'puente_alto',label:'Puente Alto',icon:'📍'},
      {id:'quilicura',label:'Quilicura',icon:'📍'},
      {id:'quinta_normal',label:'Quinta Normal',icon:'📍'},
      {id:'recoleta',label:'Recoleta',icon:'📍'},
      {id:'renca',label:'Renca',icon:'📍'},
      {id:'san_bernardo',label:'San Bernardo',icon:'📍'},
      {id:'san_joaquín',label:'San Joaquín',icon:'📍'},
      {id:'san_miguel',label:'San Miguel',icon:'📍'},
      {id:'san_ramón',label:'San Ramón',icon:'📍'},
      {id:'santiago',label:'Santiago',icon:'📍'},
      {id:'vitacura',label:'Vitacura',icon:'📍'},
    ]},
    { id:'caracteristicas', msg:'¿Qué necesita la oficina?', tipo:'multi', opts:[
      {id:'estacionamientos',label:'Estacionamientos',icon:'🚗'},{id:'recepcion',label:'Recepción en edificio',icon:'🤵'},
      {id:'divisiones',label:'Ya con divisiones',icon:'🚪'},{id:'open_space',label:'Open space',icon:'🏞️'},
      {id:'terraza',label:'Terraza',icon:'🌿'},{id:'ninguna',label:'Sin requisito especial',icon:'—'}]},
    { id:'uso', msg:'¿Es para usar o para invertir?', tipo:'options', opts:[
      {id:'usar',label:'Para mi empresa / uso propio',icon:'💼'},{id:'arrendar',label:'Para arrendar',icon:'💰'},
      {id:'ambos',label:'Usar ahora, arrendar después',icon:'🔄'}]},
  ],
  terreno: [
    { id:'presupuesto', msg:'¿Cuál es tu presupuesto?', tipo:'options', opts:[
      {id:'hasta_5000',label:'Hasta 5.000 UF',icon:'💚'},{id:'5000_15000',label:'5.000 – 15.000 UF',icon:'💛'},
      {id:'15000_40000',label:'15.000 – 40.000 UF',icon:'🟠'},{id:'mas_40000',label:'Más de 40.000 UF',icon:'⭐'}]},
    { id:'superficie', msg:'¿Cuántos m² de terreno buscas?', tipo:'options', opts:[
      {id:'hasta_500',label:'Hasta 500 m²',icon:'📐'},{id:'500_1500',label:'500 – 1.500 m²',icon:'📏'},
      {id:'1500_5000',label:'1.500 – 5.000 m²',icon:'🗺️'},{id:'mas_5000',label:'Más de 5.000 m²',icon:'🏞️'}]},
    { id:'uso', msg:'¿Para qué usarás el terreno?', tipo:'options', opts:[
      {id:'casa_propia',label:'Construir mi casa',icon:'🏡'},{id:'condominio',label:'Desarrollar condominio / proyecto',icon:'🏗️'},
      {id:'comercial',label:'Proyecto comercial',icon:'🏪'},{id:'inversion',label:'Inversión / plusvalía',icon:'💰'}]},
    { id:'zona', msg:'¿En qué comunas te interesa buscar? Puedes seleccionar más de una.', tipo:'multi_comuna', opts:[
      {id:'cerrillos',label:'Cerrillos',icon:'📍'},
      {id:'cerro_navia',label:'Cerro Navia',icon:'📍'},
      {id:'conchalí',label:'Conchalí',icon:'📍'},
      {id:'el_bosque',label:'El Bosque',icon:'📍'},
      {id:'estación_central',label:'Estación Central',icon:'📍'},
      {id:'huechuraba',label:'Huechuraba',icon:'📍'},
      {id:'independencia',label:'Independencia',icon:'📍'},
      {id:'la_cisterna',label:'La Cisterna',icon:'📍'},
      {id:'la_florida',label:'La Florida',icon:'📍'},
      {id:'la_granja',label:'La Granja',icon:'📍'},
      {id:'la_pintana',label:'La Pintana',icon:'📍'},
      {id:'la_reina',label:'La Reina',icon:'📍'},
      {id:'las_condes',label:'Las Condes',icon:'📍'},
      {id:'lo_barnechea',label:'Lo Barnechea',icon:'📍'},
      {id:'lo_espejo',label:'Lo Espejo',icon:'📍'},
      {id:'lo_prado',label:'Lo Prado',icon:'📍'},
      {id:'macul',label:'Macul',icon:'📍'},
      {id:'maipú',label:'Maipú',icon:'📍'},
      {id:'nunoa',label:'Ñuñoa',icon:'📍'},
      {id:'penalolén',label:'Peñalolén',icon:'📍'},
      {id:'providencia',label:'Providencia',icon:'📍'},
      {id:'pudahuel',label:'Pudahuel',icon:'📍'},
      {id:'puente_alto',label:'Puente Alto',icon:'📍'},
      {id:'quilicura',label:'Quilicura',icon:'📍'},
      {id:'quinta_normal',label:'Quinta Normal',icon:'📍'},
      {id:'recoleta',label:'Recoleta',icon:'📍'},
      {id:'renca',label:'Renca',icon:'📍'},
      {id:'san_bernardo',label:'San Bernardo',icon:'📍'},
      {id:'san_joaquín',label:'San Joaquín',icon:'📍'},
      {id:'san_miguel',label:'San Miguel',icon:'📍'},
      {id:'san_ramón',label:'San Ramón',icon:'📍'},
      {id:'santiago',label:'Santiago',icon:'📍'},
      {id:'vitacura',label:'Vitacura',icon:'📍'},
    ]},
    { id:'urgencia', msg:'¿Cuándo quieres comprar?', tipo:'options', opts:[
      {id:'inmediato',label:'Lo antes posible',icon:'⚡'},{id:'3_6_meses',label:'En 3 a 6 meses',icon:'📅'},
      {id:'sin_prisa',label:'Sin apuro',icon:'🔍'}]},
  ],
  comercial: [
    { id:'presupuesto', msg:'¿Cuál es tu presupuesto?', tipo:'options', opts:[
      {id:'hasta_3000',label:'Hasta 3.000 UF',icon:'💚'},{id:'3000_8000',label:'3.000 – 8.000 UF',icon:'💛'},
      {id:'8000_20000',label:'8.000 – 20.000 UF',icon:'🟠'},{id:'mas_20000',label:'Más de 20.000 UF',icon:'⭐'}]},
    { id:'subtipo', msg:'¿Qué tipo de propiedad comercial buscas?', tipo:'options', opts:[
      {id:'local',label:'Local comercial',icon:'🏪'},{id:'bodega',label:'Bodega / Galpón',icon:'🏭'},
      {id:'edificio',label:'Edificio completo',icon:'🏢'},{id:'nave',label:'Nave industrial',icon:'🏗️'}]},
    { id:'superficie', msg:'¿Qué superficie necesitas?', tipo:'options', opts:[
      {id:'hasta_100',label:'Hasta 100 m²',icon:'📐'},{id:'100_500',label:'100 – 500 m²',icon:'📏'},
      {id:'500_2000',label:'500 – 2.000 m²',icon:'🗺️'},{id:'mas_2000',label:'Más de 2.000 m²',icon:'🏞️'}]},
    { id:'zona', msg:'¿En qué comunas te interesa buscar? Puedes seleccionar más de una.', tipo:'multi_comuna', opts:[
      {id:'cerrillos',label:'Cerrillos',icon:'📍'},
      {id:'cerro_navia',label:'Cerro Navia',icon:'📍'},
      {id:'conchalí',label:'Conchalí',icon:'📍'},
      {id:'el_bosque',label:'El Bosque',icon:'📍'},
      {id:'estación_central',label:'Estación Central',icon:'📍'},
      {id:'huechuraba',label:'Huechuraba',icon:'📍'},
      {id:'independencia',label:'Independencia',icon:'📍'},
      {id:'la_cisterna',label:'La Cisterna',icon:'📍'},
      {id:'la_florida',label:'La Florida',icon:'📍'},
      {id:'la_granja',label:'La Granja',icon:'📍'},
      {id:'la_pintana',label:'La Pintana',icon:'📍'},
      {id:'la_reina',label:'La Reina',icon:'📍'},
      {id:'las_condes',label:'Las Condes',icon:'📍'},
      {id:'lo_barnechea',label:'Lo Barnechea',icon:'📍'},
      {id:'lo_espejo',label:'Lo Espejo',icon:'📍'},
      {id:'lo_prado',label:'Lo Prado',icon:'📍'},
      {id:'macul',label:'Macul',icon:'📍'},
      {id:'maipú',label:'Maipú',icon:'📍'},
      {id:'nunoa',label:'Ñuñoa',icon:'📍'},
      {id:'penalolén',label:'Peñalolén',icon:'📍'},
      {id:'providencia',label:'Providencia',icon:'📍'},
      {id:'pudahuel',label:'Pudahuel',icon:'📍'},
      {id:'puente_alto',label:'Puente Alto',icon:'📍'},
      {id:'quilicura',label:'Quilicura',icon:'📍'},
      {id:'quinta_normal',label:'Quinta Normal',icon:'📍'},
      {id:'recoleta',label:'Recoleta',icon:'📍'},
      {id:'renca',label:'Renca',icon:'📍'},
      {id:'san_bernardo',label:'San Bernardo',icon:'📍'},
      {id:'san_joaquín',label:'San Joaquín',icon:'📍'},
      {id:'san_miguel',label:'San Miguel',icon:'📍'},
      {id:'san_ramón',label:'San Ramón',icon:'📍'},
      {id:'santiago',label:'Santiago',icon:'📍'},
      {id:'vitacura',label:'Vitacura',icon:'📍'},
    ]},
    { id:'uso', msg:'¿Para qué es?', tipo:'options', opts:[
      {id:'operar',label:'Operar mi negocio',icon:'💼'},{id:'arrendar',label:'Arrendar / inversión',icon:'💰'},
      {id:'desarrollar',label:'Desarrollar proyecto',icon:'🏗️'}]},
  ],
}

// ─── Formulario Comprador (form rápido + mapa) ──────────────────────────────
const FC_TIPOS = [
  { id: 'casa', label: 'Casa', icon: '🏠' },
  { id: 'departamento', label: 'Departamento', icon: '🏢' },
  { id: 'oficina', label: 'Oficina', icon: '🏛️' },
  { id: 'comercial', label: 'Comercial', icon: '🏪' },
  { id: 'terreno', label: 'Terreno', icon: '🌳' },
]
const FC_PRES = [
  { id: 'hasta_3000', label: 'Hasta 3.000 UF', mid: 2500 },
  { id: '3000_5000', label: '3.000 – 5.000 UF', mid: 4000 },
  { id: '5000_8000', label: '5.000 – 8.000 UF', mid: 6500 },
  { id: '8000_12000', label: '8.000 – 12.000 UF', mid: 10000 },
  { id: '12000_18000', label: '12.000 – 18.000 UF', mid: 15000 },
  { id: '18000_25000', label: '18.000 – 25.000 UF', mid: 21500 },
  { id: 'mas_25000', label: '25.000 UF o más', mid: 30000 },
]
const FC_DORMS = ['1', '2', '3', '4+']
const FC_BANOS = ['1', '2', '3+']
const FC_CARACT = [
  { id: 'estacionamiento', label: 'Estacionamiento' },
  { id: 'bodega', label: 'Bodega' },
  { id: 'terraza', label: 'Terraza/balcón' },
  { id: 'piscina', label: 'Piscina' },
  { id: 'gimnasio', label: 'Gimnasio' },
  { id: 'conserje', label: 'Conserje 24/7' },
]
const FC_COMUNAS = ['Cerrillos','Cerro Navia','Conchalí','El Bosque','Estación Central','Huechuraba','Independencia','La Cisterna','La Florida','La Granja','La Pintana','La Reina','Las Condes','Lo Barnechea','Lo Espejo','Lo Prado','Macul','Maipú','Ñuñoa','Peñalolén','Providencia','Pudahuel','Puente Alto','Quilicura','Quinta Normal','Recoleta','Renca','San Bernardo','San Joaquín','San Miguel','San Ramón','Santiago','Vitacura']

// Barrios de NORMATIVA HOMOGÉNEA por comuna (piloto Las Condes). Cada barrio agrupa
// sectores con misma subdivisión predial mínima, densidad y constructibilidad, por lo
// que el UF/m² de terreno es parecido dentro del barrio. `query` se geocodifica para
// ubicar el sector. Valores de normativa REFERENCIALES (confirmar con Ordenanza/DOM).
const B = (id, label, query, densidad, predial, constructibilidad) => ({ id, label, query, densidad, predial, constructibilidad })
const BARRIOS = {
  'Las Condes': [
    B('el_golf','El Golf / Nueva Las Condes','El Golf, Las Condes','Alta (altura)','predios de edificación (deptos/oficinas)','Alta'),
    B('san_damian','San Damián','San Damián, Las Condes','Baja','~600–1.000 m²','Baja'),
    B('cumbres','Cumbres de Manquehue','Cumbres de Manquehue, Las Condes','Baja–media','~500–800 m²','Baja–media'),
    B('estoril','Estoril','Estoril, Las Condes','Media–baja','~400–600 m²','Media'),
    B('los_dominicos','Los Dominicos','Los Dominicos, Las Condes','Media','~300–500 m²','Media'),
    B('el_arrayan','El Arrayán','El Arrayán, Las Condes','Baja','~1.000 m² o más','Baja'),
  ],
  'Vitacura': [
    B('sta_maria','Santa María de Manquehue','Santa María de Manquehue, Vitacura','Baja','~1.000 m²','Baja'),
    B('lo_curro','Lo Curro','Lo Curro, Vitacura','Baja','sitios grandes con vista (~800–1.500 m²)','Baja'),
    B('jardin_este','Jardín del Este','Jardín del Este, Vitacura','Baja–media','~500–800 m²','Baja–media'),
    B('nueva_costanera','Nueva Costanera / Bicentenario','Nueva Costanera, Vitacura','Alta','predios de edificación (deptos/comercio)','Alta'),
    B('tabancura','Tabancura','Tabancura, Vitacura','Media','~400–600 m²','Media'),
  ],
  'Lo Barnechea': [
    B('la_dehesa','La Dehesa','La Dehesa, Lo Barnechea','Media–baja','~400–800 m² (mixto)','Media'),
    B('lo_barnechea_arrayan','El Arrayán (Lo Barnechea)','El Arrayán, Lo Barnechea','Baja','sitios grandes / semi-rural','Baja'),
    B('los_trapenses','Los Trapenses','Los Trapenses, Lo Barnechea','Baja–media','condominios (~400–700 m²)','Baja–media'),
    B('cerro18','Cerro 18 / Valle Norte','Cerro 18, Lo Barnechea','Baja','parcelas / sitios grandes','Baja'),
    B('el_huinganal','El Huinganal / La Dehesa alta','El Huinganal, Lo Barnechea','Baja','~1.000 m² o más','Baja'),
  ],
  'Providencia': [
    B('pedro_valdivia_n','Pedro de Valdivia Norte','Pedro de Valdivia Norte, Providencia','Media','casas + deptos (~300–500 m²)','Media'),
    B('barrio_italia','Barrio Italia','Barrio Italia, Providencia','Media','casas antiguas / comercio','Media'),
    B('los_leones','Los Leones / El Aguilucho','Los Leones, Providencia','Alta','predios de edificación (deptos)','Alta'),
    B('pocuro','Pocuro / Manuel Montt','Manuel Montt, Providencia','Media–alta','~250–450 m²','Media–alta'),
    B('bellavista','Bellavista','Bellavista, Providencia','Media','patrimonial','Media'),
  ],
  'Ñuñoa': [
    B('plaza_nunoa','Plaza Ñuñoa','Plaza Ñuñoa, Ñuñoa','Media–alta','mixto (~250–450 m²)','Media–alta'),
    B('suarez_mujica','Suárez Mujica / Irarrázaval','Suárez Mujica, Ñuñoa','Media','~300–500 m²','Media'),
    B('villa_frei','Villa Frei','Villa Frei, Ñuñoa','Media','conjunto de bloques','Media'),
    B('plaza_egana','Plaza Egaña','Plaza Egaña, Ñuñoa','Alta','deptos nuevos en altura','Alta'),
    B('estadio_nacional','Estadio Nacional / Amapolas','Estadio Nacional, Ñuñoa','Media','~300–500 m²','Media'),
  ],
  'La Reina': [
    B('la_reina_alta','La Reina Alta / Aguas Claras','Aguas Claras, La Reina','Baja','sitios grandes (~600–1.000 m²)','Baja'),
    B('la_reina_centro','La Reina Centro','La Reina Centro','Media','~400–600 m²','Media'),
    B('villa_la_reina','Villa La Reina','Villa La Reina, La Reina','Media–baja','~200–400 m²','Media–baja'),
  ],
  'Peñalolén': [
    B('penalolen_alto','Peñalolén Alto / Quebrada de Macul','Peñalolén Alto','Baja–media','~400–700 m²','Baja–media'),
    B('lo_hermida','Lo Hermida','Lo Hermida, Peñalolén','Media','~200–400 m²','Media'),
    B('san_luis_macul','San Luis de Macul','San Luis, Peñalolén','Media','condominios','Media'),
  ],
  'La Florida': [
    B('walker_martinez','La Florida Centro / Walker Martínez','Walker Martínez, La Florida','Media','~250–450 m²','Media'),
    B('vicuna_mackenna','Vicuña Mackenna','Vicuña Mackenna, La Florida','Alta','deptos en altura','Alta'),
    B('rojas_magallanes','Trinidad / Rojas Magallanes','Rojas Magallanes, La Florida','Media','condominios','Media'),
  ],
  'Macul': [
    B('macul_centro','Macul Centro','Macul Centro','Media','~250–450 m²','Media'),
    B('quilin','Quilín','Quilín, Macul','Media','~300–500 m²','Media'),
  ],
  'San Miguel': [
    B('el_llano','El Llano','El Llano, San Miguel','Media','patrimonial (~250–400 m²)','Media'),
    B('gran_avenida','Gran Avenida','Gran Avenida, San Miguel','Alta','deptos en altura','Alta'),
  ],
  'Maipú': [
    B('maipu_centro','Maipú Centro','Maipú Centro','Media','~200–400 m²','Media'),
    B('ciudad_satelite','Ciudad Satélite','Ciudad Satélite, Maipú','Media–baja','~200–350 m²','Media–baja'),
    B('rinconada','Maipú Sur / Rinconada','Rinconada, Maipú','Media–baja','condominios','Media–baja'),
  ],
  'Santiago': [
    B('lastarria','Lastarria / Bellas Artes','Lastarria, Santiago','Alta','patrimonial (altura)','Alta'),
    B('brasil_yungay','Brasil / Yungay','Barrio Yungay, Santiago','Media','patrimonial','Media'),
    B('republica','República','Barrio República, Santiago','Alta','deptos en altura','Alta'),
    B('matta','Parque Almagro / Matta','Avenida Matta, Santiago','Alta','deptos en altura','Alta'),
  ],
  'Huechuraba': [
    B('pedro_fontova','Pedro Fontova','Pedro Fontova, Huechuraba','Media','~250–450 m²','Media'),
    B('bosques_santiago','Bosques de Santiago','Bosques de Santiago, Huechuraba','Baja','condominios (~400–700 m²)','Baja'),
  ],
  'Puente Alto': [
    B('pa_centro','Puente Alto Centro','Puente Alto Centro','Media','~150–350 m²','Media'),
    B('eyzaguirre','Eyzaguirre / Las Vizcachas','Eyzaguirre, Puente Alto','Media–baja','condominios','Media–baja'),
  ],
  'Quilicura': [
    B('quilicura_centro','Quilicura Centro','Quilicura Centro','Media','~150–300 m²','Media'),
    B('valle_grande','Valle Grande','Valle Grande, Quilicura','Media–baja','condominios','Media–baja'),
  ],
}

// Carga Google Maps (con drawing) UNA sola vez para toda la app.
let __fcMapsPromise = null
function fcLoadGmaps() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.google && window.google.maps && window.google.maps.drawing) return Promise.resolve()
  if (__fcMapsPromise) return __fcMapsPromise
  __fcMapsPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById('fc-gmaps')
    if (existing) { existing.addEventListener('load', () => resolve()); return }
    const key = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY || ''
    const s = document.createElement('script')
    s.id = 'fc-gmaps'
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,drawing&language=es&region=CL`
    s.async = true
    s.onload = () => resolve()
    s.onerror = reject
    document.head.appendChild(s)
  })
  return __fcMapsPromise
}

function FCBold({ text }) {
  return (
    <>
      {String(text || '').split('\n').map((rawLine, i) => {
        // Separadores Markdown (---, ***, ___): mostrar una línea sutil, no el texto.
        if (/^\s*[-*_]{2,}\s*$/.test(rawLine)) {
          return <div key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.12)', margin: '10px 0' }} />
        }
        // Encabezados Markdown (#, ##, ###): quitar los # y mostrar la línea en negrita.
        const head = rawLine.match(/^\s*#{1,6}\s+(.*)$/)
        const line = head ? head[1] : rawLine
        const isHead = !!head
        return (
          <div key={i} style={{ minHeight: line ? 'auto' : '8px', fontWeight: isHead ? 700 : undefined, marginTop: isHead ? 8 : undefined }}>
            {line.split(/\*\*(.*?)\*\*/g).map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p))}
          </div>
        )
      })}
    </>
  )
}

// Ficha de propiedad (modal, diseño propio) — se abre al pinchar una venta del mapa.
const FC_DESTINO = { H: 'Habitacional', A: 'Bodega/Almacén', B: 'Bodega', C: 'Comercio', D: 'Educación/Culto', E: 'Educación', G: 'Hotel/Turismo', I: 'Industria', P: 'Estacionamiento', S: 'Sitio/Terreno' }
function FichaPropiedad({ venta, onClose }) {
  const satRef = useRef(null)
  useEffect(() => {
    if (!venta) return
    let cancel = false
    fcLoadGmaps().then(() => {
      const g = window.google && window.google.maps
      if (cancel || !g || !satRef.current) return
      const m = new g.Map(satRef.current, { center: { lat: venta.lat, lng: venta.lng }, zoom: 19, mapTypeId: 'satellite', mapTypeControl: false, streetViewControl: false, fullscreenControl: false })
      new g.Marker({ position: { lat: venta.lat, lng: venta.lng }, map: m })
    })
    return () => { cancel = true }
  }, [venta])
  if (!venta) return null
  const ufStr = (n) => (n ? Number(n).toLocaleString('es-CL') + ' UF' : '—')
  const clpStr = (n) => (n ? '$' + Number(n).toLocaleString('es-CL') : '—')
  const destino = FC_DESTINO[venta.destino] || venta.destino || '—'
  const items = [
    ['Precio de venta', ufStr(venta.uf)],
    ['UF/m²', venta.uf_m2 ? venta.uf_m2 + ' UF/m²' : '—'],
    ['Fecha de venta', venta.fecha || '—'],
    ['Sup. construida', venta.m2 ? venta.m2 + ' m²' : '—'],
    ['Sup. terreno', venta.m2_terreno ? venta.m2_terreno + ' m²' : '—'],
    ['Año construcción', venta.ano || '—'],
    ['Destino', destino],
    ['Avalúo fiscal', clpStr(venta.avaluo_clp)],
    ['Contribuciones', venta.contrib_clp ? clpStr(venta.contrib_clp) + ' /trim.' : '—'],
    ['ROL', venta.rol || '—'],
  ]
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', color: '#1a1a1a', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#c0392b', fontWeight: 700 }}>Detalle de propiedad</div>
            <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{venta.dir || 'Propiedad'}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f1f1', borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: 'pointer', color: '#555' }}>×</button>
        </div>
        <div ref={satRef} style={{ width: '100%', height: 220, background: '#e9e9e9' }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#eee' }}>
          {items.map(([l, val], i) => (
            <div key={i} style={{ background: '#fff', padding: '12px 16px' }}>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>{l}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 16px', fontSize: 11, color: '#999', borderTop: '1px solid #eee' }}>Datos de transacciones registradas (CBR/SII). Propietario y material: próximamente.</div>
      </div>
    </div>
  )
}

// Ficha de una OFERTA (aviso de portal) — foto + datos + link al aviso original.
function FichaOferta({ oferta, onClose }) {
  if (!oferta) return null
  const o = oferta
  const precio = o.precio ? (o.moneda === 'UF' || !o.moneda ? Number(o.precio).toLocaleString('es-CL') + ' UF' : '$' + Number(o.precio).toLocaleString('es-CL')) : 'Precio no informado'
  const chips = [o.dorms != null ? o.dorms + ' dorm.' : null, o.banos != null ? o.banos + (o.banos === 1 ? ' baño' : ' baños') : null, o.m2 ? o.m2 + ' m²' : null].filter(Boolean)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', color: '#1a1a1a', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
        <div style={{ position: 'relative' }}>
          {o.imagen
            ? <img src={o.imagen} alt="" style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block' }} />
            : <div style={{ width: '100%', height: 140, background: '#e9e9e9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>Sin foto</div>}
          <button onClick={onClose} style={{ position: 'absolute', top: 10, right: 10, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#2563eb', fontWeight: 700 }}>Oferta vigente</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>{o.titulo || o.dir || 'Propiedad en venta'}</div>
          {o.dir && o.titulo && <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>{o.dir}</div>}
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 10 }}>{precio}</div>
          {chips.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>{chips.map((c, i) => <span key={i} style={{ background: '#f1f1f1', borderRadius: 8, padding: '4px 10px', fontSize: 13 }}>{c}</span>)}</div>}
          <div style={{ marginTop: 12, fontSize: 13, color: '#555' }}>{[o.inmobiliaria, o.fecha ? 'Publicado: ' + o.fecha : null].filter(Boolean).join(' · ')}</div>
          {o.url && <a href={o.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', marginTop: 16, background: '#2563eb', color: '#fff', textDecoration: 'none', padding: '11px', borderRadius: 10, fontWeight: 700 }}>Ver aviso original ↗</a>}
        </div>
      </div>
    </div>
  )
}

// Mapa de OFERTAS (avisos de portales) — pines azules + ficha con foto y link.
function OfertasMapa({ ofertas }) {
  const mapRef = useRef(null)
  const mkRef = useRef([])
  const [sel, setSel] = useState(null)
  const fmtK = (n) => { if (!n) return ''; if (n < 1000) return String(n); const k = Math.round(n / 100) / 10; return (Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)).replace('.', ',') + 'K' }
  const label = (o) => { if (!o.precio) return 's/p'; if (o.moneda === 'UF' || !o.moneda) return fmtK(o.precio) + ' UF'; const m = o.precio; return m >= 1000000 ? '$' + (Math.round(m / 100000) / 10).toString().replace('.', ',') + 'M' : '$' + Math.round(m / 1000) + 'K' }
  const precioStr = (o) => (o.precio ? (o.moneda === 'UF' || !o.moneda ? Number(o.precio).toLocaleString('es-CL') + ' UF' : '$' + Number(o.precio).toLocaleString('es-CL')) : '')
  useEffect(() => {
    if (!Array.isArray(ofertas) || ofertas.length === 0) return
    let cancel = false
    fcLoadGmaps().then(() => {
      const g = window.google && window.google.maps
      if (cancel || !g) return
      const tryInit = (n) => {
        if (cancel) return
        if (!mapRef.current) { if (n > 0) setTimeout(() => tryInit(n - 1), 150); return }
        const map = new g.Map(mapRef.current, { mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false })
        const bounds = new g.LatLngBounds()
        ofertas.forEach((o) => bounds.extend({ lat: o.lat, lng: o.lng }))
        map.fitBounds(bounds, 40)
        const pillIcon = (txt) => {
          const w = Math.ceil(18 + txt.length * 7)
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22"><rect rx="11" ry="11" width="${w}" height="22" fill="#2563eb"/><text x="${w / 2}" y="15" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">${txt}</text></svg>`
          return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), anchor: new g.Point(Math.round(w / 2), 11) }
        }
        const clusterIcon = (count) => {
          const d = count >= 100 ? 46 : count >= 10 ? 40 : 34
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 2}" fill="#1e3a8a" stroke="#ffffff" stroke-width="2"/><text x="${d / 2}" y="${d / 2 + 4}" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">${count}</text></svg>`
          return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), anchor: new g.Point(Math.round(d / 2), Math.round(d / 2)) }
        }
        const clearMk = () => { mkRef.current.forEach((m) => m.setMap(null)); mkRef.current = [] }
        const render = () => {
          clearMk()
          const zoom = map.getZoom() || 13
          const cell = 80 / Math.pow(2, zoom)
          const groups = {}
          ofertas.forEach((o) => { const key = Math.floor(o.lat / cell) + '_' + Math.floor(o.lng / cell); (groups[key] = groups[key] || []).push(o) })
          Object.keys(groups).forEach((k) => {
            const arr = groups[k]
            if (arr.length === 1) {
              const o = arr[0]
              const mk = new g.Marker({ position: { lat: o.lat, lng: o.lng }, map, icon: pillIcon(label(o)) })
              mk.addListener('click', () => setSel(o))
              mkRef.current.push(mk)
            } else {
              let la = 0, ln = 0
              arr.forEach((o) => { la += o.lat; ln += o.lng })
              const c = { lat: la / arr.length, lng: ln / arr.length }
              const mk = new g.Marker({ position: c, map, icon: clusterIcon(arr.length) })
              mk.addListener('click', () => { map.setZoom(Math.min((map.getZoom() || 13) + 2, 20)); map.panTo(c) })
              mkRef.current.push(mk)
            }
          })
        }
        render()
        map.addListener('idle', render)
      }
      tryInit(25)
    })
    return () => { cancel = true }
  }, [ofertas])
  if (!Array.isArray(ofertas)) return <div style={{ marginTop: 14, color: '#9a9a9a', fontSize: 14 }}>Buscando ofertas…</div>
  if (ofertas.length === 0) return <div style={{ marginTop: 14, color: '#9a9a9a', fontSize: 14 }}>No encontré ofertas vigentes en este sector.</div>
  return (
    <>
      <div style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 700, color: 'var(--gold-light)', marginBottom: 8 }}>🏷️ Ofertas en venta en el sector ({ofertas.length})</div>
        <div ref={mapRef} style={{ width: '100%', height: 360, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }} />
        <div style={{ fontSize: 12, color: '#9a9a9a', marginTop: 6 }}>Avisos vigentes en portales. Tocá un pin azul o una fila para ver la foto y el enlace al aviso.</div>
        <div style={{ marginTop: 10, maxHeight: 280, overflow: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}>
          {ofertas.map((o, i) => (
            <div key={i} onClick={() => setSel(o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: i < ofertas.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', cursor: 'pointer' }}>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, color: '#e8e8e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.titulo || o.dir || 'Propiedad'}</div>
                <div style={{ fontSize: 11, color: '#9a9a9a' }}>{[o.dorms != null ? o.dorms + 'D' : null, o.banos != null ? o.banos + 'B' : null, o.m2 ? o.m2 + ' m²' : null, o.inmobiliaria].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-light)', whiteSpace: 'nowrap' }}>{precioStr(o)}</div>
            </div>
          ))}
        </div>
      </div>
      {sel && <FichaOferta oferta={sel} onClose={() => setSel(null)} />}
    </>
  )
}

// Mapa reutilizable de ventas (pastillas de precio + clusters), modelo Data Inmobiliaria.
function VentasMapa({ ventas, titulo }) {
  const mapRef = useRef(null)
  const mkRef = useRef([])
  const iwRef = useRef(null)
  const [sel, setSel] = useState(null)
  useEffect(() => {
    if (!Array.isArray(ventas) || ventas.length === 0) return
    let cancel = false
    fcLoadGmaps().then(() => {
      const g = window.google && window.google.maps
      if (cancel || !g) return
      const tryInit = (n) => {
        if (cancel) return
        if (!mapRef.current) { if (n > 0) setTimeout(() => tryInit(n - 1), 150); return }
        const map = new g.Map(mapRef.current, { mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false })
        iwRef.current = new g.InfoWindow()
        const bounds = new g.LatLngBounds()
        ventas.forEach((v) => bounds.extend({ lat: v.lat, lng: v.lng }))
        map.fitBounds(bounds, 40)
        const fmtK = (uf) => {
          if (uf < 1000) return String(uf)
          const k = Math.round(uf / 100) / 10
          return (Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)).replace('.', ',') + 'K'
        }
        const pillIcon = (txt) => {
          const w = Math.ceil(18 + txt.length * 7)
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22"><rect rx="11" ry="11" width="${w}" height="22" fill="#c0392b"/><text x="${w / 2}" y="15" font-family="Arial,sans-serif" font-size="11" font-weight="700" fill="#ffffff" text-anchor="middle">${txt}</text></svg>`
          return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), anchor: new g.Point(Math.round(w / 2), 11) }
        }
        const clusterIcon = (count) => {
          const d = count >= 100 ? 46 : count >= 10 ? 40 : 34
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 2}" fill="#1f2d3d" stroke="#ffffff" stroke-width="2"/><text x="${d / 2}" y="${d / 2 + 4}" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">${count}</text></svg>`
          return { url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg), anchor: new g.Point(Math.round(d / 2), Math.round(d / 2)) }
        }
        const clearMk = () => { mkRef.current.forEach((m) => m.setMap(null)); mkRef.current = [] }
        const med = (a) => { const x = [...a].sort((p, q) => p - q); const n = x.length; return n ? (n % 2 ? x[(n - 1) / 2] : Math.round((x[n / 2 - 1] + x[n / 2]) / 2)) : 0 }
        const clusterHtml = (arr) => {
          const ufs = arr.map((v) => v.uf).filter((x) => x > 0)
          const um2 = arr.map((v) => v.uf_m2).filter((x) => x > 0)
          const minU = ufs.length ? Math.min(...ufs) : 0
          const maxU = ufs.length ? Math.max(...ufs) : 0
          const recientes = [...arr].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 5)
          const items = recientes.map((v, idx) => `<div class="fc-cl-item" data-i="${idx}" style="display:flex;justify-content:space-between;gap:10px;padding:5px 4px;cursor:pointer;border-radius:6px;background:#f6f6f6;margin-bottom:3px"><span style="color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px">${v.dir || 'Venta'}</span><span style="font-weight:700;white-space:nowrap">${fmtK(v.uf)} UF</span></div>`).join('')
          const mas = arr.length > 5 ? `<div style="color:#888;font-size:11px;margin-top:4px">+${arr.length - 5} ventas más · acercá el mapa para separarlas</div>` : ''
          return `<div style="font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;max-width:250px"><div style="font-weight:700;color:#c0392b;margin-bottom:4px">${arr.length} ventas en esta zona</div><div>Mediana: <b>${fmtK(med(ufs))} UF</b> <span style="color:#888">(${fmtK(minU)}–${fmtK(maxU)})</span></div>${um2.length ? `<div>UF/m²: <b>${med(um2)}</b> mediana</div>` : ''}<div style="margin-top:6px;border-top:1px solid #eee;padding-top:6px"><div style="font-size:11px;color:#2563eb;margin-bottom:4px">Tocá una propiedad para ver su ficha:</div>${items}${mas}</div></div>`
        }
        const render = () => {
          clearMk()
          const zoom = map.getZoom() || 13
          const cell = 80 / Math.pow(2, zoom)
          const groups = {}
          ventas.forEach((v) => {
            const key = Math.floor(v.lat / cell) + '_' + Math.floor(v.lng / cell)
            ;(groups[key] = groups[key] || []).push(v)
          })
          Object.keys(groups).forEach((k) => {
            const arr = groups[k]
            if (arr.length === 1) {
              const v = arr[0]
              const mk = new g.Marker({ position: { lat: v.lat, lng: v.lng }, map, icon: pillIcon(fmtK(v.uf) + ' UF') })
              mk.addListener('click', () => setSel(v))
              mkRef.current.push(mk)
            } else {
              let la = 0, ln = 0
              arr.forEach((v) => { la += v.lat; ln += v.lng })
              const c = { lat: la / arr.length, lng: ln / arr.length }
              const mk = new g.Marker({ position: c, map, icon: clusterIcon(arr.length) })
              mk.addListener('click', () => {
                iwRef.current.setContent(clusterHtml(arr))
                iwRef.current.setPosition(c)
                iwRef.current.open(map)
                const recientes = [...arr].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 5)
                g.event.addListenerOnce(iwRef.current, 'domready', () => {
                  if (typeof document === 'undefined') return
                  document.querySelectorAll('.fc-cl-item').forEach((el) => {
                    el.addEventListener('click', () => { const ix = +el.getAttribute('data-i'); if (recientes[ix]) { iwRef.current.close(); setSel(recientes[ix]) } })
                  })
                })
              })
              mkRef.current.push(mk)
            }
          })
        }
        render()
        map.addListener('idle', render)
      }
      tryInit(25)
    })
    return () => { cancel = true }
  }, [ventas])
  if (!Array.isArray(ventas) || ventas.length === 0) return null
  return (
    <>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(202,161,90,0.25)' }}>
        <div style={{ fontWeight: 700, color: 'var(--gold-light)', marginBottom: 8 }}>🗺️ {titulo} ({ventas.length})</div>
        <div ref={mapRef} style={{ width: '100%', height: 360, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }} />
        <div style={{ fontSize: 12, color: '#9a9a9a', marginTop: 6 }}>Tocá una pastilla en el mapa, o una fila de la lista de abajo, para ver la ficha de la propiedad.</div>
        <div style={{ marginTop: 10, maxHeight: 280, overflow: 'auto', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)' }}>
          {ventas.map((v, i) => (
            <div key={i} onClick={() => setSel(v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: i < ventas.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', cursor: 'pointer' }}>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, color: '#e8e8e8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.dir || 'Propiedad'}</div>
                <div style={{ fontSize: 11, color: '#9a9a9a' }}>{[v.m2 ? v.m2 + ' m²' : null, v.fecha || null].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold-light)' }}>{v.uf ? v.uf.toLocaleString('es-CL') + ' UF' : ''}</div>
                {v.uf_m2 ? <div style={{ fontSize: 11, color: '#9a9a9a' }}>{v.uf_m2} UF/m²</div> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      {sel && <FichaPropiedad venta={sel} onClose={() => setSel(null)} />}
    </>
  )
}

function FormComprador({ onBack }) {
  const [tipo, setTipo] = useState('departamento')
  const [pres, setPres] = useState('5000_8000')
  const [presMax, setPresMax] = useState('')
  const [dorms, setDorms] = useState('2')
  const [banos, setBanos] = useState('1')
  const [m2, setM2] = useState('')
  const [caract, setCaract] = useState([])
  const [sectorMode, setSectorMode] = useState('comuna')
  const [comunas, setComunas] = useState([])
  const [barrioSel, setBarrioSel] = useState(null)
  const [polygon, setPolygon] = useState(null)
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [lastBody, setLastBody] = useState(null)
  const [vista, setVista] = useState('ventas')
  const [ofertas, setOfertas] = useState(null)
  const [ofLoading, setOfLoading] = useState(false)
  const [mensajes, setMensajes] = useState([])
  const [chatHistory, setChatHistory] = useState([])
  const [pregunta, setPregunta] = useState('')
  const [typing, setTyping] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const dmRef = useRef(null)
  const polyRef = useRef(null)
  const drawRef = useRef(null)

  const toggle = (arr, set, id) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])

  // Mapa de Google con dibujo de polígono
  useEffect(() => {
    if (sectorMode !== 'mapa') return
    let cancel = false
    fcLoadGmaps().then(() => {
      const g = window.google && window.google.maps
      if (cancel || !g) return
      const tryInit = (n) => {
        if (cancel) return
        if (!mapRef.current) { if (n > 0) setTimeout(() => tryInit(n - 1), 150); return }
        if (mapObj.current) return
        const map = new g.Map(mapRef.current, {
          center: { lat: -33.45, lng: -70.62 }, zoom: 12,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false,
        })
        mapObj.current = map

        // El DrawingManager fue eliminado de la API de Google Maps (v3.65+).
        // Implementamos el dibujo del polígono a mano: cada clic en el mapa
        // agrega un vértice; al tocar el primer punto se cierra el sector.
        const GOLD = '#caa15a'
        const st = { verts: [], markers: [], line: null, poly: null, closed: false }
        drawRef.current = st

        const refreshLine = () => {
          if (st.line) st.line.setMap(null)
          st.line = new g.Polyline({ path: st.verts, strokeColor: GOLD, strokeWeight: 2, map })
        }
        const closePoly = () => {
          if (st.closed || st.verts.length < 3) return
          st.closed = true
          if (st.line) { st.line.setMap(null); st.line = null }
          st.markers.forEach((m) => m.setMap(null)); st.markers = []
          const poly = new g.Polygon({
            paths: st.verts, fillColor: GOLD, fillOpacity: 0.2,
            strokeColor: GOLD, strokeWeight: 2, editable: true, clickable: false, map,
          })
          st.poly = poly
          polyRef.current = poly
          const read = () => setPolygon(poly.getPath().getArray().map((pt) => ({ lat: pt.lat(), lng: pt.lng() })))
          read()
          ;['set_at', 'insert_at', 'remove_at'].forEach((ev) => g.event.addListener(poly.getPath(), ev, read))
        }
        const addVertex = (latLng) => {
          if (st.closed) return
          const pt = { lat: latLng.lat(), lng: latLng.lng() }
          if (st.verts.length >= 3) {
            const f = st.verts[0]
            if (Math.abs(f.lat - pt.lat) < 1e-4 && Math.abs(f.lng - pt.lng) < 1e-4) { closePoly(); return }
          }
          st.verts.push(pt)
          const first = st.verts.length === 1
          const marker = new g.Marker({
            position: pt, map,
            icon: { path: g.SymbolPath.CIRCLE, scale: first ? 6 : 4, fillColor: GOLD, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 1 },
          })
          if (first) marker.addListener('click', closePoly)
          st.markers.push(marker)
          refreshLine()
        }
        st.reset = () => {
          if (st.poly) { st.poly.setMap(null); st.poly = null }
          if (st.line) { st.line.setMap(null); st.line = null }
          st.markers.forEach((m) => m.setMap(null)); st.markers = []
          st.verts = []; st.closed = false
          polyRef.current = null
          setPolygon(null)
        }
        g.event.addListener(map, 'click', (e) => addVertex(e.latLng))
      }
      tryInit(25)
    })
    return () => { cancel = true }
  }, [sectorMode])

  const limpiarPoligono = () => {
    if (drawRef.current && drawRef.current.reset) { drawRef.current.reset(); return }
    if (polyRef.current) { polyRef.current.setMap(null); polyRef.current = null }
    setPolygon(null)
  }

  const presMid = (FC_PRES.find((p) => p.id === pres) || {}).mid || null
  const presUF = presMax && parseFloat(presMax) > 0 ? parseFloat(presMax) : presMid

  const askIsidora = async (userMsg, history) => {
    const newHistory = [...history, { role: 'user', content: userMsg }]
    setChatHistory(newHistory)
    setTyping(true)
    try {
      const r = await fetch('/api/buscar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory, perfil: { tipo, presupuesto: pres, presupuesto_max_uf: presMax || null, dormitorios: dorms, banos, m2_objetivo: m2, zona: comunas, caracteristicas: caract }, propiedades_db: [] }),
      })
      const j = await r.json()
      setTyping(false)
      const resp = j.respuesta || 'Hubo un problema, intenta de nuevo.'
      setMensajes((m) => [...m, { role: 'agent', content: resp }])
      setChatHistory((h) => [...h, { role: 'assistant', content: resp }])
    } catch (e) {
      setTyping(false)
      setMensajes((m) => [...m, { role: 'agent', content: 'Hubo un problema conectándome. ¿Probamos de nuevo?' }])
    }
  }

  const verOfertas = async () => {
    setVista('ofertas')
    if (ofertas !== null || !lastBody) return
    setOfLoading(true)
    try {
      const r = await fetch('/api/ofertas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lastBody) })
      const j = await r.json()
      setOfertas(Array.isArray(j.ofertas) ? j.ofertas : [])
    } catch (e) { setOfertas([]) }
    setOfLoading(false)
  }

  const buscar = async () => {
    setLoading(true); setResultado(null); setMensajes([]); setEnviado(true)
    setOfertas(null); setVista('ventas')
    const body = { tipo, presupuesto_uf: presUF, m2_objetivo: m2 ? parseFloat(m2) : null }
    if (sectorMode === 'mapa' && polygon && polygon.length >= 3) body.polygon = polygon
    else if (barrioSel && comunas.length === 1) { body.comuna = comunas[0]; body.direccion = barrioSel.query }
    else if (comunas.length) body.comuna = comunas[0]
    setLastBody(body)
    let zj = null
    try { zj = await (await fetch('/api/zona', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json() } catch (e) {}
    setResultado(zj)
    setLoading(false)
    const sectorTxt = sectorMode === 'mapa' && polygon ? 'el sector que marqué en el mapa' : (barrioSel && comunas.length === 1 ? `${barrioSel.label} (${comunas[0]})` : comunas.join(', '))
    const barrioCtx = (barrioSel && comunas.length === 1)
      ? ` BARRIO ELEGIDO: ${barrioSel.label}, en ${comunas[0]}. Normativa referencial del barrio: densidad ${barrioSel.densidad}, subdivisión predial mínima ${barrioSel.predial}, constructibilidad ${barrioSel.constructibilidad}. Como la normativa es homogénea en este barrio, el UF/m² de terreno es parecido en todo él — explícalo así.`
      : ''
    let ctx = ''
    if (zj && zj._modo === 'real') {
      const ps = zj.precio_sector
      ctx = ` DATOS REALES DEL SECTOR (ventas CBR del Conservador, SOLO ${zj.tipo}): UF/m2 construido de mercado mediana ${ps.uf_m2_mediana} (rango ${ps.uf_m2_p25}-${ps.uf_m2_p75}), ${ps.n_comparables} comparables, confianza ${ps.confianza}.`
      // Casas: tasación aditiva (suelo + construcción = total).
      const vz = zj.valorizacion
      if (vz && vz.suelo) {
        const s = vz.suelo
        ctx += ` TASACIÓN ADITIVA DE LA CASA: VALOR DE SUELO = ${s.uf_m2_mediana} UF/m2 de terreno (rango ${s.uf_m2_p25}-${s.uf_m2_p75}, fuente ${s.fuente}) multiplicado por los m2 del terreno. CONSTRUCCIÓN según estado (UF/m2 construido): a estrenar ${vz.construccion_costo_uf_m2.nueva.min}-${vz.construccion_costo_uf_m2.nueva.max}, buena ${vz.construccion_costo_uf_m2.buena.min}-${vz.construccion_costo_uf_m2.buena.max}, regular ${vz.construccion_costo_uf_m2.regular.min}-${vz.construccion_costo_uf_m2.regular.max}, a refaccionar ${vz.construccion_costo_uf_m2.mala.min}-${vz.construccion_costo_uf_m2.mala.max}. TOTAL = suelo + construcción.`
        if (vz.total_ejemplo) {
          const te = vz.total_ejemplo, pe = te.por_estado
          ctx += ` TOTAL EJEMPLO para una casa tipo del sector (${te.terreno_m2} m2 terreno + ${te.construido_m2} m2 construidos): nueva ${pe.nueva.uf_min}-${pe.nueva.uf_max} UF, buena ${pe.buena.uf_min}-${pe.buena.uf_max} UF, regular ${pe.regular.uf_min}-${pe.regular.uf_max} UF, a refaccionar ${pe.mala.uf_min}-${pe.mala.uf_max} UF.`
        }
        if (vz.suelo_por_tramo && vz.suelo_por_tramo.length) {
          ctx += ` VALOR DE SUELO POR TAMAÑO DE SITIO (refleja la normativa del sector): ` + vz.suelo_por_tramo.map((t) => `${t.rango} ${t.uf_m2_mediana} UF/m2 (${t.n} ventas)`).join('; ') + `. Regla: a mayor tamaño de sitio MENOR UF/m2 de terreno; sitios chicos MAYOR UF/m2.`
        }
        if (vz.prc_zona && vz.prc_zona.zona) {
          ctx += ` NORMATIVA PRC (oficial): el punto está en la zona ${vz.prc_zona.zona} (${vz.prc_zona.nombre}), densidad ${vz.prc_zona.clase}, superficie predial mínima aprox ${vz.prc_zona.predial_min_aprox} m² (referencial, confirmar con la Ordenanza/DOM). Explica con esto por qué los sitios de este sector tienen ese tamaño y ese UF/m2.`
        }
        ctx += ` Presenta SIEMPRE el valor de la casa como suelo + construcción = total, con rango según estado, y aclara la microzona/normativa según el tamaño del sitio.`
      }
      ctx += ` Usa estos números reales para el reality check y la estimación.`
    }
    const caractTxt = caract.length ? caract.join(', ') : 'sin preferencia'
    const presTxt = presMax && parseFloat(presMax) > 0 ? `hasta ${parseFloat(presMax).toLocaleString('es-CL')} UF` : pres.replace(/_/g, ' ') + ' UF'
    const userMsg = `Busco ${tipo}, presupuesto ${presTxt}, ${dorms} dormitorios, ${banos} baños${m2 ? ', ~' + m2 + ' m²' : ''}, en ${sectorTxt}. Imprescindibles: ${caractTxt}.${barrioCtx}${ctx} Dame tu análisis experto: si mi presupuesto es realista para esto en esa zona, qué puedo esperar, y las mejores oportunidades. Si no alcanza, sugiere comunas colindantes.`
    await askIsidora(userMsg, [])
  }

  const enviarPregunta = async () => {
    const v = pregunta.trim()
    if (!v) return
    setPregunta('')
    setMensajes((m) => [...m, { role: 'user', content: v }])
    await askIsidora(v, chatHistory)
  }

  const sectorListo = sectorMode === 'comuna' ? comunas.length > 0 : !!(polygon && polygon.length >= 3)
  const chip = (active) => ({ padding: '8px 14px', borderRadius: 20, border: '1px solid ' + (active ? 'var(--gold)' : 'rgba(255,255,255,0.18)'), background: active ? 'var(--gold-dim)' : 'transparent', color: active ? 'var(--gold-light)' : '#cfcfcf', cursor: 'pointer', fontSize: 14, transition: 'all .15s' })
  const sec = { marginBottom: 18 }
  const lbl = { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#9a9a9a', marginBottom: 8 }
  const row = { display: 'flex', flexWrap: 'wrap', gap: 8 }
  const inp = { padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'transparent', color: '#fff', fontSize: 14 }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 18px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <a className="back-btn" href="https://greatdeal-platform.vercel.app" style={{display:'inline-flex',alignItems:'center',justifyContent:'center',textDecoration:'none'}}>←</a>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Isidora · Asesora de Compra</div>
          <div style={{ fontSize: 13, color: '#8a8a8a' }}>Contame qué buscás y te digo el precio real del sector</div>
        </div>
      </div>
      <div style={sec}>
        <div style={lbl}>Tipo de propiedad</div>
        <div style={row}>{FC_TIPOS.map((t) => <div key={t.id} style={chip(tipo === t.id)} onClick={() => setTipo(t.id)}>{t.icon} {t.label}</div>)}</div>
      </div>
      <div style={sec}>
        <div style={lbl}>Presupuesto</div>
        <div style={row}>{FC_PRES.map((p) => <div key={p.id} style={chip(pres === p.id)} onClick={() => setPres(p.id)}>{p.label}</div>)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 13, color: '#9a9a9a' }}>o tu máximo exacto:</span>
          <input value={presMax} onChange={(e) => setPresMax(e.target.value.replace(/[^0-9]/g, ''))} placeholder="ej: 9.500" inputMode="numeric" style={{ ...inp, width: 130 }} />
          <span style={{ fontSize: 13, color: '#9a9a9a' }}>UF</span>
        </div>
      </div>
      <div style={{ ...sec, display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        <div>
          <div style={lbl}>Dormitorios</div>
          <div style={row}>{FC_DORMS.map((d) => <div key={d} style={chip(dorms === d)} onClick={() => setDorms(d)}>{d}</div>)}</div>
        </div>
        <div>
          <div style={lbl}>Baños</div>
          <div style={row}>{FC_BANOS.map((b) => <div key={b} style={chip(banos === b)} onClick={() => setBanos(b)}>{b}</div>)}</div>
        </div>
        <div>
          <div style={lbl}>M² aprox (opcional)</div>
          <input value={m2} onChange={(e) => setM2(e.target.value.replace(/[^0-9]/g, ''))} placeholder="ej: 70" inputMode="numeric" style={{ ...inp, width: 110 }} />
        </div>
      </div>
      <div style={sec}>
        <div style={lbl}>Imprescindibles</div>
        <div style={row}>{FC_CARACT.map((c) => <div key={c.id} style={chip(caract.includes(c.id))} onClick={() => toggle(caract, setCaract, c.id)}>{c.label}</div>)}</div>
      </div>
      <div style={sec}>
        <div style={lbl}>¿Dónde buscás?</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={chip(sectorMode === 'comuna')} onClick={() => setSectorMode('comuna')}>📍 Por comunas</div>
          <div style={chip(sectorMode === 'mapa')} onClick={() => setSectorMode('mapa')}>🗺️ Dibujar en el mapa</div>
        </div>
        {sectorMode === 'comuna' ? (
          <div>
            <div style={row}>{FC_COMUNAS.map((c) => <div key={c} style={chip(comunas.includes(c))} onClick={() => { toggle(comunas, setComunas, c); setBarrioSel(null) }}>{c}</div>)}</div>
            {comunas.length === 1 && BARRIOS[comunas[0]] && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13, color: '#9a9a9a', marginBottom: 8 }}>Afina por <strong>barrio de normativa homogénea</strong> en {comunas[0]} (misma subdivisión mínima, densidad y constructibilidad ⇒ UF/m² de terreno parejo). Opcional, o usa 🗺️ "Dibujar en el mapa" arriba.</div>
                <div style={row}>{BARRIOS[comunas[0]].map((b) => <div key={b.id} style={chip(barrioSel && barrioSel.id === b.id)} onClick={() => setBarrioSel(barrioSel && barrioSel.id === b.id ? null : b)}>{b.label}</div>)}</div>
                {barrioSel && <div style={{ fontSize: 12, color: '#8a8a8a', marginTop: 8 }}>📐 {barrioSel.label}: densidad {barrioSel.densidad} · predial mín {barrioSel.predial} · constructibilidad {barrioSel.constructibilidad} (referencial)</div>}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: '#9a9a9a', marginBottom: 8 }}>Tocá el mapa para ir marcando los vértices del sector; cerrá el polígono tocando de nuevo el primer punto. ¿Te equivocaste? Usá «Borrar y redibujar» para limpiar el mapa y empezar de nuevo.</div>
            <div ref={mapRef} style={{ width: '100%', height: 380, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <span style={{ fontSize: 13, color: polygon ? 'var(--gold-light)' : '#8a8a8a' }}>{polygon && polygon.length >= 3 ? '✓ Sector marcado' : 'Sin sector marcado'}</span>
              <button onClick={limpiarPoligono} style={{ ...chip(false), fontSize: 13, padding: '5px 12px' }}>Borrar y redibujar</button>
            </div>
          </div>
        )}
      </div>
      <button onClick={buscar} disabled={loading || !sectorListo} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: sectorListo ? 'var(--gold)' : 'rgba(255,255,255,0.08)', color: sectorListo ? '#1a1a1a' : '#777', fontWeight: 700, fontSize: 16, cursor: sectorListo ? 'pointer' : 'default', marginTop: 6 }}>
        {loading ? 'Calculando precio real del sector…' : 'Buscar precio del sector'}
      </button>
      {enviado && resultado && resultado._modo === 'real' && (
        <div style={{ marginTop: 24, padding: 18, borderRadius: 14, background: 'rgba(202,161,90,0.08)', border: '1px solid rgba(202,161,90,0.25)' }}>
          <div style={{ fontWeight: 700, color: 'var(--gold-light)', marginBottom: 8 }}>📍 Precio real del sector — {resultado.tipo === 'departamento' ? 'departamentos' : resultado.tipo === 'casa' ? 'casas' : resultado.tipo}</div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            Según ventas reales del Conservador: <strong>{resultado.precio_sector.uf_m2_mediana} UF/m² construido</strong> (rango {resultado.precio_sector.uf_m2_p25}–{resultado.precio_sector.uf_m2_p75}), {resultado.precio_sector.n_comparables} ventas, confianza {resultado.precio_sector.confianza}.
            {resultado.valorizacion && resultado.valorizacion.suelo && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(202,161,90,0.25)' }}>
                <div style={{ fontWeight: 700, color: 'var(--gold-light)', marginBottom: 6 }}>🏗️ Tasación: suelo + construcción</div>
                <div>🌳 Terreno: <strong>{resultado.valorizacion.suelo.uf_m2_mediana} UF/m²</strong> (rango {resultado.valorizacion.suelo.uf_m2_p25}–{resultado.valorizacion.suelo.uf_m2_p75} UF/m²)</div>
                <div style={{ marginTop: 4 }}>🧱 Construcción{resultado.valorizacion.construccion_tier ? ` (${resultado.valorizacion.construccion_tier})` : ''} según estado: a estrenar {resultado.valorizacion.construccion_costo_uf_m2.nueva.min}–{resultado.valorizacion.construccion_costo_uf_m2.nueva.max} · buena {resultado.valorizacion.construccion_costo_uf_m2.buena.min}–{resultado.valorizacion.construccion_costo_uf_m2.buena.max} · regular {resultado.valorizacion.construccion_costo_uf_m2.regular.min}–{resultado.valorizacion.construccion_costo_uf_m2.regular.max} · a refaccionar {resultado.valorizacion.construccion_costo_uf_m2.mala.min}–{resultado.valorizacion.construccion_costo_uf_m2.mala.max} UF/m²</div>
                {resultado.valorizacion.total_ejemplo && (
                  <div style={{ marginTop: 8 }}>
                    🏷️ Casa tipo del sector ({resultado.valorizacion.total_ejemplo.terreno_m2} m² terreno + {resultado.valorizacion.total_ejemplo.construido_m2} m² construidos) ≈ <strong>{resultado.valorizacion.total_ejemplo.por_estado.regular.uf_min.toLocaleString('es-CL')}–{resultado.valorizacion.total_ejemplo.por_estado.nueva.uf_max.toLocaleString('es-CL')} UF</strong> según estado.
                  </div>
                )}
              </div>
            )}
            {resultado.reality && <div style={{ marginTop: 8 }}>💰 Con tu presupuesto alcanzarías ~<strong>{resultado.reality.m2_alcanzable_min}–{resultado.reality.m2_alcanzable_max} m²</strong> en este sector.</div>}
            {resultado.estimacion && m2 && <div style={{ marginTop: 8 }}>🏷️ Una propiedad de ~{m2} m² ahí debería costar <strong>{resultado.estimacion.uf_min.toLocaleString('es-CL')}–{resultado.estimacion.uf_max.toLocaleString('es-CL')} UF</strong>.</div>}
          </div>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(202,161,90,0.25)', display: 'flex', gap: 8 }}>
            <button onClick={() => setVista('ventas')} style={{ ...chip(vista === 'ventas'), fontSize: 13, padding: '6px 12px' }}>🏠 Ventas registradas</button>
            <button onClick={verOfertas} style={{ ...chip(vista === 'ofertas'), fontSize: 13, padding: '6px 12px' }}>🏷️ Ofertas en venta</button>
          </div>
          {vista === 'ventas'
            ? <VentasMapa ventas={resultado.ventas_mapa} titulo="Últimas ventas similares en el sector" />
            : ofLoading
              ? <div style={{ marginTop: 14, color: '#9a9a9a', fontSize: 14 }}>Buscando ofertas vigentes en el sector…</div>
              : <OfertasMapa ofertas={ofertas} />}
        </div>
      )}
      {enviado && resultado && resultado._modo !== 'real' && !loading && (
        <div style={{ marginTop: 20, fontSize: 14, color: '#cfcfcf' }}>{resultado.mensaje || 'No pude estimar el precio de ese sector con los datos disponibles. Igual te dejo el consejo de Isidora.'}</div>
      )}
      {mensajes.map((msg, i) => (
        <div key={i} style={{ marginTop: 16, padding: msg.role === 'agent' ? 16 : '10px 14px', borderRadius: 14, background: msg.role === 'agent' ? 'rgba(255,255,255,0.05)' : 'var(--gold-dim)', fontSize: 14, lineHeight: 1.6 }}>
          {msg.role === 'agent' ? <FCBold text={msg.content} /> : msg.content}
        </div>
      ))}
      {typing && <div style={{ marginTop: 16, color: '#8a8a8a', fontSize: 14 }}>Isidora está escribiendo…</div>}
      {enviado && !loading && (
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') enviarPregunta() }} placeholder="Preguntale lo que quieras a Isidora…" style={{ ...inp, flex: 1 }} />
          <button onClick={enviarPregunta} style={{ padding: '0 18px', borderRadius: 12, border: 'none', background: 'var(--gold)', color: '#1a1a1a', fontWeight: 700, cursor: 'pointer' }}>→</button>
        </div>
      )}
    </div>
  )
}
// ─── Chat Comprador ───────────────────────────────────────────────────────────
function ChatComprador({ onBack }) {
  const [messages, setMessages] = useState([])
  const [typing, setTyping] = useState(false)
  const [stage, setStage] = useState('greeting')
  const [data, setData] = useState({})
  const [flujoIdx, setFlujoIdx] = useState(0)
  const [inputMode, setInputMode] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [options, setOptions] = useState([])
  const [multiSel, setMultiSel] = useState([])
  const [chatHistory, setChatHistory] = useState([])
  const [propiedadesDB, setPropiedadesDB] = useState([])
  // Cargar base de datos de propiedades al montar
  useEffect(() => {
    fetch('/data/propiedades_muestra.json')
      .then(r => r.json())
      .then(d => setPropiedadesDB(d.propiedades || []))
      .catch(() => {})
  }, [])
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, typing])
  const addAgent = (content, delay=600) => new Promise(res => {
    setTyping(true)
    setTimeout(() => { setTyping(false); setMessages(m => [...m, { role:'agent', content }]); res() }, delay)
  })
  const addUser = (text) => setMessages(m => [...m, { role:'user', content: text }])
  const askIsidora = async (userMsg, currentData) => {
    const newHistory = [...chatHistory, { role:'user', content: userMsg }]
    setChatHistory(newHistory)
    setTyping(true)
    try {
      const res = await fetch('/api/buscar', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ messages: newHistory, perfil: currentData, propiedades_db: propiedadesDB })
      })
      const result = await res.json()
      setTyping(false)
      const respuesta = result.respuesta || 'Hubo un problema, intenta de nuevo.'
      setMessages(m => [...m, { role:'agent', content: respuesta }])
      setChatHistory(h => [...h, { role:'assistant', content: respuesta }])
      return respuesta
    } catch(e) {
      setTyping(false)
      await addAgent('Hubo un problema conectándome. ¿Intentamos de nuevo?', 300)
    }
  }
  // Inicio
  useEffect(() => {
    const init = async () => {
      await addAgent('¡Hola! Soy Isidora, tu asesora inmobiliaria 👋\n\nEstoy aquí para ayudarte a encontrar la propiedad perfecta en Santiago. Cuéntame, ¿qué tipo de propiedad estás buscando?', 800)
      setInputMode('options')
      setOptions(TIPOS)
      setStage('tipo')
    }
    init()
  }, [])
  const nextStep = async (currentData, idx) => {
    const tipo = currentData.tipo
    const flujo = FLUJOS_COMPRADOR[tipo] || []
    if (idx >= flujo.length) {
      // Fin del flujo — pasar a conversación libre con Isidora
      setStage('chat_libre')
      setInputMode(null)
      const resumen = buildResumen(currentData)
      // Precio real del sector (Data Inmobiliaria), separando casa/depto
      const PRES_MID = { hasta_3000: 2500, '3000_5000': 4000, '5000_8000': 6500, '8000_12000': 10000, '12000_20000': 16000, mas_20000: 25000 }
      const M2_OBJ = { departamento: { '1': 45, '2': 65, '3': 85, '4+': 110 }, casa: { '2': 90, '3': 130, '4+': 180 } }
      const comunaRef = currentData.zona && currentData.zona.length ? String(currentData.zona[0]).replace(/_/g, ' ') : null
      const presUF = PRES_MID[currentData.presupuesto] || null
      const m2Obj = (M2_OBJ[currentData.tipo] || {})[currentData.dormitorios] || null
      if (comunaRef) {
        setTyping(true)
        try {
          const zr = await fetch('/api/zona', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comuna: comunaRef, tipo: currentData.tipo, presupuesto_uf: presUF, m2_objetivo: m2Obj }) })
          const zj = await zr.json()
          setTyping(false)
          if (zj && zj._modo === 'real') {
            const ps = zj.precio_sector
            const tipoTxt = zj.tipo === 'departamento' ? 'departamentos' : zj.tipo === 'casa' ? 'casas' : zj.tipo
            let card = `📍 **Precio real del sector — ${comunaRef} (${tipoTxt})**\n`
            card += `Según ventas reales del Conservador: **${ps.uf_m2_mediana} UF/m² construido** (rango ${ps.uf_m2_p25}–${ps.uf_m2_p75} UF/m²), ${ps.n_comparables} ventas, confianza ${ps.confianza}.`
            const vz = zj.valorizacion
            if (vz && vz.suelo) {
              card += `\n\n🏗️ **Tasación suelo + construcción:**`
              card += `\n🌳 Terreno: **${vz.suelo.uf_m2_mediana} UF/m²** (rango ${vz.suelo.uf_m2_p25}–${vz.suelo.uf_m2_p75} UF/m²).`
              card += `\n🧱 Construcción${vz.construccion_tier ? ` (${vz.construccion_tier})` : ''} según estado: a estrenar ${vz.construccion_costo_uf_m2.nueva.min}–${vz.construccion_costo_uf_m2.nueva.max} · buena ${vz.construccion_costo_uf_m2.buena.min}–${vz.construccion_costo_uf_m2.buena.max} · regular ${vz.construccion_costo_uf_m2.regular.min}–${vz.construccion_costo_uf_m2.regular.max} UF/m².`
              if (vz.total_ejemplo) {
                const te = vz.total_ejemplo
                card += `\n🏷️ Casa tipo (${te.terreno_m2} m² terreno + ${te.construido_m2} m² construidos) ≈ **${te.por_estado.regular.uf_min.toLocaleString('es-CL')}–${te.por_estado.nueva.uf_max.toLocaleString('es-CL')} UF** según estado.`
              }
              if (vz.suelo_por_tramo && vz.suelo_por_tramo.length) {
                card += `\n📐 Suelo por tamaño de sitio (normativa): ` + vz.suelo_por_tramo.map((t) => `${t.rango} ${t.uf_m2_mediana} UF/m²`).join(' · ') + `. Sitios grandes valen menos por m²; chicos, más.`
              }
              if (vz.prc_zona && vz.prc_zona.zona) {
                card += `\n🗺️ Zona PRC: **${vz.prc_zona.zona}** (densidad ${vz.prc_zona.clase}), predial mínimo aprox ${vz.prc_zona.predial_min_aprox} m² (referencial).`
              }
            }
            if (zj.reality) card += `\n\n💰 Con tu presupuesto alcanzarías ~**${zj.reality.m2_alcanzable_min}–${zj.reality.m2_alcanzable_max} m²** en este sector.`
            await addAgent(card, 300)
          }
        } catch (e) { setTyping(false) }
      }
      await askIsidora(
        `He completado mi perfil de búsqueda. Aquí está lo que busco: ${resumen}. Por favor dame tu análisis experto: qué comunas me recomiendas, qué puedo esperar con mi presupuesto, y cuáles son las mejores oportunidades del mercado actual para mi perfil.`,
        currentData
      )
      setInputMode('text_libre')
      return
    }
    const paso = flujo[idx]
    setFlujoIdx(idx + 1)
    await addAgent(paso.msg, 500)
    if (paso.tipo === 'options') {
      setInputMode('options'); setOptions(paso.opts); setStage(`flujo_${paso.id}`)
    } else if (paso.tipo === 'multi_comuna') {
      setInputMode('multi_comuna'); setMultiSel([]); setOptions(paso.opts); setStage(`flujo_${paso.id}`)
    } else if (paso.tipo === 'multi') {
      setInputMode('multi'); setMultiSel([]); setOptions(paso.opts); setStage(`flujo_${paso.id}`)
    } else if (paso.tipo === 'text') {
      setInputMode('text'); setStage(`flujo_${paso.id}`)
    }
  }
  const buildResumen = (d) => {
    const partes = [
      `Tipo: ${d.tipo}`,
      d.presupuesto ? `Presupuesto: ${d.presupuesto.replace(/_/g,' ')} UF` : null,
      d.dormitorios ? `Dormitorios: ${d.dormitorios}` : null,
      d.superficie ? `Superficie: ${d.superficie.replace(/_/g,' ')} m²` : null,
      d.terreno_min ? `Terreno mínimo: ${d.terreno_min.replace(/_/g,' ')} m²` : null,
      d.zona?.length ? `Zona preferida: ${d.zona.join(', ')}` : null,
      d.uso ? `Uso: ${d.uso}` : null,
      d.subtipo ? `Subtipo: ${d.subtipo}` : null,
      d.caracteristicas?.length ? `Características: ${d.caracteristicas.join(', ')}` : null,
      d.urgencia ? `Urgencia: ${d.urgencia}` : null,
    ].filter(Boolean)
    return partes.join(' | ')
  }
  const handleOption = async (opt) => {
    addUser(opt.label)
    setInputMode(null)
    if (stage === 'tipo') {
      const newData = { ...data, tipo: opt.id }
      setData(newData)
      await addAgent(`Perfecto, buscas ${opt.label.toLowerCase()}. Voy a hacerte algunas preguntas para entender bien lo que necesitas.`, 600)
      await nextStep(newData, 0)
    } else if (stage.startsWith('flujo_')) {
      const campo = stage.replace('flujo_', '')
      const newData = { ...data, [campo]: opt.id }
      setData(newData)
      await nextStep(newData, flujoIdx)
    }
  }
  const handleMultiConfirm = async () => {
    const campo = stage.replace('flujo_', '')
    const labels = multiSel.map(s => options.find(o => o.id === s)?.label).filter(Boolean)
    addUser(labels.length ? labels.join(', ') : 'Sin preferencia')
    setInputMode(null)
    const newData = { ...data, [campo]: multiSel }
    setData(newData)
    await nextStep(newData, flujoIdx)
  }
  const handleSend = async () => {
    const val = inputVal.trim()
    if (!val) return
    setInputVal('')
    setInputMode(null)
    if (stage === 'chat_libre' || stage === 'text_libre') {
      addUser(val)
      await askIsidora(val, data)
      setInputMode('text_libre')
    } else if (stage.startsWith('flujo_')) {
      addUser(val)
      const campo = stage.replace('flujo_', '')
      const newData = { ...data, [campo]: val }
      setData(newData)
      await nextStep(newData, flujoIdx)
    }
  }
  const renderContent = (content) => {
    if (typeof content !== 'string') return null
    // Render **bold** markdown
    return content.split('\n').map((line, i, arr) => (
      <span key={i}>
        {line.split(/\*\*(.*?)\*\*/g).map((p, j) => j%2===1 ? <strong key={j}>{p}</strong> : p)}
        {i < arr.length-1 && <br/>}
      </span>
    ))
  }
  return (
    <div className="chat-app">
      <div className="chat-header">
        <button className="back-btn" onClick={onBack}>←</button>
        <div className="agent-avatar">🤵</div>
        <div>
          <div className="agent-name">Isidora · Asesora de Compra</div>
          <div className="agent-status"><span className="status-dot"/>En línea</div>
        </div>
        <div className="chat-header-logo">IA <em>Prop</em></div>
      </div>
      <div className="messages-area">
        {messages.map((msg, i) => msg.role==='agent'
          ? <AgentBubble key={i}>{renderContent(msg.content)}</AgentBubble>
          : <UserBubble key={i}>{msg.content}</UserBubble>
        )}
        {typing && <AgentBubble typing/>}
        <div ref={bottomRef}/>
      </div>
      <div className="options-area">
        {inputMode === 'options' && (
          <>
            <div className="options-hint">Selecciona una opción</div>
            <div className="options-grid">
              {options.map(opt => (
                <button key={opt.id} className="opt" onClick={() => handleOption(opt)}>
                  {opt.icon && <span className="opt-icon">{opt.icon}</span>}{opt.label}
                </button>
              ))}
            </div>
          </>
        )}
        {(inputMode === 'multi' || inputMode === 'multi_comuna') && (
          <>
            <div className="options-hint">Selecciona todo lo que aplique</div>
            <div className="options-grid" style={{marginBottom:10}}>
              {options.map(opt => (
                <button key={opt.id} className={`opt${multiSel.includes(opt.id)?' selected':''}`}
                  onClick={() => {
                    if (opt.id==='sin_preferencia'||opt.id==='ninguna'||opt.id==='flexible') setMultiSel([opt.id])
                    else setMultiSel(p => p.includes(opt.id) ? p.filter(x=>x!==opt.id) : [...p.filter(x=>x!=='sin_preferencia'&&x!=='ninguna'&&x!=='flexible'),opt.id])
                  }}>
                  {opt.icon && <span className="opt-icon">{opt.icon}</span>}{opt.label}
                </button>
              ))}
            </div>
            <button className="opt" style={{background:'var(--gold-dim)',borderColor:'var(--gold)',color:'var(--gold-light)'}} onClick={handleMultiConfirm}>
              Confirmar →
            </button>
          </>
        )}
        {(inputMode === 'text' || inputMode === 'text_libre') && (
          <div className="text-input-row">
            <textarea ref={inputRef} className="chat-input"
              placeholder={inputMode==='text_libre' ? 'Pregúntame lo que quieras sobre el mercado, comunas, precios…' : 'Escribe aquí…'}
              value={inputVal} onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }}}
              rows={1}/>
            <button className="send-btn" disabled={!inputVal.trim()} onClick={handleSend}>→</button>
          </div>
        )}
      </div>
    </div>
  )
}
// ─── Landing ──────────────────────────────────────────────────────────────────
export default function Home() {
  // Permite abrir directo desde el shell C2C:
  //   /tasar?view=vendedor  → ChatVendedor (Valentina)
  //   /tasar?view=comprador → FormComprador (Isidora)
  // Vista inicial SSR-safe: en el server y en el primer render del cliente vale
  // null (mismo HTML en ambos -> sin mismatch de hidratacion #418/#423).
  // Tras montar leemos ?view= y fijamos la vista real.
  const [view, setView] = useState(null)
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('view')
      setView(v === 'vendedor' || v === 'comprador' ? v : 'landing')
    } catch (e) { setView('landing') }
  }, [])
  if (view === null) return null
  if (view === 'vendedor') return <ChatVendedor onBack={() => setView('landing')}/>
  if (view === 'comprador') return <FormComprador onBack={() => setView('landing')}/>
  return (
    <>
      <div className="landing">
        <div className="landing-logo">IA <em>Prop</em></div>
        <div className="landing-tagline">Tu agente inmobiliario inteligente</div>
        <div className="landing-cards">
          <div className="landing-card" onClick={() => setView('vendedor')}>
            <div className="landing-card-icon">🏡</div>
            <div className="landing-card-title">Quiero vender</div>
            <div className="landing-card-desc">Tasa tu propiedad gratis con datos reales del mercado y recibe asesoría personalizada.</div>
          </div>
          <div className="landing-card" onClick={() => setView('comprador')}>
            <div className="landing-card-icon">🔍</div>
            <div className="landing-card-title">Quiero comprar</div>
            <div className="landing-card-desc">Cuéntanos qué buscas y te encontramos la propiedad perfecta al mejor precio.</div>
          </div>
        </div>
        <div className="landing-footer">Región Metropolitana · Chile</div>
      </div>
    </>
  )
}
