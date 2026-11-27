import { ChevronLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBlocker, useSearchParams, type BlockerFunction } from 'react-router-dom'
import { PageHeader } from '@/components'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'
import { getGeneratedAppearance, initAppearanceStore, isBackendConfigured, useAppearanceCache } from '@/office/appearanceStore'
import { RemoteChangeBanner } from './ConflictDialog'
import { loadConfig, useConfigStore } from '@/office/configStore'
import { WardrobeEditorPanel } from './editor/WardrobeEditorPanel'
import { WardrobeToolbar } from './editor/WardrobeToolbar'
import { PeoplePicker } from './PeoplePicker'
import { buildWardrobePeople } from './peopleModel'
import { useWardrobeEditor } from './useWardrobeEditor'
import { WardrobePreview } from './WardrobePreview'

/** Tủ đồ: pick a person, edit their look with a live 3D preview (P08b). */
export function WardrobePage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const config = useConfigStore((s) => s.config)
  const status = useConfigStore((s) => s.status)
  const docs = useAppearanceCache((s) => s.docs)
  const draft = useWardrobeEditor((s) => s.draft)
  const saved = useWardrobeEditor((s) => s.saved)
  const dirty = useWardrobeEditor((s) => s.dirty)
  const editingId = useWardrobeEditor((s) => s.employeeId)
  const [compare, setCompare] = useState(false)

  // A stylist session never boots the office feed, so the page loads config and the look store itself.
  useEffect(() => {
    initAppearanceStore()
    if (!useConfigStore.getState().config) void loadConfig().catch(() => {})
  }, [])

  const people = useMemo(() => (config ? buildWardrobePeople(config) : []), [config])
  const savedIds = useMemo(() => new Set(Object.keys(docs)), [docs])
  const person = people.find((p) => p.id === selectedId) ?? null

  // Load the chosen person into the editor (once per selection; later saves keep the session).
  useEffect(() => {
    const editor = useWardrobeEditor.getState()
    if (!person) {
      if (editor.employeeId) editor.close()
      return
    }
    if (editor.employeeId === person.id) return
    const cache = useAppearanceCache.getState()
    editor.load(person.id, cache.docs[person.id] ?? getGeneratedAppearance(person.id, person.name), cache.versions[person.id] ?? 0)
  }, [person])

  // A save from another tab or device: a clean editor follows it; a dirty one keeps its draft
  // and gets the conflict dialog on save.
  const cachedVersion = useAppearanceCache((s) => (selectedId ? s.versions[selectedId] : undefined))
  const editorVersion = useWardrobeEditor((s) => s.version)
  const remoteChanged = dirty && cachedVersion !== undefined && cachedVersion > editorVersion
  useEffect(() => {
    const editor = useWardrobeEditor.getState()
    if (!selectedId || editor.employeeId !== selectedId || editor.dirty) return
    if (cachedVersion === undefined || cachedVersion <= editor.version) return
    const doc = useAppearanceCache.getState().docs[selectedId]
    if (doc) editor.adoptSaved(doc, cachedVersion)
  }, [selectedId, cachedVersion])

  useEffect(() => () => useWardrobeEditor.getState().close(), [])

  // R9: confirm before dropping unsaved changes (route change, other person, tab close).
  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) =>
        useWardrobeEditor.getState().dirty &&
        (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
      [],
    ),
  )
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const select = useCallback((id: string) => setParams({ id }), [setParams])
  const back = useCallback(() => setParams({}), [setParams])

  const ready = person !== null && editingId === person.id && draft !== null
  const editing = selectedId !== null

  return (
    <div className="space-y-4" data-testid="wardrobe-page">
      <div className={cn(editing && 'hidden lg:block')}>
        <PageHeader title={t.wardrobe.title} description={t.wardrobe.description} />
      </div>
      {!isBackendConfigured() && (
        <p role="note" className="text-xs text-muted-foreground" data-testid="wardrobe-device-only">
          {t.wardrobe.deviceOnly}
        </p>
      )}

      {editing && (
        <div className="flex items-center gap-2 lg:hidden">
          <Button variant="outline" size="icon" aria-label={t.wardrobe.page.backLabel} onClick={back} data-testid="wardrobe-back" className="size-11">
            <ChevronLeft aria-hidden />
          </Button>
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{person?.name ?? t.wardrobe.page.unknownPerson}</h2>
          {dirty && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium">{t.wardrobe.page.unsavedBadge}</span>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_22rem] lg:items-start">
        <div className={cn('lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-8rem)]', editing ? 'hidden' : 'block')}>
          {status === 'error' ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>{t.wardrobe.picker.loadError}</p>
              <Button variant="outline" onClick={() => void loadConfig().catch(() => {})}>
                {t.wardrobe.picker.retry}
              </Button>
            </div>
          ) : !config ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t.wardrobe.picker.loading}
            </p>
          ) : (
            <PeoplePicker
              people={people}
              departments={config.departments}
              selectedId={selectedId}
              savedIds={savedIds}
              onSelect={select}
              className="lg:max-h-[calc(100dvh-8rem)]"
            />
          )}
        </div>

        {editing ? (
          ready && person && draft ? (
            <>
              <div className="flex min-w-0 flex-col gap-3">
                <h2 className="hidden truncate text-base font-semibold lg:block">{fmt(t.wardrobe.page.editing, { name: person.name })}</h2>
                {remoteChanged && selectedId ? (
                  <RemoteChangeBanner
                    onReload={() => {
                      const doc = useAppearanceCache.getState().docs[selectedId]
                      const v = useAppearanceCache.getState().versions[selectedId]
                      if (doc && v !== undefined) useWardrobeEditor.getState().adoptSaved(doc, v)
                    }}
                  />
                ) : null}
                <WardrobePreview
                  appearance={draft}
                  name={person.name}
                  showSaved={compare ? saved : null}
                  className="h-[40dvh] min-h-64 lg:h-[min(62dvh,34rem)]"
                />
                <div role="region" aria-label={t.wardrobe.page.toolbarRegion}>
                  <WardrobeToolbar onCompare={setCompare} />
                </div>
              </div>
              <div role="region" aria-label={t.wardrobe.page.editorRegion} className="min-w-0">
                <WardrobeEditorPanel />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground lg:col-span-2" role={config && !person ? 'alert' : 'status'}>
              {config && !person ? t.wardrobe.page.unknownPerson : t.wardrobe.picker.loading}
            </p>
          )
        ) : (
          <p className="hidden text-sm text-muted-foreground lg:col-span-2 lg:block">{t.wardrobe.page.choosePrompt}</p>
        )}
      </div>

      <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.state === 'blocked' && blocker.reset()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.wardrobe.unsaved.title}</DialogTitle>
            <DialogDescription>{fmt(t.wardrobe.unsaved.body, { name: person?.name ?? '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => blocker.state === 'blocked' && blocker.reset()}>
              {t.wardrobe.unsaved.stay}
            </Button>
            <Button variant="danger" onClick={() => blocker.state === 'blocked' && blocker.proceed()} data-testid="wardrobe-discard">
              {t.wardrobe.unsaved.leave}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
