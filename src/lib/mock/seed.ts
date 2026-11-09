// Demo data for the MVP (no Supabase yet). Mirrors what migrations + n8n would produce.
// Customer-facing content (reviews, drafts) is data, not UI text, so it lives here, not in i18n.
import type { Tables, OwnerKey, StepKind } from '@/lib/database.types'

const now = Date.now()
export const ago = (min: number) => new Date(now - min * 60_000).toISOString()

export const shops: Tables<'shops'>[] = [
  { id: 1, name: 'Shopee 1', platform: 'shopee', handle: 'shopee1', reply_rules: null, active: true },
  { id: 2, name: 'Shopee 2', platform: 'shopee', handle: 'shopee2', reply_rules: null, active: true },
  { id: 3, name: 'Shopee 3', platform: 'shopee', handle: 'shopee3', reply_rules: null, active: true },
  { id: 4, name: 'Lazada 1', platform: 'lazada', handle: 'lazada1', reply_rules: null, active: true },
  { id: 5, name: 'TikTok Shop 1', platform: 'tiktok_shop', handle: 'tiktok1', reply_rules: null, active: true },
]

export const employees: Tables<'employees'>[] = [
  { key: 'thu', name: 'Thu', role_key: 'receptionist', color: 'thu', scope: ['telegram', 'standup', 'forward_approvals'], status: 'idle', current_task_id: null, current_step_key: null, autonomy: 'ask_first', status_since: ago(35) },
  { key: 'mai', name: 'Mai', role_key: 'chat_support', color: 'mai', scope: ['chat_all_shops', 'order_status', 'escalate_money'], status: 'working', current_task_id: 144, current_step_key: 'draft_reply', autonomy: 'ask_first', status_since: ago(2) },
  { key: 'linh', name: 'Linh', role_key: 'review_replier', color: 'linh', scope: ['reviews_all_shops', 'apology_low_stars', 'varied_thanks'], status: 'working', current_task_id: 142, current_step_key: 'draft_replies', autonomy: 'ask_first', status_since: ago(3) },
  { key: 'ha', name: 'Hà', role_key: 'content_writer', color: 'ha', scope: ['zalo_facebook_posts', 'video_scripts', 'captions'], status: 'working', current_task_id: 143, current_step_key: 'write_post', autonomy: 'ask_first', status_since: ago(6) },
  { key: 'vy', name: 'Vy', role_key: 'visual_producer', color: 'vy', scope: ['images', 'short_videos', 'banner_sets'], status: 'waiting_boss', current_task_id: 139, current_step_key: 'approval', autonomy: 'ask_first', status_since: ago(20) },
  { key: 'an', name: 'An', role_key: 'reviewer', color: 'an', scope: ['qc_every_workflow', 'price_check', 'banned_words'], status: 'idle', current_task_id: null, current_step_key: null, autonomy: 'ask_first', status_since: ago(9) },
  { key: 'bao', name: 'Bảo', role_key: 'promo_planner', color: 'bao', scope: ['promo_rules', 'choose_products', 'floor_price'], status: 'blocked', current_task_id: 140, current_step_key: 'choose_products', autonomy: 'ask_first', status_since: ago(41) },
]

export const workflows: Tables<'workflows'>[] = [
  { key: 'review_reply', name: 'Reply to reviews', icon: 'star', description: null, enabled: true, n8n_workflow_ref: 'wf_review_reply' },
  { key: 'chat_reply', name: 'Answer a customer chat', icon: 'message-circle', description: null, enabled: true, n8n_workflow_ref: 'wf_chat_reply' },
  { key: 'social_post', name: 'Zalo / Facebook post', icon: 'pen-line', description: null, enabled: true, n8n_workflow_ref: 'wf_social_post' },
  { key: 'short_video', name: 'Short product video', icon: 'clapperboard', description: null, enabled: true, n8n_workflow_ref: 'wf_short_video' },
  { key: 'banner_set', name: 'Banner / image set', icon: 'image', description: null, enabled: true, n8n_workflow_ref: 'wf_banner_set' },
  // Shown as "Chưa kết nối" to demo a workflow n8n hasn't linked yet.
  { key: 'promo_join', name: 'Join a promotion', icon: 'tag', description: null, enabled: false, n8n_workflow_ref: null },
]

