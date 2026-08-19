import type { Metadata } from 'next'
import { Anton, Cinzel, EB_Garamond, Space_Mono } from 'next/font/google'
import './globals.css'

export const metadata: Metadata = {
  title: 'Soirée Popcorn',
  description: 'Choisissez un film à deux, en balayant.',
  icons: { apple: '/icon.svg' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Popcorn' },
}

const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--font-anton' })
const spaceMono = Space_Mono({ subsets: ['latin'], weight: '400', variable: '--font-space-mono' })
const cinzel = Cinzel({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-cinzel' })
const ebGaramond = EB_Garamond({ subsets: ['latin'], variable: '--font-eb-garamond' })

/**
 * Pose `data-theme`/`data-bg` avant la première peinture, à partir du
 * `localStorage` déjà présent sur cet appareil : sans ce script bloquant,
 * l'écran afficherait une fraction de seconde le thème par défaut avant que
 * `useTheme()` ne corrige après hydratation.
 */
const scriptTheme = `
(function () {
  try {
    var theme = localStorage.getItem('sp-theme') || 'videoclub'
    var fond = localStorage.getItem('sp-bg-' + theme) || '1'
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.bg = fond
  } catch (e) {}
})()
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`${anton.variable} ${spaceMono.variable} ${cinzel.variable} ${ebGaramond.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTheme }} />
      </head>
      <body className="sp-page">{children}</body>
    </html>
  )
}
