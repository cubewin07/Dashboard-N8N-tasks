import type { Platform } from '@/lib/database.types'
import { useLookups } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const platformSwatch: Record<Platform, string> = { shopee: 'bg-emp-bao', lazada: 'bg-emp-mai', tiktok_shop: 'bg-foreground' }

export function ShopChip({ shopId, className }: { shopId: number; className?: string }) {
  const { t } = useI18n()
  const shop = useLookups().shop.get(shopId)
  const platform = shop ? t.common.platform[shop.platform] : null
  return (
    <span
      title={platform ?? undefined}
      className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs text-foreground', className)}
    >
      <span aria-hidden className={cn('size-2 shrink-0 rounded-[2px]', shop ? platformSwatch[shop.platform] : 'bg-idle')} />
      <span className="truncate">{shop?.name ?? `#${shopId}`}</span>
      {platform && <span className="sr-only">({platform})</span>}
    </span>
  )
}
