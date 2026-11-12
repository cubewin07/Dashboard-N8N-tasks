import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { createSimFeed } from '../SimFeed'

const boss = { userId: 'emp_giam_doc', role: 'boss' as const }
const stylist = { userId: 'u_stylist', role: 'stylist' as const }

async function newFeed() {
  const feed = createSimFeed({
    seed: 404,
    autoStartTimer: false,
    bindGlobalControls: false,
  })
  await feed.start(makeSeedConfig())
  return feed
}

describe('sim command validation', () => {
  it('refuses every command from a stylist', async () => {
    const feed = await newFeed()
    const intake = await feed.send({
      v: 1,
      id: 'cmd_01JCMDVALID000000000001',
      type: 'intake.submit',
      issuedBy: stylist,
      issuedAt: feed.now(),
      payload: { text: 'Đăng bài Facebook', modality: 'text' },
    })
    expect(intake).toMatchObject({ status: 'rejected', reason: 'forbidden' })
    expect(Object.keys(feed.getState().messages)).toHaveLength(0)
  })

  it('refuses a hire into an unknown department instead of acking it', async () => {
    const feed = await newFeed()
    const ack = await feed.send({
      v: 1,
      id: 'cmd_01JCMDVALID000000000002',
      type: 'staff.hire',
      issuedBy: boss,
      issuedAt: feed.now(),
      payload: { departmentId: 'dep_nope', roleKey: 'worker', specialties: [] },
    })
    expect(ack).toMatchObject({ status: 'rejected', reason: 'not_found' })
  })

  it('refuses hiring an owner seat and an unknown role', async () => {
    const feed = await newFeed()
    const base = { departmentId: 'dep_cs' as const, specialties: [] as string[] }
    const owner = await feed.send({
      v: 1,
      id: 'cmd_01JCMDVALID000000000003',
      type: 'staff.hire',
      issuedBy: boss,
      issuedAt: feed.now(),
      payload: { ...base, roleKey: 'owner' },
    })
    const ghost = await feed.send({
      v: 1,
      id: 'cmd_01JCMDVALID000000000004',
      type: 'staff.hire',
      issuedBy: boss,
      issuedAt: feed.now(),
      payload: { ...base, roleKey: 'wizard' },
    })
    expect(owner.status).toBe('rejected')
    expect(ghost).toMatchObject({ status: 'rejected', reason: 'not_found' })
  })

  it('hires the requested role', async () => {
    const feed = await newFeed()
    const ack = await feed.send({
      v: 1,
      id: 'cmd_01JCMDVALID000000000005',
      type: 'staff.hire',
      issuedBy: boss,
      issuedAt: feed.now(),
      payload: { departmentId: 'dep_cs', roleKey: 'reviewer', specialties: [] },
    })
    expect(ack.status).toBe('accepted')
    const hired = feed
      .getState()
      .config.employees.filter((e) => e.kind === 'temp')
    expect(hired).toHaveLength(1)
    expect(hired[0]!.roleKey).toBe('reviewer')
  })

  it('refuses invalid commands even while the team is offline', async () => {
    const feed = await newFeed()
    feed.runScenario('team_offline')
    const ack = await feed.send({
      v: 1,
      id: 'cmd_01JCMDVALID000000000006',
      type: 'staff.hire',
      issuedBy: boss,
      issuedAt: feed.now(),
      payload: { departmentId: 'dep_nope', roleKey: 'worker', specialties: [] },
    })
    expect(ack.status).toBe('rejected')
  })
})
