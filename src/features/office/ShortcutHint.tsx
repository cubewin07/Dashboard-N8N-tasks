import { useI18n } from '@/i18n'
import { useViewStore } from '@/scene/camera/viewStore'

export function ShortcutHint() {
  const { t } = useI18n()
  const mode = useViewStore((s) => s.mode)

  return (
    <div
      aria-label={t.office.shortcutsAriaLabel}
      data-shortcut-hint
      className="pointer-events-auto hidden items-center gap-2 rounded-[10px] border border-border bg-surface/85 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur-md md:inline-flex"
    >
      <span>{t.office.shortcutOverview}</span>
      <span aria-hidden="true">·</span>
      <span>{t.office.shortcutFree}</span>
      <span aria-hidden="true">·</span>
      <span>{t.office.shortcutFloor}</span>
      <span aria-hidden="true">·</span>
      <span>{t.office.shortcutStep}</span>
      <span aria-hidden="true">·</span>
      <span>{t.office.shortcutEsc}</span>
      {mode === 'free' ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="font-medium text-foreground">{t.office.shortcutWasd}</span>
        </>
      ) : null}
    </div>
  )
}
