// Small labels for the frozen Library page. They read the fixture lookups, not the office store.
import {
  Clapperboard,
  Image,
  MessageCircle,
  PenLine,
  Star,
  Tag,
  User,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { demoLookups } from './demoArtifacts'

export function ShopChip({ shopId, className }: { shopId: number; className?: string }) {
  const shop = demoLookups.shop.get(shopId)
  return (
    <span
      title={shop?.platformLabel}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface px-1.5 py-0.5 text-xs text-foreground',
        className,
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-primary" />
      <span className="truncate">{shop?.name ?? `#${shopId}`}</span>
      {shop && <span className="sr-only">({shop.platformLabel})</span>}
    </span>
  )
}

/** Two leading letters of the name ("Linh" → "Li", "Hà" → "Hà"), grapheme-safe for Vietnamese. */
function initials(name: string) {
  return Array.from(name.normalize('NFC').trim()).slice(0, 2).join('')
}

export function PersonAvatar({ ownerKey }: { ownerKey: string }) {
  const name = demoLookups.employee.get(ownerKey)?.name
  return (
    <span
      role="img"
      aria-label={name ?? ownerKey}
      title={name ?? ownerKey}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[10px] font-semibold text-primary ring-1 ring-inset ring-primary/30"
    >
      {name ? <span aria-hidden>{initials(name)}</span> : <User className="size-3" aria-hidden />}
    </span>
  )
}

const workflowIcons: Record<string, LucideIcon> = {
  review_reply: Star,
  chat_reply: MessageCircle,
  social_post: PenLine,
  short_video: Clapperboard,
  banner_set: Image,
  promo_join: Tag,
}

export function WorkflowIcon({ workflowKey, className }: { workflowKey: string; className?: string }) {
  const Icon = workflowIcons[workflowKey] ?? Workflow
  return <Icon aria-hidden className={cn('size-4 shrink-0', className)} />
}
