/** Chinese calendar data calculated locally; official holiday coverage is year-specific. */
import { HolidayUtil, Solar } from 'lunar-typescript'

/** Calendar date, traditional almanac, and mainland China work schedule. */
export interface CalendarDay {
  readonly date: string
  readonly day: number
  readonly weekday: number
  readonly lunar: string
  readonly lunarFull: string
  readonly festivals: readonly string[]
  readonly term: string
  readonly ganZhi: string
  readonly zodiac: string
  readonly deity: string
  readonly auspicious: boolean
  readonly suitable: readonly string[]
  readonly avoid: readonly string[]
  readonly schedule: 'workday' | 'weekend' | 'holiday' | 'makeup'
  readonly holidayName: string
  readonly scheduleKnown: boolean
}

/**
 * Calculate one date without a network request. Uncovered years use weekdays only.
 * @param year - Gregorian year, from 1901 through 2099.
 * @param month - Gregorian month, from 1 through 12.
 * @param day - day of the Gregorian month.
 * @returns lunar date, traditional almanac entries, and holiday coverage.
 */
export function calendarDay(year: number, month: number, day: number): CalendarDay {
  const solar = Solar.fromYmd(year, month, day)
  const lunar = solar.getLunar()
  const holiday = HolidayUtil.getHoliday(year, month, day)
  const scheduleKnown = HolidayUtil.getHolidays(year).length > 0
  return {
    date: solar.toYmd(), day, weekday: solar.getWeek(),
    lunar: lunar.getDay() === 1 ? `${lunar.getMonthInChinese()}月` : lunar.getDayInChinese(),
    lunarFull: lunar.toString(),
    festivals: [...solar.getFestivals(), ...lunar.getFestivals()],
    term: lunar.getJieQi(),
    ganZhi: `${lunar.getYearInGanZhi()} / ${lunar.getMonthInGanZhi()} / ${lunar.getDayInGanZhi()}`,
    zodiac: lunar.getYearShengXiao(),
    deity: lunar.getDayTianShen(),
    auspicious: lunar.getDayTianShenLuck() === '吉',
    suitable: lunar.getDayYi(), avoid: lunar.getDayJi(),
    schedule: holiday !== null ? holiday.isWork() ? 'makeup' : 'holiday'
      : solar.getWeek() === 0 || solar.getWeek() === 6 ? 'weekend' : 'workday',
    holidayName: holiday?.getName() ?? '', scheduleKnown,
  }
}

/**
 * Build complete Monday-first weeks, including adjacent-month dates.
 * @param year - Gregorian year within the calendar's supported range.
 * @param month - Gregorian month, from 1 through 12.
 * @returns four to six complete weeks of date data.
 */
export function calendarMonth(year: number, month: number): readonly CalendarDay[] {
  const first = new Date(year, month - 1, 1, 12)
  const leading = (first.getDay() + 6) % 7
  const count = Math.ceil((leading + new Date(year, month, 0).getDate()) / 7) * 7
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - 1, index - leading + 1, 12)
    return calendarDay(date.getFullYear(), date.getMonth() + 1, date.getDate())
  })
}
