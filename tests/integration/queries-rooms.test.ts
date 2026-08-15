import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  claimMember,
  createRoom,
  getRoom,
  joinRoom,
  listMembers,
} from '@/lib/db/queries/rooms'
import { createTestDb, type TestDb } from '@/tests/helpers/db'

let db: TestDb
let close: () => Promise<void>

beforeEach(async () => {
  ;({ db, close } = await createTestDb())
})
afterEach(async () => {
  await close()
})

const base = { displayName: 'Djo', expectedMembers: 2, matchThreshold: 2 }

describe('createRoom', () => {
  it('crée un salon valide et son premier membre', async () => {
    const { room, member } = await createRoom(db, base)
    expect(room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(room.expectedMembers).toBe(2)
    expect(room.memberCount).toBe(1)
    expect(room.complete).toBe(false)
    expect(member.displayName).toBe('Djo')
  })

  it('refuse un effectif hors bornes', async () => {
    await expect(createRoom(db, { ...base, expectedMembers: 9, matchThreshold: 2 })).rejects.toThrow()
    await expect(createRoom(db, { ...base, expectedMembers: 1, matchThreshold: 2 })).rejects.toThrow()
  })

  it('refuse un seuil hors bornes', async () => {
    await expect(createRoom(db, { ...base, expectedMembers: 4, matchThreshold: 5 })).rejects.toThrow()
    await expect(createRoom(db, { ...base, expectedMembers: 4, matchThreshold: 1 })).rejects.toThrow()
  })

  it('dote le premier membre de filtres par défaut', async () => {
    const { member } = await createRoom(db, base)
    const filtres = await db.query.memberFilters.findFirst({
      where: (f, { eq }) => eq(f.memberId, member.id),
    })
    expect(filtres?.includeTop200).toBe(true)
    expect(filtres?.minRating).toBe(0)
  })
})

describe('joinRoom', () => {
  it('ajoute un membre et complète l\'effectif', async () => {
    const { room } = await createRoom(db, base)
    const r = await joinRoom(db, room.code, 'Alice')
    expect('member' in r && r.member.displayName).toBe('Alice')
    expect((await getRoom(db, room.code))?.complete).toBe(true)
  })

  it('accepte un code en minuscules avec des espaces', async () => {
    const { room } = await createRoom(db, base)
    const saisie = ` ${room.code.toLowerCase()} `
    expect('member' in (await joinRoom(db, saisie, 'Alice'))).toBe(true)
  })

  it('refuse un code inexistant', async () => {
    expect(await joinRoom(db, 'K4P2M9', 'Alice')).toEqual({ error: 'introuvable' })
  })

  it('refuse au-delà de l\'effectif annoncé', async () => {
    const { room } = await createRoom(db, base)
    await joinRoom(db, room.code, 'Alice')
    expect(await joinRoom(db, room.code, 'Chloé')).toEqual({ error: 'complet' })
  })

  it('refuse un prénom déjà pris dans ce salon', async () => {
    const { room } = await createRoom(db, base)
    expect(await joinRoom(db, room.code, 'Djo')).toEqual({ error: 'prenom_pris' })
  })
})

describe('claimMember', () => {
  it('rend une identité existante du salon', async () => {
    const { room, member } = await createRoom(db, base)
    expect(await claimMember(db, room.code, member.id)).toEqual(member)
  })

  it('refuse un membre d\'un autre salon', async () => {
    const a = await createRoom(db, base)
    const b = await createRoom(db, base)
    expect(await claimMember(db, b.room.code, a.member.id)).toBeNull()
  })
})

describe('listMembers', () => {
  it('liste les prénoms dans l\'ordre d\'arrivée', async () => {
    const { room } = await createRoom(db, base)
    await joinRoom(db, room.code, 'Alice')
    expect((await listMembers(db, room.code)).map((m) => m.displayName)).toEqual(['Djo', 'Alice'])
  })
})
