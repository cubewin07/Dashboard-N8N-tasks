import { beforeEach, describe, expect, it } from 'vitest'
import { LocalAppearanceStore } from '@/adapters/local/LocalAppearanceStore'
import { generateAppearance } from '@/scene/characters/generate'
import {
  AppearanceConflictError,
  getGeneratedAppearance,
  saveAppearance,
  setAppearanceStore,
  useAppearanceCache,
} from '../appearanceStore'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  clear() { this.map.clear() }
  getItem(k: string) { return this.map.get(k) ?? null }
  key(i: number) { return [...this.map.keys()][i] ?? null }
  removeItem(k: string) { this.map.delete(k) }
  setItem(k: string, v: string) { this.map.set(k, v) }
}

let storage: MemoryStorage
beforeEach(() => {
  storage = new MemoryStorage()
  setAppearanceStore(new LocalAppearanceStore({ storage, eventTarget: new EventTarget() }))
})

describe('office appearance store', () => {
  it('caches saved docs and versions, and reports conflicts', async () => {
    const a = generateAppearance('emp_a')
    expect(await saveAppearance('emp_a', a, 0)).toEqual({ version: 1 })
    const st = useAppearanceCache.getState()
    expect(st.docs.emp_a).toEqual(a)
    expect(st.versions.emp_a).toBe(1)
    await expect(saveAppearance('emp_a', a, 0)).rejects.toBeInstanceOf(AppearanceConflictError)
  })

  it('keeps generated defaults stable per employee', () => {
    expect(getGeneratedAppearance('emp_x')).toBe(getGeneratedAppearance('emp_x'))
    expect(getGeneratedAppearance('emp_x')).toEqual(generateAppearance('emp_x'))
  })

  it('loads pre-existing storage into the cache', () => {
    const s2 = new MemoryStorage()
    const seed = new LocalAppearanceStore({ storage: s2, eventTarget: new EventTarget() })
    return seed.save('emp_b', generateAppearance('emp_b'), 0).then(() => {
      setAppearanceStore(new LocalAppearanceStore({ storage: s2, eventTarget: new EventTarget() }))
      expect(useAppearanceCache.getState().versions.emp_b).toBe(1)
    })
  })
})
