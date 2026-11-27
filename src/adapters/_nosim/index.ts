// Stand-in for `src/adapters/sim` in builds without the simulator (P11-T09).
// vite.config.ts aliases `@/adapters/sim` here when VITE_FEED=none (or VITE_SIM_STUB=1),
// so the registry's dynamic import resolves to the NullFeed: an empty office from the
// config, no events, commands refused with `no_feed`, and no control panel or tour
// controls. See docs/plan/removing-the-simulator.md.
export { NullFeed as SimFeed } from '@/adapters/local/NullFeed'

export const SimControlPanel = null
export const simControls = null
