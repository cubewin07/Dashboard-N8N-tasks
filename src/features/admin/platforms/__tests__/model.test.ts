import { describe, expect, it } from 'vitest'
import { seedConfig } from '@/office/configStore'
import {
  buildPlatformChange,
  buildShopChange,
  clampBadge,
  emptyPlatformDraft,
  emptyShopDraft,
  newShopId,
  pickerPlatforms,
  platformDraftFrom,
  platformErrors,
  shopErrors,
} from '../model'

const config = seedConfig()
const lazada = config.platforms.find((p) => p.key === 'lazada')!

describe('platform badge', () => {
  it('cuts the text at 4 characters', () => {
    expect(clampBadge('ABCDEFG')).toBe('ABCD')
    expect(clampBadge('SP')).toBe('SP')
  })

  it('rejects an empty badge and one over 4 characters', () => {
    const draft = { ...platformDraftFrom(lazada), badgeText: '' }
    expect(platformErrors(draft, lazada, config)).toContain('badgeRequired')
    expect(platformErrors({ ...draft, badgeText: 'ABCDE' }, lazada, config)).toContain('badgeRequired')
    expect(platformErrors({ ...draft, badgeText: 'LZD' }, lazada, config)).toEqual([])
  })

  it('deactivating keeps key, kind, badge and icon', () => {
    const change = buildPlatformChange({ ...platformDraftFrom(lazada), active: false }, lazada)
    expect(change).toEqual({ kind: 'platform.upsert', platform: { ...lazada, active: false } })
  })

  it('a new platform needs a free key', () => {
    const draft = { ...emptyPlatformDraft('blue_600'), label: { vi: 'Zalo Shop', en: '' }, key: 'zalo', badgeText: 'ZS' }
    expect(platformErrors(draft, null, config)).toEqual(['keyTaken'])
    expect(platformErrors({ ...draft, key: 'zalo_shop' }, null, config)).toEqual([])
  })
})

describe('shops', () => {
  it('needs a name and a platform', () => {
    expect(shopErrors(emptyShopDraft())).toEqual(['nameRequired', 'platformRequired'])
    expect(shopErrors({ name: 'Shopee 4', handle: '', platformKey: 'shopee' })).toEqual([])
  })

  it('makes a unique id and stores an empty handle as null', () => {
    expect(newShopId('Shopee 1', config)).toBe('shop_shopee_1_2')
    const change = buildShopChange({ name: ' Shopee 4 ', handle: ' ', platformKey: 'shopee' }, null, config)
    expect(change).toEqual({
      kind: 'shop.upsert',
      shop: { id: 'shop_shopee_4', platformKey: 'shopee', name: 'Shopee 4', handle: null },
    })
  })

  it('renaming keeps the id', () => {
    const shop = config.shops[0]!
    const change = buildShopChange({ name: 'Shopee Mall', handle: shop.handle ?? '', platformKey: shop.platformKey }, shop, config)
    expect(change).toMatchObject({ shop: { id: shop.id, name: 'Shopee Mall' } })
  })

  it('the picker lists active platforms plus the current one even when inactive', () => {
    const off = { ...config, platforms: config.platforms.map((p) => (p.key === 'lazada' ? { ...p, active: false } : p)) }
    expect(pickerPlatforms(off, null).some((p) => p.key === 'lazada')).toBe(false)
    expect(pickerPlatforms(off, 'lazada').some((p) => p.key === 'lazada')).toBe(true)
  })
})