type StepDef = [key: string, label: string, owner: OwnerKey, kind: StepKind, risky?: boolean, allowed?: OwnerKey[]]
const defs: Record<string, StepDef[]> = {
  review_reply: [
    ['collect_reviews', 'Collect reviews', 'linh', 'work'],
    ['draft_replies', 'Draft replies', 'linh', 'work', false, ['linh', 'ha']],
    ['qc', 'Quality check', 'an', 'qc'],
    ['approval', 'Your approval', 'boss', 'approval'],
    ['post_replies', 'Post replies', 'linh', 'work', true],
  ],
  chat_reply: [
    ['read_message', 'Read message', 'mai', 'work'],
    ['draft_reply', 'Draft reply', 'mai', 'work'],
    ['qc', 'Quality check', 'an', 'qc'],
    ['approval', 'Your approval', 'boss', 'approval'],
    ['send_reply', 'Send reply', 'mai', 'work', true],
  ],
  social_post: [
    ['write_post', 'Write post', 'ha', 'work', false, ['ha', 'linh']],
    ['create_image', 'Create image', 'vy', 'work'],
    ['qc', 'Quality check', 'an', 'qc'],
    ['approval', 'Your approval', 'boss', 'approval'],
    ['publish', 'Publish', 'ha', 'work', true],
  ],
  short_video: [
    ['write_script', 'Write script', 'ha', 'work'],
    ['generate_video', 'Generate video', 'vy', 'work'],
    ['captions_music', 'Captions & music', 'vy', 'work'],
    ['qc', 'Quality check', 'an', 'qc'],
    ['approval', 'Your approval', 'boss', 'approval'],
    ['upload_to_shop', 'Upload to shop', 'vy', 'work', true],
  ],
  banner_set: [
    ['read_brief', 'Read brief', 'vy', 'work'],
    ['generate_images', 'Generate images', 'vy', 'work'],
    ['resize', 'Resize per platform', 'vy', 'work'],
    ['qc', 'Quality check', 'an', 'qc'],
    ['approval', 'Your approval', 'boss', 'approval'],
    ['replace_on_shop', 'Replace on shop', 'vy', 'work', true],
  ],
  promo_join: [
    ['read_rules', 'Read rules', 'bao', 'work'],
    ['choose_products', 'Choose products & prices', 'bao', 'work'],
    ['price_check', 'Price check', 'an', 'qc'],
    ['approval', 'Your approval', 'boss', 'approval'],
    ['submit_entry', 'Submit entry', 'bao', 'work', true],
  ],
}

export const workflowSteps: Tables<'workflow_steps'>[] = Object.entries(defs).flatMap(([wf, steps]) =>
  steps.map(([key, label, owner, kind, risky = false, allowed], i) => ({
    workflow_key: wf,
    position: i + 1,
    key,
    label,
    owner_key: owner,
    kind,
    risky,
    timeout_minutes: kind === 'approval' ? 1440 : 15,
    allowed_owner_keys: allowed ?? [owner],
  })),
)

// ---------- Tasks ----------
type TaskSeed = Omit<Tables<'tasks'>, 'finished_at' | 'blocked_reason'> & { blocked_reason?: string | null; finished_at?: string | null; doneThrough: number; stepSummaries?: Record<string, string> }

