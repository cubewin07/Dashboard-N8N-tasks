// P10-T12 · Nền tảng & cửa hàng (R9): platforms (no delete, D5) and the shops that belong to them.
import { Pencil, Plus } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { OrgConfig, Platform, Shop } from '@/domain/config'
import { useI18n } from '@/i18n'
import { useConfig, useLabel } from '@/office/hooks'
import { PlatformEditor } from '../platforms/PlatformEditor'
import { ShopEditor } from '../platforms/ShopEditor'

type EditingPlatform = { platform: Platform | null } | null
type EditingShop = { shop: Shop | null } | null

function PlatformBadge({ config, platform }: { config: OrgConfig; platform: Platform }) {
  const swatch = config.palette.find((s) => s.key === platform.badge.swatch)
  const style = {
    backgroundColor: swatch?.softHex ?? 'var(--surface-muted)',
    color: swatch?.hex ?? 'var(--foreground)',
  } as CSSProperties
  return (
    <span
      aria-hidden
      data-platform-badge={platform.key}
      style={style}
      className="tabular inline-flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl px-2 text-sm font-bold"
    >
      {platform.badge.text}
    </span>
  )
}

export function PlatformsTab() {
  const { t } = useI18n()
  const a = t.adminOrg.platforms
  const label = useLabel()
  const { config } = useConfig()
  const [platform, setPlatform] = useState<EditingPlatform>(null)
  const [shop, setShop] = useState<EditingShop>(null)

  if (!config) return null
  const byKey = new Map(config.platforms.map((p) => [p.key, p]))

  return (
    <div className="space-y-8">
      <section aria-labelledby="admin-platforms-title" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-prose space-y-1">
            <h2 id="admin-platforms-title" className="text-lg font-semibold">
              {t.admin.tabs.platforms}
            </h2>
            <p className="text-sm text-muted-foreground">{a.intro}</p>
          </div>
          <Button type="button" onClick={() => setPlatform({ platform: null })}>
            <Plus className="size-4" aria-hidden />
            {a.add}
          </Button>
        </div>

        <ul aria-label={a.listLabel} className="grid gap-2 lg:grid-cols-2">
          {config.platforms.map((p) => {
            const name = label(p.label)
            return (
              <li
                key={p.key}
                data-platform-key={p.key}
                data-platform-active={p.active}
                className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3 sm:p-4"
              >
                <PlatformBadge config={config} platform={p} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-base font-semibold">{name}</span>
                    <Badge variant={p.active ? 'done' : 'neutral'}>
                      {p.active ? t.admin.active : t.admin.inactive}
                    </Badge>
                  </p>
                  <p className="text-xs text-muted-foreground">{a.kinds[p.kind]}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`${t.admin.edit}: ${name}`}
                  onClick={() => setPlatform({ platform: p })}
                >
                  <Pencil className="size-4" aria-hidden />
                  {t.admin.edit}
                </Button>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="admin-shops-title" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-prose space-y-1">
            <h2 id="admin-shops-title" className="text-lg font-semibold">
              {a.shopsTitle}
            </h2>
            <p className="text-sm text-muted-foreground">{a.shopsIntro}</p>
          </div>
          <Button type="button" onClick={() => setShop({ shop: null })}>
            <Plus className="size-4" aria-hidden />
            {a.addShop}
          </Button>
        </div>

        {config.shops.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {a.shopsEmpty}
          </p>
        ) : (
          <ul aria-label={a.shopsListLabel} className="grid gap-2 lg:grid-cols-2">
            {config.shops.map((s) => {
              const owner = byKey.get(s.platformKey)
              return (
                <li
                  key={s.id}
                  data-shop-id={s.id}
                  className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3 sm:p-4"
                >
                  {owner && <PlatformBadge config={config} platform={owner} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold">{s.name}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{owner ? label(owner.label) : s.platformKey}</span>
                      {s.handle && <span>{s.handle}</span>}
                      {owner && !owner.active && (
                        <Badge variant="neutral">{a.platformInactive}</Badge>
                      )}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`${t.admin.edit}: ${s.name}`}
                    onClick={() => setShop({ shop: s })}
                  >
                    <Pencil className="size-4" aria-hidden />
                    {t.admin.edit}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {platform && (
        <PlatformEditor config={config} platform={platform.platform} onClose={() => setPlatform(null)} />
      )}
      {shop && <ShopEditor config={config} shop={shop.shop} onClose={() => setShop(null)} />}
    </div>
  )
}
