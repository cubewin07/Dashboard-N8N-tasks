import { intRange, pick, type RandomFn } from '../../rng'
import { CUSTOMERS_VI } from './customers'
import { PRODUCTS_VI } from './products'
import {
  ALL_SHOPS_VI,
  CAMPAIGN_EVENTS_VI,
  DEPARTMENT_LABELS_VI,
  PLATFORM_LABELS_VI,
  SHOPS_BY_PLATFORM_VI,
} from './shops'

export const ALLOWED_TITLE_SLOTS = [
  'shop',
  'product',
  'customer',
  'n',
  'month',
  'quarter',
  'event',
  'department',
  'platform',
] as const

export type TitleSlot = (typeof ALLOWED_TITLE_SLOTS)[number]

export const TASK_TITLE_TEMPLATES_VI: Record<string, readonly string[]> = {
  // CS (12)
  'cs.chat_faq': [
    'Trả lời câu hỏi thường gặp về {product} cho khách {customer} tại {shop}',
    'Giải đáp thắc mắc chính sách bảo hành {product} trên {platform}',
  ],
  'cs.chat_size': [
    'Tư vấn chọn phân loại và kích cỡ {product} cho khách {customer} tại {shop}',
    'Hướng dẫn bảng thông số {product} cho khách {customer} trên {platform}',
  ],
  'cs.chat_order_status': [
    'Kiểm tra đơn hàng #{n} giao chậm cho khách {customer} tại {shop}',
    'Tra cứu hành trình vận đơn {product} của khách {customer} trên {platform}',
  ],
  'cs.zalo_inbox': [
    'Trả lời tin nhắn Zalo OA của khách {customer} hỏi mua {product}',
    'Phản hồi hộp thư {platform} hỗ trợ đơn hàng #{n} của khách {customer}',
  ],
  'cs.fb_comment': [
    'Trả lời bình luận hỏi giá {product} của khách {customer} trên {platform}',
    'Phản hồi {n} bình luận bài đăng chiến dịch {event} trên {platform}',
  ],
  'cs.review_positive': [
    'Gửi lời cảm ơn {n} đánh giá 5 sao cho sản phẩm {product} tại {shop}',
    'Phản hồi đánh giá 5 sao của khách {customer} mua {product} trên {platform}',
  ],
  'cs.review_negative': [
    'Trả lời và xử lý đánh giá 1 sao của khách {customer} về {product} tại {shop}',
    'Liên hệ giải quyết phản hồi 1 sao đơn hàng #{n} của khách {customer} trên {platform}',
  ],
  'cs.refund_request': [
    'Xử lý yêu cầu hoàn tiền đơn {product} của khách {customer} tại {shop}',
    'Thẩm định phiếu hoàn tiền #{n} trên {platform} cho khách {customer}',
  ],
  'cs.exchange': [
    'Hỗ trợ đổi sản phẩm {product} lỗi kỹ thuật cho khách {customer} tại {shop}',
    'Tạo phiếu thu hồi và gửi bù {product} mới cho khách {customer} trên {platform}',
  ],
  'cs.follow_up': [
    'Nhắn hỏi thăm khách {customer} sau khi nhận sản phẩm {product} từ {shop}',
    'Chăm sóc sau bán {n} khách hàng mua sắm dịp {event} trên {platform}',
  ],
  'cs.order_from_chat': [
    'Lên đơn đặt mua {product} từ tin nhắn Zalo cho khách {customer}',
    'Tạo đơn hàng #{n} qua {platform} theo yêu cầu của khách {customer}',
  ],
  'cs.night_summary': [
    'Tổng hợp {n} tin nhắn khách hàng ca đêm tại {shop} bàn giao ca sáng',
    'Báo cáo tồn đọng hộp thư ca đêm của {department} ngày hôm qua',
  ],

  // Marketing (11)
  'mkt.post_fb': [
    'Viết bài {platform} giới thiệu tính năng mới của {product}',
    'Lên bài đăng chiến dịch {event} quảng bá {product} trên {platform}',
  ],
  'mkt.post_zalo': [
    'Soạn tin nhắn {platform} thông báo ưu đãi {event} cho khách thân thiết',
    'Viết bài giới thiệu ưu đãi tháng {month} cho dòng {product} trên {platform}',
  ],
  'mkt.caption_tiktok': [
    'Viết kịch bản chữ và thẻ xu hướng {platform} cho video đánh giá {product}',
    'Soạn lời dẫn bắt xu hướng chiến dịch {event} trên kênh {platform}',
  ],
  'mkt.schedule_week': [
    'Lên lịch đăng {n} bài truyền thông tuần này trên {platform}',
    'Xếp lịch xuất bản nội dung chiến dịch {event} tháng {month} cho {department}',
  ],
  'mkt.campaign_plan': [
    'Lập kế hoạch tổng thể chiến dịch {event} cho gian hàng {shop}',
    'Xây dựng kịch bản bùng nổ doanh số {event} tháng {month} trên {platform}',
  ],
  'mkt.promo_join': [
    'Đăng ký {n} mã sản phẩm {product} vào khung Flash Sale {event} tại {shop}',
    'Chốt danh sách giá khuyến mãi chương trình {event} trên {platform}',
  ],
  'mkt.voucher': [
    'Tạo gói mã giảm giá chiến dịch {event} cho gian hàng {shop}',
    'Cài đặt voucher ưu đãi tháng {month} cho dòng {product} trên {platform}',
  ],
  'mkt.ads_budget': [
    'Đề xuất phân bổ ngân sách quảng cáo tháng {month} trên {platform}',
    'Xin duyệt ngân sách chạy quảng cáo chuyển đổi chiến dịch {event} cho {product}',
  ],
  'mkt.ads_report': [
    'Báo cáo hiệu quả chuyển đổi quảng cáo {platform} tuần này cho {product}',
    'Phân tích chỉ số chi phí quảng cáo chiến dịch {event} tháng {month}',
  ],
  'mkt.weekly_report': [
    'Báo cáo tổng hợp doanh số đa kênh tuần này của {department}',
    'Thống kê tỷ lệ tăng trưởng đơn hàng tại {shop} và toàn hệ thống tháng {month}',
  ],
  'mkt.product_desc': [
    'Viết lại mô tả chuẩn SEO cho sản phẩm {product} tại gian hàng {shop}',
    'Cập nhật thông tin chi tiết và hướng dẫn sử dụng {product} trên {platform}',
  ],

  // Design (9)
  'design.banner_set': [
    'Thiết kế bộ banner chủ đạo chiến dịch {event} cho gian hàng {shop}',
    'Dựng bộ khung ảnh khuyến mãi tháng {month} cho {product} trên {platform}',
  ],
  'design.post_image': [
    'Thiết kế bộ ảnh minh hoạ bài đăng giới thiệu {product} trên {platform}',
    'Làm hình ảnh truyền thông chương trình {event} cho {department}',
  ],
  'design.product_photos': [
    'Chỉnh màu và tách nền {n} ảnh chụp sản phẩm {product} cho {shop}',
    'Hoàn thiện bộ ảnh chi tiết góc chụp {product} đăng lên {platform}',
  ],
  'design.thumbnail': [
    'Thiết kế ảnh bìa thu hút cho video đánh giá {product} trên {platform}',
    'Làm ảnh đại diện chuỗi video chiến dịch {event} tháng {month}',
  ],
  'design.short_video': [
    'Dựng video ngắn mở hộp và trải nghiệm thực tế {product} đăng {platform}',
    'Biên tập clip giới thiệu ưu đãi {event} cho sản phẩm {product}',
  ],
  'design.video_subtitle': [
    'Thêm phụ đề tiếng Việt và hiệu ứng âm thanh cho video {product} trên {platform}',
    'Đồng bộ lời thoại và nhạc nền cho {n} video ngắn chiến dịch {event}',
  ],
  'design.shop_decor': [
    'Trang trí lại giao diện trang chủ gian hàng {shop} đón dịp {event}',
    'Cập nhật bố cục trưng bày danh mục {product} trên {platform} tháng {month}',
  ],
  'design.size_chart': [
    'Vẽ bảng thông số kích thước và hướng dẫn chọn {product} tại {shop}',
    'Thiết kế bảng so sánh thông số kỹ thuật dòng {product} cho {platform}',
  ],
  'design.packaging_label': [
    'Thiết kế tem nhãn phụ và hướng dẫn bảo quản dán hộp {product}',
    'Làm mẫu phiếu cảm ơn kèm mã QR bảo hành cho đợt hàng {event}',
  ],

  // Accounting (9)
  'acc.invoice': [
    'Xuất hoá đơn GTGT điện tử đơn hàng {product} cho khách {customer}',
    'Phát hành hoá đơn đỏ đơn #{n} tại {shop} cho khách {customer}',
  ],
  'acc.invoice_batch': [
    'Xuất loạt {n} hoá đơn điện tử cho các đơn hoàn tất trong ngày tại {shop}',
    'Kiểm tra và phát hành danh sách hoá đơn bán lẻ tháng {month} trên {platform}',
  ],
  'acc.reconcile': [
    'Đối soát doanh thu và biểu phí sàn kỳ thanh toán tháng {month} của {shop}',
    'Kiểm tra chênh lệch tiền về {n} đơn hàng chiến dịch {event} trên {platform}',
  ],
  'acc.ledger': [
    'Ghi sổ chi phí vận hành và tiếp thị tuần này của {department}',
    'Hạch toán {n} chứng từ thu chi nội bộ kỳ tháng {month}',
  ],
  'acc.vat_return': [
    'Lập tờ khai quyết toán thuế GTGT quý {quarter} trình Ban Giám đốc',
    'Đối chiếu bảng kê hoá đơn đầu vào và đầu ra kỳ thuế quý {quarter}',
  ],
  'acc.pit': [
    'Tính bảng khấu trừ thuế thu nhập cá nhân tháng {month} toàn công ty',
    'Rà soát hồ sơ giảm trừ gia cảnh và quyết toán thuế TNCN quý {quarter}',
  ],
  'acc.revenue_report': [
    'Lập báo cáo tổng hợp doanh thu và lợi nhuận ròng tháng {month}',
    'Phân tích cơ cấu doanh thu theo từng gian hàng {shop} trong quý {quarter}',
  ],
  'acc.supplier_payment': [
    'Lập đề nghị thanh toán công nợ lô hàng {product} đợt tháng {month}',
    'Chuẩn bị uỷ nhiệm chi thanh toán cho {n} nhà cung cấp trước hạn',
  ],
  'acc.refund_payout': [
    'Thực hiện lệnh chi hoàn tiền đơn {product} cho khách {customer}',
    'Giải ngân {n} phiếu hoàn tiền đơn hàng {shop} đã được phê duyệt',
  ],

  // System (2)
  'sys.hire_over_cap': [
    'Đề nghị tuyển thêm nhân sự tạm thời vượt trần cho {department} dịp {event}',
    'Xin phê duyệt bổ sung nhân viên thời vụ hỗ trợ {department} tháng {month}',
  ],
  'sys.connect_account': [
    'Kết nối và phân quyền tài khoản gian hàng {shop} mới trên {platform}',
    'Thiết lập tích hợp đồng bộ dữ liệu kênh {platform} cho {department}',
  ],
}

