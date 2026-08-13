import { describe, expect, it } from 'vitest'
import { MAX_TAGS, buildTags, translateKeywords } from '@/lib/keywords'

describe('translateKeywords', () => {
  it('traduit les mots-clés connus', () => {
    expect(translateKeywords(['medieval', 'heist'])).toEqual(['moyen-âge', 'braquage'])
  })

  it('ignore les mots-clés absents du dictionnaire plutôt que de les afficher en anglais', () => {
    expect(translateKeywords(['medieval', 'woman director', 'duringcreditsstinger'])).toEqual([
      'moyen-âge',
    ])
  })

  it('normalise la casse et les espaces', () => {
    expect(translateKeywords([' Medieval ', 'TIME TRAVEL'])).toEqual([
      'moyen-âge',
      'voyage dans le temps',
    ])
  })

  it('ne renvoie jamais de doublon', () => {
    expect(translateKeywords(['medieval', 'medieval'])).toEqual(['moyen-âge'])
  })

  it('renvoie une liste vide pour une entrée vide', () => {
    expect(translateKeywords([])).toEqual([])
  })
})

describe('buildTags', () => {
  it('place les mots-clés avant les genres', () => {
    expect(buildTags(['moyen-âge'], ['Aventure', 'Drame'])).toEqual([
      'moyen-âge',
      'Aventure',
      'Drame',
    ])
  })

  it('plafonne à quatre tags', () => {
    const tags = buildTags(
      ['moyen-âge', 'braquage', 'vengeance'],
      ['Action', 'Aventure', 'Drame'],
    )
    expect(tags).toHaveLength(MAX_TAGS)
    expect(tags).toEqual(['moyen-âge', 'braquage', 'vengeance', 'Action'])
  })

  it('déduplique entre mots-clés et genres', () => {
    expect(buildTags(['western'], ['western', 'Action'])).toEqual(['western', 'Action'])
  })

  it('accepte un plafond personnalisé', () => {
    expect(buildTags(['a', 'b', 'c'], ['d'], 2)).toEqual(['a', 'b'])
  })

  it(`tombe sur les genres quand aucun mot-clé n'est traduit`, () => {
    expect(buildTags([], ['Comédie'])).toEqual(['Comédie'])
  })
})
