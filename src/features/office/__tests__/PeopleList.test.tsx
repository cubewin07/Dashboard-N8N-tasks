import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { makeConfig, makeSampleTask, makeState } from '@/domain/__fixtures__/builders'
import type { Employee } from '@/domain/config'
import type { DepartmentId, EmployeeId, ReviewId, TaskId } from '@/domain/primitives'
import type { OfficeState, ReviewItem } from '@/domain/work'
import { I18nProvider } from '@/i18n'
import { useConfigStore } from '@/office/configStore'
import { useOffice } from '@/office/store'
import { usePeopleUi } from '@/office/uiStore'
import { PeopleList } from '../PeopleList'
import { PersonDrawer } from '../PersonDrawer'

function employee(id: string, name: string, overrides: Partial<Employee> = {}): Employee {
  return {
    id: id as EmployeeId,
    name,
    departmentId: 'dep_cs' as DepartmentId,
    roleKey: 'worker',
    specialties: [],
    kind: 'core',
    state: 'active',
    reviewMode: 'always',
    modelTierOverride: null,
    bio: null,
    createdAt: '2026-11-10T00:00:00Z',
    createdBy: 'seed',
    archivedAt: null,
    ...overrides,
  }
}

function buildState(): OfficeState {
  const base = makeConfig()
  const config = makeConfig({
    employees: [
      ...base.employees,
      employee('emp_bao', 'Bảo', { createdAt: '2026-11-10T00:00:01Z' }),
      employee('emp_duc', 'Đức', { createdAt: '2026-11-10T00:00:02Z' }),
      employee('emp_gone', 'Tạm', {
        kind: 'temp',
        state: 'archived',
        archivedAt: '2026-11-11T00:00:00Z',
      }),
    ],
  })
  const state = makeState(config)
  const task = makeSampleTask({
    id: 'task_bao' as TaskId,
    title: 'Trả lời khách hỏi size áo',
    assigneeId: 'emp_bao' as EmployeeId,
    status: 'in_progress',
  })
  const review: ReviewItem = {
    id: 'rev_1' as ReviewId,
    taskId: task.id,
    assigneeId: 'emp_ngoc' as EmployeeId,
    level: 'reviewer',
    priority: 'high',
    status: 'pending',
    decidedAt: null,
    decidedBy: null,
    note: null,
    createdAt: '2026-11-11T08:10:00Z',
  }
  return {
    ...state,
    people: {
      ...state.people,
      emp_bao: {
        ...state.people['emp_bao' as EmployeeId]!,
        activity: 'working',
        taskId: task.id,
      },
    },
    tasks: { ...state.tasks, [task.id]: task },
    reviews: { ...state.reviews, [review.id]: review },
  }
}

function renderUi(variant: 'panel' | 'page' = 'panel') {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <PeopleList variant={variant} />
        <PersonDrawer />
      </I18nProvider>
    </MemoryRouter>,
  )
}

const row = (c: HTMLElement, id: string) =>
  c.querySelector<HTMLElement>(`[data-person-row="${id}"]`)!
const rowIds = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[data-person-row]')).map((el) =>
    el.getAttribute('data-person-row'),
  )
const liveText = (c: HTMLElement) =>
  c.querySelector('[data-follow-announcer]')?.textContent

