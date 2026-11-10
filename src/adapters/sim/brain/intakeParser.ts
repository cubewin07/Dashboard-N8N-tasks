import type { Priority } from '@/domain/work'

export interface ParsedIntakeResult {
  typeKeys: string[]
  priority?: Priority
  shop?: string
  platformKey?: string
  event?: string
  matched: boolean
}

export function stripDiacritics(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

interface KeywordRule {
  patterns: readonly RegExp[]
  typeKey: string
}

const KEYWORD_RULES: readonly KeywordRule[] = [
  {
    patterns: [
      /\bbanner\b/,
      /\bposter\b/,
      /\bkhung anh\b/,
      /\bthiet ke banner\b/,
    ],
    typeKey: 'design.banner_set',
  },
  {
    patterns: [/\btrang tri\b/, /\bdecor\b/, /\bgiao dien gian hang\b/],
    typeKey: 'design.shop_decor',
  },
  {
    patterns: [/\banh bia\b/, /\bthumbnail\b/],
    typeKey: 'design.thumbnail',
  },
  {
    patterns: [/\bchinh anh\b/, /\bchup anh\b/, /\banh san pham\b/],
    typeKey: 'design.product_photos',
  },
  {
    patterns: [/\bbang size\b/, /\bsize chart\b/],
    typeKey: 'design.size_chart',
  },
  {
    patterns: [/\btem dan\b/, /\bbao bi\b/, /\bnhan hop\b/],
    typeKey: 'design.packaging_label',
  },
  {
    patterns: [/\banh minh hoa\b/, /\banh bai dang\b/],
    typeKey: 'design.post_image',
  },
  {
    patterns: [/\bphu de\b/, /\bsubtitle\b/, /\bloi thoai video\b/],
    typeKey: 'design.video_subtitle',
  },
  {
    patterns: [/\bdung video\b/, /\bquay video\b/, /\bvideo ngan\b/, /\bclip\b/],
    typeKey: 'design.short_video',
  },
  {
    patterns: [/\bchi hoan tien\b/, /\bgiai ngan hoan tien\b/],
    typeKey: 'acc.refund_payout',
  },
  {
    patterns: [/\bhoan tien\b/, /\brefund\b/, /\bdoi tra tien\b/],
    typeKey: 'cs.refund_request',
  },
  {
    patterns: [/\bdoi san pham\b/, /\bdoi hang\b/, /\bloi san pham\b/],
    typeKey: 'cs.exchange',
  },
  {
    patterns: [/\b1 sao\b/, /\bdanh gia xau\b/, /\bkhieu nai\b/],
    typeKey: 'cs.review_negative',
  },
  {
    patterns: [/\b5 sao\b/, /\bdanh gia tot\b/, /\breview\b/, /\bdanh gia\b/],
    typeKey: 'cs.review_positive',
  },
  {
    patterns: [/\bgiao cham\b/, /\bkiem tra don\b/, /\bvan don\b/],
    typeKey: 'cs.chat_order_status',
  },
  {
    patterns: [/\btu van size\b/, /\bhoi size\b/],
    typeKey: 'cs.chat_size',
  },
  {
    patterns: [/\bhoi tham\b/, /\bcham soc sau ban\b/, /\bfollow up\b/],
    typeKey: 'cs.follow_up',
  },
  {
    patterns: [/\btao don tu tin nhan\b/, /\blen don zalo\b/],
    typeKey: 'cs.order_from_chat',
  },
  {
    patterns: [/\bca dem\b/, /\btin nhan dem\b/],
    typeKey: 'cs.night_summary',
  },
  {
    patterns: [/\btin nhan zalo\b/, /\bhộp thu zalo\b/, /\binbox zalo\b/],
    typeKey: 'cs.zalo_inbox',
  },
  {
    patterns: [/\bbinh luan\b/, /\bcomment\b/],
    typeKey: 'cs.fb_comment',
  },
  {
    patterns: [/\btin nhan khach\b/, /\bfaq\b/, /\btu van khach\b/],
    typeKey: 'cs.chat_faq',
  },
  {
    patterns: [/\bthue gtgt\b/, /\bvat\b/, /\bto khai thue\b/, /\bthue quy\b/],
    typeKey: 'acc.vat_return',
  },
  {
    patterns: [/\bthue thu nhap\b/, /\btncn\b/, /\bpit\b/, /\bthue\b/],
    typeKey: 'acc.pit',
  },
  {
    patterns: [/\bloat hoa don\b/, /\bhoa don trong ngay\b/],
    typeKey: 'acc.invoice_batch',
  },
  {
    patterns: [/\bhoa don\b/, /\binvoice\b/, /\bxuat hoa don\b/],
    typeKey: 'acc.invoice',
  },
  {
    patterns: [/\bdoi soat\b/, /\breconcile\b/, /\bthanh toan san\b/],
    typeKey: 'acc.reconcile',
  },
  {
    patterns: [/\bnha cung cap\b/, /\bcong no\b/, /\bthanh toan ncc\b/],
    typeKey: 'acc.supplier_payment',
  },
  {
    patterns: [/\bghi so\b/, /\bso chi phi\b/, /\bledger\b/],
    typeKey: 'acc.ledger',
  },
  {
    patterns: [/\bbao cao doanh thu\b/, /\bdoanh thu thang\b/],
    typeKey: 'acc.revenue_report',
  },
  {
    patterns: [/\bflash sale\b/, /\bdang ky sale\b/],
    typeKey: 'mkt.promo_join',
  },
  {
    patterns: [/\bvoucher\b/, /\bma giam gia\b/, /\bkhuyen mai\b/],
    typeKey: 'mkt.voucher',
  },
  {
    patterns: [/\bngan sach quang cao\b/, /\bngan sach ads\b/, /\bads budget\b/],
    typeKey: 'mkt.ads_budget',
  },
  {
    patterns: [/\bbao cao quang cao\b/, /\bhieu qua quang cao\b/, /\broas\b/],
    typeKey: 'mkt.ads_report',
  },
  {
    patterns: [/\bke hoach chien dich\b/, /\bchien dich sale\b/],
    typeKey: 'mkt.campaign_plan',
  },
  {
    patterns: [/\blich dang bai\b/, /\blen lich\b/],
    typeKey: 'mkt.schedule_week',
  },
  {
    patterns: [/\bmo ta san pham\b/, /\bviet lai mo ta\b/],
    typeKey: 'mkt.product_desc',
  },
  {
    patterns: [/\bcaption\b/, /\btiktok\b/],
    typeKey: 'mkt.caption_tiktok',
  },
  {
    patterns: [/\bbai zalo\b/, /\bzalo oa\b/],
    typeKey: 'mkt.post_zalo',
  },
  {
    patterns: [/\bbai dang\b/, /\bviet bai\b/, /\bfacebook\b/, /\bfanpage\b/],
    typeKey: 'mkt.post_fb',
  },
  {
    patterns: [/\bbao cao doanh so\b/, /\bbao cao tuan\b/, /\bbao cao\b/],
    typeKey: 'mkt.weekly_report',
  },
  {
    patterns: [/\btuyen them\b/, /\btuyen nhan vien\b/, /\bnhan su tam\b/],
    typeKey: 'sys.hire_over_cap',
  },
  {
    patterns: [/\bket noi tai khoan\b/, /\bthem gian hang\b/],
    typeKey: 'sys.connect_account',
  },
]

export function parseIntakeDetails(text: string): ParsedIntakeResult {
  const norm = stripDiacritics(text)
  const typeKeys: string[] = []

  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((re) => re.test(norm))) {
      if (!typeKeys.includes(rule.typeKey)) {
        typeKeys.push(rule.typeKey)
      }
    }
  }

  let priority: Priority | undefined
  if (/\b(gap|khan|ngay lap tuc|uu tien cao nhat|urgent)\b/.test(norm)) {
    priority = 'urgent'
  } else if (/\b(quan trong|som|uu tien)\b/.test(norm)) {
    priority = 'high'
  }

  let shop: string | undefined
  let platformKey: string | undefined

  if (/\bshopee\s*1\b/.test(norm)) {
    shop = 'Shopee 1'
    platformKey = 'shopee'
  } else if (/\bshopee\s*2\b/.test(norm)) {
    shop = 'Shopee 2'
    platformKey = 'shopee'
  } else if (/\bshopee\s*3\b/.test(norm)) {
    shop = 'Shopee 3'
    platformKey = 'shopee'
  } else if (/\bshopee\b/.test(norm)) {
    shop = 'Shopee 1'
    platformKey = 'shopee'
  } else if (/\blazada\b/.test(norm)) {
    shop = 'Lazada 1'
    platformKey = 'lazada'
  } else if (/\btiktok\s*shop\b/.test(norm)) {
    shop = 'TikTok Shop 1'
    platformKey = 'tiktok_shop'
  } else if (/\btiktok\b/.test(norm)) {
    platformKey = 'tiktok'
  } else if (/\bzalo\b/.test(norm)) {
    platformKey = 'zalo_oa'
  } else if (/\bfacebook\b|\bfanpage\b/.test(norm)) {
    platformKey = 'facebook'
  }

  let event: string | undefined
  if (/\b12\.12\b/.test(norm)) {
    event = 'Siêu Sale 12.12'
  } else if (/\b11\.11\b/.test(norm)) {
    event = 'Siêu Sale 11.11'
  } else if (/\btet\b/.test(norm)) {
    event = 'Tết Đoàn Viên'
  } else if (/\bblack friday\b/.test(norm)) {
    event = 'Black Friday'
  }

  return {
    typeKeys,
    priority,
    shop,
    platformKey,
    event,
    matched: typeKeys.length > 0,
  }
}

export function parse(text: string): string[] {
  return parseIntakeDetails(text).typeKeys
}

export const intakeParser = {
  parse,
  parseIntakeDetails,
  stripDiacritics,
}
