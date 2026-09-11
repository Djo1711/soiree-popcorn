import { describe, expect, it } from 'vitest'
import { ETAT_INITIAL, fusionnerEvenements } from '@/lib/room-events'
import type { MatchRow } from '@/lib/db/queries/matches'
import type { RoomSummary } from '@/lib/db/queries/rooms'

function match(matchId: number): MatchRow {
  return {
    matchId,
    status: 'a_voir',
    createdAt: new Date().toISOString(),
    movie: {
      id: matchId,
      title: `Film ${matchId}`,
      overview: null,
      posterPath: null,
      releaseDate: null,
      releaseYear: null,
      runtime: null,
      voteAverage: null,
      director: null,
      providers: [],
      tags: [],
    },
  }
}

const salon: RoomSummary = {
  code: 'ABCDEF',
  expectedMembers: 2,
  matchThreshold: 2,
  memberCount: 2,
  complete: true,
}

describe("fusionnerEvenements", () => {
  it("part d'un état initial sans session", () => {
    expect(ETAT_INITIAL.sansSession).toBe(false)
    expect(ETAT_INITIAL.pretAffiche).toBe(false)
    expect(ETAT_INITIAL.curseur).toBe(0)
  })

  it("accumule les nouveaux matchs sans perdre les précédents", () => {
    const premier = fusionnerEvenements(ETAT_INITIAL, {
      room: salon,
      members: [],
      matches: [match(1)],
      moi: null,
    })
    expect(premier.matches.map((m) => m.matchId)).toEqual([1])
    expect(premier.curseur).toBe(1)

    const second = fusionnerEvenements(premier, {
      room: salon,
      members: [],
      matches: [match(2), match(3)],
      moi: null,
    })
    expect(second.matches.map((m) => m.matchId)).toEqual([1, 2, 3])
    expect(second.curseur).toBe(3)
  })

  it("ne fait pas régresser le curseur quand rien de neuf n'arrive", () => {
    const premier = fusionnerEvenements(ETAT_INITIAL, {
      room: salon,
      members: [],
      matches: [match(5)],
      moi: null,
    })
    const vide = fusionnerEvenements(premier, { room: salon, members: [], matches: [], moi: null })
    expect(vide.curseur).toBe(5)
    expect(vide.matches).toHaveLength(1)
  })

  it("marque prêt après le premier événement reçu", () => {
    expect(ETAT_INITIAL.pretAffiche).toBe(false)
    const apres = fusionnerEvenements(ETAT_INITIAL, { room: salon, members: [], matches: [], moi: null })
    expect(apres.pretAffiche).toBe(true)
  })

  it("remet sansSession à false à chaque événement reçu", () => {
    const enErreur = { ...ETAT_INITIAL, sansSession: true }
    const apres = fusionnerEvenements(enErreur, { room: salon, members: [], matches: [], moi: null })
    expect(apres.sansSession).toBe(false)
  })

  it('porte « moi » du dernier événement reçu, pour que les réglages sachent quel membre afficher', () => {
    expect(ETAT_INITIAL.moi).toBeNull()
    const djo = { id: 'm1', displayName: 'Djo' }
    const apres = fusionnerEvenements(ETAT_INITIAL, {
      room: salon,
      members: [djo],
      matches: [],
      moi: djo,
    })
    expect(apres.moi).toEqual(djo)
  })
})
