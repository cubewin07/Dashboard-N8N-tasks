import { describe, expect, it } from 'vitest'
import { makeEvent, makeState } from '@/domain/__fixtures__/builders'
import { activitySentenceParts } from '@/domain/selectors'
import { en } from '@/i18n/en'
import { vi } from '@/i18n/vi'
import { actorLabel, formatActivitySentence } from '../formatActivity'

describe('formatActivitySentence', () => {
  const state = makeState()

  it('labels non-person actors from i18n, not from strings in the domain', () => {
    const heartbeat = activitySentenceParts(
      state,
      makeEvent('staff.archived', { employeeId: 'emp_mai', reason: 'cap' }),
    )
    expect(heartbeat.actorKind).toBe('system')
    expect(actorLabel({ actorName: null, actorKind: 'system' }, vi)).toBe(vi.activity.actors.system)
    expect(actorLabel({ actorName: null, actorKind: 'system' }, en)).toBe(en.activity.actors.system)
    expect(actorLabel({ actorName: null, actorKind: 'owner' }, en)).toBe('Boss')
    expect(actorLabel({ actorName: 'Mai', actorKind: 'employee' }, en)).toBe('Mai')
  })

  it('translates the channel and archive reason in both languages', () => {
    const intake = activitySentenceParts(
      state,
      makeEvent(
        'intake.received',
        {
          messageId: 'msg_01JTEST000000000000000001',
          channel: 'telegram',
          modality: 'text',
          fromUserId: 'emp_giam_doc',
          text: 'Đăng bài',
        },
        { actor: { kind: 'owner', id: 'emp_giam_doc' } },
      ),
    )
    expect(formatActivitySentence(intake, en, 'en', state)).toContain('Telegram')
    expect(formatActivitySentence(intake, en, 'en', state)).toContain('Boss')
    expect(formatActivitySentence(intake, vi, 'vi', state)).toContain('Sếp')

    const archived = activitySentenceParts(
      state,
      makeEvent('staff.archived', { employeeId: 'emp_mai', reason: 'cap' }),
    )
    expect(formatActivitySentence(archived, en, 'en', state)).toContain(en.activity.archiveReasons.cap)
    expect(formatActivitySentence(archived, vi, 'vi', state)).toContain(vi.activity.archiveReasons.cap)
  })
})
