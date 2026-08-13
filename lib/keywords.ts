import dictionary from '@/data/keywords-fr.json'

const DICTIONARY = dictionary as Record<string, string>

export const MAX_TAGS = 4

/**
 * Traduit les mots-clés TMDB en français. Les mots-clés absents du dictionnaire
 * sont ignorés : mieux vaut moins de tags que du franglais sur la carte.
 */
export function translateKeywords(raw: string[]): string[] {
  const out: string[] = []
  for (const keyword of raw) {
    const french = DICTIONARY[keyword.trim().toLowerCase()]
    if (french && !out.includes(french)) out.push(french)
  }
  return out
}

/** Mots-clés d'abord, genres ensuite, sans doublon, plafonnés. */
export function buildTags(
  keywordsFr: string[],
  genresFr: string[],
  max: number = MAX_TAGS,
): string[] {
  const out: string[] = []
  for (const tag of [...keywordsFr, ...genresFr]) {
    if (!tag) continue
    if (!out.includes(tag)) out.push(tag)
    if (out.length >= max) break
  }
  return out
}
