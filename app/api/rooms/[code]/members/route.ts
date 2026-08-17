import { avecErreurs, erreur, ok } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { hitRateLimit } from '@/lib/rate-limit'
import { getRoom, listMembers } from '@/lib/db/queries/rooms'
import { isValidRoomCode } from '@/lib/roomcode'

/**
 * Même clé (`join:${ip}`) et même budget que `POST /api/rooms/[code]/join` :
 * cette route GET permettrait sinon de tester des codes de salon sans jamais
 * passer par `join`, contournant la seule protection sur laquelle repose le
 * modèle de menace du code à 6 caractères.
 */
const TENTATIVES_PAR_MINUTE = 10

export async function GET(
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

    const salon = await getRoom(db, code)
    if (!salon) return erreur(404, 'Aucun salon ne porte ce code.')
    return ok({ room: salon, members: await listMembers(db, code) })
  })
}
