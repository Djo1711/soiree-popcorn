import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../roomcode'

export type MatchStatus = 'a_voir' | 'vu' | 'abandonne'
export type ProviderKey = 'netflix' | 'canal' | 'disney'

// Garde-fou de l'injection littérale ci-dessous : tant que l'alphabet reste
// alphanumérique, le motif ne peut contenir ni quote ni métacaractère de classe.
if (!/^[A-Z0-9]+$/.test(ROOM_CODE_ALPHABET)) {
  throw new Error('ROOM_CODE_ALPHABET doit rester alphanumérique pour être injecté dans un CHECK.')
}

/**
 * Le motif est dérivé de `ROOM_CODE_ALPHABET` et non recopié : la base et
 * `lib/roomcode.ts` doivent accepter exactement le même jeu de caractères,
 * sans quoi un code généré finirait rejeté à l'insertion.
 *
 * `sql.raw` est obligatoire ici : drizzle-kit sérialise un paramètre lié dans un
 * CHECK en `$1` et produit une migration invalide. Ce n'est pas la construction
 * de requête par concaténation bannie ailleurs — c'est du DDL bâti à partir
 * d'une constante du module, jamais d'une saisie, et l'assertion au-dessus le
 * garantit.
 */
const ROOM_CODE_PATTERN = sql.raw(`'^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$'`)

export const rooms = pgTable(
  'rooms',
  {
    code: text('code').primaryKey(),
    /** Effectif annoncé à la création : aucun match tant qu'il n'est pas atteint. */
    expectedMembers: integer('expected_members').notNull(),
    /** Nombre de « j'aime » requis, entre 2 et expectedMembers. */
    matchThreshold: integer('match_threshold').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('rooms_expected_members_range', sql`${t.expectedMembers} BETWEEN 2 AND 8`),
    check('rooms_threshold_range', sql`${t.matchThreshold} BETWEEN 2 AND ${t.expectedMembers}`),
    check('rooms_code_format', sql`${t.code} ~ ${ROOM_CODE_PATTERN}`),
  ],
)

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomCode: text('room_code')
      .notNull()
      .references(() => rooms.code, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('members_room_name_unique').on(t.roomCode, t.displayName)],
)

export const movies = pgTable(
  'movies',
  {
    id: integer('id').primaryKey(),
    title: text('title').notNull(),
    originalTitle: text('original_title'),
    overview: text('overview'),
    posterPath: text('poster_path'),
    backdropPath: text('backdrop_path'),
    releaseDate: date('release_date'),
    releaseYear: integer('release_year'),
    runtime: integer('runtime'),
    voteAverage: real('vote_average'),
    voteCount: integer('vote_count'),
    popularity: real('popularity'),
    popularityPercentile: doublePrecision('popularity_percentile').notNull().default(0),
    genres: text('genres').array().notNull().default(sql`'{}'`),
    keywords: text('keywords').array().notNull().default(sql`'{}'`),
    providers: text('providers').array().notNull().default(sql`'{}'`),
    inTop200: boolean('in_top200').notNull().default(false),
    director: text('director'),
    detailFetchedAt: timestamp('detail_fetched_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('movies_genres_idx').using('gin', t.genres),
    index('movies_keywords_idx').using('gin', t.keywords),
    index('movies_providers_idx').using('gin', t.providers),
    index('movies_release_year_idx').on(t.releaseYear),
    index('movies_vote_average_idx').on(t.voteAverage),
    // Index partiel : 200 lignes sur 10 000 portent `true`, un btree complet
    // sur un booléen aussi déséquilibré est ignoré par le planificateur.
    index('movies_top200_idx').on(t.id).where(sql`in_top200`),
    index('movies_detail_fetched_idx').on(t.detailFetchedAt),
  ],
)

export const memberFilters = pgTable('member_filters', {
  memberId: uuid('member_id')
    .primaryKey()
    .references(() => members.id, { onDelete: 'cascade' }),
  genres: text('genres').array().notNull().default(sql`'{}'`),
  yearFrom: integer('year_from'),
  yearTo: integer('year_to'),
  minRating: real('min_rating').notNull().default(0),
  maxRuntime: integer('max_runtime'),
  providers: text('providers').array().notNull().default(sql`'{}'`),
  includeTop200: boolean('include_top200').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const swipes = pgTable(
  'swipes',
  {
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    movieId: integer('movie_id')
      .notNull()
      .references(() => movies.id, { onDelete: 'cascade' }),
    liked: boolean('liked').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.memberId, t.movieId] }),
    index('swipes_member_recent_idx').on(t.memberId, t.createdAt),
  ],
)

export const matches = pgTable(
  'matches',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    roomCode: text('room_code')
      .notNull()
      .references(() => rooms.code, { onDelete: 'cascade' }),
    movieId: integer('movie_id')
      .notNull()
      .references(() => movies.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('a_voir'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('matches_room_movie_unique').on(t.roomCode, t.movieId),
    index('matches_room_id_idx').on(t.roomCode, t.id),
    check('matches_status_valide', sql`${t.status} IN ('a_voir', 'vu', 'abandonne')`),
  ],
)

// Pas de table `ingest_state` : la progression de l'ingestion est portée par
// `movies.detail_fetched_at IS NULL`, qui est à la fois le curseur et la
// donnée. Un second curseur ne pourrait que se désynchroniser du premier.

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
})
