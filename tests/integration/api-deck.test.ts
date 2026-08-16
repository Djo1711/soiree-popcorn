import { beforeAll, describe, expect, it, vi } from 'vitest'
import { movies } from '@/lib/db/schema'
import { signSession } from '@/lib/session'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb

beforeAll(async () => {
  process.env.SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hmac'
  ;({ db } = await createTestDb())
  vi.doMock('@/lib/db/client', () => ({ getDb: () => db, closePool: async () => {} }))
  await db.insert(movies).values(
    Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      title: `Film ${i + 1}`,
      genres: ['Action'],
      keywords: ['braquage'],
    })),
  )
})

async function salonDeDeux() {
  const { POST: creer } = await import('@/app/api/rooms/route')
  const r = await creer(
    new Request('http://x/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Djo', expectedMembers: 2, matchThreshold: 2 }),
    }),
  )
  const { room, member } = await r.json()
  const { POST: rejoindre } = await import('@/app/api/rooms/[code]/join/route')
  const r2 = await rejoindre(
    new Request(`http://x/api/rooms/${room.code}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Alice' }),
    }),
    { params: Promise.resolve({ code: room.code }) },
  )
  const { member: alice } = await r2.json()
  const cookie = (id: string) => `sp_session=${signSession({ memberId: id, roomCode: room.code })}`
  return { room, djo: cookie(member.id), alice: cookie(alice.id) }
}

describe('GET /api/deck', () => {
  it('refuse sans session', async () => {
    const { GET } = await import('@/app/api/deck/route')
    const r = await GET(new Request('http://x/api/deck'))
    expect(r.status).toBe(401)
    expect((await r.json()).erreur).toMatch(/Rejoignez un salon/)
  })

  it('rend des cartes complètes', async () => {
    const { djo } = await salonDeDeux()
    const { GET } = await import('@/app/api/deck/route')
    const r = await GET(new Request('http://x/api/deck?limit=5', { headers: { cookie: djo } }))
    const { cards } = await r.json()
    expect(cards).toHaveLength(5)
    expect(cards[0]).toHaveProperty('tags')
    expect(cards[0]).toHaveProperty('posterPath')
  })

  it('donne le même ordre aux deux membres', async () => {
    const { djo, alice } = await salonDeDeux()
    const { GET } = await import('@/app/api/deck/route')
    const a = await (await GET(new Request('http://x/api/deck?limit=10', { headers: { cookie: djo } }))).json()
    const b = await (await GET(new Request('http://x/api/deck?limit=10', { headers: { cookie: alice } }))).json()
    expect(a.cards.map((c: { id: number }) => c.id)).toEqual(b.cards.map((c: { id: number }) => c.id))
  })
})

describe('POST /api/swipes puis GET /api/events', () => {
  it('crée un match visible par l’autre membre', async () => {
    const { djo, alice } = await salonDeDeux()
    const { POST } = await import('@/app/api/swipes/route')
    const { GET: evenements } = await import('@/app/api/events/route')

    const corps = (id: number) =>
      JSON.stringify({ movieId: id, liked: true })

    await POST(new Request('http://x/api/swipes', { method: 'POST', headers: { cookie: djo, 'content-type': 'application/json' }, body: corps(1) }))
    const r = await POST(new Request('http://x/api/swipes', { method: 'POST', headers: { cookie: alice, 'content-type': 'application/json' }, body: corps(1) }))
    expect((await r.json()).match.movieId).toBe(1)

    const e = await evenements(new Request('http://x/api/events?since=0', { headers: { cookie: djo } }))
    const { matches, room } = await e.json()
    expect(matches).toHaveLength(1)
    expect(matches[0].movie.id).toBe(1)
    expect(room.complete).toBe(true)
  })

  it('refuse un identifiant de film qui n’existe pas', async () => {
    const { djo } = await salonDeDeux()
    const { POST } = await import('@/app/api/swipes/route')
    const r = await POST(
      new Request('http://x/api/swipes', {
        method: 'POST',
        headers: { cookie: djo, 'content-type': 'application/json' },
        body: JSON.stringify({ movieId: 99999, liked: true }),
      }),
    )
    expect(r.status).toBe(404)
  })
})
