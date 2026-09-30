import { describe, expect, it } from 'vitest'
import { calendarDay, calendarMonth } from '../src/client/calendar.ts'

describe('China calendar', () => {
  it('shows the lunar festival and the 2026 official holiday adjustments', () => {
    expect(calendarDay(2026, 9, 25)).toMatchObject({
      lunar: '十五', festivals: ['中秋节'], schedule: 'holiday', scheduleKnown: true,
    })
    expect(calendarDay(2026, 9, 20).schedule).toBe('makeup')
    expect(calendarDay(2026, 10, 10).schedule).toBe('makeup')
    expect(calendarDay(2026, 10, 1)).toMatchObject({ festivals: ['国庆节'], schedule: 'holiday' })
    expect(calendarDay(2026, 9, 30).schedule).toBe('workday')
    expect(calendarDay(2026, 9, 19).schedule).toBe('weekend')
  })

  it('keeps unannounced schedules distinct from ordinary weekday calculations', () => {
    expect(calendarDay(2027, 1, 1)).toMatchObject({ scheduleKnown: false, schedule: 'workday' })
    expect(calendarDay(2027, 1, 2)).toMatchObject({ scheduleKnown: false, schedule: 'weekend' })
  })

  it('includes solar terms, traditional fortune labels, and leap-month lunar dates', () => {
    expect(calendarDay(2026, 9, 23).term).toBe('秋分')
    expect(calendarDay(2026, 10, 1)).toMatchObject({ deity: '白虎', auspicious: false })
    expect(calendarDay(2026, 10, 10)).toMatchObject({ deity: '明堂', auspicious: true })
    expect(calendarDay(2025, 7, 25).lunar).toBe('闰六月')
    expect(calendarDay(2026, 9, 30).suitable.length).toBeGreaterThan(0)
  })

  it('builds complete Monday-first weeks through year and leap-day changes', () => {
    const september = calendarMonth(2026, 9)
    expect(september).toHaveLength(35)
    expect(september[0]?.date).toBe('2026-08-31')
    expect(september.at(-1)?.date).toBe('2026-10-04')
    expect(calendarMonth(2024, 2).find(day => day.date === '2024-02-29')).toBeDefined()
    expect(calendarMonth(2026, 12).at(-1)?.date).toBe('2027-01-03')
  })
})
