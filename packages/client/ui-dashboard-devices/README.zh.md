---
description: "可选信息面板中的 Beszel 设备资源和温度卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dashboard-devices

[English](README.md) | 中文

## 概述

直接显示运行 DSH Host 的本机设备的在线状态、运行时间、CPU 使用率和温度、内存、存储、GPU 使用率与显存。卡片适配 [Beszel Server Stats 社区组件](https://github.com/glanceapp/community-widgets/blob/main/widgets/beszel-server-stats/README.md)，并增加各 GPU 的指标。缺失指标显示为未提供；离线设备显示最后一次采样。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>

## 使用本包

启用[信息面板组合包](../../bundle/dashboard/README.zh.md)的 `ui-dashboard-devices` 行，在 Host 行配置 `baseUrl`，以及 `apiToken` 或 `email` 加 `password`。没有连接设置时通过 `systeminformation` 直接读取本机；Beszel 是远程设备的可选数据源。凭据不完整或 URL 无效时插件加载失败。凭据应保存在私有 profile 配置中，不放入浏览器设置或提交到仓库。

```yaml
- id: ui-dashboard-devices
  config:
    baseUrl: !!js process.env.BESZEL_URL || ''
    apiToken: !!js process.env.BESZEL_TOKEN || ''
```

`systemCount` 限制设备数量为 1–50（默认 12）；`requestTimeoutMs` 限制包含认证在内的远程读取耗时及 Windows CPU 传感器查询耗时为 1000–60000 毫秒（默认 12000）。`cpuTemperatureSensor` 指定准确的传感器键；未指定时匹配 CPU/package/Tctl/Tdie 名称，显示其中最高温度。Beszel 主传感器可能属于磁盘或 GPU，因此另外显示为设备温度。

打开卡片或点击刷新会重新读取；读取失败时保留原数据与读取时间。设备明细显示采样时间、CPU 型号、内核、各文件系统和交换内存。内存和存储使用二进制单位，显存从 Beszel 的 MiB 转换为 GiB。卡片不进行后台轮询。

<a id="understand-the-implementation"></a>

## 理解实现

[本机采集](src/local.ts)读取 Host 的 CPU 负载、活跃内存、各挂载文件系统和 GPU 驱动指标。Windows CPU 温度只读取已经运行的 LibreHardwareMonitor 或 OpenHardwareMonitor 通过 WMI 发布的 CPU 传感器，不将 ACPI 热区视为 CPU 温度；不支持的读数显示未提供，虚拟显示适配器不展示。插件卸载会等待本机采集结束。可选的 [Host 数据读取](src/feed.ts)查询 `systems`、各设备最新的 `1m` `system_stats` 记录；旧版 `info` 不含硬件信息时读取 `system_details`。[Client 数据源](src/client/source.ts)只访问经过认证的同源 `/api/dashboard.devices` 接口。请求拒绝重定向，错误信息经过清理，响应不缓存；插件卸载会取消并等待未完成请求。停用此行会移除卡片和接口。

<a id="further-exploration"></a>

## 延伸阅读

- [信息面板](../ui-dashboard/README.zh.md)拥有卡片 slot 和网格。
- [Beszel GPU 监控](https://beszel.dev/guide/gpu)介绍平台和采集器要求。

<a id="model-experience"></a>

## 模型体验

无；设备指标只在浏览器显示，不进入智能体上下文。

#### KV 缓存影响

无；卡片不组装模型请求。

<a id="known-limitations-and-deferred-work"></a>

## 已知限制与后续工作

- 本机指标对应 DSH Host 所在设备，而非浏览器所在设备。CPU 温度需要可用的硬件传感器数据源；本包不安装传感器驱动。远程 Beszel 设备需要已经部署 Hub 和 Agent，且 DSH Host 能访问 Hub。本包不安装监控服务或驱动。温度和 GPU 指标是否可用取决于采集器与权限；无法识别的 CPU 传感器名称需要显式配置。GPU 温度从温度映射中按设备名称读取，缺失或名称不同的读数显示为未提供。卡片仅显示配置数量的设备；历史图表与告警仍由 Beszel 提供。

<a id="dev-note"></a>

### 开发备注

**运行时不变量：** 不发布伴随插件；卡片只拥有请求和快照，没有独立维护、需要断言一致性的关系。
