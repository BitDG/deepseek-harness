/** Grid controls attached to plugin-owned card roots without moving their React DOM. */
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './DashboardPage.module.css'

interface Size { width: number; height: number }
interface SavedLayout { order: string[]; sizes: Record<string, Size> }
const STORAGE = 'dsh.dashboard.layout.v1'
const GAP = 16
const ROW = 24
const defaults: Record<string, Size> = {
  calendar: { width: 900, height: 824 }, sessions: { width: 420, height: 344 },
  countdown: { width: 420, height: 224 }, progress: { width: 420, height: 224 },
  'hacker-news': { width: 420, height: 480 }, github: { width: 420, height: 480 },
  tibo: { width: 420, height: 360 }, devices: { width: 1400, height: 640 },
}
const initialOrder = ['calendar', 'sessions', 'countdown', 'progress', 'hacker-news', 'github', 'tibo', 'devices']

function readLayout(): SavedLayout {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? 'null')
    if (value && typeof value === 'object' && 'order' in value && Array.isArray(value.order)
      && value.order.every((id: unknown) => typeof id === 'string')
      && 'sizes' in value && value.sizes && typeof value.sizes === 'object') {
      const sizes: Record<string, Size> = {}
      for (const [id, size] of Object.entries(value.sizes as Record<string, unknown>)) {
        if (size && typeof size === 'object' && 'width' in size && 'height' in size
          && typeof size.width === 'number' && typeof size.height === 'number'
          && Number.isFinite(size.width) && Number.isFinite(size.height)) {
          sizes[id] = { width: Math.max(280, Math.min(3000, size.width)), height: Math.max(160, Math.min(2000, size.height)) }
        }
      }
      return { order: [...new Set<string>(value.order)], sizes }
    }
  } catch (error) { // Corrupt or unavailable browser storage does not prevent rendering cards.
    void error
  }
  return { order: [...initialOrder], sizes: {} }
}

/**
 * Attach move and resize controls to current and later card contributions; retain sizes in browser storage.
 * @param grid - grid containing the slot's plugin-owned card elements.
 * @param t - dashboard dictionary binding used for control labels.
 * @returns callback restoring default order and sizes.
 */
