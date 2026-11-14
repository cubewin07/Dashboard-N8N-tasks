import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMMAND_TYPES, CommandAckSchema, parseCommand } from '../commands'
import { CONTRACT_VERSION } from '../contract'
import { EVENT_TYPES, parseEvent } from '../events'

const rootDir = path.resolve(import.meta.dirname, '../../..')
const fixturesDir = path.resolve(import.meta.dirname, '../__fixtures__')

describe('CONTRACT_VERSION', () => {
  it('equals 1.0 and matches docs/plan/contracts.md', () => {
    expect(CONTRACT_VERSION).toBe('1.0')
    const contractsDoc = fs.readFileSync(
      path.join(rootDir, 'docs/plan/contracts.md'),
      'utf8',
    )
    const match = contractsDoc.match(/office-contract v(\d+\.\d+)/)
    expect(match?.[1]).toBe(CONTRACT_VERSION)
  })
})

describe('Event schemas and fixtures', () => {
  it.each(EVENT_TYPES)('validates valid and rejects invalid fixture for event "%s"', (type) => {
    const validPath = path.join(fixturesDir, 'events', `${type}.valid.json`)
    const invalidPath = path.join(fixturesDir, 'events', `${type}.invalid.json`)

    expect(fs.existsSync(validPath)).toBe(true)
    expect(fs.existsSync(invalidPath)).toBe(true)

    const validRaw = JSON.parse(fs.readFileSync(validPath, 'utf8')) as Record<string, unknown>
    const validRes = parseEvent(validRaw)
    expect(validRes.ok).toBe(true)
    if (validRes.ok) {
      expect(validRes.event.type).toBe(type)
    }

    // Forward compatibility: .passthrough() allows extra fields in payload
    const withExtra = {
      ...validRaw,
      payload: {
        ...(validRaw.payload as Record<string, unknown>),
        futureExtraField: 'forward-compatible',
      },
    }
    const extraRes = parseEvent(withExtra)
    expect(extraRes.ok).toBe(true)

    const invalidRaw = JSON.parse(fs.readFileSync(invalidPath, 'utf8'))
    const invalidRes = parseEvent(invalidRaw)
    expect(invalidRes.ok).toBe(false)
  })

  it('rejects malformed event envelope and unknown event type', () => {
    expect(parseEvent(null).ok).toBe(false)
    expect(parseEvent({ v: 2 }).ok).toBe(false)

    const unknownTypeRes = parseEvent({
      v: 1,
      id: 'evt_01JTEST000000000000000001',
      seq: 1,
      at: '2026-11-10T08:00:00Z',
      type: 'future.unknown_event',
      actor: { kind: 'system', id: null },
      causedBy: null,
      payload: {},
    })
    expect(unknownTypeRes).toEqual({
      ok: false,
      reason: 'unknown_event_type: future.unknown_event',
    })
  })
})

describe('Command schemas and fixtures', () => {
  it.each(COMMAND_TYPES)('validates valid and rejects invalid fixture for command "%s"', (type) => {
    const validPath = path.join(fixturesDir, 'commands', `${type}.valid.json`)
    const invalidPath = path.join(fixturesDir, 'commands', `${type}.invalid.json`)

    expect(fs.existsSync(validPath)).toBe(true)
    expect(fs.existsSync(invalidPath)).toBe(true)

    const validRaw = JSON.parse(fs.readFileSync(validPath, 'utf8'))
    const validRes = parseCommand(validRaw)
    expect(validRes.ok).toBe(true)
    if (validRes.ok) {
      expect(validRes.command.type).toBe(type)
    }

    const invalidRaw = JSON.parse(fs.readFileSync(invalidPath, 'utf8'))
    const invalidRes = parseCommand(invalidRaw)
    expect(invalidRes.ok).toBe(false)
  })

  it('rejects malformed command envelope and validates CommandAck', () => {
    expect(parseCommand({ v: 1 }).ok).toBe(false)

    const ackOk = CommandAckSchema.safeParse({
      commandId: 'cmd_01JTEST000000000000000001',
      status: 'accepted',
    })
    expect(ackOk.success).toBe(true)

    const ackRejected = CommandAckSchema.safeParse({
      commandId: 'cmd_01JTEST000000000000000001',
      status: 'rejected',
      reason: 'already_decided',
    })
    expect(ackRejected.success).toBe(true)
  })
})
