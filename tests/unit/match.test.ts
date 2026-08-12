import { describe, expect, it } from 'vitest'
import { shouldCreateMatch } from '@/lib/match'

describe('shouldCreateMatch', () => {
  it('crée un match quand les deux membres ont aimé', () => {
    expect(shouldCreateMatch(['djo', 'alice'], ['djo', 'alice'])).toBe(true)
  })

  it('ne crée pas de match si un membre manque', () => {
    expect(shouldCreateMatch(['djo', 'alice'], ['djo'])).toBe(false)
  })

  it(`ne crée jamais de match dans un salon d'une seule personne`, () => {
    expect(shouldCreateMatch(['djo'], ['djo'])).toBe(false)
  })

  it('ne crée jamais de match dans un salon vide', () => {
    expect(shouldCreateMatch([], [])).toBe(false)
  })

  it('exige que les trois membres aient aimé', () => {
    expect(shouldCreateMatch(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true)
    expect(shouldCreateMatch(['a', 'b', 'c'], ['a', 'b'])).toBe(false)
  })

  it(`ignore un like venant de quelqu'un qui a quitté le salon`, () => {
    expect(shouldCreateMatch(['djo', 'alice'], ['djo', 'alice', 'ancien'])).toBe(true)
    expect(shouldCreateMatch(['djo', 'alice'], ['djo', 'ancien'])).toBe(false)
  })
})
