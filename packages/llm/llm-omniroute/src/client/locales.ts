/** Copy dictionaries for the OmniRoute Models-page card. */

/** English strings (the key-set source of truth). */
export const en = {
  title: 'OmniRoute',
  description: 'Use one local gateway to route DeepSeek Harness across OmniRoute models.',
  unavailable: 'OmniRoute is not installed on this computer.',
  stopped: 'The local service is stopped.',
  starting: 'Starting OmniRoute and importing models…',
  managed: 'Running under DeepSeek Harness.',
  external: 'Using an OmniRoute service that was already running.',
  failed: 'OmniRoute could not be connected.',
  connected: '{count} models connected.',
  start: 'Start and connect',
  retry: 'Retry',
  stop: 'Stop service',
  stopping: 'Stopping…',
  open: 'Open OmniRoute dashboard',
  install: 'Install with: npm install -g omniroute',
}

/** OmniRoute locale key union. */
export type OmniRouteKey = keyof typeof en

/** Chinese strings. */
export const zh: { [Key in keyof typeof en]: string } = {
  title: 'OmniRoute',
  description: '通过一个本地网关，将 OmniRoute 模型接入 DeepSeek Harness。',
  unavailable: '这台电脑尚未安装 OmniRoute。',
  stopped: '本地服务尚未启动。',
  starting: '正在启动 OmniRoute 并导入模型…',
  managed: '服务由 DeepSeek Harness 启动并管理。',
  external: '正在使用已经运行的 OmniRoute 服务。',
  failed: 'OmniRoute 接入失败。',
  connected: '已接入 {count} 个模型。',
  start: '启动并接入',
  retry: '重试',
  stop: '停止服务',
  stopping: '正在停止…',
  open: '打开 OmniRoute 控制台',
  install: '安装命令：npm install -g omniroute',
}
