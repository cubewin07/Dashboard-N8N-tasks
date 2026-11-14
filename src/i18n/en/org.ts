import type { org as viOrg } from '../vi/org'

export const org: typeof viOrg = {
  title: 'Org chart',
  description: 'Building floors, departments, and staff across AI Office',
  floorBadge: 'Floor {n}',
  topFloorBadge: 'Top floor · Floor {n}',
  hours247: '24/7 coverage',
  hoursOffice: 'Office hours',
  headcount: '{n} people',
  kindCore: 'Core',
  kindTemp: 'Temp',
  modelTier: {
    strong: 'Strong model',
    standard: 'Standard model',
    cheap: 'Light model',
  },
  activity: {
    idle: 'Idle',
    working: 'Working',
    reviewing: 'Reviewing',
    delivering: 'Delivering',
    asking: 'Asking',
    waiting_answer: 'Waiting for answer',
    helping: 'Helping',
    in_meeting: 'In meeting',
    resting: 'Resting',
    off_shift: 'Off shift',
  },
  emptyDepartment: 'No active staff in this department yet.',
  loading: 'Loading organisation chart…',
}
