-- GENERATED, do not edit; run npm run seed:sql
-- Seed of the org config from src/content/*.json. Idempotent (on conflict do nothing).

insert into public.departments (id, key, label, "order", color_swatch, icon, hours, floor_template, active) values
  ('dep_cs', 'cs', '{"vi":"Chăm sóc khách hàng","en":"Customer Support"}'::jsonb, 1, 'cs', 'Headset', '24_7', 'department', true),
  ('dep_marketing', 'marketing', '{"vi":"Marketing","en":"Marketing"}'::jsonb, 2, 'marketing', 'Megaphone', 'office', 'department', true),
  ('dep_design', 'design', '{"vi":"Thiết kế","en":"Design"}'::jsonb, 3, 'design', 'Palette', 'office', 'department', true),
  ('dep_accounting', 'accounting', '{"vi":"Kế toán","en":"Accounting"}'::jsonb, 4, 'accounting', 'Calculator', 'office', 'department', true)
on conflict do nothing;

insert into public.roles (key, def) values
  ('owner', '{"label":{"vi":"Chủ sở hữu","en":"Owner"},"scope":"building","caps":{"assignTasks":true,"approveLevel":"boss","distributeReviews":false,"answerQuestions":true,"doWork":false,"humanOwner":true},"modelTier":"strong","maxPerDepartment":null,"workspace":"boss_office","sortOrder":0}'::jsonb),
  ('manager', '{"label":{"vi":"Quản lý điều hành","en":"General Manager"},"scope":"building","caps":{"assignTasks":true,"approveLevel":null,"distributeReviews":false,"answerQuestions":true,"doWork":false,"humanOwner":false},"modelTier":"strong","maxPerDepartment":null,"workspace":"manager_office","sortOrder":1}'::jsonb),
  ('dept_manager', '{"label":{"vi":"Trưởng phòng","en":"Department Manager"},"scope":"department","caps":{"assignTasks":true,"approveLevel":"dept_manager","distributeReviews":false,"answerQuestions":true,"doWork":false,"humanOwner":false},"modelTier":"strong","maxPerDepartment":1,"workspace":"private_office","sortOrder":2}'::jsonb),
  ('lead', '{"label":{"vi":"Trưởng nhóm","en":"Team Lead"},"scope":"department","caps":{"assignTasks":false,"approveLevel":null,"distributeReviews":true,"answerQuestions":true,"doWork":true,"humanOwner":false},"modelTier":"standard","maxPerDepartment":1,"workspace":"review_desk","sortOrder":3}'::jsonb),
  ('reviewer', '{"label":{"vi":"Kiểm duyệt","en":"Reviewer"},"scope":"department","caps":{"assignTasks":false,"approveLevel":"reviewer","distributeReviews":false,"answerQuestions":false,"doWork":false,"humanOwner":false},"modelTier":"cheap","maxPerDepartment":null,"workspace":"review_desk","sortOrder":4}'::jsonb),
  ('worker', '{"label":{"vi":"Nhân viên","en":"Worker"},"scope":"department","caps":{"assignTasks":false,"approveLevel":null,"distributeReviews":false,"answerQuestions":false,"doWork":true,"humanOwner":false},"modelTier":"standard","maxPerDepartment":null,"workspace":"desk","sortOrder":5}'::jsonb)
on conflict do nothing;

insert into public.specialties (key, def) values
  ('customer_chat', '{"label":{"vi":"Trả lời tin nhắn","en":"Customer Chat"},"icon":"MessageSquare","homeDepartmentKey":"cs"}'::jsonb),
  ('review_reply', '{"label":{"vi":"Phản hồi đánh giá","en":"Review Reply"},"icon":"Star","homeDepartmentKey":"cs"}'::jsonb),
  ('follow_up', '{"label":{"vi":"Chăm sóc sau bán","en":"Follow-up"},"icon":"HeartHandshake","homeDepartmentKey":"cs"}'::jsonb),
  ('copywriting', '{"label":{"vi":"Viết nội dung","en":"Copywriting"},"icon":"PenTool","homeDepartmentKey":"marketing"}'::jsonb),
  ('social_scheduling', '{"label":{"vi":"Lên lịch đăng bài","en":"Social Scheduling"},"icon":"CalendarClock","homeDepartmentKey":"marketing"}'::jsonb),
  ('ads', '{"label":{"vi":"Quảng cáo","en":"Advertising"},"icon":"Target","homeDepartmentKey":"marketing"}'::jsonb),
  ('promotions', '{"label":{"vi":"Khuyến mãi sàn","en":"Promotions"},"icon":"Tag","homeDepartmentKey":"marketing"}'::jsonb),
  ('reporting', '{"label":{"vi":"Báo cáo số liệu","en":"Reporting"},"icon":"BarChart3","homeDepartmentKey":"marketing"}'::jsonb),
  ('image', '{"label":{"vi":"Thiết kế ảnh","en":"Image Design"},"icon":"Image","homeDepartmentKey":"design"}'::jsonb),
  ('video', '{"label":{"vi":"Dựng video ngắn","en":"Short Video"},"icon":"Film","homeDepartmentKey":"design"}'::jsonb),
  ('product_photo', '{"label":{"vi":"Ảnh sản phẩm","en":"Product Photography"},"icon":"Camera","homeDepartmentKey":"design"}'::jsonb),
  ('invoicing', '{"label":{"vi":"Xuất hoá đơn","en":"Invoicing"},"icon":"Receipt","homeDepartmentKey":"accounting"}'::jsonb),
  ('bookkeeping', '{"label":{"vi":"Sổ sách kế toán","en":"Bookkeeping"},"icon":"BookOpen","homeDepartmentKey":"accounting"}'::jsonb),
  ('tax', '{"label":{"vi":"Kê khai thuế","en":"Tax Filing"},"icon":"Landmark","homeDepartmentKey":"accounting"}'::jsonb),
  ('qc', '{"label":{"vi":"Kiểm duyệt chất lượng","en":"Quality Control"},"icon":"ShieldCheck","homeDepartmentKey":null}'::jsonb)
on conflict do nothing;

insert into public.platforms (key, def) values
  ('facebook', '{"label":{"vi":"Facebook","en":"Facebook"},"kind":"social","badge":{"text":"FB","swatch":"blue_600"},"iconAsset":null,"active":true}'::jsonb),
  ('instagram', '{"label":{"vi":"Instagram","en":"Instagram"},"kind":"social","badge":{"text":"IG","swatch":"pink_600"},"iconAsset":null,"active":true}'::jsonb),
  ('zalo_oa', '{"label":{"vi":"Zalo OA","en":"Zalo OA"},"kind":"messaging","badge":{"text":"ZOA","swatch":"sky_600"},"iconAsset":null,"active":true}'::jsonb),
  ('zalo', '{"label":{"vi":"Zalo","en":"Zalo"},"kind":"messaging","badge":{"text":"ZL","swatch":"sky_500"},"iconAsset":null,"active":true}'::jsonb),
  ('tiktok', '{"label":{"vi":"TikTok","en":"TikTok"},"kind":"social","badge":{"text":"TT","swatch":"neutral_900"},"iconAsset":null,"active":true}'::jsonb),
  ('tiktok_business', '{"label":{"vi":"TikTok Business","en":"TikTok Business"},"kind":"social","badge":{"text":"TTB","swatch":"teal_600"},"iconAsset":null,"active":true}'::jsonb),
  ('shopee', '{"label":{"vi":"Shopee","en":"Shopee"},"kind":"marketplace","badge":{"text":"SP","swatch":"orange_500"},"iconAsset":null,"active":true}'::jsonb),
  ('lazada', '{"label":{"vi":"Lazada","en":"Lazada"},"kind":"marketplace","badge":{"text":"LZ","swatch":"indigo_600"},"iconAsset":null,"active":true}'::jsonb),
  ('tiktok_shop', '{"label":{"vi":"TikTok Shop","en":"TikTok Shop"},"kind":"marketplace","badge":{"text":"TTS","swatch":"rose_600"},"iconAsset":null,"active":true}'::jsonb)
on conflict do nothing;

insert into public.shops (id, platform_key, name, handle) values
  ('shop_shopee_1', 'shopee', 'Shopee 1', '@shophq.vn1'),
  ('shop_shopee_2', 'shopee', 'Shopee 2', '@shophq.vn2'),
  ('shop_shopee_3', 'shopee', 'Shopee 3', '@shophq.vn3'),
  ('shop_lazada_1', 'lazada', 'Lazada 1', '@shophq.laz'),
  ('shop_tiktok_1', 'tiktok_shop', 'TikTok Shop 1', '@shophq.tiktok')
on conflict do nothing;

insert into public.task_types (key, def) values
  ('cs.chat_faq', '{"departmentKey":"cs","label":{"vi":"Trả lời câu hỏi thường gặp","en":"Answer customer FAQ chat"},"specialty":"customer_chat","tags":["faq_reply"],"defaultPriority":"normal","durationMinutes":[3,8],"platformKeys":["shopee","lazada","tiktok_shop"],"needsHelpFrom":[],"carries":"phone"}'::jsonb),
  ('cs.chat_size', '{"departmentKey":"cs","label":{"vi":"Tư vấn size sản phẩm","en":"Advise product size"},"specialty":"customer_chat","tags":["faq_reply"],"defaultPriority":"normal","durationMinutes":[4,10],"platformKeys":["shopee","tiktok_shop"],"needsHelpFrom":[],"carries":"phone"}'::jsonb),
  ('cs.chat_order_status', '{"departmentKey":"cs","label":{"vi":"Kiểm tra đơn hàng giao chậm","en":"Check delayed order status"},"specialty":"customer_chat","tags":["routine_draft"],"defaultPriority":"high","durationMinutes":[5,12],"platformKeys":["shopee","lazada"],"needsHelpFrom":[],"carries":"phone"}'::jsonb),
  ('cs.zalo_inbox', '{"departmentKey":"cs","label":{"vi":"Trả lời tin nhắn Zalo OA","en":"Reply to Zalo OA inbox"},"specialty":"customer_chat","tags":["faq_reply"],"defaultPriority":"normal","durationMinutes":[3,8],"platformKeys":["zalo_oa"],"needsHelpFrom":[],"carries":"phone"}'::jsonb),
  ('cs.fb_comment', '{"departmentKey":"cs","label":{"vi":"Trả lời bình luận Facebook","en":"Reply to Facebook comment"},"specialty":"customer_chat","tags":["faq_reply","public_post"],"defaultPriority":"normal","durationMinutes":[3,6],"platformKeys":["facebook"],"needsHelpFrom":[],"carries":"phone"}'::jsonb),
  ('cs.review_positive', '{"departmentKey":"cs","label":{"vi":"Cảm ơn đánh giá 5 sao","en":"Thank 5-star reviews"},"specialty":"review_reply","tags":["routine_draft"],"defaultPriority":"low","durationMinutes":[6,15],"platformKeys":["shopee","lazada","tiktok_shop"],"needsHelpFrom":[],"carries":"phone"}'::jsonb),
  ('cs.review_negative', '{"departmentKey":"cs","label":{"vi":"Trả lời đánh giá 1 sao","en":"Respond to 1-star review"},"specialty":"review_reply","tags":["public_post","angry_customer"],"defaultPriority":"high","durationMinutes":[10,20],"platformKeys":["shopee","lazada"],"needsHelpFrom":["copywriting"],"carries":"phone"}'::jsonb),
  ('cs.refund_request', '{"departmentKey":"cs","label":{"vi":"Xử lý yêu cầu hoàn tiền","en":"Process refund request"},"specialty":"customer_chat","tags":["refund","money","angry_customer"],"defaultPriority":"urgent","durationMinutes":[10,25],"platformKeys":["shopee","lazada","tiktok_shop"],"needsHelpFrom":[],"carries":"phone"}'::jsonb),
  ('cs.exchange', '{"departmentKey":"cs","label":{"vi":"Hỗ trợ đổi sản phẩm lỗi","en":"Support defective item exchange"},"specialty":"customer_chat","tags":["money"],"defaultPriority":"high","durationMinutes":[10,20],"platformKeys":["shopee"],"needsHelpFrom":[],"carries":"phone"}'::jsonb),
  ('cs.follow_up', '{"departmentKey":"cs","label":{"vi":"Nhắn hỏi thăm khách sau nhận hàng","en":"Post-delivery customer follow-up"},"specialty":"follow_up","tags":["routine_draft"],"defaultPriority":"low","durationMinutes":[10,20],"platformKeys":["shopee","zalo_oa"],"needsHelpFrom":[],"carries":"phone"}'::jsonb),
  ('cs.order_from_chat', '{"departmentKey":"cs","label":{"vi":"Tạo đơn từ tin nhắn Zalo","en":"Create order from Zalo chat"},"specialty":"customer_chat","tags":["money"],"defaultPriority":"normal","durationMinutes":[6,12],"platformKeys":["zalo_oa"],"needsHelpFrom":[],"carries":"phone"}'::jsonb),
  ('cs.night_summary', '{"departmentKey":"cs","label":{"vi":"Tổng hợp tin nhắn ca đêm","en":"Night-shift chat summary"},"specialty":"follow_up","tags":["internal_note"],"defaultPriority":"low","durationMinutes":[10,15],"platformKeys":[],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('mkt.post_fb', '{"departmentKey":"marketing","label":{"vi":"Viết bài Facebook giới thiệu sản phẩm","en":"Write Facebook product post"},"specialty":"copywriting","tags":["public_post"],"defaultPriority":"normal","durationMinutes":[15,30],"platformKeys":["facebook"],"needsHelpFrom":["image"],"carries":"laptop"}'::jsonb),
  ('mkt.post_zalo', '{"departmentKey":"marketing","label":{"vi":"Viết bài Zalo OA khuyến mãi","en":"Write Zalo OA promo post"},"specialty":"copywriting","tags":["public_post"],"defaultPriority":"normal","durationMinutes":[15,30],"platformKeys":["zalo_oa"],"needsHelpFrom":["image"],"carries":"laptop"}'::jsonb),
  ('mkt.caption_tiktok', '{"departmentKey":"marketing","label":{"vi":"Viết caption TikTok","en":"Write TikTok video caption"},"specialty":"copywriting","tags":["public_post"],"defaultPriority":"normal","durationMinutes":[8,15],"platformKeys":["tiktok"],"needsHelpFrom":["video"],"carries":"laptop"}'::jsonb),
  ('mkt.schedule_week', '{"departmentKey":"marketing","label":{"vi":"Lên lịch đăng bài tuần này","en":"Schedule weekly social posts"},"specialty":"social_scheduling","tags":["routine_draft"],"defaultPriority":"normal","durationMinutes":[15,25],"platformKeys":["facebook","zalo_oa","tiktok"],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('mkt.campaign_plan', '{"departmentKey":"marketing","label":{"vi":"Lập kế hoạch chiến dịch sale","en":"Plan mega sale campaign"},"specialty":"promotions","tags":["campaign","cross_department"],"defaultPriority":"high","durationMinutes":[30,60],"platformKeys":["shopee","lazada","tiktok_shop"],"needsHelpFrom":["image","bookkeeping"],"carries":"laptop"}'::jsonb),
  ('mkt.promo_join', '{"departmentKey":"marketing","label":{"vi":"Đăng ký chương trình Flash Sale","en":"Register for Flash Sale program"},"specialty":"promotions","tags":["money"],"defaultPriority":"high","durationMinutes":[20,35],"platformKeys":["shopee","lazada"],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('mkt.voucher', '{"departmentKey":"marketing","label":{"vi":"Tạo mã giảm giá gian hàng","en":"Create shop discount voucher"},"specialty":"promotions","tags":["money"],"defaultPriority":"normal","durationMinutes":[10,20],"platformKeys":["shopee","tiktok_shop"],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('mkt.ads_budget', '{"departmentKey":"marketing","label":{"vi":"Đề xuất ngân sách quảng cáo tháng","en":"Propose monthly ad budget"},"specialty":"ads","tags":["money"],"defaultPriority":"high","durationMinutes":[25,40],"platformKeys":["facebook","tiktok_business"],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('mkt.ads_report', '{"departmentKey":"marketing","label":{"vi":"Báo cáo hiệu quả quảng cáo tuần","en":"Weekly ad performance report"},"specialty":"reporting","tags":["internal_note"],"defaultPriority":"low","durationMinutes":[20,30],"platformKeys":["facebook","tiktok_business"],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('mkt.weekly_report', '{"departmentKey":"marketing","label":{"vi":"Báo cáo doanh số theo kênh tuần này","en":"Weekly multi-channel sales report"},"specialty":"reporting","tags":["internal_note"],"defaultPriority":"normal","durationMinutes":[20,35],"platformKeys":[],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('mkt.product_desc', '{"departmentKey":"marketing","label":{"vi":"Viết lại mô tả sản phẩm","en":"Rewrite product description"},"specialty":"copywriting","tags":["routine_draft"],"defaultPriority":"low","durationMinutes":[12,20],"platformKeys":["shopee","lazada"],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('design.banner_set', '{"departmentKey":"design","label":{"vi":"Thiết kế bộ banner sale","en":"Design sale banner set"},"specialty":"image","tags":["public_post"],"defaultPriority":"high","durationMinutes":[30,50],"platformKeys":["shopee","lazada","tiktok_shop"],"needsHelpFrom":[],"carries":"tablet"}'::jsonb),
  ('design.post_image', '{"departmentKey":"design","label":{"vi":"Làm ảnh minh hoạ bài đăng","en":"Create social post image"},"specialty":"image","tags":["routine_draft"],"defaultPriority":"normal","durationMinutes":[15,30],"platformKeys":["facebook","zalo_oa"],"needsHelpFrom":[],"carries":"tablet"}'::jsonb),
  ('design.product_photos', '{"departmentKey":"design","label":{"vi":"Chỉnh ảnh sản phẩm","en":"Retouch product photos"},"specialty":"product_photo","tags":["routine_draft"],"defaultPriority":"normal","durationMinutes":[20,40],"platformKeys":["shopee"],"needsHelpFrom":[],"carries":"camera"}'::jsonb),
  ('design.thumbnail', '{"departmentKey":"design","label":{"vi":"Làm ảnh bìa video","en":"Create video thumbnail"},"specialty":"image","tags":["routine_draft"],"defaultPriority":"low","durationMinutes":[10,20],"platformKeys":["tiktok"],"needsHelpFrom":[],"carries":"tablet"}'::jsonb),
  ('design.short_video', '{"departmentKey":"design","label":{"vi":"Dựng video ngắn giới thiệu sản phẩm","en":"Edit short product video"},"specialty":"video","tags":["public_post"],"defaultPriority":"normal","durationMinutes":[40,70],"platformKeys":["tiktok","facebook"],"needsHelpFrom":[],"carries":"camera"}'::jsonb),
  ('design.video_subtitle', '{"departmentKey":"design","label":{"vi":"Thêm phụ đề và nhạc cho video","en":"Add video subtitles and music"},"specialty":"video","tags":["routine_draft"],"defaultPriority":"low","durationMinutes":[15,25],"platformKeys":["tiktok"],"needsHelpFrom":[],"carries":"camera"}'::jsonb),
  ('design.shop_decor', '{"departmentKey":"design","label":{"vi":"Trang trí lại gian hàng dịp lễ","en":"Redecorate storefront for campaign"},"specialty":"image","tags":["public_post"],"defaultPriority":"high","durationMinutes":[35,60],"platformKeys":["shopee","lazada"],"needsHelpFrom":[],"carries":"tablet"}'::jsonb),
  ('design.size_chart', '{"departmentKey":"design","label":{"vi":"Vẽ bảng size sản phẩm","en":"Draw product size chart"},"specialty":"image","tags":["routine_draft"],"defaultPriority":"low","durationMinutes":[15,25],"platformKeys":["shopee"],"needsHelpFrom":[],"carries":"tablet"}'::jsonb),
  ('design.packaging_label', '{"departmentKey":"design","label":{"vi":"Thiết kế tem dán hộp sản phẩm","en":"Design packaging box label"},"specialty":"image","tags":["cross_department"],"defaultPriority":"normal","durationMinutes":[25,40],"platformKeys":[],"needsHelpFrom":["copywriting"],"carries":"tablet"}'::jsonb),
  ('acc.invoice', '{"departmentKey":"accounting","label":{"vi":"Xuất hoá đơn cho đơn hàng","en":"Issue customer order invoice"},"specialty":"invoicing","tags":["money"],"defaultPriority":"normal","durationMinutes":[8,15],"platformKeys":[],"needsHelpFrom":[],"carries":"document"}'::jsonb),
  ('acc.invoice_batch', '{"departmentKey":"accounting","label":{"vi":"Xuất loạt hoá đơn điện tử trong ngày","en":"Issue daily e-invoice batch"},"specialty":"invoicing","tags":["money"],"defaultPriority":"normal","durationMinutes":[20,35],"platformKeys":[],"needsHelpFrom":[],"carries":"document"}'::jsonb),
  ('acc.reconcile', '{"departmentKey":"accounting","label":{"vi":"Đối soát doanh thu gian hàng","en":"Reconcile monthly shop payouts"},"specialty":"bookkeeping","tags":["money"],"defaultPriority":"high","durationMinutes":[30,50],"platformKeys":["shopee","lazada","tiktok_shop"],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('acc.ledger', '{"departmentKey":"accounting","label":{"vi":"Ghi sổ chi phí tuần này","en":"Record weekly expense ledger"},"specialty":"bookkeeping","tags":["internal_note"],"defaultPriority":"normal","durationMinutes":[20,30],"platformKeys":[],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('acc.vat_return', '{"departmentKey":"accounting","label":{"vi":"Lập tờ khai thuế GTGT quý","en":"Prepare quarterly VAT return"},"specialty":"tax","tags":["tax","legal","irreversible"],"defaultPriority":"urgent","durationMinutes":[45,90],"platformKeys":[],"needsHelpFrom":[],"carries":"document"}'::jsonb),
  ('acc.pit', '{"departmentKey":"accounting","label":{"vi":"Tính thuế thu nhập cá nhân tháng","en":"Calculate monthly PIT"},"specialty":"tax","tags":["money"],"defaultPriority":"high","durationMinutes":[30,50],"platformKeys":[],"needsHelpFrom":[],"carries":"document"}'::jsonb),
  ('acc.revenue_report', '{"departmentKey":"accounting","label":{"vi":"Báo cáo doanh thu tháng","en":"Monthly revenue report"},"specialty":"bookkeeping","tags":["internal_note"],"defaultPriority":"high","durationMinutes":[25,40],"platformKeys":[],"needsHelpFrom":[],"carries":"laptop"}'::jsonb),
  ('acc.supplier_payment', '{"departmentKey":"accounting","label":{"vi":"Đề nghị thanh toán nhà cung cấp","en":"Request supplier payment"},"specialty":"bookkeeping","tags":["money"],"defaultPriority":"high","durationMinutes":[15,25],"platformKeys":[],"needsHelpFrom":[],"carries":"document"}'::jsonb),
  ('acc.refund_payout', '{"departmentKey":"accounting","label":{"vi":"Chi hoàn tiền cho khách hàng","en":"Disburse customer refund payout"},"specialty":"invoicing","tags":["refund","money"],"defaultPriority":"urgent","durationMinutes":[8,15],"platformKeys":[],"needsHelpFrom":[],"carries":"document"}'::jsonb),
  ('sys.hire_over_cap', '{"departmentKey":"cs","label":{"vi":"Đề nghị tuyển thêm nhân viên tạm vượt trần","en":"Request hiring temp staff over cap"},"specialty":"qc","tags":["hire_over_cap"],"defaultPriority":"high","durationMinutes":[5,10],"platformKeys":[],"needsHelpFrom":[],"carries":"document"}'::jsonb),
  ('sys.connect_account', '{"departmentKey":"marketing","label":{"vi":"Kết nối tài khoản nền tảng mới","en":"Connect new platform account"},"specialty":"qc","tags":["new_account","irreversible"],"defaultPriority":"high","durationMinutes":[5,15],"platformKeys":[],"needsHelpFrom":[],"carries":"document"}'::jsonb)
on conflict do nothing;

insert into public.employees (id, name, department_id, role_key, specialties, kind, state, review_mode, model_tier_override, bio, created_at, created_by, archived_at) values
  ('emp_giam_doc', 'Giám đốc', null, 'owner', '{}'::text[], 'core', 'active', 'always', null, '{"vi":"Chủ sở hữu hệ thống, duyệt các quyết định quan trọng nhất.","en":"Company owner, approves top-level decisions."}'::jsonb, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_pho_giam_doc', 'Phó giám đốc', null, 'owner', '{}'::text[], 'core', 'active', 'always', null, '{"vi":"Đồng điều hành và phê duyệt chiến lược cùng Giám đốc.","en":"Co-owner and executive decision maker."}'::jsonb, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_thu', 'Thu', null, 'manager', '{}'::text[], 'core', 'active', 'always', null, '{"vi":"Quản lý điều hành toàn toà nhà, tiếp nhận yêu cầu từ Sếp và điều phối công việc.","en":"Building-wide AI manager receiving Boss requests and dispatching tasks."}'::jsonb, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_ngoc', 'Ngọc', 'dep_cs', 'dept_manager', array['customer_chat', 'review_reply']::text[], 'core', 'active', 'always', null, '{"vi":"Trưởng phòng Chăm sóc khách hàng, trực xử lý các ca khiếu nại khó.","en":"Customer Support department manager handling escalations."}'::jsonb, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_linh', 'Linh', 'dep_cs', 'lead', array['review_reply', 'qc']::text[], 'core', 'active', 'always', null, '{"vi":"Trưởng nhóm CSKH, điều phối bàn kiểm duyệt phản hồi khách.","en":"Customer Support lead coordinating review desk."}'::jsonb, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_an', 'An', 'dep_cs', 'reviewer', array['qc', 'review_reply']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_quan', 'Quân', 'dep_cs', 'reviewer', array['qc', 'customer_chat']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_mai', 'Mai', 'dep_cs', 'worker', array['customer_chat']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_trang', 'Trang', 'dep_cs', 'worker', array['review_reply']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_phuc', 'Phúc', 'dep_cs', 'worker', array['follow_up']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_hai', 'Hải', 'dep_marketing', 'dept_manager', array['promotions', 'ads']::text[], 'core', 'active', 'always', null, '{"vi":"Trưởng phòng Marketing, phụ trách chiến dịch và ngân sách quảng cáo.","en":"Marketing department manager overseeing campaigns and ad spend."}'::jsonb, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_ha', 'Hà', 'dep_marketing', 'lead', array['copywriting', 'social_scheduling']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_khanh', 'Khánh', 'dep_marketing', 'reviewer', array['qc', 'copywriting']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_yen', 'Yến', 'dep_marketing', 'reviewer', array['qc', 'ads']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_duy', 'Duy', 'dep_marketing', 'worker', array['copywriting']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_bao', 'Bảo', 'dep_marketing', 'worker', array['promotions', 'ads']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_thao', 'Thảo', 'dep_marketing', 'worker', array['social_scheduling', 'reporting']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_minh', 'Minh', 'dep_design', 'dept_manager', array['image', 'video']::text[], 'core', 'active', 'always', null, '{"vi":"Trưởng phòng Thiết kế, định hướng hình ảnh thương hiệu cho các gian hàng.","en":"Design department manager leading visual identity across shops."}'::jsonb, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_vy', 'Vy', 'dep_design', 'lead', array['image', 'product_photo']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_tu', 'Tú', 'dep_design', 'reviewer', array['qc', 'image']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_long', 'Long', 'dep_design', 'worker', array['image']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_nhi', 'Nhi', 'dep_design', 'worker', array['video']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_tam', 'Tâm', 'dep_design', 'worker', array['product_photo']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_lan', 'Lan', 'dep_accounting', 'dept_manager', array['tax', 'bookkeeping']::text[], 'core', 'active', 'always', null, '{"vi":"Trưởng phòng Kế toán, kiểm soát chứng từ, đối soát và thuế.","en":"Accounting department manager overseeing reconciliation and tax."}'::jsonb, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_hung', 'Hùng', 'dep_accounting', 'lead', array['invoicing', 'bookkeeping']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_oanh', 'Oanh', 'dep_accounting', 'reviewer', array['qc', 'invoicing']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_viet', 'Việt', 'dep_accounting', 'worker', array['invoicing']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null),
  ('emp_hanh', 'Hạnh', 'dep_accounting', 'worker', array['bookkeeping', 'tax']::text[], 'core', 'active', 'always', null, null, '2026-11-10T00:00:00Z'::timestamptz, 'seed', null)
on conflict do nothing;

insert into public.approval_rules (id, "order", enabled, label, "when", level) values
  ('boss_sensitive', 1, true, '{"vi":"Việc nhạy cảm cần Sếp duyệt","en":"Sensitive actions require Boss approval"}'::jsonb, '{"tagsAny":["tax","legal","irreversible","new_account","hire_over_cap"]}'::jsonb, 'boss'::public.approval_level),
  ('boss_big_amount', 2, true, '{"vi":"Khoản chi từ 3.000.000đ trở lên","en":"Transactions of 3,000,000 VND or more"}'::jsonb, '{"amountVndGte":3000000}'::jsonb, 'boss'::public.approval_level),
  ('dm_public', 3, true, '{"vi":"Bài đăng công khai & chiến dịch","en":"Public posts and campaigns"}'::jsonb, '{"tagsAny":["public_post","campaign"]}'::jsonb, 'dept_manager'::public.approval_level),
  ('dm_cross_dept', 4, true, '{"vi":"Phối hợp liên phòng ban","en":"Cross-department collaboration"}'::jsonb, '{"crossDepartment":true}'::jsonb, 'dept_manager'::public.approval_level),
  ('reviewer_routine', 5, true, '{"vi":"Việc thường ngày & bản nháp mẫu","en":"Routine drafts and FAQ replies"}'::jsonb, '{"tagsAny":["routine_draft","faq_reply","internal_note"]}'::jsonb, 'reviewer'::public.approval_level)
on conflict do nothing;

insert into public.policy (id, doc) values
  (1, '{"staffing":{"tempCap":10,"dropOrder":"longest_idle_first","minIdleMinutesBeforeDrop":60},"help":{"timeoutMinutes":30,"maxRounds":2,"escalateTo":"dept_manager"},"priority":{"weights":{"urgent":400,"high":300,"normal":200,"low":100},"agingPointsPerHour":20,"agingCapPoints":150},"approvals":{"defaultLevel":"dept_manager","chain":"every_level_up_to_required","questionSeatThreshold":3},"work":{"oneActiveTaskPerWorker":true,"maxRetries":2,"maxQuestionsPerTask":1},"calendar":{"timezone":"Asia/Ho_Chi_Minh","workStart":"08:00","workEnd":"17:30","lunch":["12:00","13:00"]}}'::jsonb)
on conflict do nothing;
