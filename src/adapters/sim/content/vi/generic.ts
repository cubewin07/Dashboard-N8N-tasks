import type { TaskType } from '@/domain/config'

/**
 * The generic work set (P10 §3.4): a department the boss adds has no task types in the config,
 * so the simulator hands it these routine jobs and the new floor is alive at once. The tags
 * (`routine_draft` / `internal_note`) route them to a reviewer like any routine draft.
 * The keys are not in the config: the sim builds the task type itself (`genericTaskType`).
 */
export const GENERIC_TASK_SPECIALTY = 'generic'

export interface GenericTemplate {
  key: string
  label: { vi: string; en: string }
  tags: readonly ('routine_draft' | 'internal_note')[]
  durationMinutes: readonly [number, number]
  titles: readonly string[]
}

export const GENERIC_TASK_TEMPLATES_VI: readonly GenericTemplate[] = [
  {
    key: 'generic.weekly_report',
    label: { vi: 'Soạn báo cáo tuần', en: 'Write the weekly report' },
    tags: ['routine_draft'],
    durationMinutes: [8, 16],
    titles: [
      'Soạn báo cáo tuần của phòng {department}',
      'Tổng hợp báo cáo tuần {n} gửi Sếp cho phòng {department}',
    ],
  },
  {
    key: 'generic.tracking_sheet',
    label: { vi: 'Cập nhật bảng theo dõi', en: 'Update the tracking sheet' },
    tags: ['routine_draft'],
    durationMinutes: [6, 12],
    titles: [
      'Cập nhật bảng theo dõi công việc tháng {month} của phòng {department}',
      'Rà soát và cập nhật {n} dòng trong bảng theo dõi tiến độ',
    ],
  },
  {
    key: 'generic.internal_request',
    label: { vi: 'Trả lời yêu cầu nội bộ', en: 'Answer an internal request' },
    tags: ['internal_note'],
    durationMinutes: [5, 10],
    titles: [
      'Trả lời yêu cầu nội bộ #{n} gửi tới phòng {department}',
      'Phản hồi đề nghị hỗ trợ từ phòng ban khác, mã #{n}',
    ],
  },
  {
    key: 'generic.data_check',
    label: { vi: 'Kiểm tra số liệu', en: 'Check the figures' },
    tags: ['routine_draft'],
    durationMinutes: [8, 15],
    titles: [
      'Kiểm tra số liệu tổng hợp tháng {month} của phòng {department}',
      'Đối chiếu {n} số liệu trong bảng tổng hợp quý {quarter}',
    ],
  },
  {
    key: 'generic.meeting_notes',
    label: { vi: 'Ghi biên bản họp', en: 'Write meeting notes' },
    tags: ['internal_note'],
    durationMinutes: [6, 12],
    titles: [
      'Ghi biên bản cuộc họp nhóm phòng {department}',
      'Soạn tóm tắt và việc cần làm sau cuộc họp tuần {n}',
    ],
  },
  {
    key: 'generic.handover_note',
    label: { vi: 'Soạn ghi chú bàn giao', en: 'Write a handover note' },
    tags: ['internal_note'],
    durationMinutes: [5, 10],
    titles: [
      'Soạn ghi chú bàn giao ca làm việc của phòng {department}',
      'Viết ghi chú bàn giao {n} đầu việc đang dở cho ca sau',
    ],
  },
  {
    key: 'generic.file_archive',
    label: { vi: 'Sắp xếp hồ sơ', en: 'File the documents' },
    tags: ['routine_draft'],
    durationMinutes: [7, 14],
    titles: [
      'Sắp xếp và lưu trữ {n} hồ sơ quý {quarter} của phòng {department}',
      'Đặt tên chuẩn và phân loại {n} tệp tài liệu tháng {month}',
    ],
  },
  {
    key: 'generic.plan_next_week',
    label: { vi: 'Lập kế hoạch tuần tới', en: 'Plan next week' },
    tags: ['routine_draft'],
    durationMinutes: [8, 16],
    titles: [
      'Lập kế hoạch công việc tuần tới cho phòng {department}',
      'Sắp lịch và phân việc {n} đầu mục cho tuần sau',
    ],
  },
]

/** Title templates keyed like `TASK_TITLE_TEMPLATES_VI`, so `renderTaskTitle` finds them. */
export const GENERIC_TASK_TITLE_TEMPLATES_VI: Record<string, readonly string[]> =
  Object.fromEntries(GENERIC_TASK_TEMPLATES_VI.map((t) => [t.key, t.titles]))

export function isGenericTaskKey(typeKey: string): boolean {
  return typeKey.startsWith('generic.')
}

/** The task type the sim builds for a generic template in a department. */
export function genericTaskType(
  template: GenericTemplate,
  departmentKey: string,
): TaskType {
  return {
    key: template.key,
    departmentKey,
    label: template.label,
    specialty: GENERIC_TASK_SPECIALTY,
    tags: [...template.tags],
    defaultPriority: 'normal',
    durationMinutes: [template.durationMinutes[0], template.durationMinutes[1]],
    platformKeys: [],
    needsHelpFrom: [],
    carries: 'document',
  }
}
