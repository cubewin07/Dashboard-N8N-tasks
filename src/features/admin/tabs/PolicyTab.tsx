// P10-T09 · Chính sách (R6): the whole `Policy` as one grouped form with a per-field reset.
import { useMemo } from 'react'
import { useConfig } from '@/office/hooks'
import { seedConfig } from '@/office/configStore'
import { PolicyForm } from '../policy/PolicyForm'

export function PolicyTab() {
  const { config } = useConfig()
  const seed = useMemo(() => seedConfig().policy, [])
  if (!config) return null
  return <PolicyForm saved={config.policy} seed={seed} />
}
