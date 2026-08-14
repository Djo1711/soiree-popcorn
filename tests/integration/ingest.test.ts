import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { movies } from '@/lib/db/schema'
import { TmdbHttpError, type ClientCollecte, type ClientDetail, type TmdbMovieDetail } from '@/lib/tmdb'
import { collectCatalogue, computePercentiles, fetchDetails, mapDetailToRow } from '@/scripts/ingest'
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

describe('collectCatalogue avec un faux client', () => {
  it("écrit une ligne par film découvert, cumule les plateformes sans doublon et marque le top 200 sans effacer les plateformes", async () => {
    const client: ClientCollecte = {
      async resolveProviderIds() {
        return [
          { key: 'netflix', ids: [8] },
          { key: 'disney', ids: [337] },
        ]
      },
      async discover(providerId, page) {
        if (page > 1) return { page, results: [], total_pages: 1, total_results: 0 }
        if (providerId === 8) {
          return {
            page: 1,
            results: [
              { id: 1, title: 'Film A' },
              { id: 2, title: 'Film B' },
            ],
            total_pages: 1,
            total_results: 2,
          }
        }
        return {
          page: 1,
          results: [
            { id: 2, title: 'Film B' },
            { id: 3, title: 'Film C' },
          ],
          total_pages: 1,
          total_results: 2,
        }
      },
      async topRated(page) {
        if (page === 1) {
          return { page: 1, results: [{ id: 2, title: 'Film B' }], total_pages: 1, total_results: 1 }
        }
        return { page, results: [], total_pages: 1, total_results: 0 }
      },
    }

    await collectCatalogue(client, db, () => {})

    const lignes = await db.select().from(movies).orderBy(movies.id)
    expect(lignes).toHaveLength(3)

    const filmB = lignes.find((l) => l.id === 2)!
    expect(filmB.providers).toEqual(['disney', 'netflix'])
    expect(filmB.inTop200).toBe(true)

    const filmA = lignes.find((l) => l.id === 1)!
    expect(filmA.providers).toEqual(['netflix'])
    expect(filmA.inTop200).toBe(false)

    const filmC = lignes.find((l) => l.id === 3)!
    expect(filmC.providers).toEqual(['disney'])
    expect(filmC.inTop200).toBe(false)
  })

  it('journalise un avertissement contenant ATTENTION quand une plateforme annonce plus de 500 pages', async () => {
    const client: ClientCollecte = {
      async resolveProviderIds() {
        return [{ key: 'netflix', ids: [8] }]
      },
      async discover(_providerId, page) {
        return { page, results: [], total_pages: 501, total_results: 0 }
      },
      async topRated(page) {
        return { page, results: [], total_pages: 1, total_results: 0 }
      },
    }

    const messages: string[] = []
    await collectCatalogue(client, db, (m) => messages.push(m))

    expect(messages.some((m) => m.includes('ATTENTION'))).toBe(true)
  })
})

