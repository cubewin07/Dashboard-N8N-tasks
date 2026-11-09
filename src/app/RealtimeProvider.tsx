// Central realtime: the ONLY place that listens for table changes and patches the query cache.
// MVP: listens to the in-memory store. Later: one supabase.channel(...) with postgres_changes.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getConnection, startSimulator, subscribe, subscribeConnection, type ConnectionState } from '@/lib/mock/store'

const ConnectionContext = createContext<ConnectionState>('live')

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [conn, setConn] = useState<ConnectionState>(getConnection)

  useEffect(() => {
    startSimulator()
    const off = subscribe((table) => {
      qc.invalidateQueries({ queryKey: [table] })
    })
    const offConn = subscribeConnection((c) => {
      setConn((prev) => {
        if (prev !== 'live' && c === 'live') qc.invalidateQueries() // refetch everything on reconnect
        return c
      })
    })
    return () => {
      off()
      offConn()
    }
  }, [qc])

  return <ConnectionContext.Provider value={conn}>{children}</ConnectionContext.Provider>
}

export const useConnection = () => useContext(ConnectionContext)
