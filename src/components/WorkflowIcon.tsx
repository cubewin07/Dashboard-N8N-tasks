import { Clapperboard, Image, MessageCircle, PenLine, Star, Tag, Workflow, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const icons: Record<string, LucideIcon> = {
  review_reply: Star,
  chat_reply: MessageCircle,
  social_post: PenLine,
  short_video: Clapperboard,
  banner_set: Image,
  promo_join: Tag,
}

export function WorkflowIcon({ workflowKey, className }: { workflowKey: string; className?: string }) {
  const Icon = icons[workflowKey] ?? Workflow
  return <Icon aria-hidden className={cn('size-4 shrink-0', className)} />
}
