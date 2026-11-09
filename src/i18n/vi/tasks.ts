// Text for the tasks feature. Owned by whoever builds src/features/tasks. Keep en/tasks.ts in sync (enforced by type).
export const tasks = {
  title: 'Công việc',
  description: 'Theo dõi toàn bộ quy trình đang chạy, chờ duyệt và đã hoàn thành trên 5 gian hàng.',
  newTaskButton: '+ Giao việc',
  tabs: {
    active: 'Đang làm',
    waiting: 'Chờ bạn',
    blocked: 'Bị kẹt',
    done: 'Xong',
    all: 'Tất cả',
  },
  filters: {
    shopLabel: 'Gian hàng',
    allShops: 'Tất cả gian hàng',
    workflowLabel: 'Đầu việc',
    allWorkflows: 'Tất cả đầu việc',
    employeeLabel: 'Nhân viên',
    allEmployees: 'Tất cả nhân viên',
    reset: 'Xoá bộ lọc',
  },
  columns: {
    id: '#',
    workflow: 'Đầu việc',
    shop: 'Gian hàng',
    owner: 'Phụ trách',
    steps: 'Tiến độ',
    status: 'Trạng thái',
    updated: 'Cập nhật',
  },
  rowAria: 'Mở công việc #{id} — {workflow} ({shop})',
  empty: {
    active: {
      title: 'Không có công việc nào đang chạy',
      description: 'Đội ngũ đang rảnh. Bạn có thể giao việc mới bất cứ lúc nào.',
    },
    waiting: {
      title: 'Không có việc nào đang chờ bạn',
      description: 'Mọi yêu cầu duyệt và câu hỏi đều đã được bạn xử lý xong.',
    },
    blocked: {
      title: 'Không có việc nào bị kẹt',
      description: 'Tất cả quy trình đều đang vận hành trơn tru.',
    },
    done: {
      title: 'Chưa có công việc nào hoàn thành',
      description: 'Các công việc đã xong hoặc đã huỷ sẽ xuất hiện tại đây.',
    },
    all: {
      title: 'Không tìm thấy công việc phù hợp',
      description: 'Thử đổi bộ lọc gian hàng, đầu việc hoặc nhân viên để xem thêm.',
    },
  },
}
