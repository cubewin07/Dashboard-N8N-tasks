// Hand-written to match docs/CONTRACT.md v0.2 until Supabase is linked.
// Replace with: supabase gen types typescript --linked > src/lib/database.types.ts
// Keep the `Tables<'name'>` helper shape identical so feature code doesn't change.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Platform = 'shopee' | 'lazada' | 'tiktok_shop'
export type EmpStatus = 'idle' | 'working' | 'waiting_boss' | 'blocked'
export type TaskStatus = 'queued' | 'running' | 'waiting_boss' | 'blocked' | 'done' | 'failed' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'stuck' | 'skipped'
export type StepKind = 'work' | 'qc' | 'approval'
export type AutonomyMode = 'ask_first' | 'works_alone'
export type TaskSource = 'telegram' | 'dashboard' | 'schedule'
export type ApprovalKind = 'approval' | 'question'
export type ApprovalStatus = 'open' | 'approved' | 'changes_requested' | 'rejected' | 'answered' | 'expired'
export type ResolvedVia = 'dashboard' | 'telegram'
export type ArtifactType = 'image' | 'video' | 'text'
export type CommandStatus = 'pending' | 'accepted' | 'applied' | 'failed'
export type CommandType =
  | 'start_task'
  | 'approve'
  | 'request_changes'
  | 'reject'
  | 'answer'
  | 'reassign'
  | 'set_autonomy'
  | 'retry_step'
  | 'cancel_task'

/** 'boss' is not a DB employee; it marks approval steps owned by "You". */
export type EmployeeKey = 'thu' | 'mai' | 'linh' | 'ha' | 'vy' | 'an' | 'bao'
export type OwnerKey = EmployeeKey | 'boss'

export interface Database {
  public: {
    Tables: {
      shops: {
        Row: { id: number; name: string; platform: Platform; handle: string | null; reply_rules: string | null; active: boolean }
      }
      employees: {
        Row: {
          key: EmployeeKey
          name: string
          role_key: string
          color: string
          scope: string[]
          status: EmpStatus
          current_task_id: number | null
          current_step_key: string | null
          autonomy: AutonomyMode
          status_since: string
        }
      }
      workflows: {
        Row: { key: string; name: string; icon: string; description: string | null; enabled: boolean; n8n_workflow_ref: string | null }
      }
      workflow_steps: {
        Row: {
          workflow_key: string
          position: number
          key: string
          label: string
          owner_key: OwnerKey
          kind: StepKind
          risky: boolean
          timeout_minutes: number
          allowed_owner_keys: OwnerKey[]
        }
      }
      tasks: {
        Row: {
          id: number
          workflow_key: string
          shop_id: number
          brief: string | null
          require_approval: boolean
          status: TaskStatus
          source: TaskSource
          current_step_key: string | null
          blocked_reason: string | null
          created_at: string
          updated_at: string
          finished_at: string | null
        }
      }
      task_steps: {
        Row: {
          id: number
          task_id: number
          step_key: string
          position: number
          owner_key: OwnerKey
          status: StepStatus
          summary: string | null
          output: Json | null
          started_at: string | null
          finished_at: string | null
          error: string | null
          attempt: number
        }
      }
      approvals: {
        Row: {
          id: number
          task_id: number
          step_key: string
          kind: ApprovalKind
          title: string
          payload: Json
          status: ApprovalStatus
          resolved_via: ResolvedVia | null
          resolved_at: string | null
          note: string | null
          created_at: string
        }
      }
      artifacts: {
        Row: {
          id: number
          task_id: number
          shop_id: number
          workflow_key: string
          owner_key: EmployeeKey
          type: ArtifactType
          title: string
          drive_file_id: string
          drive_url: string
          drive_folder_id: string | null
          mime: string
          size_bytes: number
          width: number | null
          height: number | null
          duration_sec: number | null
          provider: string | null
          created_at: string
        }
      }
      events: {
        Row: { id: number; at: string; task_id: number | null; actor: string; type: string; message: string; data: Json | null }
      }
      commands: {
        Row: {
          id: string
          created_at: string
          created_by: string | null
          type: CommandType
          payload: Json
          status: CommandStatus
          result: string | null
          processed_at: string | null
        }
      }
      system_status: {
        Row: { id: number; n8n_heartbeat_at: string | null; n8n_version: string | null; note: string | null }
      }
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
