import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type CameraControlsImpl from 'camera-controls'
import * as THREE from 'three'
import type { Department, OrgConfig } from '@/domain/config'
import type { DepartmentId } from '@/domain/primitives'
import { ActivityTicker } from '@/features/activity/ActivityTicker'
import { CameraModeBar } from '@/features/office/CameraModeBar'
import { FloorPicker } from '@/features/office/FloorPicker'
import { PeopleList } from '@/features/office/PeopleList'
import { PersonDrawer } from '@/features/office/PersonDrawer'
import { ShortcutHint } from '@/features/office/ShortcutHint'
import { useFollowUrlSync } from '@/features/office/useFollowUrlSync'
import { useConfigStore } from '@/office/configStore'
import { useOfficeSelector } from '@/office/hooks'
import { useReducedMotionPref } from '@/office/prefs'
import { usePeopleUi } from '@/office/uiStore'
import { CameraRig } from '@/scene/camera/CameraRig'
import { useKeyboardShortcuts } from '@/scene/camera/useKeyboardShortcuts'
import {
  parseViewSearch,
  serializeViewSearch,
  useViewStore,
} from '@/scene/camera/viewStore'
import {
  directorDebug,
  makeCameraDebug,
  type CameraDebug,
  type DirectorDebug,
} from '@/scene/debug'
import { buildBuildingLayout, type BuildingLayout } from '@/scene/layout'
import { Building } from '@/scene/render/Building'
import { Environment } from '@/scene/render/Environment'
import { Lights } from '@/scene/render/Lights'
import { People } from '@/scene/render/People'

export interface OfficeDebugInfo {
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  fps: number
  floorKeys: string[]
  addDepartment: (key?: string, labelVi?: string, labelEn?: string) => void
  removeDepartment: (key: string) => void
  director?: DirectorDebug
  camera?: CameraDebug
  getState?: () => unknown
  sim?: unknown
}

declare global {
  interface Window {
    __office_debug?: OfficeDebugInfo
  }
}

const IS_E2E = Boolean(import.meta.env.VITE_E2E)
const IS_DEBUG_ENABLED =
  import.meta.env.DEV || IS_E2E || Boolean(import.meta.env.VITE_DEBUG)

function addDepartmentToStore(
  key = 'logistics',
  labelVi = 'Vận hành kho',
  labelEn = 'Logistics',
): void {
  const curr = useConfigStore.getState().config
  if (!curr) return
  if (curr.departments.some((d) => d.key === key)) return
  const nextOrder =
    curr.departments.reduce((max, d) => Math.max(max, d.order), 0) + 1
  const newDept: Department = {
    id: `dep_${key}` as DepartmentId,
    key,
    label: { vi: labelVi, en: labelEn },
    order: nextOrder,
    colorSwatch: 'cs',
    icon: 'Truck',
    hours: 'office',
    floorTemplate: 'department',
    active: true,
  }
  useConfigStore.setState({
    config: {
      ...curr,
      departments: [...curr.departments, newDept],
    },
  })
}

function removeDepartmentFromStore(key: string): void {
  const curr = useConfigStore.getState().config
  if (!curr) return
  useConfigStore.setState({
    config: {
      ...curr,
      departments: curr.departments.map((d) =>
        d.key === key ? { ...d, active: false } : d,
      ),
    },
  })
}

/** The view's own share of the URL: other keys (`follow`, …) belong to others. */
function viewPart(search: string): string {
  const parsed = parseViewSearch(search)
  return `${parsed.mode}:${parsed.focusedFloorKey ?? ''}`
}

interface SceneTelemetryProps {
  floorKeys: readonly string[]
  onFirstFrame: () => void
}

const debugTarget = new THREE.Vector3()

