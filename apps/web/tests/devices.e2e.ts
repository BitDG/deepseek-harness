/** Device readings through the real Web Loader and authenticated Host route. */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, webSnapshotMode } from './scaffold.ts'

const BUNDLE = fileURLToPath(new URL('../../../packages/bundle/dashboard/package.json', import.meta.url))
const REPO = fileURLToPath(new URL('../../../', import.meta.url))
const PICKER = fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url))
const BASE = fileURLToPath(new URL('../../../packages/bundle/base/package.json', import.meta.url))
const WEB = fileURLToPath(new URL('../../../packages/bundle/web-app/package.json', import.meta.url))
const EXPECTED = fileURLToPath(new URL('./expected/devices/panel.expected.md', import.meta.url))

describe('web e2e: Beszel devices', () => {
  let host: ChildProcess | undefined
  let upstream: Server | undefined
  let hostLog = ''
  let browser: Browser | undefined
  let scratch: string | undefined
  let page: Page
  let denied = false
  const errors: string[] = []

  beforeAll(async () => {
    scratch = await mkdtemp(join(tmpdir(), 'dsh-devices-'))
    const profileDir = join(scratch, 'home', 'profiles', 'web')
    await mkdir(profileDir, { recursive: true })
    const bundles = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@deepseek-ai/dsh-dashboard']
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      name: 'dsh-profile-web', private: true, dependencies: {}, dsh: { profile: { bundles } },
    }))
    for (const [index, anchor] of [BASE, WEB, BUNDLE].entries()) {
      const link = join(profileDir, 'node_modules', bundles[index] as string)
      await mkdir(dirname(link), { recursive: true })
      await symlink(dirname(anchor), link, 'junction')
    }
    upstream = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      if (denied) { response.writeHead(401); response.end('{}'); return }
      if (request.headers.authorization !== 'Bearer fixture-token') { response.writeHead(403); response.end('{}'); return }
      const url = request.url ?? ''
      const items = url.includes('/system_stats/') ? [{ created: '2026-09-30 02:00:00.000Z', stats: {
        m: 64, mu: 32, d: 1024, du: 256, s: 8, su: 2, efs: { 'F:': { d: 2048, du: 1024 } },
        t: { 'CPU Package': 61, 'NVIDIA RTX 4080 SUPER': 49 },
        g: { '0': { n: 'NVIDIA RTX 4080 SUPER', mu: 4096, mt: 16384, u: 30, p: 80 } },
      } }] : url.includes('/system_details/') ? [{ cpu: 'AMD Ryzen', kernel: 'Windows 11' }] : [
        { id: 'workstation', name: 'Creator PC', status: 'up', info: { u: 172800, cpu: 23.5, mp: 50, dp: 25 } },
        { id: 'offlinepc', name: 'Offline PC', status: 'down', info: { u: 100, cpu: 0, mp: 50, dp: 25 } },
      ]
      response.end(JSON.stringify({ items }))
    })
    upstream.listen(0, '127.0.0.1')
    await once(upstream, 'listening')
    const address = upstream.address()
    if (address === null || typeof address === 'string') throw new Error('Fixture listener unavailable')
    await writeFile(join(profileDir, 'cordis.patch.yml'), `- id: ui-dashboard-devices\n  config:\n    baseUrl: http://127.0.0.1:${address.port}\n    apiToken: fixture-token\n`)
    // The shipped CLI resolves and boots the real profile; only the upstream HTTP service is a fixture.
    host = spawn(process.execPath, ['--import', 'tsx/esm', join(REPO, 'apps/cli/src/bin.ts'),
      'web', '--patch', PICKER, '--port', '0', '--no-open'], {
      cwd: REPO, env: { ...process.env, DSH_HOME: join(scratch, 'home'), DSH_AGENTS_HOME: join(scratch, 'agents') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const authenticatedUrl = await new Promise<string>((accept, reject) => {
      const timer = setTimeout(() => { reject(new Error('Device test Host did not become ready')) }, 60000)
      const output = (chunk: Buffer) => {
        hostLog += chunk.toString()
        const url = hostLog.match(/dsh web: (http:\/\/[^\s]+)/)?.[1]
        if (url) { clearTimeout(timer); accept(url) }
      }
      host?.stdout?.on('data', output)
      host?.stderr?.on('data', output)
      host?.once('error', error => { clearTimeout(timer); reject(error) })
      host?.once('exit', code => { clearTimeout(timer); reject(new Error(`Device test Host exited ${code}`)) })
    })
    browser = await chromium.launch({ channel: 'chrome' })
    page = await browser.newPage({ viewport: { width: 1680, height: 1100 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' })
    page.setDefaultTimeout(10000)
    page.on('pageerror', error => { errors.push(error.message) })
    await page.clock.install({ time: new Date('2026-09-30T02:00:00Z') })
    await page.goto(authenticatedUrl, { waitUntil: 'load' })
    await page.getByRole('button', { name: '继续', exact: true }).click()
    await page.getByRole('button', { name: '稍后配置', exact: true }).click()
    await page.getByRole('button', { name: '信息面板', exact: true }).last().click()
    await page.locator('[data-dashboard-card="devices"]').scrollIntoViewIfNeeded()
    await page.getByRole('heading', { name: 'Creator PC', exact: true }).waitFor()

  }, 120_000)

  afterAll(async () => {
    try { await browser?.close() } finally {
      if (host && host.exitCode === null && host.signalCode === null) {
        const exited = once(host, 'exit')
        host.kill()
        await exited
      }
      if (upstream) {
        upstream.closeAllConnections()
        await new Promise<void>((accept, reject) => { upstream?.close(error => error ? reject(error) : accept()) })
      }
      if (scratch) {
        if (!resolve(scratch).startsWith(resolve(tmpdir()) + '\\dsh-devices-') && !resolve(scratch).startsWith(resolve(tmpdir()) + '/dsh-devices-')) throw new Error('Unexpected fixture directory')
        await rm(scratch, { recursive: true, force: true })
      }
    }
  })

  it('renders hardware, VRAM and each disk through the shipped card composition', async () => {
    const card = page.locator('[data-dashboard-card="devices"]')
    await card.locator('summary').first().click()
    expect(await card.innerText()).toContain('4.0 GiB / 16.0 GiB')
    expect(await card.innerText()).toContain('61.0 °C')
    expect(await card.innerText()).toContain('AMD Ryzen')
    expect(await card.innerText()).toContain('F:')
    expect(await card.innerText()).toContain('离线设备显示最后一次采样')
    const snapshot = await captureStableAria(page, '[data-dashboard-card="devices"]', scratch as string)
    if (webSnapshotMode() === 'refresh') await mkdir(dirname(EXPECTED), { recursive: true })
    await compareOrRefreshGolden(EXPECTED, snapshot, webSnapshotMode())
    if (webSnapshotMode() === 'refresh') {
      await mkdir(join(REPO, '.playwright-mcp/devices'), { recursive: true })
      await card.screenshot({ path: join(REPO, '.playwright-mcp/devices/devices-fixture.png') })
    }
    await page.setViewportSize({ width: 1100, height: 900 })
    expect(await card.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(errors).toEqual([])
  })

  it('retains measurements on auth failure and recovers on refresh', async () => {
    const card = page.locator('[data-dashboard-card="devices"]')
    denied = true
    await card.getByRole('button', { name: '刷新', exact: true }).click()
    await card.getByRole('alert').waitFor()
    expect(await card.getByRole('alert').innerText()).toContain('访问凭据')
    expect(await card.innerText()).toContain('4.0 GiB / 16.0 GiB')
    denied = false
    await card.getByRole('button', { name: '刷新', exact: true }).click()
    await expect.poll(() => card.locator('[role="alert"]').count()).toBe(0)
  })
})
