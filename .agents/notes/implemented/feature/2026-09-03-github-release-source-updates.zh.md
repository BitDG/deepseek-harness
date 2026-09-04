# Agent Note：通过 GitHub Releases 更新干净的 DSH 源码 checkout

状态：已实现

[English](2026-09-03-github-release-source-updates.md) | 中文

## 问题

Web 表层既不显示正在运行的 DSH 版本，也不显示 GitHub 上发布的更新版本与 Release 说明。更新源码启动实例必须离开产品并手动选择 Git 命令。若把网络或 Git 行为放进 `start.bat`，每次普通启动都会依赖远端状态，且会把启动恢复与用户授权的仓库修改混在一起。

自更新跨越三个易失败的转换：选择预期上游版本、只在运行中的 Host 停止后修改 checkout，以及在替代进程启动前重新构建。既有用户改动绝不能被隐藏或擦除，更新开始后产生的改动也一样。

## 决策

Web bundle 组合一个 Host `update` Remote 和一个 **DSH 更新**设置分区。Host 读取 GitHub Releases 列表，默认包含预发布版，只选择比运行中根清单版本更新的 `dsh-v<SemVer>` 版本，并返回其间全部 Release 说明。DSH 的 `cn-*` 与 `en-*` Release 标题生成对应语言文本；只有一种语言的正文会在两种客户端语言中保留。Client 渲染当前版本到目标版本的轨道、checkout 事实、Release 说明、GitHub 完整对比链接、明确刷新、下载，以及需要确认的安装重启操作。

检查从不修改 Git。下载要求 DSH 源码 checkout，且配置的远端 URL 必须通过 HTTPS 或 GitHub SSH 指向官方 `deepseek-ai/deepseek-harness` 仓库。它把精确 Release tag 抓取到 `refs/dsh-update/tags/<tag>`，而不是信任或替换本地 tag，然后校验目标根清单和祖先关系。脏 checkout 仍可下载，因为该操作不改变工作区文件。

安装要求官方源码 checkout、具名分支、干净工作区、隔离的已下载引用、一致的目标 SemVer 和快进关系。Host 在 `.dsh-build` 下写入仅所有者可读的请求，启动已打包的分离 worker，等待其 IPC 就绪确认，返回已接受的操作 id，然后才请求应用优雅关闭。`start.bat` 仍是本地启动器，不执行 fetch、版本对比或更新决策。

Host 退出后，worker 重新校验精确的仓库根目录、分支、起始提交、目标提交和干净状态。它快进到目标提交，通过 Node 相邻的 Corepack 运行 `pnpm install --frozen-lockfile`，再运行仓库构建并重启同一次 DSH 调用。原进程由 Windows 源码启动器拥有时，worker 把重启交给其既有就绪监督，且只在该启动器成功返回后记录成功。直接分离调用只记录为 `restarting`，因为进程创建不等于就绪证明。

快进后若构建或重启失败，只有 HEAD 恰为目标提交、分支未改变且工作区仍干净时才允许回滚。随后 worker reset 到精确的起始提交，重新构建并启动。任何中途文件改动都会禁用回滚；worker 只记录失败并保留 checkout。

## 考虑过的替代方案

**每次启动器运行时更新**——否决。这会把网络与上游移动引入普通本地启动，使用户无法先阅读 Release 说明，也违背启动器仅负责恢复的职责。

**使用 GitHub latest-release 端点**——否决。该端点省略预发布版，而 DSH 当前会发布预发布频道，页面还必须展示运行版本与所选版本之间的全部版本。

**下载 Release 资产并替换安装**——否决。当前 DSH Releases 发布源码 tag 而没有平台资产，包管理器安装仍由包管理器拥有。

**stash 或强制 reset 脏 checkout**——否决。这两种操作都可能隐藏或破坏用户工作。更新器可以在不接触文件的前提下下载，并在 checkout 干净前拒绝安装。

**信任同名本地 tag**——否决。安装前会从配置的官方远端强制更新包自有隔离引用。

## 结果

用户可以在 DSH 内查看版本变化与 Release 说明，在不干扰当前工作的情况下准备精确 Release，并只在 checkout 可以确定性快进时应用。更新状态在 `.dsh-build/update-state.json` 中跨重启保留。脏工作区、detached、分叉、非官方或包管理器安装有意不能执行完整安装。

更新功能依赖 GitHub API 完成发现，并依赖 Git 与 Corepack 完成源码安装。短期的已校验响应缓存会限制日常 API 流量。设置导航独立滚动，因此新增分区在较矮视口中仍可访问。

## 验证

聚焦 Host 测试覆盖 Release 选择与双语投影、官方远端形式、包安装检测、脏工作区操作门禁、真实临时仓库的目标校验、精确快进、成功的受监督重启、干净工作区回滚、快进后新改动的保留，以及持久请求路径拒绝。Client 测试覆盖按需注册、Remote 结果处理、版本与说明渲染、刷新、下载、确认、重启交接、失败恢复，以及包安装与已是最新版本状态。Web 组合通过已构建浏览器 bundle 操作该分区，设置外壳测试则验证较矮视口中的滚动与键盘可达性。
