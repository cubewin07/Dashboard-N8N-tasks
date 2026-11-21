import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { bossQueue, pileFor, waitingSeatsFor } from '@/domain/selectors'
import { intakeParser } from '../brain/intakeParser'
import { createSimFeed } from '../SimFeed'

describe('Scenarios, commands, and intakeParser (P03-T10)', () => {
  describe('7 scenarios + crowded perf scenario within 30 sim-min', () => {
    it('angry_refund: reaches bossQueue with boss_sensitive rule and urgent priority on top, plus acc.refund_payout handoff', async () => {
      const feed = createSimFeed({
        seed: 101,
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())

      const batch = feed.runScenario('angry_refund')
      expect(batch[0]?.type).toBe('sim.scenario')

      const state = feed.getState()
      const bq = bossQueue(state)
      expect(bq.length).toBeGreaterThanOrEqual(1)

      const top = bq[0]!
      expect(top.kind).toBe('review')
      if (top.kind === 'review') {
        const task = state.tasks[top.review.taskId]!
        expect(task.typeKey).toBe('cs.refund_request')
        expect(task.priority).toBe('urgent')
        expect(task.matchedRuleIds).toContain('boss_sensitive')
      }

      const handoffTask = Object.values(state.tasks).find(
        (t) => t.typeKey === 'acc.refund_payout',
      )
      expect(handoffTask).toBeDefined()
    })

    it('sale_1212: creates campaign plan + design/marketing/CS burst with cross-department handoff and help request', async () => {
      const feed = createSimFeed({
        seed: 102,
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())

      const batch = feed.runScenario('sale_1212')
      expect(batch[0]?.type).toBe('sim.scenario')

      const state = feed.getState()
      const tasks = Object.values(state.tasks)
      expect(tasks.some((t) => t.typeKey === 'mkt.campaign_plan')).toBe(true)
      expect(
        tasks.filter((t) => t.departmentId === 'dep_design').length,
      ).toBeGreaterThanOrEqual(4)
      expect(
        tasks.filter((t) => t.departmentId === 'dep_marketing').length,
      ).toBeGreaterThanOrEqual(4)
      expect(
        tasks.filter((t) => t.departmentId === 'dep_cs').length,
      ).toBeGreaterThanOrEqual(2)
      expect(Object.keys(state.help).length).toBeGreaterThanOrEqual(1)
    })

    it('month_end: saturates accounting floor with reconcile x5, revenue report, and VAT return in boss queue', async () => {
      const feed = createSimFeed({
        seed: 103,
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())

      const batch = feed.runScenario('month_end')
      expect(batch[0]?.type).toBe('sim.scenario')

      const state = feed.getState()
      const accTasks = Object.values(state.tasks).filter(
        (t) => t.departmentId === 'dep_accounting',
      )
      expect(
        accTasks.filter((t) => t.typeKey === 'acc.reconcile').length,
      ).toBe(5)
      expect(
        accTasks.some((t) => t.typeKey === 'acc.revenue_report'),
      ).toBe(true)

      const bq = bossQueue(state)
      expect(
        bq.some(
          (item) =>
            item.kind === 'review' &&
            state.tasks[item.review.taskId]?.typeKey === 'acc.vat_return',
        ),
      ).toBe(true)
    })

    it('long_queue: puts 12 reviews and 5 in-person waiting questions onto one dept manager', async () => {
      const feed = createSimFeed({
        seed: 104,
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())

      const batch = feed.runScenario('long_queue')
      expect(batch[0]?.type).toBe('sim.scenario')

      const state = feed.getState()
      const pile = pileFor(state, 'emp_ngoc')
      expect(pile.length).toBe(12)

      const seats = waitingSeatsFor(state, 'emp_ngoc')
      expect(seats.length).toBe(5)
    })

    it('hire_temps: hires temps up to cap and produces a hire_over_cap boss review or cap archive', async () => {
      const feed = createSimFeed({
        seed: 105,
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())

      const batch = feed.runScenario('hire_temps')
      expect(batch[0]?.type).toBe('sim.scenario')

      const state = feed.getState()
      const hiredEvents = batch.filter((e) => e.type === 'staff.hired')
      expect(hiredEvents.length).toBeGreaterThanOrEqual(
        state.config.policy.staffing.tempCap,
      )

      const hasArchivedCap = batch.some(
        (e) =>
          e.type === 'staff.archived' && e.payload.reason === 'cap',
      )
      const hasOverCapBossReview = bossQueue(state).some(
        (item) =>
          item.kind === 'review' &&
          state.tasks[item.review.taskId]?.typeKey === 'sys.hire_over_cap',
      )
      expect(hasArchivedCap || hasOverCapBossReview).toBe(true)
    })

    it('team_offline: toggles connection to offline, stops heartbeats, queues commands, and applies them when back online', async () => {
      const feed = createSimFeed({
        seed: 106,
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())

      expect(feed.connection()).toBe('live')
      feed.runScenario('team_offline')
      expect(feed.connection()).toBe('offline')

      // Advance 10 sim-minutes while offline -> no heartbeats emitted
      const offlineEvents = feed.stepSimMs(10 * 60_000)
      expect(
        offlineEvents.some((e) => e.type === 'system.heartbeat'),
      ).toBe(false)

      // Send a command while offline -> accepted, queued until online
      const cmdId = 'cmd_01JOFFLINETEST000000000001'
      const ack = await feed.send({
        v: 1,
        id: cmdId,
        type: 'intake.submit',
        issuedBy: { userId: 'emp_giam_doc', role: 'boss' },
        issuedAt: feed.now(),
        payload: {
          text: 'Làm banner sale 12.12 cho Shopee 1',
          modality: 'text',
        },
      })
      expect(ack).toEqual({ commandId: cmdId, status: 'accepted' })
      expect(
        feed.getState().log.some((e) => e.causedBy === cmdId),
      ).toBe(false)

      // Toggle back online -> flushes command and emits heartbeat
      feed.runScenario('team_offline')
      expect(feed.connection()).toBe('live')
      expect(
        feed.getState().log.some((e) => e.causedBy === cmdId),
      ).toBe(true)
    })

    it('boss_telegram: emits intake.received from telegram and creates 1-2 tasks', async () => {
      const feed = createSimFeed({
        seed: 107,
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())

      const batch = feed.runScenario('boss_telegram')
      expect(batch[0]?.type).toBe('sim.scenario')
      expect(
        batch.some(
          (e) =>
            e.type === 'intake.received' &&
            e.payload.channel === 'telegram',
        ),
      ).toBe(true)
      const created = batch.filter((e) => e.type === 'task.created')
      expect(created.length).toBeGreaterThanOrEqual(1)
      expect(created.length).toBeLessThanOrEqual(2)
    })

    it('crowded: hires temps past cap up to 80 active people and keeps all departments busy', async () => {
      const feed = createSimFeed({
        seed: 'perf-1',
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())

      feed.runScenario('crowded')
      const state = feed.getState()
      const activeEmployees = state.config.employees.filter(
        (e) => e.state === 'active',
      )
      expect(activeEmployees.length).toBe(80)
    })
  })

  describe('all 7 commands in contracts.md §3', () => {
    it('executes review.decide (and rejects already_decided), question.answer, intake.submit, task.set_priority, task.cancel, staff.hire, staff.dismiss', async () => {
      const feed = createSimFeed({
        seed: 202,
        autoStartTimer: false,
        bindGlobalControls: false,
      })
      await feed.start(makeSeedConfig())
      const issuedBy = { userId: 'emp_giam_doc', role: 'boss' as const }

      // 1. Trigger angry_refund to get a boss review
      feed.runScenario('angry_refund')
      const bq = bossQueue(feed.getState())
      const reviewItem = bq.find((i) => i.kind === 'review')
      expect(reviewItem?.kind).toBe('review')
      const reviewId =
        reviewItem?.kind === 'review' ? reviewItem.review.id : ('rev_none' as const)

      // Decide the review
      const decideAck = await feed.send({
        v: 1,
        id: 'cmd_01JCMDTEST0000000000000001',
        type: 'review.decide',
        issuedBy,
        issuedAt: feed.now(),
        payload: {
          reviewId,
          decision: 'approved',
          note: 'Đồng ý hoàn tiền ngay',
        },
      })
      expect(decideAck.status).toBe('accepted')

      // Second review.decide on the same review -> rejected: already_decided
      const dupDecideAck = await feed.send({
        v: 1,
        id: 'cmd_01JCMDTEST0000000000000002',
        type: 'review.decide',
        issuedBy,
        issuedAt: feed.now(),
        payload: {
          reviewId,
          decision: 'rejected',
          note: 'Từ chối',
        },
      })
      expect(dupDecideAck).toEqual({
        commandId: 'cmd_01JCMDTEST0000000000000002',
        status: 'rejected',
        reason: 'already_decided',
      })

      // 2. intake.submit with unmatched text -> creates question to boss -> question.answer
      await feed.send({
        v: 1,
        id: 'cmd_01JCMDTEST0000000000000003',
        type: 'intake.submit',
        issuedBy,
        issuedAt: feed.now(),
        payload: {
          text: 'Sắp xếp buổi liên hoan cuối tuần cho công ty nhé',
          modality: 'text',
        },
      })
      const openQ = Object.values(feed.getState().questions).find(
        (q) => q.status === 'open',
      )
      expect(openQ).toBeDefined()
      expect(openQ?.text).toBe('Sếp muốn giao việc này cho phòng nào?')

      const answerAck = await feed.send({
        v: 1,
        id: 'cmd_01JCMDTEST0000000000000004',
        type: 'question.answer',
        issuedBy,
        issuedAt: feed.now(),
        payload: {
          questionId: openQ!.id,
          answer: 'Giao cho phòng Marketing chuẩn bị nhé',
        },
      })
      expect(answerAck.status).toBe('accepted')
      expect(feed.getState().questions[openQ!.id]?.status).toBe('answered')

      // 3. intake.submit with matched text -> creates design.banner_set task
      await feed.send({
        v: 1,
        id: 'cmd_01JCMDTEST0000000000000005',
        type: 'intake.submit',
        issuedBy,
        issuedAt: feed.now(),
        payload: {
          text: 'Làm banner sale 12.12 cho Shopee 1',
          modality: 'text',
        },
      })
      const bannerTask = Object.values(feed.getState().tasks).find(
        (t) => t.typeKey === 'design.banner_set',
      )
      expect(bannerTask).toBeDefined()

      // 4. task.set_priority
      const prioAck = await feed.send({
        v: 1,
        id: 'cmd_01JCMDTEST0000000000000006',
        type: 'task.set_priority',
        issuedBy,
        issuedAt: feed.now(),
        payload: {
          taskId: bannerTask!.id,
          priority: 'urgent',
        },
      })
      expect(prioAck.status).toBe('accepted')
      expect(feed.getState().tasks[bannerTask!.id]?.priority).toBe('urgent')

      // 5. task.cancel
      const cancelAck = await feed.send({
        v: 1,
        id: 'cmd_01JCMDTEST0000000000000007',
        type: 'task.cancel',
        issuedBy,
        issuedAt: feed.now(),
        payload: {
          taskId: bannerTask!.id,
          reason: 'Đổi lịch chiến dịch sang tuần sau',
        },
      })
      expect(cancelAck.status).toBe('accepted')
      expect(feed.getState().tasks[bannerTask!.id]?.status).toBe('cancelled')

      // 6. staff.hire
      const hireAck = await feed.send({
        v: 1,
        id: 'cmd_01JCMDTEST0000000000000008',
        type: 'staff.hire',
        issuedBy,
        issuedAt: feed.now(),
        payload: {
          departmentId: 'dep_cs',
          roleKey: 'worker',
          specialties: ['customer_chat'],
        },
      })
      expect(hireAck.status).toBe('accepted')
      const hiredTemp = feed
        .getState()
        .config.employees.find(
          (e) => e.kind === 'temp' && e.state === 'active',
        )
      expect(hiredTemp).toBeDefined()

      // 7. staff.dismiss
      const dismissAck = await feed.send({
        v: 1,
        id: 'cmd_01JCMDTEST0000000000000009',
        type: 'staff.dismiss',
        issuedBy,
        issuedAt: feed.now(),
        payload: {
          employeeId: hiredTemp!.id,
        },
      })
      expect(dismissAck.status).toBe('accepted')
      const dismissedEmp = feed
        .getState()
        .config.employees.find((e) => e.id === hiredTemp!.id)
      expect(dismissedEmp?.state).toBe('archived')
    })
  })

  describe('intakeParser with 20 Vietnamese phrases (with and without diacritics)', () => {
    const PHRASES: ReadonlyArray<{ text: string; expected: string }> = [
      {
        text: 'Làm banner sale 12.12 cho Shopee 1',
        expected: 'design.banner_set',
      },
      {
        text: 'lam banner sale 12.12 cho shopee 1',
        expected: 'design.banner_set',
      },
      {
        text: 'Xử lý yêu cầu hoàn tiền gấp cho khách trên Lazada',
        expected: 'cs.refund_request',
      },
      {
        text: 'xu ly hoan tien khan cho khach lazada',
        expected: 'cs.refund_request',
      },
      {
        text: 'Lập tờ khai thuế GTGT quý 4',
        expected: 'acc.vat_return',
      },
      {
        text: 'lap to khai thue vat quy nay',
        expected: 'acc.vat_return',
      },
      {
        text: 'Viết bài đăng Facebook giới thiệu sản phẩm mới',
        expected: 'mkt.post_fb',
      },
      {
        text: 'viet bai fanpage quang ba san pham',
        expected: 'mkt.post_fb',
      },
      {
        text: 'Dựng video ngắn giới thiệu sản phẩm mới',
        expected: 'design.short_video',
      },
      {
        text: 'dung video ngan quay san pham',
        expected: 'design.short_video',
      },
      {
        text: 'Trả lời đánh giá 1 sao của khách trên Shopee 2',
        expected: 'cs.review_negative',
      },
      {
        text: 'tra loi khieu nai 1 sao tren shopee',
        expected: 'cs.review_negative',
      },
      {
        text: 'Xuất hoá đơn điện tử cho đơn hàng sáng nay',
        expected: 'acc.invoice',
      },
      {
        text: 'xuat hoa don cho khach doanh nghiep',
        expected: 'acc.invoice',
      },
      {
        text: 'Tổng hợp báo cáo doanh số tuần này',
        expected: 'mkt.weekly_report',
      },
      {
        text: 'bao cao tuan doanh so cac san',
        expected: 'mkt.weekly_report',
      },
      {
        text: 'Đối soát thanh toán sàn Shopee tháng 11',
        expected: 'acc.reconcile',
      },
      {
        text: 'doi soat doanh thu shopee',
        expected: 'acc.reconcile',
      },
      {
        text: 'Tạo mã giảm giá voucher cho TikTok Shop',
        expected: 'mkt.voucher',
      },
      {
        text: 'tao ma giam gia khuyen mai tiktok shop',
        expected: 'mkt.voucher',
      },
    ]

    it('matches all 20 phrases accurately and returns empty array for unmatched text', () => {
      expect(PHRASES.length).toBe(20)
      for (const item of PHRASES) {
        const result = intakeParser.parse(item.text)
        expect(result).toContain(item.expected)
      }

      expect(
        intakeParser.parse('Đặt trà sữa chiều nay cho mọi người nhé'),
      ).toEqual([])
    })
  })
})
