import { SendHorizontal } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '@/app/auth'
import { CommandStatusText } from '@/components/CommandButton'
import { Button } from '@/components/ui/button'
import { newId } from '@/domain/ids'
import { wallUlid } from '@/lib/ulid'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useCommandStatus, useOffice } from '@/office'

export function IntakeBox({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const { session } = useAuth()
  const send = useOffice((s) => s.send)
  const [text, setText] = useState('')
  const [lastCmdId, setLastCmdId] = useState<string | null>(null)
  const cmdStatus = useCommandStatus(lastCmdId)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return

    const cmdId = newId('cmd', wallUlid)
    setLastCmdId(cmdId)
    setText('')
    void send({
      v: 1,
      id: cmdId,
      type: 'intake.submit',
      issuedBy: {
        userId: session?.email ?? 'usr_boss',
        role: 'boss',
      },
      issuedAt: new Date().toISOString(),
      payload: {
        text: trimmed,
        modality: 'text',
      },
    })
  }

  const mappedState =
    cmdStatus.status === 'queued' ? 'pending' : cmdStatus.status

  return (
    <form
      data-intake-box
      onSubmit={handleSubmit}
      className={cn(
        'flex items-center gap-2',
        compact
          ? 'w-full max-w-md'
          : 'rounded-[14px] border border-border bg-surface p-3',
        className,
      )}
    >
      <label htmlFor={compact ? 'intake-input-header' : 'intake-input-page'} className="sr-only">
        {t.queue.intake.label}
      </label>
      <input
        id={compact ? 'intake-input-header' : 'intake-input-page'}
        data-intake-input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.queue.intake.placeholder}
        className={cn(
          'min-w-0 flex-1 rounded-lg border border-border bg-surface-muted/40 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none',
          compact ? 'h-9 text-xs sm:text-sm' : 'h-10',
        )}
      />
      <Button
        type="submit"
        size="sm"
        data-intake-submit
        disabled={text.trim().length === 0}
        className="shrink-0"
      >
        <SendHorizontal className="size-4" aria-hidden />
        <span className={cn(compact && 'sr-only xl:not-sr-only')}>
          {t.queue.intake.submit}
        </span>
      </Button>
      {lastCmdId && mappedState !== 'idle' && (
        <span data-intake-status className=" hidden text-xs text-muted-foreground sm:inline-flex">
          <CommandStatusText state={mappedState} result={cmdStatus.reason} />
        </span>
      )}
    </form>
  )
}
