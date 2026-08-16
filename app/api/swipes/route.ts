import { avecErreurs, erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { movieExists } from '@/lib/db/queries/deck'
import { recordSwipe } from '@/lib/db/queries/swipes'

export async function POST(request: Request): Promise<Response> {
  return avecErreurs(async () => {
    const session = exigerMembre(request)
    if (session instanceof Response) return session

    let corps: unknown
    try {
      corps = await request.json()
    } catch {
      return erreur(400, 'Requête illisible.')
    }
    const { movieId, liked } = corps as Record<string, unknown>
    if (typeof movieId !== 'number' || !Number.isInteger(movieId)) {
      return erreur(400, 'Identifiant de film manquant.')
    }
    if (typeof liked !== 'boolean') return erreur(400, 'Sens du balayage manquant.')

    const db = getDb()
    if (!(await movieExists(db, movieId))) return erreur(404, 'Ce film n’est pas au catalogue.')

    return ok(await recordSwipe(db, session.roomCode, session.memberId, movieId, liked))
  })
}
