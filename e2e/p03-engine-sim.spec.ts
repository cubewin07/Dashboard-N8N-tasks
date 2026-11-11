import { expect, test, type Page } from '@playwright/test'

async function loginAsBoss(page: Page) {
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@example.com')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
}

async function gotoRoute(page: Page, route: string) {
  // OfficeCanvas canonicalises its own `?cam=` hash shortly after it mounts and
  // can bounce a very early navigation back to `#/`. Retry until the hash holds.
  await expect(async () => {
    await page.evaluate((r) => {
      window.location.hash = r
    }, route)
    await page.waitForTimeout(600)
    expect(await page.evaluate(() => window.location.hash)).toBe(route)
  }).toPass({ timeout: 10_000 })
}

test.describe('P03 engine sim and wiring (P03-T18)', () => {
  test('P03-T16: sim control panel controls speed and triggers scenarios', async ({
    page,
  }, testInfo) => {
    await loginAsBoss(page)

    const isPhone = testInfo.project.name === 'phone'
    if (isPhone) {
      const panelOnHome = page.locator('[data-sim-control-panel]')
      if (!(await panelOnHome.isVisible())) {
        const moreBtn = page.getByRole('button', { name: /Thêm|More/i })
        await moreBtn.click()
      }
    }
    await expect(page.locator('[data-sim-control-panel]').first()).toBeVisible({
      timeout: 15_000,
    })

    // Pause ([data-sim-speed="0"]) freezes window.__office_debug.getState().now over 400ms
    await page.locator('[data-sim-speed="0"]').first().click()

    const now1 = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: { getState?: () => { now: string } }
        }
      ).__office_debug
      return dbg?.getState?.()?.now
    })
    await page.waitForTimeout(450)
    const now2 = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: { getState?: () => { now: string } }
        }
      ).__office_debug
      return dbg?.getState?.()?.now
    })
    expect(now1).toBe(now2)

    // 120× advances sim time faster than 30×
    await page.locator('[data-sim-speed="30"]').first().click()
    const t30Start = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: { getState?: () => { now: string } }
        }
      ).__office_debug
      return new Date(dbg?.getState?.()?.now ?? 0).getTime()
    })
    // `now` only advances when an event arrives (heartbeat every 60 sim-seconds),
    // so sample long enough to span several heartbeats at both speeds.
    await page.waitForTimeout(3_000)
    const t30End = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: { getState?: () => { now: string } }
        }
      ).__office_debug
      return new Date(dbg?.getState?.()?.now ?? 0).getTime()
    })
    const delta30 = t30End - t30Start

    await page.locator('[data-sim-speed="120"]').first().click()
    const t120Start = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: { getState?: () => { now: string } }
        }
      ).__office_debug
      return new Date(dbg?.getState?.()?.now ?? 0).getTime()
    })
    // `now` only advances when an event arrives (heartbeat every 60 sim-seconds),
    // so sample long enough to span several heartbeats at both speeds.
    await page.waitForTimeout(3_000)
    const t120End = await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: { getState?: () => { now: string } }
        }
      ).__office_debug
      return new Date(dbg?.getState?.()?.now ?? 0).getTime()
    })
    const delta120 = t120End - t120Start
    expect(delta120).toBeGreaterThan(delta30)

    // Reset speed to 30x
    await page.locator('[data-sim-speed="30"]').first().click()

    // Triggering scenarios via window.__office_debug.sim.runScenario(key) emits sim.scenario in window.__office_debug.getState().log
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: { sim?: { runScenario: (k: string) => void } }
        }
      ).__office_debug
      dbg?.sim?.runScenario('month_end')
    })

    await expect
      .poll(
        async () => {
          return page.evaluate(() => {
            const dbg = (
              window as unknown as {
                __office_debug?: {
                  getState?: () => {
                    log: Array<{
                      type: string
                      payload?: Record<string, unknown>
                    }>
                  }
                }
              }
            ).__office_debug
            const log = dbg?.getState?.()?.log ?? []
            return log.some(
              (e) =>
                e.type === 'sim.scenario' &&
                (e.payload?.key === 'month_end' ||
                  e.payload?.scenario === 'month_end'),
            )
          })
        },
        { timeout: 10_000 },
      )
      .toBe(true)
  })

  test('P03-T14: approval queue and intake box flow', async ({ page }) => {
    await loginAsBoss(page)

    // Run scenario angry_refund via window.__office_debug.sim.runScenario('angry_refund')
    // and step the sim until bossQueue has the item (window.__office_debug.getState().reviews has a boss-level pending review)
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: {
            sim?: {
              setSpeed: (s: number) => void
              runScenario: (k: string) => void
              step: (n: number) => void
            }
          }
        }
      ).__office_debug
      dbg?.sim?.setSpeed(0)
      dbg?.sim?.runScenario('angry_refund')
    })

    await expect
      .poll(
        async () => {
          return page.evaluate(() => {
            const dbg = (
              window as unknown as {
                __office_debug?: {
                  getState?: () => {
                    reviews: Record<string, { status: string; level: string }>
                  }
                  sim?: { step: (n: number) => void }
                }
              }
            ).__office_debug
            dbg?.sim?.step?.(10)
            const reviews = Object.values(dbg?.getState?.()?.reviews ?? {})
            return reviews.some(
              (r) => r.status === 'pending' && r.level === 'boss',
            )
          })
        },
        { timeout: 10_000 },
      )
      .toBe(true)

    // Navigate to ./#/queue
    await gotoRoute(page, '#/queue')
    await expect(page).toHaveURL(/#\/queue$/)

    // Verify [data-queue-item] is visible and shows the matched rule label ([data-why-boss-rules] contains 'Việc nhạy cảm')
    const queueItem = page.locator('[data-queue-item]').first()
    await expect(queueItem).toBeVisible({ timeout: 10_000 })
    const reviewId = await queueItem.getAttribute('data-queue-item')
    expect(reviewId).toBeTruthy()
    await expect(page.locator('[data-why-boss-rules]').first()).toContainText(
      'Việc nhạy cảm',
    )

    // Verify "Yêu cầu sửa" button ([data-testid^="changes-"]) is disabled when the note textarea ([data-review-note-input]) is empty,
    // and becomes enabled when a note is typed; clear the note again.
    const changesBtn = queueItem.locator('[data-testid^="changes-"]')
    await expect(changesBtn).toBeDisabled()

    const noteInput = queueItem.locator('[data-review-note-input]')
    await noteInput.fill('Vui lòng kiểm tra lại đơn hàng')
    await expect(changesBtn).toBeEnabled()

    await noteInput.fill('')
    await expect(changesBtn).toBeDisabled()

    // Click "Duyệt" ([data-testid^="approve-"]) -> assert the button reaches data-command-state="applied" (or text "Đã áp dụng"),
    // and then the item leaves the queue.
    const approveBtn = queueItem.locator('[data-testid^="approve-"]')
    await approveBtn.click()
    await expect(approveBtn).toHaveAttribute('data-command-state', 'applied', {
      timeout: 5_000,
    })
    await expect(
      page.locator(`[data-queue-item="${reviewId}"]`),
    ).toHaveCount(0, {
      timeout: 10_000,
    })

    // Submit "làm banner sale 12.12 cho shopee 1" in the visible [data-intake-input] and click [data-intake-submit]
    // -> navigate to ./#/activity and verify a design.banner_set task (Thiết kế banner sale 12.12 – Shopee 1) appears in [data-activity-list].
    // The sim was paused above; resume it so the manager can pick up the intake.
    await page.evaluate(() => {
      const dbg = (
        window as unknown as {
          __office_debug?: { sim?: { setSpeed: (s: number) => void } }
        }
      ).__office_debug
      dbg?.sim?.setSpeed(120)
    })

    const visibleIntakeInput = page
      .locator('[data-intake-input]:visible')
      .first()
    await visibleIntakeInput.fill('làm banner sale 12.12 cho shopee 1')
    const visibleIntakeSubmit = page
      .locator('[data-intake-submit]:visible')
      .first()
    await visibleIntakeSubmit.click()

    // Task titles are picked from several templates, so read the generated title
    // from the feed state, then freeze the sim so the log stays put.
    type DebugTasks = {
      getState?: () => {
        tasks: Record<string, { typeKey: string; title: string }>
      }
      sim?: { setSpeed: (s: number) => void }
    }
    let bannerTitle = ''
    await expect
      .poll(
        async () => {
          bannerTitle = await page.evaluate(() => {
            const dbg = (window as unknown as { __office_debug?: DebugTasks })
              .__office_debug
            const tasks = Object.values(dbg?.getState?.()?.tasks ?? {})
            const hit = tasks.find((task) => task.typeKey === 'design.banner_set')
            if (hit) dbg?.sim?.setSpeed(0)
            return hit?.title ?? ''
          })
          return bannerTitle.length > 0
        },
        { timeout: 10_000 },
      )
      .toBe(true)

    await gotoRoute(page, '#/activity')
    await expect(page).toHaveURL(/#\/activity$/)
    await expect(page.locator('[data-activity-list]')).toBeVisible({
      timeout: 10_000,
    })
    await expect(
      page.locator('[data-activity-list]').getByText(bannerTitle).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('P03-T13 / P03-T15: activity and org live updates with 375px overflow check', async ({
    page,
  }) => {
    await loginAsBoss(page)

    // On ./#/activity, verify [data-activity-row] rows are visible and document.documentElement.scrollWidth <= document.documentElement.clientWidth
    await gotoRoute(page, '#/activity')
    await expect(page.locator('[data-activity-list]')).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.locator('[data-activity-row]').first()).toBeVisible({
      timeout: 10_000,
    })

    const activityOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    )
    expect(activityOverflow).toBe(true)

    // On ./#/org, verify [data-employee-id] rows show live statuses ([data-employee-activity]) and document.documentElement.scrollWidth <= document.documentElement.clientWidth
    await gotoRoute(page, '#/org')
    await expect(page.locator('[data-org-list]')).toBeVisible({ timeout: 10_000 })

    const employeeRows = page.locator('[data-employee-id]')
    await expect(employeeRows.first()).toBeVisible({ timeout: 10_000 })

    const firstActivity = await employeeRows
      .first()
      .getAttribute('data-employee-activity')
    expect(firstActivity).toBeTruthy()

    const orgOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    )
    expect(orgOverflow).toBe(true)
  })
})
