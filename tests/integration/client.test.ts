import { afterEach, describe, expect, it, vi } from 'vitest'

const original = process.env.DATABASE_URL

afterEach(async () => {
  if (original === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = original

  const { closePool } = await import('@/lib/db/client')
  await closePool()
})

describe('getDb', () => {
  it('ne lève pas au simple import du module', async () => {
    delete process.env.DATABASE_URL
    vi.resetModules()
    await expect(import('@/lib/db/client')).resolves.toBeDefined()
  })

  it('lève un message actionnable quand DATABASE_URL manque', async () => {
    delete process.env.DATABASE_URL
    vi.resetModules()
    const { getDb } = await import('@/lib/db/client')
    expect(() => getDb()).toThrow(/DATABASE_URL est absent/)
  })

  // Ce test s'exécute après les deux précédents et vérifie donc l'état que
  // leurs `afterEach` respectifs ont laissé : sous `pnpm test`, `original` vaut
  // `undefined`, donc un `afterEach` fautif (`process.env.DATABASE_URL =
  // original`) écrirait la chaîne "undefined" — truthy, non vide — au lieu de
  // supprimer la variable. Comparer à `original` plutôt que tester une simple
  // "vérité" est ce qui rend l'assertion capable de détecter cette régression.
  it('laisse DATABASE_URL réellement absent après nettoyage, et non à la chaîne « undefined »', () => {
    expect(process.env.DATABASE_URL).toBe(original)
  })
})
