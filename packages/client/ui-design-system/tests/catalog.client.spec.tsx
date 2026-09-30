// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ComponentCatalog, type CatalogProps } from '../src/client/ComponentCatalog.tsx'
import { en, zh, type CatalogKey } from '../src/client/locales.ts'

afterEach(cleanup)

function mount(dictionary = zh) {
  const setTheme = vi.fn()
  const t = (key: CatalogKey, params?: Record<string, unknown>) => {
    let text = dictionary[key]
    for (const [name, value] of Object.entries(params ?? {})) text = text.replaceAll(`{${name}}`, String(value))
    return text
  }
  render(<ComponentCatalog {...{ t, setTheme } as CatalogProps} />)
  return { setTheme }
}

it('keeps sample loading and selection local, and forwards only theme gestures', () => {
  const { setTheme } = mount()
  fireEvent.click(screen.getByRole('button', { name: zh.startLoading }))
  expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.loading }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: zh.finishLoading }))
  expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.startLoading }).disabled).toBe(false)
  fireEvent.click(screen.getByRole('switch', { name: zh.switchLabel }))
  expect(screen.getByRole('switch', { name: zh.switchLabel }).getAttribute('aria-checked')).toBe('false')
  fireEvent.click(screen.getByRole('checkbox', { name: zh.checkLabel }))
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: zh.checkLabel }).checked).toBe(true)
  expect(setTheme).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: zh.dark, exact: true }))
  expect(setTheme).toHaveBeenCalledWith('dark')
})

it('navigates tabs by keyboard and recovers from empty and failed sample states', () => {
  mount()
  fireEvent.keyDown(screen.getByRole('tab', { name: zh.controls }), { key: 'End' })
  expect(screen.getByRole('tab', { name: zh.patterns }).getAttribute('aria-selected')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: zh.showEmpty, exact: true }))
  expect(screen.getByText(zh.empty)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: zh.clearFilter }))
  expect(screen.getByText(zh.documentName)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: zh.showError, exact: true }))
  expect(screen.getByText(zh.error)).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: zh.retry }))
  expect(screen.getByText(zh.documentName)).toBeDefined()
})

it('contains nested-dialog keyboard focus and consumes Escape before outer listeners', () => {
  mount()
  const outerEscape = vi.fn()
  const outerKey = (event: KeyboardEvent) => { if (event.key === 'Escape') outerEscape() }
  document.addEventListener('keydown', outerKey)
  try {
    const trigger = screen.getByRole('button', { name: zh.modal })
    fireEvent.click(trigger)
    const close = screen.getByRole('button', { name: zh.close })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: zh.confirm }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: zh.modalTitle })).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(outerEscape).not.toHaveBeenCalled()
  } finally {
    document.removeEventListener('keydown', outerKey)
  }
})

it('renders English labels and production output cards from static sample content', () => {
  mount(en)
  fireEvent.click(screen.getByRole('tab', { name: en.outputs }))
  expect(screen.getByText('pnpm run build')).toBeDefined()
  expect(screen.getAllByText('sample/button.ts')).toHaveLength(3)
  expect(screen.getByRole('tree', { name: en.json })).toBeDefined()
  expect(screen.getByText(en.outputNote)).toBeDefined()
})
