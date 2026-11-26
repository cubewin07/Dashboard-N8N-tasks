import { Lock, Pencil, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { RoleDef } from '@/domain/config'
import { isBuiltInRole } from '@/domain/configChange'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useLabel } from '@/office/hooks'
import { BOOLEAN_CAPS, type RoleDeleteBlock } from './roleModel'

/** One role: label, lock badge for built-ins, who holds it, its capabilities and the actions. */
export function RoleCard({
  role,
  holders,
  block,
  onEdit,
  onDelete,
}: {
  role: RoleDef
  holders: number
  block: RoleDeleteBlock | null
  onEdit: (r: RoleDef) => void
  onDelete: (r: RoleDef) => void
}) {
  const { t } = useI18n()
  const r = t.adminPeople.roles
  const label = useLabel()
  const name = label(role.label)
  const builtIn = isBuiltInRole(role.key)
  const reasonId = `role-${role.key}-delete-reason`
  const blockText =
    block?.reason === 'holders' ? fmt(r.delete.blocked.holders, { n: block.n }) : null
  const caps = BOOLEAN_CAPS.filter((c) => role.caps[c]).map((c) => r.caps[c])
  if (role.caps.approveLevel) caps.push(`${r.fields.approveLevel}: ${r.level[role.caps.approveLevel]}`)

  return (
    <li
      data-role-key={role.key}
      data-built-in={builtIn ? 'true' : undefined}
      className="space-y-2.5 rounded-xl border border-border bg-surface p-3.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{name}</h3>
            {builtIn && (
              <Badge variant="neutral" title={r.lock}>
                <Lock className="size-3" aria-hidden />
                {t.admin.builtIn}
                <span className="sr-only">: {r.lock}</span>
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            <code>{role.key}</code> · {r.scope[role.scope]} ·{' '}
            {holders > 0 ? fmt(r.holders, { n: holders }) : r.holdersNone}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${t.admin.edit}: ${name}`}
            onClick={() => onEdit(role)}
          >
            <Pencil aria-hidden />
            {t.admin.edit}
          </Button>
          {!builtIn && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-blocked hover:bg-blocked-soft"
              aria-label={fmt(r.delete.forRole, { name })}
              disabled={block !== null}
              aria-describedby={block ? reasonId : undefined}
              onClick={() => onDelete(role)}
            >
              <Trash2 aria-hidden />
              {r.delete.action}
            </Button>
          )}
        </div>
      </div>
      {caps.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={r.fields.caps}>
          {caps.map((c) => (
            <li key={c} className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {c}
            </li>
          ))}
        </ul>
      )}
      {blockText && (
        <p id={reasonId} className="text-xs text-muted-foreground">
          {blockText}
        </p>
      )}
    </li>
  )
}
