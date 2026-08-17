import { avecErreurs, erreur, ok } from '@/lib/api/respond'
import { exigerMembre } from '@/lib/api/guard'
import { getDb } from '@/lib/db/client'
import type { DeckFilters } from '@/lib/db/queries/deck'
import { getFilters, setFilters } from '@/lib/db/queries/filters'

export async function GET(request: Request): Promise<Response> {
  return avecErreurs(async () => {
    const session = exigerMembre(request)
    if (session instanceof Response) return session
    return ok({ filters: await getFilters(getDb(), session.memberId) })
  })
}

export async function PUT(request: Request): Promise<Response> {
  return avecErreurs(async () => {
    const session = exigerMembre(request)
    if (session instanceof Response) return session

    let corps: unknown
    try {
      corps = await request.json()
    } catch {
      return erreur(400, 'Requête illisible.')
    }
    const f = corps as Partial<DeckFilters>

    if (!Array.isArray(f.genres) || !Array.isArray(f.providers)) {
      return erreur(400, 'Genres et plateformes doivent être des listes.')
    }
    if (typeof f.minRating !== 'number' || f.minRating < 0 || f.minRating > 10) {
      return erreur(400, 'La note minimale doit être comprise entre 0 et 10.')
    }
    if (f.yearFrom != null && f.yearTo != null && f.yearFrom > f.yearTo) {
      return erreur(400, 'La première année doit précéder la seconde.')
    }
    if (f.maxRuntime != null && (typeof f.maxRuntime !== 'number' || f.maxRuntime <= 0)) {
      return erreur(400, 'La durée maximale doit être positive.')
    }

    const filtres: DeckFilters = {
      genres: f.genres.map(String),
      yearFrom: f.yearFrom ?? null,
      yearTo: f.yearTo ?? null,
      minRating: f.minRating,
      maxRuntime: f.maxRuntime ?? null,
      providers: f.providers.map(String),
      includeTop200: f.includeTop200 !== false,
    }
    await setFilters(getDb(), session.memberId, filtres)
    return ok({ filters: filtres })
  })
}
