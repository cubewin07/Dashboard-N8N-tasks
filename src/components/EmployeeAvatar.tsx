import { User } from 'lucide-react'
import type { EmpStatus, OwnerKey } from '@/lib/database.types'
import { empStatusTone, ownerTint, toneClasses } from '@/lib/status'
import { useLookups } from '@/hooks/queries'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const sizes = {
  sm: { box: 'size-6 text-[10px] ring-1', icon: 'size-3', dot: 'size-2' },
  md: { box: 'size-9 text-xs ring-2', icon: 'size-4', dot: 'size-2.5' },
  lg: { box: 'size-12 text-sm ring-2', icon: 'size-5', dot: 'size-3' },
}

/** Two leading letters of the name ("Linh" → "Li", "Hà" → "Hà"), grapheme-safe for Vietnamese. */
function initials(name: string) {
  return Array.from(name.normalize('NFC').trim()).slice(0, 2).join('')
}

export function EmployeeAvatar({ ownerKey, size = 'md', status, className }: { ownerKey: OwnerKey; size?: 'sm' | 'md' | 'lg'; status?: EmpStatus; className?: string }) {
  const { t } = useI18n()
  const { employee } = useLookups()
  const tint = ownerTint[ownerKey]
  const s = sizes[size]
  const isBoss = ownerKey === 'boss'
  const name = isBoss ? t.common.you : (employee.get(ownerKey)?.name ?? ownerKey)
  const label = status ? `${name} · ${t.common.empStatus[status]}` : name
  const tone = status ? empStatusTone[status] : null

  return (
    <span role="img" aria-label={label} title={label} className={cn('relative inline-flex shrink-0', className)}>
      <span className={cn('inline-flex items-center justify-center rounded-full font-semibold ring-inset', s.box, tint.bg, tint.text, tint.ring)}>
        {isBoss ? <User className={s.icon} aria-hidden /> : <span aria-hidden>{initials(name)}</span>}
      </span>
      {tone && (
        <span
          aria-hidden
          className={cn('absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-surface', s.dot, toneClasses[tone].dot, toneClasses[tone].text, status === 'working' && 'animate-pulse-dot')}
        />
      )}
    </span>
  )
}
