import { describe, expect, it, vi } from 'vitest'
import { avecErreurs, erreur, ok } from '@/lib/api/respond'

describe('avecErreurs', () => {
  it('laisse passer une réponse normale sans y toucher', async () => {
    const r = await avecErreurs(async () => ok({ salut: 'monde' }))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ salut: 'monde' })
  })

  it('laisse passer une réponse d\'erreur explicite du handler', async () => {
    const r = await avecErreurs(async () => erreur(404, 'Introuvable.'))
    expect(r.status).toBe(404)
  })

  it('capture une exception non prévue et rend un 500 français générique', async () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await avecErreurs(async () => {
      throw new Error('SESSION_SECRET absent, ou toute autre panne imprévue')
    })
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({
      erreur: 'Une erreur est survenue de notre côté. Réessayez dans un instant.',
    })
    expect(espion).toHaveBeenCalledTimes(1)
    espion.mockRestore()
  })
})
