import './globals.css'

export const metadata = {
  title: 'IA Prop — Tasador Inmobiliario',
  description: 'Agente de valorización de propiedades para el mercado chileno',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
