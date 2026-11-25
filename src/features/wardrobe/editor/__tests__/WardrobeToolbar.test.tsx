import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppearanceV1 } from '@/domain/appearance'
import { I18nProvider } from '@/i18n'
import { setAppearanceStore, useAppearanceCache } from '@/office/appearanceStore'
import { AppearanceConflictError, type AppearanceEntry, type AppearanceStore } from '@/ports/AppearanceStore'
import { generateAppearance } from '@/scene/characters/generate'
import { useWardrobeEditor } from '../../useWardrobeEditor'
import { WardrobeToolbar } from '../WardrobeToolbar'

/** In-memory store with versions; `bump` simulates another tab saving first. */
class FakeStore implements AppearanceStore {
  entries: Record<string, AppearanceEntry> = {}
  saves: Array<{ id: string; expected: number }> = []
  async get(id: string) { return this.entries[id]?.doc ?? null }
  async getAll() { return Object.fromEntries(Object.entries(this.entries).map(([k, v]) => [k, v.doc])) }
  async getEntries() { return this.entries }
  async save(id: string, doc: AppearanceV1, expected: number) {
    this.saves.push({ id, expected })
    const cur = this.entries[id]
    const stored = cur?.version ?? 0
    if (stored !== expected) throw new AppearanceConflictError(id, cur?.doc ?? null, stored, expected)
    this.entries[id] = { doc, version: stored + 1 }
    return { version: stored + 1 }
  }
  subscribe() { return () => undefined }
  bump(id: string, doc: AppearanceV1) {
    this.entries[id] = { doc, version: (this.entries[id]?.version ?? 0) + 1 }
  }
}

let store: FakeStore
const saved = generateAppearance('emp_t')
const other: AppearanceV1 = { ...saved, body: { ...saved.body, height: 0.11 } }

function renderBar(onCompare?: (b: boolean) => void) {
  return render(
    <I18nProvider>
      <WardrobeToolbar onCompare={onCompare} />
    </I18nProvider>,
  )
}
const draft = (): AppearanceV1 => useWardrobeEditor.getState().draft!
const edit = (h: number) => act(() => useWardrobeEditor.getState().edit({ ...draft(), body: { ...draft().body, height: h } }))

beforeEach(() => {
  store = new FakeStore()
  setAppearanceStore(store)
  useAppearanceCache.setState({ docs: {}, versions: {} })
  useWardrobeEditor.getState().close()
  act(() => useWardrobeEditor.getState().load('emp_t', saved, 0))
})
afterEach(cleanup)

describe('undo / redo', () => {
  it('buttons and Ctrl/Cmd+Z shortcuts step through history', () => {
    renderBar()
    expect(screen.getByRole('button', { name: 'Hoàn tác' }).hasAttribute('disabled')).toBe(true)
    edit(0.3)
    edit(0.4)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(draft().body.height).toBe(0.3)
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(draft().body.height).toBe(saved.body.height)
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true })
    expect(draft().body.height).toBe(0.3)
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(draft().body.height).toBe(0.4)
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }))
    expect(draft().body.height).toBe(0.3)
    fireEvent.click(screen.getByRole('button', { name: 'Làm lại' }))
    expect(draft().body.height).toBe(0.4)
  })

  it('leaves the shortcut to text fields', () => {
    renderBar()
    edit(0.3)
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
    expect(draft().body.height).toBe(0.3)
    input.remove()
  })
})

describe('compare', () => {
  it('holding the button shows the saved look, release goes back', () => {
    const onCompare = vi.fn()
    renderBar(onCompare)
    const btn = screen.getByRole('button', { name: /So sánh/ })
    expect(btn.hasAttribute('disabled')).toBe(true)
    edit(0.3)
    fireEvent.pointerDown(btn)
    expect(onCompare).toHaveBeenLastCalledWith(true)
    fireEvent.pointerUp(btn)
    expect(onCompare).toHaveBeenLastCalledWith(false)
    fireEvent.keyDown(btn, { key: ' ' })
    expect(onCompare).toHaveBeenLastCalledWith(true)
    fireEvent.keyUp(btn, { key: ' ' })
    expect(onCompare).toHaveBeenLastCalledWith(false)
  })
})

describe('save', () => {
  it('saves with the loaded version and marks the draft clean', async () => {
    renderBar()
    edit(0.3)
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await waitFor(() => expect(useWardrobeEditor.getState().dirty).toBe(false))
    expect(store.saves).toEqual([{ id: 'emp_t', expected: 0 }])
    expect(useWardrobeEditor.getState().version).toBe(1)
  })

  it('on conflict, "overwrite" re-saves over their version', async () => {
    renderBar()
    edit(0.3)
    store.bump('emp_t', other)
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Ghi đè' }))
    await waitFor(() => expect(useWardrobeEditor.getState().dirty).toBe(false))
    expect(store.saves.map((s) => s.expected)).toEqual([0, 1])
    expect(store.entries.emp_t!.doc.body.height).toBe(0.3)
    expect(useWardrobeEditor.getState().version).toBe(2)
  })

  it('on conflict, "reload" adopts the stored look', async () => {
    renderBar()
    edit(0.3)
    store.bump('emp_t', other)
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    await waitFor(() => expect(draft().body.height).toBe(0.11))
    expect(useWardrobeEditor.getState()).toMatchObject({ version: 1, dirty: false })
    expect(store.saves).toHaveLength(1)
  })
})

describe('randomise and reset', () => {
  it('randomise changes the look and respects a body lock; reset is undoable', () => {
    renderBar()
    act(() => useWardrobeEditor.getState().setLock('body', true))
    fireEvent.click(screen.getByRole('button', { name: /Ngẫu nhiên/ }))
    expect(draft().body).toEqual(saved.body)
    fireEvent.click(screen.getByRole('button', { name: /Đặt lại mặc định/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }))
    expect(useWardrobeEditor.getState().cursor).toBeGreaterThanOrEqual(0)
  })

  it('lock checkboxes toggle store locks', () => {
    renderBar()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Màu da' }))
    expect(useWardrobeEditor.getState().locks.has('skin')).toBe(true)
  })
})
