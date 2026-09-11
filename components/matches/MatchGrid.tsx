'use client'

import { useState } from 'react'
import type { MatchRow } from '@/lib/db/queries/matches'
import type { MatchStatus } from '@/lib/db/schema'

const LIBELLES_STATUT: Record<MatchStatus, string> = {
  a_voir: 'À voir',
  vu: 'Vu',
  abandonne: 'Abandonné',
}

export function MatchGrid({
  matchs,
  onChangerStatut,
}: {
  matchs: MatchRow[]
  onChangerStatut: (movieId: number, status: MatchStatus) => void
}) {
  const [ouvert, setOuvert] = useState<MatchRow | null>(null)

  return (
    <>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        {matchs.map((match) => (
          <button
            key={match.matchId}
            type="button"
            onClick={() => setOuvert(match)}
            className="sp-tactile relative overflow-hidden text-left"
            style={{ borderRadius: 'var(--sp-radius-card)', boxShadow: 'var(--sp-shadow-card)' }}
          >
            {match.movie.posterPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- grille dense, pas de next/image nécessaire ici
              <img
                src={`https://image.tmdb.org/t/p/w342${match.movie.posterPath}`}
                alt={match.movie.title}
                className="aspect-[2/3] w-full object-cover"
              />
            ) : (
              <div className="aspect-[2/3] w-full" style={{ background: 'var(--sp-surface)' }} />
            )}
            <span
              className="sp-meta absolute right-1 top-1 px-2 py-0.5 text-xs"
              style={{
                borderRadius: 'var(--sp-radius-pill)',
                background: 'var(--sp-bg-2)',
                color: 'var(--sp-ink)',
              }}
            >
              {LIBELLES_STATUT[match.status]}
            </span>
          </button>
        ))}
      </div>

      {ouvert && (
        <div
          className="fixed inset-0 z-20 flex items-end"
          onClick={() => setOuvert(null)}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.5)' }} />
          <div
            className="sp-enter relative z-10 w-full p-6"
            style={{
              background: 'var(--sp-bg-2)',
              color: 'var(--sp-ink)',
              borderTopLeftRadius: 'var(--sp-radius-card)',
              borderTopRightRadius: 'var(--sp-radius-card)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--sp-font-display)' }} className="mb-4 text-xl">
              {ouvert.movie.title}
            </h3>
            <div className="flex gap-2">
              {(['vu', 'abandonne', 'a_voir'] as const)
                .filter((s) => s !== ouvert.status)
                .map((statut) => (
                  <button
                    key={statut}
                    type="button"
                    onClick={() => {
                      onChangerStatut(ouvert.movie.id, statut)
                      setOuvert(null)
                    }}
                    className="sp-tactile min-h-11 flex-1 rounded-[var(--sp-radius-pill)] border"
                    style={{
                      borderColor: 'var(--sp-ink-soft)',
                      boxShadow: '0 4px 0 color-mix(in srgb, var(--sp-ink-soft) 65%, black)',
                    }}
                  >
                    {LIBELLES_STATUT[statut]}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
