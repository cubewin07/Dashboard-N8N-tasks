// The ONE place that picks the AuthPort implementation (LocalAuth now, Supabase in P09).
import { LocalAuth } from '@/adapters/local/LocalAuth'
import type { AuthPort } from '@/ports/AuthPort'

export const authPort: AuthPort = new LocalAuth()
export { DEMO_ACCOUNT_EMAILS } from '@/adapters/local/LocalAuth'
