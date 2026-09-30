/** Copy for the optional dashboard page and sidebar entry. */
export const zh = {
  panel: '信息面板',
  eyebrow: '工作台 / 信息面板',
  title: '信息面板',
  intro: '把常看的动态放在同一页。',
  resetLayout: '恢复默认布局',
  moveCard: '移动模块：拖动到另一模块，或按方向键调整顺序',
  resizeCard: '缩放模块：拖动右下角，或按方向键调整尺寸',
  emptyTitle: '还没有信息卡片',
  emptyDescription: '启用一个信息插件后，它的卡片会显示在这里。',
} as const

/** English dashboard copy. */
export const en: Record<keyof typeof zh, string> = {
  panel: 'Dashboard',
  eyebrow: 'Workspace / Dashboard',
  title: 'Dashboard',
  intro: 'Your selected updates in one place.',
  resetLayout: 'Reset layout',
  moveCard: 'Move card: drag onto another card, or use arrow keys to reorder',
  resizeCard: 'Resize card: drag the corner, or use arrow keys to change its size',
  emptyTitle: 'No information cards yet',
  emptyDescription: 'Enable an information plugin to show its card here.',
}

/** Dictionary key accepted by the locale service. */
export type DashboardKey = keyof typeof zh
