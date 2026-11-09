// MVP Google Drive connection: simulated. Later: Google Identity Services token flow (drive.readonly),
// access token kept in this context's memory ONLY (never localStorage / Supabase).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type DriveState = 'disconnected' | 'connecting' | 'connected'
interface DriveValue {
  state: DriveState
  connected: boolean
  accountEmail: string | null
  connect: () => Promise<void>
  disconnect: () => void
}
const DriveContext = createContext<DriveValue | null>(null)

export function DriveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DriveState>('disconnected')
  const value = useMemo<DriveValue>(
    () => ({
      state,
      connected: state === 'connected',
      accountEmail: state === 'connected' ? 'shophq.demo@gmail.com' : null,
      async connect() {
        setState('connecting')
        await new Promise((r) => setTimeout(r, 900))
        setState('connected')
      },
      disconnect: () => setState('disconnected'),
    }),
    [state],
  )
  return <DriveContext.Provider value={value}>{children}</DriveContext.Provider>
}

export function useDrive() {
  const ctx = useContext(DriveContext)
  if (!ctx) throw new Error('useDrive must be used inside DriveProvider')
  return ctx
}
