import * as THREE from 'three'
import { visualLanguage } from '@/office/visualConfig'
import { hashString } from '@/scene/director/rng'
import type { BadgeSource } from './badgeAtlas'
import { Emotes, selectEmotes, type EmoteCandidate } from './Emotes'
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

  constructor(capacity = 160) {
    this.object.name = 'person-indicators'
    this.rings = new StatusRings(capacity)
    this.icons = new StatusIcons(capacity)
    this.badges = new PlatformBadges(capacity)
    this.emotes = new Emotes()
    this.object.add(this.rings.mesh, this.icons.object, this.badges.object, this.emotes.object)
  }

  setReducedMotion(reduced: boolean): void {
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
  ): IndicatorCounts {
    this.rings.advance(dt)
    this.rings.begin()
    this.icons.begin()
    this.badges.begin()
    this.emotes.begin(dt)
    this.candidates.length = 0

    for (let i = 0; i < count; i += 1) {
      const p = inputs[i]!
      if (p.opacity < 0.5 || !visual.headAt(i, head)) continue
      const near = bandOf(p.floorIndex) !== 'far'
      if (p.status) {
        const look = visualLanguage.status[p.status]
        const color = getSwatchColor(look.swatch)
        if (look.ring) {
          const phase = look.ringPulse ? (hashString(p.id) % 1000) / 1000 : null
          this.rings.push(p.x, p.y + RING_LIFT, p.z, color, phase, look.ringDashed)
        }
        if (near && look.icon) this.icons.push(head.x, head.y, head.z, look.icon, color)
      }
      if (!near) continue
      if (p.platformKey) this.badges.push(head.x, head.y, head.z, p.platformKey)
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
      if (p.emote) this.emotes.push(p.id, c.x, c.y, c.z, p.emote)
    }

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
