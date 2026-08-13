import { describe, expect, it } from 'vitest'
import { MAX_MEMBERS, MIN_MEMBERS, shouldCreateMatch } from '@/lib/match'

/** Salon de `n` membres nommés m1…mn. */
const salon = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`)
/** Règle par défaut : unanimité sur un effectif de `n`. */
const unanimite = (n: number) => ({ expectedMembers: n, threshold: n })

describe('bornes', () => {
  it('expose un plancher de 2 et un plafond de 8', () => {
    expect(MIN_MEMBERS).toBe(2)
    expect(MAX_MEMBERS).toBe(8)
  })

  it('refuse un effectif hors bornes', () => {
    expect(shouldCreateMatch(salon(1), salon(1), unanimite(1))).toBe(false)
    expect(shouldCreateMatch(salon(9), salon(9), unanimite(9))).toBe(false)
  })

  it('refuse un seuil inférieur à 2, pour qu’un seul avis ne décide jamais', () => {
    expect(shouldCreateMatch(salon(4), ['m1'], { expectedMembers: 4, threshold: 1 })).toBe(false)
  })

  it('refuse un seuil supérieur à l’effectif', () => {
    expect(shouldCreateMatch(salon(4), salon(4), { expectedMembers: 4, threshold: 5 })).toBe(false)
  })
})

describe('effectif incomplet', () => {
  it('ne matche pas tant que tout le monde n’a pas rejoint', () => {
    // 5 arrivés sur 6 annoncés, tous les 5 ont aimé, seuil de 4 pourtant atteint
    expect(shouldCreateMatch(salon(5), salon(5), { expectedMembers: 6, threshold: 4 })).toBe(false)
  })

  it('matche dès que le dernier arrivant complète l’effectif', () => {
    expect(shouldCreateMatch(salon(6), salon(6), { expectedMembers: 6, threshold: 4 })).toBe(true)
  })

  it('ne compte pas un identifiant dupliqué comme un participant de plus', () => {
    expect(shouldCreateMatch(['solo', 'solo'], ['solo'], unanimite(2))).toBe(false)
  })
})

describe('seuil', () => {
  it('matche à deux quand les deux ont aimé', () => {
    expect(shouldCreateMatch(['djo', 'alice'], ['djo', 'alice'], unanimite(2))).toBe(true)
  })

  it('ne matche pas à deux si un seul a aimé', () => {
    expect(shouldCreateMatch(['djo', 'alice'], ['djo'], unanimite(2))).toBe(false)
  })

  it('matche quand le seuil est exactement atteint', () => {
    const aime = ['m1', 'm2', 'm3', 'm4']
    expect(shouldCreateMatch(salon(6), aime, { expectedMembers: 6, threshold: 4 })).toBe(true)
  })

  it('ne matche pas une voix en dessous du seuil', () => {
    const aime = ['m1', 'm2', 'm3']
    expect(shouldCreateMatch(salon(6), aime, { expectedMembers: 6, threshold: 4 })).toBe(false)
  })

  it('exige l’unanimité quand le seuil vaut l’effectif', () => {
    expect(shouldCreateMatch(salon(8), salon(8), unanimite(8))).toBe(true)
    expect(shouldCreateMatch(salon(8), salon(7), unanimite(8))).toBe(false)
  })
})

describe('likes étrangers au salon', () => {
  it('ignore le like de quelqu’un qui a quitté le salon', () => {
    expect(shouldCreateMatch(['djo', 'alice'], ['djo', 'alice', 'ancien'], unanimite(2))).toBe(true)
    expect(shouldCreateMatch(['djo', 'alice'], ['djo', 'ancien'], unanimite(2))).toBe(false)
  })

  it('ne laisse pas des likes étrangers atteindre le seuil à eux seuls', () => {
    const etrangers = ['x1', 'x2', 'x3', 'x4']
    expect(shouldCreateMatch(salon(6), etrangers, { expectedMembers: 6, threshold: 4 })).toBe(false)
  })

  it('déduplique sans empêcher un match légitime', () => {
    // « djo » compté une seule fois : 2 participants distincts, effectif de 2 annoncé,
    // les deux ont aimé — le dédoublonnage ne doit pas transformer ce cas valide en refus.
    expect(shouldCreateMatch(['djo', 'djo', 'alice'], ['djo', 'alice'], unanimite(2))).toBe(true)
  })
})
