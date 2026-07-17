'use client'
// Informe de tasación en pestaña propia (documento blanco imprimible).
// Los datos llegan desde el chat vía localStorage ('iaprop_informe').

const fmtUF = (n) => n ? `${Number(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} UF` : '—'
const rolCorto = (r) => { const p = String(r || '').split('-'); return p.length >= 3 ? p.slice(1).join('-') : (r || '') }

// Informe de tasación en formato documento (blanco, tipo informe profesional).
// Se guarda como PDF con el diálogo nativo del navegador (Imprimir → Guardar como PDF).
export default function InformeTasacion({ data }) {
  const r = data.resultado || {}
  const sii = data.siiData || {}
  const df = data.dirForm || {}
  const key = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY || ''
  const punto = r.punto
  const hoy = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
  const dirTxt = [df.direccion, df.depto ? (String(df.tipo).toLowerCase() === 'oficina' ? 'Of. ' : 'Depto ') + df.depto : null, df.comuna].filter(Boolean).join(', ') || sii.direccion || 'Propiedad tasada'
  const S = {
    sec: { marginTop: 18, breakInside: 'avoid' },
    h2: { fontSize: 13, fontWeight: 700, color: '#8a6d2f', borderBottom: '2px solid #caa15a', paddingBottom: 4, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    row: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', borderBottom: '1px solid #eee', fontSize: 12 },
    th: { textAlign: 'left', fontSize: 11, color: '#666', borderBottom: '1px solid #ccc', padding: '3px 6px' },
    td: { fontSize: 11, color: '#1a1a1a', borderBottom: '1px solid #eee', padding: '3px 6px' },
    tdr: { fontSize: 11, color: '#1a1a1a', borderBottom: '1px solid #eee', padding: '3px 6px', textAlign: 'right', whiteSpace: 'nowrap' },
  }
  return (
    <div style={{ background: '#ececec', minHeight: '100vh', padding: '24px 10px' }}>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          #informe-print { box-shadow: none !important; border-radius: 0 !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
        }
      ` + ''}</style>
      <div className="no-print" style={{ maxWidth: 820, margin: '0 auto 10px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={() => window.print()} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#caa15a', color: '#1a1a1a', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>🖨️ Guardar como PDF</button>
      </div>
      <div id="informe-print" style={{ maxWidth: 820, margin: '0 auto', background: '#fff', color: '#1a1a1a', borderRadius: 10, padding: '28px 32px', fontFamily: 'Arial, Helvetica, sans-serif', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #caa15a', paddingBottom: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Informe de Tasación</div>
            <div style={{ fontSize: 13, color: '#555', marginTop: 4 }}>{dirTxt}</div>
            {sii.rol && <div style={{ fontSize: 12, color: '#777' }}>ROL SII: {rolCorto(sii.rol)}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#8a6d2f' }}>IA Prop · Valentina</div>
            <div style={{ fontSize: 11, color: '#777' }}>Emitido el {hoy}</div>
            <div style={{ fontSize: 11, color: '#777' }}>Confianza: {r.confianza || '—'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, textAlign: 'center' }}>
          <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: '10px 6px' }}>
            <div style={{ fontSize: 11, color: '#777' }}>Rango mínimo</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtUF(data.rangoMin)}</div>
          </div>
          <div style={{ flex: 1.3, border: '2px solid #caa15a', background: '#fdf8ee', borderRadius: 8, padding: '10px 6px' }}>
            <div style={{ fontSize: 11, color: '#8a6d2f' }}>Estimación de valor comercial</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#8a6d2f' }}>{fmtUF(data.valorFinal)}</div>
            {r.precio_m2 ? <div style={{ fontSize: 11, color: '#777' }}>{r.precio_m2} UF/m² construido</div> : null}
          </div>
          <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: '10px 6px' }}>
            <div style={{ fontSize: 11, color: '#777' }}>Rango máximo</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtUF(data.rangoMax)}</div>
          </div>
        </div>

        {punto && key && (
          <div style={{ ...S.sec, display: 'flex', gap: 8 }}>
            <img src={'https://maps.googleapis.com/maps/api/streetview?size=400x240&fov=75&location=' + punto.lat + ',' + punto.lng + '&key=' + key} alt="Fachada" style={{ width: '33.3%', minWidth: 0, borderRadius: 6, objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
            <img src={'https://maps.googleapis.com/maps/api/staticmap?zoom=16&size=400x240&maptype=roadmap&center=' + punto.lat + ',' + punto.lng + '&markers=color:red%7C' + punto.lat + ',' + punto.lng + '&key=' + key} alt="Plano de ubicación" style={{ width: '33.3%', minWidth: 0, borderRadius: 6, objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
            <img src={'https://maps.googleapis.com/maps/api/staticmap?zoom=18&size=400x240&maptype=hybrid&center=' + punto.lat + ',' + punto.lng + '&markers=color:red%7C' + punto.lat + ',' + punto.lng + '&key=' + key} alt="Vista satelital" style={{ width: '33.3%', minWidth: 0, borderRadius: 6, objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
          </div>
        )}

        <div style={S.sec}>
          <div style={S.h2}>1 · Identificación de la propiedad (SII)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 14px' }}>
            {[
              ['Tipo', df.tipo || '—'],
              ['M² construidos', sii.m2_construido ? sii.m2_construido + ' m²' : '—'],
              ['M² terreno', sii.m2_terreno ? sii.m2_terreno + ' m²' : '—'],
              ['Año construcción', sii.anio_construccion || '—'],
              ['Avalúo fiscal', sii.avaluo_total_clp ? '$' + Number(sii.avaluo_total_clp).toLocaleString('es-CL') : '—'],
              ['Contribuciones trim.', sii.contribuciones_clp ? '$' + Number(sii.contribuciones_clp).toLocaleString('es-CL') : '—'],
              ['Material', sii.material || '—'],
              ['Destino SII', sii.destino || 'Habitacional'],
            ].map(([k, v], i) => (
              <div key={i} style={{ fontSize: 12, padding: '3px 0', borderBottom: '1px solid #eee' }}><span style={{ color: '#777' }}>{k}: </span><b>{v}</b></div>
            ))}
          </div>
        </div>

        {(r.desglose?.length > 0 || data.ajRemo > 0 || data.ajCar > 0 || data.ajJardin > 0) && (
          <div style={S.sec}>
            <div style={S.h2}>2 · Desglose del valor</div>
            {r.desglose?.map((it, i) => (
              <div key={i} style={S.row}><span>{it.concepto}{it.calculo ? <span style={{ color: '#999' }}> — {it.calculo}</span> : null}</span><b style={{ whiteSpace: 'nowrap' }}>{(it.valor_uf >= 0 ? '+' : '') + fmtUF(it.valor_uf)}</b></div>
            ))}
            {data.ajRemo > 0 && <div style={S.row}><span>Remodelación</span><b>+{fmtUF(data.ajRemo)}</b></div>}
            {data.ajCar > 0 && <div style={S.row}><span>Características adicionales</span><b>+{fmtUF(data.ajCar)}</b></div>}
            {data.ajJardin > 0 && <div style={S.row}><span>Jardín / patio</span><b>+{fmtUF(data.ajJardin)}</b></div>}
            <div style={{ ...S.row, borderBottom: 'none', borderTop: '2px solid #caa15a', marginTop: 4, fontSize: 13 }}><b>Total estimado</b><b>{fmtUF(data.valorFinal)}</b></div>
          </div>
        )}

        {r.arriendo?.uf_mes > 0 && (
          <div style={S.sec}>
            <div style={S.h2}>3 · Arriendo y rentabilidad</div>
            <div style={{ display: 'flex', gap: 10, textAlign: 'center' }}>
              <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 8 }}><div style={{ fontSize: 11, color: '#777' }}>Arriendo estimado</div><div style={{ fontSize: 15, fontWeight: 700 }}>{r.arriendo.uf_mes} UF/mes</div></div>
              {r.arriendo.rentabilidad_pct != null && <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 8 }}><div style={{ fontSize: 11, color: '#777' }}>Rentabilidad anual</div><div style={{ fontSize: 15, fontWeight: 700 }}>{r.arriendo.rentabilidad_pct}%</div></div>}
              {r.arriendo.retorno_anos != null && <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: 8 }}><div style={{ fontSize: 11, color: '#777' }}>Retorno inversión</div><div style={{ fontSize: 15, fontWeight: 700 }}>{r.arriendo.retorno_anos} años</div></div>}
            </div>
            <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>Mediana de {r.arriendo.n_ofertas} ofertas de arriendo vigentes de tipología similar en el sector.</div>
          </div>
        )}

        {r.plan_regulador && (
          <div style={S.sec}>
            <div style={S.h2}>4 · Plan regulador {r.plan_regulador.zona ? '— ' + r.plan_regulador.zona : ''}{r.plan_regulador.nombre_zona && r.plan_regulador.nombre_zona !== r.plan_regulador.zona ? ' · ' + r.plan_regulador.nombre_zona : ''}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 14px' }}>
              {[
                ['Uso de suelo', r.plan_regulador.uso_suelo],
                ['Altura máx.', r.plan_regulador.altura_max_pisos ? r.plan_regulador.altura_max_pisos + ' pisos' : null],
                ['Constructibilidad', r.plan_regulador.coef_constructibilidad],
                ['Ocupación de suelo', r.plan_regulador.coef_ocupacion_suelo],
                ['Densidad máx.', r.plan_regulador.densidad_max],
                ['Predial mínimo', r.plan_regulador.superficie_predial_minima_m2 ? r.plan_regulador.superficie_predial_minima_m2 + ' m²' : null],
              ].filter(([, v]) => v).map(([k, v], i) => (
                <div key={i} style={{ fontSize: 12, padding: '3px 0', borderBottom: '1px solid #eee' }}><span style={{ color: '#777' }}>{k}: </span><b>{v}</b></div>
              ))}
            </div>
            {r.plan_regulador.observaciones && <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>{r.plan_regulador.observaciones}</div>}
          </div>
        )}

        {(r.analisis || r.factores_positivos?.length > 0 || r.factores_negativos?.length > 0 || r.recomendacion_precio_venta) && (
          <div style={S.sec}>
            <div style={S.h2}>5 · Análisis y recomendación</div>
            {r.analisis && <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{r.analisis}</div>}
            <div style={{ display: 'flex', gap: 16 }}>
              {r.factores_positivos?.length > 0 && <div style={{ flex: 1 }}>{r.factores_positivos.map((f, i) => <div key={i} style={{ fontSize: 11, color: '#2e7d32', marginBottom: 2 }}>✓ {f}</div>)}</div>}
              {r.factores_negativos?.length > 0 && <div style={{ flex: 1 }}>{r.factores_negativos.map((f, i) => <div key={i} style={{ fontSize: 11, color: '#c62828', marginBottom: 2 }}>✗ {f}</div>)}</div>}
            </div>
            {r.recomendacion_precio_venta && <div style={{ fontSize: 12, marginTop: 8, padding: 8, background: '#fdf8ee', borderLeft: '3px solid #caa15a' }}><b>Recomendación: </b>{r.recomendacion_precio_venta}</div>}
          </div>
        )}

        {r.historial_propiedad?.length > 0 && (
          <div style={S.sec}>
            <div style={S.h2}>6 · Ventas anteriores de esta propiedad (CBR)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={S.th}>Fecha de inscripción</th><th style={S.th}>m²</th><th style={{ ...S.th, textAlign: 'right' }}>UF/m²</th><th style={{ ...S.th, textAlign: 'right' }}>Valor</th></tr></thead>
              <tbody>
                {r.historial_propiedad.map((h, i) => (
                  <tr key={i}><td style={S.td}>{h.fecha}</td><td style={S.td}>{h.m2 || '—'}</td><td style={S.tdr}>{h.uf_m2 || '—'}</td><td style={S.tdr}>{fmtUF(h.uf)}</td></tr>
                ))}
              </tbody>
            </table>
            {data.valorFinal > 0 && r.historial_propiedad[0]?.uf > 0 && (
              <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Frente a la última venta registrada ({r.historial_propiedad[0].fecha}), esta tasación implica una variación de <b>{Math.round(((data.valorFinal / r.historial_propiedad[0].uf) - 1) * 100)}%</b>.</div>
            )}
          </div>
        )}

        {r.ventas_conjunto?.length > 0 && (
          <div style={S.sec}>
            <div style={S.h2}>7 · Ventas efectivas en el mismo edificio o conjunto</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={S.th}>Dirección</th><th style={S.th}>Fecha</th><th style={S.th}>m²</th><th style={{ ...S.th, textAlign: 'right' }}>UF/m²</th><th style={{ ...S.th, textAlign: 'right' }}>Valor</th></tr></thead>
              <tbody>
                {r.ventas_conjunto.slice(0, 12).map((c, i) => (
                  <tr key={i}><td style={S.td}>{c.direccion || '—'}</td><td style={S.td}>{c.fecha}</td><td style={S.td}>{c.m2 || '—'}</td><td style={S.tdr}>{c.uf_m2 || '—'}</td><td style={S.tdr}>{fmtUF(c.uf)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(() => {
          // Ventas reales inscritas en el CBR: comparables directas si las hay;
          // si no, las mismas ventas del sector que respaldan el valor y el mapa.
          const ventasCBR = (r.comparables?.length > 0)
            ? r.comparables.map((c) => ({ dir: c.direccion, star: !!c.mismo_edificio, fecha: c.fecha, m2: c.m2, m2t: c.m2_terreno, ufm2: c.uf_m2, uf: c.precio_uf, dist: c.distancia_m }))
            : (r.ventas_mapa || []).slice(0, 15).map((v) => ({ dir: v.dir, star: false, fecha: v.fecha, m2: v.m2, m2t: v.m2_terreno, ufm2: v.uf_m2, uf: v.uf, dist: null }))
          if (!ventasCBR.length) return null
          const hayDist = ventasCBR.some((c) => c.dist != null)
          const hayStar = ventasCBR.some((c) => c.star)
          return (
            <div style={S.sec}>
              <div style={S.h2}>8 · Ventas reales inscritas en el CBR del sector</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>Dirección</th><th style={S.th}>Fecha</th><th style={S.th}>m² const.</th><th style={S.th}>m² terreno</th><th style={{ ...S.th, textAlign: 'right' }}>UF/m²</th><th style={{ ...S.th, textAlign: 'right' }}>Valor</th>{hayDist && <th style={{ ...S.th, textAlign: 'right' }}>Distancia</th>}</tr></thead>
                <tbody>
                  {ventasCBR.map((c, i) => (
                    <tr key={i}><td style={S.td}>{c.dir || '—'}{c.star ? ' ★' : ''}</td><td style={S.td}>{c.fecha || '—'}</td><td style={S.td}>{c.m2 || '—'}</td><td style={S.td}>{c.m2t || '—'}</td><td style={S.tdr}>{c.ufm2 || '—'}</td><td style={S.tdr}>{fmtUF(c.uf)}</td>{hayDist && <td style={S.tdr}>{c.dist != null ? c.dist + ' m' : '—'}</td>}</tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>{hayStar ? '★ Venta en el mismo edificio o conjunto. ' : ''}Fuente: Conservador de Bienes Raíces / SII (transacciones inscritas, últimos 5 años).</div>
            </div>
          )
        })()}

        {r.ofertas_venta?.length > 0 && (
          <div style={S.sec}>
            <div style={S.h2}>9 · Ofertas de venta activas en el sector</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={S.th}>Dirección / aviso</th><th style={S.th}>Publicado</th><th style={S.th}>m²</th><th style={{ ...S.th, textAlign: 'right' }}>UF/m²</th><th style={{ ...S.th, textAlign: 'right' }}>Precio</th></tr></thead>
              <tbody>
                {r.ofertas_venta.map((o, i) => (
                  <tr key={i}>
                    <td style={S.td}>{o.url ? <a href={o.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>{o.dir || 'Ver aviso ↗'}</a> : (o.dir || 'Aviso')}</td>
                    <td style={S.td}>{o.fecha || '—'}</td><td style={S.td}>{o.m2 || '—'}</td><td style={S.tdr}>{o.uf_m2 || '—'}</td><td style={S.tdr}>{fmtUF(o.uf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>Fuente: portales inmobiliarios (publicaciones vigentes). Los precios de oferta suelen estar 5–10% sobre el valor de cierre.</div>
          </div>
        )}

        {r.ofertas_arriendo?.length > 0 && (
          <div style={S.sec}>
            <div style={S.h2}>10 · Ofertas de arriendo activas en el sector</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={S.th}>Dirección / aviso</th><th style={S.th}>Publicado</th><th style={S.th}>m²</th><th style={{ ...S.th, textAlign: 'right' }}>UF/mes</th></tr></thead>
              <tbody>
                {r.ofertas_arriendo.map((o, i) => (
                  <tr key={i}>
                    <td style={S.td}>{o.url ? <a href={o.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>{o.dir || 'Ver aviso ↗'}</a> : (o.dir || 'Aviso')}</td>
                    <td style={S.td}>{o.fecha || '—'}</td><td style={S.td}>{o.m2 || '—'}</td><td style={S.tdr}>{o.uf_mes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>Fuente: portales inmobiliarios (publicaciones vigentes de tipología similar).</div>
          </div>
        )}

        {r.sector && (r.sector.composicion || r.sector.indice_uf_m2 || r.sector.plusvalia_12m_pct != null) && (
          <div style={S.sec}>
            <div style={S.h2}>11 · Indicadores del sector</div>
            {r.sector.plusvalia_12m_pct != null && <div style={{ fontSize: 12, marginBottom: 6 }}>Plusvalía últimos 12 meses (mediana UF/m², mismo tipo): <b>{r.sector.plusvalia_12m_pct > 0 ? '+' : ''}{r.sector.plusvalia_12m_pct}%</b></div>}
            {r.sector.composicion && <div style={{ fontSize: 12, marginBottom: 6 }}>Composición del sector: {r.sector.composicion.map((c) => c.tipo + ' ' + c.pct + '%').join(' · ')}</div>}
            {r.sector.indice_uf_m2?.length >= 2 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={S.th}>Trimestre</th>{r.sector.indice_uf_m2.map((x, i) => <th key={i} style={{ ...S.th, textAlign: 'right' }}>{x.trimestre}</th>)}</tr></thead>
                <tbody>
                  <tr><td style={S.td}>UF/m² mediana</td>{r.sector.indice_uf_m2.map((x, i) => <td key={i} style={S.tdr}>{x.uf_m2}</td>)}</tr>
                  <tr><td style={S.td}>N° ventas</td>{r.sector.indice_uf_m2.map((x, i) => <td key={i} style={S.tdr}>{x.n}</td>)}</tr>
                </tbody>
              </table>
            )}
          </div>
        )}

        {r.potencial_desarrollo?.aplica && (
          <div style={S.sec}>
            <div style={S.h2}>12 · Potencial de desarrollo del terreno</div>
            <div style={{ fontSize: 12, lineHeight: 1.5 }}>{r.potencial_desarrollo.descripcion}</div>
            {r.potencial_desarrollo.advertencia && <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>⚠️ {r.potencial_desarrollo.advertencia}</div>}
          </div>
        )}

        <div style={{ marginTop: 22, borderTop: '1px solid #ddd', paddingTop: 8, fontSize: 10, color: '#999', lineHeight: 1.4 }}>
          Informe generado automáticamente por IA Prop sobre la base de ventas reales inscritas en el Conservador de Bienes Raíces, datos del Servicio de Impuestos Internos y ofertas publicadas en portales inmobiliarios. Tiene carácter orientativo y no constituye una tasación bancaria oficial. Los valores pueden variar según terminaciones, estado de conservación, distribución y condiciones de mercado al momento de la transacción.
        </div>
      </div>
    </div>
  )
}
