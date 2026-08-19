'use client'

import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { tirerAuSort } from '@/lib/api-client'
import { DUREE_ROULETTE_MS, easeRoulette } from '@/lib/roulette'
import type { MatchRow } from '@/lib/db/queries/matches'

/** §8.5 : sous prefers-reduced-motion, la roulette se réduit à un fondu de 120 ms. */
const DUREE_REDUITE_MS = 120

export function RouletteDialog({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const [tirage, setTirage] = useState<'attente' | 'defilement' | 'termine'>('attente')
  const [gagnant, setGagnant] = useState<MatchRow | null>(null)
  const reduit = useReducedMotion()

  useEffect(() => {
    if (!ouverte) {
      setTirage('attente')
      setGagnant(null)
      return
    }
    let annule = false
    setTirage('defilement')
    const duree = reduit ? DUREE_REDUITE_MS : DUREE_ROULETTE_MS
    tirerAuSort().then((match) => {
      if (annule) return
      setGagnant(match)
      setTimeout(() => {
        if (!annule) setTirage('termine')
      }, duree)
    })
    return () => {
      annule = true
    }
  }, [ouverte, reduit])

  if (!ouverte) return null

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col items-center justify-center gap-6 p-6"
      style={{ background: 'rgba(0, 0, 0, 0.85)', color: 'var(--sp-ink)' }}
    >
      <div className="relative h-72 w-48 overflow-hidden" style={{ borderRadius: 'var(--sp-radius-card)' }}>
        {gagnant && (
          <motion.div
            className="absolute inset-0"
            initial={reduit ? { opacity: 0 } : { y: -600 }}
            animate={reduit ? { opacity: 1 } : { y: 0 }}
            transition={
              reduit
                ? { duration: DUREE_REDUITE_MS / 1000, ease: 'easeOut' }
                : { duration: DUREE_ROULETTE_MS / 1000, ease: easeRoulette }
            }
          >
            {gagnant.movie.posterPath ? (
              // eslint-disable-next-line @next/next/no-img-element -- superposition ponctuelle
              <img
                src={`https://image.tmdb.org/t/p/w342${gagnant.movie.posterPath}`}
                alt={gagnant.movie.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full" style={{ background: 'var(--sp-surface)' }} />
            )}
          </motion.div>
        )}
      </div>
      {tirage === 'termine' && gagnant && (
        <>
          <h3 style={{ fontFamily: 'var(--sp-font-display)' }} className="text-xl">
            {gagnant.movie.title}
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTirage('defilement')}
              className="min-h-11 rounded-[var(--sp-radius-pill)] border px-4"
              style={{ borderColor: 'var(--sp-ink-soft)' }}
            >
              Relancer
            </button>
            <button
              type="button"
              onClick={onFermer}
              className="min-h-11 rounded-[var(--sp-radius-pill)] px-4"
              style={{ background: 'var(--sp-accent)', color: 'var(--sp-accent-ink)' }}
            >
              Fermer
            </button>
          </div>
        </>
      )}
    </div>
  )
}
