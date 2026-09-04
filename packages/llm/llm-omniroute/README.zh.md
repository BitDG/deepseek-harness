---
description: "为 DeepSeek Harness Web 模型设置页提供一键启动本地 OmniRoute、发现模型并接入 llm-pi-ai 路由的能力。"
kind: "package-reference"
---

# @deepseek-ai/dsh-llm-omniroute

[English](README.md) | 中文

## 概述

`@deepseek-ai/dsh-llm-omniroute` 在 Web 的“模型”设置页增加一张 OmniRoute 卡片。用户明确点击一次后，插件会采用健康的本地 OmniRoute 服务，或静默启动已安装的 CLI，不打开托盘和控制台；随后发现 `/v1/models`，并为 `dsh-llm-pi-ai` 写入一个只含反重力和 OpenCode 模型的 `omniroute` 配置。插件只拥有并可停止自己启动的进程树；已经运行的服务始终由外部管理。设置只存储凭据引用，不存储 OmniRoute API key 值。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [继续阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

将插件与 `dsh-llm-pi-ai`、可写设置提供方、LLM 服务、Typert、凭据和 subprocess 提供方一起挂载；发行的 Web 应用 bundle 已经提供这些依赖。

### 何时选择

当 OmniRoute 与 Harness Web Host 安装在同一台机器上，并且用户应从模型设置页启动和接入它时，选择此插件。当 OmniRoute 位于远端、需要认证、已经由部署设施管理，或必须使用非回环 HTTPS 端点时，直接配置 `llm-pi-ai` 提供方。

### 最小配置

发行的 Web 应用通过 bundle patch 挂载这一行：

```yaml
- name: '@deepseek-ai/dsh-llm-omniroute'
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `executable` | `omniroute` | PATH 中的命令名或 OmniRoute 可执行文件绝对路径 |
| `dashboardURL` | `http://127.0.0.1:20128` | 用于健康检查、模型发现、API 路由和显式打开控制台操作的无认证回环 HTTP origin |
| `apiKeyEnv` | `OMNIROUTE_API_KEY` | 为托管服务认证、模型发现和每次路由请求解析的凭据引用 |
| `startTimeoutMs` | `90000` | 等待新服务健康的最长时间 |
| `healthTimeoutMs` | `2000` | 单次健康请求的超时 |
| `healthPollMs` | `250` | 启动期间两次健康请求之间的间隔 |
| `disposeGraceMs` | `5000` | 强制结束所拥有进程树之前的宽限时间 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-llm-omniroute)是全部可接受字段的完整来源。

### 使用模型页

配置 `apiKeyEnv` 指定的凭据，打开“设置”，选择“模型”，然后在 OmniRoute 卡片上点击“启动并接入”。只有 `/api/health/ping` 同时返回 OmniRoute 的公开路由标记和健康状态时，已有服务才会被采用。该操作使用解析出的凭据发现 `/v1/models`，再把凭据引用和 OpenAI 兼容的 `/v1` 端点写入 `llm-pi-ai.providers.omniroute`。它保留 `antigravity/`、`oc/` 和 `opencode-go/` 模型 ID，在显示名后添加 `[AGY]` 或 `[OPC]`，并排除目录中的其他条目。“打开 OmniRoute 控制台”是独立操作，启动时绝不会自动触发。

卡片显示服务由 DeepSeek Harness 管理时，“停止服务”会终止所拥有的进程树，并保留提供方配置供下次启动使用。卡片显示正在使用已有服务时，不提供停止操作。若端口被一个健康文档无法识别的服务占用，操作会失败，不会替换或终止该进程。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Host 服务通过生成的 Typert Remote 暴露 `status`、`startAndConnect` 和 `stop`。启动操作是 single-flight；它会在启动托管服务前解析配置的凭据，并以 `serve --port <port> --no-open --no-tray` 调用 OmniRoute。subprocess 提供方会移除父进程环境中的敏感变量，因此插件通过显式子进程环境把该值恢复为 `OMNIROUTE_API_KEY`，同时移除与 OmniRoute 无关的环境变量 `BASE_URL`、限制诊断输出大小，并在健康检查、发现或设置写入失败时回滚新建子进程。在 Windows 上，npm 的 `.cmd` shim 会解析为 Node 加相邻的 OmniRoute ESM 入口，不进入命令 shell。

客户端挂载生成的 Remote 描述符，并向 `settings.models.footer` 贡献一张本地化卡片。Host 通过 `ctx.credentials` 解析 `apiKeyEnv`，过滤并标记认证发现的结果；凭据缺失或没有保留任何反重力或 OpenCode 模型时，操作会在写入设置前失败。此后的每次模型请求仍由 `dsh-llm-pi-ai` 负责；此包不实现第二套 LLM 适配器。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Host 生命周期、健康验证、模型发现、设置写入和所有权安全的清理 |
| [`src/types.ts`](src/types.ts) | 客户端安全的生命周期结果类型 |
| [`src/client/index.ts`](src/client/index.ts) | Remote 挂载、本地化注册和模型页槽位贡献 |
| [`src/client/OmniRouteCard.tsx`](src/client/OmniRouteCard.tsx) | 显式启动、打开控制台和停止所拥有服务的操作 |

</details>

-----

<a id="further-exploration"></a>
## 继续阅读

- [llm-pi-ai](../llm-pi-ai/README.zh.md)——服务导入后提供方配置的适配器。
- [LLM 服务](../llm/README.zh.md)——提供方发现与已注册模型路由。
- [Subprocess 服务](../../subprocess/subprocess/README.zh.md)——本地启动使用的进程树所有权与生命周期。
- [设置服务](../../settings/settings/README.zh.md)——接收提供方配置的可写命名空间。
- [OmniRoute 托管接入 Agent Note](../../../.agents/notes/implemented/feature/2026-09-01-omniroute-managed-model-onboarding.zh.md)——所有权、健康检查和组合决策。

-----

<a id="model-experience"></a>
## 模型体验

间接影响：通过由 OmniRoute 发现目录创建的 `dsh-llm-pi-ai` 提供方配置。

#### KV Cache 影响

此生命周期与设置包不增加请求 token，也不会使已经可复用的前缀失效；所选 OmniRoute 模型和 `dsh-llm-pi-ai` 请求路径负责提供方缓存行为。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 只接受回环 HTTP OmniRoute origin；远端或 HTTPS 部署必须直接通过 `dsh-llm-pi-ai` 配置。
- 插件要求系统已安装 `omniroute` 可执行文件，不负责安装或更新 OmniRoute。
- `apiKeyEnv` 凭据缺失时，接入操作会在启动托管进程前失败；插件不创建或存储 OmniRoute API key。
- 用户点击接入时才执行模型发现；已存储目录不会持续刷新。
- 导入目录会有意排除 OmniRoute combo、`agy/` 等别名，以及反重力和 OpenCode 以外的提供方。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

可选真实产品测试使用 `DSH_EXPECT_OMNIROUTE=1` 和 `OMNIROUTE_API_KEY`，在 20130 端口启动已安装的 CLI，从经过认证的真实目录中选择反重力和 OpenCode 条目、注册路由、停止服务，并验证端点不再健康。它不会发起产生费用的真实模型请求；Loader 组合测试通过确定性的本地 OpenAI 兼容 fixture 覆盖凭据使用、后缀持久化和流式请求路径。

</details>
