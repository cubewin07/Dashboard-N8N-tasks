import type { ApprovalLevel, Employee, Policy, TaskType } from '@/domain/config'
import type { DepartmentId } from '@/domain/primitives'
import { chainFor } from '@/domain/reviews'
import type { Task } from '@/domain/work'
import { intRange, type RandomFn } from '../rng'
import { REVIEW_ODDS } from './odds'

export interface HandoffSpec {
  targetDepartmentId: DepartmentId
  childTypeKey: string
  reason: string
}

export const HANDOFF_BY_TASK_TYPE: Record<string, HandoffSpec> = {
  'mkt.post_fb': {
    targetDepartmentId: 'dep_design',
    childTypeKey: 'design.post_image',
    reason: 'Cần bộ ảnh minh hoạ cho bài đăng Facebook',
  },
  'mkt.post_zalo': {
    targetDepartmentId: 'dep_design',
    childTypeKey: 'design.post_image',
    reason: 'Cần ảnh banner cho tin nhắn Zalo OA',
  },
  'mkt.caption_tiktok': {
    targetDepartmentId: 'dep_design',
    childTypeKey: 'design.short_video',
    reason: 'Chuyển kịch bản sang dựng video ngắn TikTok',
  },
  'mkt.campaign_plan': {
    targetDepartmentId: 'dep_design',
    childTypeKey: 'design.banner_set',
    reason: 'Phối hợp thiết kế bộ banner chủ đạo chiến dịch sale',
  },
  'cs.refund_request': {
    targetDepartmentId: 'dep_accounting',
    childTypeKey: 'acc.refund_payout',
    reason: 'Chuyển phiếu hoàn tiền sang Kế toán chi trả cho khách',
  },
  'design.packaging_label': {
    targetDepartmentId: 'dep_marketing',
    childTypeKey: 'mkt.product_desc',
    reason: 'Phối hợp kiểm tra nội dung thông tin sản phẩm trên tem hộp',
  },
}

export function sampleTaskDurationSimMs(
  taskType: Pick<TaskType, 'durationMinutes'> | undefined,
  rng: RandomFn,
): number {
  const [minM, maxM] = taskType?.durationMinutes ?? [6, 15]
  return intRange(rng, minM, maxM) * 60_000
}

export function sampleReviewDurationSimMs(
  level: ApprovalLevel,
  rng: RandomFn,
): number {
  const [minM, maxM] = REVIEW_ODDS[level].reviewMinutes
  return intRange(rng, minM, maxM) * 60_000
}

export function computeNextProgress(
  currentProgress: number,
  elapsedSimMs: number,
  totalDurationSimMs: number,
): number {
  if (totalDurationSimMs <= 0) return 1
  const delta = elapsedSimMs / totalDurationSimMs
  const next = Math.min(1, currentProgress + delta)
  return Math.round(next * 100) / 100
}

export function effectiveReviewChain(
  task: Pick<Task, 'requiredLevel' | 'tags'>,
  worker: Pick<Employee, 'reviewMode'> | undefined,
  policy: Policy,
): ApprovalLevel[] {
  const fullChain = chainFor(task.requiredLevel, policy)
  if (
    worker?.reviewMode === 'when_important' &&
    task.tags.includes('routine_draft')
  ) {
    if (task.requiredLevel === 'reviewer') {
      return []
    }
    return fullChain.filter((lvl) => lvl !== 'reviewer')
  }
  return fullChain
}
