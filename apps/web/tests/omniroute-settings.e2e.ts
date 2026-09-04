// Web e2e scenario: the shipped OmniRoute card adopts a deterministic local
// service, imports its live model catalog, and persists the llm-pi-ai route.
// The real installed-CLI test owns process startup and reaping; this browser
// lane proves the explicit click and Host/client wire without external calls.
import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/omniroute-settings', import.meta.url))
const CONNECTED_EXPECTED = join(SNAPSHOT_DIR, 'connected.expected.md')
const MODE = webSnapshotMode()
const CREDENTIAL_ENV = 'DSH_OMNIROUTE_E2E_KEY'

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve((server.address() as AddressInfo).port)
    })
  })
}

function closeServer(server: Server | undefined): Promise<void> {
  if (server === undefined || !server.listening) return Promise.resolve()
  server.closeAllConnections()
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
}

describe.skipIf(MODE === 'record')('web e2e: OmniRoute Models card connects a local catalog', () => {
  let service: Server
  let overlayRoot: string
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>
  let previousCredential: string | undefined

  beforeAll(async () => {
    service = createServer((request, response) => {
      if (request.method === 'GET' && request.url === '/api/health/ping') {
        response.writeHead(200, {
          'content-type': 'application/json',
          'x-omniroute-route-class': 'PUBLIC',
        })
        response.end(JSON.stringify({ status: 'ok' }))
        return
      }
      if (request.method === 'GET' && request.url === '/v1/models') {
        if (request.headers.authorization !== 'Bearer fixture-key') {
          response.writeHead(401, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ error: { message: 'Authentication required' } }))
          return
        }
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          object: 'list',
          data: [
            { id: 'antigravity/fixture-coding', name: 'Fixture Coding', object: 'model', owned_by: 'antigravity' },
            { id: 'oc/fixture-reasoning', name: 'Fixture Reasoning', object: 'model', owned_by: 'opencode' },
            { id: 'auto/best-coding', name: 'Auto: Best Coding', object: 'model', owned_by: 'combo' },
          ],
        }))
        return
      }
      response.writeHead(404).end()
    })
    const port = await listen(service)
    overlayRoot = await mkdtemp(join(tmpdir(), 'dsh-omniroute-web-e2e-'))
    const overlay = join(overlayRoot, 'omniroute.overlay.yml')
    await writeFile(overlay, [
      '- id: llm-omniroute',
      '  config:',
      `    dashboardURL: http://127.0.0.1:${String(port)}`,
      `    apiKeyEnv: ${CREDENTIAL_ENV}`,
      '    healthTimeoutMs: 1000',
      '',
    ].join('\n'))
    previousCredential = process.env[CREDENTIAL_ENV]
    process.env[CREDENTIAL_ENV] = 'fixture-key'
    scaffold = await launchWebScaffold({ extraOverlayPath: overlay })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    const bootEntries = await page.evaluate(() => {
      const boot = Reflect.get(window, '__DSH_BOOT__') as { entries?: Array<{ id?: unknown }> } | undefined
      return boot?.entries?.map(entry => entry.id) ?? []
    })
    expect(bootEntries).toContain('@deepseek-ai/dsh-llm-omniroute')
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    await closeServer(service)
    if (previousCredential === undefined) delete process.env.DSH_OMNIROUTE_E2E_KEY
    else process.env[CREDENTIAL_ENV] = previousCredential
    if (overlayRoot !== undefined) await rm(overlayRoot, { recursive: true, force: true })
  })

  it('imports the external service models from the explicit connect action', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-omniroute-settings'))
    await page.getByRole('button', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '模型' }).click()
    const card = dialog.getByRole('region', { name: 'OmniRoute' })
    expect(await card.locator('style').count()).toBe(1)
    await card.getByText('正在使用已经运行的 OmniRoute 服务。').waitFor({ timeout: 10_000 })
    await card.getByRole('button', { name: '启动并接入' }).click()
    await card.getByText('已接入 2 个模型。').waitFor({ timeout: 10_000 })

    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('omniroute:')
    expect(document).toContain('id: antigravity/fixture-coding')
    expect(document).toContain('name: Fixture Coding [AGY]')
    expect(document).toContain('id: oc/fixture-reasoning')
    expect(document).toContain('name: Fixture Reasoning [OPC]')
    expect(document).not.toContain('auto/best-coding')
    expect(document).toContain(`apiKeyEnv: ${CREDENTIAL_ENV}`)
    expect(document).not.toContain('fixture-key')
    expect(await card.getByRole('button', { name: '停止服务' }).count()).toBe(0)
    const snapshot = await captureStableAria(page, 'section[aria-label="OmniRoute"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(CONNECTED_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('keeps its snapshot inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['connected.expected.md'])
  })
})
