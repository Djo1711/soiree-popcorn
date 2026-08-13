import { sql } from 'drizzle-orm'
import { translateKeywords } from '@/lib/keywords'
import type { ProviderKey } from '@/lib/db/schema'
import {
  TmdbClient,
  TmdbHttpError,
  type ClientCollecte,
  type ClientDetail,
  type TmdbMovieDetail,
} from '@/lib/tmdb'

/** Toute base Postgres pilotée par Drizzle : Neon en production, PGlite en test. */
type AnyDb = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }

const TOP_RATED_PAGES = 10
const DETAIL_CONCURRENCY = 8
const DETAIL_BATCH = 200
/** Au-delà, on considère la panne systémique et on arrête plutôt que de vider le catalogue. */
const MAX_ECHECS_CONSECUTIFS = 25

export function mapDetailToRow(detail: TmdbMovieDetail) {
  const genres = detail.genres.map((g) => g.name)
  const keywordsFr = translateKeywords((detail.keywords?.keywords ?? []).map((k) => k.name))
  const director = detail.credits?.crew.find((c) => c.job === 'Director')?.name ?? null
  const flatrate = detail['watch/providers']?.results?.FR?.flatrate ?? []

  const providers: ProviderKey[] = []
  for (const p of flatrate) {
    if (/^netflix/i.test(p.provider_name) && !providers.includes('netflix')) providers.push('netflix')
    if (/^disney plus$/i.test(p.provider_name) && !providers.includes('disney')) providers.push('disney')
    if (/^canal\+/i.test(p.provider_name) && !providers.includes('canal')) providers.push('canal')
  }

  return {
    id: detail.id,
    title: detail.title,
    originalTitle: detail.original_title,
    overview: detail.overview,
    posterPath: detail.poster_path,
    backdropPath: detail.backdrop_path,
    releaseDate: detail.release_date || null,
    releaseYear: detail.release_date ? Number(detail.release_date.slice(0, 4)) : null,
    runtime: detail.runtime,
    voteAverage: detail.vote_average,
    voteCount: detail.vote_count,
    popularity: detail.popularity,
    genres,
    keywords: keywordsFr,
    providers,
    director,
  }
}

// Les quatre tags affichés ne sont pas stockés : ils se recomposent à l'affichage
// avec `buildTags(keywords, genres)`. Stocker un dérivé de deux colonnes déjà
// présentes obligerait à le régénérer à chaque évolution du dictionnaire.

/** Phase 1 — recense les identifiants et pose une ligne minimale par film. */
export async function collectCatalogue(
  client: ClientCollecte,
  db: AnyDb,
  log: (message: string) => void,
): Promise<number> {
  const resolved = await client.resolveProviderIds()
  log(
    'Plateformes résolues : ' +
      resolved.map((r) => `${r.key}=${r.ids.join('|')}`).join(', '),
  )

  let total = 0

  for (const { key, ids } of resolved) {
    for (const providerId of ids) {
      const first = await client.discover(providerId, 1)
      const pages = Math.min(first.total_pages, 500)
      if (first.total_pages > 500) {
        log(
          `ATTENTION : ${key}/${providerId} annonce ${first.total_pages} pages, ` +
            'plafonné à 500 par TMDB. Des films sont perdus — découper par années.',
        )
      }
      log(`${key}/${providerId} : ${first.total_results} films sur ${pages} pages`)

      for (let page = 1; page <= pages; page++) {
        const data = page === 1 ? first : await client.discover(providerId, page)
        for (const movie of data.results) {
          await upsertStub(db, movie.id, movie.title, key, false)
          total++
        }
      }
    }
  }

  for (let page = 1; page <= TOP_RATED_PAGES; page++) {
    const data = await client.topRated(page)
    for (const movie of data.results) {
      await upsertStub(db, movie.id, movie.title, null, true)
      total++
    }
  }

  log(`Phase 1 terminée : ${total} lignes recensées (doublons inclus).`)
  return total
}

async function upsertStub(
  db: AnyDb,
  id: number,
  title: string,
  provider: ProviderKey | null,
  inTop200: boolean,
) {
  const nouveaux = provider ? sql`ARRAY[${provider}]::text[]` : sql`'{}'::text[]`
  await db.execute(sql`
    INSERT INTO movies (id, title, providers, in_top200)
    VALUES (${id}, ${title}, ${nouveaux}, ${inTop200})
    ON CONFLICT (id) DO UPDATE SET
      providers = (
        SELECT COALESCE(array_agg(DISTINCT p ORDER BY p), '{}')
        FROM unnest(movies.providers || excluded.providers) AS p
      ),
      in_top200 = movies.in_top200 OR excluded.in_top200
  `)
}

