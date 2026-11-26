import { X } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { Input } from '@/components/ui/input'
import { Label as FieldLabel } from '@/components/ui/label'
import { useI18n } from '@/i18n'
import { fmt } from '@/lib/utils'
import { normalizeTag } from './ruleForm'

/** Free-text chips: type a tag and press Enter (or comma); each chip has a remove button. */
export function TagInput({
  label,
  hint,
  value,
  onChange,
  suggestions,
  testId,
}: {
  label: string
  hint?: string
  value: readonly string[]
  onChange: (next: string[]) => void
  suggestions: readonly string[]
  testId?: string
}) {
  const { t } = useI18n()
  const id = useId()
  const [text, setText] = useState('')

  const add = (raw: string) => {
    const tag = normalizeTag(raw)
    if (tag !== '' && !value.includes(tag)) onChange([...value, tag])
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(text)
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div className="space-y-1.5" data-testid={testId}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary"
            >
              <span>{tag}</span>
              <button
                type="button"
                className="inline-flex size-6 items-center justify-center rounded-full hover:bg-surface focus-visible:outline-2 focus-visible:outline-ring"
                aria-label={fmt(t.adminRules.tags.remove, { tag })}
                onClick={() => onChange(value.filter((v) => v !== tag))}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        value={text}
        list={`${id}-suggestions`}
        placeholder={t.adminRules.tags.placeholder}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(text)}
      />
      <datalist id={`${id}-suggestions`}>
        {suggestions
          .filter((s) => !value.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
