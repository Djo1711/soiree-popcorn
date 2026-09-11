import type { DeckFilters } from '@/lib/db/queries/deck'

const NOMS_PLATEFORMES: Record<string, string> = {
  netflix: 'Netflix',
  canal: 'MyCanal',
  disney: 'Disney+',
}

/**
 * Résumé lisible des filtres qui s’écartent des valeurs par défaut, pour le
 * rappeler à l’écran de fin de paquet (§7.2 de la spec : « avec un rappel de
 * ceux qui sont actifs »). `null` si aucun filtre n’est actif — dans ce cas
 * le message générique reste seul, sans rappel vide.
 */
export function resumeFiltresActifs(f: DeckFilters): string | null {
  const morceaux: string[] = []

  if (f.genres.length > 0) morceaux.push(f.genres.join(', '))

  if (f.providers.length > 0) {
    morceaux.push(f.providers.map((p) => NOMS_PLATEFORMES[p] ?? p).join(', '))
  }

  if (f.yearFrom !== null && f.yearTo !== null) {
    morceaux.push(`${f.yearFrom}–${f.yearTo}`)
  } else if (f.yearFrom !== null) {
    morceaux.push(`depuis ${f.yearFrom}`)
  } else if (f.yearTo !== null) {
    morceaux.push(`jusqu’à ${f.yearTo}`)
  }

  if (f.minRating > 0) morceaux.push(`note ≥ ${f.minRating}`)

  if (f.maxRuntime !== null) morceaux.push(`${f.maxRuntime} min max`)

  if (!f.includeTop200) morceaux.push('hors top 200')

  return morceaux.length > 0 ? morceaux.join(' · ') : null
}
