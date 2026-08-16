import { erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { undoLastSwipe } from '@/lib/db/queries/swipes'

export async function DELETE(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session

  const resultat = await undoLastSwipe(getDb(), session.memberId)
  if ('error' in resultat) {
    if (resultat.error === 'aucun') return erreur(404, 'Il n’y a rien à annuler.')
    return erreur(409, 'Ce film a déjà fait un match, il est trop tard pour revenir en arrière.')
  }
  return ok(resultat)
}
