import { beforeEach, describe, expect, it } from 'vitest'
import type { AppearanceV1 } from '@/domain/appearance'
import { generateAppearance } from '@/scene/characters/generate'
import {
  EMPTY_EDITOR,
  MAX_HISTORY,
  canRedo,
  canUndo,
  editDraft,
  loadEditor,
  markSavedState,
  redoDraft,
  resetDraft,
  setLockState,
  undoDraft,
} from '../editorState'
import { useWardrobeEditor } from '../useWardrobeEditor'

const base = generateAppearance('emp_linh')
const withHeight = (h: number): AppearanceV1 => ({ ...base, body: { ...base.body, height: h } })

describe('editor reducers', () => {
  it('loads clean with one history entry', () => {
    const s = loadEditor('emp_linh', base, 3)
    expect(s).toMatchObject({ employeeId: 'emp_linh', version: 3, cursor: 0, dirty: false })
    expect(s.history).toEqual([base])
    expect(canUndo(s)).toBe(false)
  })

  it('tracks dirty and ignores no-op edits', () => {
    let s = loadEditor('emp_linh', base, 0)
    expect(editDraft(s, { ...base })).toBe(s)
    s = editDraft(s, withHeight(0.9))
    expect(s.dirty).toBe(true)
    expect(s.history).toHaveLength(2)
    s = editDraft(s, base)
    expect(s.dirty).toBe(false)
  })

  it('keeps at least 50 undo steps and undoes back to the start', () => {
    let s = loadEditor('emp_linh', base, 0)
    for (let i = 1; i <= 60; i += 1) s = editDraft(s, withHeight(i / 100))
    expect(s.history.length).toBeGreaterThanOrEqual(51)
    let undone = 0
    while (canUndo(s)) {
      s = undoDraft(s)
      undone += 1
    }
    expect(undone).toBe(60)
    expect(s.draft).toBe(base)
    expect(s.dirty).toBe(false)
  })

  it('caps history at MAX_HISTORY, dropping the oldest', () => {
    let s = loadEditor('emp_linh', base, 0)
    for (let i = 1; i <= MAX_HISTORY + 20; i += 1) s = editDraft(s, withHeight(((i % 99) + 1) / 100 + (i > 99 ? 0.001 * i : 0)))
    expect(s.history).toHaveLength(MAX_HISTORY)
    expect(s.cursor).toBe(MAX_HISTORY - 1)
  })

  it('clears redo after a new edit', () => {
    let s = loadEditor('emp_linh', base, 0)
    s = editDraft(s, withHeight(0.2))
    s = editDraft(s, withHeight(0.3))
    s = undoDraft(s)
    expect(canRedo(s)).toBe(true)
    expect(redoDraft(s).draft?.body.height).toBe(0.3)
    s = editDraft(s, withHeight(0.4))
    expect(canRedo(s)).toBe(false)
    expect(s.history.map((d) => d.body.height)).toEqual([base.body.height, 0.2, 0.4])
  })

  it('reset is an undoable edit; docs are never mutated', () => {
    let s = loadEditor('emp_linh', base, 0)
    const edited = withHeight(0.1)
    s = editDraft(s, edited)
    const snap = JSON.stringify(edited)
    s = resetDraft(s, base)
    expect(s.draft).toBe(base)
    expect(undoDraft(s).draft).toBe(edited)
    expect(JSON.stringify(edited)).toBe(snap)
  })

  it('markSaved updates saved/version/dirty and keeps history', () => {
    let s = loadEditor('emp_linh', base, 0)
    const e = withHeight(0.7)
    s = editDraft(s, e)
    s = markSavedState(s, e, 1)
    expect(s).toMatchObject({ version: 1, dirty: false, saved: e })
    expect(canUndo(s)).toBe(true)
    expect(undoDraft(s).dirty).toBe(true)
  })

  it('locks toggle immutably', () => {
    const s = loadEditor('emp_linh', base, 0)
    const l = setLockState(s, 'hair', true)
    expect(l.locks.has('hair')).toBe(true)
    expect(s.locks.has('hair')).toBe(false)
    expect(setLockState(l, 'hair', true)).toBe(l)
    expect(setLockState(l, 'hair', false).locks.size).toBe(0)
  })
})

describe('useWardrobeEditor store', () => {
  beforeEach(() => useWardrobeEditor.getState().close())

  it('wires the reducers', () => {
    const st = useWardrobeEditor.getState()
    st.load('emp_linh', base, 2)
    st.edit(withHeight(0.8))
    expect(useWardrobeEditor.getState().dirty).toBe(true)
    st.undo()
    expect(useWardrobeEditor.getState().draft).toBe(base)
    st.redo()
    expect(useWardrobeEditor.getState().draft?.body.height).toBe(0.8)
    st.toggleLock('top')
    expect(useWardrobeEditor.getState().locks.has('top')).toBe(true)
    st.markSaved(withHeight(0.8), 3)
    expect(useWardrobeEditor.getState()).toMatchObject({ version: 3, dirty: false })
    st.close()
    expect(useWardrobeEditor.getState().employeeId).toBe(EMPTY_EDITOR.employeeId)
  })
})
