import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '@/i18n'
import { bootOffice, stopOffice } from '@/office/store'
import { OrgPage } from '../OrgPage'

describe('OrgPage (R12)', () => {
  afterEach(() => {
    stopOffice()
  })

  it('renders boss floor first, management second, and 4 department sections with 28 staff', async () => {
    await bootOffice()

    const { container } = render(
      <I18nProvider>
        <OrgPage />
      </I18nProvider>,
    )

    const sections = Array.from(container.querySelectorAll('section[data-floor-key]'))
    expect(sections.map((s) => s.getAttribute('data-floor-key'))).toEqual([
      'boss',
      'management',
      'accounting',
      'design',
      'marketing',
      'cs',
    ])

    const peopleRows = container.querySelectorAll('[data-employee-id]')
    expect(peopleRows).toHaveLength(28)

    expect(screen.getByText('Chăm sóc khách hàng')).toBeTruthy()
    expect(screen.getByText('Giám đốc')).toBeTruthy()
    expect(screen.getByText('Thu')).toBeTruthy()
  })
})
