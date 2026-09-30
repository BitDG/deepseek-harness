---
description: "可选信息面板中的最近 DSH 会话卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dashboard-sessions

[English](README.md) | 中文

## 概述

在信息面板中查看最近的 DSH 会话，并直接打开所选会话。卡片显示最近更新的六个非空、未归档顶层会话。它沿用现有会话目录，不额外发起 Host 请求。

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

启用 [`dsh-dashboard`](../../bundle/dashboard/README.zh.md) 组合包中的 `ui-dashboard-sessions` 行。停用它只会移除这张卡片。会话标题和运行状态随现有客户端目录更新。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

[浏览器入口](src/client/index.ts)将卡片注册到 `dashboard.card`。[组件](src/client/SessionsCard.tsx)读取现有会话与工作区钩子，过滤已归档会话和子会话，并通过 `ctx.uiWorkspace` 打开所选会话。卡片没有独立的数据存储。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [信息面板页面](../ui-dashboard/README.zh.md)——拥有卡片 slot 与网格。
- [会话 UI](../ui-session/README.zh.md)——提供现有会话钩子。
- [信息面板组合包](../../bundle/dashboard/README.zh.md)——将本卡片与页面组合。

-----

<a id="model-experience"></a>

## 模型体验

无；此卡片只为用户可见页面读取会话元数据。

#### KV Cache 影响

无；本包不组装模型请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

卡片只提供会话目录的简要视图。

- 最多显示六个会话，不搜索或分页浏览更早的会话。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文——点击展开</summary>

无。

</details>

**运行时 invariant：** 不发布 companion；卡片读取现有客户端存储，没有第二份可变观察值。
