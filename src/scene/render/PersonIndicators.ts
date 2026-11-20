import * as THREE from 'three'
import { visualLanguage } from '@/office/visualConfig'
import { hashString } from '@/scene/director/rng'
import type { BadgeSource } from './badgeAtlas'
import { Emotes, selectEmotes, type EmoteCandidate } from './Emotes'
import { iconBob, MIN_VISIBLE_OPACITY, StatusEase } from './indicatorAnim'
import { bandOf } from './lod'
import { getSwatchColor } from './palette'
import type { PersonVisualInput, PersonVisualSystem } from './PersonVisual'
import { PlatformBadges } from './PlatformBadges'
import { StatusIcons } from './StatusIcons'
import { StatusRings } from './StatusRings'

const RING_LIFT = 0.03

export interface IndicatorCounts {
  rings: number
  icons: number
  badges: number
  emotes: number
}

const head = new THREE.Vector3()

/**
 * Everything drawn over people that says what they are doing (P05 §3.2):
 * status rings (every band), status icons, platform badges and emotes
 * (mid / near only, R12). Four draw calls for the whole building. Reads the
 * person visual only through `headAt`, so it outlives the capsule look.
 */
export class PersonIndicators {
  readonly object = new THREE.Group()
  readonly rings: StatusRings
  readonly icons: StatusIcons
  readonly badges: PlatformBadges
  readonly emotes: Emotes
  readonly counts: IndicatorCounts = { rings: 0, icons: 0, badges: 0, emotes: 0 }

  private readonly candidates: EmoteCandidate[] = []
  private readonly chosen: EmoteCandidate[] = []
  private readonly pool: EmoteCandidate[] = []
  private readonly ease = new StatusEase()
  private motion = 1
  /** Real seconds (eases), and paused-aware seconds (icon bob). */
  private easeTime = 0
  private bobTime = 0

  constructor(capacity = 160) {
    this.object.name = 'person-indicators'
    this.rings = new StatusRings(capacity)
    this.icons = new StatusIcons(capacity)
    this.badges = new PlatformBadges(capacity)
    this.emotes = new Emotes()
    this.object.add(this.rings.mesh, this.icons.object, this.badges.object, this.emotes.object)
  }

  setReducedMotion(reduced: boolean): void {
    this.motion = reduced ? 0 : 1
    this.rings.setReducedMotion(reduced)
    this.emotes.setReducedMotion(reduced)
  }

  setPlatforms(platforms: readonly BadgeSource[]): void {
    this.badges.setPlatforms(platforms)
  }

  sync(
    inputs: readonly PersonVisualInput[],
    count: number,
    visual: PersonVisualSystem,
    camera: THREE.Vector3,
    dt: number,
    /** Real seconds; keeps easing and pops going while the office is paused. */
    realDt: number = dt,
  ): IndicatorCounts {
    this.easeTime += realDt
    this.bobTime += dt
    this.ease.begin()
    this.rings.advance(dt)
    this.rings.begin()
    this.icons.begin()
    this.badges.begin()
    this.emotes.begin(realDt)
    this.candidates.length = 0

    for (let i = 0; i < count; i += 1) {
      const p = inputs[i]!
      if (p.opacity <= MIN_VISIBLE_OPACITY || !visual.headAt(i, head)) continue
      const near = bandOf(p.floorIndex) !== 'far'
      // Rings, icons and badges fade with the person (arriving, leaving).
      const fade = p.opacity
      if (p.status) {
        const look = visualLanguage.status[p.status]
        const color = getSwatchColor(look.swatch)
        const eased = this.ease.value(p.id, p.status, this.easeTime, this.motion === 0)
        const alpha = fade * eased
        const phase = (hashString(p.id) % 1000) / 1000
        if (look.ring) {
          this.rings.push(p.x, p.y + RING_LIFT, p.z, color, look.ringPulse ? phase : null, look.ringDashed, alpha)
        }
        if (near && look.icon) {
          const bob = iconBob(this.bobTime, phase, this.motion)
          this.icons.push(head.x, head.y + bob, head.z, look.icon, color, Math.max(0.001, alpha))
        }
      }
      if (!near) continue
      if (p.platformKey) this.badges.push(head.x, head.y, head.z, p.platformKey, fade)
      if (p.emote) {
        const n = this.candidates.length
        const c = this.pool[n] ?? (this.pool[n] = { index: 0, x: 0, y: 0, z: 0 })
        c.index = i
        c.x = head.x
        c.y = head.y
        c.z = head.z
        this.candidates.push(c)
      }
    }

    selectEmotes(this.candidates, camera, visualLanguage.emotes.max, this.chosen)
    for (const c of this.chosen) {
      const p = inputs[c.index]!
      if (p.emote) this.emotes.push(p.id, c.x, c.y, c.z, p.emote, p.opacity)
    }

    this.ease.prune()
    this.counts.rings = this.rings.end()
    this.counts.icons = this.icons.end()
    this.counts.badges = this.badges.end()
    this.counts.emotes = this.emotes.end()
    return this.counts
  }

  dispose(): void {
    this.rings.dispose()
    this.icons.dispose()
    this.badges.dispose()
    this.emotes.dispose()
    this.object.clear()
  }
}
