// Read functions used by the query hooks. MVP: in-memory store. Later: supabase-js selects.
import { read } from '@/lib/mock/store'

const delay = <T,>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms))

export const api = {
  shops: () => delay(read.shops()),
  employees: () => delay(read.employees()),
  workflows: () => delay(read.workflows()),
  workflowSteps: () => delay(read.workflowSteps()),
  tasks: () => delay(read.tasks()),
  task: (id: number) => delay(read.task(id)),
  taskSteps: (taskId: number) => delay(read.taskSteps(taskId)),
  allTaskSteps: () => delay(read.allTaskSteps()),
  approvals: () => delay(read.approvals()),
  artifacts: () => delay(read.artifacts()),
  events: (limit?: number) => delay(read.events(limit)),
  taskEvents: (taskId: number) => delay(read.taskEvents(taskId)),
  command: (id: string) => delay(read.command(id), 0),
  systemStatus: () => delay(read.systemStatus()),
}
