'use client'
import { useState, useEffect, useRef } from 'react'

const fmtUF = (n) => n ? `${Number(n).toLocaleString('es-CL', {minimumFractionDigits:0,maximumFractionDigits:0})} UF` : '—'

// ─── Tipos de propiedad ───────────────────────────────────────────────────────
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
  const [comunaForm, setComunaForm] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, typing])

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
      await addAgent(`Perfecto, ${nombre === 'agrícola' ? 'una propiedad' : 'una'} ${nombre}. Voy a hacerte algunas preguntas para conocerla bien.\n\nIngresa la dirección o el ROL SII de tu propiedad:`, 700)
      setSearchTab('direccion')
      setInputVal(''); setDeptoVal('')
      setInputMode('search_form')
      setStage('direccion')

    } else if (stage === 'elegir_unidad') {
      const sii = opt._sii || data._candidatos?.[parseInt(opt.id)]
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

    } else if (stage === 'ingresar_terreno') {
      const m2Corregido = parseFloat(val.replace(/[^0-9.]/g, ''))
      if (m2Corregido > 0) {
        addUser(`${m2Corregido.toLocaleString('es-CL')} m²`)
        const newSiiData = { ...data.siiData, m2_terreno: m2Corregido }
        const newData = { ...data, siiData: newSiiData }
        setData(newData)
        await addAgent(`Anotado: **${m2Corregido.toLocaleString('es-CL')} m² de terreno** ✓`, 300)
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
    setMessages(m => [...m, { role:'agent', content:{ type:'loading', text:'Buscando tu propiedad en el SII y catastro…' }}])
    try {
      // Proxy server-side — la key nunca sale al browser
      const params = new URLSearchParams({
        direccion: d.direccion || '',
        comuna: d.comuna || '',
        unidad: d.depto || '',
      })
      const res = await fetch(`/api/sii?${params}`)

      if (!res.ok) {
        setMessages(m => m.filter(x => !(x.role==='agent' && x.content?.type==='loading')))
        await addAgent('No pude consultar el SII ahora, pero continuamos sin problema.', 400)
        const fallback = { ...d, siiData:{ direccion:`${d.direccion}${d.depto ? ' '+d.depto : ''}, ${d.comuna}` } }
        setData(fallback)
        await nextStep(fallback, 0)
        return
      }

      const json = await res.json()
            setMessages(m => m.filter(x => !(x.role==='agent' && x.content?.type==='loading')))

      // ── Múltiples resultados → mostrar selector ───────────────────────────
      if (json.multiples && json.resultados?.length > 1) {
        await addAgent(`Encontré ${json.resultados.length} propiedades en esa dirección. ¿Cuál es la tuya?`, 500)
        setInputMode('options')
        setOptions(json.resultados.map((r, i) => ({
          id: String(i),
          label: [r.direccion, r.destino, r.m2_construido && `${r.m2_construido} m²`, r.rol && `ROL ${r.rol}`].filter(Boolean).join(' · '),
          icon: '🏠',
          _sii: r,
        })))
        // Guardar candidatos para el handler
        setData(prev => ({ ...prev, _candidatos: json.resultados, _pendingData: d }))
        setStage('elegir_unidad')
        return
      }

      // ── No encontrado → continuar sin SII ──────────────────────────────
      if (json.noEncontrado || !json.resultados?.length) {
        const newData = { ...d, siiData:{ direccion:`${d.direccion}${d.depto ? ' '+d.depto : ''}, ${d.comuna}` } }
        setData(newData)
        await addAgent(`Perfecto, registré la propiedad en **${d.comuna}**. Continuamos con las preguntas:`, 400)
        await nextStep(newData, 0)
        return
      }

      // ── Un solo resultado ─────────────────────────────────────────────────
      const sii = json.resultados[0]
      const newData = { ...d, siiData: sii }
      setData(newData)
      setMessages(m => [...m, { role:'agent', content:{ type:'sii', data:sii }}])
      await addAgent('¿Estos datos son correctos?', 400)
      setInputMode('options')
      setOptions([{id:'si',label:'Sí, son correctos',icon:'✅'},{id:'no',label:'No, quiero corregir',icon:'✏️'}])
      setStage('confirmar_sii')

    } catch(err) {
      console.error('fetchSII catch:', err.name, err.message)
      setMessages(m => m.filter(x => !(x.role==='agent' && x.content?.type==='loading')))
      await addAgent('Tuve un problema conectándome al SII. No te preocupes, continuamos con lo que me cuentes directamente.', 600)
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
      const { ajRemo, ajCar, ajJardin } = calcAjustes(finalData)
      const m2Util = parseFloat(finalData.siiData?.m2_util || finalData.siiData?.m2_construido) || 60
      const valorBase = resultado.valor_uf || 0
      const valorFinal = valorBase + ajRemo + ajCar + ajJardin
      const rangoMin = Math.round(valorFinal * 0.93)
      const rangoMax = Math.round(valorFinal * 1.07)
      setMessages(m => [...m, { role:'agent', content:{ type:'tasacion', resultado, valorFinal, rangoMin, rangoMax, ajRemo, ajCar, ajJardin, valorBase, remoInfo:{ tipo: finalData.remodelacion, m2: m2Util, ufM2: AJUSTE_REMO[finalData.remodelacion]||0, tiempo: finalData.tiempo_remo } }}])
      await addAgent(`¡Tasación lista! El valor de mercado estimado es **${fmtUF(valorFinal)}**.\n\nEste valor refleja transacciones reales recientes en la zona, ajustado por las características que me contaste. ¿Tienes alguna pregunta?`, 1200)
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
            {d.m2_util && <div className="sii-bubble-item"><div className="sii-bubble-label">M² útiles</div><div className="sii-bubble-val green">{d.m2_util} m²</div></div>}
            {d.m2_construido && <div className="sii-bubble-item"><div className="sii-bubble-label">M² totales</div><div className="sii-bubble-val">{d.m2_construido} m²</div></div>}
            {d.m2_terreno && <div className="sii-bubble-item"><div className="sii-bubble-label">M² terreno</div><div className="sii-bubble-val">{d.m2_terreno} m²</div></div>}
            {d.anio_construccion && <div className="sii-bubble-item"><div className="sii-bubble-label">Año const.</div><div className="sii-bubble-val">{d.anio_construccion}</div></div>}
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
              {resultado.comparables.slice(0,4).map((c,i) => (
                <div key={i} className="comp-mini-item">
                  <div>
                    <div className="comp-mini-addr">{c.direccion} · {c.m2} m²</div>
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
    const newData = { ...data, direccion: busqueda, depto: conDepto, comuna: comunaForm }
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
                    <input value={inputVal} onChange={e => setInputVal(e.target.value)}
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

// ─── Landing ──────────────────────────────────────────────────────────────────
export default function Home() {
  const [view, setView] = useState('landing')
  if (view === 'vendedor') return <ChatVendedor onBack={() => setView('landing')}/>
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
          <div className="landing-card disabled">
            <div className="coming-soon">Próximamente</div>
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
