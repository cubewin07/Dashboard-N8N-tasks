import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Placeholder rows while the feed is still connecting: never an "empty" message that is not true yet. */
export function ListSkeleton({ label, rows = 3, className }: { label: string; rows?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" data-loading className={cn('space-y-4', className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn('w-full rounded-[14px]', i === 0 ? 'h-32' : 'h-44')} />
      ))}
    </div>
  )
}
