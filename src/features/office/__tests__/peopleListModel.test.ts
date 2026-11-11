import { describe, expect, it } from 'vitest'
import { makeConfig } from '@/domain/__fixtures__/builders'
import {
  buildPeopleGroups,
  filterPeopleGroups,
  findPerson,
  foldText,
} from '../peopleListModel'

describe('peopleListModel (P04-T11)', () => {
  it('folds case and Vietnamese diacritics, including đ', () => {
    expect(foldText('Bảo')).toBe('bao')
    expect(foldText('  ĐỨC ')).toBe('duc')
    expect(foldText('Nguyễn Thị Đào')).toBe('nguyen thi dao')
  })

  it('groups active people like the org list and drops empty groups', () => {
    const groups = buildPeopleGroups(makeConfig())
    expect(groups.map((g) => [g.key, g.people.map((p) => p.id)])).toEqual([
      ['boss', ['emp_owner_1']],
      ['management', ['emp_thu']],
      ['cs', ['emp_ngoc', 'emp_mai']],
    ])
    expect(findPerson(groups, 'emp_mai')?.groupLabel.vi).toBe('Chăm sóc khách hàng')
    expect(findPerson(groups, 'emp_nobody')).toBeNull()
  })

  it('filters by folded name and keeps only groups with matches', () => {
    const groups = buildPeopleGroups(makeConfig())
    const hit = filterPeopleGroups(groups, 'NGOC')
    expect(hit).toHaveLength(1)
    expect(hit[0]?.people.map((p) => p.name)).toEqual(['Ngọc'])
    expect(filterPeopleGroups(groups, '   ')).toHaveLength(3)
    expect(filterPeopleGroups(groups, 'zzz')).toEqual([])
  })
})
