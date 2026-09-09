// scripts/gen-indice-mercado.mjs
// Genera app/lib/indice-mercado-data.js desde el resultado de la query de
// BigQuery de Data Inmobiliaria (ver claude/indice-mercado-query.sql en el
// proyecto). Entrada: JSON con rows [{cod_com, tipo, bandas}] donde bandas =
// "t~2012-07:50:435|2013-06:56.6:398|...;c~...;m~...;g~..."
// Uso: node scripts/gen-indice-mercado.mjs <rows.json> [fecha-corte YYYY-MM-DD]
import { readFileSync, writeFileSync } from 'node:fs'

const [, , entrada, corte] = process.argv
if (!entrada) { console.error('uso: node scripts/gen-indice-mercado.mjs rows.json [fecha]'); process.exit(1) }
const rows = JSON.parse(readFileSync(entrada, 'utf8'))
const fecha = corte || new Date().toISOString().slice(0, 10)

const data = {}
for (const { cod_com, tipo, bandas } of rows) {
  const com = (data[String(cod_com)] = data[String(cod_com)] || {})
  const porBanda = {}
  for (const trozo of String(bandas).split(';')) {
    const [banda, serie] = trozo.split('~')
    if (!banda || !serie) continue
    const puntos = serie.split('|').map((p) => {
      const [mes, med, n] = p.split(':')
      return { trimestre: mes, uf_m2: parseFloat(med), n: parseInt(n, 10) }
    }).filter((p) => /^\d{4}-\d{2}$/.test(p.trimestre) && p.uf_m2 > 0 && p.n > 0)
    if (puntos.length >= 4) porBanda[banda] = puntos
  }
  if (Object.keys(porBanda).length) com[tipo] = porBanda
}

const js = `// app/lib/indice-mercado-data.js — GENERADO, no editar a mano.
// Índice REAL de mercado por comuna (código SII) x tipo x banda de tamaño:
// mediana anual de UF/m² de VENTAS REALES (CBR x catastro, Data Inmobiliaria/
// BigQuery). El último punto es "últimos 12 meses". Bandas: c=chica, m=media,
// g=grande, t=todas (casa: <120 / 120-250 / >250 m²; depto: <60 / 60-120 / >120).
// Regenerar con scripts/gen-indice-mercado.mjs (query en el proyecto).
export const INDICE_GENERADO = '${fecha}'
export const INDICE_MERCADO = ${JSON.stringify(data)}
`
writeFileSync(new URL('../app/lib/indice-mercado-data.js', import.meta.url), js)
const comunas = Object.keys(data).length
console.log(`OK: ${comunas} comunas, generado ${fecha}, ${Math.round(js.length / 1024)} KB`)
