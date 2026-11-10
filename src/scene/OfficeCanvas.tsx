import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { Department } from '@/domain/config'
import type { DepartmentId } from '@/domain/primitives'
import { CameraModeBar } from '@/features/office/CameraModeBar'
import { FloorPicker } from '@/features/office/FloorPicker'
import { ShortcutHint } from '@/features/office/ShortcutHint'
import { useConfigStore } from '@/office/configStore'
import { CameraRig } from '@/scene/camera/CameraRig'
import { useKeyboardShortcuts } from '@/scene/camera/useKeyboardShortcuts'
import {
  parseViewSearch,
  serializeViewSearch,
  useViewStore,
} from '@/scene/camera/viewStore'
import { buildBuildingLayout } from '@/scene/layout'
import { Building } from '@/scene/render/Building'
import { Environment } from '@/scene/render/Environment'
import { Lights } from '@/scene/render/Lights'

export interface OfficeDebugInfo {
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  fps: number
  floorKeys: string[]
  addDepartment: (key?: string, labelVi?: string, labelEn?: string) => void
  removeDepartment: (key: string) => void
}

declare global {
  interface Window {
    __office_debug?: OfficeDebugInfo
  }
}

const IS_DEBUG_ENABLED =
  import.meta.env.DEV ||
  Boolean(import.meta.env.VITE_E2E)

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

interface SceneTelemetryProps {
  floorKeys: readonly string[]
  onFirstFrame: () => void
}

function SceneTelemetry({ floorKeys, onFirstFrame }: SceneTelemetryProps) {
  const { gl } = useThree()
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
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      fps: fpsRef.current,
      floorKeys: [...floorKeysRef.current],
      addDepartment: addDepartmentToStore,
      removeDepartment: removeDepartmentFromStore,
    }
  })

  useEffect(() => {
    return () => {
      if (IS_DEBUG_ENABLED) {
        delete window.__office_debug
      }
    }
  }, [])

  return null
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

export function OfficeCanvas() {
  const config = useConfigStore((s) => s.config)
  const [ready, setReady] = useState(false)
  const [dpr, setDpr] = useState(1.5)
  const reducedMotion = useReducedMotion()

  const location = useLocation()
  const [, setSearchParams] = useSearchParams()
  const lastWrittenSearchRef = useRef<string | null>(null)
  const initializedUrlRef = useRef(false)

  const layout = useMemo(
    () => (config ? buildBuildingLayout(config) : null),
    [config],
  )

  const floorKeys = useMemo(
    () => (layout ? layout.floors.map((f) => f.key) : []),
    [layout],
  )

  const mode = useViewStore((s) => s.mode)
  const focusedFloorKey = useViewStore((s) => s.focusedFloorKey)
  const hoveredFloorKey = useViewStore((s) => s.hoveredFloorKey)

  useKeyboardShortcuts(floorKeys)

  // 1. Sync URL -> viewStore on initial load and external URL changes (e.g. Back/Forward or direct link)
  useEffect(() => {
    if (floorKeys.length === 0) return

    if (
      !initializedUrlRef.current ||
      (lastWrittenSearchRef.current !== null &&
        location.search !== lastWrittenSearchRef.current)
    ) {
      const parsed = parseViewSearch(location.search, floorKeys)
      useViewStore.setState({
        mode: parsed.mode,
        focusedFloorKey: parsed.focusedFloorKey,
      })
      const canonical = serializeViewSearch(parsed.mode, parsed.focusedFloorKey)
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
    const nextSearch = serializeViewSearch(mode, focusedFloorKey)
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
      style={{ cursor: hoveredFloorKey ? 'pointer' : 'default' }}
      className="relative h-[calc(100dvh-11rem)] min-h-[460px] w-full overflow-hidden rounded-[14px] border border-border bg-surface"
    >
      <Canvas
        shadows="soft"
        dpr={dpr}
        camera={{ position: [14, 24, 52], fov: 35, near: 0.5, far: 320 }}
      >
        <PerformanceMonitor
          onChange={({ factor }) => {
            const nextDpr = Math.round((1 + factor) * 100) / 100
            setDpr(nextDpr)
          }}
        />
        <Environment />
        <Lights layout={layout} />
        <Building layout={layout} reducedMotion={reducedMotion} />
        <CameraRig layout={layout} reducedMotion={reducedMotion} />
        <SceneTelemetry
          floorKeys={floorKeys}
          onFirstFrame={() => setReady(true)}
        />
      </Canvas>

      {/* HTML overlays: Tab order FloorPicker -> CameraModeBar */}
      <div className="pointer-events-none absolute inset-4 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-4">
          <FloorPicker floors={layout.floors} palette={config.palette} />
          <div className="flex flex-1 justify-center">
            <CameraModeBar floorKeys={floorKeys} />
          </div>
          <div className="hidden w-52 lg:block" aria-hidden="true" />
        </div>

        <div className="flex justify-end">
          <ShortcutHint />
        </div>
      </div>
    </div>
  )
}

export default OfficeCanvas
