import type { credits as viCredits } from '../vi/credits'

export const credits: typeof viCredits = {
  title: 'Credits',
  description: 'Authors and licences of every 3D model, image and font in the app',
  loading: 'Loading the list…',
  error: 'Could not load the credits list. Please try again later.',
  empty: 'No assets have been recorded yet.',
  summary: '{count} files · {authors} author groups',
  filesCount: '{count} files',
  licenseLabel: 'Licence',
  sourceLabel: 'Source',
  modifiedBadge: 'Modified',
  showFiles: 'Show file list',
  backToSettings: 'Back to Settings',
  licenses: {
    'own-CC0': 'Made in this project · CC0 1.0',
    CC0: 'CC0 1.0 (public domain)',
    'CC-BY-4.0': 'CC BY 4.0 (attribution)',
    'OFL-1.1': 'SIL Open Font License 1.1',
  },
  settingsCard: {
    title: 'Asset credits',
    description: '3D models, palette and fonts used in the building',
    open: 'View credits',
  },
}
