// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '@/office/configStore'
import type { OrgConfig } from '@/domain/config'
import { I18nProvider } from '@/i18n'
import { PeoplePicker } from '../PeoplePicker'
import { buildWardrobePeople } from '../peopleModel'

let config: OrgConfig
beforeAll(async () => {
  config = await loadConfig()
})
afterEach(cleanup)

function setup(onSelect = vi.fn()) {
  const people = buildWardrobePeople({
    ...config,
    employees: [...config.employees, { ...config.employees[4]!, id: 'emp_old' as never, name: 'Cựu Binh', state: 'archived' }],
  })
  render(
    <I18nProvider>
      <PeoplePicker people={people} departments={config.departments} selectedId={null} onSelect={onSelect} />
    </I18nProvider>,
  )
  return { people, onSelect }
}

describe('PeoplePicker', () => {
  it('lists owners first and hides archived people until toggled', () => {
    const { people } = setup()
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options[0]!.textContent).toContain(people[0]!.name)
    expect(screen.queryByText(/Cựu Binh/)).toBeNull()
    fireEvent.click(screen.getByTestId('wardrobe-archived-toggle'))
    expect(screen.getByText(/Cựu Binh/)).toBeTruthy()
  })

  it('filters by name without diacritics', () => {
    setup()
    fireEvent.change(screen.getByTestId('wardrobe-search'), { target: { value: 'pho giam' } })
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]!.textContent).toContain('Phó giám đốc')
    fireEvent.change(screen.getByTestId('wardrobe-search'), { target: { value: 'zzz' } })
    expect(within(screen.getByRole('listbox')).queryAllByRole('option')).toHaveLength(0)
  })

  it('moves with the arrow keys and selects with Enter', () => {
    const { onSelect, people } = setup()
    const list = screen.getByRole('listbox')
    list.focus()
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(list.getAttribute('aria-activedescendant')).toContain(people[0]!.id)
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(list.getAttribute('aria-activedescendant')).toContain(people[1]!.id)
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(people[1]!.id)
    fireEvent.keyDown(list, { key: 'End' })
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    expect(list.getAttribute('aria-activedescendant')).not.toContain(people[1]!.id)
  })

  it('selects on click', () => {
    const { onSelect, people } = setup()
    fireEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[2]!)
    expect(onSelect).toHaveBeenCalledWith(people[2]!.id)
  })
})
