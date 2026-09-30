/** Built dashboard through the real Loader and authenticated HTTP feeds; only upstreams and browser time are fixed. */
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, webSnapshotMode, watchConsole, type WebScaffold,
} from './scaffold.ts'

const PATCH = fileURLToPath(new URL('../../../packages/bundle/dashboard/cordis.patch.yml', import.meta.url))
const ANCHOR = fileURLToPath(new URL('../../../packages/bundle/dashboard/package.json', import.meta.url))
const EXPECTED = fileURLToPath(new URL('./expected/dashboard', import.meta.url))
const MODE = webSnapshotMode()

describe('web e2e: information dashboard', () => {
  let scaffold: WebScaffold | undefined
  let browser: Browser | undefined
  let page: Page
  let consoleState: ReturnType<typeof watchConsole>
  let githubLimited = false
  let newsRequests = 0

  beforeAll(async () => {
    const originalFetch = globalThis.fetch
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.startsWith('https://hacker-news.firebaseio.com/v0/')) {
        if (url.endsWith('topstories.json')) { newsRequests++; return Response.json([31, 32]) }
        if (url.endsWith('/32.json')) throw new TypeError('upstream connection failed')
        return Response.json({ id: 31, title: 'Readable technology story', score: 42, descendants: 6 })
      }
      if (url.startsWith('https://api.github.com/search/repositories')) {
        return githubLimited ? new Response(null, { status: 429 }) : Response.json({ items: [{
          full_name: 'example/project', html_url: 'https://github.com/example/project',
          stargazers_count: 123, description: 'A recent project', language: 'TypeScript',
        }] })
      }
      if (url === 'https://tibo.cc/api/v1/status') return Response.json({
        data: { active_watch: { reset_chance_percent: null, text: 'No published probability.' } },
        source_url: 'https://codex-resets.com', fetched_at: '2026-09-30T02:00:00Z', stale: false,
      })
      return originalFetch(input, init)
    })
    scaffold = await launchWebScaffold({ extraOverlayPath: PATCH, extraInstallAnchors: [ANCHOR] })
    browser = await chromium.launch({ channel: 'chrome' })
    page = await browser.newPage({ viewport: { width: 1680, height: 1100 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
    await page.clock.install({ time: new Date('2026-09-30T02:00:00Z') })
    consoleState = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: '信息面板', exact: true }).last().click()
    await page.getByText('Readable technology story', { exact: true }).waitFor()
    await page.getByText('example/project', { exact: true }).waitFor()
    await page.getByText('No published probability.', { exact: true }).waitFor()
    if (MODE === 'refresh') await mkdir(EXPECTED, { recursive: true })
  }, 120_000)

  afterAll(async () => {
    try { await browser?.close() } finally {
      try { await scaffold?.close() } finally { vi.unstubAllGlobals() }
    }
  })

  it('shows a detailed calendar with official workdays and partial feed results', async () => {
    const calendar = page.locator('[data-dashboard-card="calendar"]')
    await calendar.getByRole('button', { name: /^2026-09-25，/ }).click()
    await page.getByText('二〇二六年八月十五', { exact: true }).waitFor()
    expect(await calendar.getByRole('button', { name: /^2026-09-20，/ }).getAttribute('aria-label')).toContain('调休上班')
    const snapshot = await captureStableAria(page, 'main', scaffold?.workspaceCwd as string)
    await compareOrRefreshGolden(join(EXPECTED, 'panel.expected.md'), snapshot, MODE)
    const rect = await calendar.boundingBox()
    const sessions = await page.locator('[data-dashboard-card="sessions"]').boundingBox()
    expect(rect?.width).toBeGreaterThan((sessions?.width ?? 0) * 1.8)
    expect(Math.abs((rect?.y ?? 0) - (sessions?.y ?? 0))).toBeLessThan(2)
    expect(await page.locator('[data-dashboard-card="hacker-news"]').innerText()).toContain('1 篇文章读取失败')
  })

  it('keeps successful feed data on rate limiting and refreshes when reopened', async () => {
    githubLimited = true
    const github = page.locator('[data-dashboard-card="github"]')
    await github.getByRole('button', { name: '刷新', exact: true }).click()
    await github.getByRole('alert').waitFor()
    expect(await github.innerText()).toContain('example/project')
    expect(await github.getByRole('alert').innerText()).toContain('数据源限制了请求频率')
    githubLimited = false
    const before = newsRequests
    await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
    await page.getByRole('button', { name: '信息面板', exact: true }).last().click()
    await expect.poll(() => newsRequests).toBeGreaterThan(before)
    await expect.poll(() => github.locator('[role="alert"]').count()).toBe(0)
  })

  it('navigates to adjusted workdays and marks unknown years without overflow', async () => {
    const calendar = page.locator('[data-dashboard-card="calendar"]')
    await calendar.getByRole('button', { name: '下个月', exact: true }).click()
    await calendar.getByRole('button', { name: /^2026-10-10，/ }).click()
    await page.getByText('二〇二六年九月初一', { exact: true }).waitFor()
    expect(await calendar.getByRole('button', { name: /^2026-10-10，/ }).getAttribute('aria-label')).toContain('调休上班')
    await compareOrRefreshGolden(join(EXPECTED, 'october.expected.md'),
      await captureStableAria(page, '[data-dashboard-card="calendar"]', scaffold?.workspaceCwd as string), MODE)
    for (let index = 0; index < 3; index++) await calendar.getByRole('button', { name: '下个月', exact: true }).click()
    await calendar.getByText('2027 年未收录官方调休安排', { exact: false }).waitFor()
    await page.setViewportSize({ width: 1100, height: 1000 })
    expect(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.setViewportSize({ width: 720, height: 1000 })
    expect(await page.locator('main').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(consoleState.pageErrors).toEqual([])
    expect(consoleState.warnings).toEqual([])
  })

  it('moves cards, clamps resizing, and restores the saved layout when reopened', async () => {
    await page.setViewportSize({ width: 1680, height: 1100 })
    await page.getByRole('button', { name: '恢复默认布局', exact: true }).click()
    const calendar = page.locator('[data-dashboard-card="calendar"]')
    const sessions = page.locator('[data-dashboard-card="sessions"]')
    await sessions.getByRole('button', { name: /^移动模块/ }).dragTo(calendar)
    const order = await page.evaluate(() => JSON.parse(localStorage.getItem('dsh.dashboard.layout.v1') ?? '{}') as { order: string[] })
    expect(order.order.indexOf('sessions')).toBeLessThan(order.order.indexOf('calendar'))
    const handle = calendar.getByRole('button', { name: /^缩放模块/ })
    await handle.scrollIntoViewIfNeeded()
    const box = await handle.boundingBox()
    if (!box) throw new Error('Calendar resize control has no bounds')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x - 1200, box.y - 1200, { steps: 10 })
    await page.mouse.up()
    const size = await calendar.boundingBox()
    expect(size?.width).toBeGreaterThanOrEqual(420)
    expect(size?.height).toBeGreaterThanOrEqual(640)
    expect(await calendar.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
    expect(await calendar.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    expect(await page.locator('[data-dashboard-card]').evaluateAll(cards => cards.every((card) => {
      return [...card.querySelectorAll('*')].every((child) => {
        const style = getComputedStyle(child)
        return style.textOverflow !== 'ellipsis'
          && (!['auto', 'scroll'].includes(style.overflowY) || child.scrollHeight <= child.clientHeight + 1)
      })
    }))).toBe(true)
    const saved = await page.evaluate(() => localStorage.getItem('dsh.dashboard.layout.v1'))
    await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
    await page.getByRole('button', { name: '信息面板', exact: true }).last().click()
    expect(await page.evaluate(() => localStorage.getItem('dsh.dashboard.layout.v1'))).toBe(saved)
    const restored = await calendar.boundingBox()
    expect(restored?.width).toBe(size?.width)
    expect(restored?.height).toBe(size?.height)
    await page.getByRole('button', { name: '恢复默认布局', exact: true }).click()
  })
})
