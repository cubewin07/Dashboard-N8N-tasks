import { expect, test, type Page } from '@playwright/test'

interface CharactersDebug {
  assembled: number
  assemblies: number
  queued: number
  failed: number
}

interface OfficeDebug {
  director: { people: () => Array<{ id: string }> }
  characters?: CharactersDebug
}

async function openOffice(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
  const canvas = page.locator('[data-office-canvas]')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 25_000 })
  await expect(canvas).toHaveAttribute('data-assets', 'ready', { timeout: 45_000 })
}

const stats = (page: Page) =>
  page.evaluate(() => {
    const dbg = (window as unknown as { __office_debug?: OfficeDebug }).__office_debug
    const c = dbg?.characters
    const people = dbg?.director?.people().length ?? 0
    return c ? { assembled: c.assembled, assemblies: c.assemblies, queued: c.queued, failed: c.failed, people } : null
  })

test.describe('P08b live appearance', () => {
  test('a look saved elsewhere re-assembles only that character, without reload', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'phone', '3D characters run on desktop')
    test.setTimeout(90_000)
    await openOffice(page)

    await expect
      .poll(async () => {
        const s = await stats(page)
        return s && s.people > 0 && s.assembled === s.people && s.queued === 0
      }, { timeout: 40_000 })
      .toBe(true)
    const before = (await stats(page))!

    // Another tab saves a look for the first person: the `storage` event reaches this tab.
    await page.evaluate(() => {
      const dbg = (window as unknown as { __office_debug?: OfficeDebug }).__office_debug
      const id = dbg!.director.people()[0]!.id
      const doc = {
        v: 1, base: 'male', skin: 'skin_09',
        hair: { item: 'hair_short_01', color: 'hair_blue' },
        body: { height: 0.9, build: 0.5, muscle: 0.3, chest: 0.2, hips: 0.2, shoulders: 0.4 },
      }
      const key = 'aioffice.appearance.v1'
      localStorage.setItem(key, JSON.stringify({ schema: 1, items: { [id]: { doc, version: 1 } } }))
      window.dispatchEvent(new StorageEvent('storage', { key }))
    })

    await expect
      .poll(async () => (await stats(page))?.assemblies, { timeout: 20_000 })
      .toBe(before.assemblies + 1)
    await expect
      .poll(async () => {
        const s = await stats(page)
        return s && { assembled: s.assembled, queued: s.queued, failed: s.failed }
      })
      .toEqual({ assembled: before.assembled, queued: 0, failed: 0 })
  })
})
