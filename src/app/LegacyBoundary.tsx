import { useEffect, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { startSimulator, stopSimulator } from '@/lib/mock/store'

export function LegacyBoundary({ children }: { children?: ReactNode }) {
  useEffect(() => {
    startSimulator()
    return () => {
      stopSimulator()
    }
  }, [])

  return children ? <>{children}</> : <Outlet />
}
