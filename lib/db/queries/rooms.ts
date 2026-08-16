import { and, asc, eq, sql } from 'drizzle-orm'
import { memberFilters, members, rooms } from '@/lib/db/schema'
import { normalizeRoomCode } from '@/lib/roomcode'
import { generateRoomCode } from '@/lib/roomcode-server'

export interface RoomSummary {
  code: string
  expectedMembers: number
  matchThreshold: number
  memberCount: number
  complete: boolean
}

export interface MemberSummary {
  id: string
  displayName: string
}

/** Nombre de tentatives avant d'abandonner sur une collision de code. */
const TENTATIVES_CODE = 5

export async function getRoom(db: any, code: string): Promise<RoomSummary | null> {
  const normalise = normalizeRoomCode(code)
  const result = (await db.execute(sql`
    SELECT r.code, r.expected_members, r.match_threshold,
           (SELECT count(*)::int FROM members m WHERE m.room_code = r.code) AS n
    FROM rooms r WHERE r.code = ${normalise}
  `)) as {
    rows: {
      code: string
      expected_members: number
      match_threshold: number
      n: number
    }[]
  }
  const ligne = result.rows[0]
  if (!ligne) return null
  return {
    code: ligne.code,
    expectedMembers: Number(ligne.expected_members),
    matchThreshold: Number(ligne.match_threshold),
    memberCount: Number(ligne.n),
    complete: Number(ligne.n) >= Number(ligne.expected_members),
  }
}

export async function createRoom(
  db: any,
  input: { displayName: string; expectedMembers: number; matchThreshold: number },
): Promise<{ room: RoomSummary; member: MemberSummary }> {
  let code = ''
  for (let i = 0; i < TENTATIVES_CODE; i++) {
    const candidat = generateRoomCode()
    const insere = await db
      .insert(rooms)
      .values({
        code: candidat,
        expectedMembers: input.expectedMembers,
        matchThreshold: input.matchThreshold,
      })
      .onConflictDoNothing()
      .returning()
    if (insere.length > 0) {
      code = candidat
      break
    }
  }
  if (!code) throw new Error('Impossible de générer un code de salon libre.')

  const [membre] = await db
    .insert(members)
    .values({ roomCode: code, displayName: input.displayName.trim() })
    .returning()
  await db.insert(memberFilters).values({ memberId: membre.id })

  const room = await getRoom(db, code)
  if (!room) throw new Error('Salon introuvable juste après sa création.')
  return { room, member: { id: membre.id, displayName: membre.displayName } }
}

export async function joinRoom(
  db: any,
  code: string,
  displayName: string,
): Promise<{ member: MemberSummary } | { error: 'introuvable' | 'complet' | 'prenom_pris' }> {
  const room = await getRoom(db, code)
  if (!room) return { error: 'introuvable' }
  if (room.memberCount >= room.expectedMembers) return { error: 'complet' }

  const insere = await db
    .insert(members)
    .values({ roomCode: room.code, displayName: displayName.trim() })
    .onConflictDoNothing()
    .returning()
  if (insere.length === 0) return { error: 'prenom_pris' }

  await db.insert(memberFilters).values({ memberId: insere[0].id }).onConflictDoNothing()
  return { member: { id: insere[0].id, displayName: insere[0].displayName } }
}

export async function listMembers(db: any, code: string): Promise<MemberSummary[]> {
  const lignes = await db
    .select({ id: members.id, displayName: members.displayName })
    .from(members)
    .where(eq(members.roomCode, normalizeRoomCode(code)))
    .orderBy(asc(members.createdAt))
  return lignes
}

export async function claimMember(
  db: any,
  code: string,
  memberId: string,
): Promise<MemberSummary | null> {
  const lignes = await db
    .select({ id: members.id, displayName: members.displayName })
    .from(members)
    .where(and(eq(members.roomCode, normalizeRoomCode(code)), eq(members.id, memberId)))
  return lignes[0] ?? null
}
