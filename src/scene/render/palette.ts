import * as THREE from 'three'
import paletteData from '@/content/palette.json'

interface SwatchEntry {
  hex: string
  softHex: string
  color: THREE.Color
  softColor: THREE.Color
}

const swatchCache = new Map<string, SwatchEntry>()

for (const item of paletteData) {
  swatchCache.set(item.key, {
    hex: item.hex,
    softHex: item.softHex,
    color: new THREE.Color(item.hex),
    softColor: new THREE.Color(item.softHex),
  })
}

const fallbackSwatch: SwatchEntry = {
  hex: '#64748b',
  softHex: '#f1f5f9',
  color: new THREE.Color('#64748b'),
  softColor: new THREE.Color('#f1f5f9'),
}

export function getSwatchColor(key: string): THREE.Color {
  return swatchCache.get(key)?.color ?? fallbackSwatch.color
}

export function getSwatchSoftColor(key: string): THREE.Color {
  return swatchCache.get(key)?.softColor ?? fallbackSwatch.softColor
}

export function getSwatchHex(key: string): string {
  return swatchCache.get(key)?.hex ?? fallbackSwatch.hex
}

export function getSwatchSoftHex(key: string): string {
  return swatchCache.get(key)?.softHex ?? fallbackSwatch.softHex
}

export const SCENE_PALETTE = {
  skyBg: '#e2e8f0',
  groundDisc: new THREE.Color('#cbd5e1'),
  groundRing: new THREE.Color('#94a3b8'),
  slabStandard: new THREE.Color('#f8fafc'),
  slabEdge: new THREE.Color('#cbd5e1'),
  slabBossWood: new THREE.Color('#78350f'),
  slabBossTerrace: new THREE.Color('#d6d3d1'),
  bossRoofCap: new THREE.Color('#f1f5f9'),
  bossGoldTrim: new THREE.Color('#d97706'),
  wallExterior: new THREE.Color('#e2e8f0'),
  wallInterior: new THREE.Color('#cbd5e1'),
  glassTint: new THREE.Color('#bae6fd'),
  hoverHighlight: new THREE.Color('#38bdf8'),
  focusHighlight: new THREE.Color('#0284c7'),
  elevatorShaftGlass: new THREE.Color('#93c5fd'),
  elevatorFrame: new THREE.Color('#475569'),
  elevatorCar: new THREE.Color('#f59e0b'),
  stairsRamp: new THREE.Color('#94a3b8'),
  stairsRail: new THREE.Color('#64748b'),
  hemiSky: new THREE.Color('#f8fafc'),
  hemiGround: new THREE.Color('#cbd5e1'),
  sunLight: new THREE.Color('#fffbeb'),
  /** Mirrors the status tokens in `src/index.css` (--status-*). */
  status: {
    working: new THREE.Color('#2563eb'),
    waiting: new THREE.Color('#d97706'),
    blocked: new THREE.Color('#dc2626'),
  },
  people: {
    skin: [
      new THREE.Color('#f6d7b8'),
      new THREE.Color('#eec39a'),
      new THREE.Color('#d9a57b'),
      new THREE.Color('#c68d62'),
    ],
    eyes: new THREE.Color('#1e293b'),
    trousers: new THREE.Color('#5b6474'),
    ringHover: new THREE.Color('#f8fafc'),
    ringSelected: new THREE.Color('#38bdf8'),
    ringFollowed: new THREE.Color('#f59e0b'),
    carry: {
      document: new THREE.Color('#f8fafc'),
      laptop: new THREE.Color('#475569'),
      phone: new THREE.Color('#1e293b'),
      tablet: new THREE.Color('#334155'),
      box: new THREE.Color('#b45309'),
      camera: new THREE.Color('#0f172a'),
    },
    label: '#0f172a',
    labelOutline: '#ffffff',
  },
  elevator: {
    carFloor: new THREE.Color('#475569'),
    carShell: new THREE.Color('#e2e8f0'),
    carDoor: new THREE.Color('#94a3b8'),
    carLight: new THREE.Color('#fef3c7'),
  },
  blockout: {
    deskWood: new THREE.Color('#d97706'),
    reviewDesk: new THREE.Color('#0284c7'),
    privateDesk: new THREE.Color('#0f766e'),
    managerDesk: new THREE.Color('#115e59'),
    bossDesk: new THREE.Color('#92400e'),
    chairDark: new THREE.Color('#334155'),
    waitingChair: new THREE.Color('#64748b'),
    meetingTable: new THREE.Color('#b45309'),
    sofaTeal: new THREE.Color('#0d9488'),
    coffeeCounter: new THREE.Color('#78350f'),
    teaTable: new THREE.Color('#eab308'),
    waterCooler: new THREE.Color('#38bdf8'),
    pingpongTable: new THREE.Color('#15803d'),
    arcadeCabinet: new THREE.Color('#7c3aed'),
    boardgameTable: new THREE.Color('#ea580c'),
    karaokeBooth: new THREE.Color('#db2777'),
    napBed: new THREE.Color('#6366f1'),
    massageChair: new THREE.Color('#475569'),
    plantFoliage: new THREE.Color('#16a34a'),
    plantPot: new THREE.Color('#b45309'),
    entranceMat: new THREE.Color('#0284c7'),
  },
} as const
