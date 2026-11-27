import { z } from 'zod'
import { EventTypeSchema } from '@/domain/events'
import { LabelSchema } from '@/domain/primitives'

/**
 * A guided tour is data (phase-11 §3.4, D4): captions and order get tuned after a showing
 * without a code change. Camera steps use only the public camera API. What the simulator
 * does in a scene lives with the sim (`adapters/sim/content/tourDirections.json`, by step id),
 * reached through the optional `tourControls` extension; `simOnly` scenes are skipped without it.
 */
export const TourCameraSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('overview') }),
  z.object({ mode: z.literal('floor'), floorKey: z.string().min(1) }),
  z.object({
    mode: z.literal('follow'),
    followRole: z.string().min(1),
    departmentKey: z.string().min(1).optional(),
    /** Where to look when nobody with that role is in the office. */
    floorKey: z.string().min(1).optional(),
  }),
])

export const TourStepSchema = z.object({
  id: z.string().min(1),
  caption: LabelSchema,
  durationSec: z.number().positive().max(120),
  camera: TourCameraSchema,
  /** The scene shows something only the simulator makes happen: skipped on real data. */
  simOnly: z.boolean().optional(),
  /** Move on as soon as this event arrives (after `minSec`), or at `durationSec` at the latest. */
  waitFor: EventTypeSchema.optional(),
  minSec: z.number().nonnegative().optional(),
})

export const TourSchema = z.object({
  key: z.string().min(1),
  /** The sim restarts from this seed so every showing is the same. */
  seed: z.string().min(1),
  steps: z.array(TourStepSchema).min(1),
})

export type TourCamera = z.infer<typeof TourCameraSchema>
export type TourStep = z.infer<typeof TourStepSchema>
export type Tour = z.infer<typeof TourSchema>
