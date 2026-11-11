import { describe, expect, it } from 'vitest'
import { ElevatorSystem, type CarState, type ElevatorConfig } from '../elevator'

const BASE: ElevatorConfig = {
  floorCount: 9,
  cars: 2,
  speedFloorsPerSec: 1.5,
  doorSeconds: 1.2,
  capacity: 6,
}

const DT = 0.1

function make(overrides: Partial<ElevatorConfig> = {}): ElevatorSystem {
  return new ElevatorSystem({ ...BASE, ...overrides })
}

/** Doors are only open at a floor, moving cars are closed, capacity holds, floors stay in range. */
function assertCarInvariants(sys: ElevatorSystem, cfg: ElevatorConfig = BASE): void {
  for (const car of sys.cars()) {
    expect(car.door01).toBeGreaterThanOrEqual(0)
    expect(car.door01).toBeLessThanOrEqual(1)
    if (car.door01 > 0) expect(Number.isInteger(car.position)).toBe(true)
    if (car.phase === 'moving') {
      expect(car.door01).toBe(0)
      expect(car.direction).not.toBe(0)
    }
    if (car.phase !== 'moving') expect(Number.isInteger(car.position)).toBe(true)
    if (car.phase === 'idle') expect(car.direction).toBe(0)
    expect(car.position).toBeGreaterThanOrEqual(0)
    expect(car.position).toBeLessThanOrEqual(cfg.floorCount - 1)
    expect(car.riders.length).toBeLessThanOrEqual(cfg.capacity)
  }
}

/** A rider's car never travels past the rider's destination. */
function assertNoSkippedStops(sys: ElevatorSystem, ids: Iterable<string>): void {
  const cars = sys.cars()
  for (const id of ids) {
    const p = sys.passenger(id)
    if (p === null || p.phase !== 'riding' || p.car === null) continue
    const car = cars[p.car] as CarState
    expect(car.riders).toContain(id)
    const dir = Math.sign(p.to - p.from)
    expect((p.to - car.position) * dir).toBeGreaterThanOrEqual(-1e-9)
  }
}

/** Step until `done()` or the time limit; returns the elapsed seconds. */
function runUntil(sys: ElevatorSystem, done: () => boolean, limitSeconds = 120, ids: string[] = []): number {
  let t = 0
  while (!done()) {
    if (t > limitSeconds) throw new Error(`not done after ${limitSeconds} s`)
    sys.step(DT)
    t += DT
    assertCarInvariants(sys)
    assertNoSkippedStops(sys, ids)
  }
  return t
}

const arrived = (sys: ElevatorSystem, id: string) => sys.passenger(id)?.phase === 'arrived'

