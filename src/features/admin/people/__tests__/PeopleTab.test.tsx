import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OrgConfigSchema, type OrgConfig } from '@/domain/config'
import { applyConfigChange } from '@/domain/configChange'
import type { ConfigSource } from '@/ports/ConfigSource'
import { I18nProvider } from '@/i18n'
import { loadConfig, setConfigActorGetter, seedConfig, setConfigSource, useConfigStore } from '@/office/configStore'
import { PeopleTab } from '../../tabs/PeopleTab'

// Radix checkboxes observe their size; jsdom has no ResizeObserver.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub

/** In-memory source: the Local adapter's apply is built by another task (P10-T03). */
function memorySource(): ConfigSource {
  let current: OrgConfig = seedConfig()
  return {
    load: async () => current,
    subscribe: () => () => {},
    apply: async (change) => {
      current = applyConfigChange(current, change)
    },
    history: async () => [],
  }
}

beforeEach(async () => {
  setConfigSource(memorySource())
  setConfigActorGetter(() => ({ userId: 'boss', role: 'boss', displayName: 'Sếp' }))
  await loadConfig()
})
afterEach(cleanup)

function setup() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <PeopleTab />
      </MemoryRouter>
    </I18nProvider>,
  )
}

const employees = () => useConfigStore.getState().config!.employees

describe('PeopleTab (R5)', () => {
  it('lists people in a semantic table with row actions that link to the office and the wardrobe', () => {
    setup()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').length).toBeGreaterThanOrEqual(6)
    const row = table.querySelector('[data-employee-id="emp_trang"]') as HTMLElement
    expect(row).toBeTruthy()
    const follow = within(row).getByRole('link', { name: /Xem trong văn phòng: Trang/ })
    expect(follow.getAttribute('href')).toBe('/?follow=emp_trang')
    const look = within(row).getByRole('link', { name: /Đổi diện mạo: Trang/ })
    expect(look.getAttribute('href')).toBe('/wardrobe?id=emp_trang')
  })

  it('filters by kind and state with labelled selects', () => {
    setup()
    const before = document.querySelectorAll('tbody tr').length
    fireEvent.change(screen.getByLabelText('Loại'), { target: { value: 'temp' } })
    const after = document.querySelectorAll('tbody tr').length
    expect(after).toBeLessThan(before)
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'archived' } })
    expect(screen.getByText('Không có ai khớp bộ lọc.')).toBeTruthy()
  })

  it('hires a person: saves a valid employee.upsert with a new unique id, active, created by the boss', async () => {
    setup()
    const count = employees().length
    fireEvent.click(screen.getByRole('button', { name: 'Tuyển người' }))
    const save = await screen.findByRole('button', { name: 'Lưu' })
    expect((save as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Tuấn Khải' } })
    fireEvent.change(screen.getByLabelText('Loại nhân sự'), { target: { value: 'temp' } })
    const dept = within(screen.getByRole('dialog')).getByLabelText('Phòng ban') as HTMLSelectElement
    const cs = useConfigStore.getState().config!.departments.find((d) => d.key === 'cs')!
    fireEvent.change(dept, { target: { value: cs.id } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trả lời tin nhắn' }))
    expect((save as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(save)

    await waitFor(() => expect(employees()).toHaveLength(count + 1))
    const hired = employees().find((e) => e.name === 'Tuấn Khải')!
    expect(hired).toMatchObject({
      id: 'emp_tuan_khai',
      kind: 'temp',
      state: 'active',
      departmentId: cs.id,
      roleKey: 'worker',
      specialties: ['customer_chat'],
      createdBy: 'boss',
      archivedAt: null,
    })
    expect(OrgConfigSchema.safeParse(useConfigStore.getState().config).success).toBe(true)
  })

  it('lists the department specialties first in the hire form', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Tuyển người' }))
    const sheet = await screen.findByRole('dialog')
    const cs = useConfigStore.getState().config!.departments.find((d) => d.key === 'cs')!
    fireEvent.change(within(sheet).getByLabelText('Phòng ban'), { target: { value: cs.id } })
    expect(within(sheet).getByText('Của phòng này')).toBeTruthy()
    const names = within(sheet)
      .getAllByRole('checkbox')
      .map((c) => c.getAttribute('id'))
    expect(names[0]).toContain('spec-customer_chat')
  })

  it('edits without touching the other fields, then dismisses and restores', async () => {
    setup()
    const thu = employees().find((e) => e.id === 'emp_trang')!
    fireEvent.click(screen.getByRole('button', { name: /^Sửa: Trang$/ }))
    const name = (await screen.findByLabelText('Tên')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Trang Thảo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(employees().find((e) => e.id === 'emp_trang')!.name).toBe('Trang Thảo'))
    expect(employees().find((e) => e.id === 'emp_trang')).toEqual({ ...thu, name: 'Trang Thảo' })

    // Dismiss through the confirmation dialog.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Lưu' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /^Cho nghỉ: Trang Thảo$/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Cho nghỉ Trang Thảo?')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cho nghỉ' }))
    await waitFor(() => expect(employees().find((e) => e.id === 'emp_trang')!.state).toBe('archived'))

    // Archive list shows who / when / why, and Restore brings them back.
    const archive = document.querySelector('[data-admin-archive]') as HTMLElement
    const item = archive.querySelector('[data-employee-id="emp_trang"]') as HTMLElement
    expect(item).toBeTruthy()
    expect(within(item).getByText('Khi nào')).toBeTruthy()
    expect(within(item).getByText('Lý do')).toBeTruthy()
    fireEvent.click(within(item).getByRole('button', { name: /Khôi phục/ }))
    await waitFor(() => expect(employees().find((e) => e.id === 'emp_trang')!.state).toBe('active'))
    expect(employees().find((e) => e.id === 'emp_trang')!.archivedAt).toBeNull()
  })
})
