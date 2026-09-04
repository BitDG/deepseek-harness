# Agent Note：托管 OmniRoute 模型接入

Status: implemented

[English](2026-09-01-omniroute-managed-model-onboarding.md) | 中文

## 问题

Web“模型”页可以配置 pi-ai 提供方，但无法通过一次操作把本机已安装的 OmniRoute 变成可用提供方。用户必须单独启动网关、避免它自动打开控制台和托盘、检查模型目录，并手工维护提供方配置。若把这些行为塞入通用提供方表单，进程所有权也会变得模糊：Harness 不能停止其他操作者启动的服务，也不能替换占用目标端口的无关进程。

## 决策

`@deepseek-ai/dsh-llm-omniroute` 是 `llm` 组和发行 Web 应用 bundle 中的 Host/客户端双面 Cordis 插件。它在“模型”页通过显式操作启动服务。Host 只接受回环 HTTP origin，并在采用已有端点之前通过无认证的 `/api/health/ping` 响应及其公开路由分类响应头确认该服务是 OmniRoute。

没有服务响应时，插件先解析配置的凭据，再通过 `ctx.subprocess` 以 `serve --port <port> --no-open --no-tray` 启动可执行文件。Windows npm 命令 shim 会解析为 Node 加 OmniRoute 相邻的 ESM 入口，不进入命令 shell。subprocess 提供方会移除父进程环境中的敏感变量，因此显式子进程环境会把解析出的值恢复为 `OMNIROUTE_API_KEY`；它还会把 `BASE_URL` 设为环境变量 tombstone，因为 Harness 和 Vite 进程可能把同名变量用于另一端点。启动是 single-flight，诊断捕获有大小上限，健康检查、发现或设置写入失败时会回滚该操作创建的子进程。

插件在端点探测完成后、启动托管服务前，通过 `ctx.credentials` 解析可配置的 `apiKeyEnv` 引用。它把解析出的值用于托管服务和 `ctx.llm.discoverModels('llm-pi-ai', ...)`，但只把引用写入 `llm-pi-ai.providers.omniroute`，因此 `dsh-llm-pi-ai` 会为每次请求重新解析凭据。配置只保留 `antigravity/`、`oc/` 或 `opencode-go/` 下的模型 ID，在显示名后添加三字母 `[AGY]` 或 `[OPC]` 后缀，并拒绝没有选中模型的目录。请求 ID 保持不变。这样会排除重复的 `agy/` 别名、combo 和无关提供方，但不会改变 OmniRoute 路由。`dsh-llm-pi-ai` 仍是唯一模型适配器，负责此后的请求。

进程所有权始终局限于插件实例。托管服务提供停止操作，并在插件 dispose 时终止。采用的服务标记为 external，不提供停止操作，也不会因 dispose 退出。无法识别的健康文档会把状态变成失败，但不会在该 origin 上启动或终止任何进程。

## 考虑过的替代方案

**只记录手工 `llm-pi-ai` 配置。** 它可以连接已经运行的服务器，但不能交付要求的一键启动、所有权安全的停止行为或目录导入。

**实现第二个 LLM 提供方适配器。** OmniRoute 已经暴露由 `dsh-llm-pi-ai` 服务的 OpenAI 兼容 API；另一适配器会重复请求转换、重试、回放和配置行为，因此否决。

**页面加载时自动启动或打开控制台。** 查看设置必须保持只读，也不应接管用户桌面；启动和打开控制台被设计为两个独立的显式操作。

**终止配置端口上的任意进程。** 端口占用不代表拥有该进程。只有此插件创建的 subprocess handle 才授权终止，因此否决。

## 结果

发行 Web 组合现在提供一键启动本地 OmniRoute、发现选定的反重力和 OpenCode 模型并注册路由的能力。Host/客户端包负责生命周期和呈现，现有 LLM 与设置接缝负责请求和持久化，因此没有 agent-loop 改动，也没有新增模型协议。

支持的 origin 有意限制为本机，而目录发现和模型请求需要 `apiKeyEnv` 指定的凭据。远端或 HTTPS OmniRoute 部署仍需直接配置 `dsh-llm-pi-ai`。选中的目录是某一时点的设置快照，需要再次执行接入操作才能刷新。三个允许 ID 前缀以外的 OmniRoute 条目仍可通过直接配置 `llm-pi-ai` 使用，但不会出现在托管 DSH 配置中。

聚焦 Host 测试覆盖进程启动前的凭据失败、向托管子进程显式转发凭据、认证发现、来源过滤、后缀、采用已有服务、托管启动、回滚、拒绝错误服务、single-flight 调用、所有权安全的停止和 dispose。客户端测试覆盖本地化状态与操作。真实 Loader 组合只持久化凭据引用和一个带 `[OPC]` 后缀的模型，再通过确定性的本地端点从已注册的 `omniroute` 提供方流式读取经过认证的回复。可选 Windows 产品测试静默启动已安装的 OmniRoute CLI，使用转发的凭据认证实时目录、注册路由、停止服务并验证进程树回收；它不会产生真实提供方请求费用。
