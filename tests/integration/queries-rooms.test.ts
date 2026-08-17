import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  claimMember,
  createRoom,
  getRoom,
  joinRoom,
  listMembers,
  PrenomTropLongError,
} from '@/lib/db/queries/rooms'
import { members } from '@/lib/db/schema'
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

  it('refuse un prénom trop long, avec la même erreur que joinRoom', async () => {
    await expect(createRoom(db, { ...base, displayName: 'x'.repeat(31) })).rejects.toThrow(
      PrenomTropLongError,
    )
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

  it('refuse un prénom trop long, sans écrire en base', async () => {
    const { room } = await createRoom(db, base)
    await expect(joinRoom(db, room.code, 'x'.repeat(31))).rejects.toThrow(PrenomTropLongError)
    expect((await getRoom(db, room.code))?.memberCount).toBe(1)
  })

  it('ne laisse qu\'une seule adhésion réussir sur deux tentatives simultanées pour la dernière place', async () => {
    const { room } = await createRoom(db, { ...base, expectedMembers: 2, matchThreshold: 2 })
    const [ra, rb] = await Promise.all([
      joinRoom(db, room.code, 'Alice'),
      joinRoom(db, room.code, 'Chloé'),
    ])
    const reussites = [ra, rb].filter((r) => 'member' in r)
    expect(reussites).toHaveLength(1)
    const echecs = [ra, rb].filter((r) => 'error' in r)
    expect(echecs).toHaveLength(1)
    expect((echecs[0] as { error: string }).error).toBe('complet')

    const salon = await getRoom(db, room.code)
    expect(salon?.memberCount).toBe(2)
    expect(salon?.complete).toBe(true)
    const lignes = await db.select().from(members)
    expect(lignes).toHaveLength(2)
  })

  it('ne consomme aucune place quand le prénom est refusé', async () => {
    const { room } = await createRoom(db, { ...base, expectedMembers: 3, matchThreshold: 2 })
    await joinRoom(db, room.code, 'Alice')
    expect(await joinRoom(db, room.code, 'Alice')).toEqual({ error: 'prenom_pris' })
    expect((await getRoom(db, room.code))?.memberCount).toBe(2)

    // La place laissée libre par le refus reste attribuable : un salon ne doit
    // jamais devenir incomplétable à cause d'une tentative rejetée.
    expect('member' in (await joinRoom(db, room.code, 'Chloé'))).toBe(true)
    expect((await getRoom(db, room.code))?.complete).toBe(true)
  })

  it('ne dépasse jamais l\'effectif sur une rafale de tentatives', async () => {
    const { room } = await createRoom(db, { ...base, expectedMembers: 3, matchThreshold: 2 })
    const resultats = await Promise.all(
      ['Alice', 'Chloé', 'Bob', 'Dan', 'Eve'].map((n) => joinRoom(db, room.code, n)),
    )
    expect(resultats.filter((r) => 'member' in r)).toHaveLength(2)
    expect(resultats.filter((r) => 'error' in r)).toHaveLength(3)

    const salon = await getRoom(db, room.code)
    expect(salon?.memberCount).toBe(3)
    expect(salon?.complete).toBe(true)
    expect(await db.select().from(members)).toHaveLength(3)
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
