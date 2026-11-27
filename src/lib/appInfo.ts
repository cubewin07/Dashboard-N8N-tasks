/** Build facts for Settings → Giới thiệu (set by `define` in vite.config.ts). */
export const APP_VERSION: string = (import.meta.env.VITE_APP_VERSION as string | undefined) || 'dev'
/** Short commit hash of a CI build; empty for local builds. */
export const APP_BUILD: string = (import.meta.env.VITE_APP_BUILD as string | undefined) || ''
