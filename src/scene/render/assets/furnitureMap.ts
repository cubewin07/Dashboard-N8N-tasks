import { z } from 'zod'
import raw from '@/content/furniture-map.json'

/**
 * `src/content/furniture-map.json`: which model stands on which slot (P06b R1).
 * Lookup order for a slot: slot id, slot id without its `_N` suffix, then slot
 * type; at each step the floor template's override is tried before the global.
 */
const ModelRefSchema = z.object({
  model: z.string().min(1),
  weight: z.number().positive().optional(),
  /** Extra turn (radians) on top of the slot rotation. */
  rotY: z.number().optional(),
  /** Use only this named node of the file (e.g. one cat pose). */
  node: z.string().min(1).optional(),
})

const CompanionSchema = z.object({
  model: z.string().min(1),
  /** Anchor kind on the main model; one companion per matching anchor. */
  anchor: z.string().min(1).optional(),
  /** Position in the main model's space (metres) when no anchor is given. */
  offset: z.tuple([z.number(), z.number(), z.number()]).optional(),
  rotY: z.number().optional(),
  chance: z.number().min(0).max(1).optional(),
  node: z.string().min(1).optional(),
})

const SlotArtSchema = z.object({
  models: z.array(ModelRefSchema),
  companions: z.array(CompanionSchema).optional(),
  /** Draw the P02 blockout box while the model is missing. */
  fallback: z.boolean(),
})

const ExtraSchema = z.object({
  model: z.string().min(1),
  /** Floor-local metres, same frame and rotation convention as slots. */
  x: z.number(),
  z: z.number(),
  y: z.number().optional(),
  rotY: z.number().optional(),
  node: z.string().min(1).optional(),
})

const KitSchema = z.object({
  wallBack: z.array(z.string().min(1)).min(1),
  wallSide: z.array(z.string().min(1)).min(1),
  wallInterior: z.string().min(1),
  doorInterior: z.string().min(1),
  terraceRail: z.string().min(1),
  column: z.string().min(1),
  stairsFlight: z.string().min(1),
  stairsLanding: z.string().min(1),
  shaftFrame: z.string().min(1),
  elevatorCar: z.string().min(1),
  elevatorDoor: z.string().min(1),
})

const ExteriorSchema = z.object({
  /** Building-centred metres; +Z is the street in front. `rotY` 0 faces the street. */
  props: z.array(
    z.object({
      model: z.string().min(1),
      x: z.number(),
      z: z.number(),
      y: z.number().optional(),
      rotY: z.number().optional(),
    }),
  ),
  /** Roof sign; its text is drawn at runtime on the model's `text` anchor. */
  sign: z
    .object({
      model: z.string().min(1),
      x: z.number(),
      z: z.number(),
      aboveRoof: z.number(),
    })
    .optional(),
})

/**
 * Parts that move or change at runtime (P06b-T06). The components that draw
 * them read their model and node names from here, never from code.
 */
const LifeSchema = z.object({
  /** Emissive node on a desk model that shows its owner's state. */
  deskScreen: z.string().min(1),
  clock: z.object({ model: z.string().min(1), hour: z.string().min(1), minute: z.string().min(1) }),
  fan: z.object({ model: z.string().min(1), blades: z.string().min(1) }),
  aquarium: z.object({ model: z.string().min(1), fish: z.string().min(1) }),
  /** The roaming cat: one node per pose of one file. */
  cat: z.object({
    model: z.string().min(1),
    walk: z.string().min(1),
    sit: z.string().min(1),
    sleep: z.string().min(1),
  }),
  /** One unit of a document pile. */
  paper: z.string().min(1),
  /** Model per `carries` kind; a kind without one keeps the plain box. */
  held: z.record(z.string(), z.string().min(1)),
  /** Sliding leaves of `kit.elevatorCar`. */
  elevator: z.object({ doorLeft: z.string().min(1), doorRight: z.string().min(1) }),
})

export const FurnitureMapSchema = z.object({
  version: z.literal(1),
  slots: z.record(z.string(), SlotArtSchema),
  templates: z
    .record(
      z.string(),
      z.object({
        slots: z.record(z.string(), SlotArtSchema).optional(),
        extras: z.array(ExtraSchema).optional(),
      }),
    )
    .optional(),
  life: LifeSchema.optional(),
  kit: KitSchema,
  exterior: ExteriorSchema.optional(),
})

export type ModelRef = z.infer<typeof ModelRefSchema>
export type Companion = z.infer<typeof CompanionSchema>
export type SlotArt = z.infer<typeof SlotArtSchema>
export type FurnitureExtra = z.infer<typeof ExtraSchema>
export type FurnitureKit = z.infer<typeof KitSchema>
export type FurnitureLife = z.infer<typeof LifeSchema>
export type FurnitureMap = z.infer<typeof FurnitureMapSchema>

export const FURNITURE_MAP: FurnitureMap = FurnitureMapSchema.parse(raw)

/** Every model name the map can ask for. */
export function listMapModels(map: FurnitureMap): string[] {
  const names = new Set<string>()
  const addArt = (art: SlotArt) => {
    art.models.forEach((m) => names.add(m.model))
    art.companions?.forEach((c) => names.add(c.model))
  }
  Object.values(map.slots).forEach(addArt)
  Object.values(map.templates ?? {}).forEach((tpl) => {
    Object.values(tpl.slots ?? {}).forEach(addArt)
    tpl.extras?.forEach((e) => names.add(e.model))
  })
  map.exterior?.props.forEach((e) => names.add(e.model))
  if (map.exterior?.sign) names.add(map.exterior.sign.model)
  const life = map.life
  if (life) {
    ;[life.clock.model, life.fan.model, life.aquarium.model, life.cat.model, life.paper].forEach(
      (n) => names.add(n),
    )
    Object.values(life.held).forEach((n) => names.add(n))
  }
  const kit = map.kit
  ;[...kit.wallBack, ...kit.wallSide].forEach((n) => names.add(n))
  ;[
    kit.wallInterior,
    kit.doorInterior,
    kit.terraceRail,
    kit.column,
    kit.stairsFlight,
    kit.stairsLanding,
    kit.shaftFrame,
    kit.elevatorCar,
    kit.elevatorDoor,
  ].forEach((n) => names.add(n))
  return [...names].sort()
}
