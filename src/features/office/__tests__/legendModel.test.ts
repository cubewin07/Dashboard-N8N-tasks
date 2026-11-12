import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { VISUAL_STATUS_KEYS, EMOTE_KEYS } from '@/domain/visual'
import { en } from '@/i18n/en'
import { vi } from '@/i18n/vi'
import { visualLanguage } from '@/office/visualConfig'
import {
  legendEmoteRows,
  legendPileRows,
  legendPlatformRows,
  legendStatusRows,
  swatchHex,
} from '../legendModel'

const config = makeSeedConfig()
const label = (l: { vi: string; en: string }) => l.vi

describe('legendModel (P05-T14)', () => {
  it('has one status row per visual status, with palette colours and Vietnamese text', () => {
    const rows = legendStatusRows(vi.office.legend, visualLanguage, config.palette)
    expect(rows.map((r) => r.key)).toEqual([...VISUAL_STATUS_KEYS])
    for (const row of rows) {
      expect(row.hex).toMatch(/^#[0-9a-f]{6}$/i)
      expect(row.title.length).toBeGreaterThan(0)
      expect(row.detail.length).toBeGreaterThan(0)
    }
    const helping = rows.find((r) => r.key === 'helping')!
    expect(helping.ring).toBe('dashed')
    expect(helping.detail).toContain('nét đứt')
    const blocked = rows.find((r) => r.key === 'blocked')!
    expect(blocked.pulse).toBe(true)
    expect(blocked.detail).toContain('nhấp nháy')
  })

  it('lists active platforms with their badge text and swatch', () => {
    const rows = legendPlatformRows(vi.office.legend, config.platforms, config.palette, label)
    expect(rows.length).toBe(config.platforms.filter((p) => p.active).length)
    const shopee = rows.find((r) => r.key === 'shopee')
    expect(shopee?.badgeText).toBe(config.platforms.find((p) => p.key === 'shopee')?.badge.text)
    expect(shopee?.hex).not.toBeNull()
  })

  it('has one pile row per priority, coloured by the priority edge swatch', () => {
    const rows = legendPileRows(vi.office.legend, vi.queue.priority, visualLanguage, config.palette)
    expect(rows.map((r) => r.key)).toEqual(['urgent', 'high', 'normal', 'low'])
    expect(rows[0]!.hex).toBe(swatchHex(config.palette, visualLanguage.pile.priorityEdge.urgent))
    expect(rows[0]!.detail).toContain('Khẩn cấp')
  })

  it('names every emote in both languages', () => {
    expect(legendEmoteRows(vi.office.legend).map((r) => r.key)).toEqual([...EMOTE_KEYS])
    for (const r of [...legendEmoteRows(vi.office.legend), ...legendEmoteRows(en.office.legend)]) {
      expect(r.title.length).toBeGreaterThan(0)
    }
  })
})
