// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { DashboardPage } from '../src/client/DashboardPage.tsx'
import { zh } from '../src/client/locales.ts'
import type {} from '../src/client/index.ts'
import type { DashboardPageProps } from '../src/client/DashboardPage.tsx'

const storage = 'dsh.dashboard.layout.v1'
const t: DashboardPageProps['t'] = key => zh[key as keyof typeof zh]
const renderSlot: DashboardPageProps['renderSlot'] = () => <div style={{ display: 'contents' }}>
  <section data-dashboard-card="calendar">Calendar</section>
  <section data-dashboard-card="sessions">Sessions</section>
</div>

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(document, 'fonts', { value: new EventTarget(), configurable: true })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1440)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('dashboard card layout', () => {
  it('removes the heading and restores saved order and minimum sizes', () => {
    localStorage.setItem(storage, JSON.stringify({ order: ['sessions', 'calendar'], sizes: { calendar: { width: 1, height: 1 } } }))
    const view = render(<DashboardPage {...({ t, renderSlot } as DashboardPageProps)} />)
    expect(view.queryByRole('heading', { name: '信息面板' })).toBeNull()
    const calendar = view.container.querySelector<HTMLElement>('[data-dashboard-card="calendar"]')!
    expect(calendar.style.order).toBe('1')
    expect(calendar.style.gridRow).toBe('span 17')
    expect(calendar.style.gridColumn).toBe('span 4')
    fireEvent.click(view.getByRole('button', { name: zh.resetLayout }))
    expect(calendar.style.order).toBe('0')
    expect(localStorage.getItem(storage)).toContain('"sizes":{}')
  })

  it('persists keyboard movement and resizing across panel remounts', () => {
    const first = render(<DashboardPage {...({ t, renderSlot } as DashboardPageProps)} />)
    const calendar = first.container.querySelector<HTMLElement>('[data-dashboard-card="calendar"]')!
    vi.spyOn(calendar, 'getBoundingClientRect').mockReturnValue({ width: 900, height: 824 } as DOMRect)
    fireEvent.keyDown(first.getAllByRole('button', { name: zh.moveCard })[0]!, { key: 'ArrowDown' })
    fireEvent.keyDown(first.getAllByRole('button', { name: zh.resizeCard })[0]!, { key: 'ArrowRight' })
    const saved = localStorage.getItem(storage)
    expect(saved).toContain('sessions')
    first.unmount()
    const second = render(<DashboardPage {...({ t, renderSlot } as DashboardPageProps)} />)
    const restored = second.container.querySelector<HTMLElement>('[data-dashboard-card="calendar"]')!
    expect(restored.style.order).toBe('1')
    expect(restored.style.gridColumn).toBe('span 9')
    expect(localStorage.getItem(storage)).toBe(saved)
  })


  it('grows beyond a saved height to display full content and remeasures changed text', async () => {
    localStorage.setItem(storage, JSON.stringify({ order: ['calendar', 'sessions'], sizes: { calendar: { width: 420, height: 160 } } }))
    const view = render(<DashboardPage {...({ t, renderSlot } as DashboardPageProps)} />)
    const calendar = view.container.querySelector<HTMLElement>('[data-dashboard-card="calendar"]')!
    let naturalHeight = 1230
    Object.defineProperty(calendar, 'scrollHeight', { get: () => naturalHeight })
    const text = document.createTextNode('Full almanac')
    calendar.append(text)
    await waitFor(() => { expect(calendar.style.gridRow).toBe('span 32') })
    naturalHeight = 680
    text.data = 'Updated almanac'
    await waitFor(() => { expect(calendar.style.gridRow).toBe('span 18') })
    expect(localStorage.getItem(storage)).toContain('"height":160')
  })

  it('accepts a later plugin card and removes its controls when the card leaves', async () => {
    localStorage.setItem(storage, '{broken')
    const view = render(<DashboardPage {...({ t, renderSlot } as DashboardPageProps)} />)
    const calendar = view.container.querySelector<HTMLElement>('[data-dashboard-card="calendar"]')!
    const extra = document.createElement('section')
    extra.dataset.dashboardCard = 'later-plugin'
    calendar.parentElement!.append(extra)
    await waitFor(() => { expect(extra.querySelectorAll('button')).toHaveLength(2) })
    extra.remove()
    await waitFor(() => { expect(extra.querySelectorAll('button')).toHaveLength(0) })
    expect(view.getAllByRole('button', { name: zh.moveCard })).toHaveLength(2)
  })
})
