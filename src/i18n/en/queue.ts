import type { queue as viQueue } from '../vi/queue'

export const queue: typeof viQueue = {
  loading: 'Loading approvals…',
  title: 'Waiting for approval',
  description:
    'Approve what needs the boss and watch the review piles in each department',
  tabs: {
    boss: 'Waiting for Boss',
    departments: 'Department reviews',
  },
  emptyBoss: 'No reviews or questions are waiting for the boss.',
  emptyDepartmentPile: 'No items waiting for review',
  whyBossToggle: 'Why does this need the boss?',
  whyBossDefault: 'Uses default approval level from company policy',
  requesterLabel: 'From: {name}',
  assigneeLabel: 'Approver: {name}',
  priority: {
    urgent: 'Urgent',
    high: 'High',
    normal: 'Normal',
    low: 'Low',
  },
  kindBadge: {
    review: 'Review',
    question: 'Question',
  },
  actions: {
    approve: 'Approve',
    requestChanges: 'Request changes',
    reject: 'Reject',
    answerQuestion: 'Send answer',
  },
  notePlaceholder: 'Feedback note for the worker (required when requesting changes)…',
  noteRequiredHint: 'Please enter a note before requesting changes.',
  answerPlaceholder: 'Type your answer…',
  quickAssignPrefix: 'Assign to {dept}',
  pileCount: '{n} in pile',
  topItemsTitle: 'Top 5 highest-priority items',
  intake: {
    label: 'Message the manager',
    placeholder: 'Message the manager… (e.g. Create 12.12 sale banner for Shopee 1)',
    placeholderShort: 'Message the manager…',
    submit: 'Send request',
    sentHint: 'Sent request to manager Thu',
  },
}
