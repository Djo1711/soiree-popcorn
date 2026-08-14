import { describe, expect, it, vi } from 'vitest'
import { TmdbClient, TmdbHttpError } from '@/lib/tmdb'

function fakeResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers })
}

function client(
  fetchImpl: typeof fetch,
  sleepImpl: (ms: number) => Promise<void> = async () => {},
) {
  return new TmdbClient({ token: 'jeton-de-test', fetchImpl, sleepImpl })
}

describe('TmdbClient', () => {
  it('envoie le jeton et force le français', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ results: [] }))
    await client(fetchImpl as unknown as typeof fetch).listProviders()

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toContain('language=fr-FR')
    expect(url.toString()).toContain('watch_region=FR')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-de-test')
  })

  it('réessaie après un 429 puis réussit', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({}, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(fakeResponse({ results: [{ provider_id: 8, provider_name: 'Netflix' }] }))

    const providers = await client(fetchImpl as unknown as typeof fetch).listProviders()

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(providers).toEqual([{ provider_id: 8, provider_name: 'Netflix' }])
  })

  it('abandonne après six tentatives', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({}, 500))
    await expect(client(fetchImpl as unknown as typeof fetch).listProviders()).rejects.toThrow(
      /6 tentatives/,
    )
    expect(fetchImpl).toHaveBeenCalledTimes(6)
  })

  it('ne réessaie pas sur un 404', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({}, 404))
    await expect(client(fetchImpl as unknown as typeof fetch).movieDetail(1)).rejects.toThrow(/404/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('applique un repli exponentiel de 500 ms, 1 s puis 2 s', async () => {
    const delais: number[] = []
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({}, 500))
      .mockResolvedValueOnce(fakeResponse({}, 503))
      .mockResolvedValueOnce(fakeResponse({}, 502))
      .mockResolvedValueOnce(fakeResponse({ results: [] }))

    await client(fetchImpl as unknown as typeof fetch, async (ms) => {
      delais.push(ms)
    }).listProviders()

    // Trois points sont nécessaires : un repli linéaire donnerait [500, 1000, 1500]
    // et passerait un test qui s'arrête à deux valeurs.
    expect(delais).toEqual([500, 1000, 2000])
  })

  it('convertit retry-after de secondes en millisecondes', async () => {
    const delais: number[] = []
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({}, 429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(fakeResponse({ results: [] }))

    await client(fetchImpl as unknown as typeof fetch, async (ms) => {
      delais.push(ms)
    }).listProviders()

    expect(delais).toEqual([2000])
  })

  it('plafonne un retry-after aberrant à une minute', async () => {
    const delais: number[] = []
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse({}, 429, { 'retry-after': '999999999' }))
      .mockResolvedValueOnce(fakeResponse({ results: [] }))

    await client(fetchImpl as unknown as typeof fetch, async (ms) => {
      delais.push(ms)
    }).listProviders()

    expect(delais).toEqual([60_000])
  })

  it('réessaie après une coupure réseau au lieu d’abandonner l’ingestion', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(
        fakeResponse({ results: [{ provider_id: 8, provider_name: 'Netflix' }] }),
      )

    const providers = await client(fetchImpl as unknown as typeof fetch).listProviders()

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(providers).toEqual([{ provider_id: 8, provider_name: 'Netflix' }])
  })

  it('abandonne après six coupures réseau en levant une erreur nue et non un TmdbHttpError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('socket hang up')
    })

    const erreur = await client(fetchImpl as unknown as typeof fetch)
      .movieDetail(1)
      .catch((e: unknown) => e)

    expect(fetchImpl).toHaveBeenCalledTimes(6)
    expect(erreur).toBeInstanceOf(Error)
    // La distinction porte tout le comportement de reprise de `fetchDetails` :
    // un `TmdbHttpError` peut être définitif (404), une panne réseau ne l'est
    // jamais et la ligne doit rester à retenter.
    expect(erreur).not.toBeInstanceOf(TmdbHttpError)
    expect((erreur as Error).message).toMatch(/injoignable.*6 tentatives.*socket hang up/)
  })
})

describe('resolveProviderIds', () => {
  const listeTmdb = [
    { provider_id: 8, provider_name: 'Netflix' },
    { provider_id: 1796, provider_name: 'Netflix Standard with Ads' },
    { provider_id: 337, provider_name: 'Disney Plus' },
    { provider_id: 381, provider_name: 'Canal+' },
    { provider_id: 58, provider_name: 'Canal VOD' },
    { provider_id: 119, provider_name: 'Amazon Prime Video' },
  ]

  it('retient les bonnes plateformes et écarte Canal VOD', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse({ results: listeTmdb }))
    const resolved = await client(fetchImpl as unknown as typeof fetch).resolveProviderIds()

    expect(resolved).toEqual([
      { key: 'netflix', ids: [8, 1796] },
      { key: 'disney', ids: [337] },
      { key: 'canal', ids: [381] },
    ])
  })

  it('échoue bruyamment si une plateforme attendue a disparu', async () => {
    const sansDisney = listeTmdb.filter((p) => p.provider_id !== 337)
    const fetchImpl = vi.fn(async () => fakeResponse({ results: sansDisney }))
    await expect(
      client(fetchImpl as unknown as typeof fetch).resolveProviderIds(),
    ).rejects.toThrow(/disney/i)
  })
})
