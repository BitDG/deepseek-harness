/** Browser coverage for file-row actions through the built Web client and Host filesystem. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage } from './support.ts'

const FIXTURE = join(import.meta.dirname, '../../../snapshots/web/lifecycle-chrome/session.v3.jsonl')
const CAPTURE_DIR = join(import.meta.dirname, '../../../.playwright-mcp/file-menu')
const FILE_NAME = 'menu evidence.txt'

describe('web e2e: Files context menu', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ replayFixture: FIXTURE, paceMs: 5, compareReplaySession: false })
    browser = await chromium.launch(process.env.DSH_USE_CHROME === '1' ? { channel: 'chrome' } : {})
    page = await newEnglishPage(browser)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  })

  afterAll(async () => {
    try { await browser?.close() } finally { await scaffold?.close() }
  })

  it('adds a file to the draft and confirms version-guarded removal', async () => {
    const settled = scaffold.whenTurnSettled()
    const input = page.locator('[data-composer-input]').first()
    await input.fill('Reply with the single word LIGHTHOUSE and stop.')
    await input.press('Enter')
    const sessionId = await settled
    await page.getByText('LIGHTHOUSE', { exact: true }).waitFor({ timeout: 15_000 })
    const cwd = scaffold.ctx.agents.get(sessionId)?.session.header.cwd
    if (cwd === undefined) throw new Error('settled Session has no workspace cwd')
    const filePath = join(cwd, FILE_NAME)
    await writeFile(filePath, 'remove me')

    const column = page.locator('[data-rightbar-col]')
    await page.locator('[data-sidebar-right-expand]').click()
    await column.locator('[data-sidebar-right-guide-entry="files"]').click()
    await column.locator('[data-files-state="tree"]').waitFor({ state: 'visible' })
    await column.locator('[data-files-reload]').click()
    const row = column.locator('[data-files-entry="file"]').getByRole('button', { name: FILE_NAME, exact: true })
    await row.waitFor({ state: 'visible' })
    const capture = process.env.DSH_CAPTURE_FILE_MENU === '1'
    if (capture) await mkdir(CAPTURE_DIR, { recursive: true })
    await row.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Add to conversation' }).waitFor({ state: 'visible' })
    if (capture) await page.screenshot({ path: join(CAPTURE_DIR, '00-menu.png') })
    await page.getByRole('menuitem', { name: 'Add to conversation' }).click()
    await expect.poll(async () => await input.innerText()).toContain(FILE_NAME)
    if (capture) await page.screenshot({ path: join(CAPTURE_DIR, '01-added.png') })

    await row.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Delete file' }).click()
    await page.getByRole('dialog', { name: `Delete ${FILE_NAME}?` }).waitFor({ state: 'visible' })
    if (capture) await page.screenshot({ path: join(CAPTURE_DIR, '02-confirm.png') })
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).last().click()
    expect(await readFile(filePath, 'utf8')).toBe('remove me')

    await row.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Delete file' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete file' }).click()
    await expect.poll(async () => {
      try { await readFile(filePath); return 'present' } catch (error) {
        return error instanceof Error && 'code' in error ? error.code : 'unexpected'
      }
    }).toBe('ENOENT')
    await expect.poll(async () => await row.count()).toBe(0)
    if (capture) await page.screenshot({ path: join(CAPTURE_DIR, '03-deleted.png') })
  })
})
