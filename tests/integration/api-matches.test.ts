import { beforeAll, describe, expect, it, vi } from 'vitest'
import { matches, movies, rooms } from '@/lib/db/schema'
import { signSession } from '@/lib/session'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let cookie: string

beforeAll(async () => {
  process.env.SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hmac'
  process.env.CRON_SECRET = 'secret-cron-de-test'
  process.env.TMDB_READ_TOKEN = 'jeton-de-test'
  ;({ db } = await createTestDb())
  vi.doMock('@/lib/db/client', () => ({ getDb: () => db, closePool: async () => {} }))

  await db.insert(rooms).values({ code: 'K4P2M9', expectedMembers: 2, matchThreshold: 2 })
  await db.insert(movies).values([
    { id: 1, title: 'Un', genres: ['Action'], keywords: ['braquage'] },
    { id: 2, title: 'Deux', genres: ['Comédie'], keywords: [] },
  ])
  await db.insert(matches).values([
    { roomCode: 'K4P2M9', movieId: 1 },
    { roomCode: 'K4P2M9', movieId: 2 },
  ])
  const { members } = await import('@/lib/db/schema')
  const [m] = await db.insert(members).values({ roomCode: 'K4P2M9', displayName: 'Djo' }).returning()
  cookie = `sp_session=${signSession({ memberId: m.id, roomCode: 'K4P2M9' })}`

  // La route de cron instancie un vrai TmdbClient : on bouchonne fetch pour que
  // la phase 2 se termine sans appel réseau réel, avec un détail minimal valide.
  // Posé après la mise en place de la base pour ne pas interférer avec elle.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 0,
            title: 'Stub',
            original_title: 'Stub',
            overview: null,
            poster_path: null,
            backdrop_path: null,
            release_date: null,
            runtime: null,
            vote_average: null,
            vote_count: null,
            popularity: null,
            genres: [],
          }),
          { status: 200 },
        ),
    ),
  )
}, 30_000)

describe('GET /api/matches', () => {
  it('rend les matchs du salon', async () => {
    const { GET } = await import('@/app/api/matches/route')
    const { matches: liste } = await (
      await GET(new Request('http://x/api/matches', { headers: { cookie } }))
    ).json()
    expect(liste).toHaveLength(2)
  })

  it('refuse sans session', async () => {
    const { GET } = await import('@/app/api/matches/route')
    expect((await GET(new Request('http://x/api/matches'))).status).toBe(401)
  })
})

describe('PATCH /api/matches/[movieId]', () => {
  it('change le statut', async () => {
    const { PATCH } = await import('@/app/api/matches/[movieId]/route')
    const r = await PATCH(
      new Request('http://x/api/matches/1', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'vu' }),
      }),
      { params: Promise.resolve({ movieId: '1' }) },
    )
    expect(r.status).toBe(200)
  })

  it('refuse un statut inconnu', async () => {
    const { PATCH } = await import('@/app/api/matches/[movieId]/route')
    const r = await PATCH(
      new Request('http://x/api/matches/1', {
        method: 'PATCH',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'nawak' }),
      }),
      { params: Promise.resolve({ movieId: '1' }) },
    )
    expect(r.status).toBe(400)
  })
})

describe('GET /api/cron/ingest', () => {
  it('refuse sans le secret', async () => {
    const { GET } = await import('@/app/api/cron/ingest/route')
    expect((await GET(new Request('http://x/api/cron/ingest'))).status).toBe(401)
  })

  it('accepte avec le secret', async () => {
    const { GET } = await import('@/app/api/cron/ingest/route')
    const r = await GET(
      new Request('http://x/api/cron/ingest', {
        headers: { authorization: 'Bearer secret-cron-de-test' },
      }),
    )
    expect(r.status).toBe(200)
    expect(await r.json()).toHaveProperty('traites')
  })
})
