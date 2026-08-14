import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { closePool, getDb } from '@/lib/db/client'

await migrate(getDb(), { migrationsFolder: './drizzle' })
await closePool()
console.log('Migrations appliquées.')
