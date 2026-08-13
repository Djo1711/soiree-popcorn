import type { ProviderKey } from '@/lib/db/schema'

const BASE_URL = 'https://api.themoviedb.org/3'
const MAX_ATTEMPTS = 6

export interface TmdbProvider {
  provider_id: number
  provider_name: string
}

export interface TmdbPage<T> {
  page: number
  results: T[]
  total_pages: number
  total_results: number
}

export interface TmdbMovieSummary {
  id: number
  title: string
}

export interface TmdbMovieDetail {
  id: number
  title: string
  original_title: string | null
  overview: string | null
  poster_path: string | null
  backdrop_path: string | null
  release_date: string | null
  runtime: number | null
  vote_average: number | null
  vote_count: number | null
  popularity: number | null
  genres: { id: number; name: string }[]
  keywords?: { keywords: { id: number; name: string }[] }
  credits?: { crew: { job: string; name: string }[] }
  'watch/providers'?: {
    results?: { FR?: { flatrate?: TmdbProvider[] } }
  }
}

/**
 * Les identifiants ne sont jamais codés en dur : TMDB les renomme et les
 * renumérote. « Canal VOD » ne commence pas par « Canal+ » et se trouve donc
 * naturellement écarté, en plus du filtre `flatrate`.
 */
export const PROVIDER_MATCHERS: { key: ProviderKey; test: (name: string) => boolean }[] = [
  { key: 'netflix', test: (n) => /^netflix/i.test(n) },
  { key: 'disney', test: (n) => /^disney plus$/i.test(n) },
  { key: 'canal', test: (n) => /^canal\+/i.test(n) },
]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface TmdbClientOptions {
  token?: string
  fetchImpl?: typeof fetch
  sleepImpl?: (ms: number) => Promise<void>
}

export class TmdbClient {
  private token: string
  private fetchImpl: typeof fetch
  private sleepImpl: (ms: number) => Promise<void>

  constructor(options: TmdbClientOptions = {}) {
    const token = options.token ?? process.env.TMDB_READ_TOKEN
    if (!token) throw new Error('TMDB_READ_TOKEN est absent de l’environnement.')
    this.token = token
    this.fetchImpl = options.fetchImpl ?? fetch
    this.sleepImpl = options.sleepImpl ?? sleep
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(BASE_URL + path)
    url.searchParams.set('language', 'fr-FR')
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.token}`, accept: 'application/json' },
      })

      if (response.ok) return (await response.json()) as T

      const recuperable = response.status === 429 || response.status >= 500
      if (!recuperable) throw new Error(`TMDB a répondu ${response.status} sur ${path}`)
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`TMDB a répondu ${response.status} sur ${path} après 6 tentatives`)
      }

      const retryAfter = Number(response.headers.get('retry-after'))
      const attente = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2 ** (attempt - 1) * 500
      await this.sleepImpl(attente)
    }

    throw new Error('inatteignable')
  }

  async listProviders(): Promise<TmdbProvider[]> {
    const page = await this.get<{ results: TmdbProvider[] }>('/watch/providers/movie', {
      watch_region: 'FR',
    })
    return page.results
  }

  async resolveProviderIds(): Promise<{ key: ProviderKey; ids: number[] }[]> {
    const providers = await this.listProviders()
    return PROVIDER_MATCHERS.map(({ key, test }) => {
      const ids = providers.filter((p) => test(p.provider_name)).map((p) => p.provider_id)
      if (ids.length === 0) {
        throw new Error(
          `Aucun fournisseur TMDB ne correspond à « ${key} » en France. ` +
            'Le nom a probablement changé : mettre à jour PROVIDER_MATCHERS.',
        )
      }
      return { key, ids }
    })
  }

  discover(providerId: number, page: number): Promise<TmdbPage<TmdbMovieSummary>> {
    return this.get<TmdbPage<TmdbMovieSummary>>('/discover/movie', {
      watch_region: 'FR',
      with_watch_providers: providerId,
      with_watch_monetization_types: 'flatrate',
      sort_by: 'popularity.desc',
      page,
    })
  }

  topRated(page: number): Promise<TmdbPage<TmdbMovieSummary>> {
    return this.get<TmdbPage<TmdbMovieSummary>>('/movie/top_rated', { page })
  }

  movieDetail(id: number): Promise<TmdbMovieDetail> {
    return this.get<TmdbMovieDetail>(`/movie/${id}`, {
      append_to_response: 'keywords,credits,watch/providers',
    })
  }
}
