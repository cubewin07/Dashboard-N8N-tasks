import type { DepartmentId } from '@/domain/primitives'
import type { Priority } from '@/domain/work'

export interface BossMessageTemplate {
  text: string
  departmentId: DepartmentId
  typeKey: string
  priority: Priority
  platformKey?: string
}

export const BOSS_MESSAGES_VI: readonly BossMessageTemplate[] = [
  {
    text: 'Thu ơi, bảo phòng Thiết kế cập nhật gấp bộ banner chương trình 12.12 trên Shopee 1 trước 15h chiều nay nhé!',
    departmentId: 'dep_design',
    typeKey: 'design.banner_set',
    priority: 'urgent',
    platformKey: 'shopee',
  },
  {
    text: 'Kiểm tra ngay đơn khiếu nại hoàn tiền của khách trên Lazada 1, xử lý êm đẹp đừng để đánh giá 1 sao.',
    departmentId: 'dep_cs',
    typeKey: 'cs.refund_request',
    priority: 'urgent',
    platformKey: 'lazada',
  },
  {
    text: 'Lan chuẩn bị bảng đối soát doanh thu Shopee và TikTok Shop tháng này gửi anh trước giờ họp nhé.',
    departmentId: 'dep_accounting',
    typeKey: 'acc.reconcile',
    priority: 'high',
    platformKey: 'shopee',
  },
  {
    text: 'Nhi dựng ngay video ngắn giới thiệu dòng tai nghe chống ồn mới để kịp đăng TikTok tối thứ Sáu.',
    departmentId: 'dep_design',
    typeKey: 'design.short_video',
    priority: 'high',
    platformKey: 'tiktok',
  },
  {
    text: 'Hải đăng ký gấp chương trình Flash Sale khung 0h đêm nay cho gian hàng Shopee 1 và Shopee 2.',
    departmentId: 'dep_marketing',
    typeKey: 'mkt.promo_join',
    priority: 'urgent',
    platformKey: 'shopee',
  },
  {
    text: 'Tạo mã giảm giá 15% cho khách hàng mới trên gian hàng TikTok Shop 1 trong dịp cuối tuần này.',
    departmentId: 'dep_marketing',
    typeKey: 'mkt.voucher',
    priority: 'high',
    platformKey: 'tiktok_shop',
  },
  {
    text: 'Thảo tổng hợp báo cáo doanh số theo kênh tuần này để sáng mai họp giao ban đầu tuần.',
    departmentId: 'dep_marketing',
    typeKey: 'mkt.weekly_report',
    priority: 'high',
  },
  {
    text: 'Ngọc rà soát lại toàn bộ phiếu yêu cầu hoàn tiền đang tồn ở hàng chờ CSKH trên Shopee.',
    departmentId: 'dep_cs',
    typeKey: 'cs.refund_request',
    priority: 'high',
    platformKey: 'shopee',
  },
  {
    text: 'Viết bài thông báo chương trình khuyến mãi cuối tuần trên Zalo OA gửi tệp khách hàng thân thiết.',
    departmentId: 'dep_marketing',
    typeKey: 'mkt.post_zalo',
    priority: 'normal',
    platformKey: 'zalo_oa',
  },
  {
    text: 'Trả lời gấp các đánh giá 1 sao mới phát sinh sáng nay trên Shopee 2, liên hệ xin lỗi và hỗ trợ đổi hàng.',
    departmentId: 'dep_cs',
    typeKey: 'cs.review_negative',
    priority: 'urgent',
    platformKey: 'shopee',
  },
  {
    text: 'Lên đề xuất ngân sách quảng cáo Facebook và TikTok tháng tới, tập trung vào nhóm sản phẩm gia dụng.',
    departmentId: 'dep_marketing',
    typeKey: 'mkt.ads_budget',
    priority: 'urgent',
    platformKey: 'facebook',
  },
  {
    text: 'Trang trí lại giao diện gian hàng Shopee 1 và Lazada 1 theo chủ đề Siêu Sale 12.12.',
    departmentId: 'dep_design',
    typeKey: 'design.shop_decor',
    priority: 'high',
    platformKey: 'shopee',
  },
  {
    text: 'Thanh toán đợt 2 công nợ nhà cung cấp bao bì hộp giấy trước hạn thứ Năm tuần này.',
    departmentId: 'dep_accounting',
    typeKey: 'acc.supplier_payment',
    priority: 'urgent',
  },
  {
    text: 'Xuất hoá đơn GTGT cho đơn hàng doanh nghiệp đặt quà tặng nhân viên vừa chuyển khoản sáng nay.',
    departmentId: 'dep_accounting',
    typeKey: 'acc.invoice',
    priority: 'high',
  },
  {
    text: 'Lập kế hoạch tổng thể chiến dịch sale cuối năm phối hợp giữa Marketing, Thiết kế và Kế toán.',
    departmentId: 'dep_marketing',
    typeKey: 'mkt.campaign_plan',
    priority: 'high',
    platformKey: 'shopee',
  },
  {
    text: 'Hỗ trợ đổi sản phẩm lỗi cho khách hàng phản ánh trên Shopee 1, gửi bù ngay trong chiều nay.',
    departmentId: 'dep_cs',
    typeKey: 'cs.exchange',
    priority: 'urgent',
    platformKey: 'shopee',
  },
  {
    text: 'Hoàn thiện tờ khai thuế GTGT quý này trình sếp ký duyệt trước ngày 20.',
    departmentId: 'dep_accounting',
    typeKey: 'acc.vat_return',
    priority: 'urgent',
  },
  {
    text: 'Kiểm tra danh sách các đơn hàng giao chậm quá 3 ngày trên Shopee và Lazada để thúc bên vận chuyển.',
    departmentId: 'dep_cs',
    typeKey: 'cs.chat_order_status',
    priority: 'high',
    platformKey: 'shopee',
  },
  {
    text: 'Chỉnh lại bộ ảnh sản phẩm mới chụp sáng nay để kịp cập nhật lên Shopee 3.',
    departmentId: 'dep_design',
    typeKey: 'design.product_photos',
    priority: 'normal',
    platformKey: 'shopee',
  },
  {
    text: 'Viết bài Facebook giới thiệu bộ sưu tập phụ kiện bàn làm việc mới về kho.',
    departmentId: 'dep_marketing',
    typeKey: 'mkt.post_fb',
    priority: 'normal',
    platformKey: 'facebook',
  },
  {
    text: 'Chi hoàn tiền ngay cho các phiếu hoàn hàng đã được duyệt tại phòng Kế toán.',
    departmentId: 'dep_accounting',
    typeKey: 'acc.refund_payout',
    priority: 'urgent',
  },
  {
    text: 'Nhắn hỏi thăm và xin đánh giá 5 sao từ nhóm khách vừa nhận hàng thành công tuần này.',
    departmentId: 'dep_cs',
    typeKey: 'cs.follow_up',
    priority: 'low',
    platformKey: 'zalo_oa',
  },
  {
    text: 'Thiết kế lại mẫu tem dán hộp sản phẩm mới có mã QR hướng dẫn sử dụng tiếng Việt.',
    departmentId: 'dep_design',
    typeKey: 'design.packaging_label',
    priority: 'normal',
  },
  {
    text: 'Tính bảng thuế thu nhập cá nhân tháng này và đối chiếu chứng từ khấu trừ.',
    departmentId: 'dep_accounting',
    typeKey: 'acc.pit',
    priority: 'high',
  },
  {
    text: 'Lập báo cáo doanh thu tháng toàn hệ thống gửi Ban Giám đốc xem xét.',
    departmentId: 'dep_accounting',
    typeKey: 'acc.revenue_report',
    priority: 'high',
  },
  {
    text: 'Kết nối thêm tài khoản gian hàng mới trên nền tảng TikTok Shop vào hệ thống quản lý.',
    departmentId: 'dep_marketing',
    typeKey: 'sys.connect_account',
    priority: 'high',
  },
] as const
