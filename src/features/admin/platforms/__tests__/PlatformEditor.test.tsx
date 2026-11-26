// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { OrgConfig } from '@/domain/config'
import { I18nProvider } from '@/i18n'
import { loadConfig } from '@/office/configStore'
import { PlatformEditor } from '../PlatformEditor'

let config: OrgConfig
beforeAll(async () => {
  // Radix Switch measures itself; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  config = await loadConfig()
})
afterEach(cleanup)

describe('PlatformEditor', () => {
  it('limits the badge text to 4 characters', () => {
    const lazada = config.platforms.find((p) => p.key === 'lazada')!
    render(
      <I18nProvider>
        <PlatformEditor config={config} platform={lazada} onClose={vi.fn()} />
      </I18nProvider>,
    )
    const badge = screen.getByLabelText('Chữ trên huy hiệu') as HTMLInputElement
    expect(badge.maxLength).toBe(4)
    fireEvent.change(badge, { target: { value: 'ABCDEFG' } })
    expect(badge.value).toBe('ABCD')
  })

  it('deactivating a platform enables Lưu and the key stays read-only', () => {
    const lazada = config.platforms.find((p) => p.key === 'lazada')!
    render(
      <I18nProvider>
        <PlatformEditor config={config} platform={lazada} onClose={vi.fn()} />
      </I18nProvider>,
    )
    expect((screen.getByLabelText('Mã') as HTMLInputElement).readOnly).toBe(true)
    expect((screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('switch', { name: 'Đang dùng' }))
    expect((screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
