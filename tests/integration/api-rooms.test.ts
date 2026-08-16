import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb

beforeAll(async () => {
  process.env.SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hmac'
  ;({ db } = await createTestDb())
  vi.doMock('@/lib/db/client', () => ({ getDb: () => db, closePool: async () => {} }))
})

async function poster(url: string, body: unknown, cookie?: string) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

describe('POST /api/rooms', () => {
  it('crée un salon et pose le cookie', async () => {
    const { POST } = await import('@/app/api/rooms/route')
    const r = await POST(
      await poster('http://x/api/rooms', { displayName: 'Djo', expectedMembers: 2, matchThreshold: 2 }),
    )
    expect(r.status).toBe(200)
    expect(r.headers.get('set-cookie')).toMatch(/sp_session=.+HttpOnly/)
    const corps = await r.json()
    expect(corps.room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('refuse un prénom vide', async () => {
    const { POST } = await import('@/app/api/rooms/route')
    const r = await POST(
      await poster('http://x/api/rooms', { displayName: '  ', expectedMembers: 2, matchThreshold: 2 }),
    )
    expect(r.status).toBe(400)
    expect((await r.json()).erreur).toMatch(/prénom/i)
  })

  it('refuse un effectif hors bornes avec un message français', async () => {
    const { POST } = await import('@/app/api/rooms/route')
    const r = await POST(
      await poster('http://x/api/rooms', { displayName: 'Djo', expectedMembers: 12, matchThreshold: 2 }),
    )
    expect(r.status).toBe(400)
    expect((await r.json()).erreur).toMatch(/entre 2 et 8/)
  })

  it('refuse un seuil supérieur à l’effectif', async () => {
    const { POST } = await import('@/app/api/rooms/route')
    const r = await POST(
      await poster('http://x/api/rooms', { displayName: 'Djo', expectedMembers: 3, matchThreshold: 4 }),
    )
    expect(r.status).toBe(400)
  })
})
