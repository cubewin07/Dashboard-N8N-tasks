import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, Check, Clock, Loader2, type LucideIcon } from 'lucide-react'
import type { Command as OfficeCommand } from '@/domain/commands'
import type { CommandType, Tables } from '@/lib/database.types'
import type { CommandPayloads } from '@/lib/commands'
import { useCommand, type CommandState } from '@/hooks/useCommand'
import { useTeamOnline } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import {
  useCommandStatus,
  useIsLegacyRoute,
  useOffice,
  type OfficeCommandState,
} from '@/office'
import { Button, type ButtonProps } from './ui/button'

const isAlreadyResolved = (result: string | null | undefined) =>
  Boolean(result?.startsWith('already_resolved') || result === 'already_decided')

function mapOfficeStatus(status: OfficeCommandState): CommandState {
  if (status === 'queued') return 'pending'
  return status
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
  const isLegacy = useIsLegacyRoute()
  const legacyTeam = useTeamOnline()
  const officeConn = useOffice((s) => s.connection)
  const online = isLegacy ? legacyTeam.online : officeConn === 'live'

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
      <Icon
        aria-hidden
        className={cn('size-4 shrink-0', spin && 'animate-spin')}
      />
      <span className="truncate">{label}</span>
    </span>
  )
}

interface BaseCommandButtonProps {
  children: ReactNode
  icon?: LucideIcon
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  disabled?: boolean
  className?: string
  'data-testid'?: string
}

interface LegacyCommandButtonProps<T extends CommandType>
  extends BaseCommandButtonProps {
  type: T
  payload: CommandPayloads[T]
  officeCommand?: never
  onApplied?: (cmd: Tables<'commands'>) => void
}

interface OfficeCommandButtonProps extends BaseCommandButtonProps {
  officeCommand: OfficeCommand | (() => OfficeCommand)
  type?: never
  payload?: never
  onApplied?: (commandId: string) => void
}

export type CommandButtonProps<T extends CommandType = CommandType> =
  | LegacyCommandButtonProps<T>
  | OfficeCommandButtonProps

export function CommandButton<T extends CommandType = CommandType>(
  props: CommandButtonProps<T>,
) {
  const {
    children,
    icon: Icon,
    variant,
    size,
    disabled,
    className,
    'data-testid': dataTestId,
  } = props
  const { t } = useI18n()

  // Legacy command state
  const legacyCmd = useCommand()

  // Office command state
  const [officeCmdId, setOfficeCmdId] = useState<string | null>(() => {
    if (
      'officeCommand' in props &&
      props.officeCommand &&
      typeof props.officeCommand !== 'function'
    ) {
      return props.officeCommand.id
    }
    return null
  })
  const officeStatus = useCommandStatus(officeCmdId)
  const sendOffice = useOffice((s) => s.send)

  const isOfficeMode = 'officeCommand' in props && Boolean(props.officeCommand)

  const state: CommandState = isOfficeMode
    ? mapOfficeStatus(officeStatus.status)
    : legacyCmd.state

  const result: string | null = isOfficeMode
    ? officeStatus.reason
    : (legacyCmd.command?.result ?? legacyCmd.error)

  const appliedFor = useRef<string | null>(null)

  useEffect(() => {
    if ('officeCommand' in props && props.officeCommand) {
      if (
        state === 'applied' &&
        officeCmdId &&
        appliedFor.current !== officeCmdId
      ) {
        appliedFor.current = officeCmdId
        props.onApplied?.(officeCmdId)
      }
      return
    }
    if (!('officeCommand' in props && props.officeCommand)) {
      if (
        state === 'applied' &&
        legacyCmd.command &&
        appliedFor.current !== legacyCmd.command.id
      ) {
        appliedFor.current = legacyCmd.command.id
        props.onApplied?.(legacyCmd.command)
      }
    }
  }, [state, officeCmdId, legacyCmd.command, props])

  const busy = state === 'sending' || state === 'pending' || state === 'accepted'
  const detail =
    state === 'failed' && !isAlreadyResolved(result)
      ? (result ?? t.common.error.generic)
      : null

  const handleClick = () => {
    if ('officeCommand' in props && props.officeCommand) {
      const resolved =
        typeof props.officeCommand === 'function'
          ? props.officeCommand()
          : props.officeCommand
      setOfficeCmdId(resolved.id)
      void sendOffice(resolved)
      return
    }
    if ('type' in props && props.type) {
      void legacyCmd.send(props.type, props.payload)
    }
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
          (state === 'idle' ? (
            ''
          ) : (
            <CommandStatusText state={state} result={result} />
          ))}
      </span>
    </span>
  )
}