export interface TitleRenderContext {
  shop?: string
  product?: string
  customer?: string
  n?: number
  month?: number
  quarter?: number
  event?: string
  department?: string
  platform?: string
  departmentId?: string
  platformKey?: string
}

export function renderTaskTitle(
  typeKey: string,
  rng: RandomFn,
  ctx: TitleRenderContext = {},
): string {
  const templates = TASK_TITLE_TEMPLATES_VI[typeKey]
  const template =
    templates && templates.length > 0
      ? pick(rng, templates)
      : 'Xử lý công việc {product} tại {shop}'

  const platformKey = ctx.platformKey
  const shopPool =
    platformKey && SHOPS_BY_PLATFORM_VI[platformKey]
      ? SHOPS_BY_PLATFORM_VI[platformKey]!
      : ALL_SHOPS_VI

  const shop = ctx.shop ?? pick(rng, shopPool)
  const product = ctx.product ?? pick(rng, PRODUCTS_VI)
  const customer = ctx.customer ?? pick(rng, CUSTOMERS_VI)
  const n = ctx.n ?? intRange(rng, 12, 480)
  const month = ctx.month ?? intRange(rng, 1, 12)
  const quarter = ctx.quarter ?? Math.ceil(month / 3)
  const event = ctx.event ?? pick(rng, CAMPAIGN_EVENTS_VI)
  const department =
    ctx.department ??
    (ctx.departmentId && DEPARTMENT_LABELS_VI[ctx.departmentId]
      ? DEPARTMENT_LABELS_VI[ctx.departmentId]!
      : pick(rng, Object.values(DEPARTMENT_LABELS_VI)))
  const platform =
    ctx.platform ??
    (platformKey && PLATFORM_LABELS_VI[platformKey]
      ? PLATFORM_LABELS_VI[platformKey]!
      : pick(rng, Object.values(PLATFORM_LABELS_VI)))

  const replacements: Record<TitleSlot, string> = {
    shop,
    product,
    customer,
    n: String(n),
    month: String(month),
    quarter: String(quarter),
    event,
    department,
    platform,
  }

  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    if (key in replacements) {
      return replacements[key as TitleSlot]
    }
    return key
  })
}
