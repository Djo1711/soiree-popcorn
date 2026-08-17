import Image from 'next/image'
import type { DeckCard } from '@/lib/db/queries/deck'

export function MovieCard({
  film,
  onLireLaSuite,
}: {
  film: DeckCard
  onLireLaSuite?: () => void
}) {
  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{
        borderRadius: 'var(--sp-radius-card)',
        background: 'var(--sp-surface)',
        boxShadow: 'var(--sp-shadow-card)',
        color: 'var(--sp-ink)',
      }}
    >
      {film.posterPath ? (
        <Image
          src={`https://image.tmdb.org/t/p/w500${film.posterPath}`}
          alt={film.title}
          fill
          sizes="(max-width: 480px) 100vw, 400px"
          className="object-cover"
          priority={false}
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: 'var(--sp-bg-2)' }} />
      )}
      <div
        className="relative mt-auto flex flex-col gap-2 p-4"
        style={{ background: 'linear-gradient(to top, var(--sp-surface) 55%, transparent)' }}
      >
        <h2 style={{ fontFamily: 'var(--sp-font-display)' }} className="text-2xl leading-tight">
          {film.title}
        </h2>
        <p className="sp-meta text-sm" style={{ color: 'var(--sp-ink-soft)' }}>
          {[film.releaseYear, film.runtime && `${film.runtime} min`, film.voteAverage && `★ ${film.voteAverage}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {film.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1">
            {film.tags.slice(0, 4).map((tag) => (
              <li
                key={tag}
                className="px-2 py-0.5 text-xs"
                style={{
                  borderRadius: 'var(--sp-radius-pill)',
                  background: 'var(--sp-accent)',
                  color: 'var(--sp-accent-ink)',
                }}
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
        {film.overview && (
          <p className="line-clamp-2 text-sm">
            {film.overview}{' '}
            {onLireLaSuite && (
              <button
                type="button"
                onClick={onLireLaSuite}
                className="underline"
                style={{ color: 'var(--sp-accent)' }}
              >
                lire
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
