export const SHOPS_BY_PLATFORM_VI: Record<string, readonly string[]> = {
  shopee: ['Shopee 1', 'Shopee 2', 'Shopee 3'],
  lazada: ['Lazada 1'],
  tiktok_shop: ['TikTok Shop 1'],
  facebook: ['Fanpage ShopHQ Việt Nam', 'Cộng đồng Góc Làm Việc Đẹp'],
  instagram: ['Instagram @shophq.vn'],
  zalo_oa: ['Zalo OA ShopHQ Care'],
  zalo: ['Zalo CSKH ShopHQ'],
  tiktok: ['Kênh TikTok @shophq.official'],
  tiktok_business: ['TikTok Ads ShopHQ'],
}

export const ALL_SHOPS_VI: readonly string[] = [
  'Shopee 1',
  'Shopee 2',
  'Shopee 3',
  'Lazada 1',
  'TikTok Shop 1',
]

export const PLATFORM_LABELS_VI: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  zalo_oa: 'Zalo OA',
  zalo: 'Zalo',
  tiktok: 'TikTok',
  tiktok_business: 'TikTok Business',
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiktok_shop: 'TikTok Shop',
}

export const DEPARTMENT_LABELS_VI: Record<string, string> = {
  dep_cs: 'Phòng Chăm sóc khách hàng',
  dep_marketing: 'Phòng Marketing',
  dep_design: 'Phòng Thiết kế',
  dep_accounting: 'Phòng Kế toán',
  cs: 'Phòng Chăm sóc khách hàng',
  marketing: 'Phòng Marketing',
  design: 'Phòng Thiết kế',
  accounting: 'Phòng Kế toán',
}

export const CAMPAIGN_EVENTS_VI: readonly string[] = [
  'Siêu Sale 11.11',
  'Siêu Sale 12.12',
  'Flash Sale Giữa Tháng',
  'Tuần Lễ Thương Hiệu',
  'Mùa Tựu Trường',
  'Tết Đoàn Viên',
  'Ngày Đôi Cuối Tuần',
  'Đại Tiệc Sinh Nhật Gian Hàng',
] as const
