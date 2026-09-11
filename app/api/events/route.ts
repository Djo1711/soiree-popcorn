import { avecErreurs, erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { matchesSince } from '@/lib/db/queries/matches'
import { getRoom, listMembers } from '@/lib/db/queries/rooms'

export async function GET(request: Request): Promise<Response> {
  return avecErreurs(async () => {
    const session = exigerMembre(request)
    if (session instanceof Response) return session

    const since = Number(new URL(request.url).searchParams.get('since') ?? 0) || 0
    const db = getDb()
    const room = await getRoom(db, session.roomCode)
    if (!room) return erreur(404, 'Ce salon n’existe plus.')

    const members = await listMembers(db, session.roomCode)

    return ok({
      room,
      members,
      matches: await matchesSince(db, session.roomCode, since),
      // §7.6 : les réglages affichent le prénom du membre courant. Le
      // cookie ne porte que son identifiant, jamais son prénom — le
      // client n'a aucun autre moyen de savoir lequel des membres c'est lui.
      moi: members.find((m) => m.id === session.memberId) ?? null,
    })
  })
}
