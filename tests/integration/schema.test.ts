import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deckSortKey } from '@/lib/deck'
import { deckOrderBy } from '@/lib/deck-sql'
import { matches, members, movies, rooms, swipes } from '@/lib/db/schema'
import { generateRoomCode } from '@/lib/roomcode'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
})

afterEach(async () => {
  await close()
})

async function seedMovies(count: number) {
  await db.insert(movies).values(
    Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      title: `Film ${i + 1}`,
      popularityPercentile: (i % 10) / 10,
    })),
  )
}

describe('schéma', () => {
  it('crée les sept tables', async () => {
    const rows = await db.execute<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    const names = rows.rows.map((r) => r.table_name).sort()
    expect(names).toEqual([
      'matches',
      'member_filters',
      'members',
      'movies',
      'rate_limits',
      'rooms',
      'swipes',
    ])
  })

  it('interdit deux balayages du même membre sur le même film', async () => {
    await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
    const [member] = await db
      .insert(members)
      .values({ roomCode: 'K4P2M9', displayName: 'Djo' })
      .returning()
    await seedMovies(1)

    await db.insert(swipes).values({ memberId: member.id, movieId: 1, liked: true })
    const inserted = await db
      .insert(swipes)
      .values({ memberId: member.id, movieId: 1, liked: false })
      .onConflictDoNothing()
      .returning()

    expect(inserted).toHaveLength(0)
  })

  it('interdit deux matchs sur le même film dans le même salon', async () => {
    await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
    await seedMovies(1)

    await db.insert(matches).values({ roomCode: 'K4P2M9', movieId: 1 })
    const inserted = await db
      .insert(matches)
      .values({ roomCode: 'K4P2M9', movieId: 1 })
      .onConflictDoNothing()
      .returning()

    expect(inserted).toHaveLength(0)
  })

  it('supprime les membres et les balayages avec le salon', async () => {
    await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
    const [member] = await db
      .insert(members)
      .values({ roomCode: 'K4P2M9', displayName: 'Djo' })
      .returning()
    await seedMovies(1)
    await db.insert(swipes).values({ memberId: member.id, movieId: 1, liked: true })

    await db.delete(rooms)

    expect(await db.select().from(members)).toHaveLength(0)
    expect(await db.select().from(swipes)).toHaveLength(0)
  })

  // Les codes de ces deux cas respectent le format généré : sans cela, ils
  // seraient rejetés par `rooms_code_format` et non par la contrainte visée.
  it('refuse un effectif hors des bornes 2 à 8', async () => {
    await expect(
      db.insert(rooms).values({ code: 'TRPGRD', expectedMembers: 9, matchThreshold: 2 }),
    ).rejects.toThrow()
    await expect(
      db.insert(rooms).values({ code: 'TRPPTT', expectedMembers: 1, matchThreshold: 2 }),
    ).rejects.toThrow()
  })

  it('refuse un seuil hors des bornes 2 à effectif', async () => {
    await expect(
      db.insert(rooms).values({ code: 'SEUHT2', expectedMembers: 4, matchThreshold: 5 }),
    ).rejects.toThrow()
    await expect(
      db.insert(rooms).values({ code: 'SEUBS3', expectedMembers: 4, matchThreshold: 1 }),
    ).rejects.toThrow()
  })

  it("refuse un code de salon qui n'est pas au format généré", async () => {
    for (const code of ['k4p2m9', 'K4P2M', 'K4P2M99', 'K4P2MO', 'K4P2M1', 'K4P2M!', '']) {
      await expect(
        db.insert(rooms).values({ code, expectedMembers: 2, matchThreshold: 2 }),
      ).rejects.toThrow()
    }

    // Un code réellement tiré par le générateur doit toujours passer : la base
    // et `lib/roomcode.ts` partagent le même alphabet.
    await db.insert(rooms).values({
      code: generateRoomCode(),
      expectedMembers: 2,
      matchThreshold: 2,
    })
    expect(await db.select().from(rooms)).toHaveLength(1)
  })

  it('refuse un statut de match hors des trois valeurs prévues', async () => {
    await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
    await seedMovies(1)

    await expect(
      db.insert(matches).values({ roomCode: 'K4P2M9', movieId: 1, status: 'watched' }),
    ).rejects.toThrow()

    await db.insert(matches).values({ roomCode: 'K4P2M9', movieId: 1, status: 'vu' })
    expect(await db.select().from(matches)).toHaveLength(1)
  })
})

describe('ordre du paquet', () => {
  it("l'ordre SQL correspond exactement à deckSortKey", async () => {
    await seedMovies(300)
    const room = 'K4P2M9'

    // La formule n'est pas recopiée ici : elle vient de `deckOrderBy`, la même
    // écriture SQL que celle utilisée en production. Un test qui retape la
    // requête ne garde que sa propre copie.
    const result = await db.execute<{ id: number }>(sql`
      SELECT id FROM movies ORDER BY ${deckOrderBy(room)}
    `)
    const ordreSql = result.rows.map((r) => Number(r.id))

    const lignes = await db.select().from(movies)
    const ordreTs = [...lignes]
      .sort((a, b) => {
        const ka = deckSortKey(room, a.id, a.popularityPercentile)
        const kb = deckSortKey(room, b.id, b.popularityPercentile)
        return ka - kb || a.id - b.id
      })
      .map((m) => m.id)

    expect(ordreSql).toEqual(ordreTs)
  })

  it('la clé SQL est toujours positive', async () => {
    await seedMovies(500)
    const result = await db.execute<{ mini: number }>(sql`
      SELECT MIN(('x' || substr(md5('K4P2M9' || ':' || id::text), 1, 7))::bit(28)::int) AS mini
      FROM movies
    `)
    expect(Number(result.rows[0].mini)).toBeGreaterThanOrEqual(0)
  })
})
