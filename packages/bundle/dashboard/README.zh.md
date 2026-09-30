---
description: "可选 DSH 信息面板组合包，包含可独立启停的信息卡片。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-dashboard

[English](README.md) | 中文

## 概述

在 Web profile 中添加信息面板页面，以及“最近会话”、Hacker News 和五张社区组件适配卡片与 Beszel 设备状态。每个卡片贡献包占有独立的插件行，可以停用而不影响页面或其他贡献包。其他信息插件也能通过同一页面 slot 添加卡片。

## 目录

- [使用本包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>

## 使用

在已构建 Web 产物的源码工作区中，运行 `pnpm dsh web --patch packages/bundle/dashboard/cordis.patch.yml --no-open`，即可预览四条插件行。本包声明了 `dsh.bundle.patch`，发布后可安装到 profile。其他卡片包可注册 `dashboard.card`，无需编辑此 patch。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

[Patch](cordis.patch.yml)插入五条 Loader 行。[信息面板页面](../../client/ui-dashboard/README.zh.md)声明卡片 slot；[会话](../../client/ui-dashboard-sessions/README.zh.md)、[Hacker News](../../client/ui-dashboard-hacker-news/README.zh.md)和[社区组件适配卡片](../../client/ui-dashboard-community/README.zh.md)行各自填入卡片；[设备](../../client/ui-dashboard-devices/README.zh.md)行接入单独配置的 Beszel 数据源。profile 中更高层的 patch 可按 id 停用一行。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [组合包分组](../README.zh.md)——其他 profile 层。
- [Profile 组合](../../../docs/architecture.zh.md)——patch 顺序与行覆盖。
- [Slots](../../../docs/subsystems/slots.zh.md)——卡片注册生命周期。

-----

<a id="model-experience"></a>

## 模型体验

无；这些配置行只改变浏览器信息页面。

#### KV Cache 影响

无；组合包不增加模型输入。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

本组合包通过三个贡献包提供七张卡片。

- 更多信息来源需要独立卡片插件；此 patch 不会自动发现它们。
- 正式安装路径依赖新包发布，不属于本次源码工作区预览。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文——点击展开</summary>

无。

</details>

**运行时 invariant：** 不发布 companion；patch 只组合插件行。
