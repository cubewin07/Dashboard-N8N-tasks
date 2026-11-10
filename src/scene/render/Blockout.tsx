import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FloorLayout } from '@/scene/layout'
import { blockoutFor, type BlockoutMeshKind } from './blockoutSpec'
import { toWorldX, toWorldZ } from './coords'

interface InstanceTransform {
  position: [number, number, number]
  rotY: number
}

interface MeshBatch {
  key: string
  kind: BlockoutMeshKind
  size: [number, number, number]
  color: THREE.Color
  faded: boolean
  capacity: number
  instances: InstanceTransform[]
}

interface InstancedBatchProps {
  batch: MeshBatch
}

const SHADOW_CASTING_KINDS: ReadonlySet<BlockoutMeshKind> = new Set([
  'desk',
  'review_desk',
  'private_office',
  'manager_office',
  'boss_desk',
  'meeting_table',
  'sofa',
  'coffee_counter',
  'pingpong',
  'arcade',
  'boardgame',
  'karaoke',
  'bed',
])

const tempObject = new THREE.Object3D()

function InstancedBatchMesh({ batch }: InstancedBatchProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const count = batch.instances.length
    mesh.count = count
    mesh.visible = count > 0
    if (count === 0) return

    batch.instances.forEach((inst, idx) => {
      tempObject.position.set(inst.position[0], inst.position[1], inst.position[2])
      tempObject.rotation.set(0, inst.rotY, 0)
      tempObject.scale.set(1, 1, 1)
      tempObject.updateMatrix()
      mesh.setMatrixAt(idx, tempObject.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [batch])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, batch.capacity]}
      castShadow={!batch.faded && SHADOW_CASTING_KINDS.has(batch.kind)}
      receiveShadow
    >
      <boxGeometry args={batch.size} />
      <meshStandardMaterial
        color={batch.color}
        roughness={0.75}
        transparent={batch.faded}
        opacity={batch.faded ? 0.15 : 1}
        depthWrite={!batch.faded}
      />
    </instancedMesh>
  )
}

export interface BlockoutProps {
  floors: readonly FloorLayout[]
  activeFloorIndex: number | null
  /** `floorKey/slotId` of slots already drawn as models; their boxes are skipped. */
  skipSlots?: ReadonlySet<string>
}

export function Blockout({ floors, activeFloorIndex, skipSlots }: BlockoutProps) {
  const batches = useMemo(() => {
    const countsByKind = new Map<BlockoutMeshKind, number>()
    for (const floor of floors) {
      for (const slot of floor.slots) {
        const spec = blockoutFor(slot)
        if (!spec.render) continue
        for (const part of spec.parts) {
          countsByKind.set(part.kind, (countsByKind.get(part.kind) ?? 0) + 1)
        }
      }
    }

    const map = new Map<string, MeshBatch>()

    for (const floor of floors) {
      for (const slot of floor.slots) {
        const spec = blockoutFor(slot)
        if (!spec.render) continue
        for (const part of spec.parts) {
          const totalForKind = countsByKind.get(part.kind) ?? 1
          const capacity = Math.max(16, Math.ceil(totalForKind / 16) * 16)
          for (const faded of [false, true]) {
            const batchKey = `${part.kind}::${faded ? 'faded' : 'opaque'}`
            if (!map.has(batchKey)) {
              map.set(batchKey, {
                key: batchKey,
                kind: part.kind,
                size: part.size,
                color: part.color,
                faded,
                capacity,
                instances: [],
              })
            }
          }
        }
      }
    }

    for (const floor of floors) {
      const faded = activeFloorIndex !== null && floor.index > activeFloorIndex
      // Same cut-away as the floors: one ghost floor above the focus, no more.
      if (faded && floor.index > activeFloorIndex + 1) continue
      const { w, d } = floor.size

      for (const slot of floor.slots) {
        const spec = blockoutFor(slot)
        if (!spec.render) continue
        if (skipSlots?.has(`${floor.key}/${slot.id}`)) continue

        const cos = Math.cos(slot.rotY)
        const sin = Math.sin(slot.rotY)

        for (const part of spec.parts) {
          const [lx, ly, lz] = part.localOffset
          const localX = slot.x + lx * cos + lz * sin
          const localZ = slot.z - lx * sin + lz * cos
          const wx = toWorldX(localX, w)
          const wy = floor.y + ly
          const wz = toWorldZ(localZ, d)

          const batchKey = `${part.kind}::${faded ? 'faded' : 'opaque'}`
          const batch = map.get(batchKey)
          if (batch) {
            batch.instances.push({
              position: [wx, wy, wz],
              rotY: -slot.rotY,
            })
          }
        }
      }
    }

    return Array.from(map.values())
  }, [floors, activeFloorIndex, skipSlots])

  return (
    <group name="building-blockout">
      {batches.map((batch) => (
        <InstancedBatchMesh key={`${batch.key}::${batch.capacity}`} batch={batch} />
      ))}
    </group>
  )
}
