import type { tasks as vi } from '../vi/tasks'

export const tasks: typeof vi = {
  title: 'Tasks',
  description: 'Track active, waiting, blocked and completed workflows across all 5 shops.',
  newTaskButton: '+ Start work',
  tabs: {
    active: 'Active',
    waiting: 'Waiting',
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
      title: 'No active tasks right now',
      description: 'The team is free. Start a new workflow whenever you’re ready.',
    },
    waiting: {
      title: 'Nothing waiting for you',
      description: 'All approvals and questions have been handled.',
    },
    blocked: {
      title: 'No blocked tasks',
      description: 'Every workflow is running smoothly.',
    },
    done: {
      title: 'No finished tasks yet',
      description: 'Completed and cancelled tasks will show up here.',
    },
    all: {
      title: 'No matching tasks found',
      description: 'Try clearing the shop, workflow or employee filters.',
    },
  },
}
