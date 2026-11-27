import { create } from 'zustand'
import type { FeedIssue } from '@/ports/OfficeFeed'

/**
 * What went wrong quietly (P11 §3.5): invalid feed events that were skipped, 3D canvas
 * errors and WebGL context losses. Shown in Settings → Giới thiệu → Chẩn đoán; never
 * thrown to the UI. Wall time here is fine: this is not domain state.
 */
export type DiagnosticKind = 'invalid_event' | 'canvas_error' | 'context_lost' | 'context_restored'

export interface DiagnosticEntry {
  kind: DiagnosticKind
  detail: string
  /** Wall-clock ISO time it was recorded. */
  at: string
}

export interface DiagnosticsState {
  invalidEvents: number
  canvasErrors: number
  contextLosses: number
  /** Newest first, at most MAX_ENTRIES. */
  entries: DiagnosticEntry[]
  record: (kind: DiagnosticKind, detail: string) => void
  recordFeedIssue: (issue: FeedIssue) => void
  clear: () => void
}

export const MAX_DIAGNOSTIC_ENTRIES = 20

const empty = { invalidEvents: 0, canvasErrors: 0, contextLosses: 0, entries: [] as DiagnosticEntry[] }

export const useDiagnostics = create<DiagnosticsState>((set) => ({
  ...empty,
  record: (kind, detail) =>
    set((s) => ({
      invalidEvents: s.invalidEvents + (kind === 'invalid_event' ? 1 : 0),
      canvasErrors: s.canvasErrors + (kind === 'canvas_error' ? 1 : 0),
      contextLosses: s.contextLosses + (kind === 'context_lost' ? 1 : 0),
      entries: [{ kind, detail, at: new Date().toISOString() }, ...s.entries].slice(
        0,
        MAX_DIAGNOSTIC_ENTRIES,
      ),
    })),
  recordFeedIssue: (issue) => {
    const what = [issue.type, issue.eventId].filter(Boolean).join(' ')
    useDiagnostics.getState().record('invalid_event', what ? `${what}: ${issue.reason}` : issue.reason)
  },
  clear: () => set({ ...empty }),
}))