export function useCardLayout(grid: RefObject<HTMLDivElement>, t: PropsLocale<'dashboard'>['t']): () => void {
  const reset = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    const board = grid.current
    if (!board) return
    let layout = readLayout()
    let moving: HTMLElement | undefined
    const controls = new Map<HTMLElement, { move: HTMLButtonElement; resize: HTMLButtonElement }>()
    const cards = () => [...controls.keys()].filter(card => board.contains(card))
      .sort((a, b) => layout.order.indexOf(a.dataset.dashboardCard ?? '') - layout.order.indexOf(b.dataset.dashboardCard ?? ''))
    const persist = () => {
      try { localStorage.setItem(STORAGE, JSON.stringify(layout)) }
      catch (error) { // Private browsing or quota restrictions leave the current layout usable.
        void error
      }
    }
    const apply = () => {
      const unit = (board.clientWidth + GAP) / 12
      for (const card of cards()) {
        const id = card.dataset.dashboardCard ?? ''
        const size = layout.sizes[id]
        const minWidth = id === 'calendar' ? 420 : 280
        const minHeight = id === 'calendar' ? 640 : 160
        const width = size?.width ?? (board.clientWidth < 960 ? (id === 'calendar' ? board.clientWidth : board.clientWidth / 2) : (id === 'calendar' ? unit * 8 - GAP : id === 'devices' ? board.clientWidth : unit * 4 - GAP))
        const columns = Math.min(12, Math.max(Math.ceil((minWidth + GAP) / unit), Math.round((width + GAP) / unit)))
        card.style.gridColumn = `span ${columns}`
        card.style.order = String(layout.order.indexOf(id))
        card.style.height = 'max-content'
        const border = getComputedStyle(card)
        const contentHeight = Math.max(card.getBoundingClientRect().height, card.scrollHeight
          + (Number.parseFloat(border.borderTopWidth) || 0) + (Number.parseFloat(border.borderBottomWidth) || 0))
        const height = Math.max(minHeight, contentHeight, size?.height ?? defaults[id]?.height ?? 320)
        card.style.height = ''
        card.style.gridRow = `span ${Math.ceil((height + GAP) / (ROW + GAP))}`
      }
    }
    const reorder = (card: HTMLElement, target: HTMLElement) => {
      if (card === target) return
      const id = card.dataset.dashboardCard ?? ''
      const targetId = target.dataset.dashboardCard ?? ''
      const present = cards().map(item => item.dataset.dashboardCard ?? '')
      const position = present.indexOf(targetId)
      const order = present.filter(item => item !== id)
      order.splice(position, 0, id)
      layout.order = order
      apply()
      persist()
    }
    const discover = () => {
      for (const [card, buttons] of controls) {
        if (!board.contains(card)) { buttons.move.remove(); buttons.resize.remove(); controls.delete(card) }
      }
      for (const card of board.querySelectorAll<HTMLElement>('[data-dashboard-card]')) {
        if (controls.has(card)) continue
        const id = card.dataset.dashboardCard ?? ''
        if (!layout.order.includes(id)) layout.order.push(id)
        const move = document.createElement('button')
        move.type = 'button'
        move.className = css.move ?? ''
        move.textContent = '⠿'
        move.title = t('moveCard')
        move.setAttribute('aria-label', t('moveCard'))
        move.draggable = true
        move.ondragstart = (event) => { moving = card; event.dataTransfer?.setData('text/plain', id); card.dataset.moving = 'true' }
        move.ondragend = () => { moving = undefined; delete card.dataset.moving; for (const item of cards()) delete item.dataset.drop }
        move.onkeydown = (event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
          event.preventDefault()
          const ordered = cards()
          const index = ordered.indexOf(card)
          const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
          const target = ordered[index + (forward ? 1 : -1)]
          if (!target) return
          if (forward) reorder(target, card)
          else reorder(card, target)
        }
        const resize = document.createElement('button')
        resize.type = 'button'
        resize.className = css.resize ?? ''
        resize.textContent = '◢'
        resize.title = t('resizeCard')
        resize.setAttribute('aria-label', t('resizeCard'))
        const changeSize = (width: number, height: number) => {
          layout.sizes[id] = { width: Math.max(id === 'calendar' ? 420 : 280, Math.min(board.clientWidth, width)), height: Math.max(id === 'calendar' ? 640 : 160, Math.min(2000, height)) }
          apply()
        }
        resize.onpointerdown = (event) => {
          if (event.button !== 0) return
          event.preventDefault()
          const rect = card.getBoundingClientRect()
          const x = event.clientX; const y = event.clientY
          resize.setPointerCapture(event.pointerId)
          card.dataset.resizing = 'true'
          resize.onpointermove = (next) => { changeSize(rect.width + next.clientX - x, rect.height + next.clientY - y) }
          const finish = () => { resize.onpointermove = null; delete card.dataset.resizing; persist() }
          resize.onpointerup = finish
          resize.onpointercancel = finish
          resize.onlostpointercapture = finish
        }
        resize.onkeydown = (event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
          event.preventDefault()
          const rect = card.getBoundingClientRect()
          const step = (board.clientWidth + GAP) / 12
          changeSize(rect.width + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
            rect.height + (event.key === 'ArrowUp' ? -(ROW + GAP) : event.key === 'ArrowDown' ? ROW + GAP : 0))
          persist()
        }
        card.append(move, resize)
        controls.set(card, { move, resize })
      }
      for (const [card, buttons] of controls) {
        if (card.lastElementChild !== buttons.resize) card.append(buttons.move, buttons.resize)
      }
      apply()
    }
    const dragOver = (event: DragEvent) => {
      if (!moving || !(event.target instanceof Element)) return
      const target = event.target.closest<HTMLElement>('[data-dashboard-card]')
      if (!target || target === moving || !controls.has(target)) return
      event.preventDefault()
      for (const card of cards()) card.dataset.drop = String(card === target)
    }
    const drop = (event: DragEvent) => {
      if (!moving || !(event.target instanceof Element)) return
      const target = event.target.closest<HTMLElement>('[data-dashboard-card]')
      if (!target || !controls.has(target)) return
      event.preventDefault()
      reorder(moving, target)
    }
    board.addEventListener('dragover', dragOver)
    board.addEventListener('drop', drop)
    discover()
    const mutation = new MutationObserver(discover)
    mutation.observe(board, { childList: true, characterData: true, subtree: true })
    const observer = new ResizeObserver(apply)
    observer.observe(board)
    board.addEventListener('load', apply, true)
    document.fonts.addEventListener('loadingdone', apply)
    reset.current = () => { layout = { order: [...initialOrder], sizes: {} }; for (const card of cards()) { const id = card.dataset.dashboardCard ?? ''; if (!layout.order.includes(id)) layout.order.push(id) } apply(); persist() }
    return () => {
      mutation.disconnect(); observer.disconnect()
      board.removeEventListener('dragover', dragOver); board.removeEventListener('drop', drop)
      board.removeEventListener('load', apply, true)
      document.fonts.removeEventListener('loadingdone', apply)
      for (const [card, buttons] of controls) { buttons.move.remove(); buttons.resize.remove(); card.style.gridColumn = ''; card.style.gridRow = ''; card.style.order = ''; card.style.height = '' }
      reset.current = () => {}
    }
  }, [grid, t])
  return useCallback(() => { reset.current() }, [])
}
