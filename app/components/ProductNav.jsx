'use client'

/**
 * ProductNav — Header global de navegación entre las apps de GreatDeal.
 *
 * Se muestra en la parte superior de IA Prop (Tasar) y permite saltar a:
 *   - Home del shell (GreatDeal)
 *   - Buscar propiedades
 *   - Tasar (este producto, marcado como "active")
 *   - Reels (greatdeal-app)
 *
 * En dev (localhost) los links son relativos para no romper.
 * En prod, configurar NEXT_PUBLIC_SHELL_URL=https://greatdeal.cl en Vercel.
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
    <nav className="gd-nav" aria-label="Navegación GreatDeal">
      <a href={SHELL || '/'} className="gd-nav-logo">
        Great<em>Deal</em>
      </a>
      <ul className="gd-nav-links">
        {links.map(l => (
          <li key={l.id}>
            <a
              href={l.href}
              className={`gd-nav-link${active === l.id ? ' is-active' : ''}`}
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>

      <style jsx>{`
        .gd-nav {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          gap: 32px;
          padding: 14px 28px;
          background: rgba(10, 10, 8, 0.78);
          backdrop-filter: saturate(180%) blur(14px);
          -webkit-backdrop-filter: saturate(180%) blur(14px);
          border-bottom: 1px solid rgba(200, 169, 110, 0.12);
        }
        .gd-nav-logo {
          font-family: 'Playfair Display', 'Cormorant Garamond', serif;
          font-size: 20px;
          font-weight: 500;
          color: #f2ede4;
          text-decoration: none;
          letter-spacing: -0.3px;
          line-height: 1;
        }
        .gd-nav-logo em {
          font-style: italic;
          color: #c8a96e;
          font-weight: 400;
        }
        .gd-nav-links {
          display: flex;
          gap: 4px;
          list-style: none;
          margin: 0;
          padding: 0;
          margin-left: auto;
        }
        .gd-nav-link {
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
        .gd-nav-link:hover {
          color: #e8cc9a;
          background: rgba(200, 169, 110, 0.06);
        }
        .gd-nav-link.is-active {
          color: #c8a96e;
          background: rgba(200, 169, 110, 0.08);
        }
        @media (max-width: 520px) {
          .gd-nav { padding: 12px 16px; gap: 12px; }
          .gd-nav-logo { font-size: 17px; }
          .gd-nav-link { padding: 6px 10px; font-size: 12px; }
        }
      `}</style>
    </nav>
  )
}
