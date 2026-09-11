interface Pixel {
  r: number
  g: number
  b: number
}

function versHex({ r, g, b }: Pixel): string {
  const composant = (v: number) => Math.round(v).toString(16).padStart(2, '0')
  return `#${composant(r)}${composant(g)}${composant(b)}`
}

/**
 * Regroupe les pixels par cases de teinte (32 niveaux par canal), garde les
 * `nombre` cases les plus peuplées, et rend leur couleur moyenne. Pur —
 * aucune dépendance au navigateur — pour rester testable dans l'environnement
 * `node` de Vitest.
 */
export function couleursDominantes(pixels: Pixel[], nombre: number): string[] {
  if (pixels.length === 0) return Array.from({ length: nombre }, () => '#000000')

  const PAS = 32
  const cases = new Map<string, { somme: Pixel; total: number }>()

  for (const pixel of pixels) {
    const cle = [pixel.r, pixel.g, pixel.b].map((c) => Math.floor(c / PAS)).join(',')
    const entree = cases.get(cle) ?? { somme: { r: 0, g: 0, b: 0 }, total: 0 }
    entree.somme.r += pixel.r
    entree.somme.g += pixel.g
    entree.somme.b += pixel.b
    entree.total += 1
    cases.set(cle, entree)
  }

  const triees = [...cases.values()].sort((a, b) => b.total - a.total)
  const retenues = triees.slice(0, nombre)

  while (retenues.length < nombre && retenues.length > 0) {
    retenues.push(retenues[retenues.length - 1])
  }

  return retenues.map(({ somme, total }) =>
    versHex({ r: somme.r / total, g: somme.g / total, b: somme.b / total }),
  )
}

/**
 * Lit les pixels d'une affiche déjà chargée via un canvas hors écran, et en
 * tire deux couleurs. Dépend du DOM — non testée par Vitest, vérifiée par le
 * test Playwright de la tâche 17 (fond « teinté » du thème actif).
 */
export function extraireCouleursAffiche(img: HTMLImageElement): string[] {
  const canvas = document.createElement('canvas')
  const taille = 48
  canvas.width = taille
  canvas.height = taille
  const contexte = canvas.getContext('2d')
  if (!contexte) return ['#000000', '#000000']
  contexte.drawImage(img, 0, 0, taille, taille)
  const { data } = contexte.getImageData(0, 0, taille, taille)
  const pixels: Pixel[] = []
  for (let i = 0; i < data.length; i += 4) {
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  return couleursDominantes(pixels, 2)
}

const CACHE_TEINTE = new Map<string, string[]>()

/**
 * Pose `--sp-tint-a`/`--sp-tint-b` sur l'élément (`.sp-page`), consommées par
 * le fond « teinté » (data-bg="4") des deux thèmes (tâche 1). Met en cache
 * par URL d'affiche pour ne recalculer qu'une fois par film (§8.3).
 */
export function appliquerTeinte(element: HTMLElement, urlAffiche: string, img: HTMLImageElement): void {
  const enCache = CACHE_TEINTE.get(urlAffiche)
  const couleurs = enCache ?? extraireCouleursAffiche(img)
  if (!enCache) CACHE_TEINTE.set(urlAffiche, couleurs)
  element.style.setProperty('--sp-tint-a', couleurs[0])
  element.style.setProperty('--sp-tint-b', couleurs[1])
}
