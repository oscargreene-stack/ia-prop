'use client'
import { useState, useEffect, useRef } from 'react'

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg:#0a0a08; --surface:#131310; --surface2:#1c1c18; --border:#272722; --border2:#333330;
    --gold:#c8a96e; --gold-light:#e8cc9a; --gold-dim:#6b5a38; --text:#f2ede4; --text2:#9e9888;
    --text3:#5a5650; --green:#5ab87a; --green-dim:#1a3325; --red:#d9604c; --red-dim:#391a16;
    --blue:#5a9fd4; --blue-dim:#152535;
  }
  html,body{height:100%;}
  body{background:var(--bg);font-family:'Outfit',sans-serif;color:var(--text);min-height:100vh;overflow-x:hidden;}
  .landing{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;position:relative;overflow:hidden;}
  .landing::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(200,169,110,0.07) 0%,transparent 70%);pointer-events:none;}
  .landing-logo{font-family:'Playfair Display',serif;font-size:clamp(48px,10vw,80px);font-weight:400;letter-spacing:-1px;line-height:1;margin-bottom:12px;text-align:center;}
  .landing-logo em{font-style:italic;color:var(--gold);}
  .landing-tagline{font-size:14px;color:var(--text3);letter-spacing:3px;text-transform:uppercase;margin-bottom:64px;text-align:center;}
  .landing-cards{display:flex;gap:20px;flex-wrap:wrap;justify-content:center;max-width:700px;}
  .landing-card{flex:1;min-width:260px;max-width:320px;background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:36px 32px;cursor:pointer;transition:all 0.25s ease;text-align:left;position:relative;overflow:hidden;}
  .landing-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--gold-dim),transparent);opacity:0;transition:opacity .25s;}
  .landing-card:hover{border-color:var(--gold-dim);transform:translateY(-3px);box-shadow:0 20px 40px rgba(0,0,0,.4);}
  .landing-card:hover::before{opacity:1;}
  .landing-card-icon{font-size:32px;margin-bottom:16px;}
  .landing-card-title{font-family:'Playfair Display',serif;font-size:22px;font-weight:400;color:var(--text);margin-bottom:8px;}
  .landing-card-desc{font-size:13px;color:var(--text3);line-height:1.6;}
  .landing-card.disabled{opacity:.4;cursor:default;}
  .landing-card.disabled:hover{transform:none;border-color:var(--border);box-shadow:none;}
  .coming-soon{position:absolute;top:16px;right:16px;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);background:var(--surface2);border:1px solid var(--border);padding:3px 8px;border-radius:20px;}
  .landing-footer{position:absolute;bottom:24px;font-size:11px;color:var(--text3);letter-spacing:1px;}
  .chat-app{display:flex;flex-direction:column;height:100vh;max-width:760px;margin:0 auto;}
  .chat-header{display:flex;align-items:center;gap:14px;padding:18px 24px;border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:0;z-index:10;}
  .back-btn{width:32px;height:32px;border-radius:50%;border:1px solid var(--border2);background:transparent;color:var(--text2);font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;}
  .back-btn:hover{border-color:var(--gold-dim);color:var(--gold);}
  .agent-avatar{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#2a2520,#1a1810);border:1px solid var(--gold-dim);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
  .agent-name{font-size:14px;font-weight:600;color:var(--text);}
  .agent-status{font-size:11px;color:var(--green);display:flex;align-items:center;gap:5px;}
  .status-dot{width:5px;height:5px;border-radius:50%;background:var(--green);animation:pulse 2s infinite;}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  .chat-header-logo{margin-left:auto;font-family:'Playfair Display',serif;font-size:16px;color:var(--text3);}
  .chat-header-logo em{font-style:italic;color:var(--gold-dim);}
  .messages-area{flex:1;overflow-y:auto;padding:24px 20px;display:flex;flex-direction:column;gap:6px;scroll-behavior:smooth;}
  .messages-area::-webkit-scrollbar{width:4px;}
  .messages-area::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px;}
  .msg{display:flex;gap:10px;max-width:85%;animation:fadeUp .3s ease;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  .msg.agent{align-self:flex-start;}
  .msg.user{align-self:flex-end;flex-direction:row-reverse;}
  .msg-avatar{width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#2a2520,#1a1810);border:1px solid var(--gold-dim);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;margin-top:2px;}
  .bubble{padding:13px 16px;border-radius:16px;font-size:14px;line-height:1.65;color:var(--text);}
  .msg.agent .bubble{background:#1a1a16;border:1px solid var(--border);border-top-left-radius:4px;}
  .msg.user .bubble{background:var(--gold-dim);border:1px solid transparent;border-top-right-radius:4px;color:var(--gold-light);}
  .typing-dots{display:flex;gap:4px;padding:14px 18px;align-items:center;}
  .typing-dots span{width:6px;height:6px;background:var(--text3);border-radius:50%;animation:bounce 1.2s infinite;}
  .typing-dots span:nth-child(2){animation-delay:.2s;}
  .typing-dots span:nth-child(3){animation-delay:.4s;}
  @keyframes bounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
  .options-area{padding:12px 20px 20px;border-top:1px solid var(--border);background:var(--bg);}
  .options-hint{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--text3);margin-bottom:10px;}
  .options-grid{display:flex;flex-wrap:wrap;gap:8px;}
  .opt{padding:9px 16px;border-radius:24px;border:1px solid var(--border2);background:var(--surface);color:var(--text2);font-size:13px;font-family:'Outfit',sans-serif;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:7px;}
  .opt:hover{border-color:var(--gold-dim);color:var(--text);background:var(--surface2);}
  .opt.selected{background:var(--gold-dim);border-color:var(--gold);color:var(--gold-light);}
  .opt:disabled,.opt.disabled{opacity:.35;cursor:default;}
  .opt-icon{font-size:16px;}
  .text-input-row{display:flex;gap:10px;align-items:flex-end;}
  .chat-input{flex:1;background:var(--surface2);border:1px solid var(--border2);border-radius:12px;padding:12px 16px;color:var(--text);font-family:'Outfit',sans-serif;font-size:14px;outline:none;resize:none;min-height:46px;max-height:120px;line-height:1.5;transition:border-color .15s;}
  .chat-input:focus{border-color:var(--gold-dim);}
  .chat-input::placeholder{color:var(--text3);}
  .send-btn{width:46px;height:46px;border-radius:12px;border:none;background:var(--gold);color:var(--bg);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;}
  .send-btn:hover{background:var(--gold-light);}
  .send-btn:disabled{background:var(--gold-dim);cursor:not-allowed;}
  .tasacion-card{background:linear-gradient(135deg,#161410 0%,#1e1c16 100%);border:1px solid var(--gold-dim);border-radius:14px;padding:22px;margin-top:6px;}
  .tasacion-label{font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--gold-dim);margin-bottom:6px;}
  .tasacion-valor{font-family:'Playfair Display',serif;font-size:38px;font-weight:400;color:var(--gold-light);line-height:1;margin-bottom:4px;}
  .tasacion-rango{font-size:12px;color:var(--text3);margin-bottom:16px;}
  .tasacion-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-bottom:14px;}
  .tasacion-item{background:rgba(255,255,255,.03);border-radius:8px;padding:10px 12px;}
  .tasacion-item-label{font-size:10px;color:var(--text3);margin-bottom:3px;}
  .tasacion-item-val{font-size:13px;color:var(--text);font-weight:500;}
  .tasacion-item-val.pos{color:var(--green);}
  .conf-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:500;letter-spacing:.5px;text-transform:uppercase;margin-bottom:12px;}
  .conf-alta{background:var(--green-dim);color:var(--green);border:1px solid var(--green);}
  .conf-media{background:#2a2010;color:#d4a844;border:1px solid #7a6020;}
  .conf-baja{background:var(--red-dim);color:var(--red);border:1px solid var(--red);}
  .analisis-text{font-size:12px;color:var(--text2);line-height:1.7;border-top:1px solid var(--border);padding-top:12px;}
  .comp-mini{display:flex;flex-direction:column;gap:6px;margin-top:12px;}
  .comp-mini-item{display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.025);border-radius:7px;padding:8px 12px;font-size:12px;}
  .comp-mini-addr{color:var(--text2);flex:1;}
  .comp-mini-uf{color:var(--text);font-weight:600;text-align:right;}
  .comp-mini-m2{font-size:10px;color:var(--text3);text-align:right;}
  .sii-bubble{background:var(--blue-dim);border:1px solid rgba(90,159,212,.3);border-radius:12px;padding:14px 16px;margin-top:6px;}
  .sii-bubble-tag{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--blue);margin-bottom:6px;}
  .sii-bubble-addr{font-size:13px;color:var(--text);font-weight:500;margin-bottom:10px;}
  .sii-bubble-grid{display:flex;flex-wrap:wrap;gap:8px;}
  .sii-bubble-item{background:rgba(255,255,255,.04);border-radius:6px;padding:6px 10px;}
  .sii-bubble-label{font-size:9px;color:var(--text3);margin-bottom:1px;}
  .sii-bubble-val{font-size:13px;color:var(--text);font-weight:500;}
  .bubble-loader{display:flex;align-items:center;gap:10px;padding:4px 0;font-size:13px;color:var(--text3);}
  .bubble-spinner{width:16px;height:16px;border:2px solid var(--border2);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite;flex-shrink:0;}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:600px){.chat-app{height:100dvh;}.landing-cards{flex-direction:column;align-items:center;}.tasacion-valor{font-size:28px;}}
