import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deckSortKey } from '@/lib/deck'
import { countDeck, fetchDeck, type DeckFilters } from '@/lib/db/queries/deck'
import { movies, rooms, members, swipes } from '@/lib/db/schema'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

const AUCUN: DeckFilters = {
  genres: [],
  yearFrom: null,
  yearTo: null,
  minRating: 0,
  maxRuntime: null,
  providers: [],
  includeTop200: true,
}

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
  await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
})
afterEach(async () => {
  await close()
})

async function semer(n: number, extra: (i: number) => Partial<typeof movies.$inferInsert> = () => ({})) {
  await db.insert(movies).values(
    Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      title: `Film ${i + 1}`,
      popularityPercentile: (i % 10) / 10,
      genres: ['Action'],
      keywords: ['braquage'],
      providers: ['netflix'],
      runtime: 100,
      voteAverage: 7,
      releaseYear: 2000,
      ...extra(i + 1),
    })),
  )
}

async function unMembre(prenom = 'Djo') {
  const [m] = await db.insert(members).values({ roomCode: 'K4P2M9', displayName: prenom }).returning()
  return m.id
}

describe('fetchDeck', () => {
  it('rend les cartes dans l\'ordre de deckSortKey', async () => {
    await semer(200)
    const id = await unMembre()
    const cartes = await fetchDeck(db, 'K4P2M9', id, AUCUN, 50)
    const attendu = Array.from({ length: 200 }, (_, i) => i + 1)
      .sort((a, b) => {
        const ka = deckSortKey('K4P2M9', a, ((a - 1) % 10) / 10)
        const kb = deckSortKey('K4P2M9', b, ((b - 1) % 10) / 10)
        return ka - kb || a - b
      })
      .slice(0, 50)
    expect(cartes.map((c) => c.id)).toEqual(attendu)
  })

  it('donne le même ordre à deux membres du même salon', async () => {
    await semer(100)
    const a = await unMembre('Djo')
    const b = await unMembre('Alice')
    const ca = await fetchDeck(db, 'K4P2M9', a, AUCUN, 30)
    const cb = await fetchDeck(db, 'K4P2M9', b, AUCUN, 30)
    expect(ca.map((c) => c.id)).toEqual(cb.map((c) => c.id))
  })

  it('exclut les films déjà balayés par ce membre seulement', async () => {
    await semer(50)
    const a = await unMembre('Djo')
    const b = await unMembre('Alice')
    const premier = (await fetchDeck(db, 'K4P2M9', a, AUCUN, 1))[0].id
    await db.insert(swipes).values({ memberId: a, movieId: premier, liked: false })
    expect((await fetchDeck(db, 'K4P2M9', a, AUCUN, 50)).map((c) => c.id)).not.toContain(premier)
    expect((await fetchDeck(db, 'K4P2M9', b, AUCUN, 50)).map((c) => c.id)).toContain(premier)
  })

  it('compose au plus quatre tags, mots-clés avant genres', async () => {
    await semer(1)
    const cartes = await fetchDeck(db, 'K4P2M9', await unMembre(), AUCUN, 1)
    expect(cartes[0].tags).toEqual(['braquage', 'Action'])
  })

  it('filtre par genre', async () => {
    await semer(4, (i) => ({ genres: i <= 2 ? ['Comédie'] : ['Horreur'] }))
    const cartes = await fetchDeck(db, 'K4P2M9', await unMembre(), { ...AUCUN, genres: ['Comédie'] }, 10)
    expect(cartes.map((c) => c.id).sort()).toEqual([1, 2])
  })

  it('filtre par décennie', async () => {
    await semer(4, (i) => ({ releaseYear: 1980 + i * 10 }))
    const cartes = await fetchDeck(db, 'K4P2M9', await unMembre(), { ...AUCUN, yearFrom: 2000, yearTo: 2010 }, 10)
    expect(cartes.map((c) => c.id).sort()).toEqual([2, 3])
  })

  it('écarte une durée inconnue quand une durée maximale est demandée', async () => {
    await semer(3, (i) => ({ runtime: i === 1 ? 80 : i === 2 ? 200 : 0 }))
    const cartes = await fetchDeck(db, 'K4P2M9', await unMembre(), { ...AUCUN, maxRuntime: 120 }, 10)
    expect(cartes.map((c) => c.id)).toEqual([1])
  })

  it('écarte une note inconnue quand une note minimale est demandée', async () => {
    await semer(3, (i) => ({ voteAverage: i === 1 ? 8 : i === 2 ? 4 : 0 }))
    const cartes = await fetchDeck(db, 'K4P2M9', await unMembre(), { ...AUCUN, minRating: 6 }, 10)
    expect(cartes.map((c) => c.id)).toEqual([1])
  })

  it('accepte un film du top 200 sans plateforme quand le top 200 est inclus', async () => {
    await semer(2, (i) => (i === 1 ? { providers: [], inTop200: true } : { providers: ['disney'] }))
    const cartes = await fetchDeck(
      db, 'K4P2M9', await unMembre(), { ...AUCUN, providers: ['netflix'], includeTop200: true }, 10,
    )
    expect(cartes.map((c) => c.id)).toEqual([1])
  })

  it('écarte ce même film quand le top 200 est exclu', async () => {
    await semer(2, (i) => (i === 1 ? { providers: [], inTop200: true } : { providers: ['disney'] }))
    const cartes = await fetchDeck(
      db, 'K4P2M9', await unMembre(), { ...AUCUN, providers: ['netflix'], includeTop200: false }, 10,
    )
    expect(cartes).toEqual([])
  })
})

describe('countDeck', () => {
  it('compte ce que fetchDeck renverrait sans limite', async () => {
    await semer(30, (i) => ({ genres: i <= 7 ? ['Comédie'] : ['Action'] }))
    const id = await unMembre()
    const filtres = { ...AUCUN, genres: ['Comédie'] }
    expect(await countDeck(db, id, filtres)).toBe(7)
    expect((await fetchDeck(db, 'K4P2M9', id, filtres, 100)).length).toBe(7)
  })
})
