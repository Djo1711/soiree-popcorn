import { describe, expect, it } from 'vitest'
import { resumeFiltresActifs } from '@/lib/deck-filters-summary'
import type { DeckFilters } from '@/lib/db/queries/deck'

const VIDES: DeckFilters = {
  genres: [],
  yearFrom: null,
  yearTo: null,
  minRating: 0,
  maxRuntime: null,
  providers: [],
  includeTop200: true,
}

describe('resumeFiltresActifs', () => {
  it('rend null quand aucun filtre ne s’écarte des valeurs par défaut', () => {
    expect(resumeFiltresActifs(VIDES)).toBeNull()
  })

  it('liste les genres actifs', () => {
    expect(resumeFiltresActifs({ ...VIDES, genres: ['Action', 'Comédie'] })).toBe('Action, Comédie')
  })

  it('traduit les plateformes en noms lisibles', () => {
    expect(resumeFiltresActifs({ ...VIDES, providers: ['netflix', 'canal'] })).toBe('Netflix, MyCanal')
  })

  it('garde une clé de plateforme inconnue telle quelle plutôt que de la faire disparaître', () => {
    expect(resumeFiltresActifs({ ...VIDES, providers: ['amazon'] })).toBe('amazon')
  })

  it('formate une période bornée des deux côtés', () => {
    expect(resumeFiltresActifs({ ...VIDES, yearFrom: 2000, yearTo: 2010 })).toBe('2000–2010')
  })

  it('formate une période ouverte à partir d’une année', () => {
    expect(resumeFiltresActifs({ ...VIDES, yearFrom: 2015 })).toBe('depuis 2015')
  })

  it('formate une période ouverte jusqu’à une année', () => {
    expect(resumeFiltresActifs({ ...VIDES, yearTo: 1990 })).toBe('jusqu’à 1990')
  })

  it('mentionne la note minimale quand elle est réglée', () => {
    expect(resumeFiltresActifs({ ...VIDES, minRating: 6 })).toBe('note ≥ 6')
  })

  it('mentionne la durée maximale quand elle est réglée', () => {
    expect(resumeFiltresActifs({ ...VIDES, maxRuntime: 100 })).toBe('100 min max')
  })

  it('mentionne l’exclusion du top 200 quand il est désactivé', () => {
    expect(resumeFiltresActifs({ ...VIDES, includeTop200: false })).toBe('hors top 200')
  })

  it('combine plusieurs filtres actifs, séparés par un point médian', () => {
    const resume = resumeFiltresActifs({
      ...VIDES,
      genres: ['Horreur'],
      minRating: 7,
    })
    expect(resume).toBe('Horreur · note ≥ 7')
  })
})