const taskSeeds: TaskSeed[] = [
  { id: 142, workflow_key: 'review_reply', shop_id: 1, brief: 'Trả lời đánh giá mới trong tuần', require_approval: true, status: 'running', source: 'telegram', current_step_key: 'draft_replies', created_at: ago(12), updated_at: ago(3), doneThrough: 1, stepSummaries: { collect_reviews: 'Tìm thấy 12 đánh giá mới' } },
  { id: 143, workflow_key: 'social_post', shop_id: 2, brief: 'Bài đăng Zalo giới thiệu bộ nồi inox mới', require_approval: true, status: 'running', source: 'dashboard', current_step_key: 'write_post', created_at: ago(7), updated_at: ago(6), doneThrough: 0 },
  { id: 144, workflow_key: 'chat_reply', shop_id: 1, brief: 'Khách hỏi tình trạng đơn #SP88213', require_approval: false, status: 'running', source: 'schedule', current_step_key: 'draft_reply', created_at: ago(4), updated_at: ago(2), doneThrough: 1, stepSummaries: { read_message: 'Khách hỏi khi nào nhận được hàng' } },
  { id: 141, workflow_key: 'review_reply', shop_id: 4, brief: 'Đánh giá mới Lazada', require_approval: true, status: 'waiting_boss', source: 'schedule', current_step_key: 'approval', created_at: ago(30), updated_at: ago(4), doneThrough: 3, stepSummaries: { collect_reviews: 'Tìm thấy 4 đánh giá mới', draft_replies: 'Đã soạn 4 câu trả lời', qc: 'Đạt: giọng văn đúng quy tắc shop' } },
  { id: 139, workflow_key: 'banner_set', shop_id: 3, brief: 'Bộ banner sale 11.11', require_approval: true, status: 'waiting_boss', source: 'telegram', current_step_key: 'approval', created_at: ago(55), updated_at: ago(20), doneThrough: 4, stepSummaries: { read_brief: 'Chủ đề: Sale 11.11, tông đỏ cam', generate_images: 'Đã tạo 3 mẫu', resize: '3 kích thước: 1200×628, 1080×1080, 750×1334', qc: 'Đạt: đúng kích thước từng sàn' } },
  { id: 140, workflow_key: 'promo_join', shop_id: 5, brief: 'Đăng ký Flash Sale 12.12', require_approval: true, status: 'blocked', source: 'telegram', current_step_key: 'choose_products', blocked_reason: 'Thiếu giá sàn cho SKU X12 (Chảo chống dính 28cm)', created_at: ago(50), updated_at: ago(41), doneThrough: 1, stepSummaries: { read_rules: 'Giảm tối thiểu 15%, hạn đăng ký 01/12' } },
  { id: 145, workflow_key: 'short_video', shop_id: 2, brief: 'Video ngắn sản phẩm mới', require_approval: true, status: 'waiting_boss', source: 'telegram', current_step_key: 'write_script', created_at: ago(15), updated_at: ago(14), doneThrough: 0 },
  { id: 146, workflow_key: 'banner_set', shop_id: 1, brief: 'Banner trang chủ tháng 12', require_approval: true, status: 'queued', source: 'dashboard', current_step_key: null, created_at: ago(1), updated_at: ago(1), doneThrough: 0 },
  // Done today
  { id: 138, workflow_key: 'review_reply', shop_id: 2, brief: null, require_approval: true, status: 'done', source: 'schedule', current_step_key: null, created_at: ago(95), updated_at: ago(70), finished_at: ago(70), doneThrough: 5 },
  { id: 137, workflow_key: 'banner_set', shop_id: 2, brief: 'Banner bộ dao Nhật', require_approval: true, status: 'done', source: 'telegram', current_step_key: null, created_at: ago(180), updated_at: ago(110), finished_at: ago(110), doneThrough: 6 },
  { id: 136, workflow_key: 'chat_reply', shop_id: 3, brief: null, require_approval: false, status: 'done', source: 'schedule', current_step_key: null, created_at: ago(200), updated_at: ago(190), finished_at: ago(190), doneThrough: 5 },
  { id: 135, workflow_key: 'social_post', shop_id: 1, brief: 'Bài Facebook khuyến mãi cuối tuần', require_approval: true, status: 'done', source: 'dashboard', current_step_key: null, created_at: ago(260), updated_at: ago(220), finished_at: ago(220), doneThrough: 5 },
  { id: 134, workflow_key: 'short_video', shop_id: 5, brief: 'Video TikTok máy xay sinh tố', require_approval: true, status: 'done', source: 'telegram', current_step_key: null, created_at: ago(330), updated_at: ago(280), finished_at: ago(280), doneThrough: 6 },
  { id: 133, workflow_key: 'chat_reply', shop_id: 4, brief: null, require_approval: false, status: 'failed', source: 'schedule', current_step_key: null, blocked_reason: 'Không tìm thấy mã đơn hàng', created_at: ago(400), updated_at: ago(380), finished_at: ago(380), doneThrough: 1 },
  { id: 132, workflow_key: 'review_reply', shop_id: 3, brief: null, require_approval: true, status: 'cancelled', source: 'schedule', current_step_key: null, created_at: ago(1500), updated_at: ago(1440), finished_at: ago(1440), doneThrough: 3 },
]

