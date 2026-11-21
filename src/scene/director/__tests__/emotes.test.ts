import { describe, expect, it } from 'vitest'
import idleJson from '@/content/idle-behaviours.json'
import { parseIdleBehaviours } from '@/domain/visual'
import { talkTurn } from '../director'
import { TUNING } from '../tuning'
import { runDirector } from './harness'

const idle = parseIdleBehaviours(idleJson)
const HOUR = 3_600_000
const TURN = TUNING.idle.talkTurnSeconds

describe('talkTurn', () => {
  it('gives the bubble to exactly one of the pair at any moment', () => {
    for (let t = 0; t < 40; t += 0.37) {
      expect(talkTurn(t, 'emp_a', 'emp_b', TURN)).not.toBe(talkTurn(t, 'emp_b', 'emp_a', TURN))
    }
  })

  it('alternates every turn', () => {
    let flips = 0
    let last = talkTurn(0, 'emp_a', 'emp_b', TURN)
    for (let t = 0.1; t < 20; t += 0.1) {
      const now = talkTurn(t, 'emp_a', 'emp_b', TURN)
      if (now !== last) flips += 1
      last = now
    }
    expect(flips).toBeGreaterThanOrEqual(6)
  })

  it('offsets each pair, so pairs do not blink in step', () => {
    const pairs = [
      ['emp_a', 'emp_b'],
      ['emp_c', 'emp_d'],
      ['emp_e', 'emp_f'],
      ['emp_g', 'emp_h'],
    ] as const
    const at = (t: number) => pairs.map(([x, y]) => talkTurn(t, x, y, TURN))
    const seen = new Set<string>()
    for (let t = 0; t < 10; t += 0.5) seen.add(at(t).map((v) => (v ? 'T' : 'F')).join(''))
    // In step they would only ever show two patterns (all T, all F).
    expect(seen.size).toBeGreaterThan(2)
  })
})

type AgentView = { idleKey: string | null; planIdleKey: string | null; plan: { k: string }[]; step: number }

/**
 * Still settled at the chat with someone to talk to (director internals), so
 * turn-taking can be told apart from company or the person coming and going.
 */
function settledWithCompany(director: unknown, id: string): boolean {
  const d = director as { agents: Map<string, AgentView>; hasCompany(agent: AgentView): boolean }
  const agent = d.agents.get(id)
  return (
    agent !== undefined &&
    agent.plan[agent.step]?.k === 'hold' &&
    agent.planIdleKey === agent.idleKey &&
    d.hasCompany(agent)
  )
}

function observe(reduced: boolean) {
  // A blink: the bubble goes off and comes back within 5 s of the same visit.
  const live = new Map<string, { key: string; talk: boolean; offAt: number }>()
  let blinks = 0
  // A turn: the bubble goes off although the person still has company.
  let turns = 0
  const lonely: string[] = []
  let sawTalk = false
  runDirector({
    speed: 30,
    seed: 'emotes',
    director: { idle },
    durationMs: 4 * HOUR,
    onTick: (director, _state, tickNo) => {
      if (reduced) director.setReducedMotion(true)
      const people = director.people()
      for (const p of people) {
        const chatting = p.idleKey === 'chat_pair' || p.idleKey === 'tea_table'
        if (!chatting) {
          live.delete(p.id)
          continue
        }
        const talking = p.emote === 'talk'
        if (talking) {
          sawTalk = true
          const company = people.some(
            (o) =>
              o.id !== p.id &&
              o.idleKey === p.idleKey &&
              o.floorIndex === p.floorIndex &&
              Math.hypot(o.x - p.x, o.z - p.z) < 6,
          )
          if (!company) lonely.push(`${p.id}:${p.idleKey}@${tickNo}`)
        }
        const cur = live.get(p.id)
        if (!cur || cur.key !== p.idleKey) {
          live.set(p.id, { key: p.idleKey!, talk: talking, offAt: -1000 })
          continue
        }
        if (cur.talk && !talking) {
          cur.offAt = tickNo
          if (settledWithCompany(director, p.id)) turns += 1
        }
        if (!cur.talk && talking && tickNo - cur.offAt <= 50) blinks += 1
        cur.talk = talking
      }
    },
  })
  return { blinks, turns, lonely, sawTalk }
}

describe('chat bubbles in a run (P05 review)', () => {
  it('never show with nobody to talk to', () => {
    const { lonely, sawTalk } = observe(false)
    expect(sawTalk).toBe(true)
    expect(lonely).toEqual([])
  })

  it('take turns normally but stay on under reduced motion', () => {
    const normal = observe(false)
    expect(normal.blinks).toBeGreaterThan(0)
    expect(normal.turns).toBeGreaterThan(0)
    const reduced = observe(true)
    expect(reduced.sawTalk).toBe(true)
    // Under reduced motion the bubble never goes off while there is company.
    // It may still go off and on when company walks away and comes back,
    // which is real state, not turn-taking; that stays rare.
    expect(reduced.turns).toBe(0)
    expect(reduced.blinks).toBeLessThan(normal.blinks / 20)
  })
})
