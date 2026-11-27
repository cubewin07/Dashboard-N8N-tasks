import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useI18n } from '@/i18n'
import type { QualityChoice } from '@/office/capabilities'
import { useOfficePrefs, useOfficeQuality } from '@/office/prefs'
import { cn, fmt } from '@/lib/utils'

const CHOICES: readonly QualityChoice[] = ['auto', 'high', 'medium', 'low']

/** P11 §3.5: 3D quality, automatic from the capability check or chosen by the user. */
export function QualitySetting() {
  const { t } = useI18n()
  const q = t.settings.quality
  const choice = useOfficePrefs((s) => s.qualityChoice)
  const setQuality = useOfficePrefs((s) => s.setQuality)
  const effective = useOfficeQuality()
  const disabled = effective === 'off'

  return (
    <div className="space-y-2.5" data-settings-quality>
      <div className="space-y-1">
        <p id="quality-label" className="text-sm font-medium text-foreground">
          {q.label}
        </p>
        <p className="text-xs text-muted-foreground">{q.help}</p>
      </div>
      <RadioGroup
        value={choice}
        onValueChange={(val) => setQuality(val as QualityChoice)}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-labelledby="quality-label"
        disabled={disabled}
      >
        {CHOICES.map((value) => (
          <label
            key={value}
            htmlFor={`quality-${value}`}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
              disabled && 'cursor-not-allowed opacity-60',
              choice === value
                ? 'border-primary bg-primary-soft/40'
                : 'border-border bg-surface hover:bg-surface-muted',
            )}
          >
            <RadioGroupItem value={value} id={`quality-${value}`} className="mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{q.options[value]}</p>
              <p className="text-xs text-muted-foreground">{q.options[`${value}Subtitle`]}</p>
            </div>
          </label>
        ))}
      </RadioGroup>
      <p className="text-xs text-muted-foreground" data-quality-active={effective}>
        {fmt(q.activeLabel, { level: q.levels[effective] })}
      </p>
    </div>
  )
}
