import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { ZH_BROWSER_LOCALE } from './support.ts'

describe('web e2e: shipped interface component catalog', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ profileResolutionMode: 'dual' })
    browser = await chromium.launch({ channel: 'chrome' })
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '界面组件', exact: true }).click()
    await page.locator('[data-design-system]').waitFor()
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('loads through the real Loader and preserves outer Settings after nested Escape', async () => {
    const trigger = page.getByRole('button', { name: '打开示例弹窗', exact: true })
    await trigger.click()
    const nested = page.getByRole('dialog', { name: '示例弹窗', exact: true })
    await nested.waitFor()
    await nested.getByRole('button', { name: '关闭示例弹窗', exact: true }).press('Escape')
    await nested.waitFor({ state: 'hidden' })
    expect(await page.getByRole('dialog', { name: '设置', exact: true }).isVisible()).toBe(true)
    expect(await trigger.evaluate(element => element === document.activeElement)).toBe(true)
    tripwire.assert()
  })

  it('uses real theme variables and keeps sample recovery inside the catalog', async () => {
    await page.getByRole('button', { name: '深色', exact: true }).click()
    await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme')).not.toBeNull()
    await page.getByRole('tab', { name: '视觉变量', exact: true }).click()
    expect(await page.getByText('--dsw-alias-brand-primary', { exact: true }).isVisible()).toBe(true)
    const darkColor = await page.locator('[data-design-system]').evaluate(element => getComputedStyle(element).color)
    await page.getByRole('button', { name: '浅色', exact: true }).click()
    await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme')).toBeNull()
    const lightColor = await page.locator('[data-design-system]').evaluate(element => getComputedStyle(element).color)
    expect(lightColor).not.toBe(darkColor)
    await page.getByRole('tab', { name: '组合规范', exact: true }).click()
    await page.getByRole('button', { name: '错误', exact: true }).click()
    expect(await page.getByText('示例内容未能加载', { exact: true }).isVisible()).toBe(true)
    await page.getByRole('button', { name: '重试示例', exact: true }).click()
    expect(await page.getByText('组件说明.md', { exact: true }).isVisible()).toBe(true)
    await page.setViewportSize({ width: 1280, height: 800 })
    expect(await page.locator('[data-design-system]').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    tripwire.assert()
  })
})
