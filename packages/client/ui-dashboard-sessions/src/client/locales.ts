/** Recent-session card copy. */
export const zh = {
  title: '最近的会话',
  description: '继续手头的工作',
  empty: '还没有可继续的会话。',
  running: '进行中',
} as const

/** English recent-session card copy. */
export const en: Record<keyof typeof zh, string> = {
  title: 'Recent sessions',
  description: 'Pick up where you left off',
  empty: 'No sessions to resume yet.',
  running: 'Running',
}

/** Recent-session dictionary key. */
export type DashboardSessionsKey = keyof typeof zh
