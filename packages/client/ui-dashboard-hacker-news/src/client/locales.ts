/** Hacker News card copy. */
export const zh = {
  title: 'Hacker News',
  description: '热门技术讨论',
  refresh: '刷新',
  loading: '正在读取热门文章…',
  error: '暂时无法读取 Hacker News。',
  timeout: 'Hacker News 响应超时，请刷新重试。',
  network: '服务器无法连接 Hacker News，请检查网络后重试。',
  auth: '登录已失效，请重新登录后刷新。',
  rateLimit: 'Hacker News 限制了请求频率，请稍后刷新。',
  invalid: 'Hacker News 返回了无法识别的内容，请稍后重试。',
  upstream: 'Hacker News 暂时不可用，请稍后刷新。',
  partial: '{count} 篇文章读取失败，已保留其他文章。',
  retained: '保留上次成功读取的文章。',
  updated: '更新于 {time}',
  empty: '目前没有可显示的文章。',
  points: '{count} 分',
  comments: '{count} 条评论',
} as const

/** English Hacker News card copy. */
export const en: Record<keyof typeof zh, string> = {
  title: 'Hacker News',
  description: 'Popular technology discussions',
  refresh: 'Refresh',
  loading: 'Loading top stories…',
  error: 'Hacker News is unavailable right now.',
  timeout: 'Hacker News timed out. Refresh to try again.',
  network: 'The server cannot connect to Hacker News. Check the network and retry.',
  auth: 'Your sign-in expired. Sign in again and refresh.',
  rateLimit: 'Hacker News limited request frequency. Refresh later.',
  invalid: 'Hacker News returned unrecognized data. Try again later.',
  upstream: 'Hacker News is unavailable. Refresh later.',
  partial: '{count} articles failed to load. Other articles are still shown.',
  retained: 'Showing the last successful articles.',
  updated: 'Updated {time}',
  empty: 'No stories are available.',
  points: '{count} points',
  comments: '{count} comments',
}

/** Hacker News dictionary key. */
export type DashboardHackerNewsKey = keyof typeof zh
