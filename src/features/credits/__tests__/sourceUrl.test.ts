import { describe, expect, it } from 'vitest'
import { sourceUrl } from '../CreditsPage'

describe('credits sourceUrl', () => {
  it('keeps URLs, links repo paths to GitHub, drops free text', () => {
    expect(sourceUrl('https://fonts.google.com/specimen/Be+Vietnam+Pro')).toBe(
      'https://fonts.google.com/specimen/Be+Vietnam+Pro',
    )
    expect(sourceUrl('art/blender/gen_rigid.py')).toBe(
      'https://github.com/cubewin07/Dashboard-N8N-tasks/blob/main/art/blender/gen_rigid.py',
    )
    expect(sourceUrl('made by hand')).toBeNull()
  })
})
