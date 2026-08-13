import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

// Le pilote WebSocket est nécessaire hors navigateur (scripts et fonctions Node).
if (typeof WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL est absent. Copiez .env.example vers .env.local et remplissez-le.')
}

export const pool = new Pool({ connectionString })
export const db = drizzle(pool, { schema })
