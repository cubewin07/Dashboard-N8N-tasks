import { describe, expect, it } from 'vitest'
import idleJson from '@/content/idle-behaviours.json'
import { makeEvent } from '@/domain/__fixtures__/builders'
import type { EmployeeId } from '@/domain/primitives'
import { parseIdleBehaviours } from '@/domain/visual'
import type { PersonActivity } from '@/domain/work'
import { isLeisureIntent } from '../intents'
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
