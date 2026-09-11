'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ApiClientError,
  membresDuSalon,
  rejoindreSalon,
  reprendreIdentite,
} from '@/lib/api-client'
import { isValidRoomCode, normalizeRoomCode } from '@/lib/roomcode'
import type { MemberSummary } from '@/lib/db/queries/rooms'

export default function AdhesionParLien({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params)
  const router = useRouter()
  const [prenom, setPrenom] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  // §11 de la spec : si l'adhésion échoue (salon complet, le cas le plus
  // probable pour un retour), proposer de reprendre une identité déjà
  // présente dans ce salon plutôt que de laisser un dérouté sans issue.
  const [membres, setMembres] = useState<MemberSummary[] | null>(null)
  const [reprise, setReprise] = useState<string | null>(null)
  const [erreurReprise, setErreurReprise] = useState<string | null>(null)

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
      // La liste des membres n'a de sens à montrer qu'une fois l'adhésion
      // normale tentée et refusée — un nouveau venu n'a personne à reprendre.
      try {
        const { members } = await membresDuSalon(codeNormalise)
        setMembres(members)
      } catch {
        // Salon introuvable ou autre panne : pas de liste, l'erreur ci-dessus suffit.
      }
    } finally {
      setEnCours(false)
    }
  }

  async function reprendre(membre: MemberSummary) {
    setReprise(membre.id)
    setErreurReprise(null)
    try {
      await reprendreIdentite(codeNormalise, membre.id)
      router.push('/salon')
    } catch (e) {
      setErreurReprise(e instanceof ApiClientError ? e.message : 'Une erreur est survenue.')
      setReprise(null)
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

      {membres && membres.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-[var(--sp-ink-page-soft)] pt-4">
          <p className="sp-meta text-sm">Ou reprends une identité déjà présente dans ce salon :</p>
          <div className="flex flex-col gap-2">
            {membres.map((membre) => (
              <button
                key={membre.id}
                type="button"
                onClick={() => reprendre(membre)}
                disabled={reprise !== null}
                className="min-h-11 rounded-[var(--sp-radius-pill)] border border-[var(--sp-ink-page-soft)] px-4 disabled:opacity-60"
              >
                {reprise === membre.id ? 'Reprise…' : membre.displayName}
              </button>
            ))}
          </div>
          {erreurReprise && <p className="text-[var(--sp-danger)]">{erreurReprise}</p>}
        </div>
      )}
    </main>
  )
}
