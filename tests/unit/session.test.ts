import { beforeAll, describe, expect, it } from 'vitest'
import { readSession, signSession } from '@/lib/session'

beforeAll(() => {
  process.env.SESSION_SECRET = 'secret-de-test-suffisamment-long-pour-hmac'
})

const charge = { memberId: '11111111-2222-3333-4444-555555555555', roomCode: 'K4P2M9' }

describe('session', () => {
  it("relit ce qu'elle a signé", () => {
    expect(readSession(signSession(charge))).toEqual(charge)
  })

  it("refuse un jeton dont la charge a été modifiée", () => {
    const jeton = signSession(charge)
    const [donnees, signature] = jeton.split('.')
    const falsifiee = Buffer.from(
      JSON.stringify({ ...charge, roomCode: 'AUTRE1' }),
      'utf8',
    ).toString('base64url')
    expect(readSession(`${falsifiee}.${signature}`)).toBeNull()
    expect(donnees).not.toBe(falsifiee)
  })

  it("refuse un jeton dont la signature a été modifiée", () => {
    const [donnees] = signSession(charge).split('.')
    expect(readSession(`${donnees}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`)).toBeNull()
  })

  it("refuse un jeton malformé, vide ou absent", () => {
    expect(readSession(undefined)).toBeNull()
    expect(readSession('')).toBeNull()
    expect(readSession('pasdepoint')).toBeNull()
    expect(readSession('a.b.c')).toBeNull()
  })

  it("refuse une charge qui n'a pas la forme attendue", () => {
    const bidon = Buffer.from(JSON.stringify({ nimporte: 'quoi' }), 'utf8').toString('base64url')
    expect(readSession(`${bidon}.peu-importe`)).toBeNull()
  })

  it("produit une signature différente pour deux membres", () => {
    const autre = { ...charge, memberId: '99999999-2222-3333-4444-555555555555' }
    expect(signSession(charge)).not.toBe(signSession(autre))
  })
})
