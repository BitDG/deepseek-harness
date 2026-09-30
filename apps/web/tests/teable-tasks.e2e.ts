/** Built Web and real Host Remote against a local Teable-compatible HTTP peer. */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { once } from 'node:events'
import { mkdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage } from './support.ts'

const OVERLAY = fileURLToPath(new URL('../../../packages/bundle/teable-tasks/cordis.patch.yml', import.meta.url))
const ANCHOR = fileURLToPath(new URL('../../../packages/bundle/teable-tasks/package.json', import.meta.url))

interface RecordRow { id: string; fields: Record<string, string> }

async function readBody(request: IncomingMessage): Promise<{
  records?: { fields: Record<string, string> }[]
  record?: { fields: Record<string, string> }
}> {
  let body = ''
  for await (const chunk of request) body += String(chunk)
  return JSON.parse(body) as { records?: { fields: Record<string, string> }[]; record?: { fields: Record<string, string> } }
}

describe('web e2e: Teable tasks bundle', () => {
  let server: Server
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  const projects: RecordRow[] = []
  const tasks: RecordRow[] = []
  const seenAuthorization: string[] = []
  const pageErrors: string[] = []
  let refuseReads = false

  beforeAll(async () => {
    server = createServer((request, response) => {
      void (async () => {
        seenAuthorization.push(String(request.headers.authorization))
        const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
        const table = path.includes('/tbl-projects/') ? projects : tasks
        let result: unknown
        if (request.method === 'GET' && refuseReads) {
          response.statusCode = 403
          result = { detail: 'test-only-token' }
        } else if (request.method === 'GET') {
          result = { records: table, extra: { nextCursor: null } }
        } else if (request.method === 'POST') {
          const fields = (await readBody(request)).records?.[0]?.fields
          if (fields === undefined) throw new Error('create omitted fields')
          const row = { id: `rec-${table === projects ? 'project' : 'task'}-${table.length + 1}`, fields }
          table.push(row)
          response.statusCode = 201
          result = { records: [row] }
        } else if (request.method === 'PATCH') {
          const id = path.split('/').at(-1)
          const row = table.find(item => item.id === id)
          const fields = (await readBody(request)).record?.fields
          if (row === undefined || fields === undefined) throw new Error('patch target or fields missing')
          Object.assign(row.fields, fields)
          result = row
        } else {
          response.statusCode = 405
          result = { error: 'unsupported method' }
        }
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(result))
      })().catch((error: unknown) => {
        response.statusCode = 500
        response.end(String(error))
      })
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as AddressInfo
    vi.stubEnv('DSH_TEABLE_BASE_URL', `http://127.0.0.1:${address.port}`)
    vi.stubEnv('DSH_TEABLE_ACCESS_TOKEN', 'test-only-token')
    vi.stubEnv('DSH_TEABLE_PROJECT_TABLE_ID', 'tbl-projects')
    vi.stubEnv('DSH_TEABLE_TASK_TABLE_ID', 'tbl-tasks')

    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY, extraInstallAnchors: [ANCHOR] })
    browser = await chromium.launch({ channel: 'chrome' })
    page = await newEnglishPage(browser)
    page.on('pageerror', (error) => { pageErrors.push(error.message) })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    try {
      await page.getByRole('textbox', { name: 'Choose workspace' }).waitFor({ timeout: 10_000 })
    } catch (error) {
      throw new Error(`Teable Web boot: ${(await page.locator('body').innerText()).slice(0, 1000)}; page errors: ${pageErrors.join(' | ')}`, { cause: error })
    }
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  }, 120_000)

  afterAll(async () => {
    try { await browser?.close() } finally {
      try { await scaffold?.close() } finally {
        vi.unstubAllEnvs()
        if (server !== undefined) await new Promise<void>((resolve, reject) => {
          server.close((error) => { if (error) reject(error); else resolve() })
        })
      }
    }
  })

  it('keeps tasks in their projects, writes optional Session ids, and commits status through Teable records', async () => {
    await page.getByRole('button', { name: 'Project tasks' }).last().click()
    await page.getByRole('heading', { name: 'Projects and tasks' }).waitFor({ state: 'visible' })
    await expect.poll(async () => page.getByRole('link', { name: 'Open Teable tables' }).getAttribute('href'))
      .toMatch(/^http:\/\/127\.0\.0\.1:/)
    await page.getByRole('button', { name: 'Link project' }).click()
    await expect.poll(() => projects.length).toBe(1)
    await page.getByRole('textbox', { name: 'Task title' }).fill('Ship Teable integration')
    await page.getByRole('button', { name: 'Create task' }).click()
    await page.getByText('Ship Teable integration', { exact: true }).waitFor({ state: 'visible' })
    await page.getByRole('combobox', { name: 'Status: Ship Teable integration' }).selectOption('Done')
    await expect.poll(() => tasks[0]?.fields.Status).toBe('Done')
    expect(projects[0]?.fields.DshWorkspaceId).toBeTruthy()
    expect(tasks[0]?.fields.ProjectId).toBe(projects[0]?.id)
    const workspace = scaffold.ctx.workspaceRegistry.list().find(row => row.id === projects[0]?.fields.DshWorkspaceId)
    const linkedSessionId = workspace?.sessionIds[0]
    expect(linkedSessionId).toBeTruthy()
    await page.getByRole('textbox', { name: 'Task title' }).fill('Review linked session')
    await page.getByRole('combobox', { name: 'Linked session' }).selectOption(String(linkedSessionId))
    await page.getByRole('button', { name: 'Create task' }).click()
    await page.getByText('Review linked session', { exact: true }).waitFor({ state: 'visible' })
    expect(tasks[1]?.fields.DshSessionId).toBe(linkedSessionId)
    expect(tasks[1]?.fields.ProjectId).toBe(projects[0]?.id)
    await page.getByRole('button', { name: 'Open session' }).waitFor({ state: 'visible' })
    expect(seenAuthorization.every(value => value === 'Bearer test-only-token')).toBe(true)
    expect(await page.locator('body').innerText()).not.toContain('test-only-token')
    if (process.env.DSH_CAPTURE_TEABLE_TASKS === '1') {
      const capture = fileURLToPath(new URL('../../../.playwright-mcp/teable-tasks/', import.meta.url))
      await mkdir(capture, { recursive: true })
      await page.screenshot({ path: join(capture, 'tasks-done.png'), fullPage: true })
    }
    const secondPath = join(scaffold.workspaceCwd, 'workspace-two')
    mkdirSync(secondPath, { recursive: true })
    await page.getByRole('button', { name: 'Add workspace' }).click()
    const dialog = page.getByRole('dialog', { name: 'Select Workspace Directory' })
    await dialog.getByRole('button', { name: 'Edit path' }).click()
    await dialog.getByRole('textbox', { name: 'Edit path' }).fill(secondPath)
    await page.keyboard.press('Enter')
    await dialog.getByRole('button', { name: 'Open', exact: true }).click()
    await expect.poll(() => scaffold.ctx.workspaceRegistry.list().length).toBe(2)
    await page.getByRole('button', { name: 'Project tasks' }).last().click()
    await page.getByRole('combobox', { name: 'DSH workspace' }).selectOption({ label: 'workspace-two' })
    await page.getByRole('button', { name: 'Link project' }).click()
    await expect.poll(() => projects.length).toBe(2)
    const firstProjectId = projects[0]?.id
    const secondProjectId = projects[1]?.id
    if (firstProjectId === undefined || secondProjectId === undefined) throw new Error('two project records were not created')
    await page.getByRole('combobox', { name: 'Projects' }).selectOption(secondProjectId)
    expect(await page.getByText('Ship Teable integration', { exact: true }).count()).toBe(0)
    await page.getByRole('textbox', { name: 'Task title' }).fill('Second workspace task')
    await page.getByRole('button', { name: 'Create task' }).click()
    await page.getByText('Second workspace task', { exact: true }).waitFor({ state: 'visible' })
    expect(tasks[2]?.fields.ProjectId).toBe(secondProjectId)
    await page.getByRole('combobox', { name: 'Projects' }).selectOption(firstProjectId)
    await page.getByText('Ship Teable integration', { exact: true }).waitFor({ state: 'visible' })
    expect(await page.getByText('Second workspace task', { exact: true }).count()).toBe(0)
    refuseReads = true
    await page.getByRole('button', { name: 'Refresh' }).click()
    await expect.poll(async () => page.getByRole('alert').innerText()).toContain('HTTP 403')
    expect(await page.locator('body').innerText()).not.toContain('test-only-token')
  }, 120_000)
})
