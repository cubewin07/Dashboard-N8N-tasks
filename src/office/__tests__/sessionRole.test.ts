import { afterEach, expect, it } from 'vitest'
import type { Command } from '@/domain/commands'
import { setCommandsAllowed } from '../sessionRole'
import { sendCommand } from '../store'

afterEach(() => setCommandsAllowed(true))

it('rejects commands with forbidden when the role may not command', async () => {
  setCommandsAllowed(false)
  const ack = await sendCommand({ id: 'c1' } as unknown as Command)
  expect(ack).toEqual({ commandId: 'c1', status: 'rejected', reason: 'forbidden' })
})
