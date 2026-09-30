/** Interactive lunar calendar and selected-date almanac. */
import { useMemo, useState, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { calendarDay, calendarMonth } from './calendar.ts'
import css from './Cards.module.css'

type Props = PropsRuntime<'dashboard.card'> & PropsLocale<'dashboard.community'> & { now: Date }

/**
 * Render Monday-first weeks, official work markers, and a traditional almanac.
 * @param props - localized card props and the current browser date.
 * @returns the interactive calendar card.
 */
export function CalendarCard({ t, now }: Props): ReactNode {
  const today = calendarDay(now.getFullYear(), now.getMonth() + 1, now.getDate())
  const [selected, setSelected] = useState(today.date)
  const [shown, setShown] = useState(() => ({ year: now.getFullYear(), month: now.getMonth() + 1 }))
  const dates = useMemo(() => calendarMonth(shown.year, shown.month), [shown.year, shown.month])
  const detail = useMemo(() => {
    const [year, month, day] = selected.split('-').map(Number)
    return calendarDay(year as number, month as number, day as number)
  }, [selected])
  const weekdays = [t('weekdayMon'), t('weekdayTue'), t('weekdayWed'), t('weekdayThu'), t('weekdayFri'), t('weekdaySat'), t('weekdaySun')]
  const changeMonth = (offset: number) => {
    const next = new Date(shown.year, shown.month - 1 + offset, 1)
    setShown({ year: next.getFullYear(), month: next.getMonth() + 1 })
    setSelected(calendarDay(next.getFullYear(), next.getMonth() + 1, 1).date)
  }
  return <section className={`${css.card} ${css.calendarCard}`} data-dashboard-card="calendar" aria-label={t('calendarTitle')}>
    <header className={css.head}>
      <div><h2>{t('calendarTitle')}</h2><p>{t('calendarDescription')}</p></div>
      <button type="button" className={css.action} onClick={() => {
        setShown({ year: now.getFullYear(), month: now.getMonth() + 1 }); setSelected(today.date)
      }}>{t('today')}</button>
    </header>
    <div className={css.calendarBody}>
      <div className={css.calendarNav}>
        <button type="button" aria-label={t('previousMonth')} disabled={shown.year === 1901 && shown.month === 1}
          onClick={() => { changeMonth(-1) }}>‹</button>
        <strong>{t('month', { year: String(shown.year), month: String(shown.month) })}</strong>
        <button type="button" aria-label={t('nextMonth')} disabled={shown.year === 2099 && shown.month === 12}
          onClick={() => { changeMonth(1) }}>›</button>
      </div>
      <div className={css.calendarGrid} role="group" aria-label={t('chooseDate')}>
        {weekdays.map((day, index) => <span className={css.weekday} key={index}>{day}</span>)}
        {dates.map((date) => {
          const currentMonth = Number(date.date.slice(5, 7)) === shown.month
          const label = date.term || date.festivals[0] || date.lunar
          return <button type="button" key={date.date}
            disabled={Number(date.date.slice(0, 4)) < 1901 || Number(date.date.slice(0, 4)) > 2099}
            className={css.calendarDate} data-selected={date.date === selected} data-today={date.date === today.date}
            data-outside={!currentMonth} data-rest={date.schedule === 'holiday' || date.schedule === 'weekend'}
            aria-pressed={date.date === selected} aria-current={date.date === today.date ? 'date' : undefined}
            aria-label={t('dateLabel', { date: date.date, lunar: date.lunarFull, schedule: t(date.schedule) })}
            onClick={() => {
              setSelected(date.date)
              if (!currentMonth) setShown({ year: Number(date.date.slice(0, 4)), month: Number(date.date.slice(5, 7)) })
            }}>
            <span className={css.dateNumber}>{date.day}</span>
            <span className={css.lunarLabel} data-festival={Boolean(date.term || date.festivals.length)}>{label}</span>
            {date.schedule === 'holiday' || date.schedule === 'makeup'
              ? <span className={css.scheduleMark} data-work={date.schedule === 'makeup'}>{t(date.schedule === 'makeup' ? 'workMark' : 'restMark')}</span> : null}
          </button>
        })}
      </div>
      <div className={css.calendarLegend}>
        <span className={css.restLegend}>{t('holidayLegend')}</span><span>{t('makeupLegend')}</span>
        <a href="https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm" target="_blank" rel="noopener noreferrer">{t('holidaySource')}</a>
      </div>
      <div className={css.almanac} aria-live="polite">
        <div className={css.selectedHead}>
          <div><strong>{detail.date}</strong><p>{detail.lunarFull}</p></div>
          <span className={css.scheduleBadge} data-rest={detail.schedule === 'holiday' || detail.schedule === 'weekend'}>{t(detail.schedule)}</span>
        </div>
        <p className={css.dateFacts}>{[detail.holidayName, ...detail.festivals, detail.term].filter(Boolean).join(' · ') || t('ordinaryDay')}</p>
        <div className={css.almanacFacts}>
          <span>{t('ganZhi', { value: detail.ganZhi })}</span><span>{t('zodiac', { value: detail.zodiac })}</span>
          <span>{t('deity', { value: detail.deity })} · {t(detail.auspicious ? 'auspicious' : 'inauspicious')}</span>
        </div>
        <dl className={css.activities}>
          <div><dt className={css.suitable}>{t('suitable')}</dt><dd>{detail.suitable.join('、') || t('none')}</dd></div>
          <div><dt className={css.avoid}>{t('avoid')}</dt><dd>{detail.avoid.join('、') || t('none')}</dd></div>
        </dl>
        {!detail.scheduleKnown ? <p className={css.coverageNotice}>{t('scheduleUnpublished', { year: selected.slice(0, 4) })}</p> : null}
        <p className={css.almanacNote}>{t('almanacNote')} <a href="https://github.com/6tail/lunar-typescript" target="_blank" rel="noopener noreferrer">{t('calendarSource')}</a></p>
      </div>
    </div>
  </section>
}
