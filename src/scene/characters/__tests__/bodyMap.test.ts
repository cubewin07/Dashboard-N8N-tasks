import { describe, expect, it } from 'vitest'
import type { AppearanceBody, AppearanceV1 } from '@/domain/appearance'
import { DEFAULT_CATALOG } from '../catalog'
import {
  effectiveLimits,
  mapBodySliders,
  type BodyLimitMap,
  type WardrobeLimitMeta,
} from '../bodyMap'
import { generateAppearance } from '../generate'

function makeBody(overrides: Partial<AppearanceBody> = {}): AppearanceBody {
  return {
    height: 0.5,
    build: 0.5,
    muscle: 0,
    chest: 0,
    hips: 0,
    shoulders: 0,
    ...overrides,
  }
}

describe('bodyMap slider mapping & limits (R2, §3.3)', () => {
  it.each([
    {
      name: 'neutral rest pose',
      body: makeBody(),
      expectedScale: 1,
      expectedWeights: {
        Heavy: 0,
        Slim: 0,
        Muscle: 0,
        Chest: 0,
        Hips: 0,
        Shoulders: 0,
      },
    },
    {
      name: 'minimum height and slimmest build',
      body: makeBody({ height: 0, build: 0 }),
      expectedScale: 0.92,
      expectedWeights: {
        Heavy: 0,
        Slim: 0.6,
        Muscle: 0,
        Chest: 0,
        Hips: 0,
        Shoulders: 0,
      },
    },
    {
      name: 'quarter build -> Slim 0.3',
      body: makeBody({ height: 0.25, build: 0.25 }),
      expectedScale: 0.96,
      expectedWeights: {
        Heavy: 0,
        Slim: 0.3,
        Muscle: 0,
        Chest: 0,
        Hips: 0,
        Shoulders: 0,
      },
    },
    {
      name: 'three-quarter build -> Heavy 0.4',
      body: makeBody({ height: 0.75, build: 0.75 }),
      expectedScale: 1.04,
      expectedWeights: {
        Heavy: 0.4,
        Slim: 0,
        Muscle: 0,
        Chest: 0,
        Hips: 0,
        Shoulders: 0,
      },
    },
    {
      name: 'maximum height, heaviest build, full muscle/chest/hips/shoulders',
      body: makeBody({
        height: 1,
        build: 1,
        muscle: 1,
        chest: 1,
        hips: 1,
        shoulders: 1,
      }),
      expectedScale: 1.08,
      expectedWeights: {
        Heavy: 0.8,
        Slim: 0,
        Muscle: 0.8,
        Chest: 1,
        Hips: 1,
        Shoulders: 1,
      },
    },
    {
      name: 'clamps out-of-range inputs to 0..1',
      body: makeBody({
        height: 2,
        build: -1,
        muscle: 0.5,
        chest: 1.5,
        hips: -0.2,
        shoulders: 0.4,
      }),
      expectedScale: 1.08,
      expectedWeights: {
        Heavy: 0,
        Slim: 0.6,
        Muscle: 0.4,
        Chest: 1,
        Hips: 0,
        Shoulders: 0.4,
      },
    },
  ])('maps $name', ({ body, expectedScale, expectedWeights }) => {
    const mapped = mapBodySliders(body)
    expect(mapped.scale).toBeCloseTo(expectedScale, 6)
    expect(mapped.weights.Heavy).toBeCloseTo(expectedWeights.Heavy, 6)
    expect(mapped.weights.Slim).toBeCloseTo(expectedWeights.Slim, 6)
    expect(mapped.weights.Muscle).toBeCloseTo(expectedWeights.Muscle, 6)
    expect(mapped.weights.Chest).toBeCloseTo(expectedWeights.Chest, 6)
    expect(mapped.weights.Hips).toBeCloseTo(expectedWeights.Hips, 6)
    expect(mapped.weights.Shoulders).toBeCloseTo(expectedWeights.Shoulders, 6)
  })

  it('clamps mapped scale and morph weights by both morph-key and doc-key limits', () => {
    const limits: BodyLimitMap = {
      height: [0.25, 0.75],
      Heavy: [0, 0.5],
      Muscle: [0.1, 0.6],
      chest: [0.2, 0.8],
      Hips: [0, 0.7],
    }

    const mapped = mapBodySliders(
      makeBody({
        height: 1,
        build: 1,
        muscle: 1,
        chest: 0.95,
        hips: 0.9,
        shoulders: 0.5,
      }),
      limits,
    )

    expect(mapped.scale).toBeCloseTo(1.04, 6)
    expect(mapped.weights.Heavy).toBeCloseTo(0.5, 6)
    expect(mapped.weights.Slim).toBe(0)
    expect(mapped.weights.Muscle).toBeCloseTo(0.6, 6)
    expect(mapped.weights.Chest).toBeCloseTo(0.8, 6)
    expect(mapped.weights.Hips).toBeCloseTo(0.7, 6)
    expect(mapped.weights.Shoulders).toBeCloseTo(0.5, 6)
  })

  it('intersects bodyLimits across two worn items in effectiveLimits', () => {
    const appearance: AppearanceV1 = {
      ...generateAppearance('emp_thu', DEFAULT_CATALOG),
      base: 'female',
      outfit: {
        top: 'top_shirt_office_01',
        bottom: 'bottom_trousers_01',
        fullbody: null,
        outer: null,
        shoes: 'shoes_loafer_01',
      },
    }

    const metas: Record<string, WardrobeLimitMeta> = {
      top_shirt_office_01: {
        bases: {
          female: {
            bodyLimits: {
              Heavy: [0, 0.6],
              Chest: [0.1, 0.85],
              Shoulders: [0, 0.7],
            },
          },
        },
      },
      bottom_trousers_01: {
        bases: {
          female: {
            bodyLimits: {
              Heavy: [0.1, 0.45],
              Chest: [0.2, 0.95],
              Hips: [0.05, 0.6],
            },
          },
        },
      },
    }

    const limits = effectiveLimits(appearance, DEFAULT_CATALOG, metas)

    expect(limits).toEqual({
      Heavy: [0.1, 0.45],
      Chest: [0.2, 0.85],
      Shoulders: [0, 0.7],
      Hips: [0.05, 0.6],
    })

    const mapped = mapBodySliders(
      makeBody({ build: 1, chest: 1, hips: 1, shoulders: 1 }),
      limits,
    )
    expect(mapped.weights.Heavy).toBeCloseTo(0.45, 6)
    expect(mapped.weights.Chest).toBeCloseTo(0.85, 6)
    expect(mapped.weights.Shoulders).toBeCloseTo(0.7, 6)
    expect(mapped.weights.Hips).toBeCloseTo(0.6, 6)
  })

  it('ignores hidden top/bottom limits when a fullbody item hides them', () => {
    const appearance: AppearanceV1 = {
      ...generateAppearance('emp_mai', DEFAULT_CATALOG),
      base: 'female',
      outfit: {
        top: 'top_hoodie_01',
        bottom: 'bottom_jeans_01',
        fullbody: 'fullbody_dress_simple_01',
        outer: null,
        shoes: 'shoes_loafer_01',
      },
    }

    const metas: Record<string, WardrobeLimitMeta> = {
      top_hoodie_01: { bodyLimits: { Heavy: [0, 0.1] } },
      bottom_jeans_01: { bodyLimits: { Hips: [0, 0.2] } },
      fullbody_dress_simple_01: { bodyLimits: { Heavy: [0, 0.75] } },
    }

    const limits = effectiveLimits(appearance, DEFAULT_CATALOG, metas)
    expect(limits).toEqual({ Heavy: [0, 0.75] })
  })
})
