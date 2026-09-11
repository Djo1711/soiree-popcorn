import type { MemberSummary, RoomSummary } from '@/lib/db/queries/rooms'
import type { DeckCard, DeckFilters } from '@/lib/db/queries/deck'
import type { MatchRow } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

export class ApiClientError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function appeler<T>(url: string, init?: RequestInit): Promise<T> {
  const reponse = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
  })
  const corps = await reponse.json()
  if (!reponse.ok) throw new ApiClientError(reponse.status, corps.erreur ?? 'Erreur inconnue.')
  return corps as T
}

const enJson = (valeur: unknown) => JSON.stringify(valeur)

export function creerSalon(input: {
  displayName: string
  expectedMembers: number
  matchThreshold: number
}): Promise<{ room: RoomSummary; member: MemberSummary }> {
  return appeler('/api/rooms', { method: 'POST', body: enJson(input) })
}

export function rejoindreSalon(
  code: string,
  displayName: string,
): Promise<{ room: RoomSummary; member: MemberSummary }> {
  return appeler(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: 'POST',
    body: enJson({ displayName }),
  })
}

export function membresDuSalon(
  code: string,
): Promise<{ room: RoomSummary; members: MemberSummary[] }> {
  return appeler(`/api/rooms/${encodeURIComponent(code)}/members`)
}

export function reprendreIdentite(
  code: string,
  memberId: string,
): Promise<{ member: MemberSummary }> {
  return appeler(`/api/rooms/${encodeURIComponent(code)}/claim`, {
    method: 'POST',
    body: enJson({ memberId }),
  })
}

export function paquet(limit = 20): Promise<{ cards: DeckCard[]; message?: string }> {
  return appeler(`/api/deck?limit=${limit}`)
}

export function compterPaquet(filtres: DeckFilters): Promise<{ count: number }> {
  const p = new URLSearchParams()
  if (filtres.genres.length) p.set('genres', filtres.genres.join(','))
  if (filtres.yearFrom !== null) p.set('yearFrom', String(filtres.yearFrom))
  if (filtres.yearTo !== null) p.set('yearTo', String(filtres.yearTo))
  if (filtres.minRating > 0) p.set('minRating', String(filtres.minRating))
  if (filtres.maxRuntime !== null) p.set('maxRuntime', String(filtres.maxRuntime))
  if (filtres.providers.length) p.set('providers', filtres.providers.join(','))
  p.set('includeTop200', String(filtres.includeTop200))
  return appeler(`/api/deck/count?${p.toString()}`)
}

export function balayer(
  movieId: number,
  liked: boolean,
): Promise<{ match: { movieId: number; matchId: number } | null }> {
  return appeler('/api/swipes', { method: 'POST', body: enJson({ movieId, liked }) })
}

export function annulerDernierBalayage(): Promise<{ movieId: number }> {
  return appeler('/api/swipes/last', { method: 'DELETE' })
}

export function evenements(
  since: number,
): Promise<{ room: RoomSummary; members: MemberSummary[]; matches: MatchRow[] }> {
  return appeler(`/api/events?since=${since}`)
}

export function listerMatchs(status?: MatchStatus): Promise<{ matches: MatchRow[] }> {
  return appeler(status ? `/api/matches?status=${status}` : '/api/matches')
}

export function changerStatutMatch(
  movieId: number,
  status: MatchStatus,
): Promise<{ movieId: number; status: MatchStatus }> {
  return appeler(`/api/matches/${movieId}`, { method: 'PATCH', body: enJson({ status }) })
}

export async function tirerAuSort(): Promise<MatchRow | null> {
  try {
    const { match } = await appeler<{ match: MatchRow }>('/api/matches/random')
    return match
  } catch (e) {
    if (e instanceof ApiClientError && e.status === 404) return null
    throw e
  }
}

export async function lireFiltres(): Promise<DeckFilters> {
  const { filters } = await appeler<{ filters: DeckFilters }>('/api/filters')
  return filters
}

export async function ecrireFiltres(filtres: DeckFilters): Promise<DeckFilters> {
  const { filters } = await appeler<{ filters: DeckFilters }>('/api/filters', {
    method: 'PUT',
    body: enJson(filtres),
  })
  return filters
}

export async function quitterSalon(): Promise<void> {
  await appeler('/api/session/leave', { method: 'POST' })
}
