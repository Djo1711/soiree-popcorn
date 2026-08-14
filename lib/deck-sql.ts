import { sql } from 'drizzle-orm'
import { BASE_WEIGHT, HASH_MAX, POPULARITY_WEIGHT } from '@/lib/deck'

/**
 * Fragment ORDER BY du paquet, construit à partir des mêmes constantes que
 * `deckSortKey`. Unique écriture SQL de la formule : le test d'intégration et
 * la requête de production importent celle-ci plutôt que de la recopier.
 *
 * Le départage sur `id` est indispensable : deux membres d'un même salon
 * doivent parcourir exactement la même suite, or 28 bits de hachage laissent
 * des égalités possibles sur un catalogue de 10 000 films.
 */
export const deckOrderBy = (roomCode: string) => sql`
  (('x' || substr(md5(${roomCode} || ':' || movies.id::text), 1, 7))::bit(28)::int::double precision
   / ${sql.raw(String(HASH_MAX))}.0)
  * (${sql.raw(BASE_WEIGHT.toFixed(2))} - ${sql.raw(POPULARITY_WEIGHT.toFixed(2))} * movies.popularity_percentile),
  movies.id`
