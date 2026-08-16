import { avecErreurs, erreur, ok, poserSession } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { claimMember } from '@/lib/db/queries/rooms'
import { isValidRoomCode, normalizeRoomCode } from '@/lib/roomcode'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  return avecErreurs(async () => {
    const { code } = await params
    if (!isValidRoomCode(code)) return erreur(400, 'Ce code de salon n’est pas valide.')

    let corps: unknown
    try {
      corps = await request.json()
    } catch {
      return erreur(400, 'Requête illisible.')
    }
    const { memberId } = corps as Record<string, unknown>
    if (typeof memberId !== 'string') return erreur(400, 'Identifiant de membre manquant.')

    const membre = await claimMember(getDb(), code, memberId)
    if (!membre) return erreur(404, 'Cette personne n’est pas dans ce salon.')

    return poserSession(ok({ member: membre }), {
      memberId: membre.id,
      roomCode: normalizeRoomCode(code),
    })
  })
}
