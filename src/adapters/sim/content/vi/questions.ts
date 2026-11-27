export interface QuestionAnswerPair {
  question: string
  answer: string
}

export const QUESTIONS_VI: readonly QuestionAnswerPair[] = [
  {
    question:
      'Chị ơi, đơn hàng này khách quay video khui hộp nhưng thiếu tem niêm phong thì mình hỗ trợ đổi mới hay hoàn tiền 50% ạ?',
    answer:
      'Em kiểm tra lịch sử mua hàng nhé, nếu khách mua lần đầu và thái độ thiện chí thì hỗ trợ đổi mới 1-1 để giữ uy tín gian hàng.',
  },
  {
    question:
      'Anh ơi, mã sản phẩm này tồn kho khả dụng chỉ còn 18 chiếc, mình có nên giới hạn số lượng mua tối đa 1 chiếc mỗi đơn trong Flash Sale không ạ?',
    answer:
      'Đúng rồi, em cài giới hạn 1 sản phẩm/khách và bật cảnh báo tồn kho tối thiểu ở mức 5 chiếc nhé.',
  },
  {
    question:
      'Chị ơi, bên vận chuyển báo tuyến giao hàng miền Trung đang chậm 2 ngày do mưa lớn, mình nhắn thông báo cho những đơn nào ạ?',
    answer:
      'Em lọc toàn bộ đơn đang vận chuyển đi các tỉnh miền Trung từ đầu tuần rồi gửi tin nhắn Zalo OA xin lỗi kèm mã giảm giá 20k cho đơn sau nhé.',
  },
  {
    question:
      'Anh ơi, khoản phí dịch vụ sàn tháng này có chênh lệch 1,2 triệu so với bảng tạm tính, mình hạch toán vào tài khoản chi phí nào ạ?',
    answer:
      'Em tách phần phí cố định và phí hoa hồng chương trình Freeship Xtra ra riêng, phần lệch do đơn hoàn sau ngày chốt kỳ thì đưa vào đối soát kỳ kế tiếp.',
  },
  {
    question:
      'Anh ơi, KOL đề xuất đổi lịch đăng video sang tối Chủ nhật lúc 20h để trùng giờ mở bán, mình có đồng ý điều chỉnh hợp đồng không ạ?',
    answer:
      'Khung giờ 20h Chủ nhật lưu lượng rất tốt, em xác nhận đồng ý và nhắc bạn ấy gắn đúng giỏ hàng sản phẩm chủ lực nhé.',
  },
  {
    question:
      'Chị ơi, khách doanh nghiệp muốn lấy hoá đơn đỏ cho đơn hàng 35 chiếc bình giữ nhiệt nhưng chia làm 2 đợt giao thì xuất hoá đơn thế nào ạ?',
    answer:
      'Theo quy định mình xuất hoá đơn tương ứng với số lượng thực giao từng đợt theo biên bản bàn giao hàng hoá em nhé.',
  },
  {
    question:
      'Anh ơi, lô tai nghe mới nhập về có 12 hộp bị trầy lớp màng co bên ngoài nhưng ruột bên trong nguyên vẹn, mình xử lý sao ạ?',
    answer:
      'Em tách riêng 12 hộp đó vào kệ hàng loại B để dùng làm hàng mẫu livestream hoặc bán thanh lý hộp xấu, tuyệt đối không giao đơn thường.',
  },
  {
    question:
      'Chị ơi, tiêu đề sản phẩm trên Shopee Mall đang bị giới hạn ký tự, mình ưu tiên giữ tên dòng sản phẩm hay thông số công suất ạ?',
    answer:
      'Giữ công thức: Thương hiệu + Tên sản phẩm + Thông số chính + Bảo hành chính hãng, bỏ các tính từ trang trí không cần thiết đi em.',
  },
  {
    question:
      'Anh ơi, ngân sách quảng cáo chiến dịch ngày đôi đã tiêu hết 85% lúc 16h chiều mà ROAS đang đạt 6.8, có xin tăng thêm 20% ngân sách không ạ?',
    answer:
      'ROAS trên 6.0 là rất hiệu quả, em lập phiếu đề xuất tăng ngân sách 20% chuyển lên trưởng phòng và sếp duyệt ngay trước khung giờ 20h nhé.',
  },
  {
    question:
      'Chị ơi, khách nhắn trên Fanpage muốn đổi địa chỉ nhận hàng khi bưu tá đã lấy hàng khỏi kho rồi thì xử lý thế nào ạ?',
    answer:
      'Em tạo phiếu yêu cầu cập nhật thông tin giao hàng trên cổng đối tác vận chuyển ngay và nhắn khách giữ máy khi bưu tá gọi xác nhận.',
  },
  {
    question:
      'Anh ơi, bảng phân bổ KPI tháng tới mình giữ nguyên tỷ trọng doanh thu TikTok Shop 35% hay nâng lên 40% theo đà tăng trưởng vừa rồi ạ?',
    answer:
      'Em làm 2 phương án cơ sở (35%) và phương án mục tiêu (40%) kèm chi phí marketing tương ứng để trình Ban Giám đốc chọn nhé.',
  },
  {
    question:
      'Chị ơi, mã voucher 50k cho đơn từ 499k đang bị trùng điều kiện áp dụng với voucher toàn sàn, mình có tắt bớt 1 mã không ạ?',
    answer:
      'Em điều chỉnh ngưỡng đơn tối thiểu của voucher gian hàng lên 599k để tránh cộng dồn vượt trần chiết khấu nhé.',
  },
  {
    question:
      'Anh ơi, nhà cung cấp bao bì xin lùi lịch giao thùng carton in logo thêm 1 ngày, kho hiện còn đủ thùng trơn dùng tạm trong 2 ngày tới, mình duyệt sao ạ?',
    answer:
      'Yêu cầu họ giao trước 500 thùng trong sáng mai, nếu không kịp thì dùng thùng trơn dán băng keo niêm phong thương hiệu để không trễ đơn sàn.',
  },
  {
    question:
      'Chị ơi, khách đánh giá 2 sao vì hiểu nhầm cách kết nối Bluetooth của bàn phím cơ, mình phản hồi công khai thế nào cho khéo ạ?',
    answer:
      'Em phản hồi cảm ơn góp ý, hướng dẫn ngắn gọn tổ hợp phím Fn+1/2/3 ngay dưới bình luận và gọi điện trực tiếp hỗ trợ khách kết nối thành công nhé.',
  },
  {
    question:
      'Anh ơi, kỳ quyết toán thuế GTGT tháng này có 3 hoá đơn vận chuyển điện tử về muộn sau ngày 20, mình kê khai bổ sung hay đưa vào kỳ sau ạ?',
    answer:
      'Nếu ngày ký số trên hoá đơn vẫn thuộc tháng này và kịp trước ngày nộp tờ khai thì em đưa vào kỳ này luôn để khấu trừ kịp thời.',
  },
  {
    question:
      'Chị ơi, gian hàng Lazada báo có chương trình tài trợ hiển thị trang chủ nếu mình cam kết giảm sâu 25% cho 3 mã chủ lực, mình tham gia không ạ?',
    answer:
      'Em tính lại giá vốn 3 mã đó, nếu sau khi trừ phí sàn và giảm 25% vẫn giữ được biên lợi nhuận ròng trên 8% thì đăng ký tham gia.',
  },
] as const
