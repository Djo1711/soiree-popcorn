import { sql } from 'drizzle-orm'

export interface SwipeResult {
  match: { movieId: number; matchId: number } | null
}

/**
 * Enregistre un balayage puis tente de créer le match **en une seule
 * instruction**. L'atomicité de « les deux aiment au même instant → exactement
 * un match » tient dans cette instruction et dans la contrainte d'unicité
 * `matches_room_movie_unique` : une lecture suivie d'une écriture en TypeScript
 * rouvrirait la fenêtre que cette contrainte referme.
 *
 * Le premier balayage sur un film fait foi : `ON CONFLICT DO NOTHING` rend
 * l'appel idempotent, ce qui protège du double envoi depuis deux onglets.
 */
export async function recordSwipe(
  db: any,
  roomCode: string,
  memberId: string,
  movieId: number,
  liked: boolean,
): Promise<SwipeResult> {
  await db.execute(sql`
    INSERT INTO swipes (member_id, movie_id, liked)
    VALUES (${memberId}::uuid, ${movieId}, ${liked})
    ON CONFLICT (member_id, movie_id) DO NOTHING
  `)

  if (!liked) return { match: null }

  const result = (await db.execute(sql`
    INSERT INTO matches (room_code, movie_id)
    SELECT r.code, ${movieId}
    FROM rooms r
    WHERE r.code = ${roomCode}
      AND (SELECT count(*) FROM members m WHERE m.room_code = r.code) = r.expected_members
      AND (
        SELECT count(*)
        FROM members m
        JOIN swipes s ON s.member_id = m.id AND s.movie_id = ${movieId} AND s.liked
        WHERE m.room_code = r.code
      ) >= r.match_threshold
    ON CONFLICT (room_code, movie_id) DO NOTHING
    RETURNING id
  `)) as { rows: { id: number }[] }

  const ligne = result.rows[0]
  return ligne ? { match: { movieId, matchId: Number(ligne.id) } } : { match: null }
}

/**
 * Annule le dernier balayage. Refusé si ce balayage a produit un match :
 * le match est peut-être déjà affiché chez les autres, et le voir disparaître
 * sans explication serait pire que de ne pas pouvoir revenir en arrière.
 */
export async function undoLastSwipe(
  db: any,
  memberId: string,
): Promise<{ movieId: number } | { error: 'aucun' | 'match_cree' }> {
  const dernier = (await db.execute(sql`
    SELECT s.movie_id, m.room_code
    FROM swipes s JOIN members m ON m.id = s.member_id
    WHERE s.member_id = ${memberId}::uuid
    ORDER BY s.created_at DESC
    LIMIT 1
  `)) as { rows: { movie_id: number; room_code: string }[] }
  const ligne = dernier.rows[0]
  if (!ligne) return { error: 'aucun' }

  const match = (await db.execute(sql`
    SELECT id FROM matches WHERE room_code = ${ligne.room_code} AND movie_id = ${ligne.movie_id}
  `)) as { rows: { id: number }[] }
  if (match.rows[0]) return { error: 'match_cree' }

  await db.execute(sql`
    DELETE FROM swipes WHERE member_id = ${memberId}::uuid AND movie_id = ${ligne.movie_id}
  `)
  return { movieId: Number(ligne.movie_id) }
}
