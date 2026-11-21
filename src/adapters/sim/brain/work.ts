import type { ApprovalLevel, TaskType } from '@/domain/config'
import { intRange, type RandomFn } from '../rng'
import { REVIEW_ODDS } from './odds'

export interface HandoffSpec {
  targetDepartmentKey: string
  childTypeKey: string
  reason: string
}

export const HANDOFF_BY_TASK_TYPE: Record<string, HandoffSpec> = {
  'mkt.post_fb': {
    targetDepartmentKey: 'design',
    childTypeKey: 'design.post_image',
    reason: 'Cần bộ ảnh minh hoạ cho bài đăng Facebook',
  },
  'mkt.post_zalo': {
    targetDepartmentKey: 'design',
    childTypeKey: 'design.post_image',
    reason: 'Cần ảnh banner cho tin nhắn Zalo OA',
  },
  'mkt.caption_tiktok': {
    targetDepartmentKey: 'design',
    childTypeKey: 'design.short_video',
    reason: 'Chuyển kịch bản sang dựng video ngắn TikTok',
  },
  'mkt.campaign_plan': {
    targetDepartmentKey: 'design',
    childTypeKey: 'design.banner_set',
    reason: 'Phối hợp thiết kế bộ banner chủ đạo chiến dịch sale',
  },
  'cs.refund_request': {
    targetDepartmentKey: 'accounting',
    childTypeKey: 'acc.refund_payout',
    reason: 'Chuyển phiếu hoàn tiền sang Kế toán chi trả cho khách',
  },
  'design.packaging_label': {
    targetDepartmentKey: 'marketing',
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
  // Keep full precision: a 7.5 s tick on a 40-minute task adds ~0.003, which
  // rounds to 0 at two decimals and froze every long task at 0% forever.
  const delta = elapsedSimMs / totalDurationSimMs
  const next = currentProgress + delta
  // Snap float drift (e.g. 0.9999999999999968) so a task can always finish.
  return next >= 1 - 1e-9 ? 1 : next
}
