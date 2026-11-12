// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ev,
  makeSeedConfig,
  t as testTime,
} from '@/domain/__fixtures__/builders'
import { EVENT_TYPES, parseEvent, type EventType, type OfficeEvent } from '@/domain/events'
import { apply, applyAll, initialState } from '@/domain/reducer'
import { activitySentenceParts } from '@/domain/selectors'
import { I18nProvider } from '@/i18n'
import { en } from '@/i18n/en'
import { vi } from '@/i18n/vi'
import { useConfigStore } from '@/office/configStore'
import { useOffice } from '@/office/store'
import { ActivityPage } from '../ActivityPage'
import { formatActivitySentence } from '../formatActivity'

const fixturesDir = path.resolve(
  import.meta.dirname,
  '../../../domain/__fixtures__/events',
)

function loadFixture<T extends EventType>(type: T, seq: number): OfficeEvent<T> {
  const raw = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, `${type}.valid.json`), 'utf8'),
  ) as Record<string, unknown>
  const parsed = parseEvent({ ...raw, seq, at: testTime(seq) })
  if (!parsed.ok) {
    throw new Error(`Invalid fixture for ${type}: ${parsed.reason}`)
  }
  return parsed.event as OfficeEvent<T>
}

describe('ActivityPage and formatActivitySentence (P03-T13)', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a non-empty sentence for every EventType in both vi and en with no unresolved placeholders', () => {
    const cfg = makeSeedConfig()
    let state = initialState(cfg, testTime(0))
    let seq = 0

    for (const type of EVENT_TYPES) {
      seq += 1
      const evt = loadFixture(type, seq)
      state = apply(state, evt)
      const parts = activitySentenceParts(evt, state)

      const viText = formatActivitySentence(parts, vi, 'vi', state)
      const enText = formatActivitySentence(parts, en, 'en', state)

      expect(viText.length).toBeGreaterThan(5)
      expect(enText.length).toBeGreaterThan(5)
      expect(viText).not.toContain('{')
      expect(viText).not.toContain('}')
      expect(enText).not.toContain('{')
      expect(enText).not.toContain('}')
    }
  })

  it('keeps the virtualised DOM list <= 60 rows when state.log has 500 events', () => {
    const cfg = makeSeedConfig()
    const baseState = initialState(cfg, testTime(0))
    const events: OfficeEvent[] = []
    for (let i = 1; i <= 500; i += 1) {
      events.push({
        ...ev.personActivity(
          'emp_mai',
          i % 2 === 0 ? 'working' : 'idle',
          i,
          testTime(i),
        ),
        id: `evt_01JTEST${String(i).padStart(19, '0')}`,
      })
    }
    const fullState = applyAll(baseState, events)
    expect(fullState.log).toHaveLength(500)

    useConfigStore.setState({ config: cfg, status: 'ready', error: null })
    useOffice.setState({ state: fullState, connection: 'live', commands: {} })

    const { container } = render(
      <I18nProvider>
        <ActivityPage />
      </I18nProvider>,
    )

    const renderedRows = container.querySelectorAll('[data-activity-row]')
    expect(renderedRows.length).toBeGreaterThan(0)
    expect(renderedRows.length).toBeLessThanOrEqual(60)
  })
})
