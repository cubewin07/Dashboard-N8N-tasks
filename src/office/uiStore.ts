import { create } from 'zustand'
import type { EmployeeId } from '@/domain/primitives'

/**
 * Who the boss is looking at. Shared by the 3D scene (click a person, follow
 * camera) and the 2D panels (people list, person drawer), so neither has to
 * know the other exists.
 */
export interface PeopleUiState {
  /** Drawer is open for this person. */
  selectedId: EmployeeId | null
  /** Camera follows this person. */
  followedId: EmployeeId | null
  /** Pointer is over this person in 3D (name label, cursor). */
  hoveredId: EmployeeId | null
  select: (id: EmployeeId | null) => void
  follow: (id: EmployeeId | null) => void
  hover: (id: EmployeeId | null) => void
}

export const usePeopleUi = create<PeopleUiState>((set, get) => ({
  selectedId: null,
  followedId: null,
  hoveredId: null,
  select: (id) => {
    if (get().selectedId !== id) set({ selectedId: id })
  },
  follow: (id) => {
    if (get().followedId !== id) set({ followedId: id })
  },
  hover: (id) => {
    if (get().hoveredId !== id) set({ hoveredId: id })
  },
}))
