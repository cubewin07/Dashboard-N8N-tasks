// Shapes of `approvals.payload` that n8n writes. Proposed for CONTRACT.md v0.3.
import type { EmployeeKey, Json } from '@/lib/database.types'

export interface ReviewReplyItem {
  review_id: string
  stars: number
  customer: string
  product: string
  text: string
  draft: string
}

export type ApprovalPayload =
  | { type: 'review_replies'; prepared_by: EmployeeKey; checked_by?: EmployeeKey; items: ReviewReplyItem[] }
  | { type: 'images'; prepared_by: EmployeeKey; checked_by?: EmployeeKey; artifact_ids: number[] }
  | { type: 'post'; prepared_by: EmployeeKey; checked_by?: EmployeeKey; channel: 'zalo' | 'facebook'; text: string; artifact_id?: number }
  | { type: 'question'; asked_by: EmployeeKey; question: string; options?: string[] }
  | { type: 'generic'; prepared_by: EmployeeKey; checked_by?: EmployeeKey; summary: string }

export function parsePayload(payload: Json): ApprovalPayload {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && typeof payload.type === 'string') {
    return payload as unknown as ApprovalPayload
  }
  return { type: 'generic', prepared_by: 'thu', summary: '' }
}
