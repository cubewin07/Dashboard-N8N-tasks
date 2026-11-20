import { describe, expect, it } from 'vitest'
import { can, canAccessRoute, landingFor } from '../roles'

describe('roles', () => {
  it('boss can do everything', () => {
    for (const a of ['command', 'wardrobe', 'office', 'org', 'queue', 'activity', 'settings.full', 'credits', 'legacy', 'dev'] as const) {
      expect(can('boss', a)).toBe(true)
    }
  })
  it('stylist only gets wardrobe and credits', () => {
    expect(can('stylist', 'wardrobe')).toBe(true)
    expect(can('stylist', 'credits')).toBe(true)
    for (const a of ['command', 'office', 'org', 'queue', 'activity', 'settings.full', 'legacy', 'dev'] as const) {
      expect(can('stylist', a)).toBe(false)
    }
    expect(can(null, 'wardrobe')).toBe(false)
  })
  it('routeAccess', () => {
    for (const p of ['/', '/org', '/queue', '/tasks/12', '/dev/people', '/wardrobe']) {
      expect(canAccessRoute('boss', p)).toBe(true)
    }
    for (const p of ['/wardrobe', '/settings', '/credits', '/login']) {
      expect(canAccessRoute('stylist', p)).toBe(true)
    }
    for (const p of ['/', '/org', '/queue', '/admin', '/activity', '/legacy', '/nope', '/wardrobefoo']) {
      expect(canAccessRoute('stylist', p)).toBe(false)
    }
    expect(canAccessRoute(null, '/')).toBe(false)
  })
  it('landingFor', () => {
    expect(landingFor('boss')).toBe('/')
    expect(landingFor('stylist')).toBe('/wardrobe')
  })
})
