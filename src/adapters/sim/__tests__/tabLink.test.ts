import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeCommand, makeSeedConfig } from '@/domain/__fixtures__/builders'
import type { OfficeEvent } from '@/domain/events'
import type { OfficeState } from '@/domain/work'
import type { SimControllerDriver, SimControlsSnapshot } from '../controls'
import { SimFeed, type SimFeedOptions } from '../SimFeed'
import {
  LinkedSimFeed,
  TAB_LINK_CHANNEL,
  type TabLinkChannel,
  type TabLinkLocks,
} from '../tabLink'

/** One browser profile's lock manager: one holder, waiters queue, `ifAvailable` never waits. */
function memoryLocks(): TabLinkLocks {
  let holder: symbol | null = null
  const queue: { grant: () => void }[] = []
  return {
    acquire({ ifAvailable, signal, onHeld }) {
      return new Promise<boolean>((resolve) => {
        const token = Symbol('lock')
        const grant = () => {
          holder = token
          onHeld(() => {
            if (holder !== token) return
            holder = null
            queue.shift()?.grant()
          })
          resolve(true)
        }
        if (!holder) return grant()
        if (ifAvailable) return resolve(false)
        const entry = { grant }
        queue.push(entry)
        signal?.addEventListener('abort', () => {
          const i = queue.indexOf(entry)
          if (i >= 0) queue.splice(i, 1)
          resolve(false)
        })
      })
    },
  }
}

