// Frozen Library (P11 §3.2, D2): a tiny fixture so the page keeps compiling without the old
// mock store. Real media replaces this when the worker service writes artifacts
// (docs/plan/after-this-phase.md §5). Names here are sample data, not UI chrome.
import type { DemoArtifact } from '@/lib/drive'

export interface DemoShop {
  id: number
  name: string
  platformLabel: string
}

export interface DemoPerson {
  key: string
  name: string
}

export interface DemoWorkflow {
  key: string
  name: string
}

export interface LibraryArtifact extends DemoArtifact {
  task_id: number
  shop_id: number
  workflow_key: string
  owner_key: string
  drive_file_id: string
  drive_url: string
  mime: string
  size_bytes: number
  duration_sec: number | null
  created_at: string
}

export const demoShops: DemoShop[] = [
  { id: 1, name: 'Nhà Bếp Xinh', platformLabel: 'Shopee' },
  { id: 2, name: 'Bếp Việt Store', platformLabel: 'Lazada' },
]

export const demoPeople: DemoPerson[] = [
  { key: 'emp_linh', name: 'Linh' },
  { key: 'emp_ha', name: 'Hà' },
]

export const demoWorkflows: DemoWorkflow[] = [
  { key: 'banner_set', name: 'Bộ banner / hình ảnh' },
  { key: 'short_video', name: 'Video ngắn sản phẩm' },
  { key: 'social_post', name: 'Bài đăng Zalo / Facebook' },
]

function driveUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/view`
}

export const demoArtifacts: LibraryArtifact[] = [
  {
    id: 1,
    task_id: 101,
    shop_id: 1,
    workflow_key: 'banner_set',
    owner_key: 'emp_linh',
    type: 'image',
    title: 'Banner Tết · Nồi chiên không dầu',
    drive_file_id: 'demo-1',
    drive_url: driveUrl('demo-1'),
    mime: 'image/png',
    size_bytes: 412_000,
    width: 1200,
    height: 628,
    duration_sec: null,
    created_at: '2026-11-20T02:15:00Z',
  },
  {
    id: 2,
    task_id: 102,
    shop_id: 2,
    workflow_key: 'short_video',
    owner_key: 'emp_ha',
    type: 'video',
    title: 'Video 15 giây · Bộ dao Nhật',
    drive_file_id: 'demo-2',
    drive_url: driveUrl('demo-2'),
    mime: 'video/mp4',
    size_bytes: 6_800_000,
    width: 1080,
    height: 1920,
    duration_sec: 15,
    created_at: '2026-11-21T07:40:00Z',
  },
  {
    id: 3,
    task_id: 103,
    shop_id: 1,
    workflow_key: 'social_post',
    owner_key: 'emp_linh',
    type: 'text',
    title: 'Bài đăng Zalo · Khuyến mãi cuối tuần',
    drive_file_id: 'demo-3',
    drive_url: driveUrl('demo-3'),
    mime: 'text/plain',
    size_bytes: 2_100,
    width: null,
    height: null,
    duration_sec: null,
    created_at: '2026-11-22T01:05:00Z',
  },
]

export const demoLookups = {
  shop: new Map(demoShops.map((s) => [s.id, s])),
  employee: new Map(demoPeople.map((p) => [p.key, p])),
  workflow: new Map(demoWorkflows.map((w) => [w.key, w])),
}
