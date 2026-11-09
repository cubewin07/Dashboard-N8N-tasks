// Global "+ Giao việc" sheet state, so any screen can open the Start-work wizard (optionally preset).
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export interface StartWorkPreset { workflowKey?: string; shopId?: number }
interface StartWorkValue {
  open: boolean
  preset: StartWorkPreset
  openStartWork: (preset?: StartWorkPreset) => void
  setOpen: (open: boolean) => void
}
const Ctx = createContext<StartWorkValue | null>(null)

export function StartWorkProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<StartWorkPreset>({})
  const value = useMemo(() => ({ open, preset, setOpen, openStartWork: (p: StartWorkPreset = {}) => { setPreset(p); setOpen(true) } }), [open, preset])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStartWork() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useStartWork must be used inside StartWorkProvider')
  return ctx
}
