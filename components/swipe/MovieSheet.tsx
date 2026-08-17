'use client'

import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import type { DeckCard } from '@/lib/db/queries/deck'

const NOMS_PLATEFORMES: Record<string, string> = {
  netflix: 'Netflix',
  canal: 'MyCanal',
  disney: 'Disney+',
}

export function MovieSheet({ film, onFermer }: { film: DeckCard | null; onFermer: () => void }) {
  // §8.5 : la feuille glisse par ressort normalement, se réduit à un fondu de
  // 120 ms sous prefers-reduced-motion.
  const reduit = useReducedMotion()

  return (
    <AnimatePresence>
      {film && (
        <motion.div
          className="fixed inset-0 z-20 flex items-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onFermer}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0, 0, 0, 0.5)' }} />
          <motion.div
            className="relative z-10 max-h-[85dvh] w-full overflow-y-auto p-6"
            style={{
              background: 'var(--sp-bg-2)',
              color: 'var(--sp-ink)',
              borderTopLeftRadius: 'var(--sp-radius-card)',
              borderTopRightRadius: 'var(--sp-radius-card)',
            }}
            initial={reduit ? { opacity: 0 } : { y: '100%' }}
            animate={reduit ? { opacity: 1 } : { y: 0 }}
            exit={reduit ? { opacity: 0 } : { y: '100%' }}
            transition={reduit ? { duration: 0.12, ease: 'easeOut' } : { type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onFermer()
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onFermer}
              aria-label="Fermer"
              className="mb-4 h-11 w-11 rounded-full"
              style={{ background: 'var(--sp-surface)' }}
            >
              ↓
            </button>
            <h2 style={{ fontFamily: 'var(--sp-font-display)' }} className="text-2xl">
              {film.title}
            </h2>
            <p className="sp-meta mt-1 text-sm" style={{ color: 'var(--sp-ink-soft)' }}>
              {[film.releaseDate, film.runtime && `${film.runtime} min`, film.voteAverage && `★ ${film.voteAverage}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {film.director && <p className="mt-2">Réalisé par {film.director}</p>}
            {film.tags.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1">
                {film.tags.map((tag) => (
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
            {film.providers.length > 0 && (
              <p className="mt-3 sp-meta text-sm">
                Disponible sur {film.providers.map((p) => NOMS_PLATEFORMES[p] ?? p).join(', ')}
              </p>
            )}
            {film.overview && <p className="mt-4">{film.overview}</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