describe('PeopleList + PersonDrawer (P04-T11, P04-T12)', () => {
  beforeEach(() => {
    const state = buildState()
    useConfigStore.setState({ config: state.config, status: 'ready', error: null })
    useOffice.setState({ state })
    usePeopleUi.setState({ selectedId: null, followedId: null, hoveredId: null })
  })

  afterEach(() => {
    cleanup()
    useOffice.setState({ state: null })
  })

  it('groups active people by department with counts, in org order', () => {
    const { container } = renderUi()
    const groups = Array.from(container.querySelectorAll('[data-people-group]'))
    expect(
      groups.map((g) => [
        g.getAttribute('data-people-group'),
        g.querySelector('[data-people-group-count]')?.textContent,
      ]),
    ).toEqual([
      ['boss', '1'],
      ['management', '1'],
      ['cs', '4'],
    ])
    expect(rowIds(container)).toEqual([
      'emp_owner_1',
      'emp_thu',
      'emp_ngoc',
      'emp_mai',
      'emp_bao',
      'emp_duc',
    ])
    // Archived people are not listed.
    expect(screen.queryByText('Tạm')).toBeNull()
    expect(
      screen.getByRole('region', { name: 'Chăm sóc khách hàng: 4 người' }),
    ).toBeTruthy()
  })

  it('shows status, role and the current task on a row', () => {
    const { container } = renderUi()
    const li = container.querySelector('[data-employee-id="emp_bao"]')!
    expect(li.getAttribute('data-employee-activity')).toBe('working')
    expect(li.querySelector('[data-person-task]')?.textContent).toBe(
      'Trả lời khách hỏi size áo',
    )
    expect(li.querySelector('.bg-working')).toBeTruthy()
    expect(
      container.querySelector('[data-employee-id="emp_duc"] [data-person-task]')
        ?.textContent,
    ).toBe('Rảnh')
  })

  it('search ignores case and diacritics: "bao" finds "Bảo", "duc" finds "Đức"', () => {
    const { container } = renderUi()
    const search = screen.getByRole('searchbox', { name: 'Tìm nhân sự theo tên' })

    fireEvent.change(search, { target: { value: 'bao' } })
    expect(rowIds(container)).toEqual(['emp_bao'])

    fireEvent.change(search, { target: { value: 'DUC' } })
    expect(rowIds(container)).toEqual(['emp_duc'])

    fireEvent.change(search, { target: { value: 'khongco' } })
    expect(rowIds(container)).toEqual([])
    expect(screen.getByRole('status').textContent).toContain('khongco')
  })

  it('uses a roving tabindex and moves with the arrow keys, Home and End', () => {
    const { container } = renderUi()
    const tabbable = () =>
      Array.from(container.querySelectorAll('[data-person-row][tabindex="0"]')).map(
        (el) => el.getAttribute('data-person-row'),
      )
    expect(tabbable()).toEqual(['emp_owner_1'])

    const search = screen.getByRole('searchbox')
    search.focus()
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(row(container, 'emp_owner_1'))

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(row(container, 'emp_thu'))
    expect(tabbable()).toEqual(['emp_thu'])

    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    expect(document.activeElement).toBe(row(container, 'emp_duc'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(row(container, 'emp_duc'))

    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(document.activeElement).toBe(row(container, 'emp_owner_1'))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(search)
  })

  it('keeps list keys away from the scene shortcuts on window', () => {
    const { container } = renderUi()
    const onWindowKey = vi.fn()
    window.addEventListener('keydown', onWindowKey)
    try {
      const first = row(container, 'emp_owner_1')
      first.focus()
      fireEvent.keyDown(first, { key: 'ArrowDown' })
      fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
      expect(onWindowKey).not.toHaveBeenCalled()
      // Nothing left to clear: Esc goes through to the scene.
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
      expect(onWindowKey).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('keydown', onWindowKey)
    }
  })

  it('Enter follows and selects the person, announces it, and keeps focus in the list', () => {
    const { container } = renderUi()
    const bao = row(container, 'emp_bao')
    bao.focus()
    fireEvent.keyDown(bao, { key: 'Enter' })

    expect(usePeopleUi.getState().followedId).toBe('emp_bao')
    expect(usePeopleUi.getState().selectedId).toBe('emp_bao')
    expect(liveText(container)).toBe('Đang theo dõi Bảo')
    expect(document.activeElement).toBe(bao)
    expect(
      screen.getByRole('button', { name: 'Theo dõi Bảo' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByRole('button', { name: 'Theo dõi Đức' }).getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('Esc ends follow first, then clears the search', () => {
    const { container } = renderUi()
    const search = screen.getByRole('searchbox') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'bao' } })
    const bao = row(container, 'emp_bao')
    bao.focus()
    fireEvent.keyDown(bao, { key: 'Enter' })
    expect(usePeopleUi.getState().followedId).toBe('emp_bao')

    fireEvent.keyDown(bao, { key: 'Escape' })
    expect(usePeopleUi.getState().followedId).toBeNull()
    expect(liveText(container)).toBe('Đã dừng theo dõi')
    expect(search.value).toBe('bao')

    fireEvent.keyDown(bao, { key: 'Escape' })
    expect(search.value).toBe('')
    expect(rowIds(container)).toHaveLength(6)
  })

  it('the follow button toggles follow and reflects follow started elsewhere', () => {
    const { container } = renderUi()
    const button = screen.getByRole('button', { name: 'Theo dõi Mai' })
    expect(button.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(button)
    expect(usePeopleUi.getState().followedId).toBe('emp_mai')
    expect(usePeopleUi.getState().selectedId).toBeNull()
    expect(button.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(button)
    expect(usePeopleUi.getState().followedId).toBeNull()

    // The 3D scene starts following someone.
    act(() => usePeopleUi.getState().follow('emp_duc' as EmployeeId))
    expect(liveText(container)).toBe('Đang theo dõi Đức')
    expect(
      container.querySelector('[data-employee-id="emp_duc"]')?.getAttribute('data-followed'),
    ).toBe('true')
  })

  it('the panel variant collapses and expands; the page variant has no toggle', () => {
    const { container, unmount } = renderUi('panel')
    expect(container.querySelector('[data-people-list]')?.className).toContain(
      'pointer-events-auto',
    )
    const toggle = screen.getByRole('button', { name: 'Thu gọn danh sách nhân sự' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toBe('Mở danh sách nhân sự')
    expect(screen.queryByRole('searchbox')).toBeNull()
    unmount()

    renderUi('page')
    expect(screen.queryByRole('button', { name: 'Thu gọn danh sách nhân sự' })).toBeNull()
    expect(screen.getByRole('searchbox')).toBeTruthy()
  })

  it('clicking a row opens the drawer for that person; closing restores focus', () => {
    const { container } = renderUi()
    expect(container.querySelector('[data-person-drawer]')).toBeNull()

    const bao = row(container, 'emp_bao')
    bao.focus()
    fireEvent.click(bao)
    expect(bao.getAttribute('aria-current')).toBe('true')

    const drawer = screen.getByRole('complementary', { name: 'Thông tin nhân sự: Bảo' })
    expect(document.activeElement).toBe(drawer)
    const field = (name: string) =>
      drawer.querySelector(`[data-drawer-field="${name}"]`)?.textContent
    expect(within(drawer).getByRole('heading', { name: 'Bảo' })).toBeTruthy()
    expect(field('department')).toBe('Chăm sóc khách hàng')
    expect(field('activity')).toBe('Đang làm')
    expect(field('task')).toBe('Trả lời khách hỏi size áo')
    expect(field('pile')).toBe('0')
    expect(field('queue')).toBe('1')
    expect(within(drawer).queryByRole('link')).toBeNull()

    fireEvent.click(within(drawer).getByRole('button', { name: 'Theo dõi' }))
    expect(usePeopleUi.getState().followedId).toBe('emp_bao')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Dừng theo dõi' }))
    expect(usePeopleUi.getState().followedId).toBeNull()

    fireEvent.keyDown(drawer, { key: 'Escape' })
    expect(usePeopleUi.getState().selectedId).toBeNull()
    expect(container.querySelector('[data-person-drawer]')).toBeNull()
    expect(document.activeElement).toBe(bao)
  })

  it('the drawer links approvers with a pile to the queue and closes when the person is archived', () => {
    const { container } = renderUi()
    act(() => usePeopleUi.getState().select('emp_ngoc' as EmployeeId))

    const drawer = container.querySelector<HTMLElement>('[data-person-drawer="emp_ngoc"]')!
    expect(drawer.querySelector('[data-drawer-field="pile"]')?.textContent).toBe('1')
    expect(
      within(drawer).getByRole('link', { name: 'Mở hàng chờ duyệt' }).getAttribute('href'),
    ).toBe('/queue')

    fireEvent.click(within(drawer).getByRole('button', { name: 'Đóng' }))
    expect(usePeopleUi.getState().selectedId).toBeNull()

    act(() => usePeopleUi.getState().select('emp_duc' as EmployeeId))
    expect(container.querySelector('[data-person-drawer="emp_duc"]')).toBeTruthy()
    const state = useOffice.getState().state!
    act(() => {
      useOffice.setState({
        state: {
          ...state,
          config: {
            ...state.config,
            employees: state.config.employees.map((e) =>
              e.id === 'emp_duc' ? { ...e, state: 'archived' as const } : e,
            ),
          },
        },
      })
    })
    expect(container.querySelector('[data-person-drawer]')).toBeNull()
    expect(usePeopleUi.getState().selectedId).toBeNull()
  })

  it('exposes labelled controls only (manual a11y check; no axe dependency in this repo)', () => {
    const { container } = renderUi()
    expect(screen.getByRole('region', { name: 'Nhân sự' })).toBeTruthy()
    for (const el of Array.from(container.querySelectorAll('button, input'))) {
      const name =
        el.getAttribute('aria-label') ||
        el.textContent?.trim() ||
        (el.id && container.querySelector(`label[for="${el.id}"]`)?.textContent)
      expect(name, el.outerHTML.slice(0, 80)).toBeTruthy()
    }
    const announcer = container.querySelector('[data-follow-announcer]')
    expect(announcer?.getAttribute('aria-live')).toBe('polite')
    // Exactly one tab stop among the rows.
    expect(container.querySelectorAll('[data-person-row][tabindex="0"]')).toHaveLength(1)
  })
})
