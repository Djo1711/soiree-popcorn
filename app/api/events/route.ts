import { erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { matchesSince } from '@/lib/db/queries/matches'
import { getRoom, listMembers } from '@/lib/db/queries/rooms'

export async function GET(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session

  const since = Number(new URL(request.url).searchParams.get('since') ?? 0) || 0
  const db = getDb()
  const room = await getRoom(db, session.roomCode)
  if (!room) return erreur(404, 'Ce salon n’existe plus.')

  return ok({
    room,
    members: await listMembers(db, session.roomCode),
    matches: await matchesSince(db, session.roomCode, since),
  })
}
