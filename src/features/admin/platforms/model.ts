// Pure helpers for the Platforms + shops tab (R9). No platform delete (D5): only upsert/deactivate.
import type { ConfigChange, OrgConfig, Platform, Shop } from '@/domain/config'
import type { Label } from '@/domain/primitives'
import { KEY_PATTERN, slugKey, uniqueKey } from '../shared/keys'

export const BADGE_MAX = 4
export type PlatformKind = Platform['kind']
export const PLATFORM_KINDS: readonly PlatformKind[] = ['marketplace', 'social', 'messaging']

/** The badge text is at most 4 characters (schema `max(4)`); the input cuts it off too. */
export function clampBadge(text: string): string {
  return Array.from(text).slice(0, BADGE_MAX).join('')
}

export interface PlatformDraft {
  label: Label
  key: string
  keyTouched: boolean
  kind: PlatformKind
  badgeText: string
  swatch: string
  active: boolean
}

export type PlatformError = 'labelRequired' | 'keyInvalid' | 'keyTaken' | 'badgeRequired'

export function emptyPlatformDraft(swatch: string): PlatformDraft {
  return {
    label: { vi: '', en: '' },
    key: '',
    keyTouched: false,
    kind: 'marketplace',
    badgeText: '',
    swatch,
    active: true,
  }
}

export function platformDraftFrom(p: Platform): PlatformDraft {
  return {
    label: { ...p.label },
    key: p.key,
    keyTouched: true,
    kind: p.kind,
    badgeText: p.badge.text,
    swatch: p.badge.swatch,
    active: p.active,
  }
}

export function platformWithLabel(draft: PlatformDraft, label: Label, config: OrgConfig): PlatformDraft {
  if (draft.keyTouched) return { ...draft, label }
  const base = label.vi.trim() ? slugKey(label.vi) : ''
  return { ...draft, label, key: base ? uniqueKey(base, config.platforms.map((p) => p.key)) : '' }
}

export function platformErrors(
  draft: PlatformDraft,
  existing: Platform | null,
  config: OrgConfig,
): PlatformError[] {
  const errors: PlatformError[] = []
  if (!draft.label.vi.trim()) errors.push('labelRequired')
  if (!existing) {
    if (!KEY_PATTERN.test(draft.key)) errors.push('keyInvalid')
    else if (config.platforms.some((p) => p.key === draft.key)) errors.push('keyTaken')
  }
  const badge = draft.badgeText.trim()
  if (badge.length < 1 || Array.from(badge).length > BADGE_MAX) errors.push('badgeRequired')
  return errors
}

export function platformDirty(draft: PlatformDraft, existing: Platform | null): boolean {
  if (!existing) return draft.label.vi.trim() !== '' || draft.badgeText !== ''
  return (
    draft.label.vi !== existing.label.vi ||
    draft.label.en !== existing.label.en ||
    draft.kind !== existing.kind ||
    draft.badgeText !== existing.badge.text ||
    draft.swatch !== existing.badge.swatch ||
    draft.active !== existing.active
  )
}

export function buildPlatformChange(draft: PlatformDraft, existing: Platform | null): ConfigChange {
  const vi = draft.label.vi.trim()
  const platform: Platform = {
    key: existing?.key ?? draft.key,
    label: { vi, en: draft.label.en.trim() || vi },
    kind: draft.kind,
    badge: { text: draft.badgeText.trim(), swatch: draft.swatch },
    iconAsset: existing?.iconAsset ?? null,
    active: draft.active,
  }
  return { kind: 'platform.upsert', platform }
}

export interface ShopDraft {
  name: string
  handle: string
  platformKey: string
}

export type ShopError = 'nameRequired' | 'platformRequired'

export function emptyShopDraft(): ShopDraft {
  return { name: '', handle: '', platformKey: '' }
}

export function shopDraftFrom(s: Shop): ShopDraft {
  return { name: s.name, handle: s.handle ?? '', platformKey: s.platformKey }
}

export function shopErrors(draft: ShopDraft): ShopError[] {
  const errors: ShopError[] = []
  if (!draft.name.trim()) errors.push('nameRequired')
  if (!draft.platformKey) errors.push('platformRequired')
  return errors
}

export function shopDirty(draft: ShopDraft, existing: Shop | null): boolean {
  if (!existing) return draft.name.trim() !== ''
  const s = shopDraftFrom(existing)
  return s.name !== draft.name || s.handle !== draft.handle || s.platformKey !== draft.platformKey
}

/** New shop ids are `shop_<slug of the name>`, made unique; an existing id never changes. */
export function newShopId(name: string, config: OrgConfig): Shop['id'] {
  const base = `shop_${slugKey(name)}`
  return uniqueKey(base, config.shops.map((s) => s.id)) as Shop['id']
}

export function buildShopChange(draft: ShopDraft, existing: Shop | null, config: OrgConfig): ConfigChange {
  const handle = draft.handle.trim()
  return {
    kind: 'shop.upsert',
    shop: {
      id: existing?.id ?? newShopId(draft.name, config),
      platformKey: draft.platformKey,
      name: draft.name.trim(),
      handle: handle === '' ? null : handle,
    },
  }
}

/** Platforms the shop picker offers: active ones, plus the shop's current platform even if inactive. */
export function pickerPlatforms(config: OrgConfig, currentKey: string | null): Platform[] {
  return config.platforms.filter((p) => p.active || p.key === currentKey)
}
