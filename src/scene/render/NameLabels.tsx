import { useImperativeHandle, useRef, type Ref } from 'react'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import type { EmployeeId } from '@/domain/primitives'
import { visualLanguage } from '@/office/visualConfig'
import { bandOf } from './lod'
import { SCENE_PALETTE } from './palette'
import type { PersonVisualInput, PersonVisualSystem } from './PersonVisual'

const FONT_URL = `${import.meta.env.BASE_URL}assets/fonts/BeVietnamPro-SemiBold.ttf`
const POOL = visualLanguage.lod.maxNames
/** Names sit above the status icon. */
const LIFT = visualLanguage.icon.gap + visualLanguage.icon.size + 0.06

/** The troika mesh behind drei's `<Text>` (drei types its ref as any). */
interface TroikaText extends THREE.Mesh {
  text: string
  sync: () => void
}

export interface NameLabelsFrame {
  inputs: readonly PersonVisualInput[]
  count: number
  visual: PersonVisualSystem
  camera: THREE.Camera
  /** Label text for a person (name, optionally a task title on a second line). */
  textOf: (id: EmployeeId) => string
  /** Shown by the hover / selection label already. */
  excludeId: EmployeeId | null
}

export interface NameLabelsHandle {
  /** Place the pool for this frame; returns how many labels are in use. */
  update: (frame: NameLabelsFrame) => number
}

interface Candidate {
  index: number
  rank: number
  d2: number
}

const head = new THREE.Vector3()

/**
 * Names over people on near floors (P05-T13, R12): a fixed pool of troika
 * texts (max `lod.maxNames`), given to the selected person first, then
 * working people, then the rest, nearest first. Nothing is shown on mid or
 * far floors. Driven imperatively by `<People>`; never re-renders.
 */
export function NameLabels({ ref }: { ref: Ref<NameLabelsHandle> }) {
  const slots = useRef<(TroikaText | null)[]>([])
  const owner = useRef<(EmployeeId | null)[]>(Array.from({ length: POOL }, () => null))
  const shown = useRef<string[]>(Array.from({ length: POOL }, () => ''))
  const scratch = useRef<{ list: Candidate[]; pool: Candidate[]; keep: Set<EmployeeId> }>({
    list: [],
    pool: [],
    keep: new Set(),
  })

  useImperativeHandle(
    ref,
    () => ({
      update: ({ inputs, count, visual, camera, textOf, excludeId }) => {
        const { list, pool, keep } = scratch.current
        list.length = 0
        for (let i = 0; i < count; i += 1) {
          const p = inputs[i]!
          if (p.id === excludeId || p.opacity < 0.5) continue
          if (bandOf(p.floorIndex) !== 'near') continue
          if (!visual.headAt(i, head)) continue
          const c = pool[list.length] ?? (pool[list.length] = { index: 0, rank: 0, d2: 0 })
          c.index = i
          c.rank = p.selected ? 0 : p.status ? 1 : 2
          c.d2 = camera.position.distanceToSquared(head)
          list.push(c)
        }
        list.sort((a, b) => a.rank - b.rank || a.d2 - b.d2)
        if (list.length > POOL) list.length = POOL

        // Keep each person on the slot they had, so texts re-layout rarely.
        keep.clear()
        for (const c of list) keep.add(inputs[c.index]!.id)
        const owners = owner.current
        for (let s = 0; s < POOL; s += 1) {
          const id = owners[s]
          if (id && !keep.has(id)) owners[s] = null
        }
        let free = 0
        for (const c of list) {
          const id = inputs[c.index]!.id
          let s = owners.indexOf(id)
          if (s < 0) {
            while (free < POOL && owners[free] !== null) free += 1
            if (free >= POOL) continue
            s = free
            owners[s] = id
          }
          const mesh = slots.current[s]
          if (!mesh || !visual.headAt(c.index, head)) continue
          const text = textOf(id)
          if (shown.current[s] !== text) {
            shown.current[s] = text
            mesh.text = text
            mesh.sync()
          }
          mesh.position.set(head.x, head.y + LIFT, head.z)
          mesh.quaternion.copy(camera.quaternion)
          mesh.visible = true
        }
        for (let s = 0; s < POOL; s += 1) {
          const mesh = slots.current[s]
          if (mesh && owners[s] === null) mesh.visible = false
        }
        return list.length
      },
    }),
    [],
  )

  return (
    <group name="name-labels">
      {Array.from({ length: POOL }, (_, i) => (
        <Text
          key={i}
          ref={(m: TroikaText | null) => {
            slots.current[i] = m
          }}
          visible={false}
          font={FONT_URL}
          fontSize={0.2}
          lineHeight={1.15}
          textAlign="center"
          anchorX="center"
          anchorY="bottom"
          color={SCENE_PALETTE.people.label}
          outlineWidth={0.022}
          outlineColor={SCENE_PALETTE.people.labelOutline}
          renderOrder={19}
          material-toneMapped={false}
        >
          {''}
        </Text>
      ))}
    </group>
  )
}
