import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { shouldCreateMatch } from '@/lib/match'
import { recordSwipe, undoLastSwipe } from '@/lib/db/queries/swipes'
import { matches, members, movies, rooms, swipes } from '@/lib/db/schema'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
  await db.insert(movies).values(
    Array.from({ length: 5 }, (_, i) => ({ id: i + 1, title: `Film ${i + 1}` })),
  )
})
afterEach(async () => {
  await close()
})

async function salon(expectedMembers: number, matchThreshold: number, prenoms: string[]) {
  await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers, matchThreshold })
  const ids: string[] = []
  for (const p of prenoms) {
    const [m] = await db.insert(members).values({ roomCode: 'K4P2M9', displayName: p }).returning()
    ids.push(m.id)
  }
  return ids
}

describe('recordSwipe', () => {
  it('n’annonce pas de match sur le premier like', async () => {
    const [djo] = await salon(2, 2, ['Djo', 'Alice'])
    expect((await recordSwipe(db, 'K4P2M9', djo, 1, true)).match).toBeNull()
  })

  it('annonce le match au second like', async () => {
    const [djo, alice] = await salon(2, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, true)
    const r = await recordSwipe(db, 'K4P2M9', alice, 1, true)
    expect(r.match?.movieId).toBe(1)
    expect(await db.select().from(matches)).toHaveLength(1)
  })

  it('ne crée pas de match si un membre a rejeté', async () => {
    const [djo, alice] = await salon(2, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, true)
    await recordSwipe(db, 'K4P2M9', alice, 1, false)
    expect(await db.select().from(matches)).toHaveLength(0)
  })

  it('ne crée aucun match tant que l’effectif annoncé n’est pas complet', async () => {
    const [djo, alice] = await salon(3, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, true)
    await recordSwipe(db, 'K4P2M9', alice, 1, true)
    expect(await db.select().from(matches)).toHaveLength(0)
  })

  it('respecte un seuil inférieur à l’effectif', async () => {
    const [a, b, c] = await salon(3, 2, ['A', 'B', 'C'])
    await recordSwipe(db, 'K4P2M9', a, 1, true)
    const r = await recordSwipe(db, 'K4P2M9', b, 1, true)
    expect(r.match?.movieId).toBe(1)
    expect(c).toBeDefined()
  })

  it('ne crée qu’un seul match sur deux likes simultanés', async () => {
    const [djo, alice] = await salon(2, 2, ['Djo', 'Alice'])
    const [ra, rb] = await Promise.all([
      recordSwipe(db, 'K4P2M9', djo, 1, true),
      recordSwipe(db, 'K4P2M9', alice, 1, true),
    ])
    expect(await db.select().from(matches)).toHaveLength(1)
    expect([ra.match, rb.match].filter(Boolean)).toHaveLength(1)
  })

  it('est idempotent si le même balayage est rejoué', async () => {
    const [djo] = await salon(2, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, true)
    await recordSwipe(db, 'K4P2M9', djo, 1, false)
    const lignes = await db.select().from(swipes).where(eq(swipes.memberId, djo))
    expect(lignes).toHaveLength(1)
    expect(lignes[0].liked).toBe(true)
  })
})

describe('accord entre le SQL et shouldCreateMatch', () => {
  const cas = [
    { effectif: 2, seuil: 2, presents: 2, likes: 2, attendu: true },
    { effectif: 2, seuil: 2, presents: 2, likes: 1, attendu: false },
    { effectif: 3, seuil: 3, presents: 3, likes: 3, attendu: true },
    { effectif: 3, seuil: 2, presents: 3, likes: 2, attendu: true },
    { effectif: 3, seuil: 2, presents: 3, likes: 1, attendu: false },
    { effectif: 4, seuil: 3, presents: 3, likes: 3, attendu: false },
    { effectif: 8, seuil: 5, presents: 8, likes: 5, attendu: true },
    { effectif: 8, seuil: 5, presents: 8, likes: 4, attendu: false },
  ]

  for (const c of cas) {
    it(`effectif ${c.effectif}, seuil ${c.seuil}, ${c.presents} présents, ${c.likes} likes`, async () => {
      const prenoms = Array.from({ length: c.presents }, (_, i) => `M${i + 1}`)
      const ids = await salon(c.effectif, c.seuil, prenoms)
      for (let i = 0; i < c.likes; i++) await recordSwipe(db, 'K4P2M9', ids[i], 1, true)

      const cree = (await db.select().from(matches)).length === 1
      const attenduParLaFonction = shouldCreateMatch(
        ids,
        ids.slice(0, c.likes),
        { expectedMembers: c.effectif, threshold: c.seuil },
      )
      expect(cree).toBe(c.attendu)
      expect(cree).toBe(attenduParLaFonction)
    })
  }
})

describe('undoLastSwipe', () => {
  it('retire le dernier balayage', async () => {
    const [djo] = await salon(2, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, false)
    await recordSwipe(db, 'K4P2M9', djo, 2, false)
    expect(await undoLastSwipe(db, djo)).toEqual({ movieId: 2 })
    expect(await db.select().from(swipes).where(eq(swipes.memberId, djo))).toHaveLength(1)
  })

  it('refuse d’annuler un balayage qui a créé un match', async () => {
    const [djo, alice] = await salon(2, 2, ['Djo', 'Alice'])
    await recordSwipe(db, 'K4P2M9', djo, 1, true)
    await recordSwipe(db, 'K4P2M9', alice, 1, true)
    expect(await undoLastSwipe(db, alice)).toEqual({ error: 'match_cree' })
    expect(await db.select().from(matches)).toHaveLength(1)
  })

  it('refuse quand il n’y a rien à annuler', async () => {
    const [djo] = await salon(2, 2, ['Djo', 'Alice'])
    expect(await undoLastSwipe(db, djo)).toEqual({ error: 'aucun' })
  })
})
