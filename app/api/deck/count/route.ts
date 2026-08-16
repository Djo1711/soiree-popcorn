import { ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import { countDeck, type DeckFilters } from '@/lib/db/queries/deck'
import { FILTRES_PAR_DEFAUT, getFilters } from '@/lib/db/queries/filters'

/** Lit des filtres depuis l'URL pour l'aperçu en direct de la feuille de filtres. */
function depuisUrl(url: URL, defaut: DeckFilters): DeckFilters {
  const p = url.searchParams
  if ([...p.keys()].length === 0) return defaut
  const nombre = (cle: string) => (p.get(cle) === null ? null : Number(p.get(cle)))
  return {
    genres: p.get('genres') ? p.get('genres')!.split(',').filter(Boolean) : [],
    yearFrom: nombre('yearFrom'),
    yearTo: nombre('yearTo'),
    minRating: Number(p.get('minRating') ?? 0),
    maxRuntime: nombre('maxRuntime'),
    providers: p.get('providers') ? p.get('providers')!.split(',').filter(Boolean) : [],
    includeTop200: p.get('includeTop200') !== 'false',
  }
}

export async function GET(request: Request): Promise<Response> {
  const session = exigerMembre(request)
  if (session instanceof Response) return session
  const db = getDb()
  const enregistres = await getFilters(db, session.memberId)
  const filtres = depuisUrl(new URL(request.url), enregistres ?? FILTRES_PAR_DEFAUT)
  return ok({ count: await countDeck(db, session.memberId, filtres) })
}
