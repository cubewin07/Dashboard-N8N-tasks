// Typed command senders: the ONLY write the dashboard makes (INSERT INTO commands).
// MVP: goes to the in-memory store. Later: supabase.from('commands').insert(...).
import type { AutonomyMode, CommandType, Json, OwnerKey, Tables } from '@/lib/database.types'
import { insertCommand } from '@/lib/mock/store'

export interface CommandPayloads {
  start_task: { workflow_key: string; shop_id: number; brief?: string; require_approval: boolean }
  approve: { approval_id: number; edits?: Record<string, string> }
  request_changes: { approval_id: number; note: string }
  reject: { approval_id: number; note?: string }
  answer: { approval_id: number; answer: string }
  reassign: { task_id: number; step_key: string; to_owner_key: OwnerKey }
  set_autonomy: { employee_key: string; autonomy: AutonomyMode }
  retry_step: { task_id: number; step_key?: string }
  cancel_task: { task_id: number; step_key?: string }
}

export async function sendCommand<T extends CommandType>(type: T, payload: CommandPayloads[T]): Promise<Tables<'commands'>> {
  await new Promise((r) => setTimeout(r, 150)) // network-ish delay so "sending" is visible
  return insertCommand(type, payload as unknown as Json)
}
