import {
  Armchair,
  ArrowUpDown,
  BookOpen,
  Brain,
  CircleAlert,
  CircleDot,
  CircleHelp,
  Coffee,
  FileText,
  Footprints,
  Hand,
  Handshake,
  Heart,
  Laptop,
  Layers,
  MessageCircle,
  MessageSquare,
  Moon,
  Music,
  Search,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import type { EmoteKey, StatusIconKey } from '@/domain/visual'
import { useI18n } from '@/i18n'
import { cn, fmt } from '@/lib/utils'
import { useConfig, useLabel } from '@/office/hooks'
import { useReducedMotionPref } from '@/office/prefs'
import { visualLanguage } from '@/office/visualConfig'
import {
  legendEmoteRows,
  legendPileRows,
  legendPlatformRows,
  legendStatusRows,
  type LegendStatusRow,
} from './legendModel'

/** 2D stand-ins for the 3D atlas cells (same meaning, drawn by lucide). */
const STATUS_ICONS: Record<StatusIconKey, LucideIcon> = {
  laptop: Laptop,
  magnifier: Search,
  handshake: Handshake,
  question: CircleHelp,
  exclamation: CircleAlert,
  speech: MessageSquare,
  paper: FileText,
}

const EMOTE_ICONS: Record<EmoteKey, LucideIcon> = {
  talk: MessageCircle,
  think: Brain,
  note: Music,
  zzz: Moon,
  heart: Heart,
  coffee: Coffee,
  ball: CircleDot,
  stuck: TriangleAlert,
  wave: Hand,
}

/**
 * "Chú giải" (P05-T14, R13): every symbol of the 3D office explained in
 * words. A Radix dialog: keyboard reachable, Esc closes, focus returns to the
 * button.
 */
export function Legend({ className }: { className?: string }) {
  const { t } = useI18n()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          data-legend-button
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            className,
          )}
        >
          <BookOpen className="size-3.5" aria-hidden="true" />
          <span>{t.office.legend.button}</span>
        </button>
      </SheetTrigger>
      <SheetContent data-legend className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.office.legend.title}</SheetTitle>
          <SheetDescription>{t.office.legend.description}</SheetDescription>
        </SheetHeader>
        <LegendBody />
      </SheetContent>
    </Sheet>
  )
}

