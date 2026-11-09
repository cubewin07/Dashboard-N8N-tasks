import type { tasks as vi } from '../vi/tasks'

export const tasks: typeof vi = {
  title: 'Tasks',
  description: 'Track all tasks currently working, waiting for your approval, or finished across your 5 shops.',
  newTaskButton: '+ Start work',
  tabs: {
    active: 'Working',
    waiting: 'Waiting for you',
    blocked: 'Blocked',
    done: 'Done',
    all: 'All',
  },
  filters: {
    shopLabel: 'Shop',
    allShops: 'All shops',
    workflowLabel: 'Workflow',
    allWorkflows: 'All workflows',
    employeeLabel: 'Employee',
    allEmployees: 'All employees',
    reset: 'Clear filters',
  },
  columns: {
    id: '#',
    workflow: 'Workflow',
    shop: 'Shop',
    owner: 'Owner',
    steps: 'Steps',
    status: 'Status',
    updated: 'Updated',
  },
  rowAria: 'Open task #{id} — {workflow} ({shop})',
  empty: {
    active: {
      title: 'No tasks working right now',
      description: 'The team is free. You can start new work anytime.',
    },
    waiting: {
      title: 'Nothing waiting for you',
      description: 'You have handled all pending approvals and questions.',
    },
    blocked: {
      title: 'No blocked tasks',
      description: 'Everything is running smoothly.',
    },
    done: {
      title: 'No finished tasks yet',
      description: 'Completed and cancelled tasks will show up here.',
    },
    all: {
      title: 'No matching tasks found',
      description: 'Try changing the shop, workflow or employee filters.',
    },
  },
}
