import { expect, test } from '@playwright/test'
import { creerSalon, rejoindreSalon } from './helpers'

test('parcours complet : créer, rejoindre, filtrer, balayer, matcher, marquer vu, tirer au sort', async ({
  browser,
}) => {
  const { contexte: contexteA, page: pageA, code } = await creerSalon(browser)
  const { contexte: contexteB, page: pageB } = await rejoindreSalon(browser, code)

  await expect(pageA.getByText(/arrivés/)).toBeHidden({ timeout: 10_000 })

  // Filtrer : ouvrir la feuille, cocher un genre, voir le compte en direct —
  // puis fermer SANS appliquer (clic sur le fond, pas sur « Appliquer »).
  // Persister le filtre limiterait le paquet de A à ce genre tandis que B
  // resterait sur le paquet complet : comme l'ordre est partagé mais pas le
  // sous-ensemble visible, A et B risqueraient de ne plus voir le même
  // premier film, rendant le match qui suit imprévisible. Ce n'est pas ce
  // que cette étape doit prouver — la persistance des filtres est déjà
  // couverte par `tests/integration/api-matches.test.ts` (plan 2).
  await pageA.getByRole('button', { name: 'Filtres' }).click()
  await pageA.getByRole('button', { name: 'Action' }).click()
  await expect(pageA.getByText(/films correspondent/)).toBeVisible()
  await pageA.locator('.fixed.inset-0').first().click({ position: { x: 10, y: 10 } })

  // Balayer jusqu'au match : aucun filtre n'a été persisté à l'étape
  // précédente, les deux paquets sont donc restés identiques (même ordre,
  // §5 de la spec) — le premier film visible est le même des deux côtés,
  // aimer sur les deux revient à aimer le même film.
  await pageA.getByRole('button', { name: "J'aime" }).click()
  await pageB.getByRole('button', { name: "J'aime" }).click()
  await expect(pageA.getByText('Match !')).toBeVisible({ timeout: 10_000 })
  await pageA.getByRole('button', { name: 'Continuer' }).click()
  // B a aussi reçu la superposition (poussée par le sondage, tâche 4) : la
  // fermer avant de naviguer, sinon elle intercepterait le clic suivant.
  await pageB.getByRole('button', { name: 'Continuer' }).click()

  // Nos matchs, tirer au sort — tant que le seul match est encore « à voir »,
  // sans quoi « Décide pour nous » ne s'affiche plus (app/salon/matchs/page.tsx).
  await pageB.getByRole('link', { name: /match/ }).click()
  await expect(pageB).toHaveURL('/salon/matchs')
  await pageB.getByRole('button', { name: 'Décide pour nous' }).click()
  // Timeout allongé (5 s → 15 s) : la roulette additionne un aller-retour API
  // (parfois la toute première compilation à la demande de la route par
  // `next dev`) et l'animation DUREE_ROULETTE_MS avant que « Fermer »
  // n'apparaisse — 5 s s'est révélé flaky dans cet environnement.
  await expect(pageB.getByRole('button', { name: 'Fermer' })).toBeVisible({ timeout: 15_000 })
  await pageB.getByRole('button', { name: 'Fermer' }).click()

  // Marquer vu, côté A.
  await pageA.getByRole('link', { name: /match/ }).click()
  await expect(pageA).toHaveURL('/salon/matchs')
  // Ouvrir la feuille de détail via la vignette du match dans MatchGrid (et
  // non le premier <button> de la page, qui est l'onglet « À voir » de la
  // nav — déjà actif, cliquer dessus ne fait rien). La feuille ouverte,
  // scoper le clic sur « Vu » à la feuille elle-même
  // (`components/matches/MatchGrid.tsx:58-96`, conteneur `.fixed.inset-0`) :
  // sans ce scope, le sélecteur correspond aussi à l'onglet « Vu » de la nav
  // (`app/salon/matchs/page.tsx:44-58`) et Playwright refuse le clic
  // (« strict mode violation », deux éléments correspondants).
  await pageA.locator('.grid.grid-cols-2 button').first().click()
  await pageA.locator('.fixed.inset-0').getByRole('button', { name: 'Vu' }).click()
  await expect(pageA.getByRole('button', { name: 'Décide pour nous' })).toBeHidden()

  await contexteA.close()
  await contexteB.close()
})
