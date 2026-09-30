---
description: "Teable 项目与任务的可选 DSH Web 页面。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-teable-tasks

[English](README.md) | 中文

## 概述

这个可选 Web 插件在 DSH 侧边栏添加“项目与任务”页面。用户可以将 DSH Workspace 关联到 Teable 项目行、创建任务、修改状态，并打开任务关联的 DSH Session。页面使用 Host Teable Remote，不在浏览器中保存任务副本。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

配置好两张表与 Host 环境变量后，应用 [Teable 组合包 patch](../../bundle/teable-tasks/cordis.patch.yml)。页面注册主面板、侧边栏面板行和底部入口，提供中英文文本。选择项目后，页面按 `ProjectId` 筛选任务。可选的 Session 下拉框列出关联 Workspace 下的 Session；打开任务关联的 Session 会返回 DSH 原有 Workspace 导航。“打开 Teable 多维表格”会在新标签打开 Teable 站点，供用户管理完整表格、视图和字段；用户需在那里单独登录。

-----

<a id="model-experience"></a>
## 模型体验

无；页面操作不写入模型输入或 Session 事件。

#### KV Cache 影响

无；任务数据不会加入模型请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 页面读取所有 Teable 记录后在浏览器中筛选任务；暂不提供搜索、排序或分页控件。
- 关联 Session 按 ID 选择，暂不预览标题。
- DSH 页面提供创建和状态修改；其他字段仍在 Teable 中编辑。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文——点击展开</summary>

[Client 入口](src/client/index.ts)通过 DSH slots 注册页面和导航。[Host 插件](../../api/teable-tasks/README.zh.md)持有令牌并验证记录。

</details>

**运行时 invariant：** 不发布 companion。页面从 Remote 响应派生视图，没有第二份持久任务状态。
