import { describe, expect, it } from 'vitest'
import { deckSortKey } from '@/lib/deck'

describe('deckSortKey', () => {
  it('est déterministe pour les mêmes entrées', () => {
    expect(deckSortKey('K4P2M9', 550, 0.5)).toBe(deckSortKey('K4P2M9', 550, 0.5))
  })

  it('donne un ordre différent selon le salon', () => {
    const ids = Array.from({ length: 100 }, (_, i) => i + 1)
    const order = (room: string) =>
      [...ids].sort((a, b) => deckSortKey(room, a, 0) - deckSortKey(room, b, 0)).join(',')
    expect(order('AAAAAA')).not.toBe(order('BBBBBB'))
  })

  it('reste dans l\'intervalle attendu', () => {
    for (let id = 1; id <= 500; id++) {
      const key = deckSortKey('K4P2M9', id, 0)
      expect(key).toBeGreaterThanOrEqual(0)
      expect(key).toBeLessThan(1.3)
    }
  })

  it('remonte les films populaires en moyenne', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => i + 1)
    // les identifiants pairs sont très populaires, les impairs obscurs
    const pop = (id: number) => (id % 2 === 0 ? 1 : 0)
    const ordered = [...ids].sort(
      (a, b) => deckSortKey('K4P2M9', a, pop(a)) - deckSortKey('K4P2M9', b, pop(b)),
    )
    const positionMoyenne = (parite: number) => {
      const positions = ordered
        .map((id, index) => ({ id, index }))
        .filter(({ id }) => id % 2 === parite)
        .map(({ index }) => index)
      return positions.reduce((a, b) => a + b, 0) / positions.length
    }
    // Un écart de 150 places discrimine réellement : la formule pondérée sépare
    // les deux groupes d'environ 239 places, une formule sans pondération de 23.
    expect(positionMoyenne(1) - positionMoyenne(0)).toBeGreaterThan(150)
  })

  it('ne rend jamais un film obscur inatteignable', () => {
    const ids = Array.from({ length: 1000 }, (_, i) => i + 1)
    const pop = (id: number) => (id % 2 === 0 ? 1 : 0)
    const ordered = [...ids].sort(
      (a, b) => deckSortKey('K4P2M9', a, pop(a)) - deckSortKey('K4P2M9', b, pop(b)),
    )
    // au moins un film obscur figure dans le premier dixième du paquet
    expect(ordered.slice(0, 100).some((id) => id % 2 === 1)).toBe(true)
  })

  it('borne un percentile hors intervalle', () => {
    expect(deckSortKey('K4P2M9', 42, 5)).toBe(deckSortKey('K4P2M9', 42, 1))
    expect(deckSortKey('K4P2M9', 42, -5)).toBe(deckSortKey('K4P2M9', 42, 0))
  })

  it('traite un percentile NaN comme nul plutôt que de propager NaN', () => {
    expect(deckSortKey('K4P2M9', 42, Number.NaN)).toBe(deckSortKey('K4P2M9', 42, 0))
  })
})
