/**
 * Toolbar under the preview: randomise + locks, presets, copy look, undo/redo, reset, compare,
 * save with conflict dialog (P08b-T11). Stub until the toolbar task lands.
 * `onCompare(true|false)` lets the page show the saved look while "compare" is held.
 */
export interface WardrobeToolbarProps {
  onCompare?: (showSaved: boolean) => void
}

export function WardrobeToolbar({ onCompare }: WardrobeToolbarProps) {
  return <div role="toolbar" data-testid="wardrobe-toolbar" data-compare={onCompare ? 'on' : 'off'} />
}
