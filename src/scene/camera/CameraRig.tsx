import { useEffect, useRef } from 'react'
import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import CameraControlsImpl from 'camera-controls'
import * as THREE from 'three'
import { usePeopleUi } from '@/office/uiStore'
import type { BuildingLayout } from '@/scene/layout'
import { peopleRuntime, type PersonSight } from '@/scene/render/peopleRuntime'
import { FOLLOW, userLeftFollow } from './followMode'
import { computeCameraPose } from './modes'
import { useViewStore } from './viewStore'

export interface CameraRigProps {
  layout: BuildingLayout
  reducedMotion?: boolean
}

const IS_E2E = Boolean(import.meta.env.VITE_E2E)
const tempPos = new THREE.Vector3()
const tempTarget = new THREE.Vector3()
const tempForward = new THREE.Vector3()
const tempRight = new THREE.Vector3()
const worldUp = new THREE.Vector3(0, 1, 0)
const sight: PersonSight = { x: 0, y: 0, z: 0, floorKey: '', riding: false, visible: false }

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
  const invalidate = useThree((s) => s.invalidate)

  const mode = useViewStore((s) => s.mode)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)
  const followedId = usePeopleUi((s) => s.followedId)
  const following = followedId !== null

  /** Floor the rig itself last moved the view to while following. */
  const rigFloorRef = useRef<string | null>(null)
  const followStartedRef = useRef(false)
  const followLostRef = useRef(0)
  const wasFollowingRef = useRef(false)

  useEffect(() => {
    rigFloorRef.current = null
    followStartedRef.current = false
    followLostRef.current = 0
    invalidate()
  }, [followedId, invalidate])

  // Dragging the view sideways (pan) means "let me look around": stop following.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls || !following) return
    const { ACTION } = CameraControlsImpl
    const onControl = () => {
      const action = controls.currentAction
      if (
        action === ACTION.TRUCK ||
        action === ACTION.TOUCH_TRUCK ||
        action === ACTION.SCREEN_PAN ||
        action === ACTION.TOUCH_SCREEN_PAN
      ) {
        usePeopleUi.getState().follow(null)
      }
    }
    controls.addEventListener('control', onControl)
    return () => controls.removeEventListener('control', onControl)
  }, [following])

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

    if (following) {
      if (userLeftFollow({ mode, focusedFloorKey }, rigFloorRef.current)) {
        usePeopleUi.getState().follow(null)
        return
      }
      wasFollowingRef.current = true
      controls.minAzimuthAngle = -Infinity
      controls.maxAzimuthAngle = Infinity
      controls.minPolarAngle = FOLLOW.minPolarAngle
      controls.maxPolarAngle = FOLLOW.maxPolarAngle
      controls.minDistance = FOLLOW.minDistance
      controls.maxDistance = FOLLOW.maxDistance
      controls.smoothTime = reducedMotion || IS_E2E ? 0 : FOLLOW.smoothTime
      hasMountedRef.current = true
      prevModeRef.current = mode
      prevFloorRef.current = focusedFloorKey
      invalidate()
      return
    }
    // Follow just ended and the view did not change: stay where the camera is,
    // only the limits of the mode come back.
    const keepPoseAfterFollow =
      wasFollowingRef.current &&
      prevModeRef.current === mode &&
      prevFloorRef.current === focusedFloorKey
    wasFollowingRef.current = false

    const pose = computeCameraPose(mode, layout, focusedFloorKey)
    controls.minAzimuthAngle = pose.minAzimuthAngle
    controls.maxAzimuthAngle = pose.maxAzimuthAngle
    controls.minPolarAngle = pose.minPolarAngle
    controls.maxPolarAngle = pose.maxPolarAngle
    controls.minDistance = pose.minDistance
    controls.maxDistance = pose.maxDistance
    controls.smoothTime = reducedMotion || IS_E2E ? 0 : 0.6

    const shouldReposition =
      !hasMountedRef.current ||
      prevModeRef.current !== mode ||
      prevFloorRef.current !== focusedFloorKey ||
      mode === 'overview'

    // When switching from overview/floor into free mode, keep current camera angle
    // unless this is the initial mount.
    const keepCurrentPoseInFree =
      hasMountedRef.current && mode === 'free' && prevModeRef.current !== 'free'

    if (shouldReposition && !keepCurrentPoseInFree && !keepPoseAfterFollow) {
      const animate = hasMountedRef.current && !reducedMotion && !IS_E2E
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
    invalidate()
  }, [mode, focusedFloorKey, layout, reducedMotion, invalidate, following])

  useFrame((_, delta) => {
    const controls = controlsRef.current
    const followId = usePeopleUi.getState().followedId
    if (controls && followId) {
      if (!peopleRuntime.sightOf(followId, sight)) {
        // Not in the building (yet): a link may name somebody still on the way in.
        followLostRef.current += Math.min(delta, 0.1)
        if (followStartedRef.current || followLostRef.current > FOLLOW.graceSeconds) {
          usePeopleUi.getState().follow(null)
        }
        return
      }
      followLostRef.current = 0
      const view = useViewStore.getState()
      if (view.mode !== 'floor' || view.focusedFloorKey !== sight.floorKey) {
        // Only when the view is still where the rig left it: otherwise the user
        // just picked another view and the effect above is about to end the follow.
        const viewIsOurs =
          rigFloorRef.current === null || rigFloorRef.current === view.focusedFloorKey
        if (viewIsOurs) {
          rigFloorRef.current = sight.floorKey
          useViewStore.setState({ mode: 'floor', focusedFloorKey: sight.floorKey })
        }
      } else {
        rigFloorRef.current = sight.floorKey
      }
      const animate = !reducedMotion && !IS_E2E
      if (!followStartedRef.current) {
        followStartedRef.current = true
        void controls.dollyTo(FOLLOW.distance, animate)
      }
      void controls.moveTo(sight.x, sight.y + FOLLOW.targetHeight, sight.z, animate)
      return
    }
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
