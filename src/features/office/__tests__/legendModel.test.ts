import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { EMOTE_KEYS, PLAN_EMOTE_KEYS, VISUAL_STATUS_KEYS } from '@/domain/visual'
import { en } from '@/i18n/en'
import { vi } from '@/i18n/vi'
import { idleBehaviours, visualLanguage } from '@/office/visualConfig'
import {
  drawnEmotes,
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

  it('lists exactly the emotes something draws, in both languages', () => {
    const drawn = drawnEmotes(idleBehaviours)
    const rows = legendEmoteRows(vi.office.legend, idleBehaviours)
    expect(rows.map((r) => r.key)).toEqual(EMOTE_KEYS.filter((k) => drawn.has(k)))
    // Idle options and the plan's wave + chat are drawn; nothing draws `stuck`.
    for (const key of PLAN_EMOTE_KEYS) expect(drawn.has(key)).toBe(true)
    for (const o of idleBehaviours.options) if (o.emote) expect(drawn.has(o.emote)).toBe(true)
    expect(rows.map((r) => r.key)).not.toContain('stuck')
    for (const r of [...rows, ...legendEmoteRows(en.office.legend, idleBehaviours)]) {
      expect(r.title.length).toBeGreaterThan(0)
    }
  })

  it('shows no icon for a status the scene draws without one (the carried paper is not an icon)', () => {
    const delivering = legendStatusRows(vi.office.legend, visualLanguage, config.palette).find(
      (r) => r.key === 'delivering',
    )!
    expect(delivering.icon).toBeNull()
    expect(delivering.ring).toBe('none')
  })
})
