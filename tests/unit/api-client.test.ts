import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiClientError,
  annulerDernierBalayage,
  balayer,
  creerSalon,
  ecrireFiltres,
  evenements,
  rejoindreSalon,
  tirerAuSort,
} from '@/lib/api-client'

const original = globalThis.fetch

function repondre(corps: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(corps), { status }))
}

beforeEach(() => {
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  globalThis.fetch = original
})

describe('creerSalon', () => {
  it('poste au bon endpoint avec le bon corps', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(
      repondre({ room: { code: 'ABCDEF' }, member: { id: '1', displayName: 'Djo' } }),
    )
    await creerSalon({ displayName: 'Djo', expectedMembers: 2, matchThreshold: 2 })
    expect(fetchSimule).toHaveBeenCalledWith(
      '/api/rooms',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Djo', expectedMembers: 2, matchThreshold: 2 }),
      }),
    )
  })

  it('lève une ApiClientError avec le message français du serveur en cas d’échec', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ erreur: 'Indiquez un prénom.' }, 400))
    await expect(
      creerSalon({ displayName: '', expectedMembers: 2, matchThreshold: 2 }),
    ).rejects.toMatchObject({ message: 'Indiquez un prénom.', status: 400 })
  })
})

describe('rejoindreSalon', () => {
  it('encode le code dans l’URL', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ room: {}, member: {} }))
    await rejoindreSalon('AB CD EF', 'Alice')
    expect(fetchSimule).toHaveBeenCalledWith(
      '/api/rooms/AB%20CD%20EF/join',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('balayer', () => {
  it('poste movieId et liked, rend le match ou null', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ match: { movieId: 42, matchId: 7 } }))
    const resultat = await balayer(42, true)
    expect(resultat).toEqual({ match: { movieId: 42, matchId: 7 } })
    expect(fetchSimule).toHaveBeenCalledWith(
      '/api/swipes',
      expect.objectContaining({ body: JSON.stringify({ movieId: 42, liked: true }) }),
    )
  })
})

describe('annulerDernierBalayage', () => {
  it('utilise DELETE sans corps', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ movieId: 5 }))
    const resultat = await annulerDernierBalayage()
    expect(resultat).toEqual({ movieId: 5 })
    expect(fetchSimule).toHaveBeenCalledWith('/api/swipes/last', expect.objectContaining({ method: 'DELETE' }))
  })
})

describe('evenements', () => {
  it('passe since en paramètre de requête', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ room: {}, members: [], matches: [] }))
    await evenements(12)
    expect(fetchSimule).toHaveBeenCalledWith('/api/events?since=12', expect.anything())
  })
})

describe('tirerAuSort', () => {
  it('rend null sur 404 plutôt que de lever', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ erreur: 'Aucun film à voir.' }, 404))
    expect(await tirerAuSort()).toBeNull()
  })

  it('propage une autre erreur que 404', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    fetchSimule.mockReturnValue(repondre({ erreur: 'Rejoignez un salon avant de continuer.' }, 401))
    await expect(tirerAuSort()).rejects.toBeInstanceOf(ApiClientError)
  })
})

describe('ecrireFiltres', () => {
  it('utilise PUT avec les filtres en corps', async () => {
    const fetchSimule = globalThis.fetch as ReturnType<typeof vi.fn>
    const filtres = {
      genres: [],
      yearFrom: null,
      yearTo: null,
      minRating: 0,
      maxRuntime: null,
      providers: [],
      includeTop200: true,
    }
    fetchSimule.mockReturnValue(repondre({ filters: filtres }))
    const resultat = await ecrireFiltres(filtres)
    expect(resultat).toEqual(filtres)
    expect(fetchSimule).toHaveBeenCalledWith(
      '/api/filters',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(filtres) }),
    )
  })
})