describe('ElevatorSystem: basics', () => {
  it('starts cars at the lobby and the middle floor, idle and closed', () => {
    const cars = make().cars()
    expect(cars.map((c) => c.position)).toEqual([0, 4])
    for (const c of cars) {
      expect(c.phase).toBe('idle')
      expect(c.direction).toBe(0)
      expect(c.door01).toBe(0)
      expect(c.riders).toEqual([])
      expect(c.stops).toEqual([])
    }
    expect(make({ cars: 3 }).cars().map((c) => c.position)).toEqual([0, 4, 8])
    expect(make({ startFloors: [2, 7] }).cars().map((c) => c.position)).toEqual([2, 7])
  })

  it('serves a single call through the full stop cycle', () => {
    const sys = make()
    sys.call('a', 0, 3)
    expect(sys.passenger('a')).toMatchObject({ phase: 'waiting', car: 0, queueIndex: 0, from: 0, to: 3 })
    expect(sys.queue(0, 0)).toEqual(['a'])

    const phases: string[] = []
    const t = runUntil(
      sys,
      () => {
        const phase = (sys.cars()[0] as CarState).phase
        if (phases[phases.length - 1] !== phase) phases.push(phase)
        return arrived(sys, 'a')
      },
      60,
      ['a'],
    )
    expect(phases).toEqual(['idle', 'doors_opening', 'loading', 'doors_closing', 'moving', 'doors_opening', 'loading'])
    // open 0.6 + dwell 1.6 + close 0.6 + 3 floors at 1.5/s + open 0.6 = 5.4 s
    expect(t).toBeGreaterThan(5.2)
    expect(t).toBeLessThan(5.8)

    const a = sys.passenger('a')
    expect(a).toMatchObject({ phase: 'arrived', car: 0, queueIndex: -1 })
    expect(a?.waited).toBeGreaterThan(0.4)
    expect(a?.waited).toBeLessThan(0.9)
    const car = sys.cars()[0] as CarState
    expect(car.position).toBe(3)
    expect(car.riders).toEqual([])
    // the other car never moved
    expect(sys.cars()[1]).toMatchObject({ position: 4, phase: 'idle' })

    sys.release('a')
    expect(sys.passenger('a')).toBeNull()
    runUntil(sys, () => sys.cars().every((c) => c.phase === 'idle'), 10)
    // idle cars stay where they are
    expect(sys.cars().map((c) => c.position)).toEqual([3, 4])
  })

  it('travels to a caller on another floor first', () => {
    const sys = make({ cars: 1 })
    sys.call('a', 5, 2)
    expect((sys.cars()[0] as CarState).stops).toEqual([5])
    runUntil(sys, () => sys.passenger('a')?.phase === 'riding', 30, ['a'])
    expect(sys.cars()[0]).toMatchObject({ position: 5, direction: -1, riders: ['a'], stops: [2] })
    runUntil(sys, () => arrived(sys, 'a'), 30, ['a'])
    expect((sys.cars()[0] as CarState).position).toBe(2)
  })

  it('from === to arrives immediately without a car', () => {
    const sys = make()
    sys.call('a', 3, 3)
    expect(sys.passenger('a')).toEqual({
      id: 'a',
      from: 3,
      to: 3,
      phase: 'arrived',
      car: null,
      queueIndex: -1,
      waited: 0,
    })
    sys.step(2)
    expect(sys.cars().every((c) => c.phase === 'idle')).toBe(true)
    sys.release('a')
    expect(sys.passenger('a')).toBeNull()
  })

  it('rejects floors outside the building', () => {
    const sys = make()
    expect(() => sys.call('a', -1, 2)).toThrow(RangeError)
    expect(() => sys.call('a', 0, 9)).toThrow(RangeError)
    expect(() => sys.call('a', 0.5, 2)).toThrow(RangeError)
    expect(sys.passenger('a')).toBeNull()
  })

  it('calling again replaces the request only while waiting', () => {
    const sys = make({ cars: 1 })
    sys.call('a', 4, 6)
    sys.step(1)
    sys.call('a', 4, 1)
    expect(sys.passenger('a')).toMatchObject({ phase: 'waiting', to: 1, waited: 0 })
    runUntil(sys, () => sys.passenger('a')?.phase === 'riding', 30)
    sys.call('a', 0, 8) // ignored while riding
    expect(sys.passenger('a')).toMatchObject({ phase: 'riding', from: 4, to: 1 })
    runUntil(sys, () => arrived(sys, 'a'), 30, ['a'])
    expect((sys.cars()[0] as CarState).position).toBe(1)
  })
})

describe('ElevatorSystem: assignment', () => {
  it('two cars split opposite calls', () => {
    const sys = make()
    sys.call('low', 1, 0)
    sys.call('high', 7, 8)
    expect(sys.passenger('low')?.car).toBe(0)
    expect(sys.passenger('high')?.car).toBe(1)
    let bothMoving = false
    runUntil(
      sys,
      () => {
        const [c0, c1] = sys.cars() as [CarState, CarState]
        if (c0.phase === 'moving' && c1.phase === 'moving') bothMoving = true
        return arrived(sys, 'low') && arrived(sys, 'high')
      },
      60,
      ['low', 'high'],
    )
    expect(bothMoving).toBe(true)
    expect(sys.passenger('low')?.car).toBe(0)
    expect(sys.passenger('high')?.car).toBe(1)
    expect(sys.cars().map((c) => c.position)).toEqual([0, 8])
  })

  it('prefers an idle car at the floor and breaks ties by lower index', () => {
    const sys = make({ startFloors: [6, 2] })
    sys.call('a', 2, 5)
    expect(sys.passenger('a')?.car).toBe(1)
    const tie = make({ startFloors: [2, 6] })
    tie.call('b', 4, 0) // both cars are 2 floors away
    expect(tie.passenger('b')?.car).toBe(0)
  })

  it('picks up callers going its way and serves the opposite ones on the way back', () => {
    const sys = make({ cars: 1 })
    sys.call('a', 0, 8)
    sys.step(1) // a boards, car is committed upward
    sys.call('up', 3, 6)
    sys.call('down', 5, 1)
    const order: string[] = []
    const ids = ['a', 'up', 'down']
    runUntil(
      sys,
      () => {
        for (const id of ids) if (arrived(sys, id) && !order.includes(id)) order.push(id)
        return order.length === ids.length
      },
      120,
      ids,
    )
    expect(order).toEqual(['up', 'a', 'down'])
  })
})

