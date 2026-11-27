import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { createSimFeed } from '../SimFeed'

const issuedBy = { userId: 'emp_giam_doc', role: 'boss' as const }

async function newFeed() {
  const feed = createSimFeed({
    seed: 303,
    autoStartTimer: false,
    bindGlobalControls: false,
  })
  await feed.start(makeSeedConfig())
  return feed
}

describe('intake routing', () => {
  it('links tasks created from an intake message back to that message', async () => {
    const feed = await newFeed()
    await feed.send({
      v: 1,
      id: 'cmd_01JCMDCLARIFY00000000001',
      type: 'intake.submit',
      issuedBy,
      issuedAt: feed.now(),
      payload: { text: 'Đăng bài Facebook giới thiệu hàng mới', modality: 'text' },
    })
    const messages = Object.values(feed.getState().messages)
    expect(messages).toHaveLength(1)
    expect(messages[0]!.taskIds.length).toBeGreaterThan(0)
  })

  it("routes an unclear request to the department the boss names in the answer", async () => {
    const feed = await newFeed()
    await feed.send({
      v: 1,
      id: 'cmd_01JCMDCLARIFY00000000002',
      type: 'intake.submit',
      issuedBy,
      issuedAt: feed.now(),
      payload: { text: 'Sắp xếp lại kho hàng giúp anh', modality: 'text' },
    })
    const state = feed.getState()
    const question = Object.values(state.questions).find((q) => q.status === 'open')!
    const placeholder = state.tasks[question.taskId]!
    const design = state.config.departments.find((d) => d.key === 'design')!

    await feed.send({
      v: 1,
      id: 'cmd_01JCMDCLARIFY00000000003',
      type: 'question.answer',
      issuedBy,
      issuedAt: feed.now(),
      payload: { questionId: question.id, answer: 'Giao cho phòng Thiết kế' },
    })

    const after = feed.getState()
    expect(after.tasks[placeholder.id]?.status).toBe('cancelled')
    const routed = Object.values(after.tasks).filter(
      (t) => t.id !== placeholder.id && t.departmentId === design.id,
    )
    expect(routed).toHaveLength(1)
    expect(routed[0]!.detail).toBe('Sắp xếp lại kho hàng giúp anh')
    const message = Object.values(after.messages)[0]!
    expect(message.taskIds).toContain(routed[0]!.id)
  })

  it('keeps the manager task when the answer points nowhere', async () => {
    const feed = await newFeed()
    await feed.send({
      v: 1,
      id: 'cmd_01JCMDCLARIFY00000000004',
      type: 'intake.submit',
      issuedBy,
      issuedAt: feed.now(),
      payload: { text: 'Sắp xếp lại kho hàng giúp anh', modality: 'text' },
    })
    const question = Object.values(feed.getState().questions)[0]!
    await feed.send({
      v: 1,
      id: 'cmd_01JCMDCLARIFY00000000005',
      type: 'question.answer',
      issuedBy,
      issuedAt: feed.now(),
      payload: { questionId: question.id, answer: 'Em tự xử lý nhé' },
    })
    expect(feed.getState().tasks[question.taskId]?.status).not.toBe('cancelled')
  })
})