function SceneTelemetry({ floorKeys, onFirstFrame }: SceneTelemetryProps) {
  const { gl } = useThree()
  const getThree = useThree((s) => s.get)
  const cameraDebug = useMemo(
    () =>
      makeCameraDebug(
        () => {
          const controls = getThree().controls as CameraControlsImpl | null
          if (!controls || typeof controls.getTarget !== 'function') return null
          controls.getTarget(debugTarget)
          return [debugTarget.x, debugTarget.y, debugTarget.z]
        },
        (x, y, z) => {
          const { camera, gl: renderer } = getThree()
          const rect = renderer.domElement.getBoundingClientRect()
          debugTarget.set(x, y, z).project(camera)
          return [
            rect.left + ((debugTarget.x + 1) / 2) * rect.width,
            rect.top + ((1 - debugTarget.y) / 2) * rect.height,
          ]
        },
      ),
    [getThree],
  )
  const reportedReadyRef = useRef(false)
  const frameCountRef = useRef(0)
  const elapsedRef = useRef(0)
  const fpsRef = useRef(60)
  const floorKeysRef = useRef<readonly string[]>(floorKeys)

  useEffect(() => {
    floorKeysRef.current = floorKeys
  }, [floorKeys])

  useFrame((_, delta) => {
    if (!reportedReadyRef.current) {
      reportedReadyRef.current = true
      onFirstFrame()
    }

    if (!IS_DEBUG_ENABLED) return

    frameCountRef.current += 1
    elapsedRef.current += delta
    if (elapsedRef.current >= 0.25) {
      fpsRef.current = Math.round(frameCountRef.current / elapsedRef.current)
      frameCountRef.current = 0
      elapsedRef.current = 0
    }

    window.__office_debug = {
      ...window.__office_debug,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      fps: fpsRef.current,
      floorKeys: [...floorKeysRef.current],
      addDepartment: addDepartmentToStore,
      removeDepartment: removeDepartmentFromStore,
      director: directorDebug,
      camera: cameraDebug,
    }
  })

  return null
}

/**
 * Layouts for a changing staff list: each one keeps the seats of the one
 * before it, so a hire gets a free desk and nobody else moves.
 */
function createLayoutBuilder(): (config: OrgConfig) => BuildingLayout {
  let previous: BuildingLayout | null = null
  let previousConfig: OrgConfig | null = null
  return (config) => {
    if (previous && previousConfig === config) return previous
    previous = buildBuildingLayout(config, previous)
    previousConfig = config
    return previous
  }
}

