import { expect, test, type Page } from '@playwright/test'

// P11-T09 / R5: runs only against a build made with VITE_FEED=none (the `no-sim` CI job),
// where @/adapters/sim is aliased to the NullFeed stub. Proves the office, org list and
// wardrobe work with no simulator in the bundle.
const NO_SIM = process.env.VITE_FEED === 'none'

interface Debug {
  getState: () => {
    people: Record<string, unknown>
    tasks: Record<string, unknown>
    config: { employees: { state: string }[] }
  }
  director?: { people: () => { id: string; visible: boolean }[] }
  sim?: unknown
}

async function login(page: Page, email: string) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
}

test.describe('no-sim build', () => {
  test.skip(!NO_SIM, 'only for a VITE_FEED=none build')

  test('the building renders, everyone is in it, nothing happens, no sim controls', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'the 3D office is desktop only')
    await login(page, 'boss@demo.local')
    const canvas = page.locator('[data-office-canvas]')
    await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
    await expect(page.locator('[data-sim-control-panel]')).toHaveCount(0)

    const snapshot = await page.waitForFunction(() => {
      const dbg = (window as unknown as { __office_debug?: Debug }).__office_debug
      const people = dbg?.director?.people() ?? []
      if (!dbg?.getState || people.length === 0) return null
      const s = dbg.getState()
      return {
        active: s.config.employees.filter((e) => e.state === 'active').length,
        people: Object.keys(s.people).length,
        tasks: Object.keys(s.tasks).length,
        inScene: people.length,
        sim: dbg.sim ?? null,
      }
    })
    const v = (await snapshot.jsonValue())!
    expect(v.people).toBe(v.active)
    expect(v.inScene).toBe(v.active)
    expect(v.tasks).toBe(0)
    expect(v.sim).toBeNull()
  })

  test('org list and queue work on the NullFeed', async ({ page }) => {
    await login(page, 'boss@demo.local')
    await page.goto('./#/org')
    await expect(page.locator('[data-employee-id]')).toHaveCount(28)
    await page.goto('./#/queue')
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('[data-sim-control-panel]')).toHaveCount(0)
  })

  test('the wardrobe works', async ({ page }) => {
    await login(page, 'stylist@demo.local')
    await expect(page).toHaveURL(/#\/wardrobe$/)
    await expect(page.getByTestId('wardrobe-people').getByRole('option').first()).toBeVisible()
  })
})
