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
 * Adhésion sérialisée par un verrou de ligne, en **deux instructions** dans une
 * transaction explicite. C'est la seule des fonctions d'écriture du projet qui
 * ne tient pas en une instruction, et la raison tient entièrement aux règles de
 * snapshot de l'isolation READ COMMITTED (le mode par défaut de Postgres,
 * utilisé via le pool Neon comme via PGlite).
 *
 * L'enjeu : deux adhésions simultanées sur la dernière place ne doivent pas
 * réussir toutes les deux. Comme rien ne réduit jamais l'effectif d'un salon,
 * un dépassement de `expected_members` est définitif, et `recordSwipe` (qui
 * exige une égalité stricte avec `expected_members`) ne créerait alors plus
 * jamais aucun match dans ce salon.
 *
 * Pourquoi une seule instruction ne suffit pas, même avec `FOR UPDATE` : en
 * READ COMMITTED, chaque *instruction* prend son snapshot au moment où elle
 * commence, et ce snapshot gouverne toutes ses lectures. Verrouiller la ligne
 * `rooms` dans un CTE fait bien attendre la seconde transaction, mais quand
 * elle repart, elle continue d'évaluer `count(*) FROM members` sur le snapshot
 * pris *avant* le commit de la première : elle ne voit donc pas le membre que
 * l'autre vient d'insérer. La documentation Postgres est explicite là-dessus —
 * une commande qui écrit « peut voir les effets des commandes concurrentes sur
 * les lignes qu'elle cherche à modifier, mais pas leurs effets sur les autres
 * lignes de la base ». Le rafraîchissement ne concerne que la ligne verrouillée
 * elle-même (ici `rooms`), jamais une sous-requête sur une autre table (ici
 * `members`). Le verrou n'ajoutait donc que de la latence.
 *
 * Ce que fait la version ci-dessous : le `SELECT ... FOR UPDATE` est une
 * instruction à part entière, et l'INSERT qui suit en est une seconde — donc
 * avec un **snapshot neuf**, pris une fois le verrou déjà acquis. Ce snapshot
 * voit tout ce qui a été commité par la transaction précédemment détentrice du
 * verrou, y compris son insertion dans `members`. Le `count(*)` est alors juste,
 * et il ne peut plus bouger tant que le verrou est tenu puisque toute autre
 * adhésion sur ce salon doit passer par ce même verrou. Deux salons différents
 * ne se bloquent jamais entre eux : seul un même code de salon crée de la
 * contention.
 *
 * L'invariant reste porté par la table `members` seule, sans compteur
 * dénormalisé sur `rooms` : un compteur incrémenté avant l'INSERT devrait être
 * décrémenté quand le prénom se révèle déjà pris, et toute décrémentation
 * manquée condamnerait le salon à ne plus jamais se remplir.
 *
 * Quand l'INSERT ne renvoie rien, une dernière lecture — toujours sous le
 * verrou, donc exacte — distingue un salon complet d'un prénom déjà pris.
 */
export async function joinRoom(
  db: any,
  code: string,
  displayName: string,
): Promise<{ member: MemberSummary } | { error: 'introuvable' | 'complet' | 'prenom_pris' }> {
  const nom = validerPrenom(displayName)
  const normalise = normalizeRoomCode(code)

  const issue: { member: MemberSummary } | { error: 'introuvable' | 'complet' | 'prenom_pris' } =
    await db.transaction(async (tx: any) => {
      // Instruction 1 : prise du verrou. Attend le commit de toute autre
      // adhésion en cours sur ce salon.
      const salon = (await tx.execute(sql`
        SELECT expected_members FROM rooms WHERE code = ${normalise} FOR UPDATE
      `)) as { rows: { expected_members: number }[] }
      const ligneSalon = salon.rows[0]
      if (!ligneSalon) return { error: 'introuvable' as const }

      // Instruction 2 : snapshot neuf, pris après l'acquisition du verrou — le
      // `count(*)` inclut donc les adhésions commitées pendant l'attente.
      const insere = (await tx.execute(sql`
        INSERT INTO members (room_code, display_name)
        SELECT ${normalise}, ${nom}
        WHERE (SELECT count(*) FROM members WHERE room_code = ${normalise})
              < ${Number(ligneSalon.expected_members)}::int
        ON CONFLICT (room_code, display_name) DO NOTHING
        RETURNING id, display_name
      `)) as { rows: { id: string; display_name: string }[] }

      const ligne = insere.rows[0]
      if (ligne) return { member: { id: ligne.id, displayName: ligne.display_name } }

      // Rien d'inséré : soit la place manquait, soit le prénom était pris.
      const pris = (await tx.execute(sql`
        SELECT 1 FROM members WHERE room_code = ${normalise} AND display_name = ${nom}
      `)) as { rows: unknown[] }
      return { error: pris.rows[0] ? ('prenom_pris' as const) : ('complet' as const) }
    })

  if ('error' in issue) return issue

  await db.insert(memberFilters).values({ memberId: issue.member.id }).onConflictDoNothing()
  return issue
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
