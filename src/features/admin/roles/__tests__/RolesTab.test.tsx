import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyConfigChange, BUILT_IN_ROLE_KEYS } from '@/domain/configChange'
import type { OrgConfig, RoleDef } from '@/domain/config'
import { I18nProvider } from '@/i18n'
import {
  applyConfigEdit,
  loadConfig,
  seedConfig,
  setConfigActorGetter,
  setConfigSource,
  useConfigStore,
} from '@/office/configStore'
import type { ConfigSource } from '@/ports/ConfigSource'
import { RolesTab } from '../../tabs/RolesTab'
import { roleDeleteBlock } from '../roleModel'

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

const roles = () => useConfigStore.getState().config!.roles

function setup() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <RolesTab />
      </MemoryRouter>
    </I18nProvider>,
  )
}

const intern: RoleDef = {
  key: 'thuc_tap_sinh',
  label: { vi: 'Thực tập sinh', en: 'Intern' },
  scope: 'department',
  caps: {
    assignTasks: false,
    approveLevel: 'reviewer',
    distributeReviews: false,
    answerQuestions: false,
    doWork: true,
    humanOwner: false,
  },
  modelTier: 'cheap',
  maxPerDepartment: null,
  workspace: 'desk',
  sortOrder: 99,
}

describe('RolesTab (R3)', () => {
  it('shows a lock badge and no delete button on every built-in role', () => {
    setup()
    const cards = document.querySelectorAll('[data-role-key]')
    expect(cards).toHaveLength(roles().length)
    for (const key of BUILT_IN_ROLE_KEYS) {
      const card = document.querySelector(`[data-role-key="${key}"]`) as HTMLElement
      expect(card.getAttribute('data-built-in')).toBe('true')
      expect(within(card).getByText('Có sẵn')).toBeTruthy()
      expect(within(card).queryByRole('button', { name: /^Xoá vai trò/ })).toBeNull()
      expect(within(card).getByRole('button', { name: /^Sửa:/ })).toBeTruthy()
    }
  })

  it('locks scope and the owner capability of a built-in role in the editor', async () => {
    setup()
    const card = document.querySelector('[data-role-key="owner"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /^Sửa:/ }))
    const sheet = await screen.findByRole('dialog')
    expect((within(sheet).getByLabelText('Phạm vi') as HTMLSelectElement).disabled).toBe(true)
    expect(within(sheet).getByRole('checkbox', { name: /Chủ sở hữu/ }).hasAttribute('disabled')).toBe(true)
    expect(within(sheet).getByRole('checkbox', { name: /Giao việc/ }).hasAttribute('disabled')).toBe(false)
    expect((within(sheet).getByLabelText('Mã vai trò') as HTMLInputElement).disabled).toBe(true)
  })

  it('creates a custom role with approveLevel reviewer and a key derived from the name', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vai trò' }))
    const sheet = await screen.findByRole('dialog')
    const save = within(sheet).getByRole('button', { name: 'Lưu' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(within(sheet).getByLabelText('Tên (tiếng Việt)'), { target: { value: 'Thực tập sinh' } })
    expect((within(sheet).getByLabelText('Mã vai trò') as HTMLInputElement).value).toBe('thuc_tap_sinh')
    fireEvent.change(within(sheet).getByLabelText('Cấp duyệt'), { target: { value: 'reviewer' } })
    fireEvent.change(within(sheet).getByLabelText('Tối đa mỗi phòng ban'), { target: { value: '3' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await waitFor(() => expect(roles().some((r) => r.key === 'thuc_tap_sinh')).toBe(true))
    const created = roles().find((r) => r.key === 'thuc_tap_sinh')!
    expect(created.caps.approveLevel).toBe('reviewer')
    expect(created.maxPerDepartment).toBe(3)
    expect(created.label.en).toBe('Thực tập sinh')
    expect(created.sortOrder).toBeGreaterThan(Math.max(...BUILT_IN_ROLE_KEYS.map((k) => roles().find((r) => r.key === k)!.sortOrder)))
  })

  it('refuses a bad max-per-department number and a taken key', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vai trò' }))
    const sheet = await screen.findByRole('dialog')
    fireEvent.change(within(sheet).getByLabelText('Tên (tiếng Việt)'), { target: { value: 'Thợ' } })
    fireEvent.change(within(sheet).getByLabelText('Tối đa mỗi phòng ban'), { target: { value: 'abc' } })
    expect((within(sheet).getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(within(sheet).getByLabelText('Tối đa mỗi phòng ban'), { target: { value: '' } })
    fireEvent.change(within(sheet).getByLabelText('Mã vai trò'), { target: { value: 'worker' } })
    expect(within(sheet).getByText('Mã này đã có, chọn mã khác.')).toBeTruthy()
    expect((within(sheet).getByRole('button', { name: 'Lưu' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables delete with a reason while someone holds the custom role, then allows it', async () => {
    await applyConfigEdit({ kind: 'role.upsert', role: intern })
    const worker = useConfigStore.getState().config!.employees.find((e) => e.roleKey === 'worker')!
    await applyConfigEdit({ kind: 'employee.upsert', employee: { ...worker, roleKey: 'thuc_tap_sinh' } })
    expect(roleDeleteBlock(useConfigStore.getState().config!, intern)).toEqual({ reason: 'holders', n: 1 })
    setup()

    const card = document.querySelector('[data-role-key="thuc_tap_sinh"]') as HTMLElement
    const del = within(card).getByRole('button', { name: /^Xoá vai trò/ }) as HTMLButtonElement
    expect(del.disabled).toBe(true)
    expect(within(card).getByText(/Còn 1 người đang giữ vai trò này/)).toBeTruthy()

    // An archived holder still counts.
    await act(() => applyConfigEdit({ kind: 'employee.archive', id: worker.id, reason: 'dismissed' }))
    expect((within(card).getByRole('button', { name: /^Xoá vai trò/ }) as HTMLButtonElement).disabled).toBe(true)

    await act(() =>
      applyConfigEdit({ kind: 'employee.upsert', employee: { ...worker, roleKey: 'worker', state: 'archived' } }),
    )
    const enabled = within(card).getByRole('button', { name: /^Xoá vai trò/ }) as HTMLButtonElement
    expect(enabled.disabled).toBe(false)
    fireEvent.click(enabled)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá vai trò' }))
    await waitFor(() => expect(roles().some((r) => r.key === 'thuc_tap_sinh')).toBe(false))
  })
})

describe('roleDeleteBlock', () => {
  it('blocks built-ins, blocks held custom roles, allows unused custom roles', () => {
    const cfg = seedConfig()
    expect(roleDeleteBlock(cfg, cfg.roles.find((r) => r.key === 'worker')!)).toEqual({ reason: 'builtIn' })
    const withRole = applyConfigChange(cfg, { kind: 'role.upsert', role: intern })
    expect(roleDeleteBlock(withRole, intern)).toBeNull()
  })
})
