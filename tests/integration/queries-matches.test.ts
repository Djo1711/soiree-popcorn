import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getFilters, setFilters } from '@/lib/db/queries/filters'
import { listMatches, matchesSince, randomMatch, setMatchStatus } from '@/lib/db/queries/matches'
import { matches, memberFilters, members, movies, rooms } from '@/lib/db/schema'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
  await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
  await db.insert(movies).values(
    Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      title: `Film ${i + 1}`,
      genres: ['Action'],
      keywords: ['braquage'],
    })),
  )
  await db.insert(matches).values([
    { roomCode: 'K4P2M9', movieId: 1 },
    { roomCode: 'K4P2M9', movieId: 2 },
    { roomCode: 'K4P2M9', movieId: 3 },
  ])
})
afterEach(async () => {
  await close()
})

describe('listMatches', () => {
  it('rend les matchs avec leur film et leurs tags', async () => {
    const l = await listMatches(db, 'K4P2M9')
    expect(l).toHaveLength(3)
    expect(l[0].movie.tags).toEqual(['braquage', 'Action'])
    expect(l[0].status).toBe('a_voir')
  })

  it('filtre par statut', async () => {
    await setMatchStatus(db, 'K4P2M9', 2, 'vu')
    expect((await listMatches(db, 'K4P2M9', 'vu')).map((m) => m.movie.id)).toEqual([2])
    expect((await listMatches(db, 'K4P2M9', 'a_voir')).map((m) => m.movie.id).sort()).toEqual([1, 3])
  })

  it("ne rend pas les matchs d'un autre salon", async () => {
    await db.insert(rooms).values({ code: 'ZZZZZZ', expectedMembers: 2, matchThreshold: 2 })
    await db.insert(matches).values({ roomCode: 'ZZZZZZ', movieId: 4 })
    expect((await listMatches(db, 'K4P2M9')).map((m) => m.movie.id)).not.toContain(4)
  })
})

describe('setMatchStatus', () => {
  it('accepte les trois statuts', async () => {
    for (const s of ['vu', 'abandonne', 'a_voir'] as const) {
      expect(await setMatchStatus(db, 'K4P2M9', 1, s)).toBe(true)
    }
  })

  it("rend false sur un film qui n'est pas un match de ce salon", async () => {
    expect(await setMatchStatus(db, 'K4P2M9', 4, 'vu')).toBe(false)
  })
})

describe('randomMatch', () => {
  it("ne tire que parmi les « à voir »", async () => {
    await setMatchStatus(db, 'K4P2M9', 1, 'vu')
    await setMatchStatus(db, 'K4P2M9', 3, 'abandonne')
    for (let i = 0; i < 10; i++) {
      expect((await randomMatch(db, 'K4P2M9'))?.movie.id).toBe(2)
    }
  })

  it("rend null quand il n'y a rien à voir", async () => {
    for (const id of [1, 2, 3]) await setMatchStatus(db, 'K4P2M9', id, 'vu')
    expect(await randomMatch(db, 'K4P2M9')).toBeNull()
  })
})

describe('matchesSince', () => {
  it("ne rend que les matchs postérieurs au curseur", async () => {
    const tous = await listMatches(db, 'K4P2M9')
    const curseur = Math.min(...tous.map((m) => m.matchId))
    const apres = await matchesSince(db, 'K4P2M9', curseur)
    expect(apres.map((m) => m.matchId).every((id) => id > curseur)).toBe(true)
    expect(apres).toHaveLength(2)
  })

  it("rend une liste vide quand rien n'est arrivé", async () => {
    const tous = await listMatches(db, 'K4P2M9')
    expect(await matchesSince(db, 'K4P2M9', Math.max(...tous.map((m) => m.matchId)))).toEqual([])
  })
})

describe('filtres', () => {
  it("rend les valeurs par défaut d'un membre neuf", async () => {
    const [m] = await db.insert(members).values({ roomCode: 'K4P2M9', displayName: 'Djo' }).returning()
    await db.insert(memberFilters).values({ memberId: m.id })
    expect(await getFilters(db, m.id)).toEqual({
      genres: [],
      yearFrom: null,
      yearTo: null,
      minRating: 0,
      maxRuntime: null,
      providers: [],
      includeTop200: true,
    })
  })

  it("relit ce qu'on a écrit", async () => {
    const [m] = await db.insert(members).values({ roomCode: 'K4P2M9', displayName: 'Djo' }).returning()
    await db.insert(memberFilters).values({ memberId: m.id })
    const voulu = {
      genres: ['Comédie'],
      yearFrom: 1990,
      yearTo: 1999,
      minRating: 6.5,
      maxRuntime: 120,
      providers: ['netflix'],
      includeTop200: false,
    }
    await setFilters(db, m.id, voulu)
    expect(await getFilters(db, m.id)).toEqual(voulu)
  })
})
