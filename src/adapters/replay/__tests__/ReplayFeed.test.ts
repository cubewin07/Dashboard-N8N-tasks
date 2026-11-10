import { describe, expect, it } from 'vitest'
import { createSimFeed } from '@/adapters/sim/SimFeed'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import goldenDaySeed1Raw from '@/domain/__fixtures__/golden/day-seed-1.json'
import type { OfficeEvent } from '@/domain/events'
import { applyAll, initialState } from '@/domain/reducer'
import {
  createReplayFeed,
  hashOfficeState,
  type ReplayLogBundle,
} from '../ReplayFeed'

const goldenBundle = goldenDaySeed1Raw as unknown as ReplayLogBundle

describe('ReplayFeed and golden logs (P03-T11)', () => {
  it('replays day-seed-1.json through applyAll & ReplayFeed matching the stored stateHash, and rejects send with reason "replay"', async () => {
    const config = makeSeedConfig()
    const directState = applyAll(
      initialState(config, goldenBundle.startIso),
      goldenBundle.events,
    )
    expect(hashOfficeState(directState)).toBe(goldenBundle.stateHash)

    const replayFeed = createReplayFeed({
      events: goldenBundle.events,
      speed: 30,
      autoStartTimer: false,
    })

    await replayFeed.start(config)
    const ack = await replayFeed.send({
      v: 1,
      id: 'cmd_01JREPLAYTEST0000000000001',
      type: 'intake.submit',
      issuedBy: { userId: 'emp_giam_doc', role: 'boss' },
      issuedAt: replayFeed.now(),
      payload: {
        text: 'Thử gửi lệnh trong chế độ replay',
        modality: 'text',
      },
    })
    expect(ack).toEqual({
      commandId: 'cmd_01JREPLAYTEST0000000000001',
      status: 'rejected',
      reason: 'replay',
    })

    const finalState = replayFeed.replayAll()
    expect(hashOfficeState(finalState)).toBe(goldenBundle.stateHash)
  })

  it('reproduces day-seed-1.json byte-for-byte when SimFeed runs with seed 1 for one sim day', async () => {
    const config = makeSeedConfig()
    const simFeed = createSimFeed({
      seed: goldenBundle.seed,
      speed: 30,
      autoStartTimer: false,
      bindGlobalControls: false,
    })

    const events: OfficeEvent[] = []
    await simFeed.start(config)
    simFeed.subscribe((batch) => {
      events.push(...batch)
    })

    simFeed.stepSimMs(goldenBundle.simDurationMs)

    expect(events.length).toBe(goldenBundle.events.length)
    expect(JSON.stringify(events)).toBe(JSON.stringify(goldenBundle.events))
    expect(hashOfficeState(simFeed.getState())).toBe(goldenBundle.stateHash)
  })
})
