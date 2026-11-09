import type { library as viLibrary } from '../vi/library'

export const library: typeof viLibrary = {
  title: 'Library',
  description: 'All images, videos and content produced by the AI team',
  driveBanner: {
    title: 'Connect Google Drive to preview images and videos',
    description: 'High-resolution previews, raw media files and video playback directly from your shop Drive folders.',
    connectButton: 'Connect Google Drive',
    connecting: 'Connecting…',
  },
  filters: {
    shop: 'Shop',
    allShops: 'All shops',
    workflow: 'Workflow',
    allWorkflows: 'All workflows',
    type: 'File type',
    types: {
      all: 'All',
      image: 'Images',
      video: 'Videos',
      text: 'Text',
    },
    employee: 'Employee',
    allEmployees: 'All employees',
  },
  empty: {
    title: 'No media files found',
    description: 'Try adjusting your filters or choose another shop to see more assets.',
  },
  card: {
    notConnected: 'Drive disconnected',
    videoDuration: '{duration}',
    textFile: 'Text document',
  },
  lightbox: {
    title: 'Media asset details',
    videoNote: 'Simulated video preview. In production with Google Drive, video streams directly from Google.',
    textNote: 'Text content file. Click "Open in Drive" to view the full document.',
    detailsSection: 'File information',
    shop: 'Shop',
    workflow: 'Workflow',
    creator: 'Creator',
    createdAt: 'Created at',
    fileSize: 'File size',
    dimensions: 'Dimensions',
    duration: 'Duration',
    mimeType: 'Format',
    copiedToast: 'Link copied to clipboard',
    copyLink: 'Copy link',
    openDrive: 'Open in Drive',
    goToTask: 'Go to task #{id}',
  },
}