export const tasks: Tables<'tasks'>[] = taskSeeds.map((t) => ({
  id: t.id,
  workflow_key: t.workflow_key,
  shop_id: t.shop_id,
  brief: t.brief,
  require_approval: t.require_approval,
  status: t.status,
  source: t.source,
  current_step_key: t.current_step_key,
  blocked_reason: t.blocked_reason ?? null,
  created_at: t.created_at,
  updated_at: t.updated_at,
  finished_at: t.finished_at ?? null,
}))

let stepId = 1
export const taskSteps: Tables<'task_steps'>[] = taskSeeds.flatMap((t) => {
  const steps = workflowSteps.filter((s) => s.workflow_key === t.workflow_key)
  const start = Date.parse(t.created_at)
  const end = Date.parse(t.updated_at)
  const slice = (end - start) / Math.max(1, steps.length)
  return steps.map((s, i) => {
    const isDone = i < t.doneThrough
    const isCurrent = s.key === t.current_step_key
    let status: Tables<'task_steps'>['status'] = 'pending'
    if (isDone) status = s.kind === 'approval' && !t.require_approval ? 'skipped' : 'done'
    else if (isCurrent) status = t.status === 'blocked' ? 'failed' : t.status === 'waiting_boss' && s.kind !== 'approval' ? 'pending' : 'running'
    else if (t.status === 'failed' && i === t.doneThrough) status = 'failed'
    const startedAt = new Date(start + slice * i).toISOString()
    return {
      id: stepId++,
      task_id: t.id,
      step_key: s.key,
      position: s.position,
      owner_key: s.owner_key,
      status,
      summary: t.stepSummaries?.[s.key] ?? null,
      output: null,
      started_at: status === 'pending' ? null : startedAt,
      finished_at: isDone ? new Date(start + slice * (i + 1)).toISOString() : null,
      error: status === 'failed' ? t.blocked_reason ?? null : null,
      attempt: status === 'failed' ? 3 : 1,
    }
  })
})

