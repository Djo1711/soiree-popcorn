import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { hitRateLimit } from '@/lib/rate-limit'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
})
afterEach(async () => {
  await close()
})

describe('hitRateLimit', () => {
  it('autorise jusqu\'à la limite puis refuse', async () => {
    for (let i = 1; i <= 3; i++) {
      const r = await hitRateLimit(db, 'join:1.2.3.4', 3, 60)
      expect(r).toEqual({ allowed: true, count: i })
    }
    expect(await hitRateLimit(db, 'join:1.2.3.4', 3, 60)).toEqual({ allowed: false, count: 4 })
  })

  it('compte séparément deux clés', async () => {
    await hitRateLimit(db, 'join:1.1.1.1', 1, 60)
    expect(await hitRateLimit(db, 'join:2.2.2.2', 1, 60)).toEqual({ allowed: true, count: 1 })
  })

  it('repart à un quand la fenêtre est écoulée', async () => {
    await hitRateLimit(db, 'join:1.2.3.4', 1, 60)
    await db.execute(
      sql`UPDATE rate_limits SET window_start = now() - interval '2 minutes' WHERE key = 'join:1.2.3.4'`,
    )
    expect(await hitRateLimit(db, 'join:1.2.3.4', 1, 60)).toEqual({ allowed: true, count: 1 })
  })

  it('compte juste sous vingt appels simultanés', async () => {
    const resultats = await Promise.all(
      Array.from({ length: 20 }, () => hitRateLimit(db, 'join:9.9.9.9', 100, 60)),
    )
    expect(resultats.map((r) => r.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    )
  })
})
