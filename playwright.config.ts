import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  // `next dev` compile les routes à la demande — la toute première visite de
  // /salon, /j/[code] ou /salon/matchs dans la session peut prendre plusieurs
  // secondes chacune, au-delà du timeout par défaut de `expect()` (5 s) utilisé
  // par les assertions `toHaveURL` de tests/e2e/helpers.ts qui n'en précisent
  // pas, et cumulativement au-delà du timeout par défaut de test (30 s) une
  // fois plusieurs premières visites additionnées dans un même test.
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    // 'pnpm' n'est pas directement sur le PATH dans cet environnement
    // (accessible uniquement via `corepack pnpm`) — sans ce préfixe, le
    // process webServer de Playwright échoue avec "pnpm n'est pas reconnu".
    command: 'corepack pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: { WS_NO_BUFFER_UTIL: '1' },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
