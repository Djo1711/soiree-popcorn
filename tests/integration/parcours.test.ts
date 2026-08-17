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
    Array.from({ length: 40 }, (_, i) => ({
      id: i + 1,
      title: `Film ${i + 1}`,
      genres: ['Action'],
      keywords: ['braquage'],
      posterPath: `/p${i + 1}.jpg`,
      releaseYear: 2000,
    })),
  )
})

const json = (body: unknown, cookie?: string) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
})

describe('parcours complet à trois', () => {
  it('du salon vide au film tiré au sort', async () => {
    const { POST: creer } = await import('@/app/api/rooms/route')
    const { POST: rejoindre } = await import('@/app/api/rooms/[code]/join/route')
    const { GET: paquet } = await import('@/app/api/deck/route')
    const { POST: balayer } = await import('@/app/api/swipes/route')
    const { GET: evenements } = await import('@/app/api/events/route')
    const { GET: listerMatchs } = await import('@/app/api/matches/route')
    const { PATCH: changerStatut } = await import('@/app/api/matches/[movieId]/route')
    const { GET: tirage } = await import('@/app/api/matches/random/route')

    // 1. Djo crée un salon de trois avec un seuil de deux
    const rCreation = await creer(
      new Request('http://x/api/rooms', json({ displayName: 'Djo', expectedMembers: 3, matchThreshold: 2 })),
    )
    const { room, member: djo } = await rCreation.json()
    expect(room.complete).toBe(false)

    // 2. Alice puis Chloé rejoignent
    const membres = [djo]
    for (const prenom of ['Alice', 'Chloé']) {
      const r = await rejoindre(
        new Request(`http://x/api/rooms/${room.code}/join`, json({ displayName: prenom })),
        { params: Promise.resolve({ code: room.code }) },
      )
      membres.push((await r.json()).member)
    }
    const cookies = membres.map(
      (m: { id: string }) => `sp_session=${signSession({ memberId: m.id, roomCode: room.code })}`,
    )

    // 3. Les trois voient le même paquet
    const paquets = []
    for (const c of cookies) {
      const r = await paquet(new Request('http://x/api/deck?limit=10', { headers: { cookie: c } }))
      paquets.push((await r.json()).cards.map((x: { id: number }) => x.id))
    }
    expect(paquets[0]).toEqual(paquets[1])
    expect(paquets[1]).toEqual(paquets[2])

    const premier = paquets[0][0]

    // 4. Djo aime : pas encore de match, le seuil de deux n'est pas atteint
    const r1 = await balayer(new Request('http://x/api/swipes', json({ movieId: premier, liked: true }, cookies[0])))
    expect((await r1.json()).match).toBeNull()

    // 5. Alice aime : le seuil est atteint, le match naît
    const r2 = await balayer(new Request('http://x/api/swipes', json({ movieId: premier, liked: true }, cookies[1])))
    expect((await r2.json()).match.movieId).toBe(premier)

    // 6. Chloé, qui n'a rien balayé, voit le match arriver par le sondage
    const rEv = await evenements(new Request('http://x/api/events?since=0', { headers: { cookie: cookies[2] } }))
    const ev = await rEv.json()
    expect(ev.matches).toHaveLength(1)
    expect(ev.room.complete).toBe(true)
    expect(ev.members).toHaveLength(3)

    // 7. Un second match, puis un est marqué vu
    const second = paquets[0][1]
    await balayer(new Request('http://x/api/swipes', json({ movieId: second, liked: true }, cookies[0])))
    await balayer(new Request('http://x/api/swipes', json({ movieId: second, liked: true }, cookies[2])))

    const rListe = await listerMatchs(new Request('http://x/api/matches', { headers: { cookie: cookies[0] } }))
    expect((await rListe.json()).matches).toHaveLength(2)

    await changerStatut(
      new Request(`http://x/api/matches/${second}`, {
        method: 'PATCH',
        headers: { cookie: cookies[0], 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'vu' }),
      }),
      { params: Promise.resolve({ movieId: String(second) }) },
    )

    // 8. Le tirage au sort ne propose que ce qu'il reste à voir
    for (let i = 0; i < 5; i++) {
      const r = await tirage(new Request('http://x/api/matches/random', { headers: { cookie: cookies[0] } }))
      expect((await r.json()).match.movie.id).toBe(premier)
    }
  })
})
