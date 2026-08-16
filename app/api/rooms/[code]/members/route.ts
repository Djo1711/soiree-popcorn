import { erreur, ok } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { getRoom, listMembers } from '@/lib/db/queries/rooms'
import { isValidRoomCode } from '@/lib/roomcode'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  if (!isValidRoomCode(code)) return erreur(400, 'Ce code de salon n’est pas valide.')
  const db = getDb()
  const salon = await getRoom(db, code)
  if (!salon) return erreur(404, 'Aucun salon ne porte ce code.')
  return ok({ room: salon, members: await listMembers(db, code) })
}
