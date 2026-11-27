// Roles and route access (R13). Data-like so a new role or route is a table edit.
export type Role = 'boss' | 'stylist'

export type Action =
  | 'command'
  | 'wardrobe'
  | 'office'
  | 'org'
  | 'queue'
  | 'activity'
  | 'settings.full'
  | 'credits'
  | 'dev'
  | 'admin'

/** Exact path, or a prefix ending in `/*` (matches the prefix itself and anything below it). */
export type RoutePattern = string

export const routeAccess: Record<Role, RoutePattern[]> = {
  boss: ['*'],
  stylist: ['/wardrobe', '/settings', '/credits', '/login', '/reset-password'],
}

const actionAccess: Record<Role, ReadonlySet<Action>> = {
  boss: new Set<Action>([
    'command',
    'wardrobe',
    'office',
    'org',
    'queue',
    'activity',
    'settings.full',
    'credits',
    'dev',
    'admin',
  ]),
  stylist: new Set<Action>(['wardrobe', 'credits']),
}

export function can(role: Role | null | undefined, action: Action): boolean {
  return role ? actionAccess[role].has(action) : false
}

function matches(pattern: RoutePattern, pathname: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('/*')) {
    const base = pattern.slice(0, -2)
    return pathname === base || pathname.startsWith(`${base}/`)
  }
  return pathname === pattern || pathname.startsWith(`${pattern}/`)
}

export function canAccessRoute(role: Role | null | undefined, pathname: string): boolean {
  if (!role) return false
  return routeAccess[role].some((p) => matches(p, pathname))
}

export function landingFor(role: Role): string {
  return role === 'stylist' ? '/wardrobe' : '/'
}
