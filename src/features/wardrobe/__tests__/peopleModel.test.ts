import { describe, expect, it } from 'vitest'
import { loadConfig } from '@/office/configStore'
import { buildWardrobePeople, filterWardrobePeople, nextIndex } from '../peopleModel'

const config = await loadConfig()
const people = buildWardrobePeople(config)
const none = { query: '', departmentKey: null, showArchived: false }

describe('buildWardrobePeople', () => {
  it('lists every employee with owners first', () => {
    expect(people).toHaveLength(config.employees.length)
    const firstNonOwner = people.findIndex((p) => !p.owner)
    expect(firstNonOwner).toBeGreaterThan(0)
    expect(people.slice(0, firstNonOwner).every((p) => p.owner)).toBe(true)
    expect(people.slice(firstNonOwner).some((p) => p.owner)).toBe(false)
  })
})

describe('filterWardrobePeople', () => {
  it('hides archived people until asked', () => {
    const withArchived = [...people, { ...people[3]!, id: 'x_arch', archived: true }]
    expect(filterWardrobePeople(withArchived, none).some((p) => p.id === 'x_arch')).toBe(false)
    expect(filterWardrobePeople(withArchived, { ...none, showArchived: true }).some((p) => p.id === 'x_arch')).toBe(true)
  })

  it('searches names ignoring case and diacritics', () => {
    const hit = filterWardrobePeople(people, { ...none, query: 'giam doc' })
    expect(hit.length).toBeGreaterThan(0)
    expect(hit.every((p) => /giám đốc/i.test(p.name))).toBe(true)
    expect(filterWardrobePeople(people, { ...none, query: 'zzzz' })).toEqual([])
  })

  it('filters by department but keeps owners', () => {
    const dept = people.find((p) => !p.owner && p.departmentKey)!
    const out = filterWardrobePeople(people, { ...none, departmentKey: dept.departmentKey })
    expect(out.some((p) => p.id === dept.id)).toBe(true)
    expect(out.filter((p) => !p.owner).every((p) => p.departmentKey === dept.departmentKey)).toBe(true)
    expect(out.some((p) => p.owner)).toBe(true)
  })
})

describe('nextIndex', () => {
  it('moves and clamps', () => {
    expect(nextIndex(-1, 'ArrowDown', 3)).toBe(0)
    expect(nextIndex(2, 'ArrowDown', 3)).toBe(2)
    expect(nextIndex(0, 'ArrowUp', 3)).toBe(0)
    expect(nextIndex(1, 'End', 3)).toBe(2)
    expect(nextIndex(1, 'Home', 3)).toBe(0)
    expect(nextIndex(0, 'ArrowDown', 0)).toBe(-1)
  })
})