describe('ElevatorSystem: capacity and FIFO', () => {
  it('capacity overflow waits for the next car', () => {
    const cfg = { capacity: 2, startFloors: [0, 8] }
    const sys = make(cfg)
    for (const id of ['a', 'b', 'c', 'd']) sys.call(id, 0, 5)
    const boardedCar = new Map<string, number>()
    const ids = ['a', 'b', 'c', 'd']
    let sawOverflowWaiting = false
    let t = 0
    while (!ids.every((id) => arrived(sys, id))) {
      expect(t).toBeLessThan(120)
      sys.step(DT)
      t += DT
      assertCarInvariants(sys, { ...BASE, ...cfg })
      assertNoSkippedStops(sys, ids)
      for (const id of ids) {
        const p = sys.passenger(id)
        if (p?.phase === 'riding' && p.car !== null && !boardedCar.has(id)) boardedCar.set(id, p.car)
      }
      if (sys.passenger('a')?.phase === 'riding' && sys.passenger('c')?.phase === 'waiting') {
        sawOverflowWaiting = true
      }
    }
    expect(sawOverflowWaiting).toBe(true)
    expect(boardedCar.get('a')).toBe(0)
    expect(boardedCar.get('b')).toBe(0)
    // the overflow is taken by the other car, not by a second trip of car 0
    expect(boardedCar.get('c')).toBe(1)
    expect(boardedCar.get('d')).toBe(1)
  })

  it('with a single car the overflow is served on the next trip, nobody is stranded', () => {
    const cfg = { cars: 1, capacity: 2 }
    const sys = make(cfg)
    const ids = ['a', 'b', 'c', 'd', 'e']
    for (const id of ids) sys.call(id, 2, 6)
    const arrivals: string[] = []
    let t = 0
    while (arrivals.length < ids.length) {
      expect(t).toBeLessThan(200)
      sys.step(DT)
      t += DT
      assertCarInvariants(sys, { ...BASE, ...cfg })
      for (const id of ids) {
        if (arrived(sys, id) && !arrivals.includes(id)) arrivals.push(id)
      }
      for (const id of arrivals) sys.release(id)
    }
    expect(arrivals).toEqual(ids)
  })

  it('boards FIFO per floor and direction', () => {
    const cfg = { cars: 1, capacity: 1, startFloors: [3] }
    const sys = make(cfg)
    sys.call('u1', 3, 6)
    sys.call('d1', 3, 0)
    sys.call('u2', 3, 7)
    sys.call('d2', 3, 1)
    sys.call('u3', 3, 5)
    expect(sys.queue(3, 0)).toEqual(['u1', 'd1', 'u2', 'd2', 'u3'])
    expect(sys.passenger('u3')?.queueIndex).toBe(4)
    expect(sys.queue(2, 0)).toEqual([])

    const ids = ['u1', 'd1', 'u2', 'd2', 'u3']
    const boarding: string[] = []
    let t = 0
    while (!ids.every((id) => sys.passenger(id) === null)) {
      expect(t).toBeLessThan(300)
      sys.step(DT)
      t += DT
      assertCarInvariants(sys, { ...BASE, ...cfg })
      assertNoSkippedStops(sys, ids)
      for (const id of ids) {
        const p = sys.passenger(id)
        if (p?.phase === 'riding' && !boarding.includes(id)) boarding.push(id)
        if (p?.phase === 'arrived') sys.release(id)
      }
    }
    const ups = boarding.filter((id) => id.startsWith('u'))
    const downs = boarding.filter((id) => id.startsWith('d'))
    expect(ups).toEqual(['u1', 'u2', 'u3'])
    expect(downs).toEqual(['d1', 'd2'])
  })

  it('a late caller boards in the same cycle while the doors are open', () => {
    const sys = make({ cars: 1 })
    sys.call('a', 0, 4)
    sys.step(1) // doors open, a aboard
    expect(sys.cars()[0]).toMatchObject({ phase: 'loading', riders: ['a'] })
    sys.call('b', 0, 2)
    sys.step(DT)
    expect(sys.cars()[0]).toMatchObject({ phase: 'loading', riders: ['a', 'b'] })
    // someone going the other way cannot exist at floor 0; use an idle open car instead
    const idle = make({ cars: 1, startFloors: [4] })
    idle.call('x', 4, 4)
    idle.call('y', 4, 0)
    idle.step(1)
    idle.call('z', 4, 8) // opposite direction: must wait for the car to come back
    idle.step(DT)
    expect((idle.cars()[0] as CarState).riders).toEqual(['y'])
    expect(idle.passenger('z')?.phase).toBe('waiting')
    runUntil(idle, () => arrived(idle, 'z'), 60, ['y', 'z'])
  })

  it('the dwell restart is capped so a stream of boarders cannot hold the car', () => {
    const sys = make({ cars: 1, capacity: 50 })
    sys.call('first', 0, 5)
    let n = 0
    let t = 0
    while ((sys.cars()[0] as CarState).phase !== 'moving') {
      expect(t).toBeLessThan(10)
      sys.step(DT)
      t += DT
      if (t % 1 < DT) sys.call(`late${n++}`, 0, 5)
    }
    // open 0.6 + at most 3 × 1.6 dwell + close 0.6
    expect(t).toBeLessThan(0.6 + 4.8 + 0.6 + 0.3)
  })
})

