import { avecErreurs, erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { setMatchStatus } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

const STATUTS: MatchStatus[] = ['a_voir', 'vu', 'abandonne']

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ movieId: string }> },
): Promise<Response> {
  return avecErreurs(async () => {
    const session = exigerMembre(request)
    if (session instanceof Response) return session

    const { movieId } = await params
    const id = Number(movieId)
    if (!Number.isInteger(id)) return erreur(400, 'Identifiant de film invalide.')

    let corps: unknown
    try {
      corps = await request.json()
    } catch {
      return erreur(400, 'Requête illisible.')
    }
    const { status } = corps as Record<string, unknown>
    if (typeof status !== 'string' || !STATUTS.includes(status as MatchStatus)) {
      return erreur(400, 'Statut inconnu. Attendu : à voir, vu ou abandonné.')
    }

    const modifie = await setMatchStatus(getDb(), session.roomCode, id, status as MatchStatus)
    if (!modifie) return erreur(404, 'Ce film ne fait pas partie de vos matchs.')
    return ok({ movieId: id, status })
  })
}
