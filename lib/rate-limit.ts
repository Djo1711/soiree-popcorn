import { sql } from 'drizzle-orm'

/**
 * Incrémente et lit le compteur en **une seule instruction**.
 *
 * Une lecture suivie d'une écriture sous-compterait précisément pendant la
 * rafale de tentatives simultanées que ce compteur existe pour arrêter : deux
 * fonctions serverless liraient la même valeur avant que l'une n'écrive.
 *
 * `db` est typé `any` : le client Neon réel (`getDb()`) et le client PGlite de
 * test exposent tous deux une méthode `execute`, mais avec des signatures de
 * retour incompatibles pour TypeScript. Même motif que dans
 * `lib/db/queries/*.ts`, pour le même pont entre les deux clients.
 */
export async function hitRateLimit(
  db: any,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; count: number }> {
  const fenetre = sql.raw(`interval '${Math.trunc(windowSeconds)} seconds'`)
  const result = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - ${fenetre} THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - ${fenetre} THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count
  `)
  const count = Number(result.rows[0].count)
  return { allowed: count <= limit, count }
}
