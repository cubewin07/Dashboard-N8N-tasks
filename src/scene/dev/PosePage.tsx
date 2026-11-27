import { useEffect, useRef } from 'react'
import { OrbitControls, Text } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import type { EmployeeId } from '@/domain/primitives'
import { isSeatedPose, POSE_KEYS, type PoseKey } from '@/scene/director/poses'
import { CapsulePeople } from '@/scene/render/CapsulePeople'
import { SCENE_PALETTE } from '@/scene/render/palette'
import type { PersonTone, PersonVisualInput } from '@/scene/render/PersonVisual'

const COLUMNS = 6
const SPACING = 1.8
const SWATCHES = ['cs', 'marketing', 'design', 'accounting', 'management', 'boss']
const TONES: (PersonTone | null)[] = [null, 'working', 'waiting', 'blocked']
const FONT_URL = `${import.meta.env.BASE_URL}assets/fonts/BeVietnamPro-SemiBold.ttf`

function place(index: number): [number, number] {
  const rows = Math.ceil(POSE_KEYS.length / COLUMNS)
  const col = index % COLUMNS
  const row = Math.floor(index / COLUMNS)
  return [(col - (COLUMNS - 1) / 2) * SPACING, (row - (rows - 1) / 2) * SPACING * 1.2]
}

const CARRY: Partial<Record<PoseKey, PersonVisualInput['carrying']>> = {
  carry_walk: 'document',
  sit_phone: 'phone',
}

function makeInputs(): PersonVisualInput[] {
  return POSE_KEYS.map((pose, i) => {
    const [x, z] = place(i)
    return {
      id: `pose_${pose}` as EmployeeId,
      x,
      y: 0,
      z,
      yaw: 0,
      pose,
      seated: isSeatedPose(pose),
      speed01: pose === 'walk' || pose === 'carry_walk' ? 1 : 0,
      carrying: CARRY[pose] ?? null,
      tintSwatch: SWATCHES[i % SWATCHES.length]!,
      tone: TONES[i % TONES.length]!,
      hovered: false,
      selected: i === 1,
      followed: i === 2,
      opacity: i === POSE_KEYS.length - 1 ? 0.5 : 1,
      lod: 0,
    }
  })
}

/** Every pose key on one capsule each: walkers pace back and forth so the gait shows. */
function PoseGrid() {
  const rootRef = useRef<THREE.Group>(null)
  const peopleRef = useRef<CapsulePeople | null>(null)
  const inputsRef = useRef<PersonVisualInput[]>(makeInputs())

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const people = new CapsulePeople()
    peopleRef.current = people
    root.add(people.object)
    return () => {
      peopleRef.current = null
      root.remove(people.object)
      people.dispose()
    }
  }, [])

  useFrame((frame, delta) => {
    const inputs = inputsRef.current
    const t = frame.clock.elapsedTime
    inputs.forEach((input, i) => {
      if (input.speed01 === 0) return
      const [x] = place(i)
      const swing = Math.sin(t * 1.3) * 0.6
      input.x = x + swing
      input.yaw = Math.cos(t * 1.3) >= 0 ? Math.PI / 2 : -Math.PI / 2
    })
    peopleRef.current?.sync(inputs, inputs.length, Math.min(delta, 0.1))
  })

  return (
    <group ref={rootRef}>
      {POSE_KEYS.map((pose, i) => {
        const [x, z] = place(i)
        return (
          <Text
            key={pose}
            position={[x, 0.02, z + 0.75]}
            rotation={[-Math.PI / 2, 0, 0]}
            font={FONT_URL}
            fontSize={0.2}
            anchorX="center"
            color={SCENE_PALETTE.people.label}
          >
            {pose}
          </Text>
        )
      })}
    </group>
  )
}

/** Dev only (`#/dev/people`): the capsule look for every pose the director can ask for. */
export function PosePage() {
  return (
    <div data-pose-page className="h-[calc(100dvh-8rem)] min-h-[420px] w-full overflow-hidden rounded-[14px] border border-border bg-surface">
      <Canvas shadows camera={{ position: [0, 9, 11], fov: 35 }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[6, 12, 8]} intensity={1.6} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[40, 40]} />
          <meshStandardMaterial color={SCENE_PALETTE.people.labelOutline} roughness={1} />
        </mesh>
        <PoseGrid />
        <OrbitControls makeDefault target={[0, 0.6, 0]} />
      </Canvas>
    </div>
  )
}
