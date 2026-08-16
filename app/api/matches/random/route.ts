import { erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { randomMatch } from '@/lib/db/queries/matches'

export async function GET(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session
  const tire = await randomMatch(getDb(), session.roomCode)
  if (!tire) return erreur(404, 'Aucun film à voir dans vos matchs pour l’instant.')
  return ok({ match: tire })
}
