import { useEffect, useRef, type ReactNode } from 'react'
import { AlertCircle, Check, Clock, Loader2, type LucideIcon } from 'lucide-react'
import type { CommandType, Tables } from '@/lib/database.types'
import type { CommandPayloads } from '@/lib/commands'
import { useCommand, type CommandState } from '@/hooks/useCommand'
import { useTeamOnline } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { Button, type ButtonProps } from './ui/button'

const isAlreadyResolved = (result: string | null | undefined) => Boolean(result?.startsWith('already_resolved'))

/** Icon + label for a command state (empty for idle). Also usable on its own for inline status. */
export function CommandStatusText({ state, result, className }: { state: CommandState; result?: string | null; className?: string }) {
  const { t } = useI18n()
  const { online } = useTeamOnline()
  if (state === 'idle') return null
  const c = t.common.command
  const cfg: Record<Exclude<CommandState, 'idle'>, { Icon: LucideIcon; label: string; spin?: boolean }> = {
    sending: { Icon: Loader2, label: c.sending, spin: true },
    pending: { Icon: Clock, label: online ? c.queued : c.queuedOffline },
    accepted: { Icon: Loader2, label: c.accepted, spin: true },
    applied: { Icon: Check, label: c.applied },
    failed: { Icon: AlertCircle, label: isAlreadyResolved(result) ? c.alreadyResolved : c.failed },
  }
  const { Icon, label, spin } = cfg[state]
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Icon aria-hidden className={cn('size-4 shrink-0', spin && 'animate-spin')} />
      <span className="truncate">{label}</span>
    </span>
  )
}

interface CommandButtonProps<T extends CommandType> {
  type: T
  payload: CommandPayloads[T]
  children: ReactNode
  icon?: LucideIcon
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  disabled?: boolean
  onApplied?: (cmd: Tables<'commands'>) => void
  className?: string
}

export function CommandButton<T extends CommandType>({ type, payload, children, icon: Icon, variant, size, disabled, onApplied, className }: CommandButtonProps<T>) {
  const { t } = useI18n()
  const { send, state, command, error } = useCommand()
  const appliedFor = useRef<string | null>(null)

  useEffect(() => {
    if (state === 'applied' && command && appliedFor.current !== command.id) {
      appliedFor.current = command.id
      onApplied?.(command)
    }
  }, [state, command, onApplied])

  const busy = state === 'sending' || state === 'pending' || state === 'accepted'
  const result = command?.result ?? error
  const detail = state === 'failed' && !isAlreadyResolved(result) ? (result ?? t.common.error.generic) : null

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <Button
        variant={variant}
        size={size}
        disabled={disabled || busy || state === 'applied'}
        aria-busy={busy || undefined}
        onClick={() => void send(type, payload)}
        className={cn(
          state === 'applied' && 'border-done/40 bg-done-soft text-done hover:bg-done-soft disabled:opacity-100',
          state === 'failed' && 'border-blocked/40 bg-blocked-soft text-blocked hover:bg-blocked-soft',
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
      <span role="status" aria-live="polite" className={cn(detail ? 'text-xs text-blocked' : 'sr-only')}>
        {detail ?? (state === 'idle' ? '' : <CommandStatusText state={state} result={result} />)}
      </span>
    </span>
  )
}
