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

  it('refuse un prénom trop long avec le même message que /join', async () => {
    const { POST } = await import('@/app/api/rooms/route')
    const r = await POST(
      await poster('http://x/api/rooms', {
        displayName: 'x'.repeat(31),
        expectedMembers: 2,
        matchThreshold: 2,
      }),
    )
    expect(r.status).toBe(400)
    expect((await r.json()).erreur).toBe('Le prénom ne doit pas dépasser 30 caractères.')
  })
})

describe('POST /api/rooms/[code]/join', () => {
  it('refuse un prénom trop long, avec le même message que la création', async () => {
    const { POST: creer } = await import('@/app/api/rooms/route')
    const rCreation = await creer(
      await poster('http://x/api/rooms', { displayName: 'Djo', expectedMembers: 3, matchThreshold: 2 }),
    )
    const { room } = await rCreation.json()

    const { POST: rejoindre } = await import('@/app/api/rooms/[code]/join/route')
    const r = await rejoindre(
      await poster(`http://x/api/rooms/${room.code}/join`, { displayName: 'x'.repeat(31) }),
      { params: Promise.resolve({ code: room.code }) },
    )
    expect(r.status).toBe(400)
    expect((await r.json()).erreur).toBe('Le prénom ne doit pas dépasser 30 caractères.')
  })
})

describe('GET /api/rooms/[code]/members', () => {
  it('partage le même budget de tentatives que /join, pour la même IP', async () => {
    const ip = '9.9.9.9'
    const { POST: rejoindre } = await import('@/app/api/rooms/[code]/join/route')
    const { GET: membres } = await import('@/app/api/rooms/[code]/members/route')

    // Épuise les 10 tentatives autorisées par minute via la route join.
    for (let i = 0; i < 10; i++) {
      await rejoindre(
        new Request('http://x/api/rooms/AAAAAA/join', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
          body: JSON.stringify({ displayName: 'Zzz' }),
        }),
        { params: Promise.resolve({ code: 'AAAAAA' }) },
      )
    }

    // La 11e tentative, même via /members, doit être bloquée : même clé, même budget.
    const r = await membres(
      new Request('http://x/api/rooms/AAAAAA/members', { headers: { 'x-forwarded-for': ip } }),
      { params: Promise.resolve({ code: 'AAAAAA' }) },
    )
    expect(r.status).toBe(429)
    expect((await r.json()).erreur).toMatch(/Trop de tentatives/)
  })

  it('n’est pas affectée par le budget d’une autre IP', async () => {
    const { GET: membres } = await import('@/app/api/rooms/[code]/members/route')
    const r = await membres(
      new Request('http://x/api/rooms/AAAAAA/members', { headers: { 'x-forwarded-for': '1.1.1.1' } }),
      { params: Promise.resolve({ code: 'AAAAAA' }) },
    )
    // Salon inexistant mais IP neuve : la requête passe le rate-limit et échoue en 404, pas en 429.
    expect(r.status).toBe(404)
  })
})
