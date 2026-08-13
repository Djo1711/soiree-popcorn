import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { movies } from '@/lib/db/schema'
import type { TmdbMovieDetail } from '@/lib/tmdb'
import { computePercentiles, mapDetailToRow } from '@/scripts/ingest'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
})

afterEach(async () => {
  await close()
})

const detail: TmdbMovieDetail = {
  id: 598,
  title: 'Le Nom de la Rose',
  original_title: 'Der Name der Rose',
  overview: 'Un moine franciscain enquête sur des morts suspectes.',
  poster_path: '/abc.jpg',
  backdrop_path: '/def.jpg',
  release_date: '1986-09-24',
  runtime: 130,
  vote_average: 7.8,
  vote_count: 3200,
  popularity: 42.5,
  genres: [{ id: 9648, name: 'Mystère' }, { id: 12, name: 'Aventure' }],
  keywords: { keywords: [{ id: 1, name: 'medieval' }, { id: 2, name: 'woman director' }] },
  credits: { crew: [{ job: 'Producer', name: 'X' }, { job: 'Director', name: 'Jean-Jacques Annaud' }] },
  'watch/providers': {
    results: { FR: { flatrate: [{ provider_id: 8, provider_name: 'Netflix' }] } },
  },
}

describe('mapDetailToRow', () => {
  it('extrait année, réalisateur et tags français', () => {
    const row = mapDetailToRow(detail)
    expect(row.releaseYear).toBe(1986)
    expect(row.director).toBe('Jean-Jacques Annaud')
    expect(row.keywords).toEqual(['moyen-âge'])
    expect(row.genres).toEqual(['Mystère', 'Aventure'])
    expect(row.runtime).toBe(130)
  })

  it('ignore les mots-clés hors dictionnaire', () => {
    expect(mapDetailToRow(detail).keywords).not.toContain('woman director')
  })

  it('supporte une date de sortie absente', () => {
    const row = mapDetailToRow({ ...detail, release_date: null })
    expect(row.releaseYear).toBeNull()
    expect(row.releaseDate).toBeNull()
  })

  it('supporte un film sans réalisateur ni mots-clés', () => {
    const row = mapDetailToRow({ ...detail, credits: undefined, keywords: undefined })
    expect(row.director).toBeNull()
    expect(row.keywords).toEqual([])
  })
})

describe('computePercentiles', () => {
  it('classe les films du moins au plus populaire entre 0 et 1', async () => {
    await db.insert(movies).values([
      { id: 1, title: 'Obscur', popularity: 1 },
      { id: 2, title: 'Moyen', popularity: 50 },
      { id: 3, title: 'Célèbre', popularity: 900 },
    ])

    await computePercentiles(db)

    const rows = await db.select().from(movies).orderBy(movies.id)
    expect(rows[0].popularityPercentile).toBe(0)
    expect(rows[1].popularityPercentile).toBeCloseTo(0.5, 5)
    expect(rows[2].popularityPercentile).toBe(1)
  })

  it('traite une popularité absente comme la plus basse', async () => {
    await db.insert(movies).values([
      { id: 1, title: 'Sans donnée', popularity: null },
      { id: 2, title: 'Célèbre', popularity: 900 },
    ])

    await computePercentiles(db)

    const rows = await db.select().from(movies).orderBy(movies.id)
    expect(rows[0].popularityPercentile).toBe(0)
    expect(rows[1].popularityPercentile).toBe(1)
  })
})

describe('upsert des plateformes', () => {
  it('accumule les plateformes sans doublon quand un film est vu deux fois', async () => {
    await db.execute(sql`
      INSERT INTO movies (id, title, providers) VALUES (1, 'Film', ARRAY['netflix'])
      ON CONFLICT (id) DO NOTHING
    `)
    await db.execute(sql`
      INSERT INTO movies (id, title, providers) VALUES (1, 'Film', ARRAY['disney'])
      ON CONFLICT (id) DO UPDATE SET providers = (
        SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), '{}')
        FROM unnest(movies.providers || excluded.providers) AS p
      )
    `)

    const [row] = await db.select().from(movies)
    expect(row.providers).toEqual(['disney', 'netflix'])
  })
})
