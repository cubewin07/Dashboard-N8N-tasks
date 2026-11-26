import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { RoleDef } from '@/domain/config'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { useConfig, useLabel } from '@/office/hooks'
import { ConfirmChangeDialog } from '../people/ConfirmChangeDialog'
import { RoleCard } from '../roles/RoleCard'
import { RoleEditor } from '../roles/RoleEditor'
import { roleDeleteBlock, roleHolders } from '../roles/roleModel'

type Editor = { mode: 'add' } | { mode: 'edit'; key: string }

/** Quản trị → Vai trò (P10-T08, R3). Built-in roles show a lock and have no delete button. */
export function RolesTab() {
  const { t } = useI18n()
  const r = t.adminPeople.roles
  const label = useLabel()
  const { config } = useConfig()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deleteKey, setDeleteKey] = useState<string | null>(null)

  const roles = useMemo(
    () => (config ? [...config.roles].sort((a, b) => a.sortOrder - b.sortOrder) : []),
    [config],
  )
  if (!config) return null

  const editing = editor?.mode === 'edit' ? (config.roles.find((x) => x.key === editor.key) ?? null) : null
  const deleting = deleteKey ? (config.roles.find((x) => x.key === deleteKey) ?? null) : null

  return (
    <div className="space-y-4" data-admin-roles>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">{r.description}</p>
        <Button type="button" onClick={() => setEditor({ mode: 'add' })}>
          <Plus aria-hidden />
          {r.add}
        </Button>
      </div>

      <ul className="grid gap-3 lg:grid-cols-2" aria-label={r.listAriaLabel}>
        {roles.map((role: RoleDef) => (
          <RoleCard
            key={role.key}
            role={role}
            holders={roleHolders(config, role.key)}
            block={roleDeleteBlock(config, role)}
            onEdit={(x) => setEditor({ mode: 'edit', key: x.key })}
            onDelete={(x) => setDeleteKey(x.key)}
          />
        ))}
      </ul>

      {editor?.mode === 'add' && <RoleEditor key="add" role={null} onClose={() => setEditor(null)} />}
      {editing && <RoleEditor key={editing.key} role={editing} onClose={() => setEditor(null)} />}
      {deleting && (
        <ConfirmChangeDialog
          title={fmt(r.delete.title, { name: label(deleting.label) })}
          description={r.delete.description}
          confirmLabel={r.delete.confirm}
          cancelLabel={t.admin.save.cancel}
          successMessage={fmt(r.removed, { name: label(deleting.label) })}
          change={{ kind: 'role.delete', key: deleting.key }}
          onClose={() => setDeleteKey(null)}
        />
      )}
    </div>
  )
}
