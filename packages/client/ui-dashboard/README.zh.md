---
description: "可选的 DSH 信息面板基座与卡片扩展 slot。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-dashboard

[English](README.md) | 中文

## 概述

在 Web 侧栏添加信息面板页面，并通过独立插件填入信息卡片。未启用任何卡片时，页面仍可打开并显示空状态。每张卡片都能单独启停，不影响页面和其他卡片。

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

将[信息面板 patch](../../bundle/dashboard/cordis.patch.yml) 应用到 Web profile，即可挂载页面和四个插件提供的八张卡片。单独启用 `ui-dashboard` 行也能显示页面。卡片包各自注册一个 `dashboard.card` 条目，并在 `dsh.client.inject` 中声明本包；数据源和本地化文案由卡片包负责。

添加信息源时，为新包配置独立 Loader 行，在 `dsh.client.inject` 中声明 `@deepseek-ai/dsh-client-ui-dashboard`，并在 Client 入口调用 `ctx.slots.inject('dashboard.card', () => ctx.slots.register({ name: 'dashboard.card', id: 'my-source', order: 30 }, Card))`。用 `ctx.effect()` 管理订阅和请求，停用该行时即可移除卡片并停止工作。[会话卡片](../ui-dashboard-sessions/src/client/index.ts)与 [Hacker News 卡片](../ui-dashboard-hacker-news/src/client/index.ts)提供两种示例。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现细节——点击展开</summary>

[浏览器入口](src/client/index.ts)通过 `ctx.slots.inject()` 注册侧栏面板条目、底部操作入口和主页面。未渲染面板条目的侧栏也可以通过底部入口打开页面。页面声明根作用域的卡片列表 slot。[页面组件](src/client/DashboardPage.tsx)用响应式网格渲染该 slot；一个注册被释放时，对应卡片及其效果被移除，其余条目不变。

桌面布局以日历为主体，旁边排列最近会话、倒计时和时间进度，下方显示外部信息源。每个卡片根元素声明稳定的 `data-dashboard-card` 标识。页面添加移动与缩放控件，不移动插件拥有的 React 元素。将顶部手柄拖到另一张卡片上即可排序，也可以聚焦手柄后使用方向键；拖动右下角或使用其方向键调整尺寸。顺序与尺寸保存在浏览器中，页面提供恢复默认布局操作。网格按面板实际宽度调整，兼容自定义侧栏宽度及后续添加的卡片。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [信息面板组合包](../../bundle/dashboard/README.zh.md)——包含独立提供的卡片的可选 profile patch。
- [Slots](../../../docs/subsystems/slots.zh.md)——注册、排序和生命周期规则。
- [客户端包](../README.zh.md)——相邻的浏览器插件。

-----

<a id="model-experience"></a>

## 模型体验

无；页面只向用户展示信息，不增加模型可见内容。

#### KV Cache 影响

无；本包不组装模型请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

日历的最小尺寸为 420 × 640 像素，其他卡片的最小尺寸为 280 × 160 像素；卡片会根据当前宽度下的完整内容自动撑高，保存的尺寸不能截断内容；信息列表和会话标题完整展开，不使用内部滚动条或省略号。宽高按网格刻度调整，面板窄于日历最小宽度时横向滚动，避免日期格被挤压。保存的布局仅适用于当前浏览器及站点。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文——点击展开</summary>

无。

</details>

**运行时 invariant：** 不发布 companion；页面没有跨插件的独立观察值。
