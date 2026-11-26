// P10-T02 · One message per `ConfigIssueCode` (src/domain/validateConfig.ts); {params} filled with fmt().
import type { ConfigIssueCode } from '@/domain/validateConfig'

export const adminIssues = {
  codes: {
    schema: 'Dữ liệu chưa đúng dạng ({message}).',
    duplicate:
      'Mã “{value}” bị dùng hai lần ({owner}). Mỗi mã chỉ được dùng một lần trong cùng danh sách.',
    badKey:
      'Mã “{value}” ({owner}) không hợp lệ: chỉ dùng chữ thường không dấu, số và dấu gạch dưới, và phải bắt đầu bằng chữ cái.',
    badId: 'Mã định danh “{value}” ({owner}) không hợp lệ: phải bắt đầu bằng “{prefix}_”.',
    refDepartment: '{owner} đang dùng phòng ban “{value}” không tồn tại.',
    refRole: '{owner} đang dùng vai trò “{value}” không tồn tại.',
    refSpecialty: '{owner} đang dùng chuyên môn “{value}” không tồn tại.',
    refPlatform: '{owner} đang dùng nền tảng “{value}” không tồn tại.',
    refTaskType: '{owner} đang dùng loại việc “{value}” không tồn tại.',
    deptRequired: '{owner} giữ vai {role} nên phải thuộc một phòng ban.',
    deptForbidden: '{owner} giữ vai {role} (cấp toàn tòa nhà) nên không được thuộc phòng ban nào.',
    managerMissing:
      'Cần đúng một người đang làm việc ở vai điều hành toàn tòa nhà (quản lý), hiện chưa có ai.',
    managerMultiple:
      'Chỉ được có một người điều hành toàn tòa nhà đang làm việc, hiện có {count}: {names}.',
    humanOwnerMissing:
      'Cần ít nhất một chủ sở hữu (người thật) đang làm việc để duyệt các việc quan trọng.',
    roleOverLimit: 'Phòng {department} đang có {count} người giữ vai {role} (tối đa {max}).',
    deptNoManager: 'Phòng {department} chưa có Trưởng phòng: việc cần duyệt sẽ dồn lên cấp trên.',
    deptNoLead:
      'Phòng {department} chưa có người chia việc duyệt (Trưởng nhóm): việc cần duyệt sẽ dồn lên cấp trên.',
    deptNoReviewer:
      'Phòng {department} chưa có người kiểm duyệt: việc cần duyệt sẽ dồn lên cấp trên.',
    refInactiveDepartment: '{owner} đang nhắc tới phòng {name}, nhưng phòng này đã tắt.',
    refInactivePlatform: '{owner} đang nhắc tới nền tảng {name}, nhưng nền tảng này đã tắt.',
    employeeInInactiveDepartment:
      '{employee} đang làm việc ở phòng {department} nhưng phòng này đã tắt.',
    approverMissingReviewer:
      'Chính sách hoặc quy tắc đang yêu cầu duyệt ở cấp Kiểm duyệt, nhưng chưa có vai trò nào duyệt được cấp này.',
    approverMissingDeptManager:
      'Chính sách hoặc quy tắc đang yêu cầu duyệt ở cấp Trưởng phòng, nhưng chưa có vai trò nào duyệt được cấp này.',
    approverMissingBoss:
      'Chính sách hoặc quy tắc đang yêu cầu Sếp duyệt, nhưng chưa có chủ sở hữu nào đang làm việc.',
    policyTempCap: 'Số nhân viên tạm tối đa phải từ {min} đến {max} (đang là {value}).',
    policyHelpRounds: 'Số vòng nhờ hỗ trợ tối đa phải từ {min} đến {max} (đang là {value}).',
    policyHelpTimeout: 'Thời gian chờ hỗ trợ phải từ {min} đến {max} phút (đang là {value}).',
    policyWeights:
      'Điểm ưu tiên phải giảm dần: Khẩn > Cao > Thường > Thấp (đang là {urgent} / {high} / {normal} / {low}).',
    policyAgingCap:
      'Điểm cộng thêm khi chờ lâu phải nhỏ hơn {limit} (chênh lệch giữa Cao và Thấp) để việc Thấp không vượt việc Cao (đang là {value}).',
    policyQuestionSeat: 'Ngưỡng xếp chỗ chờ cho câu hỏi phải từ {min} đến {max} (đang là {value}).',
    bossInStack:
      'Tầng của Sếp luôn được thêm tự động ở trên cùng, không được đưa vào danh sách tầng của tòa nhà.',
  } satisfies Record<ConfigIssueCode, string> as Record<ConfigIssueCode, string>,
}
