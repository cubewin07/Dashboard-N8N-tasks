/** Build facts for Settings → Giới thiệu (set by `define` in vite.config.ts). */
export const APP_VERSION: string = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev'
/** Short commit hash of a CI build; empty for local builds. */
export const APP_BUILD: string = (import.meta.env.VITE_APP_BUILD as string | undefined) || ''
/** The public repository: credits link our own generator scripts here. */
export const REPO_URL = 'https://github.com/cubewin07/Dashboard-N8N-tasks'
