/** Pure reducers behind `useWardrobeEditor` (no React, no zustand): easy to test. */
import type { AppearanceV1 } from '@/domain/appearance'
import { DEFAULT_CATALOG, type Catalog } from '@/scene/characters/catalog'
import { sameLook, type LockKey } from './logic'

/** Undo steps kept per editing session (R7 asks for at least 50). */
export const MAX_HISTORY = 100

export interface EditorState {
  employeeId: string | null
  /** The look as last saved (or generated when never saved). */
  saved: AppearanceV1 | null
  draft: AppearanceV1 | null
  /** Saved version used as `expectedVersion` on save (0 = never saved). */
  version: number
  /** Every draft the session went through; `history[cursor]` is the current draft. */
  history: AppearanceV1[]
  cursor: number
  locks: ReadonlySet<LockKey>
  dirty: boolean
}

export const EMPTY_EDITOR: EditorState = {
  employeeId: null,
  saved: null,
  draft: null,
  version: 0,
  history: [],
  cursor: -1,
  locks: new Set(),
  dirty: false,
}

export function loadEditor(employeeId: string, saved: AppearanceV1, version: number): EditorState {
  return {
    employeeId,
    saved,
    draft: saved,
    version,
    history: [saved],
    cursor: 0,
    locks: new Set(),
    dirty: false,
  }
}

function withDraft(s: EditorState, draft: AppearanceV1, history: AppearanceV1[], cursor: number, catalog: Catalog): EditorState {
  return { ...s, draft, history, cursor, dirty: !s.saved || !sameLook(draft, s.saved, catalog) }
}

/** A new edit: truncates redo, appends to history (oldest dropped past `MAX_HISTORY`). No-op when nothing changes. */
export function editDraft(
  s: EditorState,
  next: AppearanceV1,
  catalog: Catalog = DEFAULT_CATALOG,
): EditorState {
  if (!s.draft || next === s.draft || sameLook(s.draft, next, catalog)) return s
  let history = [...s.history.slice(0, s.cursor + 1), next]
  if (history.length > MAX_HISTORY) history = history.slice(history.length - MAX_HISTORY)
  return withDraft(s, next, history, history.length - 1, catalog)
}

export function undoDraft(s: EditorState, catalog: Catalog = DEFAULT_CATALOG): EditorState {
  if (s.cursor <= 0) return s
  const cursor = s.cursor - 1
  return withDraft(s, s.history[cursor]!, s.history, cursor, catalog)
}

export function redoDraft(s: EditorState, catalog: Catalog = DEFAULT_CATALOG): EditorState {
  if (s.cursor >= s.history.length - 1) return s
  const cursor = s.cursor + 1
  return withDraft(s, s.history[cursor]!, s.history, cursor, catalog)
}

export const canUndo = (s: EditorState): boolean => s.cursor > 0
export const canRedo = (s: EditorState): boolean => s.cursor >= 0 && s.cursor < s.history.length - 1

/** Replace the draft with the generated default (an undoable edit). */
export function resetDraft(
  s: EditorState,
  generated: AppearanceV1,
  catalog: Catalog = DEFAULT_CATALOG,
): EditorState {
  return editDraft(s, generated, catalog)
}

export function setLockState(s: EditorState, key: LockKey, locked: boolean): EditorState {
  if (s.locks.has(key) === locked) return s
  const locks = new Set(s.locks)
  if (locked) locks.add(key)
  else locks.delete(key)
  return { ...s, locks }
}

/** After a successful save: `doc` is the saved look at `version`; history stays so undo still works. */
export function markSavedState(
  s: EditorState,
  doc: AppearanceV1,
  version: number,
  catalog: Catalog = DEFAULT_CATALOG,
): EditorState {
  const next = { ...s, saved: doc, version }
  return { ...next, dirty: !s.draft || !sameLook(s.draft, doc, catalog) }
}
