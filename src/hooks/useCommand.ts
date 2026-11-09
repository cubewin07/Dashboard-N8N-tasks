import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CommandType, Tables } from '@/lib/database.types'
import { sendCommand, type CommandPayloads } from '@/lib/commands'
import { api } from '@/lib/api'

export type CommandState = 'idle' | 'sending' | 'pending' | 'accepted' | 'applied' | 'failed'

/**
 * Send one command and follow its row live. RealtimeProvider invalidates ['commands'] on every
 * change, so ['commands', id] refetches and `state` moves pending → accepted → applied / failed.
 */
export function useCommand() {
  const [sent, setSent] = useState<Tables<'commands'> | null>(null)
  const [phase, setPhase] = useState<'idle' | 'sending' | 'error'>('idle')
  const [sendError, setSendError] = useState<string | null>(null)

  const id = sent?.id ?? null
  const { data } = useQuery({
    queryKey: ['commands', id],
    queryFn: () => api.command(id as string),
    enabled: id !== null,
  })
  const command = data ?? sent

  const send = useCallback(async <T extends CommandType>(type: T, payload: CommandPayloads[T]): Promise<void> => {
    setPhase('sending')
    setSendError(null)
    setSent(null)
    try {
      const row = await sendCommand(type, payload)
      setSent(row)
      setPhase('idle')
    } catch (e) {
      setSendError(e instanceof Error ? e.message : null)
      setPhase('error')
    }
  }, [])

  const reset = useCallback(() => {
    setSent(null)
    setPhase('idle')
    setSendError(null)
  }, [])

  const state: CommandState = phase === 'sending' ? 'sending' : phase === 'error' ? 'failed' : (command?.status ?? 'idle')

  return { send, state, command, error: sendError, reset }
}
