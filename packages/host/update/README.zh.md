---
description: "GitHub Release 发现与受保护的源码 checkout 更新：update Remote、隔离 tag 下载、停服后快进、构建、重启及干净工作区回滚策略。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-update

[English](README.md) | 中文

## 概述

这个 Host 包拥有 Web 设置使用的 `update` Remote。`update/check` 对比正在运行的 DSH SemVer 与仓库的 GitHub Releases，默认包含预发布版，并返回当前版本到目标版本之间的全部中英文更新说明。`update/download` 把选中的官方 tag 抓取到隔离的 `refs/dsh-update/` 引用，不改变分支或工作区。只有来源为官方仓库、位于具名分支、工作区干净且已下载目标可以快进的源码 checkout，才能调用 `update/apply`。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在受支持的 `dsh` Web profile 中挂载该插件，并通过 [`api-remotes`](../../api/remotes/README.zh.md) 消费它。检查是只读操作。下载只写隔离的 Git 引用，即使工作区有改动也可使用。安装会重新读取全部 checkout 事实；它不会 stash、reset、rebase、merge 或覆盖用户工作。

GitHub 端点、仓库身份、远端名称、预发布策略、缓存、响应限制和 worker 超时均为插件配置。生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-host-update)是完整字段参考。生产默认值指向 `deepseek-ai/deepseek-harness`；自定义 API 端点不会放宽下载或安装前的官方远端检查。

包管理器安装可以检查并展示 Release，但本包不会替换全局 npm 或 pnpm 包。其更新操作保持禁用，客户端会提示用户使用拥有该安装的包管理器。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`ReleaseCatalog` 读取 Releases 列表而不是 GitHub 的 latest-release 端点，因此可以保留预发布版及运行版本到目标版本之间的全部说明。它校验有大小上限的 JSON 响应，只接受 `dsh-v<SemVer>` tag，并拆分 DSH 的双语 Release 标题；只有一种语言时，两种客户端语言都保留原文。

`inspectCheckout` 要求包锚点位于 Git 根目录内，且根清单名称为 `@deepseek-ai/dsh-root`。只有 HTTPS 与 GitHub SSH 地址被视为官方远端。下载会从精确的远端 tag 强制更新包自有引用，然后读取目标的根 `package.json`，并验证当前提交是目标提交的祖先。

安装会在 `.dsh-build` 下写入仅所有者可读的请求，启动已打包的分离 worker，并等待其 IPC 就绪信号后才请求 Host 退出。Host 关闭后，worker 会重新验证精确的根目录、分支、HEAD、目标提交和干净状态；随后执行快进、锁定依赖安装、仓库构建和同一次 DSH 调用的重启。构建失败时，只有 HEAD、分支和干净状态仍与更新器产生的目录一致才会 reset。任何进程或用户创建改动后，worker 都只记录失败并保留改动。由 Windows 源码启动器启动时，worker 继续使用该启动器的就绪监督；直接调用只能记为 `restarting`，因为分离进程已创建并不能证明应用就绪。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `update` Remote 方法与操作编排 |
| [`src/release-catalog.ts`](src/release-catalog.ts) | 有大小上限的 GitHub Release 读取与 SemVer 选择 |
| [`src/source-checkout.ts`](src/source-checkout.ts) | 源码身份、官方远端、隔离引用与快进检查 |
| [`src/update-worker.ts`](src/update-worker.ts) | 停服后更新、受保护回滚与重启 |
| [`src/worker-protocol.ts`](src/worker-protocol.ts) | 执行 Git 前的持久请求校验 |
| [`src/invariant.ts`](src/invariant.ts) | 不变式伴生插件；每个操作重新校验自身修改事实 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [更新设置分区](../../client/ui-settings-update/README.zh.md)——浏览器投影与确认流程。
- [Web 应用 bundle](../../bundle/web-app/README.zh.md)——组合 Host 与 Client 两侧的受支持界面。
- [Windows 源码启动器决策](../../../.agents/notes/implemented/process/2026-09-01-windows-source-launcher-build-and-restart.zh.md)——worker 复用的就绪与重启行为。

-----

<a id="model-experience"></a>
## 模型体验

无；Release 发现与安装不暴露工具、提示词、消息或提供方输入。

#### KV Cache 影响

无；本包不组装模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 只有源码 checkout 可以自安装；包安装仍由其包管理器负责。
- 安装要求具名分支、干净工作区、官方远端，以及已下载且可快进的目标。
- 分离的直接调用重启没有通用的应用就绪信号，因此状态保持为 `restarting`；Windows 源码启动器可以在其既有就绪检查通过后记录 `succeeded`。
- GitHub API 可用性与未认证速率限制会影响检查；进程内短缓存会减少重复请求。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
