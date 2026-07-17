'use client'
// Pestaña del informe de tasación: lee los datos que dejó el chat en
// localStorage y muestra el documento listo para imprimir / guardar como PDF.
import { useEffect, useState } from 'react'
import InformeTasacion from '../components/InformeTasacion'

export default function InformePage() {
  const [data, setData] = useState(undefined)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('iaprop_informe')
      setData(raw ? JSON.parse(raw) : null)
    } catch (e) { setData(null) }
  }, [])
  useEffect(() => {
    const dir = data?.dirForm?.direccion || data?.siiData?.direccion
    if (dir) document.title = 'Informe de Tasación · ' + dir
  }, [data])
  if (data === undefined) return null
  if (data === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontFamily: 'Arial, sans-serif', fontSize: 15, textAlign: 'center', padding: 20 }}>
        No hay un informe para mostrar.<br/>Genera una tasación en el chat y abre el informe desde ahí.
      </div>
    )
  }
  return <InformeTasacion data={data} />
}
