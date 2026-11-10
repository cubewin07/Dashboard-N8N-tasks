import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { FloorLayout } from '@/scene/layout'
import { SLOT_BLOCKOUT, type BlockoutMeshKind } from './blockoutSpec'
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
  instances: InstanceTransform[]
}

interface InstancedBatchProps {
  batch: MeshBatch
}

const tempObject = new THREE.Object3D()

function InstancedBatchMesh({ batch }: InstancedBatchProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

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
      args={[undefined, undefined, batch.instances.length]}
      castShadow={!batch.faded}
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
}

export function Blockout({ floors, activeFloorIndex }: BlockoutProps) {
  const batches = useMemo(() => {
    const map = new Map<string, MeshBatch>()

    for (const floor of floors) {
      const faded = activeFloorIndex !== null && floor.index > activeFloorIndex
      const { w, d } = floor.size

      for (const slot of floor.slots) {
        const spec = SLOT_BLOCKOUT[slot.type]
        if (!spec.render) continue

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
          let batch = map.get(batchKey)
          if (!batch) {
            batch = {
              key: batchKey,
              kind: part.kind,
              size: part.size,
              color: part.color,
              faded,
              instances: [],
            }
            map.set(batchKey, batch)
          }
          batch.instances.push({
            position: [wx, wy, wz],
            rotY: -slot.rotY,
          })
        }
      }
    }

    return Array.from(map.values())
  }, [floors, activeFloorIndex])

  return (
    <group name="building-blockout">
      {batches.map((batch) => (
        <InstancedBatchMesh key={`${batch.key}::${batch.instances.length}`} batch={batch} />
      ))}
    </group>
  )
}
