import type { Language } from '@shared/settings'

/** A duration such as "45 s", "3 min 12 s" or "1 h 5 min". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ${seconds % 60} s`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

/** Duration between two timestamps; a missing end means "until now". */
export function durationBetween(
  start: string | null,
  end: string | null,
  now: number,
): string | null {
  if (!start) return null
  return formatDuration((end ? Date.parse(end) : now) - Date.parse(start))
}

export function formatTime(iso: string, language: Language): string {
  return new Intl.DateTimeFormat(language, { timeStyle: 'medium' }).format(new Date(iso))
}
