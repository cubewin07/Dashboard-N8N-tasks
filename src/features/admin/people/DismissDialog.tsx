import type { Employee } from '@/domain/config'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { ConfirmChangeDialog } from './ConfirmChangeDialog'

/**
 * Confirmation before `employee.archive` (reason 'dismissed'). If the person is the only Manager
 * or the only owner the validator's issue shows here and the button stays off.
 */
export function DismissDialog({ person, onClose }: { person: Employee; onClose: () => void }) {
  const { t } = useI18n()
  const d = t.adminPeople.people.dismiss
  const name = { name: person.name }
  return (
    <ConfirmChangeDialog
      title={fmt(d.title, name)}
      description={fmt(d.description, name)}
      confirmLabel={d.confirm}
      cancelLabel={d.cancel}
      successMessage={fmt(d.done, name)}
      change={{ kind: 'employee.archive', id: person.id, reason: 'dismissed' }}
      onClose={onClose}
    />
  )
}
