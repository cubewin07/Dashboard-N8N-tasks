import { ArrowDown, ArrowUp } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label as FieldLabel } from '@/components/ui/label'
import type { Label } from '@/domain/primitives'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/** Label + control + optional hint. Pass the control's id as `htmlFor`. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/** A data label edited as a {vi, en} pair (R16). English is optional and falls back to Vietnamese. */
export function LabelFields({
  value,
  onChange,
  disabled,
}: {
  value: Label
  onChange: (next: Label) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  const id = useId()
  // Red only once the person has been in the field: an empty new form is not an error yet.
  const [touched, setTouched] = useState(false)
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t.admin.label.vi} htmlFor={`${id}-vi`}>
        <Input
          id={`${id}-vi`}
          value={value.vi}
          required
          aria-invalid={touched && value.vi.trim() === '' ? true : undefined}
          disabled={disabled}
          onBlur={() => setTouched(true)}
          onChange={(e) => {
            setTouched(true)
            onChange({ ...value, vi: e.target.value })
          }}
        />
      </Field>
      <Field label={t.admin.label.en} htmlFor={`${id}-en`}>
        <Input
          id={`${id}-en`}
          value={value.en}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, en: e.target.value })}
        />
      </Field>
    </div>
  )
}

/** Keyboard-friendly reorder (the drag alternative, §3.5). */
export function ReorderButtons({
  name,
  onUp,
  onDown,
  disabled,
}: {
  name: string
  onUp: (() => void) | null
  onDown: (() => void) | null
  disabled?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${t.admin.moveUp}: ${name}`}
        disabled={disabled || !onUp}
        onClick={onUp ?? undefined}
      >
        <ArrowUp className="size-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${t.admin.moveDown}: ${name}`}
        disabled={disabled || !onDown}
        onClick={onDown ?? undefined}
      >
        <ArrowDown className="size-4" aria-hidden />
      </Button>
    </div>
  )
}

/** Move `ids[index]` by `delta` and return the new id list (for *.reorder changes). */
export function moveId(ids: readonly string[], index: number, delta: -1 | 1): string[] {
  const next = [...ids]
  const target = index + delta
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  return next
}
