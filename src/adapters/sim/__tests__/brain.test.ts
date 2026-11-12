import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { parseEvent, type OfficeEvent } from '@/domain/events'
import { DEFAULT_SIM_SEED } from '../controls'
import { createSimFeed } from '../SimFeed'

describe('Sim brain 8 sim-hours invariants & night shift (P03-T09)', () => {
  it(
    'runs 8 sim-hours at default seed satisfying all volume, review, help, handoff, concurrency, and schema invariants',
    async () => {
    const cfg = makeSeedConfig()
    const feed = createSimFeed({
      seed: DEFAULT_SIM_SEED,
      speed: 30,
      autoStartTimer: false,
      bindGlobalControls: false,
    })

    const events: OfficeEvent[] = []
    await feed.start(cfg)
    feed.subscribe((batch) => {
      events.push(...batch)
      // Verify no worker has > 1 active in_progress task after every batch
      const state = feed.getState()
      const activeByWorker = new Map<string, number>()
      for (const task of Object.values(state.tasks)) {
        if (task.status === 'in_progress' && task.assigneeId) {
          activeByWorker.set(
            task.assigneeId,
            (activeByWorker.get(task.assigneeId) ?? 0) + 1,
          )
        }
      }
      for (const [, count] of activeByWorker) {
        expect(count).toBeLessThanOrEqual(1)
      }
    })

    // 8 sim-hours = 8 * 3600 * 1000 ms = 28,800,000 sim-ms
    feed.stepSimMs(8 * 3_600_000)

    // 1. Every event passes parseEvent
    for (const ev of events) {
      expect(parseEvent(ev).ok).toBe(true)
    }

    // 2. >= 60 tasks created
    const createdEvents = events.filter((e) => e.type === 'task.created')
    expect(createdEvents.length).toBeGreaterThanOrEqual(60)

    // 3. Every department has work
    const deptsWithTasks = new Set(
      createdEvents.map(
        (e) =>
          (e as OfficeEvent<'task.created'>).payload.task.departmentId,
      ),
    )
    expect(deptsWithTasks.has('dep_cs')).toBe(true)
    expect(deptsWithTasks.has('dep_marketing')).toBe(true)
    expect(deptsWithTasks.has('dep_design')).toBe(true)
    expect(deptsWithTasks.has('dep_accounting')).toBe(true)

    // 4. >= 1 review at each level (reviewer, dept_manager, boss)
    const levelsSeen = new Set<string>()
    for (const e of events) {
      if (e.type === 'review.requested') {
        levelsSeen.add(
          (e as OfficeEvent<'review.requested'>).payload.review.level,
        )
      } else if (e.type === 'review.escalated') {
        levelsSeen.add(
          (e as OfficeEvent<'review.escalated'>).payload.newReview.level,
        )
      }
    }
    expect(levelsSeen.has('reviewer')).toBe(true)
    expect(levelsSeen.has('dept_manager')).toBe(true)
    expect(levelsSeen.has('boss')).toBe(true)

    // 5. >= 1 help request
    const helpRequested = events.filter((e) => e.type === 'help.requested')
    expect(helpRequested.length).toBeGreaterThanOrEqual(1)

    // 6. >= 1 cross-department handoff
    const handedOff = events.filter((e) => e.type === 'task.handed_off')
    expect(handedOff.length).toBeGreaterThanOrEqual(1)

    // 7. Advance another 3 sim-hours into night (start was 08:00 ICT + 8h = 16:00 ICT; +3h = 19:00 ICT)
    feed.stepSimMs(3 * 3_600_000)
    const nightState = feed.getState()
    const empById = new Map(
      nightState.config.employees.map((e) => [e.id, e]),
    )

    let csWorkingOrIdle = 0
    for (const p of Object.values(nightState.people)) {
      const emp = empById.get(p.employeeId)
      if (!emp || emp.roleKey === 'owner') continue
      if (emp.departmentId === 'dep_cs') {
        if (p.activity !== 'off_shift') {
          csWorkingOrIdle += 1
        }
      } else {
        expect(p.activity).toBe('off_shift')
      }
    }
    expect(csWorkingOrIdle).toBeGreaterThan(0)
  }, 25_000)
})
