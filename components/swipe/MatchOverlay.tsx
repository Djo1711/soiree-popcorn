import type { MatchRow } from '@/lib/db/queries/matches'
import { enterDelay } from '@/lib/entrance'

const ACCENTS = [
  { emoji: '🍿', style: { top: '10%', left: '14%' }, delai: '0s' },
  { emoji: '🎬', style: { top: '16%', right: '12%' }, delai: '1s' },
  { emoji: '✨', style: { bottom: '18%', right: '16%' }, delai: '0.5s' },
] as const

export function MatchOverlay({
  match,
  prenoms,
  onFermer,
  onVoirMatchs,
}: {
  match: MatchRow | null
  prenoms: string[]
  onFermer: () => void
  onVoirMatchs: () => void
}) {
  if (!match) return null

  return (
    <div
      className="sp-match-backdrop fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 p-6 text-center"
      style={{ background: 'rgba(0, 0, 0, 0.75)', color: 'var(--sp-ink-page)' }}
    >
      {ACCENTS.map(({ emoji, style, delai }) => (
        <span
          key={emoji}
          className="sp-floaty pointer-events-none absolute text-xl"
          style={{ ...style, ...enterDelay(delai) }}
          aria-hidden="true"
        >
          {emoji}
        </span>
      ))}
      <div
        className="sp-match-card relative w-48 overflow-hidden"
        style={{
          borderRadius: 'var(--sp-radius-card)',
          boxShadow: 'var(--sp-shadow-card), 0 0 40px -6px color-mix(in srgb, var(--sp-accent) 50%, transparent)',
        }}
      >
        {match.movie.posterPath ? (
          // eslint-disable-next-line @next/next/no-img-element -- superposition ponctuelle, pas de layout à optimiser
          <img
            src={`https://image.tmdb.org/t/p/w342${match.movie.posterPath}`}
            alt={match.movie.title}
            className="w-full"
          />
        ) : (
          <div className="aspect-[2/3] w-full" style={{ background: 'var(--sp-surface)' }} />
        )}
      </div>
      <span
        className="sp-match-banner px-4 py-1 text-sm"
        style={{
          borderRadius: 'var(--sp-radius-pill)',
          background: 'var(--sp-accent)',
          color: 'var(--sp-accent-ink)',
        }}
      >
        Match !
      </span>
      <h2
        style={{ fontFamily: 'var(--sp-font-display)', ...enterDelay('80ms') }}
        className="sp-enter text-2xl"
      >
        {match.movie.title}
      </h2>
      <p className="sp-meta sp-enter" style={enterDelay('160ms')}>
        {prenoms.join(' & ')}
      </p>
      <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={onVoirMatchs}
          className="sp-tactile sp-enter min-h-11 rounded-[var(--sp-radius-pill)]"
          style={{
            background: 'var(--sp-accent)',
            color: 'var(--sp-accent-ink)',
            boxShadow: '0 4px 0 color-mix(in srgb, var(--sp-accent) 65%, black)',
            ...enterDelay('240ms'),
          }}
        >
          Voir nos matchs
        </button>
        <button
          type="button"
          onClick={onFermer}
          className="sp-tactile sp-enter min-h-11 rounded-[var(--sp-radius-pill)] border"
          style={{ borderColor: 'var(--sp-ink-page-soft)', ...enterDelay('320ms') }}
        >
          Continuer
        </button>
      </div>
    </div>
  )
}
