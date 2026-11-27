import { expect, test, type Page } from '@playwright/test'

// P11-T06 (R9): loading, empty and error states on every screen, with a screenshot of each
// for the PR's screen × state table. States are forced through the feed:
// - loading: a replay log whose request never answers,
// - empty: `feed=none` (the office from config, no work, no events),
// - error: a replay log that does not exist (the feed fails to boot).
// Config-only screens (Tủ đồ, Quản trị, Cài đặt) load their config locally in this build, so a
// feed problem must leave them usable.

type State = 'loading' | 'empty' | 'error'

const FEED: Record<State, string> = {
  loading: 'feed=replay&log=replay/p11-never.jsonl',
  empty: 'feed=none',
  error: 'feed=replay&log=replay/p11-missing.jsonl',
}

const SCREENS = [
  { key: 'office', path: '/', feedBacked: true },
  { key: 'org', path: '/org', feedBacked: true },
  { key: 'queue', path: '/queue', feedBacked: true },
  { key: 'activity', path: '/activity', feedBacked: true },
  { key: 'wardrobe', path: '/wardrobe', feedBacked: false },
  { key: 'admin', path: '/admin', feedBacked: false },
  { key: 'settings', path: '/settings', feedBacked: false },
] as const

async function login(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
}

async function open(page: Page, path: string, state: State) {
  await page.goto(`./#${path}?${FEED[state]}`)
  // A hash change does not restart the app; the feed is picked at boot.
  await page.reload()
  await expect(page.locator('main h1').first()).toBeVisible()
}

for (const state of ['loading', 'empty', 'error'] as const) {
  test(`every screen has a ${state} state`, async ({ page }, info) => {
    test.setTimeout(120_000)
    await page.route('**/replay/p11-never.jsonl', () => {
      /* never answer: the feed stays loading */
    })
    await login(page)
    for (const screen of SCREENS) {
      await open(page, screen.path, state)
      const main = page.locator('main')
      if (screen.feedBacked && state === 'loading') {
        await expect.soft(main.locator('[aria-busy="true"]').first()).toBeVisible()
      } else if (screen.feedBacked && state === 'error') {
        await expect.soft(main.locator('[data-load-error]').first()).toBeVisible({ timeout: 15_000 })
      } else if (screen.key === 'queue' && state === 'empty') {
        await expect.soft(main.locator('[data-queue-empty]')).toBeVisible()
      } else if (screen.key === 'activity' && state === 'empty') {
        await expect.soft(main.locator('[data-activity-empty]')).toBeVisible()
      } else if (!screen.feedBacked) {
        // Config-only screens keep working whatever the feed does.
        await expect.soft(main.locator('[data-load-error]')).toHaveCount(0)
        await expect.soft(main.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
      }
      // The connection badge tells the truth too: no green "Trực tuyến" before or without a feed.
      const badge = page.locator('[data-live-badge]').first()
      await expect.soft(badge).toHaveAttribute(
        'data-live-badge',
        state === 'loading' ? 'connecting' : state === 'error' ? 'offline' : 'live',
        { timeout: 15_000 },
      )
      await page.screenshot({ path: info.outputPath(`p11-state-${state}-${screen.key}.png`) })
    }
  })
}
