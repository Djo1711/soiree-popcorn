import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Soirée Popcorn',
    short_name: 'Popcorn',
    description: 'Choisissez un film à deux, en balayant.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e2e2a',
    theme_color: '#0e2e2a',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }
}
