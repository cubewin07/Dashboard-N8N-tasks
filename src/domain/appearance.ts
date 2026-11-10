import { z } from 'zod'

/**
 * Placeholder for AppearanceV1 in P01–P07a.
 * Full schema and type are introduced in P07b.
 */
export type AppearanceV1 = Record<string, unknown>

export const AppearanceV1Schema = z.record(z.string(), z.unknown())
