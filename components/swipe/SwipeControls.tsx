export function SwipeControls({
  onRembobiner,
  onRejeter,
  onAimer,
  onDetail,
  rembobinageDisponible,
}: {
  onRembobiner: () => void
  onRejeter: () => void
  onAimer: () => void
  onDetail: () => void
  rembobinageDisponible: boolean
}) {
  const bouton = 'flex h-14 w-14 items-center justify-center rounded-full text-2xl'
  return (
    <div className="flex items-center justify-center gap-4 p-4">
      <button
        type="button"
        aria-label="Rembobiner le dernier balayage"
        onClick={onRembobiner}
        disabled={!rembobinageDisponible}
        className={bouton}
        style={{ background: 'var(--sp-bg-2)', color: 'var(--sp-ink)', opacity: rembobinageDisponible ? 1 : 0.4 }}
      >
        ↺
      </button>
      <button
        type="button"
        aria-label="Rejeter"
        onClick={onRejeter}
        className={bouton}
        style={{ background: 'var(--sp-surface)', color: 'var(--sp-danger)', border: '2px solid var(--sp-danger)' }}
      >
        ✕
      </button>
      <button
        type="button"
        aria-label="Voir les détails"
        onClick={onDetail}
        className={bouton}
        style={{ background: 'var(--sp-bg-2)', color: 'var(--sp-ink)' }}
      >
        ⓘ
      </button>
      <button
        type="button"
        aria-label="J'aime"
        onClick={onAimer}
        className={bouton}
        style={{ background: 'var(--sp-accent)', color: 'var(--sp-accent-ink)' }}
      >
        ♥
      </button>
    </div>
  )
}
