import { sql } from 'drizzle-orm'
import type { MatchStatus } from '@/lib/db/schema'
import type { DeckCard } from '@/lib/db/queries/deck'
import { buildTags } from '@/lib/keywords'

export interface MatchRow {
  matchId: number
  status: MatchStatus
  createdAt: string
  movie: DeckCard
}

const COLONNES = sql`
  m.id AS match_id, m.status, m.created_at,
  movies.id, movies.title, movies.overview, movies.poster_path, movies.release_date,
  movies.release_year, movies.runtime, movies.vote_average, movies.director,
  movies.providers, movies.keywords, movies.genres
`

function versLigne(r: Record<string, unknown>): MatchRow {
  return {
    matchId: Number(r.match_id),
    status: String(r.status) as MatchStatus,
    createdAt: new Date(String(r.created_at)).toISOString(),
    movie: {
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
    },
  }
}

export async function listMatches(
  db: any,
  roomCode: string,
  status?: MatchStatus,
): Promise<MatchRow[]> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT ${COLONNES}
    FROM matches m JOIN movies ON movies.id = m.movie_id
    WHERE m.room_code = ${roomCode}
      AND (${status === undefined} OR m.status = ${status ?? ''})
    ORDER BY m.id DESC
  `)
  return result.rows.map(versLigne)
}

export async function matchesSince(
  db: any,
  roomCode: string,
  sinceId: number,
): Promise<MatchRow[]> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT ${COLONNES}
    FROM matches m JOIN movies ON movies.id = m.movie_id
    WHERE m.room_code = ${roomCode} AND m.id > ${sinceId}
    ORDER BY m.id ASC
  `)
  return result.rows.map(versLigne)
}

export async function setMatchStatus(
  db: any,
  roomCode: string,
  movieId: number,
  status: MatchStatus,
): Promise<boolean> {
  const result = await db.execute<{ id: number }>(sql`
    UPDATE matches SET status = ${status}, updated_at = now()
    WHERE room_code = ${roomCode} AND movie_id = ${movieId}
    RETURNING id
  `)
  return result.rows.length > 0
}

export async function randomMatch(db: any, roomCode: string): Promise<MatchRow | null> {
  const result = await db.execute<Record<string, unknown>>(sql`
    SELECT ${COLONNES}
    FROM matches m JOIN movies ON movies.id = m.movie_id
    WHERE m.room_code = ${roomCode} AND m.status = 'a_voir'
    ORDER BY random() LIMIT 1
  `)
  const r = result.rows[0]
  return r ? versLigne(r) : null
}
