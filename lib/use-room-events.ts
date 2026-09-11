'use client'

import { useEffect, useRef, useState } from 'react'
import { ApiClientError, evenements } from '@/lib/api-client'
import { ETAT_INITIAL, fusionnerEvenements, type EtatSalon } from '@/lib/room-events'

const INTERVALLE_PAR_DEFAUT_MS = 2000

export function useRoomEvents(intervalleMs = INTERVALLE_PAR_DEFAUT_MS): EtatSalon {
  const [etat, setEtat] = useState<EtatSalon>(ETAT_INITIAL)
  const curseurRef = useRef(0)

  useEffect(() => {
    let annule = false

    async function rafraichir() {
      if (document.visibilityState !== 'visible') return
      try {
        const reponse = await evenements(curseurRef.current)
        if (annule) return
        setEtat((precedent) => {
          const suivant = fusionnerEvenements(precedent, reponse)
          curseurRef.current = suivant.curseur
          return suivant
        })
      } catch (e) {
        if (annule) return
        if (e instanceof ApiClientError && e.status === 401) {
          setEtat({ ...ETAT_INITIAL, sansSession: true })
        }
      }
    }

    function surChangementVisibilite() {
      if (document.visibilityState === 'visible') rafraichir()
    }

    rafraichir()
    const id = setInterval(rafraichir, intervalleMs)
    document.addEventListener('visibilitychange', surChangementVisibilite)
    return () => {
      annule = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', surChangementVisibilite)
    }
  }, [intervalleMs])

  return etat
}
