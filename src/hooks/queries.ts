// Shared read hooks. Query keys start with the table name so RealtimeProvider can
// invalidate by prefix (['tasks'] also refreshes ['tasks', 142]).
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/lib/api'
import { HEARTBEAT_STALE_MS } from '@/lib/status'
import { useNow } from '@/hooks/useNow'

export const useShops = () => useQuery({ queryKey: ['shops'], queryFn: api.shops, staleTime: Infinity })
export const useEmployees = () => useQuery({ queryKey: ['employees'], queryFn: api.employees })
export const useWorkflows = () => useQuery({ queryKey: ['workflows'], queryFn: api.workflows, staleTime: Infinity })
export const useWorkflowSteps = () => useQuery({ queryKey: ['workflow_steps'], queryFn: api.workflowSteps, staleTime: Infinity })
export const useTasks = () => useQuery({ queryKey: ['tasks'], queryFn: api.tasks })
export const useTask = (id: number) => useQuery({ queryKey: ['tasks', id], queryFn: () => api.task(id) })
export const useTaskSteps = (taskId: number) => useQuery({ queryKey: ['task_steps', taskId], queryFn: () => api.taskSteps(taskId) })
/** Every task_step row; use for step dots in lists. */
export const useAllTaskSteps = () => useQuery({ queryKey: ['task_steps', 'all'], queryFn: api.allTaskSteps })
export const useApprovals = () => useQuery({ queryKey: ['approvals'], queryFn: api.approvals })
export const useArtifacts = () => useQuery({ queryKey: ['artifacts'], queryFn: api.artifacts })
export const useEvents = (limit = 100) => useQuery({ queryKey: ['events', limit], queryFn: () => api.events(limit) })
export const useTaskEvents = (taskId: number) => useQuery({ queryKey: ['events', 'task', taskId], queryFn: () => api.taskEvents(taskId) })
export const useSystemStatus = () => useQuery({ queryKey: ['system_status'], queryFn: api.systemStatus })

/** Lookup maps so components can resolve ids → rows cheaply. */
export function useLookups() {
  const shops = useShops().data
  const employees = useEmployees().data
  const workflows = useWorkflows().data
  const steps = useWorkflowSteps().data
  return useMemo(
    () => ({
      shop: new Map((shops ?? []).map((s) => [s.id, s])),
      employee: new Map((employees ?? []).map((e) => [e.key, e])),
      workflow: new Map((workflows ?? []).map((w) => [w.key, w])),
      stepsByWorkflow: (steps ?? []).reduce<Map<string, NonNullable<typeof steps>>>((m, s) => {
        m.set(s.workflow_key, [...(m.get(s.workflow_key) ?? []), s].sort((a, b) => a.position - b.position))
        return m
      }, new Map()),
      ready: Boolean(shops && employees && workflows && steps),
    }),
    [shops, employees, workflows, steps],
  )
}

/** Open inbox items: open approvals/questions + blocked tasks. Drives the sidebar badge. */
export function useInboxCount() {
  const approvals = useApprovals().data ?? []
  const tasks = useTasks().data ?? []
  const open = approvals.filter((a) => a.status === 'open')
  const blocked = tasks.filter((t) => t.status === 'blocked')
  return { total: open.length + blocked.length, approvals: open.filter((a) => a.kind === 'approval').length, questions: open.filter((a) => a.kind === 'question').length, blocked: blocked.length }
}

export function useTeamOnline() {
  const status = useSystemStatus().data
  const now = useNow(15_000)
  const hb = status?.n8n_heartbeat_at ? Date.parse(status.n8n_heartbeat_at) : 0
  return { online: now.getTime() - hb < HEARTBEAT_STALE_MS, heartbeatAt: status?.n8n_heartbeat_at ?? null, version: status?.n8n_version ?? null }
}
