import { describe, expect, it } from 'vitest'
import idleJson from '@/content/idle-behaviours.json'
import { makeEvent } from '@/domain/__fixtures__/builders'
import type { EmployeeId } from '@/domain/primitives'
import { parseIdleBehaviours } from '@/domain/visual'
import type { PersonActivity } from '@/domain/work'
import { awayShareIfAway } from '../idleBrain'
import { isLeisureIntent } from '../intents'
import { TUNING } from '../tuning'
import { golden, makeWorld, runDirector } from './harness'

const idle = parseIdleBehaviours(idleJson)
const HOUR = 3_600_000
const LEISURE = /^(IdleAtDesk|IdleWander|RestOnLeisureFloor|NapAtDesk)/

function choiceLog(seed: string): string[] {
  const log: string[] = []
  const last = new Map<string, string | null>()
  runDirector({
    seed,
    director: { idle },
    durationMs: 2 * HOUR,
    onTick: (director) => {
      for (const p of director.people()) {
        if (last.get(p.id) !== p.idleKey) {
          last.set(p.id, p.idleKey)
          if (p.idleKey) log.push(`${p.id}:${p.idleKey}`)
        }
      }
    },
  })
  return log
}

describe('P05 idle brain (P05-T09)', () => {
  it('is deterministic: same seed and event log → identical choices over 2 sim hours', () => {
    const a = choiceLog('idle-det')
    const b = choiceLog('idle-det')
    expect(a.length).toBeGreaterThan(10)
    expect(a).toEqual(b)
    // More than one option is in use (not a constant brain).
    expect(new Set(a.map((x) => x.split(':')[1])).size).toBeGreaterThan(2)
  })

  it('idle plans never use the elevator, and some do take the stairs (not vacuous)', () => {
    let idlePlans = 0
    let withStairs = 0
    const bad: string[] = []
    runDirector({
      seed: 'idle-stairs',
      director: { idle },
      onTick: (director, _state, tick) => {
        if (tick % 10 !== 0) return
        for (const d of director.debugPeople()) {
          if (!LEISURE.test(d.intent)) continue
          const kinds = director.planOf(d.id as EmployeeId).map((a) => a.k)
          idlePlans += 1
          if (kinds.includes('callElevator') || kinds.includes('ride')) bad.push(`${d.id} ${d.intent}`)
          if (kinds.includes('stairs')) withStairs += 1
        }
      },
    })
    expect(idlePlans).toBeGreaterThan(100)
    expect(bad).toEqual([])
    expect(withStairs).toBeGreaterThan(0)
  })

  it('a work event interrupts an idle spot within one director tick', () => {
    const w = makeWorld('idle-interrupt', { director: { idle } })
    let who: EmployeeId | null = null
    const found = w.run(600, () => {
      const p = w.director
        .people()
        .find((s) => s.idleKey && s.idleKey !== 'stay_at_desk' && w.director.planOf(s.id).length > 0)
      if (p) who = p.id
      return p !== undefined
    })
    expect(found).toBeGreaterThan(0)
    const id = who!
    w.emit((seq, at, eid) =>
      makeEvent('person.activity', { employeeId: id, activity: 'working' }, { seq, at, id: eid }),
    )
    w.run(0.1)
    expect(w.director.person(id)!.idleKey).toBeNull()
    expect(w.debug(id)!.intent).not.toMatch(LEISURE)
  })
})

