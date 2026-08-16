import { avecErreurs, erreur, ok, poserSession } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { hitRateLimit } from '@/lib/rate-limit'
import { getRoom, joinRoom, PrenomTropLongError } from '@/lib/db/queries/rooms'
import { isValidRoomCode, normalizeRoomCode } from '@/lib/roomcode'

const TENTATIVES_PAR_MINUTE = 10

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  return avecErreurs(async () => {
    const { code } = await params
    if (!isValidRoomCode(code)) return erreur(400, 'Ce code de salon n’est pas valide.')

    const db = getDb()
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'inconnue'
    const limite = await hitRateLimit(db, `join:${ip}`, TENTATIVES_PAR_MINUTE, 60)
    if (!limite.allowed) return erreur(429, 'Trop de tentatives. Réessayez dans une minute.')

    let corps: unknown
    try {
      corps = await request.json()
    } catch {
      return erreur(400, 'Requête illisible.')
    }
    const { displayName } = corps as Record<string, unknown>
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      return erreur(400, 'Indiquez un prénom.')
    }

    let resultat: Awaited<ReturnType<typeof joinRoom>>
    try {
      resultat = await joinRoom(db, code, displayName.trim())
    } catch (e) {
      if (e instanceof PrenomTropLongError) return erreur(400, e.message)
      throw e
    }
    if ('error' in resultat) {
      if (resultat.error === 'introuvable') return erreur(404, 'Aucun salon ne porte ce code.')
      if (resultat.error === 'complet') {
        const salon = await getRoom(db, code)
        return erreur(
          409,
          `Ce salon est complet : ${salon?.expectedMembers ?? 0} participants étaient annoncés.`,
        )
      }
      return erreur(409, 'Ce prénom est déjà pris dans ce salon.')
    }

    const salon = await getRoom(db, code)
    return poserSession(ok({ room: salon, member: resultat.member }), {
      memberId: resultat.member.id,
      roomCode: normalizeRoomCode(code),
    })
  })
}