function LegendBody() {
  const { t } = useI18n()
  const label = useLabel()
  const { config } = useConfig()
  const reducedMotion = useReducedMotionPref()
  const text = t.office.legend
  const palette = useMemo(() => config?.palette ?? [], [config])

  const statusRows = useMemo(
    () => legendStatusRows(text, visualLanguage, palette),
    [text, palette],
  )
  const platformRows = useMemo(
    () => legendPlatformRows(text, config?.platforms ?? [], palette, label),
    [text, config, palette, label],
  )
  const pileRows = useMemo(
    () => legendPileRows(text, t.queue.priority, visualLanguage, palette),
    [text, t.queue.priority, palette],
  )
  const emoteRows = useMemo(() => legendEmoteRows(text), [text])

  return (
    <div className="flex flex-col gap-5 px-4 py-4 sm:px-6">
      <Section title={text.sections.status}>
        {statusRows.map((row) => (
          <Row
            key={row.key}
            id={`status-${row.key}`}
            visual={<StatusSymbol row={row} animate={!reducedMotion} />}
            title={row.title}
            detail={row.detail}
          />
        ))}
      </Section>

      <Section title={text.sections.idle}>
        <Row
          id="idle"
          visual={<span className="size-4 rounded-full bg-idle opacity-60" />}
          title={text.idleTitle}
          detail={text.idleBody}
        />
      </Section>

      {platformRows.length > 0 && (
        <Section title={text.sections.platforms}>
          {platformRows.map((row) => (
            <Row
              key={row.key}
              id={`platform-${row.key}`}
              visual={
                <span
                  className="inline-flex h-5 min-w-8 items-center justify-center rounded px-1 text-[10px] font-bold text-white"
                  style={{ backgroundColor: row.hex ?? undefined }}
                >
                  {row.badgeText}
                </span>
              }
              title={row.title}
              detail={row.detail}
            />
          ))}
        </Section>
      )}

      <Section title={text.sections.piles}>
        <Row
          id="pile"
          visual={<PileSymbol topHex={null} count={3} />}
          title={text.pileTitle}
          detail={text.pileBody}
        />
        {pileRows.map((row) => (
          <Row
            key={row.key}
            id={`pile-${row.key}`}
            visual={<PileSymbol topHex={row.hex} />}
            title={t.queue.priority[row.key]}
            detail={row.detail}
          />
        ))}
      </Section>

      <Section title={text.sections.movement}>
        <Row id="bench" visual={<IconSymbol icon={Armchair} />} title={text.benchTitle} detail={text.benchBody} />
        <Row id="line" visual={<IconSymbol icon={Users} />} title={text.lineTitle} detail={text.lineBody} />
        <Row id="courier" visual={<IconSymbol icon={FileText} />} title={text.courierTitle} detail={text.courierBody} />
        <Row id="elevator" visual={<IconSymbol icon={ArrowUpDown} />} title={text.elevatorTitle} detail={text.elevatorBody} />
        <Row id="stairs" visual={<IconSymbol icon={Footprints} />} title={text.stairsTitle} detail={text.stairsBody} />
      </Section>

      <Section title={text.sections.emotes}>
        {emoteRows.map((row) => (
          <Row
            key={row.key}
            id={`emote-${row.key}`}
            visual={<IconSymbol icon={EMOTE_ICONS[row.key]} />}
            title={row.title}
          />
        ))}
      </Section>

      <Section title={text.sections.zoom}>
        <Row
          id="floor-chip"
          visual={<IconSymbol icon={Layers} />}
          title={text.chipTitle}
          detail={`${text.chipBody} (${[
            fmt(t.office.chipWorking, { n: 3 }),
            fmt(t.office.chipWaiting, { n: 1 }),
            fmt(t.office.chipReviewPile, { n: 2 }),
          ].join(' · ')})`}
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  )
}

function Row({
  id,
  visual,
  title,
  detail,
}: {
  id: string
  visual: ReactNode
  title: string
  detail?: string
}) {
  return (
    <li data-legend-row={id} className="flex items-start gap-3">
      <span aria-hidden="true" className="mt-0.5 flex h-6 w-9 shrink-0 items-center justify-center">
        {visual}
      </span>
      <span className="min-w-0 text-sm">
        <span className="block font-medium text-foreground">{title}</span>
        {detail && <span className="block text-xs text-muted-foreground">{detail}</span>}
      </span>
    </li>
  )
}

function StatusSymbol({ row, animate }: { row: LegendStatusRow; animate: boolean }) {
  const Icon = row.icon ? STATUS_ICONS[row.icon] : FileText
  const colour = row.hex ?? undefined
  return (
    <span
      className={cn(
        'relative inline-flex size-6 items-center justify-center rounded-full',
        row.ring === 'solid' && 'border-2',
        row.ring === 'dashed' && 'border-2 border-dashed',
        row.pulse && animate && 'motion-safe:animate-pulse',
      )}
      style={{ borderColor: colour, color: colour }}
    >
      <Icon className="size-3.5" />
    </span>
  )
}

function PileSymbol({ topHex, count = 4 }: { topHex: string | null; count?: number }) {
  return (
    <span className="relative flex w-7 flex-col-reverse items-center gap-px">
      {Array.from({ length: count }, (_, i) => {
        const isTop = i === count - 1
        return (
          <span
            key={i}
            className="h-1 w-7 rounded-[1px] border border-border bg-surface"
            style={isTop && topHex ? { backgroundColor: topHex, borderColor: topHex } : undefined}
          />
        )
      })}
      {topHex === null && (
        <span className="absolute -right-1.5 -top-2 rounded bg-foreground px-0.5 text-[9px] leading-tight font-bold text-background">
          {count}
        </span>
      )}
    </span>
  )
}

function IconSymbol({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className="size-4 text-foreground" />
}
