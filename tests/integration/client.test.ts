import { afterEach, describe, expect, it } from 'vitest'
import { closePool, getDb } from '@/lib/db/client'

const original = process.env.DATABASE_URL

afterEach(async () => {
  process.env.DATABASE_URL = original
  await closePool()
})

describe('getDb', () => {
  it('ne lève pas au simple import du module', async () => {
    delete process.env.DATABASE_URL
    await expect(import('@/lib/db/client')).resolves.toBeDefined()
  })

  it('lève un message actionnable quand DATABASE_URL manque', () => {
    delete process.env.DATABASE_URL
    expect(() => getDb()).toThrow(/DATABASE_URL est absent/)
  })
})
