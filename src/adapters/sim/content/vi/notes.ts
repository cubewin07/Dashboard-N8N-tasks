export const REVIEW_NOTES_APPROVE_VI: readonly string[] = [
  'Số liệu khớp chính xác, trình bày rõ ràng, duyệt triển khai ngay.',
  'Nội dung chuẩn chỉnh, đúng định hướng thương hiệu và quy chuẩn sàn.',
  'Đã kiểm tra đối chiếu chứng từ hợp lệ, đồng ý phê duyệt.',
  'Phương án xử lý khéo léo, đảm bảo quyền lợi khách hàng và uy tín gian hàng.',
  'Thiết kế bắt mắt, thông điệp khuyến mãi nổi bật, duyệt đăng.',
  'Bảng tính chiết khấu và biên lợi nhuận an toàn, cho phép áp dụng.',
  'Quy trình đóng gói và bàn giao đúng tiêu chuẩn, xác nhận hoàn tất.',
  'Hồ sơ đầy đủ chữ ký xác nhận của các bên liên quan, đồng ý duyệt.',
] as const

export const REVIEW_NOTES_CHANGES_VI: readonly string[] = [
  'Cần bổ sung mã đơn hàng và ảnh chụp thực tế sản phẩm lỗi trước khi hoàn tiền.',
  'Kiểm tra lại tỷ lệ chiết khấu, mức giảm hiện tại làm biên lợi nhuận thấp hơn ngưỡng cho phép.',
  'Câu chữ trả lời khách còn hơi cứng nhắc, hãy viết lại lịch sự và thiện chí hơn.',
  'Số liệu tồn kho trên bảng tổng hợp chưa khớp với phiếu kiểm kho thực tế sáng nay.',
  'Banner thiếu logo chính hãng và điều kiện áp dụng mã giảm giá ở góc dưới.',
  'Bổ sung thêm chứng từ xác nhận của đơn vị vận chuyển cho lô hàng thất lạc.',
  'Cần tách riêng chi phí quảng cáo theo từng sàn để dễ theo dõi hiệu quả ROAS.',
  'Thời gian giao hàng cam kết trong kịch bản chưa tính thêm ngày nghỉ lễ sắp tới.',
] as const

export const REVIEW_NOTES_REJECT_VI: readonly string[] = [
  'Yêu cầu hoàn tiền không hợp lệ do đã quá thời hạn bảo hành quy định 30 ngày.',
  'Chi phí đề xuất vượt quá ngân sách quý đã được Ban Giám đốc phê duyệt.',
  'Sản phẩm đang tạm hết hàng tại cả 2 kho, không thể chạy chương trình Flash Sale lúc này.',
  'Nội dung quảng cáo chứa từ ngữ cam kết quá mức dễ vi phạm chính sách sàn.',
  'Hoá đơn đầu vào bị sai mã số thuế công ty, yêu cầu nhà cung cấp xuất lại.',
  'Trùng lặp với chương trình khuyến mãi đang chạy trên cùng danh mục sản phẩm.',
] as const

export const ALL_REVIEW_NOTES_VI: readonly string[] = [
  ...REVIEW_NOTES_APPROVE_VI,
  ...REVIEW_NOTES_CHANGES_VI,
  ...REVIEW_NOTES_REJECT_VI,
]
