import { useEffect, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OrbitControls, Text } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import platformsJson from '@/content/platforms.json'
import type { Platform } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import { VISUAL_STATUS_KEYS, type VisualStatusKey } from '@/domain/visual'
import { idleBehaviours, visualLanguage } from '@/office/visualConfig'
import { isSeatedPose, POSE_KEYS, toPoseKey, type PoseKey } from '@/scene/director/poses'
import { CapsulePeople } from '@/scene/render/CapsulePeople'
import { lodRuntime } from '@/scene/render/lod'
import { SCENE_PALETTE } from '@/scene/render/palette'
import { PersonIndicators } from '@/scene/render/PersonIndicators'
import type { PersonVisualInput } from '@/scene/render/PersonVisual'

const COLUMNS = 6
const SPACING = 2.2
const SWATCHES = ['cs', 'marketing', 'design', 'accounting', 'management', 'boss']
const STATUSES: (VisualStatusKey | null)[] = [null, ...VISUAL_STATUS_KEYS]
const PLATFORMS = (platformsJson as Platform[]).map((p) => p.key)
const FONT_URL = `${import.meta.env.BASE_URL}assets/fonts/BeVietnamPro-SemiBold.ttf`

interface Tile {
  input: PersonVisualInput
  caption: string
  x: number
  z: number
}

function grid(index: number, total: number, z0: number): [number, number] {
  const rows = Math.ceil(total / COLUMNS)
  const col = index % COLUMNS
  const row = Math.floor(index / COLUMNS)
  return [(col - (COLUMNS - 1) / 2) * SPACING, z0 + (row - (rows - 1) / 2) * SPACING * 1.25]
}

const CARRY: Partial<Record<PoseKey, PersonVisualInput['carrying']>> = {
  carry_walk: 'document',
  sit_phone: 'phone',
  sit_work: 'laptop',
  sit_read: 'document',
  coffee: 'document',
}

function base(id: string, pose: PoseKey, x: number, z: number, i: number): PersonVisualInput {
  return {
    id: id as EmployeeId,
    x,
    y: 0,
    z,
    yaw: 0,
    pose,
    seated: isSeatedPose(pose),
    speed01: pose === 'walk' || pose === 'carry_walk' ? 1 : 0,
    carrying: null,
    tintSwatch: SWATCHES[i % SWATCHES.length]!,
    status: null,
    platformKey: null,
    emote: null,
    saturation: 1,
    floorIndex: 0,
    hovered: false,
    selected: false,
    followed: false,
    opacity: 1,
    lod: 0,
  }
}

/** Every pose key, cycling through the status looks, carried items and badges. */
function poseTiles(z0: number): Tile[] {
  return POSE_KEYS.map((pose, i) => {
    const [x, z] = grid(i, POSE_KEYS.length, z0)
    const input = base(`pose_${pose}`, pose, x, z, i)
    input.carrying = CARRY[pose] ?? null
    input.status = STATUSES[i % STATUSES.length]!
    input.saturation = input.status ? 1 : visualLanguage.idle.saturation
    input.platformKey = i % 3 === 1 ? PLATFORMS[i % PLATFORMS.length]! : null
    input.selected = i === 1
    input.followed = i === 2
    input.opacity = i === POSE_KEYS.length - 1 ? 0.5 : 1
    return { input, caption: input.status ? `${pose} · ${input.status}` : pose, x, z }
  })
}

/** P05-T10 gallery: every idle option in `idle-behaviours.json` with its pose and emote. */
function idleTiles(z0: number): Tile[] {
  const options = idleBehaviours.options
  return options.map((o, i) => {
    const [x, z] = grid(i, options.length, z0)
    const pose = toPoseKey(o.anim)
    const input = base(`idle_${o.key}`, pose, x, z, i)
    input.emote = o.emote ?? null
    input.saturation = visualLanguage.idle.saturation
    return { input, caption: `${o.key}\n${o.anim}${o.emote ? ` · ${o.emote}` : ''}`, x, z }
  })
}

function Gallery({ tiles }: { tiles: Tile[] }) {
  const rootRef = useRef<THREE.Group>(null)
  const peopleRef = useRef<CapsulePeople | null>(null)
  const indicatorsRef = useRef<PersonIndicators | null>(null)
  const inputs = useMemo(() => tiles.map((t) => t.input), [tiles])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    // The gallery is one "floor" seen up close.
    lodRuntime.bands.length = 0
    lodRuntime.bands[0] = 'near'
    const people = new CapsulePeople()
    const indicators = new PersonIndicators()
    indicators.setPlatforms(platformsJson as Platform[])
    peopleRef.current = people
    indicatorsRef.current = indicators
    root.add(people.object, indicators.object)
    return () => {
      peopleRef.current = null
      indicatorsRef.current = null
      root.remove(people.object, indicators.object)
      people.dispose()
      indicators.dispose()
      lodRuntime.bands.length = 0
    }
  }, [])

  useFrame((frame, delta) => {
    const t = frame.clock.elapsedTime
    tiles.forEach((tile) => {
      const input = tile.input
      if (input.speed01 === 0) return
      input.x = tile.x + Math.sin(t * 1.3) * 0.6
      input.yaw = Math.cos(t * 1.3) >= 0 ? Math.PI / 2 : -Math.PI / 2
    })
    const dt = Math.min(delta, 0.1)
    const people = peopleRef.current
    if (!people) return
    people.sync(inputs, inputs.length, dt)
    indicatorsRef.current?.sync(inputs, inputs.length, people, frame.camera.position, dt)
  })

  return (
    <group ref={rootRef}>
      {tiles.map((tile) => (
        <Text
          key={tile.input.id}
          position={[tile.x, 0.02, tile.z + 0.75]}
          rotation={[-Math.PI / 2, 0, 0]}
          font={FONT_URL}
          fontSize={0.17}
          lineHeight={1.2}
          textAlign="center"
          anchorX="center"
          anchorY="top"
          color={SCENE_PALETTE.people.label}
        >
          {tile.caption}
        </Text>
      ))}
    </group>
  )
}

/**
 * Dev only (`#/dev/people`): the capsule look for every pose the director can
 * ask for, with status rings, icons and badges, and (P05-T10) every idle
 * option with its pose and emote. `?gallery=idle` (where
 * `#/office?debug=idle` forwards) shows only the idle options.
 */
export function PosePage() {
  const [params] = useSearchParams()
  const idleOnly = params.get('gallery') === 'idle'
  const tiles = useMemo(() => {
    const idle = idleTiles(0)
    if (idleOnly) return idle
    const idleRows = Math.ceil(idle.length / COLUMNS)
    const poseRows = Math.ceil(POSE_KEYS.length / COLUMNS)
    const gap = ((idleRows + poseRows) / 2 + 0.6) * SPACING * 1.25
    return [...poseTiles(-gap / 2), ...idleTiles(gap / 2)]
  }, [idleOnly])

  return (
    <div
      data-pose-page
      data-gallery={idleOnly ? 'idle' : 'all'}
      className="h-[calc(100dvh-8rem)] min-h-[420px] w-full overflow-hidden rounded-[14px] border border-border bg-surface"
    >
      <Canvas key={idleOnly ? 'idle' : 'all'} shadows camera={{ position: [0, idleOnly ? 8 : 14, idleOnly ? 9 : 16], fov: 35 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[6, 12, 8]} intensity={1.6} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color={SCENE_PALETTE.people.labelOutline} roughness={1} />
        </mesh>
        <Gallery tiles={tiles} />
        <OrbitControls makeDefault target={[0, 0.6, 0]} />
      </Canvas>
    </div>
  )
}
