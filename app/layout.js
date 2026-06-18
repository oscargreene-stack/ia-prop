import './globals.css'
import ProductNav from './components/ProductNav'

export const metadata = {
  title: 'GreatDeal · Tasar — Agente Tasador Inmobiliario',
  description: 'Agente de valorización de propiedades para el mercado chileno',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <ProductNav active="tasar" />
        {children}
      </body>
    </html>
  )
}
