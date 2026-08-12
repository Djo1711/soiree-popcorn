import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Soirée Popcorn',
  description: 'Choisissez un film à deux, en balayant.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
