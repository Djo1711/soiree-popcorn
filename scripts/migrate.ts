import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { db, pool } from '@/lib/db/client'

await migrate(db, { migrationsFolder: './drizzle' })
await pool.end()
console.log('Migrations appliquées.')
