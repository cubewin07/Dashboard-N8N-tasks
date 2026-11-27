import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import type { AppearanceV1 } from '@/domain/appearance'
import type { EmployeeId } from '@/domain/primitives'
import { CharacterPeople } from '@/scene/characters/CharacterVisual'
import type { PersonVisualInput } from '@/scene/render/PersonVisual'
import { ZOOM_FRAMES, type PreviewClip, type PreviewZoom } from './previewTypes'

const PREVIEW_ID = 'wardrobe_preview' as EmployeeId
const REBUILD_DEBOUNCE_MS = 80
const IDLE_TICK_MS = 66 // ~15 fps while an animation plays
const SEAT_HEIGHT = 0.45

export interface PreviewCanvasProps {
  appearance: AppearanceV1
  clip: PreviewClip
  zoom: PreviewZoom
  reducedMotion: boolean
  /** Turntable angle (rad), written by drag / rotate buttons. */
  yawRef: MutableRefObject<number>
  /** Filled with the canvas' `invalidate` so the shell can request a frame. */
  invalidateRef: MutableRefObject<() => void>
  onReady: () => void
}

const POSE_FOR_CLIP: Readonly<Record<PreviewClip, PersonVisualInput['pose']>> = {
  idle: 'wait_stand',
  walk: 'walk',
  sit_idle: 'sit',
  wave: 'greet',
}

function inputFor(clip: PreviewClip, yaw: number, scratch: PersonVisualInput): PersonVisualInput {
  scratch.yaw = yaw
  scratch.pose = POSE_FOR_CLIP[clip]
  scratch.seated = clip === 'sit_idle'
  scratch.speed01 = clip === 'walk' ? 1 : 0
  return scratch
}

function Scene({ appearance, clip, zoom, reducedMotion, yawRef, invalidateRef, onReady }: PreviewCanvasProps) {
  const { camera, invalidate } = useThree()
  useEffect(() => {
    invalidateRef.current = invalidate
  }, [invalidate, invalidateRef])
  const readyRef = useRef(false)
  const system = useMemo(
    () => new CharacterPeople({ capacity: 1, onAssemblyUpdate: () => invalidate() }),
    [invalidate],
  )
  const scratch = useRef<PersonVisualInput>({
    id: PREVIEW_ID,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pose: 'wait_stand',
    seated: false,
    speed01: 0,
    carrying: null,
    tintSwatch: 'management',
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
  })

  // Re-assemble on look change, debounced so a slider drag does not rebuild per tick.
  const first = useRef(true)
  useEffect(() => {
    const run = () => {
      system.setAppearance(PREVIEW_ID, appearance)
      invalidateRef.current()
    }
    if (first.current) {
      first.current = false
      run()
      return
    }
    const timer = window.setTimeout(run, REBUILD_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [system, appearance, invalidateRef])

  // Keep frames coming at ~15 fps (animation), never faster; drag adds extra frames itself.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) invalidateRef.current()
    }, IDLE_TICK_MS)
    return () => window.clearInterval(timer)
  }, [invalidateRef])

  useEffect(() => () => system.dispose(), [system])

  useEffect(() => {
    system.setCamera(camera)
  }, [system, camera])

  const target = useRef(new THREE.Vector3(0, ZOOM_FRAMES.body.lookY, 0))
  useFrame((state, delta) => {
    const cam = state.camera
    const frame = ZOOM_FRAMES[zoom]
    const k = reducedMotion ? 1 : 1 - Math.exp(-10 * Math.min(delta, 0.1))
    cam.position.y += (frame.y - cam.position.y) * k
    cam.position.z += (frame.z - cam.position.z) * k
    target.current.y += (frame.lookY - target.current.y) * k
    cam.lookAt(0, target.current.y, 0)

    const settled = readyRef.current
    const dt = settled && reducedMotion ? 0 : Math.min(delta, 0.1)
    system.sync([inputFor(clip, yawRef.current, scratch.current)], 1, dt)
    if (!readyRef.current && system.getDebugSnapshot().assembled > 0) {
      readyRef.current = true
      onReady()
    }
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#c9c4d6', 1.1]} />
      <directionalLight position={[2.5, 4, 3.5]} intensity={1.6} />
      <primitive object={system.object} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]}>
        <circleGeometry args={[0.9, 48]} />
        <meshBasicMaterial color="#8d86a3" transparent opacity={0.18} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.001, 0]}>
        <circleGeometry args={[0.55, 48]} />
        <meshBasicMaterial color="#8d86a3" transparent opacity={0.22} />
      </mesh>
      {clip === 'sit_idle' && (
        <mesh position={[0, SEAT_HEIGHT - 0.04, -0.05]}>
          <cylinderGeometry args={[0.3, 0.3, 0.08, 24]} />
          <meshStandardMaterial color="#9c94b3" roughness={0.9} />
        </mesh>
      )}
    </>
  )
}

/** The wardrobe's own small canvas (lazy chunk). Frames on demand: ~15 fps while shown, plus drag. */
export default function PreviewCanvas(props: PreviewCanvasProps) {
  const { yawRef, invalidateRef } = props
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let dragging = false
    let lastX = 0
    const down = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      el.setPointerCapture?.(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      yawRef.current += (e.clientX - lastX) * 0.012
      lastX = e.clientX
      invalidateRef.current()
    }
    const up = (e: PointerEvent) => {
      dragging = false
      el.releasePointerCapture?.(e.pointerId)
    }
    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [yawRef, invalidateRef])

  return (
    <div ref={wrapRef} className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing" data-preview-canvas>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ fov: 30, near: 0.1, far: 30, position: [0, ZOOM_FRAMES.body.y, ZOOM_FRAMES.body.z] }}
        aria-hidden
      >
        <Scene {...props} />
      </Canvas>
    </div>
  )
}
