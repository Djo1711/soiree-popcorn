import { describe, expect, it } from 'vitest'
import { DUREE_ROULETTE_MS, easeRoulette } from '@/lib/roulette'

describe('DUREE_ROULETTE_MS', () => {
  it('vaut 2,2 secondes', () => {
    expect(DUREE_ROULETTE_MS).toBe(2200)
  })
})

describe('easeRoulette', () => {
  it('part de 0 et arrive à 1', () => {
    expect(easeRoulette(0)).toBe(0)
    expect(easeRoulette(1)).toBe(1)
  })

  it('est croissante sur tout l’intervalle', () => {
    const echantillons = Array.from({ length: 21 }, (_, i) => easeRoulette(i / 20))
    for (let i = 1; i < echantillons.length; i++) {
      expect(echantillons[i]).toBeGreaterThanOrEqual(echantillons[i - 1])
    }
  })

  it('ralentit : la progression sur la seconde moitié du temps est plus petite que sur la première', () => {
    const premiereMoitie = easeRoulette(0.5) - easeRoulette(0)
    const secondeMoitie = easeRoulette(1) - easeRoulette(0.5)
    expect(secondeMoitie).toBeLessThan(premiereMoitie)
  })
})
