import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'image.tmdb.org' }],
  },
  /**
   * `ws` décide au chargement s'il utilise l'addon natif `bufferutil` ou son
   * repli JS, via un `require()` conditionnel dans un try/catch. Bundlé par
   * webpack (comportement par défaut de Next pour le code serveur), ce
   * `require` ne lève plus si `bufferutil` est absent : il résout vers un
   * module vide, et l'appel à `bufferUtil.mask` plante en cours de connexion
   * WebSocket longue (keep-alive du pool Neon) avec `TypeError: b.mask is not
   * a function`. Exclure `ws` du bundle le laisse tourner via `require` natif
   * de Node, où le try/catch fonctionne comme prévu.
   */
  serverExternalPackages: ['ws'],
}

export default nextConfig
