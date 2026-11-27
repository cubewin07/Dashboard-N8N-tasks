import { z } from 'zod'

/** `public/assets/manifest.json`, written by `npm run assets:manifest` (P06a). */
const Vec3 = z.tuple([z.number(), z.number(), z.number()])

const AnchorSchema = z.object({
  kind: z.string(),
  pos: Vec3,
  rotY: z.number(),
})

const ManifestEntrySchema = z.object({
  file: z.string().min(1),
  tris: z.number(),
  bytes: z.number(),
  bbox: z.object({ min: Vec3, max: Vec3 }),
  footprint: z.tuple([z.number(), z.number()]),
  anchors: z.array(AnchorSchema),
  nodes: z.array(z.string()),
})

export const AssetManifestSchema = z.object({
  version: z.number(),
  files: z.record(z.string(), ManifestEntrySchema),
})

export type ManifestAnchor = z.infer<typeof AnchorSchema>
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>
export type AssetManifest = z.infer<typeof AssetManifestSchema>

/** Public asset URL under the app base (GitHub Pages serves from a subpath). */
export function assetUrl(relPath: string, base: string = import.meta.env.BASE_URL): string {
  const cleanBase = base.endsWith('/') ? base : `${base}/`
  return `${cleanBase}assets/${relPath.replace(/^\/+/, '')}`
}