describe('ElevatorSystem: cancel and reset', () => {
  it('cancel while waiting: the car is not sent', () => {
    const sys = make({ cars: 1 })
    sys.call('a', 6, 2)
    sys.cancel('a')
    expect(sys.passenger('a')).toBeNull()
    expect(sys.queue(6, 0)).toEqual([])
    sys.step(3)
    expect(sys.cars()[0]).toMatchObject({ position: 0, phase: 'idle', stops: [] })
  })

  it('cancel while the car is on its way: it parks at the next floor', () => {
    const sys = make({ cars: 1 })
    sys.call('a', 6, 2)
    sys.step(1) // position 1.5, moving up
    expect((sys.cars()[0] as CarState).phase).toBe('moving')
    sys.cancel('a')
    runUntil(sys, () => (sys.cars()[0] as CarState).phase === 'idle', 5)
    expect(sys.cars()[0]).toMatchObject({ position: 2, direction: 0, door01: 0 })
  })

  it('cancel while the doors are opening for the caller', () => {
    const sys = make({ cars: 1 })
    sys.call('a', 0, 4)
    sys.step(0.3)
    expect((sys.cars()[0] as CarState).phase).toBe('doors_opening')
    sys.cancel('a')
    runUntil(sys, () => (sys.cars()[0] as CarState).phase === 'idle', 10)
    expect(sys.cars()[0]).toMatchObject({ position: 0, riders: [] })
  })

  it('cancel while riding drops the rider at once and frees the car', () => {
    const sys = make({ cars: 1 })
    sys.call('a', 0, 8)
    sys.call('b', 0, 3)
    runUntil(sys, () => (sys.cars()[0] as CarState).phase === 'moving', 10)
    sys.cancel('a')
    expect(sys.passenger('a')).toBeNull()
    expect(sys.cars()[0]).toMatchObject({ riders: ['b'], stops: [3] })
    runUntil(sys, () => arrived(sys, 'b'), 30, ['b'])
    sys.cancel('b') // cancel after arriving
    expect(sys.passenger('b')).toBeNull()
    runUntil(sys, () => (sys.cars()[0] as CarState).phase === 'idle', 10)
    expect((sys.cars()[0] as CarState).position).toBe(3)

    // the only rider cancels mid-flight: the car parks at the next floor
    sys.call('c', 3, 8)
    runUntil(sys, () => (sys.cars()[0] as CarState).position > 4.2, 20)
    sys.cancel('c')
    runUntil(sys, () => (sys.cars()[0] as CarState).phase === 'idle', 5)
    expect(sys.cars()[0]).toMatchObject({ position: 5, riders: [] })
  })

  it('cancel while the doors are closing behind the rider', () => {
    const sys = make({ cars: 1 })
    sys.call('a', 0, 4)
    runUntil(sys, () => (sys.cars()[0] as CarState).phase === 'doors_closing', 10)
    sys.cancel('a')
    runUntil(sys, () => (sys.cars()[0] as CarState).phase === 'idle', 5)
    expect(sys.cars()[0]).toMatchObject({ position: 0, riders: [], door01: 0 })
  })

  it('cancel and release of unknown or not-arrived ids are no-ops', () => {
    const sys = make()
    sys.cancel('ghost')
    sys.release('ghost')
    sys.call('a', 0, 4)
    sys.release('a')
    expect(sys.passenger('a')?.phase).toBe('waiting')
  })

  it('reset drops every request and parks the cars at the nearest floor', () => {
    const sys = make()
    sys.call('a', 0, 8)
    sys.call('b', 7, 1)
    sys.step(3.5)
    sys.reset()
    expect(sys.passenger('a')).toBeNull()
    expect(sys.passenger('b')).toBeNull()
    for (const car of sys.cars()) {
      expect(car).toMatchObject({ phase: 'idle', direction: 0, door01: 0, riders: [], stops: [] })
      expect(Number.isInteger(car.position)).toBe(true)
    }
    const before = sys.cars()
    sys.step(5)
    expect(sys.cars()).toEqual(before)
    // still usable afterwards
    sys.call('c', 2, 3)
    runUntil(sys, () => arrived(sys, 'c'), 30, ['c'])
  })
})

