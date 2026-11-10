import { useEffect, useRef } from 'react'
import { CameraControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type CameraControlsImpl from 'camera-controls'
import * as THREE from 'three'
import type { BuildingLayout } from '@/scene/layout'
import { computeCameraPose } from './modes'
import { useViewStore } from './viewStore'

export interface CameraRigProps {
  layout: BuildingLayout
  reducedMotion?: boolean
}

const tempPos = new THREE.Vector3()
const tempTarget = new THREE.Vector3()
const tempForward = new THREE.Vector3()
const tempRight = new THREE.Vector3()
const worldUp = new THREE.Vector3(0, 1, 0)

function isEditableElement(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if ((el as HTMLElement).isContentEditable) return true
  if (el.closest('[role="dialog"]')) return true
  return false
}

export function CameraRig({ layout, reducedMotion = false }: CameraRigProps) {
  const controlsRef = useRef<CameraControlsImpl>(null)
  const pressedKeysRef = useRef<Set<string>>(new Set())
  const hasMountedRef = useRef(false)
  const prevModeRef = useRef<string | null>(null)
  const prevFloorRef = useRef<string | null>(null)

  const mode = useViewStore((s) => s.mode)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(document.activeElement)) return
      const key = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'q', 'e'].includes(key)) {
        pressedKeysRef.current.add(key)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.key.toLowerCase())
    }
    const onBlur = () => {
      pressedKeysRef.current.clear()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return

    const pose = computeCameraPose(mode, layout, focusedFloorKey)
    controls.minAzimuthAngle = pose.minAzimuthAngle
    controls.maxAzimuthAngle = pose.maxAzimuthAngle
    controls.minPolarAngle = pose.minPolarAngle
    controls.maxPolarAngle = pose.maxPolarAngle
    controls.minDistance = pose.minDistance
    controls.maxDistance = pose.maxDistance
    controls.smoothTime = reducedMotion ? 0 : 0.6

    const shouldReposition =
      !hasMountedRef.current ||
      prevModeRef.current !== mode ||
      prevFloorRef.current !== focusedFloorKey ||
      mode === 'overview'

    // When switching from overview/floor into free mode, keep current camera angle
    // unless this is the initial mount.
    const keepCurrentPoseInFree =
      hasMountedRef.current && mode === 'free' && prevModeRef.current !== 'free'

    if (shouldReposition && !keepCurrentPoseInFree) {
      const animate = hasMountedRef.current && !reducedMotion
      void controls.setLookAt(
        pose.position[0],
        pose.position[1],
        pose.position[2],
        pose.target[0],
        pose.target[1],
        pose.target[2],
        animate,
      )
    }

    hasMountedRef.current = true
    prevModeRef.current = mode
    prevFloorRef.current = focusedFloorKey
  }, [mode, focusedFloorKey, layout, reducedMotion])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    if (!controls || mode !== 'free' || pressedKeysRef.current.size === 0) {
      return
    }

    controls.getPosition(tempPos)
    controls.getTarget(tempTarget)

    const dist = Math.max(4, tempPos.distanceTo(tempTarget))
    const speed = dist * 0.55 * Math.min(delta, 0.1)

    tempForward.subVectors(tempTarget, tempPos)
    tempForward.y = 0
    if (tempForward.lengthSq() < 1e-4) {
      tempForward.set(0, 0, -1)
    } else {
      tempForward.normalize()
    }
    tempRight.crossVectors(tempForward, worldUp).normalize()

    let dx = 0
    let dy = 0
    let dz = 0

    const keys = pressedKeysRef.current
    if (keys.has('w')) {
      dx += tempForward.x * speed
      dz += tempForward.z * speed
    }
    if (keys.has('s')) {
      dx -= tempForward.x * speed
      dz -= tempForward.z * speed
    }
    if (keys.has('d')) {
      dx += tempRight.x * speed
      dz += tempRight.z * speed
    }
    if (keys.has('a')) {
      dx -= tempRight.x * speed
      dz -= tempRight.z * speed
    }
    if (keys.has('e')) {
      dy += speed
    }
    if (keys.has('q')) {
      dy -= speed
    }

    const nextTargetY = Math.max(0.5, tempTarget.y + dy)
    const clampedDy = nextTargetY - tempTarget.y
    const nextPosY = Math.max(0.5, tempPos.y + clampedDy)

    void controls.setLookAt(
      tempPos.x + dx,
      nextPosY,
      tempPos.z + dz,
      tempTarget.x + dx,
      nextTargetY,
      tempTarget.z + dz,
      false,
    )
  })

  return <CameraControls ref={controlsRef} makeDefault />
}
