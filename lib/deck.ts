import { createHash } from 'node:crypto'

export const BASE_WEIGHT = 1.3
export const POPULARITY_WEIGHT = 0.6

/** Diviseur de 7 caractères hexadécimaux, soit 28 bits. */
const HASH_MAX = 0xfffffff

/**
 * Position d'un film dans le paquet d'un salon.
 *
 * Sept caractères hexadécimaux et non huit : 28 bits n'activent jamais le bit
 * de signe d'un entier Postgres, donc `::bit(28)::int` reste positif et l'ordre
 * SQL correspond exactement à celui calculé ici.
 */
export function deckSortKey(
  roomCode: string,
  movieId: number,
  popularityPercentile: number,
): number {
  const hex = createHash('md5').update(`${roomCode}:${movieId}`).digest('hex').slice(0, 7)
  const u = parseInt(hex, 16) / HASH_MAX
  const p = Number.isNaN(popularityPercentile) ? 0 : Math.min(1, Math.max(0, popularityPercentile))
  return u * (BASE_WEIGHT - POPULARITY_WEIGHT * p)
}
