import { describe, expect, it } from 'vitest'
import { makeEvent, makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { Employee } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import { initialState } from '@/domain/reducer'
import { buildBuildingLayout } from '@/scene/layout'
import { Director } from '../director'
import { TUNING } from '../tuning'
import { golden, makeWorld, runDirector } from './harness'

const START = golden.startIso

describe('Director on the golden day', () => {
  it('30×: delivers the papers on foot, keeps the backlog bounded and never teleports', () => {
    let maxBacklog = 0
    let maxStep = 0
    let walkersInWalls = 0
    const r = runDirector({
      speed: 30,
      onTick: (director, _state, tick) => {
        const s = director.stats()
        if (s.backlogMax > maxBacklog) maxBacklog = s.backlogMax
        // Walking out of a car crosses the core, which the grid blocks on purpose.
        const onPath = new Set<string>()
        if (tick % 7 === 0) {
          for (const d of director.debugPeople()) if (d.action === 'walk') onPath.add(d.id)
        }
        for (const p of director.people()) {
          if (!p.visible) continue
          const step = Math.hypot(p.x - p.prevX, p.z - p.prevZ)
          if (step > maxStep) maxStep = step
          if (onPath.has(p.id) && p.speed01 > 0) {
            const grid = director.gridOf(p.floorIndex)
            const [col, row] = grid.toCell({ x: p.x, z: p.z })
            if (grid.isBlocked(col, row)) walkersInWalls += 1
          }
        }
      },
    })
    const stats = r.director.stats()
    expect(r.warnings).toEqual([])
    expect(stats.teleports).toBe(0)
    expect(stats.delivered).toBeGreaterThan(300)
    expect(stats.collapsed).toBeLessThanOrEqual(5)
    expect(stats.elevatorTrips).toBeGreaterThan(50)
    expect(maxBacklog).toBeLessThanOrEqual(TUNING.catchUp.maxBacklog)
    // Nobody slides: the fastest catch-up walk plus the separation lean.
    const fastest = TUNING.walkSpeed * TUNING.catchUp.heavyFactor * TUNING.tickSeconds
    expect(maxStep).toBeLessThanOrEqual(Math.max(fastest, TUNING.shuffleSpeed * TUNING.tickSeconds) + 0.2)
    expect(walkersInWalls).toBe(0)
    expect(stats.people).toBe(Object.keys(r.state.people).length)
  }, 120_000)

  it('120×: the backlog still never passes the ceiling', () => {
    let maxBacklog = 0
    const r = runDirector({
      speed: 120,
      onTick: (director) => {
        const s = director.stats()
        if (s.backlogMax > maxBacklog) maxBacklog = s.backlogMax
      },
    })
    expect(maxBacklog).toBeLessThanOrEqual(TUNING.catchUp.maxBacklog)
    expect(r.director.stats().teleports).toBe(0)
    expect(r.director.stats().delivered).toBeGreaterThan(300)
  }, 120_000)

  it('is deterministic: same seed and events → same people in the same places', () => {
    const duration = 2 * 3600_000
    const a = runDirector({ speed: 30, seed: 'd', durationMs: duration })
    const b = runDirector({ speed: 30, seed: 'd', durationMs: duration })
    expect(a.director.debugPeople()).toEqual(b.director.debugPeople())
    expect(a.director.stats()).toEqual(b.director.stats())
    expect(a.director.elevators()).toEqual(b.director.elevators())
  }, 120_000)

  it('a different seed changes the idle choices only', () => {
    const duration = 2 * 3600_000
    const a = runDirector({ speed: 30, seed: 'd', durationMs: duration })
    const b = runDirector({ speed: 30, seed: 'e', durationMs: duration })
    expect(a.director.debugPeople()).not.toEqual(b.director.debugPeople())
    expect(b.director.stats().teleports).toBe(0)
  }, 120_000)
})

describe('Director scenarios', () => {
  it('starts everybody at their own desk', () => {
    const w = makeWorld()
    w.run(0.1)
    for (const p of w.director.people()) {
      const seat = w.layout.seatOf[p.id]
      if (!seat) continue
      expect(w.layout.floors[p.floorIndex]!.key).toBe(seat.floorKey)
      expect(p.visible).toBe(true)
      expect(p.opacity).toBe(1)
    }
    expect(w.director.people().length).toBe(Object.keys(w.state.people).length)
  })

  it('work interrupts idling on another floor: the person rides back to the desk', () => {
    const w = makeWorld('interrupt')
    // Let the office idle until somebody has settled on a floor that is not theirs.
    let who: EmployeeId | null = null
    const found = w.run(900, () => {
      for (const p of w.director.debugPeople()) {
        const seat = w.layout.seatOf[p.id]
        if (seat && seat.floorKey !== p.floorKey && p.action === 'hold') {
          who = p.id
          return true
        }
      }
      return false
    })
    expect(found).toBeGreaterThan(0)
    const id = who!
    const home = w.layout.seatOf[id]!.floorKey
    const tripsBefore = w.director.stats().elevatorTrips + w.director.stats().stairsTrips

    w.emit((seq, at, evId) =>
      makeEvent('person.activity', { employeeId: id, activity: 'working' }, { seq, at, id: evId }),
    )
    w.run(0.2)
    expect(w.debug(id)!.intent.startsWith('GoToDesk') || w.debug(id)!.intent.startsWith('WorkAtDesk')).toBe(true)

    const back = w.run(240, () => {
      const p = w.debug(id)!
      return p.floorKey === home && p.pose === 'sit_work'
    })
    expect(back).toBeGreaterThan(0)
    expect(w.director.stats().elevatorTrips + w.director.stats().stairsTrips).toBeGreaterThan(tripsBefore)
    expect(w.director.stats().teleports).toBe(0)
  })

  it('a hire walks in through the lobby and reaches the department floor', () => {
    const w = makeWorld('hire')
    const template = w.state.config.employees.find((e) => e.departmentId === 'dep_marketing')!
    const hire: Employee = { ...template, id: 'emp_tam_thoi_1' as EmployeeId, name: 'Tạm thời', kind: 'temp' }
    w.run(1)
    w.emit((seq, at, evId) => makeEvent('staff.hired', { employee: hire }, { seq, at, id: evId }))

    const sim = w.director.person(hire.id)!
    expect(sim).not.toBeNull()
    expect(sim.floorIndex).toBe(0)
    expect(sim.opacity).toBe(0)

    w.run(1)
    expect(w.debug(hire.id)!.intent).toBe('Arrive')
    expect(sim.opacity).toBeGreaterThan(0.9)

    const deptFloor = w.layout.floors.find((f) => f.departmentId === 'dep_marketing')!
    const arrived = w.run(240, () => w.debug(hire.id)!.intent !== 'Arrive')
    expect(arrived).toBeGreaterThan(0)
    expect(sim.floorIndex).toBe(deptFloor.index)
    expect(w.director.stats().teleports).toBe(0)
    expect(w.warnings).toEqual([])
  })

  it('an archived person walks out of the building and is removed', () => {
    const w = makeWorld('leave')
    const leaver = w.state.config.employees.find((e) => e.departmentId === 'dep_design')!
    const before = w.director.people().length
    w.run(1)
    w.emit((seq, at, evId) =>
      makeEvent('staff.archived', { employeeId: leaver.id, reason: 'dismissed' }, { seq, at, id: evId }),
    )
    w.run(0.2)
    expect(w.debug(leaver.id)!.intent).toBe('Leave')

    let sawLobby = false
    const gone = w.run(300, () => {
      const p = w.director.person(leaver.id)
      if (p && p.floorIndex === 0 && p.visible) sawLobby = true
      return p === null
    })
    expect(gone).toBeGreaterThan(0)
    expect(sawLobby).toBe(true)
    expect(w.director.people().length).toBe(before - 1)
    expect(w.director.stats().teleports).toBe(0)
  })

  it('a feed reset (seq goes back) rebuilds the people from scratch', () => {
    const w = makeWorld('reset')
    w.emit((seq, at, evId) =>
      makeEvent(
        'person.activity',
        { employeeId: w.state.config.employees[5]!.id, activity: 'working' },
        { seq, at, id: evId },
      ),
    )
    w.run(5)
    const fresh = initialState(makeSeedConfig(), START)
    w.director.sync(fresh)
    w.director.tick(TUNING.tickSeconds)
    expect(w.director.people().length).toBe(Object.keys(fresh.people).length)
    expect(w.director.stats().delivered).toBe(0)
  })

  it('does nothing before the first state and ignores non-positive dt', () => {
    const config = makeSeedConfig()
    const director = new Director(buildBuildingLayout(config), config.building.elevator)
    director.tick(0.1)
    expect(director.people()).toEqual([])
    director.sync(initialState(config, START))
    const before = director.debugPeople()
    director.tick(0)
    expect(director.debugPeople()).toEqual(before)
  })
})

describe('Director review fixes', () => {
  /** Somebody who works on another floor than their desk, so a ride is certain. */
  function startRide(w: ReturnType<typeof makeWorld>): EmployeeId {
    let who: EmployeeId | null = null
    const found = w.run(900, () => {
      for (const p of w.director.debugPeople()) {
        const seat = w.layout.seatOf[p.id]
        if (seat && seat.floorKey !== p.floorKey && p.action === 'hold') {
          who = p.id
          return true
        }
      }
      return false
    })
    expect(found).toBeGreaterThan(0)
    const id = who!
    w.emit((seq, at, evId) =>
      makeEvent('person.activity', { employeeId: id, activity: 'working' }, { seq, at, id: evId }),
    )
    return id
  }

  it('a new layout during an elevator ride lets the ride finish without a jump', () => {
    const w = makeWorld('relayout-ride')
    const id = startRide(w)
    // Wait for the car to be between floors, where a snap to a floor would show.
    const riding = w.run(120, () => {
      const p = w.director.person(id)!
      return p.inCar >= 0 && p.y % w.layout.floorHeight > 0.5
    })
    expect(riding).toBeGreaterThan(0)
    // Mid-ride: give the director a fresh (equal) layout, as a hire would.
    const sim = w.director.person(id)!
    const yBefore = sim.y
    w.director.setLayout(buildBuildingLayout(w.state.config))
    expect(sim.y).toBe(yBefore)
    expect(sim.inCar).toBeGreaterThanOrEqual(0)
    let lastY = sim.y
    let maxJump = 0
    const home = w.layout.seatOf[id]!.floorKey
    const back = w.run(240, () => {
      maxJump = Math.max(maxJump, Math.abs(sim.y - lastY))
      lastY = sim.y
      const p = w.debug(id)!
      return p.floorKey === home && p.pose === 'sit_work'
    })
    expect(back).toBeGreaterThan(0)
    // The car moves 1.5 floors/s at most: 0.1 s is under one metre, a snap is a whole floor.
    expect(maxJump).toBeLessThan(w.layout.floorHeight * 0.5)
    expect(sim.inCar).toBe(-1)
    expect(sim.visible).toBe(true)
    expect(w.director.stats().teleports).toBe(0)
  })

  it('names the destination floor while riding, and null otherwise', () => {
    const w = makeWorld('ride-destination')
    const id = startRide(w)
    expect(w.director.rideDestination(id)).toBeNull()
    const home = w.layout.byKey[w.layout.seatOf[id]!.floorKey]!
    const seen = new Set<number | null>()
    w.run(240, () => {
      const sim = w.director.person(id)!
      if (sim.inCar >= 0) seen.add(w.director.rideDestination(id))
      return w.debug(id)!.pose === 'sit_work' && sim.inCar < 0
    })
    expect(seen.size).toBeGreaterThan(0)
    // The same destination for the whole ride, whatever floor the car is passing.
    expect(seen.has(null)).toBe(false)
    expect([...seen]).toEqual([home])
    expect(w.director.rideDestination(id)).toBeNull()
  })

  it('a walk pose never outlasts the walk', () => {
    const w = makeWorld('walk-pose')
    startRide(w)
    let bad = 0
    w.run(240, () => {
      for (const p of w.director.debugPeople()) {
        if ((p.pose === 'walk' || p.pose === 'carry_walk') && p.action === 'hold') bad += 1
      }
      return false
    })
    expect(bad).toBe(0)
  })
})