/**
 * Phase 2 — complète les films dont le détail manque.
 *
 * Seul un 404 (absence définitive côté TMDB) marque `detail_fetched_at` en
 * échec : toute autre erreur — jeton révoqué, page anti-bot, coupure réseau
 * épuisant ses tentatives — laisse la ligne intacte pour qu'une relance la
 * retente. Un compteur d'échecs consécutifs interrompt l'ingestion avant
 * qu'une panne systémique ne fasse échouer les dix mille appels restants en
 * quelques secondes.
 */
export async function fetchDetails(
  client: ClientDetail,
  db: AnyDb,
  log: (message: string) => void,
): Promise<number> {
  let complets = 0
  let echecsConsecutifs = 0
  let derniereErreur = ''

  for (;;) {
    const result = (await db.execute(sql`
      SELECT id FROM movies WHERE detail_fetched_at IS NULL LIMIT ${DETAIL_BATCH}
    `)) as { rows: { id: number }[] }
    const ids = result.rows.map((r) => Number(r.id))
    if (ids.length === 0) break

    let traitesDansLeLot = 0

    for (let i = 0; i < ids.length; i += DETAIL_CONCURRENCY) {
      const lot = ids.slice(i, i + DETAIL_CONCURRENCY)
      await Promise.all(
        lot.map(async (id) => {
          try {
            const row = mapDetailToRow(await client.movieDetail(id))
            await db.execute(sql`
              UPDATE movies SET
                title = ${row.title},
                original_title = ${row.originalTitle},
                overview = ${row.overview},
                poster_path = ${row.posterPath},
                backdrop_path = ${row.backdropPath},
                release_date = ${row.releaseDate}::date,
                release_year = ${row.releaseYear},
                runtime = ${row.runtime},
                vote_average = ${row.voteAverage},
                vote_count = ${row.voteCount},
                popularity = ${row.popularity},
                genres = ${sql.raw(pgArray(row.genres))},
                keywords = ${sql.raw(pgArray(row.keywords))},
                director = ${row.director},
                detail_fetched_at = now(),
                updated_at = now()
              WHERE id = ${id}
            `)
            complets++
            traitesDansLeLot++
            echecsConsecutifs = 0
          } catch (error) {
            if (error instanceof TmdbHttpError && error.status === 404) {
              // Absence définitive : inutile de retenter, mais ce n'est pas un
              // signe de panne systémique, donc le compteur d'échecs reste intact.
              log(`Film ${id} absent de TMDB (404), marqué comme traité.`)
              await db.execute(sql`UPDATE movies SET detail_fetched_at = now() WHERE id = ${id}`)
              traitesDansLeLot++
              return
            }

            derniereErreur = (error as Error).message
            echecsConsecutifs++
            log(`Film ${id} en échec, sera retenté à la prochaine exécution : ${derniereErreur}`)

            if (echecsConsecutifs >= MAX_ECHECS_CONSECUTIFS) {
              throw new Error(
                `Arrêt de l'ingestion après ${echecsConsecutifs} échecs consécutifs — ` +
                  `dernière erreur : ${derniereErreur}`,
              )
            }
          }
        }),
      )
    }
    log(`Phase 2 : ${complets} films complétés…`)

    if (traitesDansLeLot === 0) {
      throw new Error(
        `Arrêt de l'ingestion : aucun film traité sur ce lot de ${ids.length}, ` +
          'la relance bouclerait indéfiniment sur les mêmes identifiants.',
      )
    }
  }

  return complets
}

function pgArray(values: string[]): string {
  if (values.length === 0) return `'{}'::text[]`
  const echappees = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(',')
  return `ARRAY[${echappees}]::text[]`
}

/** Phase 3 — rang de popularité relatif, entre 0 et 1. */
export async function computePercentiles(db: AnyDb): Promise<void> {
  await db.execute(sql`
    UPDATE movies m
    SET popularity_percentile = r.pct
    FROM (
      SELECT id, percent_rank() OVER (ORDER BY COALESCE(popularity, 0)) AS pct
      FROM movies
    ) r
    WHERE m.id = r.id
  `)
}

async function main() {
  const { db, pool } = await import('@/lib/db/client')
  const client = new TmdbClient()
  const log = (message: string) => console.log(`[${new Date().toISOString()}] ${message}`)

  const debut = Date.now()
  await collectCatalogue(client, db, log)
  await fetchDetails(client, db, log)
  await computePercentiles(db)

  const total = (await db.execute(sql`SELECT count(*)::int AS n FROM movies`)) as {
    rows: { n: number }[]
  }
  log(`Terminé : ${total.rows[0].n} films en base en ${Math.round((Date.now() - debut) / 1000)} s.`)
  await pool.end()
}

if (process.argv[1]?.endsWith('ingest.ts')) {
  await main()
}
