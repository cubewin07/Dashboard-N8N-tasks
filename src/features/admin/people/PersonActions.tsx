import { Eye, Palette, Pencil, UserMinus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, buttonVariants } from '@/components/ui/button'
import type { Employee } from '@/domain/config'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'

/** Where "Xem trong văn phòng" and "Đổi diện mạo" go (the wardrobe reads `?id=`, the office `?follow=`). */
export const officeFollowPath = (id: string) => `/?follow=${encodeURIComponent(id)}`
export const wardrobePath = (id: string) => `/wardrobe?id=${encodeURIComponent(id)}`

/** Row actions of the People tab, shared by the table and the phone cards. */
export function PersonActions({
  person,
  onEdit,
  onDismiss,
}: {
  person: Employee
  onEdit: (e: Employee) => void
  onDismiss: (e: Employee) => void
}) {
  const { t } = useI18n()
  const a = t.adminPeople.people.actions
  const named = (action: string) => fmt(a.forPerson, { action, name: person.name })
  const active = person.state === 'active'
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={named(a.edit)}
        onClick={() => onEdit(person)}
      >
        <Pencil aria-hidden />
        {a.edit}
      </Button>
      {active && (
        <Link
          to={officeFollowPath(person.id)}
          aria-label={named(a.viewInOffice)}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
        >
          <Eye aria-hidden />
          {a.viewInOffice}
        </Link>
      )}
      <Link
        to={wardrobePath(person.id)}
        aria-label={named(a.changeLook)}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
      >
        <Palette aria-hidden />
        {a.changeLook}
      </Link>
      {active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={named(a.dismiss)}
          className="text-blocked hover:bg-blocked-soft"
          onClick={() => onDismiss(person)}
        >
          <UserMinus aria-hidden />
          {a.dismiss}
        </Button>
      )}
    </div>
  )
}
