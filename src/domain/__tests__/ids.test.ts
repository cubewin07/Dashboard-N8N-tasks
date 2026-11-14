import { describe, expect, it } from 'vitest'
import { isIdOf, newId } from '../ids'
import { DepartmentIdSchema, EmployeeIdSchema, LEVEL_RANK } from '../primitives'

describe('domain ids and primitives', () => {
  it('creates prefixed IDs with injected ulid factory', () => {
    const id = newId('emp', () => '01JTEST0001')
    expect(id).toBe('emp_01JTEST0001')
    expect(isIdOf(id, 'emp')).toBe(true)
    expect(isIdOf(id, 'dep')).toBe(false)
    expect(EmployeeIdSchema.safeParse(id).success).toBe(true)
    expect(DepartmentIdSchema.safeParse(id).success).toBe(false)
  })

  it('throws when ulid factory returns empty string', () => {
    expect(() => newId('task', () => '   ')).toThrow(/Invalid ULID/)
  })

  it('orders approval levels reviewer < dept_manager < boss', () => {
    expect(LEVEL_RANK.reviewer).toBeLessThan(LEVEL_RANK.dept_manager)
    expect(LEVEL_RANK.dept_manager).toBeLessThan(LEVEL_RANK.boss)
  })
})
