/** Device card copy owned by the locale registry. */
export const zh = {
  title: '设备状态', description: '设备资源与温度', refresh: '刷新', loading: '正在读取设备信息…',
  tib: '{value} TiB', mib: '{value} MiB', gib: '{value} GiB', watts: '{value} W',
  unconfigured: '尚未连接 Beszel。请配置 Hub 地址和访问凭据。',
  auth: '设备数据访问失败，请检查访问凭据和设备权限。', timeout: '读取设备数据超时。',
  network: '无法连接设备数据源。', rateLimit: '设备数据源限制了请求频率，请稍后重试。',
  invalid: '设备数据格式无法读取。', upstream: '设备数据源暂时不可用。',
  retained: '显示上次成功读取的数据。', empty: '没有可访问的设备。', missing: '未提供',
  online: '在线', offline: '离线', pending: '等待连接', paused: '已暂停', unknown: '未知状态',
  uptime: '已运行 {days} 天', cpu: 'CPU', memory: '内存', storage: '存储', swap: '交换内存',
  cpuTemperature: 'CPU 温度', deviceTemperature: '设备温度', gpu: 'GPU', vram: '显存',
  gpuTemperature: 'GPU 温度', power: '功耗', noGpu: '未提供 GPU 数据', details: '设备明细',
  cpuModel: 'CPU 型号', kernel: '内核', sample: '采样时间', noSample: '尚无采样记录',
  cpuSensorUnavailable: 'CPU 温度传感器未提供读数',
  historical: '离线设备显示最后一次采样。', updated: '读取于 {time}', source: '组件参考',
}

/** English labels matching every Chinese dictionary key. */
export const en: Record<keyof typeof zh, string> = {
  title: 'Device status', description: 'Resources and temperatures', refresh: 'Refresh', loading: 'Reading devices…',
  tib: '{value} TiB', mib: '{value} MiB', gib: '{value} GiB', watts: '{value} W',
  unconfigured: 'Beszel is not connected. Configure the Hub URL and credentials.',
  auth: 'Device access failed. Check credentials and system permissions.', timeout: 'Device request timed out.',
  network: 'Cannot connect to the device source.', rateLimit: 'Device source rate limit reached. Retry later.',
  invalid: 'Cannot read device data.', upstream: 'Device source is unavailable.',
  retained: 'Showing the last successful readings.', empty: 'No accessible devices.', missing: 'Unavailable',
  online: 'Online', offline: 'Offline', pending: 'Pending', paused: 'Paused', unknown: 'Unknown status',
  uptime: 'Uptime {days} days', cpu: 'CPU', memory: 'RAM', storage: 'Disk', swap: 'Swap',
  cpuTemperature: 'CPU temperature', deviceTemperature: 'Device temperature', gpu: 'GPU', vram: 'VRAM',
  gpuTemperature: 'GPU temperature', power: 'Power', noGpu: 'GPU data unavailable', details: 'Device details',
  cpuModel: 'CPU model', kernel: 'Kernel', sample: 'Sample time', noSample: 'No sample yet',
  cpuSensorUnavailable: 'CPU temperature sensor unavailable',
  historical: 'Offline systems show their last sample.', updated: 'Read at {time}', source: 'Widget reference',
}

/** Dictionary keys for the device card. */
export type DeviceKey = keyof typeof zh