describe('fetchDetails avec un faux client', () => {
  it('remplit titre, synopsis, année, durée, genres, mots-clés français et réalisateur, et pose detail_fetched_at', async () => {
    await db.insert(movies).values({ id: 598, title: 'Stub' })

    const client: ClientDetail = {
      async movieDetail(id) {
        expect(id).toBe(598)
        return detail
      },
    }

    const complets = await fetchDetails(client, db, () => {})
    expect(complets).toBe(1)

    const [row] = await db.select().from(movies)
    expect(row.title).toBe('Le Nom de la Rose')
    expect(row.overview).toBe(detail.overview)
    expect(row.releaseYear).toBe(1986)
    expect(row.runtime).toBe(130)
    expect(row.genres).toEqual(['Mystère', 'Aventure'])
    expect(row.keywords).toEqual(['moyen-âge'])
    expect(row.director).toBe('Jean-Jacques Annaud')
    expect(row.detailFetchedAt).not.toBeNull()
  })

  it("remplace les plateformes par la liste FR courante, y compris quand un film en a quitté une", async () => {
    // La phase 1 avait recensé ce film sur Disney+ et Netflix ; TMDB ne le
    // donne plus que sur Netflix. La phase 2 fait autorité et doit rétrécir la
    // liste, sinon un filtre « sur Disney+ » se remplirait de films partis.
    await db.insert(movies).values({ id: 598, title: 'Stub', providers: ['disney', 'netflix'] })

    const client: ClientDetail = {
      async movieDetail() {
        return detail
      },
    }

    await fetchDetails(client, db, () => {})

    const [row] = await db.select().from(movies)
    expect(row.providers).toEqual(['netflix'])
  })

  it("un TmdbHttpError 404 sur un film le marque traité et laisse les autres se terminer", async () => {
    await db.insert(movies).values([
      { id: 1, title: 'Disparu' },
      { id: 598, title: 'Stub' },
    ])

    const client: ClientDetail = {
      async movieDetail(id) {
        if (id === 1) throw new TmdbHttpError(404, '/movie/1', 'TMDB a répondu 404 sur /movie/1')
        return detail
      },
    }

    const messages: string[] = []
    const complets = await fetchDetails(client, db, (m) => messages.push(m))
    expect(complets).toBe(1)

    const lignes = await db.select().from(movies).orderBy(movies.id)
    const disparu = lignes.find((l) => l.id === 1)!
    expect(disparu.detailFetchedAt).not.toBeNull()
    expect(disparu.title).toBe('Disparu')

    const stub = lignes.find((l) => l.id === 598)!
    expect(stub.title).toBe('Le Nom de la Rose')
    expect(stub.detailFetchedAt).not.toBeNull()

    expect(messages.some((m) => m.includes('404'))).toBe(true)
  })

  it("une erreur autre que 404 laisse detail_fetched_at nul pour qu'une relance puisse retenter le film", async () => {
    await db.insert(movies).values({ id: 1, title: 'En échec' })

    const client: ClientDetail = {
      async movieDetail() {
        throw new Error('TMDB a répondu 500 sur /movie/1')
      },
    }

    // Un échec isolé finit par former un lot sans aucun progrès et déclenche
    // l'arrêt (cf. cas 6) : ce qui importe ici, c'est l'état de la ligne, pas
    // l'issue de l'appel.
    await fetchDetails(client, db, () => {}).catch(() => {})

    const [row] = await db.select().from(movies)
    expect(row.detailFetchedAt).toBeNull()

    // La ligne reste sélectionnable par la requête de reprise de fetchDetails.
    const encoreASelectionner = await db.execute(sql`
      SELECT id FROM movies WHERE detail_fetched_at IS NULL
    `)
    const idsRestants = (encoreASelectionner as unknown as { rows: { id: number }[] }).rows.map((r) =>
      Number(r.id),
    )
    expect(idsRestants).toContain(1)
  })

  it('un client en échec systématique hors 404 fait rejeter fetchDetails et laisse les lignes intactes', async () => {
    await db.insert(movies).values([
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
      { id: 3, title: 'C' },
    ])

    const client: ClientDetail = {
      async movieDetail() {
        throw new Error('TMDB a répondu 500 sur /movie/x')
      },
    }

    await expect(fetchDetails(client, db, () => {})).rejects.toThrow(/arrêt/i)

    const lignes = await db.select().from(movies)
    expect(lignes.every((l) => l.detailFetchedAt === null)).toBe(true)
  })

  it('une relance ne redemande que les films encore nuls', async () => {
    await db.insert(movies).values([
      { id: 1, title: 'Réussi' },
      { id: 598, title: 'Réussi aussi' },
      { id: 2, title: 'Toujours en échec' },
    ])

    // Course partielle : deux films aboutissent, un troisième échoue sans
    // relâche et finit par provoquer l'arrêt (cas 6) une fois isolé seul
    // dans un lot — c'est justement ce qui rend la course « partielle ».
    const demandes: number[] = []
    const clientPartiel: ClientDetail = {
      async movieDetail(id) {
        demandes.push(id)
        if (id === 2) throw new Error('TMDB a répondu 500 sur /movie/2')
        return { ...detail, id }
      },
    }

    await fetchDetails(clientPartiel, db, () => {}).catch(() => {})
    expect(demandes).toContain(1)
    expect(demandes).toContain(598)

    const lignes = await db.select().from(movies).orderBy(movies.id)
    expect(lignes.find((l) => l.id === 1)!.detailFetchedAt).not.toBeNull()
    expect(lignes.find((l) => l.id === 598)!.detailFetchedAt).not.toBeNull()
    expect(lignes.find((l) => l.id === 2)!.detailFetchedAt).toBeNull()

    // La relance ne doit demander que le film encore nul, jamais ceux déjà complétés.
    const demandesRelance: number[] = []
    const clientRelance: ClientDetail = {
      async movieDetail(id) {
        demandesRelance.push(id)
        return { ...detail, id }
      },
    }

    await fetchDetails(clientRelance, db, () => {})
    expect(demandesRelance).toEqual([2])
  })
})
