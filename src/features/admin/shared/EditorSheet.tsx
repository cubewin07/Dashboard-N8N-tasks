import { AlertCircle, Check, Loader2 } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { ConfigIssue } from '@/domain/validateConfig'
import { useI18n } from '@/i18n'
import { IssueList } from './IssueList'
import type { SaveStatus } from './useConfigEdit'

export function SaveStatusText({ status }: { status: SaveStatus }) {
  const { t } = useI18n()
  if (status === 'idle') return null
  const Icon = status === 'saving' ? Loader2 : status === 'saved' ? Check : AlertCircle
  const text =
    status === 'saving' ? t.admin.save.saving : status === 'saved' ? t.admin.save.saved : t.admin.save.failed
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className={status === 'saving' ? 'size-4 animate-spin' : 'size-4'} aria-hidden />
      {text}
    </span>
  )
}

/**
 * The editor every tab uses (§3.5): draft lives in the caller, "Lưu" is enabled only when the
 * draft is dirty and has no blocking issue, issues show inline. Full-screen under 640 px.
 */
export function EditorSheet({
  open,
  onOpenChange,
  title,
  description,
  issues,
  status,
  canSave,
  onSave,
  children,
  extraActions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  issues: readonly ConfigIssue[]
  status: SaveStatus
  canSave: boolean
  onSave: () => void
  children: ReactNode
  /** e.g. a "Xoá" or "Cho nghỉ" button, shown at the start of the footer. */
  extraActions?: ReactNode
}) {
  const { t } = useI18n()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (canSave && status !== 'saving') onSave()
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <form onSubmit={submit} className="flex min-h-full flex-col" noValidate>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription className={description ? undefined : 'sr-only'}>
              {description ?? title}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-5 px-4 py-5 sm:px-6">
            {children}
            <IssueList issues={issues} />
          </div>
          <SheetFooter>
            {extraActions && <div className="flex flex-1 flex-wrap gap-2">{extraActions}</div>}
            <SaveStatusText status={status} />
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.admin.save.cancel}
            </Button>
            <Button type="submit" disabled={!canSave || status === 'saving'}>
              {status === 'saving' ? t.admin.save.saving : t.admin.save.save}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
