// app/lib/comunas.js
// Comuna (nombre) -> cod_com del SII: la primera parte del ROL.
// Lo usan /api/tasar (para anclar los comparables) y /api/predio (para resolver
// un ROL parcial "3669-481" que viene con la comuna aparte).

export const COD_COMUNA = {
  'CERRILLOS':14166,'CERRO NAVIA':14156,'CONCHALI':14127,'EL BOSQUE':16165,'ESTACION CENTRAL':14157,
  'HUECHURABA':14158,'INDEPENDENCIA':13167,'LA CISTERNA':16110,'LA FLORIDA':15128,'LA GRANJA':16131,
  'LA PINTANA':16154,'LA REINA':15132,'LAS CONDES':15108,'LO BARNECHEA':15161,'LO ESPEJO':16164,
  'LO PRADO':14155,'MACUL':15151,'MAIPU':14109,'NUNOA':15105,'PEDRO AGUIRRE CERDA':16162,
  'PENALOLEN':15152,'PROVIDENCIA':15103,'PUDAHUEL':14111,'PUENTE ALTO':16301,'QUILICURA':14114,
  'QUINTA NORMAL':14107,'RECOLETA':13159,'RENCA':14113,'SAN BERNARDO':16401,'SAN JOAQUIN':16163,
  'SAN MIGUEL':16106,'SAN RAMON':16153,'SANTIAGO':13101,'VITACURA':15160,
}

export function normalizaComuna(s) {
  return String(s || '').trim().toUpperCase()
    .replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U')
    .replace(/Ñ/g,'N')
}
