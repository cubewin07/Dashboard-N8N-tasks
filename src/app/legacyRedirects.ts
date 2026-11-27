// Old MVP hashes (bookmarks, Telegram links) → the screen that replaced each one (P11 §3.2).
export const LEGACY_REDIRECTS: { from: string; to: string }[] = [
  { from: '/legacy', to: '/' },
  { from: '/inbox', to: '/queue' },
  { from: '/tasks', to: '/activity' },
  { from: '/tasks/:id', to: '/activity' },
  { from: '/team', to: '/org' },
  { from: '/start', to: '/' },
]
