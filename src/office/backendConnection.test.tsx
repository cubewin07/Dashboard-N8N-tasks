import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConnectionState } from '@/ports/OfficeFeed'
import { setBackendRealtime, useBackendConnection, worstConnection } from './backendConnection'

describe('worstConnection', () => {
  it('picks the worse state', () => {
    expect(worstConnection('live', 'live')).toBe('live')
    expect(worstConnection('live', 'reconnecting')).toBe('reconnecting')
    expect(worstConnection('offline', 'reconnecting')).toBe('offline')
    expect(worstConnection('reconnecting', 'offline')).toBe('offline')
  })
})

describe('useBackendConnection', () => {
  afterEach(() => setBackendRealtime(null))

  it('is live when none is set and follows the source', () => {
    let state: ConnectionState = 'live'
    let emit: (c: ConnectionState) => void = () => {}
    const { result } = renderHook(() => useBackendConnection())
    expect(result.current).toBe('live')
    act(() => {
      setBackendRealtime({
        connection: () => state,
        onConnection: (cb) => {
          emit = cb
          return () => {}
        },
      })
    })
    expect(result.current).toBe('live')
    act(() => {
      state = 'offline'
      emit('offline')
    })
    expect(result.current).toBe('offline')
    act(() => setBackendRealtime(null))
    expect(result.current).toBe('live')
  })
})
