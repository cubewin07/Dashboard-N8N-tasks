import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateAppearance } from '@/scene/characters/generate'
import { AppearanceConflictError } from '@/ports/AppearanceStore'
import { APPEARANCE_STORAGE_KEY, LocalAppearanceStore } from '../LocalAppearanceStore'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null
  }
  removeItem(k: string): void {
    this.map.delete(k)
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v)
  }
}

let storage: MemoryStorage
let target: EventTarget

function make(): LocalAppearanceStore {
  return new LocalAppearanceStore({ storage, eventTarget: target })
}

beforeEach(() => {
  storage = new MemoryStorage()
  target = new EventTarget()
})

describe('LocalAppearanceStore', () => {
  it('increments the version on each save and persists the envelope', async () => {
    const s = make()
    const a = generateAppearance('emp_a')
    expect(await s.get('emp_a')).toBeNull()
    expect(await s.save('emp_a', a, 0)).toEqual({ version: 1 })
    expect(await s.save('emp_a', { ...a, skin: 'skin_01' }, 1)).toEqual({ version: 2 })
    const raw = JSON.parse(storage.getItem(APPEARANCE_STORAGE_KEY)!)
    expect(raw.schema).toBe(1)
    expect(raw.items.emp_a.version).toBe(2)
    expect((await s.get('emp_a'))?.skin).toBe('skin_01')
    expect((await s.getEntries()).emp_a?.version).toBe(2)
  })

  it('rejects a stale expectedVersion with the current doc and version', async () => {
    const s = make()
    const a = generateAppearance('emp_a')
    await s.save('emp_a', a, 0)
    await expect(s.save('emp_a', a, 0)).rejects.toBeInstanceOf(AppearanceConflictError)
    const err = await s.save('emp_a', a, 5).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppearanceConflictError)
    const conflict = err as AppearanceConflictError
    expect(conflict.currentVersion).toBe(1)
    expect(conflict.current?.base).toBe(a.base)
    // Unknown id is version 0.
    await expect(s.save('emp_b', a, 1)).rejects.toBeInstanceOf(AppearanceConflictError)
  })

  it('notifies subscribers on own saves and on storage events from another tab', async () => {
    const tab1 = make()
    const tab2 = new LocalAppearanceStore({ storage, eventTarget: new EventTarget() })
    const seen: string[] = []
    tab1.subscribe((id) => seen.push(id))
    const a = generateAppearance('emp_a')
    await tab1.save('emp_a', a, 0)
    expect(seen).toEqual(['emp_a'])
    // Another tab writes, then the browser fires `storage` in this tab.
    await tab2.save('emp_b', generateAppearance('emp_b'), 0)
    target.dispatchEvent(Object.assign(new Event('storage'), { key: APPEARANCE_STORAGE_KEY }))
    expect(seen).toEqual(['emp_a', 'emp_b'])
    // Unrelated key and unchanged versions do not notify.
    target.dispatchEvent(Object.assign(new Event('storage'), { key: 'other' }))
    target.dispatchEvent(Object.assign(new Event('storage'), { key: APPEARANCE_STORAGE_KEY }))
    expect(seen).toEqual(['emp_a', 'emp_b'])
  })

  it('stops notifying after unsubscribe', async () => {
    const s = make()
    const cb = vi.fn()
    const off = s.subscribe(cb)
    off()
    await s.save('emp_a', generateAppearance('emp_a'), 0)
    expect(cb).not.toHaveBeenCalled()
  })

  it('backs up corrupt JSON and resets', async () => {
    storage.setItem(APPEARANCE_STORAGE_KEY, '{not json')
    const s = make()
    expect(await s.getAll()).toEqual({})
    expect(storage.getItem(`${APPEARANCE_STORAGE_KEY}.backup-1`)).toBe('{not json')
    storage.setItem(APPEARANCE_STORAGE_KEY, '[1,2]')
    expect(await s.getAll()).toEqual({})
    expect(storage.getItem(`${APPEARANCE_STORAGE_KEY}.backup-2`)).toBe('[1,2]')
    expect(await s.save('emp_a', generateAppearance('emp_a'), 0)).toEqual({ version: 1 })
  })

  it('migrates stored docs on read', async () => {
    storage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ schema: 1, items: { emp_a: { doc: { v: 1, base: 'male' }, version: 3 } } }),
    )
    const e = (await make().getEntries()).emp_a!
    expect(e.version).toBe(3)
    expect(e.doc.base).toBe('male')
    expect(e.doc.outfit.shoes).not.toBeUndefined()
  })
})
