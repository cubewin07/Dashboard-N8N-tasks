import { expect, test, type Page } from '@playwright/test'

interface PersonRow {
  id: string
  x: number
  y: number
  z: number
  floorKey: string
  pose: string
  visible: boolean
}

interface Debug {
  director: {
    people: () => PersonRow[]
    moveFactor: () => number
    stats: () => { teleports: number } | null
  }
  camera: {
    target: () => [number, number, number] | null
    screenOf: (id: string) => [number, number] | null
  }
  getState: () => { config: { employees: { id: string; name: string; state: string }[] } }
}

const debug = (page: Page) =>
  page.evaluateHandle(() => (window as unknown as { __office_debug: Debug }).__office_debug)

async function people(page: Page): Promise<PersonRow[]> {
  const d = await debug(page)
  return d.evaluate((dbg) => dbg.director.people())
}

async function openOffice(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@example.com')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
  const canvas = page.locator('[data-office-canvas]')
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
}

/** Distance on the floor plane between the camera target and a person. */
async function followDistance(page: Page, id: string): Promise<number> {
  const d = await debug(page)
  return d.evaluate((dbg, who) => {
    const target = dbg.camera.target()
    const person = dbg.director.people().find((p) => p.id === who)
    if (!target || !person) return Infinity
    return Math.hypot(target[0] - person.x, target[1] - (person.y + 1), target[2] - person.z)
  }, id)
}

test.describe('P04 people and navigation', () => {
  test('everybody is in the building, pause freezes them, follow and drawer work', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000)

    if (testInfo.project.name === 'phone') {
      // Phones get the same facts in 2D: the people tab of the org page.
      await page.goto('./#/login')
      await page.locator('#login-email').fill('boss@example.com')
      await page.locator('#login-password').fill('123456')
      await page.locator('button[type="submit"]').click()
      await expect(page).toHaveURL(/#\/(\?.*)?$/)
      await page.evaluate(() => {
        window.location.hash = '/org'
      })
      await page.getByRole('tab').nth(1).click()
      await expect(page.locator('[data-people-list="page"]')).toBeVisible()
      await expect(page.locator('[data-person-row]').first()).toBeVisible()
      await page.locator('[data-person-row]').first().click()
      await expect(page.locator('[data-person-drawer]')).toBeVisible()
      return
    }

    await openOffice(page)

    // 1. One capsule per active employee.
    const d = await debug(page)
    const active = await d.evaluate(
      (dbg) => dbg.getState().config.employees.filter((e) => e.state === 'active').length,
    )
    expect(active).toBeGreaterThan(20)
    await expect.poll(async () => (await people(page)).length, { timeout: 15_000 }).toBe(active)

    // 2. At 30× somebody moves…
    await page.locator('[data-sim-speed="30"]').first().click()
    const start = await people(page)
    await expect
      .poll(
        async () => {
          const now = await people(page)
          return now.some((p) => {
            const before = start.find((b) => b.id === p.id)
            return before ? Math.hypot(p.x - before.x, p.z - before.z, p.y - before.y) > 0.5 : false
          })
        },
        { timeout: 45_000 },
      )
      .toBe(true)

    // …and pausing freezes every position.
    await page.locator('[data-sim-speed="0"]').first().click()
    await expect.poll(async () => d.evaluate((dbg) => dbg.director.moveFactor())).toBe(0)
    await page.waitForTimeout(400)
    const frozenA = await people(page)
    await page.waitForTimeout(800)
    const frozenB = await people(page)
    expect(frozenB).toEqual(frozenA)

    // 3. Follow from the people list: URL, button state and camera target.
    await page.locator('[data-sim-speed="30"]').first().click()
    const list = page.locator('[data-people-list="panel"]')
    await list.getByRole('button').first().click()
    const row = list.locator('[data-employee-id]').nth(6)
    const followedId = (await row.getAttribute('data-employee-id'))!
    await row.locator('[data-follow-button]').click()

    await expect(page).toHaveURL(new RegExp(`follow=${followedId}`))
    await expect(page.locator('[data-camera-mode="follow"]')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => followDistance(page, followedId), { timeout: 10_000 }).toBeLessThan(2)
    // Stays on them for a while, whatever they do (walk, ride, change floor).
    for (let i = 0; i < 10; i += 1) {
      await page.waitForTimeout(1000)
      expect(await followDistance(page, followedId)).toBeLessThan(2)
    }
    const followedFloor = (await people(page)).find((p) => p.id === followedId)!.floorKey
    await expect(page.locator('[data-office-canvas]')).toHaveAttribute('data-focused-floor', followedFloor)

    // 4. Clicking the person in 3D opens the drawer with their name.
    await page.locator('[data-sim-speed="0"]').first().click()
    await page.waitForTimeout(400)
    const name = await d.evaluate(
      (dbg, who) => dbg.getState().config.employees.find((e) => e.id === who)!.name,
      followedId,
    )
    await page.locator('[data-office-canvas]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    const at = await d.evaluate((dbg, who) => dbg.camera.screenOf(who), followedId)
    expect(at).not.toBeNull()
    await page.mouse.move(at![0], at![1])
    await page.mouse.click(at![0], at![1])
    await expect(page.locator('[data-person-drawer-name]')).toHaveText(name)
    // The click selected the person, it did not change the floor or end the follow.
    await expect(page).toHaveURL(new RegExp(`follow=${followedId}`))

    // 5. Esc steps back one thing at a time: the drawer (it has the focus), then the follow.
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-person-drawer]')).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`follow=${followedId}`))
    await page.keyboard.press('Escape')
    await expect(page).not.toHaveURL(/follow=/)
    await expect(page.locator('[data-camera-mode="follow"]')).toHaveAttribute('aria-pressed', 'false')

    const stats = await d.evaluate((dbg) => dbg.director.stats())
    expect(stats?.teleports).toBe(0)
  })
})