// ---------- Approval payloads (see src/lib/payloads.ts for the shapes) ----------
export const approvals: Tables<'approvals'>[] = [
  {
    id: 51,
    task_id: 141,
    step_key: 'approval',
    kind: 'approval',
    title: 'Duyệt 4 câu trả lời đánh giá',
    status: 'open',
    resolved_via: null,
    resolved_at: null,
    note: null,
    created_at: ago(4),
    payload: {
      type: 'review_replies',
      prepared_by: 'linh',
      checked_by: 'an',
      items: [
        { review_id: 'LZ-9912', stars: 1, customer: 'Ngọc Anh', product: 'Bình giữ nhiệt 500ml', text: 'Giao hàng chậm quá, 6 ngày mới nhận được. Bình thì ổn.', draft: 'Dạ shop xin lỗi chị Ngọc Anh vì đơn hàng đến chậm ạ. Shop đã báo bên vận chuyển kiểm tra tuyến giao, và gửi tặng chị mã giảm 20k cho lần mua sau. Cảm ơn chị đã kiên nhẫn chờ shop ạ!' },
        { review_id: 'LZ-9915', stars: 5, customer: 'Minh Tuấn', product: 'Bộ dao Nhật 5 món', text: 'Dao sắc, đóng gói cẩn thận. Sẽ ủng hộ tiếp.', draft: 'Cảm ơn anh Tuấn đã tin chọn bộ dao của shop! Chúc anh nấu những bữa thật ngon cùng gia đình ạ.' },
        { review_id: 'LZ-9920', stars: 4, customer: 'Thu Hà', product: 'Chảo chống dính 28cm', text: 'Chảo đẹp, nhưng tay cầm hơi nóng khi nấu lâu.', draft: 'Dạ cảm ơn chị Hà đã góp ý ạ. Khi nấu lâu chị có thể dùng lửa vừa để tay cầm đỡ nóng hơn. Shop sẽ chuyển góp ý của chị tới nhà sản xuất ạ!' },
        { review_id: 'LZ-9921', stars: 5, customer: 'Hoàng Long', product: 'Bình giữ nhiệt 500ml', text: 'Giữ nóng cả ngày, rất đáng tiền.', draft: 'Shop vui quá khi bình giữ nhiệt làm anh Long hài lòng! Hẹn gặp lại anh ở đơn tiếp theo nhé ạ.' },
      ],
    },
  },
  {
    id: 50,
    task_id: 139,
    step_key: 'approval',
    kind: 'approval',
    title: 'Duyệt bộ banner Sale 11.11',
    status: 'open',
    resolved_via: null,
    resolved_at: null,
    note: null,
    created_at: ago(20),
    payload: { type: 'images', prepared_by: 'vy', checked_by: 'an', artifact_ids: [901, 902, 903] },
  },
  {
    id: 52,
    task_id: 145,
    step_key: 'write_script',
    kind: 'question',
    title: 'Video này dành cho sản phẩm nào?',
    status: 'open',
    resolved_via: null,
    resolved_at: null,
    note: null,
    created_at: ago(14),
    payload: { type: 'question', asked_by: 'ha', question: 'Yêu cầu chỉ ghi "sản phẩm mới". Anh/chị muốn làm video cho sản phẩm nào ạ?', options: ['Bộ nồi inox 5 món', 'Máy xay sinh tố mini', 'Chảo chống dính 28cm'] },
  },
  {
    id: 49,
    task_id: 137,
    step_key: 'approval',
    kind: 'approval',
    title: 'Duyệt banner bộ dao Nhật',
    status: 'approved',
    resolved_via: 'telegram',
    resolved_at: ago(115),
    note: null,
    created_at: ago(130),
    payload: { type: 'images', prepared_by: 'vy', checked_by: 'an', artifact_ids: [904] },
  },
]

// ---------- Artifacts (fake Drive IDs; previews are generated placeholders in the MVP) ----------
const art = (id: number, task_id: number, shop_id: number, workflow_key: string, owner_key: Tables<'artifacts'>['owner_key'], type: Tables<'artifacts'>['type'], title: string, minutesAgo: number, extra: Partial<Tables<'artifacts'>> = {}): Tables<'artifacts'> => ({
  id,
  task_id,
  shop_id,
  workflow_key,
  owner_key,
  type,
  title,
  drive_file_id: `demo-${id}`,
  drive_url: `https://drive.google.com/file/d/demo-${id}/view`,
  drive_folder_id: null,
  mime: type === 'image' ? 'image/png' : type === 'video' ? 'video/mp4' : 'text/markdown',
  size_bytes: type === 'video' ? 18_400_000 : type === 'image' ? 820_000 : 3_200,
  width: null,
  height: null,
  duration_sec: null,
  provider: type === 'text' ? null : 'demo',
  created_at: ago(minutesAgo),
  ...extra,
})

