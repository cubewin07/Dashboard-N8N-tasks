/**
 * Toolbar under the preview: randomise + locks, presets, copy look, undo/redo, reset, compare,
 * save with conflict dialog (P08b-T11).
 * `onCompare(true|false)` lets the page show the saved look while "compare" is held.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Dices, Palette, Redo2, RotateCcw, Save, Undo2, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { fmt } from '@/lib/utils'
import { useI18n } from '@/i18n'
import type { AppearanceV1 } from '@/domain/appearance'
import { useConfigStore } from '@/office/configStore'
import {
  AppearanceConflictError,
  getGeneratedAppearance,
  saveAppearance,
  useAppearanceCache,
} from '@/office/appearanceStore'
import { DEFAULT_CATALOG, type Catalog, type CatalogSlot } from '@/scene/characters/catalog'
import { applyClamps, applyPreset, randomise, type LockKey } from '../logic'
import { ConflictDialog } from '../ConflictDialog'
import { PRESETS } from '../presets'
import { selectCanRedo, selectCanUndo, useWardrobeEditor } from '../useWardrobeEditor'

export interface WardrobeToolbarProps {
  onCompare?: (showSaved: boolean) => void
  /** Catalogue to work against (tests inject one); defaults to the bundled catalogue. */
  catalog?: Catalog
}

let seedCounter = 0
const nextSeed = (): string => `${Date.now()}:${(seedCounter += 1)}`
const ed = (): ReturnType<typeof useWardrobeEditor.getState> => useWardrobeEditor.getState()
const isoNow = (): string => new Date().toISOString()

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
  if (target instanceof HTMLInputElement) {
    return !['range', 'checkbox', 'radio', 'button'].includes(target.type)
  }
  return false
}

/** Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z and Ctrl+Y redo (not while typing in a text field). */
function useUndoShortcuts(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || isTextEntry(e.target)) return
      const k = e.key.toLowerCase()
      const st = useWardrobeEditor.getState()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        st.undo()
      } else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)) {
        e.preventDefault()
        st.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function WardrobeToolbar({ onCompare, catalog = DEFAULT_CATALOG }: WardrobeToolbarProps) {
  const { t, lang } = useI18n()
  const text = t.wardrobeEditor.toolbar
  useUndoShortcuts()

  const employeeId = useWardrobeEditor((s) => s.employeeId)
  const draft = useWardrobeEditor((s) => s.draft)
  const dirty = useWardrobeEditor((s) => s.dirty)
  const locks = useWardrobeEditor((s) => s.locks)
  const canUndo = useWardrobeEditor(selectCanUndo)
  const canRedo = useWardrobeEditor(selectCanRedo)
  const employees = useConfigStore((s) => s.config?.employees)

  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<AppearanceConflictError | null>(null)
  const [copyTarget, setCopyTarget] = useState<{ id: string; name: string } | null>(null)
  const comparing = useRef(false)

  const others = useMemo(
    () => (employees ?? []).filter((e) => e.state === 'active' && !e.archivedAt && e.id !== employeeId),
    [employees, employeeId],
  )
  const selfName = employees?.find((e) => e.id === employeeId)?.name

  function setCompare(on: boolean): void {
    if (comparing.current === on) return
    comparing.current = on
    onCompare?.(on)
  }
  useEffect(() => () => {
    if (comparing.current) onCompare?.(false)
    // only on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function doRandomise(): void {
    const d = ed().draft
    if (!d) return
    ed().edit(randomise(d, catalog, ed().locks, nextSeed()))
  }

  function doPreset(key: string): void {
    const d = ed().draft
    const preset = PRESETS.find((p) => p.key === key)
    if (!d || !preset) return
    const res = applyPreset(d, preset, catalog, nextSeed())
    ed().edit(applyClamps(res.doc, res.clamps))
    toast.success(fmt(text.presetApplied, { name: preset.label[lang] }))
  }

  function doReset(): void {
    if (!employeeId) return
    ed().reset(getGeneratedAppearance(employeeId, selfName))
  }

  async function doSave(expected?: number): Promise<void> {
    const s = ed()
    if (!s.employeeId || !s.draft) return
    const doc: AppearanceV1 = { ...s.draft, updatedAt: isoNow() }
    setSaving(true)
    try {
      const res = await saveAppearance(s.employeeId, doc, expected ?? s.version)
      ed().markSaved(doc, res.version)
      setConflict(null)
      toast.success(text.saved)
    } catch (err) {
      if (err instanceof AppearanceConflictError) setConflict(err)
      else toast.error(text.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  function takeTheirs(): void {
    const c = conflict
    if (!c || !employeeId) return
    ed().adoptSaved(c.current ?? getGeneratedAppearance(employeeId, selfName), c.currentVersion)
    setConflict(null)
  }

  async function doCopy(): Promise<void> {
    const target = copyTarget
    const d = ed().draft
    if (!target || !d) return
    setCopyTarget(null)
    try {
      const version = useAppearanceCache.getState().versions[target.id] ?? 0
      await saveAppearance(target.id, { ...d, updatedAt: isoNow() }, version)
      toast.success(fmt(text.copied, { name: target.name }))
    } catch {
      toast.error(text.copyFailed)
    }
  }

  const lockKeys: Array<{ key: LockKey; label: string }> = [
    ...(Object.keys(catalog.bySlot) as CatalogSlot[])
      .filter((s) => catalog.bySlot[s].length > 0)
      .map((s) => ({ key: s as LockKey, label: t.wardrobeEditor.slots[s] })),
    { key: 'skin', label: text.lockSkin },
    { key: 'body', label: text.lockBody },
  ]

  const none = !draft || !employeeId

  return (
    <div role="toolbar" aria-label={text.label} data-testid="wardrobe-toolbar" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => ed().undo()} disabled={none || !canUndo} aria-label={text.undo} title={`${text.undo} (Ctrl/⌘+Z)`}>
          <Undo2 aria-hidden />
        </Button>
        <Button variant="outline" size="sm" onClick={() => ed().redo()} disabled={none || !canRedo} aria-label={text.redo} title={`${text.redo} (Shift+Ctrl/⌘+Z)`}>
          <Redo2 aria-hidden />
        </Button>
        <Button variant="outline" size="sm" onClick={doRandomise} disabled={none}>
          <Dices aria-hidden />
          {text.randomise}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={none}>
              <Palette aria-hidden />
              {text.presets}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {PRESETS.map((p) => (
              <DropdownMenuItem key={p.key} onSelect={() => doPreset(p.key)}>
                {p.label[lang]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={none}>
              <Copy aria-hidden />
              {text.copyTo}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent aria-label={text.copyPick}>
            {others.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">{text.copyNone}</p>
            ) : (
              others.map((e) => (
                <DropdownMenuItem key={e.id} onSelect={() => setCopyTarget({ id: e.id, name: e.name })}>
                  {e.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" onClick={doReset} disabled={none} title={text.resetHint}>
          <RotateCcw aria-hidden />
          {text.reset}
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={none || !dirty}
          title={text.compareHint}
          aria-label={`${text.compare}: ${text.compareHint}`}
          onPointerDown={() => setCompare(true)}
          onPointerUp={() => setCompare(false)}
          onPointerLeave={() => setCompare(false)}
          onPointerCancel={() => setCompare(false)}
          onBlur={() => setCompare(false)}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') setCompare(true)
          }}
          onKeyUp={(e) => {
            if (e.key === ' ' || e.key === 'Enter') setCompare(false)
          }}
        >
          <Eye aria-hidden />
          {text.compare}
        </Button>

        <Button size="sm" className="ml-auto" onClick={() => void doSave()} disabled={none || !dirty || saving}>
          <Save aria-hidden />
          {saving ? text.saving : text.save}
        </Button>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer select-none text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {text.locks}
        </summary>
        <p className="mt-1 text-xs text-muted-foreground">{text.locksHint}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {lockKeys.map(({ key, label }) => (
            <label key={key} className="inline-flex min-h-8 items-center gap-1.5">
              <input
                type="checkbox"
                checked={locks.has(key)}
                onChange={() => ed().toggleLock(key)}
                className="size-4 accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
      </details>
      {dirty ? <p className="text-xs text-muted-foreground">{text.unsaved}</p> : null}

      <ConflictDialog
        conflict={conflict}
        saving={saving}
        onReload={takeTheirs}
        onOverwrite={(c) => void doSave(c.currentVersion)}
        onClose={() => setConflict(null)}
      />

      <Dialog open={copyTarget !== null} onOpenChange={(o) => (o ? undefined : setCopyTarget(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fmt(text.copyConfirmTitle, { name: copyTarget?.name ?? '' })}</DialogTitle>
            <DialogDescription>{fmt(text.copyConfirmBody, { name: copyTarget?.name ?? '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyTarget(null)}>
              {t.common.actions.cancel}
            </Button>
            <Button onClick={() => void doCopy()}>{text.copyConfirm}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
