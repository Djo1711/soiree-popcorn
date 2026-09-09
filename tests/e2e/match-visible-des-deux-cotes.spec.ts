import { expect, test } from '@playwright/test'
import { creerSalon, rejoindreSalon } from './helpers'

test('la superposition de match apparaît chez les deux membres', async ({ browser }) => {
  const { contexte: contexteA, page: pageA, code } = await creerSalon(browser)
  const { contexte: contexteB, page: pageB } = await rejoindreSalon(browser, code)

  // Salon complet : le bandeau de salle d'attente doit disparaître des deux côtés.
  await expect(pageA.getByText(/arrivés/)).toBeHidden({ timeout: 10_000 })
  await expect(pageB.getByText(/arrivés/)).toBeHidden({ timeout: 10_000 })

  // Les deux paquets partagent le même ordre (lib/deck.ts, plan 1) : le
  // premier film visible est donc le même des deux côtés — aimer sur les
  // deux revient à aimer le même film, sans avoir besoin de le nommer.
  await pageA.getByRole('button', { name: "J'aime" }).click()
  await pageB.getByRole('button', { name: "J'aime" }).click()

  // La superposition doit apparaître chez les deux, y compris chez A qui n'a
  // pas provoqué le match en dernier — c'est le sondage des événements
  // (tâche 4) qui le pousse, pas seulement le retour direct du balayage.
  await expect(pageA.getByText('Match !')).toBeVisible({ timeout: 10_000 })
  await expect(pageB.getByText('Match !')).toBeVisible({ timeout: 10_000 })

  await contexteA.close()
  await contexteB.close()
})
