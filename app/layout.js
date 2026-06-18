import './globals.css'
import ProductNav from './components/ProductNav'

export const metadata = {
  title: 'C2C · Tasar — Agente Tasador Inmobiliario',
  description: 'Agente de valorización de propiedades para el mercado chileno — C2C property market',
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
