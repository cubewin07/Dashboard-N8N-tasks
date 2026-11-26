import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { OrgConfig } from '@/domain/config'
import { applyConfigChange } from '@/domain/configChange'
import { I18nProvider } from '@/i18n'
import { loadConfig, seedConfig, setConfigActorGetter, setConfigSource, useConfigStore } from '@/office/configStore'
import type { ConfigSource } from '@/ports/ConfigSource'
import { SpecialtiesTab } from '../../tabs/SpecialtiesTab'
import { specialtyDeleteBlock, specialtyUsage } from '../specialtyModel'

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

const specialties = () => useConfigStore.getState().config!.specialties

function setup() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <SpecialtiesTab />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('specialtyModel', () => {
  it('counts people and task types, blocks delete while used', () => {
    const cfg = seedConfig()
    const used = cfg.specialties.find((s) => specialtyUsage(cfg, s.key).people > 0)!
    expect(specialtyDeleteBlock(cfg, used)).not.toBeNull()
    const extra = { key: 'rong', label: { vi: 'Rỗng', en: 'Empty' }, icon: 'Sparkles', homeDepartmentKey: null }
    const cfg2 = applyConfigChange(cfg, { kind: 'specialty.upsert', specialty: extra })
    expect(specialtyDeleteBlock(cfg2, extra)).toBeNull()
  })

  it('counts a task type that only lists it as a helper', () => {
    const cfg = seedConfig()
    const extra = { key: 'helper_only', label: { vi: 'H', en: 'H' }, icon: 'Sparkles', homeDepartmentKey: null }
    const cfg2 = applyConfigChange(applyConfigChange(cfg, { kind: 'specialty.upsert', specialty: extra }), {
      kind: 'taskType.upsert',
      taskType: { ...cfg.taskTypes[0]!, key: 'x.helper', needsHelpFrom: ['helper_only'] },
    })
    expect(specialtyUsage(cfg2, 'helper_only')).toEqual({ people: 0, taskTypes: 1 })
  })
})

describe('SpecialtiesTab (R4)', () => {
  it('disables delete with a reason for used specialties', () => {
    setup()
    const used = document.querySelector('[data-specialty-key="customer_chat"]') as HTMLElement
    expect((within(used).getByRole('button', { name: /^Xoá chuyên môn/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(used).getByText(/không xoá được/)).toBeTruthy()
    // renaming is still possible
    expect((within(used).getByRole('button', { name: /^Sửa:/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('creates a specialty with a home department, renames it (key stays), then deletes it', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Thêm chuyên môn' }))
    let sheet = await screen.findByRole('dialog')
    fireEvent.change(within(sheet).getByLabelText('Tên (tiếng Việt)'), { target: { value: 'Quay phim' } })
    fireEvent.change(within(sheet).getByLabelText('Phòng ban gốc'), { target: { value: 'design' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(specialties().some((s) => s.key === 'quay_phim')).toBe(true))
    expect(specialties().find((s) => s.key === 'quay_phim')).toMatchObject({
      homeDepartmentKey: 'design',
      label: { vi: 'Quay phim', en: 'Quay phim' },
    })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const card = document.querySelector('[data-specialty-key="quay_phim"]') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: /^Sửa:/ }))
    sheet = await screen.findByRole('dialog')
    expect((within(sheet).getByLabelText('Mã chuyên môn') as HTMLInputElement).disabled).toBe(true)
    fireEvent.change(within(sheet).getByLabelText('Tên (tiếng Việt)'), { target: { value: 'Quay dựng' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(specialties().find((s) => s.key === 'quay_phim')!.label.vi).toBe('Quay dựng'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const card2 = document.querySelector('[data-specialty-key="quay_phim"]') as HTMLElement
    fireEvent.click(within(card2).getByRole('button', { name: /^Xoá chuyên môn/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá chuyên môn' }))
    await waitFor(() => expect(specialties().some((s) => s.key === 'quay_phim')).toBe(false))
  })
})
