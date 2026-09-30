/** Local-time calculations used by the calendar, countdown, and progress card. */

/**
 * Calendar-day distance independent of daylight-saving day length.
 * @param target - local ISO date selected in the browser.
 * @param now - current local time.
 * @returns signed calendar days, or undefined for an invalid date.
 */
export function calendarDaysUntil(target: string, now: Date): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) return undefined
  const year = Number(target.slice(0, 4))
  const month = Number(target.slice(5, 7))
  const day = Number(target.slice(8, 10))
  const parsed = new Date(year, month - 1, day)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return undefined
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000)
}

/**
 * Local day, month, and year elapsed percentages; leap years and DST use real boundaries.
 * @param now - current local time.
 * @returns elapsed percentages for the three local periods.
 */
export function timeProgress(now: Date): readonly { readonly id: 'day' | 'month' | 'year'; readonly percent: number }[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  const periods = [
    { id: 'day', start: new Date(year, month, now.getDate()), end: new Date(year, month, now.getDate() + 1) },
    { id: 'month', start: new Date(year, month, 1), end: new Date(year, month + 1, 1) },
    { id: 'year', start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) },
  ] as const
  return periods.map(({ id, start, end }) => ({ id, percent: Math.max(0, Math.min(100,
    (now.getTime() - start.getTime()) / (end.getTime() - start.getTime()) * 100)) }))
}
