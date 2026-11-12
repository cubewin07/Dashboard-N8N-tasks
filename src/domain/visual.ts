import { z } from 'zod'
import { SlotTypeSchema } from './config'

/**
 * Presentation data for the 3D office (P05). Pure schemas: the JSON lives in
 * `src/content/visual-language.json` and `src/content/idle-behaviours.json`,
 * the parsed values are exposed by `src/office/visualConfig.ts`.
 *
 * Colours are palette swatch keys (`src/content/palette.json`), never hex.
 */

const SwatchKeySchema = z.string().regex(/^[a-z][a-z0-9_]*$/, 'Expected a palette swatch key')
const HhmmSchema = z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:MM time')

/** Statuses that get a ring / icon (idle, resting and off_shift get none: R2). */
export const VISUAL_STATUS_KEYS = [
  'working',
  'reviewing',
  'helping',
  'delivering',
  'asking',
  'waiting_answer',
  'blocked',
  'in_meeting',
] as const
export type VisualStatusKey = (typeof VISUAL_STATUS_KEYS)[number]

/** Cells of the generated status icon atlas (`statusAtlas.ts`). */
export const STATUS_ICON_KEYS = [
  'laptop',
  'magnifier',
  'handshake',
  'question',
  'exclamation',
  'speech',
  'paper',
] as const
export type StatusIconKey = (typeof STATUS_ICON_KEYS)[number]

/** Cells of the emote atlas (`Emotes.tsx`). */
export const EMOTE_KEYS = ['talk', 'think', 'note', 'zzz', 'heart', 'coffee', 'ball', 'stuck', 'wave'] as const
export type EmoteKey = (typeof EMOTE_KEYS)[number]

export const StatusLookSchema = z.object({
  swatch: SwatchKeySchema,
  /** null = no icon. */
  icon: z.enum(STATUS_ICON_KEYS).nullable(),
  ring: z.boolean(),
  /** Ring drawn dashed (helping). */
  ringDashed: z.boolean().default(false),
  ringPulse: z.boolean(),
})
export type StatusLook = z.infer<typeof StatusLookSchema>

const statusShape = Object.fromEntries(VISUAL_STATUS_KEYS.map((k) => [k, StatusLookSchema])) as Record<
  VisualStatusKey,
  typeof StatusLookSchema
>

export const VisualLanguageSchema = z.object({
  status: z.object(statusShape),
  idle: z.object({
    /** Colour saturation of idle / resting people (0 grey … 1 full). */
    saturation: z.number().min(0).max(1),
    ring: z.literal(false),
  }),
  ring: z.object({
    innerRadius: z.number().positive(),
    outerRadius: z.number().positive(),
    /** Pulses never faster than 1 Hz (LAYOUT principle "live but quiet"). */
    pulseHz: z.number().positive().max(1),
    pulseAmount: z.number().min(0).max(1),
  }),
  icon: z.object({
    /** Billboard size (m) and gap above the head (m). */
    size: z.number().positive(),
    gap: z.number().min(0),
  }),
  badge: z.object({
    size: z.number().positive(),
    /** Side offset from the head (m). */
    offset: z.number(),
  }),
  pile: z.object({
    sheetHeight: z.number().positive(),
    maxSheets: z.number().int().positive(),
    sheetSize: z.tuple([z.number().positive(), z.number().positive()]),
    /** Top sheet edge colour per highest effective priority. */
    priorityEdge: z.object({
      urgent: SwatchKeySchema,
      high: SwatchKeySchema,
      normal: SwatchKeySchema,
      low: SwatchKeySchema,
    }),
    paperSwatch: SwatchKeySchema,
  }),
  lod: z.object({
    /** Camera distance to the floor centre (m). */
    nearMax: z.number().positive(),
    midMax: z.number().positive(),
    /** Hysteresis share (0.1 = 10 %). */
    hysteresis: z.number().min(0).max(0.5),
    maxNames: z.number().int().positive(),
  }),
  emotes: z.object({
    max: z.number().int().positive(),
    ttlSeconds: z.number().positive(),
    size: z.number().positive(),
  }),
  deskGlow: z.object({
    off: SwatchKeySchema,
    working: SwatchKeySchema,
    blocked: SwatchKeySchema,
    done: SwatchKeySchema,
  }),
  progressRing: z.object({
    radius: z.number().positive(),
    width: z.number().positive(),
    swatch: SwatchKeySchema,
    trackSwatch: SwatchKeySchema,
  }),
  dayNight: z.object({
    /** Default for the toggle (R11, D7). */
    enabledByDefault: z.boolean(),
    dawn: HhmmSchema,
    dusk: HhmmSchema,
  }),
  heldItems: z.object({
    /** Box size (m) per carried kind: [w, h, d]. */
    sizes: z.record(z.string(), z.tuple([z.number(), z.number(), z.number()])),
  }),
})
export type VisualLanguage = z.infer<typeof VisualLanguageSchema>

const PeopleCountSchema = z.union([z.literal(1), z.literal(2)])

export const IdleOptionSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    /** Slots the option happens at; empty = at the own desk. */
    slotTypes: z.array(SlotTypeSchema),
    minPeople: PeopleCountSchema,
    maxPeople: z.number().int().positive(),
    durationMinutes: z.tuple([z.number().positive(), z.number().positive()]),
    floors: z.enum(['own', 'leisure', 'any']),
    weight: z.number().min(0),
    when: z
      .object({
        hours: z.tuple([HhmmSchema, HhmmSchema]).optional(),
        lunch: z.boolean().optional(),
        night: z.boolean().optional(),
      })
      .optional(),
    /** Pose / animation key (`director/poses.ts`). */
    anim: z.string().min(1),
    emote: z.enum(EMOTE_KEYS).optional(),
  })
  .refine((o) => o.durationMinutes[0] <= o.durationMinutes[1], {
    message: 'durationMinutes must be [min, max]',
    path: ['durationMinutes'],
  })
  .refine((o) => o.maxPeople >= o.minPeople, {
    message: 'maxPeople must be ≥ minPeople',
    path: ['maxPeople'],
  })
export type IdleOption = z.infer<typeof IdleOptionSchema>

export const IdleBehavioursSchema = z
  .object({
    /** Choices stay stable inside one window of this many sim minutes. */
    epochMinutes: z.number().int().positive(),
    /** Pick among the top N by score. */
    topN: z.number().int().positive(),
    /** Score multiplier for an option chosen in the last 3 choices. */
    noveltyPenalty: z.number().min(0).max(1),
    /** Score multiplier for options on another floor. */
    otherFloorPenalty: z.number().min(0).max(1),
    /** At most this share of a department on a leisure floor at once. */
    maxDeptAwayShare: z.number().min(0).max(1),
    options: z.array(IdleOptionSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>()
    cfg.options.forEach((o, i) => {
      if (seen.has(o.key)) {
        ctx.addIssue({ code: 'custom', path: ['options', i, 'key'], message: `Duplicate idle option "${o.key}"` })
      }
      seen.add(o.key)
    })
  })
export type IdleBehaviours = z.infer<typeof IdleBehavioursSchema>

export function parseVisualLanguage(raw: unknown): VisualLanguage {
  return VisualLanguageSchema.parse(raw)
}

export function parseIdleBehaviours(raw: unknown): IdleBehaviours {
  return IdleBehavioursSchema.parse(raw)
}

