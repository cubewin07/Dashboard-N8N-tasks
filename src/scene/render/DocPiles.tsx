import { useLayoutEffect, useMemo, useRef } from 'react'
import { Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pileFor, pileTopPriority } from '@/domain/selectors'
import { useOfficeSelector } from '@/office/hooks'
import { useOffice } from '@/office/store'
import { visualLanguage } from '@/office/visualConfig'
import { useViewStore } from '@/scene/camera/viewStore'
import type { BuildingLayout } from '@/scene/layout'
import { getSharedMaterials } from './assets/materials'
import { getModelParts } from './assets/modelStore'
import { LIFE, useModelReady } from './liveParts'
import { bandOf } from './lod'
import { getSwatchColor, SCENE_PALETTE } from './palette'
import { peopleRuntime } from './peopleRuntime'
import { pileAnchors, pileInstances, pileOwnerIds, sheetJitter } from './pileModel'
import { activeFloorIndexOf, DESK_TOP, isCutAway, placeInSlot } from './place'

const FONT_URL = `${import.meta.env.BASE_URL}assets/fonts/BeVietnamPro-SemiBold.ttf`
const LABEL_GAP = 0.12

/** The troika mesh behind drei `<Text>`, as far as we touch it. */
type TroikaText = THREE.Mesh & { text: string; sync: () => void }

const tmp = new THREE.Object3D()
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

export interface DocPilesProps {
  layout: BuildingLayout
}

/**
 * P05-T05 (R4, R6): one instanced mesh of paper sheets for every approver
 * and owner pile, the top sheet tinted by the pile's highest effective
 * priority, plus a pooled count label per pile at mid/near LOD. Height
 * follows `pileVisualCount` so a paper joins the pile when its courier
 * arrives, not at event time.
 */
export function DocPiles({ layout }: DocPilesProps) {
  const config = useOfficeSelector((s) => s?.config ?? null)
  const { maxSheets, sheetHeight, sheetSize, priorityEdge, paperSwatch } = visualLanguage.pile
  const anchors = useMemo(
    () => (config ? pileAnchors(layout, pileOwnerIds(config)) : []),
    [layout, config],
  )
  const jitters = useMemo(
    () => anchors.map((a) => sheetJitter(a.employeeId, maxSheets)),
    [anchors, maxSheets],
  )
  const capacity = Math.max(1, anchors.length * maxSheets)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const labelRefs = useRef<Array<TroikaText | null>>([])
  // Per pile: what was last written, so matrices change only when a pile does.
  const lastRef = useRef<string[]>([])

  const paperReady = useModelReady(LIFE?.paper)
  // One sheet: the paper model squashed to sheet size and thickness, centred
  // like the P05 box it replaces; the box stays until the model loads.
  const geometry = useMemo(() => {
    const thickness = sheetHeight * 0.85
    const part = LIFE && paperReady ? getModelParts(LIFE.paper)?.find((p) => p.kind === 'palette') : null
    if (!part) return new THREE.BoxGeometry(sheetSize[0], thickness, sheetSize[1])
    const g = part.geometry.clone()
    g.computeBoundingBox()
    const long = g.boundingBox!
    // Lay the paper's long side along x, like the sheet size.
    if (long.max.z - long.min.z > long.max.x - long.min.x) g.rotateY(Math.PI / 2)
    g.computeBoundingBox()
    const b = g.boundingBox!
    const c = new THREE.Vector3()
    b.getCenter(c)
    g.translate(-c.x, -c.y, -c.z)
    g.scale(
      sheetSize[0] / Math.max(1e-3, b.max.x - b.min.x),
      thickness / Math.max(1e-3, b.max.y - b.min.y),
      sheetSize[1] / Math.max(1e-3, b.max.z - b.min.z),
    )
    return g
  }, [sheetSize, sheetHeight, paperReady])
  const sheetMaterial = paperReady ? getSharedMaterials().palette : null
  useLayoutEffect(() => () => geometry.dispose(), [geometry])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const paper = getSwatchColor(paperSwatch)
    for (let i = 0; i < capacity; i += 1) {
      mesh.setMatrixAt(i, ZERO)
      mesh.setColorAt(i, paper)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    lastRef.current = anchors.map(() => '')
  }, [anchors, capacity, paperSwatch, geometry])

  useFrame(({ camera }) => {
    const mesh = meshRef.current
    const state = useOffice.getState().state
    if (!mesh || !state) return
    const director = peopleRuntime.director
    const active = activeFloorIndexOf(layout, useViewStore.getState())
    const paper = getSwatchColor(paperSwatch)
    let matricesDirty = false
    let coloursDirty = false

    for (let p = 0; p < anchors.length; p += 1) {
      const anchor = anchors[p]!
      const floor = layout.floors[anchor.floorIndex]
      if (!floor) continue
      const domainCount = pileFor(state, anchor.employeeId).length
      const transit = director ? director.inTransit(anchor.employeeId) : 0
      const { sheets, label } = pileInstances(domainCount, transit, maxSheets)
      const hidden = isCutAway(anchor.floorIndex, active)
      const top = sheets > 0 ? pileTopPriority(state, anchor.employeeId) : null
      const key = `${hidden ? 0 : sheets}|${top ?? ''}`

      if (lastRef.current[p] !== key) {
        lastRef.current[p] = key
        const jitter = jitters[p]!
        const base = p * maxSheets
        for (let i = 0; i < maxSheets; i += 1) {
          if (hidden || i >= sheets) {
            mesh.setMatrixAt(base + i, ZERO)
            continue
          }
          const j = jitter[i]!
          placeInSlot(
            tmp,
            floor,
            anchor,
            [j.dx, DESK_TOP + sheetHeight * (i + 0.5), j.dz],
            j.rotY,
          )
          tmp.scale.set(1, 1, 1)
          tmp.updateMatrix()
          mesh.setMatrixAt(base + i, tmp.matrix)
          const isTop = i === sheets - 1
          mesh.setColorAt(base + i, isTop && top ? getSwatchColor(priorityEdge[top]) : paper)
        }
        matricesDirty = true
        coloursDirty = true
      }

      const text = labelRefs.current[p]
      if (!text) continue
      const showLabel = !hidden && label !== '' && bandOf(anchor.floorIndex) !== 'far'
      text.visible = showLabel
      if (!showLabel) continue
      if (text.text !== label) {
        text.text = label
        text.sync()
      }
      placeInSlot(tmp, floor, anchor, [0, DESK_TOP + sheetHeight * sheets + LABEL_GAP, 0])
      text.position.copy(tmp.position)
      text.quaternion.copy(camera.quaternion)
    }

    if (matricesDirty) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    if (coloursDirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <group name="doc-piles">
      <instancedMesh
        key={`${capacity}:${geometry.uuid}`}
        ref={meshRef}
        args={[geometry, undefined, capacity]}
        castShadow={false}
        receiveShadow
        frustumCulled={false}
        {...(sheetMaterial ? { material: sheetMaterial } : {})}
      >
        {sheetMaterial ? null : <meshStandardMaterial roughness={0.9} />}
      </instancedMesh>
      {anchors.map((a, i) => (
        <Text
          key={a.employeeId}
          ref={(el: TroikaText | null) => {
            labelRefs.current[i] = el
          }}
          visible={false}
          font={FONT_URL}
          fontSize={0.16}
          anchorX="center"
          anchorY="bottom"
          color={SCENE_PALETTE.people.label}
          outlineWidth={0.02}
          outlineColor={SCENE_PALETTE.people.labelOutline}
        >
          {''}
        </Text>
      ))}
    </group>
  )
}
