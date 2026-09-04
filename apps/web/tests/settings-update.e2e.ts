// Web e2e scenario: the shipped Host update Remote and Client Settings
// contribution over a deterministic local GitHub Releases endpoint. The real
// repository is dirty in this development checkout, so the install action
// must remain blocked while exact-tag download remains available.
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { join } from 'node:path'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole,
  webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/settings-update', import.meta.url))
const UPDATE_EXPECTED = join(SNAPSHOT_DIR, 'update.expected.md')
const MODE = webSnapshotMode()

function githubRelease(version: string, body: string) {
  return {
    tag_name: `dsh-v${version}`,
    name: `DeepSeek Harness v${version}`,
    body,
    draft: false,
    prerelease: true,
    published_at: '2026-09-02T12:00:00Z',
    created_at: '2026-09-02T12:00:00Z',
    html_url: `https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v${version}`,
  }
}

async function releaseServer(): Promise<{ server: Server; apiBase: string }> {
  const payload = JSON.stringify([
    githubRelease('0.1.2-alpha.5', '<h3 id="cn-fixes">中文</h3>修复升级后的启动与会话标题。<h3 id="en-fixes">English</h3>Fix startup and session titles after upgrades.'),
    githubRelease('0.1.2-alpha.4', '<h3 id="cn-features">中文</h3>改进模型搜索、子智能体通信和长会话性能。<h3 id="en-features">English</h3>Improve model search, subagent messaging, and long-session performance.'),
  ])
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/repos/deepseek-ai/deepseek-harness/releases') !== true) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(payload)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return { server, apiBase: `http://127.0.0.1:${String(address.port)}` }
}

describe('web e2e: DSH update settings', () => {
  let api: Server | undefined
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    const releases = await releaseServer()
    api = releases.server
    scaffold = await launchWebScaffold({ updateApiBase: releases.apiBase })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    const pending = new Set<string>()
    page.on('request', request => pending.add(request.url()))
    page.on('requestfinished', request => pending.delete(request.url()))
    page.on('requestfailed', request => pending.delete(request.url()))
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    try {
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    } catch (error) {
      throw new Error(`update page did not boot: ${await page.locator('body').innerText()} errors=${JSON.stringify(tripwire.pageErrors)} pending=${JSON.stringify([...pending])}`, {
        cause: error,
      })
    }
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    if (api !== undefined) {
      await new Promise<void>((resolve, reject) => {
        api?.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    }
  })

  it('shows alpha release notes and blocks install without hiding the safe download', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-update'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: 'DSH 更新', exact: true }).click()
    const section = dialog.locator('section[data-update-section="true"]')
    await section.getByRole('heading', { name: '版本更新内容' }).waitFor({ timeout: 15_000 })

    expect(await section.getByText('v0.1.2-alpha.3', { exact: true }).count()).toBe(1)
    expect(await section.getByText('v0.1.2-alpha.5', { exact: true }).count()).toBeGreaterThanOrEqual(1)
    expect(await section.getByText('工作区有改动', { exact: true }).count()).toBe(1)
    expect(await section.getByRole('button', { name: '下载版本' }).isEnabled()).toBe(true)
    expect(await section.getByRole('button', { name: '安装并重启' }).isDisabled()).toBe(true)
    expect(await section.getByText('改进模型搜索、子智能体通信和长会话性能。', { exact: true }).count()).toBe(1)
    expect(await section.getByText('修复升级后的启动与会话标题。', { exact: true }).count()).toBe(1)

    await compareOrRefreshGolden(
      UPDATE_EXPECTED,
      await captureStableAria(page, 'section[data-update-section="true"]', scaffold.workspaceCwd),
      MODE,
    )
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