export function OfficeCanvas() {
  const config = useConfigStore((s) => s.config)
  const [ready, setReady] = useState(false)
  const [dpr, setDpr] = useState(IS_E2E ? 1 : 1.5)
  const reducedMotion = useReducedMotionPref()

  const location = useLocation()
  const [, setSearchParams] = useSearchParams()
  const lastWrittenSearchRef = useRef<string | null>(null)
  const initializedUrlRef = useRef(false)

  // The building comes from the config; who sits in it from the live staff
  // list, so hires and leavers get and give up desks without a reload.
  const liveEmployees = useOfficeSelector((s) => s?.config.employees ?? null)
  const [buildLayout] = useState(createLayoutBuilder)
  const layoutConfig = useMemo(
    () =>
      config
        ? liveEmployees && liveEmployees !== config.employees
          ? { ...config, employees: liveEmployees }
          : config
        : null,
    [config, liveEmployees],
  )
  const layout = useMemo(
    () => (layoutConfig ? buildLayout(layoutConfig) : null),
    [layoutConfig, buildLayout],
  )

  const floorKeys = useMemo(
    () => (layout ? layout.floors.map((f) => f.key) : []),
    [layout],
  )

  const mode = useViewStore((s) => s.mode)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)
  const hoveredFloorKey = useViewStore((s) => s.hoveredFloorKey)
  const personHovered = usePeopleUi((s) => s.hoveredId !== null)

  useKeyboardShortcuts(floorKeys)
  useFollowUrlSync()

  // 1. Sync URL -> viewStore on initial load and external URL changes (e.g. Back/Forward or direct link)
  useEffect(() => {
    if (floorKeys.length === 0) return

    if (
      !initializedUrlRef.current ||
      (lastWrittenSearchRef.current !== null &&
        viewPart(location.search) !== viewPart(lastWrittenSearchRef.current))
    ) {
      const parsed = parseViewSearch(location.search, floorKeys)
      useViewStore.setState({
        mode: parsed.mode,
        focusedFloorKey: parsed.focusedFloorKey,
      })
      const canonical = serializeViewSearch(
        parsed.mode,
        parsed.focusedFloorKey,
        location.search,
      )
      lastWrittenSearchRef.current = canonical
      initializedUrlRef.current = true
      if (location.search !== canonical) {
        setSearchParams(canonical.slice(1), { replace: true })
      }
    }
  }, [location.search, floorKeys, setSearchParams])

  // 2. R11: If the focused floor disappears after a config change, fall back to overview
  useEffect(() => {
    if (!initializedUrlRef.current || floorKeys.length === 0) return
    useViewStore.getState().ensureValidFloor(floorKeys)
  }, [floorKeys])

  // 3. Sync viewStore -> URL when mode or focusedFloorKey changes
  useEffect(() => {
    if (!initializedUrlRef.current) return
    const latest = useViewStore.getState()
    if (mode !== latest.mode || focusedFloorKey !== latest.focusedFloorKey) {
      return
    }
    const nextSearch = serializeViewSearch(
      mode,
      focusedFloorKey,
      location.search,
    )
    if (location.search !== nextSearch) {
      lastWrittenSearchRef.current = nextSearch
      setSearchParams(nextSearch.slice(1), { replace: true })
    }
  }, [mode, focusedFloorKey, location.search, setSearchParams])

  if (!config || !layout) {
    return null
  }

  return (
    <div
      data-office-canvas
      data-ready={ready ? 'true' : 'false'}
      data-camera-mode-state={mode}
      data-focused-floor={focusedFloorKey ?? ''}
      style={{ cursor: hoveredFloorKey || personHovered ? 'pointer' : 'default' }}
      className="relative h-[calc(100dvh-11rem)] min-h-[460px] w-full overflow-hidden rounded-[14px] border border-border bg-surface"
    >
      <Canvas
        frameloop={IS_E2E ? 'demand' : 'always'}
        shadows={IS_E2E ? true : 'soft'}
        dpr={dpr}
        camera={{ position: [14, 24, 52], fov: 35, near: 0.5, far: 320 }}
      >
        {!IS_E2E && (
          <PerformanceMonitor
            onChange={({ factor }) => {
              const nextDpr = Math.round((1 + factor) * 100) / 100
              setDpr(nextDpr)
            }}
          />
        )}
        <Environment />
        <Lights layout={layout} />
        <Building layout={layout} reducedMotion={reducedMotion} />
        <People
          layout={layout}
          elevator={config.building.elevator}
          reducedMotion={reducedMotion}
        />
        <CameraRig layout={layout} reducedMotion={reducedMotion} />
        <SceneTelemetry
          floorKeys={floorKeys}
          onFirstFrame={() => setReady(true)}
        />
      </Canvas>

      {/* HTML overlays: Tab order FloorPicker -> PeopleList -> CameraModeBar */}
      <div className="pointer-events-none absolute inset-4 flex flex-col justify-between gap-3">
        <div className="flex min-h-0 flex-1 items-start justify-between gap-4">
          <div className="flex max-h-full min-h-0 flex-col items-start gap-2">
            <div className="shrink-0">
              <FloorPicker floors={layout.floors} palette={config.palette} />
            </div>
            <PeopleList
              variant="panel"
              defaultCollapsed
              className="hidden min-h-0 shrink md:flex"
            />
          </div>
          <div className="flex flex-1 justify-center">
            <CameraModeBar floorKeys={floorKeys} />
          </div>
          <div className="hidden w-52 lg:block" aria-hidden="true" />
        </div>

        <div className="flex items-end justify-between gap-4">
          <ActivityTicker />
          <ShortcutHint />
        </div>
      </div>

      <PersonDrawer placement="canvas" />
    </div>
  )
}

export default OfficeCanvas