describe('P05 calendar (P05-T11)', () => {
  it('at 12:05 at least 80 % of idle / resting people are napping', () => {
    const lunchStart = Date.parse('2026-11-02T05:00:00.000Z')
    const { director, state } = runDirector({
      seed: 'idle-lunch',
      director: { idle },
      durationMs: lunchStart - Date.parse(golden.startIso) + 5 * 60_000,
    })
    const free = Object.values(state.people).filter(
      (p) => p.activity === 'resting' || p.activity === 'idle',
    )
    expect(free.length).toBeGreaterThan(5)
    const napping = free.filter((p) => director.person(p.employeeId)?.idleKey === 'lunch_nap')
    expect(napping.length / free.length).toBeGreaterThanOrEqual(0.8)
    // Working people are never sent to nap.
    for (const p of Object.values(state.people)) {
      if (p.activity === 'working') expect(director.person(p.employeeId)?.idleKey ?? null).toBeNull()
    }
  })

  it('at 23:00 cs shift workers stay at their desks while marketing rests', () => {
    // 23:00 Asia/Ho_Chi_Minh.
    const w = makeWorld('idle-night', { director: { idle }, startIso: '2026-11-02T16:00:00.000Z' })
    const cfg = w.state.config
    const cs = cfg.employees.filter((e) => e.departmentId === 'dep_cs').map((e) => e.id)
    const mkt = cfg.employees.filter((e) => e.departmentId === 'dep_marketing').map((e) => e.id)
    const set = (id: EmployeeId, activity: PersonActivity) =>
      w.emit((seq, at, eid) => makeEvent('person.activity', { employeeId: id, activity }, { seq, at, id: eid }))
    for (const id of cs) set(id, 'idle')
    for (const id of mkt) set(id, 'off_shift')
    w.run(1)
    for (const id of cs) {
      expect(w.director.person(id)!.idleKey).toBe('stay_at_desk')
      expect(w.debug(id)!.intent).toMatch(/^IdleAtDesk/)
    }
    for (const id of mkt) {
      expect(w.director.person(id)!.idleKey).toBe('night_rest')
      expect(w.debug(id)!.intent).toMatch(/^(RestOnLeisureFloor|NapAtDesk)/)
    }
    expect(mkt.some((id) => w.debug(id)!.intent.startsWith('RestOnLeisureFloor'))).toBe(true)
  })

  it('leisure intents stay classified as leisure', () => {
    expect(isLeisureIntent({ kind: 'IdleAtDesk', pose: 'coffee' })).toBe(true)
  })
})

describe('awayShareIfAway', () => {
  it('counts the chooser once, whether they are away already or not', () => {
    // 10 people, 2 away, chooser at the desk: 3 would be away.
    expect(awayShareIfAway(2, 10, false)).toBeCloseTo(0.3)
    // chooser is one of the 2 away and stays: still 2 away, not 3.
    expect(awayShareIfAway(2, 10, true)).toBeCloseTo(0.2)
  })

  it('is safe for an empty department', () => {
    expect(awayShareIfAway(0, 0, false)).toBe(1)
    expect(awayShareIfAway(0, 5, true)).toBeCloseTo(0.2)
  })
})

describe('idle visits keep a minimum visual hold (P05 review)', () => {
  for (const speed of [30, 120]) {
    it(`no visit ends within ${TUNING.idle.minHoldSeconds} s of arriving at ${speed}x`, () => {
      const holding = new Map<string, { key: string; ticks: number }>()
      const finished: number[] = []
      runDirector({
        speed,
        seed: 'hold',
        director: { idle: idle },
        durationMs: 3 * HOUR,
        onTick: (director) => {
          for (const p of director.people()) {
            const step = director.planOf(p.id)[director.debugPeople().find((d) => d.id === p.id)?.step ?? 0]
            const cur = holding.get(p.id)
            if (cur && cur.key !== p.idleKey) {
              // Ended by a new choice (a null key is a work interruption, which may cut it short).
              if (p.idleKey && cur.ticks > 0) finished.push(cur.ticks * TUNING.tickSeconds)
              holding.delete(p.id)
            }
            if (p.idleKey && step?.k === 'hold') {
              const h = holding.get(p.id) ?? { key: p.idleKey, ticks: 0 }
              h.ticks += 1
              holding.set(p.id, h)
            } else if (p.idleKey && !holding.has(p.id)) {
              holding.set(p.id, { key: p.idleKey, ticks: 0 })
            }
          }
        },
      })
      expect(finished.length).toBeGreaterThan(0)
      for (const seconds of finished) expect(seconds).toBeGreaterThanOrEqual(TUNING.idle.minHoldSeconds - 0.2)
    })
  }
})
