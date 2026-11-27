// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { OrgConfig } from '@/domain/config'
import { I18nProvider } from '@/i18n'
import { loadConfig, seedConfig } from '@/office/configStore'
import { PolicyForm } from '../PolicyForm'

let config: OrgConfig
beforeAll(async () => {
  config = await loadConfig()
})
afterEach(cleanup)

function renderForm() {
  return render(
    <I18nProvider>
      <PolicyForm saved={config.policy} seed={seedConfig().policy} />
    </I18nProvider>,
  )
}

const tempCap = () => screen.getByLabelText('Số nhân viên tạm tối đa') as HTMLInputElement
const save = () => screen.getByRole('button', { name: 'Lưu' }) as HTMLButtonElement
const resetTempCap = () =>
  screen.getByRole('button', { name: 'Đặt lại về mặc định: Số nhân viên tạm tối đa' }) as HTMLButtonElement

describe('PolicyForm', () => {
  it('starts clean: Lưu and the per-field reset are disabled', () => {
    renderForm()
    expect(tempCap().value).toBe('10')
    expect(save().disabled).toBe(true)
    expect(resetTempCap().disabled).toBe(true)
  })

  it('enables Lưu after a change, and "Mặc định" restores 10', () => {
    renderForm()
    fireEvent.change(tempCap(), { target: { value: '4' } })
    expect(tempCap().value).toBe('4')
    expect(save().disabled).toBe(false)
    expect(resetTempCap().disabled).toBe(false)
    fireEvent.click(resetTempCap())
    expect(tempCap().value).toBe('10')
    expect(save().disabled).toBe(true)
  })

  it('blocks Lưu for an out-of-range value and shows the range', () => {
    renderForm()
    fireEvent.change(tempCap(), { target: { value: '99' } })
    expect(save().disabled).toBe(true)
    expect(screen.getAllByText(/Từ 0 đến 50 người/).length).toBeGreaterThan(0)
  })

  it('groups the form as Nhân sự tạm · Nhờ hỗ trợ · Ưu tiên · Duyệt · Lịch làm việc', () => {
    renderForm()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.slice(0, 5)).toEqual(['Nhân sự tạm', 'Nhờ hỗ trợ', 'Ưu tiên', 'Duyệt', 'Lịch làm việc'])
  })
})
