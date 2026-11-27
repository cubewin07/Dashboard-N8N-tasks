import { describe, expect, it } from 'vitest'
import tour from '@/features/office/tour/defaultTour.json'
import { en } from '../en'
import { vi } from '../vi'

// P11-T13 (R11): the copy terms of phase-11 §3.6 hold everywhere, and English is complete.

function leaves(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]]
  if (Array.isArray(node)) return node.flatMap((v, i) => leaves(v, `${path}[${i}]`))
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  }
  return []
}

/** Variants that §3.6 replaces, with the term to use instead. */
const BANNED: { pattern: RegExp; use: string }[] = [
  { pattern: /hàng chờ/i, use: 'Duyệt / Chờ duyệt' },
  { pattern: /nhật ký(?! thay đổi)/i, use: 'Hoạt động ("Nhật ký thay đổi" is the admin audit log)' },
  { pattern: /giám đốc/i, use: 'Sếp' },
  { pattern: /(?<!kiểm )người duyệt/i, use: 'Kiểm duyệt' },
  { pattern: /thời vụ|tạm thời/i, use: 'Nhân viên tạm' },
  { pattern: /giả lập/i, use: 'Mô phỏng' },
  { pattern: /trợ giúp|nhờ giúp/i, use: 'Nhờ hỗ trợ' },
  { pattern: /(?<!@)\bdemo\b/i, use: 'Mô phỏng / Chế độ trình diễn' },
]

const viTexts: [string, string][] = [
  ...leaves(vi),
  ...tour.steps.map((s): [string, string] => [`tour.${s.id}`, s.caption.vi]),
]

describe('Vietnamese copy terms', () => {
  it.each(BANNED)('no "$pattern" in the UI (use $use)', ({ pattern }) => {
    expect(viTexts.filter(([, text]) => pattern.test(text)).map(([path]) => path)).toEqual([])
  })
})

describe('English dictionary', () => {
  const enMap = new Map(leaves(en))

  it('has every Vietnamese key, with text', () => {
    // A hint left empty on purpose is empty in both languages.
    const missing = leaves(vi)
      .filter(([path, text]) => text.trim() !== '' && !enMap.get(path)?.trim())
      .map(([path]) => path)
    expect(missing).toEqual([])
  })

  it('is translated (no Vietnamese letters left in English text)', () => {
    const vietnamese = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i
    // Proper names stay Vietnamese: the language's own name and Tết.
    const names = new Set(['settings.language.vi', 'wardrobeEditor.tags.tet'])
    const untranslated = [...enMap]
      .filter(([path, text]) => !names.has(path) && vietnamese.test(text))
      .map(([path]) => path)
    expect(untranslated).toEqual([])
  })
})
