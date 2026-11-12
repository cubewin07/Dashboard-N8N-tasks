import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeSampleTask } from '@/domain/__fixtures__/builders'
import type { Employee } from '@/domain/config'
import type { DepartmentId, EmployeeId, ReviewId, TaskId } from '@/domain/primitives'
import type { ReviewItem } from '@/domain/work'
import { I18nProvider } from '@/i18n'
import { bootOffice, stopOffice, useOffice } from '@/office/store'
import { OrgPage } from '../OrgPage'

describe('OrgPage (R12)', () => {
  afterEach(() => {
    cleanup()
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

  it('updates live task title, platform badge, pile count, and archived section when useOffice state updates', async () => {
    await bootOffice()

    const { container } = render(
      <I18nProvider>
        <OrgPage />
      </I18nProvider>,
    )

    // Initial state: no task title, 0 archived staff
    expect(container.querySelector('[data-person-task]')).toBeNull()
    const archivedSection = container.querySelector('[data-archived-section]')
    expect(archivedSection).toBeTruthy()
    expect(screen.getByText('Nhân sự tạm đã nghỉ (0)')).toBeTruthy()

    const currentState = useOffice.getState().state!
    const targetEmployeeId = 'emp_mai'

    const testTask = makeSampleTask({
      id: 'task_live_test' as TaskId,
      title: 'Tư vấn đổi size váy hoa',
      departmentId: 'dep_cs' as DepartmentId,
      assigneeId: targetEmployeeId as EmployeeId,
      priority: 'normal',
      status: 'in_progress',
      typeKey: 'cs.chat_reply',
      platformKey: 'shopee',
    })

    const testReview: ReviewItem = {
      id: 'rev_live_test' as ReviewId,
      taskId: testTask.id,
      assigneeId: targetEmployeeId as EmployeeId,
      level: 'reviewer',
      priority: 'high',
      status: 'pending',
      decidedAt: null,
      decidedBy: null,
      note: null,
      createdAt: '2026-11-11T08:10:00Z',
    }

    const archivedEmployee: Employee = {
      id: 'emp_temp_archived' as EmployeeId,
      name: 'Nguyễn Văn Tạm',
      roleKey: 'agent',
      departmentId: 'dep_cs' as DepartmentId,
      specialties: [],
      modelTierOverride: null,
      kind: 'temp',
      state: 'archived',
      reviewMode: 'when_important',
      bio: null,
      createdAt: '2026-11-01T00:00:00Z',
      createdBy: 'manager',
      archivedAt: '2026-11-10T00:00:00Z',
    }

    act(() => {
      useOffice.setState({
        state: {
          ...currentState,
          config: {
            ...currentState.config,
            employees: [...currentState.config.employees, archivedEmployee],
          },
          people: {
            ...currentState.people,
            [targetEmployeeId]: {
              employeeId: targetEmployeeId as EmployeeId,
              activity: 'working',
              taskId: testTask.id,
              carrying: 'phone',
              platformKey: 'shopee',
              idleSince: null,
              location: { floorKey: 'cs', target: 'desk' },
              lastActiveAt: '2026-11-11T08:10:00Z',
            },
          },
          tasks: {
            ...currentState.tasks,
            [testTask.id]: testTask,
          },
          reviews: {
            ...currentState.reviews,
            [testReview.id]: testReview,
          },
        },
      })
    })

    // Assert live task title is displayed
    const taskElem = container.querySelector('[data-person-task]')
    expect(taskElem).toBeTruthy()
    expect(taskElem?.textContent).toBe('Đang xử lý: Tư vấn đổi size váy hoa')

    // Assert platform badge is displayed
    const platformBadge = container.querySelector('[data-platform-badge="shopee"]')
    expect(platformBadge).toBeTruthy()
    expect(platformBadge?.textContent).toContain('Shopee')

    // Assert pile count badge is displayed
    const pileBadge = container.querySelector('[data-pile-count="1"]')
    expect(pileBadge).toBeTruthy()
    expect(pileBadge?.textContent).toBe('1 chờ duyệt')

    // Assert employee row activity updated to working
    const empRow = container.querySelector(`[data-employee-id="${targetEmployeeId}"]`)
    expect(empRow?.getAttribute('data-employee-activity')).toBe('working')

    // Assert archived section updated with count and employee
    expect(screen.getByText('Nhân sự tạm đã nghỉ (1)')).toBeTruthy()
    expect(screen.getByText('Nguyễn Văn Tạm')).toBeTruthy()
  })
})