`

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
    { id:'terraza_m2', msg:'¿Tiene terraza? ¿Cuántos m² aproximadamente?', tipo:'options', opts:[
      {id:'0',label:'Sin terraza',icon:'—'},{id:'5',label:'~5 m²',icon:'🪴'},{id:'10',label:'~10 m²',icon:'🌿'},
      {id:'15',label:'~15 m²',icon:'🌳'},{id:'20+',label:'20 m² o más',icon:'🏡'}]},
    { id:'estacionamientos', msg:'¿Cuántos estacionamientos incluye?', tipo:'options', opts:[
      {id:'0',label:'Sin estacionamiento',icon:'—'},{id:'1',label:'1 estacionamiento',icon:'🚗'},
      {id:'2',label:'2 estacionamientos',icon:'🚗🚗'},{id:'3+',label:'3 o más',icon:'🅿️'}]},
    { id:'bodega', msg:'¿Tiene bodega?', tipo:'options', opts:[
      {id:'0',label:'Sin bodega',icon:'—'},{id:'1',label:'1 bodega',icon:'📦'},{id:'2+',label:'2 o más',icon:'📦📦'}]},
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
const AJUSTE_REMO = { alta:20, media:14, baja:7, ninguna:0 }
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
  const m2 = parseFloat(data.siiData?.m2_construido) || 60
  const ajRemo = (AJUSTE_REMO[data.remodelacion] || 0) * m2 * (AJUSTE_TIEMPO[data.tiempo_remo] || 1)
  const caract = [
    ...(data.caracteristicas || []),
    data.derechos_agua || '',
    data.infraestructura || '',
  ].flat()
  const ajCar = caract.reduce((s, c) => s + (AJUSTES_CARACT[c] || 0), 0)
  return { ajRemo: Math.round(ajRemo), ajCar }
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
  const [placeholder, setPlaceholder] = useState('')
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
      await addAgent(`Perfecto, ${nombre === 'agrícola' ? 'una propiedad' : 'una'} ${nombre}. Voy a hacerte algunas preguntas para conocerla bien.\n\nPrimero necesito la dirección exacta o la ubicación:`, 700)
      setInputMode('text')
      setPlaceholder('Ej: Av. Los Leones 1200 / Fundo Las Vertientes, Sector El Monte...')
      setStage('direccion')

    } else if (stage === 'confirmar_sii') {
      if (opt.id === 'si') {
        await addAgent('Perfecto, datos confirmados ✓', 400)
        await nextStep(data, 0)
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
      addUser(val)
      const newData = { ...data, direccion: val }
      setData(newData)

      // ¿RM? preguntar comuna, si no pedir región
      const esProbableRM = COMUNAS_RM.some(c => val.toLowerCase().includes(c.toLowerCase()))
      if (esProbableRM || ['casa','departamento','oficina','comercial'].includes(data.tipo)) {
        await addAgent('¿En qué comuna está?', 400)
        setInputMode('comuna')
        setStage('comuna')
      } else {
        await addAgent('¿En qué región / comuna está?', 400)
        setInputMode('text')
        setPlaceholder('Ej: Rancagua, O\'Higgins / Curicó, Maule')
        setStage('comuna')
      }

    } else if (stage === 'comuna') {
      addUser(val)
      const newData = { ...data, comuna: val }
      setData(newData)
      await fetchSII(newData)

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
      const q = encodeURIComponent(d.direccion)
      const res = await fetch(`/api/sii?direccion=${q}&comuna=${encodeURIComponent(d.comuna)}`)
      const json = await res.json()
      const sii = json.resultados?.[0] || json
      const newData = { ...d, siiData: sii }
      setData(newData)
      setMessages(m => m.filter(x => !(x.role==='agent' && x.content?.type==='loading')))
      setMessages(m => [...m, { role:'agent', content:{ type:'sii', data:sii }}])
      await addAgent('¿Estos datos son correctos?', 400)
      setInputMode('options')
      setOptions([{id:'si',label:'Sí, son correctos',icon:'✅'},{id:'no',label:'No, corregir',icon:'✏️'}])
      setStage('confirmar_sii')
    } catch {
      setMessages(m => m.filter(x => !(x.role==='agent' && x.content?.type==='loading')))
      const newData = { ...d, siiData:{ direccion:`${d.direccion}, ${d.comuna}` } }
      setData(newData)
      await addAgent('No pude obtener los datos del SII ahora. Continuemos con lo que me puedas contar.', 500)
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
          answers:{ remodelacion: finalData.remodelacion || 'ninguna', conservacion:'bueno', terraza_m2: parseInt(finalData.terraza_m2)||0, estacionamientos: parseInt(finalData.estacionamientos)||0, bodegas: parseInt(finalData.bodega)||0 },
          extras: finalData,
        })
      })
      const resultado = await res.json()
      if (resultado.error) throw new Error(resultado.error)
      setMessages(m => m.filter(x => !(x.role==='agent' && x.content?.type==='loading')))
      const { ajRemo, ajCar } = calcAjustes(finalData)
      const valorBase = resultado.valor_uf || 0
      const valorFinal = valorBase + ajRemo + ajCar
      const rangoMin = Math.round(valorFinal * 0.93)
      const rangoMax = Math.round(valorFinal * 1.07)
      setMessages(m => [...m, { role:'agent', content:{ type:'tasacion', resultado, valorFinal, rangoMin, rangoMax, ajRemo, ajCar, valorBase }}])
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
            {d.rol && <div className="sii-bubble-item"><div className="sii-bubble-label">ROL</div><div className="sii-bubble-val">{d.rol}</div></div>}
            {d.destino && <div className="sii-bubble-item"><div className="sii-bubble-label">Destino</div><div className="sii-bubble-val">{d.destino}</div></div>}
            {d.m2_construido && <div className="sii-bubble-item"><div className="sii-bubble-label">M² construidos</div><div className="sii-bubble-val">{d.m2_construido} m²</div></div>}
            {d.m2_terreno && <div className="sii-bubble-item"><div className="sii-bubble-label">M² terreno</div><div className="sii-bubble-val">{d.m2_terreno} m²</div></div>}
            {d.anio_construccion && <div className="sii-bubble-item"><div className="sii-bubble-label">Año const.</div><div className="sii-bubble-val">{d.anio_construccion}</div></div>}
            {d.avaluo_fiscal_uf && <div className="sii-bubble-item"><div className="sii-bubble-label">Avalúo fiscal</div><div className="sii-bubble-val">{Math.round(d.avaluo_fiscal_uf).toLocaleString('es-CL')} UF</div></div>}
          </div>
        </div>
      )
    }
    if (content?.type === 'tasacion') {
      const { resultado, valorFinal, rangoMin, rangoMax, ajRemo, ajCar, valorBase } = content
      const conf = resultado.confianza?.toLowerCase()
      const cc = conf?.includes('alta') ? 'conf-alta' : conf?.includes('media') ? 'conf-media' : 'conf-baja'
      return (
        <div className="tasacion-card">
          <div className="tasacion-label">Tasación de mercado</div>
          <div className="tasacion-valor">{fmtUF(valorFinal)}</div>
          <div className="tasacion-rango">Rango: {fmtUF(rangoMin)} — {fmtUF(rangoMax)}</div>
          <div className={`conf-badge ${cc}`}>Confianza {resultado.confianza}</div>
          <div className="tasacion-grid">
            <div className="tasacion-item"><div className="tasacion-item-label">Base CBR</div><div className="tasacion-item-val">{fmtUF(valorBase)}</div></div>
            {ajRemo>0 && <div className="tasacion-item"><div className="tasacion-item-label">Remodelación</div><div className="tasacion-item-val pos">+{fmtUF(ajRemo)}</div></div>}
            {ajCar>0 && <div className="tasacion-item"><div className="tasacion-item-label">Características</div><div className="tasacion-item-val pos">+{fmtUF(ajCar)}</div></div>}
            {resultado.precio_m2 && <div className="tasacion-item"><div className="tasacion-item-label">Precio/m²</div><div className="tasacion-item-val">{resultado.precio_m2} UF/m²</div></div>}
          </div>
          {resultado.analisis && <div className="analisis-text">{resultado.analisis}</div>}
          {resultado.comparables?.length>0 && (
            <div className="comp-mini">
              {resultado.comparables.slice(0,3).map((c,i) => (
                <div key={i} className="comp-mini-item">
                  <div className="comp-mini-addr">{c.direccion} · {c.m2} m²</div>
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
  if (view === 'vendedor') return <><style dangerouslySetInnerHTML={{__html:STYLES}}/><ChatVendedor onBack={() => setView('landing')}/></>
  return (
    <>
      <style dangerouslySetInnerHTML={{__html:STYLES}}/>
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
