// All date display goes through here (vi-VN / Asia/Ho_Chi_Minh). Never call toLocaleString() directly.
import { formatInTimeZone } from 'date-fns-tz'
import { isSameDay, differenceInSeconds } from 'date-fns'
import type { Lang } from '@/i18n'

export const TZ = 'Asia/Ho_Chi_Minh'
const locale = (lang: Lang) => (lang === 'vi' ? 'vi-VN' : 'en-GB')

export function formatTime(iso: string) {
  return formatInTimeZone(iso, TZ, 'HH:mm')
}

export function formatDateTime(iso: string, lang: Lang = 'vi') {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** "Thứ Hai, 09/11 · 09:41" style header date. */
export function formatHeaderDate(date: Date, lang: Lang = 'vi') {
  const d = new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit' }).format(date)
  return `${d} · ${formatInTimeZone(date, TZ, 'HH:mm')}`
}

/** Hour of day in ICT (for the greeting). */
export function ictHour(date: Date = new Date()) {
  return Number(formatInTimeZone(date, TZ, 'H'))
}

export function isTodayICT(iso: string) {
  const fmtDay = (d: Date | string) => formatInTimeZone(d, TZ, 'yyyy-MM-dd')
  return fmtDay(iso) === fmtDay(new Date())
}

/** Short relative time. Labels are passed in so they come from i18n. */
export function relative(iso: string, labels: { now: string; min: string; hour: string; day: string }, base: Date = new Date()) {
  const s = Math.max(0, differenceInSeconds(base, new Date(iso)))
  if (s < 45) return labels.now
  if (s < 3600) return labels.min.replace('{n}', String(Math.round(s / 60)))
  if (s < 86400) return labels.hour.replace('{n}', String(Math.floor(s / 3600)))
  return labels.day.replace('{n}', String(Math.floor(s / 86400)))
}

export { isSameDay }
