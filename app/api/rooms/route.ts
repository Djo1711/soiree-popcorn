import { MAX_MEMBERS, MIN_MEMBERS } from '@/lib/match'
import { erreur, ok, poserSession } from '@/lib/api/respond'
import { getDb } from '@/lib/db/client'
import { createRoom } from '@/lib/db/queries/rooms'

export async function POST(request: Request): Promise<Response> {
  let corps: unknown
  try {
    corps = await request.json()
  } catch {
    return erreur(400, 'Requête illisible.')
  }

  const { displayName, expectedMembers, matchThreshold } = corps as Record<string, unknown>

  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return erreur(400, 'Indiquez un prénom.')
  }
  if (displayName.trim().length > 30) {
    return erreur(400, 'Le prénom ne doit pas dépasser 30 caractères.')
  }
  if (
    typeof expectedMembers !== 'number' ||
    !Number.isInteger(expectedMembers) ||
    expectedMembers < MIN_MEMBERS ||
    expectedMembers > MAX_MEMBERS
  ) {
    return erreur(400, `Le nombre de participants doit être entre ${MIN_MEMBERS} et ${MAX_MEMBERS}.`)
  }
  if (
    typeof matchThreshold !== 'number' ||
    !Number.isInteger(matchThreshold) ||
    matchThreshold < MIN_MEMBERS ||
    matchThreshold > expectedMembers
  ) {
    return erreur(400, `Le seuil doit être entre ${MIN_MEMBERS} et le nombre de participants.`)
  }

  const { room, member } = await createRoom(getDb(), {
    displayName: displayName.trim(),
    expectedMembers,
    matchThreshold,
  })
  return poserSession(ok({ room, member }), { memberId: member.id, roomCode: room.code })
}
