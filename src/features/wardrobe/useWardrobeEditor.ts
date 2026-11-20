import { create } from 'zustand'
import type { AppearanceV1 } from '@/domain/appearance'
import type { LockKey } from './logic'
import {
  EMPTY_EDITOR,
  canRedo,
  canUndo,
  editDraft,
  loadEditor,
  markSavedState,
  redoDraft,
  resetDraft,
  setLockState,
  undoDraft,
  type EditorState,
} from './editorState'

export interface WardrobeEditorActions {
  /** Start editing an employee: `saved` is their saved (or generated) look. */
  load(employeeId: string, saved: AppearanceV1, version: number): void
  edit(next: AppearanceV1): void
  undo(): void
  redo(): void
  /** Replace the draft with the generated default look (undoable). */
  reset(generated: AppearanceV1): void
  setLock(key: LockKey, locked: boolean): void
  toggleLock(key: LockKey): void
  markSaved(doc: AppearanceV1, version: number): void
  /** Take the stored look from another save (conflict "theirs"): becomes the draft and saved look. */
  adoptSaved(doc: AppearanceV1, version: number): void
  close(): void
}

/** Editor session state local to the wardrobe feature (not part of the office store). */
export const useWardrobeEditor = create<EditorState & WardrobeEditorActions>((set, get) => ({
  ...EMPTY_EDITOR,
  load: (employeeId, saved, version) => set(loadEditor(employeeId, saved, version)),
  edit: (next) => set(editDraft(get(), next)),
  undo: () => set(undoDraft(get())),
  redo: () => set(redoDraft(get())),
  reset: (generated) => set(resetDraft(get(), generated)),
  setLock: (key, locked) => set(setLockState(get(), key, locked)),
  toggleLock: (key) => set(setLockState(get(), key, !get().locks.has(key))),
  markSaved: (doc, version) => set(markSavedState(get(), doc, version)),
  adoptSaved: (doc, version) => {
    const s = get()
    if (!s.employeeId) return
    set({ ...loadEditor(s.employeeId, doc, version), locks: s.locks })
  },
  close: () => set({ ...EMPTY_EDITOR, locks: new Set() }),
}))

export const selectCanUndo = (s: EditorState): boolean => canUndo(s)
export const selectCanRedo = (s: EditorState): boolean => canRedo(s)
