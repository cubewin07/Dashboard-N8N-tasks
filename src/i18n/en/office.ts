import type { office as viOffice } from '../vi/office'

export const office: typeof viOffice = {
  title: 'Office',
  subtitle: 'Live AI company building',
  placeholderTitle: 'The building will appear in Phase 2',
  placeholderHint:
    'The 3D canvas is ready (drag to orbit, scroll to zoom). View the full staff directory in Org chart.',
  loadingCanvas: 'Loading 3D scene…',
  canvasError: 'Could not initialize the 3D scene. Showing the 2D list instead.',
  fallbackBanner: 'Compact 2D list view. You can switch to the 3D scene at any time.',
  view3dButton: 'View in 3D',
  view2dButton: 'View 2D list',
  openOrgLink: 'Open full org chart',
}
