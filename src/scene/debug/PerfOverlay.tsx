import { useEffect, useRef } from 'react'
import { currentStats } from './stats'

const REFRESH_MS = 500

/**
 * `?perf=1` overlay (P11-T01): one small panel refreshed twice a second by writing
 * text into a <pre>, so it never re-renders React or touches the frame loop.
 * Developer tool: plain English numbers, not translated.
 */
export function PerfOverlay() {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = currentStats()
      if (!ref.current) return
      if (!s) {
        ref.current.textContent = 'perf: waiting for the scene…'
        return
      }
      ref.current.textContent = [
        `fps        ${s.fps}`,
        `p95 ms     ${s.frameMsP95}`,
        `calls      ${s.drawCalls}`,
        `tris       ${s.triangles.toLocaleString('en-US')}`,
        `geoms      ${s.geometries}`,
        `textures   ${s.textures}`,
        `programs   ${s.programs}`,
        `heap MB    ${s.jsHeapMB ?? 'n/a'}`,
      ].join('\n')
    }, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])

  return (
    <pre
      ref={ref}
      data-perf-overlay
      aria-hidden
      className="pointer-events-none absolute bottom-3 left-3 z-30 m-0 rounded-md bg-black/75 px-2.5 py-2 font-mono text-[11px] leading-4 text-white"
    >
      perf: waiting for the scene…
    </pre>
  )
}
