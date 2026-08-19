'use client'

import { useEffect, useState } from 'react'
import { compterPaquet, ecrireFiltres, lireFiltres } from '@/lib/api-client'
import type { DeckFilters } from '@/lib/db/queries/deck'
import type { ProviderKey } from '@/lib/db/schema'

const GENRES = [
  'Action', 'Animation', 'Aventure', 'Comédie', 'Crime', 'Documentaire', 'Drame',
  'Familial', 'Fantastique', 'Guerre', 'Histoire', 'Horreur', 'Musique',
  'Mystère', 'Romance', 'Science-Fiction', 'Thriller', 'Western',
]

const PLATEFORMES: { cle: ProviderKey; nom: string }[] = [
  { cle: 'netflix', nom: 'Netflix' },
  { cle: 'canal', nom: 'MyCanal' },
  { cle: 'disney', nom: 'Disney+' },
]

const FILTRES_VIDES: DeckFilters = {
  genres: [],
  yearFrom: null,
  yearTo: null,
  minRating: 0,
  maxRuntime: null,
  providers: [],
  includeTop200: true,
}

export function FilterSheet({
  ouverte,
  onFermer,
  onAppliquer,
}: {
  ouverte: boolean
  onFermer: () => void
  onAppliquer: () => void
}) {
  const [filtres, setFiltres] = useState<DeckFilters>(FILTRES_VIDES)
  const [compte, setCompte] = useState<number | null>(null)

  useEffect(() => {
    if (ouverte) lireFiltres().then(setFiltres)
  }, [ouverte])

  useEffect(() => {
    if (!ouverte) return
    const identifiant = setTimeout(() => {
      compterPaquet(filtres).then(({ count }) => setCompte(count))
    }, 200)
    return () => clearTimeout(identifiant)
  }, [filtres, ouverte])

  if (!ouverte) return null

  function basculerGenre(genre: string) {
    setFiltres((f) => ({
      ...f,
      genres: f.genres.includes(genre) ? f.genres.filter((g) => g !== genre) : [...f.genres, genre],
    }))
  }

  function basculerPlateforme(cle: ProviderKey) {
    setFiltres((f) => ({
      ...f,
      providers: f.providers.includes(cle) ? f.providers.filter((p) => p !== cle) : [...f.providers, cle],
    }))
  }

  async function appliquer() {
    await ecrireFiltres(filtres)
    onAppliquer()
    onFermer()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end" onClick={onFermer}>
      <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.5)' }} />
      <div
        className="relative z-10 max-h-[85dvh] w-full overflow-y-auto p-6"
        style={{
          background: 'var(--sp-bg-2)',
          color: 'var(--sp-ink)',
          borderTopLeftRadius: 'var(--sp-radius-card)',
          borderTopRightRadius: 'var(--sp-radius-card)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl">Filtres</h2>

        <fieldset className="mb-4">
          <legend className="sp-meta mb-2 text-sm">Genres</legend>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <button
                key={genre}
                type="button"
                onClick={() => basculerGenre(genre)}
                className="min-h-11 px-3 text-sm"
                style={{
                  borderRadius: 'var(--sp-radius-pill)',
                  background: filtres.genres.includes(genre) ? 'var(--sp-accent)' : 'var(--sp-surface)',
                  color: filtres.genres.includes(genre) ? 'var(--sp-accent-ink)' : 'var(--sp-ink)',
                }}
              >
                {genre}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mb-4">
          <legend className="sp-meta mb-2 text-sm">Plateformes</legend>
          <div className="flex flex-wrap gap-2">
            {PLATEFORMES.map(({ cle, nom }) => (
              <button
                key={cle}
                type="button"
                onClick={() => basculerPlateforme(cle)}
                className="min-h-11 px-3 text-sm"
                style={{
                  borderRadius: 'var(--sp-radius-pill)',
                  background: filtres.providers.includes(cle) ? 'var(--sp-accent)' : 'var(--sp-surface)',
                  color: filtres.providers.includes(cle) ? 'var(--sp-accent-ink)' : 'var(--sp-ink)',
                }}
              >
                {nom}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setFiltres((f) => ({ ...f, includeTop200: !f.includeTop200 }))}
              className="min-h-11 px-3 text-sm"
              style={{
                borderRadius: 'var(--sp-radius-pill)',
                background: filtres.includeTop200 ? 'var(--sp-accent)' : 'var(--sp-surface)',
                color: filtres.includeTop200 ? 'var(--sp-accent-ink)' : 'var(--sp-ink)',
              }}
            >
              Top 200
            </button>
          </div>
        </fieldset>

        <label className="mb-4 flex flex-col gap-1">
          Note minimum : {filtres.minRating}
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={filtres.minRating}
            onChange={(e) => setFiltres((f) => ({ ...f, minRating: Number(e.target.value) }))}
            className="min-h-11"
          />
        </label>

        <label className="mb-4 flex flex-col gap-1">
          Durée maximum : {filtres.maxRuntime ?? 'illimitée'}
          <input
            type="range"
            min={60}
            max={240}
            value={filtres.maxRuntime ?? 240}
            onChange={(e) =>
              setFiltres((f) => ({
                ...f,
                maxRuntime: Number(e.target.value) === 240 ? null : Number(e.target.value),
              }))
            }
            className="min-h-11"
          />
        </label>

        <div className="mb-4 flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            De
            <input
              type="number"
              className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)] px-3"
              value={filtres.yearFrom ?? ''}
              onChange={(e) =>
                setFiltres((f) => ({ ...f, yearFrom: e.target.value ? Number(e.target.value) : null }))
              }
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            À
            <input
              type="number"
              className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)] px-3"
              value={filtres.yearTo ?? ''}
              onChange={(e) =>
                setFiltres((f) => ({ ...f, yearTo: e.target.value ? Number(e.target.value) : null }))
              }
            />
          </label>
        </div>

        <p className="sp-meta mb-4 text-sm">{compte ?? '…'} films correspondent</p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFiltres(FILTRES_VIDES)}
            className="min-h-11 flex-1 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-soft)]"
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={appliquer}
            className="min-h-11 flex-1 rounded-[var(--sp-radius-pill)]"
            style={{ background: 'var(--sp-accent)', color: 'var(--sp-accent-ink)' }}
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>
  )
}
