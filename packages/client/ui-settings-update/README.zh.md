---
description: "用于 DSH GitHub Release 对比、双语更新说明、隔离下载与受保护安装重启确认的 Web 设置分区。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-update

[English](README.md) | 中文

## 概述

这个浏览器插件向 Web 设置贡献 **DSH 更新**分区。它在挂载后按需读取 Host `update` Remote，以版本轨道展示运行版本和可用版本，按照当前语言渲染两者之间的全部 GitHub Release 说明，并提供彼此分离的下载与安装操作。页面持续显示 checkout 事实和首个安装阻塞原因，因此有改动的源码工作区可以下载更新，但不能应用更新。

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

打开设置并选择 **DSH 更新**。页面挂载时检查一次；**重新检查**会绕过 Host 的短缓存。**下载版本**抓取精确目标，不改变当前文件。只有 Host 的全部前置条件通过后，**安装并重启**才会启用，并始终要求用户明确确认停服、锁定依赖安装、构建、重启和受保护回滚行为。

若存在最近一次持久 worker 状态，页面会显示它。包安装可以查看 Release 信息，但更新会被引导回其包管理器。Release Markdown 使用共享安全渲染器，并禁用原始 HTML。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

插件以顺序 40 注册一个文案由 locale 拥有的 `settings.section` 条目。其注入函数只解包生成的 `update` Remote 结果；客户端插件激活时不会请求 GitHub。组件状态负责加载、重试、下载、确认、操作失败和重启交接。每个操作是否可用始终以 Host 为权威。

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Locale、设置 slot 注册和 Remote 适配 |
| [`src/client/UpdateSection.tsx`](src/client/UpdateSection.tsx) | 版本轨道、操作、确认、worker 状态与 Release 说明 |
| [`src/client/locales.ts`](src/client/locales.ts) | 类型化的中英文产品文案 |
| [`src/client/UpdateSection.module.css`](src/client/UpdateSection.module.css) | 使用共享设计 token 的响应式分区样式 |
| [`src/invariant.ts`](src/invariant.ts) | 包自有不变式伴生插件 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Host 更新包](../../host/update/README.zh.md)——GitHub、Git、worker 与回滚策略。
- [设置外壳](../ui-settings/README.zh.md)——分区所有权与导航。
- [API Remote 组合](../../api/remotes/README.zh.md)——生成的 Host 能力挂载方式。

-----

<a id="model-experience"></a>
## 模型体验

无；这个浏览器设置分区不注册面向模型的内容。

#### KV Cache 影响

无；组件不会进入提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 页面要求 Host update contribution；它不会直接调用 GitHub。
- 包安装不能从本页自安装。
- 页面会在重新连接后报告 worker 状态；Host 因更新而停止期间无法保持连接。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
