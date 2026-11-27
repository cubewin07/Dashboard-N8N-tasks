import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

/**
 * One shared TanStack Query client for the 2D screens that fetch server data.
 * Lives outside the app shell (P11-T03): screens that need it wrap themselves in
 * `<QueryScope>`, so the query library stays out of the first download.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

export function QueryScope({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
