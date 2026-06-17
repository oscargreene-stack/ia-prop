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
    if (!document.getElementById('gplaces-script')) {
      const s = document.createElement('script')
      s.id = 'gplaces-script'
      s.src = `https://maps.googleapis.com/maps/api/js?key=${GKEY}&libraries=places&language=es&region=CL`
      s.async = true; s.onload = initAC
      document.head.appendChild(s)
    }
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
          const msgTerreno = terrenoSII > 0
            ? `El SII registra **${terrenoSII.toLocaleString('es-CL')} m² de terreno** para esta propiedad. ¿Es correcto este dato?`
            : '¿Cuántos m² de terreno tiene la propiedad? (el SII no registra este dato para esta propiedad)'
          await addAgent(msgTerreno, 500)
          if (terrenoSII > 0) {
            setInputMode('options')
            setOptions([
              { id: 'si_terreno', label: `Sí, ${terrenoSII.toLocaleString('es-CL')} m² es correcto`, icon: '✅' },
              { id: 'no_terreno', label: 'No, el dato es incorrecto', icon: '✏️' },
            ])
            setStage('confirmar_terreno')
          } else {
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

  const iniciarTasacion = async (finalData) => {
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
      setOptions([{id:'nueva',label:'Tasar otra propiedad',icon:'🔄'},{id:'detalle',label:'Quiero más detalle',icon:'🔍'}])
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

          {/* Comparables */}
          {resultado.comparables?.length>0 && (
            <div className="comp-mini">
              <div className="tas-section-title">Transacciones de referencia</div>
              {resultado.comparables.slice(0,6).map((c,i) => (
                <div key={i} className="comp-mini-item">
                  <div>
                    <div className="comp-mini-addr">{c.direccion} · {c.m2} m² construidos{c.m2_terreno ? ` · ${c.m2_terreno} m² terreno` : ''}</div>
                    <div className="comp-mini-meta">{c.tipo} · {c.fecha}{c.similitud ? ` · ${c.similitud}` : ''}</div>
                  </div>
                  <div><div className="comp-mini-uf">{fmtUF(c.precio_uf)}</div><div className="comp-mini-m2">{c.uf_m2} UF/m²</div></div>
                </div>
              ))}
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
        <button className="back-btn" onClick={onBack}>←</button>
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
      {String(text || '').split('\n').map((line, i) => (
        <div key={i} style={{ minHeight: line ? 'auto' : '8px' }}>
          {line.split(/\*\*(.*?)\*\*/g).map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p))}
        </div>
      ))}
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
  const [polygon, setPolygon] = useState(null)
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [chatHistory, setChatHistory] = useState([])
  const [pregunta, setPregunta] = useState('')
  const [typing, setTyping] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const dmRef = useRef(null)
  const polyRef = useRef(null)

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
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        })
        mapObj.current = map
        if (!g.drawing) return
        const dm = new g.drawing.DrawingManager({
          drawingMode: g.drawing.OverlayType.POLYGON,
          drawingControl: true,
          drawingControlOptions: { position: g.ControlPosition.TOP_CENTER, drawingModes: [g.drawing.OverlayType.POLYGON] },
          polygonOptions: { fillColor: '#caa15a', fillOpacity: 0.2, strokeColor: '#caa15a', strokeWeight: 2, editable: true, clickable: false },
        })
        dm.setMap(map)
        dmRef.current = dm
        g.event.addListener(dm, 'overlaycomplete', (e) => {
          if (e.type !== g.drawing.OverlayType.POLYGON) return
          if (polyRef.current) polyRef.current.setMap(null)
          polyRef.current = e.overlay
          dm.setDrawingMode(null)
          const read = () => setPolygon(e.overlay.getPath().getArray().map((pt) => ({ lat: pt.lat(), lng: pt.lng() })))
          read()
          ;['set_at', 'insert_at', 'remove_at'].forEach((ev) => g.event.addListener(e.overlay.getPath(), ev, read))
        })
      }
      tryInit(25)
    })
    return () => { cancel = true }
  }, [sectorMode])

  const limpiarPoligono = () => {
    if (polyRef.current) { polyRef.current.setMap(null); polyRef.current = null }
    setPolygon(null)
    if (dmRef.current && window.google) dmRef.current.setDrawingMode(window.google.maps.drawing.OverlayType.POLYGON)
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

  const buscar = async () => {
    setLoading(true); setResultado(null); setMensajes([]); setEnviado(true)
    const body = { tipo, presupuesto_uf: presUF, m2_objetivo: m2 ? parseFloat(m2) : null }
    if (sectorMode === 'mapa' && polygon && polygon.length >= 3) body.polygon = polygon
    else if (comunas.length) body.comuna = comunas[0]
    let zj = null
    try { zj = await (await fetch('/api/zona', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json() } catch (e) {}
    setResultado(zj)
    setLoading(false)
    const sectorTxt = sectorMode === 'mapa' && polygon ? 'el sector que marqué en el mapa' : comunas.join(', ')
    let ctx = ''
    if (zj && zj._modo === 'real') {
      const ps = zj.precio_sector
      ctx = ` DATOS REALES DEL SECTOR (ventas CBR del Conservador, SOLO ${zj.tipo}): mediana ${ps.uf_m2_mediana} UF/m2 (rango ${ps.uf_m2_p25}-${ps.uf_m2_p75}), ${ps.n_comparables} comparables, confianza ${ps.confianza}. Usa estos números reales para el reality check y la estimación.`
    }
    const caractTxt = caract.length ? caract.join(', ') : 'sin preferencia'
    const presTxt = presMax && parseFloat(presMax) > 0 ? `hasta ${parseFloat(presMax).toLocaleString('es-CL')} UF` : pres.replace(/_/g, ' ') + ' UF'
    const userMsg = `Busco ${tipo}, presupuesto ${presTxt}, ${dorms} dormitorios, ${banos} baños${m2 ? ', ~' + m2 + ' m²' : ''}, en ${sectorTxt}. Imprescindibles: ${caractTxt}.${ctx} Dame tu análisis experto: si mi presupuesto es realista para esto en esa zona, qué puedo esperar, y las mejores oportunidades. Si no alcanza, sugiere comunas colindantes.`
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
        <button className="back-btn" onClick={onBack}>←</button>
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
          <div style={row}>{FC_COMUNAS.map((c) => <div key={c} style={chip(comunas.includes(c))} onClick={() => toggle(comunas, setComunas, c)}>{c}</div>)}</div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: '#9a9a9a', marginBottom: 8 }}>Tocá el ícono de polígono (arriba del mapa) y andá marcando los vértices del sector; cerrá el polígono tocando el primer punto.</div>
            <div ref={mapRef} style={{ width: '100%', height: 380, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', overflow: 'hidden' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <span style={{ fontSize: 13, color: polygon ? 'var(--gold-light)' : '#8a8a8a' }}>{polygon && polygon.length >= 3 ? '✓ Sector marcado' : 'Sin sector marcado'}</span>
              {polygon && <button onClick={limpiarPoligono} style={{ ...chip(false), fontSize: 13, padding: '5px 12px' }}>Borrar y redibujar</button>}
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
            Según ventas reales del Conservador: <strong>{resultado.precio_sector.uf_m2_mediana} UF/m²</strong> (rango {resultado.precio_sector.uf_m2_p25}–{resultado.precio_sector.uf_m2_p75}), {resultado.precio_sector.n_comparables} ventas, confianza {resultado.precio_sector.confianza}.
            {resultado.reality && <div style={{ marginTop: 8 }}>💰 Con tu presupuesto alcanzarías ~<strong>{resultado.reality.m2_alcanzable_min}–{resultado.reality.m2_alcanzable_max} m²</strong> en este sector.</div>}
            {resultado.estimacion && m2 && <div style={{ marginTop: 8 }}>🏷️ Una propiedad de ~{m2} m² ahí debería costar <strong>{resultado.estimacion.uf_min.toLocaleString('es-CL')}–{resultado.estimacion.uf_max.toLocaleString('es-CL')} UF</strong>.</div>}
          </div>
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
function ChatComprador({ onBack }) {  const [messages, setMessages] = useState([])
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
            card += `Según ventas reales del Conservador: **${ps.uf_m2_mediana} UF/m²** (rango ${ps.uf_m2_p25}–${ps.uf_m2_p75} UF/m²), ${ps.n_comparables} ventas, confianza ${ps.confianza}.`
            if (zj.reality) card += `\n\n💰 Con tu presupuesto alcanzarías ~**${zj.reality.m2_alcanzable_min}–${zj.reality.m2_alcanzable_max} m²** en este sector.`
            if (zj.estimacion && m2Obj) card += `\n\n🏷️ Una propiedad de ~${m2Obj} m² ahí debería costar **${zj.estimacion.uf_min.toLocaleString('es-CL')}–${zj.estimacion.uf_max.toLocaleString('es-CL')} UF**.`
            await addAgent(card, 300)
          }
        } catch (e) { setTyping(false) }
      }      await askIsidora(
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

        {(inputMode === 'multi' || inputMode === 'multi_comuna') && (          <>
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
  const [view, setView] = useState('landing')
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
