import { Crosshair, ListChecks, X } from 'lucide-react'
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { activityTone, toneClasses } from '@/lib/status'
import { cn, fmt } from '@/lib/utils'
import { useConfig, useLabel, useOfficeSelector } from '@/office/hooks'
import { usePeopleUi } from '@/office/uiStore'
import { consumeKeepFocus } from './drawerFocus'
import { swatchHex } from './legendModel'
import { findPerson } from './peopleListModel'
import { EMPTY_FACTS, personFacts, type PersonFacts } from './personFactsModel'
import { usePeopleDirectory } from './usePeopleDirectory'

export interface PersonDrawerProps {
  /**
   * `canvas`: absolutely positioned on the right of the nearest positioned
   * ancestor (the 3D view container). `screen`: fixed to the viewport
   * (bottom sheet on phones, right panel from `sm`).
   */
  placement?: 'canvas' | 'screen'
  className?: string
}

/**
 * Non-modal details panel for the selected person. It never blocks the 3D
 * view: no overlay, no focus trap. Esc or the close button closes it.
 */
export function PersonDrawer({ placement = 'screen', className }: PersonDrawerProps) {
  const { t } = useI18n()
  const label = useLabel()
  const directory = usePeopleDirectory()
  const selectedId = usePeopleUi((s) => s.selectedId)
  const followed = usePeopleUi((s) => s.selectedId !== null && s.followedId === s.selectedId)
  const person = directory ? findPerson(directory, selectedId) : null

  const { config } = useConfig()
  // One primitive (a JSON string) for everything live, so feed batches that
  // do not touch this person do not re-render the drawer.
  const liveJson = useOfficeSelector((s) =>
    s && selectedId ? JSON.stringify(personFacts(s, selectedId)) : '',
  )
  const facts = useMemo<PersonFacts>(
    () => (liveJson ? (JSON.parse(liveJson) as PersonFacts) : EMPTY_FACTS),
    [liveJson],
  )

  const panelRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const open = person !== null

  // The selected person was archived or removed: close.
  useEffect(() => {
    if (selectedId && directory && !findPerson(directory, selectedId)) {
      usePeopleUi.getState().select(null)
    }
  }, [selectedId, directory])

  // Focus moves into the panel when it opens and back where it was when it closes.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    returnFocusRef.current = previous
    if (!consumeKeepFocus()) panel?.focus({ preventScroll: true })
    return () => {
      const target = returnFocusRef.current
      returnFocusRef.current = null
      // By now the panel has left the DOM: if focus was inside it, the
      // browser has dropped it on <body>. Focus that moved elsewhere is kept.
      const active = document.activeElement
      const focusLost =
        !active || active === document.body || (panel?.contains(active) ?? false)
      if (focusLost && target?.isConnected) target.focus({ preventScroll: true })
    }
  }, [open])

  if (!person) return null

  const { activity, pileCount, queueCount, taskTitle, carrying, waiting } = facts
  const platform = facts.platformKey
    ? (config?.platforms.find((p) => p.key === facts.platformKey) ?? null)
    : null
  const platformHex = platform ? swatchHex(config?.palette ?? [], platform.badge.swatch) : null
  const waitingTarget = waiting && directory ? findPerson(directory, waiting.targetId) : null
  const tone = toneClasses[activityTone[activity]]

  const close = () => usePeopleUi.getState().select(null)

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.metaKey || e.ctrlKey || e.altKey) return
    e.preventDefault()
    e.stopPropagation()
    close()
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      data-person-drawer={person.id}
      aria-label={fmt(t.office.drawer.ariaLabel, { name: person.name })}
      onKeyDown={onKeyDown}
      className={cn(
        'pointer-events-auto z-40 flex flex-col overflow-y-auto overscroll-contain border border-border bg-surface text-foreground shadow-[var(--shadow-soft)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-safe:animate-fade-in',
        placement === 'canvas'
          ? 'absolute right-3 top-3 max-h-[calc(100%-1.5rem)] w-72 max-w-[calc(100%-1.5rem)] rounded-xl'
          : 'fixed inset-x-0 bottom-0 max-h-[80dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-20 sm:max-h-none sm:w-80 sm:rounded-xl sm:pb-0',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 data-person-drawer-name className="truncate text-base font-semibold">
            {person.name}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {label(person.roleLabel)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.common.actions.close}
          onClick={close}
          className="-mr-2 -mt-1 shrink-0 text-muted-foreground"
        >
          <X aria-hidden />
        </Button>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 px-4 py-3 text-sm">
        <dt className="text-muted-foreground">{t.office.drawer.role}</dt>
        <dd data-drawer-field="role" className="min-w-0 break-words font-medium">
          {label(person.roleLabel)}
        </dd>

        <dt className="text-muted-foreground">{t.office.drawer.department}</dt>
        <dd data-drawer-field="department" className="min-w-0 break-words font-medium">
          {label(person.groupLabel)}
        </dd>

        <dt className="text-muted-foreground">{t.office.drawer.activity}</dt>
        <dd data-drawer-field="activity" data-activity={activity}>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
              tone.bg,
              tone.text,
            )}
          >
            <span aria-hidden className={cn('size-2 rounded-full', tone.dot)} />
            {t.org.activity[activity]}
          </span>
        </dd>

        <dt className="text-muted-foreground">{t.office.drawer.task}</dt>
        <dd
          data-drawer-field="task"
          className={cn(
            'min-w-0 break-words',
            taskTitle ? 'font-medium' : 'text-muted-foreground',
          )}
        >
          {taskTitle || t.office.drawer.noTask}
        </dd>

        <dt className="text-muted-foreground">{t.office.drawer.platform}</dt>
        <dd
          data-drawer-field="platform"
          data-platform={platform?.key ?? ''}
          className={cn('min-w-0 break-words', platform ? 'font-medium' : 'text-muted-foreground')}
        >
          {platform ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-5 min-w-7 items-center justify-center rounded px-1 text-[10px] font-bold text-white"
                style={{ backgroundColor: platformHex ?? undefined }}
                aria-hidden
              >
                {platform.badge.text}
              </span>
              {label(platform.label)}
            </span>
          ) : (
            t.office.drawer.noPlatform
          )}
        </dd>

        <dt className="text-muted-foreground">{t.office.drawer.carrying}</dt>
        <dd
          data-drawer-field="carrying"
          className={cn(carrying ? 'font-medium' : 'text-muted-foreground')}
        >
          {carrying ? t.office.items[carrying] : t.office.drawer.carryingNothing}
        </dd>

        <dt className="text-muted-foreground">{t.office.drawer.waiting}</dt>
        <dd
          data-drawer-field="waiting"
          data-waiting-position={waiting?.position ?? ''}
          className={cn('min-w-0 break-words', waiting ? 'font-medium' : 'text-muted-foreground')}
        >
          {waiting ? (
            <>
              <span className="block">
                {fmt(t.office.drawer.waitingValue, { n: waiting.position })}
              </span>
              {waitingTarget && (
                <span className="block text-xs font-normal text-muted-foreground">
                  {fmt(t.office.drawer.waitingTarget, { name: waitingTarget.name })}
                </span>
              )}
            </>
          ) : (
            t.office.drawer.notWaiting
          )}
        </dd>

        <dt className="text-muted-foreground">{t.office.drawer.pile}</dt>
        <dd data-drawer-field="pile" className="tabular font-medium">
          {pileCount}
        </dd>

        <dt className="text-muted-foreground">{t.office.drawer.queue}</dt>
        <dd data-drawer-field="queue" className="tabular font-medium">
          {queueCount}
        </dd>
      </dl>

      <div className="mt-auto flex flex-col gap-2 border-t border-border px-4 py-3">
        <Button
          variant={followed ? 'secondary' : 'primary'}
          data-drawer-follow={followed ? 'on' : 'off'}
          onClick={() => usePeopleUi.getState().follow(followed ? null : person.id)}
        >
          <Crosshair aria-hidden />
          {followed ? t.office.drawer.unfollow : t.office.drawer.follow}
        </Button>
        {pileCount > 0 && (
          <Button asChild variant="outline">
            <Link to="/queue" data-drawer-queue-link>
              <ListChecks aria-hidden />
              {t.office.drawer.openQueue}
            </Link>
          </Button>
        )}
      </div>
    </aside>
  )
}