/** Small LCG (Numerical Recipes constants) so the test owns its randomness. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

interface SoakResult {
  trace: string
  calls: number
  meanWait: number
  maxWait: number
  meanTrip: number
  maxTrip: number
  maxRiders: number
}

/**
 * Seeded traffic plus a "driver" that walks arrived passengers out after a
 * short delay, the way the director does. Then the calls stop and the system
 * must drain completely.
 */
function soak(
  cfg: ElevatorConfig,
  seed: number,
  steps: number,
  callChance: number,
  dt = DT,
  waitBound = 180,
): SoakResult {
  const sys = new ElevatorSystem(cfg)
  const rand = lcg(seed)
  const pick = (n: number) => Math.floor(rand() * n)
  const active = new Map<string, { calledAt: number; arrivedAt: number | null }>()
  const waits: number[] = []
  const trips: number[] = []
  const trace: string[] = []
  let maxRiders = 0
  let calls = 0
  let t = 0

  const tick = (allowCalls: boolean) => {
    if (allowCalls && rand() < callChance) {
      const from = pick(cfg.floorCount)
      let to = pick(cfg.floorCount - 1)
      if (to >= from) to++
      const id = `p${calls++}`
      sys.call(id, from, to)
      active.set(id, { calledAt: t, arrivedAt: null })
    }
    sys.step(dt)
    t += dt
    assertCarInvariants(sys, cfg)
    assertNoSkippedStops(sys, active.keys())
    const cars = sys.cars()
    for (const car of cars) maxRiders = Math.max(maxRiders, car.riders.length)
    for (const [id, info] of [...active]) {
      const p = sys.passenger(id)
      if (p === null) throw new Error(`${id} vanished`)
      if (p.phase === 'waiting') {
        expect(p.car).not.toBeNull()
        expect(p.queueIndex).toBeGreaterThanOrEqual(0)
        if (p.waited > waitBound) throw new Error(`${id} waited ${p.waited.toFixed(1)} s (${p.from}→${p.to})`)
      } else if (p.phase === 'arrived') {
        if (info.arrivedAt === null) {
          info.arrivedAt = t
          waits.push(p.waited)
          trips.push(t - info.calledAt)
          const car = cars[p.car ?? -1] as CarState
          expect(car.position).toBe(p.to)
          expect(car.door01).toBe(1)
        } else if (t - info.arrivedAt >= 0.5) {
          sys.release(id)
          active.delete(id)
        }
      }
    }
    trace.push(
      cars.map((c) => `${c.position.toFixed(4)}/${c.phase}/${c.direction}/${c.door01.toFixed(3)}/${c.riders.join(',')}`).join('|'),
    )
  }

  for (let i = 0; i < steps; i++) tick(true)
  // calls stop: everyone must be delivered
  let drain = 0
  while (active.size > 0) {
    if (drain++ > 3000) throw new Error(`stranded: ${[...active.keys()].join(',')}`)
    tick(false)
  }
  for (let i = 0; i < 50; i++) tick(false)
  for (const car of sys.cars()) {
    expect(car).toMatchObject({ phase: 'idle', riders: [], stops: [], door01: 0 })
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  return {
    trace: trace.join('\n'),
    calls,
    meanWait: mean(waits),
    maxWait: Math.max(0, ...waits),
    meanTrip: mean(trips),
    maxTrip: Math.max(0, ...trips),
    maxRiders,
  }
}

describe('ElevatorSystem: determinism', () => {
  it('the same call sequence gives an identical state trace', () => {
    const a = soak(BASE, 7, 2000, 1 / 20)
    const b = soak(BASE, 7, 2000, 1 / 20)
    expect(a.calls).toBeGreaterThan(50)
    expect(b.trace).toBe(a.trace)
    expect(soak(BASE, 8, 2000, 1 / 20).trace).not.toBe(a.trace)
  })
})

describe('ElevatorSystem: property test', () => {
  it('10 000 steps of seeded calls on 9 floors: nobody stuck, nobody stranded, capacity holds', () => {
    const r = soak(BASE, 20260112, 10_000, 1 / 40)
    console.info(
      `[elevator soak] calls=${r.calls} wait mean=${r.meanWait.toFixed(1)}s max=${r.maxWait.toFixed(1)}s ` +
        `trip mean=${r.meanTrip.toFixed(1)}s max=${r.maxTrip.toFixed(1)}s maxRiders=${r.maxRiders}`,
    )
    expect(r.calls).toBeGreaterThan(200)
    expect(r.maxWait).toBeLessThan(180)
    expect(r.maxRiders).toBeLessThanOrEqual(BASE.capacity)
    expect(r.meanWait).toBeLessThan(30)
  })

  it('holds with tiny cars (overflow everywhere)', () => {
    const cfg = { ...BASE, capacity: 2 }
    for (const seed of [1, 2, 3]) {
      const r = soak(cfg, seed, 4000, 1 / 40)
      expect(r.maxWait).toBeLessThan(180)
      expect(r.maxRiders).toBeLessThanOrEqual(2)
    }
  })

  it('past saturation the queues grow but everyone is still delivered once calls stop', () => {
    // capacity 2 at one call per 2.5 s is more than two cars can carry
    const r = soak({ ...BASE, capacity: 2 }, 1, 1500, 1 / 25, DT, Infinity)
    expect(r.calls).toBeGreaterThan(40)
    expect(r.maxRiders).toBeLessThanOrEqual(2)
  })

  it('is stable with a single car and with three cars', () => {
    expect(soak({ ...BASE, cars: 1 }, 5, 3000, 1 / 80).maxWait).toBeLessThan(180)
    expect(soak({ ...BASE, cars: 3 }, 5, 3000, 1 / 20).maxWait).toBeLessThan(180)
  })

  it('is stable for coarse steps up to 0.5 s', () => {
    const r = soak(BASE, 11, 2000, 1 / 8, 0.5)
    expect(r.calls).toBeGreaterThan(200)
    expect(r.maxWait).toBeLessThan(180)
    expect(r.maxRiders).toBeLessThanOrEqual(BASE.capacity)
  })
})
