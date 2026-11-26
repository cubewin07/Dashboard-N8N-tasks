import { useContext } from 'react'
import { UNSAFE_DataRouterStateContext } from 'react-router-dom'

/**
 * True while the data router is moving to another location (e.g. loading a lazy route chunk).
 * A page that mirrors its state into the URL with `setSearchParams` must not write then: the
 * write navigates to the *current* path and cancels the pending navigation, so the user is
 * pulled back. False outside a data router (plain `MemoryRouter` in unit tests).
 */
export function useRouterBusy(): boolean {
  const state = useContext(UNSAFE_DataRouterStateContext)
  return state ? state.navigation.state !== 'idle' : false
}
