import { Link } from 'react-router-dom'
import { ShopChip, ToneMark } from '@/components'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Tables } from '@/lib/database.types'
import { taskStatusTone, toneClasses } from '@/lib/status'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'

interface ByShopCardProps {
  shops: Tables<'shops'>[]
  tasks: Tables<'tasks'>[]
}

export function ByShopCard({ shops, tasks }: ByShopCardProps) {
  const { t } = useI18n()

  const activeTasks = tasks.filter(
    (tk) =>
      tk.status === 'running' ||
      tk.status === 'queued' ||
      tk.status === 'waiting_boss' ||
      tk.status === 'blocked',
  )

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle>{fmt(t.overview.byShop.title, { n: shops.length })}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <ul className="flex flex-col divide-y divide-border/70">
          {shops.map((shop) => {
            const shopActive = activeTasks.filter((tk) => tk.shop_id === shop.id)
            const workingCount = shopActive.filter((tk) => tk.status === 'running' || tk.status === 'queued').length
            const waitingCount = shopActive.filter((tk) => tk.status === 'waiting_boss').length
            const blockedCount = shopActive.filter((tk) => tk.status === 'blocked').length

            const summaryParts: string[] = []
            if (workingCount > 0) summaryParts.push(fmt(t.overview.byShop.working, { n: workingCount }))
            if (waitingCount > 0) summaryParts.push(fmt(t.overview.byShop.waiting, { n: waitingCount }))
            if (blockedCount > 0) summaryParts.push(fmt(t.overview.byShop.blocked, { n: blockedCount }))
            const summaryText = summaryParts.length > 0 ? summaryParts.join(' · ') : t.overview.byShop.idle

            return (
              <li key={shop.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  to={`/tasks?shop=${shop.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg py-0.5 transition-colors hover:bg-surface-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ShopChip shopId={shop.id} />
                    <div className="flex items-center gap-1.5" aria-hidden>
                      {shopActive.length > 0 ? (
                        shopActive.map((tk) => {
                          const tone = taskStatusTone[tk.status]
                          const tc = toneClasses[tone]
                          return (
                            <span
                              key={tk.id}
                              title={`#${tk.id}`}
                              className={cn('inline-flex items-center justify-center', tc.text)}
                            >
                              <ToneMark tone={tone} />
                            </span>
                          )
                        })
                      ) : (
                        <span className="inline-block size-2 rounded-full border border-border bg-surface" />
                      )}
                    </div>
                  </div>

                  <span className="tabular shrink-0 text-xs font-medium text-muted-foreground sm:text-sm">
                    {summaryText}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
