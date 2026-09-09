import { expect, type Browser } from '@playwright/test'

export async function creerSalon(browser: Browser, prenom = 'Djo') {
  const contexte = await browser.newContext()
  const page = await contexte.newPage()
  await page.goto('/')
  await page.getByRole('button', { name: 'Créer un salon' }).click()
  await page.getByLabel('Ton prénom').fill(prenom)
  // Effectif 2, seuil 2 par défaut (§7.1) : rien à régler pour un salon à deux.
  await page.getByRole('button', { name: 'Créer' }).click()

  // §7.1 : le lien à partager s'affiche avant le balayage — le lire ici,
  // puis continuer vers /salon.
  await page.getByText('Salon créé !').waitFor()
  const code = (await page.locator('span.sp-meta').first().innerText()).trim()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page).toHaveURL('/salon')
  return { contexte, page, code }
}

export async function rejoindreSalon(browser: Browser, code: string, prenom = 'Alice') {
  const contexte = await browser.newContext()
  const page = await contexte.newPage()
  await page.goto(`/j/${code}`)
  await page.getByLabel('Ton prénom').fill(prenom)
  await page.getByRole('button', { name: 'Rejoindre' }).click()
  await expect(page).toHaveURL('/salon')
  return { contexte, page }
}
