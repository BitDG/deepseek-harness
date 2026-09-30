---
description: "DSH Web 的可选 Teable 项目任务集成。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-teable-tasks

[English](README.md) | 中文

## 概述

此组合包 patch 添加 Host Teable Remote 和 DSH Web“项目与任务”页面。集成不会进入默认发布的 profile。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

按照 [Host 包文档](../../api/teable-tasks/README.zh.md)建立两张表和字段。在启动 DSH 的进程中设置 `DSH_TEABLE_BASE_URL`、`DSH_TEABLE_ACCESS_TOKEN`、`DSH_TEABLE_PROJECT_TABLE_ID` 和 `DSH_TEABLE_TASK_TABLE_ID`。然后从已构建的源码工作区运行 `pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml --patch packages/bundle/teable-tasks/cordis.patch.yml --no-open`。包声明了 `dsh.bundle.patch`，发布后可安装进 profile。

-----

<a id="model-experience"></a>
## 模型体验

无；组合包添加 Host Remote 和浏览器页面，不增加模型输入。

#### KV Cache 影响

无。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 需要可访问的 Teable 实例以及预先建好的表；本包不部署或迁移 Teable。
- 正式安装路径依赖本包发布；源码工作区使用上述 patch 路径。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护上下文——点击展开</summary>

[Patch](cordis.patch.yml)插入独立的 Host 与 Client Loader 行，因此移除此集成无需修改 Web profile。

</details>

**运行时 invariant：** 不发布 companion；组合包只组合两条插件行。
