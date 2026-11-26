// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { OrgConfig } from '@/domain/config'
import { I18nProvider } from '@/i18n'
import { loadConfig } from '@/office/configStore'
import { DepartmentEditor } from '../DepartmentEditor'

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

function renderEditor(key: string | null) {
  const department = key ? config.departments.find((d) => d.key === key)! : null
  return render(
    <I18nProvider>
      <DepartmentEditor config={config} department={department} onClose={vi.fn()} />
    </I18nProvider>,
  )
}

const saveButton = () => screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement

describe('DepartmentEditor', () => {
  it('shows the refusal and keeps Lưu disabled when deactivating a department with staff', () => {
    renderEditor('cs')
    expect(saveButton().disabled).toBe(true)
    fireEvent.click(screen.getByRole('switch', { name: 'Đang dùng' }))
    const refusal = screen.getByTestId('department-refusal')
    expect(refusal.textContent).toContain('Không thể ngừng dùng')
    expect(saveButton().disabled).toBe(true)
  })

  it('enables Lưu after a rename and keeps the key read-only', () => {
    renderEditor('cs')
    const key = screen.getByLabelText('Mã') as HTMLInputElement
    expect(key.readOnly).toBe(true)
    fireEvent.change(screen.getByLabelText('Tên (tiếng Việt)'), { target: { value: 'CSKH' } })
    expect(saveButton().disabled).toBe(false)
  })

  it('derives the key from the label when adding, and needs a label to save', () => {
    renderEditor(null)
    expect(saveButton().disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Tên (tiếng Việt)'), { target: { value: 'Kho vận' } })
    expect((screen.getByLabelText('Mã') as HTMLInputElement).value).toBe('kho_van')
    expect(saveButton().disabled).toBe(false)
  })
})