export const artifacts: Tables<'artifacts'>[] = [
  art(901, 139, 3, 'banner_set', 'vy', 'image', 'Sale 11.11 · 1200×628', 22, { width: 1200, height: 628 }),
  art(902, 139, 3, 'banner_set', 'vy', 'image', 'Sale 11.11 · 1080×1080', 22, { width: 1080, height: 1080 }),
  art(903, 139, 3, 'banner_set', 'vy', 'image', 'Sale 11.11 · 750×1334', 21, { width: 750, height: 1334 }),
  art(904, 137, 2, 'banner_set', 'vy', 'image', 'Bộ dao Nhật · 1200×628', 120, { width: 1200, height: 628 }),
  art(905, 135, 1, 'social_post', 'vy', 'image', 'Khuyến mãi cuối tuần', 230, { width: 1080, height: 1080 }),
  art(906, 135, 1, 'social_post', 'ha', 'text', 'Bài Facebook khuyến mãi cuối tuần.md', 235),
  art(907, 134, 5, 'short_video', 'vy', 'video', 'Máy xay sinh tố · TikTok', 285, { width: 1080, height: 1920, duration_sec: 28 }),
  art(908, 134, 5, 'short_video', 'ha', 'text', 'Kịch bản máy xay sinh tố.md', 310),
  art(909, 137, 2, 'banner_set', 'vy', 'image', 'Bộ dao Nhật · 1080×1080', 119, { width: 1080, height: 1080 }),
]

// ---------- Events (newest last; the store sorts) ----------
let evId = 1
const ev = (minutesAgo: number, task_id: number | null, actor: string, type: string, message: string): Tables<'events'> => ({ id: evId++, at: ago(minutesAgo), task_id, actor, type, message, data: null })

export const events: Tables<'events'>[] = [
  ev(1440, 132, 'boss', 'task_cancelled', 'Đã huỷ công việc #132'),
  ev(380, 133, 'mai', 'step_failed', 'Không tìm thấy mã đơn hàng (#133)'),
  ev(280, 134, 'vy', 'task_done', 'Đã đăng video lên TikTok Shop 1 (#134)'),
  ev(220, 135, 'ha', 'task_done', 'Đã đăng bài Facebook (#135)'),
  ev(190, 136, 'mai', 'task_done', 'Đã trả lời khách (#136)'),
  ev(115, 137, 'boss', 'approved', 'Đã duyệt bộ banner #137 qua Telegram'),
  ev(110, 137, 'vy', 'task_done', 'Đã thay banner trên Shopee 2 (#137)'),
  ev(70, 138, 'linh', 'task_done', 'Đã đăng 9 câu trả lời đánh giá (#138)'),
  ev(55, 139, 'thu', 'task_created', 'Đã nhận việc "Bộ banner sale 11.11" từ Telegram (#139)'),
  ev(41, 140, 'bao', 'blocked', 'Thiếu giá sàn cho SKU X12 (#140)'),
  ev(20, 139, 'an', 'step_done', 'Đã kiểm tra bộ banner: đạt (#139)'),
  ev(14, 145, 'ha', 'question', 'Hỏi bạn: video dành cho sản phẩm nào? (#145)'),
  ev(12, 142, 'thu', 'task_created', 'Đã nhận việc "Trả lời đánh giá mới" từ Telegram (#142)'),
  ev(7, 143, 'ha', 'step_started', 'Bắt đầu viết bài Zalo (#143)'),
  ev(5, 141, 'an', 'step_done', 'Đã kiểm tra 4 câu trả lời: đạt (#141)'),
  ev(4, 141, 'linh', 'approval_requested', 'Chờ bạn duyệt 4 câu trả lời (#141)'),
  ev(3, 142, 'linh', 'step_done', 'Xong bước "Thu thập đánh giá": 12 đánh giá mới (#142)'),
  ev(2, 144, 'mai', 'step_started', 'Đang soạn câu trả lời cho khách (#144)'),
  ev(1, 146, 'boss', 'task_created', 'Đã giao việc "Banner trang chủ tháng 12" (#146)'),
]

export const systemStatus: Tables<'system_status'> = { id: 1, n8n_heartbeat_at: ago(0.5), n8n_version: '1.92.0', note: null }
