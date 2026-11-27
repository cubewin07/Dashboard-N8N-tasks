import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDiagnostics } from '@/office/diagnostics'
import { CanvasErrorBoundary } from '../OfficePage'

// React 19 retries a failed render by itself, so "broken" is a state, not a throw count.
let broken = false
function Flaky() {
  if (broken) throw new Error('scene broke')
  return <p>scene</p>
}

function renderBoundary() {
  return render(
    <CanvasErrorBoundary fallback={(retry) => <button onClick={retry}>reload</button>}>
      <Flaky />
    </CanvasErrorBoundary>,
  )
}

afterEach(() => {
  cleanup()
  useDiagnostics.getState().clear()
  vi.restoreAllMocks()
})

describe('CanvasErrorBoundary (P11-T05)', () => {
  it('retries once by itself and records the error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // The boundary warns once per caught error: heal the scene after the first one.
    vi.spyOn(console, 'warn').mockImplementation(() => {
      broken = false
    })
    broken = true
    renderBoundary()
    expect(screen.getByText('scene')).toBeTruthy()
    expect(useDiagnostics.getState().canvasErrors).toBe(1)
  })

  it('then shows the fallback with a manual reload that works', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    broken = true
    renderBoundary()
    const reload = screen.getByRole('button', { name: 'reload' })
    expect(screen.queryByText('scene')).toBeNull()
    expect(useDiagnostics.getState().canvasErrors).toBe(2)
    broken = false
    fireEvent.click(reload)
    expect(screen.getByText('scene')).toBeTruthy()
  })
})
