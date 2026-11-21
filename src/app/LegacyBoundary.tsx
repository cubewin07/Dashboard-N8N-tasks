import { useEffect, type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { startSimulator, stopSimulator } from '@/lib/mock/store'
import { setLegacyRouteActive } from '@/office/store'

export function LegacyBoundary({ children }: { children?: ReactNode }) {
  useEffect(() => {
    setLegacyRouteActive(true)
    startSimulator()
    return () => {
      setLegacyRouteActive(false)
      stopSimulator()
    }
  }, [])

  return children ? <>{children}</> : <Outlet />
}
