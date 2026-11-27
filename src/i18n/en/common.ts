import type { common as vi } from '../vi/common'

export const common: typeof vi = {
  app: { name: 'Shop HQ', tagline: 'An AI team running 5 online shops' },
  backend: {
    loading: 'Connecting to the server…',
    errorTitle: 'Could not reach the server',
    errorBody: 'Check your connection and try again.',
  },
  nav: {
    skipToMain: 'Skip to main content',
    office: 'Office',
    org: 'Org chart',
    queue: 'Approvals',
    activity: 'Activity',
    wardrobe: 'Wardrobe',
    settings: 'Settings',
    more: 'More',
    signOut: 'Sign out',
    mainMenu: 'Main menu',
    admin: 'Admin',
  },
  greeting: { morning: 'Good morning, Boss', afternoon: 'Good afternoon, Boss', evening: 'Good evening, Boss' },
  actions: {
    close: 'Close',
    cancel: 'Cancel',
    retry: 'Retry',
  },
  live: { connecting: 'Connecting…', live: 'Live', reconnecting: 'Reconnecting…', offline: 'Offline: data may be stale', offlineShort: 'Offline' },
  team: { online: 'Team online', offlineSince: 'Team offline since {time} (PC off)', offline: 'Team offline (PC off)' },
  time: { now: 'just now', min: '{n}m ago', hour: '{n}h ago', day: '{n}d ago' },
  command: {
    sending: 'Sending…',
    queued: 'Sent, waiting for the team',
    queuedOffline: 'Queued: will run when the team is back online',
    accepted: 'Team picked it up…',
    applied: 'Applied',
    failed: 'Failed',
    alreadyResolved: 'Already handled on Telegram',
  },
  error: { generic: 'Something went wrong. Please try again.', routeTitle: 'This page could not be loaded', routeHint: 'The app may have just been updated. Reload to get the latest version.', reload: 'Reload page', loadTitle: 'Could not load the office data', loadHint: 'The configuration could not be read or the connection to the team failed. Please try again.' },
  demo: { badge: 'Demo', note: 'Sample data, not connected to the real system' },
}
