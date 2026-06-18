'use client'

/**
 * ProductNav — Header global de navegación entre las apps de C2C.
 *
 * Se muestra en la parte superior de IA Prop (Tasar) y permite saltar a:
 *   - Home del shell (C2C · property market)
 *   - Buscar propiedades
 *   - Tasar (este producto, marcado como "active")
 *   - Reels (catálogo + reels en properties-app)
 *
 * En dev (localhost) los links son relativos para no romper.
 * En prod, configurar NEXT_PUBLIC_SHELL_URL=https://c2c.cl (o el dominio que se use)
 * en Vercel.
 *
 * Para ocultarlo en pantallas full-screen (ej. chat inmersivo) usar:
 *   <ProductNav hidden />
 */
export default function ProductNav({ hidden = false, active = 'tasar' }) {
  if (hidden) return null

  const SHELL = process.env.NEXT_PUBLIC_SHELL_URL || ''

  const links = [
    { id: 'buscar', label: 'Buscar', href: `${SHELL}/buscar` },
    { id: 'tasar',  label: 'Tasar',  href: `${SHELL}/tasar`  },
    { id: 'reels',  label: 'Reels',  href: `${SHELL}/reels`  },
  ]

  return (
    <nav className="c2c-nav" aria-label="Navegación C2C">
      <a href={SHELL || '/'} className="c2c-nav-brand">
        <span className="c2c-nav-logo">C<em>2</em>C</span>
        <span className="c2c-nav-tagline">property market</span>
      </a>
      <ul className="c2c-nav-links">
        {links.map(l => (
          <li key={l.id}>
            <a
              href={l.href}
              className={`c2c-nav-link${active === l.id ? ' is-active' : ''}`}
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>

      <style jsx>{`
        .c2c-nav {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          gap: 32px;
          padding: 12px 28px;
          background: rgba(10, 10, 8, 0.78);
          backdrop-filter: saturate(180%) blur(14px);
          -webkit-backdrop-filter: saturate(180%) blur(14px);
          border-bottom: 1px solid rgba(200, 169, 110, 0.12);
        }
        .c2c-nav-brand {
          display: flex;
          flex-direction: column;
          gap: 2px;
          text-decoration: none;
          line-height: 1;
        }
        .c2c-nav-logo {
          font-family: 'Playfair Display', 'Cormorant Garamond', serif;
          font-size: 22px;
          font-weight: 500;
          color: #f2ede4;
          letter-spacing: -0.5px;
          line-height: 1;
        }
        .c2c-nav-logo em {
          font-style: italic;
          color: #c8a96e;
          font-weight: 400;
        }
        .c2c-nav-tagline {
          font-family: 'Outfit', system-ui, sans-serif;
          font-size: 10px;
          font-weight: 300;
          color: #5a5650;
          letter-spacing: 2px;
          text-transform: lowercase;
          line-height: 1;
        }
        .c2c-nav-links {
          display: flex;
          gap: 4px;
          list-style: none;
          margin: 0;
          padding: 0;
          margin-left: auto;
        }
        .c2c-nav-link {
          display: inline-block;
          padding: 8px 14px;
          font-family: 'Outfit', system-ui, sans-serif;
          font-size: 13px;
          font-weight: 400;
          letter-spacing: 0.3px;
          color: #9e9888;
          text-decoration: none;
          border-radius: 8px;
          transition: color .15s ease, background .15s ease;
        }
        .c2c-nav-link:hover {
          color: #e8cc9a;
          background: rgba(200, 169, 110, 0.06);
        }
        .c2c-nav-link.is-active {
          color: #c8a96e;
          background: rgba(200, 169, 110, 0.08);
        }
        @media (max-width: 520px) {
          .c2c-nav { padding: 10px 16px; gap: 12px; }
          .c2c-nav-logo { font-size: 18px; }
          .c2c-nav-tagline { font-size: 9px; letter-spacing: 1.5px; }
          .c2c-nav-link { padding: 6px 10px; font-size: 12px; }
        }
      `}</style>
    </nav>
  )
}
