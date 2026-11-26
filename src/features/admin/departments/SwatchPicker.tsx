import type { PaletteSwatch } from '@/domain/config'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useLabel } from '@/office/hooks'

/**
 * Palette swatches as a radio group (arrow keys move, one tab stop). The names come from the
 * palette labels, so the choice never relies on colour alone.
 */
export function SwatchPicker({
  id,
  label,
  swatches,
  value,
  onChange,
}: {
  id: string
  label: string
  swatches: readonly PaletteSwatch[]
  value: string
  onChange: (key: string) => void
}) {
  const nameOf = useLabel()
  return (
    <RadioGroup
      id={id}
      aria-label={label}
      value={value}
      onValueChange={onChange}
      className="flex flex-wrap gap-2.5"
    >
      {swatches.map((s) => (
        <RadioGroupItem
          key={s.key}
          value={s.key}
          aria-label={nameOf(s.label)}
          title={nameOf(s.label)}
          style={{ backgroundColor: s.hex }}
          className="size-9 border-2 border-surface shadow-[0_0_0_1px_var(--border)] data-[state=checked]:shadow-[0_0_0_2px_var(--foreground)] [&>span]:bg-white"
        />
      ))}
    </RadioGroup>
  )
}
