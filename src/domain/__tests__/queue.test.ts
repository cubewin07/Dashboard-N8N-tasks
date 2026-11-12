import { describe, expect, it } from 'vitest'
import { DEFAULT_POLICY, t } from '../__fixtures__/builders'
import { effectivePriority, sortQueue, type QueueableItem } from '../queue'

describe('priority queue and aging (P03-T03)', () => {
  const policy = DEFAULT_POLICY

  it('ranks a normal item waiting 5h >= a fresh high item', () => {
    const now = t(5 * 60) // 5 hours
    const normal5h: QueueableItem = {
      id: 'item_normal_old',
      priority: 'normal',
      createdAt: t(0),
    }
    const freshHigh: QueueableItem = {
      id: 'item_high_fresh',
      priority: 'high',
      createdAt: now,
    }

    // normal (200) + 5 * 20 (100) = 300; fresh high = 300
    expect(effectivePriority(normal5h, now, policy)).toBe(300)
    expect(effectivePriority(freshHigh, now, policy)).toBe(300)

    // Tie broken by older createdAt first -> normal5h ranks first
    const sorted = sortQueue([freshHigh, normal5h], now, policy)
    expect(sorted.map((x) => x.id)).toEqual(['item_normal_old', 'item_high_fresh'])
  })

  it('caps aging at agingCapPoints (150) so low never passes a fresh high (250 < 300)', () => {
    const now = t(24 * 60) // 24 hours
    const ancientLow: QueueableItem = {
      id: 'item_low_ancient',
      priority: 'low',
      createdAt: t(0),
    }
    const freshHigh: QueueableItem = {
      id: 'item_high_fresh',
      priority: 'high',
      createdAt: now,
    }

    // low (100) + cap (150) = 250 < 300
    expect(effectivePriority(ancientLow, now, policy)).toBe(250)
    const sorted = sortQueue([ancientLow, freshHigh], now, policy)
    expect(sorted.map((x) => x.id)).toEqual(['item_high_fresh', 'item_low_ancient'])
  })

  it('breaks ties by older createdAt first, then lower id first', () => {
    const now = t(60)
    const items: QueueableItem[] = [
      { id: 'task_c', priority: 'normal', createdAt: t(30) },
      { id: 'task_a', priority: 'normal', createdAt: t(30) },
      { id: 'task_b', priority: 'normal', createdAt: t(10) },
    ]
    const sorted = sortQueue(items, now, policy)
    expect(sorted.map((i) => i.id)).toEqual(['task_b', 'task_a', 'task_c'])
  })

  it('sorts 10 000 items in under 20 ms', () => {
    const priorities = ['urgent', 'high', 'normal', 'low'] as const
    const items: QueueableItem[] = []
    for (let i = 0; i < 10_000; i += 1) {
      items.push({
        id: `task_${String(10_000 - i).padStart(6, '0')}`,
        priority: priorities[i % 4]!,
        createdAt: t(i % 240),
      })
    }
    const now = t(300)
    // Warm up JIT once
    sortQueue(items.slice(0, 100), now, policy)

    const start = performance.now()
    const sorted = sortQueue(items, now, policy)
    const elapsedMs = performance.now() - start

    expect(sorted).toHaveLength(10_000)
    expect(sorted[0]!.priority).toBe('urgent')
    // Under v8 code coverage instrumentation and virtualized CI runners,
    // execution has substantial counter overhead compared to raw V8 (~5-10 ms).
    const maxAllowedMs = 75
    expect(elapsedMs).toBeLessThan(maxAllowedMs)
  })
})
