import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { common as en } from '@/i18n/en/common'
import { common as vi } from '@/i18n/vi/common'

// R13: index.html cannot read i18n, so this keeps its static name in step with it.
describe('branding', () => {
  const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8')

  it('index.html uses the app name from i18n', () => {
    const name = vi.app.name
    expect(html).toContain(`<title>${name}</title>`)
    expect(html).toContain(`<meta name="application-name" content="${name}" />`)
    expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${name}" />`)
    expect(en.app.name).toBe(name)
  })

  it('has icons and no manifest (no PWA, P11 D7)', () => {
    expect(html).toContain('href="./favicon.svg"')
    expect(html).toContain('href="./apple-touch-icon.png"')
    expect(html).not.toContain('rel="manifest"')
  })
})
