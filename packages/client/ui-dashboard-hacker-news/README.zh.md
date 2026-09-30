---
description: "可选信息面板中的 Hacker News 热门文章卡片。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dashboard-hacker-news

[English](README.md) | 中文

## 概述

在 DSH 信息面板中阅读 Hacker News 热门文章，并按需刷新。文章链接打开原文或讨论页。Host 通过 DSH 的认证接口读取公开 API，来源故障只影响这张卡片。

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

启用 [`dsh-dashboard`](../../bundle/dashboard/README.zh.md) 组合包中的 `ui-dashboard-hacker-news` 行。每次打开卡片时重新读取；“刷新”替换当前请求。来源故障仅显示在此卡片中，不影响面板与其他卡片。停用该行会移除卡片并停止请求。可在该行设置 `storyCount`（默认 8，范围 1–20）和 `requestTimeoutMs`（默认 12000，范围 1000–60000）。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

[Host 数据源](src/feed.ts)从 [Hacker News 官方 API](https://github.com/HackerNews/API)读取配置数量的 ID 及其记录。[浏览器数据源](src/client/source.ts)只访问同源且经过认证的 `/api/dashboard.hacker-news` 接口，刷新期间保留已有文章，并在卸载时取消请求。[卡片](src/client/HackerNewsCard.tsx)通过 React 渲染 API 文本，文章链接只接受 HTTP(S)。

单篇文章读取失败时保留其他成功文章及其排名，并显示失败数量。全部失败时区分超时、连接、认证、限流和数据异常。刷新失败保留上次成功文章及更新时间，重新打开会重试；结果保存在浏览器内存，整页重新载入后不保留。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [信息面板页面](../ui-dashboard/README.zh.md)——拥有卡片 slot 与网格。
- [信息面板组合包](../../bundle/dashboard/README.zh.md)——将本卡片与页面组合。
- [客户端包](../README.zh.md)——相邻的浏览器插件。

-----

<a id="model-experience"></a>

## 模型体验

无；外部标题只在浏览器中渲染，不进入智能体上下文。

#### KV Cache 影响

无；卡片不组装模型请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

Host 需要能访问公开 API。

- 不在后台轮询，最多显示配置数量的热门文章 ID；已删除条目会跳过。
- Host 无法连接 API 时，卡片显示错误并保留此前的文章。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文——点击展开</summary>

无。

</details>

**运行时 invariant：** 不发布 companion；数据源只拥有自己的请求和快照。
