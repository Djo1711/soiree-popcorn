import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

export type NeonDb = ReturnType<typeof drizzle<typeof schema>>

let pool: Pool | undefined
let instance: NeonDb | undefined

/**
 * Connexion construite au premier appel et non à l'import.
 *
 * Deux raisons. `next build` importe les modules des routes sans que
 * `DATABASE_URL` soit nécessairement présent : lever à l'import ferait échouer
 * la compilation. Et le pilote WebSocket doit être imposé inconditionnellement
 * côté serveur : le garde « si WebSocket n'existe pas » se comportait
 * différemment sur Node 22, où la variable globale existe, faisant emprunter au
 * pilote un chemin jamais testé en local.
 */
export function getDb(): NeonDb {
  if (instance) return instance

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL est absent. Copiez .env.example vers .env.local et remplissez-le.',
    )
  }

  neonConfig.webSocketConstructor = ws
  pool = new Pool({ connectionString })
  instance = drizzle(pool, { schema })
  return instance
}

export async function closePool(): Promise<void> {
  await pool?.end()
  pool = undefined
  instance = undefined
}
