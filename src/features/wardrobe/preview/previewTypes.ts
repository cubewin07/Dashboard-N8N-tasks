export const PREVIEW_CLIPS = ['idle', 'walk', 'sit_idle', 'wave'] as const
export type PreviewClip = (typeof PREVIEW_CLIPS)[number]
export type PreviewZoom = 'body' | 'head'

/** Camera framing per zoom preset (metres; the character stands at the origin facing +Z). */
export const ZOOM_FRAMES: Readonly<Record<PreviewZoom, { y: number; z: number; lookY: number }>> = {
  body: { y: 1.05, z: 4.1, lookY: 0.88 },
  head: { y: 1.55, z: 1.55, lookY: 1.5 },
}
