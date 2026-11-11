export const queue = {
  title: 'Hàng chờ duyệt',
  description:
    'Phê duyệt các công việc cần quyết định của Giám đốc và theo dõi tải duyệt toàn công ty',
  tabs: {
    boss: 'Chờ sếp duyệt',
    departments: 'Hàng chờ các phòng',
  },
  emptyBoss: 'Chưa có công việc hay câu hỏi nào đang chờ sếp duyệt.',
  emptyDepartmentPile: 'Không có giấy tờ chờ duyệt',
  whyBossToggle: 'Vì sao cần sếp duyệt?',
  whyBossDefault: 'Áp dụng mức duyệt mặc định từ chính sách công ty',
  requesterLabel: 'Người gửi: {name}',
  assigneeLabel: 'Người duyệt: {name}',
  priority: {
    urgent: 'Khẩn cấp',
    high: 'Cao',
    normal: 'Bình thường',
    low: 'Thấp',
  },
  kindBadge: {
    review: 'Cần duyệt',
    question: 'Câu hỏi',
  },
  actions: {
    approve: 'Duyệt',
    requestChanges: 'Yêu cầu sửa',
    reject: 'Từ chối',
    answerQuestion: 'Gửi trả lời',
  },
  notePlaceholder: 'Ghi chú chỉnh sửa cho nhân viên (bắt buộc khi yêu cầu sửa)…',
  noteRequiredHint: 'Vui lòng nhập ghi chú trước khi yêu cầu sửa.',
  answerPlaceholder: 'Nhập câu trả lời của Sếp…',
  quickAssignPrefix: 'Giao cho {dept}',
  pileCount: '{n} giấy chờ duyệt',
  topItemsTitle: 'Tối đa 5 mục ưu tiên cao nhất',
  intake: {
    label: 'Nhắn cho quản lý',
    placeholder: 'Nhắn cho quản lý… (VD: Làm banner sale 12.12 cho Shopee 1)',
    submit: 'Gửi yêu cầu',
    sentHint: 'Đã gửi yêu cầu cho quản lý Thu',
  },
}
