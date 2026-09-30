import { describe, expect, it } from 'vitest'
import { calendarDaysUntil, timeProgress } from '../src/client/time.ts'

describe('Dashboard local dates', () => {
  it('counts calendar days and rejects impossible dates', () => {
    const now = new Date(2026, 11, 31, 23, 50)
    expect(calendarDaysUntil('2027-01-01', now)).toBe(1)
    expect(calendarDaysUntil('2026-12-30', now)).toBe(-1)
    expect(calendarDaysUntil('2026-02-30', now)).toBeUndefined()
  })

  it('uses the actual leap-year endpoints for the year bar', () => {
    const rows = timeProgress(new Date(2024, 6, 2, 12))
    const year = rows.find(row => row.id === 'year')
    expect(year?.percent).toBeCloseTo((new Date(2024, 6, 2, 12).getTime() - new Date(2024, 0, 1).getTime())
      / (new Date(2025, 0, 1).getTime() - new Date(2024, 0, 1).getTime()) * 100)
    expect(rows.every(row => row.percent >= 0 && row.percent <= 100)).toBe(true)
  })
})
