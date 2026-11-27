import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, Check, Clock, Loader2, type LucideIcon } from 'lucide-react'
import type { Command } from '@/domain/commands'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useCommandStatus, useOffice, type OfficeCommandState } from '@/office'
import { Button, type ButtonProps } from './ui/button'

/** What a command button shows. `pending` = sent, waiting for the feed to apply it. */
export type CommandState = 'idle' | 'sending' | 'pending' | 'accepted' | 'applied' | 'failed'

const isAlreadyResolved = (result: string | null | undefined) =>
  Boolean(result?.startsWith('already_resolved') || result === 'already_decided')

function mapOfficeStatus(status: OfficeCommandState): CommandState {
  return status === 'queued' ? 'pending' : status
}

/** Icon + label for a command state (empty for idle). Also usable on its own for inline status. */
export function CommandStatusText({
  state,
  result,
  className,
}: {
  state: CommandState
  result?: string | null
  className?: string
}) {
  const { t } = useI18n()
  const online = useOffice((s) => s.connection) === 'live'

  if (state === 'idle') return null
  const c = t.common.command
  const cfg: Record<
    Exclude<CommandState, 'idle'>,
    { Icon: LucideIcon; label: string; spin?: boolean }
  > = {
    sending: { Icon: Loader2, label: c.sending, spin: true },
    pending: { Icon: Clock, label: online ? c.queued : c.queuedOffline },
    accepted: { Icon: Loader2, label: c.accepted, spin: true },
    applied: { Icon: Check, label: c.applied },
    failed: {
      Icon: AlertCircle,
      label: isAlreadyResolved(result) ? c.alreadyResolved : c.failed,
    },
  }
  const { Icon, label, spin } = cfg[state]
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Icon aria-hidden className={cn('size-4 shrink-0', spin && 'animate-spin')} />
      <span className="truncate">{label}</span>
    </span>
  )
}

export interface CommandButtonProps {
  children: ReactNode
  /** The command to send, or a factory so each click gets a fresh id and `now`. */
  officeCommand: Command | (() => Command)
  onApplied?: (commandId: string) => void
  icon?: LucideIcon
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  disabled?: boolean
  className?: string
  'data-testid'?: string
}

/** Sends one office command through `OfficeFeed.send` and shows its state until applied. */
export function CommandButton({
  children,
  officeCommand,
  onApplied,
  icon: Icon,
  variant,
  size,
  disabled,
  className,
  'data-testid': dataTestId,
}: CommandButtonProps) {
  const { t } = useI18n()
  const [commandId, setCommandId] = useState<string | null>(() =>
    typeof officeCommand === 'function' ? null : officeCommand.id,
  )
  const status = useCommandStatus(commandId)
  const send = useOffice((s) => s.send)
  const state = mapOfficeStatus(status.status)
  const result = status.reason

  const appliedFor = useRef<string | null>(null)
  useEffect(() => {
    if (state === 'applied' && commandId && appliedFor.current !== commandId) {
      appliedFor.current = commandId
      onApplied?.(commandId)
    }
  }, [state, commandId, onApplied])

  const busy = state === 'sending' || state === 'pending' || state === 'accepted'
  const detail =
    state === 'failed' && !isAlreadyResolved(result) ? (result ?? t.common.error.generic) : null

  const handleClick = () => {
    const command = typeof officeCommand === 'function' ? officeCommand() : officeCommand
    setCommandId(command.id)
    void send(command)
  }

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <Button
        variant={variant}
        size={size}
        disabled={disabled || busy || state === 'applied'}
        aria-busy={busy || undefined}
        data-testid={dataTestId}
        data-command-state={state}
        onClick={handleClick}
        className={cn(
          state === 'applied' &&
            'border-done/40 bg-done-soft text-done hover:bg-done-soft disabled:opacity-100',
          state === 'failed' &&
            'border-blocked/40 bg-blocked-soft text-blocked hover:bg-blocked-soft',
          busy && 'disabled:opacity-80',
          className,
        )}
      >
        {state === 'idle' ? (
          <>
            {Icon && <Icon aria-hidden />}
            {children}
          </>
        ) : (
          <CommandStatusText state={state} result={result} />
        )}
      </Button>
      <span
        role="status"
        aria-live="polite"
        className={cn(detail ? 'text-xs text-blocked' : 'sr-only')}
      >
        {detail ??
          (state === 'idle' ? '' : <CommandStatusText state={state} result={result} />)}
      </span>
    </span>
  )
}
