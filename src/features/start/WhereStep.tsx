import { useId } from 'react'
import type { Tables } from '@/lib/database.types'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'

/** Step ②: shop, optional brief, and whether the boss approves before publishing. */
export function WhereStep({
  workflowKey,
  shops,
  loading,
  shopId,
  onShopChange,
  brief,
  onBriefChange,
  hasApprovalStep,
  requireApproval,
  onRequireApprovalChange,
}: {
  workflowKey: string | null
  shops: Tables<'shops'>[]
  loading: boolean
  shopId: number | null
  onShopChange: (id: number) => void
  brief: string
  onBriefChange: (v: string) => void
  hasApprovalStep: boolean
  requireApproval: boolean
  onRequireApprovalChange: (v: boolean) => void
}) {
  const { t } = useI18n()
  const id = useId()
  const shopLabelId = `${id}-shop`
  const briefId = `${id}-brief`
  const briefHintId = `${id}-brief-hint`
  const askId = `${id}-ask`
  const askHintId = `${id}-ask-hint`
  const placeholder = (workflowKey && t.start.briefPlaceholders[workflowKey]) || t.start.briefPlaceholderFallback

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label id={shopLabelId}>{t.start.where.shop}</Label>
        {loading ? (
          <Skeleton className="h-10" />
        ) : shops.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.start.where.noShops}</p>
        ) : (
          <Select value={shopId === null ? undefined : String(shopId)} onValueChange={(v) => onShopChange(Number(v))}>
            <SelectTrigger aria-labelledby={shopLabelId}>
              <SelectValue placeholder={t.start.where.shopPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {shops.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name} · {t.common.platform[s.platform]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={briefId}>
          {t.start.where.brief} <span className="font-normal text-muted-foreground">{t.start.where.briefOptional}</span>
        </Label>
        <Textarea id={briefId} rows={4} value={brief} placeholder={placeholder} aria-describedby={briefHintId} onChange={(e) => onBriefChange(e.target.value)} />
        <p id={briefHintId} className="text-xs text-muted-foreground">
          {t.start.where.briefHint}
        </p>
      </div>

      {hasApprovalStep && (
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface-muted/60 p-3">
          <Checkbox id={askId} checked={requireApproval} onCheckedChange={(v) => onRequireApprovalChange(v === true)} aria-describedby={askHintId} className="mt-0.5" />
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor={askId} className="cursor-pointer">
              {t.start.where.askFirst}
            </Label>
            <p id={askHintId} className="text-xs leading-relaxed text-muted-foreground">
              {requireApproval ? t.start.where.askFirstOn : t.start.where.askFirstOff}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
