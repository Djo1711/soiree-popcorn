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

/** Plafond partagé par `createRoom` et `joinRoom`, seul point de convergence des deux chemins. */
export const MAX_DISPLAY_NAME_LENGTH = 30

export class PrenomTropLongError extends Error {
  constructor() {
    super(`Le prénom ne doit pas dépasser ${MAX_DISPLAY_NAME_LENGTH} caractères.`)
    this.name = 'PrenomTropLongError'
  }
}

function validerPrenom(displayName: string): string {
  const nom = displayName.trim()
  if (nom.length > MAX_DISPLAY_NAME_LENGTH) throw new PrenomTropLongError()
  return nom
}

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
  const nom = validerPrenom(input.displayName)
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
    .values({ roomCode: code, displayName: nom })
    .returning()
  await db.insert(memberFilters).values({ memberId: membre.id })

  const room = await getRoom(db, code)
  if (!room) throw new Error('Salon introuvable juste après sa création.')
  return { room, member: { id: membre.id, displayName: membre.displayName } }
}

/**
 * Adhésion **réellement atomique** : la ligne `rooms` du salon est verrouillée
 * (`SELECT ... FOR UPDATE` dans un CTE) avant que l'insertion ne soit
 * conditionnée sur la place restante, même patron que `recordSwipe` et
 * `hitRateLimit`. Une seule instruction SQL ne suffit pas à elle seule : en
 * isolation READ COMMITTED (le mode par défaut de Postgres, utilisé via le
 * pool Neon), deux transactions concurrentes sur deux connexions distinctes
 * prennent chacune leur propre snapshot MVCC, et un simple `count(*) <
 * expected_members` dans le WHERE peut passer deux fois pour la même
 * dernière place puisque chaque transaction ne voit pas l'insertion pas
 * encore commitée de l'autre. Le `FOR UPDATE` force la seconde transaction à
 * attendre le commit de la première avant d'acquérir à son tour le verrou sur
 * la ligne du salon ; une fois le verrou obtenu, le `count(*)` est réévalué à
 * cet instant précis et voit donc les insertions déjà commitées. Les deux
 * transactions sont ainsi sérialisées sur ce salon précis — deux salons
 * différents ne se bloquent jamais entre eux, seul le même code de salon crée
 * de la contention. Sans cette sérialisation, deux adhésions simultanées sur
 * la dernière place pourraient toutes les deux réussir, dépassant
 * `expected_members` — et comme rien ne réduit jamais l'effectif d'un salon,
 * `recordSwipe` (qui exige une égalité stricte avec `expected_members`) ne
 * créerait alors plus jamais aucun match.
 *
 * Quand l'INSERT ne renvoie rien, une seconde lecture distingue *a posteriori*
 * un salon complet d'un prénom déjà pris : cette lecture n'a plus besoin
 * d'être atomique avec l'écriture, elle ne sert qu'à choisir le bon message.
 */
export async function joinRoom(
  db: any,
  code: string,
  displayName: string,
): Promise<{ member: MemberSummary } | { error: 'introuvable' | 'complet' | 'prenom_pris' }> {
  const nom = validerPrenom(displayName)
  const normalise = normalizeRoomCode(code)

  const insere = (await db.execute(sql`
    WITH salon AS (
      SELECT expected_members
      FROM rooms
      WHERE code = ${normalise}
      FOR UPDATE
    )
    INSERT INTO members (room_code, display_name)
    SELECT ${normalise}, ${nom}
    FROM salon
    WHERE (SELECT count(*) FROM members WHERE room_code = ${normalise}) < salon.expected_members
    ON CONFLICT (room_code, display_name) DO NOTHING
    RETURNING id, display_name
  `)) as { rows: { id: string; display_name: string }[] }

  const ligne = insere.rows[0]
  if (!ligne) {
    const room = await getRoom(db, normalise)
    if (!room) return { error: 'introuvable' }
    if (room.complete) return { error: 'complet' }
    return { error: 'prenom_pris' }
  }

  await db.insert(memberFilters).values({ memberId: ligne.id }).onConflictDoNothing()
  return { member: { id: ligne.id, displayName: ligne.display_name } }
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
