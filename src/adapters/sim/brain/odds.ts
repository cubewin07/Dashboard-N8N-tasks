import type { ApprovalLevel } from '@/domain/config'
import type { ReviewDecision } from '@/domain/work'
import type { RandomFn } from '../rng'

export interface ReviewOddsEntry {
  approve: number
  changes: number
  reject: number
  reviewMinutes: readonly [number, number]
}

export const REVIEW_ODDS: Record<ApprovalLevel, ReviewOddsEntry> = {
  reviewer: {
    approve: 0.82,
    changes: 0.16,
    reject: 0.02,
    reviewMinutes: [2, 6],
  },
  dept_manager: {
    approve: 0.75,
    changes: 0.2,
    reject: 0.05,
    reviewMinutes: [4, 10],
  },
  boss: {
    approve: 0.85,
    changes: 0.12,
    reject: 0.03,
    reviewMinutes: [1, 2],
  },
}

export const SIM_ODDS = {
  review: REVIEW_ODDS,
  secondAttemptApproveBonus: 0.12,
  workFailureChance: 0.04,
  /** Share of tasks that fail every attempt (e.g. platform sync keeps erroring). */
  workDoomedChance: 0.02,
  questionChance: 0.12,
  questionAnswerMinutes: [2, 5] as const,
  helpRequestChance: 0.35,
  helpAcceptChance: 0.85,
  helpDurationMinutes: [5, 12] as const,
  handoffChance: 0.35,
  autoApproveBossDelaySimMs: 2 * 60_000,
  queueOverloadThreshold: 6,
  queueOverloadWindowSimMs: 20 * 60_000,
  hourlyTaskRates: {
    csDay: [10, 14] as const,
    csNight: [3, 5] as const,
    marketing: [3, 4] as const,
    design: [2, 3] as const,
    accounting: [2, 2] as const,
    accountingMonthEndMultiplier: 3,
    bossIntake: [1, 2] as const,
  },
} as const

export function sampleReviewDecision(
  rng: RandomFn,
  level: ApprovalLevel,
  attempts: number,
): ReviewDecision {
  const base = REVIEW_ODDS[level]
  const bonus = attempts >= 2 ? SIM_ODDS.secondAttemptApproveBonus : 0
  const approveThreshold = Math.min(0.97, base.approve + bonus)
  const remaining = Math.max(0, 1 - approveThreshold)
  const baseNonApprove = base.changes + base.reject
  const changesRatio =
    baseNonApprove > 0 ? base.changes / baseNonApprove : 0.85
  const changesThreshold = approveThreshold + remaining * changesRatio

  const r = rng()
  if (r < approveThreshold) return 'approved'
  if (r < changesThreshold) return 'changes_requested'
  return 'rejected'
}
