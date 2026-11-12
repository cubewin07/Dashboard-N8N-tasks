import type { PaletteSwatch, Platform } from '@/domain/config'
import type { Label, Priority } from '@/domain/primitives'
import {
  EMOTE_KEYS,
  VISUAL_STATUS_KEYS,
  type EmoteKey,
  type StatusIconKey,
  type VisualLanguage,
  type VisualStatusKey,
} from '@/domain/visual'
import type { Messages } from '@/i18n'
import { fmt } from '@/lib/utils'

/**
 * Legend content (P05-T14, R13), built only from data: the visual language
 * (`visual-language.json`), the palette and the platform list, plus i18n.
 * Adding a status look, a platform or a priority colour changes the legend
 * without code.
 */

type LegendText = Messages['office']['legend']

/** Hex of a palette swatch (3D colours come from the palette, so the legend shows the same). */
export function swatchHex(palette: readonly PaletteSwatch[], key: string): string | null {
  return palette.find((s) => s.key === key)?.hex ?? null
}

export interface LegendStatusRow {
  key: VisualStatusKey
  title: string
  detail: string
  hex: string | null
  icon: StatusIconKey | null
  ring: 'solid' | 'dashed' | 'none'
  pulse: boolean
}

export function legendStatusRows(
  text: LegendText,
  visual: VisualLanguage,
  palette: readonly PaletteSwatch[],
): LegendStatusRow[] {
  return VISUAL_STATUS_KEYS.map((key) => {
    const look = visual.status[key]
    const ring = !look.ring ? 'none' : look.ringDashed ? 'dashed' : 'solid'
    const parts = [
      ring === 'none' ? text.noRing : ring === 'dashed' ? text.ringDashed : text.ringSolid,
      ...(look.ringPulse ? [text.ringPulse] : []),
      look.icon ? text.icons[look.icon] : text.noIcon,
    ]
    return {
      key,
      title: text.status[key],
      detail: capitalise(parts.join(', ')),
      hex: swatchHex(palette, look.swatch),
      icon: look.icon,
      ring,
      pulse: look.ringPulse,
    }
  })
}

export interface LegendPlatformRow {
  key: string
  title: string
  detail: string
  badgeText: string
  hex: string | null
}

export function legendPlatformRows(
  text: LegendText,
  platforms: readonly Platform[],
  palette: readonly PaletteSwatch[],
  label: (l: Label) => string,
): LegendPlatformRow[] {
  return platforms
    .filter((p) => p.active)
    .map((p) => ({
      key: p.key,
      title: label(p.label),
      detail: fmt(text.platformBody, { text: p.badge.text, label: label(p.label) }),
      badgeText: p.badge.text,
      hex: swatchHex(palette, p.badge.swatch),
    }))
}

export interface LegendPriorityRow {
  key: Priority
  detail: string
  hex: string | null
}

const PRIORITY_ORDER: readonly Priority[] = ['urgent', 'high', 'normal', 'low']

export function legendPileRows(
  text: LegendText,
  priorityLabels: Record<Priority, string>,
  visual: VisualLanguage,
  palette: readonly PaletteSwatch[],
): LegendPriorityRow[] {
  return PRIORITY_ORDER.map((key) => ({
    key,
    detail: fmt(text.pilePriority, { priority: priorityLabels[key] }),
    hex: swatchHex(palette, visual.pile.priorityEdge[key]),
  }))
}

export interface LegendEmoteRow {
  key: EmoteKey
  title: string
}

export function legendEmoteRows(text: LegendText): LegendEmoteRow[] {
  return EMOTE_KEYS.map((key) => ({ key, title: text.emotes[key] }))
}

function capitalise(s: string): string {
  return s.charAt(0).toLocaleUpperCase('vi-VN') + s.slice(1)
}
