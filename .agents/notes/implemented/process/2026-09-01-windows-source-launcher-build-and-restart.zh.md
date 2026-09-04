# Agent Note: Windows 源码启动器构建并重启 Web profile

Status: implemented

[English](2026-09-01-windows-source-launcher-build-and-restart.md) | 中文

## 问题

从源码 checkout 打开 Web UI 需要运行多个命令。重复手动启动可能留下较早的服务进程，而仅凭端口归属无法识别哪个进程属于该 checkout。

仓库会把 Web 产物绑定到版本、源码 commit、dirty 标记和产物摘要。在本地源码变化后，如果没有重新生成完整产物集就启动，可能混用不同版本的源码与产物。

## 决策

仓库根目录提供 `start.bat` 作为精简的 Windows 入口。它调用不依赖仓库依赖项的 `scripts/start-windows.mjs` 启动器；启动器会先验证 Git 根目录、Node engine、Corepack 提供的 pnpm 版本和完整构建记录，然后才改变运行时状态。它把所有命令行参数转发给 Web profile。启动器绝不获取 remote、比较 upstream revision，也不修改 checkout 或 Git 历史。

仅当已记录的本地版本、commit、dirty 标记、Web 产物或启动器运行时源码指纹过期时，才执行完整构建。安装前，launcher 会从显式环境覆盖或确定性的 Windows `PATH` 包位置探测 Codex 与 Claude Code 可执行文件绝对路径，并在控制台记录各自报告的版本。Windows 直接通过 `spawnSync` 运行 `corepack.cmd` 会返回 `EINVAL`，因此构建会调用 `process.execPath` 旁的 Corepack JavaScript 入口，再运行 `pnpm install --frozen-lockfile` 和仓库根构建。系统可执行文件通过探测且提供方的精确 JavaScript 依赖已安装时，pnpm 会从重新安装中排除该提供方 workspace，从而保留其依赖闭包；否则普通的锁定安装仍保持启用。记录匹配时会跳过安装和构建。

launcher 通过专用环境项把每个已探测的绝对路径传给 Web 进程。可选的 Codex 与 Claude Code Bundle patch 会把这些环境项映射成显式 `executablePath` 配置。每个提供方都会在加载时验证路径；Codex 以 `app-server --stdio` 启动原生二进制，而 Claude 提供方把路径作为官方 SDK 的 `pathToClaudeCodeExecutable`。两个提供方都不会执行隐式 `PATH` 回退。

启动器在 `.dsh-build/` 下记录自己的进程状态。重新构建会在重启改变进程状态前完成。重启在请求关闭前会检查已记录的 PID、可执行文件、命令行、进程开始时间、源码 CLI 路径和启动器 preload 路径。由于 Windows 无法向该进程传递 `SIGTERM`，`scripts/start-windows-signal.mjs` 会把归属明确的 marker 转换成 CLI 的普通 `SIGTERM` 事件。启动器会等待进程退出；只有经过验证的进程树未能在限定时间内退出时，才使用 `taskkill /T /F`。它绝不会按端口终止未记录的 listener。

新进程通过源码 `dsh web` CLI 启动。profile 负责经过认证的启动 URL 和默认浏览器交接。Loader 完全就绪后，profile 会输出 `dsh web:` 宣告，preload 将它转换为空的 launcher 自有就绪 marker。launcher 必须看到该 marker；使用固定端口时还必须看到有效的 loopback listener，之后才会报告成功。launcher 不会持久保存认证 URL。

## 测试

脚本 spec 覆盖 Web 端口转发、运行时源码指纹、进程身份、系统可执行文件发现、精确提供方 workspace 排除、就绪宣告 marker、提前出现的 listener 消息拒绝，以及 Windows marker 到 `SIGTERM` 的桥接。无密钥真实产品测试会通过已安装的 Codex 与 Claude Code 二进制各运行一个本地 fixture 任务，并证明每个提供方都 spawn 了已配置路径。Windows 验收会拒绝先打开端口、随后在插件加载阶段失败的 profile，在不获取两个重复平台包的情况下运行锁定安装、启动修复后的 Web profile、在已记录的 loopback listener 上观察到预期的未认证 `401` 响应，再次启动后还会证明第一个 PID 已退出，由另一个已记录 PID 接管同一端口，而且没有重复构建。

## 曾考虑的替代方案

**启动前获取或 fast-forward。** 不予采纳：启动器不负责源码更新。更新仍是显式用户操作，并使用其自身的 dirty-worktree 与 remote-state 检查。

**终止监听 Web 端口的任意进程。** 不予采纳：端口不能证明 checkout 归属，也可能属于另一个服务或 checkout。

**每次启动都构建。** 不予采纳：仓库已经记录完整产物集。本地版本、commit、dirty 状态和运行时源码指纹可以识别何时需要重新生成，不必让未变化的重启承担完整构建成本。

**在每个提供方内部搜索 `PATH`。** 不予采纳：部署选择必须显式，并在插件加载时验证。launcher 负责 Windows 发现，再把结果转换成普通提供方配置；其他 profile 仍使用固定的包内载荷，除非它们自行提供路径。

**运行增量 Web 开发 watcher。** 不予采纳：它要求已有完整构建，会作为第二个进程树持续驻留，并不断重写产物。它服务于源码编辑，而不是一次性启动。

## 后果

未变化的 checkout 可以快速重启，而本地源码变化会执行一次锁定依赖安装和完整构建。已有兼容产品安装会避免下载两个体积较大的重复 Windows 载荷。启动器既不报告也不应用仓库更新。构建失败时，已记录的现有服务器会继续运行；经过验证的关闭后如果启动失败，则不会留下混合版本的服务器，用户必须修复 checkout 后再重试。

进程状态和诊断信息属于本地构建数据，会由仓库 clean 命令移除。启动器放弃从无效归属记录和无关端口冲突中自动恢复，以换取绝不终止未验证的进程。
