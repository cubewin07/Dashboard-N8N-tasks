// Drive helpers. MVP: artifacts have fake Drive ids, so previews are generated SVG placeholders.
// Later: fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, { headers: { Authorization: `Bearer ${token}` } }).
import type { Tables } from '@/lib/database.types'

const palettes = [
  ['#f97316', '#dc2626'],
  ['#0f766e', '#14b8a6'],
  ['#7c3aed', '#db2777'],
  ['#2563eb', '#0ea5e9'],
  ['#d97706', '#facc15'],
  ['#16a34a', '#84cc16'],
]

/** Placeholder preview image (data URL) sized to the artifact's aspect ratio. */
export function demoPreviewUrl(a: Pick<Tables<'artifacts'>, 'id' | 'title' | 'width' | 'height' | 'type'>) {
  const w = a.width ?? 1080
  const h = a.height ?? 1080
  const [c1, c2] = palettes[a.id % palettes.length]
  const label = a.title.replace(/[<>&"]/g, '').slice(0, 40)
  const fs = Math.round(Math.min(w, h) / 14)
  const play = a.type === 'video' ? `<circle cx="${w / 2}" cy="${h / 2}" r="${fs * 1.6}" fill="rgba(255,255,255,.85)"/><path d="M${w / 2 - fs * 0.5} ${h / 2 - fs * 0.8}L${w / 2 + fs * 0.9} ${h / 2}L${w / 2 - fs * 0.5} ${h / 2 + fs * 0.8}Z" fill="${c2}"/>` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * 0.82}" cy="${h * 0.2}" r="${Math.min(w, h) * 0.25}" fill="rgba(255,255,255,.12)"/>${play}<text x="${w * 0.06}" y="${h - fs * 1.4}" font-family="Be Vietnam Pro, sans-serif" font-weight="700" font-size="${fs}" fill="#fff">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export const driveViewUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/view`
export const drivePreviewUrl = (fileId: string) => `https://drive.google.com/file/d/${fileId}/preview`