function stubControls() {
  let driver: SimControllerDriver | null = null
  const listeners = new Set<() => void>()
  const synced: SimControlsSnapshot[] = []
  return {
    bindDriver: (d: SimControllerDriver | null) => {
      driver = d
    },
    syncSnapshot: (s: SimControlsSnapshot) => {
      synced.push(s)
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getSnapshot: () => synced.at(-1) ?? (null as unknown as SimControlsSnapshot),
    driver: () => driver,
    emit: () => listeners.forEach((l) => l()),
    synced,
  }
}

const channel = () => new BroadcastChannel(TAB_LINK_CHANNEL) as unknown as TabLinkChannel
const flush = () => new Promise((r) => setTimeout(r, 30))

const feeds: LinkedSimFeed[] = []
afterEach(() => {
  feeds.splice(0).forEach((f) => f.stop())
})

function tab(locks: TabLinkLocks, inners: SimFeed[], id: string) {
  const controls = stubControls()
  const feed = new LinkedSimFeed(
    { seed: 'tab-link' },
    {
      channel,
      locks,
      controls,
      id,
      createInner: (o: SimFeedOptions) => {
        const inner = new SimFeed({ ...o, speed: 30, autoStartTimer: false, bindGlobalControls: false })
        inners.push(inner)
        return inner
      },
    },
  )
  feeds.push(feed)
  return { feed, controls }
}

describe('LinkedSimFeed (P11-T04: one company per browser profile)', () => {
  it('without locks or a channel it is a plain sim', async () => {
    const lone = new LinkedSimFeed(
      {},
      {
        locks: null,
        controls: stubControls(),
        createInner: (o) => new SimFeed({ ...o, autoStartTimer: false, bindGlobalControls: false }),
      },
    )
    feeds.push(lone)
    const snap = await lone.start(makeSeedConfig())
    expect(lone.linkRole).toBe('leader')
    expect(Object.keys(snap.state.people).length).toBeGreaterThan(0)
  })

  it('the second tab follows the first: same state, then the same events', async () => {
    const locks = memoryLocks()
    const inners: SimFeed[] = []
    const a = tab(locks, inners, 'a')
    const b = tab(locks, inners, 'b')
    const config = makeSeedConfig()

    await a.feed.start(config)
    const aBatches: OfficeEvent[][] = []
    a.feed.subscribe((batch) => aBatches.push(batch))
    inners[0].stepSimMs(30 * 60_000)

    const snapB = await b.feed.start(config)
    expect(a.feed.linkRole).toBe('leader')
    expect(b.feed.linkRole).toBe('follower')
    expect(inners).toHaveLength(1)
    expect(snapB.state.now).toBe(inners[0].getState().now)
    expect(snapB.state.seq).toBe(inners[0].getState().seq)
    expect(Object.keys(snapB.state.people)).toEqual(Object.keys(inners[0].getState().people))

    const bBatches: OfficeEvent[][] = []
    b.feed.subscribe((batch) => bBatches.push(batch))
    aBatches.length = 0
    inners[0].stepSimMs(10 * 60_000)
    await flush()
    expect(aBatches.length).toBeGreaterThan(0)
    expect(bBatches.flat().map((e) => e.id)).toEqual(aBatches.flat().map((e) => e.id))
    // The clock between batches arrives with the controls snapshot the sim posts every tick.
    a.controls.emit()
    await flush()
    expect(b.feed.now()).toBe(inners[0].now())
  })

  it('a follower command runs in the leader and the ack comes back', async () => {
    const locks = memoryLocks()
    const inners: SimFeed[] = []
    const a = tab(locks, inners, 'a')
    const b = tab(locks, inners, 'b')
    const config = makeSeedConfig()
    await a.feed.start(config)
    a.feed.subscribe(() => {})
    await b.feed.start(config)
    const send = vi.spyOn(inners[0], 'send')

    const cmd = makeCommand(
      'intake.submit',
      { text: 'Viết mô tả sản phẩm chăn ga mới', modality: 'text' },
      { id: 'cmd_01JTEST00000000000000TAB1' as never },
    )
    const ack = await b.feed.send(cmd)
    expect(send).toHaveBeenCalledTimes(1)
    expect(ack.commandId).toBe(cmd.id)
    expect(ack.status).toBe('accepted')
  })

  it('sim controls from a follower drive the leader', async () => {
    const locks = memoryLocks()
    const inners: SimFeed[] = []
    const a = tab(locks, inners, 'a')
    const b = tab(locks, inners, 'b')
    const config = makeSeedConfig()
    await a.feed.start(config)
    await b.feed.start(config)
    const setSpeed = vi.spyOn(inners[0], 'setSpeed')
    const runScenario = vi.spyOn(inners[0], 'runScenario')

    b.controls.driver()?.setSpeed(120)
    b.controls.driver()?.runScenario('long_queue')
    await flush()
    expect(setSpeed).toHaveBeenCalledWith(120)
    expect(runScenario).toHaveBeenCalledWith('long_queue')

    a.controls.emit()
    await flush()
    expect(b.controls.synced.at(-1)?.speed).toBe(120)
  })

  it('a config edit in a follower reaches the leader', async () => {
    const locks = memoryLocks()
    const inners: SimFeed[] = []
    const a = tab(locks, inners, 'a')
    const b = tab(locks, inners, 'b')
    const config = makeSeedConfig()
    await a.feed.start(config)
    await b.feed.start(config)
    const reconfigure = vi.spyOn(inners[0], 'reconfigure')
    b.feed.reconfigure(config, null)
    await flush()
    expect(reconfigure).toHaveBeenCalledTimes(1)
  })

  it('when the leader tab closes, the follower carries the company on', async () => {
    const locks = memoryLocks()
    const inners: SimFeed[] = []
    const a = tab(locks, inners, 'a')
    const b = tab(locks, inners, 'b')
    const config = makeSeedConfig()
    await a.feed.start(config)
    await b.feed.start(config)
    const resets: OfficeState[] = []
    b.feed.onReset((s) => resets.push(s))
    const batches: OfficeEvent[][] = []
    b.feed.subscribe((batch) => batches.push(batch))

    a.feed.stop()
    await flush()
    expect(b.feed.linkRole).toBe('leader')
    expect(inners).toHaveLength(2)
    expect(resets).toHaveLength(1)

    batches.length = 0
    inners[1].stepSimMs(10 * 60_000)
    expect(batches.length).toBeGreaterThan(0)

    // A third tab now follows the new leader.
    const c = tab(locks, inners, 'c')
    await c.feed.start(config)
    expect(c.feed.linkRole).toBe('follower')
  })

  it('a lone tab posts nothing on the channel', async () => {
    const locks = memoryLocks()
    const inners: SimFeed[] = []
    const a = tab(locks, inners, 'a')
    const spy = new BroadcastChannel(TAB_LINK_CHANNEL)
    const seen: unknown[] = []
    spy.onmessage = (e) => seen.push(e.data)
    await a.feed.start(makeSeedConfig())
    a.feed.subscribe(() => {})
    inners[0].stepSimMs(30 * 60_000)
    await flush()
    spy.close()
    expect(seen.filter((m) => (m as { t: string }).t !== 'leader')).toEqual([])
  })
})
