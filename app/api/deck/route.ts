import { avecErreurs, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { fetchDeck } from '@/lib/db/queries/deck'
import { getFilters } from '@/lib/db/queries/filters'

const LIMITE_PAR_DEFAUT = 20
const LIMITE_MAX = 50

export async function GET(request: Request): Promise<Response> {
  return avecErreurs(async () => {
    const session = exigerMembre(request)
    if (session instanceof Response) return session

    const brut = new URL(request.url).searchParams.get('limit')
    const limite = Math.min(LIMITE_MAX, Math.max(1, Number(brut) || LIMITE_PAR_DEFAUT))

    const db = getDb()
    const filtres = await getFilters(db, session.memberId)
    const cards = await fetchDeck(db, session.roomCode, session.memberId, filtres, limite)
    if (cards.length === 0) return ok({ cards, message: 'Plus aucun film ne correspond à vos filtres.' })
    return ok({ cards })
  })
}
