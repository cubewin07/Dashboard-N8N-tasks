import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { decorKind, type DecorKind } from './decorModel'
import { getSwatchColor, SCENE_PALETTE } from './palette'
import { activeFloorIndexOf, isCutAway, placeInSlot } from './place'

/** Size (m) and centre height of each non-plant decor prop. Plants stay in `Blockout`. */
const PROPS: Record<Exclude<DecorKind, 'plant'>, { size: [number, number, number]; y: number }> = {
  counter: { size: [2.0, 1.05, 0.6], y: 0.525 },
  board: { size: [1.6, 1.5, 0.06], y: 1.15 },
}

const tmp = new THREE.Object3D()

interface Placed {
  floorIndex: number
  matrix: THREE.Matrix4
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

function writeProps(mesh: THREE.InstancedMesh | null, list: readonly Placed[], active: number | null): void {
  if (!mesh) return
  list.forEach((p, i) => mesh.setMatrixAt(i, isCutAway(p.floorIndex, active) ? ZERO : p.matrix))
  mesh.instanceMatrix.needsUpdate = true
  mesh.computeBoundingSphere()
}

export interface DecorProps {
  layout: BuildingLayout
}

/**
 * P05-T12 (R11): decor slots that are fixed props rather than plants
 * (reception counter, intake desk, task wall). One instanced mesh per prop
 * kind; plants are drawn by `Blockout` (see `blockoutFor`).
 */
export function Decor({ layout }: DecorProps) {
  const counterRef = useRef<THREE.InstancedMesh>(null)
  const boardRef = useRef<THREE.InstancedMesh>(null)
  const lastActive = useRef<number | null | undefined>(undefined)

  const placed = useMemo(() => {
    const out: Record<'counter' | 'board', Placed[]> = { counter: [], board: [] }
    for (const floor of layout.floors) {
      for (const slot of floor.slots) {
        const kind = decorKind(slot)
        if (!kind || kind === 'plant') continue
        placeInSlot(tmp, floor, slot, [0, PROPS[kind].y, 0])
        tmp.scale.set(1, 1, 1)
        tmp.updateMatrix()
        out[kind].push({ floorIndex: floor.index, matrix: tmp.matrix.clone() })
      }
    }
    return out
  }, [layout])

  useLayoutEffect(() => {
    lastActive.current = undefined
  }, [placed])

  useFrame(() => {
    const active = activeFloorIndexOf(layout, useViewStore.getState())
    if (active === lastActive.current) return
    lastActive.current = active
    writeProps(counterRef.current, placed.counter, active)
    writeProps(boardRef.current, placed.board, active)
  })

  return (
    <group name="decor-props">
      {placed.counter.length > 0 ? (
        <instancedMesh
          key={`c${placed.counter.length}`}
          ref={counterRef}
          args={[undefined, undefined, placed.counter.length]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={PROPS.counter.size} />
          <meshStandardMaterial color={SCENE_PALETTE.blockout.coffeeCounter} roughness={0.75} />
        </instancedMesh>
      ) : null}
      {placed.board.length > 0 ? (
        <instancedMesh
          key={`b${placed.board.length}`}
          ref={boardRef}
          args={[undefined, undefined, placed.board.length]}
          receiveShadow
        >
          <boxGeometry args={PROPS.board.size} />
          <meshStandardMaterial color={getSwatchColor('paper')} roughness={0.6} />
        </instancedMesh>
      ) : null}
    </group>
  )
}
