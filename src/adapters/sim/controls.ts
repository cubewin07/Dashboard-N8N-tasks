import type { Iso } from '@/domain/primitives'
import { DEFAULT_SIM_START_ISO, type SimSpeed } from './clock'

export type { SimSpeed }

export type ScenarioKey =
  | 'angry_refund'
  | 'sale_1212'
  | 'month_end'
  | 'long_queue'
  | 'hire_temps'
  | 'team_offline'
  | 'boss_telegram'
  | 'crowded'

export const DEFAULT_SIM_SEED = '20261110'

export interface SimControlsSnapshot {
  speed: SimSpeed
  seed: string
  simNow: Iso
  teamOnline: boolean
  autoApproveBoss: boolean
  lastScenario: ScenarioKey | null
}

export interface SimControllerDriver {
  setSpeed(speed: SimSpeed): void
  setSeed(seed: string | number): void
  runScenario(key: ScenarioKey): void
  setTeamOnline(online: boolean): void
  setAutoApproveBoss(enabled: boolean): void
  step?(ticks?: number): void
  getSnapshot(): SimControlsSnapshot
}

function readInitialSeedFromUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_SIM_SEED
  try {
    const hash = window.location.hash || ''
    const qIndex = hash.indexOf('?')
    const hashQuery = qIndex >= 0 ? hash.slice(qIndex + 1) : ''
    const hashParams = new URLSearchParams(hashQuery)
    const fromHash = hashParams.get('seed')
    if (fromHash && fromHash.trim().length > 0) return fromHash.trim()

    const searchParams = new URLSearchParams(window.location.search)
    const fromSearch = searchParams.get('seed')
    if (fromSearch && fromSearch.trim().length > 0) return fromSearch.trim()
  } catch {
    // Ignore URL errors in headless/test environments
  }
  return DEFAULT_SIM_SEED
}

class SimControlsStore {
  private snapshot: SimControlsSnapshot = {
    speed: 30,
    seed: readInitialSeedFromUrl(),
    simNow: DEFAULT_SIM_START_ISO,
    teamOnline: true,
    autoApproveBoss: false,
    lastScenario: null,
  }

  private driver: SimControllerDriver | null = null
  private listeners = new Set<() => void>()

  bindDriver(driver: SimControllerDriver | null): void {
    this.driver = driver
    if (driver) {
      this.snapshot = driver.getSnapshot()
      this.emit()
    }
  }

  syncSnapshot(next: SimControlsSnapshot): void {
    this.snapshot = next
    this.emit()
  }

  getSnapshot = (): SimControlsSnapshot => {
    return this.snapshot
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setSpeed = (speed: SimSpeed): void => {
    if (this.driver) {
      this.driver.setSpeed(speed)
    } else {
      this.snapshot = { ...this.snapshot, speed }
      this.emit()
    }
  }

  pause = (): void => {
    this.setSpeed(0)
  }

  setSeed = (seed: string | number): void => {
    const normalized = String(seed).trim() || DEFAULT_SIM_SEED
    if (this.driver) {
      this.driver.setSeed(normalized)
    } else {
      this.snapshot = { ...this.snapshot, seed: normalized }
      this.emit()
    }
  }

  runScenario = (key: ScenarioKey): void => {
    if (this.driver) {
      this.driver.runScenario(key)
    } else {
      this.snapshot = { ...this.snapshot, lastScenario: key }
      this.emit()
    }
  }

  setTeamOnline = (online: boolean): void => {
    if (this.driver) {
      this.driver.setTeamOnline(online)
    } else {
      this.snapshot = { ...this.snapshot, teamOnline: online }
      this.emit()
    }
  }

  setAutoApproveBoss = (enabled: boolean): void => {
    if (this.driver) {
      this.driver.setAutoApproveBoss(enabled)
    } else {
      this.snapshot = { ...this.snapshot, autoApproveBoss: enabled }
      this.emit()
    }
  }

  step = (ticks = 1): void => {
    this.driver?.step?.(ticks)
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const simControls = new SimControlsStore()
