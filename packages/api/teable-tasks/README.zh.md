---
description: "为 DSH 项目任务提供 Teable 记录读写和 Remote 方法的 Host 插件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-teable-tasks

[English](README.md) | 中文

## 概述

这个可选 Host 插件读写自托管 Teable base 中的项目和任务记录。项目记录关联 DSH Workspace，任务还可关联 Session。记录由 Teable 保存；DSH 的 Workspace 和 Session 数据仍保存在原有存储中。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

将[可选组合包 patch](../../bundle/teable-tasks/cordis.patch.yml) 应用于 Web profile。它在 Host 启动时读取 `DSH_TEABLE_BASE_URL`、`DSH_TEABLE_ACCESS_TOKEN`、`DSH_TEABLE_PROJECT_TABLE_ID` 和 `DSH_TEABLE_TASK_TABLE_ID`。访问令牌只保留在 Host，并须具备两张表的 `record|read`、`record|create` 和 `record|update` 权限。base URL 必须是 HTTPS origin，本机回环 HTTP 除外。

启用 patch 前，在同一个 Teable base 中建立两张表：

| 表 | 必需字段 |
|---|---|
| Projects | `Name`（单行文本）、`DshWorkspaceId`（单行文本）、`DshWorkspacePath`（单行文本） |
| Tasks | `Title`（单行文本）、`Status`（单选，选项为 `Todo`、`In Progress`、`Done`）、`ProjectId`（单行文本）、`DshSessionId`（单行文本） |

将两张表的 ID 分别写入对应环境变量。各字段名必须完全一致。任务的 `DshSessionId` 可以为空。已有项目行可通过填写 Workspace ID 到 `DshWorkspaceId` 来关联；只有找不到该 ID 时，`ensureProject` 才创建新行。同一 Workspace 的重复项目行会被拒绝。同一 Host 进程中的并发调用共用一次创建操作。Workspace 标题更改后，项目不会自动改名。

生成的 `ctx.remote.teableTasks` 命名空间提供 `listProjects`、`listTasks`、`webUrl`、`ensureProject`、`createTask` 和 `setTaskStatus`。`webUrl` 返回站点 origin，用于在新浏览器标签中打开 Teable 的完整表格视图；它不携带令牌，用户在那里自行登录 Teable。`createTask` 可选的 Session ID 必须属于关联 Workspace。HTTP 错误时，令牌和 Teable 响应内容不会发往 Client。

-----

<a id="model-experience"></a>
## 模型体验

无；此插件不增加模型工具、提示词或 Session 事件。任务记录仅在 Web 页面和 Teable 中可见。

#### KV Cache 影响

无；Teable 记录不会进入模型请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 项目唯一性由 Host 检查；跨 Host 进程或直接修改 Teable 时，不由 Teable 强制保证。
- 列表会读取所有记录分页，尚无服务端筛选或增量同步。
- 关联使用文本 ID，不使用 Teable 关联字段；删除 Workspace 或 Session 后，其 Teable 行仍会保留。
- Teable 站点入口使用 Host 配置的 origin；远程浏览器无法打开只在 Host 本机可访问的回环地址。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文——点击展开</summary>

Teable 的[列表](https://help.teable.ai/en/api-reference/record/list-records)、[创建](https://help.teable.ai/en/api-reference/record/create-records)和[更新](https://help.teable.ai/en/api-reference/record/update-record)记录接口使用 Bearer 令牌和 `fieldKeyType=name`；传输层按 `extra.nextCursor` 读取列表分页。

</details>

**运行时 invariant：** 不发布 companion。记录由 Teable 持有；Host 没有第二份持久副本可供比较。
