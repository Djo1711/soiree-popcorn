'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiClientError, rejoindreSalon } from '@/lib/api-client'
import { isValidRoomCode, normalizeRoomCode } from '@/lib/roomcode'

export default function AdhesionParLien({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [prenom, setPrenom] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const codeNormalise = normalizeRoomCode(code)
  const valide = isValidRoomCode(codeNormalise)

  useEffect(() => {
    if (!valide) setErreur('Ce lien n’est pas valide.')
  }, [valide])

  async function soumettre(e: React.FormEvent) {
    e.preventDefault()
    setEnCours(true)
    setErreur(null)
    try {
      await rejoindreSalon(codeNormalise, prenom)
      router.push('/salon')
    } catch (e) {
      setErreur(e instanceof ApiClientError ? e.message : 'Une erreur est survenue.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl">Rejoindre le salon {codeNormalise}</h1>
      <form onSubmit={soumettre} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Ton prénom
          <input
            className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-page-soft)] px-4"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            disabled={!valide}
            required
          />
        </label>
        {erreur && <p className="text-[var(--sp-danger)]">{erreur}</p>}
        <button
          type="submit"
          disabled={enCours || !valide}
          className="min-h-11 rounded-[var(--sp-radius-pill)] bg-[var(--sp-accent)] px-6 py-3 text-[var(--sp-accent-ink)] disabled:opacity-60"
        >
          {enCours ? 'Adhésion…' : 'Rejoindre'}
        </button>
      </form>
    </main>
  )
}
