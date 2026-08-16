import { sql } from 'drizzle-orm'
import { deckOrderBy } from '@/lib/deck-sql'
import { buildTags } from '@/lib/keywords'

export interface DeckFilters {
  genres: string[]
  yearFrom: number | null
  yearTo: number | null
  minRating: number
  maxRuntime: number | null
  providers: string[]
  includeTop200: boolean
}

export interface DeckCard {
  id: number
  title: string
  overview: string | null
  posterPath: string | null
  releaseDate: string | null
  releaseYear: number | null
  runtime: number | null
  voteAverage: number | null
  director: string | null
  providers: string[]
  tags: string[]
}

/*
 * Les deux requêtes ci-dessous portent leurs conditions en clair plutôt que via
 * un fragment partagé. TMDB code « inconnu » par un zéro sur la durée et la
 * note : une durée inconnue ne doit donc pas passer pour très courte, ni une
 * note inconnue pour très mauvaise, dès qu'un seuil est demandé.
 */

export async function fetchDeck(
  db: any,
  roomCode: string,
  memberId: string,
  f: DeckFilters,
  limit: number,
): Promise<DeckCard[]> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT movies.id, movies.title, movies.overview, movies.poster_path, movies.release_date,
           movies.release_year, movies.runtime, movies.vote_average, movies.director,
           movies.providers, movies.keywords, movies.genres
    FROM movies
    WHERE (${f.genres.length} = 0 OR movies.genres && ${sql.param(f.genres)}::text[])
      AND (${f.yearFrom === null} OR movies.release_year >= ${f.yearFrom ?? 0})
      AND (${f.yearTo === null} OR movies.release_year <= ${f.yearTo ?? 0})
      AND (${f.maxRuntime === null}
           OR (movies.runtime IS NOT NULL AND movies.runtime > 0 AND movies.runtime <= ${f.maxRuntime ?? 0}))
      AND (${f.minRating <= 0}
           OR (movies.vote_average IS NOT NULL AND movies.vote_average > 0
               AND movies.vote_average >= ${f.minRating}))
      AND (${f.providers.length} = 0
           OR movies.providers && ${sql.param(f.providers)}::text[]
           OR (${f.includeTop200} AND movies.in_top200))
      AND NOT EXISTS (
        SELECT 1 FROM swipes s WHERE s.member_id = ${memberId}::uuid AND s.movie_id = movies.id
      )
    ORDER BY ${deckOrderBy(roomCode)}
    LIMIT ${limit}
  `)

  return result.rows.map((r) => ({
    id: Number(r.id),
    title: String(r.title),
    overview: (r.overview as string | null) ?? null,
    posterPath: (r.poster_path as string | null) ?? null,
    releaseDate: r.release_date ? String(r.release_date) : null,
    releaseYear: r.release_year === null ? null : Number(r.release_year),
    runtime: r.runtime ? Number(r.runtime) : null,
    voteAverage: r.vote_average ? Number(r.vote_average) : null,
    director: (r.director as string | null) ?? null,
    providers: (r.providers as string[]) ?? [],
    tags: buildTags((r.keywords as string[]) ?? [], (r.genres as string[]) ?? []),
  }))
}

export async function countDeck(db: any, memberId: string, f: DeckFilters): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM movies
    WHERE (${f.genres.length} = 0 OR movies.genres && ${sql.param(f.genres)}::text[])
      AND (${f.yearFrom === null} OR movies.release_year >= ${f.yearFrom ?? 0})
      AND (${f.yearTo === null} OR movies.release_year <= ${f.yearTo ?? 0})
      AND (${f.maxRuntime === null}
           OR (movies.runtime IS NOT NULL AND movies.runtime > 0 AND movies.runtime <= ${f.maxRuntime ?? 0}))
      AND (${f.minRating <= 0}
           OR (movies.vote_average IS NOT NULL AND movies.vote_average > 0
               AND movies.vote_average >= ${f.minRating}))
      AND (${f.providers.length} = 0
           OR movies.providers && ${sql.param(f.providers)}::text[]
           OR (${f.includeTop200} AND movies.in_top200))
      AND NOT EXISTS (
        SELECT 1 FROM swipes s WHERE s.member_id = ${memberId}::uuid AND s.movie_id = movies.id
      )
  `)
  return Number(result.rows[0].n)
}
