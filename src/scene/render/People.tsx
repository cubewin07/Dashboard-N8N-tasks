import { useEffect, useMemo, useRef } from 'react'
import { Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { BuildingConfig, OrgConfig } from '@/domain/config'
import type { EmployeeId } from '@/domain/primitives'
import type { OfficeState, PersonActivity } from '@/domain/work'
import { useOfficeSelector } from '@/office/hooks'
import { getFeedClock, useOffice } from '@/office/store'
import { usePeopleUi } from '@/office/uiStore'
import { getFloorFadeTarget, useViewStore } from '@/scene/camera/viewStore'
import { ClockRateEstimator } from '@/scene/director/clockRate'
import { Director } from '@/scene/director/director'
import { moveFactor, TUNING } from '@/scene/director/tuning'
import type { BuildingLayout } from '@/scene/layout'
import { CapsulePeople } from './CapsulePeople'
import { toWorldX, toWorldZ } from './coords'
import { ElevatorCars } from './ElevatorCars'
import { SCENE_PALETTE } from './palette'
import { peopleRuntime, resetPeopleRuntime, type PersonSight } from './peopleRuntime'
import type { PersonTone, PersonVisualInput, PersonVisualSystem } from './PersonVisual'

export interface PeopleProps {
  layout: BuildingLayout
  elevator: BuildingConfig['elevator']
  reducedMotion?: boolean
}

const FONT_URL = `${import.meta.env.BASE_URL}assets/fonts/BeVietnamPro-SemiBold.ttf`
const IS_DEV = Boolean(import.meta.env.DEV)

const TONE: Record<PersonActivity, PersonTone | null> = {
  idle: null,
  working: 'working',
  reviewing: 'working',
  delivering: 'working',
  asking: 'waiting',
  waiting_answer: 'waiting',
  helping: 'working',
  in_meeting: 'working',
  resting: null,
  off_shift: null,
}

/** Shirt colour: the department's swatch; managers and owners wear their floor's. */
function buildTints(config: OrgConfig): Map<EmployeeId, string> {
  const swatchOfDept = new Map(config.departments.map((d) => [d.id, d.colorSwatch]))
  const roles = new Map(config.roles.map((r) => [r.key, r]))
  const out = new Map<EmployeeId, string>()
  for (const emp of config.employees) {
    const dept = emp.departmentId ? swatchOfDept.get(emp.departmentId) : undefined
    const workspace = roles.get(emp.roleKey)?.workspace
    out.set(emp.id, dept ?? (workspace === 'boss_office' ? 'boss' : 'management'))
  }
  return out
}

function blankInput(): PersonVisualInput {
  return {
    id: '' as EmployeeId,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pose: 'stand',
    seated: false,
    speed01: 0,
    carrying: null,
    tintSwatch: 'management',
    tone: null,
    hovered: false,
    selected: false,
    followed: false,
    opacity: 1,
    lod: 0,
  }
}

const tmpHead = new THREE.Vector3()
const tmpNdc = new THREE.Vector2()

/**
 * Everybody in the building. Owns the director, ticks it at a fixed 10 Hz
 * with visual seconds, and draws the result through a `PersonVisualSystem`.
 * No React state changes per frame: the store is read inside `useFrame`.
 */
export function People({ layout, elevator, reducedMotion = false }: PeopleProps) {
  const invalidate = useThree((s) => s.invalidate)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const raycaster = useThree((s) => s.raycaster)

  const director = useMemo(
    () =>
      new Director(layout, elevator, {
        seed: 'office',
        warn: IS_DEV ? (m) => console.warn(m) : undefined,
      }),
    // The director outlives layout changes (`setLayout` below keeps everybody).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elevator],
  )
  // GPU objects are made in an effect (and thrown away in its cleanup), so a
  // remount never ends up drawing something that was already disposed.
  const rootRef = useRef<THREE.Group>(null)
  const visualRef = useRef<PersonVisualSystem | null>(null)
  const carsRef = useRef<ElevatorCars | null>(null)
  const layoutRef = useRef(layout)
  const reducedMotionRef = useRef(reducedMotion)

  const inputsRef = useRef<PersonVisualInput[]>([])
  const accRef = useRef(0)
  const clockRef = useRef(new ClockRateEstimator())
  const tintsRef = useRef<{ config: OrgConfig | null; map: Map<EmployeeId, string> }>({
    config: null,
    map: new Map(),
  })
  const labelRef = useRef<THREE.Object3D>(null)
  const settleRef = useRef(0)

  const mode = useViewStore((s) => s.mode)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)
  const activeFloorIndex = useMemo(() => {
    if (mode !== 'floor' || !focusedFloorKey) return null
    return layout.byKey[focusedFloorKey] ?? null
  }, [mode, focusedFloorKey, layout])
  const activeFloorRef = useRef(activeFloorIndex)

  // The name shown above one person: hover first, then whoever is followed or selected.
  const hoveredId = usePeopleUi((s) => s.hoveredId)
  const followedId = usePeopleUi((s) => s.followedId)
  const selectedId = usePeopleUi((s) => s.selectedId)
  const labelId = hoveredId ?? followedId ?? selectedId
  const labelName = useOfficeSelector((s) =>
    labelId ? (s?.config.employees.find((e) => e.id === labelId)?.name ?? '') : '',
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const visual: PersonVisualSystem = new CapsulePeople()
    const cars = new ElevatorCars()
    visual.setReducedMotion(reducedMotionRef.current)
    cars.build(layoutRef.current)
    root.add(visual.object, cars.object)
    visualRef.current = visual
    carsRef.current = cars
    invalidate()
    return () => {
      visualRef.current = null
      carsRef.current = null
      root.remove(visual.object, cars.object)
      visual.dispose()
      cars.dispose()
    }
  }, [invalidate])

  useEffect(() => {
    layoutRef.current = layout
    director.setLayout(layout)
    carsRef.current?.build(layout)
    invalidate()
  }, [director, layout, invalidate])

  useEffect(() => {
    activeFloorRef.current = activeFloorIndex
    director.setVisibility((floorIndex) => !getFloorFadeTarget(floorIndex, activeFloorIndex).faded)
    settleRef.current = 30
    invalidate()
  }, [director, activeFloorIndex, invalidate])

  useEffect(() => {
    reducedMotionRef.current = reducedMotion
    visualRef.current?.setReducedMotion(reducedMotion)
  }, [reducedMotion])

  // With on-demand rendering nothing draws while paused: wake up when the
  // office state or the selection changes.
  useEffect(() => {
    const wake = () => {
      settleRef.current = 30
      invalidate()
    }
    const offOffice = useOffice.subscribe(wake)
    const offUi = usePeopleUi.subscribe(wake)
    return () => {
      offOffice()
      offUi()
    }
  }, [invalidate])

  useEffect(() => {
    const sight = (id: EmployeeId, out: PersonSight): boolean => {
      const input = inputsRef.current.find((p) => p.id === id)
      const sim = director.person(id)
      if (!input || !sim) return false
      out.x = input.x
      out.y = input.y
      out.z = input.z
      out.floorKey = layout.floors[sim.floorIndex]?.key ?? ''
      out.riding = sim.inCar >= 0
      out.visible = sim.visible
      return true
    }
    peopleRuntime.director = director
    peopleRuntime.sightOf = sight
    peopleRuntime.pick = (ray) => visualRef.current?.pick(ray) ?? null
    return resetPeopleRuntime
  }, [director, layout])

  // Pointer: hover and click people. Capture phase, so the floor's own click
  // handler can see that a person is under the pointer.
  useEffect(() => {
    const el = gl.domElement
    let down: { x: number; y: number } | null = null
    const pickAt = (e: PointerEvent): EmployeeId | null => {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return null
      tmpNdc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(tmpNdc, camera)
      return visualRef.current?.pick(raycaster.ray) ?? null
    }
    const onMove = (e: PointerEvent) => {
      // While dragging the camera the hover would flicker over everyone.
      if (e.buttons !== 0 && down === null) return
      usePeopleUi.getState().hover(pickAt(e))
    }
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
      usePeopleUi.getState().hover(pickAt(e))
    }
    const onUp = (e: PointerEvent) => {
      const start = down
      down = null
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 4) return
      const id = pickAt(e)
      if (id) usePeopleUi.getState().select(id)
    }
    const onLeave = () => {
      down = null
      usePeopleUi.getState().hover(null)
    }
    el.addEventListener('pointermove', onMove, true)
    el.addEventListener('pointerdown', onDown, true)
    el.addEventListener('pointerup', onUp, true)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove, true)
      el.removeEventListener('pointerdown', onDown, true)
      el.removeEventListener('pointerup', onUp, true)
      el.removeEventListener('pointerleave', onLeave)
      usePeopleUi.getState().hover(null)
    }
  }, [gl, camera, raycaster])

  useFrame((frame, delta) => {
    const state: OfficeState | null = useOffice.getState().state
    const visual = visualRef.current
    const cars = carsRef.current
    if (!state || !visual || !cars) return
    director.sync(state)

    if (tintsRef.current.config !== state.config) {
      tintsRef.current = { config: state.config, map: buildTints(state.config) }
    }

    // Visual seconds: real seconds × a factor that grows slowly with the feed's speed.
    const clock = getFeedClock()
    const rate = clock
      ? (clock.rate ?? clockRef.current.sample(clock.nowMs, frame.clock.elapsedTime))
      : 0
    const factor = moveFactor(rate)
    const dt = Math.min(delta, 0.25)
    peopleRuntime.moveFactor = factor

    const tick = TUNING.tickSeconds
    if (factor > 0) {
      accRef.current += dt * factor
      let ticks = 0
      let spent = 0
      while (accRef.current >= tick && ticks < TUNING.maxTicksPerFrame) {
        cars.remember(director.elevators())
        const t0 = performance.now()
        director.tick(tick)
        spent += performance.now() - t0
        accRef.current -= tick
        ticks += 1
      }
      if (ticks > 0) {
        peopleRuntime.tickMs += (spent / ticks - peopleRuntime.tickMs) * 0.1
      }
      // Still behind after the cap: people slow down rather than freeze the tab.
      if (accRef.current >= tick) accRef.current = 0
    }
    const alpha = Math.min(1, accRef.current / tick)

    const sims = director.people()
    const inputs = inputsRef.current
    while (inputs.length < sims.length) inputs.push(blankInput())
    const ui = usePeopleUi.getState()
    const active = activeFloorRef.current
    const halfW = layout.footprint.w
    const halfD = layout.footprint.d
    const tints = tintsRef.current.map
    for (let i = 0; i < sims.length; i += 1) {
      const sim = sims[i]!
      const input = inputs[i]!
      const runtime = state.people[sim.id]
      const task = runtime?.taskId ? state.tasks[runtime.taskId] : undefined
      input.id = sim.id
      input.x = toWorldX(sim.prevX + (sim.x - sim.prevX) * alpha, halfW)
      input.z = toWorldZ(sim.prevZ + (sim.z - sim.prevZ) * alpha, halfD)
      input.y = sim.prevY + (sim.y - sim.prevY) * alpha
      // Floor-local heading (atan2(dx, dz), +z towards the back wall) → world yaw.
      input.yaw = Math.PI - sim.heading
      input.pose = sim.pose
      input.seated = sim.seated
      input.speed01 = sim.speed01
      input.carrying = sim.carrying
      input.tintSwatch = tints.get(sim.id) ?? 'management'
      input.tone = task?.status === 'blocked' ? 'blocked' : runtime ? TONE[runtime.activity] : null
      input.hovered = ui.hoveredId === sim.id
      input.selected = ui.selectedId === sim.id
      input.followed = ui.followedId === sim.id
      // Floors above the focused one are cut away, and so are the people on them.
      const hidden = !sim.visible || getFloorFadeTarget(sim.floorIndex, active).faded
      input.opacity = hidden ? 0 : sim.opacity
      input.lod = 0
    }
    visual.sync(inputs, sims.length, factor > 0 ? dt : 0)
    cars.update(director.elevators(), alpha)

    const label = labelRef.current
    if (label) {
      const id = ui.hoveredId ?? ui.followedId ?? ui.selectedId
      if (id && visual.headOf(id, tmpHead)) {
        label.visible = true
        label.position.set(tmpHead.x, tmpHead.y + 0.3, tmpHead.z)
        label.quaternion.copy(frame.camera.quaternion)
        // Readable from the overview and not huge up close.
        const dist = frame.camera.position.distanceTo(label.position)
        label.scale.setScalar(Math.max(0.8, Math.min(4.5, dist / 14)))
      } else {
        label.visible = false
      }
    }

    // Keep drawing while anything moves; a few extra frames let fades finish.
    if (factor > 0) invalidate()
    else if (settleRef.current > 0) {
      settleRef.current -= 1
      invalidate()
    }
  })

  return (
    <group name="people-root" ref={rootRef}>
      <Text
        ref={labelRef}
        visible={false}
        font={FONT_URL}
        fontSize={0.3}
        anchorX="center"
        anchorY="bottom"
        color={SCENE_PALETTE.people.label}
        outlineWidth={0.03}
        outlineColor={SCENE_PALETTE.people.labelOutline}
        renderOrder={20}
        material-depthTest={false}
        material-toneMapped={false}
      >
        {labelName}
      </Text>
    </group>
  )
}
