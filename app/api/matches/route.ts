import { avecErreurs, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { listMatches } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

const STATUTS: MatchStatus[] = ['a_voir', 'vu', 'abandonne']

export async function GET(request: Request): Promise<Response> {
  return avecErreurs(async () => {
    const session = exigerMembre(request)
    if (session instanceof Response) return session
    const brut = new URL(request.url).searchParams.get('status')
    const statut = STATUTS.includes(brut as MatchStatus) ? (brut as MatchStatus) : undefined
    return ok({ matches: await listMatches(getDb(), session.roomCode, statut) })
  })
}
