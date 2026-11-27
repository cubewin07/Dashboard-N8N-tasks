import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// P11-T08 acceptance: the credits page lists every row of credits.json with licence and link.
const credits = JSON.parse(readFileSync('public/assets/credits.json', 'utf8')) as {
  assets: { path: string; license: string; source: string }[]
}

test('credits page lists every asset with its licence and source', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'content check, one layout is enough')
  await page.goto('./#/login')
  await page.locator('#login-email').fill('boss@demo.local')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/#\/(\?.*)?$/)
  await page.goto('./#/credits')
  await expect(page.locator('[data-credits-group]').first()).toBeVisible()
  await expect(page).toHaveTitle('Ghi công · Shop HQ')

  const rows = page.locator('[data-credit-row]')
  await expect(rows).toHaveCount(credits.assets.length)
  const listed = await rows.evaluateAll((els) =>
    els.map((el) => ({
      path: el.getAttribute('data-credit-row'),
      links: [...el.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''),
    })),
  )
  expect(listed.map((r) => r.path).sort()).toEqual(credits.assets.map((a) => a.path).sort())
  for (const row of listed) {
    expect(row.links[0], `${row.path} licence`).toMatch(/^https:\/\/(creativecommons|openfontlicense)\.org\//)
    expect(row.links[1], `${row.path} source`).toMatch(/^https:\/\//)
  }
})
