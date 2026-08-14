import { describe, expect, it } from 'vitest'
import dictionnaire from '@/data/keywords-fr.json'
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

  it('déduplique deux clés synonymes qui pointent sur la même traduction', () => {
    // TMDB étiquette le même film « paris » et « paris, france ». Le dictionnaire
    // contient les deux clés exprès ; c'est la déduplication par valeur française
    // qui évite d'afficher deux fois le même tag et rend ces alias sans danger.
    expect(translateKeywords(['paris', 'paris, france'])).toEqual(['paris'])
    expect(translateKeywords(['london, england', 'london'])).toEqual(['londres'])
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

describe('dictionnaire', () => {
  it('compte au moins 180 entrées', () => {
    expect(Object.keys(dictionnaire).length).toBeGreaterThanOrEqual(180)
  })

  it('n’a que des clés en minuscules et sans espaces superflus', () => {
    for (const cle of Object.keys(dictionnaire)) {
      expect(cle).toBe(cle.toLowerCase().trim())
    }
  })

  it('n’a aucune traduction vide', () => {
    for (const valeur of Object.values(dictionnaire)) {
      expect(String(valeur).trim().length).toBeGreaterThan(0)
    }
  })

  it('exclut les mots-clés de production', () => {
    const exclus = ['woman director', 'duringcreditsstinger', 'aftercreditsstinger']
    for (const cle of exclus) {
      expect(dictionnaire).not.toHaveProperty(cle)
    }
  })
})
