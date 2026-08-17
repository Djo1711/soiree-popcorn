'use client'

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'motion/react'
import { useState } from 'react'
import type { DeckCard } from '@/lib/db/queries/deck'
import { MovieCard } from '@/components/swipe/MovieCard'
import {
  POSITIONS_PILE,
  balayageValide,
  opaciteVoile,
  rotationPourDelta,
} from '@/lib/swipe-gesture'

export function CardStack({
  cartes,
  onBalayage,
  onDetail,
}: {
  cartes: DeckCard[]
  onBalayage: (id: number, sens: 'aime' | 'rejette') => void
  onDetail: (id: number) => void
}) {
  const visibles = cartes.slice(0, 3)

  return (
    <div className="relative mx-auto h-[70dvh] w-full max-w-sm">
      <AnimatePresence>
        {visibles
          .map((film, index) => (
            <CarteDeplacable
              key={film.id}
              film={film}
              position={POSITIONS_PILE[index]}
              interactive={index === 0}
              onBalayage={onBalayage}
              onDetail={onDetail}
            />
          ))
          .reverse()}
      </AnimatePresence>
    </div>
  )
}

function CarteDeplacable({
  film,
  position,
  interactive,
  onBalayage,
  onDetail,
}: {
  film: DeckCard
  position: (typeof POSITIONS_PILE)[number]
  interactive: boolean
  onBalayage: (id: number, sens: 'aime' | 'rejette') => void
  onDetail: (id: number) => void
}) {
  const x = useMotionValue(0)
  const [largeur, setLargeur] = useState(360)
  const rotation = useTransform(x, (deltaX) => rotationPourDelta(deltaX))
  const opaciteAime = useTransform(x, (deltaX) => (deltaX > 0 ? opaciteVoile(deltaX, largeur) : 0))
  const opaciteRejet = useTransform(x, (deltaX) => (deltaX < 0 ? opaciteVoile(deltaX, largeur) : 0))

  // §8.5 : sous prefers-reduced-motion, toute animation — y compris le
  // balayage — se réduit à un fondu de 120 ms. Le geste reste possible (ce
  // n'est pas une animation mais une interaction, doublée par les boutons de
  // toute façon), seules l'apparition/sortie perdent leur mouvement physique.
  const reduit = useReducedMotion()

  return (
    <motion.div
      className="absolute inset-0"
      style={interactive ? { x, rotate: reduit ? 0 : rotation } : undefined}
      initial={{ scale: reduit ? 1 : position.echelle, y: reduit ? 0 : position.decalageY, opacity: 0 }}
      animate={{ scale: reduit ? 1 : position.echelle, y: reduit ? 0 : position.decalageY, opacity: 1 }}
      exit={
        reduit
          ? { opacity: 0 }
          : { x: x.get() > 0 ? 480 : -480, rotate: x.get() > 0 ? 20 : -20, opacity: 0 }
      }
      transition={reduit ? { duration: 0.12, ease: 'easeOut' } : { duration: 0.28, ease: 'easeIn' }}
      drag={interactive ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.6}
      onDragStart={(_, info) => setLargeur(window.innerWidth)}
      onDragEnd={(_, info) => {
        const sens = balayageValide(info.offset.x, info.velocity.x, largeur)
        if (sens) onBalayage(film.id, sens)
      }}
    >
      <MovieCard film={film} onLireLaSuite={interactive ? () => onDetail(film.id) : undefined} />
      {interactive && (
        <>
          <motion.div
            className="pointer-events-none absolute inset-0 flex items-start justify-end p-6"
            style={{ opacity: opaciteAime, borderRadius: 'var(--sp-radius-card)' }}
          >
            <span
              className="px-4 py-1 text-lg font-bold"
              style={{
                border: '3px solid var(--sp-accent)',
                color: 'var(--sp-accent)',
                borderRadius: 'var(--sp-radius-pill)',
                transform: 'rotate(-12deg)',
              }}
            >
              J'aime
            </span>
          </motion.div>
          <motion.div
            className="pointer-events-none absolute inset-0 flex items-start justify-start p-6"
            style={{ opacity: opaciteRejet, borderRadius: 'var(--sp-radius-card)' }}
          >
            <span
              className="px-4 py-1 text-lg font-bold"
              style={{
                border: '3px solid var(--sp-danger)',
                color: 'var(--sp-danger)',
                borderRadius: 'var(--sp-radius-pill)',
                transform: 'rotate(12deg)',
              }}
            >
              Non
            </span>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
