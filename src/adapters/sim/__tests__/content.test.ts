import { describe, expect, it } from 'vitest'
import taskTypesRaw from '@/content/task-types.json'
import {
  ALL_REVIEW_NOTES_VI,
  BOSS_MESSAGES_VI,
  CUSTOMERS_VI,
  PRODUCTS_VI,
  QUESTIONS_VI,
  renderTaskTitle,
  TASK_TITLE_TEMPLATES_VI,
} from '../content/vi'
import { mulberry32, pick } from '../rng'

describe('sim Vietnamese content & task title templates (P03-T08)', () => {
  it('meets content pool size requirements', () => {
    expect(CUSTOMERS_VI.length).toBeGreaterThanOrEqual(40)
    expect(PRODUCTS_VI.length).toBeGreaterThanOrEqual(30)
    expect(BOSS_MESSAGES_VI.length).toBeGreaterThanOrEqual(25)
    expect(ALL_REVIEW_NOTES_VI.length).toBeGreaterThanOrEqual(20)
    expect(QUESTIONS_VI.length).toBeGreaterThanOrEqual(15)
    expect(taskTypesRaw.length).toBe(43)
  })

  it('renders 500 task titles across all 43 task types with no unreplaced braces', () => {
    const rng = mulberry32('p03-t08-titles')
    const keys = taskTypesRaw.map((t) => t.key)

    for (const key of keys) {
      expect(TASK_TITLE_TEMPLATES_VI[key]?.length).toBeGreaterThan(0)
    }

    for (let i = 0; i < 500; i += 1) {
      const typeKey = keys[i % keys.length]!
      const tt = taskTypesRaw[i % taskTypesRaw.length]!
      const platformKey =
        tt.platformKeys.length > 0 ? pick(rng, tt.platformKeys) : undefined
      const title = renderTaskTitle(typeKey, rng, {
        departmentId: `dep_${tt.departmentKey}`,
        platformKey,
      })

      expect(title.length).toBeGreaterThan(10)
      expect(title).not.toContain('{')
      expect(title).not.toContain('}')
    }
  })
})
